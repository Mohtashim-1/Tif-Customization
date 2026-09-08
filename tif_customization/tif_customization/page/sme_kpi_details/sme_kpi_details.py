# Copyright (c) 2026, The Ilm Foundation and contributors
# License: MIT
"""SME KPI Details — activity (70%) + outcome (30%) from Field Visit."""

from __future__ import annotations

import json

import frappe
from frappe import _
from frappe.utils import add_days, cint, flt, get_first_day, get_last_day, getdate, today

from tif_customization.tif_customization.api.field_visit_drilldown import get_visit_type_breakdown
from tif_customization.tif_customization.doctype.reporting.reporting import (
	_gazetted_holiday_dates,
	_leave_dates_by_employee,
)
from tif_customization.tif_customization.field_visit_permissions import (
	expand_staff_tokens,
	staff_match_sql,
	visit_day_sql,
)
from tif_customization.tif_customization.page.sme_kpi_sheet.sme_kpi_sheet import (
	SHEET_META,
	_build_rows,
	_sheet_actuals,
)
from tif_customization.tif_customization.page.smes_target_base___k.smes_target_base_kpi_config import (
	FISCAL_MONTHS,
	INCREMENT_SCALE,
)
from tif_customization.tif_customization.page.smes_target_base___k.smes_target_base___k import (
	_fiscal_year_start,
	_increment_tier,
	_resolve_field_officer,
	_staff_match_tokens,
	get_staff_options as _get_staff_options,
)

ACTIVITY_WEIGHT = 0.70
OUTCOME_WEIGHT = 0.30

# Yearly compulsory mins from KPI Details policy (all areas)
OUTCOME_TARGETS = (
	{"key": "enrolment", "label": _("Enrolment of participants"), "target": 50, "metric": "enrolment"},
	{"key": "co_curricular", "label": _("Quiz / co-curricular activities"), "target": 1, "metric": "co_curricular"},
	{
		"key": "new_schools",
		"label": _("New schools (distinct, from school / field visits)"),
		"target": 24,
		"metric": "new_schools",
	},
	{
		"key": "workshop_registration",
		"label": _("Workshop participants"),
		"target": 148,
		"metric": "workshop_registration",
	},
	{"key": "volunteers", "label": _("Volunteers enrolled"), "target": 25, "metric": "volunteers"},
	{"key": "model_school_a", "label": _("Model School A"), "target": 6, "metric": "model_school_a"},
	{"key": "model_school_b", "label": _("Model School B"), "target": 12, "metric": "model_school_b"},
)

ACTIVITY_KEYS = {
	"visits",
	"half_day_workshop",
	"full_day_session",
	"meeting_ulama",
	"teachers_training_meeting",
	"headoffice_visit",
	"academic_task",
	"other_official",
}

NEW_SCHOOL_SQL = """
	fv.type IN ('Marketing', 'M&E', 'Joint Visit with SME')
	AND (
		(fv.type = 'Marketing' AND fv.marketing_visit_category = 'New')
		OR fv.qps_affiliated = 'Yes - Newly Registered'
		OR fv.tps_affiliated = 'Yes - Newly Registered'
		OR fv.cee_affiliated = 'Yes - Newly Registered'
	)
"""

CO_CURRICULAR_SQL = """
	(
		fv.type = 'Co-curricular Activity'
		OR (fv.type = 'Marketing' AND fv.marketing_visit_category = 'TPS Visits')
	)
"""


@frappe.whitelist()
def get_report_data(filters=None):
	if not frappe.has_permission("Field Visit", "read"):
		frappe.throw(_("You are not permitted to view Field Visit data."), frappe.PermissionError)

	filters = _parse(filters)
	from_date, to_date = _dates(filters)
	staff = (filters.get("staff") or "").strip()
	fy_start_year = cint(filters.get("fiscal_year_start") or _fiscal_year_start(to_date.year, to_date.month))
	ytd_from = getdate(f"{fy_start_year}-07-01")
	if ytd_from > to_date:
		ytd_from = from_date

	if staff:
		detail = _staff_detail(staff, from_date, to_date, ytd_from, filters, include_months=True)
		return {
			"mode": "detail",
			"from_date": str(from_date),
			"to_date": str(to_date),
			"ytd_from": str(ytd_from),
			"fiscal_year_label": f"{fy_start_year}-{str(fy_start_year + 1)[-2:]}",
			"activity_weight": ACTIVITY_WEIGHT,
			"outcome_weight": OUTCOME_WEIGHT,
			**detail,
		}

	rows = []
	officers = _active_officers()
	for fo in officers:
		name = (fo.get("name1") or fo.get("user") or "").strip()
		if not name:
			continue
		try:
			row = _staff_detail(
				name, from_date, to_date, ytd_from, filters, officer_row=fo, include_months=False
			)
		except Exception:
			frappe.log_error(frappe.get_traceback(), "SME KPI Details staff row")
			continue
		rows.append(
			{
				"staff": name,
				"staff_label": row.get("staff_label") or name,
				"division": row.get("division") or "",
				"sheet": row.get("sheet"),
				"sheet_label": row.get("sheet_label"),
				"employee": row.get("employee"),
				"working_days": row.get("working_days"),
				"per_day_points": row.get("per_day_points"),
				"activity_actual": row.get("activity_actual"),
				"activity_target": row.get("activity_target"),
				"activity_pct": row.get("activity_pct"),
				"outcome_pct": row.get("outcome_pct"),
				"overall_pct": row.get("overall_pct"),
				"new_schools": _outcome_actual(row, "new_schools"),
				"enrolment": _outcome_actual(row, "enrolment"),
				"co_curricular": _outcome_actual(row, "co_curricular"),
			}
		)

	rows.sort(key=lambda r: (-flt(r.get("overall_pct") or 0), (r.get("staff_label") or "").lower()))
	return {
		"mode": "summary",
		"from_date": str(from_date),
		"to_date": str(to_date),
		"ytd_from": str(ytd_from),
		"fiscal_year_label": f"{fy_start_year}-{str(fy_start_year + 1)[-2:]}",
		"activity_weight": ACTIVITY_WEIGHT,
		"outcome_weight": OUTCOME_WEIGHT,
		"rows": rows,
		"footnotes": _footnotes(),
	}


@frappe.whitelist()
def get_staff_options(txt=""):
	return _get_staff_options(txt=txt)


@frappe.whitelist()
def get_working_days(filters=None):
	filters = _parse(filters)
	from_date, to_date = _dates(filters)
	staff = (filters.get("staff") or "").strip()
	officer = _officer_full(staff) if staff else None
	return _working_days_info(from_date, to_date, (officer or {}).get("employee"))


def _staff_detail(staff, from_date, to_date, ytd_from, filters, officer_row=None, include_months=False):
	officer = _officer_full(staff, officer_row=officer_row)
	sheet = (filters.get("sheet") or "").strip().lower()
	if sheet not in SHEET_META:
		sheet = (officer or {}).get("region") or "karachi"
		if sheet == "punjab":
			sheet = "urban"
	if sheet not in SHEET_META:
		sheet = "karachi"

	tokens = _staff_match_tokens(staff, officer)
	if officer:
		emp = officer.get("employee")
		if emp:
			tokens = list({*tokens, *expand_staff_tokens(emp)})
		user = officer.get("user")
		if user:
			tokens = list({*tokens, *expand_staff_tokens(user)})

	wd_info = _working_days_info(from_date, to_date, (officer or {}).get("employee"))
	working_days = cint(filters.get("working_days") or 0) or wd_info["working_days"]

	period_actuals = _enriched_actuals(from_date, to_date, staff, tokens)
	ytd_actuals = _enriched_actuals(ytd_from, to_date, staff, tokens)

	meta = SHEET_META[sheet]
	rows, monthly_total, _yearly_total = _build_rows(sheet, period_actuals)
	activity_rows = [r for r in rows if r.get("key") in ACTIVITY_KEYS]

	activity_target = working_days * meta["per_day_points"]
	activity_actual = flt(monthly_total, 2)
	activity_pct = (activity_actual / activity_target * 100) if activity_target else 0.0

	outcome_rows = []
	outcome_pcts = []
	for cfg in OUTCOME_TARGETS:
		actual = flt(ytd_actuals.get(cfg["key"], 0))
		target = flt(cfg["target"])
		pct = min(100.0, actual / target * 100) if target else 0.0
		outcome_pcts.append(pct)
		outcome_rows.append(
			{
				"key": cfg["key"],
				"label": cfg["label"],
				"metric": cfg["metric"],
				"target": target,
				"actual": actual,
				"percent": flt(pct, 2),
			}
		)
	outcome_pct = sum(outcome_pcts) / len(outcome_pcts) if outcome_pcts else 0.0
	overall_pct = ACTIVITY_WEIGHT * activity_pct + OUTCOME_WEIGHT * outcome_pct
	fy_start_year = cint(filters.get("fiscal_year_start") or _fiscal_year_start(to_date.year, to_date.month))

	months = []
	ytd_activity_actual = activity_actual
	ytd_activity_expected = activity_target
	yearly_target_score = 0.0
	if include_months:
		months, ytd_activity_actual, ytd_activity_expected, yearly_target_score = _fiscal_month_rows(
			staff, tokens, officer, sheet, fy_start_year
		)

	ytd_activity_pct = (
		(ytd_activity_actual / ytd_activity_expected * 100) if ytd_activity_expected else 0.0
	)
	yearly_achievement_pct = (
		(ytd_activity_actual / yearly_target_score * 100) if yearly_target_score else 0.0
	)
	increment_tier = _increment_tier(overall_pct)

	visit_bd = get_visit_type_breakdown(from_date, to_date, staff)

	return {
		"staff": staff,
		"staff_label": (officer or {}).get("name") or staff,
		"officer": officer.get("officer") if officer else None,
		"employee": (officer or {}).get("employee"),
		"division": (officer or {}).get("division") or "",
		"sheet": sheet,
		"sheet_label": meta["excel_title"],
		"theme": meta["theme"],
		"per_day_points": meta["per_day_points"],
		"working_days": working_days,
		"working_days_info": wd_info,
		"activity_rows": activity_rows,
		"activity_actual": flt(activity_actual, 2),
		"activity_target": flt(activity_target, 2),
		"activity_pct": flt(activity_pct, 2),
		"outcome_rows": outcome_rows,
		"outcome_pct": flt(outcome_pct, 2),
		"overall_pct": flt(overall_pct, 2),
		"months": months,
		"ytd_activity_actual": flt(ytd_activity_actual, 2),
		"ytd_activity_expected": flt(ytd_activity_expected, 2),
		"ytd_activity_pct": flt(ytd_activity_pct, 2),
		"yearly_target_score": flt(yearly_target_score, 2),
		"yearly_achievement_pct": flt(yearly_achievement_pct, 2),
		"increment_scale": INCREMENT_SCALE,
		"increment_tier": increment_tier,
		"increment_achieved": (increment_tier or {}).get("increment") or "",
		"fiscal_year_label": f"{fy_start_year}-{str(fy_start_year + 1)[-2:]}",
		"reward_note": _("Highest % Achiever {0}-{1}: Cash Reward with Shield").format(
			fy_start_year, fy_start_year + 1
		),
		"reward_new_schools": _("Highest Registration of New Schools: Cash Reward"),
		"visit_total": visit_bd.get("total") or 0,
		"visit_breakdown": visit_bd.get("breakdown") or [],
		"footnotes": _footnotes(),
	}


def _enriched_actuals(from_date, to_date, staff, tokens):
	actuals = _sheet_actuals(from_date, to_date, staff, tokens)
	actuals["co_curricular"] = _visit_count(from_date, to_date, tokens, CO_CURRICULAR_SQL)
	actuals["new_schools"] = _distinct_schools(from_date, to_date, tokens, NEW_SCHOOL_SQL)
	actuals["new_school_registration"] = actuals["new_schools"]
	actuals["model_school_a"] = _distinct_schools(
		from_date, to_date, tokens, "fv.model_school LIKE '%%Model School A%%'"
	)
	actuals["model_school_b"] = _distinct_schools(
		from_date, to_date, tokens, "fv.model_school LIKE '%%Model School B%%'"
	)
	sum_participants = _training_participants(from_date, to_date, tokens)
	actuals["workshop_registration"] = max(cint(actuals.get("workshop_registration") or 0), sum_participants)
	return actuals


def _school_expr(alias="fv"):
	a = alias
	return f"""LOWER(TRIM(COALESCE(
		NULLIF(TRIM({a}.school_name), ''),
		NULLIF(TRIM({a}.me_school_name), ''),
		NULLIF(TRIM({a}.training_venue_name), '')
	)))"""


def _staff_params(from_date, to_date, tokens):
	params = {"from_date": from_date, "to_date": to_date}
	if tokens:
		params["staff_tokens"] = tuple(t.lower() for t in tokens) or ("__none__",)
	return params


def _staff_where(tokens):
	if not tokens:
		return "1=1"
	return staff_match_sql("fv", "staff_tokens")


def _visit_count(from_date, to_date, tokens, extra_sql):
	visit_day = visit_day_sql("fv")
	params = _staff_params(from_date, to_date, tokens)
	return cint(
		frappe.db.sql(
			f"""
			SELECT COUNT(*)
			FROM `tabField Visit` fv
			WHERE fv.docstatus < 2
			  AND {visit_day} BETWEEN %(from_date)s AND %(to_date)s
			  AND {_staff_where(tokens)}
			  AND ({extra_sql})
			""",
			params,
		)[0][0]
		or 0
	)


def _distinct_schools(from_date, to_date, tokens, extra_sql):
	visit_day = visit_day_sql("fv")
	school = _school_expr("fv")
	params = _staff_params(from_date, to_date, tokens)
	return cint(
		frappe.db.sql(
			f"""
			SELECT COUNT(*) FROM (
				SELECT {school} AS school
				FROM `tabField Visit` fv
				WHERE fv.docstatus < 2
				  AND {visit_day} BETWEEN %(from_date)s AND %(to_date)s
				  AND {_staff_where(tokens)}
				  AND ({extra_sql})
				  AND {school} IS NOT NULL
				  AND {school} != ''
				GROUP BY 1
			) t
			""",
			params,
		)[0][0]
		or 0
	)


def _training_participants(from_date, to_date, tokens):
	visit_day = visit_day_sql("fv")
	params = _staff_params(from_date, to_date, tokens)
	return cint(
		frappe.db.sql(
			f"""
			SELECT COALESCE(SUM(COALESCE(fv.training_no_of_participants, 0)), 0)
			FROM `tabField Visit` fv
			WHERE fv.docstatus < 2
			  AND fv.type = 'Training'
			  AND {visit_day} BETWEEN %(from_date)s AND %(to_date)s
			  AND {_staff_where(tokens)}
			""",
			params,
		)[0][0]
		or 0
	)


def _working_days_info(from_date, to_date, employee=None, cutoff_today=True):
	start = getdate(from_date)
	end = getdate(to_date)
	if cutoff_today:
		cutoff = getdate(today())
		if end > cutoff:
			end = cutoff
	if start > end:
		return {
			"working_days": 0,
			"calendar_days": 0,
			"sundays": 0,
			"gazetted": 0,
			"leave_days": 0,
			"employee": employee,
		}

	holidays = _gazetted_holiday_dates(start, end)
	leave = set()
	if employee:
		leave = (_leave_dates_by_employee(start, end, [employee]) or {}).get(employee) or set()

	sundays = gazetted = leave_days = working = 0
	calendar = 0
	cur = start
	while cur <= end:
		calendar += 1
		is_sunday = cur.weekday() == 6
		is_holiday = cur in holidays
		is_leave = cur in leave
		if is_sunday:
			sundays += 1
		elif is_holiday:
			gazetted += 1
		elif is_leave:
			leave_days += 1
		else:
			working += 1
		cur = add_days(cur, 1)

	return {
		"working_days": working,
		"calendar_days": calendar,
		"sundays": sundays,
		"gazetted": gazetted,
		"leave_days": leave_days,
		"employee": employee,
	}


def _officer_full(staff, officer_row=None):
	if officer_row:
		return _officer_from_row(officer_row)
	meta = _resolve_field_officer(staff)
	if not meta or not meta.get("officer"):
		return meta
	row = frappe.db.get_value(
		"Field Officer",
		meta["officer"],
		["name", "name1", "user", "employee", "division", "status"],
		as_dict=True,
	)
	if not row:
		return meta
	return _officer_from_row(row)


def _officer_from_row(row):
	from tif_customization.tif_customization.doctype.field_officer.field_officer import division_to_region

	region = division_to_region(row.get("division")) or "karachi"
	if region == "punjab":
		region = "urban"
	return {
		"officer": row.get("name") or row.get("officer"),
		"name": row.get("name1") or row.get("name"),
		"user": row.get("user"),
		"employee": row.get("employee"),
		"division": row.get("division"),
		"region": region,
	}


def _active_officers():
	if not frappe.db.exists("DocType", "Field Officer"):
		return []
	return frappe.get_all(
		"Field Officer",
		filters={"status": "Active"},
		fields=["name", "name1", "user", "employee", "division"],
		order_by="name1 asc",
	)


def _outcome_actual(detail, key):
	for row in detail.get("outcome_rows") or []:
		if row.get("key") == key:
			return cint(row.get("actual") or 0)
	return 0


def _fiscal_month_rows(staff, tokens, officer, sheet, fy_start):
	"""Jul–Jun activity points / % using each month's own working days."""
	meta = SHEET_META[sheet]
	per_day = meta["per_day_points"]
	employee = (officer or {}).get("employee")
	today_d = getdate(today())
	out = []
	ytd_actual = 0.0
	ytd_expected = 0.0
	year_expected = 0.0

	for month_num, short in FISCAL_MONTHS:
		year = fy_start if month_num >= 7 else fy_start + 1
		start = get_first_day(f"{year}-{month_num:02d}-01")
		end = get_last_day(start)
		wd_full = _working_days_info(start, end, employee, cutoff_today=False)
		year_expected += wd_full["working_days"] * per_day
		elapsed = start <= today_d
		row = {
			"month": month_num,
			"year": year,
			"label": f"{short}-{str(year)[-2:]}",
			"score": None,
			"percent": None,
			"expected": None,
			"working_days": wd_full["working_days"],
			"elapsed": elapsed,
		}
		if elapsed:
			actual_end = end if end <= today_d else today_d
			wd = _working_days_info(start, actual_end, employee, cutoff_today=True)
			expected = wd["working_days"] * per_day
			actuals = _enriched_actuals(start, actual_end, staff, tokens)
			_rows, monthly_total, _yearly = _build_rows(sheet, actuals)
			score = flt(monthly_total, 2)
			percent = (score / expected * 100) if expected else 0.0
			row.update(
				{
					"score": score,
					"percent": flt(percent, 2),
					"expected": flt(expected, 2),
					"working_days": wd["working_days"],
				}
			)
			ytd_actual += score
			ytd_expected += expected
		out.append(row)

	return out, ytd_actual, ytd_expected, year_expected


def _footnotes():
	return [
		_("Working days = calendar days minus Sunday, gazetted holidays, and approved leave."),
		_("Activity % = period points ÷ (working days × daily points). Daily points: Karachi 6, Urban 5, Rural 4."),
		_("Outcome % = average of yearly compulsory mins (YTD). New schools are distinct school names from Marketing New visits and M&E / Joint visits marked Newly Registered — not School master records."),
		_("Overall % = 70% activity + 30% outcome. Annual increment band uses Overall %."),
		_("* Model School A: Affiliated with at least one Program of 3 departments."),
		_("** Model School B: Affiliated with at least one Program of 2 departments."),
		_("*** Total expected target points depend on total no of working days."),
	]


def _parse(filters):
	if isinstance(filters, str):
		try:
			return json.loads(filters) or {}
		except Exception:
			return {}
	return filters or {}


def _dates(filters):
	today_d = getdate()
	from_date = getdate(filters.get("from_date") or today_d.replace(day=1))
	to_date = getdate(filters.get("to_date") or today_d)
	if from_date > to_date:
		frappe.throw(_("From Date cannot be after To Date."))
	return from_date, to_date
