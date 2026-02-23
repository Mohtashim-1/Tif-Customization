# Copyright (c) 2026, mohtashim and contributors
# For license information, please see license.txt

import frappe


def execute(filters=None):
	filters = frappe._dict(filters or {})
	columns = get_columns()
	data = get_data(filters)
	return columns, data


def get_columns():
	return [
		{"label": "Posting Date", "fieldname": "posting_date", "fieldtype": "Date", "width": 110},
		{
			"label": "Sales Return Note",
			"fieldname": "delivery_note",
			"fieldtype": "Link",
			"options": "Delivery Note",
			"width": 170,
		},
		{
			"label": "Return Against",
			"fieldname": "return_against",
			"fieldtype": "Link",
			"options": "Delivery Note",
			"width": 170,
		},
		{"label": "Customer", "fieldname": "customer", "fieldtype": "Link", "options": "Customer", "width": 150},
		{"label": "Customer Name", "fieldname": "customer_name", "fieldtype": "Data", "width": 180},
		{"label": "Item", "fieldname": "item_code", "fieldtype": "Link", "options": "Item", "width": 130},
		{"label": "Item Name", "fieldname": "item_name", "fieldtype": "Data", "width": 180},
		{"label": "Warehouse", "fieldname": "warehouse", "fieldtype": "Link", "options": "Warehouse", "width": 160},
		{"label": "Returned Qty", "fieldname": "returned_qty", "fieldtype": "Float", "width": 120},
		{"label": "Rate", "fieldname": "rate", "fieldtype": "Currency", "width": 100},
		{"label": "Returned Amount", "fieldname": "returned_amount", "fieldtype": "Currency", "width": 140},
		{"label": "Company", "fieldname": "company", "fieldtype": "Link", "options": "Company", "width": 160},
	]


def get_data(filters):
	conditions = ["dn.docstatus = 1", "dn.is_return = 1"]
	values = {}

	if filters.get("from_date"):
		conditions.append("dn.posting_date >= %(from_date)s")
		values["from_date"] = filters.from_date

	if filters.get("to_date"):
		conditions.append("dn.posting_date <= %(to_date)s")
		values["to_date"] = filters.to_date

	if filters.get("company"):
		conditions.append("dn.company = %(company)s")
		values["company"] = filters.company

	if filters.get("customer"):
		conditions.append("dn.customer = %(customer)s")
		values["customer"] = filters.customer

	if filters.get("item_code"):
		conditions.append("dni.item_code = %(item_code)s")
		values["item_code"] = filters.item_code

	condition_sql = " and ".join(conditions)

	return frappe.db.sql(
		f"""
		select
			dn.posting_date,
			dn.name as delivery_note,
			dn.return_against,
			dn.customer,
			dn.customer_name,
			dni.item_code,
			dni.item_name,
			dni.warehouse,
			abs(dni.qty) as returned_qty,
			dni.rate,
			abs(dni.amount) as returned_amount,
			dn.company
		from `tabDelivery Note` dn
		inner join `tabDelivery Note Item` dni on dni.parent = dn.name
		where {condition_sql}
		order by dn.posting_date desc, dn.name desc, dni.idx asc
		""",
		values,
		as_dict=True,
	)
