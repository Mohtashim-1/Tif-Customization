import frappe
from frappe.model.document import Document


class LeaveSubstitute(Document):
	def before_save(self):
		if not self.employee:
			return

		emp = frappe.db.get_value(
			"Employee",
			self.employee,
			["employee_name", "cell_number", "department", "user_id", "status"],
			as_dict=True,
		)
		if not emp:
			return

		self.substitute_name = emp.employee_name
		if not self.contact_number:
			self.contact_number = emp.cell_number
		self.department = emp.department
		self.user_id = emp.user_id
		if emp.status != "Active" and self.is_active:
			self.is_active = 0
