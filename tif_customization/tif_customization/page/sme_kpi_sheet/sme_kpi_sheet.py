# Copyright (c) 2026, The Ilm Foundation and contributors
# License: MIT
"""SME KPI Sheet — Excel replica of SMEs Target Base - KPIs (Karachi / Urban / Rural)."""

from __future__ import annotations

import json

import frappe
from frappe import _
from frappe.utils import cint, flt, get_first_day, get_last_day, getdate

from tif_customization.tif_customization.page.smes_target_base___k.smes_target_base___k import (
	_count_actuals,
	_fiscal_year_start,
	_resolve_field_officer,
	_staff_match_tokens,
	get_staff_options as _get_staff_options,
)

# Excel sheet keys → Field Officer division / region
SHEET_META = {
	"karachi": {
		"label": "Karachi",
		"excel_title": "Karachi",
		"per_day_points": 6,
		"theme": "tan",
	},
	"urban": {
		"label": "Urban Areas",
		"excel_title": "Other Province Urban Areas",
		"per_day_points": 5,
		"theme": "blue",
	},
	"rural": {
		"label": "Rural Areas",
		"excel_title": "Other Province Rural Areas",
		"per_day_points": 4,
		"theme": "tan",
	},
}

# Row scoring mode:
# - monthly: Monthly Points = actual * score_points  (Excel cols H)
# - yearly:  Yearly Points = (points / yearly_target) * actual  (Excel cols I)
# - monthly_fixed: Monthly Points = actual * fixed_points
# - none: no points

def _row(key, label, category, per_day, points, yearly, mode="monthly", score_points=None, highlight=None):
	return {
		"key": key,
		"label": label,
		"category": category,
		"per_day_target": per_day,
		"points": points,
		"yearly_target": yearly,
		"mode": mode,
		"score_points": score_points if score_points is not None else points,
		"highlight": highlight,  # e.g. "yellow" for volunteers
	}


SHEET_ROWS = {
	"karachi": [
		_row("visits", "Visits\n(Marketing, Monitoring, Follow up etc)", "Core Responsibility", 3, 2, "-"),
		_row("half_day_workshop", "Half Day Workshop", "Core Responsibility", 1, 6, 6),
		_row("full_day_session", "Full Day Session", "Core Responsibility", 1, 6, 2),
		_row("meeting_ulama", "Meeting with Ulama and Educationlist", "Core Responsibility", 2, 3, "-"),
		_row("teachers_training_meeting", "Teachers Training Meeting", "Core Responsibility", 2, 3, 12),
		_row(
			"headoffice_visit",
			"Headoffice / Regional Office / Out of Station Visit",
			"Core Responsibility",
			None,
			"2-6",
			1,
			mode="monthly_fixed",
			score_points=4,
		),
		_row("academic_task", "Academic Task", "Secondary Responsibility", 1, 6, "-"),
		_row(
			"other_official",
			"Other Official Tasks",
			"Secondary Responsibility",
			None,
			"2-6",
			"-",
			mode="monthly_fixed",
			score_points=4,
		),
		_row(
			"enrolment",
			"Enrolment of Participant in  ELP/ TECC/ 90 Days TTC/ Online Tajweed Customize Course 30/60/90 (Nazra Teachers)",
			"Core Responsibility",
			"-",
			5,
			50,
			mode="yearly",
		),
		_row(
			"co_curricular",
			"Co-curricular Activities (Quiz, Demo Class, Intro in School Functions/ Exhibitions, etc.)",
			"Core Responsibility",
			"-",
			5,
			1,
			mode="yearly",
		),
		_row(
			"new_school_registration",
			"Registration of New Schools (Mutalae Quran / Noorani Qaida)",
			"Core Responsibility",
			"-",
			5,
			24,
			mode="yearly",
		),
		_row(
			"workshop_registration",
			"Registration of Participant in One Day / Full Day Workshop",
			"Core Responsibility",
			"-",
			5,
			148,
			mode="yearly",
		),
		_row(
			"volunteers",
			"Enrolment of Volunteers",
			"Core Responsibility",
			None,
			5,
			25,
			mode="yearly",
			highlight="yellow",
		),
		_row("model_school_a", "Model School A *", "Core Responsibility", "-", None, 6, mode="none"),
		_row("model_school_b", "Model School B **", "Core Responsibility", "-", None, 12, mode="none"),
	],
	"urban": [
		_row("visits", "Visits\n(Marketing, Monitoring, Follow up etc)", "Core Responsibility", "2-3", 2, "-"),
		_row("half_day_workshop", "Half Day Workshop", "Core Responsibility", 1, 5, 5),
		_row("full_day_session", "Full Day Session", "Core Responsibility", 1, 5, 2),
		_row("meeting_ulama", "Meeting with Ulama and Educationlist", "Core Responsibility", "1-2", 3, "-"),
		_row("teachers_training_meeting", "Teachers Training Meeting", "Core Responsibility", "1-2", 3, 10),
		_row(
			"headoffice_visit",
			"Headoffice / Regional Office / Out of Station Visit",
			"Core Responsibility",
			None,
			"2-5",
			1,
			mode="monthly_fixed",
			score_points=4,
		),
		_row("academic_task", "Academic Task", "Secondary Responsibility", 1, 5, "-"),
		_row(
			"other_official",
			"Other Official Tasks",
			"Secondary Responsibility",
			None,
			"2-5",
			"-",
			mode="monthly_fixed",
			score_points=4,
		),
		_row(
			"enrolment",
			"Enrolment of Participant in  ELP/ TECC/ 90 Days TTC/ Online Tajweed Customize Course 30/60/90 (Nazra Teachers)",
			"Core Responsibility",
			"-",
			5,
			30,
			mode="yearly",
		),
		_row(
			"co_curricular",
			"Co-curricular Activities (Quiz, Demo Class, Intro in School Functions/ Exhibitions, etc.)",
			"Core Responsibility",
			"-",
			10,
			2,
			mode="yearly",
		),
		_row(
			"new_school_registration",
			"Registration of New Schools (Mutalae Quran / Noorani Qaida)",
			"Core Responsibility",
			"-",
			0,
			"-",
			mode="none",
		),
		_row(
			"workshop_registration",
			"Registration of Participant in One Day / Full Day Workshop",
			"Core Responsibility",
			"-",
			5,
			105,
			mode="yearly",
		),
		_row(
			"volunteers",
			"Enrolment of Volunteers",
			"Core Responsibility",
			None,
			5,
			25,
			mode="yearly",
			highlight="yellow",
		),
		_row("model_school_a", "Model School A *", "Core Responsibility", "-", "-", 4, mode="none"),
		_row("model_school_b", "Model School B **", "Core Responsibility", "-", "-", 8, mode="none"),
	],
	"rural": [
		_row("visits", "Visits\n(Marketing, Monitoring, Follow up etc)", "Core Responsibility", 2, 2, "-"),
		_row("half_day_workshop", "Half Day Workshop", "Core Responsibility", 1, 4, 4),
		_row("full_day_session", "Full Day Session", "Core Responsibility", 1, 4, 1),
		_row("meeting_ulama", "Meeting with Ulama and Educationlist", "Core Responsibility", "1-2", 3, "-"),
		_row("teachers_training_meeting", "Teachers Training Meeting", "Core Responsibility", "1-2", 3, 8),
		_row(
			"headoffice_visit",
			"Headoffice / Regional Office / Out of Station Visit",
			"Core Responsibility",
			None,
			"2-4",
			1,
			mode="monthly_fixed",
			score_points=4,
		),
		_row("academic_task", "Academic Task", "Secondary Responsibility", 1, 4, "-"),
		_row(
			"other_official",
			"Other Official Tasks",
			"Secondary Responsibility",
			None,
			"2-4",
			"-",
			mode="monthly_fixed",
			score_points=4,
		),
		_row(
			"enrolment",
			"Enrolment of Participant in  ELP/ TECC/ 90 Days TTC/ Online Tajweed Customize Course 30/60/90 (Nazra Teachers)",
			"Core Responsibility",
			"-",
			5,
			10,
			mode="yearly",
		),
		_row(
			"co_curricular",
			"Co-curricular Activities (Quiz, Demo Class, Intro in School Functions/ Exhibitions, etc.)",
			"Core Responsibility",
			"-",
			10,
			2,
			mode="yearly",
		),
		_row(
			"new_school_registration",
			"Registration of New Schools (Mutalae Quran / Noorani Qaida)",
			"Core Responsibility",
			"-",
			0,
			"-",
			mode="none",
		),
		_row(
			"workshop_registration",
			"Registration of Participant in One Day / Full Day Workshop",
			"Core Responsibility",
			"-",
			5,
			65,
			mode="yearly",
		),
		_row(
			"volunteers",
			"Enrolment of Volunteers",
			"Core Responsibility",
			None,
			5,
			25,
			mode="yearly",
			highlight="yellow",
		),
		_row("model_school_a", "Model School A *", "Core Responsibility", "-", "-", 3, mode="none"),
		_row("model_school_b", "Model School B **", "Core Responsibility", "-", "-", 6, mode="none"),
	],
}

FISCAL_MONTHS = [
	(7, "Jul"),
	(8, "Aug"),
	(9, "Sep"),
	(10, "Oct"),
	(11, "Nov"),
	(12, "Dec"),
	(1, "Jan"),
	(2, "Feb"),
	(3, "Mar"),
	(4, "Apr"),
	(5, "May"),
	(6, "Jun"),
]


@frappe.whitelist()
def get_report_data(filters=None):
	if not frappe.has_permission("Field Visit", "read"):
		frappe.throw(_("You are not permitted to view Field Visit data."), frappe.PermissionError)

	filters = _parse(filters)
	staff = (filters.get("staff") or "").strip()
	officer = _resolve_field_officer(staff)

	sheet = (filters.get("sheet") or "").strip().lower()
	if sheet not in SHEET_META:
		# Auto from Field Officer division
		sheet = (officer or {}).get("region") or "karachi"
		if sheet == "punjab":
			sheet = "urban"  # Punjab uses urban-like sheet in Excel V7 (no Punjab tab)
	if sheet not in SHEET_META:
		sheet = "karachi"

	working_days = cint(filters.get("working_days") or 21)
	from_date, to_date = _dates(filters)
	fy_start = cint(filters.get("fiscal_year_start") or _fiscal_year_start(to_date.year, to_date.month))

	tokens = _staff_match_tokens(staff, officer)
	actuals = _sheet_actuals(from_date, to_date, staff, tokens)

	meta = SHEET_META[sheet]
	rows, monthly_total, yearly_total = _build_rows(sheet, actuals)

	expected = working_days * meta["per_day_points"]
	achieved = monthly_total
	percent = (achieved / expected * 100) if expected else 0

	months = _fiscal_months(staff, tokens, sheet, fy_start, working_days)
	# Put current period score into matching month row
	cur_month = from_date.month
	cur_year = from_date.year
	for m in months:
		if m["month"] == cur_month and m["year"] == cur_year:
			m["score"] = flt(achieved, 2)
			m["percent"] = flt(percent, 2)
			m["yearly_score"] = flt(yearly_total, 2)
			m["yearly_percent"] = flt(yearly_total / 25 * 100, 2) if yearly_total else 0

	return {
		"foundation_title": _("The ILM Foundation"),
		"sheet_title": _("SMEs Target Base - KPIs"),
		"sheet": sheet,
		"sheet_label": meta["excel_title"],
		"theme": meta["theme"],
		"per_day_points": meta["per_day_points"],
		"working_days": working_days,
		"staff": staff,
		"staff_label": (officer or {}).get("name") or staff or _("All Field Staff"),
		"officer": officer,
		"from_date": str(from_date),
		"to_date": str(to_date),
		"fiscal_year_start": fy_start,
		"fiscal_year_label": f"{fy_start}-{str(fy_start + 1)[-2:]}",
		"rows": rows,
		"monthly_total": flt(monthly_total, 2),
		"yearly_total": flt(yearly_total, 2),
		"expected": flt(expected, 2),
		"achieved": flt(achieved, 2),
		"percent": flt(percent, 2),
		"months": months,
		"sheets": [{"key": k, "label": v["excel_title"]} for k, v in SHEET_META.items()],
		"footnotes": [
			_("* Model School A: Affiliated with at least one Program of 3 departments."),
			_("** Model School B: Affiliated with at least one Program of 2 departments."),
			_("*** Total expected targets points depends on total no of working days."),
		],
	}


# expose for Autocomplete
@frappe.whitelist()
def get_staff_options(txt=""):
	return _get_staff_options(txt=txt)


def _parse(filters):
	if isinstance(filters, str):
		try:
			return json.loads(filters) or {}
		except Exception:
			return {}
	return filters or {}


def _dates(filters):
	today = getdate()
	from_date = getdate(filters.get("from_date") or today.replace(day=1))
	to_date = getdate(filters.get("to_date") or today)
	if from_date > to_date:
		frappe.throw(_("From Date cannot be after To Date."))
	return from_date, to_date


def _sheet_actuals(from_date, to_date, staff, tokens):
	actuals = _count_actuals(from_date, to_date, staff, staff_tokens=tokens)
	# Enrich with enrolment / volunteers / workshop participants from child tables
	actuals["enrolment"] = _child_count(
		"tabField Visit Enrolment Participant", from_date, to_date, tokens, staff
	)
	actuals["volunteers"] = _child_count(
		"tabField Visit Volunteer", from_date, to_date, tokens, staff
	)
	actuals["workshop_registration"] = _workshop_participant_count(from_date, to_date, tokens, staff)
	return actuals


def _staff_clause(alias="fv"):
	return f"""
		AND (
			COALESCE({alias}.visit_by, '') IN %(tokens)s
			OR COALESCE({alias}.me_visit_by, '') IN %(tokens)s
			OR COALESCE({alias}.training_trainer_name, '') IN %(tokens)s
			OR COALESCE({alias}.training_entry_filled_by, '') IN %(tokens)s
			OR {alias}.owner IN %(tokens)s
		)
	"""


def _child_count(table, from_date, to_date, tokens, staff):
	if not staff or not tokens:
		# all staff — count rows linked to visits in range
		return cint(
			frappe.db.sql(
				f"""
				SELECT COUNT(*)
				FROM `{table}` c
				INNER JOIN `tabField Visit` fv ON fv.name = c.parent
				WHERE fv.docstatus < 2
				  AND COALESCE(fv.visit_date, fv.me_visit_date, fv.training_date, DATE(fv.creation))
				      BETWEEN %(from_date)s AND %(to_date)s
				""",
				{"from_date": from_date, "to_date": to_date},
			)[0][0]
			or 0
		)
	return cint(
		frappe.db.sql(
			f"""
			SELECT COUNT(*)
			FROM `{table}` c
			INNER JOIN `tabField Visit` fv ON fv.name = c.parent
			WHERE fv.docstatus < 2
			  AND COALESCE(fv.visit_date, fv.me_visit_date, fv.training_date, DATE(fv.creation))
			      BETWEEN %(from_date)s AND %(to_date)s
			  {_staff_clause('fv')}
			""",
			{"from_date": from_date, "to_date": to_date, "tokens": tuple(tokens)},
		)[0][0]
		or 0
	)


def _workshop_participant_count(from_date, to_date, tokens, staff):
	table = "tabField Visit Workshop Attendee"
	if not frappe.db.exists("DocType", "Field Visit Workshop Attendee"):
		# fallback: count training visits as sessions (Excel sample used headcount 20)
		return 0
	if not staff or not tokens:
		return cint(
			frappe.db.sql(
				f"""
				SELECT COUNT(*)
				FROM `{table}` c
				INNER JOIN `tabField Visit` fv ON fv.name = c.parent
				WHERE fv.docstatus < 2
				  AND COALESCE(fv.training_date, DATE(fv.creation)) BETWEEN %(from_date)s AND %(to_date)s
				""",
				{"from_date": from_date, "to_date": to_date},
			)[0][0]
			or 0
		)
	return cint(
		frappe.db.sql(
			f"""
			SELECT COUNT(*)
			FROM `{table}` c
			INNER JOIN `tabField Visit` fv ON fv.name = c.parent
			WHERE fv.docstatus < 2
			  AND COALESCE(fv.training_date, DATE(fv.creation)) BETWEEN %(from_date)s AND %(to_date)s
			  {_staff_clause('fv')}
			""",
			{"from_date": from_date, "to_date": to_date, "tokens": tuple(tokens)},
		)[0][0]
		or 0
	)


def _display(val):
	if val in (None, ""):
		return ""
	if val == "-":
		return "-"
	return val


def _score_row(cfg, actual):
	mode = cfg.get("mode") or "monthly"
	actual = flt(actual)
	monthly = None
	yearly = None
	if mode == "monthly":
		pts = _num(cfg.get("score_points"))
		monthly = actual * pts
	elif mode == "monthly_fixed":
		pts = _num(cfg.get("score_points"))
		monthly = actual * pts
	elif mode == "yearly":
		points = _num(cfg.get("points"))
		yearly_target = _num(cfg.get("yearly_target"))
		if yearly_target:
			yearly = (points / yearly_target) * actual
		else:
			yearly = 0
	return monthly, yearly


def _num(v):
	if v in (None, "", "-"):
		return 0.0
	if isinstance(v, str) and "-" in v and not v.startswith("-"):
		# range like 2-6 → use mid/high already set via score_points
		try:
			return flt(v.split("-")[-1])
		except Exception:
			return 0.0
	return flt(v)


def _build_rows(sheet, actuals):
	rows = []
	monthly_total = 0.0
	yearly_total = 0.0
	for cfg in SHEET_ROWS[sheet]:
		actual = flt(actuals.get(cfg["key"], 0))
		monthly, yearly = _score_row(cfg, actual)
		if monthly is not None:
			monthly_total += monthly
		if yearly is not None:
			yearly_total += yearly
		rows.append(
			{
				"key": cfg["key"],
				"label": cfg["label"],
				"category": cfg["category"],
				"per_day_target": _display(cfg.get("per_day_target")),
				"points": _display(cfg.get("points")),
				"yearly_target": _display(cfg.get("yearly_target")),
				"actual": actual,
				"monthly_points": flt(monthly, 2) if monthly is not None else None,
				"yearly_points": flt(yearly, 4) if yearly is not None else None,
				"highlight": cfg.get("highlight"),
				"mode": cfg.get("mode"),
			}
		)
	return rows, monthly_total, yearly_total


def _period_score(from_date, to_date, staff, tokens, sheet, working_days):
	meta = SHEET_META[sheet]
	actuals = _sheet_actuals(from_date, to_date, staff, tokens)
	_rows, monthly_total, yearly_total = _build_rows(sheet, actuals)
	expected = working_days * meta["per_day_points"]
	percent = (monthly_total / expected * 100) if expected else 0
	return {
		"score": flt(monthly_total, 2),
		"percent": flt(percent, 2),
		"yearly_score": flt(yearly_total, 2),
		"yearly_percent": flt(yearly_total / 25 * 100, 2) if yearly_total else 0,
	}


def _fiscal_months(staff, tokens, sheet, fy_start, working_days):
	out = []
	for month_num, short in FISCAL_MONTHS:
		year = fy_start if month_num >= 7 else fy_start + 1
		from_date = get_first_day(f"{year}-{month_num:02d}-01")
		to_date = get_last_day(from_date)
		score = _period_score(from_date, to_date, staff, tokens, sheet, working_days)
		out.append(
			{
				"month": month_num,
				"year": year,
				"label": f"{short}-{str(year)[-2:]}",
				"date_label": f"01-{month_num:02d}-{year}",
				**score,
			}
		)
	return out
