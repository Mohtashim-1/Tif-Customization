import frappe
from frappe.query_builder import Order
from frappe.utils import flt, getdate, nowdate

from hrms.hr.doctype.leave_encashment.leave_encashment import LeaveEncashment
from hrms.hr.utils import set_employee_name, validate_active_employee


def _get_employee_base_salary(employee, company=None, reference_date=None) -> float:
	reference_date = reference_date or nowdate()
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

	# Fallback to latest submitted salary slip base gross pay.
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


class CustomLeaveEncashment(LeaveEncashment):
	def validate(self):
		set_employee_name(self)
		validate_active_employee(self.employee)
		self.encashment_date = self.encashment_date or getdate()
		self.get_leave_details_for_encashment()
		self.set_status()

	def get_balance_as_on_date(self):
		"""Leave balance date — may differ from payment/encashment date.

		When encashment is paid after a leave period ends (e.g. pay on 30-Jun but
		period ended 25-Jun), use the period closing date so we don't pick up the
		next year's allocation.
		"""
		encashment_date = getdate(self.encashment_date or nowdate())
		if not self.leave_period:
			return encashment_date

		period_to = frappe.db.get_value("Leave Period", self.leave_period, "to_date")
		if period_to and encashment_date > getdate(period_to):
			return getdate(period_to)
		return encashment_date

	def get_leave_allocation(self):
		date = self.get_balance_as_on_date()

		LeaveAllocation = frappe.qb.DocType("Leave Allocation")
		leave_allocation = (
			frappe.qb.from_(LeaveAllocation)
			.select(
				LeaveAllocation.name,
				LeaveAllocation.from_date,
				LeaveAllocation.to_date,
				LeaveAllocation.total_leaves_allocated,
				LeaveAllocation.carry_forwarded_leaves_count,
			)
			.where(
				((LeaveAllocation.from_date <= date) & (date <= LeaveAllocation.to_date))
				& (LeaveAllocation.docstatus == 1)
				& (LeaveAllocation.leave_type == self.leave_type)
				& (LeaveAllocation.employee == self.employee)
			)
			.orderby(LeaveAllocation.from_date, order=Order.desc)
		).run(as_dict=True)

		return leave_allocation[0] if leave_allocation else None

	def set_leave_balance(self):
		allocation = self.get_leave_allocation()
		if not allocation:
			frappe.throw(
				f"No Leaves Allocated to Employee: {self.employee} for Leave Type: {self.leave_type} "
				f"as on {self.get_balance_as_on_date()}"
			)

		balance_date = self.get_balance_as_on_date()
		from hrms.hr.doctype.leave_application.leave_application import get_leaves_for_period

		self.leave_balance = (
			allocation.total_leaves_allocated
			- allocation.carry_forwarded_leaves_count
			+ get_leaves_for_period(
				self.employee, self.leave_type, allocation.from_date, balance_date
			)
		)
		self.leave_allocation = allocation.name

	def set_encashment_amount(self):
		# Company policy: (monthly base salary / 30) * encashment_days
		base_salary = _get_employee_base_salary(
			self.employee,
			company=getattr(self, "company", None),
			reference_date=getattr(self, "encashment_date", None),
		)
		if not flt(base_salary):
			frappe.throw(f"Base salary not found for Employee {self.employee} on {self.encashment_date}.")

		per_day_salary = flt(base_salary) / 30.0
		self.encashment_amount = flt(self.encashment_days) * flt(per_day_salary)

