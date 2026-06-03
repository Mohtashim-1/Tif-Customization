"""Add health provider roster fields on Healthcare Beneficiary (Employee child table)."""

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


FIELDS = {
	"Healthcare Beneficiary": [
		{
			"fieldname": "custom_certificate_no",
			"label": "Certificate No",
			"fieldtype": "Data",
			"insert_after": "name1",
			"in_list_view": 1,
			"columns": 1,
		},
		{
			"fieldname": "custom_card",
			"label": "Card",
			"fieldtype": "Int",
			"insert_after": "custom_certificate_no",
			"in_list_view": 1,
			"columns": 1,
		},
		{
			"fieldname": "custom_gender",
			"label": "Gender",
			"fieldtype": "Select",
			"options": "\nMale\nFemale",
			"insert_after": "custom_cnic",
			"in_list_view": 1,
			"columns": 1,
		},
		{
			"fieldname": "custom_folio_id",
			"label": "Folio ID",
			"fieldtype": "Data",
			"insert_after": "custom_gender",
			"in_list_view": 1,
			"columns": 1,
		},
		{
			"fieldname": "custom_age",
			"label": "Age",
			"fieldtype": "Int",
			"insert_after": "custom_relation",
			"read_only": 1,
			"in_list_view": 1,
			"columns": 1,
		},
		{
			"fieldname": "custom_effective_date",
			"label": "Effective Date",
			"fieldtype": "Date",
			"insert_after": "custom_age",
			"in_list_view": 1,
			"columns": 1,
		},
		{
			"fieldname": "custom_plan",
			"label": "Plan",
			"fieldtype": "Select",
			"options": "\nA\nB\nC\nD\nE\nF",
			"insert_after": "custom_effective_date",
			"in_list_view": 1,
			"columns": 1,
		},
		{
			"fieldname": "custom_marital_status",
			"label": "Marital Status",
			"fieldtype": "Select",
			"options": "\nMarried\nSingle\nDivorced\nWidowed",
			"insert_after": "custom_plan",
			"in_list_view": 1,
			"columns": 1,
		},
		{
			"fieldname": "custom_emp_status",
			"label": "Emp Status",
			"fieldtype": "Select",
			"options": "\nIN-FORCE\nLAPSED\nCANCELLED",
			"default": "IN-FORCE",
			"insert_after": "custom_marital_status",
			"in_list_view": 1,
			"columns": 1,
		},
		{
			"fieldname": "custom_elsaj_username",
			"label": "Elsaj User Name",
			"fieldtype": "Data",
			"insert_after": "custom_emp_status",
			"in_list_view": 1,
			"columns": 2,
		},
		{
			"fieldname": "custom_elsaj_password",
			"label": "Password",
			"fieldtype": "Password",
			"insert_after": "custom_elsaj_username",
		},
	]
}


PROPERTY_SETTERS = [
	{
		"doctype": "Healthcare Beneficiary",
		"fieldname": "name1",
		"property": "label",
		"value": "Name of Member",
	},
	{
		"doctype": "Healthcare Beneficiary",
		"fieldname": "custom_cnic",
		"property": "label",
		"value": "CNIC No",
	},
	{
		"doctype": "Employee",
		"fieldname": "beneficiary",
		"property": "label",
		"value": "Health Provider Members",
	},
]


def execute():
	create_custom_fields(FIELDS, update=True)
	_ensure_property_setters()
	frappe.clear_cache(doctype="Healthcare Beneficiary")
	frappe.clear_cache(doctype="Employee")


def _ensure_property_setters():
	for row in PROPERTY_SETTERS:
		name = frappe.db.get_value(
			"Property Setter",
			{
				"doc_type": row["doctype"],
				"field_name": row["fieldname"],
				"property": row["property"],
			},
		)
		if name:
			frappe.db.set_value("Property Setter", name, "value", row["value"])
			continue
		frappe.get_doc(
			{
				"doctype": "Property Setter",
				"doctype_or_field": "DocField",
				"doc_type": row["doctype"],
				"field_name": row["fieldname"],
				"property": row["property"],
				"property_type": "Data",
				"value": row["value"],
			}
		).insert(ignore_permissions=True)
