# Copyright (c) 2026, TIF Customization and contributors
# License: MIT
"""Field Visits grouped by Customer (School Name)."""

from __future__ import annotations

import json

import frappe
from frappe import _
from frappe.utils import cint, cstr, getdate


def _parse_filters(filters=None) -> dict:
	if isinstance(filters, str):
		filters = json.loads(filters or "{}")
	return filters or {}


def _permission_ok():
	if not frappe.has_permission("Field Visit", "read"):
		frappe.throw(_("You are not permitted to view Field Visit data."), frappe.PermissionError)


def _date_type_clauses(filters: dict, params: dict) -> list[str]:
	conds = []
	from_date = (filters.get("from_date") or "").strip()
	to_date = (filters.get("to_date") or "").strip()
	visit_type = (filters.get("type") or "").strip()
	if from_date:
		conds.append("fv.visit_date >= %(from_date)s")
		params["from_date"] = getdate(from_date)
	if to_date:
		conds.append("fv.visit_date <= %(to_date)s")
		params["to_date"] = getdate(to_date)
	if visit_type:
		conds.append("fv.type = %(type)s")
		params["type"] = visit_type
	return conds


def _remarks_sql(alias="fv"):
	a = alias
	return f"""NULLIF(TRIM(COALESCE(
		NULLIF(TRIM({a}.school_additional_remarks), ''),
		NULLIF(TRIM({a}.school_remarks_follow_up), ''),
		NULLIF(TRIM({a}.mt_remarks), ''),
		NULLIF(TRIM({a}.ot_remarks), ''),
		NULLIF(TRIM({a}.travel_remarks), '')
	)), '')"""


def _category_sql(alias="fv"):
	a = alias
	return f"""NULLIF(TRIM(COALESCE(
		NULLIF(TRIM({a}.marketing_visit_category), ''),
		NULLIF(TRIM({a}.training_session_category), ''),
		NULLIF(TRIM({a}.training_school_category), '')
	)), '')"""


def _officer_sql(alias="fv"):
	a = alias
	return f"""NULLIF(TRIM(COALESCE(
		NULLIF(TRIM({a}.visit_by), ''),
		NULLIF(TRIM({a}.me_visit_by), ''),
		NULLIF(TRIM({a}.mt_visit_by), '')
	)), '')"""


@frappe.whitelist()
def get_customers(filters=None):
	"""Customers (schools) with Field Visit counts."""
	_permission_ok()
	filters = _parse_filters(filters)
	params = {}
	conds = ["fv.docstatus < 2"]
	conds.extend(_date_type_clauses(filters, params))

	search = (filters.get("search") or "").strip()
	if search:
		conds.append(
			"""(
				IFNULL(fv.school_name, '') LIKE %(search)s
				OR IFNULL(cust.customer_name, '') LIKE %(search)s
				OR IFNULL(fv.pending_school_name, '') LIKE %(search)s
				OR IFNULL(fv.visit_by, '') LIKE %(search)s
				OR fv.name LIKE %(search)s
			)"""
		)
		params["search"] = f"%{search}%"

	where = " AND ".join(conds)
	limit = max(1, min(cint(filters.get("limit") or 200), 500))
	start = max(0, cint(filters.get("start") or 0))
	no_school = _("(No School)")

	rows = frappe.db.sql(
		f"""
		SELECT
			IFNULL(NULLIF(TRIM(fv.school_name), ''), '') AS customer,
			CASE
				WHEN IFNULL(NULLIF(TRIM(fv.school_name), ''), '') = ''
				THEN IFNULL(NULLIF(TRIM(fv.pending_school_name), ''), '')
				ELSE ''
			END AS pending_name,
			COALESCE(
				NULLIF(TRIM(cust.customer_name), ''),
				NULLIF(TRIM(fv.pending_school_name), ''),
				NULLIF(TRIM(fv.school_name), ''),
				%(no_school)s
			) AS customer_name,
			COUNT(*) AS visit_count,
			MIN(fv.visit_date) AS first_visit,
			MAX(fv.visit_date) AS last_visit
		FROM `tabField Visit` fv
		LEFT JOIN `tabCustomer` cust ON cust.name = fv.school_name
		WHERE {where}
		GROUP BY 1, 2, 3
		ORDER BY customer_name ASC
		LIMIT %(limit)s OFFSET %(start)s
		""",
		{**params, "no_school": no_school, "limit": limit, "start": start},
		as_dict=True,
	)

	total = frappe.db.sql(
		f"""
		SELECT COUNT(*) FROM (
			SELECT 1
			FROM `tabField Visit` fv
			LEFT JOIN `tabCustomer` cust ON cust.name = fv.school_name
			WHERE {where}
			GROUP BY
				IFNULL(NULLIF(TRIM(fv.school_name), ''), ''),
				CASE
					WHEN IFNULL(NULLIF(TRIM(fv.school_name), ''), '') = ''
					THEN IFNULL(NULLIF(TRIM(fv.pending_school_name), ''), '')
					ELSE ''
				END,
				COALESCE(
					NULLIF(TRIM(cust.customer_name), ''),
					NULLIF(TRIM(fv.pending_school_name), ''),
					NULLIF(TRIM(fv.school_name), ''),
					%(no_school)s
				)
		) t
		""",
		{**params, "no_school": no_school},
	)[0][0]

	return {
		"rows": rows,
		"total": cint(total),
		"start": start,
		"limit": limit,
	}


@frappe.whitelist()
def get_visits(filters=None):
	"""Field Visits for one customer, sorted by document name ASC."""
	_permission_ok()
	filters = _parse_filters(filters)
	customer = cstr(filters.get("customer") or "").strip()
	pending_name = cstr(filters.get("pending_name") or "").strip()

	params = {}
	conds = ["fv.docstatus < 2"]
	conds.extend(_date_type_clauses(filters, params))

	if customer:
		conds.append("fv.school_name = %(customer)s")
		params["customer"] = customer
	else:
		conds.append("IFNULL(fv.school_name, '') = ''")
		if pending_name:
			conds.append("IFNULL(TRIM(fv.pending_school_name), '') = %(pending_name)s")
			params["pending_name"] = pending_name
		else:
			conds.append("IFNULL(TRIM(fv.pending_school_name), '') = ''")

	where = " AND ".join(conds)
	rows = frappe.db.sql(
		f"""
		SELECT
			fv.name,
			fv.visit_date,
			fv.type,
			{_category_sql("fv")} AS category,
			{_remarks_sql("fv")} AS remarks,
			{_officer_sql("fv")} AS field_officer,
			fv.school_name AS customer,
			COALESCE(
				NULLIF(TRIM(cust.customer_name), ''),
				NULLIF(TRIM(fv.pending_school_name), ''),
				NULLIF(TRIM(fv.school_name), ''),
				''
			) AS customer_name,
			fv.docstatus
		FROM `tabField Visit` fv
		LEFT JOIN `tabCustomer` cust ON cust.name = fv.school_name
		WHERE {where}
		ORDER BY fv.name ASC
		""",
		params,
		as_dict=True,
	)
	return {"rows": rows, "customer": customer, "pending_name": pending_name, "count": len(rows)}


@frappe.whitelist()
def get_filter_options():
	_permission_ok()
	types = frappe.db.sql(
		"""
		SELECT DISTINCT type FROM `tabField Visit`
		WHERE docstatus < 2 AND IFNULL(type, '') != ''
		ORDER BY type
		""",
		pluck=True,
	)
	return {"types": types or []}
