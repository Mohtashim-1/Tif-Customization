# Copyright (c) 2026, TIF and contributors

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import getdate


class VariableComponentsRoster(Document):
	def validate(self):
		self.start_date = getdate(self.start_date)
		self.end_date = getdate(self.end_date)
		dup = frappe.db.exists(
			"Variable Components Roster",
			{
				"company": self.company,
				"start_date": self.start_date,
				"end_date": self.end_date,
				"employee": self.employee,
				"name": ["!=", self.name],
			},
		)
		if dup:
			frappe.throw(_("Roster row already exists for {0} in this period.").format(self.employee))
