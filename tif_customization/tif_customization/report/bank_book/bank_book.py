# Copyright (c) 2026, mohtashim and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import flt


def execute(filters=None):
	filters = frappe._dict(filters or {})
	validate_filters(filters)

	accounts = get_bank_accounts(filters)
	if not accounts:
		return get_columns(), []

	filters.accounts = tuple(accounts)
	opening_balance = get_opening_balance(filters)
	entries = get_entries(filters)
	data = get_data(entries, opening_balance)

	return get_columns(), data


def validate_filters(filters):
	if not filters.get("company"):
		frappe.throw(_("Company is required"))
	if not filters.get("from_date"):
		frappe.throw(_("From Date is required"))
	if not filters.get("to_date"):
		frappe.throw(_("To Date is required"))
	if filters.from_date > filters.to_date:
		frappe.throw(_("From Date must be before To Date"))


def get_bank_accounts(filters):
	if filters.get("account"):
		account = frappe.db.get_value(
			"Account",
			filters.account,
			["name", "company", "account_type", "is_group"],
			as_dict=True,
		)

		if not account:
			frappe.throw(_("Invalid Account: {0}").format(filters.account))
		if account.company != filters.company:
			frappe.throw(_("Selected account does not belong to {0}").format(filters.company))
		if account.is_group:
			frappe.throw(_("Please select a ledger account, not a group account"))
		if account.account_type != "Bank":
			frappe.throw(_("Please select a Bank type account"))

		return [account.name]

	return frappe.get_all(
		"Account",
		filters={"company": filters.company, "account_type": "Bank", "is_group": 0},
		pluck="name",
	)


def get_opening_balance(filters):
	return (
		frappe.db.sql(
			"""
			select sum(debit - credit)
			from `tabGL Entry`
			where company = %(company)s
				and account in %(accounts)s
				and posting_date < %(from_date)s
				and is_cancelled = 0
			""",
			filters,
		)[0][0]
		or 0
	)


def get_entries(filters):
	return frappe.db.sql(
		"""
		select
			posting_date,
			account,
			voucher_type,
			voucher_no,
			party_type,
			party,
			against,
			remarks,
			debit,
			credit
		from `tabGL Entry`
		where company = %(company)s
			and account in %(accounts)s
			and posting_date between %(from_date)s and %(to_date)s
			and is_cancelled = 0
		order by posting_date, creation, name
		""",
		filters,
		as_dict=True,
	)


def get_data(entries, opening_balance):
	data = [
		{
			"posting_date": "",
			"voucher_type": _("Opening"),
			"voucher_no": "",
			"account": "",
			"party_type": "",
			"party": "",
			"against": "",
			"remarks": "",
			"receipt": 0,
			"payment": 0,
			"balance": opening_balance,
		}
	]

	running_balance = flt(opening_balance)
	for entry in entries:
		receipt = flt(entry.debit)
		payment = flt(entry.credit)
		running_balance += receipt - payment

		data.append(
			{
				"posting_date": entry.posting_date,
				"voucher_type": entry.voucher_type,
				"voucher_no": entry.voucher_no,
				"account": entry.account,
				"party_type": entry.party_type,
				"party": entry.party,
				"against": entry.against,
				"remarks": entry.remarks,
				"receipt": receipt,
				"payment": payment,
				"balance": running_balance,
			}
		)

	return data


def get_columns():
	return [
		{"label": _("Date"), "fieldname": "posting_date", "fieldtype": "Date", "width": 100},
		{"label": _("Voucher Type"), "fieldname": "voucher_type", "fieldtype": "Data", "width": 130},
		{"label": _("Voucher No"), "fieldname": "voucher_no", "fieldtype": "Dynamic Link", "options": "voucher_type", "width": 180},
		{"label": _("Account"), "fieldname": "account", "fieldtype": "Link", "options": "Account", "width": 220},
		{"label": _("Party Type"), "fieldname": "party_type", "fieldtype": "Data", "width": 110},
		{"label": _("Party"), "fieldname": "party", "fieldtype": "Dynamic Link", "options": "party_type", "width": 150},
		{"label": _("Against"), "fieldname": "against", "fieldtype": "Data", "width": 180},
		{"label": _("Remarks"), "fieldname": "remarks", "fieldtype": "Data", "width": 250},
		{"label": _("Receipt"), "fieldname": "receipt", "fieldtype": "Currency", "width": 120},
		{"label": _("Payment"), "fieldname": "payment", "fieldtype": "Currency", "width": 120},
		{"label": _("Balance"), "fieldname": "balance", "fieldtype": "Currency", "width": 130},
	]
