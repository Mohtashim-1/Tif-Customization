# Copyright (c) 2026, TIF Customization and contributors
# License: MIT
"""Shared Volunteer / Ambassador enrolment dashboard helpers."""

from __future__ import annotations

import json

import frappe
from frappe import _
from frappe.utils import getdate, today

from tif_customization.tif_customization.field_visit_permissions import (
	apply_team_scope_to_conditions,
	expand_staff_tokens,
	staff_match_sql,
	visit_day_sql,
)
from tif_customization.tif_customization.page.smes_target_base___k.smes_target_base___k import (
	_fiscal_year_start,
)

KIND_META = {
	"volunteer": {
		"child_doctype": "Field Visit Volunteer",
		"parentfield": "volunteer_enrolments",
		"visit_type": "Enrolment of Volunteers",
		"name_field": "volunteer_name",
		"form_field": "volunteer_form_submitted",
		"label": "Volunteer",
		"plural": "Volunteers",
	},
	"ambassador": {
		"child_doctype": "Field Visit Ambassador",
		"parentfield": "ambassador_enrolments",
		"visit_type": "Enrolment of Ambassadors",
		"name_field": "ambassador_name",
		"form_field": "ambassador_form_submitted",
		"label": "Ambassador",
		"plural": "Ambassadors",
	},
}


def _parse(filters):
	if isinstance(filters, str):
		try:
			return json.loads(filters) or {}
		except Exception:
			return {}
	return filters or {}


def _dates(filters):
	to_date = getdate(filters.get("to_date") or today())
	from_date = filters.get("from_date")
	if from_date:
		from_date = getdate(from_date)
	else:
		fy = _fiscal_year_start(to_date.year, to_date.month)
		from_date = getdate(f"{fy}-07-01")
	if from_date > to_date:
		from_date = to_date
	return from_date, to_date


@frappe.whitelist()
def get_dashboard_data(filters=None, kind=None):
	"""kind: volunteer | ambassador | both (default both for legacy page)."""
	if not frappe.has_permission("Field Visit", "read"):
		frappe.throw(_("You are not permitted to view Field Visit data."), frappe.PermissionError)

	filters = _parse(filters)
	kind = (kind or filters.get("kind") or "both").strip().lower()
	if kind not in ("volunteer", "ambassador", "both"):
		frappe.throw(_("Invalid dashboard kind."))

	from_date, to_date = _dates(filters)
	province = (filters.get("province") or "").strip()
	city = (filters.get("city") or "").strip()
	staff = (filters.get("staff") or "").strip()

	if kind == "both":
		volunteers = _fetch_rows("volunteer", from_date, to_date, province, city, staff)
		ambassadors = _fetch_rows("ambassador", from_date, to_date, province, city, staff)
		return {
			"kind": "both",
			"from_date": str(from_date),
			"to_date": str(to_date),
			"kpis": {
				"volunteers": len(volunteers),
				"ambassadors": len(ambassadors),
				"volunteer_visits": len({r["visit"] for r in volunteers}),
				"ambassador_visits": len({r["visit"] for r in ambassadors}),
				"volunteer_schools": len({r["school"] for r in volunteers if r.get("school")}),
				"ambassador_schools": len({r["school"] for r in ambassadors if r.get("school")}),
				"volunteer_forms_yes": sum(1 for r in volunteers if (r.get("form_submitted") or "").lower() == "yes"),
				"ambassador_forms_yes": sum(1 for r in ambassadors if (r.get("form_submitted") or "").lower() == "yes"),
				"total_people": len(volunteers) + len(ambassadors),
			},
			"by_province": _group_counts(volunteers, ambassadors, "province"),
			"by_city": _group_counts(volunteers, ambassadors, "city"),
			"by_officer": _group_counts(volunteers, ambassadors, "officer"),
			"volunteers": volunteers[:200],
			"ambassadors": ambassadors[:200],
		}

	rows = _fetch_rows(kind, from_date, to_date, province, city, staff)
	meta = KIND_META[kind]
	return {
		"kind": kind,
		"label": meta["label"],
		"plural": meta["plural"],
		"from_date": str(from_date),
		"to_date": str(to_date),
		"kpis": {
			"people": len(rows),
			"visits": len({r["visit"] for r in rows}),
			"schools": len({r["school"] for r in rows if r.get("school")}),
			"forms_yes": sum(1 for r in rows if (r.get("form_submitted") or "").lower() == "yes"),
			"forms_no": sum(1 for r in rows if (r.get("form_submitted") or "").lower() != "yes"),
			"provinces": len({r["province"] for r in rows if r.get("province")}),
			"cities": len({r["city"] for r in rows if r.get("city")}),
			"officers": len({r["officer"] for r in rows if r.get("officer")}),
		},
		"by_province": _group_single(rows, "province"),
		"by_city": _group_single(rows, "city"),
		"by_officer": _group_single(rows, "officer"),
		"by_school": _group_single(rows, "school"),
		"rows": rows[:500],
	}


def _fetch_rows(kind, from_date, to_date, province, city, staff):
	meta = KIND_META[kind]
	if not frappe.db.exists("DocType", meta["child_doctype"]):
		return []
	return _rows(
		meta["child_doctype"],
		meta["parentfield"],
		meta["visit_type"],
		from_date,
		to_date,
		province,
		city,
		staff,
		name_field=meta["name_field"],
		form_field=meta["form_field"],
	)


def _rows(child_doctype, parentfield, visit_type, from_date, to_date, province, city, staff, name_field, form_field):
	if not frappe.db.exists("DocType", child_doctype):
		return []
	visit_day = visit_day_sql("fv")
	conditions = [
		"fv.docstatus = 1",
		f"{visit_day} BETWEEN %(from_date)s AND %(to_date)s",
		"c.parenttype = 'Field Visit'",
		"c.parentfield = %(parentfield)s",
	]
	params = {
		"from_date": from_date,
		"to_date": to_date,
		"parentfield": parentfield,
	}
	_ = visit_type

	if province:
		conditions.append(
			"""COALESCE(NULLIF(TRIM(c.province), ''), NULLIF(TRIM(fv.province), ''), NULLIF(TRIM(fv.me_province), '')) = %(province)s"""
		)
		params["province"] = province
	if city:
		conditions.append(
			"""COALESCE(NULLIF(TRIM(c.city), ''), NULLIF(TRIM(fv.city), ''), NULLIF(TRIM(fv.me_city), '')) = %(city)s"""
		)
		params["city"] = city

	apply_team_scope_to_conditions(conditions, params, alias="fv")
	if staff:
		tokens = expand_staff_tokens(staff)
		params["staff_tokens"] = tuple(t.lower() for t in tokens) or ("__none__",)
		conditions.append(staff_match_sql("fv", "staff_tokens"))

	has_school = frappe.db.has_column(child_doctype, "school")
	has_profession = frappe.db.has_column(child_doctype, "profession")
	has_contribution = frappe.db.has_column(child_doctype, "contribution")
	has_area = frappe.db.has_column(child_doctype, "area")
	has_address = frappe.db.has_column(child_doctype, "address")

	extra = []
	if has_school:
		extra.append("c.school")
	if has_profession:
		extra.append("c.profession")
	if has_contribution:
		extra.append("c.contribution")
	if has_area:
		extra.append("c.area")
	if has_address:
		extra.append("c.address")
	extra_sql = (", " + ", ".join(extra)) if extra else ""

	where_sql = " AND ".join(f"({c})" for c in conditions)
	rows = frappe.db.sql(
		f"""
		SELECT
			c.name AS row_name,
			c.{name_field} AS person_name,
			c.contact_number,
			c.email,
			c.province AS child_province,
			c.city AS child_city,
			c.{form_field} AS form_submitted,
			c.remarks,
			{visit_day} AS visit_date,
			fv.name AS visit,
			fv.type AS visit_type,
			fv.visit_by,
			fv.me_visit_by,
			fv.owner,
			fv.province AS fv_province,
			fv.city AS fv_city,
			fv.school_name
			{extra_sql}
		FROM `tab{child_doctype}` c
		INNER JOIN `tabField Visit` fv ON fv.name = c.parent
		WHERE {where_sql}
		ORDER BY visit_date DESC, c.creation DESC
		LIMIT 2000
		""",
		params,
		as_dict=True,
	)

	out = []
	for r in rows:
		officer = (r.visit_by or r.me_visit_by or r.owner or "").strip()
		out.append(
			{
				"row_name": r.row_name,
				"name": (r.person_name or "").strip(),
				"contact": (r.contact_number or "").strip(),
				"email": (r.email or "").strip(),
				"province": (r.child_province or r.fv_province or "").strip(),
				"city": (r.child_city or r.fv_city or "").strip(),
				"area": (getattr(r, "area", None) or "").strip() if has_area else "",
				"address": (getattr(r, "address", None) or "").strip() if has_address else "",
				"school": (getattr(r, "school", None) or r.school_name or "").strip()
				if has_school
				else (r.school_name or "").strip(),
				"profession": (getattr(r, "profession", None) or "").strip() if has_profession else "",
				"contribution": (getattr(r, "contribution", None) or "").strip() if has_contribution else "",
				"form_submitted": (r.form_submitted or "No").strip(),
				"remarks": (r.remarks or "").strip(),
				"visit": r.visit,
				"visit_date": str(r.visit_date) if r.visit_date else "",
				"visit_type": r.visit_type or "",
				"officer": officer,
				"url": f"/app/field-visit/{r.visit}",
			}
		)
	return out


def _group_counts(volunteers, ambassadors, key):
	bucket = {}
	for kind, rows in (("volunteers", volunteers), ("ambassadors", ambassadors)):
		for r in rows:
			label = (r.get(key) or "—").strip() or "—"
			slot = bucket.setdefault(label, {"label": label, "volunteers": 0, "ambassadors": 0})
			slot[kind] += 1
	rows = list(bucket.values())
	rows.sort(key=lambda x: (-(x["volunteers"] + x["ambassadors"]), x["label"].lower()))
	return rows[:25]


def _group_single(rows, key):
	bucket = {}
	for r in rows:
		label = (r.get(key) or "—").strip() or "—"
		bucket[label] = bucket.get(label, 0) + 1
	out = [{"label": k, "count": v} for k, v in bucket.items()]
	out.sort(key=lambda x: (-x["count"], x["label"].lower()))
	return out[:25]
