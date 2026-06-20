# Copyright (c) 2026, mohtashim and contributors

import frappe


def execute():
	"""Allow MR access when Department Head links to another Employee."""
	fieldname = "Material Request-custom_department_head"
	if frappe.db.exists("Custom Field", fieldname):
		frappe.db.set_value("Custom Field", fieldname, "ignore_user_permissions", 1)

	_fix_material_request_permission_script()
	frappe.clear_cache(doctype="Material Request")


def _fix_material_request_permission_script():
	script_name = "Material Request Assign User"
	if not frappe.db.exists("Server Script", script_name):
		return

	script = """user = frappe.session.user
excluded_users = [
\t"Administrator",
\t"shoaibmohtashim973@gmail.com",
\t"shahid.khan@tif.edu.pk",
\t"muhammad.jamil@tif.edu.pk",
\t"danishawan@tif.edu.pk",
\t"muhammad.raza@tif.edu.pk",
\t"muhammad.yasir@tif.edu.pk",
]

if user in excluded_users:
\tconditions = "1=1"
else:
\tconditions = f\"\"\"(
\t\t`tabMaterial Request`.owner = '{user}'
\t\tOR JSON_CONTAINS(`tabMaterial Request`._assign, '"{user}"')
\t)\"\"\"

conditions"""

	frappe.db.set_value("Server Script", script_name, "script", script)
