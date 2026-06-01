"""Shared payroll helpers for TIF customizations."""

import frappe
from frappe.utils import flt, getdate


def get_employee_base_from_assignment(employee, company=None, reference_date=None):
	"""Monthly base from active Salary Structure Assignment (not salary slip)."""
	reference_date = getdate(reference_date) if reference_date else getdate()
	ssa_filters = {
		"employee": employee,
		"docstatus": 1,
		"from_date": ("<=", reference_date),
	}
	if company:
		ssa_filters["company"] = company

	base = frappe.db.get_value(
		"Salary Structure Assignment",
		ssa_filters,
		"base",
		order_by="from_date desc, modified desc",
	)
	if base:
		return flt(base)

	# Fallback only when no assignment exists.
	slip_filters = {"employee": employee, "docstatus": 1}
	if company:
		slip_filters["company"] = company

	base = frappe.db.get_value(
		"Salary Slip",
		slip_filters,
		"base_gross_pay",
		order_by="end_date desc, modified desc",
	)
	return flt(base) if base else 0.0


def get_assignment_base_by_employee(employees, reference_date, company=None):
	"""Batch map employee -> SSA base for reference_date."""
	if not employees:
		return {}

	employee_ids = [e.name if hasattr(e, "name") else e for e in employees]
	reference_date = getdate(reference_date)
	filters = {
		"employee": ["in", employee_ids],
		"docstatus": 1,
		"from_date": ["<=", reference_date],
	}
	if company:
		filters["company"] = company

	rows = frappe.get_all(
		"Salary Structure Assignment",
		filters=filters,
		fields=["employee", "base", "from_date", "modified"],
		order_by="from_date desc, modified desc",
	)
	out = {}
	for row in rows:
		if row.employee not in out:
			out[row.employee] = flt(row.base)
	return out
