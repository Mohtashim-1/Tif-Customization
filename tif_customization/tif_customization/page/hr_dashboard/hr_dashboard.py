"""Attendance & Leave dashboard — Employee Attendance, Leave Application, and workforce (Employee)."""

import calendar
import json
import re

import frappe
from frappe.utils import add_days, add_months, cint, flt, formatdate, get_first_day, get_last_day, getdate, nowdate


EA_DOCTYPE = "Employee Attendance"
EA_TABLE = "`tabEmployee Attendance`"


@frappe.whitelist()
def get_dashboard_data(filters=None):
	"""KPIs and chart series from Employee Attendance (+ leave apps)."""
	if isinstance(filters, str):
		filters = json.loads(filters or "{}")
	filters = filters or {}

	company = (filters.get("company") or "").strip()
	branch = (filters.get("branch") or "").strip()
	department = (filters.get("department") or "").strip()
	employee = (filters.get("employee") or "").strip()

	today = getdate(nowdate())
	from_date = getdate(filters.get("from_date") or add_months(get_first_day(today), -5))
	to_date = getdate(filters.get("to_date") or today)
	if from_date > to_date:
		from_date, to_date = to_date, from_date

	month_keys = _months_in_range(from_date, to_date)

	if not frappe.db.exists("DocType", EA_DOCTYPE):
		return _empty_payload(from_date, to_date, company, branch, department, employee)

	data = _empty_payload(from_date, to_date, company, branch, department, employee)

	data["attendance_records"] = _ea_count(month_keys, company, branch, department, employee)
	data["employees_covered"] = _ea_distinct_employees(month_keys, company, branch, department, employee)

	totals = _ea_sum_totals(month_keys, company, branch, department, employee)
	data.update(totals)

	data["avg_absents_per_record"] = (
		flt(data["total_absents"]) / flt(data["attendance_records"]) if data["attendance_records"] else 0.0
	)
	data["avg_lates_per_record"] = (
		flt(data["total_lates"]) / flt(data["attendance_records"]) if data["attendance_records"] else 0.0
	)

	data["monthly_attendance_trend"] = _ea_monthly_series(month_keys, company, branch, department, employee)
	data["department_absents_lates"] = _ea_by_department(month_keys, company, branch, department, employee, limit=12)
	data["branch_breakdown"] = _ea_by_branch(month_keys, company, branch, department, employee, limit=12)
	data["metrics_distribution"] = _ea_distribution_totals(totals)
	data["punctuality_late_buckets"] = _punctuality_late_buckets(
		month_keys, company, branch, department, employee
	)
	data["punctuality_incident_mix"] = _punctuality_incident_mix(totals)
	data["top_by_lates"] = _ea_top_employees(month_keys, company, branch, department, employee, order_field="total_lates", limit=12)
	payroll_month_keys = _current_payroll_ea_month_keys(today)
	period_start, period_end, period_year, period_month = _get_payroll_period_bounds(today)
	data["payroll_month_label"] = f"{formatdate(period_start, 'dd MMM yyyy')} – {formatdate(period_end, 'dd MMM yyyy')}"
	data["payroll_month_period"] = {
		"from_date": str(period_start),
		"to_date": str(period_end),
		"month": period_month,
		"year": period_year,
	}
	data["top_3_late_comers"] = _ea_top_fulltime_employees(
		payroll_month_keys, company, branch, department, employee, order_field="total_lates", limit=3, ascending=False
	)
	data["top_3_punctual_employees"] = _ea_top_fulltime_employees(
		payroll_month_keys, company, branch, department, employee, order_field="total_lates", limit=3, ascending=True
	)
	data["top_3_late_comers_count"] = len(data["top_3_late_comers"])
	data["top_3_punctual_employees_count"] = len(data["top_3_punctual_employees"])
	data["top_by_absents"] = _ea_top_employees(month_keys, company, branch, department, employee, order_field="total_absents", limit=12)

	data["leave_trend"] = _leave_trend(from_date, to_date, company=company, branch=branch, department=department, employee=employee)
	data["leaves_by_type"] = _leaves_by_type(from_date, to_date, company=company, branch=branch, department=department, employee=employee)
	data["leave_status_breakdown"] = _leave_status_breakdown(from_date, to_date, company=company, branch=branch, department=department, employee=employee)
	data["pending_leave_applications"] = _pending_leave_count(from_date, to_date, company=company, branch=branch, department=department, employee=employee)
	data["approved_leave_days"] = _approved_leave_days_sum(from_date, to_date, company=company, branch=branch, department=department, employee=employee)

	# Workforce (Employee master): same Company / Branch / Department — not scoped by single Employee link
	data["active_headcount"] = _count_active_employees(company, branch, department)
	data["new_hires"] = _count_new_hires(from_date, to_date, company, branch, department)
	data["left_employees"] = _count_left_employees(from_date, to_date, company, branch, department)
	hc = max(cint(data["active_headcount"]), 1)
	data["attrition_rate"] = flt(data["left_employees"]) / flt(hc) * 100.0
	data["hiring_attrition_trend"] = _hiring_attrition_trend(from_date, to_date, company, branch, department)
	data["headcount_by_employment_type"] = _headcount_by_employment_type(company, branch, department, limit=12)
	# Active headcount distributions (Employee master)
	data["headcount_by_gender"] = _active_employee_group_count("gender", company, branch, department, limit=10)
	data["total_male"] = _count_active_by_gender("Male", company, branch, department)
	data["total_female"] = _count_active_by_gender("Female", company, branch, department)
	data["headcount_by_grade"] = _headcount_by_grade(company, branch, department, limit=20)
	data["headcount_by_employee_branch"] = _active_employee_group_count("branch", company, branch, department, limit=15)
	data["headcount_by_designation"] = _active_employee_group_count("designation", company, branch, department, limit=20)
	data["headcount_by_department"] = _active_employee_group_count("department", company, branch, department, limit=25)
	data["headcount_by_department_employment_type"] = _headcount_stacked_by_employment_type(
		"department", company, branch, department, limit=25
	)
	data["headcount_by_branch_employment_type"] = _headcount_stacked_by_employment_type(
		"branch", company, branch, department, limit=25
	)
	# City / Branch wise (Employee master; best-effort based on available fields)
	data["headcount_by_city"] = _active_employee_city_count(company, branch, department, limit=15)
	data["headcount_by_city_branch"] = _active_employee_city_branch_table(company, branch, department, limit=25)

	# This calendar month, payroll, Pakistan/Qatar headcount, CNIC compliance
	month_start = get_first_day(today)
	month_end = get_last_day(today)
	year_start = getdate(f"{today.year}-01-01")
	data["new_hires_this_month"] = _count_new_hires(month_start, month_end, company, branch, department)
	data["left_employees_this_month"] = _count_left_employees(month_start, month_end, company, branch, department)
	data["attrition_this_month"] = data["left_employees_this_month"]
	hc_month = max(cint(data["active_headcount"]), 1)
	data["attrition_rate_this_month"] = flt(data["attrition_this_month"]) / flt(hc_month) * 100.0
	data["attrition_month_label"] = today.strftime("%b %Y")
	data["new_hires_this_year"] = _count_new_hires(year_start, today, company, branch, department)
	data["left_employees_this_year"] = _count_left_employees(year_start, today, company, branch, department)
	data["total_left_employees"] = _count_total_left_employees(company, branch, department)
	data.update(_payroll_month_summary(company, branch, department, month_start, month_end))
	data["active_headcount_pakistan"] = _count_active_region_keyword(company, branch, department, "pakistan")
	data["active_headcount_qatar"] = _count_active_region_keyword(company, branch, department, "qatar")
	data.update(_cnic_expired_stats_and_rows(company, branch, department, limit=25))
	# Probation employees (best-effort; supports common custom fields if present)
	data.update(_probation_stats_and_rows(company, branch, department, today=today, limit=25))
	cnic_days = 30
	data["cnic_upcoming_days"] = cint(cnic_days)
	data.update(_cnic_upcoming_stats_and_rows(company, branch, department, today=today, days=cnic_days, limit=25))
	data.update(_workforce_card_counts(company, branch, department))
	data.update(_eobi_added_stats(company, branch, department, limit=500))
	data.update(_pak_qatar_enrolled_stats(company, branch, department, limit=500))
	data.update(_upcoming_confirmation_stats(company, branch, department, today=today, days=60, limit=500))

	return data


@frappe.whitelist()
def get_card_drilldown(card_key=None, filters=None):
	"""Return row-level detail for a dashboard KPI card."""
	if isinstance(filters, str):
		filters = json.loads(filters or "{}")
	filters = filters or {}

	company = (filters.get("company") or "").strip()
	branch = (filters.get("branch") or "").strip()
	department = (filters.get("department") or "").strip()
	today = getdate(nowdate())
	from_date = getdate(filters.get("from_date") or add_months(get_first_day(today), -5))
	to_date = getdate(filters.get("to_date") or today)
	month_start = get_first_day(today)
	month_end = get_last_day(today)
	year_start = getdate(f"{today.year}-01-01")

	card_key = (card_key or "").strip()
	handlers = {
		"active_headcount": lambda: _drill_active_employees(company, branch, department),
		"emp_full_time_permanent": lambda: _drill_active_employment_types(
			company, branch, department, EMPLOYMENT_CARD_TYPES["emp_full_time_permanent"]
		),
		"emp_part_time_permanent": lambda: _drill_active_employment_types(
			company, branch, department, EMPLOYMENT_CARD_TYPES["emp_part_time_permanent"]
		),
		"emp_full_time_probation": lambda: _drill_active_employment_types(
			company, branch, department, EMPLOYMENT_CARD_TYPES["emp_full_time_probation"]
		),
		"emp_part_time_probation": lambda: _drill_active_employment_types(
			company, branch, department, EMPLOYMENT_CARD_TYPES["emp_part_time_probation"]
		),
		"emp_contract_as_per_need": lambda: _drill_active_employment_types(
			company, branch, department, EMPLOYMENT_CARD_TYPES["emp_contract_as_per_need"]
		),
		"emp_contract_fixed_salary": lambda: _drill_active_employment_types(
			company, branch, department, EMPLOYMENT_CARD_TYPES["emp_contract_fixed_salary"]
		),
		"new_hires_this_month": lambda: _drill_new_hires(month_start, month_end, company, branch, department),
		"new_hires_this_year": lambda: _drill_new_hires(year_start, today, company, branch, department),
		"left_employees_this_month": lambda: _drill_left_employees(month_start, month_end, company, branch, department),
		"attrition_this_month": lambda: _drill_payload(
			f"Attrition — {today.strftime('%b %Y')}",
			_fetch_left_rows(month_start, month_end, company, branch, department, limit=500),
		),
		"left_employees_this_year": lambda: _drill_left_employees(year_start, today, company, branch, department),
		"eobi_added": lambda: _drill_eobi_added(company, branch, department),
		"pak_qatar_enrolled": lambda: _drill_pak_qatar_enrolled(company, branch, department),
		"cnic_expired_count": lambda: _drill_cnic_expired(company, branch, department),
		"cnic_upcoming_count": lambda: _drill_cnic_upcoming(
			company, branch, department, today=today, days=cint(filters.get("cnic_upcoming_days") or 30)
		),
		"upcoming_confirmation": lambda: _drill_upcoming_confirmation(
			company, branch, department, today=today, days=60
		),
		"total_male": lambda: _drill_active_by_gender(company, branch, department, "Male"),
		"total_female": lambda: _drill_active_by_gender(company, branch, department, "Female"),
		"attendance_records": lambda: _drill_attendance_records(from_date, to_date, company, branch, department, filters.get("employee")),
		"employees_covered": lambda: _drill_employees_covered(from_date, to_date, company, branch, department, filters.get("employee")),
		"pending_leave_applications": lambda: _drill_pending_leaves(from_date, to_date, company, branch, department, filters.get("employee")),
		"top_3_late_comers": lambda: _drill_top_fulltime_attendance(
			company, branch, department, ascending=False, limit=3
		),
		"top_3_punctual_employees": lambda: _drill_top_fulltime_attendance(
			company, branch, department, ascending=True, limit=3
		),
	}

	handler = handlers.get(card_key)
	if not handler:
		return {"title": card_key or "Detail", "columns": [], "rows": [], "error": "Unknown card"}

	payload = handler()
	payload["card_key"] = card_key
	payload["count"] = len(payload.get("rows") or [])
	return payload


def _empty_payload(from_date, to_date, company, branch, department="", employee=""):
	return {
		"filters": {
			"company": company,
			"branch": branch,
			"department": department,
			"employee": employee,
			"from_date": str(from_date),
			"to_date": str(to_date),
		},
		"attendance_records": 0,
		"employees_covered": 0,
		"total_present_days": 0.0,
		"total_working_days": 0.0,
		"total_absents": 0.0,
		"total_lates": 0.0,
		"total_half_days": 0.0,
		"total_early_goings": 0.0,
		"avg_absents_per_record": 0.0,
		"avg_lates_per_record": 0.0,
		"monthly_attendance_trend": {"labels": [], "series": []},
		"department_absents_lates": {"labels": [], "absents": [], "lates": []},
		"branch_breakdown": {"labels": [], "values": []},
		"metrics_distribution": {"labels": [], "values": []},
		"top_by_lates": [],
		"top_3_late_comers": [],
		"top_3_punctual_employees": [],
		"top_3_late_comers_count": 0,
		"top_3_punctual_employees_count": 0,
		"payroll_month_label": "",
		"top_by_absents": [],
		"leave_trend": {"labels": [], "series": []},
		"leaves_by_type": {"labels": [], "values": []},
		"leave_status_breakdown": {"labels": [], "values": []},
		"pending_leave_applications": 0,
		"approved_leave_days": 0.0,
		"active_headcount": 0,
		"new_hires": 0,
		"left_employees": 0,
		"attrition_rate": 0.0,
		"hiring_attrition_trend": {"labels": [], "series": []},
		"headcount_by_employment_type": {"labels": [], "values": []},
		"headcount_by_gender": {"labels": [], "values": []},
		"headcount_by_grade": {"labels": [], "values": []},
		"headcount_by_employee_branch": {"labels": [], "values": []},
		"headcount_by_designation": {"labels": [], "values": []},
		"headcount_by_department": {"labels": [], "values": []},
		"headcount_by_department_employment_type": {"labels": [], "series": []},
		"headcount_by_branch_employment_type": {"labels": [], "series": []},
		"headcount_by_city": {"labels": [], "values": []},
		"headcount_by_city_branch": [],
		"punctuality_late_buckets": {"labels": [], "values": []},
		"punctuality_incident_mix": {"labels": [], "values": []},
		"new_hires_this_month": 0,
		"left_employees_this_month": 0,
		"attrition_this_month": 0,
		"attrition_rate_this_month": 0.0,
		"attrition_month_label": "",
		"payroll_salary_slips_this_month": 0,
		"payroll_net_pay_this_month": 0.0,
		"new_hires_this_year": 0,
		"left_employees_this_year": 0,
		"total_left_employees": 0,
		"active_headcount_pakistan": 0,
		"active_headcount_qatar": 0,
		"probation_employees_count": 0,
		"probation_employees": [],
		"cnic_expired_count": 0,
		"cnic_expired_employees": [],
		"cnic_upcoming_count": 0,
		"cnic_upcoming_days": 30,
		"cnic_upcoming_employees": [],
		"emp_full_time_permanent": 0,
		"emp_part_time_permanent": 0,
		"emp_full_time_probation": 0,
		"emp_part_time_probation": 0,
		"emp_contract_as_per_need": 0,
		"emp_contract_fixed_salary": 0,
		"eobi_added_count": 0,
		"eobi_added_employees": [],
		"pak_qatar_enrolled_count": 0,
		"upcoming_confirmation_count": 0,
		"total_male": 0,
		"total_female": 0,
	}


EMPLOYMENT_CARD_TYPES = {
	"emp_full_time_permanent": ["Full Time -  (Permanent)"],
	"emp_part_time_permanent": ["Part Time - (Permanent)"],
	"emp_full_time_probation": ["Full Time (Probation)"],
	"emp_part_time_probation": ["Part Time (Probation)"],
	"emp_contract_fixed_salary": ["Contract Base - (Fixed Salary)"],
	"emp_contract_as_per_need": [
		"Contract Base - Consultant",
		"QPS - Contract Staff",
		"TPS - Contract Staff",
		"Teacher Training - Contract Staff",
		"CEE - Contract Staff",
		"Contract",
		"Contract - Zakat Employee",
		"Storyteller - Contract",
		"Flexible",
		"Program Director - TIF",
	],
}

FULL_TIME_EMPLOYMENT_TYPES = (
	EMPLOYMENT_CARD_TYPES["emp_full_time_permanent"] + EMPLOYMENT_CARD_TYPES["emp_full_time_probation"]
)


def _has_field(doctype, fieldname):
	try:
		return bool(frappe.get_meta(doctype).get_field(fieldname))
	except Exception:
		return False


def _months_in_range(from_date, to_date):
	"""List of (year_str, month_full_name) tuples for each calendar month in range."""
	out = []
	cur = get_first_day(from_date)
	while cur <= to_date:
		out.append((str(cur.year), calendar.month_name[cur.month]))
		cur = add_months(cur, 1)
	return out


def _payroll_period_settings():
	for doctype in ("V HR Settings", "HR Settings"):
		if not frappe.db.exists("DocType", doctype):
			continue
		doc = frappe.get_single(doctype)
		period_from = cint(getattr(doc, "period_from", None) or 0)
		period_to = cint(getattr(doc, "period_to", None) or 0)
		if period_from and period_to:
			return period_from, period_to
	return 26, 25


def _get_payroll_period_bounds(reference_date=None):
	"""Payroll month window (default 26th to 25th) containing reference_date."""
	from datetime import date as dt_date

	reference_date = getdate(reference_date or nowdate())
	period_from, period_to = _payroll_period_settings()
	year = reference_date.year
	month = reference_date.month
	if reference_date.day < period_from:
		month -= 1
		if month == 0:
			month = 12
			year -= 1

	period_start = dt_date(year, month, period_from)
	if period_to < period_from:
		next_month = month + 1
		next_year = year
		if next_month == 13:
			next_month = 1
			next_year += 1
		period_end = dt_date(next_year, next_month, period_to)
	else:
		period_end = dt_date(year, month, period_to)

	period_month = calendar.month_name[period_end.month]
	period_year = str(period_end.year)
	return period_start, period_end, period_year, period_month


def _current_payroll_ea_month_keys(reference_date=None):
	"""Employee Attendance month/year key for the current payroll period."""
	_, _, period_year, period_month = _get_payroll_period_bounds(reference_date)
	return [(period_year, period_month)]


def _ea_where_months(month_keys):
	if not month_keys:
		return "1=0", {}
	clauses = []
	params = {}
	for i, (yr, mo) in enumerate(month_keys):
		# TRIM: Select options / user data may include stray whitespace; year may be int or char.
		clauses.append(
			f"(TRIM(CAST(a.`year` AS CHAR)) = %(y{i})s AND TRIM(COALESCE(a.`month`,'')) = %(m{i})s)"
		)
		params[f"y{i}"] = (yr or "").strip()
		params[f"m{i}"] = (mo or "").strip()
	return "(" + " OR ".join(clauses) + ")", params


def _ea_join_and_where(company, branch, department, employee, month_keys):
	"""
	Build FROM-clause join + WHERE. When Company/Branch/Department filters are set, match
	`Employee Attendance` OR linked `Employee` (EA often has blank company/unit/department).
	"""
	where_m, params = _ea_where_months(month_keys)
	conditions = [where_m, "a.docstatus < 2"]

	need_join = bool(
		_has_field(EA_DOCTYPE, "employee") and (company or branch or department)
	)
	join_sql = " LEFT JOIN `tabEmployee` e ON e.name = a.employee " if need_join else " "

	if company:
		if need_join and _has_field(EA_DOCTYPE, "company"):
			conditions.append(
				"(COALESCE(NULLIF(TRIM(a.`company`), ''), NULLIF(TRIM(e.`company`), '')) = %(company)s)"
			)
		elif need_join:
			conditions.append("(e.`company` = %(company)s)")
		elif _has_field(EA_DOCTYPE, "company"):
			conditions.append("(NULLIF(TRIM(a.`company`), '') = %(company)s)")
		params["company"] = company

	if branch:
		if need_join and _has_field(EA_DOCTYPE, "unit"):
			conditions.append(
				"(COALESCE(NULLIF(TRIM(a.`unit`), ''), NULLIF(TRIM(e.`branch`), '')) = %(branch)s)"
			)
		elif need_join:
			conditions.append("(e.`branch` = %(branch)s)")
		elif _has_field(EA_DOCTYPE, "unit"):
			conditions.append("(NULLIF(TRIM(a.`unit`), '') = %(branch)s)")
		params["branch"] = branch

	if department and _has_field(EA_DOCTYPE, "department"):
		if need_join:
			conditions.append(
				"(COALESCE(NULLIF(TRIM(a.`department`), ''), NULLIF(TRIM(e.`department`), '')) = %(department)s)"
			)
		else:
			conditions.append("(NULLIF(TRIM(a.`department`), '') = %(department)s)")
		params["department"] = department

	if employee and _has_field(EA_DOCTYPE, "employee"):
		conditions.append("(a.`employee` = %(employee)s)")
		params["employee"] = employee

	return join_sql, " AND ".join(conditions), params


def _num_sql(expr_alias="a", field="present_days"):
	return f"""
		COALESCE(CAST(
			IFNULL(NULLIF(TRIM({expr_alias}.`{field}`), ''), '0')
			AS DECIMAL(18,4)
		), 0)
	"""


def _ea_count(month_keys, company, branch, department, employee):
	if not month_keys:
		return 0
	join_sql, where_sql, params = _ea_join_and_where(company, branch, department, employee, month_keys)
	row = frappe.db.sql(
		f"SELECT COUNT(a.name) AS c FROM {EA_TABLE} a {join_sql} WHERE {where_sql}",
		params,
		as_dict=True,
	)
	return cint((row or [{}])[0].get("c"))


def _ea_distinct_employees(month_keys, company, branch, department, employee):
	if not month_keys or not _has_field(EA_DOCTYPE, "employee"):
		return 0
	join_sql, where_sql, params = _ea_join_and_where(company, branch, department, employee, month_keys)
	row = frappe.db.sql(
		f"""
		SELECT COUNT(DISTINCT a.employee) AS c
		FROM {EA_TABLE} a {join_sql}
		WHERE {where_sql} AND COALESCE(a.employee,'') != ''
		""",
		params,
		as_dict=True,
	)
	return cint((row or [{}])[0].get("c"))


def _ea_sum_totals(month_keys, company, branch, department, employee):
	if not month_keys:
		return {
			"total_present_days": 0.0,
			"total_working_days": 0.0,
			"total_absents": 0.0,
			"total_lates": 0.0,
			"total_half_days": 0.0,
			"total_early_goings": 0.0,
		}
	join_sql, where_sql, params = _ea_join_and_where(company, branch, department, employee, month_keys)
	p = _num_sql("a", "present_days")
	w = _num_sql("a", "total_working_days")
	ab = _num_sql("a", "total_absents")
	lt = _num_sql("a", "total_lates")
	hd = _num_sql("a", "total_half_days")
	eg = _num_sql("a", "total_early_goings")
	row = frappe.db.sql(
		f"""
		SELECT
			SUM({p}) AS total_present_days,
			SUM({w}) AS total_working_days,
			SUM({ab}) AS total_absents,
			SUM({lt}) AS total_lates,
			SUM({hd}) AS total_half_days,
			SUM({eg}) AS total_early_goings
		FROM {EA_TABLE} a {join_sql}
		WHERE {where_sql}
		""",
		params,
		as_dict=True,
	)
	r = (row or [{}])[0]
	return {
		"total_present_days": flt(r.get("total_present_days")),
		"total_working_days": flt(r.get("total_working_days")),
		"total_absents": flt(r.get("total_absents")),
		"total_lates": flt(r.get("total_lates")),
		"total_half_days": flt(r.get("total_half_days")),
		"total_early_goings": flt(r.get("total_early_goings")),
	}


def _ea_monthly_series(month_keys, company, branch, department, employee):
	if not month_keys:
		return {"labels": [], "series": []}
	labels = []
	present = []
	absents = []
	lates = []
	halfdays = []
	for yr, mo in month_keys:
		short_label = f"{mo[:3]} {yr}"
		mk = [(yr, mo)]
		join_sql, where_sql, params = _ea_join_and_where(company, branch, department, employee, mk)
		p = _num_sql("a", "present_days")
		ab = _num_sql("a", "total_absents")
		lt = _num_sql("a", "total_lates")
		hd = _num_sql("a", "total_half_days")
		row = frappe.db.sql(
			f"""
			SELECT
				SUM({p}) AS pr,
				SUM({ab}) AS ab,
				SUM({lt}) AS lt,
				SUM({hd}) AS hd
			FROM {EA_TABLE} a {join_sql}
			WHERE {where_sql}
			""",
			params,
			as_dict=True,
		)
		r = (row or [{}])[0]
		labels.append(short_label)
		present.append(flt(r.get("pr")))
		absents.append(flt(r.get("ab")))
		lates.append(flt(r.get("lt")))
		halfdays.append(flt(r.get("hd")))
	return {
		"labels": labels,
		"series": [
			{"name": "Present Days", "data": present},
			{"name": "Absents", "data": absents},
			{"name": "Lates", "data": lates},
			{"name": "Half Days", "data": halfdays},
		],
	}


def _ea_by_department(month_keys, company, branch, department, employee, limit=12):
	if not month_keys or not _has_field(EA_DOCTYPE, "department"):
		return {"labels": [], "absents": [], "lates": []}
	join_sql, where_sql, params = _ea_join_and_where(company, branch, department, employee, month_keys)
	ab = _num_sql("a", "total_absents")
	lt = _num_sql("a", "total_lates")
	rows = frappe.db.sql(
		f"""
		SELECT
			COALESCE(NULLIF(TRIM(a.department), ''), 'Not Set') AS label,
			SUM({ab}) AS ab_sum,
			SUM({lt}) AS lt_sum
		FROM {EA_TABLE} a {join_sql}
		WHERE {where_sql}
		GROUP BY label
		HAVING ab_sum > 0 OR lt_sum > 0
		ORDER BY ab_sum DESC
		LIMIT {cint(limit)}
		""",
		params,
		as_dict=True,
	)
	return {
		"labels": [r["label"] for r in rows],
		"absents": [flt(r.get("ab_sum")) for r in rows],
		"lates": [flt(r.get("lt_sum")) for r in rows],
	}


def _ea_by_branch(month_keys, company, branch, department, employee, limit=12):
	if not month_keys or not _has_field(EA_DOCTYPE, "unit"):
		return {"labels": [], "values": []}
	join_sql, where_sql, params = _ea_join_and_where(company, branch, department, employee, month_keys)
	p = _num_sql("a", "present_days")
	rows = frappe.db.sql(
		f"""
		SELECT COALESCE(NULLIF(TRIM(a.unit), ''), 'Not Set') AS label,
			SUM({p}) AS v
		FROM {EA_TABLE} a {join_sql}
		WHERE {where_sql}
		GROUP BY label
		ORDER BY v DESC
		LIMIT {cint(limit)}
		""",
		params,
		as_dict=True,
	)
	return {"labels": [r["label"] for r in rows], "values": [flt(r.get("v")) for r in rows]}


def _ea_distribution_totals(totals):
	labels = ["Present Days", "Total Absents", "Total Lates", "Half Days", "Early Goings"]
	values = [
		flt(totals.get("total_present_days")),
		flt(totals.get("total_absents")),
		flt(totals.get("total_lates")),
		flt(totals.get("total_half_days")),
		flt(totals.get("total_early_goings")),
	]
	return {"labels": labels, "values": values}


def _punctuality_late_buckets(month_keys, company, branch, department, employee):
	"""Count employees by Σ total_lates across EA rows in range (bucketed)."""
	if not month_keys or not _has_field(EA_DOCTYPE, "total_lates") or not _has_field(EA_DOCTYPE, "employee"):
		return {"labels": [], "values": []}
	join_sql, where_sql, params = _ea_join_and_where(company, branch, department, employee, month_keys)
	late_expr = _num_sql("a", "total_lates")
	rows = frappe.db.sql(
		f"""
		SELECT bucket AS label, COUNT(*) AS c
		FROM (
			SELECT
				CASE
					WHEN t.late_sum <= 0 THEN '0 lates'
					WHEN t.late_sum <= 5 THEN '1-5 lates'
					WHEN t.late_sum <= 15 THEN '6-15 lates'
					ELSE '16+ lates'
				END AS bucket
			FROM (
				SELECT a.employee AS emp, SUM({late_expr}) AS late_sum
				FROM {EA_TABLE} a {join_sql}
				WHERE {where_sql} AND COALESCE(a.employee, '') != ''
				GROUP BY a.employee
			) AS t
		) AS x
		GROUP BY bucket
		""",
		params,
		as_dict=True,
	)
	order = ["0 lates", "1-5 lates", "6-15 lates", "16+ lates"]
	by_label = {r.get("label"): cint(r.get("c") or 0) for r in (rows or []) if r.get("label")}
	out_labels = [lbl for lbl in order if lbl in by_label]
	out_values = [by_label[lbl] for lbl in out_labels]
	for r in rows or []:
		lb = r.get("label")
		if lb and lb not in order:
			out_labels.append(lb)
			out_values.append(cint(r.get("c") or 0))
	return {"labels": out_labels, "values": out_values}


def _punctuality_incident_mix(totals):
	"""Pie-friendly totals: absents, lates, half days, early goings (Σ)."""
	labels = ["Absents", "Lates", "Half days", "Early goings"]
	values = [
		max(0.0, flt(totals.get("total_absents"))),
		max(0.0, flt(totals.get("total_lates"))),
		max(0.0, flt(totals.get("total_half_days"))),
		max(0.0, flt(totals.get("total_early_goings"))),
	]
	return {"labels": labels, "values": values}


def _ea_top_fulltime_employees(
	month_keys, company, branch, department, employee, order_field="total_lates", limit=3, ascending=False
):
	"""Top/bottom full-time employees by attendance metric for payroll month EA rows."""
	if not month_keys or not _has_field(EA_DOCTYPE, order_field) or not _has_field("Employee", "employment_type"):
		return []

	join_sql, where_sql, params = _ea_join_and_where(company, branch, department, employee, month_keys)
	if "LEFT JOIN `tabEmployee` e" not in join_sql:
		join_sql = f"{join_sql} LEFT JOIN `tabEmployee` e ON e.name = a.employee "

	where_sql = (
		f"{where_sql} AND COALESCE(e.status, '') = 'Active' "
		"AND e.employment_type IN %(employment_types)s"
	)
	params["employment_types"] = FULL_TIME_EMPLOYMENT_TYPES

	num = _num_sql("a", order_field)
	label_sql = "COALESCE(NULLIF(TRIM(a.employee_name), ''), a.employee, 'Unknown')"
	employee_sql = "COALESCE(NULLIF(TRIM(a.employee), ''), '')" if _has_field(EA_DOCTYPE, "employee") else "''"
	employment_sql = "COALESCE(NULLIF(TRIM(e.employment_type), ''), '')"
	order_sql = "ASC" if ascending else "DESC"
	rows = frappe.db.sql(
		f"""
		SELECT {label_sql} AS employee_label,
			{employee_sql} AS employee_id,
			{employment_sql} AS employment_type,
			SUM({num}) AS metric,
			COALESCE(NULLIF(TRIM(a.department), ''), NULLIF(TRIM(e.department), ''), '') AS department
		FROM {EA_TABLE} a {join_sql}
		WHERE {where_sql}
		GROUP BY employee_label, employee_id, employment_type, department
		ORDER BY metric {order_sql}, employee_label ASC
		LIMIT {cint(limit)}
		""",
		params,
		as_dict=True,
	)
	out = []
	for r in rows:
		out.append(
			{
				"employee_name": r.get("employee_label"),
				"employee_id": r.get("employee_id") or "",
				"employment_type": r.get("employment_type") or "",
				"department": r.get("department") or "—",
				"value": flt(r.get("metric")),
			}
		)
	return out


def _ea_top_employees(
	month_keys, company, branch, department, employee, order_field="total_lates", limit=10, ascending=False
):
	if not month_keys or not _has_field(EA_DOCTYPE, order_field):
		return []
	join_sql, where_sql, params = _ea_join_and_where(company, branch, department, employee, month_keys)
	num = _num_sql("a", order_field)
	label_sql = "COALESCE(NULLIF(TRIM(a.employee_name), ''), a.employee, 'Unknown')"
	employee_sql = "COALESCE(NULLIF(TRIM(a.employee), ''), '')" if _has_field(EA_DOCTYPE, "employee") else "''"
	order_sql = "ASC" if ascending else "DESC"
	rows = frappe.db.sql(
		f"""
		SELECT {label_sql} AS employee_label,
			{employee_sql} AS employee_id,
			SUM({num}) AS metric,
			COALESCE(NULLIF(TRIM(a.department), ''), '') AS department
		FROM {EA_TABLE} a {join_sql}
		WHERE {where_sql}
		GROUP BY employee_label, employee_id, department
		ORDER BY metric {order_sql}, employee_label ASC
		LIMIT {cint(limit)}
		""",
		params,
		as_dict=True,
	)
	out = []
	for r in rows:
		out.append(
			{
				"employee_name": r.get("employee_label"),
				"employee_id": r.get("employee_id") or "",
				"department": r.get("department") or "—",
				"value": flt(r.get("metric")),
			}
		)
	return out


def _leave_join_conditions(company=None, branch=None, department=None, employee=None):
	conditions = []
	params = {}
	join_employee = ""
	if not frappe.db.table_exists("Leave Application"):
		return join_employee, conditions, params

	def ensure_join():
		nonlocal join_employee
		if not join_employee:
			join_employee = "LEFT JOIN `tabEmployee` e ON e.name = la.employee"

	if company and _has_field("Employee", "company"):
		ensure_join()
		conditions.append("e.company = %(company)s")
		params["company"] = company
	if branch and _has_field("Employee", "branch"):
		ensure_join()
		conditions.append("e.branch = %(branch)s")
		params["branch"] = branch
	if department and _has_field("Employee", "department"):
		ensure_join()
		conditions.append("e.department = %(department)s")
		params["department"] = department
	if employee and _has_field("Leave Application", "employee"):
		conditions.append("la.employee = %(employee)s")
		params["employee"] = employee
	return join_employee, conditions, params


def _leave_trend(from_date, to_date, company=None, branch=None, department=None, employee=None):
	if not frappe.db.table_exists("Leave Application"):
		return {"labels": [], "series": []}
	join_employee, emp_conditions, params = _leave_join_conditions(
		company=company, branch=branch, department=department, employee=employee
	)
	params.update({"from_date": str(from_date), "to_date": str(to_date)})
	where_emp = (" AND " + " AND ".join(emp_conditions)) if emp_conditions else ""
	rows = frappe.db.sql(
		f"""
		SELECT
			DATE_FORMAT(la.from_date, '%%Y-%%m') AS m,
			COUNT(la.name) AS applications,
			SUM(COALESCE(la.total_leave_days, 0)) AS days
		FROM `tabLeave Application` la
		{join_employee}
		WHERE la.docstatus = 1
		  AND la.status = 'Approved'
		  AND la.from_date BETWEEN %(from_date)s AND %(to_date)s
		  {where_emp}
		GROUP BY m
		ORDER BY m
		""",
		params,
		as_dict=True,
	)
	labels = [r.get("m") for r in rows if r.get("m")]
	apps = [cint(r.get("applications")) for r in rows]
	days = [flt(r.get("days")) for r in rows]
	return {"labels": labels, "series": [{"name": "Applications", "data": apps}, {"name": "Leave Days", "data": days}]}


def _leaves_by_type(from_date, to_date, company=None, branch=None, department=None, employee=None, limit=10):
	if not frappe.db.table_exists("Leave Application"):
		return {"labels": [], "values": []}
	join_employee, emp_conditions, params = _leave_join_conditions(
		company=company, branch=branch, department=department, employee=employee
	)
	params.update({"from_date": str(from_date), "to_date": str(to_date)})
	where_emp = (" AND " + " AND ".join(emp_conditions)) if emp_conditions else ""
	rows = frappe.db.sql(
		f"""
		SELECT
			COALESCE(la.leave_type, 'Not Set') AS label,
			SUM(COALESCE(la.total_leave_days, 0)) AS value
		FROM `tabLeave Application` la
		{join_employee}
		WHERE la.docstatus = 1
		  AND la.status = 'Approved'
		  AND la.from_date BETWEEN %(from_date)s AND %(to_date)s
		  {where_emp}
		GROUP BY label
		ORDER BY value DESC
		LIMIT {cint(limit)}
		""",
		params,
		as_dict=True,
	)
	return {"labels": [r["label"] for r in rows], "values": [flt(r.get("value")) for r in rows]}


def _leave_status_breakdown(from_date, to_date, company=None, branch=None, department=None, employee=None):
	if not frappe.db.table_exists("Leave Application"):
		return {"labels": [], "values": []}
	join_employee, emp_conditions, params = _leave_join_conditions(
		company=company, branch=branch, department=department, employee=employee
	)
	params.update({"from_date": str(from_date), "to_date": str(to_date)})
	where_emp = (" AND " + " AND ".join(emp_conditions)) if emp_conditions else ""
	rows = frappe.db.sql(
		f"""
		SELECT COALESCE(la.status, 'Not Set') AS label, COUNT(la.name) AS c
		FROM `tabLeave Application` la
		{join_employee}
		WHERE la.docstatus < 2
		  AND la.from_date BETWEEN %(from_date)s AND %(to_date)s
		  {where_emp}
		GROUP BY label
		ORDER BY c DESC
		""",
		params,
		as_dict=True,
	)
	return {"labels": [r["label"] for r in rows], "values": [cint(r.get("c")) for r in rows]}


def _pending_leave_count(from_date, to_date, company=None, branch=None, department=None, employee=None):
	if not frappe.db.table_exists("Leave Application"):
		return 0
	join_employee, emp_conditions, params = _leave_join_conditions(
		company=company, branch=branch, department=department, employee=employee
	)
	params.update({"from_date": str(from_date), "to_date": str(to_date)})
	where_emp = (" AND " + " AND ".join(emp_conditions)) if emp_conditions else ""
	row = frappe.db.sql(
		f"""
		SELECT COUNT(la.name) AS c
		FROM `tabLeave Application` la
		{join_employee}
		WHERE la.docstatus = 1
		  AND COALESCE(la.status, '') = 'Open'
		  AND la.from_date BETWEEN %(from_date)s AND %(to_date)s
		  {where_emp}
		""",
		params,
		as_dict=True,
	)
	return cint((row or [{}])[0].get("c"))


def _approved_leave_days_sum(from_date, to_date, company=None, branch=None, department=None, employee=None):
	if not frappe.db.table_exists("Leave Application"):
		return 0.0
	join_employee, emp_conditions, params = _leave_join_conditions(
		company=company, branch=branch, department=department, employee=employee
	)
	params.update({"from_date": str(from_date), "to_date": str(to_date)})
	where_emp = (" AND " + " AND ".join(emp_conditions)) if emp_conditions else ""
	row = frappe.db.sql(
		f"""
		SELECT SUM(COALESCE(la.total_leave_days, 0)) AS s
		FROM `tabLeave Application` la
		{join_employee}
		WHERE la.docstatus = 1
		  AND la.status = 'Approved'
		  AND la.from_date BETWEEN %(from_date)s AND %(to_date)s
		  {where_emp}
		""",
		params,
		as_dict=True,
	)
	return flt((row or [{}])[0].get("s"))


def _payroll_month_summary(company, branch, department, month_start, month_end):
	"""Salary Slip counts and net pay for posting dates in [month_start, month_end]."""
	out = {
		"payroll_salary_slips_this_month": 0,
		"payroll_net_pay_this_month": 0.0,
	}
	if not frappe.db.table_exists("Salary Slip"):
		return out
	conditions = [
		"ss.docstatus = 1",
		"ss.posting_date >= %(ms)s",
		"ss.posting_date <= %(me)s",
	]
	params = {"ms": str(month_start), "me": str(month_end)}
	if company and _has_field("Salary Slip", "company"):
		conditions.append("ss.company = %(company)s")
		params["company"] = company
	if branch and _has_field("Salary Slip", "branch"):
		conditions.append("ss.branch = %(branch)s")
		params["branch"] = branch
	if department and _has_field("Salary Slip", "department"):
		conditions.append("ss.department = %(department)s")
		params["department"] = department
	where = " AND ".join(conditions)
	row = frappe.db.sql(
		f"""
		SELECT COUNT(ss.name) AS c, COALESCE(SUM(ss.net_pay), 0) AS net
		FROM `tabSalary Slip` ss
		WHERE {where}
		""",
		params,
		as_dict=True,
	)
	r = (row or [{}])[0]
	out["payroll_salary_slips_this_month"] = cint(r.get("c"))
	out["payroll_net_pay_this_month"] = flt(r.get("net"))
	return out


def _count_active_region_keyword(company, branch, department, keyword):
	"""Active employees: Country / nationality or Branch name contains keyword (e.g. Pakistan / Qatar)."""
	if not frappe.db.table_exists("Employee"):
		return 0
	kw = f"%{(keyword or '').strip().lower()}%"
	where_sql, params = _emp_filters_sql(company, branch, department)
	params["kw"] = kw

	joins = []
	ors = []
	if _has_field("Employee", "nationality") and frappe.db.table_exists("Country"):
		joins.append("LEFT JOIN `tabCountry` nat ON nat.name = e.nationality")
		ors.append(
			"(LOWER(COALESCE(nat.country_name, '')) LIKE %(kw)s OR "
			"LOWER(COALESCE(e.nationality, '')) LIKE %(kw)s)"
		)
	if frappe.db.table_exists("Branch"):
		joins.append("LEFT JOIN `tabBranch` br ON br.name = e.branch")
		# ERPNext Branch DocType uses `branch` (not `branch_name`). Keep backward-compat
		# with any custom field name by selecting a safe existing column.
		branch_label_field = (
			"branch_name"
			if _has_field("Branch", "branch_name")
			else "branch"
			if _has_field("Branch", "branch")
			else "name"
		)
		ors.append(
			f"(LOWER(COALESCE(br.`{branch_label_field}`, '')) LIKE %(kw)s OR "
			"LOWER(COALESCE(e.branch, '')) LIKE %(kw)s)"
		)
	else:
		ors.append("(LOWER(COALESCE(e.branch, '')) LIKE %(kw)s)")

	match_sql = "(" + " OR ".join(ors) + ")"
	from_join = "\n		".join(joins)

	row = frappe.db.sql(
		f"""
		SELECT COUNT(e.name) AS c
		FROM `tabEmployee` e
		{from_join}
		WHERE COALESCE(e.status, '') = 'Active' AND {where_sql}
		  AND {match_sql}
		""",
		params,
		as_dict=True,
	)
	return cint((row or [{}])[0].get("c"))


def _cnic_expired_stats_and_rows(company, branch, department, limit=25):
	"""Active employees with CNIC expiry date before today."""
	out = {"cnic_expired_count": 0, "cnic_expired_employees": []}
	if not frappe.db.table_exists("Employee") or not _has_field("Employee", "cnic_expiry"):
		return out
	today = getdate(nowdate())
	where_sql, params = _emp_filters_sql(company, branch, department)
	params["today"] = str(today)
	count_row = frappe.db.sql(
		f"""
		SELECT COUNT(*) AS c
		FROM `tabEmployee` e
		WHERE COALESCE(e.status, '') = 'Active' AND {where_sql}
		  AND e.cnic_expiry IS NOT NULL
		  AND e.cnic_expiry < %(today)s
		""",
		params,
		as_dict=True,
	)
	out["cnic_expired_count"] = cint((count_row or [{}])[0].get("c"))
	lim = cint(limit)
	rows = frappe.db.sql(
		f"""
		SELECT
			e.employee_name AS employee_name,
			e.name AS employee_id,
			COALESCE(NULLIF(TRIM(e.department), ''), '—') AS department,
			e.cnic_expiry AS cnic_expiry
		FROM `tabEmployee` e
		WHERE COALESCE(e.status, '') = 'Active' AND {where_sql}
		  AND e.cnic_expiry IS NOT NULL
		  AND e.cnic_expiry < %(today)s
		ORDER BY e.cnic_expiry ASC
		LIMIT {lim}
		""",
		params,
		as_dict=True,
	)
	for r in rows or []:
		out["cnic_expired_employees"].append(
			{
				"employee_name": r.get("employee_name") or "—",
				"employee_id": r.get("employee_id"),
				"department": r.get("department") or "—",
				"cnic_expiry": r.get("cnic_expiry"),
			}
		)
	return out


# --- Workforce: hiring, attrition, employment type (tabEmployee; org filters only) ---


def _emp_filters_sql(company, branch, department):
	"""WHERE fragment for `tabEmployee` alias e (no single-employee filter)."""
	conditions = []
	params = {}
	if company and _has_field("Employee", "company"):
		conditions.append("e.company = %(company)s")
		params["company"] = company
	if branch and _has_field("Employee", "branch"):
		conditions.append("e.branch = %(branch)s")
		params["branch"] = branch
	if department and _has_field("Employee", "department"):
		conditions.append("e.department = %(department)s")
		params["department"] = department
	if not conditions:
		return "1=1", {}
	return " AND ".join(conditions), params


def _count_total_left_employees(company, branch, department):
	"""Total employees whose status is Left (not date-range-scoped)."""
	if not frappe.db.table_exists("Employee"):
		return 0
	where_sql, params = _emp_filters_sql(company, branch, department)
	row = frappe.db.sql(
		f"""
		SELECT COUNT(e.name) AS c
		FROM `tabEmployee` e
		WHERE COALESCE(e.status, '') = 'Left' AND {where_sql}
		""",
		params,
		as_dict=True,
	)
	return cint((row or [{}])[0].get("c"))


def _cnic_upcoming_stats_and_rows(company, branch, department, today=None, days=30, limit=25):
	"""Active employees with CNIC expiry date in the next N days (inclusive)."""
	out = {"cnic_upcoming_count": 0, "cnic_upcoming_employees": []}
	if not frappe.db.table_exists("Employee") or not _has_field("Employee", "cnic_expiry"):
		return out
	today = getdate(today or nowdate())
	until = add_days(today, cint(days or 30))
	where_sql, params = _emp_filters_sql(company, branch, department)
	params.update({"today": str(today), "until": str(until)})

	count_row = frappe.db.sql(
		f"""
		SELECT COUNT(*) AS c
		FROM `tabEmployee` e
		WHERE COALESCE(e.status, '') = 'Active' AND {where_sql}
		  AND e.cnic_expiry IS NOT NULL
		  AND e.cnic_expiry BETWEEN %(today)s AND %(until)s
		""",
		params,
		as_dict=True,
	)
	out["cnic_upcoming_count"] = cint((count_row or [{}])[0].get("c"))

	lim = cint(limit)
	rows = frappe.db.sql(
		f"""
		SELECT
			e.employee_name AS employee_name,
			e.name AS employee_id,
			COALESCE(NULLIF(TRIM(e.department), ''), '—') AS department,
			e.cnic_expiry AS cnic_expiry
		FROM `tabEmployee` e
		WHERE COALESCE(e.status, '') = 'Active' AND {where_sql}
		  AND e.cnic_expiry IS NOT NULL
		  AND e.cnic_expiry BETWEEN %(today)s AND %(until)s
		ORDER BY e.cnic_expiry ASC
		LIMIT {lim}
		""",
		params,
		as_dict=True,
	)
	for r in rows or []:
		out["cnic_upcoming_employees"].append(
			{
				"employee_name": r.get("employee_name") or "—",
				"employee_id": r.get("employee_id"),
				"department": r.get("department") or "—",
				"cnic_expiry": r.get("cnic_expiry"),
			}
		)
	return out


def _count_active_employees(company, branch, department):
	if not frappe.db.table_exists("Employee"):
		return 0
	where_sql, params = _emp_filters_sql(company, branch, department)
	row = frappe.db.sql(
		f"""
		SELECT COUNT(e.name) AS c
		FROM `tabEmployee` e
		WHERE COALESCE(e.status, '') = 'Active' AND {where_sql}
		""",
		params,
		as_dict=True,
	)
	return cint((row or [{}])[0].get("c"))


def _count_active_by_gender(gender, company, branch, department):
	if not frappe.db.table_exists("Employee") or not _has_field("Employee", "gender"):
		return 0
	where_sql, params = _emp_filters_sql(company, branch, department)
	params["gender"] = gender
	row = frappe.db.sql(
		f"""
		SELECT COUNT(e.name) AS c
		FROM `tabEmployee` e
		WHERE COALESCE(e.status, '') = 'Active'
		  AND TRIM(COALESCE(e.gender, '')) = %(gender)s
		  AND {where_sql}
		""",
		params,
		as_dict=True,
	)
	return cint((row or [{}])[0].get("c"))


def _count_new_hires(from_date, to_date, company, branch, department):
	if not frappe.db.table_exists("Employee"):
		return 0
	if not _has_field("Employee", "date_of_joining"):
		return 0
	where_sql, params = _emp_filters_sql(company, branch, department)
	params.update({"from_date": str(from_date), "to_date": str(to_date)})
	row = frappe.db.sql(
		f"""
		SELECT COUNT(e.name) AS c
		FROM `tabEmployee` e
		WHERE {where_sql}
		  AND e.date_of_joining BETWEEN %(from_date)s AND %(to_date)s
		""",
		params,
		as_dict=True,
	)
	return cint((row or [{}])[0].get("c"))


def _count_left_employees(from_date, to_date, company, branch, department):
	if not frappe.db.table_exists("Employee"):
		return 0
	where_sql, params = _emp_filters_sql(company, branch, department)
	params.update({"from_date": str(from_date), "to_date": str(to_date)})

	date_field = None
	for candidate in ("relieving_date", "date_of_leaving", "date_of_resignation", "contract_end_date"):
		if _has_field("Employee", candidate):
			date_field = candidate
			break
	if not date_field:
		try:
			meta = frappe.get_meta("Employee")
			for df in meta.fields:
				if df.fieldtype != "Date":
					continue
				key = (df.fieldname or "").lower()
				if "reliev" in key or ("leave" in key and "leave_" not in key):
					date_field = df.fieldname
					break
		except Exception:
			date_field = None

	if date_field:
		row = frappe.db.sql(
			f"""
			SELECT COUNT(e.name) AS c
			FROM `tabEmployee` e
			WHERE {where_sql}
			  AND e.`{date_field}` BETWEEN %(from_date)s AND %(to_date)s
			""",
			params,
			as_dict=True,
		)
		return cint((row or [{}])[0].get("c"))

	row = frappe.db.sql(
		f"""
		SELECT COUNT(e.name) AS c
		FROM `tabEmployee` e
		WHERE {where_sql}
		  AND COALESCE(e.status, '') = 'Left'
		  AND e.modified BETWEEN %(from_date)s AND %(to_date)s
		""",
		params,
		as_dict=True,
	)
	return cint((row or [{}])[0].get("c"))


def _hiring_attrition_trend(from_date, to_date, company, branch, department):
	labels = []
	hired = []
	left_counts = []
	cur = get_first_day(from_date)
	while cur <= to_date:
		labels.append(cur.strftime("%b %Y"))
		m_from = get_first_day(cur)
		m_to = get_last_day(cur)
		hired.append(_count_new_hires(m_from, m_to, company, branch, department))
		left_counts.append(_count_left_employees(m_from, m_to, company, branch, department))
		cur = add_months(cur, 1)
	return {
		"labels": labels,
		"series": [
			{"name": "New hires", "data": hired},
			{"name": "Attrition (exits)", "data": left_counts},
		],
	}


_ALLOWED_EMP_GROUP_FIELDS = frozenset(
	{"gender", "grade", "grades", "branch", "designation", "department", "employment_type"}
)


def _employee_grade_field():
	"""Prefer custom Employee.grades (Link) over standard grade field."""
	if _has_field("Employee", "grades"):
		return "grades"
	if _has_field("Employee", "grade"):
		return "grade"
	return None


def _roman_numeral_value(roman):
	roman = (roman or "").strip().lower()
	if not roman:
		return 10**9
	values = {"i": 1, "v": 5, "x": 10, "l": 50, "c": 100}
	total = 0
	prev = 0
	for ch in reversed(roman):
		v = values.get(ch, 0)
		if not v:
			return 10**9
		if v < prev:
			total -= v
		else:
			total += v
		prev = v
	return total or 10**9


def _grade_label_sort_key(label):
	label = (label or "").strip()
	if not label or label.lower() == "not set":
		return (10**9, "", "")
	lower = label.lower()
	parts = lower.split("-", 1)
	roman = _roman_numeral_value(parts[0])
	suffix = parts[1] if len(parts) > 1 else ""
	if roman >= 10**9:
		m = re.search(r"(\d+)", lower)
		if m:
			roman = int(m.group(1))
	return (roman, suffix, lower)


def _headcount_by_grade(company, branch, department, limit=20):
	fieldname = _employee_grade_field()
	if not fieldname:
		return {"labels": [], "values": []}
	return _active_employee_group_count(fieldname, company, branch, department, limit=limit)


def _active_employee_group_count(fieldname, company, branch, department, limit=15):
	"""Group Active employees by a whitelisted Employee field (Link/Data/Select)."""
	fieldname = (fieldname or "").strip()
	if fieldname not in _ALLOWED_EMP_GROUP_FIELDS:
		return {"labels": [], "values": []}
	if not frappe.db.table_exists("Employee") or not _has_field("Employee", fieldname):
		return {"labels": [], "values": []}
	where_sql, params = _emp_filters_sql(company, branch, department)
	# Grade / grades: sort by roman numeral (ii, iii, vii-a, …) not headcount.
	if fieldname in ("grade", "grades"):
		rows = frappe.db.sql(
			f"""
			SELECT COALESCE(NULLIF(TRIM(e.`{fieldname}`), ''), 'Not set') AS label,
				COUNT(e.name) AS c
			FROM `tabEmployee` e
			WHERE COALESCE(e.status, '') = 'Active' AND {where_sql}
			GROUP BY label
			LIMIT 500
			""",
			params,
			as_dict=True,
		)

		rows = sorted(rows or [], key=lambda r: _grade_label_sort_key(r.get("label")))[: cint(limit)]
		return {"labels": [r["label"] for r in rows], "values": [cint(r.get("c")) for r in rows]}

	rows = frappe.db.sql(
		f"""
		SELECT COALESCE(NULLIF(TRIM(e.`{fieldname}`), ''), 'Not set') AS label,
			COUNT(e.name) AS c
		FROM `tabEmployee` e
		WHERE COALESCE(e.status, '') = 'Active' AND {where_sql}
		GROUP BY label
		ORDER BY c DESC
		LIMIT {cint(limit)}
		""",
		params,
		as_dict=True,
	)
	return {"labels": [r["label"] for r in rows], "values": [cint(r.get("c")) for r in rows]}


def _headcount_by_employment_type(company, branch, department, limit=12):
	return _active_employee_group_count("employment_type", company, branch, department, limit=limit)


def _headcount_stacked_by_employment_type(fieldname, company, branch, department, limit=25):
	"""Stacked headcount: group_field (department/branch) × employment_type."""
	fieldname = (fieldname or "").strip()
	if fieldname not in _ALLOWED_EMP_GROUP_FIELDS:
		return {"labels": [], "series": []}
	if not frappe.db.table_exists("Employee"):
		return {"labels": [], "series": []}
	if not _has_field("Employee", fieldname) or not _has_field("Employee", "employment_type"):
		return {"labels": [], "series": []}

	where_sql, params = _emp_filters_sql(company, branch, department)
	rows = frappe.db.sql(
		f"""
		SELECT
			COALESCE(NULLIF(TRIM(e.`{fieldname}`), ''), 'Not set') AS group_label,
			COALESCE(NULLIF(TRIM(e.employment_type), ''), 'Not set') AS employment_type,
			COUNT(e.name) AS c
		FROM `tabEmployee` e
		WHERE COALESCE(e.status, '') = 'Active' AND {where_sql}
		GROUP BY group_label, employment_type
		""",
		params,
		as_dict=True,
	)
	if not rows:
		return {"labels": [], "series": []}

	group_totals = {}
	type_totals = {}
	matrix = {}
	for row in rows:
		group_label = row.get("group_label") or "Not set"
		emp_type = row.get("employment_type") or "Not set"
		count = cint(row.get("c"))
		group_totals[group_label] = group_totals.get(group_label, 0) + count
		type_totals[emp_type] = type_totals.get(emp_type, 0) + count
		matrix.setdefault(group_label, {})
		matrix[group_label][emp_type] = matrix[group_label].get(emp_type, 0) + count

	top_groups = sorted(group_totals.keys(), key=lambda g: group_totals[g], reverse=True)[: cint(limit)]
	emp_types = sorted(type_totals.keys(), key=lambda t: type_totals[t], reverse=True)

	series = [
		{
			"name": emp_type,
			"data": [cint(matrix.get(group_label, {}).get(emp_type, 0)) for group_label in top_groups],
		}
		for emp_type in emp_types
	]
	return {"labels": top_groups, "series": series}


def _employee_city_source():
	"""
	Best-effort city source for Employee headcount.

	Priority:
	1) Employee.city / Employee.current_city / Employee.residence_city if present
	2) Address.city via Employee.current_address if available

	Returns (join_sql, city_expr_sql) or ("", None) when unavailable.
	"""
	if not frappe.db.table_exists("Employee"):
		return "", None

	for fieldname in ("city", "current_city", "residence_city"):
		if _has_field("Employee", fieldname):
			return "", f"NULLIF(TRIM(e.`{fieldname}`), '')"

	if _has_field("Employee", "current_address") and frappe.db.table_exists("Address") and _has_field("Address", "city"):
		return "LEFT JOIN `tabAddress` a ON a.name = e.current_address", "NULLIF(TRIM(a.city), '')"

	return "", None


def _active_employee_city_count(company, branch, department, limit=15):
	"""Group Active employees by City (best-effort based on available fields)."""
	join_sql, city_expr = _employee_city_source()
	if not city_expr:
		return {"labels": [], "values": []}
	where_sql, params = _emp_filters_sql(company, branch, department)
	rows = frappe.db.sql(
		f"""
		SELECT COALESCE({city_expr}, 'Not set') AS label, COUNT(e.name) AS c
		FROM `tabEmployee` e
		{join_sql}
		WHERE COALESCE(e.status, '') = 'Active' AND {where_sql}
		GROUP BY label
		ORDER BY c DESC
		LIMIT {cint(limit)}
		""",
		params,
		as_dict=True,
	)
	return {"labels": [r["label"] for r in rows], "values": [cint(r.get("c")) for r in rows]}


def _active_employee_city_branch_table(company, branch, department, limit=25):
	"""Top City+Branch combinations for Active employees (best-effort city)."""
	if not frappe.db.table_exists("Employee"):
		return []
	join_sql, city_expr = _employee_city_source()
	if not city_expr:
		return []

	where_sql, params = _emp_filters_sql(company, branch, department)
	branch_expr = "NULLIF(TRIM(e.branch), '')" if _has_field("Employee", "branch") else "NULL"
	rows = frappe.db.sql(
		f"""
		SELECT
			COALESCE({city_expr}, 'Not set') AS city,
			COALESCE({branch_expr}, 'Not set') AS branch,
			COUNT(e.name) AS c
		FROM `tabEmployee` e
		{join_sql}
		WHERE COALESCE(e.status, '') = 'Active' AND {where_sql}
		GROUP BY city, branch
		ORDER BY c DESC
		LIMIT {cint(limit)}
		""",
		params,
		as_dict=True,
	)
	return [
		{"city": r.get("city") or "Not set", "branch": r.get("branch") or "Not set", "count": cint(r.get("c"))}
		for r in (rows or [])
	]


def _probation_stats_and_rows(company, branch, department, today=None, limit=25):
	"""
	Best-effort probation tracking.

	Supported customizations (first match wins):
	- Employee.probation_end_date (Date): on probation when >= today
	- Employee.is_on_probation (Check): on probation when = 1
	- Employee.employment_type contains 'probation' (fallback)
	"""
	out = {"probation_employees_count": 0, "probation_employees": []}
	if not frappe.db.table_exists("Employee"):
		return out

	where_sql, params = _emp_filters_sql(company, branch, department)
	today = getdate(today or nowdate())
	params["today"] = str(today)

	if _has_field("Employee", "probation_end_date"):
		count_row = frappe.db.sql(
			f"""
			SELECT COUNT(e.name) AS c
			FROM `tabEmployee` e
			WHERE COALESCE(e.status, '') = 'Active' AND {where_sql}
			  AND e.probation_end_date IS NOT NULL
			  AND e.probation_end_date >= %(today)s
			""",
			params,
			as_dict=True,
		)
		out["probation_employees_count"] = cint((count_row or [{}])[0].get("c"))
		rows = frappe.db.sql(
			f"""
			SELECT
				e.employee_name AS employee_name,
				e.name AS employee_id,
				COALESCE(NULLIF(TRIM(e.department), ''), '—') AS department,
				e.probation_end_date AS probation_until
			FROM `tabEmployee` e
			WHERE COALESCE(e.status, '') = 'Active' AND {where_sql}
			  AND e.probation_end_date IS NOT NULL
			  AND e.probation_end_date >= %(today)s
			ORDER BY e.probation_end_date ASC
			LIMIT {cint(limit)}
			""",
			params,
			as_dict=True,
		)
		out["probation_employees"] = [
			{
				"employee_name": r.get("employee_name") or "—",
				"employee_id": r.get("employee_id"),
				"department": r.get("department") or "—",
				"probation_until": r.get("probation_until"),
			}
			for r in (rows or [])
		]
		return out

	if _has_field("Employee", "is_on_probation"):
		count_row = frappe.db.sql(
			f"""
			SELECT COUNT(e.name) AS c
			FROM `tabEmployee` e
			WHERE COALESCE(e.status, '') = 'Active' AND {where_sql}
			  AND COALESCE(e.is_on_probation, 0) = 1
			""",
			params,
			as_dict=True,
		)
		out["probation_employees_count"] = cint((count_row or [{}])[0].get("c"))
		rows = frappe.db.sql(
			f"""
			SELECT
				e.employee_name AS employee_name,
				e.name AS employee_id,
				COALESCE(NULLIF(TRIM(e.department), ''), '—') AS department
			FROM `tabEmployee` e
			WHERE COALESCE(e.status, '') = 'Active' AND {where_sql}
			  AND COALESCE(e.is_on_probation, 0) = 1
			ORDER BY e.employee_name ASC
			LIMIT {cint(limit)}
			""",
			params,
			as_dict=True,
		)
		out["probation_employees"] = [
			{
				"employee_name": r.get("employee_name") or "—",
				"employee_id": r.get("employee_id"),
				"department": r.get("department") or "—",
			}
			for r in (rows or [])
		]
		return out

	if _has_field("Employee", "employment_type"):
		count_row = frappe.db.sql(
			f"""
			SELECT COUNT(e.name) AS c
			FROM `tabEmployee` e
			WHERE COALESCE(e.status, '') = 'Active' AND {where_sql}
			  AND LOWER(COALESCE(e.employment_type, '')) LIKE '%%probation%%'
			""",
			params,
			as_dict=True,
		)
		out["probation_employees_count"] = cint((count_row or [{}])[0].get("c"))
		rows = frappe.db.sql(
			f"""
			SELECT
				e.employee_name AS employee_name,
				e.name AS employee_id,
				COALESCE(NULLIF(TRIM(e.department), ''), '—') AS department,
				e.employment_type AS employment_type
			FROM `tabEmployee` e
			WHERE COALESCE(e.status, '') = 'Active' AND {where_sql}
			  AND LOWER(COALESCE(e.employment_type, '')) LIKE '%%probation%%'
			ORDER BY e.employee_name ASC
			LIMIT {cint(limit)}
			""",
			params,
			as_dict=True,
		)
		out["probation_employees"] = [
			{
				"employee_name": r.get("employee_name") or "—",
				"employee_id": r.get("employee_id"),
				"department": r.get("department") or "—",
				"employment_type": r.get("employment_type") or "—",
			}
			for r in (rows or [])
		]

	return out


def _workforce_card_counts(company, branch, department):
	out = {}
	for key, types in EMPLOYMENT_CARD_TYPES.items():
		out[key] = _count_active_employment_types(company, branch, department, types)
	return out


def _count_active_employment_types(company, branch, department, employment_types):
	if not employment_types or not frappe.db.table_exists("Employee"):
		return 0
	where_sql, params = _emp_filters_sql(company, branch, department)
	placeholders = ", ".join([f"%(et{i})s" for i in range(len(employment_types))])
	for i, value in enumerate(employment_types):
		params[f"et{i}"] = value
	row = frappe.db.sql(
		f"""
		SELECT COUNT(e.name) AS c
		FROM `tabEmployee` e
		WHERE COALESCE(e.status, '') = 'Active' AND {where_sql}
		  AND e.employment_type IN ({placeholders})
		""",
		params,
		as_dict=True,
	)
	return cint((row or [{}])[0].get("c"))


def _employee_row_select_extra():
	fields = [
		"e.employee_name",
		"e.name AS employee_id",
		"COALESCE(NULLIF(TRIM(e.department), ''), '—') AS department",
	]
	if _has_field("Employee", "employment_type"):
		fields.append("e.employment_type AS employment_type")
	if _has_field("Employee", "date_of_joining"):
		fields.append("e.date_of_joining AS date_of_joining")
	if _has_field("Employee", "designation"):
		fields.append("e.designation AS designation")
	if _has_field("Employee", "branch"):
		fields.append("e.branch AS branch")
	return ", ".join(fields)


def _drill_active_employees(company, branch, department, limit=500):
	rows = _fetch_active_employee_rows(company, branch, department, limit=limit)
	return _drill_payload("Active Employees", rows)


def _drill_active_by_gender(company, branch, department, gender, limit=500):
	rows = _fetch_active_employee_rows(company, branch, department, gender=gender, limit=limit)
	return _drill_payload(f"Active Employees — {gender}", rows)


def _drill_active_employment_types(company, branch, department, employment_types, limit=500):
	rows = _fetch_active_employee_rows(
		company, branch, department, employment_types=employment_types, limit=limit
	)
	label = ", ".join(employment_types[:2]) + ("…" if len(employment_types) > 2 else "")
	return _drill_payload(f"Employees — {label}", rows)


def _fetch_active_employee_rows(company, branch, department, employment_types=None, gender=None, limit=500):
	if not frappe.db.table_exists("Employee"):
		return []
	where_sql, params = _emp_filters_sql(company, branch, department)
	type_sql = ""
	if employment_types:
		placeholders = ", ".join([f"%(et{i})s" for i in range(len(employment_types))])
		for i, value in enumerate(employment_types):
			params[f"et{i}"] = value
		type_sql = f" AND e.employment_type IN ({placeholders})"
	gender_sql = ""
	if gender and _has_field("Employee", "gender"):
		params["gender"] = gender
		gender_sql = " AND TRIM(COALESCE(e.gender, '')) = %(gender)s"
	lim = cint(limit)
	return frappe.db.sql(
		f"""
		SELECT {_employee_row_select_extra()}
		FROM `tabEmployee` e
		WHERE COALESCE(e.status, '') = 'Active' AND {where_sql}{type_sql}{gender_sql}
		ORDER BY e.employee_name ASC
		LIMIT {lim}
		""",
		params,
		as_dict=True,
	) or []


def _drill_new_hires(from_date, to_date, company, branch, department, limit=500):
	rows = _fetch_hire_rows(from_date, to_date, company, branch, department, limit=limit)
	return _drill_payload(f"New Hires ({from_date} to {to_date})", rows)


def _fetch_hire_rows(from_date, to_date, company, branch, department, limit=500):
	if not frappe.db.table_exists("Employee") or not _has_field("Employee", "date_of_joining"):
		return []
	where_sql, params = _emp_filters_sql(company, branch, department)
	params.update({"from_date": str(from_date), "to_date": str(to_date)})
	lim = cint(limit)
	return frappe.db.sql(
		f"""
		SELECT {_employee_row_select_extra()}
		FROM `tabEmployee` e
		WHERE {where_sql}
		  AND e.date_of_joining BETWEEN %(from_date)s AND %(to_date)s
		ORDER BY e.date_of_joining DESC, e.employee_name ASC
		LIMIT {lim}
		""",
		params,
		as_dict=True,
	) or []


def _drill_left_employees(from_date, to_date, company, branch, department, limit=500):
	rows = _fetch_left_rows(from_date, to_date, company, branch, department, limit=limit)
	return _drill_payload(f"Left Employees ({from_date} to {to_date})", rows)


def _fetch_left_rows(from_date, to_date, company, branch, department, limit=500):
	if not frappe.db.table_exists("Employee"):
		return []
	where_sql, params = _emp_filters_sql(company, branch, department)
	params.update({"from_date": str(from_date), "to_date": str(to_date)})

	date_field = None
	for candidate in ("relieving_date", "date_of_leaving", "date_of_resignation", "contract_end_date"):
		if _has_field("Employee", candidate):
			date_field = candidate
			break

	lim = cint(limit)
	if date_field:
		rows = frappe.db.sql(
			f"""
			SELECT {_employee_row_select_extra()}, e.`{date_field}` AS exit_date, e.status AS status
			FROM `tabEmployee` e
			WHERE {where_sql}
			  AND e.`{date_field}` BETWEEN %(from_date)s AND %(to_date)s
			ORDER BY e.`{date_field}` DESC, e.employee_name ASC
			LIMIT {lim}
			""",
			params,
			as_dict=True,
		)
	else:
		rows = frappe.db.sql(
			f"""
			SELECT {_employee_row_select_extra()}, e.modified AS exit_date, e.status AS status
			FROM `tabEmployee` e
			WHERE {where_sql}
			  AND COALESCE(e.status, '') = 'Left'
			  AND DATE(e.modified) BETWEEN %(from_date)s AND %(to_date)s
			ORDER BY e.modified DESC, e.employee_name ASC
			LIMIT {lim}
			""",
			params,
			as_dict=True,
		)
	return rows or []


def _eobi_added_stats(company, branch, department, limit=500):
	out = {"eobi_added_count": 0, "eobi_added_employees": []}
	if not frappe.db.table_exists("Employee") or not _has_field("Employee", "eobi"):
		return out
	rows = _fetch_eobi_added_rows(company, branch, department, limit=limit)
	out["eobi_added_count"] = len(rows)
	out["eobi_added_employees"] = rows[:25]
	return out


def _fetch_eobi_added_rows(company, branch, department, limit=500):
	where_sql, params = _emp_filters_sql(company, branch, department)
	lim = cint(limit)
	return frappe.db.sql(
		f"""
		SELECT {_employee_row_select_extra()}, e.eobi AS eobi
		FROM `tabEmployee` e
		WHERE COALESCE(e.status, '') = 'Active' AND {where_sql}
		  AND UPPER(COALESCE(NULLIF(TRIM(e.eobi), ''), '')) NOT IN ('', '-', 'N/A', 'NA', 'NONE', 'NIL', 'NO')
		ORDER BY e.employee_name ASC
		LIMIT {lim}
		""",
		params,
		as_dict=True,
	) or []


def _drill_eobi_added(company, branch, department, limit=500):
	rows = _fetch_eobi_added_rows(company, branch, department, limit=limit)
	return _drill_payload("EOBI Added", rows)


def _pak_qatar_enrolled_stats(company, branch, department, limit=500):
	out = {"pak_qatar_enrolled_count": 0, "pak_qatar_enrolled_employees": []}
	if not frappe.db.table_exists("Employee"):
		return out
	rows = _fetch_pak_qatar_rows(company, branch, department, limit=limit)
	out["pak_qatar_enrolled_count"] = len(rows)
	out["pak_qatar_enrolled_employees"] = rows[:25]
	return out


def _pak_qatar_match_sql():
	ors = []
	if _has_field("Employee", "health_insurance_provider"):
		ors.append("LOWER(COALESCE(e.health_insurance_provider, '')) LIKE '%%pak qatar%%'")
	if _has_field("Employee", "medical_card"):
		ors.append("COALESCE(e.medical_card, '') = 'Yes'")
	if not ors:
		return "1=0"
	return "(" + " OR ".join(ors) + ")"


def _fetch_pak_qatar_rows(company, branch, department, limit=500):
	where_sql, params = _emp_filters_sql(company, branch, department)
	match_sql = _pak_qatar_match_sql()
	extra = []
	if _has_field("Employee", "health_insurance_provider"):
		extra.append("e.health_insurance_provider AS health_insurance_provider")
	if _has_field("Employee", "medical_card"):
		extra.append("e.medical_card AS medical_card")
	extra_sql = (", " + ", ".join(extra)) if extra else ""
	lim = cint(limit)
	return frappe.db.sql(
		f"""
		SELECT {_employee_row_select_extra()}{extra_sql}
		FROM `tabEmployee` e
		WHERE COALESCE(e.status, '') = 'Active' AND {where_sql}
		  AND {match_sql}
		ORDER BY e.employee_name ASC
		LIMIT {lim}
		""",
		params,
		as_dict=True,
	) or []


def _drill_pak_qatar_enrolled(company, branch, department, limit=500):
	rows = _fetch_pak_qatar_rows(company, branch, department, limit=limit)
	return _drill_payload("Pak Qatar Enrolled (Health Card / Insurance)", rows)


def _upcoming_confirmation_stats(company, branch, department, today=None, days=60, limit=500):
	out = {"upcoming_confirmation_count": 0, "upcoming_confirmation_employees": []}
	if not frappe.db.table_exists("Employee") or not _has_field("Employee", "scheduled_confirmation_date"):
		return out
	rows = _fetch_upcoming_confirmation_rows(company, branch, department, today=today, days=days, limit=limit)
	out["upcoming_confirmation_count"] = len(rows)
	out["upcoming_confirmation_employees"] = rows[:25]
	return out


def _fetch_upcoming_confirmation_rows(company, branch, department, today=None, days=60, limit=500):
	today = getdate(today or nowdate())
	until = add_days(today, cint(days or 60))
	where_sql, params = _emp_filters_sql(company, branch, department)
	params.update({"today": str(today), "until": str(until)})
	lim = cint(limit)
	return frappe.db.sql(
		f"""
		SELECT {_employee_row_select_extra()}, e.scheduled_confirmation_date AS scheduled_confirmation_date
		FROM `tabEmployee` e
		WHERE COALESCE(e.status, '') = 'Active' AND {where_sql}
		  AND e.scheduled_confirmation_date IS NOT NULL
		  AND e.scheduled_confirmation_date BETWEEN %(today)s AND %(until)s
		ORDER BY e.scheduled_confirmation_date ASC, e.employee_name ASC
		LIMIT {lim}
		""",
		params,
		as_dict=True,
	) or []


def _drill_upcoming_confirmation(company, branch, department, today=None, days=60, limit=500):
	rows = _fetch_upcoming_confirmation_rows(company, branch, department, today=today, days=days, limit=limit)
	return _drill_payload("Upcoming Confirmation", rows)


def _drill_cnic_expired(company, branch, department, limit=500):
	stats = _cnic_expired_stats_and_rows(company, branch, department, limit=limit)
	return _drill_payload("CNIC Expired", stats.get("cnic_expired_employees") or [])


def _drill_cnic_upcoming(company, branch, department, today=None, days=30, limit=500):
	stats = _cnic_upcoming_stats_and_rows(company, branch, department, today=today, days=days, limit=limit)
	return _drill_payload(f"CNIC Expiring (next {days} days)", stats.get("cnic_upcoming_employees") or [])


def _drill_attendance_records(from_date, to_date, company, branch, department, employee, limit=500):
	month_keys = _months_in_range(from_date, to_date)
	if not month_keys:
		return _drill_payload("Attendance Records", [])
	join_sql, where_sql, params = _ea_join_and_where(company, branch, department, employee, month_keys)
	lim = cint(limit)
	rows = frappe.db.sql(
		f"""
		SELECT
			a.name AS attendance_id,
			COALESCE(NULLIF(TRIM(a.employee_name), ''), a.employee, '—') AS employee_name,
			a.employee AS employee_id,
			COALESCE(NULLIF(TRIM(a.department), ''), '—') AS department,
			CONCAT(TRIM(COALESCE(a.month, '')), ' ', TRIM(COALESCE(a.year, ''))) AS period,
			a.docstatus AS docstatus
		FROM {EA_TABLE} a {join_sql}
		WHERE {where_sql}
		ORDER BY a.year DESC, a.month DESC, a.employee_name ASC
		LIMIT {lim}
		""",
		params,
		as_dict=True,
	) or []
	return _drill_payload("Attendance Records", rows)


def _drill_employees_covered(from_date, to_date, company, branch, department, employee, limit=500):
	month_keys = _months_in_range(from_date, to_date)
	if not month_keys or not _has_field(EA_DOCTYPE, "employee"):
		return _drill_payload("Employees Covered", [])
	join_sql, where_sql, params = _ea_join_and_where(company, branch, department, employee, month_keys)
	lim = cint(limit)
	rows = frappe.db.sql(
		f"""
		SELECT
			COALESCE(NULLIF(TRIM(a.employee_name), ''), a.employee, '—') AS employee_name,
			a.employee AS employee_id,
			COALESCE(NULLIF(TRIM(a.department), ''), '—') AS department,
			COUNT(a.name) AS attendance_records
		FROM {EA_TABLE} a {join_sql}
		WHERE {where_sql} AND COALESCE(a.employee, '') != ''
		GROUP BY employee_name, employee_id, department
		ORDER BY attendance_records DESC, employee_name ASC
		LIMIT {lim}
		""",
		params,
		as_dict=True,
	) or []
	return _drill_payload("Employees Covered", rows)


def _drill_pending_leaves(from_date, to_date, company, branch, department, employee, limit=500):
	if not frappe.db.table_exists("Leave Application"):
		return _drill_payload("Open Leave Applications", [])
	join_employee, emp_conditions, params = _leave_join_conditions(
		company=company, branch=branch, department=department, employee=employee
	)
	params.update({"from_date": str(from_date), "to_date": str(to_date)})
	where_emp = (" AND " + " AND ".join(emp_conditions)) if emp_conditions else ""
	lim = cint(limit)
	rows = frappe.db.sql(
		f"""
		SELECT
			la.name AS leave_application,
			COALESCE(NULLIF(TRIM(la.employee_name), ''), la.employee, '—') AS employee_name,
			la.employee AS employee_id,
			COALESCE(la.leave_type, '—') AS leave_type,
			la.from_date AS from_date,
			la.to_date AS to_date,
			COALESCE(la.total_leave_days, 0) AS total_leave_days,
			COALESCE(la.status, '—') AS status
		FROM `tabLeave Application` la
		{join_employee}
		WHERE la.docstatus = 1
		  AND COALESCE(la.status, '') = 'Open'
		  AND la.from_date BETWEEN %(from_date)s AND %(to_date)s
		  {where_emp}
		ORDER BY la.from_date DESC
		LIMIT {lim}
		""",
		params,
		as_dict=True,
	) or []
	return _drill_payload("Open Leave Applications", rows)


def _drill_top_fulltime_attendance(company, branch, department, ascending=False, limit=3):
	period_start, period_end, _, _ = _get_payroll_period_bounds()
	month_keys = _current_payroll_ea_month_keys()
	rows = _ea_top_fulltime_employees(
		month_keys,
		company,
		branch,
		department,
		"",
		order_field="total_lates",
		limit=limit,
		ascending=ascending,
	)
	title = (
		"Top 3 Punctual Employees (Full Time)"
		if ascending
		else "Top 3 Late Comers (Full Time)"
	)
	return _drill_payload(
		f"{title} — {formatdate(period_start, 'dd MMM yyyy')} to {formatdate(period_end, 'dd MMM yyyy')}",
		rows,
	)


def _drill_payload(title, rows):
	columns = _columns_from_rows(rows)
	return {"title": title, "columns": columns, "rows": rows or []}


def _columns_from_rows(rows):
	if not rows:
		return [
			{"key": "employee_name", "label": "Employee"},
			{"key": "employee_id", "label": "Employee ID"},
			{"key": "department", "label": "Department"},
		]
	label_map = {
		"employee_name": "Employee",
		"employee_id": "Employee ID",
		"department": "Department",
		"employment_type": "Employment Type",
		"date_of_joining": "Joining Date",
		"designation": "Designation",
		"branch": "Branch",
		"exit_date": "Exit Date",
		"status": "Status",
		"cnic_expiry": "CNIC Expiry",
		"scheduled_confirmation_date": "Confirmation Date",
		"eobi": "EOBI",
		"health_insurance_provider": "Health Insurance",
		"medical_card": "Medical Card",
		"attendance_id": "Attendance ID",
		"period": "Period",
		"docstatus": "Docstatus",
		"attendance_records": "Records",
		"leave_application": "Leave Application",
		"leave_type": "Leave Type",
		"from_date": "From Date",
		"to_date": "To Date",
		"total_leave_days": "Leave Days",
		"value": "Σ Lates",
	}
	columns = []
	for key in rows[0].keys():
		fmt = None
		if key in ("date_of_joining", "exit_date", "cnic_expiry", "scheduled_confirmation_date", "from_date", "to_date"):
			fmt = "Date"
		elif key in ("attendance_records", "docstatus"):
			fmt = "Int"
		elif key == "total_leave_days":
			fmt = "Float"
		elif key == "value":
			fmt = "Float"
		columns.append(
			{
				"key": key,
				"label": label_map.get(key, key.replace("_", " ").title()),
				"format": fmt,
			}
		)
	return columns
