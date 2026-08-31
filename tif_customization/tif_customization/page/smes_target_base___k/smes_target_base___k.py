import json

import frappe
from frappe import _
from frappe.utils import cint, flt, get_first_day, get_last_day, getdate

from tif_customization.tif_customization.api.field_visit_drilldown import get_visit_type_breakdown
from tif_customization.tif_customization.field_visit_permissions import staff_match_sql, visit_day_sql
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
	officer_meta = _resolve_field_officer(staff)
	# Prefer explicit region filter, else officer Type/Division from Field Officer
	region = (filters.get("region") or "").strip().lower()
	if region not in REGION_KEYS:
		region = (officer_meta or {}).get("region") or ""
	if region not in REGION_KEYS:
		region = "karachi"

	# Expand staff match tokens (name + user email) for Field Visit ownership
	staff_tokens = _staff_match_tokens(staff, officer_meta)

	actuals = _count_actuals(from_date, to_date, staff, staff_tokens=staff_tokens)
	activity_rows = _build_activity_rows(actuals, working_days)
	region_totals = _build_region_totals(activity_rows, working_days)

	fiscal_by_region = {
		rk: _build_fiscal_month_scores(staff, fiscal_year_start, rk, working_days, staff_tokens=staff_tokens)
		for rk in REGION_KEYS
	}

	# Increment tier uses the officer's assigned region (Excel sheet type)
	focus_percent = (region_totals.get(region) or {}).get("percent") or 0
	visit_bd = get_visit_type_breakdown(from_date, to_date, staff)

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
		"focus_region": region,
		"focus_region_label": REGION_LABELS.get(region, region),
		"officer": officer_meta,
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
		"staff_label": _staff_label(staff, officer_meta),
		"from_date": str(from_date),
		"to_date": str(to_date),
		"fiscal_year_start": fiscal_year_start,
		"fiscal_year_label": f"{fiscal_year_start}-{str(fiscal_year_start + 1)[-2:]}",
		"working_days": working_days,
		"fiscal_by_region": fiscal_by_region,
		"increment_scale": INCREMENT_SCALE,
		"increment_tier": _increment_tier(focus_percent),
		"visit_total": visit_bd.get("total") or 0,
		"visit_breakdown": visit_bd.get("breakdown") or [],
		"footnotes": [
			_("* Model School A: Affiliated with at least one Program of 3 departments."),
			_("** Model School B: Affiliated with at least one Program of 2 departments."),
			_("Total expected target points depend on total number of working days."),
			_("Officer Type / Division selects which Excel sheet targets apply (Karachi / Urban / Rural)."),
			_("Visits is the total of every Field Visit type. Click any Act number to see those documents."),
		],
		"reward_note": _("Highest % Achiever {0}-{1}: Cash Reward with Shield").format(
			fiscal_year_start, fiscal_year_start + 1
		),
	}


def _resolve_field_officer(staff):
	if not staff or not frappe.db.exists("DocType", "Field Officer"):
		return None
	from tif_customization.tif_customization.doctype.field_officer.field_officer import get_officer_region

	meta = get_officer_region(staff_name=staff)
	if not meta or not meta.get("officer"):
		return None
	return meta


def _staff_match_tokens(staff, officer_meta=None):
	from tif_customization.tif_customization.field_visit_permissions import expand_staff_tokens

	tokens = set(expand_staff_tokens(staff))
	if officer_meta:
		for key in ("name", "user", "officer"):
			val = (officer_meta.get(key) or "").strip()
			if val:
				tokens.update(expand_staff_tokens(val))
	return [t for t in tokens if t]


def _staff_label(staff, officer_meta=None):
	if officer_meta and officer_meta.get("name"):
		div = officer_meta.get("division") or ""
		return f"{officer_meta['name']}" + (f" ({div})" if div else "")
	if not staff:
		return _("All Field Staff")
	return staff



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
	"""Prefer Active Field Officers (with Type/Division + User); fall back to visit names."""
	txt = (txt or "").strip()
	params = {}
	txt_filter = ""
	if txt:
		txt_filter = "AND (fo.name1 LIKE %(txt)s OR fo.user LIKE %(txt)s OR fo.division LIKE %(txt)s)"
		params["txt"] = f"%{txt}%"

	officers = []
	if frappe.db.exists("DocType", "Field Officer"):
		officers = frappe.db.sql(
			f"""
			SELECT fo.name1 AS value, fo.user, fo.division, fo.employee
			FROM `tabField Officer` fo
			WHERE fo.status = 'Active'
			  AND IFNULL(fo.name1, '') != ''
			  {txt_filter}
			ORDER BY fo.name1
			LIMIT 50
			""",
			params,
			as_dict=True,
		)

	if officers:
		return [
			{
				"value": r.value,
				"description": " · ".join(
					[x for x in [r.division, r.user, r.employee] if x]
				),
			}
			for r in officers
		]

	params2 = {}
	txt_filter2 = ""
	if txt:
		txt_filter2 = "AND staff_name LIKE %(txt)s"
		params2["txt"] = f"%{txt}%"

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
		{txt_filter2}
		ORDER BY staff_name
		LIMIT 50
		""",
		params2,
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


def _staff_filter_sql(staff_tokens=None):
	"""Match visit staff fields against any of the officer name/user tokens."""
	if not staff_tokens:
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
	# Token list match (name + linked user)
	return """
		AND (
			LOWER(TRIM(IFNULL(visit_by, ''))) IN %(staff_tokens)s
			OR LOWER(TRIM(IFNULL(me_visit_by, ''))) IN %(staff_tokens)s
			OR LOWER(TRIM(IFNULL(mt_visit_by, ''))) IN %(staff_tokens)s
			OR LOWER(TRIM(IFNULL(training_trainer_name, ''))) IN %(staff_tokens)s
			OR LOWER(TRIM(IFNULL(training_entry_filled_by, ''))) IN %(staff_tokens)s
			OR LOWER(TRIM(IFNULL(owner, ''))) IN %(staff_tokens)s
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


def _count_actuals(from_date, to_date, staff, staff_tokens=None, submitted_only=False):
	tokens = staff_tokens or ([staff] if staff else [])
	staff_params = {
		"from_date": from_date,
		"to_date": to_date,
		"staff": staff or None,
		"staff_like": f"%{staff}%" if staff else "%",
		"staff_tokens": tuple(t.lower() for t in tokens) if tokens else ("",),
	}
	staff_sql = _staff_filter_sql(tokens if staff else None)

	counts = {a["metric"]: 0 for a in KPI_ACTIVITIES}

	visit_day = visit_day_sql("fv")
	staff_match = staff_match_sql("fv", "staff_tokens") if staff else "AND 1=1"
	ds = "docstatus = 1" if submitted_only else "docstatus < 2"
	ds_fv = f"fv.{ds}"

	# Same universe as Field Staff Report: every Field Visit in the date range.
	counts["visits"] = _scalar_count(
		f"""
		SELECT COUNT(*) FROM `tabField Visit` fv
		WHERE {ds_fv}
		AND {visit_day} BETWEEN %(from_date)s AND %(to_date)s
		{"AND " + staff_match if staff else ""}
		""",
		staff_params,
	)

	counts["half_day_workshop"] = _scalar_count(
		f"""
		SELECT COUNT(*) FROM `tabField Visit`
		WHERE {ds} AND type = 'Training'
		AND {_visit_date_expr('Training')} BETWEEN %(from_date)s AND %(to_date)s
		AND LOWER(COALESCE(training_session_category, '')) LIKE '%%half%%'
		{staff_sql}
		""",
		staff_params,
	)

	counts["full_day_session"] = _scalar_count(
		f"""
		SELECT COUNT(*) FROM `tabField Visit`
		WHERE {ds} AND type = 'Training'
		AND {_visit_date_expr('Training')} BETWEEN %(from_date)s AND %(to_date)s
		AND LOWER(COALESCE(training_session_category, '')) NOT LIKE '%%half%%'
		{staff_sql}
		""",
		staff_params,
	)

	counts["meeting_ulama"] = _scalar_count(
		f"""
		SELECT COUNT(*) FROM `tabField Visit`
		WHERE {ds} AND type = 'Marketing'
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
		WHERE {ds} AND type = 'M&E'
		AND {_visit_date_expr('M&E')} BETWEEN %(from_date)s AND %(to_date)s
		AND COALESCE(me_teachers_training_session, 0) = 1
		{staff_sql}
		""",
		staff_params,
	)

	counts["headoffice_visit"] = _scalar_count(
		f"""
		SELECT COUNT(*) FROM `tabField Visit`
		WHERE {ds}
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
		SELECT COUNT(*) FROM `tabField Visit` fv
		WHERE {ds_fv}
		AND fv.type IN ('Other', 'Academic / Other Official Tasks')
		AND {visit_day} BETWEEN %(from_date)s AND %(to_date)s
		{"AND " + staff_match if staff else ""}
		""",
		staff_params,
	)

	counts["other_official"] = 0

	counts["new_school_registration"] = _scalar_count(
		f"""
		SELECT COUNT(*) FROM `tabField Visit`
		WHERE {ds} AND type = 'Marketing'
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
		WHERE {ds} AND type = 'Training'
		AND {_visit_date_expr('Training')} BETWEEN %(from_date)s AND %(to_date)s
		{staff_sql}
		""",
		staff_params,
	)

	counts["co_curricular"] = _scalar_count(
		f"""
		SELECT COUNT(*) FROM `tabField Visit`
		WHERE {ds} AND type = 'Marketing'
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


def _build_fiscal_month_scores(staff, fiscal_year_start, region, working_days, staff_tokens=None):
	region_summary = REGION_SUMMARY.get(region, REGION_SUMMARY["karachi"])
	expected = working_days * region_summary["per_day_target_points"]
	results = []

	for month_num, short_label in FISCAL_MONTHS:
		year = fiscal_year_start if month_num >= 7 else fiscal_year_start + 1
		from_date = get_first_day(f"{year}-{month_num:02d}-01")
		to_date = get_last_day(from_date)
		actuals = _count_actuals(from_date, to_date, staff, staff_tokens=staff_tokens)
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
