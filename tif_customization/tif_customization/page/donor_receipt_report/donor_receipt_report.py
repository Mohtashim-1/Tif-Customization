import json
from datetime import date

import frappe
from frappe import _
from frappe.utils import cint, flt, get_url, getdate, nowdate
from frappe.utils.pdf import get_pdf
from frappe.www.printview import validate_print_permission


@frappe.whitelist()
def get_month_wise_summary(from_date=None, to_date=None, donor=None):
	from_date, to_date = _resolve_dates(from_date, to_date)
	donor_condition = " AND d.donor = %(donor)s" if donor else ""

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
		  {donor_condition}
		GROUP BY month_key, month_label
		ORDER BY month_key DESC
		""".format(donor_condition=donor_condition),
		{"from_date": str(from_date), "to_date": str(to_date), "donor": donor},
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
def get_month_donations(month_key, from_date=None, to_date=None, donor=None):
	if isinstance(month_key, str) and month_key.startswith("{"):
		payload = json.loads(month_key)
		month_key = payload.get("month_key")
		from_date = payload.get("from_date", from_date)
		to_date = payload.get("to_date", to_date)
		donor = payload.get("donor", donor)

	if not month_key:
		frappe.throw("Month is required")

	from_date, to_date = _resolve_dates(from_date, to_date)
	donor_condition = " AND d.donor = %(donor)s" if donor else ""

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
		  {donor_condition}
		ORDER BY d.donation_date DESC, d.name DESC
		""".format(donor_condition=donor_condition),
		{
			"month_key": month_key,
			"from_date": str(from_date),
			"to_date": str(to_date),
			"donor": donor,
		},
		as_dict=True,
	)


@frappe.whitelist()
def download_donation_receipt_pdf(name):
	doc = frappe.get_doc("Donation", name)
	validate_print_permission(doc)

	if doc.docstatus != 1:
		frappe.throw(_("Donation receipt is available only for submitted donations."))

	html = _render_simple_receipt_html(doc)
	pdf = get_pdf(
		html,
		{
			"load-error-handling": "ignore",
			"no-stop-slow-scripts": "",
			"quiet": "",
		},
	)

	frappe.local.response.filename = f"{doc.name}.pdf"
	frappe.local.response.filecontent = pdf
	frappe.local.response.type = "pdf"


def _render_simple_receipt_html(doc):
	amount = frappe.utils.fmt_money(doc.received_amount or 0, currency=doc.currency)
	donor = frappe.utils.escape_html(doc.donor_name_on_receipt or doc.donor_name or "—")
	date = frappe.utils.formatdate(doc.donation_date) if doc.donation_date else ""
	company = frappe.utils.escape_html(doc.company or frappe.defaults.get_global_default("company") or "")
	donation_type = frappe.utils.escape_html(doc.donation_type or "")
	payment_method = frappe.utils.escape_html(doc.payment_method or "")
	remarks = frappe.utils.escape_html(doc.remarks or "")
	student = frappe.utils.escape_html(doc.student or "")

	qr_html = ""
	try:
		from donation.donation.api import get_qr_svg_data

		verify_url = f"{get_url()}/donation-verify?name={doc.name}"
		qr_data = get_qr_svg_data(verify_url)
		if qr_data:
			qr_html = f'<img src="{qr_data}" width="120" height="120" alt="QR" />'
	except Exception:
		pass

	student_row = (
		f"<tr><td class='label'>Student</td><td>{student}</td></tr>" if student else ""
	)
	remarks_row = (
		f"<tr><td class='label'>Remarks</td><td>{remarks}</td></tr>" if remarks else ""
	)

	return f"""<!DOCTYPE html>
<html>
<head>
	<meta charset="utf-8">
	<style>
		body {{ font-family: Arial, sans-serif; font-size: 12px; color: #111827; margin: 0; }}
		.card {{ border: 1px solid #d1d5db; border-radius: 10px; padding: 22px; }}
		.top {{ display: table; width: 100%; }}
		.top-left, .top-right {{ display: table-cell; vertical-align: top; }}
		.top-right {{ text-align: right; width: 35%; }}
		.title {{ font-size: 22px; font-weight: 700; margin: 0 0 8px; }}
		.company {{ font-size: 14px; font-weight: 700; margin-bottom: 4px; }}
		.pill {{ display: inline-block; padding: 3px 10px; border-radius: 999px; background: #f3f4f6; margin-right: 6px; }}
		table {{ width: 100%; border-collapse: collapse; margin-top: 18px; }}
		td {{ padding: 8px 0; border-bottom: 1px solid #e5e7eb; }}
		.label {{ color: #6b7280; width: 32%; font-weight: 600; }}
		.amount {{ font-size: 20px; font-weight: 700; }}
		.footer {{ margin-top: 18px; display: table; width: 100%; }}
		.footer-left, .footer-right {{ display: table-cell; vertical-align: bottom; }}
		.footer-right {{ text-align: right; width: 140px; }}
		.small {{ font-size: 10px; color: #6b7280; }}
	</style>
</head>
<body>
	<div class="card">
		<div class="top">
			<div class="top-left">
				<h1 class="title">Donation Receipt</h1>
				<div class="company">{company}</div>
				<div style="margin-top:8px;">
					<span class="pill">{donation_type}</span>
				</div>
			</div>
			<div class="top-right">
				<div class="small">Receipt No</div>
				<div style="font-weight:700;">{frappe.utils.escape_html(doc.name)}</div>
				<div class="small" style="margin-top:8px;">Date</div>
				<div style="font-weight:700;">{date}</div>
			</div>
		</div>
		<table>
			<tr><td class="label">Donor</td><td>{donor}</td></tr>
			<tr><td class="label">Amount Received</td><td class="amount">{amount}</td></tr>
			<tr><td class="label">Payment Method</td><td>{payment_method}</td></tr>
			{student_row}
			{remarks_row}
		</table>
		<div class="footer">
			<div class="footer-left">
				<div class="small">This is a system-generated donation receipt.</div>
			</div>
			<div class="footer-right">{qr_html}</div>
		</div>
	</div>
</body>
</html>"""


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
