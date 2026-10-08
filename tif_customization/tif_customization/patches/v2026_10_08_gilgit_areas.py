# Copyright (c) 2026, TIF Customization and contributors
# License: MIT

import frappe

CITY = "Gilgit"
AREAS = [
	"Gilgit Suty",
	"Public Chowk Jutial",
	"Jutial",
	"Jutial Ada",
	"Nor Colony",
	"F.C Road Jutial",
	"Zulfiqar Abad Road Gilgit",
	"Hailey Chowk",
	"Assembly Road Gilgit",
	"Suty Park Kashrote",
	"Airport Road Kashrote",
	"Kashrote",
	"Kashrote Bazar",
	"Usmania Mahalla Kashrote",
	"Haidar Pura Gilgit",
	"Konodas Gilgit",
	"Muslim Colony Konodas",
	"Jagir Basin Gilgit",
	"Suwarn Chowk Jagir Basin",
	"Basin Gilgit",
	"Sakarkoi Gilgit",
	"Sarkal Colony",
	"Dasar",
	"Master Plate Area",
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
