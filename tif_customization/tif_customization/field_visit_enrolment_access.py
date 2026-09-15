# Copyright (c) 2026, TIF Customization and contributors
# License: MIT
"""Field Visit type Enrolment of Participants — restricted users."""

from __future__ import annotations

import frappe
from frappe import _

ENROLMENT_PARTICIPANTS_TYPE = "Enrolment of Participants"

# Only these users may create or edit this activity type (plus Administrator / System Manager).
ENROLMENT_PARTICIPANTS_ALLOWED_USERS = frozenset(
	{
		"farhan.hussain@tif.edu.pk",
	}
)


def can_manage_enrolment_participants_field_visit(user: str | None = None) -> bool:
	user = (user or frappe.session.user or "").strip()
	if user == "Administrator":
		return True
	if "System Manager" in frappe.get_roles(user):
		return True
	return user.lower() in {u.lower() for u in ENROLMENT_PARTICIPANTS_ALLOWED_USERS}


def is_enrolment_participants_visit(doc) -> bool:
	visit_type = (doc.get("type") if isinstance(doc, dict) else getattr(doc, "type", None)) or ""
	return visit_type.strip() == ENROLMENT_PARTICIPANTS_TYPE


def validate_enrolment_participants_field_visit(doc, user: str | None = None) -> None:
	if not is_enrolment_participants_visit(doc):
		return
	if can_manage_enrolment_participants_field_visit(user):
		return

	frappe.throw(
		_(
			"Only <b>Farhan Hussain</b> is allowed to create or update Field Visits with type "
			"<b>Enrolment of Participants</b>."
		),
		title=_("Enrolment of Participants"),
		exc=frappe.PermissionError,
	)
