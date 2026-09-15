# Copyright (c) 2026, TIF Customization and contributors
# License: MIT
"""Supervisor-only Field Visit categories (SME Target Base KPI — orange rows)."""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import cint

from tif_customization.tif_customization.field_visit_permissions import can_view_all_field_visits

# KPI: Academic Task, Other Official Tasks, Head / Regional / Out of station (Academic form)
SUPERVISOR_ONLY_OT_TASKS = frozenset(
	{
		"Academic Tasks",
		"Head Office Visit",
		"Regional Office Visit",
		"Out of Station Visit",
		"Meeting of Regional Staff (Supervisors) and SMEs",
		"Other Official Tasks",
	}
)

FIELD_OFFICER_ALLOWED_OT_TASKS = frozenset({"Follow up Calls / Calls to Schools"})

_HEADOFFICE_TEXT_MARKERS = (
	"head office",
	"headoffice",
	"regional office",
	"out of station",
)


def _is_active_field_supervisor(user: str) -> bool:
	if not frappe.db.exists("DocType", "Field Officer"):
		return False
	fo = frappe.db.get_value(
		"Field Officer",
		{"user": user, "status": "Active"},
		["name", "is_group"],
		as_dict=True,
	)
	if not fo:
		return False
	if cint(fo.get("is_group")):
		return True
	return bool(
		frappe.db.count(
			"Field Officer",
			{"parent_field_officer": fo.name, "status": "Active"},
		)
	)


def can_manage_supervisor_only_field_visits(user: str | None = None) -> bool:
	"""Field Supervisors, HR/managers, and System Manager."""
	user = user or frappe.session.user
	if user in ("Administrator",) or "System Manager" in frappe.get_roles(user):
		return True
	if can_view_all_field_visits(user):
		return True
	return _is_active_field_supervisor(user)


def _text_has_headoffice_marker(value: str | None) -> bool:
	text = (value or "").strip().lower()
	if not text:
		return False
	return any(marker in text for marker in _HEADOFFICE_TEXT_MARKERS)


def visit_requires_supervisor(doc) -> bool:
	"""True when this visit counts toward supervisor-only KPI rows."""
	visit_type = (doc.get("type") if isinstance(doc, dict) else getattr(doc, "type", None)) or ""
	visit_type = visit_type.strip()

	task = (doc.get("ot_type_of_task") if isinstance(doc, dict) else getattr(doc, "ot_type_of_task", None)) or ""
	task = task.strip()

	if visit_type == "Academic / Other Official Tasks" and task in SUPERVISOR_ONLY_OT_TASKS:
		return True

	if visit_type in ("Marketing", "M&E", "Joint Visit with SME"):
		reference = doc.get("reference") if isinstance(doc, dict) else getattr(doc, "reference", None)
		me_addr = doc.get("me_new_school_address") if isinstance(doc, dict) else getattr(
			doc, "me_new_school_address", None
		)
		if _text_has_headoffice_marker(reference) or _text_has_headoffice_marker(me_addr):
			return True

	return False


def validate_supervisor_only_field_visit(doc, user: str | None = None) -> None:
	if can_manage_supervisor_only_field_visits(user):
		return
	if not visit_requires_supervisor(doc):
		return

	frappe.throw(
		_(
			"Only a <b>Field Supervisor</b> (or HR / manager) may record "
			"<b>Head office / Regional / Out of station</b> visits, "
			"<b>Academic Tasks</b>, or <b>Other Official Tasks</b>. "
			"Field Officers may use <b>Follow up Calls / Calls to Schools</b> under "
			"Academic / Other Official Tasks."
		),
		title=_("Supervisor activity"),
		exc=frappe.PermissionError,
	)


@frappe.whitelist()
def get_supervisor_field_visit_access(name: str | None = None):
	doc_is_supervisor_only = False
	if name and frappe.db.exists("Field Visit", name):
		doc = frappe.get_doc("Field Visit", name)
		if frappe.has_permission("Field Visit", "read", doc=doc):
			doc_is_supervisor_only = visit_requires_supervisor(doc)

	return {
		"can_manage_supervisor_only": can_manage_supervisor_only_field_visits(),
		"doc_is_supervisor_only": doc_is_supervisor_only,
		"field_officer_ot_tasks": sorted(FIELD_OFFICER_ALLOWED_OT_TASKS),
	}
