import frappe
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

