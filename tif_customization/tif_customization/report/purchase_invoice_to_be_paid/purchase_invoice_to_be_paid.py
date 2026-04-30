# Copyright (c) 2026, mohtashim and contributors
# For license information, please see license.txt

from frappe import _
import frappe
from frappe.utils import flt, getdate, nowdate


def execute(filters=None):
	filters = filters or {}
	columns = get_columns()
	data = get_data(filters)
	unpaid_count = len(data)
	total_outstanding = sum(flt(row.outstanding_amount) for row in data)

	report_summary = [
		{
			"value": unpaid_count,
			"label": _("Unpaid Purchase Invoices"),
			"indicator": "Red",
		},
		{
			"value": total_outstanding,
			"label": _("Total Outstanding Amount"),
			"datatype": "Currency",
			"indicator": "Orange",
		},
	]

	return columns, data, None, None, report_summary


def get_columns():
	return [
		{
			"label": _("Purchase Invoice"),
			"fieldname": "name",
			"fieldtype": "Link",
			"options": "Purchase Invoice",
			"width": 170,
		},
		{
			"label": _("Supplier"),
			"fieldname": "supplier",
			"fieldtype": "Link",
			"options": "Supplier",
			"width": 220,
		},
		{
			"label": _("Posting Date"),
			"fieldname": "posting_date",
			"fieldtype": "Date",
			"width": 110,
		},
		{
			"label": _("Purchase Order"),
			"fieldname": "purchase_order",
			"fieldtype": "Link",
			"options": "Purchase Order",
			"width": 170,
		},
		{
			"label": _("Due Date"),
			"fieldname": "due_date",
			"fieldtype": "Date",
			"width": 110,
		},
		{
			"label": _("Pending Days"),
			"fieldname": "pending_days",
			"fieldtype": "Int",
			"width": 120,
		},
		{
			"label": _("Grand Total"),
			"fieldname": "grand_total",
			"fieldtype": "Currency",
			"width": 130,
		},
		{
			"label": _("Outstanding Amount"),
			"fieldname": "outstanding_amount",
			"fieldtype": "Currency",
			"width": 160,
		},
		{
			"label": _("Status"),
			"fieldname": "status",
			"fieldtype": "Data",
			"width": 130,
		},
	]


def get_data(filters):
	conditions = ["docstatus = 1", "outstanding_amount > 0"]
	query_filters = {}

	if filters.get("company"):
		conditions.append("company = %(company)s")
		query_filters["company"] = filters.get("company")

	if filters.get("supplier"):
		conditions.append("supplier = %(supplier)s")
		query_filters["supplier"] = filters.get("supplier")

	if filters.get("purchase_order"):
		conditions.append("poi.purchase_order = %(purchase_order)s")
		query_filters["purchase_order"] = filters.get("purchase_order")

	if filters.get("from_date"):
		conditions.append("posting_date >= %(from_date)s")
		query_filters["from_date"] = filters.get("from_date")

	if filters.get("to_date"):
		conditions.append("posting_date <= %(to_date)s")
		query_filters["to_date"] = filters.get("to_date")

	query = f"""
		SELECT
			name,
			supplier,
			posting_date,
			poi.purchase_order,
			due_date,
			grand_total,
			outstanding_amount,
			status
		FROM `tabPurchase Invoice`
		LEFT JOIN (
			SELECT parent, MIN(purchase_order) AS purchase_order
			FROM `tabPurchase Invoice Item`
			WHERE IFNULL(purchase_order, '') != ''
			GROUP BY parent
		) poi ON poi.parent = `tabPurchase Invoice`.name
		WHERE {" AND ".join(conditions)}
		ORDER BY due_date ASC, posting_date ASC
	"""

	rows = frappe.db.sql(query, query_filters, as_dict=True)
	today = getdate(nowdate())
	min_pending_days = int(filters.get("min_pending_days") or 0)
	data = []

	for row in rows:
		base_date = getdate(row.due_date or row.posting_date)
		row.pending_days = max((today - base_date).days, 0)
		if row.pending_days < min_pending_days:
			continue
		data.append(row)

	return data
