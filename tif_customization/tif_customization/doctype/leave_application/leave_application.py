import frappe
from frappe.utils import getdate, flt, cint
from datetime import date
import datetime


EXEMPT_ROLES = {"HR Manager", "HR User", "System Manager"}
ACCRUAL_EMPLOYMENT_TYPES = {"Full Time -  (Permanent)", "Full Time (Probation)"}


def payroll_months_between(start: date, end: date) -> int:
	"""Returns number of 26th-to-25th periods between start and end (inclusive)."""
	if end < start:
		return 0

	period_start = start
	months = 1
	while True:
		if period_start.month == 12:
			next_period_start = date(period_start.year + 1, 1, 26)
		else:
			next_period_start = date(period_start.year, period_start.month + 1, 26)

		if end < next_period_start:
			break

		months += 1
		period_start = next_period_start

	return months


def get_accrued_leaves(
	total_leaves: float,
	allocation_from_date: date,
	allocation_to_date: date,
	reference_date: date,
) -> float:
	"""Calculates accrued leaves by payroll cycles (26th-to-25th)."""
	if reference_date < allocation_from_date:
		return 0.0

	effective_reference_date = min(reference_date, allocation_to_date)
	months_total = payroll_months_between(allocation_from_date, allocation_to_date) or 1
	leave_per_period = flt(total_leaves) / months_total
	months_passed = payroll_months_between(allocation_from_date, effective_reference_date)
	months_passed = max(0, min(months_passed, months_total))
	accrued = months_passed * leave_per_period
	return min(flt(total_leaves), flt(accrued))


def is_accrual_restricted_employee(employee: str) -> bool:
	employment_type = frappe.db.get_value("Employee", employee, "employment_type")
	return employment_type in ACCRUAL_EMPLOYMENT_TYPES


@frappe.whitelist()
def leave_apply_on_probabe_base(doc, method):
	# Skip restriction for HR/System Manager roles.
	current_user_roles = set(frappe.get_roles(frappe.session.user))
	if current_user_roles & EXEMPT_ROLES:
		return

	if not is_accrual_restricted_employee(doc.employee):
		return

	allocation = frappe.db.get_value(
		"Leave Allocation",
		{
			"employee": doc.employee,
			"leave_type": doc.leave_type,
			"docstatus": 1,
			"from_date": ["<=", doc.from_date],
			"to_date": [">=", doc.to_date],
		},
		["from_date", "to_date", "total_leaves_allocated"],
	)
	if not allocation:
		frappe.throw("No leave allocation found for this leave type and period.")

	from_date, to_date, total_leaves = allocation
	from_date = getdate(from_date)
	to_date = getdate(to_date)
	application_date = getdate(doc.from_date)
	accrued_leaves = get_accrued_leaves(total_leaves, from_date, to_date, application_date)

	leaves_taken = frappe.db.sql(
		"""
		SELECT SUM(total_leave_days)
		FROM `tabLeave Application`
		WHERE employee = %s
			AND leave_type = %s
			AND docstatus = 1
			AND from_date >= %s
			AND to_date <= %s
			AND name != %s
		""",
		(doc.employee, doc.leave_type, from_date, to_date, doc.name),
	)[0][0] or 0

	applying_for = flt(doc.total_leave_days)
	allowed_remaining = flt(accrued_leaves) - flt(leaves_taken)

	if (flt(leaves_taken) + applying_for) > flt(accrued_leaves):
		frappe.throw(
			f"You can only apply for {allowed_remaining:.2f} more {doc.leave_type} as per monthly accrual."
		)


def get_leaves_pending_approval_for_period(
	employee: str, leave_type: str, from_date: datetime.date, to_date: datetime.date
) -> float:
	"""Returns leaves that are pending for approval - Fixed version to avoid dict field error"""
	result = frappe.db.sql(
		"""
		SELECT SUM(total_leave_days) as leaves
		FROM `tabLeave Application`
		WHERE employee = %(employee)s
			AND leave_type = %(leave_type)s
			AND status = 'Open'
			AND (
				(from_date BETWEEN %(from_date)s AND %(to_date)s)
				OR (to_date BETWEEN %(from_date)s AND %(to_date)s)
			)
		""",
		{
			"employee": employee,
			"leave_type": leave_type,
			"from_date": from_date,
			"to_date": to_date,
		},
		as_dict=True,
	)
	return flt(result[0].get("leaves")) if result and result[0].get("leaves") else 0.0


@frappe.whitelist()
def get_leave_details(employee, date, for_salary_slip=False):
	"""Override get_leave_details to use fixed get_leaves_pending_approval_for_period"""
	from hrms.hr.doctype.leave_application.leave_application import (
		get_leave_allocation_records,
		get_leave_balance_on,
		get_leaves_for_period,
	)
	
	allocation_records = get_leave_allocation_records(employee, date)
	leave_allocation = {}
	precision = cint(frappe.db.get_single_value("System Settings", "float_precision")) or 2
	is_restricted_employee = is_accrual_restricted_employee(employee)
	reference_date = getdate(date)

	for d in allocation_records:
		allocation = allocation_records.get(d, frappe._dict())
		to_date = date if for_salary_slip else allocation.to_date
		remaining_leaves = get_leave_balance_on(
			employee,
			d,
			date,
			to_date=to_date,
			consider_all_leaves_in_the_allocation_period=False if for_salary_slip else True,
		)

		leaves_taken = get_leaves_for_period(employee, d, allocation.from_date, to_date) * -1
		# Use the fixed version from this module
		leaves_pending = get_leaves_pending_approval_for_period(employee, d, allocation.from_date, to_date)
		expired_leaves = allocation.total_leaves_allocated - (remaining_leaves + leaves_taken)
		accrued_leaves = (
			get_accrued_leaves(
				allocation.total_leaves_allocated,
				getdate(allocation.from_date),
				getdate(allocation.to_date),
				reference_date,
			)
			if is_restricted_employee
			else flt(allocation.total_leaves_allocated)
		)
		leave_allowed_as_per_accrual = max(0, accrued_leaves)

		leave_allocation[d] = {
			"total_leaves": flt(allocation.total_leaves_allocated, precision),
			"expired_leaves": flt(expired_leaves, precision) if expired_leaves > 0 else 0,
			"leaves_taken": flt(leaves_taken, precision),
			"leaves_pending_approval": flt(leaves_pending, precision),
			"leave_allowed_as_per_accrual": flt(leave_allowed_as_per_accrual, precision),
			"remaining_leaves": flt(remaining_leaves, precision),
		}

	# is used in set query
	lwp = frappe.get_list("Leave Type", filters={"is_lwp": 1}, pluck="name")

	return {
		"leave_allocation": leave_allocation,
		"leave_balance": leave_allocation,
		"lwps": lwp,
	}
