"""Grant Additional Salary cancel/delete/select to HR and Accounts payroll roles."""

import frappe

ROLES = ("HR User", "HR Manager", "Accounts User", "Accounts Manager")


def execute():
	if not frappe.db.exists("DocType", "Additional Salary"):
		return

	for role in ROLES:
		_ensure_custom_perm(role)

	frappe.clear_cache(doctype="Additional Salary")


def _ensure_custom_perm(role):
	existing = frappe.db.get_value(
		"Custom DocPerm",
		{"parent": "Additional Salary", "role": role, "permlevel": 0, "if_owner": 0},
		"name",
	)
	values = {
		"read": 1,
		"write": 1,
		"create": 1,
		"submit": 1,
		"cancel": 1,
		"delete": 1,
		"select": 1,
		"print": 1,
		"email": 1,
		"export": 1,
		"report": 1,
		"share": 1,
	}
	if existing:
		frappe.db.set_value("Custom DocPerm", existing, values, update_modified=False)
		return

	doc = frappe.get_doc(
		{
			"doctype": "Custom DocPerm",
			"parent": "Additional Salary",
			"parenttype": "DocType",
			"parentfield": "permissions",
			"role": role,
			"permlevel": 0,
			**values,
		}
	)
	doc.insert(ignore_permissions=True)
