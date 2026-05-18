import datetime

import frappe
from frappe.utils import getdate


def _time_to_seconds(value):
	if not value:
		return 0
	if isinstance(value, datetime.timedelta):
		return int(value.total_seconds())
	if isinstance(value, datetime.time):
		return value.hour * 3600 + value.minute * 60 + value.second
	s = str(value).strip()
	if not s or s in ("00:00", "00:00:00"):
		return 0
	parts = s.split(":")
	try:
		h = int(parts[0] or 0)
		m = int(parts[1] or 0)
		sec = int(float(parts[2])) if len(parts) >= 3 and parts[2] else 0
		return h * 3600 + m * 60 + sec
	except Exception:
		return 0


def _seconds_to_hhmm(seconds: int) -> str:
	seconds = max(0, int(seconds or 0))
	h, rem = divmod(seconds, 3600)
	m, s = divmod(rem, 60)
	return f"{h:02d}:{m:02d}:{s:02d}"


@frappe.whitelist()
def get_individual_attendance_sheet_html(employee: str, from_date: str, to_date: str):
	"""Render the Individual Attendance Sheet (range-based) as HTML."""
	if not employee:
		frappe.throw("Employee is required")
	if not from_date or not to_date:
		frappe.throw("From Date and To Date are required")

	from_dt = getdate(from_date)
	to_dt = getdate(to_date)
	if to_dt < from_dt:
		frappe.throw("To Date cannot be before From Date")

	rows = frappe.db.sql(
		"""
		SELECT
			c.date,
			c.day,
			c.check_in_1,
			c.check_out_1,
			c.late_sitting,
			c.late_coming_hours,
			c.early_going_hours,
			c.shift_start,
			c.shift_end,
			c.difference,
			c.public_holiday,
			c.weekly_off,
			c.half_day,
			c.absent,
			c.late,
			c.per_day_hour,
			c.early_overtime,
			c.approved_ot1
		FROM `tabEmployee Attendance Table` c
		INNER JOIN `tabEmployee Attendance` p ON p.name = c.parent
		WHERE p.employee = %(employee)s
			AND c.date BETWEEN %(from)s AND %(to)s
		ORDER BY c.date ASC
		""",
		{"employee": employee, "from": from_dt, "to": to_dt},
		as_dict=True,
	)

	emp = frappe.db.get_value(
		"Employee",
		employee,
		[
			"employee_name",
			"department",
			"designation",
			"date_of_joining",
			"company",
			"attendance_device_id",
			"cnic",
		],
		as_dict=True,
	) or {}

	month_label = from_dt.strftime("%B")
	year_label = str(from_dt.year)
	period_label = f"{from_dt.strftime('%d-%m-%Y')} to {to_dt.strftime('%d-%m-%Y')}"

	month_days = (to_dt - from_dt).days + 1
	total_absents = sum(1 for r in rows if (r.get("absent") or 0) == 1)
	total_half_days = sum(1 for r in rows if (r.get("half_day") or 0) == 1)
	total_lates = sum(1 for r in rows if (r.get("late") or 0) == 1)
	off_days = sum(
		1
		for r in rows
		if (r.get("public_holiday") or 0) == 1
		or (r.get("weekly_off") or 0) == 1
		or (r.get("day") == "Sunday")
	)
	present_days = sum(1 for r in rows if r.get("check_in_1") and r.get("check_out_1") and (r.get("absent") or 0) != 1)

	total_early_seconds = sum(_time_to_seconds(r.get("early_going_hours")) for r in rows)
	total_early_going_hours = _seconds_to_hhmm(total_early_seconds)

	doc = frappe._dict(
		{
			"employee": employee,
			"employee_name": emp.get("employee_name") or "",
			"department": emp.get("department") or "",
			"designation": emp.get("designation") or "",
			"date_of_joining": emp.get("date_of_joining") or "",
			"company": emp.get("company") or "",
			"biometric_id": emp.get("attendance_device_id") or "",
			"cnic": emp.get("cnic") or "",
			"month": month_label,
			"year": year_label,
			"period_label": period_label,
			"month_days": month_days,
			"present_days": present_days,
			"no_of_sundays": off_days,
			"total_absents": total_absents,
			"total_half_days": total_half_days,
			"total_lates": total_lates,
			"total_early_going_hours": total_early_going_hours,
			"table1": rows,
		}
	)

	html = frappe.render_template(
		"tif_customization/templates/attendance/individual_attendance_sheet.html",
		{"doc": doc},
	)
	return {"html": html}

