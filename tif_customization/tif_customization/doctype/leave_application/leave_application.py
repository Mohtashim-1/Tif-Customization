import frappe
from frappe.utils import getdate
from datetime import date

@frappe.whitelist()
def leave_apply_on_probabe_base(doc, method):
    """
    Allow leave application only up to the number of leaves accrued so far in the year,
    using payroll months (26th-to-25th) for accrual.
    """
    # Get leave allocation for this employee and leave type for the current year
    allocation = frappe.db.get_value(
        "Leave Allocation",
        {
            "employee": doc.employee,
            "leave_type": doc.leave_type,
            "docstatus": 1,
            "from_date": ["<=", doc.from_date],
            "to_date": [">=", doc.to_date],
        },
        ["from_date", "to_date", "total_leaves_allocated"]
    )
    if not allocation:
        frappe.throw("No leave allocation found for this leave type and period.")

    from_date, to_date, total_leaves = allocation
    from_date = getdate(from_date)
    to_date = getdate(to_date)
    total_leaves = float(total_leaves)
    application_date = getdate(doc.from_date)

    def payroll_months_between(start, end):
        # Returns number of 26th-to-25th periods between start and end (inclusive of the period containing 'end')
        if end < start:
            return 0
        period_start = start
        months = 1
        while True:
            # Next period start
            if period_start.month == 12:
                next_period_start = date(period_start.year + 1, 1, 26)
            else:
                next_period_start = date(period_start.year, period_start.month + 1, 26)
            if end < next_period_start:
                break
            months += 1
            period_start = next_period_start
        return months

    months_passed = payroll_months_between(from_date, application_date)
    months_total = payroll_months_between(from_date, to_date)
    accrued_leaves = (total_leaves / months_total) * months_passed

    # Calculate how many leaves already taken in this period
    leaves_taken = frappe.db.sql("""
        SELECT SUM(total_leave_days) FROM `tabLeave Application`
        WHERE employee=%s AND leave_type=%s AND docstatus=1
        AND from_date >= %s AND to_date <= %s
        AND name != %s
    """, (doc.employee, doc.leave_type, from_date, to_date, doc.name))[0][0] or 0

    applying_for = doc.total_leave_days

    if (leaves_taken + applying_for) > accrued_leaves:
        frappe.throw(
            f"You can only apply for {accrued_leaves - leaves_taken:.2f} more {doc.leave_type} as per monthly accrual."
        ) 