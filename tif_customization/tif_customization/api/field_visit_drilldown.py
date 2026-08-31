# Copyright (c) 2026, TIF Customization and contributors
# License: MIT
"""List the Field Visits behind a report number (click-through)."""

from __future__ import annotations

import json

import frappe
from frappe import _
from frappe.utils import cint, getdate

from tif_customization.tif_customization.field_visit_permissions import (
	apply_team_scope_to_conditions,
	expand_staff_tokens,
	staff_match_sql,
	visit_day_sql,
)

METRIC_LABELS = {
	"visits": _("Total Field Visits"),
	"all": _("Total Field Visits"),
	"total": _("Total Field Visits"),
	"marketing": _("Marketing Visits"),
	"me": _("M&E Visits"),
	"meeting": _("Meetings"),
	"training": _("Training Visits"),
	"academic": _("Academic / Other"),
	"other": _("Other Visits"),
	"followup": _("Followup & Other Marketing Visits"),
	"new": _("New Marketing Visits"),
	"me_active": _("M&E Active"),
	"me_inactive": _("M&E Inactive"),
	"grand_total": _("Grand Total (Marketing + Meetings + M&E)"),
	"half_day_workshop": _("Half Day Workshop"),
	"full_day_session": _("Full Day Session"),
	"meeting_ulama": _("Meeting with Ulama / Educationist"),
	"teachers_training_meeting": _("Teachers Training Meeting"),
	"headoffice_visit": _("Head office / Regional / Out of station"),
	"academic_task": _("Academic Task"),
	"other_official": _("Other Official Tasks"),
	"co_curricular": _("Co-curricular Activities"),
	"new_school_registration": _("Registration of New Schools"),
	"workshop_registration": _("Workshop / Training sessions"),
	"enrolment": _("Enrolment visits"),
	"volunteers": _("Volunteer visits"),
	"schools": _("Training visits (schools attended)"),
	"participants": _("Training visits (participants)"),
}

TYPE_TO_METRIC = {
	"Marketing": "marketing",
	"M&E": "me",
	"Meeting": "meeting",
	"Training": "training",
	"Academic / Other Official Tasks": "academic",
	"Other": "other",
}


def _parse(filters):
	if isinstance(filters, str):
		try:
			return json.loads(filters) or {}
		except Exception:
			return {}
	return filters or {}


def _metric_condition(metric: str, alias: str = "fv") -> str:
	a = alias
	m = (metric or "visits").strip().lower()
	if m in ("visits", "all", "total"):
		return "1=1"
	if m == "marketing":
		return f"{a}.type = 'Marketing'"
	if m == "me":
		return f"{a}.type = 'M&E'"
	if m == "meeting":
		return f"{a}.type = 'Meeting'"
	if m == "training":
		return f"{a}.type = 'Training'"
	if m in ("academic", "academic_task", "other_official"):
		return f"{a}.type IN ('Academic / Other Official Tasks', 'Other')"
	if m == "other":
		return f"{a}.type NOT IN ('Marketing', 'M&E', 'Training', 'Meeting')"
	if m == "followup":
		return f"{a}.type = 'Marketing' AND IFNULL({a}.marketing_visit_category, '') != 'New'"
	if m == "new" or m == "new_school_registration":
		return f"{a}.type = 'Marketing' AND {a}.marketing_visit_category = 'New'"
	if m == "me_active":
		return f"""{a}.type = 'M&E' AND LOWER(REPLACE(REPLACE(IFNULL({a}.me_activity_status,''),'-',' '),'  ',' ')) = 'active'"""
	if m == "me_inactive":
		return f"""{a}.type = 'M&E' AND LOWER(REPLACE(REPLACE(IFNULL({a}.me_activity_status,''),'-',' '),'  ',' ')) IN ('inactive', 'in active')"""
	if m == "grand_total":
		return f"{a}.type IN ('Marketing', 'Meeting', 'M&E')"
	if m == "half_day_workshop":
		return f"{a}.type = 'Training' AND LOWER(IFNULL({a}.training_session_category,'')) LIKE '%%half%%'"
	if m == "full_day_session":
		return f"{a}.type = 'Training' AND LOWER(IFNULL({a}.training_session_category,'')) NOT LIKE '%%half%%'"
	if m in ("workshop_registration", "schools", "participants"):
		return f"{a}.type = 'Training'"
	if m == "enrolment":
		return f"""EXISTS (
			SELECT 1 FROM `tabField Visit Enrolment Participant` ep
			WHERE ep.parent = {a}.name
		)"""
	if m == "volunteers":
		return f"""EXISTS (
			SELECT 1 FROM `tabField Visit Volunteer` vv
			WHERE vv.parent = {a}.name
		)"""
	if m == "meeting_ulama":
		return f"""{a}.type = 'Marketing' AND (
			LOWER(IFNULL({a}.meeting_with,'')) LIKE '%%ulama%%'
			OR LOWER(IFNULL({a}.meeting_with,'')) LIKE '%%educationist%%'
			OR LOWER(IFNULL({a}.designation,'')) LIKE '%%ulama%%'
		)"""
	if m == "teachers_training_meeting":
		return f"{a}.type = 'M&E' AND IFNULL({a}.me_teachers_training_session, 0) = 1"
	if m == "headoffice_visit":
		return f"""(
			LOWER(IFNULL({a}.reference,'')) LIKE '%%head%%office%%'
			OR LOWER(IFNULL({a}.reference,'')) LIKE '%%regional office%%'
			OR LOWER(IFNULL({a}.reference,'')) LIKE '%%out of station%%'
			OR LOWER(IFNULL({a}.me_new_school_address,'')) LIKE '%%head%%office%%'
		)"""
	if m == "co_curricular":
		return f"{a}.type = 'Marketing' AND {a}.marketing_visit_category = 'TPS Visits'"
	return "1=0"


def get_visit_type_breakdown(from_date, to_date, staff=""):
	"""Counts of every Field Visit type in the date range (no 500-row cap)."""
	visit_day = visit_day_sql("fv")
	conditions = [
		"fv.docstatus < 2",
		f"{visit_day} BETWEEN %(from_date)s AND %(to_date)s",
	]
	params = {"from_date": from_date, "to_date": to_date}
	apply_team_scope_to_conditions(conditions, params, alias="fv")
	staff = (staff or "").strip()
	if staff:
		tokens = expand_staff_tokens(staff)
		params["staff_tokens"] = tuple(t.lower() for t in tokens) or ("__none__",)
		conditions.append(staff_match_sql("fv", "staff_tokens"))

	where_sql = " AND ".join(f"({c})" for c in conditions)
	rows = frappe.db.sql(
		f"""
		SELECT IFNULL(NULLIF(TRIM(fv.type), ''), 'Other') AS type, COUNT(*) AS count
		FROM `tabField Visit` fv
		WHERE {where_sql}
		GROUP BY 1
		ORDER BY count DESC, type
		""",
		params,
		as_dict=True,
	)
	breakdown = []
	total = 0
	for r in rows:
		total += cint(r.count)
		breakdown.append(
			{
				"type": r.type,
				"count": cint(r.count),
				"metric": TYPE_TO_METRIC.get(r.type, "other"),
			}
		)
	return {"total": total, "breakdown": breakdown}


def _school_sql(alias="fv"):
	a = alias
	return f"""COALESCE(
		NULLIF(TRIM({a}.school_name), ''),
		NULLIF(TRIM({a}.me_school_name), ''),
		NULLIF(TRIM({a}.mt_institute_or_organization_name), ''),
		NULLIF(TRIM({a}.training_venue_name), '')
	)"""


@frappe.whitelist()
def get_visit_drilldown(filters=None, metric=None, staff=None):
	"""Return Field Visit rows that make up a report number."""
	if not frappe.has_permission("Field Visit", "read"):
		frappe.throw(_("You are not permitted to view Field Visit data."), frappe.PermissionError)

	filters = _parse(filters)
	metric = (metric or filters.get("metric") or "visits").strip().lower()
	staff = (staff or filters.get("staff") or filters.get("user") or "").strip()
	from_date = getdate(filters.get("from_date"))
	to_date = getdate(filters.get("to_date"))
	if not from_date or not to_date:
		frappe.throw(_("From Date and To Date are required."))
	if from_date > to_date:
		frappe.throw(_("From Date cannot be after To Date."))

	visit_day = visit_day_sql("fv")
	conditions = [
		"fv.docstatus < 2",
		f"{visit_day} BETWEEN %(from_date)s AND %(to_date)s",
		_metric_condition(metric, "fv"),
	]
	params = {"from_date": from_date, "to_date": to_date}
	apply_team_scope_to_conditions(conditions, params, alias="fv")
	if staff:
		tokens = expand_staff_tokens(staff)
		params["staff_tokens"] = tuple(t.lower() for t in tokens) or ("__none__",)
		conditions.append(staff_match_sql("fv", "staff_tokens"))

	where_sql = " AND ".join(f"({c})" for c in conditions)
	rows = frappe.db.sql(
		f"""
		SELECT
			fv.name,
			fv.type,
			fv.docstatus,
			fv.owner,
			fv.visit_by,
			fv.me_visit_by,
			fv.mt_visit_by,
			fv.training_entry_filled_by,
			fv.marketing_visit_category,
			fv.me_activity_status,
			{visit_day} AS visit_date,
			{_school_sql("fv")} AS school
		FROM `tabField Visit` fv
		WHERE {where_sql}
		ORDER BY visit_date DESC, fv.creation DESC
		LIMIT 1000
		""",
		params,
		as_dict=True,
	)

	status_map = {0: "Draft", 1: "Submitted", 2: "Cancelled"}
	out = []
	by_type = {}
	for r in rows:
		vtype = r.type or "Other"
		by_type[vtype] = by_type.get(vtype, 0) + 1
		officer = (
			r.visit_by
			or r.me_visit_by
			or r.mt_visit_by
			or r.training_entry_filled_by
			or r.owner
			or ""
		)
		out.append(
			{
				"name": r.name,
				"type": vtype,
				"visit_date": str(r.visit_date) if r.visit_date else "",
				"school": r.school or "",
				"officer": officer,
				"status": status_map.get(r.docstatus, r.docstatus),
				"category": r.marketing_visit_category or r.me_activity_status or "",
				"url": f"/app/field-visit/{r.name}",
			}
		)

	breakdown = [{"type": k, "count": v} for k, v in sorted(by_type.items(), key=lambda x: (-x[1], x[0]))]
	label = METRIC_LABELS.get(metric, metric.replace("_", " ").title())
	parts = [f"{b['type']} {b['count']}" for b in breakdown]
	subtitle = " + ".join(parts) if parts else _("No documents")

	return {
		"metric": metric,
		"label": label,
		"count": len(out),
		"breakdown": breakdown,
		"subtitle": subtitle,
		"title": _("{0}: {1}").format(label, len(out)),
		"from_date": str(from_date),
		"to_date": str(to_date),
		"staff": staff,
		"rows": out,
	}
