import frappe


def execute():
	# Custom www page uses /school-opening — disable standard Web Form on same route.
	if frappe.db.exists("Web Form", "School Opening Form"):
		frappe.db.set_value("Web Form", "School Opening Form", "published", 0)
