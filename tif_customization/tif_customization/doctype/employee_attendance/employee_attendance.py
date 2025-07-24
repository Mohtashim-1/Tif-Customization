import frappe
from datetime import datetime, date

@frappe.whitelist()
def validate_sat_attendance(doc, method):
    """
    Mark sat_halfday in table1 if Saturday and half-day conditions are met (>=3 hours worked, any in/out time).
    Also, recalculate present_days: Mon-Fri=1, Sat halfday=0.5, Sun=1.
    On Saturday, if employee is absent or has no check_in_1, mark half_day=1 and do NOT mark absent.
    Sum up all half days in doc.total_half_days.
    """
    frappe.msgprint("Running validate_sat_attendance")
    for row in doc.table1:
        weekday = frappe.utils.getdate(row.date).weekday()
        if (
            doc.employment_type and (
                doc.employment_type.replace(' ', '') == "FullTime-(Permanent)" or
                doc.employment_type.replace(' ', '') == "FullTime(Probation)"
            )
        ):
            frappe.msgprint(f"Checking row with date: {row.date}, day: {row.day}")
            if row.weekly_off == 0:
                if row.date and weekday == 5:  # Saturday
                    frappe.msgprint("It's Saturday")
                    if row.check_in_1 and row.check_out_1:
                        in_time = datetime.strptime(row.check_in_1, "%H:%M:%S").time()
                        out_time = datetime.strptime(row.check_out_1, "%H:%M:%S").time()
                        in_dt = datetime.combine(date.min, in_time)
                        out_dt = datetime.combine(date.min, out_time)
                        total_hours = (out_dt - in_dt).total_seconds() / 3600
                        frappe.msgprint(f"Total hours: {total_hours}")
                        if total_hours >= 3:
                            row.sat_halfday = 1
                            row.half_day = 0
                            frappe.msgprint("Marked as Saturday half day")
                        else:
                            row.sat_halfday = 0
                            row.half_day = 1
                            frappe.msgprint("Did not meet half-day time conditions, marked as half day")
                    else:
                        frappe.msgprint("Missing check-in or check-out time on Saturday, marking half_day=1 and not absent")
                        row.sat_halfday = 0
                        row.half_day = 1
                        row.absent = 0
                else:
                    # For non-Saturday, mark half_day=1 if absent or no check_in_1 (keep existing logic)
                    if getattr(row, 'absent', 0) == 1 or not row.check_in_1:
                        row.half_day = 1

    # Custom present_days calculation (Mon-Fri=1, Sat halfday=0.5, Sun=1)
    present_days = 0
    for row in doc.table1:
        weekday = frappe.utils.getdate(row.date).weekday()
        # Saturday (5) and marked as half day
        if weekday == 5 and getattr(row, 'sat_halfday', 0):
            present_days += 0.5
        # Sunday (6) and present (not absent)
        elif weekday == 6 and getattr(row, 'absent', 0) == 0 and row.check_in_1:
            present_days += 1
        # Monday–Friday (0–4) and present (not absent)
        elif weekday < 5 and getattr(row, 'absent', 0) == 0 and row.check_in_1:
            present_days += 1
    doc.present_days = present_days
    frappe.msgprint(f"Final present_days: {doc.present_days}")

    # Sum up all half days in the child table
    total_half_days = 0
    for row in doc.table1:
        if getattr(row, 'half_day', 0) == 1:
            total_half_days += 1
    doc.total_half_days = total_half_days
    frappe.msgprint(f"Total half days: {doc.total_half_days}")
        