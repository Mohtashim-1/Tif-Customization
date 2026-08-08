# Copyright (c) 2026, TIF Customization and contributors
# License: MIT
"""SME period summary — Marketing / Meetings / M&E / Training + Score (UAT)."""

from __future__ import annotations

import json
from collections import defaultdict
from datetime import timedelta

import frappe
from frappe import _
from frappe.utils import cint, flt, getdate

from tif_customization.tif_customization.field_visit_permissions import (
	_name_variants,
	can_view_all_field_visits,
	get_team_employee_rows,
	get_team_match_values,
)
from tif_customization.tif_customization.page.smes_target_base___k.smes_target_base_kpi_config import (
	KPI_ACTIVITIES,
	REGION_KEYS,
	REGION_LABELS,
	REGION_SUMMARY,
)
from tif_customization.tif_customization.page.smes_target_base___k.smes_target_base___k import (
	_count_actuals,
	_points_for_scoring,
)

SME_DESIGNATION = "School Marketing Executive"

# Activity types that roll into the summary columns / visited days
SUMMARY_TYPES = ("Marketing", "Meeting", "M&E", "Training")


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

	staff_rows = _get_sme_staff(filters)
	visit_stats = _load_visit_stats(from_date, to_date, staff_rows)
	expenses = _load_expenses(from_date, to_date, staff_rows)

	expected_points = working_days * REGION_SUMMARY[region]["per_day_target_points"]
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
		schools = cint(stats.get("schools") or 0)
		participants = cint(stats.get("participants") or 0)
		visited_days = cint(stats.get("visited_days") or 0)
		# Grand Total from ERP = sum of visit activity columns (not training schools/participants)
		grand_total = followup + new + meetings + active + inactive
		expense_amt = flt(expenses.get(key) or 0)
		difference = visited_days - working_days

		score_points, score_pct = _compute_score(
			staff, from_date, to_date, region, expected_points, stats
		)

		row = {
			"employee": staff.get("employee"),
			"employee_name": staff.get("employee_name"),
			"user_id": staff.get("user_id"),
			"label": f"SME - {staff.get('employee_name') or staff.get('user_id') or staff.get('employee')}",
			"followup": followup,
			"new": new,
			"meetings": meetings,
			"active": active,
			"inactive": inactive,
			"schools": schools,
			"participants": participants,
			"grand_total": grand_total,
			"expenses": expense_amt,
			"visited_days": visited_days,
			"difference": difference,
			# Score column = KPI achievement % (raw points kept for export/tooltip)
			"score": score_pct,
			"score_points": score_points,
			"score_pct": score_pct,
		}
		rows.append(row)
		for k in (
			"followup",
			"new",
			"meetings",
			"active",
			"inactive",
			"schools",
			"participants",
			"grand_total",
			"expenses",
			"visited_days",
			"difference",
			"score",
			"score_points",
		):
			totals[k] += flt(row.get(k) or 0)

	rows.sort(key=lambda r: (r.get("employee_name") or "").lower())

	n = len(rows) or 1
	totals_out = {
		k: (flt(v, 2) if k in ("expenses", "score_points") else cint(v))
		for k, v in totals.items()
		if k not in ("score",)
	}
	# Footer Score % = average achievement across SMEs (not sum)
	totals_out["score"] = flt(totals.get("score", 0) / n, 2)

	return {
		"from_date": str(from_date),
		"to_date": str(to_date),
		"working_days": working_days,
		"region": region,
		"region_label": REGION_LABELS.get(region, region),
		"expected_points": flt(expected_points, 2),
		"rows": rows,
		"totals": totals_out,
		"regions": [{"key": rk, "label": REGION_LABELS[rk]} for rk in REGION_KEYS],
	}


def _parse_filters(filters):
	if isinstance(filters, str):
		try:
			return json.loads(filters) or {}
		except Exception:
			return {}
	return filters or {}


def _resolve_dates(filters):
	"""Resolve Visit From / Visit To Date (filters Field Visit by visit date)."""
	today = getdate()
	# Accept either from_date/to_date or visit_from_date/visit_to_date
	from_raw = filters.get("visit_from_date") or filters.get("from_date")
	to_raw = filters.get("visit_to_date") or filters.get("to_date")
	from_date = getdate(from_raw or today.replace(day=1))
	to_date = getdate(to_raw or today)
	if from_date > to_date:
		frappe.throw(_("Visit From Date cannot be after Visit To Date."))
	return from_date, to_date


def _visit_day_sql(alias="fv"):
	"""Effective visit date per Field Visit type (not document creation/modified)."""
	a = alias
	return f"""
		CASE
			WHEN {a}.type = 'Marketing' THEN COALESCE({a}.visit_date, DATE({a}.timestamp))
			WHEN {a}.type = 'M&E' THEN COALESCE({a}.me_visit_date, {a}.me_starting_date, DATE({a}.me_timestamp))
			WHEN {a}.type = 'Training' THEN COALESCE({a}.training_date, DATE({a}.training_timestamp))
			WHEN {a}.type = 'Meeting' THEN COALESCE({a}.mt_meeting_date, DATE({a}.mt_timestamp))
			ELSE COALESCE({a}.visit_date, {a}.me_visit_date, {a}.training_date, {a}.mt_meeting_date)
		END
	"""


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
	"""Active SMEs; field leads only see their team."""
	employee_filter = (filters.get("employee") or "").strip() or None
	rows = frappe.get_all(
		"Employee",
		filters={"status": "Active", "designation": SME_DESIGNATION},
		fields=["name", "employee_name", "user_id", "department"],
		order_by="employee_name asc",
	)

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
	for r in rows:
		result.append(
			{
				"key": r.name,
				"employee": r.name,
				"employee_name": r.employee_name,
				"user_id": r.user_id,
				"department": r.department,
				"match_values": _staff_match_values(r, full_names.get(r.user_id)),
			}
		)
	return result


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
		WHERE fv.docstatus < 2
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

		if vtype == "Marketing":
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
		elif vtype == "Meeting":
			bucket["meetings"] += 1
		elif vtype == "M&E":
			status = _norm_me_status(row.get("me_activity_status"))
			if status == "active":
				bucket["active"] += 1
			elif status == "inactive":
				bucket["inactive"] += 1
			# blank / unknown M&E status: do not invent Active/Inactive
		elif vtype == "Training":
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
	if vtype == "Marketing":
		candidates.extend([row.get("visit_by"), row.get("owner")])
	elif vtype == "M&E":
		candidates.extend([row.get("me_visit_by"), row.get("owner")])
	elif vtype == "Meeting":
		candidates.extend([row.get("mt_visit_by"), row.get("owner")])
	elif vtype == "Training":
		candidates.extend(
			[row.get("training_entry_filled_by"), row.get("training_trainer_name"), row.get("owner")]
		)
	else:
		candidates.append(row.get("owner"))

	for c in candidates:
		if not c:
			continue
		key = index.get(str(c).strip().lower())
		if key:
			return key
	return None


def _load_expenses(from_date, to_date, staff_rows):
	"""Expense Claim totals by employee (claimed amount)."""
	result = {s["key"]: 0.0 for s in staff_rows}
	emp_ids = [s["employee"] for s in staff_rows if s.get("employee")]
	if not emp_ids:
		return result

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
		return result

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
	staff_token = staff.get("user_id") or staff.get("employee_name") or ""
	actuals = _count_actuals(from_date, to_date, staff_token) if staff_token else {}
	if not any(actuals.values()) and staff.get("employee_name") and staff.get("employee_name") != staff_token:
		actuals = _count_actuals(from_date, to_date, staff["employee_name"])

	# Correct workshop_registration: count sessions attributed to this SME, not heads
	actuals["workshop_registration"] = cint((stats or {}).get("trainings") or 0)

	score = 0.0
	for activity in KPI_ACTIVITIES:
		cfg = (activity.get("targets") or {}).get(region) or {}
		points = _points_for_scoring(cfg)
		score += flt(actuals.get(activity["metric"], 0)) * points

	pct = (score / expected_points * 100) if expected_points else 0
	return flt(score, 2), flt(pct, 2)
