import json

import frappe
from frappe.utils import flt, getdate


ZAKAT_INCOME_ACCOUNTS = (
	"GENERAL - ZAKAT - TIF",
	"ZAKAT - EDUCATION PURPOSE - TIF",
	"ZAKAT - TEACHER TRAINING PURPOSE - TIF",
)


@frappe.whitelist()
def get_report_data(filters=None):
	filters = _parse_filters(filters)

	from_date = filters.get("from_date")
	to_date = filters.get("to_date")
	supplier = (filters.get("supplier") or "").strip()

	date_sql_gl, date_params_gl = _date_clause("gle.posting_date", from_date, to_date)
	date_sql_pe, date_params_pe = _date_clause("pe.posting_date", from_date, to_date)

	received_rows = _get_zakat_received(date_sql_gl, date_params_gl)
	purchase_rows = _get_zakat_purchases(date_sql_pe, date_params_pe, supplier)
	supplier_rows = _get_supplier_summary(purchase_rows)

	zakat_received = sum(flt(row.get("amount")) for row in received_rows)
	purchase_used = sum(flt(row.get("amount")) for row in purchase_rows)

	return {
		"filters": {
			"from_date": from_date or "",
			"to_date": to_date or "",
			"supplier": supplier,
		},
		"summary": {
			"zakat_received": zakat_received,
			"purchase_used": purchase_used,
			"remaining_amount": zakat_received - purchase_used,
			"purchase_count": len({row.get("payment_entry") for row in purchase_rows if row.get("payment_entry")}),
			"invoice_count": len({row.get("purchase_invoice") for row in purchase_rows if row.get("purchase_invoice")}),
			"supplier_count": len({row.get("supplier") for row in purchase_rows if row.get("supplier")}),
		},
		"received": received_rows,
		"purchases": purchase_rows,
		"supplier_summary": supplier_rows,
		"monthly": _get_monthly_summary(received_rows, purchase_rows),
	}


@frappe.whitelist()
def download_report_excel(filters=None):
	"""Multi-sheet Excel: Summary, Monthly, Suppliers, Purchases, Received."""
	from io import BytesIO

	from openpyxl import Workbook
	from openpyxl.styles import Font

	report = get_report_data(filters=filters)
	filters = report.get("filters") or {}
	summary = report.get("summary") or {}

	sheet_data = [
		(
			"Summary",
			[
				["Purchase from Zakat"],
				["From Date", filters.get("from_date") or "All time"],
				["To Date", filters.get("to_date") or "All time"],
				["Supplier", filters.get("supplier") or "All"],
				[],
				["Metric", "Value"],
				["Zakat Received", flt(summary.get("zakat_received"))],
				["Used for Purchases", flt(summary.get("purchase_used"))],
				["Remaining Zakat", flt(summary.get("remaining_amount"))],
				["Payments", summary.get("purchase_count") or 0],
				["Invoices", summary.get("invoice_count") or 0],
				["Suppliers", summary.get("supplier_count") or 0],
			],
		),
		(
			"Monthly",
			_sheet_rows(
				[
					("month", "Month"),
					("received", "Zakat Received"),
					("used", "Used for Purchase"),
					("balance", "Running Balance"),
				],
				report.get("monthly") or [],
			),
		),
		(
			"Suppliers",
			_sheet_rows(
				[
					("supplier", "Supplier"),
					("payment_count", "Payments"),
					("invoice_count", "Invoices"),
					("amount", "Amount"),
				],
				report.get("supplier_summary") or [],
			),
		),
		(
			"Purchases",
			_sheet_rows(
				[
					("posting_date", "Date"),
					("payment_entry", "Payment Entry"),
					("voucher_ref", "Voucher Ref"),
					("supplier", "Supplier"),
					("purchase_invoice", "Purchase Invoice"),
					("supplier_invoice_no", "Supplier Inv #"),
					("cost_center", "Cost Center"),
					("amount", "Zakat Used"),
					("remarks", "Remarks"),
				],
				report.get("purchases") or [],
			),
		),
		(
			"Received",
			_sheet_rows(
				[
					("posting_date", "Date"),
					("voucher_type", "Voucher Type"),
					("voucher_no", "Voucher"),
					("account", "Zakat Account"),
					("amount", "Received"),
					("remarks", "Remarks"),
				],
				report.get("received") or [],
			),
		),
	]

	wb = Workbook()
	wb.remove(wb.active)
	bold = Font(bold=True)
	for title, rows in sheet_data:
		ws = wb.create_sheet(title)
		for row_idx, row in enumerate(rows, start=1):
			ws.append([_excel_value(cell) for cell in row])
			if row_idx == 1:
				for cell in ws[row_idx]:
					cell.font = bold

	xlsx_file = BytesIO()
	wb.save(xlsx_file)

	frappe.response["filename"] = "purchase_from_zakat.xlsx"
	frappe.response["filecontent"] = xlsx_file.getvalue()
	frappe.response["type"] = "binary"


def _parse_filters(filters):
	if isinstance(filters, str):
		filters = json.loads(filters or "{}")
	return filters or {}


def _sheet_rows(columns, rows):
	header = [label for _key, label in columns]
	data = [header]
	for row in rows:
		data.append([_excel_value(row.get(key)) for key, _label in columns])
	if len(data) == 1:
		data.append([""] * len(columns))
	return data


def _excel_value(value):
	if value is None:
		return ""
	if hasattr(value, "isoformat"):
		try:
			return value.isoformat()
		except Exception:
			return str(value)
	return value


def _date_clause(field, from_date, to_date):
	if from_date and to_date:
		return f" AND {field} BETWEEN %s AND %s", [getdate(from_date), getdate(to_date)]
	if from_date:
		return f" AND {field} >= %s", [getdate(from_date)]
	if to_date:
		return f" AND {field} <= %s", [getdate(to_date)]
	return "", []


def _get_zakat_received(date_sql, date_params):
	return frappe.db.sql(
		f"""
		SELECT
			gle.posting_date,
			gle.voucher_type,
			gle.voucher_no,
			gle.account,
			gle.against,
			COALESCE(gle.credit, 0) - COALESCE(gle.debit, 0) AS amount,
			gle.remarks
		FROM `tabGL Entry` gle
		WHERE gle.is_cancelled = 0
		  AND gle.account IN %s
		  AND (COALESCE(gle.credit, 0) - COALESCE(gle.debit, 0)) > 0
		  {date_sql}
		ORDER BY gle.posting_date DESC, gle.voucher_no DESC
		""",
		tuple([ZAKAT_INCOME_ACCOUNTS] + date_params),
		as_dict=True,
	)


def _get_zakat_purchases(date_sql, date_params, supplier=None):
	supplier_sql = ""
	params = list(date_params)
	if supplier:
		supplier_sql = " AND pe.party = %s"
		params.append(supplier)

	# Any cost center / account / remark whose name contains "zakat"
	# (e.g. 2101 - Zakat - TIF, 1101 - Zakat CEE - TIF, 613 - Zakat Expense - TIF)
	zakat_cc = "LOWER(COALESCE({field}, '')) LIKE '%%zakat%%'"

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
			COALESCE(
				NULLIF(TRIM(pi.cost_center), ''),
				NULLIF(TRIM(pe.cost_center), ''),
				(
					SELECT pii.cost_center
					FROM `tabPurchase Invoice Item` pii
					WHERE pii.parent = pi.name
					  AND {zakat_cc.format(field="pii.cost_center")}
					ORDER BY pii.idx
					LIMIT 1
				)
			) AS cost_center,
			COALESCE(per.allocated_amount, pe.base_paid_amount, pe.paid_amount, 0) AS amount,
			pe.mode_of_payment,
			pe.reference_no AS voucher_ref,
			pe.reference_date AS voucher_ref_date,
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
			LOWER(COALESCE(pe.remarks, '')) LIKE '%%zakat%%'
			OR LOWER(COALESCE(pe.paid_from, '')) LIKE '%%zakat%%'
			OR {zakat_cc.format(field="pe.cost_center")}
			OR {zakat_cc.format(field="pi.cost_center")}
			OR EXISTS (
				SELECT 1
				FROM `tabPurchase Invoice Item` pii
				WHERE pii.parent = pi.name
				  AND {zakat_cc.format(field="pii.cost_center")}
			)
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
