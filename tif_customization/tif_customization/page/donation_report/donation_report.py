# Copyright (c) 2026, The Ilm Foundation and contributors
# License: MIT

"""Donation Report — filterable donation receipts with KPIs, grouping, print/CSV."""

from __future__ import annotations

import json

import frappe
from frappe import _
from frappe.utils import flt, getdate


@frappe.whitelist()
def get_report_data(filters=None):
	if not frappe.has_permission("Donation", "read"):
		frappe.throw(_("You are not permitted to view Donation data."), frappe.PermissionError)

	filters = _parse_filters(filters)
	company, from_date, to_date = _resolve_common(filters)
	group_by = (filters.get("group_by") or "Detail").strip()

	where, params = _build_where(filters, company, from_date, to_date)
	rows = _fetch_donations(where, params)

	if group_by == "Detail":
		detail_rows = [_detail_row(r) for r in rows]
		mode = "detail"
		grouped = []
	else:
		detail_rows = []
		mode = "summary"
		grouped = _group_rows(rows, group_by)

	totals = _totals(rows)
	by_category = _sum_by(rows, "donation_category")
	by_method = _sum_by(rows, "payment_method")

	return {
		"mode": mode,
		"group_by": group_by,
		"company": company,
		"brand": _company_brand(company),
		"from_date": str(from_date),
		"to_date": str(to_date),
		"printed_on": str(getdate()),
		"totals": totals,
		"by_category": by_category,
		"by_method": by_method,
		"rows": detail_rows,
		"summary_rows": grouped,
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


def _build_where(filters, company, from_date, to_date):
	where = [
		"d.docstatus = 1",
		"d.company = %(company)s",
		"d.donation_date BETWEEN %(from_date)s AND %(to_date)s",
	]
	params = {
		"company": company,
		"from_date": str(from_date),
		"to_date": str(to_date),
	}

	if filters.get("donor"):
		where.append("d.donor = %(donor)s")
		params["donor"] = filters["donor"]
	if filters.get("donation_type"):
		where.append("d.donation_type = %(donation_type)s")
		params["donation_type"] = filters["donation_type"]
	if filters.get("donation_category"):
		where.append(
			"""
			COALESCE(NULLIF(d.donation_category, ''), dt.category, '') = %(donation_category)s
			"""
		)
		params["donation_category"] = filters["donation_category"]
	if filters.get("payment_method"):
		where.append("d.payment_method = %(payment_method)s")
		params["payment_method"] = filters["payment_method"]
	if filters.get("bank_account"):
		where.append("d.bank_account = %(bank_account)s")
		params["bank_account"] = filters["bank_account"]
	if filters.get("cost_center"):
		where.append("d.cost_center = %(cost_center)s")
		params["cost_center"] = filters["cost_center"]

	return " AND ".join(where), params


def _fetch_donations(where, params):
	return frappe.db.sql(
		f"""
		SELECT
			d.name,
			d.donation_date,
			d.donor,
			COALESCE(NULLIF(d.donor_name_on_receipt, ''), NULLIF(d.donor_name, ''), d.donor, '—') AS donor_name,
			d.donation_type,
			COALESCE(NULLIF(d.donation_category, ''), dt.category, '') AS donation_category,
			d.donation_amount,
			d.received_amount,
			d.outstanding_amount,
			d.currency,
			d.payment_method,
			d.bank_account,
			d.payment_reference,
			d.cost_center,
			d.remarks,
			d.company
		FROM `tabDonation` d
		LEFT JOIN `tabDonation Type` dt ON dt.name = d.donation_type
		WHERE {where}
		ORDER BY d.donation_date DESC, d.name DESC
		""",
		params,
		as_dict=True,
	)


def _detail_row(r):
	return {
		"name": r.name,
		"donation_date": str(r.donation_date) if r.donation_date else "",
		"donor": r.donor or "",
		"donor_name": r.donor_name or "—",
		"donation_type": r.donation_type or "",
		"donation_category": r.donation_category or "",
		"donation_amount": flt(r.donation_amount, 2),
		"received_amount": flt(r.received_amount, 2),
		"outstanding_amount": flt(r.outstanding_amount, 2),
		"currency": r.currency or "",
		"payment_method": r.payment_method or "",
		"bank_account": r.bank_account or "",
		"payment_reference": r.payment_reference or "",
		"cost_center": r.cost_center or "",
		"remarks": r.remarks or "",
	}


def _group_key(row, group_by):
	mapping = {
		"Donor": (row.donor_name or row.donor or "—", row.donor or ""),
		"Donation Type": (row.donation_type or "—", row.donation_type or ""),
		"Category": (row.donation_category or "—", row.donation_category or ""),
		"Payment Method": (row.payment_method or "—", row.payment_method or ""),
		"Bank Account": (row.bank_account or _("Cash / Unspecified"), row.bank_account or ""),
		"Cost Center": (row.cost_center or "—", row.cost_center or ""),
	}
	return mapping.get(group_by, (row.donor_name or "—", row.donor or ""))


def _group_rows(rows, group_by):
	buckets = {}
	for r in rows:
		label, key = _group_key(r, group_by)
		bucket = buckets.get(key)
		if not bucket:
			bucket = {
				"key": key,
				"label": label,
				"donation_count": 0,
				"donor_set": set(),
				"received_amount": 0.0,
				"donation_amount": 0.0,
				"outstanding_amount": 0.0,
			}
			buckets[key] = bucket
		bucket["donation_count"] += 1
		if r.donor:
			bucket["donor_set"].add(r.donor)
		bucket["received_amount"] += flt(r.received_amount)
		bucket["donation_amount"] += flt(r.donation_amount)
		bucket["outstanding_amount"] += flt(r.outstanding_amount)

	out = []
	for b in buckets.values():
		out.append(
			{
				"key": b["key"],
				"label": b["label"],
				"donation_count": b["donation_count"],
				"unique_donors": len(b["donor_set"]),
				"received_amount": flt(b["received_amount"], 2),
				"donation_amount": flt(b["donation_amount"], 2),
				"outstanding_amount": flt(b["outstanding_amount"], 2),
			}
		)
	out.sort(key=lambda x: (-x["received_amount"], x["label"].lower()))
	return out


def _totals(rows):
	donors = {r.donor for r in rows if r.donor}
	zakat = sum(flt(r.received_amount) for r in rows if (r.donation_category or "").lower() == "zakat")
	return {
		"donation_count": len(rows),
		"unique_donors": len(donors),
		"received_amount": flt(sum(flt(r.received_amount) for r in rows), 2),
		"donation_amount": flt(sum(flt(r.donation_amount) for r in rows), 2),
		"outstanding_amount": flt(sum(flt(r.outstanding_amount) for r in rows), 2),
		"zakat_amount": flt(zakat, 2),
		"other_amount": flt(sum(flt(r.received_amount) for r in rows) - zakat, 2),
	}


def _sum_by(rows, field):
	acc = {}
	for r in rows:
		key = getattr(r, field, None) or "—"
		acc[key] = flt(acc.get(key, 0) + flt(r.received_amount), 2)
	return [{"label": k, "amount": v} for k, v in sorted(acc.items(), key=lambda x: -x[1])]


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
