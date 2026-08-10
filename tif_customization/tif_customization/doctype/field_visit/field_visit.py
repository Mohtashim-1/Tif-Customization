# Copyright (c) 2026, mohtashim and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import get_url, random_string

from tif_customization.tif_customization.api.training_feedback_portal import build_feedback_link


class FieldVisit(Document):
	def before_validate(self):
		# Mobile / older clients may send lowercase "participants"
		if (self.type or "").strip() == "Enrolment of participants":
			self.type = "Enrolment of Participants"

	def validate(self):
		if self.type == "Training":
			self._validate_training_attendees()
			self._sync_training_attendee_defaults()
		self._validate_volunteer_enrolments()
		self._validate_enrolment_participants()
		self._validate_workshop_attendees()

	def before_submit(self):
		if self.type == "Training":
			self._ensure_feedback_tokens()

	def on_submit(self):
		if self.type == "Training":
			self.send_training_feedback_invitations()

	def _validate_training_attendees(self):
		emails = set()
		for row in self.training_attendees or []:
			if not (row.attendee_name or "").strip():
				frappe.throw(_("Attendee Name is required for all training attendees."))
			# Email is optional — only check uniqueness when provided
			if not row.email:
				continue
			email = row.email.strip().lower()
			if email in emails:
				frappe.throw(_("Duplicate attendee email: {0}").format(row.email))
			emails.add(email)

	def _sync_training_attendee_defaults(self):
		"""Fill attendee row training details from header when blank."""
		for row in self.training_attendees or []:
			if not row.school_organization:
				row.school_organization = self.school_name or self.me_school_name
			if not row.training_venue:
				row.training_venue = self.training_venue_name
			if not row.training_date:
				row.training_date = self.training_date
			if not row.trainer_name:
				row.trainer_name = self.training_trainer_name

	def _validate_volunteer_enrolments(self):
		names = set()
		for row in self.volunteer_enrolments or []:
			name = (row.volunteer_name or "").strip()
			if not name:
				frappe.throw(_("Volunteer Name is required for all volunteer rows."))
			key = name.lower()
			if key in names:
				frappe.throw(_("Duplicate volunteer name: {0}").format(row.volunteer_name))
			names.add(key)

	def _validate_enrolment_participants(self):
		if self.type != "Enrolment of Participants":
			return
		for row in self.enrolment_participants or []:
			if not (row.participant_name or "").strip():
				frappe.throw(_("Name is required for all enrolment participant rows."))
			if not row.enroll_in_course:
				frappe.throw(_("Enroll in (Course Name) is required for {0}.").format(row.participant_name))
			if (
				row.enroll_in_course == "Other Special Session Offered by TIF"
				and not (row.other_special_session_name or "").strip()
			):
				# Sheet says Not Mandatory — keep optional; no throw
				pass

	def _validate_workshop_attendees(self):
		if self.type != "Attendance / Registration in One Day / Half day Workshop":
			return
		emails = set()
		for row in self.workshop_attendees or []:
			if not (row.attendee_name or "").strip():
				frappe.throw(_("Attendee Name is required for all workshop attendee rows."))
			if not row.training_venue:
				row.training_venue = self.training_venue_name
			if not row.training_date:
				row.training_date = self.training_date or self.visit_date
			if row.email:
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
			training_date = row.training_date or self.training_date or ""
			trainer_name = row.trainer_name or self.training_trainer_name or ""
			venue_name = row.training_venue or self.training_venue_name or ""
			subject = _("Training Feedback Request - {0}").format(self.training_session_category or self.name)
			message = f"""
			Dear {row.attendee_name or 'Participant'},<br><br>
			Thank you for attending the training session.<br><br>
			<strong>Training Details:</strong><br>
			- <strong>Date:</strong> {training_date}<br>
			- <strong>Trainer:</strong> {trainer_name}<br>
			- <strong>Venue:</strong> {venue_name}<br>
			- <strong>Session:</strong> {self.training_session_category or ''}<br><br>
			Please share your feedback using the link below:<br>
			<a href="{link}">{link}</a><br><br>
			Best regards,<br>
			<strong>The Ilm Foundation</strong>
			"""
			frappe.sendmail(recipients=[row.email], subject=subject, message=message, delayed=False)
			sent += 1
		return sent
