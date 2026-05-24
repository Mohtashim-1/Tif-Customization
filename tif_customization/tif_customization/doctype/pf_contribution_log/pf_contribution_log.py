import frappe
from frappe.model.document import Document
from frappe.utils import flt, getdate


class PFContributionLog(Document):
	def validate(self):
		self.total_contribution = flt(self.employee_contribution) + flt(self.employer_contribution)
		if self.posting_date and not self.payroll_month:
			d = getdate(self.posting_date)
			self.payroll_month = d.strftime("%B %Y")
