import json

import frappe
from frappe.utils import cint, flt, getdate

MILLAT_SUPPLIER = "Millat Printers & Publishers Peshawar"
MILLAT_WAREHOUSE = "Millat Warehouse - TIF"


@frappe.whitelist()
def get_dashboard_data(filters=None):
	if isinstance(filters, str):
		filters = json.loads(filters or "{}")
	filters = filters or {}

	supplier = (filters.get("supplier") or MILLAT_SUPPLIER).strip()
	from_date = filters.get("from_date")
	to_date = filters.get("to_date")

	date_sql_po, date_params_po = _date_clause("po.transaction_date", from_date, to_date)
	date_sql_pr, date_params_pr = _date_clause("pr.posting_date", from_date, to_date)
	date_sql_pi, date_params_pi = _date_clause("pi.posting_date", from_date, to_date)
	date_sql_pe, date_params_pe = _date_clause("pe.posting_date", from_date, to_date)
	warehouse = (filters.get("warehouse") or "").strip()

	summary = _get_summary(
		supplier, date_sql_po, date_params_po, date_sql_pr, date_params_pr, date_sql_pi, date_params_pi
	)
	summary["paid_amount"] = _get_paid_amount(supplier, date_sql_pe, date_params_pe)
	summary["outstanding_amount"] = flt(summary.get("pi_outstanding"))
	summary["unbilled_ordered_amount"] = max(
		0.0, flt(summary.get("ordered_amount")) - flt(summary.get("invoiced_amount"))
	)
	summary["pending_receive_qty"] = max(
		0.0, flt(summary.get("ordered_qty")) - flt(summary.get("received_qty"))
	)
	summary["pending_receive_amount"] = max(
		0.0, flt(summary.get("ordered_amount")) - flt(summary.get("received_amount"))
	)

	delivery_notes = []
	if warehouse:
		date_sql_dn, date_params_dn = _date_clause("dn.posting_date", from_date, to_date)
		summary.update(_get_delivery_note_summary(warehouse, date_sql_dn, date_params_dn))
		delivery_notes = _get_delivery_notes(warehouse, date_sql_dn, date_params_dn)

	return {
		"supplier": supplier,
		"warehouse": warehouse,
		"filters": {"from_date": from_date or "", "to_date": to_date or ""},
		"summary": summary,
		"monthly_trend": _get_monthly_trend(
			supplier, date_sql_po, date_params_po, date_sql_pr, date_params_pr, date_sql_pe, date_params_pe
		),
		"fulfillment": {
			"labels": ["Received", "Pending Receive"],
			"values": [
				flt(summary.get("received_qty")),
				flt(summary.get("pending_receive_qty")),
			],
		},
		"payment_status": {
			"labels": ["Paid", "Outstanding"],
			"values": [
				max(0.0, flt(summary.get("paid_amount"))),
				max(0.0, flt(summary.get("outstanding_amount"))),
			],
		},
		"items": _get_item_wise(supplier, date_sql_po, date_params_po),
		"purchase_orders": _get_purchase_orders(supplier, date_sql_po, date_params_po),
		"purchase_receipts": _get_purchase_receipts(supplier, date_sql_pr, date_params_pr),
		"purchase_invoices": _get_purchase_invoices(supplier, date_sql_pi, date_params_pi),
		"payments": _get_payments(supplier, date_sql_pe, date_params_pe),
		"delivery_notes": delivery_notes,
	}


def _date_clause(field, from_date, to_date):
	if from_date and to_date:
		return f" AND {field} BETWEEN %s AND %s", [getdate(from_date), getdate(to_date)]
	if from_date:
		return f" AND {field} >= %s", [getdate(from_date)]
	if to_date:
		return f" AND {field} <= %s", [getdate(to_date)]
	return "", []


def _get_summary(supplier, date_sql_po, date_params_po, date_sql_pr, date_params_pr, date_sql_pi, date_params_pi):
	po = frappe.db.sql(
		f"""
		SELECT
			COUNT(DISTINCT po.name) AS po_count,
			COALESCE(SUM(poi.qty), 0) AS ordered_qty,
			COALESCE(SUM(poi.received_qty), 0) AS received_on_po_qty,
			COALESCE(SUM(poi.base_amount), 0) AS ordered_amount
		FROM `tabPurchase Order` po
		INNER JOIN `tabPurchase Order Item` poi ON poi.parent = po.name
		WHERE po.docstatus = 1 AND po.supplier = %s {date_sql_po}
		""",
		tuple([supplier] + date_params_po),
		as_dict=True,
	)
	pr = frappe.db.sql(
		f"""
		SELECT
			COUNT(DISTINCT pr.name) AS pr_count,
			COALESCE(SUM(pri.qty), 0) AS received_qty,
			COALESCE(SUM(pri.base_amount), 0) AS received_amount
		FROM `tabPurchase Receipt` pr
		INNER JOIN `tabPurchase Receipt Item` pri ON pri.parent = pr.name
		WHERE pr.docstatus = 1 AND pr.supplier = %s {date_sql_pr}
		""",
		tuple([supplier] + date_params_pr),
		as_dict=True,
	)
	pi = frappe.db.sql(
		f"""
		SELECT
			COUNT(DISTINCT pi.name) AS pi_count,
			COALESCE(SUM(pi.grand_total), 0) AS invoiced_amount,
			COALESCE(SUM(pi.outstanding_amount), 0) AS pi_outstanding
		FROM `tabPurchase Invoice` pi
		WHERE pi.docstatus = 1 AND pi.supplier = %s {date_sql_pi}
		""",
		tuple([supplier] + date_params_pi),
		as_dict=True,
	)

	po_row = (po or [{}])[0]
	pr_row = (pr or [{}])[0]
	pi_row = (pi or [{}])[0]

	return {
		"po_count": cint(po_row.get("po_count")),
		"ordered_qty": flt(po_row.get("ordered_qty")),
		"ordered_amount": flt(po_row.get("ordered_amount")),
		"received_on_po_qty": flt(po_row.get("received_on_po_qty")),
		"pr_count": cint(pr_row.get("pr_count")),
		"received_qty": flt(pr_row.get("received_qty")),
		"received_amount": flt(pr_row.get("received_amount")),
		"pi_count": cint(pi_row.get("pi_count")),
		"invoiced_amount": flt(pi_row.get("invoiced_amount")),
		"pi_outstanding": flt(pi_row.get("pi_outstanding")),
	}


def _get_paid_amount(supplier, date_sql_pe, date_params_pe):
	row = frappe.db.sql(
		f"""
		SELECT COALESCE(SUM(per.allocated_amount), 0) AS paid_amount
		FROM `tabPayment Entry` pe
		INNER JOIN `tabPayment Entry Reference` per ON per.parent = pe.name
		INNER JOIN `tabPurchase Invoice` pi ON pi.name = per.reference_name
		WHERE pe.docstatus = 1
		  AND pe.payment_type = 'Pay'
		  AND per.reference_doctype = 'Purchase Invoice'
		  AND pi.supplier = %s {date_sql_pe}
		""",
		tuple([supplier] + date_params_pe),
		as_dict=True,
	)
	return flt((row or [{}])[0].get("paid_amount"))


def _get_monthly_trend(supplier, date_sql_po, date_params_po, date_sql_pr, date_params_pr, date_sql_pe, date_params_pe):
	ordered = frappe.db.sql(
		f"""
		SELECT DATE_FORMAT(po.transaction_date, '%%Y-%%m') AS period,
			COALESCE(SUM(po.grand_total), 0) AS amount
		FROM `tabPurchase Order` po
		WHERE po.docstatus = 1 AND po.supplier = %s {date_sql_po}
		GROUP BY period ORDER BY period
		""",
		tuple([supplier] + date_params_po),
		as_dict=True,
	)
	received = frappe.db.sql(
		f"""
		SELECT DATE_FORMAT(pr.posting_date, '%%Y-%%m') AS period,
			COALESCE(SUM(pr.grand_total), 0) AS amount
		FROM `tabPurchase Receipt` pr
		WHERE pr.docstatus = 1 AND pr.supplier = %s {date_sql_pr}
		GROUP BY period ORDER BY period
		""",
		tuple([supplier] + date_params_pr),
		as_dict=True,
	)
	paid = frappe.db.sql(
		f"""
		SELECT DATE_FORMAT(pe.posting_date, '%%Y-%%m') AS period,
			COALESCE(SUM(per.allocated_amount), 0) AS amount
		FROM `tabPayment Entry` pe
		INNER JOIN `tabPayment Entry Reference` per ON per.parent = pe.name
		INNER JOIN `tabPurchase Invoice` pi ON pi.name = per.reference_name
		WHERE pe.docstatus = 1 AND pe.payment_type = 'Pay'
		  AND per.reference_doctype = 'Purchase Invoice'
		  AND pi.supplier = %s {date_sql_pe}
		GROUP BY period ORDER BY period
		""",
		tuple([supplier] + date_params_pe),
		as_dict=True,
	)

	periods = sorted(
		{r.get("period") for r in (ordered or []) + (received or []) + (paid or []) if r.get("period")}
	)
	ordered_map = {r["period"]: flt(r["amount"]) for r in ordered or []}
	received_map = {r["period"]: flt(r["amount"]) for r in received or []}
	paid_map = {r["period"]: flt(r["amount"]) for r in paid or []}

	return {
		"labels": periods,
		"ordered": [ordered_map.get(p, 0) for p in periods],
		"received": [received_map.get(p, 0) for p in periods],
		"paid": [paid_map.get(p, 0) for p in periods],
	}


def _get_item_wise(supplier, date_sql_po, date_params_po):
	return frappe.db.sql(
		f"""
		SELECT
			poi.item_code,
			MAX(poi.item_name) AS item_name,
			COALESCE(SUM(poi.qty), 0) AS ordered_qty,
			COALESCE(SUM(poi.received_qty), 0) AS received_qty,
			COALESCE(SUM(poi.base_amount), 0) AS ordered_amount,
			COALESCE(SUM(poi.qty) - SUM(poi.received_qty), 0) AS pending_qty
		FROM `tabPurchase Order` po
		INNER JOIN `tabPurchase Order Item` poi ON poi.parent = po.name
		WHERE po.docstatus = 1 AND po.supplier = %s {date_sql_po}
		GROUP BY poi.item_code
		ORDER BY ordered_qty DESC
		LIMIT 50
		""",
		tuple([supplier] + date_params_po),
		as_dict=True,
	)


def _get_purchase_orders(supplier, date_sql_po, date_params_po):
	return frappe.db.sql(
		f"""
		SELECT
			po.name,
			po.transaction_date,
			po.status,
			po.grand_total,
			COALESCE(SUM(poi.qty), 0) AS ordered_qty,
			COALESCE(SUM(poi.received_qty), 0) AS received_qty,
			COALESCE(SUM(poi.qty) - SUM(poi.received_qty), 0) AS pending_qty
		FROM `tabPurchase Order` po
		INNER JOIN `tabPurchase Order Item` poi ON poi.parent = po.name
		WHERE po.docstatus = 1 AND po.supplier = %s {date_sql_po}
		GROUP BY po.name, po.transaction_date, po.status, po.grand_total
		ORDER BY po.transaction_date DESC, po.name DESC
		LIMIT 100
		""",
		tuple([supplier] + date_params_po),
		as_dict=True,
	)


def _get_purchase_receipts(supplier, date_sql_pr, date_params_pr):
	return frappe.db.sql(
		f"""
		SELECT
			pr.name,
			pr.posting_date,
			pr.grand_total,
			COALESCE(SUM(pri.qty), 0) AS received_qty
		FROM `tabPurchase Receipt` pr
		INNER JOIN `tabPurchase Receipt Item` pri ON pri.parent = pr.name
		WHERE pr.docstatus = 1 AND pr.supplier = %s {date_sql_pr}
		GROUP BY pr.name, pr.posting_date, pr.grand_total
		ORDER BY pr.posting_date DESC, pr.name DESC
		LIMIT 100
		""",
		tuple([supplier] + date_params_pr),
		as_dict=True,
	)


def _get_purchase_invoices(supplier, date_sql_pi, date_params_pi):
	return frappe.db.sql(
		f"""
		SELECT
			pi.name,
			pi.posting_date,
			pi.grand_total,
			pi.outstanding_amount,
			pi.status
		FROM `tabPurchase Invoice` pi
		WHERE pi.docstatus = 1 AND pi.supplier = %s {date_sql_pi}
		ORDER BY pi.posting_date DESC, pi.name DESC
		LIMIT 100
		""",
		tuple([supplier] + date_params_pi),
		as_dict=True,
	)


def _get_payments(supplier, date_sql_pe, date_params_pe):
	return frappe.db.sql(
		f"""
		SELECT
			pe.name AS payment_entry,
			pe.posting_date,
			pe.mode_of_payment,
			per.reference_name AS purchase_invoice,
			per.allocated_amount AS amount
		FROM `tabPayment Entry` pe
		INNER JOIN `tabPayment Entry Reference` per ON per.parent = pe.name
		INNER JOIN `tabPurchase Invoice` pi ON pi.name = per.reference_name
		WHERE pe.docstatus = 1
		  AND pe.payment_type = 'Pay'
		  AND per.reference_doctype = 'Purchase Invoice'
		  AND pi.supplier = %s {date_sql_pe}
		ORDER BY pe.posting_date DESC, pe.name DESC
		LIMIT 100
		""",
		tuple([supplier] + date_params_pe),
		as_dict=True,
	)


def _get_delivery_note_summary(warehouse, date_sql_dn, date_params_dn):
	row = frappe.db.sql(
		f"""
		SELECT
			COUNT(DISTINCT dn.name) AS dn_count,
			COALESCE(SUM(dni.qty), 0) AS delivered_qty,
			COALESCE(SUM(dni.base_amount), 0) AS delivered_amount
		FROM `tabDelivery Note` dn
		INNER JOIN `tabDelivery Note Item` dni ON dni.parent = dn.name
		WHERE dn.docstatus = 1
		  AND (dn.set_warehouse = %s OR dni.warehouse = %s) {date_sql_dn}
		""",
		tuple([warehouse, warehouse] + date_params_dn),
		as_dict=True,
	)
	data = (row or [{}])[0]
	return {
		"dn_count": cint(data.get("dn_count")),
		"delivered_qty": flt(data.get("delivered_qty")),
		"delivered_amount": flt(data.get("delivered_amount")),
	}


def _get_delivery_notes(warehouse, date_sql_dn, date_params_dn):
	return frappe.db.sql(
		f"""
		SELECT
			dn.name,
			dn.posting_date,
			dn.customer,
			dn.status,
			dn.grand_total,
			COALESCE(SUM(dni.qty), 0) AS delivered_qty,
			MAX(COALESCE(dni.warehouse, dn.set_warehouse)) AS warehouse
		FROM `tabDelivery Note` dn
		INNER JOIN `tabDelivery Note Item` dni ON dni.parent = dn.name
		WHERE dn.docstatus = 1
		  AND (dn.set_warehouse = %s OR dni.warehouse = %s) {date_sql_dn}
		GROUP BY dn.name, dn.posting_date, dn.customer, dn.status, dn.grand_total
		ORDER BY dn.posting_date DESC, dn.name DESC
		LIMIT 100
		""",
		tuple([warehouse, warehouse] + date_params_dn),
		as_dict=True,
	)
