"""Add Bank Deposit connections: JE.bank_deposit field + Donation ↔ Bank Deposit link."""

import frappe


def _ensure_custom_field():
	if frappe.db.exists("Custom Field", "Journal Entry-bank_deposit"):
		return
	frappe.get_doc(
		{
			"doctype": "Custom Field",
			"dt": "Journal Entry",
			"fieldname": "bank_deposit",
			"label": "Bank Deposit",
			"fieldtype": "Link",
			"options": "Bank Deposit",
			"insert_after": "cheque_date",
			"read_only": 1,
			"no_copy": 1,
			"print_hide": 1,
			"translatable": 0,
		}
	).insert(ignore_permissions=True)


def _ensure_doctype_link(parent, link_doctype, link_fieldname, **extra):
	exists = frappe.db.exists(
		"DocType Link",
		{
			"parent": parent,
			"parenttype": "DocType",
			"link_doctype": link_doctype,
			"link_fieldname": link_fieldname,
		},
	)
	if exists:
		return

	doc = frappe.get_doc("DocType", parent)
	row = {
		"link_doctype": link_doctype,
		"link_fieldname": link_fieldname,
		**extra,
	}
	doc.append("links", row)
	doc.save(ignore_permissions=True)


def execute():
	_ensure_custom_field()

	# Bank Deposit → Journal Entry (via JE.bank_deposit)
	_ensure_doctype_link(
		"Bank Deposit",
		"Journal Entry",
		"bank_deposit",
		group="Accounting",
	)

	# Donation → Bank Deposit (via child table rows)
	if frappe.db.exists("DocType", "Donation"):
		_ensure_doctype_link(
			"Donation",
			"Bank Deposit Donation",
			"donation",
			group="Bank Deposit",
			is_child_table=1,
			parent_doctype="Bank Deposit",
			table_fieldname="donations",
		)

	# Backfill existing JVs linked from Bank Deposit
	if frappe.get_meta("Journal Entry").has_field("bank_deposit"):
		frappe.db.sql(
			"""
			UPDATE `tabJournal Entry` je
			INNER JOIN `tabBank Deposit` bd ON bd.journal_entry = je.name
			SET je.bank_deposit = bd.name
			WHERE IFNULL(je.bank_deposit, '') = ''
			"""
		)

	frappe.clear_cache(doctype="Bank Deposit")
	frappe.clear_cache(doctype="Journal Entry")
	if frappe.db.exists("DocType", "Donation"):
		frappe.clear_cache(doctype="Donation")
	frappe.db.commit()
