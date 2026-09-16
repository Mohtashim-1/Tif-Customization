# Copyright (c) 2026, TIF Customization and contributors
# License: MIT

import frappe

from tif_customization.tif_customization.field_visit_travel_cost import (
	TRAVEL_ACTIVITY_TYPES,
	sync_travel_cost,
)


def execute():
	# Default active employees without a rate to Rs 16/km (matches travel cost default).
	frappe.db.sql(
		"""
		UPDATE `tabEmployee`
		SET per_km_for_fuel = 16
		WHERE status = 'Active' AND IFNULL(per_km_for_fuel, 0) = 0
		"""
	)

	for row in frappe.get_all(
		"Field Visit",
		filters={"type": ["in", list(TRAVEL_ACTIVITY_TYPES)], "docstatus": ["<", 2]},
		pluck="name",
	):
		doc = frappe.get_doc("Field Visit", row)
		sync_travel_cost(doc)
		frappe.db.set_value(
			"Field Visit",
			row,
			{
				"travel_per_km_rate": doc.travel_per_km_rate,
				"travel_cost": doc.travel_cost,
			},
			update_modified=False,
		)
