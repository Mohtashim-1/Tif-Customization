# Copyright (c) 2026, TIF Customization and contributors
# License: MIT
"""Vendor / Consultant Ledger — GL party ledger for Suppliers (vendors & consultants)."""

from __future__ import annotations

import json
from collections import defaultdict

import frappe
from frappe import _
from frappe.utils import cint, flt, formatdate, getdate


@frappe.whitelist()
def get_report_data(filters=None):
	if not frappe.has_permission("GL Entry", "read"):
		frappe.throw(_("You are not permitted to view GL Entry data."))

	filters = _parse_filters(filters)
	company, from_date, to_date = _resolve_common(filters)
	supplier = (filters.get("supplier") or "").strip() or None
	supplier_group = (filters.get("supplier_group") or "").strip() or None

	parties = _get_suppliers(supplier=supplier, supplier_group=supplier_group)
	if supplier and not parties:
		frappe.throw(_("Supplier {0} not found.").format(supplier))

	party_ids = [p.name for p in parties]

	if supplier:
		opening = _opening_balance(company, from_date, party_ids)
		entries = _gl_entries(company, from_date, to_date, party_ids)
		rows, closing = _build_ledger_rows(entries, opening)
		party = parties[0]
		return {
			"mode": "ledger",
			"company": company,
			"brand": _company_brand(company),
			"from_date": str(from_date),
			"to_date": str(to_date),
			"printed_on": str(getdate()),
			"supplier": party.name,
			"supplier_name": party.supplier_name or party.name,
			"supplier_group": party.supplier_group,
			"opening_balance": flt(opening, 2),
			"closing_balance": flt(closing, 2),
			"total_debit": flt(sum(flt(r.get("debit")) for r in entries), 2),
			"total_credit": flt(sum(flt(r.get("credit")) for r in entries), 2),
			"rows": rows,
			"party_summary": [],
		}

	# Summary mode — all matching suppliers
	opening_map = _opening_by_party(company, from_date, party_ids)
	period_rows = _gl_entries(company, from_date, to_date, party_ids)
	summary = _build_party_summary(parties, opening_map, period_rows)

	return {
		"mode": "summary",
		"company": company,
		"brand": _company_brand(company),
		"from_date": str(from_date),
		"to_date": str(to_date),
		"printed_on": str(getdate()),
		"supplier": "",
		"supplier_name": "",
		"supplier_group": supplier_group or "",
		"opening_balance": flt(sum(flt(r["opening"]) for r in summary), 2),
		"closing_balance": flt(sum(flt(r["closing"]) for r in summary), 2),
		"total_debit": flt(sum(flt(r["debit"]) for r in summary), 2),
		"total_credit": flt(sum(flt(r["credit"]) for r in summary), 2),
		"rows": [],
		"party_summary": summary,
	}


def _company_brand(company):
	row = frappe.db.get_value(
		"Company",
		company,
		["name", "company_name", "phone_no", "email", "website", "default_letter_head"],
		as_dict=True,
	) or {}
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


def _parse_filters(filters):
	if isinstance(filters, str):
		try:
			return json.loads(filters) or {}
		except Exception:
			return {}
	return filters or {}


def _resolve_common(filters):
	company = (filters.get("company") or frappe.defaults.get_user_default("Company") or "").strip()
	if not company:
		frappe.throw(_("Company is required."))
	today = getdate()
	from_date = getdate(filters.get("from_date") or today.replace(day=1))
	to_date = getdate(filters.get("to_date") or today)
	if from_date > to_date:
		frappe.throw(_("From Date cannot be after To Date."))
	return company, from_date, to_date


def _get_suppliers(supplier=None, supplier_group=None):
	conditions = ["disabled = 0"]
	params = {}
	if supplier:
		conditions.append("name = %(supplier)s")
		params["supplier"] = supplier
	if supplier_group:
		conditions.append("supplier_group = %(supplier_group)s")
		params["supplier_group"] = supplier_group

	where = " AND ".join(conditions)
	return frappe.db.sql(
		f"""
		SELECT name, supplier_name, supplier_group, supplier_type
		FROM `tabSupplier`
		WHERE {where}
		ORDER BY COALESCE(NULLIF(supplier_name, ''), name)
		""",
		params,
		as_dict=True,
	)


def _opening_balance(company, from_date, party_ids):
	"""Payable convention: credit − debit (outstanding payable)."""
	if not party_ids:
		return 0.0
	return (
		frappe.db.sql(
			"""
			SELECT COALESCE(SUM(credit - debit), 0)
			FROM `tabGL Entry`
			WHERE company = %(company)s
			  AND party_type = 'Supplier'
			  AND party IN %(parties)s
			  AND posting_date < %(from_date)s
			  AND is_cancelled = 0
			  AND IFNULL(party, '') != ''
			""",
			{"company": company, "parties": tuple(party_ids), "from_date": from_date},
		)[0][0]
		or 0.0
	)


def _opening_by_party(company, from_date, party_ids):
	if not party_ids:
		return {}
	rows = frappe.db.sql(
		"""
		SELECT party, COALESCE(SUM(credit - debit), 0) AS opening
		FROM `tabGL Entry`
		WHERE company = %(company)s
		  AND party_type = 'Supplier'
		  AND party IN %(parties)s
		  AND posting_date < %(from_date)s
		  AND is_cancelled = 0
		  AND IFNULL(party, '') != ''
		GROUP BY party
		""",
		{"company": company, "parties": tuple(party_ids), "from_date": from_date},
		as_dict=True,
	)
	return {r.party: flt(r.opening) for r in rows}


def _gl_entries(company, from_date, to_date, party_ids):
	if not party_ids:
		return []
	return frappe.db.sql(
		"""
		SELECT
			gle.posting_date,
			gle.account,
			gle.party,
			gle.voucher_type,
			gle.voucher_no,
			gle.against_voucher_type,
			gle.against_voucher,
			gle.against,
			gle.debit,
			gle.credit,
			gle.remarks,
			gle.cost_center,
			gle.project,
			s.supplier_name,
			s.supplier_group
		FROM `tabGL Entry` gle
		LEFT JOIN `tabSupplier` s ON s.name = gle.party
		WHERE gle.company = %(company)s
		  AND gle.party_type = 'Supplier'
		  AND gle.party IN %(parties)s
		  AND gle.posting_date BETWEEN %(from_date)s AND %(to_date)s
		  AND gle.is_cancelled = 0
		  AND IFNULL(gle.party, '') != ''
		ORDER BY gle.posting_date, gle.creation, gle.name
		""",
		{
			"company": company,
			"parties": tuple(party_ids),
			"from_date": from_date,
			"to_date": to_date,
		},
		as_dict=True,
	)


def _build_ledger_rows(entries, opening):
	rows = [
		{
			"posting_date": "",
			"voucher_type": "",
			"voucher_no": "",
			"account": "",
			"against": "",
			"remarks": _("Opening Balance"),
			"debit": 0,
			"credit": 0,
			"balance": flt(opening, 2),
			"is_opening": 1,
		}
	]
	balance = flt(opening)
	for e in entries:
		debit = flt(e.debit)
		credit = flt(e.credit)
		balance = flt(balance + credit - debit, 2)
		rows.append(
			{
				"posting_date": str(e.posting_date) if e.posting_date else "",
				"voucher_type": e.voucher_type or "",
				"voucher_no": e.voucher_no or "",
				"account": e.account or "",
				"against": e.against or "",
				"against_voucher": e.against_voucher or "",
				"against_voucher_type": e.against_voucher_type or "",
				"remarks": e.remarks or "",
				"cost_center": e.cost_center or "",
				"debit": flt(debit, 2),
				"credit": flt(credit, 2),
				"balance": balance,
				"is_opening": 0,
			}
		)
	rows.append(
		{
			"posting_date": "",
			"voucher_type": "",
			"voucher_no": "",
			"account": "",
			"against": "",
			"remarks": _("Closing Balance"),
			"debit": 0,
			"credit": 0,
			"balance": flt(balance, 2),
			"is_closing": 1,
		}
	)
	return rows, balance


def _build_party_summary(parties, opening_map, period_rows):
	agg = defaultdict(lambda: {"debit": 0.0, "credit": 0.0})
	for e in period_rows:
		agg[e.party]["debit"] += flt(e.debit)
		agg[e.party]["credit"] += flt(e.credit)

	out = []
	for p in parties:
		opening = flt(opening_map.get(p.name) or 0)
		debit = flt(agg[p.name]["debit"])
		credit = flt(agg[p.name]["credit"])
		closing = flt(opening + credit - debit, 2)
		# Skip parties with no movement and zero opening
		if not opening and not debit and not credit:
			continue
		out.append(
			{
				"supplier": p.name,
				"supplier_name": p.supplier_name or p.name,
				"supplier_group": p.supplier_group or "",
				"opening": flt(opening, 2),
				"debit": flt(debit, 2),
				"credit": flt(credit, 2),
				"closing": closing,
			}
		)
	out.sort(key=lambda r: abs(flt(r["closing"])), reverse=True)
	return out
