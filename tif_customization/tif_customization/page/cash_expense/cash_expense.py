# Copyright (c) 2026, The Ilm Foundation and contributors
# License: MIT
"""Cash Expense page — petty cash / cash account statement (VCL-style)."""

from __future__ import annotations

import json

import frappe
from frappe import _
from frappe.utils import cint, flt, getdate

DEFAULT_ACCOUNT = "PETTY CASH - TIF"


@frappe.whitelist()
def get_report_data(filters=None):
	if not frappe.has_permission("GL Entry", "read"):
		frappe.throw(_("You are not permitted to view GL Entry data."))

	filters = _parse_filters(filters)
	company, from_date, to_date = _resolve_common(filters)
	account = _resolve_account(filters, company)
	cost_center = (filters.get("cost_center") or "").strip() or None

	opening = _opening_balance(company, account, from_date, cost_center)
	entries = _gl_entries(company, account, from_date, to_date, cost_center)
	rows, closing, total_debit, total_credit = _build_rows(entries, opening)

	return {
		"company": company,
		"brand": _company_brand(company),
		"from_date": str(from_date),
		"to_date": str(to_date),
		"printed_on": str(getdate()),
		"account": account,
		"cost_center": cost_center or "",
		"opening_balance": flt(opening, 2),
		"closing_balance": flt(closing, 2),
		"total_debit": flt(total_debit, 2),
		"total_credit": flt(total_credit, 2),
		"rows": rows,
	}


def _parse_filters(filters):
	if isinstance(filters, str):
		try:
			return json.loads(filters) or {}
		except Exception:
			return {}
	return filters or {}


def _resolve_common(filters):
	company = (
		filters.get("company") or frappe.defaults.get_user_default("Company") or "The ILM Foundation"
	).strip()
	if not company:
		frappe.throw(_("Company is required."))
	today = getdate()
	from_date = getdate(filters.get("from_date") or frappe.defaults.get_user_default("year_start_date") or today)
	to_date = getdate(filters.get("to_date") or frappe.defaults.get_user_default("year_end_date") or today)
	if from_date > to_date:
		frappe.throw(_("From Date must be before To Date."))
	return company, from_date, to_date


def _resolve_account(filters, company):
	account_name = (filters.get("account") or DEFAULT_ACCOUNT).strip()
	account = frappe.db.get_value(
		"Account",
		account_name,
		["name", "company", "is_group"],
		as_dict=True,
	)
	if not account:
		frappe.throw(_("Invalid Account: {0}").format(account_name))
	if account.company != company:
		frappe.throw(_("Selected account does not belong to {0}.").format(company))
	if cint(account.is_group):
		frappe.throw(_("Please select a ledger account, not a group account."))
	return account.name


def _company_brand(company):
	row = (
		frappe.db.get_value(
			"Company",
			company,
			["name", "company_name", "phone_no", "email", "website", "default_letter_head"],
			as_dict=True,
		)
		or {}
	)
	logo = ""
	letter_head = row.get("default_letter_head")
	if letter_head:
		logo = frappe.db.get_value("Letter Head", letter_head, "image") or ""
	if not logo:
		logo = frappe.db.get_value("Company", company, "company_logo") or ""
	return {
		"company": row.get("name") or company,
		"company_name": row.get("company_name") or company,
		"phone_no": row.get("phone_no") or "",
		"email": row.get("email") or "",
		"website": row.get("website") or "",
		"logo": logo,
	}


def _opening_balance(company, account, from_date, cost_center=None):
	conds = [
		"company = %(company)s",
		"account = %(account)s",
		"posting_date < %(from_date)s",
		"is_cancelled = 0",
	]
	values = {"company": company, "account": account, "from_date": from_date}
	if cost_center:
		conds.append("cost_center = %(cost_center)s")
		values["cost_center"] = cost_center
	return (
		frappe.db.sql(
			f"select coalesce(sum(debit - credit), 0) from `tabGL Entry` where {' and '.join(conds)}",
			values,
		)[0][0]
		or 0
	)


def _gl_entries(company, account, from_date, to_date, cost_center=None):
	conds = [
		"company = %(company)s",
		"account = %(account)s",
		"posting_date between %(from_date)s and %(to_date)s",
		"is_cancelled = 0",
	]
	values = {
		"company": company,
		"account": account,
		"from_date": from_date,
		"to_date": to_date,
	}
	if cost_center:
		conds.append("cost_center = %(cost_center)s")
		values["cost_center"] = cost_center
	return frappe.db.sql(
		f"""
		select
			posting_date, voucher_type, voucher_no, remarks, debit, credit, cost_center
		from `tabGL Entry`
		where {" and ".join(conds)}
		order by posting_date, creation, name
		""",
		values,
		as_dict=True,
	)


def _build_rows(entries, opening):
	rows = [
		{
			"is_opening": 1,
			"voucher_no": "",
			"voucher_type": "",
			"posting_date": "",
			"remarks": _("Opening Balance"),
			"debit": 0,
			"credit": 0,
			"balance": flt(opening, 2),
			"cost_center": "",
		}
	]
	running = flt(opening)
	total_debit = 0.0
	total_credit = 0.0
	for e in entries:
		debit = flt(e.debit)
		credit = flt(e.credit)
		running += debit - credit
		total_debit += debit
		total_credit += credit
		rows.append(
			{
				"is_opening": 0,
				"is_closing": 0,
				"voucher_no": e.voucher_no or "",
				"voucher_type": e.voucher_type or "",
				"posting_date": str(e.posting_date) if e.posting_date else "",
				"remarks": e.remarks or "",
				"debit": flt(debit, 2),
				"credit": flt(credit, 2),
				"balance": flt(running, 2),
				"cost_center": e.cost_center or "",
			}
		)
	rows.append(
		{
			"is_closing": 1,
			"voucher_no": "",
			"voucher_type": "",
			"posting_date": "",
			"remarks": _("Closing Balance"),
			"debit": 0,
			"credit": 0,
			"balance": flt(running, 2),
			"cost_center": "",
		}
	)
	return rows, running, total_debit, total_credit
