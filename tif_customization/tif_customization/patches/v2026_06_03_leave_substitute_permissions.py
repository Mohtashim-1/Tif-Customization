"""Allow all active Leave Substitute records in Leave Application picker."""

import frappe


def execute():
	if frappe.db.exists("Custom Field", "Leave Application-custom_substitute_name"):
		frappe.db.set_value(
			"Custom Field",
			"Leave Application-custom_substitute_name",
			"ignore_user_permissions",
			1,
		)

	if frappe.db.exists("DocType", "Leave Substitute"):
		frappe.db.set_value("DocType", "Leave Substitute", "show_title_field_in_link", 1)

	frappe.clear_cache(doctype="Leave Application")
	frappe.clear_cache(doctype="Leave Substitute")
