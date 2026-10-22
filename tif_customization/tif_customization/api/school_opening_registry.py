# Copyright (c) 2026, TIF Customization and contributors
# License: MIT

import os
import re

import frappe
from frappe import _
from frappe.utils import escape_html, formatdate, getdate, cstr

from tif_customization.tif_customization.api.school_opening_form import CONTACT_ROLES

# Same overrides as www/school-opening-print.html (wkhtmltopdf does not load /assets/ CSS reliably)
_SCHOOL_OPENING_PDF_STYLE_OVERRIDES = """
body { margin: 0; padding: 0; background: #c8c8c8 !important; }
.soa-print-toolbar { display: none !important; }
/* wkhtmltopdf uses print-media-type; keep the same look as /school-opening-print on screen */
#school-opening-portal.school-opening-portal {
	background: #c8c8c8 !important;
	padding: 20px 16px 48px !important;
	color: #1a1a1a !important;
	font-family: "Segoe UI", system-ui, Arial, sans-serif !important;
}
#school-opening-portal .soa-sheet {
	max-width: 820px !important;
	margin: 0 auto !important;
	background: #ffffff !important;
	padding: 28px 32px 36px !important;
	border: 1px solid #4a4a4a !important;
	box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12) !important;
}
#school-opening-portal .soa-field input:not([type=checkbox]):not([type=radio]),
#school-opening-portal .soa-field textarea,
#school-opening-portal .soa-control {
	background: #ebebeb !important;
	border: 1px solid #a8a8a8 !important;
	min-height: 38px;
	padding: 8px 10px !important;
	border-radius: 2px !important;
	box-shadow: none !important;
	color: #1a1a1a !important;
}
#school-opening-portal .soa-section-title {
	background: none !important;
	color: #1a1a1a !important;
	padding: 0 !important;
}
#school-opening-portal .soa-block {
	border: 1px solid #333333 !important;
	background: #fafafa !important;
}
"""

# wkhtmltopdf 0.12.6 often ignores custom properties — inline literal replacements
_SOA_CSS_VAR_VALUES = {
	"--soa-ink": "#1a1a1a",
	"--soa-border": "#4a4a4a",
	"--soa-box-border": "#333333",
	"--soa-fill": "#ebebeb",
	"--soa-fill-focus": "#ffffff",
	"--soa-page": "#c8c8c8",
	"--soa-sheet": "#ffffff",
	"--soa-font": '"Segoe UI", Arial, sans-serif',
	"--soa-font-doc": 'Georgia, "Times New Roman", Times, serif',
}

_SCHOOL_OPENING_WKHTML_LAYOUT_CSS = """
/* wkhtmltopdf layout + visibility fallbacks */
body, #school-opening-portal, #school-opening-portal * {
	visibility: visible !important;
	opacity: 1 !important;
}
#school-opening-portal,
#school-opening-portal .soa-sheet,
#school-opening-portal .soa-field,
#school-opening-portal label,
#school-opening-portal h1,
#school-opening-portal th,
#school-opening-portal td {
	color: #1a1a1a !important;
	-webkit-text-fill-color: #1a1a1a !important;
}
#school-opening-portal .soa-title-row,
#school-opening-portal .soa-meta-inline,
#school-opening-portal .soa-date-picker-input-wrap {
	display: block !important;
}
#school-opening-portal .soa-row-2 .soa-field,
#school-opening-portal .soa-row-3 .soa-field {
	display: inline-block !important;
	vertical-align: top !important;
	width: 48% !important;
	margin-bottom: 10px !important;
}
#school-opening-portal .soa-check-grid {
	display: block !important;
}
#school-opening-portal .soa-check-grid label {
	display: block !important;
	width: 32% !important;
	float: left !important;
}
#school-opening-portal .soa-check-grid::after {
	content: "";
	display: block;
	clear: both;
}
#school-opening-portal .soa-date-popup {
	display: none !important;
}
"""


def _pdf_safe_css(css: str) -> str:
	for var, value in _SOA_CSS_VAR_VALUES.items():
		css = css.replace(f"var({var})", value)
	# Selectors like :has() break Frappe's cssutils pass and some wkhtmltopdf builds
	css = re.sub(r"[^{}]*:has\([^)]*\)[^{]*\{[^}]*\}", "", css, flags=re.MULTILINE)
	return css


def _school_opening_embedded_css():
	"""Read form + print CSS from disk for PDF (avoid broken external asset URLs in wkhtmltopdf)."""
	app_path = frappe.get_app_path("tif_customization", "public", "css")
	parts = []
	with open(os.path.join(app_path, "school_opening_form.css"), encoding="utf-8") as f:
		parts.append(f.read())
	# Screen-only rules from print.css (skip @media print — wkhtmltopdf enables print-media-type)
	with open(os.path.join(app_path, "school_opening_print.css"), encoding="utf-8") as f:
		print_css = f.read()
	if "@media print" in print_css:
		print_css = print_css.split("@media print", 1)[0]
	parts.append(print_css)
	parts.append(_SCHOOL_OPENING_PDF_STYLE_OVERRIDES)
	parts.append(_SCHOOL_OPENING_WKHTML_LAYOUT_CSS)
	return _pdf_safe_css("\n".join(parts))


def _csv_to_list(value):
	if not value:
		return []
	if isinstance(value, (list, tuple)):
		return [cstr(v).strip() for v in value if cstr(v).strip()]
	return [v.strip() for v in cstr(value).split(",") if v.strip()]


def resolve_customer_name(raw):
	"""Map URL customer param to Customer.name (handles name vs ID and trailing spaces)."""
	raw = (raw or "").strip()
	if not raw:
		return ""
	if frappe.db.exists("Customer", raw):
		return raw
	by_name = frappe.db.get_value("Customer", {"customer_name": raw}, "name")
	if by_name:
		return by_name
	# Some legacy rows have trailing spaces in customer_name
	rows = frappe.db.sql(
		"""
		SELECT name FROM `tabCustomer`
		WHERE TRIM(customer_name) = TRIM(%s) OR TRIM(name) = TRIM(%s)
		LIMIT 1
		""",
		(raw, raw),
	)
	return rows[0][0] if rows else raw


def _ensure_customer_access(customer):
	customer = resolve_customer_name(customer)
	if not customer or not frappe.db.exists("Customer", customer):
		frappe.throw(_("Customer {0} not found.").format(customer))
	if not frappe.has_permission("Customer", "read", customer):
		frappe.throw(_("Not permitted to view this customer."), frappe.PermissionError)
	return customer


# Match the Customer list: all active customers (many schools are not tagged "School" on the form).
_SCHOOL_CUSTOMER_BASE_CONDITION = "IFNULL(c.disabled, 0) = 0"

_SCHOOL_OPENING_APP_JOIN = """
LEFT JOIN (
	SELECT
		customer,
		SUBSTRING_INDEX(
			GROUP_CONCAT(
				NULLIF(TRIM(tif_representative), '')
				ORDER BY modified DESC
				SEPARATOR '\\n'
			),
			'\\n',
			1
		) AS field_officer
	FROM `tabSchool Opening Application`
	WHERE docstatus = 1 AND IFNULL(customer, '') != ''
	GROUP BY customer
) soa ON soa.customer = c.name
"""

_FIELD_VISIT_FO_SUBQUERY = """
	SELECT
		TRIM(school_name) AS school_key,
		SUBSTRING_INDEX(
			GROUP_CONCAT(
				TRIM(COALESCE(
					NULLIF(TRIM(visit_by), ''),
					NULLIF(TRIM(me_visit_by), ''),
					NULLIF(TRIM(mt_visit_by), '')
				))
				ORDER BY modified DESC
				SEPARATOR '\\n'
			),
			'\\n',
			1
		) AS field_officer
	FROM `tabField Visit`
	WHERE docstatus < 2
		AND IFNULL(TRIM(school_name), '') != ''
		AND TRIM(COALESCE(
			NULLIF(TRIM(visit_by), ''),
			NULLIF(TRIM(me_visit_by), ''),
			NULLIF(TRIM(mt_visit_by), '')
		)) != ''
	GROUP BY TRIM(school_name)
"""

_SCHOOL_REGISTRY_FO_JOINS = f"""
{_SCHOOL_OPENING_APP_JOIN}
LEFT JOIN (
{_FIELD_VISIT_FO_SUBQUERY}
) fv_fo_id ON fv_fo_id.school_key = TRIM(c.name)
LEFT JOIN (
{_FIELD_VISIT_FO_SUBQUERY}
) fv_fo_nm ON fv_fo_nm.school_key = TRIM(IFNULL(c.customer_name, ''))
LEFT JOIN `tabUser` owner_u ON owner_u.name = c.owner
"""

_RESOLVED_FIELD_OFFICER_SQL = """
TRIM(COALESCE(
	NULLIF(IFNULL(soa.field_officer, ''), ''),
	NULLIF(IFNULL(fv_fo_id.field_officer, ''), ''),
	NULLIF(IFNULL(fv_fo_nm.field_officer, ''), ''),
	NULLIF(TRIM(IFNULL(owner_u.full_name, owner_u.name)), '')
))
"""


def _normalize_doc_status(value):
	"""Map UI filter values to draft | pending | approved.

	Draft / Pending for Approval = School Opening Application docstatus 0.
	Approved = customers with submitted SC-1.2.
	"""
	raw = cstr(value or "").strip()
	if not raw:
		return ""
	# Frappe Select sometimes returns "value:label" as the whole string
	if ":" in raw:
		raw = raw.split(":", 1)[0].strip()
	raw = raw.lower().replace("-", "_").replace(" ", "_")
	if raw in ("approved", "approve", "submitted", "1"):
		return "approved"
	# Draft and pending approval are the same SOA queue (docstatus 0)
	if raw in (
		"draft",
		"0",
		"pending",
		"pending_approval",
		"pending_for_approval",
		"awaiting_approval",
	):
		return "draft"
	return ""


def _officer_aliases(label):
	"""Name / email tokens that identify one Field Officer (for exact filter match)."""
	label = cstr(label or "").strip()
	if not label:
		return []
	aliases = {label}
	rows = frappe.db.sql(
		"""
		SELECT
			TRIM(IFNULL(fo.name1, '')) AS name1,
			TRIM(IFNULL(fo.user, '')) AS user_id,
			TRIM(IFNULL(u.full_name, '')) AS full_name
		FROM `tabField Officer` fo
		LEFT JOIN `tabUser` u ON u.name = fo.user
		WHERE TRIM(IFNULL(fo.name1, '')) = %(label)s
			OR TRIM(IFNULL(fo.user, '')) = %(label)s
			OR TRIM(IFNULL(u.full_name, '')) = %(label)s
		""",
		{"label": label},
		as_dict=True,
	)
	for row in rows:
		for key in ("name1", "user_id", "full_name"):
			val = cstr(row.get(key) or "").strip()
			if val:
				aliases.add(val)
	return list(aliases)


def _school_registry_filter_clause(
	search=None,
	govt_private=None,
	status=None,
	territory=None,
	form_data=None,
	city=None,
	address_search=None,
	customers=None,
	field_officer=None,
	doc_status=None,
	created_by=None,
):
	conditions = [_SCHOOL_CUSTOMER_BASE_CONDITION]
	values = {}

	customer_list = frappe.parse_json(customers) if isinstance(customers, str) else customers
	if customer_list:
		customer_list = [cstr(c).strip() for c in customer_list if cstr(c).strip()]
	if customer_list:
		conditions.append("c.name IN %(registry_customers)s")
		values["registry_customers"] = tuple(customer_list)
		return " AND ".join(conditions), values

	search = (search or "").strip()
	if search:
		conditions.append("(c.name LIKE %(search)s OR c.customer_name LIKE %(search)s)")
		values["search"] = f"%{search}%"

	govt_private = (govt_private or "").strip()
	if govt_private:
		conditions.append("IFNULL(c.custom_govt_private, '') = %(govt_private)s")
		values["govt_private"] = govt_private

	status = (status or "").strip()
	if status:
		conditions.append("IFNULL(c.custom_status, '') = %(status)s")
		values["status"] = status

	territory = (territory or "").strip()
	if territory:
		conditions.append("IFNULL(c.territory, '') = %(territory)s")
		values["territory"] = territory

	doc_status_norm = _normalize_doc_status(doc_status)
	form_data = (form_data or "").strip().lower()
	if doc_status_norm == "approved" or form_data == "full":
		conditions.append("soa.customer IS NOT NULL")
	elif form_data in ("customer_only", "customer-only", "customer"):
		conditions.append("soa.customer IS NULL")

	field_officer = (field_officer or "").strip()
	if field_officer:
		# Same expression as the Field Officer column
		aliases = _officer_aliases(field_officer) or [field_officer]
		values["fo_aliases"] = tuple(aliases)
		conditions.append(f"({_RESOLVED_FIELD_OFFICER_SQL}) IN %(fo_aliases)s")

	created_by = (created_by or "").strip()
	if created_by:
		conditions.append(
			"""(
			c.owner = %(created_by)s
			OR EXISTS (
				SELECT 1 FROM `tabUser` u
				WHERE u.name = c.owner
					AND (
						TRIM(IFNULL(u.full_name, '')) = %(created_by)s
						OR u.name = %(created_by)s
					)
			)
		)"""
		)
		values["created_by"] = created_by

	city = (city or "").strip()
	if city:
		conditions.append(
			"""(
			EXISTS (
				SELECT 1 FROM `tabDynamic Link` dl
				INNER JOIN `tabAddress` a ON a.name = dl.parent
				WHERE dl.link_doctype = 'Customer' AND dl.link_name = c.name
					AND IFNULL(a.disabled, 0) = 0
					AND IFNULL(a.city, '') LIKE %(city)s
			)
			OR EXISTS (
				SELECT 1 FROM `tabSchool Opening Application` app
				WHERE app.customer = c.name AND IFNULL(app.city, '') LIKE %(city)s
			)
		)"""
		)
		values["city"] = f"%{city}%"

	address_search = (address_search or "").strip()
	if address_search:
		conditions.append(
			"""(
			EXISTS (
				SELECT 1 FROM `tabDynamic Link` dl
				INNER JOIN `tabAddress` a ON a.name = dl.parent
				WHERE dl.link_doctype = 'Customer' AND dl.link_name = c.name
					AND IFNULL(a.disabled, 0) = 0
					AND (
						IFNULL(a.address_line1, '') LIKE %(addr_pat)s
						OR IFNULL(a.address_line2, '') LIKE %(addr_pat)s
						OR IFNULL(a.city, '') LIKE %(addr_pat)s
						OR IFNULL(a.state, '') LIKE %(addr_pat)s
					)
			)
			OR EXISTS (
				SELECT 1 FROM `tabSchool Opening Application` app
				WHERE app.customer = c.name
					AND (
						IFNULL(app.address, '') LIKE %(addr_pat)s
						OR IFNULL(app.area, '') LIKE %(addr_pat)s
						OR IFNULL(app.city, '') LIKE %(addr_pat)s
						OR IFNULL(app.province, '') LIKE %(addr_pat)s
					)
			)
		)"""
		)
		values["addr_pat"] = f"%{address_search}%"

	return " AND ".join(conditions), values


@frappe.whitelist()
def get_school_registry_filter_options():
	"""Distinct filter values for school customers (registry toolbar)."""
	base = f"WHERE {_SCHOOL_CUSTOMER_BASE_CONDITION}"

	def distinct(field):
		return [
			row[0]
			for row in frappe.db.sql(
				f"""
				SELECT DISTINCT IFNULL(c.{field}, '') AS v
				FROM `tabCustomer` c
				{base}
				HAVING v != ''
				ORDER BY v
				"""
			)
		]

	cities = [
		row[0]
		for row in frappe.db.sql(
			f"""
			SELECT DISTINCT v FROM (
				SELECT IFNULL(a.city, '') AS v
				FROM `tabCustomer` c
				INNER JOIN `tabDynamic Link` dl
					ON dl.link_doctype = 'Customer' AND dl.link_name = c.name
				INNER JOIN `tabAddress` a ON a.name = dl.parent AND IFNULL(a.disabled, 0) = 0
				{base}
				UNION
				SELECT IFNULL(app.city, '') AS v
				FROM `tabCustomer` c
				INNER JOIN `tabSchool Opening Application` app ON app.customer = c.name
				{base}
			) cities
			WHERE v != ''
			ORDER BY v
			"""
		)
	]

	# Use Field Officer master only — free-text visit_by / creators caused duplicate / junk names
	field_officers = [
		row[0]
		for row in frappe.db.sql(
			"""
			SELECT DISTINCT TRIM(name1) AS v
			FROM `tabField Officer`
			WHERE IFNULL(status, 'Active') = 'Active'
				AND IFNULL(TRIM(name1), '') != ''
			ORDER BY v
			"""
		)
	]

	return {
		"govt_private": distinct("custom_govt_private"),
		"status": distinct("custom_status"),
		"cities": cities,
		"field_officers": field_officers,
		"doc_status": [
			{"value": "draft", "label": _("Draft")},
			{"value": "pending", "label": _("Pending for Approval")},
			{"value": "approved", "label": _("Approved")},
		],
	}


def _wants_pending_list(form_data=None, doc_status=None):
	"""Draft / Pending for Approval → School Opening Application drafts (docstatus 0)."""
	doc_status_norm = _normalize_doc_status(doc_status)
	if doc_status_norm in ("draft", "pending"):
		return True
	form_data_norm = (form_data or "").strip().lower()
	return form_data_norm in ("pending", "pending_approval", "draft")


@frappe.whitelist()
def list_school_customers(
	search=None,
	limit=50,
	start=0,
	govt_private=None,
	status=None,
	territory=None,
	form_data=None,
	city=None,
	address_search=None,
	field_officer=None,
	doc_status=None,
	created_by=None,
):
	"""Paginated school customers (or pending applications) for the registry."""
	limit = min(max(int(limit or 50), 1), 200)
	start = max(int(start or 0), 0)

	if _wants_pending_list(form_data=form_data, doc_status=doc_status):
		return _list_pending_applications(
			search=search,
			limit=limit,
			start=start,
			city=city,
			address_search=address_search,
			field_officer=field_officer,
			created_by=created_by,
		)

	where, filter_values = _school_registry_filter_clause(
		search=search,
		govt_private=govt_private,
		status=status,
		territory=territory,
		form_data=form_data,
		city=city,
		address_search=address_search,
		field_officer=field_officer,
		doc_status=doc_status,
		created_by=created_by,
	)
	values = {"limit": limit, "start": start, **filter_values}

	total = frappe.db.sql(
		f"""
		SELECT COUNT(*)
		FROM `tabCustomer` c
		{_SCHOOL_REGISTRY_FO_JOINS}
		WHERE {where}
		""",
		values,
	)[0][0]

	rows = frappe.db.sql(
		f"""
		SELECT
			c.name AS customer,
			c.customer_name,
			c.customer_type,
			c.custom_govt_private AS govt_private,
			c.custom_status AS status,
			c.custom_registration_date AS registration_date,
			c.territory,
			c.modified,
			c.owner AS created_by_user,
			{_RESOLVED_FIELD_OFFICER_SQL} AS field_officer,
			IF(soa.customer IS NOT NULL, 1, 0) AS has_application
		FROM `tabCustomer` c
		{_SCHOOL_REGISTRY_FO_JOINS}
		WHERE {where}
		ORDER BY c.customer_name
		LIMIT %(limit)s OFFSET %(start)s
		""",
		values,
		as_dict=True,
	)

	customers = [row.customer for row in rows]
	addr_map = _addresses_for_customers(customers)
	owner_names = _user_display_names([row.get("created_by_user") for row in rows])
	for row in rows:
		row.has_application = bool(row.pop("has_application", 0))
		row.application = None
		row.row_type = "customer"
		created_by_user = cstr(row.pop("created_by_user", None) or "").strip()
		row.created_by = owner_names.get(created_by_user) or created_by_user
		row.field_officer = cstr(row.get("field_officer") or "").strip()
		row.doc_status = "approved" if row.has_application else "customer_only"
		row.doc_status_label = _("Approved") if row.has_application else ""
		_apply_registry_location(row, addr_map.get(row.customer))

	return {"rows": rows, "total": total, "start": start, "page_length": limit, "mode": "customer"}


def _list_pending_applications(
	search=None,
	limit=50,
	start=0,
	city=None,
	address_search=None,
	field_officer=None,
	created_by=None,
):
	"""Draft School Opening Applications waiting for HO approval."""
	conditions = ["docstatus = 0"]
	values = {"limit": limit, "start": start}

	search = (search or "").strip()
	if search:
		conditions.append(
			"(name LIKE %(search)s OR IFNULL(school_name, '') LIKE %(search)s OR IFNULL(city, '') LIKE %(search)s)"
		)
		values["search"] = f"%{search}%"

	city = (city or "").strip()
	if city:
		conditions.append("IFNULL(city, '') LIKE %(city)s")
		values["city"] = f"%{city}%"

	address_search = (address_search or "").strip()
	if address_search:
		conditions.append(
			"""(
			IFNULL(address, '') LIKE %(addr_pat)s
			OR IFNULL(area, '') LIKE %(addr_pat)s
			OR IFNULL(city, '') LIKE %(addr_pat)s
			OR IFNULL(province, '') LIKE %(addr_pat)s
		)"""
		)
		values["addr_pat"] = f"%{address_search}%"

	field_officer = (field_officer or "").strip()
	if field_officer:
		fo_aliases = _officer_aliases(field_officer) or [field_officer]
		values["fo_aliases"] = tuple(fo_aliases)
		# Match displayed FO only: TIF Representative, or creator when representative is blank
		conditions.append(
			"""(
			IFNULL(TRIM(tif_representative), '') IN %(fo_aliases)s
			OR (
				IFNULL(TRIM(tif_representative), '') = ''
				AND (
					owner IN %(fo_aliases)s
					OR EXISTS (
						SELECT 1 FROM `tabUser` u
						WHERE u.name = `tabSchool Opening Application`.owner
							AND (
								u.name IN %(fo_aliases)s
								OR TRIM(IFNULL(u.full_name, '')) IN %(fo_aliases)s
							)
					)
				)
			)
		)"""
		)

	created_by = (created_by or "").strip()
	if created_by:
		conditions.append(
			"""(
			owner = %(created_by)s
			OR EXISTS (
				SELECT 1 FROM `tabUser` u
				WHERE u.name = `tabSchool Opening Application`.owner
					AND (
						TRIM(IFNULL(u.full_name, '')) = %(created_by)s
						OR u.name = %(created_by)s
					)
			)
		)"""
		)
		values["created_by"] = created_by

	where = " AND ".join(conditions)
	total = frappe.db.sql(
		f"SELECT COUNT(*) FROM `tabSchool Opening Application` WHERE {where}",
		values,
	)[0][0]

	rows = frappe.db.sql(
		f"""
		SELECT
			name AS application,
			school_name AS customer_name,
			IFNULL(institution_category, '') AS govt_private,
			'Pending' AS status,
			'' AS territory,
			modified,
			owner AS created_by_user,
			IFNULL(TRIM(tif_representative), '') AS field_officer,
			IFNULL(address, '') AS address,
			IFNULL(area, '') AS area,
			IFNULL(city, '') AS city,
			IFNULL(province, '') AS province,
			IFNULL(country, '') AS country
		FROM `tabSchool Opening Application`
		WHERE {where}
		ORDER BY modified DESC, name DESC
		LIMIT %(limit)s OFFSET %(start)s
		""",
		values,
		as_dict=True,
	)

	owner_names = _user_display_names([row.get("created_by_user") for row in rows])
	for row in rows:
		row.customer = ""
		row.has_application = False
		row.row_type = "pending"
		created_by_user = cstr(row.pop("created_by_user", None) or "").strip()
		row.created_by = owner_names.get(created_by_user) or created_by_user
		row.field_officer = cstr(row.get("field_officer") or "").strip() or row.created_by or ""
		row.doc_status = "draft"
		row.doc_status_label = _("Draft")
		row.full_address = ", ".join(
			p for p in [row.address, row.area, row.city, row.province, row.country] if p
		)

	return {"rows": rows, "total": total, "start": start, "page_length": limit, "mode": "pending"}


@frappe.whitelist()
def get_school_opening_neighbors(
	customer=None,
	application=None,
	search=None,
	govt_private=None,
	status=None,
	territory=None,
	form_data=None,
	city=None,
	address_search=None,
	field_officer=None,
	doc_status=None,
	created_by=None,
):
	"""Previous / next document keys for the print toolbar (same order as registry)."""
	application = (application or "").strip()
	customer = resolve_customer_name(customer) if customer else ""

	if application or _wants_pending_list(form_data=form_data, doc_status=doc_status):
		return _neighbors_pending(
			application=application,
			search=search,
			city=city,
			address_search=address_search,
			field_officer=field_officer,
			created_by=created_by,
		)

	if not customer:
		frappe.throw(_("Customer or application is required."))

	where, filter_values = _school_registry_filter_clause(
		search=search,
		govt_private=govt_private,
		status=status,
		territory=territory,
		form_data=form_data,
		city=city,
		address_search=address_search,
		field_officer=field_officer,
		doc_status=doc_status,
		created_by=created_by,
	)
	keys = frappe.db.sql(
		f"""
		SELECT c.name
		FROM `tabCustomer` c
		{_SCHOOL_REGISTRY_FO_JOINS}
		WHERE {where}
		ORDER BY c.customer_name
		""",
		filter_values,
		as_list=True,
	)
	names = [r[0] for r in keys]
	return _neighbor_payload(names, customer, key_field="customer")


def _neighbors_pending(
	application=None, search=None, city=None, address_search=None, field_officer=None, created_by=None
):
	conditions = ["docstatus = 0"]
	values = {}
	search = (search or "").strip()
	if search:
		conditions.append(
			"(name LIKE %(search)s OR IFNULL(school_name, '') LIKE %(search)s OR IFNULL(city, '') LIKE %(search)s)"
		)
		values["search"] = f"%{search}%"
	city = (city or "").strip()
	if city:
		conditions.append("IFNULL(city, '') LIKE %(city)s")
		values["city"] = f"%{city}%"
	field_officer = (field_officer or "").strip()
	if field_officer:
		conditions.append(
			"""(
			IFNULL(TRIM(tif_representative), '') = %(field_officer)s
			OR owner = %(field_officer)s
			OR EXISTS (
				SELECT 1 FROM `tabUser` u
				WHERE u.name = `tabSchool Opening Application`.owner
					AND TRIM(IFNULL(u.full_name, '')) = %(field_officer)s
			)
		)"""
		)
		values["field_officer"] = field_officer
	created_by = (created_by or "").strip()
	if created_by:
		conditions.append(
			"""(
			owner = %(created_by)s
			OR EXISTS (
				SELECT 1 FROM `tabUser` u
				WHERE u.name = `tabSchool Opening Application`.owner
					AND (
						TRIM(IFNULL(u.full_name, '')) = %(created_by)s
						OR u.name = %(created_by)s
					)
			)
		)"""
		)
		values["created_by"] = created_by
	address_search = (address_search or "").strip()
	if address_search:
		conditions.append(
			"""(
			IFNULL(address, '') LIKE %(addr_pat)s
			OR IFNULL(area, '') LIKE %(addr_pat)s
			OR IFNULL(city, '') LIKE %(addr_pat)s
			OR IFNULL(province, '') LIKE %(addr_pat)s
		)"""
		)
		values["addr_pat"] = f"%{address_search}%"

	where = " AND ".join(conditions)
	keys = frappe.db.sql(
		f"""
		SELECT name
		FROM `tabSchool Opening Application`
		WHERE {where}
		ORDER BY modified DESC, name DESC
		""",
		values,
		as_list=True,
	)
	names = [r[0] for r in keys]
	current = (application or "").strip()
	if current and current not in names:
		# Draft may have just been approved — fall back to position among all drafts + current
		names = [current] + names
	return _neighbor_payload(names, current, key_field="application")


def _neighbor_payload(names, current, key_field="customer"):
	total = len(names)
	if not current or current not in names:
		return {
			"mode": key_field,
			"current": current or "",
			"prev": None,
			"next": None,
			"index": 0,
			"total": total,
			"label": "",
		}
	idx = names.index(current)
	prev_key = names[idx - 1] if idx > 0 else None
	next_key = names[idx + 1] if idx + 1 < total else None
	return {
		"mode": key_field,
		"current": current,
		"prev": prev_key,
		"next": next_key,
		"index": idx + 1,
		"total": total,
		"label": f"{idx + 1} / {total}" if total else "",
	}


@frappe.whitelist()
def approve_school_opening(application=None, customer=None):
	"""Submit a draft School Opening Application (creates ERP Customer)."""
	application = (application or "").strip()
	customer = (customer or "").strip()

	if not application and customer:
		customer = resolve_customer_name(customer)
		application = frappe.db.get_value(
			"School Opening Application",
			{"customer": customer, "docstatus": 0},
			"name",
			order_by="modified desc",
		)
		if not application:
			# Match draft by school name when FO created SOA before customer existed
			school_name = frappe.db.get_value("Customer", customer, "customer_name")
			if school_name:
				application = frappe.db.get_value(
					"School Opening Application",
					{"school_name": school_name, "docstatus": 0},
					"name",
					order_by="modified desc",
				)

	if not application:
		frappe.throw(_("No pending School Opening Application to approve."))

	if not frappe.db.exists("School Opening Application", application):
		frappe.throw(_("School Opening Application {0} not found.").format(application))

	doc = frappe.get_doc("School Opening Application", application)
	if not frappe.has_permission("School Opening Application", "submit", doc):
		frappe.throw(_("Not permitted to approve this application."), frappe.PermissionError)

	if doc.docstatus == 1:
		return {
			"ok": True,
			"already_approved": True,
			"application": doc.name,
			"customer": doc.customer,
			"message": _("Already approved."),
		}
	if doc.docstatus == 2:
		frappe.throw(_("Cancelled applications cannot be approved."))

	doc.submit()
	doc.reload()
	return {
		"ok": True,
		"already_approved": False,
		"application": doc.name,
		"customer": doc.customer,
		"message": _("School Opening approved. Customer {0} created.").format(doc.customer or ""),
	}


def _csv_join(value):
	if value is None:
		return ""
	if isinstance(value, str):
		return value.strip()
	if isinstance(value, (list, tuple)):
		return ", ".join(cstr(v).strip() for v in value if cstr(v).strip())
	return cstr(value)


_STUDENT_BUCKET_TO_INT = {
	"1-10": 10,
	"11-50": 50,
	"51-200": 200,
	"201-500": 500,
	"501-1000": 1000,
	"1000+": 1001,
}


def _no_of_students_as_int(value):
	"""Map UI value (number or range bucket) to SOA Int, never 0."""
	if value is None or value == "":
		return None
	raw = cstr(value).strip()
	if raw in _STUDENT_BUCKET_TO_INT:
		return _STUDENT_BUCKET_TO_INT[raw]
	try:
		n = int(float(raw))
	except (TypeError, ValueError):
		return None
	return n if n > 0 else None


def _display_no_of_students(value):
	"""Show Customer-compatible range on the SC-1.2 form."""
	from tif_customization.tif_customization.doctype.school.school_customer import (
		student_count_bucket,
	)

	return student_count_bucket(value) or ""


def _apply_school_opening_payload(doc, data):
	"""Map SC-1.2 form JSON onto a School Opening Application doc."""
	data = data or {}
	school_name = (data.get("school_name") or "").strip()
	if not school_name:
		frappe.throw(_("Name of School is required."))

	visit_type = (data.get("visit_type") or "").strip() or "Visit with enrollment"
	if visit_type not in ("Visit without enrollment", "Visit with enrollment"):
		frappe.throw(_("Please select Visit without enrollment or Visit with enrollment."))

	doc.form_date = data.get("form_date") or doc.form_date or getdate()
	doc.visit_type = visit_type
	doc.school_name = school_name
	doc.tif_representative = data.get("tif_representative")
	doc.institution_types = _csv_join(data.get("institution_types"))
	doc.institution_category = data.get("institution_category")
	doc.educational_system = _csv_join(data.get("educational_system"))
	doc.type_of_school = data.get("type_of_school")
	doc.no_of_campuses = data.get("no_of_campuses") or None
	# SOA stores Int; UI may send range buckets used on Customer
	doc.no_of_students = _no_of_students_as_int(data.get("no_of_students"))
	doc.structure = data.get("structure")
	doc.academic_shift = data.get("academic_shift")
	doc.teacher_training_services = _csv_join(data.get("teacher_training_services"))
	doc.tilawat_services = _csv_join(data.get("tilawat_services"))
	doc.quran_program_services = _csv_join(data.get("quran_program_services"))
	doc.running_tif_services = _csv_join(data.get("running_tif_services"))
	doc.curriculum_in_use = _csv_join(data.get("curriculum_in_use"))
	doc.curriculum_others = data.get("curriculum_others")
	doc.fee_structure = data.get("fee_structure")
	doc.website = data.get("website")
	doc.facebook = data.get("facebook")
	doc.instagram = data.get("instagram")
	doc.linkedin = data.get("linkedin")
	doc.other_links = data.get("other_links")
	doc.address = data.get("address")
	doc.area = data.get("area")
	doc.province = data.get("province")
	doc.city = data.get("city")
	doc.country = data.get("country") or "Pakistan"
	doc.marketing_sample_provided = data.get("marketing_sample_provided")
	doc.school_ptcl = data.get("school_ptcl")
	doc.school_mobile = data.get("school_mobile")
	doc.school_whatsapp = data.get("school_whatsapp")
	doc.school_email = data.get("school_email")

	doc.set("key_contacts", [])
	contacts = data.get("key_contacts") or {}
	for role in CONTACT_ROLES:
		row = contacts.get(role) or {}
		if not isinstance(row, dict):
			row = {}
		doc.append(
			"key_contacts",
			{
				"role": role,
				"contact_name": (row.get("name") or "").strip(),
				"cell_no": (row.get("cell") or row.get("cell_no") or "").strip(),
			},
		)


def _sync_customer_from_payload(customer, data):
	"""Keep linked Customer basic fields in sync after HO edit."""
	customer = resolve_customer_name(customer)
	if not customer or not frappe.db.exists("Customer", customer):
		return
	cust = frappe.get_doc("Customer", customer)
	school_name = (data.get("school_name") or "").strip()
	if school_name:
		cust.customer_name = school_name
	meta = frappe.get_meta("Customer")
	govt = ""
	cat = (data.get("institution_category") or "").strip()
	if cat == "Private":
		govt = "Private"
	elif cat == "Provincial Govt.":
		govt = "Govt"
	if govt and meta.has_field("custom_govt_private"):
		cust.custom_govt_private = govt
	if meta.has_field("custom_no_of_students"):
		from tif_customization.tif_customization.doctype.school.school_customer import (
			student_count_bucket,
		)

		bucket = student_count_bucket(data.get("no_of_students"))
		if bucket:
			cust.custom_no_of_students = bucket
	if meta.has_field("custom_shift") and data.get("academic_shift"):
		cust.custom_shift = data.get("academic_shift")
	cust.flags.ignore_permissions = True
	cust.flags.ignore_mandatory = True
	cust.save()


@frappe.whitelist()
def update_school_opening(application=None, customer=None, data=None):
	"""HO edit of SC-1.2 (Farhan / Danish / Administrator / School Approval)."""
	if not can_edit_school_opening_form():
		frappe.throw(_("Not permitted to edit this form."), frappe.PermissionError)

	if isinstance(data, str):
		import json

		data = json.loads(data)
	data = data or {}

	application = (application or "").strip()
	customer = resolve_customer_name(customer) if customer else ""

	if not application and customer:
		application = frappe.db.get_value(
			"School Opening Application",
			{"customer": customer, "docstatus": 1},
			"name",
			order_by="modified desc",
		) or frappe.db.get_value(
			"School Opening Application",
			{"customer": customer},
			"name",
			order_by="modified desc",
		)

	if application:
		if not frappe.db.exists("School Opening Application", application):
			frappe.throw(_("School Opening Application {0} not found.").format(application))
		doc = frappe.get_doc("School Opening Application", application)
		_apply_school_opening_payload(doc, data)
		doc.flags.ignore_permissions = True
		doc.flags.ignore_validate_update_after_submit = True
		doc.save()
		if doc.customer:
			_sync_customer_from_payload(doc.customer, data)
		return {
			"ok": True,
			"application": doc.name,
			"customer": doc.customer or customer or "",
			"message": _("School Opening form saved."),
		}

	if not customer:
		frappe.throw(_("Customer or application is required."))

	# Customer-only row: create SC-1.2 linked to this Customer, then submit (already "approved" school)
	from tif_customization.tif_customization.api.school_opening_form import (
		create_school_opening_application,
	)

	data = dict(data)
	data["school_name"] = (data.get("school_name") or "").strip() or frappe.db.get_value(
		"Customer", customer, "customer_name"
	)
	doc = create_school_opening_application(data)
	doc.db_set("customer", customer, update_modified=False)
	doc.reload()
	doc.flags.ignore_permissions = True
	if int(doc.docstatus or 0) == 0:
		doc.submit()
	_sync_customer_from_payload(customer, data)
	return {
		"ok": True,
		"application": doc.name,
		"customer": customer,
		"message": _("School Opening form saved."),
	}


_EXPORT_MAX_ROWS = 5000


@frappe.whitelist()
def export_school_registry(
	search=None,
	govt_private=None,
	status=None,
	territory=None,
	form_data=None,
	city=None,
	address_search=None,
	customers=None,
	field_officer=None,
	doc_status=None,
	created_by=None,
):
	"""Export filtered school registry rows for Excel (CSV), including address fields."""
	if not frappe.has_permission("Customer", "read"):
		frappe.throw(_("Not permitted to export customers."), frappe.PermissionError)

	if _wants_pending_list(form_data=form_data, doc_status=doc_status):
		pending = _list_pending_applications(
			search=search,
			limit=_EXPORT_MAX_ROWS,
			start=0,
			city=city,
			address_search=address_search,
			field_officer=field_officer,
			created_by=created_by,
		)
		out = []
		for row in pending.get("rows") or []:
			out.append(
				{
					"customer": row.get("application") or "",
					"school_name": row.get("customer_name") or "",
					"govt_private": row.get("govt_private") or "",
					"status": row.get("status") or "",
					"territory": "",
					"field_officer": row.get("field_officer") or "",
					"created_by": row.get("created_by") or "",
					"doc_status": row.get("doc_status_label") or _("Pending for Approval"),
					"form_data": _("Pending approval"),
					"address": row.get("address") or "",
					"area": row.get("area") or "",
					"city": row.get("city") or "",
					"province": row.get("province") or "",
					"country": row.get("country") or "",
					"phone": "",
					"email": "",
					"full_address": row.get("full_address") or "",
				}
			)
		return {
			"rows": out,
			"count": len(out),
			"truncated": len(out) >= _EXPORT_MAX_ROWS,
			"filters": {
				"search": search or "",
				"govt_private": govt_private or "",
				"status": status or "",
				"territory": territory or "",
				"form_data": form_data or "",
				"city": city or "",
				"address_search": address_search or "",
				"field_officer": field_officer or "",
				"doc_status": doc_status or "",
				"created_by": created_by or "",
			},
		}

	where, filter_values = _school_registry_filter_clause(
		search=search,
		govt_private=govt_private,
		status=status,
		territory=territory,
		form_data=form_data,
		city=city,
		address_search=address_search,
		customers=customers,
		field_officer=field_officer,
		doc_status=doc_status,
		created_by=created_by,
	)
	values = {**filter_values}

	rows = frappe.db.sql(
		f"""
		SELECT
			c.name AS customer,
			c.customer_name,
			c.custom_govt_private AS govt_private,
			c.custom_status AS status,
			c.territory,
			c.email_id,
			c.mobile_no,
			c.owner AS created_by_user,
			{_RESOLVED_FIELD_OFFICER_SQL} AS field_officer,
			IF(soa.customer IS NOT NULL, 1, 0) AS has_application
		FROM `tabCustomer` c
		{_SCHOOL_REGISTRY_FO_JOINS}
		WHERE {where}
		ORDER BY c.customer_name
		LIMIT {_EXPORT_MAX_ROWS}
		""",
		values,
		as_dict=True,
	)

	customer_names = [row.customer for row in rows]
	addr_map = _addresses_for_customers(customer_names)
	owner_names = _user_display_names([row.get("created_by_user") for row in rows])
	out = []
	for row in rows:
		has_app = bool(row.pop("has_application", 0))
		addr = addr_map.get(row.customer) or {}
		created_by_user = cstr(row.pop("created_by_user", None) or "").strip()
		created_by_name = owner_names.get(created_by_user) or created_by_user
		out.append(
			{
				"customer": row.customer,
				"school_name": row.customer_name or "",
				"govt_private": row.govt_private or "",
				"status": row.status or "",
				"territory": row.territory or "",
				"field_officer": cstr(row.get("field_officer") or "").strip(),
				"created_by": created_by_name,
				"doc_status": _("Approved") if has_app else _("Draft"),
				"form_data": _("Full SC-1.2") if has_app else _("Customer only"),
				"address": (addr.get("address_line1") or "").strip(),
				"area": (addr.get("address_line2") or "").strip(),
				"city": (addr.get("city") or "").strip(),
				"province": (addr.get("state") or "").strip(),
				"country": (addr.get("country") or "").strip(),
				"phone": (addr.get("phone") or row.mobile_no or "").strip(),
				"email": (addr.get("email_id") or row.email_id or "").strip(),
				"full_address": _format_address_lines(addr),
			}
		)

	return {
		"rows": out,
		"count": len(out),
		"truncated": len(rows) >= _EXPORT_MAX_ROWS,
		"filters": {
			"search": search or "",
			"govt_private": govt_private or "",
			"status": status or "",
			"territory": territory or "",
			"form_data": form_data or "",
			"city": city or "",
			"address_search": address_search or "",
			"field_officer": field_officer or "",
			"doc_status": doc_status or "",
			"created_by": created_by or "",
		},
	}


SCHOOL_OPENING_EDIT_USERS = frozenset(
	{
		"Administrator",
		"farhan.hussain@tif.edu.pk",
		"danishawan@tif.edu.pk",
	}
)
SCHOOL_OPENING_EDIT_ROLES = frozenset({"System Manager", "School Approval", "Administrator"})


def can_edit_school_opening_form(user=None):
	"""HO editors: Administrator, Farhan, Danish, System Manager / School Approval."""
	user = user or frappe.session.user
	if not user or user == "Guest":
		return False
	if user == "Administrator" or user.lower() in {u.lower() for u in SCHOOL_OPENING_EDIT_USERS}:
		return True
	roles = set(frappe.get_roles(user))
	return bool(roles & SCHOOL_OPENING_EDIT_ROLES)


@frappe.whitelist()
def get_school_opening_view(customer=None, application=None):
	application = (application or "").strip()
	customer = (customer or "").strip()
	if application:
		return build_school_opening_view_from_application(application)
	customer = _ensure_customer_access(customer)
	return build_school_opening_view(customer)


def build_school_opening_view_from_application(application):
	"""Build SC-1.2 view from a School Opening Application (draft or submitted)."""
	if not application or not frappe.db.exists("School Opening Application", application):
		frappe.throw(_("School Opening Application {0} not found.").format(application))
	if not frappe.has_permission("School Opening Application", "read", application):
		frappe.throw(_("Not permitted to view this application."), frappe.PermissionError)
	app = frappe.get_doc("School Opening Application", application)
	view = _view_from_application(app)
	if app.customer:
		_enrich_location_from_customer(view, app.customer)
	return view


def build_school_opening_view(customer):
	"""Build SC-1.2 view payload from Application (preferred) or Customer."""
	app_name = frappe.db.get_value(
		"School Opening Application",
		{"customer": customer, "docstatus": 1},
		"name",
		order_by="modified desc",
	)
	if not app_name:
		app_name = frappe.db.get_value(
			"School Opening Application",
			{"customer": customer},
			"name",
			order_by="modified desc",
		)

	if app_name:
		view = _view_from_application(frappe.get_doc("School Opening Application", app_name))
	else:
		view = _view_from_customer(frappe.get_doc("Customer", customer))
	_enrich_location_from_customer(view, customer)
	return view


def _view_from_application(app):
	contacts = {row.role: {"name": row.contact_name or "", "cell": row.cell_no or ""} for row in app.key_contacts}
	for role in CONTACT_ROLES:
		contacts.setdefault(role, {"name": "", "cell": ""})

	form_date = app.form_date or getdate()
	can_approve = int(app.docstatus or 0) == 0 and frappe.has_permission(
		"School Opening Application", "submit", app.name
	)
	is_approved = int(app.docstatus or 0) == 1 and bool(app.customer)
	can_edit = can_edit_school_opening_form()
	return {
		"source": "application",
		"application": app.name,
		"docstatus": int(app.docstatus or 0),
		"approved_by": app.approved_by or "",
		"approved_on": cstr(app.approved_on or ""),
		"can_approve": bool(can_approve),
		"can_edit": bool(can_edit),
		"is_approved": bool(is_approved),
		"customer": app.customer,
		"erp_school_code": app.erp_school_code or app.customer,
		"form_no": "SC-1.2",
		"form_date": form_date,
		"form_date_display": formatdate(form_date, "dd/mm/yyyy"),
		"visit_type": getattr(app, "visit_type", None) or "Visit with enrollment",
		"school_name": app.school_name,
		"tif_representative": app.tif_representative or "",
		"institution_types": _csv_to_list(app.institution_types),
		"institution_category": app.institution_category or "",
		"educational_system": _csv_to_list(app.educational_system),
		"type_of_school": app.type_of_school or "",
		"no_of_campuses": app.no_of_campuses,
		"no_of_students": _display_no_of_students(app.no_of_students),
		"structure": app.structure or "",
		"academic_shift": app.academic_shift or "",
		"teacher_training_services": _csv_to_list(app.teacher_training_services),
		"tilawat_services": _csv_to_list(app.tilawat_services),
		"quran_program_services": _csv_to_list(app.quran_program_services),
		"running_tif_services": _csv_to_list(app.running_tif_services),
		"curriculum_in_use": _csv_to_list(app.curriculum_in_use),
		"curriculum_others": app.curriculum_others or "",
		"fee_structure": app.fee_structure or "",
		"website": app.website or "",
		"facebook": app.facebook or "",
		"instagram": app.instagram or "",
		"linkedin": app.linkedin or "",
		"other_links": app.other_links or "",
		"address": app.address or "",
		"area": app.area or "",
		"province": app.province or "",
		"city": app.city or "",
		"country": app.country or "",
		"marketing_sample_provided": app.marketing_sample_provided or "",
		"school_ptcl": app.school_ptcl or "",
		"school_mobile": app.school_mobile or "",
		"school_whatsapp": app.school_whatsapp or "",
		"school_email": app.school_email or "",
		"visiting_card": app.visiting_card,
		"school_picture": app.school_picture,
		"meeting_picture": app.meeting_picture,
		"key_contacts": contacts,
		"contact_roles": CONTACT_ROLES,
	}


def _view_from_customer(cust):
	meta = frappe.get_meta("Customer")
	form_date = getdate()
	if meta.has_field("custom_registration_date") and cust.get("custom_registration_date"):
		form_date = cust.custom_registration_date

	govt = cust.get("custom_govt_private") or ""
	category = cust.get("custom_category") or ""
	structure = "Chain" if category == "Chain School" else "Single Campus" if category == "Individual School" else ""

	addr = _primary_address(cust.name)
	contacts = _customer_contacts(cust.name)

	return {
		"source": "customer",
		"application": None,
		"docstatus": 1,
		"approved_by": "",
		"approved_on": "",
		"can_approve": False,
		"can_edit": bool(can_edit_school_opening_form()),
		"is_approved": True,
		"customer": cust.name,
		"erp_school_code": cust.name,
		"form_no": "SC-1.2",
		"form_date": form_date,
		"form_date_display": formatdate(form_date, "dd/mm/yyyy"),
		"visit_type": "Visit with enrollment",
		"school_name": cust.customer_name,
		"tif_representative": "",
		"institution_types": ["School"] if cust.customer_type == "School" else [],
		"institution_category": "Private" if govt == "Private" else "Provincial Govt." if govt == "Govt" else "",
		"educational_system": [],
		"type_of_school": category,
		"no_of_campuses": None,
		"no_of_students": _display_no_of_students(cust.get("custom_no_of_students")),
		"structure": structure,
		"academic_shift": cust.get("custom_shift") or "",
		"teacher_training_services": _csv_to_list(cust.get("custom_books")),
		"tilawat_services": [],
		"quran_program_services": [],
		"running_tif_services": [],
		"curriculum_in_use": [],
		"curriculum_others": "",
		"fee_structure": "",
		"website": "",
		"facebook": "",
		"instagram": "",
		"linkedin": "",
		"other_links": "",
		"address": addr.get("address_line1") or "",
		"area": addr.get("address_line2") or "",
		"province": addr.get("state") or "",
		"city": addr.get("city") or "",
		"country": addr.get("country") or "Pakistan",
		"marketing_sample_provided": "",
		"school_ptcl": addr.get("phone") or cust.get("mobile_no") or "",
		"school_mobile": cust.get("mobile_no") or "",
		"school_whatsapp": "",
		"school_email": cust.get("email_id") or addr.get("email_id") or "",
		"visiting_card": None,
		"school_picture": None,
		"meeting_picture": None,
		"key_contacts": contacts,
		"contact_roles": CONTACT_ROLES,
		"remarks_html": cust.get("custom_remarks") or "",
	}


def _user_display_names(user_ids):
	"""Map User.name → full_name (fallback to email/id)."""
	ids = [cstr(u).strip() for u in (user_ids or []) if cstr(u).strip()]
	if not ids:
		return {}
	out = {}
	for row in frappe.get_all(
		"User",
		filters={"name": ("in", list(set(ids)))},
		fields=["name", "full_name"],
	):
		out[row.name] = cstr(row.full_name or row.name).strip() or row.name
	for uid in ids:
		out.setdefault(uid, uid)
	return out


def _field_officers_for_customers(rows):
	"""Resolve Field Officer for registry customer rows (SOA + Field Visit fallback)."""
	rows = [r for r in (rows or []) if r.get("customer")]
	if not rows:
		return {}

	# Prefer already-joined approved SOA representative
	out = {}
	need = []
	for row in rows:
		cust = row.get("customer")
		existing = cstr(row.get("field_officer") or "").strip()
		if existing:
			out[cust] = existing
		else:
			need.append(row)

	if not need:
		return out

	keys = set()
	for row in need:
		for key in (row.get("customer"), row.get("customer_name")):
			trimmed = cstr(key or "").strip()
			if trimmed:
				keys.add(trimmed)
	if not keys:
		return out

	key_tuple = tuple(keys)

	# Any SOA (approved or draft) matched by customer link or school name
	soa_rows = frappe.db.sql(
		"""
		SELECT
			IFNULL(customer, '') AS customer,
			TRIM(IFNULL(school_name, '')) AS school_name,
			TRIM(IFNULL(tif_representative, '')) AS field_officer,
			modified
		FROM `tabSchool Opening Application`
		WHERE IFNULL(TRIM(tif_representative), '') != ''
			AND (
				customer IN %(keys)s
				OR TRIM(IFNULL(school_name, '')) IN %(keys)s
			)
		ORDER BY modified DESC
		""",
		{"keys": key_tuple},
		as_dict=True,
	)

	# Latest Field Visit officer for school
	fv_rows = frappe.db.sql(
		"""
		SELECT
			TRIM(IFNULL(school_name, '')) AS school_name,
			TRIM(COALESCE(
				NULLIF(TRIM(visit_by), ''),
				NULLIF(TRIM(me_visit_by), ''),
				NULLIF(TRIM(mt_visit_by), '')
			)) AS field_officer,
			modified
		FROM `tabField Visit`
		WHERE docstatus < 2
			AND TRIM(IFNULL(school_name, '')) IN %(keys)s
			AND (
				IFNULL(TRIM(visit_by), '') != ''
				OR IFNULL(TRIM(me_visit_by), '') != ''
				OR IFNULL(TRIM(mt_visit_by), '') != ''
			)
		ORDER BY modified DESC
		""",
		{"keys": key_tuple},
		as_dict=True,
	)

	soa_by_key = {}
	for r in soa_rows:
		fo = cstr(r.field_officer or "").strip()
		if not fo:
			continue
		for key in (cstr(r.customer or "").strip(), cstr(r.school_name or "").strip()):
			if key and key not in soa_by_key:
				soa_by_key[key] = fo

	fv_by_key = {}
	for r in fv_rows:
		fo = cstr(r.field_officer or "").strip()
		key = cstr(r.school_name or "").strip()
		if fo and key and key not in fv_by_key:
			fv_by_key[key] = fo

	for row in need:
		cust = row.get("customer")
		name = cstr(row.get("customer_name") or "").strip()
		cust_trim = cstr(cust or "").strip()
		fo = (
			soa_by_key.get(cust)
			or soa_by_key.get(cust_trim)
			or soa_by_key.get(name)
			or fv_by_key.get(cust)
			or fv_by_key.get(cust_trim)
			or fv_by_key.get(name)
			or ""
		)
		if fo:
			out[cust] = fo

	return out


def _addresses_for_customers(customers):
	"""Best address per customer (primary flag, then latest)."""
	customers = [c for c in (customers or []) if c]
	if not customers:
		return {}

	out = {}
	primary_by_customer = {}
	for cust_row in frappe.get_all(
		"Customer",
		filters={"name": ("in", customers)},
		fields=["name", "customer_primary_address"],
	):
		paddr = cust_row.get("customer_primary_address")
		if paddr:
			primary_by_customer[cust_row.name] = paddr

	if primary_by_customer:
		for addr in frappe.get_all(
			"Address",
			filters={"name": ("in", list(primary_by_customer.values())), "disabled": 0},
			fields=["name", "address_line1", "address_line2", "city", "state", "country", "phone", "email_id"],
		):
			for cust, paddr in primary_by_customer.items():
				if paddr == addr.name and cust not in out:
					out[cust] = addr

	missing = [c for c in customers if c not in out]
	if missing:
		linked = frappe.db.sql(
		"""
		SELECT
			dl.link_name AS customer,
			a.name,
			a.address_line1,
			a.address_line2,
			a.city,
			a.state,
			a.country,
			a.phone,
			a.email_id,
			a.is_primary_address,
			a.modified
		FROM `tabDynamic Link` dl
		INNER JOIN `tabAddress` a ON a.name = dl.parent
		WHERE dl.link_doctype = 'Customer'
			AND dl.link_name IN %(customers)s
			AND IFNULL(a.disabled, 0) = 0
		ORDER BY dl.link_name, a.is_primary_address DESC, a.modified DESC
		""",
		{"customers": missing},
		as_dict=True,
		)
		for row in linked:
			cust = row.pop("customer")
			if cust not in out:
				out[cust] = row

	app_map = _application_locations_for_customers(customers)
	for cust in customers:
		out[cust] = _merge_location_records(out.get(cust), app_map.get(cust))
	return out


def _application_locations_for_customers(customers):
	customers = [c for c in (customers or []) if c]
	if not customers:
		return {}

	rows = frappe.db.sql(
		"""
		SELECT customer, address, area, city, province, country, modified
		FROM `tabSchool Opening Application`
		WHERE customer IN %(customers)s
		ORDER BY customer, modified DESC
		""",
		{"customers": customers},
		as_dict=True,
	)
	out = {}
	for row in rows:
		cust = row.get("customer")
		if cust and cust not in out:
			out[cust] = row
	return out


def _merge_location_records(addr, app):
	addr = dict(addr or {})
	app = app or {}
	if not (addr.get("address_line1") or "").strip():
		addr["address_line1"] = (app.get("address") or "").strip()
	if not (addr.get("address_line2") or "").strip():
		addr["address_line2"] = (app.get("area") or "").strip()
	if not (addr.get("city") or "").strip():
		addr["city"] = (app.get("city") or "").strip()
	if not (addr.get("state") or "").strip():
		addr["state"] = (app.get("province") or "").strip()
	if not (addr.get("country") or "").strip():
		addr["country"] = (app.get("country") or "").strip()
	return addr


def _apply_registry_location(row, addr):
	addr = addr or {}
	row["address"] = (addr.get("address_line1") or "").strip()
	row["area"] = (addr.get("address_line2") or "").strip()
	row["city"] = (addr.get("city") or "").strip()
	row["full_address"] = _format_address_lines(addr)


def _format_address_lines(addr):
	if not addr:
		return ""
	parts = [
		(addr.get("address_line1") or "").strip(),
		(addr.get("address_line2") or "").strip(),
		(addr.get("city") or "").strip(),
		(addr.get("state") or "").strip(),
		(addr.get("country") or "").strip(),
	]
	return ", ".join(p for p in parts if p)


def _resolve_customer_address(customer):
	primary_name = frappe.db.get_value("Customer", customer, "customer_primary_address")
	if primary_name and frappe.db.exists("Address", primary_name):
		row = frappe.db.get_value(
			"Address",
			primary_name,
			["address_line1", "address_line2", "city", "state", "country", "phone", "email_id"],
			as_dict=True,
		)
		if row:
			return row

	rows = frappe.db.sql(
		"""
		SELECT a.address_line1, a.address_line2, a.city, a.state, a.country, a.phone, a.email_id
		FROM `tabAddress` a
		INNER JOIN `tabDynamic Link` dl ON dl.parent = a.name AND dl.link_doctype = 'Customer' AND dl.link_name = %s
		WHERE IFNULL(a.disabled, 0) = 0
		ORDER BY a.is_primary_address DESC, a.modified DESC
		LIMIT 1
		""",
		customer,
		as_dict=True,
	)
	return rows[0] if rows else {}


def _primary_address(customer):
	return _resolve_customer_address(customer)


def _enrich_location_from_customer(view, customer):
	"""Fill blank location fields from linked Customer Address (Application may omit address)."""
	addr = _resolve_customer_address(customer)
	if not addr:
		return
	if not (view.get("address") or "").strip():
		view["address"] = (addr.get("address_line1") or "").strip() or _format_address_lines(addr)
	if not (view.get("area") or "").strip():
		view["area"] = (addr.get("address_line2") or "").strip()
	if not (view.get("city") or "").strip():
		view["city"] = (addr.get("city") or "").strip()
	if not (view.get("province") or "").strip():
		view["province"] = (addr.get("state") or "").strip()
	if not (view.get("country") or "").strip():
		view["country"] = (addr.get("country") or "").strip() or "Pakistan"
	if not (view.get("school_ptcl") or "").strip():
		view["school_ptcl"] = (addr.get("phone") or "").strip()
	if not (view.get("school_email") or "").strip():
		view["school_email"] = (addr.get("email_id") or "").strip()


def _customer_contacts(customer):
	contacts = {role: {"name": "", "cell": ""} for role in CONTACT_ROLES}
	rows = frappe.db.sql(
		"""
		SELECT c.first_name, c.last_name, c.mobile_no, c.phone
		FROM `tabContact` c
		INNER JOIN `tabDynamic Link` dl ON dl.parent = c.name AND dl.link_doctype = 'Customer' AND dl.link_name = %s
		ORDER BY c.modified DESC
		LIMIT 5
		""",
		customer,
		as_dict=True,
	)
	if rows:
		name = " ".join(filter(None, [rows[0].first_name, rows[0].last_name]))
		cell = rows[0].mobile_no or rows[0].phone or ""
		contacts["Director"] = {"name": name, "cell": cell}
	return contacts


def render_school_opening_pdf_html(data):
	"""Build PDF HTML in Python so wkhtmltopdf never receives unreplaced Jinja placeholders."""
	form_print_body = frappe.render_template(
		"templates/school_opening_form_print.html",
		{"data": data, "print_mode": True},
	)
	if not form_print_body or "school-opening-portal" not in form_print_body:
		frappe.throw(_("Could not build school opening form for PDF."))

	css = _school_opening_embedded_css()
	title = escape_html(data.get("school_name") or data.get("customer") or "")
	return (
		"<!DOCTYPE html>\n"
		'<html lang="en">\n<head>\n'
		'<meta charset="utf-8">\n'
		f"<title>School Opening — {title}</title>\n"
		f"<style>\n{css}\n</style>\n"
		"</head>\n<body>\n"
		'<div class="print-format">\n'
		f"{form_print_body}\n"
		"</div>\n</body>\n</html>"
	)


def _safe_pdf_filename(customer):
	name = re.sub(r'[\\/:*?"<>|]+', "-", cstr(customer)).strip() or "school"
	return f"School_Opening_{name}.pdf"


@frappe.whitelist()
def download_school_opening_pdf(customer=None, application=None):
	application = (application or "").strip()
	if application:
		data = build_school_opening_view_from_application(application)
		file_key = data.get("school_name") or application
	else:
		customer = _ensure_customer_access(customer)
		data = build_school_opening_view(customer)
		file_key = customer
	html = render_school_opening_pdf_html(data)
	from frappe.utils.pdf import get_pdf

	try:
		pdf = get_pdf(
			html,
			{
				"orientation": "Portrait",
				"load-error-handling": "ignore",
				"no-stop-slow-scripts": "",
				"quiet": "",
			},
		)
	except Exception:
		frappe.log_error(title="School Opening PDF", message=html[:8000])
		raise

	if not pdf or not pdf.startswith(b"%PDF") or len(pdf) < 8000:
		frappe.log_error(
			title="School Opening PDF blank or invalid",
			message=f"customer={customer}\napplication={application}\nhtml_len={len(html)}\npdf_len={len(pdf) if pdf else 0}",
		)
		frappe.throw(
			_(
				"PDF generation failed on the server. Open the form and use Print → Save as PDF, "
				"or ask your administrator to verify wkhtmltopdf is installed."
			)
		)

	frappe.local.response.filename = _safe_pdf_filename(file_key)
	frappe.local.response.filecontent = pdf
	frappe.local.response.type = "pdf"
