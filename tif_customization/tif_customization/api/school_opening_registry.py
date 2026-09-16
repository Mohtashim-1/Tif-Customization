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
	SELECT DISTINCT customer
	FROM `tabSchool Opening Application`
	WHERE docstatus = 1 AND IFNULL(customer, '') != ''
) soa ON soa.customer = c.name
"""


def _school_registry_filter_clause(
	search=None,
	govt_private=None,
	status=None,
	territory=None,
	form_data=None,
	city=None,
	address_search=None,
	customers=None,
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

	form_data = (form_data or "").strip().lower()
	if form_data == "full":
		conditions.append("soa.customer IS NOT NULL")
	elif form_data in ("customer_only", "customer-only", "customer"):
		conditions.append("soa.customer IS NULL")

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

	return {
		"govt_private": distinct("custom_govt_private"),
		"status": distinct("custom_status"),
		"cities": cities,
	}


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
):
	"""Paginated school customers for the registry (single query + count)."""
	limit = min(max(int(limit or 50), 1), 200)
	start = max(int(start or 0), 0)

	where, filter_values = _school_registry_filter_clause(
		search=search,
		govt_private=govt_private,
		status=status,
		territory=territory,
		form_data=form_data,
		city=city,
		address_search=address_search,
	)
	values = {"limit": limit, "start": start, **filter_values}

	total = frappe.db.sql(
		f"""
		SELECT COUNT(*)
		FROM `tabCustomer` c
		{_SCHOOL_OPENING_APP_JOIN}
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
			IF(soa.customer IS NOT NULL, 1, 0) AS has_application
		FROM `tabCustomer` c
		{_SCHOOL_OPENING_APP_JOIN}
		WHERE {where}
		ORDER BY c.customer_name
		LIMIT %(limit)s OFFSET %(start)s
		""",
		values,
		as_dict=True,
	)

	customers = [row.customer for row in rows]
	addr_map = _addresses_for_customers(customers)
	for row in rows:
		row.has_application = bool(row.pop("has_application", 0))
		_apply_registry_location(row, addr_map.get(row.customer))

	return {"rows": rows, "total": total, "start": start, "page_length": limit}


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
):
	"""Export filtered school registry rows for Excel (CSV), including address fields."""
	if not frappe.has_permission("Customer", "read"):
		frappe.throw(_("Not permitted to export customers."), frappe.PermissionError)

	where, filter_values = _school_registry_filter_clause(
		search=search,
		govt_private=govt_private,
		status=status,
		territory=territory,
		form_data=form_data,
		city=city,
		address_search=address_search,
		customers=customers,
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
			IF(soa.customer IS NOT NULL, 1, 0) AS has_application
		FROM `tabCustomer` c
		{_SCHOOL_OPENING_APP_JOIN}
		WHERE {where}
		ORDER BY c.customer_name
		LIMIT {_EXPORT_MAX_ROWS}
		""",
		values,
		as_dict=True,
	)

	customer_names = [row.customer for row in rows]
	addr_map = _addresses_for_customers(customer_names)
	out = []
	for row in rows:
		has_app = bool(row.pop("has_application", 0))
		addr = addr_map.get(row.customer) or {}
		out.append(
			{
				"customer": row.customer,
				"school_name": row.customer_name or "",
				"govt_private": row.govt_private or "",
				"status": row.status or "",
				"territory": row.territory or "",
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
		},
	}


@frappe.whitelist()
def get_school_opening_view(customer):
	customer = _ensure_customer_access(customer)
	return build_school_opening_view(customer)


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
	return {
		"source": "application",
		"application": app.name,
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
		"no_of_students": app.no_of_students,
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
		"customer": cust.name,
		"erp_school_code": cust.name,
		"form_no": "SC-1.2",
		"form_date": form_date,
		"form_date_display": formatdate(form_date, "dd/mm/yyyy"),
		"school_name": cust.customer_name,
		"tif_representative": "",
		"institution_types": ["School"] if cust.customer_type == "School" else [],
		"institution_category": "Private" if govt == "Private" else "Provincial Govt." if govt == "Govt" else "",
		"educational_system": [],
		"type_of_school": category,
		"no_of_campuses": None,
		"no_of_students": cust.get("custom_no_of_students") or "",
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
def download_school_opening_pdf(customer):
	customer = _ensure_customer_access(customer)
	data = build_school_opening_view(customer)
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
			message=f"customer={customer}\nhtml_len={len(html)}\npdf_len={len(pdf) if pdf else 0}",
		)
		frappe.throw(
			_(
				"PDF generation failed on the server. Open the form and use Print → Save as PDF, "
				"or ask your administrator to verify wkhtmltopdf is installed."
			)
		)

	frappe.local.response.filename = _safe_pdf_filename(customer)
	frappe.local.response.filecontent = pdf
	frappe.local.response.type = "pdf"
