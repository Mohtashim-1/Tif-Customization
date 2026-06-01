# Copyright (c) 2026, TIF and contributors

import calendar

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import add_months, formatdate, getdate


class VariableComponentsPeriod(Document):
	def validate(self):
		self.start_date = getdate(self.start_date)
		self.end_date = getdate(self.end_date)
		if self.end_date < self.start_date:
			frappe.throw(_("End Date cannot be before Start Date."))
		if not self.period_label:
			end = self.end_date
			self.period_label = (
				f"{calendar.month_name[end.month]} {end.year} "
				f"({formatdate(self.start_date)} – {formatdate(self.end_date)})"
			)
		self.payroll_month = self.end_date.month
		self.payroll_year = self.end_date.year
