# Copyright (c) 2026, The Ilm Foundation and contributors
# License: MIT
"""Cash Expense — petty cash / cash account ledger (GL) with cost center.

Columns: Voucher Number, Date, Remarks, Debit, Credit, Balance, Cost Center.
Defaults align with General Ledger for PETTY CASH - TIF.
"""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import flt, getdate


DEFAULT_ACCOUNT = "PETTY CASH - TIF"


def execute(filters=None):
	filters = frappe._dict(filters or {})
	validate_filters(filters)

	account = resolve_account(filters)
	filters.account = account

	opening = get_opening_balance(filters)
	entries = get_entries(filters)
	data = build_rows(entries, opening)

	return get_columns(), data


def validate_filters(filters):
	if not filters.get("company"):
		frappe.throw(_("Company is required"))
	if not filters.get("from_date"):
		frappe.throw(_("From Date is required"))
	if not filters.get("to_date"):
		frappe.throw(_("To Date is required"))
	if getdate(filters.from_date) > getdate(filters.to_date):
		frappe.throw(_("From Date must be before To Date"))


def resolve_account(filters):
	account_name = (filters.get("account") or DEFAULT_ACCOUNT).strip()
	account = frappe.db.get_value(
		"Account",
		account_name,
		["name", "company", "account_type", "is_group"],
		as_dict=True,
	)
	if not account:
		frappe.throw(_("Invalid Account: {0}").format(account_name))
	if account.company != filters.company:
		frappe.throw(_("Selected account does not belong to {0}").format(filters.company))
	if cint_is_group(account.is_group):
		frappe.throw(_("Please select a ledger account, not a group account"))
	return account.name


def cint_is_group(v):
	from frappe.utils import cint

	return cint(v)


def get_opening_balance(filters):
	conds = [
		"company = %(company)s",
		"account = %(account)s",
		"posting_date < %(from_date)s",
		"is_cancelled = 0",
	]
	values = {
		"company": filters.company,
		"account": filters.account,
		"from_date": filters.from_date,
	}
	if filters.get("cost_center"):
		conds.append("cost_center = %(cost_center)s")
		values["cost_center"] = filters.cost_center

	return (
		frappe.db.sql(
			f"""
			select coalesce(sum(debit - credit), 0)
			from `tabGL Entry`
			where {" and ".join(conds)}
			""",
			values,
		)[0][0]
		or 0
	)


def get_entries(filters):
	conds = [
		"company = %(company)s",
		"account = %(account)s",
		"posting_date between %(from_date)s and %(to_date)s",
		"is_cancelled = 0",
	]
	values = {
		"company": filters.company,
		"account": filters.account,
		"from_date": filters.from_date,
		"to_date": filters.to_date,
	}
	if filters.get("cost_center"):
		conds.append("cost_center = %(cost_center)s")
		values["cost_center"] = filters.cost_center

	return frappe.db.sql(
		f"""
		select
			posting_date,
			voucher_type,
			voucher_no,
			remarks,
			debit,
			credit,
			cost_center
		from `tabGL Entry`
		where {" and ".join(conds)}
		order by posting_date, creation, name
		""",
		values,
		as_dict=True,
	)


def build_rows(entries, opening_balance):
	rows = [
		{
			"voucher_no": "",
			"voucher_type": "",
			"posting_date": "",
			"remarks": _("Opening Balance"),
			"debit": 0,
			"credit": 0,
			"balance": flt(opening_balance),
			"cost_center": "",
		}
	]

	running = flt(opening_balance)
	for e in entries:
		debit = flt(e.debit)
		credit = flt(e.credit)
		running += debit - credit
		rows.append(
			{
				"voucher_no": e.voucher_no,
				"voucher_type": e.voucher_type,
				"posting_date": e.posting_date,
				"remarks": e.remarks or "",
				"debit": debit,
				"credit": credit,
				"balance": running,
				"cost_center": e.cost_center or "",
			}
		)

	return rows


def get_columns():
	return [
		{
			"label": _("Voucher Number"),
			"fieldname": "voucher_no",
			"fieldtype": "Dynamic Link",
			"options": "voucher_type",
			"width": 160,
		},
		{
			"label": _("Date"),
			"fieldname": "posting_date",
			"fieldtype": "Date",
			"width": 100,
		},
		{
			"label": _("Remarks"),
			"fieldname": "remarks",
			"fieldtype": "Data",
			"width": 320,
		},
		{
			"label": _("Debit"),
			"fieldname": "debit",
			"fieldtype": "Currency",
			"width": 120,
		},
		{
			"label": _("Credit"),
			"fieldname": "credit",
			"fieldtype": "Currency",
			"width": 120,
		},
		{
			"label": _("Balance"),
			"fieldname": "balance",
			"fieldtype": "Currency",
			"width": 130,
		},
		{
			"label": _("Cost Center"),
			"fieldname": "cost_center",
			"fieldtype": "Link",
			"options": "Cost Center",
			"width": 180,
		},
	]
