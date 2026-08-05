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
		# Grand Total from ERP = activity counts (excludes training schools/participants)
		grand_total = followup + new + meetings + active + inactive
		expense_amt = flt(expenses.get(key) or 0)
		difference = visited_days - working_days

		score, score_pct = _compute_score(staff, from_date, to_date, region, expected_points)

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
			"score": score,
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
		):
			totals[k] += flt(row.get(k) or 0)

	rows.sort(key=lambda r: (r.get("employee_name") or "").lower())

	return {
		"from_date": str(from_date),
		"to_date": str(to_date),
		"working_days": working_days,
		"region": region,
		"region_label": REGION_LABELS.get(region, region),
		"expected_points": flt(expected_points, 2),
		"rows": rows,
		"totals": {k: (flt(v, 2) if k in ("expenses", "score") else cint(v)) for k, v in totals.items()},
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
	today = getdate()
	from_date = getdate(filters.get("from_date") or today.replace(day=1))
	to_date = getdate(filters.get("to_date") or today)
	if from_date > to_date:
		frappe.throw(_("From Date cannot be after To Date."))
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
		# Also allow match by user_id / name against team match values
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

	result = []
	for r in rows:
		result.append(
			{
				"key": r.name,
				"employee": r.name,
				"employee_name": r.employee_name,
				"user_id": r.user_id,
				"department": r.department,
				"match_values": _staff_match_values(r),
			}
		)
	return result


def _staff_match_values(emp) -> set[str]:
	vals = set()
	for v in (emp.name, emp.user_id, emp.employee_name):
		if v:
			vals.add(str(v).strip())
			vals.add(str(v).strip().lower())
	# short forms used on Field Visit
	name = (emp.employee_name or "").strip()
	if name:
		parts = name.split()
		if len(parts) >= 2:
			vals.add(f"{parts[0][0]} {parts[-1]}")
			vals.add(f"{parts[0][0]}. {parts[-1]}")
			vals.add("".join(parts))
	return {v for v in vals if v}


def _load_visit_stats(from_date, to_date, staff_rows):
	"""Aggregate Field Visit counts per SME key."""
	if not staff_rows:
		return {}

	# Build reverse index: match string -> employee key
	index = {}
	for s in staff_rows:
		for v in s["match_values"]:
			index[v.lower()] = s["key"]

	rows = frappe.db.sql(
		"""
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
			CASE
				WHEN fv.type = 'Marketing' THEN COALESCE(fv.visit_date, DATE(fv.timestamp), DATE(fv.modified))
				WHEN fv.type = 'M&E' THEN COALESCE(fv.me_visit_date, fv.me_starting_date, DATE(fv.me_timestamp), DATE(fv.modified))
				WHEN fv.type = 'Training' THEN COALESCE(fv.training_date, DATE(fv.training_timestamp), DATE(fv.modified))
				WHEN fv.type = 'Meeting' THEN COALESCE(fv.mt_meeting_date, DATE(fv.modified))
				ELSE DATE(fv.modified)
			END AS visit_day
		FROM `tabField Visit` fv
		WHERE fv.docstatus < 2
		AND CASE
			WHEN fv.type = 'Marketing' THEN COALESCE(fv.visit_date, DATE(fv.timestamp), DATE(fv.modified))
			WHEN fv.type = 'M&E' THEN COALESCE(fv.me_visit_date, fv.me_starting_date, DATE(fv.me_timestamp), DATE(fv.modified))
			WHEN fv.type = 'Training' THEN COALESCE(fv.training_date, DATE(fv.training_timestamp), DATE(fv.modified))
			WHEN fv.type = 'Meeting' THEN COALESCE(fv.mt_meeting_date, DATE(fv.modified))
			ELSE DATE(fv.modified)
		END BETWEEN %(from_date)s AND %(to_date)s
		""",
		{"from_date": from_date, "to_date": to_date},
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
			else:
				# Followup & Other, TPS, blank → Followup & Other Visits column
				bucket["followup"] += 1
		elif vtype == "Meeting":
			bucket["meetings"] += 1
		elif vtype == "M&E":
			status = (row.get("me_activity_status") or "").strip().lower().replace("-", "")
			if status == "active":
				bucket["active"] += 1
			elif status in ("inactive", "in active"):
				bucket["inactive"] += 1
			else:
				# unspecified M&E still counted as active for visibility
				bucket["active"] += 1
		elif vtype == "Training":
			bucket["schools"] += cint(row.get("schools") or 0)
			bucket["participants"] += cint(row.get("participants") or 0)

		if row.get("visit_day"):
			bucket["_days"].add(str(row.visit_day))

	for key, bucket in stats.items():
		bucket["visited_days"] = len(bucket.pop("_days"))

	return stats


def _resolve_staff_key(row, index):
	vtype = row.get("type") or ""
	candidates = [row.get("owner")]
	if vtype == "Marketing":
		candidates.insert(0, row.get("visit_by"))
	elif vtype == "M&E":
		candidates.insert(0, row.get("me_visit_by"))
	elif vtype == "Meeting":
		candidates.insert(0, row.get("mt_visit_by"))
	elif vtype == "Training":
		candidates.insert(0, row.get("training_entry_filled_by"))
		candidates.insert(1, row.get("training_trainer_name"))

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
			AND docstatus < 2
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


def _compute_score(staff, from_date, to_date, region, expected_points):
	"""KPI score for the period (same points model as SME Target Base)."""
	# Prefer employee name for Field Visit free-text matching; also try user_id
	staff_token = staff.get("employee_name") or staff.get("user_id") or ""
	actuals = _count_actuals(from_date, to_date, staff_token)
	# If name match returned nothing and we have user_id, try owner email
	if not any(actuals.values()) and staff.get("user_id") and staff.get("user_id") != staff_token:
		actuals = _count_actuals(from_date, to_date, staff["user_id"])

	score = 0.0
	for activity in KPI_ACTIVITIES:
		cfg = (activity.get("targets") or {}).get(region) or {}
		points = _points_for_scoring(cfg)
		score += flt(actuals.get(activity["metric"], 0)) * points

	pct = (score / expected_points * 100) if expected_points else 0
	return flt(score, 2), flt(pct, 2)
