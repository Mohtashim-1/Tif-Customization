# Copyright (c) 2026, TIF Customization and contributors
# License: MIT
"""Field Visit types restricted to Farhan Hussain (and admins)."""

from __future__ import annotations

import frappe
from frappe import _

ENROLMENT_PARTICIPANTS_TYPE = "Enrolment of Participants"
WORKSHOP_ATTENDANCE_TYPE = "Attendance / Registration in One Day / Half day Workshop"

FARHAN_ONLY_FIELD_VISIT_TYPES = frozenset(
	{
		ENROLMENT_PARTICIPANTS_TYPE,
		WORKSHOP_ATTENDANCE_TYPE,
	}
)

FARHAN_ONLY_ALLOWED_USERS = frozenset(
	{
		"farhan.hussain@tif.edu.pk",
	}
)


def can_manage_farhan_only_field_visit(user: str | None = None) -> bool:
	user = (user or frappe.session.user or "").strip()
	if user == "Administrator":
		return True
	if "System Manager" in frappe.get_roles(user):
		return True
	return user.lower() in {u.lower() for u in FARHAN_ONLY_ALLOWED_USERS}


def can_manage_enrolment_participants_field_visit(user: str | None = None) -> bool:
	"""Backward-compatible alias."""
	return can_manage_farhan_only_field_visit(user)


def _visit_type(doc) -> str:
	return (
		(doc.get("type") if isinstance(doc, dict) else getattr(doc, "type", None)) or ""
	).strip()


def is_farhan_only_field_visit(doc) -> bool:
	return _visit_type(doc) in FARHAN_ONLY_FIELD_VISIT_TYPES


def is_enrolment_participants_visit(doc) -> bool:
	return _visit_type(doc) == ENROLMENT_PARTICIPANTS_TYPE


def is_workshop_attendance_visit(doc) -> bool:
	return _visit_type(doc) == WORKSHOP_ATTENDANCE_TYPE


def validate_enrolment_participants_field_visit(doc, user: str | None = None) -> None:
	validate_farhan_only_field_visit(doc, user=user)


def validate_farhan_only_field_visit(doc, user: str | None = None) -> None:
	if not is_farhan_only_field_visit(doc):
		return
	if can_manage_farhan_only_field_visit(user):
		return

	visit_type = _visit_type(doc)
	frappe.throw(
		_(
			"Only <b>Farhan Hussain</b> is allowed to create or update Field Visits with type "
			"<b>{0}</b>."
		).format(visit_type),
		title=_("Restricted activity"),
		exc=frappe.PermissionError,
	)
