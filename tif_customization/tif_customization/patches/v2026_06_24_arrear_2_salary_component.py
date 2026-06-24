import frappe


def execute():
	if frappe.db.exists("Salary Component", "Arrear 2"):
		return

	doc = frappe.new_doc("Salary Component")
	doc.salary_component = "Arrear 2"
	doc.salary_component_abbr = "AR2"
	doc.type = "Earning"
	doc.is_tax_applicable = 0
	doc.insert(ignore_permissions=True)
