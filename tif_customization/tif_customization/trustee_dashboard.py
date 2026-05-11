import json

import frappe
from frappe.utils import cint, getdate, nowdate


def _has_field(doctype, fieldname):
	try:
		return bool(frappe.get_meta(doctype).get_field(fieldname))
	except Exception:
		return False


@frappe.whitelist()
def get_my_attendance_summary(filters=None):
	"""Return current user's attendance summary for a date range.

	Security: does not allow passing an employee; always resolves employee for current session user.
	"""
	if frappe.session.user == "Guest":
		frappe.throw("Not permitted", frappe.PermissionError)

	if isinstance(filters, str):
		filters = json.loads(filters or "{}")
	filters = filters or {}

	if not frappe.db.exists("DocType", "Employee") or not frappe.db.table_exists("Employee"):
		return {"employee": None, "rows": [], "counts": {}, "note": "Employee doctype not found"}

	user_field = "user_id" if _has_field("Employee", "user_id") else "user" if _has_field("Employee", "user") else None
	if not user_field:
		return {"employee": None, "rows": [], "counts": {}, "note": "Employee-user link field not found"}

	employee = frappe.db.get_value("Employee", {user_field: frappe.session.user}, "name")
	employee_name = frappe.db.get_value("Employee", employee, "employee_name") if employee else None
	if not employee:
		return {"employee": None, "rows": [], "counts": {}, "note": "No Employee linked to this user"}

	from_date = getdate(filters.get("from_date") or nowdate())
	to_date = getdate(filters.get("to_date") or nowdate())
	if from_date > to_date:
		from_date, to_date = to_date, from_date

	if not frappe.db.exists("DocType", "Attendance") or not frappe.db.table_exists("Attendance"):
		return {
			"employee": employee,
			"employee_name": employee_name,
			"rows": [],
			"counts": {},
			"note": "Attendance doctype not found",
		}

	status_field = "status" if _has_field("Attendance", "status") else None
	date_field = "attendance_date" if _has_field("Attendance", "attendance_date") else None
	if not (status_field and date_field and _has_field("Attendance", "employee")):
		return {
			"employee": employee,
			"employee_name": employee_name,
			"rows": [],
			"counts": {},
			"note": "Attendance fields not found",
		}

	rows = frappe.db.sql(
		f"""
		SELECT
			a.name AS name,
			a.`{date_field}` AS attendance_date,
			a.`{status_field}` AS status
		FROM `tabAttendance` a
		WHERE a.docstatus < 2
		  AND a.employee = %(employee)s
		  AND a.`{date_field}` BETWEEN %(from_date)s AND %(to_date)s
		ORDER BY a.`{date_field}` DESC
		LIMIT {cint(filters.get("limit") or 60)}
		""",
		{"employee": employee, "from_date": str(from_date), "to_date": str(to_date)},
		as_dict=True,
	)

	counts = {}
	for r in rows or []:
		st = (r.get("status") or "Not set").strip() or "Not set"
		counts[st] = cint(counts.get(st)) + 1

	return {
		"employee": employee,
		"employee_name": employee_name,
		"from_date": str(from_date),
		"to_date": str(to_date),
		"rows": rows or [],
		"counts": counts,
		"note": "",
	}

