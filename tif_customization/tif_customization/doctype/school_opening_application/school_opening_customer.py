# Copyright (c) 2026, TIF Customization and contributors
# License: MIT

import frappe
from frappe import _
from frappe.utils import getdate, now_datetime

from tif_customization.tif_customization.doctype.school.school_customer import (
	student_count_bucket,
)


def create_customer_from_application(app):
	if app.customer and frappe.db.exists("Customer", app.customer):
		return app.customer

	existing = frappe.db.get_value("Customer", {"customer_name": app.school_name}, "name")
	if existing:
		app.db_set("customer", existing, update_modified=False)
		app.db_set("erp_school_code", existing, update_modified=False)
		return existing

	customer = frappe.new_doc("Customer")
	customer.customer_name = app.school_name
	customer.customer_type = "School"

	if frappe.get_meta("Customer").has_field("custom_customer_as"):
		customer.custom_customer_as = "School Visit"

	if frappe.get_meta("Customer").has_field("custom_companyschool_name"):
		customer.custom_companyschool_name = app.school_name

	if frappe.get_meta("Customer").has_field("custom_govt_private"):
		if app.institution_category == "Provincial Govt.":
			customer.custom_govt_private = "Govt"
		elif app.institution_category == "Private":
			customer.custom_govt_private = "Private"

	if frappe.get_meta("Customer").has_field("custom_category"):
		if app.structure == "Chain":
			customer.custom_category = "Chain School"
		else:
			customer.custom_category = "Individual School"

	if frappe.get_meta("Customer").has_field("custom_no_of_students"):
		customer.custom_no_of_students = student_count_bucket(app.no_of_students)

	if frappe.get_meta("Customer").has_field("custom_shift") and app.academic_shift:
		customer.custom_shift = app.academic_shift

	if frappe.get_meta("Customer").has_field("custom_books"):
		customer.custom_books = _summarize_services(app)

	if frappe.get_meta("Customer").has_field("custom_status"):
		customer.custom_status = "Active"

	if frappe.get_meta("Customer").has_field("custom_registration_date"):
		customer.custom_registration_date = app.form_date or getdate()

	if frappe.get_meta("Customer").has_field("custom_type_of_customer"):
		if frappe.db.exists("Customer Group", "School"):
			customer.custom_type_of_customer = "School"

	if frappe.get_meta("Customer").has_field("custom_remarks"):
		customer.custom_remarks = _build_remarks(app)

	customer.flags.ignore_permissions = True
	customer.flags.ignore_mandatory = True
	customer.insert()

	_add_address(customer, app)
	_add_director_contact(customer, app)

	app.db_set(
		{
			"customer": customer.name,
			"erp_school_code": customer.name,
			"approved_by": frappe.session.user,
			"approved_on": now_datetime(),
		},
		update_modified=False,
	)

	frappe.msgprint(
		_("Customer {0} created (Customer Type: School).").format(
			frappe.utils.get_link_to_form("Customer", customer.name)
		),
		indicator="green",
		title=_("School Opening Approved"),
	)
	return customer.name


def _summarize_services(app):
	parts = []
	for label, val in (
		("Teacher Training", app.teacher_training_services),
		("Tilawat", app.tilawat_services),
		("Quran Program", app.quran_program_services),
		("Running TIF", app.running_tif_services),
		("Curriculum", app.curriculum_in_use),
	):
		if val:
			parts.append(f"{label}: {val}")
	return "\n".join(parts)[:140] if parts else None


def _build_remarks(app):
	lines = [
		f"TIF Representative: {app.tif_representative or '—'}",
		f"Institution types: {app.institution_types or '—'}",
		f"Educational system: {app.educational_system or '—'}",
		f"Fee structure: {app.fee_structure or '—'}",
		f"Online: {app.website or ''} {app.facebook or ''}".strip(),
	]
	return "<br>".join(lines)


def _add_address(customer, app):
	if not app.address and not app.city:
		return
	try:
		address = frappe.new_doc("Address")
		address.address_title = app.school_name
		address.address_type = "Billing"
		address.address_line1 = app.address or app.school_name
		if app.area:
			address.address_line2 = app.area
		if app.city:
			address.city = app.city
		if app.province:
			address.state = app.province
		if app.country:
			address.country = app.country
		if app.school_email:
			address.email_id = app.school_email
		if app.school_ptcl:
			address.phone = app.school_ptcl
		address.append("links", {"link_doctype": "Customer", "link_name": customer.name})
		address.flags.ignore_permissions = True
		address.insert()
	except Exception:
		frappe.log_error(title="School Opening Application — address failed")


def _add_director_contact(customer, app):
	director = None
	for row in app.get("key_contacts") or []:
		if (row.role or "").lower() == "director" and row.contact_name:
			director = row
			break
	if not director:
		return
	try:
		contact = frappe.new_doc("Contact")
		contact.first_name = director.contact_name
		if director.cell_no:
			contact.append("phone_nos", {"phone": director.cell_no, "is_primary_mobile_no": 1})
		if app.school_email:
			contact.append("email_ids", {"email_id": app.school_email, "is_primary": 1})
		contact.append("links", {"link_doctype": "Customer", "link_name": customer.name})
		contact.flags.ignore_permissions = True
		contact.insert()
	except Exception:
		frappe.log_error(title="School Opening Application — contact failed")
