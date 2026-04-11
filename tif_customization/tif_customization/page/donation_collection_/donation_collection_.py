import json
import calendar
from datetime import date

import frappe
from frappe.utils import flt


@frappe.whitelist()
def get_donation_collection_data(filters=None):
	if isinstance(filters, str):
		filters = json.loads(filters or "{}")
	filters = filters or {}

	from_date = filters.get("from_date")
	to_date = filters.get("to_date")
	period_type = (filters.get("period_type") or "").strip().lower()
	reference_date = filters.get("reference_date") or from_date

	if not from_date or not to_date:
		frappe.throw("From Date and To Date are required.")

	query_from = from_date
	query_to = to_date
	if period_type == "month":
		months = _fiscal_year_month_blocks(reference_date)
		query_from = months[0]["from_date"]
		query_to = months[-1]["to_date"]
	else:
		months = _month_blocks(from_date, to_date)

	rows = frappe.db.sql(
		"""
		SELECT
			COALESCE(d.donor_name, d.donor, 'Walk-in / Unknown') AS donor_name,
			COALESCE(d.donor, '') AS donor_id,
			DATE_FORMAT(d.donation_date, '%%Y-%%m') AS month_key,
			SUM(COALESCE(d.donation_amount, 0)) AS committed_amount,
			SUM(CASE WHEN COALESCE(dt.category, '') = 'Zakat' THEN COALESCE(d.received_amount, 0) ELSE 0 END) AS zakat_fund,
			SUM(CASE WHEN COALESCE(dt.category, '') != 'Zakat' THEN COALESCE(d.received_amount, 0) ELSE 0 END) AS other_collection,
			SUM(COALESCE(d.outstanding_amount, 0)) AS balance_amount
		FROM `tabDonation` d
		LEFT JOIN `tabDonation Type` dt ON dt.name = d.donation_type
		WHERE d.docstatus = 1
		  AND d.donation_date BETWEEN %(from_date)s AND %(to_date)s
		GROUP BY donor_name, donor_id, month_key
		ORDER BY donor_name, month_key
		""",
		{"from_date": query_from, "to_date": query_to},
		as_dict=True,
	)
	commitment_rows = frappe.db.sql(
		"""
		SELECT
			COALESCE(dn.donor_name, dc.parent, 'Walk-in / Unknown') AS donor_name,
			COALESCE(dc.parent, '') AS donor_id,
			SUM(COALESCE(dc.commitment_amount, 0)) AS commitment_amount
		FROM `tabDonor Commitment` dc
		LEFT JOIN `tabDonor` dn ON dn.name = dc.parent
		WHERE COALESCE(dc.status, 'Active') != 'Cancelled'
		  AND dc.from_date <= %(to_date)s
		  AND dc.to_date >= %(from_date)s
		GROUP BY donor_name, donor_id
		ORDER BY donor_name
		""",
		{"from_date": from_date, "to_date": to_date},
		as_dict=True,
	)
	month_keys = [m["key"] for m in months]
	by_donor = {}
	commitment_by_donor = {}

	for c in commitment_rows:
		key = f"{c.get('donor_name')}::{c.get('donor_id')}"
		commitment_by_donor[key] = flt(c.get("commitment_amount"))
	grand = {
		"committed_amount": 0.0,
		"other_collection": 0.0,
		"zakat_fund": 0.0,
		"total_collection": 0.0,
		"balance_amount": 0.0,
		"month_values": {k: 0.0 for k in month_keys},
	}

	for r in rows:
		zakat_fund = flt(r.get("zakat_fund"))
		other_collection = flt(r.get("other_collection"))
		total_collection = other_collection + zakat_fund
		donor_key = f"{r.get('donor_name')}::{r.get('donor_id')}"
		if donor_key not in by_donor:
			by_donor[donor_key] = {
				"donor_name": r.get("donor_name") or "Walk-in / Unknown",
				"donor_id": r.get("donor_id") or "",
				"month_values": {k: 0.0 for k in month_keys},
				"committed_amount": commitment_by_donor.get(donor_key, 0.0),
				"other_collection": 0.0,
				"zakat_fund": 0.0,
				"total_collection": 0.0,
				"balance_amount": 0.0,
			}

		item = by_donor[donor_key]
		month_key = r.get("month_key")
		if month_key in item["month_values"]:
			item["month_values"][month_key] += total_collection
			grand["month_values"][month_key] += total_collection

		item["other_collection"] += other_collection
		item["zakat_fund"] += zakat_fund
		item["total_collection"] += total_collection
		item["balance_amount"] += flt(r.get("balance_amount"))

		grand["other_collection"] += other_collection
		grand["zakat_fund"] += zakat_fund
		grand["total_collection"] += total_collection
		grand["balance_amount"] += flt(r.get("balance_amount"))

	# include donors having commitments but no donations in selected period
	for donor_key, committed_amount in commitment_by_donor.items():
		if donor_key in by_donor:
			continue
		donor_name, donor_id = donor_key.split("::", 1)
		by_donor[donor_key] = {
			"donor_name": donor_name or "Walk-in / Unknown",
			"donor_id": donor_id or "",
			"month_values": {k: 0.0 for k in month_keys},
			"committed_amount": committed_amount,
			"other_collection": 0.0,
			"zakat_fund": 0.0,
			"total_collection": 0.0,
			"balance_amount": 0.0,
		}

	grand["committed_amount"] = sum(flt(d.get("committed_amount")) for d in by_donor.values())

	data = sorted(by_donor.values(), key=lambda d: (d.get("donor_name") or "").lower())
	return {"months": months, "rows": data, "totals": grand}


def _month_blocks(from_date, to_date):
	start = frappe.utils.getdate(from_date)
	end = frappe.utils.getdate(to_date)
	cur = date(start.year, start.month, 1)
	limit = date(end.year, end.month, 1)
	out = []
	while cur <= limit:
		month_last_day = calendar.monthrange(cur.year, cur.month)[1]
		out.append(
			{
				"key": f"{cur.year}-{cur.month:02d}",
				"label": cur.strftime("%B %Y"),
				"from_date": f"{cur.year}-{cur.month:02d}-01",
				"to_date": f"{cur.year}-{cur.month:02d}-{month_last_day:02d}",
			}
		)
		if cur.month == 12:
			cur = date(cur.year + 1, 1, 1)
		else:
			cur = date(cur.year, cur.month + 1, 1)
	return out


def _fiscal_year_month_blocks(reference_date):
	ref = frappe.utils.getdate(reference_date)
	fy_start_year = ref.year if ref.month >= 7 else ref.year - 1
	return _month_blocks(f"{fy_start_year}-07-01", f"{fy_start_year + 1}-06-30")
