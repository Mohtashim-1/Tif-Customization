# Copyright (c) 2026, TIF Customization and contributors
# License: MIT

import frappe

CITY = "Chitral"
AREAS = [
	"Drosh",
	"Sheshekoh",
	"Ayun UC",
	"Broze UC",
	"Chitral City",
	"Danin UC",
	"Garumchashma",
	"Koh UC",
	"Tehsil Mastuj",
	"Tehsil Mulkho",
	"Tehsil Torkho",
]


def execute():
	if not frappe.db.exists("City", CITY):
		frappe.get_doc({"doctype": "City", "city": CITY}).insert(ignore_permissions=True)

	for name in AREAS:
		if frappe.db.exists("Area", name):
			if frappe.db.get_value("Area", name, "city") != CITY:
				frappe.db.set_value("Area", name, "city", CITY)
			continue
		frappe.get_doc({"doctype": "Area", "area": name, "city": CITY}).insert(
			ignore_permissions=True
		)
