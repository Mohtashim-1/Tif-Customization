import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def execute():
	"""Allow delivery-detail fields after submit, and a flag to hide the dialog button."""
	fields = [
		"custom_city",
		"custom_total_delivery_weightage",
		"custom_shipment_tracking_no",
		"custom_courier_mode_of_payment",
		"custom_supply_chain_cost_center",
		"custom_book_purchase_supplier",
		"custom_delivery_rate",
		"custom_delivery_mode",
		"custom_return_remarks",
		"custom_by_hand",
		"custom_area",
		"custom_courier",
		"custom_courier_service",
	]
	for fieldname in fields:
		name = f"Delivery Note-{fieldname}"
		if frappe.db.exists("Custom Field", name):
			frappe.db.set_value("Custom Field", name, "allow_on_submit", 1, update_modified=False)

	create_custom_fields(
		{
			"Delivery Note": [
				{
					"fieldname": "custom_delivery_details_saved",
					"label": "Delivery Details Saved",
					"fieldtype": "Check",
					"insert_after": "custom_courier_journal_entry",
					"allow_on_submit": 1,
					"hidden": 1,
					"no_copy": 1,
					"read_only": 1,
					"default": "0",
				}
			]
		},
		update=True,
	)
	frappe.clear_cache(doctype="Delivery Note")
