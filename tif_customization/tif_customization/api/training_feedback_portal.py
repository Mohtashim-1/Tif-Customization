# Copyright (c) 2026, mohtashim and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import get_url


def _get_attendee_by_token(token):
	if not token:
		frappe.throw(_("Invalid feedback link."), frappe.PermissionError)

	row = frappe.db.get_value(
		"Training Attendee",
		{"feedback_token": token},
		[
			"name",
			"parent",
			"attendee_name",
			"email",
			"contact_number",
			"school_organization",
			"designation",
			"training_venue",
			"training_date",
			"trainer_name",
			"feedback_submitted",
		],
		as_dict=True,
	)
	if not row:
		frappe.throw(_("Invalid or expired feedback link."), frappe.PermissionError)

	field_visit = frappe.db.get_value(
		"Field Visit",
		row.parent,
		[
			"name",
			"type",
			"docstatus",
			"training_date",
			"training_trainer_name",
			"training_venue_name",
			"training_session_category",
			"training_school_category",
			"training_city",
			"training_province",
		],
		as_dict=True,
	)
	if not field_visit or field_visit.type != "Training":
		frappe.throw(_("Training session not found."), frappe.PermissionError)

	return frappe._dict(row), field_visit


@frappe.whitelist(allow_guest=True)
def get_training_feedback_context(token):
	attendee, field_visit = _get_attendee_by_token(token)

	if attendee.feedback_submitted or frappe.db.exists(
		"Training Attendee Feedback", {"feedback_token": token}
	):
		return {
			"submitted": True,
			"attendee_name": attendee.attendee_name,
			"training_date": attendee.training_date or field_visit.training_date,
			"trainer_name": attendee.trainer_name or field_visit.training_trainer_name,
			"venue_name": attendee.training_venue or field_visit.training_venue_name,
			"session_category": field_visit.training_session_category,
		}

	return {
		"submitted": False,
		"attendee_name": attendee.attendee_name,
		"email": attendee.email,
		"contact_number": attendee.contact_number,
		"school_organization": attendee.school_organization,
		"designation": attendee.designation,
		"field_visit": field_visit.name,
		"training_date": attendee.training_date or field_visit.training_date,
		"trainer_name": attendee.trainer_name or field_visit.training_trainer_name,
		"venue_name": attendee.training_venue or field_visit.training_venue_name,
		"session_category": field_visit.training_session_category,
		"school_category": field_visit.training_school_category,
		"city": field_visit.training_city,
		"province": field_visit.training_province,
	}


@frappe.whitelist(allow_guest=True)
def submit_training_feedback(
	token,
	overall_rating,
	content_quality=None,
	trainer_rating=None,
	venue_rating=None,
	would_recommend=None,
	what_went_well=None,
	improvements=None,
	additional_comments=None,
):
	attendee, field_visit = _get_attendee_by_token(token)

	if attendee.feedback_submitted or frappe.db.exists(
		"Training Attendee Feedback", {"feedback_token": token}
	):
		frappe.throw(_("You have already submitted feedback for this training."))

	if not overall_rating:
		frappe.throw(_("Overall rating is required."))

	feedback = frappe.get_doc(
		{
			"doctype": "Training Attendee Feedback",
			"field_visit": field_visit.name,
			"attendee_name": attendee.attendee_name,
			"email": attendee.email,
			"feedback_token": token,
			"training_date": attendee.training_date or field_visit.training_date,
			"trainer_name": attendee.trainer_name or field_visit.training_trainer_name,
			"venue_name": attendee.training_venue or field_visit.training_venue_name,
			"session_category": field_visit.training_session_category,
			"overall_rating": overall_rating,
			"content_quality": content_quality,
			"trainer_rating": trainer_rating,
			"venue_rating": venue_rating,
			"would_recommend": would_recommend,
			"what_went_well": what_went_well,
			"improvements": improvements,
			"additional_comments": additional_comments,
		}
	)
	feedback.insert(ignore_permissions=True)

	frappe.db.set_value("Training Attendee", attendee.name, "feedback_submitted", 1)

	return {"success": True, "message": _("Thank you for your feedback!")}


@frappe.whitelist()
def get_training_feedback_links(field_visit):
	doc = frappe.get_doc("Field Visit", field_visit)
	if doc.type != "Training":
		frappe.throw(_("Feedback links are only available for Training visits."))

	links = []
	for row in doc.training_attendees or []:
		if not row.feedback_token:
			continue
		links.append(
			{
				"attendee_name": row.attendee_name,
				"email": row.email,
				"feedback_submitted": row.feedback_submitted,
				"feedback_link": build_feedback_link(row.feedback_token),
			}
		)
	return links


@frappe.whitelist()
def send_training_feedback_invitations(field_visit):
	doc = frappe.get_doc("Field Visit", field_visit)
	if doc.type != "Training":
		frappe.throw(_("Feedback invitations can only be sent for Training visits."))

	sent = doc.send_training_feedback_invitations()
	return {"sent": sent, "message": _("Sent {0} feedback invitation(s).").format(sent)}


def build_feedback_link(token):
	return get_url(f"/training-feedback?token={token}")
