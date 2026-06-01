# Copyright (c) 2026, TIF and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt, getdate


class VariableComponentsPayment(Document):
	def validate(self):
		self.start_date = getdate(self.start_date)
		self.end_date = getdate(self.end_date)
		if self.payment_mode == "Cheque":
			self.bank_name = ""
		elif (
			self.payment_mode == "Bank"
			and not (self.bank_name or "").strip()
			and not getattr(self.flags, "allow_missing_bank", False)
		):
			frappe.throw(_("Bank is required when payment mode is Bank."))

		duplicate = frappe.db.exists(
			"Variable Components Payment",
			{
				"company": self.company,
				"start_date": self.start_date,
				"end_date": self.end_date,
				"employee": self.employee,
				"name": ["!=", self.name],
			},
		)
		if duplicate:
			frappe.throw(
				_("Payment row already exists for {0} in this period.").format(self.employee)
			)
