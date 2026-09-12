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


@frappe.whitelist()
def list_school_customers(search=None, limit=200):
	"""Customers for School Opening registry (School type + school customer group)."""
	limit = min(int(limit or 200), 500)
	search = (search or "").strip()

	conditions = [
		"""(
			c.customer_type = 'School'
			OR IFNULL(c.custom_type_of_customer, '') = 'School'
			OR IFNULL(c.customer_group, '') = 'School'
		)"""
	]
	values = {"limit": limit}

	if search:
		conditions.append("(c.name LIKE %(search)s OR c.customer_name LIKE %(search)s)")
		values["search"] = f"%{search}%"

	where = " AND ".join(conditions)

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
			c.modified
		FROM `tabCustomer` c
		WHERE {where}
		ORDER BY c.customer_name
		LIMIT %(limit)s
		""",
		values,
		as_dict=True,
	)

	for row in rows:
		row.has_application = bool(
			frappe.db.exists("School Opening Application", {"customer": row.customer, "docstatus": 1})
		)

	return rows


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
		return _view_from_application(frappe.get_doc("School Opening Application", app_name))

	return _view_from_customer(frappe.get_doc("Customer", customer))


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


def _primary_address(customer):
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
