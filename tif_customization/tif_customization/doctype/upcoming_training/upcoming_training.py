# Copyright (c) 2026, mohtashim and contributors
# For license information, please see license.txt

import calendar

from frappe.model.document import Document
from frappe.utils import getdate


class UpcomingTraining(Document):
	def validate(self):
		self.set_month()
		self.attendance_count = sum(
			1
			for row in (self.attendance or [])
			if (row.attendance_status or "").strip() == "Present"
		)

	def set_month(self):
		"""Month is derived, never typed, so workshop listings can never disagree with the date."""
		self.month = calendar.month_name[getdate(self.training_date).month] if self.training_date else None
