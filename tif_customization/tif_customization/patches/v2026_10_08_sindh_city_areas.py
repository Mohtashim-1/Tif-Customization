# Copyright (c) 2026, TIF Customization and contributors
# License: MIT

import frappe

# (area label, city link) — Rohrri maps to existing City Rohri
ENTRIES = [
	("Jacobabad", "Jacobabad"),
	("Shikarpur", "Shikarpur"),
	("Sukkur", "Sukkur"),
	("Larkana", "Larkana"),
	("Kashmor", "Kashmor"),
	("Khairpur Mirus", "Khairpur Mirus"),
	("Rohrri", "Rohri"),
	("Rohri", "Rohri"),
	("Pano Aqil", "Pano Aqil"),
	("Thull City", "Thull City"),
	("Hyderabad", "Hyderabad"),
]


def execute():
	for area_name, city_name in ENTRIES:
		if not frappe.db.exists("City", city_name):
			frappe.get_doc({"doctype": "City", "city": city_name}).insert(ignore_permissions=True)

		if frappe.db.exists("Area", area_name):
			if frappe.db.get_value("Area", area_name, "city") != city_name:
				frappe.db.set_value("Area", area_name, "city", city_name)
			continue

		frappe.get_doc({"doctype": "Area", "area": area_name, "city": city_name}).insert(
			ignore_permissions=True
		)
