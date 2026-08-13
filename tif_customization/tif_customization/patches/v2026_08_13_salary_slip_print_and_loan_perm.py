"""Fix Salary Slip default print format and grant HR read access to Loan Repayment."""

import frappe

SALARY_SLIP_PRINT_FORMAT = "Salary Slip Standard"
LOAN_REPAYMENT_READ_ROLES = ("HR User", "HR Manager", "Accounts User", "Accounts Manager")


def execute():
	_fix_salary_slip_default_print_format()
	_grant_loan_repayment_read_to_hr()
	frappe.clear_cache(doctype="Salary Slip")
	frappe.clear_cache(doctype="Loan Repayment")


def _fix_salary_slip_default_print_format():
	if not frappe.db.exists("DocType", "Salary Slip"):
		return

	if not frappe.db.exists("Print Format", SALARY_SLIP_PRINT_FORMAT):
		# Fall back to any enabled standard Salary Slip print format.
		alt = frappe.db.get_value(
			"Print Format",
			{"doc_type": "Salary Slip", "disabled": 0},
			"name",
			order_by="modified desc",
		)
		if not alt:
			return
		target = alt
	else:
		target = SALARY_SLIP_PRINT_FORMAT

	frappe.db.set_value("DocType", "Salary Slip", "default_print_format", target)

	ps_name = "Salary Slip-main-default_print_format"
	if frappe.db.exists("Property Setter", ps_name):
		frappe.db.set_value("Property Setter", ps_name, "value", target, update_modified=False)
	else:
		frappe.get_doc(
			{
				"doctype": "Property Setter",
				"name": ps_name,
				"doctype_or_field": "DocType",
				"doc_type": "Salary Slip",
				"property": "default_print_format",
				"property_type": "Data",
				"value": target,
			}
		).insert(ignore_permissions=True)


def _grant_loan_repayment_read_to_hr():
	if not frappe.db.exists("DocType", "Loan Repayment"):
		return

	for role in LOAN_REPAYMENT_READ_ROLES:
		existing = frappe.db.get_value(
			"Custom DocPerm",
			{"parent": "Loan Repayment", "role": role, "permlevel": 0, "if_owner": 0},
			"name",
		)
		values = {
			"read": 1,
			"select": 1,
			"print": 1,
			"email": 1,
			"export": 1,
			"report": 1,
		}
		if existing:
			frappe.db.set_value("Custom DocPerm", existing, values, update_modified=False)
			continue

		frappe.get_doc(
			{
				"doctype": "Custom DocPerm",
				"parent": "Loan Repayment",
				"parenttype": "DocType",
				"parentfield": "permissions",
				"role": role,
				"permlevel": 0,
				**values,
			}
		).insert(ignore_permissions=True)
