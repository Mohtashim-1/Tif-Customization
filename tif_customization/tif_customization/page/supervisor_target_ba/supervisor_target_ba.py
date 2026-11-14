import json

import frappe
from frappe import _
from frappe.utils import cint, flt, get_first_day, get_last_day, getdate


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
	return {
		"foundation_title": _("The ILM Foundation"),
		"sheet_title": _("Supervisors Target Base - KPIs"),
		"from_date": str(from_date),
		"to_date": str(to_date),
		"month_from": str(month_from),
		"month_label": getdate(to_date).strftime("%B %Y"),
		"supervisor": supervisor,
		"supervisor_label": supervisor_info.get("label") or _("All Supervisors"),
		"headcount": headcount,
		"rows": rows,
		"yearly_percent": _average(r["yearly"]["percent"] for r in scored),
		"monthly_percent": _average(r["monthly"]["percent"] for r in scored),
		"field_staff": field_staff,
		"field_staff_count": len(field_staff),
		"notes": [
			_("Yearly columns cover From Date to To Date; Monthly columns cover the month of To Date."),
			_("Monthly Target = Yearly Target / 12. Excess / Remaining = Target - Achievements (negative means target exceeded)."),
			_("Yearly / Monthly Performance Percentage is the average of the KPI percentages with a numeric target."),
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
