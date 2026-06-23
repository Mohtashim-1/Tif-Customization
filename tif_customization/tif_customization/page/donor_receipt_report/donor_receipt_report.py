import json
from datetime import date

import frappe
from frappe.utils import cint, flt, getdate, nowdate


@frappe.whitelist()
def get_month_wise_summary(from_date=None, to_date=None):
	from_date, to_date = _resolve_dates(from_date, to_date)

	rows = frappe.db.sql(
		"""
		SELECT
			DATE_FORMAT(d.donation_date, '%%Y-%%m') AS month_key,
			DATE_FORMAT(d.donation_date, '%%M %%Y') AS month_label,
			COUNT(*) AS donation_count,
			COALESCE(SUM(d.received_amount), 0) AS total_amount
		FROM `tabDonation` d
		WHERE d.docstatus = 1
		  AND d.donation_date BETWEEN %(from_date)s AND %(to_date)s
		GROUP BY month_key, month_label
		ORDER BY month_key DESC
		""",
		{"from_date": str(from_date), "to_date": str(to_date)},
		as_dict=True,
	)

	totals = {
		"donation_count": sum(cint(r.get("donation_count")) for r in rows),
		"total_amount": sum(flt(r.get("total_amount")) for r in rows),
	}

	return {
		"from_date": str(from_date),
		"to_date": str(to_date),
		"months": rows,
		"totals": totals,
	}


@frappe.whitelist()
def get_month_donations(month_key, from_date=None, to_date=None):
	if isinstance(month_key, str) and month_key.startswith("{"):
		payload = json.loads(month_key)
		month_key = payload.get("month_key")
		from_date = payload.get("from_date", from_date)
		to_date = payload.get("to_date", to_date)

	if not month_key:
		frappe.throw("Month is required")

	from_date, to_date = _resolve_dates(from_date, to_date)

	return frappe.db.sql(
		"""
		SELECT
			d.name,
			d.donation_date,
			COALESCE(d.donor_name_on_receipt, d.donor_name, '—') AS donor_name,
			d.donor,
			d.donation_type,
			d.donation_category,
			d.received_amount,
			d.currency,
			d.payment_method,
			d.remarks
		FROM `tabDonation` d
		WHERE d.docstatus = 1
		  AND DATE_FORMAT(d.donation_date, '%%Y-%%m') = %(month_key)s
		  AND d.donation_date BETWEEN %(from_date)s AND %(to_date)s
		ORDER BY d.donation_date DESC, d.name DESC
		""",
		{"month_key": month_key, "from_date": str(from_date), "to_date": str(to_date)},
		as_dict=True,
	)


def _resolve_dates(from_date=None, to_date=None):
	if from_date and to_date:
		start = getdate(from_date)
		end = getdate(to_date)
	else:
		ref = getdate(nowdate())
		fy_start_year = ref.year if ref.month >= 7 else ref.year - 1
		start = date(fy_start_year, 7, 1)
		end = ref

	if start > end:
		frappe.throw("From Date cannot be after To Date")
	return start, end
