import frappe
from frappe.utils import cint, getdate


def _is_half_day_leave_on_date(employee, row_date):
	"""Approved half-day leave covering this exact date."""
	row_date = getdate(row_date)
	apps = frappe.get_all(
		"Leave Application",
		filters={
			"employee": employee,
			"from_date": ("<=", row_date),
			"to_date": (">=", row_date),
			"status": "Approved",
			"docstatus": 1,
		},
		fields=["half_day", "half_day_date"],
		limit=1,
	)
	if not apps:
		return False, False

	la = apps[0]
	is_half = bool(
		cint(la.half_day) and la.half_day_date and getdate(la.half_day_date) == row_date
	)
	return True, is_half


@frappe.whitelist()
def validate_sat_attendance(doc, method):
	"""
	Saturday half-day rules for permanent staff.
	Full-day leave: mark_leave only (no late/early/half_day).
	Half-day leave with punches: keep half_day + late from main recalculate.
	Does not overwrite totals (main validate is authoritative).
	"""
	employment = (doc.employment_type or "").replace(" ", "")
	if employment not in ("FullTime-(Permanent)", "FullTime(Probation)"):
		return

	for row in doc.table1:
		row_date = getdate(row.date)
		has_leave, is_half_day_leave = _is_half_day_leave_on_date(doc.employee, row_date)
		if has_leave:
			row.mark_leave = 1
			row.absent = 0
			if is_half_day_leave:
				# Worked half can still be late; early going only if within exit grace (~after 4 PM)
				row.half_day = 1
				if not row.check_in_1:
					row.late = 0
					row.early = 0
			else:
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

	# Keep parent totals in sync with any flag changes above
	doc.total_lates = sum(1 for row in doc.table1 if cint(row.late))
	doc.total_early_goings = sum(1 for row in doc.table1 if cint(row.early))
	doc.total_half_days = sum(cint(row.half_day) for row in doc.table1)
	doc.total_absents = sum(1 for row in doc.table1 if cint(row.absent))
