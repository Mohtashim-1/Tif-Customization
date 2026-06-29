import json

import frappe
from frappe import _
from frappe.utils import cint, flt, get_first_day, get_last_day, getdate


DIVISIONS = (
	{"key": "karachi", "label": "Karachi Division", "target": 1},
	{"key": "kpk_1", "label": "KPK Division", "target": 1},
	{"key": "kpk_2", "label": "KPK Division", "target": 1},
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
	supervisor = (filters.get("supervisor") or "").strip()
	supervisor_info = _get_supervisor_info(supervisor)
	actuals = _count_actuals(from_date, to_date, supervisor_info)
	field_staff = _get_supervisor_field_staff(supervisor_info)

	rows = []
	for row in KPI_ROWS:
		target = row.get("target")
		total_target = target * len(DIVISIONS) if target is not None else None
		actual = actuals.get(row.get("metric"), 0) if row.get("metric") else None
		rows.append(
			{
				"key": row["key"],
				"particulars": _(row["particulars"]),
				"explanation": _(row["explanation"]),
				"targets": {d["key"]: target for d in DIVISIONS},
				"total_target": total_target,
				"actual": actual,
				"percent": flt((actual / total_target * 100) if actual is not None and total_target else 0, 2),
				"source": _(row.get("source") or ""),
			}
		)

	return {
		"foundation_title": _("The ILM Foundation"),
		"sheet_title": _("Regional Staff Target Base - KPIs"),
		"from_date": str(from_date),
		"to_date": str(to_date),
		"supervisor": supervisor,
		"supervisor_label": supervisor_info.get("label") or _("All Supervisors"),
		"divisions": DIVISIONS,
		"rows": rows,
		"field_staff": field_staff,
		"field_staff_count": len(field_staff),
		"notes": [
			_("Supervisor Field Staff are active Employees whose Reports To is the selected supervisor."),
			_("Rows without a yearly target are shown as policy/qualitative responsibilities."),
		],
	}


@frappe.whitelist()
def get_supervisor_options(txt=""):
	txt = (txt or "").strip()
	params = {}
	txt_filter = ""
	if txt:
		txt_filter = """
			AND (
				sup.employee_name LIKE %(txt)s
				OR sup.name LIKE %(txt)s
				OR sup.user_id LIKE %(txt)s
			)
		"""
		params["txt"] = f"%{txt}%"

	rows = frappe.db.sql(
		f"""
		SELECT
			sup.name AS employee,
			sup.employee_name,
			sup.user_id,
			COUNT(staff.name) AS field_staff_count
		FROM `tabEmployee` sup
		INNER JOIN `tabEmployee` staff
			ON staff.reports_to = sup.name
			AND staff.status = 'Active'
		WHERE sup.status = 'Active'
		{txt_filter}
		GROUP BY sup.name, sup.employee_name, sup.user_id
		ORDER BY sup.employee_name
		LIMIT 50
		""",
		params,
		as_dict=True,
	)
	return [
		{
			"value": row.user_id or row.employee_name or row.employee,
			"description": f"{row.employee_name or row.employee} ({cint(row.field_staff_count)} field staff)",
		}
		for row in rows
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
	}


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
		SELECT COUNT(*)
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
		SELECT COUNT(*)
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
