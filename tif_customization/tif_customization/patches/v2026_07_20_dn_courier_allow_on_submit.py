import frappe


def execute():
	"""Allow courier amount fields to be set after DN submit (partner bill received)."""
	fields = [
		"custom_delivery_rate",
		"custom_courier_mode_of_payment",
		"custom_courier",
		"custom_courier_service",
		"custom_courier_charges",
	]
	for fieldname in fields:
		name = f"Delivery Note-{fieldname}"
		if frappe.db.exists("Custom Field", name):
			frappe.db.set_value("Custom Field", name, "allow_on_submit", 1, update_modified=False)
	frappe.clear_cache(doctype="Delivery Note")
