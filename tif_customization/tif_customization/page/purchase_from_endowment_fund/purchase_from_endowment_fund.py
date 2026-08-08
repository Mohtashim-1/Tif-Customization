import json
from datetime import timedelta

import frappe
from frappe.utils import flt, getdate


ENDOWMENT_DONATION_TYPES = ("Rental Income",)
ENDOWMENT_FUND_ACCOUNT = "Endowment Fund - TIF"
ENDOWMENT_OPENING_DATE = "2025-07-01"


@frappe.whitelist()
def get_report_data(filters=None):
	if isinstance(filters, str):
		filters = json.loads(filters or "{}")
	filters = filters or {}

	from_date = filters.get("from_date")
	to_date = filters.get("to_date")
	supplier = (filters.get("supplier") or "").strip()

	date_sql_donation, date_params_donation = _date_clause("d.donation_date", from_date, to_date)
	date_sql_pe, date_params_pe = _date_clause("pe.posting_date", from_date, to_date)

	received_rows = _get_endowment_received(date_sql_donation, date_params_donation)
	purchase_rows = _get_endowment_purchases(date_sql_pe, date_params_pe, supplier)
	supplier_rows = _get_supplier_summary(purchase_rows)

	opening_balance, opening_rows = _opening_from_gl(from_date, to_date)
	period_received = sum(flt(row.get("amount")) for row in received_rows)
	purchase_used = sum(flt(row.get("amount")) for row in purchase_rows)
	endowment_received = opening_balance + period_received

	if opening_rows:
		received_rows = list(opening_rows) + list(received_rows)

	return {
		"filters": {
			"from_date": from_date or "",
			"to_date": to_date or "",
			"supplier": supplier,
		},
		"summary": {
			"opening_balance": opening_balance,
			"opening_date": ENDOWMENT_OPENING_DATE,
			"opening_account": ENDOWMENT_FUND_ACCOUNT,
			"period_received": period_received,
			"zakat_received": endowment_received,
			"purchase_used": purchase_used,
			"remaining_amount": endowment_received - purchase_used,
			"purchase_count": len({row.get("payment_entry") for row in purchase_rows if row.get("payment_entry")}),
			"invoice_count": len({row.get("purchase_invoice") for row in purchase_rows if row.get("purchase_invoice")}),
			"supplier_count": len({row.get("supplier") for row in purchase_rows if row.get("supplier")}),
		},
		"received": received_rows,
		"purchases": purchase_rows,
		"supplier_summary": supplier_rows,
		"monthly": _get_monthly_summary(received_rows, purchase_rows),
	}


def _opening_from_gl(from_date, to_date):
	"""Read Endowment Fund liability opening from GL (credit − debit).

	- Period ending before opening date → 0
	- Otherwise: GL balance as of day before From Date, plus prior
	  Rental Income receipts − purchases (carry-forward for the report)
	- If no From Date: GL balance as of opening date (the opening entry)
	"""
	if not frappe.db.exists("Account", ENDOWMENT_FUND_ACCOUNT):
		return 0.0, []

	opening_date = getdate(ENDOWMENT_OPENING_DATE)
	if to_date and getdate(to_date) < opening_date:
		return 0.0, []

	if from_date:
		from_dt = getdate(from_date)
		# Balance before period start; opening JE on from_date is included via <= from_date-1
		# only if dated earlier. Opening is on 01 Jul, so for from_date=01 Jul use inclusive.
		if from_dt <= opening_date:
			as_on = opening_date
			gl_opening = _gl_credit_balance(ENDOWMENT_FUND_ACCOUNT, as_on)
			prior_net = 0.0
		else:
			as_on = from_dt - timedelta(days=1)
			gl_opening = _gl_credit_balance(ENDOWMENT_FUND_ACCOUNT, as_on)
			recv_sql = " AND d.donation_date >= %s AND d.donation_date < %s"
			prior_received = sum(
				flt(r.get("amount"))
				for r in _get_endowment_received(recv_sql, [opening_date, from_dt])
			)
			pay_sql = " AND pe.posting_date >= %s AND pe.posting_date < %s"
			prior_used = sum(
				flt(r.get("amount"))
				for r in _get_endowment_purchases(pay_sql, [opening_date, from_dt])
			)
			prior_net = prior_received - prior_used
	else:
		as_on = opening_date
		gl_opening = _gl_credit_balance(ENDOWMENT_FUND_ACCOUNT, as_on)
		prior_net = 0.0

	balance = flt(gl_opening + prior_net)
	if not balance:
		return 0.0, []

	rows = _gl_opening_detail_rows(as_on if not from_date or getdate(from_date) <= opening_date else getdate(from_date))
	# If detail rows don't sum to balance (carry-forward case), show one summary row
	detail_sum = sum(flt(r.get("amount")) for r in rows)
	if abs(detail_sum - balance) > 0.01:
		rows = [
			{
				"posting_date": getdate(from_date) if from_date else opening_date,
				"voucher_type": "Opening Balance",
				"voucher_no": ENDOWMENT_FUND_ACCOUNT,
				"account": ENDOWMENT_FUND_ACCOUNT,
				"against": "Endowment Fund",
				"amount": balance,
				"remarks": f"GL opening / carry-forward from {ENDOWMENT_FUND_ACCOUNT}",
				"is_opening": 1,
			}
		]
	return balance, rows


def _gl_credit_balance(account, as_on):
	"""Liability-style balance: credit − debit up to as_on."""
	return flt(
		frappe.db.sql(
			"""
			SELECT COALESCE(SUM(credit), 0) - COALESCE(SUM(debit), 0)
			FROM `tabGL Entry`
			WHERE account = %s
			  AND is_cancelled = 0
			  AND posting_date <= %s
			""",
			(account, getdate(as_on)),
		)[0][0]
	)


def _gl_opening_detail_rows(as_on):
	rows = frappe.db.sql(
		"""
		SELECT
			gle.posting_date,
			gle.voucher_type,
			gle.voucher_no,
			gle.account,
			gle.against,
			COALESCE(gle.credit, 0) - COALESCE(gle.debit, 0) AS amount,
			gle.remarks,
			1 AS is_opening
		FROM `tabGL Entry` gle
		WHERE gle.account = %s
		  AND gle.is_cancelled = 0
		  AND gle.posting_date <= %s
		  AND (COALESCE(gle.credit, 0) - COALESCE(gle.debit, 0)) != 0
		ORDER BY gle.posting_date, gle.voucher_no
		""",
		(ENDOWMENT_FUND_ACCOUNT, getdate(as_on)),
		as_dict=True,
	)
	return rows



def _date_clause(field, from_date, to_date):
	if from_date and to_date:
		return f" AND {field} BETWEEN %s AND %s", [getdate(from_date), getdate(to_date)]
	if from_date:
		return f" AND {field} >= %s", [getdate(from_date)]
	if to_date:
		return f" AND {field} <= %s", [getdate(to_date)]
	return "", []


def _get_endowment_received(date_sql, date_params):
	return frappe.db.sql(
		f"""
		SELECT
			d.donation_date AS posting_date,
			COALESCE(d.accounting_entry_type, 'Donation') AS voucher_type,
			COALESCE(d.accounting_entry, d.name) AS voucher_no,
			COALESCE(d.bank_account, '') AS account,
			d.donor_name AS against,
			COALESCE(d.received_amount, 0) AS amount,
			d.remarks
		FROM `tabDonation` d
		WHERE d.docstatus = 1
		  AND (
			d.donation_type IN %s
			OR LOWER(COALESCE(d.donation_type, '')) LIKE '%%endowment%%'
			OR LOWER(COALESCE(d.remarks, '')) LIKE '%%endowment%%'
		  )
		  AND COALESCE(d.received_amount, 0) > 0
		  {date_sql}
		ORDER BY d.donation_date DESC, d.name DESC
		""",
		tuple([ENDOWMENT_DONATION_TYPES] + date_params),
		as_dict=True,
	)


def _get_endowment_purchases(date_sql, date_params, supplier=None):
	supplier_sql = ""
	params = list(date_params)
	if supplier:
		supplier_sql = " AND pe.party = %s"
		params.append(supplier)

	return frappe.db.sql(
		f"""
		SELECT
			pe.posting_date,
			pe.name AS payment_entry,
			pe.party AS supplier,
			pe.paid_from,
			pe.paid_to,
			per.reference_name AS purchase_invoice,
			pi.bill_no AS supplier_invoice_no,
			pi.posting_date AS invoice_date,
			COALESCE(per.allocated_amount, pe.base_paid_amount, pe.paid_amount, 0) AS amount,
			pe.mode_of_payment,
			pe.reference_no,
			pe.remarks
		FROM `tabPayment Entry` pe
		LEFT JOIN `tabPayment Entry Reference` per
			ON per.parent = pe.name
			AND per.reference_doctype = 'Purchase Invoice'
		LEFT JOIN `tabPurchase Invoice` pi
			ON pi.name = per.reference_name
		WHERE pe.docstatus = 1
		  AND pe.payment_type = 'Pay'
		  AND pe.party_type = 'Supplier'
		  AND (
			LOWER(COALESCE(pe.remarks, '')) LIKE '%%endowment%%'
			OR LOWER(COALESCE(pe.remarks, '')) LIKE '%%rental income%%'
			OR LOWER(COALESCE(pe.remarks, '')) LIKE '%%rental fund%%'
			OR LOWER(COALESCE(pe.paid_from, '')) LIKE '%%endowment%%'
		  )
		  {date_sql}
		  {supplier_sql}
		ORDER BY pe.posting_date DESC, pe.name DESC, per.idx
		""",
		tuple(params),
		as_dict=True,
	)


def _get_supplier_summary(purchase_rows):
	suppliers = {}
	for row in purchase_rows:
		supplier = row.get("supplier") or "Not Set"
		suppliers.setdefault(
			supplier,
			{
				"supplier": supplier,
				"payment_count": 0,
				"invoice_count": 0,
				"amount": 0.0,
				"_payments": set(),
				"_invoices": set(),
			},
		)
		item = suppliers[supplier]
		item["amount"] += flt(row.get("amount"))
		if row.get("payment_entry"):
			item["_payments"].add(row.get("payment_entry"))
		if row.get("purchase_invoice"):
			item["_invoices"].add(row.get("purchase_invoice"))

	result = []
	for item in suppliers.values():
		item["payment_count"] = len(item.pop("_payments"))
		item["invoice_count"] = len(item.pop("_invoices"))
		result.append(item)

	return sorted(result, key=lambda row: flt(row.get("amount")), reverse=True)


def _get_monthly_summary(received_rows, purchase_rows):
	months = {}
	for row in received_rows:
		month_key = _month_key(row.get("posting_date"))
		if not month_key:
			continue
		months.setdefault(month_key, {"month": month_key, "received": 0.0, "used": 0.0})
		months[month_key]["received"] += flt(row.get("amount"))

	for row in purchase_rows:
		month_key = _month_key(row.get("posting_date"))
		if not month_key:
			continue
		months.setdefault(month_key, {"month": month_key, "received": 0.0, "used": 0.0})
		months[month_key]["used"] += flt(row.get("amount"))

	result = []
	running_balance = 0.0
	for month_key in sorted(months):
		row = months[month_key]
		running_balance += flt(row.get("received")) - flt(row.get("used"))
		row["balance"] = running_balance
		result.append(row)
	return result


def _month_key(value):
	if not value:
		return ""
	return str(getdate(value))[:7]
