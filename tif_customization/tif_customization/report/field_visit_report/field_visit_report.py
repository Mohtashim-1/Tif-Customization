# Copyright (c) 2026, TIF Customization and contributors
# License: MIT
"""Field Visit Report — full Field Visit columns; officers see only their own visits."""

from __future__ import annotations

from typing import Any

import frappe
from frappe import _
from frappe.utils import cint, getdate

from tif_customization.tif_customization.field_visit_permissions import (
	_name_variants,
	apply_team_scope_to_conditions,
	can_view_all_field_visits,
	get_employee_for_user,
	get_team_employee_rows,
)

# Layout / system fields not useful as report columns
SKIP_FIELDTYPES = {
	"Section Break",
	"Column Break",
	"Tab Break",
	"HTML",
	"Fold",
	"Heading",
	"Button",
	"Table",
	"Table MultiSelect",
}
SKIP_FIELDNAMES = {
	"naming_series",
	"amended_from",
}

# Prefer readable widths for common types
WIDTH_BY_TYPE = {
	"Check": 80,
	"Int": 90,
	"Float": 100,
	"Currency": 110,
	"Date": 110,
	"Datetime": 150,
	"Time": 100,
	"Select": 140,
	"Link": 130,
	"Data": 150,
	"Small Text": 220,
	"Text": 220,
	"Long Text": 250,
	"Text Editor": 250,
	"Attach": 160,
	"Attach Image": 160,
}


def execute(filters=None):
	filters = frappe._dict(filters or {})
	if not frappe.has_permission("Field Visit", "read"):
		frappe.throw(_("You are not permitted to view Field Visit data."), frappe.PermissionError)

	_validate_filters(filters)
	field_defs = get_report_field_defs()
	columns = get_columns(field_defs)
	data = get_data(filters, field_defs)
	message = _scope_message(len(field_defs))
	return columns, data, message


def _validate_filters(filters):
	from_date = getdate(filters.get("from_date"))
	to_date = getdate(filters.get("to_date"))
	if from_date > to_date:
		frappe.throw(_("From Date cannot be after To Date."))


def _scope_message(field_count: int):
	base = _("All Field Visit fields ({0} columns). Use Export for Excel.").format(field_count + 4)
	if can_view_all_field_visits():
		return f"{base} · {_('Manager view: all officers (use Field Officer filter).')}"
	team = get_team_employee_rows(include_self=True)
	if len(team) > 1:
		return f"{base} · {_('Team lead view: your team ({0}). Use Field Officer to filter.').format(len(team))}"
	me = get_employee_for_user()
	name = (me or {}).get("employee_name") or frappe.session.user
	return f"{base} · {_('Field user view: only your own visits ({0}).').format(name)}"


def apply_report_visibility_scope(conditions: list, params: dict, alias: str = "fv"):
	"""
	- Managers: no extra restriction
	- Team leads: own + direct reports (team scope)
	- Field users: strict self-only
	"""
	if can_view_all_field_visits():
		return

	team = get_team_employee_rows(include_self=True)
	if len(team) > 1:
		apply_team_scope_to_conditions(conditions, params, alias=alias)
		return

	# Pure field user — only self
	user = frappe.session.user
	me = get_employee_for_user(user)
	match_values = {user}
	if me:
		if me.get("name"):
			match_values.add(me.name)
		if me.get("user_id"):
			match_values.add(me.user_id)
		if me.get("employee_name"):
			match_values.update(_name_variants(me.employee_name))

	params["own_user"] = user
	params["own_values"] = tuple(sorted({v for v in match_values if v}) or (user,))
	parts = [f"{alias}.owner = %(own_user)s"]
	for field in (
		"visit_by",
		"me_visit_by",
		"mt_visit_by",
		"training_entry_filled_by",
		"training_trainer_name",
	):
		parts.append(f"TRIM(IFNULL({alias}.`{field}`, '')) IN %(own_values)s")
	conditions.append("(" + " OR ".join(parts) + ")")


def get_report_field_defs() -> list[dict]:
	"""Every scalar Field Visit field, in DocType order."""
	meta = frappe.get_meta("Field Visit")
	defs = []
	seen = set()
	for df in meta.fields:
		if df.fieldtype in SKIP_FIELDTYPES:
			continue
		if df.fieldname in SKIP_FIELDNAMES or df.fieldname in seen:
			continue
		seen.add(df.fieldname)
		defs.append(
			{
				"fieldname": df.fieldname,
				"label": df.label or df.fieldname,
				"fieldtype": df.fieldtype,
				"options": df.options,
			}
		)
	return defs


def get_columns(field_defs: list[dict]) -> list[dict]:
	columns = [
		{
			"label": _("Visit ID"),
			"fieldname": "name",
			"fieldtype": "Link",
			"options": "Field Visit",
			"width": 130,
		},
		{
			"label": _("Doc Status"),
			"fieldname": "doc_status_label",
			"fieldtype": "Data",
			"width": 100,
		},
		{
			"label": _("Visit Date (resolved)"),
			"fieldname": "visit_day",
			"fieldtype": "Date",
			"width": 120,
		},
		{
			"label": _("Field Officer (resolved)"),
			"fieldname": "field_officer",
			"fieldtype": "Data",
			"width": 160,
		},
	]

	for df in field_defs:
		col = {
			"label": _(df["label"]),
			"fieldname": df["fieldname"],
			"fieldtype": _report_fieldtype(df["fieldtype"]),
			"width": WIDTH_BY_TYPE.get(df["fieldtype"], 140),
		}
		if df["fieldtype"] == "Link" and df.get("options"):
			col["options"] = df["options"]
		columns.append(col)

	# Child-table counts (tables themselves are not flat columns)
	columns.extend(
		[
			{
				"label": _("Training Attendees (#)"),
				"fieldname": "training_attendees_count",
				"fieldtype": "Int",
				"width": 120,
			},
			{
				"label": _("Volunteers (#)"),
				"fieldname": "volunteer_enrolments_count",
				"fieldtype": "Int",
				"width": 110,
			},
			{
				"label": _("Enrolment Participants (#)"),
				"fieldname": "enrolment_participants_count",
				"fieldtype": "Int",
				"width": 140,
			},
			{
				"label": _("Workshop Attendees (#)"),
				"fieldname": "workshop_attendees_count",
				"fieldtype": "Int",
				"width": 130,
			},
			{
				"label": _("Owner"),
				"fieldname": "owner",
				"fieldtype": "Data",
				"width": 180,
			},
			{
				"label": _("Created"),
				"fieldname": "creation",
				"fieldtype": "Datetime",
				"width": 150,
			},
			{
				"label": _("Modified"),
				"fieldname": "modified",
				"fieldtype": "Datetime",
				"width": 150,
			},
		]
	)
	return columns


def _report_fieldtype(fieldtype: str) -> str:
	"""Map DocType fieldtypes to query-report friendly types."""
	if fieldtype in {"Attach", "Attach Image", "Text Editor", "Long Text", "Code", "Markdown Editor"}:
		return "Data"
	if fieldtype == "Percent":
		return "Float"
	if fieldtype in {"Check"}:
		return "Check"
	return fieldtype if fieldtype in WIDTH_BY_TYPE or fieldtype in {"Link", "Data", "Select"} else "Data"


def _visit_day_sql(alias: str = "fv") -> str:
	a = alias
	return f"""
		CASE
			WHEN {a}.type = 'Marketing' THEN COALESCE({a}.visit_date, DATE({a}.timestamp))
			WHEN {a}.type = 'M&E' THEN COALESCE({a}.me_visit_date, {a}.me_starting_date, DATE({a}.me_timestamp))
			WHEN {a}.type = 'Training' THEN COALESCE({a}.training_date, DATE({a}.training_timestamp))
			WHEN {a}.type = 'Meeting' THEN COALESCE({a}.mt_meeting_date, DATE({a}.mt_timestamp))
			WHEN {a}.type IN ('Academic / Other Official Tasks', 'Other') THEN COALESCE({a}.ot_date, {a}.visit_date)
			ELSE COALESCE(
				{a}.visit_date, {a}.me_visit_date, {a}.training_date,
				{a}.mt_meeting_date, {a}.ot_date, DATE({a}.creation)
			)
		END
	"""


def _officer_sql(alias: str = "fv") -> str:
	a = alias
	return f"""
		COALESCE(
			NULLIF(TRIM({a}.visit_by), ''),
			NULLIF(TRIM({a}.me_visit_by), ''),
			NULLIF(TRIM({a}.mt_visit_by), ''),
			NULLIF(TRIM({a}.training_entry_filled_by), ''),
			NULLIF(TRIM({a}.training_trainer_name), ''),
			{a}.owner
		)
	"""


def _city_sql(alias: str = "fv") -> str:
	a = alias
	return f"""
		COALESCE(
			NULLIF(TRIM({a}.city), ''),
			NULLIF(TRIM({a}.me_city), ''),
			NULLIF(TRIM({a}.mt_city), ''),
			NULLIF(TRIM({a}.training_city), '')
		)
	"""


def _province_sql(alias: str = "fv") -> str:
	a = alias
	return f"""
		COALESCE(
			NULLIF(TRIM({a}.province), ''),
			NULLIF(TRIM({a}.me_province), ''),
			NULLIF(TRIM({a}.training_province), '')
		)
	"""


def _school_sql(alias: str = "fv") -> str:
	a = alias
	return f"""
		COALESCE(
			NULLIF(TRIM({a}.school_name), ''),
			NULLIF(TRIM({a}.me_school_name), ''),
			NULLIF(TRIM({a}.mt_institute_or_organization_name), ''),
			NULLIF(TRIM({a}.training_venue_name), '')
		)
	"""


def get_data(filters, field_defs: list[dict]) -> list[dict[str, Any]]:
	conditions = []
	params: dict[str, Any] = {
		"from_date": getdate(filters.from_date),
		"to_date": getdate(filters.to_date),
	}

	visit_day = _visit_day_sql("fv")
	conditions.append(f"({visit_day}) BETWEEN %(from_date)s AND %(to_date)s")

	# Managers → all. Team leads → team. Field users → self only.
	apply_report_visibility_scope(conditions, params, alias="fv")

	if filters.get("type"):
		conditions.append("fv.type = %(type)s")
		params["type"] = filters.type

	if filters.get("city"):
		conditions.append(f"({_city_sql('fv')}) = %(city)s")
		params["city"] = filters.city

	if filters.get("province"):
		conditions.append(f"({_province_sql('fv')}) = %(province)s")
		params["province"] = filters.province

	if filters.get("school_name"):
		conditions.append(f"({_school_sql('fv')}) LIKE %(school_name)s")
		params["school_name"] = f"%{filters.school_name.strip()}%"

	docstatus = _docstatus_filter(filters.get("docstatus"))
	if docstatus is not None:
		conditions.append("fv.docstatus = %(docstatus)s")
		params["docstatus"] = docstatus
	else:
		conditions.append("fv.docstatus < 2")

	# Employee filter:
	# - Managers: any officer
	# - Team leads: own team only
	# - Field users: ignored (already scoped to self)
	if can_view_all_field_visits() or len(get_team_employee_rows(include_self=True)) > 1:
		_apply_employee_filter(filters, conditions, params)
	elif filters.get("employee"):
		filters.employee = None


	select_parts = [
		"fv.name",
		"fv.docstatus",
		"""CASE fv.docstatus
			WHEN 0 THEN 'Draft'
			WHEN 1 THEN 'Submitted'
			WHEN 2 THEN 'Cancelled'
			ELSE CAST(fv.docstatus AS CHAR)
		END AS doc_status_label""",
		f"({visit_day}) AS visit_day",
		f"({_officer_sql('fv')}) AS field_officer",
		"fv.owner",
		"fv.creation",
		"fv.modified",
	]
	for df in field_defs:
		fn = df["fieldname"]
		# backtick every column from meta
		select_parts.append(f"fv.`{fn}`")

	# Child table counts via subselect (avoid heavy joins)
	select_parts.extend(
		[
			"""(SELECT COUNT(*) FROM `tabTraining Attendee` ta
				WHERE ta.parent = fv.name) AS training_attendees_count""",
			"""(SELECT COUNT(*) FROM `tabField Visit Volunteer` vv
				WHERE vv.parent = fv.name) AS volunteer_enrolments_count""",
			"""(SELECT COUNT(*) FROM `tabField Visit Enrolment Participant` ep
				WHERE ep.parent = fv.name) AS enrolment_participants_count""",
			"""(SELECT COUNT(*) FROM `tabField Visit Workshop Attendee` wa
				WHERE wa.parent = fv.name) AS workshop_attendees_count""",
		]
	)

	where_sql = " AND ".join(conditions)
	sql = f"""
		SELECT
			{", ".join(select_parts)}
		FROM `tabField Visit` fv
		WHERE {where_sql}
		ORDER BY visit_day DESC, fv.creation DESC
		LIMIT 5000
	"""

	try:
		rows = frappe.db.sql(sql, params, as_dict=True) or []
	except Exception:
		# Child doctype may be missing on older DBs — retry without counts
		frappe.log_error(frappe.get_traceback(), "Field Visit Report")
		select_parts = [p for p in select_parts if "_count" not in p]
		sql = f"""
			SELECT
				{", ".join(select_parts)}
			FROM `tabField Visit` fv
			WHERE {where_sql}
			ORDER BY visit_day DESC, fv.creation DESC
			LIMIT 5000
		"""
		rows = frappe.db.sql(sql, params, as_dict=True) or []

	for row in rows:
		for key in (
			"training_attendees_count",
			"volunteer_enrolments_count",
			"enrolment_participants_count",
			"workshop_attendees_count",
		):
			if key in row:
				row[key] = cint(row.get(key))
	return rows


def _docstatus_filter(label) -> int | None:
	if not label:
		return None
	return {"Draft": 0, "Submitted": 1, "Cancelled": 2}.get(label)


def _apply_employee_filter(filters, conditions: list, params: dict):
	"""Narrow to one officer (managers / team leads)."""
	employee = (filters.get("employee") or "").strip()
	if not employee:
		return

	emp = frappe.db.get_value(
		"Employee",
		employee,
		["name", "employee_name", "user_id"],
		as_dict=True,
	)
	if not emp:
		frappe.throw(_("Invalid Field Officer: {0}").format(employee))

	if not can_view_all_field_visits():
		allowed = {e.get("name") for e in get_team_employee_rows(include_self=True)}
		if emp.name not in allowed:
			frappe.throw(_("You can only filter Field Officers in your team."), frappe.PermissionError)

	match_values = {emp.name}
	if emp.employee_name:
		match_values.update(_name_variants(emp.employee_name))
	if emp.user_id:
		match_values.add(emp.user_id)

	params["officer_values"] = tuple(sorted({v for v in match_values if v}) or ("__none__",))
	parts = ["fv.owner IN %(officer_values)s"]
	for field in (
		"visit_by",
		"me_visit_by",
		"mt_visit_by",
		"training_entry_filled_by",
		"training_trainer_name",
	):
		parts.append(f"TRIM(IFNULL(fv.`{field}`, '')) IN %(officer_values)s")
	conditions.append("(" + " OR ".join(parts) + ")")


@frappe.whitelist()
@frappe.validate_and_sanitize_search_inputs
def employee_query(doctype, txt, searchfield, start, page_len, filters):
	"""
	Field Officer link search:
	- Managers: all active employees
	- Team leads: their team
	- Field users: themselves only (filter is usually hidden)
	"""
	txt = (txt or "").strip()
	like = f"%{txt}%"
	start = cint(start)
	page_len = cint(page_len) or 20

	if can_view_all_field_visits():
		return frappe.db.sql(
			"""
			SELECT name, employee_name
			FROM `tabEmployee`
			WHERE status = 'Active'
				AND (
					name LIKE %(txt)s
					OR employee_name LIKE %(txt)s
					OR IFNULL(user_id, '') LIKE %(txt)s
				)
			ORDER BY employee_name
			LIMIT %(start)s, %(page_len)s
			""",
			{"txt": like, "start": start, "page_len": page_len},
		)

	team = get_team_employee_rows(include_self=True)
	ids = [e.get("name") for e in team if e.get("name")]
	if not ids:
		me = get_employee_for_user()
		if me:
			ids = [me.name]
	if not ids:
		return []

	return frappe.db.sql(
		"""
		SELECT name, employee_name
		FROM `tabEmployee`
		WHERE name IN %(ids)s
			AND (
				name LIKE %(txt)s
				OR employee_name LIKE %(txt)s
				OR IFNULL(user_id, '') LIKE %(txt)s
			)
		ORDER BY employee_name
		LIMIT %(start)s, %(page_len)s
		""",
		{"ids": tuple(ids), "txt": like, "start": start, "page_len": page_len},
	)
