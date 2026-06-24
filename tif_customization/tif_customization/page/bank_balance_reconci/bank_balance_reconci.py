from datetime import date

import frappe
from frappe.utils import flt, getdate, nowdate


@frappe.whitelist()
def get_report_data(from_date=None, to_date=None, reference_date=None, donor=None):
	if from_date and to_date:
		fy_from = getdate(from_date)
		fy_to = getdate(to_date)
	else:
		ref = getdate(reference_date or nowdate())
		fy_start_year = ref.year if ref.month >= 7 else ref.year - 1
		fy_from = date(fy_start_year, 7, 1)
		fy_to = date(fy_start_year + 1, 6, 30)

	if fy_from > fy_to:
		frappe.throw("From Date cannot be after To Date")

	months = _months_between(fy_from, fy_to)
	month_keys = [m["key"] for m in months]

	donation_rows = frappe.db.sql(
		"""
		SELECT
			COALESCE(d.donor_name, d.donor, 'Walk-in / Unknown') AS donor_name,
			COALESCE(d.donor, '') AS donor_id,
			COALESCE(dn.donor_type, 'General Donor') AS donor_type,
			DATE_FORMAT(d.donation_date, '%%Y-%%m') AS month_key,
			CASE
				WHEN COALESCE(dt.category, '') = 'Zakat' THEN 'Zakat'
				WHEN d.donation_type = 'Rental Income' OR LOWER(COALESCE(d.donation_type, '')) LIKE '%%endowment%%' THEN 'Endowment Funds'
				ELSE 'Donation'
			END AS receipt_type,
			SUM(COALESCE(d.received_amount, 0)) AS received_amount
		FROM `tabDonation` d
		LEFT JOIN `tabDonation Type` dt ON dt.name = d.donation_type
		LEFT JOIN `tabDonor` dn ON dn.name = d.donor
		WHERE d.docstatus = 1
		  AND d.donation_date BETWEEN %(from_date)s AND %(to_date)s
		  AND (%(donor)s = '' OR d.donor = %(donor)s)
		GROUP BY donor_name, donor_id, donor_type, month_key, receipt_type
		ORDER BY donor_name, receipt_type, month_key
		""",
		{"from_date": str(fy_from), "to_date": str(fy_to), "donor": donor or ""},
		as_dict=True,
	)

	try:
		commitment_rows = frappe.db.sql(
			"""
			SELECT
				COALESCE(dn.donor_name, dc.parent, 'Walk-in / Unknown') AS donor_name,
				COALESCE(dc.parent, '') AS donor_id,
				COALESCE(dn.donor_type, 'General Donor') AS donor_type,
				SUM(COALESCE(dc.commitment_amount, 0)) AS budgeted_amount
			FROM `tabDonor Commitment` dc
			LEFT JOIN `tabDonor` dn ON dn.name = dc.parent
			WHERE COALESCE(dc.status, 'Active') != 'Cancelled'
			  AND dc.from_date <= %(to_date)s
			  AND dc.to_date >= %(from_date)s
			  AND (%(donor)s = '' OR dc.parent = %(donor)s)
			GROUP BY donor_name, donor_id, donor_type
			""",
			{"from_date": str(fy_from), "to_date": str(fy_to), "donor": donor or ""},
			as_dict=True,
		)
	except Exception:
		commitment_rows = []

	commitments = {}
	for row in commitment_rows:
		key = _key(row.get("donor_name"), row.get("donor_id"))
		commitments[key] = {
			"budgeted_amount": flt(row.get("budgeted_amount")),
			"donor_type": row.get("donor_type") or "General Donor",
		}

	lines = {}
	for row in donation_rows:
		donor_name = row.get("donor_name") or "Walk-in / Unknown"
		donor_id = row.get("donor_id") or ""
		donor_type = row.get("donor_type") or "General Donor"
		receipt_type = row.get("receipt_type") or "Donation"
		row_key = _key(donor_name, donor_id)
		if row_key not in lines:
			lines[row_key] = {
				"donor_name": donor_name,
				"donor_id": donor_id,
				"donor_type": donor_type,
				"display_name": donor_name,
				"month_values": {k: 0.0 for k in month_keys},
				"donation_amount": 0.0,
				"zakat_amount": 0.0,
				"endowment_funds_amount": 0.0,
				"total_received": 0.0,
				"budgeted_amount": 0.0,
				"balance_commitment": 0.0,
				"remarks": "",
			}

		month_key = row.get("month_key")
		amount = flt(row.get("received_amount"))
		if month_key in lines[row_key]["month_values"]:
			lines[row_key]["month_values"][month_key] += amount
		if receipt_type == "Zakat":
			lines[row_key]["zakat_amount"] += amount
		elif receipt_type == "Endowment Funds":
			lines[row_key]["endowment_funds_amount"] += amount
		else:
			lines[row_key]["donation_amount"] += amount
		lines[row_key]["total_received"] += amount

	# Add donor rows from commitments even when no transactions.
	for donor_k, commitment in commitments.items():
		donor_name, donor_id = donor_k.split("::", 1)
		if donor_k not in lines:
			lines[donor_k] = {
				"donor_name": donor_name,
				"donor_id": donor_id,
				"donor_type": commitment.get("donor_type") or "General Donor",
				"display_name": donor_name,
				"month_values": {k: 0.0 for k in month_keys},
				"donation_amount": 0.0,
				"zakat_amount": 0.0,
				"endowment_funds_amount": 0.0,
				"total_received": 0.0,
				"budgeted_amount": 0.0,
				"balance_commitment": 0.0,
				"remarks": "",
			}

	for row in lines.values():
		donor_k = _key(row.get("donor_name"), row.get("donor_id"))
		row["budgeted_amount"] = commitments.get(donor_k, {}).get("budgeted_amount", 0.0)
		row["balance_commitment"] = flt(row["budgeted_amount"]) - flt(row["total_received"])

	data = sorted(lines.values(), key=lambda r: (r.get("donor_name") or "").lower())
	sections = []
	for donor_type in ("Key Donor", "General Donor"):
		section_rows = [row for row in data if (row.get("donor_type") or "General Donor") == donor_type]
		sections.append({
			"donor_type": donor_type,
			"rows": section_rows,
			"totals": _calculate_totals(section_rows, month_keys),
		})
	totals = _calculate_totals(data, month_keys)

	return {
		"period_label": f"{fy_from.strftime('%d %b %Y')} to {fy_to.strftime('%d %b %Y')}",
		"fiscal_year_label": f"{fy_from.year}-{str(fy_to.year)[2:]}",
		"from_date": str(fy_from),
		"to_date": str(fy_to),
		"months": months,
		"rows": data,
		"totals": totals,
		"sections": sections,
	}


def _calculate_totals(rows, month_keys):
	totals = {
		"month_values": {key: 0.0 for key in month_keys},
		"total_received": 0.0,
		"donation_amount": 0.0,
		"zakat_amount": 0.0,
		"endowment_funds_amount": 0.0,
		"budgeted_amount": 0.0,
		"balance_commitment": 0.0,
	}
	for row in rows:
		for key in month_keys:
			totals["month_values"][key] += flt((row.get("month_values") or {}).get(key))
		totals["total_received"] += flt(row.get("total_received"))
		totals["donation_amount"] += flt(row.get("donation_amount"))
		totals["zakat_amount"] += flt(row.get("zakat_amount"))
		totals["endowment_funds_amount"] += flt(row.get("endowment_funds_amount"))
		totals["budgeted_amount"] += flt(row.get("budgeted_amount"))
		totals["balance_commitment"] += flt(row.get("balance_commitment"))
	return totals


def _months_between(from_date, to_date):
	months = []
	y, m = from_date.year, from_date.month
	end = (to_date.year, to_date.month)
	while (y, m) <= end:
		months.append({"key": f"{y}-{m:02d}", "label": date(y, m, 1).strftime("%B")})
		m += 1
		if m > 12:
			m = 1
			y += 1
	return months


def _fiscal_months(fy_start_year):
	def month_meta(y, m):
		return {"key": f"{y}-{m:02d}", "label": date(y, m, 1).strftime("%B")}

	return [
		month_meta(fy_start_year, 7),
		month_meta(fy_start_year, 8),
		month_meta(fy_start_year, 9),
		month_meta(fy_start_year, 10),
		month_meta(fy_start_year, 11),
		month_meta(fy_start_year, 12),
		month_meta(fy_start_year + 1, 1),
		month_meta(fy_start_year + 1, 2),
		month_meta(fy_start_year + 1, 3),
		month_meta(fy_start_year + 1, 4),
		month_meta(fy_start_year + 1, 5),
		month_meta(fy_start_year + 1, 6),
	]


def _key(donor_name, donor_id):
	return f"{donor_name or 'Walk-in / Unknown'}::{donor_id or ''}"
