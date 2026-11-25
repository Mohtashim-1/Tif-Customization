"""Add Bank Deposit link field on Donation (Accounting section)."""

import frappe


def execute():
	if not frappe.db.exists("DocType", "Donation"):
		return

	if not frappe.db.exists("Custom Field", "Donation-bank_deposit"):
		frappe.get_doc(
			{
				"doctype": "Custom Field",
				"dt": "Donation",
				"fieldname": "bank_deposit",
				"label": "Bank Deposit Voucher",
				"fieldtype": "Link",
				"options": "Bank Deposit",
				"insert_after": "accounting_entry",
				"read_only": 1,
				"no_copy": 1,
				"allow_on_submit": 1,
				"description": "Linked Bank Deposit voucher for this cash slip (if deposited).",
			}
		).insert(ignore_permissions=True)

	# Backfill from existing Bank Deposit child rows (active vouchers)
	if frappe.db.exists("DocType", "Bank Deposit") and frappe.get_meta("Donation").has_field(
		"bank_deposit"
	):
		frappe.db.sql(
			"""
			UPDATE `tabDonation` d
			INNER JOIN `tabBank Deposit Donation` bdd ON bdd.donation = d.name
			INNER JOIN `tabBank Deposit` bd ON bd.name = bdd.parent
			SET d.bank_deposit = bd.name
			WHERE bd.docstatus < 2
				AND IFNULL(d.bank_deposit, '') = ''
			"""
		)

	frappe.clear_cache(doctype="Donation")
	frappe.db.commit()
