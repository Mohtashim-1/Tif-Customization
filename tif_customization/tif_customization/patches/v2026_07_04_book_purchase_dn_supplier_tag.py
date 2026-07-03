"""Tag Delivery Notes for Book Purchase & Printing dashboard by supplier."""

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

MILLAT_SUPPLIER = "Millat Printers & Publishers Peshawar"

MILLAT_TAGGED_DELIVERY_NOTES = [
	"MAT-DN-2026-00838",
	"MAT-DN-2026-00839",
	"MAT-DN-2026-00841",
	"MAT-DN-2026-00840",
	"MAT-DN-2026-00842",
	"MAT-DN-2026-00843",
	"MAT-DN-2026-00844",
	"MAT-DN-2026-00845",
	"MAT-DN-2026-00846",
	"MAT-DN-2026-00847",
	"MAT-DN-2026-00848",
	"MAT-DN-2026-00730",
	"MAT-DN-2026-00849",
]


def execute():
	create_custom_fields(
		{
			"Delivery Note": [
				{
					"fieldname": "custom_book_purchase_supplier",
					"label": "Book Purchase Supplier",
					"fieldtype": "Link",
					"options": "Supplier",
					"insert_after": "custom_supply_chain_cost_center",
					"allow_on_submit": 1,
					"in_standard_filter": 1,
					"description": "Include this delivery note on the Book Purchase & Printing dashboard for the selected supplier.",
				}
			]
		}
	)

	if not frappe.db.exists("Supplier", MILLAT_SUPPLIER):
		frappe.log_error(
			f"Supplier {MILLAT_SUPPLIER} not found; skipped tagging delivery notes.",
			"Book Purchase DN Supplier Tag",
		)
		return

	for dn_name in MILLAT_TAGGED_DELIVERY_NOTES:
		if not frappe.db.exists("Delivery Note", dn_name):
			continue
		frappe.db.set_value(
			"Delivery Note",
			dn_name,
			"custom_book_purchase_supplier",
			MILLAT_SUPPLIER,
			update_modified=False,
		)

	frappe.db.commit()
