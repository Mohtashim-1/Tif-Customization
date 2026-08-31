import json
import csv
import re
from io import StringIO
from datetime import date, datetime, time

import frappe
from frappe import _
from frappe.utils import cint, getdate
from frappe.utils.xlsxutils import make_xlsx

# Screen table only — Field Visit has ~200 columns; dumping them froze the page.
DISPLAY_COLUMNS = [
	"name",
	"visit_date",
	"type",
	"school",
	"officer",
	"category",
	"province",
	"docstatus",
	"owner",
]
DISPLAY_LABELS = {
	"name": "Document No",
	"visit_date": "Visit Date",
	"type": "Type",
	"school": "School / Venue",
	"officer": "Field Staff",
	"category": "Category",
	"province": "Province",
	"docstatus": "Status",
	"owner": "Owner",
}
PAGE_SIZE = 100


@frappe.whitelist()
def get_report_data(filters=None):
	if not frappe.has_permission("Field Visit", "read"):
		frappe.throw(_("You are not permitted to view Field Visit data."))

	filters = _parse_filters(filters)
	from_date = filters.get("from_date")
	to_date = filters.get("to_date")
	if from_date:
		from_date = getdate(from_date)
	if to_date:
		to_date = getdate(to_date)
	if from_date and to_date and from_date > to_date:
		frappe.throw(_("From Date cannot be after To Date."))

	where_clause, params, visit_date_expr = _build_where(filters, from_date, to_date)
	summary = _sql_summary(where_clause, params)

	for_export = cint(filters.get("for_export"))
	limit_sql = ""
	if not for_export:
		limit = min(max(cint(filters.get("limit") or PAGE_SIZE), 1), 500)
		offset = max(cint(filters.get("offset") or 0), 0)
		params["limit"] = limit
		params["offset"] = offset
		limit_sql = " LIMIT %(limit)s OFFSET %(offset)s"
	else:
		limit = summary["total_visits"]
		offset = 0

	rows = frappe.db.sql(
		f"""
		SELECT
			fv.name,
			fv.type,
			fv.docstatus,
			fv.owner,
			{visit_date_expr} AS visit_date,
			{_school_sql("fv")} AS school,
			{_officer_sql("fv")} AS officer,
			{_category_sql("fv")} AS category,
			{_province_sql("fv")} AS province
		FROM `tabField Visit` fv
		WHERE {where_clause}
		ORDER BY visit_date DESC, fv.modified DESC
		{limit_sql}
		""",
		params,
		as_dict=True,
	)
	_format_status(rows)

	return {
		"columns": DISPLAY_COLUMNS,
		"labels": DISPLAY_LABELS,
		"rows": rows,
		"total_count": summary["total_visits"],
		"shown_count": len(rows),
		"offset": offset,
		"limit": limit if not for_export else len(rows),
		"summary": summary,
		"staff_wise": [],
	}


@frappe.whitelist()
def download_report_excel(filters=None):
	filters = _parse_filters(filters)
	filters["for_export"] = 1
	report = get_report_data(filters=filters)
	columns = report.get("columns", [])
	labels = report.get("labels", {})
	rows = report.get("rows", [])

	xlsx_data = [[labels.get(col, col) for col in columns]]
	for row in rows:
		xlsx_data.append([_excel_value(row.get(col)) for col in columns])

	xlsx_file = make_xlsx(xlsx_data, "Field Staff Report")
	frappe.response["filename"] = "field_staff_report.xlsx"
	frappe.response["filecontent"] = xlsx_file.getvalue()
	frappe.response["type"] = "binary"


@frappe.whitelist()
def download_report_csv(filters=None):
	filters = _parse_filters(filters)
	filters["for_export"] = 1
	report = get_report_data(filters=filters)
	columns = report.get("columns", [])
	labels = report.get("labels", {})
	rows = report.get("rows", [])

	buffer = StringIO()
	writer = csv.writer(buffer)
	writer.writerow([labels.get(col, col) for col in columns])
	for row in rows:
		writer.writerow([_excel_value(row.get(col)) for col in columns])

	frappe.response["filename"] = "field_staff_report.csv"
	frappe.response["filecontent"] = buffer.getvalue()
	frappe.response["type"] = "csv"


def _parse_filters(filters):
	if isinstance(filters, str):
		try:
			return json.loads(filters)
		except Exception:
			return {}
	return filters or {}


def _build_where(filters, from_date, to_date):
	from tif_customization.tif_customization.field_visit_permissions import (
		apply_team_scope_to_conditions,
		can_view_all_field_visits,
		expand_staff_tokens,
		staff_is_in_team,
		staff_match_sql,
		visit_day_sql,
	)

	visit_type = filters.get("type")
	user = filters.get("user")
	province = filters.get("province")

	conditions = ["fv.docstatus < 2"]
	params = {}
	apply_team_scope_to_conditions(conditions, params, alias="fv")
	visit_date_expr = visit_day_sql("fv")

	if from_date:
		conditions.append(f"{visit_date_expr} >= %(from_date)s")
		params["from_date"] = from_date
	if to_date:
		conditions.append(f"{visit_date_expr} <= %(to_date)s")
		params["to_date"] = to_date
	if visit_type:
		conditions.append("fv.type = %(visit_type)s")
		params["visit_type"] = visit_type
	if user:
		if not can_view_all_field_visits() and not staff_is_in_team(user):
			frappe.throw(_("You can only view reports for your field staff."))
		tokens = expand_staff_tokens(user)
		params["staff_tokens"] = tuple(t.lower() for t in tokens) or ("__none__",)
		conditions.append(staff_match_sql("fv", "staff_tokens"))
	if province:
		conditions.append(f"({_province_sql('fv')}) = %(province)s")
		params["province"] = province

	return " AND ".join(conditions), params, visit_date_expr


def _school_sql(alias="fv"):
	a = alias
	return f"""COALESCE(
		NULLIF(TRIM({a}.school_name), ''),
		NULLIF(TRIM({a}.me_school_name), ''),
		NULLIF(TRIM({a}.mt_institute_or_organization_name), ''),
		NULLIF(TRIM({a}.training_venue_name), '')
	)"""


def _officer_sql(alias="fv"):
	a = alias
	return f"""CASE
		WHEN {a}.type = 'Marketing' THEN COALESCE(NULLIF(TRIM({a}.visit_by), ''), {a}.owner)
		WHEN {a}.type = 'M&E' THEN COALESCE(NULLIF(TRIM({a}.me_visit_by), ''), {a}.owner)
		WHEN {a}.type = 'Training' THEN COALESCE(NULLIF(TRIM({a}.training_entry_filled_by), ''), {a}.owner)
		WHEN {a}.type = 'Meeting' THEN COALESCE(NULLIF(TRIM({a}.mt_visit_by), ''), {a}.owner)
		ELSE COALESCE(NULLIF(TRIM({a}.visit_by), ''), {a}.owner)
	END"""


def _province_sql(alias="fv"):
	a = alias
	return f"""CASE
		WHEN {a}.type = 'Marketing' THEN COALESCE({a}.province, '')
		WHEN {a}.type = 'M&E' THEN COALESCE({a}.me_province, '')
		WHEN {a}.type = 'Training' THEN COALESCE({a}.training_province, '')
		ELSE ''
	END"""


def _category_sql(alias="fv"):
	a = alias
	return f"""COALESCE(
		NULLIF(TRIM({a}.marketing_visit_category), ''),
		NULLIF(TRIM({a}.me_activity_status), ''),
		NULLIF(TRIM({a}.training_session_category), '')
	)"""


def _sql_summary(where_clause, params):
	type_rows = frappe.db.sql(
		f"""
		SELECT IFNULL(NULLIF(TRIM(fv.type), ''), 'Other') AS type, COUNT(*) AS cnt
		FROM `tabField Visit` fv
		WHERE {where_clause}
		GROUP BY 1
		""",
		params,
		as_dict=True,
	)
	type_counts = {"Marketing": 0, "M&E": 0, "Training": 0, "Meeting": 0, "Other": 0}
	total = 0
	for r in type_rows:
		n = cint(r.cnt)
		total += n
		if r.type in type_counts:
			type_counts[r.type] += n
		else:
			type_counts["Other"] += n

	officers = frappe.db.sql(
		f"""
		SELECT DISTINCT {_officer_sql("fv")} AS officer
		FROM `tabField Visit` fv
		WHERE {where_clause}
		""",
		params,
		as_dict=True,
	)
	canonical = _staff_canonical_map()
	raw = [(r.officer or "").strip() for r in officers]
	user_names = _get_user_names(raw)
	unique = set()
	for staff_value in raw:
		mapped = user_names.get(staff_value) or staff_value or _("Unassigned")
		unique.add(_canonical_staff_label(mapped, canonical).casefold())
	active_staff = len(unique)

	return {
		"total_visits": total,
		"marketing_visits": type_counts["Marketing"],
		"me_visits": type_counts["M&E"],
		"training_visits": type_counts["Training"],
		"meeting_visits": type_counts["Meeting"],
		"other_visits": type_counts["Other"],
		"active_staff": active_staff,
		"visits_per_staff": round(total / active_staff, 1) if active_staff else 0,
	}


def _format_status(rows):
	labels = {0: "Draft", 1: "Submitted", 2: "Cancelled"}
	for row in rows:
		row["docstatus"] = labels.get(row.get("docstatus"), row.get("docstatus"))


def _build_summary(rows):
	type_counts = {"Marketing": 0, "M&E": 0, "Training": 0, "Meeting": 0, "Other": 0}
	staff_counts = {}
	raw_staff = [_get_field_staff(row) for row in rows]
	canonical = _staff_canonical_map()
	user_names = _get_user_names(raw_staff)

	for row, staff_value in zip(rows, raw_staff):
		visit_type = row.get("type") or "Other"
		if visit_type in type_counts:
			type_counts[visit_type] += 1
		else:
			type_counts["Other"] += 1

		mapped = user_names.get(staff_value) or staff_value or _("Unassigned")
		staff = _canonical_staff_label(mapped, canonical)
		staff_key = staff.casefold()
		staff_data = staff_counts.setdefault(
			staff_key,
			{
				"staff": staff,
				"total_visits": 0,
				"marketing": 0,
				"me": 0,
				"training": 0,
				"meeting": 0,
				"other": 0,
			},
		)
		staff_data["total_visits"] += 1
		if visit_type == "Marketing":
			staff_data["marketing"] += 1
		elif visit_type == "M&E":
			staff_data["me"] += 1
		elif visit_type == "Training":
			staff_data["training"] += 1
		elif visit_type == "Meeting":
			staff_data["meeting"] += 1
		else:
			staff_data["other"] += 1

	total_visits = len(rows)
	staff_wise = sorted(staff_counts.values(), key=lambda item: (-item["total_visits"], item["staff"]))
	for staff_data in staff_wise:
		staff_data["ratio"] = round(
			(staff_data["total_visits"] / total_visits * 100) if total_visits else 0,
			1,
		)

	active_staff = len(staff_wise)
	return (
		{
			"total_visits": total_visits,
			"marketing_visits": type_counts["Marketing"],
			"me_visits": type_counts["M&E"],
			"training_visits": type_counts["Training"],
			"meeting_visits": type_counts["Meeting"],
			"other_visits": type_counts["Other"],
			"active_staff": active_staff,
			"visits_per_staff": round(total_visits / active_staff, 1) if active_staff else 0,
		},
		staff_wise,
	)


def _get_field_staff(row):
	if row.get("type") == "Marketing":
		return row.get("visit_by") or row.get("owner") or _("Unassigned")
	if row.get("type") == "M&E":
		return row.get("me_visit_by") or row.get("owner") or _("Unassigned")
	if row.get("type") == "Training":
		return row.get("training_entry_filled_by") or row.get("owner") or _("Unassigned")
	if row.get("type") == "Meeting":
		return row.get("mt_visit_by") or row.get("owner") or _("Unassigned")
	return row.get("owner") or _("Unassigned")


def _staff_canonical_map():
	"""Map emails / spellings (Abdul.Kabeer) to Employee Name so one person is one staff."""
	cache = frappe.cache()
	cached = cache.get_value("tif_fsr_staff_canonical")
	if cached:
		return cached
	mapping = {}
	employees = frappe.get_all(
		"Employee",
		fields=["employee_name", "user_id"],
		limit_page_length=5000,
	)
	for emp in employees:
		name = (emp.employee_name or "").strip()
		if not name:
			continue
		mapping[name.lower()] = name
		mapping[name.replace(" ", ".").lower()] = name
		mapping[name.replace(" ", "").lower()] = name
		compact = re.sub(r"[^a-z]", "", name.lower())
		if compact:
			mapping[compact] = name
		if emp.user_id:
			mapping[emp.user_id.strip().lower()] = name
	cache.set_value("tif_fsr_staff_canonical", mapping, expires_in_sec=3600)
	return mapping


def _canonical_staff_label(raw, mapping):
	s = (raw or "").strip()
	if not s:
		return _("Unassigned")
	return (
		mapping.get(s.lower())
		or mapping.get(re.sub(r"[^a-z]", "", s.lower()))
		or s
	)


def _get_user_names(staff_values):
	emails = sorted({value for value in staff_values if value and "@" in value})
	if not emails:
		return {}
	users = frappe.get_all(
		"User",
		filters={"name": ["in", emails]},
		fields=["name", "full_name"],
	)
	return {user.name: user.full_name for user in users if user.full_name}


def _excel_value(value):
	if isinstance(value, (datetime, date, time)):
		return str(value)
	return value
