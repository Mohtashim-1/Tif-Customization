"""Add Reference Relation (Link to Relation) on Employee, next to Reference Employee."""

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


FIELDS = {
	"Employee": [
		{
			"fieldname": "custom_reference_relation",
			"label": "Reference Relation",
			"fieldtype": "Link",
			"options": "Relation",
			"insert_after": "custom_reference_employee",
			"depends_on": "eval:doc.custom_reference_employee",
			"description": "Relation of the reference employee to this employee (e.g. Friend, Relative, Colleague).",
		},
	]
}


def execute():
	create_custom_fields(FIELDS, update=True)
	frappe.clear_cache(doctype="Employee")
