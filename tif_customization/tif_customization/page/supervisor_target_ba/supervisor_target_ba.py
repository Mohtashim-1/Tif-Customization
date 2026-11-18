import json

import frappe
from frappe import _
from frappe.utils import add_days, cint, flt, get_first_day, get_last_day, getdate, today

from tif_customization.tif_customization.doctype.reporting.reporting import (
	_gazetted_holiday_dates,
	_leave_dates_by_employee,
)
from tif_customization.tif_customization.page.smes_target_base___k.smes_target_base_kpi_config import (
	FISCAL_MONTHS,
	INCREMENT_SCALE,
)
from tif_customization.tif_customization.page.smes_target_base___k.smes_target_base___k import (
	_fiscal_year_start,
	_increment_tier,
)

ACTIVITY_WEIGHT = 0.70
OUTCOME_WEIGHT = 0.30

# Scored KPIs used for monthly points / overall (same spirit as SME 70/30)
ACTIVITY_METRICS = (
	"school_visits",
	"workshops",
	"meetings",
	"me_visits",
	"sme_target_meetings",
)
OUTCOME_METRICS = (
	"office_invitations",
	"volunteers",
)

KPI_ROWS = [
	{
		"key": "individual_school_visits",
		"particulars": "Individual School Visits",
		"explanation": "Per Month visit x No of Working Month",
		"target": 135,
		"metric": "school_visits",
		"source": "Marketing + M&E Field Visit records",
	},
	{
		"key": "workshop",
		"particulars": "Workshop (Arranged for Other Trainers / Conducted by self)",
		"explanation": "Per Month trainings x No of Training Month",
		"target": 15,
		"metric": "workshops",
		"source": "Training Field Visit records",
	},
	{
		"key": "meetings",
		"particulars": (
			"Meeting with Ulama / Educationist /Govt. Officials / Social Media Activist / "
			"Influential Personalities etc."
		),
		"explanation": "Per Month Meetings x No of Working Month",
		"target": 120,
		"metric": "meetings",
		"source": "Meeting Field Visit records",
	},
	{
		"key": "school_visits_with_smes",
		"particulars": "School Visits with SMEs",
		"explanation": "Per Month visits x No of Working Month",
		"target": 63,
		"metric": "me_visits",
		"source": "M&E Field Visit records",
	},
	{
		"key": "monthly_meeting_with_smes",
		"particulars": "Monthly Meeting with SMEs regarding Targets (Online/ Onsite)",
		"explanation": (
			"No of Meetings x No of Months (Motivating team members and clearly communicating "
			"goals to ensure focus and achievement of set targets.)"
		),
		"target": 12,
		"metric": "sme_target_meetings",
		"source": "Meeting records containing SME or target text",
	},
	{
		"key": "invitation",
		"particulars": (
			"Invitation of Ulama / Educationist /Govt. Officials / Influential Personalities "
			"to the Regional Office / Head Office"
		),
		"explanation": "25% of No of Meetings",
		"target": 30,
		"metric": "office_invitations",
		"source": "Meeting records containing office/invitation text",
	},
	{
		"key": "enrolment_of_volunteers",
		"particulars": "Enrolment of Volunteers",
		"explanation": "Register new volunteers",
		"target": 25,
		"metric": "volunteers",
		"source": "Volunteer Registration records",
	},
	{
		"key": "sme_daily_monitoring",
		"particulars": "SMEs Daily Activities Monitoring",
		"explanation": "Daily",
		"target": None,
	},
	{
		"key": "sme_queries_resolution",
		"particulars": "SMEs Quires Resolution",
		"explanation": "Addressing and solving issues or questions raised by SMEs for smooth workflow.",
		"target": None,
	},
	{
		"key": "staff_training_arrangements",
		"particulars": "Arrangements for staff Training and Development Programs",
		"explanation": "Planning and organizing training sessions to improve staff skills, knowledge, and performance.",
		"target": None,
	},
	{
		"key": "rd_task",
		"particulars": "R&D Task",
		"explanation": "As per need",
		"target": None,
	},
	{
		"key": "other_administrative",
		"particulars": "Other Administrative Tasks",
		"explanation": "As per need",
		"target": None,
	},
	{
		"key": "out_of_station",
		"particulars": "Out-of-Station Visit (for Addressing Special Issues)",
		"explanation": "As per need",
		"target": None,
	},
	{
		"key": "sme_school_data",
		"particulars": "SME School Data Management",
		"explanation": (
			"Record and track schools under each SME, including visited, active, inactive, and "
			"trained schools for monitoring and planning purposes."
		),
		"target": None,
	},
	{
		"key": "teacher_bank",
		"particulars": "Teacher Bank (TIF-Trained & Untrained)",
		"explanation": (
			"Database of trained, untrained, and interested teachers linked with TIF for training "
			"and engagement purposes."
		),
		"target": None,
	},
	{
		"key": "employee_growth",
		"particulars": "Employee Growth & Mentorship",
		"explanation": (
			"Improving employees' skills and performance through guidance and support as mentors, "
			"including help in both professional development and personal matters."
		),
		"target": None,
	},
	{
		"key": "reporting_to_head_office",
		"particulars": "Reporting to TIF Head office",
		"explanation": "Monthly",
		"target": None,
	},
]


@frappe.whitelist()
def get_report_data(filters=None):
	filters = _parse_filters(filters)
	if not frappe.has_permission("Field Visit", "read"):
		frappe.throw(_("You are not permitted to view Field Visit data."))

	from_date, to_date = _resolve_date_range(filters)
	month_from = max(from_date, get_first_day(to_date))
	supervisor = (filters.get("supervisor") or "").strip()
	supervisor_info = _get_supervisor_info(supervisor) if supervisor else _all_supervisors_info()
	headcount = supervisor_info.get("headcount") or 1
	employee = supervisor_info.get("employee")
	yearly = _count_actuals(from_date, to_date, supervisor_info)
	monthly = _count_actuals(month_from, to_date, supervisor_info)
	field_staff = _get_supervisor_field_staff(supervisor_info)

	rows = []
	for row in KPI_ROWS:
		target = row.get("target")
		metric = row.get("metric")
		entry = {
			"key": row["key"],
			"particulars": _(row["particulars"]),
			"explanation": _(row["explanation"]),
			"source": _(row.get("source") or ""),
			"yearly": None,
			"monthly": None,
		}
		if target is not None and metric:
			target = target * headcount
			entry["yearly"] = _kpi_cell(target, yearly.get(metric, 0))
			entry["monthly"] = _kpi_cell(flt(target / 12, 2), monthly.get(metric, 0))
		rows.append(entry)

	scored = [r for r in rows if r["yearly"]]
	yearly_percent = _average(r["yearly"]["percent"] for r in scored)
	monthly_percent = _average(r["monthly"]["percent"] for r in scored)

	# Monthly summary + FY performance (SME KPI Details sections)
	wd_info = _working_days_info(month_from, to_date, employee)
	working_days = cint(filters.get("working_days") or 0) or wd_info["working_days"]
	full_month_wd = _working_days_info(
		get_first_day(to_date), get_last_day(to_date), employee, cutoff_today=False
	)["working_days"]
	activity_yearly = _metric_target_sum(ACTIVITY_METRICS) * headcount
	outcome_yearly = _metric_target_sum(OUTCOME_METRICS) * headcount
	activity_monthly_target = flt(activity_yearly / 12.0, 4)
	per_day_points = flt(activity_monthly_target / full_month_wd, 4) if full_month_wd else 0.0
	activity_target = flt(working_days * per_day_points, 2)
	activity_actual = flt(_sum_metrics(monthly, ACTIVITY_METRICS), 2)
	activity_pct = flt((activity_actual / activity_target * 100) if activity_target else 0.0, 2)

	fy_start_year = cint(filters.get("fiscal_year_start") or _fiscal_year_start(to_date.year, to_date.month))
	ytd_from = getdate(f"{fy_start_year}-07-01")
	if ytd_from > to_date:
		ytd_from = from_date
	ytd_actuals = _count_actuals(ytd_from, to_date, supervisor_info)
	outcome_pct = _outcome_percent(ytd_actuals, headcount)
	overall_pct = flt(ACTIVITY_WEIGHT * activity_pct + OUTCOME_WEIGHT * outcome_pct, 2)

	months, ytd_activity_actual, ytd_activity_expected, yearly_target_score = _fiscal_month_rows(
		supervisor_info, headcount, employee, fy_start_year
	)
	ytd_activity_pct = flt(
		(ytd_activity_actual / ytd_activity_expected * 100) if ytd_activity_expected else 0.0, 2
	)
	increment_tier = _increment_tier(overall_pct)

	return {
		"foundation_title": _("The ILM Foundation"),
		"sheet_title": _("Supervisors Target Base - KPIs"),
		"from_date": str(from_date),
		"to_date": str(to_date),
		"month_from": str(month_from),
		"month_label": getdate(to_date).strftime("%B %Y"),
		"ytd_from": str(ytd_from),
		"fiscal_year_label": f"{fy_start_year}-{str(fy_start_year + 1)[-2:]}",
		"supervisor": supervisor,
		"supervisor_label": supervisor_info.get("label") or _("All Supervisors"),
		"headcount": headcount,
		"rows": rows,
		"yearly_percent": yearly_percent,
		"monthly_percent": monthly_percent,
		"field_staff": field_staff,
		"field_staff_count": len(field_staff),
		"per_day_points": flt(per_day_points, 2),
		"working_days": working_days,
		"working_days_info": wd_info,
		"activity_actual": activity_actual,
		"activity_target": activity_target,
		"activity_pct": activity_pct,
		"outcome_pct": flt(outcome_pct, 2),
		"overall_pct": overall_pct,
		"activity_weight": ACTIVITY_WEIGHT,
		"outcome_weight": OUTCOME_WEIGHT,
		"months": months,
		"ytd_activity_actual": flt(ytd_activity_actual, 2),
		"ytd_activity_expected": flt(ytd_activity_expected, 2),
		"ytd_activity_pct": ytd_activity_pct,
		"yearly_target_score": flt(yearly_target_score, 2),
		"increment_scale": INCREMENT_SCALE,
		"increment_tier": increment_tier,
		"increment_achieved": (increment_tier or {}).get("increment") or "",
		"reward_note": _("Highest % Achiever {0}-{1}: Cash Reward with Shield").format(
			fy_start_year, fy_start_year + 1
		),
		"notes": [
			_("Yearly columns cover From Date to To Date; Monthly columns cover the month of To Date."),
			_("Monthly Target = Yearly Target / 12. Excess / Remaining = Target - Achievements (negative means target exceeded)."),
			_("Monthly summary points = sum of activity KPI counts (visits, workshops, meetings, SME visits/meetings)."),
			_("Expected monthly points = working days × (activity monthly target ÷ full-month working days)."),
			_("Overall % = 70% activity (monthly points) + 30% outcome (invitations + volunteers vs yearly mins, YTD)."),
			_("All Supervisors: targets are multiplied by the number of supervisors and only the supervisors' own activities are counted."),
			_("Supervisor Field Staff are active Employees whose Reports To is the selected supervisor."),
		],
	}


def _kpi_cell(target, actual):
	actual = cint(actual)
	return {
		"target": target,
		"actual": actual,
		"remaining": flt(target - actual, 2),
		"percent": flt(actual / target * 100, 0) if target else 0,
	}


def _average(values):
	values = list(values)
	return flt(sum(values) / len(values), 0) if values else 0


def _metric_target_map():
	return {row["metric"]: row["target"] for row in KPI_ROWS if row.get("metric") and row.get("target") is not None}


def _metric_target_sum(metrics):
	targets = _metric_target_map()
	return flt(sum(flt(targets.get(m) or 0) for m in metrics), 2)


def _sum_metrics(actuals, metrics):
	return sum(cint((actuals or {}).get(m) or 0) for m in metrics)


def _outcome_percent(actuals, headcount=1):
	targets = _metric_target_map()
	pcts = []
	for metric in OUTCOME_METRICS:
		target = flt(targets.get(metric) or 0) * (headcount or 1)
		actual = cint((actuals or {}).get(metric) or 0)
		if target:
			pcts.append(min(100.0, actual / target * 100.0))
	return flt(sum(pcts) / len(pcts), 2) if pcts else 0.0


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


def _fiscal_month_rows(supervisor_info, headcount, employee, fy_start):
	"""Jul–Jun activity points / % using each month's own working days."""
	activity_yearly = _metric_target_sum(ACTIVITY_METRICS) * (headcount or 1)
	activity_monthly_target = flt(activity_yearly / 12.0, 4)
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
		per_day = (
			flt(activity_monthly_target / wd_full["working_days"], 4) if wd_full["working_days"] else 0.0
		)
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
			expected = flt(wd["working_days"] * per_day, 2)
			actuals = _count_actuals(start, actual_end, supervisor_info)
			score = flt(_sum_metrics(actuals, ACTIVITY_METRICS), 2)
			percent = (score / expected * 100) if expected else 0.0
			row.update(
				{
					"score": score,
					"percent": flt(percent, 2),
					"expected": expected,
					"working_days": wd["working_days"],
				}
			)
			ytd_actual += score
			ytd_expected += expected
		out.append(row)

	return out, ytd_actual, ytd_expected, year_expected


def _supervisor_option_description(row):
	label = row.get("employee_name") or row.get("employee") or ""
	count = cint(row.get("field_officer_count"))
	division = (row.get("division") or "").strip()
	if division:
		return f"{label} ({count} field officers, {division})"
	return f"{label} ({count} field officers)"


@frappe.whitelist()
def get_supervisor_options(txt=""):
	txt = (txt or "").strip()
	from tif_customization.tif_customization.doctype.field_officer.field_officer import (
		list_field_supervisors,
	)

	rows = list_field_supervisors()
	if txt:
		needle = txt.lower()
		rows = [
			r
			for r in rows
			if needle in (r.get("employee_name") or "").lower()
			or needle in (r.get("employee") or "").lower()
			or needle in (r.get("user_id") or "").lower()
			or needle in (r.get("division") or "").lower()
		]
	return [
		{
			"value": row.get("user_id") or row.get("employee_name") or row.get("employee"),
			"description": _supervisor_option_description(row),
		}
		for row in rows[:50]
	]


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
	else:
		from_date = get_first_day(today)
		to_date = get_last_day(today)

	if from_date > to_date:
		frappe.throw(_("From Date cannot be after To Date."))
	return from_date, to_date


def _all_supervisors_info():
	from tif_customization.tif_customization.doctype.field_officer.field_officer import (
		list_field_supervisors,
	)

	sups = list_field_supervisors()
	names = []
	for row in sups:
		names.extend(v for v in (row.get("employee"), row.get("employee_name"), row.get("user_id")) if v)
	return {
		"value": "",
		"label": _("All Supervisors ({0})").format(len(sups)),
		"employee": None,
		"user_id": None,
		"names": names or ["__none__"],
		"headcount": len(sups) or 1,
	}


def _get_supervisor_info(supervisor):
	if not supervisor:
		return {"value": "", "label": _("All Supervisors"), "employee": None, "user_id": None, "names": []}

	row = frappe.db.sql(
		"""
		SELECT name, employee_name, user_id
		FROM `tabEmployee`
		WHERE status = 'Active'
		AND (
			name = %(supervisor)s
			OR user_id = %(supervisor)s
			OR employee_name = %(supervisor)s
		)
		ORDER BY IF(user_id = %(supervisor)s, 0, 1), employee_name
		LIMIT 1
		""",
		{"supervisor": supervisor},
		as_dict=True,
	)
	if not row:
		return {"value": supervisor, "label": supervisor, "employee": None, "user_id": supervisor, "names": [supervisor]}

	emp = row[0]
	names = [emp.name, emp.employee_name, emp.user_id]
	return {
		"value": supervisor,
		"label": emp.employee_name or emp.user_id or emp.name,
		"employee": emp.name,
		"user_id": emp.user_id,
		"names": [name for name in names if name],
	}


def _get_supervisor_field_staff(supervisor_info):
	from tif_customization.tif_customization.doctype.field_officer.field_officer import (
		get_field_supervisor_subordinate_employees,
		resolve_supervisor_field_officer,
	)

	supervisor = (
		supervisor_info.get("employee")
		or supervisor_info.get("user_id")
		or supervisor_info.get("label")
		or supervisor_info.get("value")
	)
	emp_ids = get_field_supervisor_subordinate_employees(supervisor)
	if not emp_ids:
		# Fallback until Field Supervisor is populated on all officers
		employee = supervisor_info.get("employee")
		if not employee:
			return []
		rows = frappe.get_all(
			"Employee",
			filters={"status": "Active", "reports_to": employee},
			fields=["name", "employee_name", "user_id", "department", "designation"],
			order_by="employee_name asc",
			limit_page_length=500,
		)
		return rows

	rows = frappe.get_all(
		"Employee",
		filters={"status": "Active", "name": ["in", emp_ids]},
		fields=["name", "employee_name", "user_id", "department", "designation"],
		order_by="employee_name asc",
		limit_page_length=500,
	)
	if rows:
		return rows

	# Field Supervisor link exists but employee rows missing — resolve via FO records
	sup_fo = resolve_supervisor_field_officer(supervisor)
	if not sup_fo:
		return []
	return frappe.db.sql(
		"""
		SELECT e.name, e.employee_name, e.user_id, e.department, e.designation
		FROM `tabField Officer` fo
		INNER JOIN `tabEmployee` e ON e.name = fo.employee AND e.status = 'Active'
		WHERE fo.status = 'Active' AND fo.parent_field_officer = %(sup)s
		ORDER BY e.employee_name
		""",
		{"sup": sup_fo},
		as_dict=True,
	)


def _supervisor_condition(supervisor_info, user_expr):
	names = supervisor_info.get("names") or []
	if not names:
		return "", {}

	params = {f"sup_{idx}": value for idx, value in enumerate(names)}
	placeholders = ", ".join(f"%(sup_{idx})s" for idx in range(len(names)))
	return (
		f"""
		AND (
			TRIM({user_expr}) IN ({placeholders})
			OR u.name IN ({placeholders})
			OR e.name IN ({placeholders})
			OR e.employee_name IN ({placeholders})
		)
		""",
		params,
	)


def _employee_join(user_expr):
	return f"""
		LEFT JOIN `tabUser` u ON (
			u.name = TRIM({user_expr})
			OR LOWER(TRIM(u.full_name)) = LOWER(TRIM({user_expr}))
		)
		LEFT JOIN `tabEmployee` e ON (
			e.user_id = u.name
			OR LOWER(TRIM(e.employee_name)) = LOWER(TRIM({user_expr}))
			OR e.name = TRIM({user_expr})
		)
	"""


def _count_actuals(from_date, to_date, supervisor_info):
	return {
		"school_visits": _count_field_visits(
			from_date,
			to_date,
			supervisor_info,
			types=("Marketing", "M&E"),
		),
		"workshops": _count_field_visits(from_date, to_date, supervisor_info, types=("Training",)),
		"meetings": _count_field_visits(from_date, to_date, supervisor_info, types=("Meeting",)),
		"me_visits": _count_field_visits(from_date, to_date, supervisor_info, types=("M&E",)),
		"sme_target_meetings": _count_meetings_by_text(
			from_date,
			to_date,
			supervisor_info,
			("sme", "target"),
		),
		"office_invitations": _count_meetings_by_text(
			from_date,
			to_date,
			supervisor_info,
			("invitation", "regional office", "head office", "office"),
		),
		"volunteers": _count_volunteers(from_date, to_date, supervisor_info),
	}


def _count_volunteers(from_date, to_date, supervisor_info):
	user_expr = "COALESCE(NULLIF(TRIM(vr.field_officer), ''), vr.owner)"
	condition, params = _supervisor_condition(supervisor_info, user_expr)
	return _scalar_count(
		f"""
		SELECT COUNT(DISTINCT vr.name)
		FROM `tabVolunteer Registration` vr
		{_employee_join(user_expr)}
		WHERE vr.docstatus < 2
		AND COALESCE(vr.visit_date, DATE(vr.creation)) BETWEEN %(from_date)s AND %(to_date)s
		{condition}
		""",
		{"from_date": from_date, "to_date": to_date, **params},
	)


def _count_field_visits(from_date, to_date, supervisor_info, types):
	user_expr = """
		COALESCE(
			NULLIF(TRIM(fv.visit_by), ''),
			NULLIF(TRIM(fv.me_visit_by), ''),
			NULLIF(TRIM(fv.training_entry_filled_by), ''),
			NULLIF(TRIM(fv.training_trainer_name), ''),
			NULLIF(TRIM(fv.mt_visit_by), ''),
			fv.owner
		)
	"""
	condition, params = _supervisor_condition(supervisor_info, user_expr)
	type_params = {f"type_{idx}": value for idx, value in enumerate(types)}
	type_placeholders = ", ".join(f"%(type_{idx})s" for idx in range(len(types)))

	return _scalar_count(
		f"""
		SELECT COUNT(DISTINCT fv.name)
		FROM `tabField Visit` fv
		{_employee_join(user_expr)}
		WHERE fv.docstatus < 2
		AND fv.type IN ({type_placeholders})
		AND (
			(fv.type = 'Marketing' AND COALESCE(fv.visit_date, DATE(fv.timestamp)) BETWEEN %(from_date)s AND %(to_date)s)
			OR (fv.type = 'M&E' AND COALESCE(fv.me_visit_date, fv.me_starting_date, DATE(fv.me_timestamp)) BETWEEN %(from_date)s AND %(to_date)s)
			OR (fv.type = 'Training' AND COALESCE(fv.training_date, DATE(fv.training_timestamp)) BETWEEN %(from_date)s AND %(to_date)s)
			OR (fv.type = 'Meeting' AND COALESCE(fv.mt_meeting_date, DATE(fv.mt_timestamp)) BETWEEN %(from_date)s AND %(to_date)s)
		)
		{condition}
		""",
		{"from_date": from_date, "to_date": to_date, **type_params, **params},
	)


def _count_meetings_by_text(from_date, to_date, supervisor_info, patterns):
	user_expr = "COALESCE(NULLIF(TRIM(fv.mt_visit_by), ''), fv.owner)"
	condition, params = _supervisor_condition(supervisor_info, user_expr)
	pattern_sql = []
	pattern_params = {}
	for idx, pattern in enumerate(patterns):
		key = f"pattern_{idx}"
		pattern_sql.append(
			f"""
			LOWER(CONCAT_WS(' ', fv.mt_agenda, fv.mt_designation, fv.mt_reference, fv.mt_remarks)) LIKE %({key})s
			"""
		)
		pattern_params[key] = f"%{pattern.lower()}%"

	return _scalar_count(
		f"""
		SELECT COUNT(DISTINCT fv.name)
		FROM `tabField Visit` fv
		{_employee_join(user_expr)}
		WHERE fv.docstatus < 2
		AND fv.type = 'Meeting'
		AND COALESCE(fv.mt_meeting_date, DATE(fv.mt_timestamp)) BETWEEN %(from_date)s AND %(to_date)s
		AND ({" OR ".join(pattern_sql)})
		{condition}
		""",
		{"from_date": from_date, "to_date": to_date, **pattern_params, **params},
	)


def _scalar_count(query, params):
	return cint(frappe.db.sql(query, params)[0][0] or 0)
