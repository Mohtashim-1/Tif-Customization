# Copyright (c) 2026, mohtashim and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class TrainingAttendeeFeedback(Document):
	def validate(self):
		if self.feedback_token and frappe.db.exists(
			"Training Attendee Feedback",
			{"feedback_token": self.feedback_token, "name": ["!=", self.name]},
		):
			frappe.throw(_("Feedback has already been submitted for this attendee."))
