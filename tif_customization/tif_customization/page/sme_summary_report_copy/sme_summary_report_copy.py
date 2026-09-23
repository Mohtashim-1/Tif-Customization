# Copyright (c) 2026, TIF Customization and contributors
# License: MIT
"""SME period summary (copy page) — Marketing / Meetings / M&E / Training + Score."""

from __future__ import annotations

import json
from collections import defaultdict
from datetime import timedelta

import frappe
from frappe import _
from frappe.utils import cint, flt, get_first_day, getdate, today

from tif_customization.tif_customization.field_visit_permissions import (
	_name_variants,
	can_view_all_field_visits,
	expand_staff_tokens,
	get_team_employee_rows,
	get_team_match_values,
	visit_day_sql as _visit_day_sql,
)
from tif_customization.tif_customization.field_visit_travel_cost import (
	DEFAULT_PER_KM_FUEL,
	aggregate_visit_expenses_by_staff,
	resolve_per_km_fuel,
)
from tif_customization.tif_customization.page.smes_target_base___k.smes_target_base_kpi_config import (
	KPI_ACTIVITIES,
	REGION_KEYS,
	REGION_LABELS,
	REGION_SUMMARY,
)
from tif_customization.tif_customization.page.sme_kpi_details.sme_kpi_details import (
	OUTCOME_TARGETS,
	_enriched_actuals,
)
from tif_customization.tif_customization.page.smes_target_base___k.smes_target_base___k import (
	_count_actuals,
	_fiscal_year_start,
	_points_for_scoring,
)

SME_DESIGNATION = "School Marketing Executive"

# Activity types that roll into the summary columns / visited days
# "Visits" is the current school-visit form; "Marketing" is the legacy type.
SUMMARY_TYPES = (
	"Marketing",
	"Visits",
	"Registration of New Schools",
	"Meeting",
	"M&E",
	"Training",
	"Workshop",
	"Workshop Arranged",
	"Meeting with Ulama and Educationist",
	"Teachers Training Meeting",
	"Academic Task",
	"Academic / Other Official Tasks",
	"Other Official Tasks",
	"Headoffice/ Regional Office/ Out of Station Visit",
	"Co-curricular Activity",
)

# Activity (period) columns — aligned with SME KPI Details / Target Base KPI sheet
KPI_COLUMNS = (
	{"key": "workshop", "label": "Workshop", "metric": "training"},
	{"key": "meeting_ulama", "label": "Meeting with Ulama and Educationist", "metric": "meeting_ulama"},
	{"key": "teachers_training_meeting", "label": "Teachers Training Meeting", "metric": "teachers_training_meeting"},
	{
		"key": "headoffice_visit",
		"label": "Headoffice / Regional Office / Out of Station Visit",
		"metric": "headoffice_visit",
	},
	{"key": "academic_task", "label": "Academic Task", "metric": "academic_task"},
	{"key": "other_official", "label": "Other Official Tasks", "metric": "other_official"},
)
KPI_KEYS = tuple(c["key"] for c in KPI_COLUMNS)

OUTCOME_COLUMNS = tuple(
	{
		"key": f"outcome_{cfg['key']}",
		"label": cfg["label"],
		"metric": cfg["metric"],
		"yearly_min": cfg["target"],
	}
	for cfg in OUTCOME_TARGETS
)
OUTCOME_KEYS = tuple(c["key"] for c in OUTCOME_COLUMNS) + ("outcome_pct",)


def _supervisor_subordinate_ids(supervisor: str) -> set[str]:
	"""Team under a field supervisor, including the supervisor's own Employee row."""
	supervisor = (supervisor or "").strip()
	if not supervisor:
		return set()
	from tif_customization.tif_customization.doctype.field_officer.field_officer import (
		get_field_supervisor_subordinate_employees,
		resolve_supervisor_field_officer,
	)

	ids = set(get_field_supervisor_subordinate_employees(supervisor))
	supervisor_fo = resolve_supervisor_field_officer(supervisor)
	if supervisor_fo:
		emp = frappe.db.get_value("Field Officer", supervisor_fo, "employee")
		if emp:
			ids.add(emp)
	return ids


def _supervisor_label(supervisor: str) -> str:
	supervisor = (supervisor or "").strip()
	if not supervisor:
		return ""
	from tif_customization.tif_customization.page.supervisor_target_ba.supervisor_target_ba import (
		_get_supervisor_info,
	)

	return (_get_supervisor_info(supervisor).get("label") or supervisor).strip()


def _list_field_supervisors() -> list[dict]:
	"""Field Officer supervisors (typically 3 regional leads with FO teams)."""
	from tif_customization.tif_customization.doctype.field_officer.field_officer import (
		list_field_supervisors,
	)

	return list_field_supervisors(SME_DESIGNATION)


def _supervisor_stats(supervisors: list[dict] | None = None) -> dict:
	supervisors = supervisors if supervisors is not None else _list_field_supervisors()
	sme_supervisors = [s for s in supervisors if cint(s.get("sme_count") or 0) > 0]
	return {
		"total": len(supervisors),
		"sme_supervisors": len(sme_supervisors),
		"total_field_staff": sum(cint(s.get("team_size") or 0) for s in supervisors),
		"total_field_officers": sum(cint(s.get("field_officer_count") or 0) for s in supervisors),
		"total_smes": sum(cint(s.get("sme_count") or 0) for s in supervisors),
	}


@frappe.whitelist()
@frappe.validate_and_sanitize_search_inputs
def get_sme_employee_query(doctype, txt, searchfield, start, page_len, filters):
	"""Link query for SME filter — optionally limited to a supervisor's subordinates."""
	filters = filters if isinstance(filters, dict) else {}
	supervisor = (filters.get("supervisor") or "").strip()
	conditions = ["status = 'Active'", "designation = %s"]
	values = [SME_DESIGNATION]

	if supervisor:
		sub_ids = _supervisor_subordinate_ids(supervisor)
		if not sub_ids:
			return []
		placeholders = ", ".join(["%s"] * len(sub_ids))
		conditions.append(f"name IN ({placeholders})")
		values.extend(sorted(sub_ids))

	if txt:
		conditions.append("(employee_name LIKE %s OR name LIKE %s)")
		values.extend([f"%{txt}%", f"%{txt}%"])

	return frappe.db.sql(
		f"""
		SELECT name, employee_name, designation
		FROM `tabEmployee`
		WHERE {" AND ".join(conditions)}
		ORDER BY employee_name
		LIMIT %s OFFSET %s
		""",
		tuple(values) + (page_len, start),
	)


@frappe.whitelist()
def get_expense_drilldown(filters=None):
	"""Expense Claims + Field Visit travel costs for SMEs in the report period."""
	if not frappe.has_permission("Field Visit", "read") and not frappe.has_permission(
		"Expense Claim", "read"
	):
		frappe.throw(_("You are not permitted to view expense data."))

	filters = _parse_filters(filters)
	from_date, to_date = _resolve_dates(filters)
	staff_rows = _get_sme_staff(filters)
	staff_q = (filters.get("staff") or filters.get("employee") or "").strip()
	if staff_q and staff_rows:
		exact = [
			s
			for s in staff_rows
			if staff_q in {s.get("employee"), s.get("key"), s.get("user_id")}
		]
		if exact:
			staff_rows = exact
		else:
			ql = staff_q.lower()
			staff_rows = [
				s
				for s in staff_rows
				if ql
				in " ".join(
					[
						str(s.get("key") or ""),
						str(s.get("employee") or ""),
						str(s.get("employee_name") or ""),
						str(s.get("user_id") or ""),
					]
				).lower()
			]
	if not staff_rows:
		return {
			"rows": [],
			"count": 0,
			"total": 0.0,
			"from_date": str(from_date),
			"to_date": str(to_date),
			"default_rate": DEFAULT_PER_KM_FUEL,
		}

	key_to_name = {
		s["key"]: s.get("employee_name") or s.get("user_id") or s.get("employee") for s in staff_rows
	}
	emp_ids = [s["employee"] for s in staff_rows if s.get("employee")]
	rows = []
	total = 0.0

	if emp_ids and frappe.has_permission("Expense Claim", "read"):
		try:
			claims = frappe.db.sql(
				"""
				SELECT
					ec.name,
					ec.employee,
					ec.employee_name,
					ec.posting_date,
					COALESCE(ec.total_claimed_amount, ec.grand_total, 0) AS amount,
					ec.approval_status
				FROM `tabExpense Claim` ec
				WHERE ec.employee IN %(emps)s
				AND ec.docstatus = 1
				AND ec.posting_date BETWEEN %(from_date)s AND %(to_date)s
				ORDER BY ec.posting_date DESC, ec.name DESC
				LIMIT 1000
				""",
				{"emps": tuple(emp_ids), "from_date": from_date, "to_date": to_date},
				as_dict=True,
			)
		except Exception:
			claims = []
		for c in claims:
			amt = flt(c.amount)
			total += amt
			rows.append(
				{
					"source": _("Expense Claim"),
					"name": c.name,
					"names": [c.name],
					"employee": c.employee,
					"employee_name": c.employee_name or c.employee,
					"posting_date": str(c.posting_date) if c.posting_date else "",
					"amount": flt(amt, 2),
					"km": None,
					"km_on_docs": None,
					"km_source": "—",
					"rate": None,
					"travel_mode": "—",
					"computation": _("Expense Claim total claimed amount"),
					"status": c.approval_status or "",
					"url": f"/app/expense-claim/{c.name}",
				}
			)

	if frappe.has_permission("Field Visit", "read"):
		for fv in _field_visit_expense_rows(from_date, to_date, staff_rows):
			amt = flt(fv.get("amount"))
			total += amt
			staff_key = fv.get("staff_key")
			rows.append(
				{
					"source": fv.get("source") or _("Field Visit"),
					"name": fv.get("name"),
					"names": fv.get("names") or ([fv.get("name")] if fv.get("name") else []),
					"employee": staff_key or "",
					"employee_name": fv.get("employee_name") or key_to_name.get(staff_key) or "",
					"posting_date": fv.get("posting_date") or "",
					"amount": flt(amt, 2),
					"km": fv.get("km"),
					"km_on_docs": fv.get("km_on_docs"),
					"km_source": fv.get("km_source") or "",
					"rate": fv.get("rate"),
					"travel_mode": fv.get("travel_mode") or "—",
					"computation": fv.get("computation") or "",
					"status": fv.get("status") or "",
					"url": fv.get("url") or "",
				}
			)

	rows.sort(key=lambda r: (r.get("posting_date") or "", r.get("name") or ""), reverse=True)
	rows = rows[:1000]

	return {
		"rows": rows,
		"count": len(rows),
		"total": flt(total, 2),
		"from_date": str(from_date),
		"to_date": str(to_date),
		"default_rate": DEFAULT_PER_KM_FUEL,
	}


@frappe.whitelist()
def get_report_data(filters=None):
	if not frappe.has_permission("Field Visit", "read"):
		frappe.throw(_("You are not permitted to view Field Visit data."))

	filters = _parse_filters(filters)
	from_date, to_date = _resolve_dates(filters)
	working_days = cint(filters.get("working_days") or 0) or _weekday_count(from_date, to_date)
	region = (filters.get("region") or "karachi").strip().lower()
	if region not in REGION_KEYS:
		region = "karachi"

	supervisor = (filters.get("supervisor") or "").strip()
	supervisors = _list_field_supervisors()
	supervisor_stats = _supervisor_stats(supervisors)
	staff_rows = _get_sme_staff(filters)
	visit_stats = _load_visit_stats(from_date, to_date, staff_rows)
	expenses = _load_expenses(from_date, to_date, staff_rows)

	fy_start_year = cint(_fiscal_year_start(to_date.year, to_date.month))
	ytd_from = getdate(f"{fy_start_year}-07-01")
	if ytd_from > to_date:
		ytd_from = from_date

	expected_points_by_region = {
		rk: working_days * REGION_SUMMARY[rk]["per_day_target_points"] for rk in REGION_KEYS
	}
	default_expected = expected_points_by_region.get(region) or expected_points_by_region["karachi"]
	rows = []
	totals = defaultdict(float)

	for staff in staff_rows:
		key = staff["key"]
		stats = visit_stats.get(key) or {}
		followup = cint(stats.get("followup") or 0)
		new = cint(stats.get("new") or 0)
		meetings = cint(stats.get("meetings") or 0)
		active = cint(stats.get("active") or 0)
		inactive = cint(stats.get("inactive") or 0)
		me = cint(stats.get("me") or 0)
		schools = cint(stats.get("schools") or 0)
		participants = cint(stats.get("participants") or 0)
		visited_days = cint(stats.get("visited_days") or 0)
		# Grand Total = Marketing + Meetings + all M&E visits (not training schools/participants)
		grand_total = followup + new + meetings + me
		expense_amt = flt(expenses.get(key) or 0)
		difference = visited_days - working_days

		staff_region = _staff_region(staff) or region
		staff_expected = expected_points_by_region.get(staff_region) or default_expected
		earned_points, score_pct, actuals = _compute_score(
			staff, from_date, to_date, staff_region, staff_expected, stats
		)
		per_day = REGION_SUMMARY.get(staff_region, REGION_SUMMARY["karachi"])["per_day_target_points"]
		breakdown = _points_breakdown(actuals, staff_region)

		row = {
			"employee": staff.get("employee"),
			"employee_name": staff.get("employee_name"),
			"division": staff.get("division") or "",
			"region": staff_region,
			"region_label": REGION_LABELS.get(staff_region, staff_region),
			"user_id": staff.get("user_id"),
			"label": f"SME - {staff.get('employee_name') or staff.get('user_id') or staff.get('employee')}",
			"followup": followup,
			"new": new,
			"meetings": meetings,
			"active": active,
			"inactive": inactive,
			"me": me,
			"schools": schools,
			"participants": participants,
			"grand_total": grand_total,
			"expenses": expense_amt,
			"visited_days": visited_days,
			"difference": difference,
			"total_points": flt(staff_expected, 2),
			"earned_points": flt(earned_points, 2),
			"percentage": flt(score_pct, 2),
			"score": score_pct,
			"score_points": flt(earned_points, 2),
			"score_pct": flt(score_pct, 2),
			"working_days": working_days,
			"per_day_points": per_day,
			"points_breakdown": breakdown,
		}
		for col in KPI_COLUMNS:
			if col["key"] == "workshop":
				row["workshop"] = cint(actuals.get("half_day_workshop") or 0) + cint(
					actuals.get("full_day_session") or 0
				)
			else:
				row[col["key"]] = cint(actuals.get(col["key"]) or 0)
		row.update(_outcome_row_fields(staff, ytd_from, to_date))
		rows.append(row)
		for k in (
			"followup",
			"new",
			"meetings",
			"active",
			"inactive",
			"me",
			"schools",
			"participants",
			"grand_total",
			"expenses",
			"visited_days",
			"difference",
			"total_points",
			"earned_points",
			"score",
			"score_points",
			*KPI_KEYS,
			*OUTCOME_KEYS,
		):
			if k == "outcome_pct":
				continue
			totals[k] += flt(row.get(k) or 0)

	rows.sort(key=lambda r: (-flt(r.get("percentage") or 0), (r.get("employee_name") or "").lower()))

	outcome_pcts = [flt(r.get("outcome_pct") or 0) for r in rows if r.get("outcome_pct") is not None]

	money_or_points = ("expenses", "score_points", "total_points", "earned_points")
	totals_out = {
		k: (flt(v, 2) if k in money_or_points else cint(v))
		for k, v in totals.items()
		if k not in ("score",)
	}
	# Footer % = overall earned ÷ expected (not a sum of percents)
	totals_out["percentage"] = flt(
		(totals.get("earned_points", 0) / totals.get("total_points", 0) * 100)
		if totals.get("total_points")
		else 0,
		2,
	)
	totals_out["score"] = totals_out["percentage"]
	totals_out["points_breakdown"] = _sum_points_breakdown(rows)
	totals_out["working_days"] = working_days
	visited_days_max = max((cint(r.get("visited_days") or 0) for r in rows), default=0)
	totals_out["visited_days"] = visited_days_max
	totals_out["outcome_pct"] = flt(
		sum(outcome_pcts) / len(outcome_pcts) if outcome_pcts else 0,
		2,
	)
	expense_total = flt(sum(flt(r.get("expenses") or 0) for r in rows), 2)
	totals_out["expenses"] = expense_total

	return {
		"from_date": str(from_date),
		"to_date": str(to_date),
		"ytd_from": str(ytd_from),
		"fiscal_year_label": f"{fy_start_year}-{str(fy_start_year + 1)[-2:]}",
		"working_days": working_days,
		"supervisor": supervisor,
		"supervisor_label": _supervisor_label(supervisor) if supervisor else "",
		"supervisors": supervisors,
		"supervisor_stats": supervisor_stats,
		"region": region,
		"region_label": REGION_LABELS.get(region, region),
		"expected_points": flt(default_expected, 2),
		"points_guide": [
			{
				"key": rk,
				"label": REGION_LABELS[rk],
				"per_day": REGION_SUMMARY[rk]["per_day_target_points"],
			}
			for rk in REGION_KEYS
		],
		"rows": rows,
		"totals": totals_out,
		"kpi_columns": list(KPI_COLUMNS),
		"outcome_columns": list(OUTCOME_COLUMNS),
		"kpis": {
			"followup": cint(totals.get("followup") or 0),
			"new": cint(totals.get("new") or 0),
			"meetings": cint(totals.get("meetings") or 0),
			"active": cint(totals.get("active") or 0),
			"inactive": cint(totals.get("inactive") or 0),
			"me": cint(totals.get("me") or 0),
			"schools": cint(totals.get("schools") or 0),
			"participants": cint(totals.get("participants") or 0),
			"expenses": expense_total,
			"visited_days": visited_days_max,
			"grand_total": cint(totals.get("grand_total") or 0),
			"visits": cint(totals.get("visits") or 0),
			"workshop": cint(totals.get("workshop") or 0),
			"meeting_ulama": cint(totals.get("meeting_ulama") or 0),
			"teachers_training_meeting": cint(totals.get("teachers_training_meeting") or 0),
			"headoffice_visit": cint(totals.get("headoffice_visit") or 0),
			"academic_task": cint(totals.get("academic_task") or 0),
			"other_official": cint(totals.get("other_official") or 0),
			"co_curricular": cint(totals.get("co_curricular") or 0),
			"marketing": cint(totals.get("followup") or 0) + cint(totals.get("new") or 0),
			"me": cint(totals.get("me") or 0),
			"training": cint(totals.get("workshop") or 0),
			"school_visits": cint(totals.get("followup") or 0)
			+ cint(totals.get("new") or 0)
			+ cint(totals.get("me") or 0),
			"total_points": flt(totals.get("total_points") or 0, 2),
			"earned_points": flt(totals.get("earned_points") or 0, 2),
			"percentage": totals_out["percentage"],
			"sme_count": len(rows),
			"supervisor_count": cint(supervisor_stats.get("total") or 0),
			"sme_supervisor_count": cint(supervisor_stats.get("sme_supervisors") or 0),
			"model_school_a": cint(totals.get("outcome_model_school_a") or 0),
			"model_school_b": cint(totals.get("outcome_model_school_b") or 0),
			"new_schools": cint(totals.get("outcome_new_schools") or 0),
		},
		"regions": [{"key": rk, "label": REGION_LABELS[rk]} for rk in REGION_KEYS],
	}


def _outcome_row_fields(staff, ytd_from, to_date):
	staff_token = (staff.get("user_id") or staff.get("employee_name") or staff.get("employee") or "").strip()
	tokens = set(staff.get("match_values") or [])
	if staff_token:
		tokens.update(expand_staff_tokens(staff_token))
	if staff.get("employee"):
		tokens.update(expand_staff_tokens(staff["employee"]))
	tokens = list(tokens)
	ytd = (
		_enriched_actuals(ytd_from, to_date, staff_token, tokens)
		if (staff_token or tokens)
		else {}
	)
	fields = {}
	pcts = []
	for cfg in OUTCOME_TARGETS:
		key = cfg["key"]
		actual = flt(ytd.get(key, 0))
		target = flt(cfg["target"])
		pct = min(100.0, actual / target * 100) if target else 0.0
		fields[f"outcome_{key}"] = flt(actual, 2) if key == "workshop_registration" else cint(actual)
		fields[f"outcome_{key}_pct"] = flt(pct, 2)
		pcts.append(pct)
	fields["outcome_pct"] = flt(sum(pcts) / len(pcts), 2) if pcts else 0.0
	return fields


def _parse_filters(filters):
	if isinstance(filters, str):
		try:
			return json.loads(filters) or {}
		except Exception:
			return {}
	return filters or {}


def _resolve_dates(filters):
	"""Resolve Visit From / Visit To Date (filters Field Visit by visit date)."""
	report_day = getdate(today())
	# Accept either from_date/to_date or visit_from_date/visit_to_date
	from_raw = filters.get("visit_from_date") or filters.get("from_date")
	to_raw = filters.get("visit_to_date") or filters.get("to_date")
	from_date = getdate(from_raw or get_first_day(report_day))
	to_date = getdate(to_raw or report_day)
	if from_date > to_date:
		frappe.throw(_("Visit From Date cannot be after Visit To Date."))
	return from_date, to_date


def _weekday_count(from_date, to_date):
	"""Mon–Fri days in range (inclusive)."""
	n = 0
	cur = from_date
	while cur <= to_date:
		if cur.weekday() < 5:
			n += 1
		cur += timedelta(days=1)
	return n or 1


def _get_sme_staff(filters):
	"""Active SMEs plus Active Field Officers (so all rostered officers appear)."""
	employee_filter = (filters.get("employee") or "").strip() or None
	rows = frappe.get_all(
		"Employee",
		filters={"status": "Active", "designation": SME_DESIGNATION},
		fields=["name", "employee_name", "user_id", "department"],
		order_by="employee_name asc",
	)
	seen = {r.name for r in rows}

	if frappe.db.exists("DocType", "Field Officer"):
		for fo in frappe.get_all(
			"Field Officer",
			filters={"status": "Active"},
			fields=["employee", "user", "name1"],
		):
			emp_name = fo.employee
			if emp_name and emp_name in seen:
				continue
			emp = None
			if emp_name:
				emp = frappe.db.get_value(
					"Employee",
					emp_name,
					["name", "employee_name", "user_id", "department", "status"],
					as_dict=True,
				)
			if not emp and fo.user:
				emp = frappe.db.get_value(
					"Employee",
					{"user_id": fo.user},
					["name", "employee_name", "user_id", "department", "status"],
					as_dict=True,
				)
			if not emp or emp.status != "Active" or emp.name in seen:
				continue
			rows.append(emp)
			seen.add(emp.name)

	if not can_view_all_field_visits():
		allowed = {e.get("name") for e in get_team_employee_rows(include_self=True)}
		team_vals = {v.lower() for v in get_team_match_values()}
		rows = [
			r
			for r in rows
			if r.name in allowed
			or (r.user_id and r.user_id.lower() in team_vals)
			or (r.employee_name and r.employee_name.lower() in team_vals)
		]

	supervisor_filter = (filters.get("supervisor") or "").strip()
	if supervisor_filter:
		subordinate_ids = _supervisor_subordinate_ids(supervisor_filter)
		rows = [r for r in rows if r.name in subordinate_ids]

	if employee_filter:
		rows = [r for r in rows if r.name == employee_filter]

	# Prefetch User full_name for owner matching
	user_ids = [r.user_id for r in rows if r.user_id]
	full_names = {}
	if user_ids:
		for u in frappe.get_all(
			"User", filters={"name": ["in", user_ids]}, fields=["name", "full_name"]
		):
			full_names[u.name] = u.full_name

	result = []
	officer_map = _field_officer_map([r.name for r in rows], [r.user_id for r in rows if r.user_id])
	for r in rows:
		fo = officer_map.get(r.name) or officer_map.get(r.user_id) or {}
		result.append(
			{
				"key": r.name,
				"employee": r.name,
				"employee_name": r.employee_name,
				"user_id": r.user_id,
				"department": r.department,
				"division": fo.get("division") or "",
				"match_values": _staff_match_values(r, full_names.get(r.user_id)),
			}
		)
	return result


def _field_officer_map(employees, user_ids):
	"""Map employee/user → Field Officer division."""
	out = {}
	if not frappe.db.exists("DocType", "Field Officer"):
		return out
	filters = {"status": "Active"}
	rows = frappe.get_all(
		"Field Officer",
		filters=filters,
		fields=["name", "name1", "employee", "user", "division"],
	)
	emp_set = set(employees or [])
	user_set = set(user_ids or [])
	for r in rows:
		payload = {"division": r.division, "officer": r.name, "name1": r.name1}
		if r.employee and r.employee in emp_set:
			out[r.employee] = payload
		if r.user and r.user in user_set:
			out[r.user] = payload
	return out


def _staff_region(staff):
	from tif_customization.tif_customization.doctype.field_officer.field_officer import division_to_region

	div = (staff or {}).get("division") or ""
	region = division_to_region(div)
	if region:
		return region
	# Fallback resolve by employee / user
	if not frappe.db.exists("DocType", "Field Officer"):
		return None
	from tif_customization.tif_customization.doctype.field_officer.field_officer import get_officer_region

	meta = get_officer_region(
		employee=staff.get("employee"),
		user=staff.get("user_id"),
		staff_name=staff.get("employee_name"),
	)
	return (meta or {}).get("region")


def _staff_match_values(emp, user_full_name=None) -> set[str]:
	vals = set()
	for v in (emp.name, emp.user_id, emp.employee_name, user_full_name):
		if not v:
			continue
		vals.add(str(v).strip())
		vals.add(str(v).strip().lower())
	if emp.employee_name:
		vals.update(_name_variants(emp.employee_name))
	if user_full_name:
		vals.update(_name_variants(user_full_name))
	return {v for v in vals if v}


def _load_visit_stats(from_date, to_date, staff_rows):
	"""Aggregate Field Visit counts per SME key."""
	if not staff_rows:
		return {}

	index = {}
	for s in staff_rows:
		for v in s["match_values"]:
			index[str(v).strip().lower()] = s["key"]

	visit_day = _visit_day_sql("fv")
	rows = frappe.db.sql(
		f"""
		SELECT
			fv.name,
			fv.type,
			fv.owner,
			fv.visit_by,
			fv.me_visit_by,
			fv.mt_visit_by,
			fv.training_entry_filled_by,
			fv.training_trainer_name,
			fv.marketing_visit_category,
			fv.me_activity_status,
			COALESCE(fv.training_no_of_schools_attended, 0) AS schools,
			COALESCE(fv.training_no_of_participants, 0) AS participants,
			{visit_day} AS visit_day
		FROM `tabField Visit` fv
		WHERE fv.docstatus = 1
		AND fv.type IN %(types)s
		AND {visit_day} IS NOT NULL
		AND {visit_day} BETWEEN %(from_date)s AND %(to_date)s
		""",
		{"from_date": from_date, "to_date": to_date, "types": SUMMARY_TYPES},
		as_dict=True,
	)

	stats = {
		s["key"]: {
			"followup": 0,
			"new": 0,
			"meetings": 0,
			"active": 0,
			"inactive": 0,
			"me": 0,
			"schools": 0,
			"participants": 0,
			"trainings": 0,
			"_days": set(),
		}
		for s in staff_rows
	}

	for row in rows:
		staff_key = _resolve_staff_key(row, index)
		if not staff_key:
			continue
		bucket = stats[staff_key]
		vtype = row.get("type") or ""

		if vtype in ("Marketing", "Visits"):
			cat = (row.get("marketing_visit_category") or "").strip()
			if cat == "New":
				bucket["new"] += 1
			elif cat in ("Followup & Other Visits", "TPS Visits"):
				bucket["followup"] += 1
			elif not cat:
				# Blank category is treated as Followup & Other (common on older entries)
				bucket["followup"] += 1
			else:
				bucket["followup"] += 1
		elif vtype == "Registration of New Schools":
			bucket["new"] += 1
		elif vtype in ("Meeting", "Meeting with Ulama and Educationist"):
			bucket["meetings"] += 1
		elif vtype == "M&E":
			bucket["me"] += 1
			status = _norm_me_status(row.get("me_activity_status"))
			if status == "active":
				bucket["active"] += 1
			elif status == "inactive":
				bucket["inactive"] += 1
		elif vtype in ("Training", "Workshop", "Workshop Arranged", "Teachers Training Meeting"):
			bucket["schools"] += cint(row.get("schools") or 0)
			bucket["participants"] += cint(row.get("participants") or 0)
			bucket["trainings"] += 1

		if row.get("visit_day"):
			bucket["_days"].add(str(row.visit_day))

	for key, bucket in stats.items():
		bucket["visited_days"] = len(bucket.pop("_days"))

	return stats


def _norm_me_status(value) -> str:
	"""Normalize Active / Inactive / In-Active."""
	raw = (value or "").strip().lower().replace("-", " ").replace("_", " ")
	raw = " ".join(raw.split())
	if raw == "active":
		return "active"
	if raw in ("inactive", "in active"):
		return "inactive"
	return ""


def _resolve_staff_key(row, index):
	vtype = row.get("type") or ""
	candidates = []
	if vtype in ("Marketing", "Visits", "Registration of New Schools"):
		candidates.extend([row.get("visit_by"), row.get("owner")])
	elif vtype == "M&E":
		candidates.extend([row.get("me_visit_by"), row.get("visit_by"), row.get("owner")])
	elif vtype == "Meeting":
		candidates.extend([row.get("mt_visit_by"), row.get("owner")])
	elif vtype in ("Training", "Workshop", "Workshop Arranged", "Teachers Training Meeting"):
		# Trainer first — SMEs often appear as trainer while another officer fills the form.
		candidates.extend(
			[
				row.get("training_trainer_name"),
				row.get("visit_by"),
				row.get("training_entry_filled_by"),
				row.get("owner"),
			]
		)
	else:
		candidates.extend(
			[
				row.get("visit_by"),
				row.get("me_visit_by"),
				row.get("mt_visit_by"),
				row.get("training_trainer_name"),
				row.get("training_entry_filled_by"),
				row.get("owner"),
			]
		)

	for c in candidates:
		if not c:
			continue
		key = index.get(str(c).strip().lower())
		if key:
			return key
	return None


def _staff_key_index(staff_rows):
	index = {}
	for s in staff_rows:
		for v in s.get("match_values") or []:
			index[str(v).strip().lower()] = s["key"]
	return index


def _field_visit_expense_rows(from_date, to_date, staff_rows):
	"""One row per staff visit-day that has recorded travel_cost. Blank KM is not estimated."""
	if not staff_rows:
		return []

	index = _staff_key_index(staff_rows)
	visit_day = _visit_day_sql("fv")
	per_km_by_key = {
		s["key"]: resolve_per_km_fuel(
			visit_by=s.get("employee_name"),
			owner=s.get("user_id"),
			employee=s.get("employee"),
		)
		for s in staff_rows
	}
	key_to_name = {
		s["key"]: s.get("employee_name") or s.get("user_id") or s.get("employee") for s in staff_rows
	}

	try:
		rows = frappe.db.sql(
			f"""
			SELECT
				fv.name,
				fv.type,
				fv.owner,
				fv.visit_by,
				fv.me_visit_by,
				fv.mt_visit_by,
				fv.training_entry_filled_by,
				fv.training_trainer_name,
				COALESCE(fv.travel_cost, 0) AS travel_cost,
				COALESCE(fv.travel_distance_km, 0) AS travel_distance_km,
				COALESCE(fv.travel_per_km_rate, 0) AS travel_per_km_rate,
				fv.travel_mode,
				{visit_day} AS visit_day
			FROM `tabField Visit` fv
			WHERE fv.docstatus = 1
			AND {visit_day} IS NOT NULL
			AND {visit_day} BETWEEN %(from_date)s AND %(to_date)s
			ORDER BY {visit_day}, fv.name
			""",
			{"from_date": from_date, "to_date": to_date},
			as_dict=True,
		)
	except Exception:
		return []

	grouped: dict[tuple[str, str], list] = defaultdict(list)
	for row in rows:
		staff_key = _resolve_staff_key(row, index)
		if not staff_key or not row.get("visit_day"):
			continue
		grouped[(staff_key, str(row.visit_day))].append(row)

	out = []
	for (staff_key, day), visits in grouped.items():
		per_km = flt(per_km_by_key.get(staff_key) or DEFAULT_PER_KM_FUEL)
		explicit = sum(flt(v.get("travel_cost")) for v in visits)
		if explicit <= 0:
			continue
		km_on_docs = sum(flt(v.get("travel_distance_km")) for v in visits)
		names = [v.get("name") for v in visits if v.get("name") and flt(v.get("travel_cost")) > 0]
		if not names:
			names = [v.get("name") for v in visits if v.get("name")]
		modes = sorted(
			{(v.get("travel_mode") or "").strip() for v in visits if (v.get("travel_mode") or "").strip()}
		)
		bits = []
		for v in visits:
			km = flt(v.get("travel_distance_km"))
			cost = flt(v.get("travel_cost"))
			if cost <= 0:
				continue
			rate = flt(v.get("travel_per_km_rate")) or per_km
			label = v.get("name") or ""
			if km > 0:
				bits.append(_("{0}: {1} km × Rs {2}/km = Rs {3}").format(label, km, rate, cost))
			else:
				bits.append(_("{0}: travel cost Rs {1} (KM blank on document)").format(label, cost))

		out.append(
			{
				"source": _("Field Visit"),
				"name": names[0] if names else "",
				"names": names,
				"staff_key": staff_key,
				"employee_name": key_to_name.get(staff_key) or "",
				"posting_date": day,
				"amount": flt(explicit, 2),
				"km": km_on_docs if km_on_docs > 0 else None,
				"km_on_docs": km_on_docs if km_on_docs else None,
				"km_source": _("On Field Visit") if km_on_docs > 0 else _("Not entered on document"),
				"rate": per_km,
				"travel_mode": ", ".join(modes) or "—",
				"computation": "; ".join(bits) or _("Recorded travel cost"),
				"status": visits[0].get("type") if len(visits) == 1 else _("{0} visits").format(len(visits)),
				"url": f"/app/field-visit/{names[0]}" if names else "",
			}
		)
	return out


def _load_expenses(from_date, to_date, staff_rows):
	"""Expense Claims plus recorded Field Visit travel_cost only (no KM estimate)."""
	result = {s["key"]: 0.0 for s in staff_rows}
	if not staff_rows:
		return result

	fv_totals = aggregate_visit_expenses_by_staff(
		from_date,
		to_date,
		staff_rows,
		visit_day_sql=_visit_day_sql("fv"),
		resolve_staff_key=_resolve_staff_key,
		staff_key_index=_staff_key_index,
		estimate_if_blank=False,
	)
	for key, amt in fv_totals.items():
		if key in result:
			result[key] += flt(amt)

	emp_ids = [s["employee"] for s in staff_rows if s.get("employee")]
	if emp_ids:
		try:
			claims = frappe.db.sql(
				"""
				SELECT employee,
					COALESCE(total_claimed_amount, grand_total, 0) AS amount
				FROM `tabExpense Claim`
				WHERE employee IN %(emps)s
				AND docstatus = 1
				AND posting_date BETWEEN %(from_date)s AND %(to_date)s
				""",
				{"emps": tuple(emp_ids), "from_date": from_date, "to_date": to_date},
				as_dict=True,
			)
		except Exception:
			claims = []
		for c in claims:
			if c.employee in result:
				result[c.employee] += flt(c.amount)

	return result


def _compute_score(staff, from_date, to_date, region, expected_points, stats):
	"""KPI achievement % for the period.

	Uses Target Base point weights, but workshop_registration scores by number of
	training sessions (not sum of participants) so one large session cannot inflate
	Score to thousands of points / >1000%.
	"""
	staff_token = staff.get("user_id") or staff.get("employee_name") or staff.get("employee") or ""
	tokens = set(staff.get("match_values") or [])
	# One expand is enough: user_id/name lookup adds email + dotted name variants.
	tokens.update(expand_staff_tokens(staff_token))
	if not staff_token and tokens:
		staff_token = next(iter(tokens))
	actuals = (
		_count_actuals(
			from_date, to_date, staff_token, staff_tokens=list(tokens), submitted_only=True
		)
		if staff_token
		else {}
	)

	# Correct workshop_registration: count sessions attributed to this SME, not heads
	actuals["workshop_registration"] = cint((stats or {}).get("trainings") or 0)

	score = 0.0
	for activity in KPI_ACTIVITIES:
		cfg = (activity.get("targets") or {}).get(region) or {}
		points = _points_for_scoring(cfg)
		score += flt(actuals.get(activity["metric"], 0)) * points

	pct = (score / expected_points * 100) if expected_points else 0
	return flt(score, 2), flt(pct, 2), actuals


def _points_breakdown(actuals, region):
	"""One line per Target Base KPI: actual × region points = earned."""
	lines = []
	for activity in KPI_ACTIVITIES:
		cfg = (activity.get("targets") or {}).get(region) or {}
		points = _points_for_scoring(cfg)
		actual = flt(actuals.get(activity["metric"], 0))
		lines.append(
			{
				"key": activity["key"],
				"label": activity["label"],
				"metric": activity["metric"],
				"actual": flt(actual, 2),
				"points": flt(points, 2),
				"earned": flt(actual * points, 2),
			}
		)
	return lines


def _sum_points_breakdown(rows):
	agg = {}
	for row in rows:
		for line in row.get("points_breakdown") or []:
			bucket = agg.setdefault(
				line["key"],
				{
					"key": line["key"],
					"label": line["label"],
					"metric": line["metric"],
					"actual": 0.0,
					"earned": 0.0,
					"points": None,
				},
			)
			bucket["actual"] = flt(bucket["actual"] + flt(line.get("actual") or 0), 2)
			bucket["earned"] = flt(bucket["earned"] + flt(line.get("earned") or 0), 2)
	return list(agg.values())
