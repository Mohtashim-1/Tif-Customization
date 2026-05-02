"""Attendance & Leave dashboard — aggregates `Employee Attendance` and Leave Application."""

import calendar
import json

import frappe
from frappe.utils import add_months, cint, flt, get_first_day, getdate, nowdate


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
	data["top_by_lates"] = _ea_top_employees(month_keys, company, branch, department, employee, order_field="total_lates", limit=12)
	data["top_by_absents"] = _ea_top_employees(month_keys, company, branch, department, employee, order_field="total_absents", limit=12)

	data["leave_trend"] = _leave_trend(from_date, to_date, company=company, branch=branch, department=department, employee=employee)
	data["leaves_by_type"] = _leaves_by_type(from_date, to_date, company=company, branch=branch, department=department, employee=employee)
	data["leave_status_breakdown"] = _leave_status_breakdown(from_date, to_date, company=company, branch=branch, department=department, employee=employee)
	data["pending_leave_applications"] = _pending_leave_count(from_date, to_date, company=company, branch=branch, department=department, employee=employee)
	data["approved_leave_days"] = _approved_leave_days_sum(from_date, to_date, company=company, branch=branch, department=department, employee=employee)

	return data


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
		"top_by_absents": [],
		"leave_trend": {"labels": [], "series": []},
		"leaves_by_type": {"labels": [], "values": []},
		"leave_status_breakdown": {"labels": [], "values": []},
		"pending_leave_applications": 0,
		"approved_leave_days": 0.0,
	}


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


def _ea_top_employees(month_keys, company, branch, department, employee, order_field="total_lates", limit=10):
	if not month_keys or not _has_field(EA_DOCTYPE, order_field):
		return []
	join_sql, where_sql, params = _ea_join_and_where(company, branch, department, employee, month_keys)
	num = _num_sql("a", order_field)
	label_sql = "COALESCE(NULLIF(TRIM(a.employee_name), ''), a.employee, 'Unknown')"
	rows = frappe.db.sql(
		f"""
		SELECT {label_sql} AS employee_label,
			SUM({num}) AS metric,
			COALESCE(NULLIF(TRIM(a.department), ''), '') AS department
		FROM {EA_TABLE} a {join_sql}
		WHERE {where_sql}
		GROUP BY employee_label, department
		ORDER BY metric DESC
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
