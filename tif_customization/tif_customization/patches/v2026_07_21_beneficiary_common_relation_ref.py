"""Add Common Relation Reference on Healthcare Beneficiary (Employee.beneficiary)."""

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


FIELDS = {
	"Healthcare Beneficiary": [
		{
			"fieldname": "custom_common_relation_reference",
			"label": "Common Relation Reference",
			"fieldtype": "Data",
			"insert_after": "custom_cnic",
			"in_list_view": 1,
			"columns": 2,
			"description": "Shared ID when the same relative appears on more than one employee (or leave blank to match by CNIC / name).",
		},
	]
}


def execute():
	create_custom_fields(FIELDS, update=True)
	frappe.clear_cache(doctype="Healthcare Beneficiary")
	frappe.clear_cache(doctype="Employee")
