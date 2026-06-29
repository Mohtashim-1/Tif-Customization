import json

import frappe
from frappe import _
from frappe.utils import cint, flt, get_first_day, get_last_day, getdate

from tif_customization.tif_customization.page.smes_target_base___k.smes_target_base_kpi_config import (
	FISCAL_MONTHS,
	INCREMENT_SCALE,
	KPI_ACTIVITIES,
	REGION_KEYS,
	REGION_LABELS,
	REGION_SUMMARY,
	WORKING_DAYS_DEFAULT,
)


@frappe.whitelist()
def get_report_data(filters=None):
	filters = _parse_filters(filters)
	if not frappe.has_permission("Field Visit", "read"):
		frappe.throw(_("You are not permitted to view Field Visit data."))

	working_days = cint(filters.get("working_days") or WORKING_DAYS_DEFAULT)
	from_date, to_date = _resolve_date_range(filters)
	fiscal_year_start = cint(
		filters.get("fiscal_year_start") or _fiscal_year_start(to_date.year, to_date.month)
	)
	staff = (filters.get("staff") or "").strip()

	actuals = _count_actuals(from_date, to_date, staff)
	activity_rows = _build_activity_rows(actuals, working_days)
	region_totals = _build_region_totals(activity_rows, working_days)

	fiscal_by_region = {
		rk: _build_fiscal_month_scores(staff, fiscal_year_start, rk, working_days)
		for rk in REGION_KEYS
	}

	# Increment tier reference uses Karachi column (same as spreadsheet default region).
	karachi_percent = (region_totals.get("karachi") or {}).get("percent") or 0

	return {
		"foundation_title": _("The ILM Foundation"),
		"sheet_title": _("SMEs Target Base - KPIs"),
		"regions": [
			{
				"key": rk,
				"label": REGION_LABELS[rk],
				"theme": "blue" if rk in ("punjab", "urban") else "tan",
			}
			for rk in REGION_KEYS
		],
		"per_day_points_row": {
			rk: REGION_SUMMARY[rk]["per_day_target_points"] for rk in REGION_KEYS
		},
		"activity_rows": activity_rows,
		"summary_rows": [
			{
				"label": _("No of Working Days"),
				"values": {rk: working_days for rk in REGION_KEYS},
			},
			{
				"label": _("Per day Target Points"),
				"values": {rk: REGION_SUMMARY[rk]["per_day_target_points"] for rk in REGION_KEYS},
			},
			{
				"label": _("Total Expected Targets Points Monthly ***"),
				"values": {rk: region_totals[rk]["expected"] for rk in REGION_KEYS},
				"bold": True,
			},
			{
				"label": _("Total Achieve Points Monthly"),
				"values": {rk: region_totals[rk]["achieved"] for rk in REGION_KEYS},
				"bold": True,
			},
			{
				"label": _("Percentage"),
				"values": {rk: region_totals[rk]["percent"] for rk in REGION_KEYS},
				"bold": True,
				"suffix": "%",
			},
		],
		"staff": staff,
		"staff_label": _staff_label(staff),
		"from_date": str(from_date),
		"to_date": str(to_date),
		"fiscal_year_start": fiscal_year_start,
		"fiscal_year_label": f"{fiscal_year_start}-{str(fiscal_year_start + 1)[-2:]}",
		"working_days": working_days,
		"fiscal_by_region": fiscal_by_region,
		"increment_scale": INCREMENT_SCALE,
		"increment_tier": _increment_tier(karachi_percent),
		"footnotes": [
			_("* Model School A: Affiliated with at least one Program of 3 departments."),
			_("** Model School B: Affiliated with at least one Program of 2 departments."),
			_("Total expected target points depend on total number of working days."),
		],
		"reward_note": _("Highest % Achiever {0}-{1}: Cash Reward with Shield").format(
			fiscal_year_start, fiscal_year_start + 1
		),
	}


def _build_activity_rows(actuals, working_days):
	rows = [
		{
			"key": "per_day_points",
			"label": _("Per Day Points to be achieved by each SME"),
			"category": "",
			"is_header": True,
			"regions": {
				rk: {
					"per_day_target": None,
					"points": REGION_SUMMARY[rk]["per_day_target_points"],
					"yearly": None,
					"actual": None,
					"achieved_points": None,
				}
				for rk in REGION_KEYS
			},
		}
	]

	for activity in KPI_ACTIVITIES:
		regions = {}
		for rk in REGION_KEYS:
			cfg = (activity.get("targets") or {}).get(rk) or {}
			per_day_target = _display_value(cfg.get("per_day_target"))
			points = _display_value(cfg.get("points"))
			scoring_points = _points_for_scoring(cfg)
			actual = flt(actuals.get(activity["metric"], 0))
			regions[rk] = {
				"per_day_target": per_day_target,
				"points": points,
				"yearly": cfg.get("yearly"),
				"actual": actual,
				"achieved_points": actual * scoring_points,
			}
		rows.append(
			{
				"key": activity["key"],
				"label": activity["label"],
				"category": activity["category"],
				"is_header": False,
				"regions": regions,
			}
		)
	return rows


def _build_region_totals(activity_rows, working_days):
	totals = {}
	for rk in REGION_KEYS:
		achieved = 0.0
		for row in activity_rows:
			if row.get("is_header"):
				continue
			achieved += flt((row.get("regions") or {}).get(rk, {}).get("achieved_points"))
		expected = working_days * REGION_SUMMARY[rk]["per_day_target_points"]
		totals[rk] = {
			"expected": flt(expected),
			"achieved": flt(achieved),
			"percent": flt((achieved / expected * 100) if expected else 0, 2),
		}
	return totals


@frappe.whitelist()
def get_staff_options(txt=""):
	txt = (txt or "").strip()
	params = {}
	txt_filter = ""
	if txt:
		txt_filter = "AND staff_name LIKE %(txt)s"
		params["txt"] = f"%{txt}%"

	rows = frappe.db.sql(
		f"""
		SELECT DISTINCT staff_name FROM (
			SELECT NULLIF(TRIM(visit_by), '') AS staff_name FROM `tabField Visit` WHERE docstatus < 2
			UNION
			SELECT NULLIF(TRIM(me_visit_by), '') FROM `tabField Visit` WHERE docstatus < 2
			UNION
			SELECT NULLIF(TRIM(training_trainer_name), '') FROM `tabField Visit` WHERE docstatus < 2
			UNION
			SELECT NULLIF(TRIM(training_entry_filled_by), '') FROM `tabField Visit` WHERE docstatus < 2
			UNION
			SELECT NULLIF(TRIM(owner), '') FROM `tabField Visit` WHERE docstatus < 2
		) t
		WHERE staff_name IS NOT NULL AND staff_name != ''
		{txt_filter}
		ORDER BY staff_name
		LIMIT 50
		""",
		params,
		as_dict=True,
	)
	return [{"value": r.staff_name, "description": r.staff_name} for r in rows if r.staff_name]


def _parse_filters(filters):
	if isinstance(filters, str):
		try:
			return json.loads(filters) or {}
		except Exception:
			return {}
	return filters or {}


def _resolve_date_range(filters):
	today = getdate()
	from_raw = filters.get("from_date")
	to_raw = filters.get("to_date")

	if from_raw and to_raw:
		from_date = getdate(from_raw)
		to_date = getdate(to_raw)
	elif filters.get("month") and filters.get("year"):
		# backward compatibility
		year = cint(filters.get("year") or today.year)
		month = cint(filters.get("month") or today.month)
		from_date = get_first_day(f"{year}-{month:02d}-01")
		to_date = get_last_day(from_date)
	else:
		from_date = get_first_day(today)
		to_date = today

	if from_date > to_date:
		frappe.throw(_("From Date cannot be after To Date."))

	return from_date, to_date


def _fiscal_year_start(year, month):
	return year if month >= 7 else year - 1


def _fiscal_year_bounds(fy_start):
	start = getdate(f"{fy_start}-07-01")
	end = getdate(f"{fy_start + 1}-06-30")
	return start, end


def _staff_label(staff):
	if not staff:
		return _("All Field Staff")
	return staff


def _staff_filter_sql():
	return """
		AND (
			%(staff)s IS NULL OR %(staff)s = ''
			OR COALESCE(visit_by, '') = %(staff)s
			OR COALESCE(me_visit_by, '') = %(staff)s
			OR COALESCE(training_trainer_name, '') = %(staff)s
			OR COALESCE(training_entry_filled_by, '') = %(staff)s
			OR owner = %(staff)s
			OR COALESCE(visit_by, '') LIKE %(staff_like)s
			OR COALESCE(me_visit_by, '') LIKE %(staff_like)s
			OR COALESCE(training_trainer_name, '') LIKE %(staff_like)s
			OR COALESCE(training_entry_filled_by, '') LIKE %(staff_like)s
		)
	"""


def _visit_date_expr(type_field):
	if type_field == "Marketing":
		return "COALESCE(visit_date, DATE(timestamp))"
	if type_field == "M&E":
		return "COALESCE(me_visit_date, me_starting_date, DATE(me_timestamp))"
	if type_field == "Training":
		return "COALESCE(training_date, DATE(training_timestamp))"
	return "COALESCE(modified, creation)"


def _count_actuals(from_date, to_date, staff):
	staff_params = {
		"from_date": from_date,
		"to_date": to_date,
		"staff": staff or None,
		"staff_like": f"%{staff}%" if staff else "%",
	}
	staff_sql = _staff_filter_sql()

	counts = {a["metric"]: 0 for a in KPI_ACTIVITIES}

	# Visits: Marketing + M&E
	counts["visits"] = _scalar_count(
		f"""
		SELECT COUNT(*) FROM `tabField Visit`
		WHERE docstatus < 2 AND type IN ('Marketing', 'M&E')
		AND (
			(type = 'Marketing' AND {_visit_date_expr('Marketing')} BETWEEN %(from_date)s AND %(to_date)s)
			OR (type = 'M&E' AND {_visit_date_expr('M&E')} BETWEEN %(from_date)s AND %(to_date)s)
		)
		{staff_sql}
		""",
		staff_params,
	)

	counts["half_day_workshop"] = _scalar_count(
		f"""
		SELECT COUNT(*) FROM `tabField Visit`
		WHERE docstatus < 2 AND type = 'Training'
		AND {_visit_date_expr('Training')} BETWEEN %(from_date)s AND %(to_date)s
		AND LOWER(COALESCE(training_session_category, '')) LIKE '%%half%%'
		{staff_sql}
		""",
		staff_params,
	)

	counts["full_day_session"] = _scalar_count(
		f"""
		SELECT COUNT(*) FROM `tabField Visit`
		WHERE docstatus < 2 AND type = 'Training'
		AND {_visit_date_expr('Training')} BETWEEN %(from_date)s AND %(to_date)s
		AND LOWER(COALESCE(training_session_category, '')) NOT LIKE '%%half%%'
		{staff_sql}
		""",
		staff_params,
	)

	counts["meeting_ulama"] = _scalar_count(
		f"""
		SELECT COUNT(*) FROM `tabField Visit`
		WHERE docstatus < 2 AND type = 'Marketing'
		AND {_visit_date_expr('Marketing')} BETWEEN %(from_date)s AND %(to_date)s
		AND (
			LOWER(COALESCE(meeting_with, '')) LIKE '%%ulama%%'
			OR LOWER(COALESCE(meeting_with, '')) LIKE '%%educationist%%'
			OR LOWER(COALESCE(designation, '')) LIKE '%%ulama%%'
		)
		{staff_sql}
		""",
		staff_params,
	)

	counts["teachers_training_meeting"] = _scalar_count(
		f"""
		SELECT COUNT(*) FROM `tabField Visit`
		WHERE docstatus < 2 AND type = 'M&E'
		AND {_visit_date_expr('M&E')} BETWEEN %(from_date)s AND %(to_date)s
		AND COALESCE(me_teachers_training_session, 0) = 1
		{staff_sql}
		""",
		staff_params,
	)

	counts["headoffice_visit"] = _scalar_count(
		f"""
		SELECT COUNT(*) FROM `tabField Visit`
		WHERE docstatus < 2
		AND (
			(type = 'Marketing' AND {_visit_date_expr('Marketing')} BETWEEN %(from_date)s AND %(to_date)s)
			OR (type = 'M&E' AND {_visit_date_expr('M&E')} BETWEEN %(from_date)s AND %(to_date)s)
		)
		AND (
			LOWER(COALESCE(reference, '')) LIKE '%%head%%office%%'
			OR LOWER(COALESCE(reference, '')) LIKE '%%regional office%%'
			OR LOWER(COALESCE(reference, '')) LIKE '%%out of station%%'
			OR LOWER(COALESCE(me_new_school_address, '')) LIKE '%%head%%office%%'
		)
		{staff_sql}
		""",
		staff_params,
	)

	counts["academic_task"] = _scalar_count(
		f"""
		SELECT COUNT(*) FROM `tabField Visit`
		WHERE docstatus < 2 AND type = 'Other'
		AND DATE(modified) BETWEEN %(from_date)s AND %(to_date)s
		{staff_sql}
		""",
		staff_params,
	)

	counts["other_official"] = 0

	counts["new_school_registration"] = _scalar_count(
		f"""
		SELECT COUNT(*) FROM `tabField Visit`
		WHERE docstatus < 2 AND type = 'Marketing'
		AND marketing_visit_category = 'New'
		AND {_visit_date_expr('Marketing')} BETWEEN %(from_date)s AND %(to_date)s
		{staff_sql}
		""",
		staff_params,
	)

	counts["workshop_registration"] = _scalar_count(
		f"""
		SELECT COALESCE(SUM(COALESCE(training_no_of_participants, 0)), 0)
		FROM `tabField Visit`
		WHERE docstatus < 2 AND type = 'Training'
		AND {_visit_date_expr('Training')} BETWEEN %(from_date)s AND %(to_date)s
		{staff_sql}
		""",
		staff_params,
	)

	counts["co_curricular"] = _scalar_count(
		f"""
		SELECT COUNT(*) FROM `tabField Visit`
		WHERE docstatus < 2 AND type = 'Marketing'
		AND marketing_visit_category = 'TPS Visits'
		AND {_visit_date_expr('Marketing')} BETWEEN %(from_date)s AND %(to_date)s
		{staff_sql}
		""",
		staff_params,
	)

	# Enrolment / model schools — no dedicated Field Visit fields yet
	counts["enrolment"] = 0
	counts["model_school_a"] = 0
	counts["model_school_b"] = 0

	return counts


def _scalar_count(query, params):
	return cint(frappe.db.sql(query, params)[0][0] or 0)


def _build_fiscal_month_scores(staff, fiscal_year_start, region, working_days):
	region_summary = REGION_SUMMARY.get(region, REGION_SUMMARY["karachi"])
	expected = working_days * region_summary["per_day_target_points"]
	results = []

	for month_num, short_label in FISCAL_MONTHS:
		year = fiscal_year_start if month_num >= 7 else fiscal_year_start + 1
		from_date = get_first_day(f"{year}-{month_num:02d}-01")
		to_date = get_last_day(from_date)
		actuals = _count_actuals(from_date, to_date, staff)
		score = 0.0
		for activity in KPI_ACTIVITIES:
			target_cfg = (activity.get("targets") or {}).get(region) or {}
			points = _points_for_scoring(target_cfg)
			score += flt(actuals.get(activity["metric"], 0)) * points
		pct = (score / expected * 100) if expected else 0
		results.append(
			{
				"month": month_num,
				"year": year,
				"label": f"{short_label}-{str(year)[-2:]}",
				"score": flt(score, 2),
				"percent": flt(pct, 2),
			}
		)

	return results


def _increment_tier(percent):
	for row in INCREMENT_SCALE:
		max_p = row.get("max_percent")
		if max_p is None:
			return row
		if percent < max_p:
			return row
	return INCREMENT_SCALE[-1]


def _display_value(value):
	if value in (None, "", 0, "0"):
		return None
	return value


def _points_for_scoring(cfg):
	if cfg.get("calc_points") not in (None, ""):
		return flt(cfg.get("calc_points"))

	points = cfg.get("points")
	if isinstance(points, str) and "-" in points:
		return flt(points.split("-")[-1])
	return flt(points)
