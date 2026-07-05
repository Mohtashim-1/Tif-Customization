import json

import frappe
from frappe import _
from frappe.utils import add_days, cint, flt, getdate, today


@frappe.whitelist()
def get_late_coming_report_data(filters=None):
	"""Employee-wise late count and total late minutes from Employee Attendance."""
	try:
		if isinstance(filters, str):
			filters = json.loads(filters)
		filters = filters or {}

		from_date = getdate(filters.get("from_date") or add_days(today(), -30))
		to_date = getdate(filters.get("to_date") or today())
		if from_date > to_date:
			frappe.throw(_("From Date cannot be after To Date."))

		params = {"from_date": from_date, "to_date": to_date}
		where = [
			"eat.late = 1",
			"eat.date BETWEEN %(from_date)s AND %(to_date)s",
			"emp.status = 'Active'",
		]

		if filters.get("company"):
			where.append("emp.company = %(company)s")
			params["company"] = filters["company"]

		if filters.get("department"):
			where.append("emp.department = %(department)s")
			params["department"] = filters["department"]

		if filters.get("branch"):
			where.append("emp.branch = %(branch)s")
			params["branch"] = filters["branch"]

		if filters.get("employee"):
			where.append("ea.employee = %(employee)s")
			params["employee"] = filters["employee"]

		where_clause = " AND ".join(where)

		detail_rows = frappe.db.sql(
			f"""
			SELECT
				ea.employee,
				COALESCE(NULLIF(TRIM(ea.employee_name), ''), emp.employee_name, ea.employee) AS employee_name,
				COALESCE(NULLIF(TRIM(emp.department), ''), ea.department, '') AS department,
				COALESCE(emp.designation, '') AS designation,
				emp.branch,
				ea.name AS attendance_id,
				ea.month,
				ea.year,
				eat.date,
				eat.day,
				eat.check_in_1,
				eat.late_coming_hours,
				COALESCE(TIME_TO_SEC(eat.late_coming_hours), 0) / 60 AS late_minutes
			FROM `tabEmployee Attendance Table` eat
			INNER JOIN `tabEmployee Attendance` ea ON ea.name = eat.parent
			INNER JOIN `tabEmployee` emp ON emp.name = ea.employee
			WHERE {where_clause}
			ORDER BY ea.employee, eat.date
			""",
			params,
			as_dict=True,
		)

		employees = {}
		for row in detail_rows:
			emp_id = row.employee
			if emp_id not in employees:
				employees[emp_id] = {
					"employee": emp_id,
					"employee_name": row.employee_name,
					"department": row.department or "",
					"designation": row.designation or "",
					"branch": row.branch or "",
					"total_lates": 0,
					"total_late_minutes": 0.0,
					"late_days": [],
				}

			late_minutes = flt(row.late_minutes)
			employees[emp_id]["total_lates"] += 1
			employees[emp_id]["total_late_minutes"] += late_minutes
			employees[emp_id]["late_days"].append(
				{
					"date": row.date,
					"day": row.day or "",
					"check_in": row.check_in_1 or "",
					"late_coming_hours": _format_time(row.late_coming_hours),
					"late_minutes": late_minutes,
					"attendance_id": row.attendance_id,
					"month": row.month,
					"year": row.year,
				}
			)

		result_rows = sorted(
			employees.values(),
			key=lambda r: (-r["total_lates"], -r["total_late_minutes"], r["employee_name"] or r["employee"]),
		)

		for row in result_rows:
			row["total_late_minutes"] = flt(row["total_late_minutes"])
			row["late_minutes_label"] = _minutes_label(row["total_late_minutes"])
			row["monthly_history"] = _build_monthly_history(row["late_days"])

		summary = _build_summary(result_rows)
		return {"rows": result_rows, "summary": summary}
	except Exception:
		frappe.log_error(frappe.get_traceback(), "Late Coming Report Error")
		return {
			"error": _("Failed to load Late Coming Report."),
			"rows": [],
			"summary": _empty_summary(),
		}


@frappe.whitelist()
def get_filter_options():
	departments = frappe.get_all(
		"Employee",
		filters={"status": "Active"},
		pluck="department",
		distinct=True,
		order_by="department",
	)
	branches = []
	if frappe.db.has_column("Employee", "branch"):
		branches = frappe.get_all(
			"Employee",
			filters={"status": "Active"},
			pluck="branch",
			distinct=True,
			order_by="branch",
		)
	companies = frappe.get_all("Company", pluck="name", order_by="name")
	return {
		"departments": sorted({d for d in departments if d}),
		"branches": sorted({b for b in branches if b}),
		"companies": companies,
	}


def _format_time(value):
	if not value:
		return ""
	if hasattr(value, "strftime"):
		return value.strftime("%H:%M:%S")
	return str(value).split(".")[0]


def _minutes_label(minutes):
	minutes = cint(flt(minutes))
	hours = minutes // 60
	mins = minutes % 60
	if hours and mins:
		return f"{hours}h {mins}m"
	if hours:
		return f"{hours}h"
	return f"{mins}m"


def _build_monthly_history(late_days):
	"""Group late days by calendar month for employee history view."""
	months = {}
	for day in late_days or []:
		dt = getdate(day.get("date"))
		if not dt:
			continue
		key = dt.strftime("%Y-%m")
		if key not in months:
			months[key] = {
				"month_key": key,
				"month_label": dt.strftime("%B %Y"),
				"year": dt.year,
				"month": dt.strftime("%B"),
				"late_count": 0,
				"days": [],
			}
		months[key]["late_count"] += 1
		months[key]["days"].append(day)

	return sorted(months.values(), key=lambda row: row["month_key"])


def _empty_summary():
	return {
		"total_employees": 0,
		"total_lates": 0,
		"total_late_minutes": 0.0,
	}


def _build_summary(rows):
	return {
		"total_employees": len(rows),
		"total_lates": cint(sum(r["total_lates"] for r in rows)),
		"total_late_minutes": flt(sum(r["total_late_minutes"] for r in rows)),
	}
