# Copyright (c) 2026, TIF Customization and contributors
# License: MIT

import frappe

from tif_customization.tif_customization.field_visit_travel_cost import sync_travel_cost


def execute():
	frappe.db.sql(
		"""
		UPDATE `tabEmployee`
		SET per_km_for_fuel = 18
		WHERE status = 'Active' AND IFNULL(per_km_for_fuel, 0) IN (0, 16)
		"""
	)

	for name in frappe.get_all("Field Visit", filters={"docstatus": ["<", 2]}, pluck="name"):
		doc = frappe.get_doc("Field Visit", name)
		sync_travel_cost(doc)
		frappe.db.set_value(
			"Field Visit",
			name,
			{
				"travel_per_km_rate": doc.travel_per_km_rate,
				"travel_cost": doc.travel_cost,
			},
			update_modified=False,
		)
