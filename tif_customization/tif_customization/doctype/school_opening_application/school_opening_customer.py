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
		_ensure_address_and_contacts(app, app.customer)
		_link_field_visits_to_customer(app, app.customer)
		return app.customer

	existing = frappe.db.get_value("Customer", {"customer_name": app.school_name}, "name")
	if existing:
		app.db_set("customer", existing, update_modified=False)
		app.db_set("erp_school_code", existing, update_modified=False)
		_ensure_address_and_contacts(app, existing)
		_link_field_visits_to_customer(app, existing)
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
	_ensure_address_and_contacts(app, customer.name)
	_link_field_visits_to_customer(app, customer.name)
	return customer.name


def _link_field_visits_to_customer(app, customer_name):
	"""Fill School Name on Field Visits that were saved against this pending School Opening."""
	if not customer_name or not frappe.db.exists("DocType", "Field Visit"):
		return
	soa = (app.name or "").strip()
	school_title = (app.school_name or "").strip()
	if not soa:
		return

	has_pending = frappe.db.has_column("Field Visit", "pending_school_name")
	conditions = [
		"IFNULL(school_name, '') = ''",
		"(school_additional_remarks LIKE %(soa_note)s OR reference = %(soa)s)",
	]
	params = {
		"soa": soa,
		"soa_note": f"%Pending school (School Opening {soa}):%",
		"customer": customer_name,
	}
	rows = frappe.db.sql(
		f"""
		SELECT name
		FROM `tabField Visit`
		WHERE {' AND '.join(conditions)}
		""",
		params,
		as_dict=True,
	)
	linked_names = set()
	for row in rows:
		vals = {"school_name": customer_name}
		if has_pending:
			vals["pending_school_name"] = ""
		frappe.db.set_value("Field Visit", row.name, vals, update_modified=False)
		linked_names.add(row.name)

	# Also match by pending school title when SOA id was not stored in reference
	if has_pending and school_title:
		extra = frappe.db.sql(
			"""
			SELECT name
			FROM `tabField Visit`
			WHERE IFNULL(school_name, '') = ''
			  AND pending_school_name = %(title)s
			""",
			{"title": school_title},
			as_dict=True,
		)
		for row in extra:
			if row.name in linked_names:
				continue
			frappe.db.set_value(
				"Field Visit",
				row.name,
				{"school_name": customer_name, "pending_school_name": ""},
				update_modified=False,
			)
			linked_names.add(row.name)

	if linked_names:
		frappe.msgprint(
			_("Linked {0} Field Visit(s) to school {1}.").format(
				len(linked_names), frappe.utils.get_link_to_form("Customer", customer_name)
			),
			indicator="blue",
			alert=True,
		)


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


def _ensure_connection_fields():
	"""Link field so Address and Contact show in School Opening Application connections."""
	from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

	create_custom_fields(
		{
			"Address": [
				{
					"fieldname": "school_opening_application",
					"label": "School Opening Application",
					"fieldtype": "Link",
					"options": "School Opening Application",
					"insert_after": "address_title",
					"read_only": 1,
					"no_copy": 1,
				}
			],
			"Contact": [
				{
					"fieldname": "school_opening_application",
					"label": "School Opening Application",
					"fieldtype": "Link",
					"options": "School Opening Application",
					"insert_after": "company_name",
					"read_only": 1,
					"no_copy": 1,
				}
			],
		},
		ignore_validate=True,
		update=False,
	)


def _ensure_address_and_contacts(app, customer_name):
	if not customer_name or not frappe.db.exists("Customer", customer_name):
		return
	_ensure_connection_fields()
	_ensure_address(app, customer_name)
	_ensure_contacts(app, customer_name)


def _linked_docs(doctype, customer_name):
	return frappe.db.sql(
		f"""
		SELECT parent
		FROM `tabDynamic Link`
		WHERE parenttype = %(doctype)s
		  AND link_doctype = 'Customer'
		  AND link_name = %(customer)s
		""",
		{"doctype": doctype, "customer": customer_name},
		pluck=True,
	)


def _append_link(doc, link_doctype, link_name):
	if not link_name:
		return
	for row in doc.get("links") or []:
		if row.link_doctype == link_doctype and row.link_name == link_name:
			return
	doc.append("links", {"link_doctype": link_doctype, "link_name": link_name})


def _ensure_address(app, customer_name):
	if not (app.address or app.city or app.area):
		return
	existing = _linked_docs("Address", customer_name)
	try:
		if existing:
			address = frappe.get_doc("Address", existing[0])
		else:
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
		address.school_opening_application = app.name
		if not frappe.db.get_value("Customer", customer_name, "customer_primary_address"):
			address.is_primary_address = 1
		_append_link(address, "Customer", customer_name)
		_append_link(address, "School Opening Application", app.name)
		address.flags.ignore_permissions = True
		address.flags.ignore_mandatory = True
		if address.is_new():
			address.insert()
		else:
			address.save()
		if not frappe.db.get_value("Customer", customer_name, "customer_primary_address"):
			from frappe.contacts.doctype.address.address import render_address

			frappe.db.set_value(
				"Customer",
				customer_name,
				{
					"customer_primary_address": address.name,
					"primary_address": render_address(address.name, check_permissions=False),
				},
				update_modified=False,
			)
	except Exception:
		frappe.log_error(title="School Opening Application — address failed")


def _contact_rows(app):
	rows = []
	for row in app.get("key_contacts") or []:
		name = (row.contact_name or "").strip()
		if name:
			rows.append(row)
	rows.sort(key=lambda row: 0 if (row.role or "").strip().lower() == "director" else 1)
	return rows


def _ensure_contacts(app, customer_name):
	rows = _contact_rows(app)
	if not rows:
		return
	existing_names = {
		(frappe.db.get_value("Contact", name, "first_name") or "").strip().lower(): name
		for name in _linked_docs("Contact", customer_name)
	}
	created = []
	for idx, row in enumerate(rows):
		person = (row.contact_name or "").strip()
		phone = (row.cell_no or "").strip()
		if phone in ("0", "-", "—"):
			phone = ""
		try:
			existing = existing_names.get(person.lower())
			if existing:
				contact = frappe.get_doc("Contact", existing)
			else:
				contact = frappe.new_doc("Contact")
				contact.first_name = person
				if phone:
					contact.append("phone_nos", {"phone": phone, "is_primary_mobile_no": 1})
				if idx == 0 and app.school_email:
					contact.append("email_ids", {"email_id": app.school_email, "is_primary": 1})
			if row.role:
				contact.designation = row.role
			contact.company_name = app.school_name
			contact.school_opening_application = app.name
			if idx == 0 and not frappe.db.get_value("Customer", customer_name, "customer_primary_contact"):
				contact.is_primary_contact = 1
			_append_link(contact, "Customer", customer_name)
			_append_link(contact, "School Opening Application", app.name)
			contact.flags.ignore_permissions = True
			contact.flags.ignore_mandatory = True
			if contact.is_new():
				contact.insert()
				existing_names[person.lower()] = contact.name
			else:
				contact.save()
			created.append(contact.name)
		except Exception:
			frappe.log_error(title=f"School Opening Application — contact failed ({person})")
	if created and not frappe.db.get_value("Customer", customer_name, "customer_primary_contact"):
		frappe.db.set_value(
			"Customer", customer_name, "customer_primary_contact", created[0], update_modified=False
		)
