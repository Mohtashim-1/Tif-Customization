import frappe
from frappe.utils import getdate


def _has_approved_leave(employee, row_date):
	return frappe.db.exists(
		"Leave Application",
		{
			"employee": employee,
			"from_date": ("<=", row_date),
			"to_date": (">=", row_date),
			"status": "Approved",
			"docstatus": 1,
		},
	)


@frappe.whitelist()
def validate_sat_attendance(doc, method):
	"""
	Saturday half-day rules for permanent staff.
	Leave days use mark_leave only — never the Half Day checkbox.
	Does not overwrite totals (main validate is authoritative).
	"""
	employment = (doc.employment_type or "").replace(" ", "")
	if employment not in ("FullTime-(Permanent)", "FullTime(Probation)"):
		return

	for row in doc.table1:
		row_date = getdate(row.date)
		if _has_approved_leave(doc.employee, row_date):
			row.mark_leave = 1
			row.absent = 0
			row.half_day = 0
			row.late = 0
			row.early = 0
			continue

		if row.weekly_off:
			continue

		if row_date.weekday() != 5:
			continue

		# Saturday working rules
		if row.check_in_1 and row.check_out_1:
			from datetime import datetime, date

			in_time = datetime.strptime(str(row.check_in_1), "%H:%M:%S").time()
			out_time = datetime.strptime(str(row.check_out_1), "%H:%M:%S").time()
			in_dt = datetime.combine(date.min, in_time)
			out_dt = datetime.combine(date.min, out_time)
			total_hours = (out_dt - in_dt).total_seconds() / 3600
			if total_hours >= 3:
				row.sat_halfday = 1
				row.half_day = 0
			else:
				row.sat_halfday = 0
				row.half_day = 1
		else:
			row.sat_halfday = 0
			row.half_day = 1
			row.absent = 0
