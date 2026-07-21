"""Add Reference Employee (referral) link on Employee."""

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


FIELDS = {
	"Employee": [
		{
			"fieldname": "custom_reference_employee",
			"label": "Reference Employee",
			"fieldtype": "Link",
			"options": "Employee",
			"insert_after": "company",
			"description": "The existing employee who referred this person (leave blank if not a referral).",
		},
	]
}


def execute():
	create_custom_fields(FIELDS, update=True)
	frappe.clear_cache(doctype="Employee")
