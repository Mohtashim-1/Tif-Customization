# Copyright (c) 2026, mohtashim and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import get_url, random_string

from tif_customization.tif_customization.api.training_feedback_portal import build_feedback_link


class FieldVisit(Document):
	def validate(self):
		if self.type == "Training":
			self._validate_training_attendees()

	def before_submit(self):
		if self.type == "Training":
			self._ensure_feedback_tokens()

	def on_submit(self):
		if self.type == "Training":
			self.send_training_feedback_invitations()

	def _validate_training_attendees(self):
		emails = set()
		for row in self.training_attendees or []:
			if not row.email:
				frappe.throw(_("Email is required for all training attendees."))
			email = row.email.strip().lower()
			if email in emails:
				frappe.throw(_("Duplicate attendee email: {0}").format(row.email))
			emails.add(email)

	def _ensure_feedback_tokens(self):
		for row in self.training_attendees or []:
			if not row.feedback_token:
				row.feedback_token = random_string(32)

	def send_training_feedback_invitations(self):
		sent = 0
		for row in self.training_attendees or []:
			if not row.email or row.feedback_submitted:
				continue
			if not row.feedback_token:
				row.feedback_token = random_string(32)
				frappe.db.set_value("Training Attendee", row.name, "feedback_token", row.feedback_token)

			link = build_feedback_link(row.feedback_token)
			subject = _("Training Feedback Request - {0}").format(self.training_session_category or self.name)
			message = f"""
			Dear {row.attendee_name or 'Participant'},<br><br>
			Thank you for attending the training session.<br><br>
			<strong>Training Details:</strong><br>
			- <strong>Date:</strong> {self.training_date or ''}<br>
			- <strong>Trainer:</strong> {self.training_trainer_name or ''}<br>
			- <strong>Venue:</strong> {self.training_venue_name or ''}<br>
			- <strong>Session:</strong> {self.training_session_category or ''}<br><br>
			Please share your feedback using the link below:<br>
			<a href="{link}">{link}</a><br><br>
			Best regards,<br>
			<strong>The Ilm Foundation</strong>
			"""
			frappe.sendmail(recipients=[row.email], subject=subject, message=message, delayed=False)
			sent += 1
		return sent
