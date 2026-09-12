# Copyright (c) 2026, TIF Customization and contributors
# License: MIT

import frappe
from frappe import _
from frappe.utils import getdate, now_datetime


SCHOOL_AS_MAP = {
	"PERSON": "Person",
	"SCHOOL VISIT": "School Visit",
	"FUNDRAISING": "Fundraising",
}

GOVT_PRIVATE_MAP = {
	"GOVT": "Govt",
	"PVT": "Private",
}

CATEGORY_MAP = {
	"INDIVIDUAL": "Individual School",
	"CHAIN OF SCHOOL": "Chain School",
}

STATUS_MAP = {
	"Active": "Active",
	"Inactive": "Inactive",
	"In Process": "Inactive",
	"Closed": "Closed",
	"Not Interested": "Inactive",
	"Direct Requirement Received": "Active",
}


def student_count_bucket(count):
	if count is None or count == "":
		return None
	try:
		n = int(count)
	except (TypeError, ValueError):
		return None
	if n <= 10:
		return "1-10"
	if n <= 50:
		return "11-50"
	if n <= 200:
		return "51-200"
	if n <= 500:
		return "201-500"
	if n <= 1000:
		return "501-1000"
	return "1000+"


def create_customer_from_school(school):
	"""Create ERP Customer (type School) from an approved School opening record."""
	if school.customer and frappe.db.exists("Customer", school.customer):
		return school.customer

	existing = frappe.db.get_value("Customer", {"customer_name": school.school_name}, "name")
	if existing:
		school.db_set("customer", existing, update_modified=False)
		return existing

	customer = frappe.new_doc("Customer")
	customer.customer_name = school.school_name
	customer.customer_type = "School"
	customer.territory = school.territory

	if frappe.get_meta("Customer").has_field("custom_customer_as"):
		customer.custom_customer_as = SCHOOL_AS_MAP.get(school.school_as) or school.school_as

	if frappe.get_meta("Customer").has_field("custom_companyschool_name"):
		customer.custom_companyschool_name = school.school_name

	if frappe.get_meta("Customer").has_field("custom_govt_private"):
		customer.custom_govt_private = GOVT_PRIVATE_MAP.get(school.school_type) or school.school_type

	if frappe.get_meta("Customer").has_field("custom_category"):
		customer.custom_category = CATEGORY_MAP.get(school.category) or school.category

	if frappe.get_meta("Customer").has_field("custom_no_of_schools") and school.no_of_school:
		customer.custom_no_of_schools = str(school.no_of_school)

	if frappe.get_meta("Customer").has_field("custom_no_of_students"):
		customer.custom_no_of_students = student_count_bucket(school.no_of_students)

	if frappe.get_meta("Customer").has_field("custom_books"):
		customer.custom_books = school.books

	if frappe.get_meta("Customer").has_field("custom_status"):
		customer.custom_status = STATUS_MAP.get(school.status, "Active")

	if frappe.get_meta("Customer").has_field("custom_remarks") and school.remarks:
		customer.custom_remarks = school.remarks

	if frappe.get_meta("Customer").has_field("custom_registration_date"):
		customer.custom_registration_date = school.posting_date or getdate()

	if frappe.get_meta("Customer").has_field("custom_type_of_customer"):
		customer.custom_type_of_customer = _default_school_customer_group()

	if frappe.get_meta("Customer").has_field("custom_section") and school.section:
		customer.custom_section = _resolve_section_link(school.section)

	customer.flags.ignore_permissions = True
	customer.flags.ignore_mandatory = True
	customer.insert()

	_add_primary_address(customer, school)

	school.db_set(
		{
			"customer": customer.name,
			"approved_by": frappe.session.user,
			"approved_on": now_datetime(),
		},
		update_modified=False,
	)

	frappe.msgprint(
		_("Customer {0} created with Customer Type = School.").format(
			frappe.utils.get_link_to_form("Customer", customer.name)
		),
		indicator="green",
		title=_("School Approved"),
	)

	return customer.name


def _default_school_customer_group():
	if frappe.db.exists("Customer Group", "School"):
		return "School"
	return None


def _resolve_section_link(section_value):
	"""Map School section label to Section master if it exists."""
	if not section_value:
		return None
	if frappe.db.exists("Section", section_value):
		return section_value
	name = frappe.db.get_value("Section", {"section_name": section_value}, "name")
	return name


def _add_primary_address(customer, school):
	if not school.complete_school_address and not school.city:
		return

	try:
		address = frappe.new_doc("Address")
		address.address_title = school.school_name
		address.address_type = "Billing"
		address.address_line1 = school.complete_school_address or school.school_name
		if school.city:
			address.city = frappe.db.get_value("City", school.city, "city_name") or school.city
		if school.country:
			address.country = school.country
		if school.province:
			address.state = school.province
		if school.area:
			address.address_line2 = school.area
		if school.school_email:
			address.email_id = school.school_email
		if school.school_landline:
			address.phone = school.school_landline
		address.append("links", {"link_doctype": "Customer", "link_name": customer.name})
		address.flags.ignore_permissions = True
		address.insert()
	except Exception:
		frappe.log_error(title="School Opening — Address creation failed")
