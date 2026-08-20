"""Install TIF Payslip print format (Pay Slip Design) and set as Salary Slip default."""

from pathlib import Path

import frappe

PRINT_FORMAT_NAME = "TIF Payslip"


def execute():
	_upsert_print_format()
	_set_default_print_format()
	frappe.clear_cache(doctype="Salary Slip")
	frappe.clear_cache(doctype="Print Format")


def _upsert_print_format():
	html_path = (
		Path(frappe.get_app_path("tif_customization"))
		/ "tif_customization"
		/ "print_format"
		/ "tif_payslip"
		/ "tif_payslip.html"
	)
	html = html_path.read_text(encoding="utf-8")

	values = {
		"doc_type": "Salary Slip",
		"module": "TIF Customization",
		"standard": "No",
		"custom_format": 1,
		"print_format_type": "Jinja",
		"disabled": 0,
		"html": html,
		"css": "",
	}

	if frappe.db.exists("Print Format", PRINT_FORMAT_NAME):
		doc = frappe.get_doc("Print Format", PRINT_FORMAT_NAME)
		doc.update(values)
		doc.save(ignore_permissions=True)
	else:
		doc = frappe.get_doc({"doctype": "Print Format", "name": PRINT_FORMAT_NAME, **values})
		doc.insert(ignore_permissions=True)


def _set_default_print_format():
	if not frappe.db.exists("DocType", "Salary Slip"):
		return

	frappe.db.set_value("DocType", "Salary Slip", "default_print_format", PRINT_FORMAT_NAME)

	ps_name = "Salary Slip-main-default_print_format"
	if frappe.db.exists("Property Setter", ps_name):
		frappe.db.set_value("Property Setter", ps_name, "value", PRINT_FORMAT_NAME, update_modified=False)
	else:
		frappe.get_doc(
			{
				"doctype": "Property Setter",
				"name": ps_name,
				"doctype_or_field": "DocType",
				"doc_type": "Salary Slip",
				"property": "default_print_format",
				"property_type": "Data",
				"value": PRINT_FORMAT_NAME,
			}
		).insert(ignore_permissions=True)
