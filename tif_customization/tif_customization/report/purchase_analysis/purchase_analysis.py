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
		{
			"label": "Vendor",
			"fieldname": "vendor",
			"fieldtype": "Link",
			"options": "Supplier",
			"width": 220,
		},
		{
			"label": "Item",
			"fieldname": "item",
			"fieldtype": "Link",
			"options": "Item",
			"width": 160,
		},
		{
			"label": "Item Description",
			"fieldname": "item_description",
			"fieldtype": "Data",
			"width": 300,
		},
		{
			"label": "Item Group",
			"fieldname": "item_group",
			"fieldtype": "Link",
			"options": "Item Group",
			"width": 180,
		},
		{
			"label": "Date of Purchase",
			"fieldname": "purchase_date",
			"fieldtype": "Date",
			"width": 120,
		},
		{
			"label": "Qty",
			"fieldname": "qty",
			"fieldtype": "Float",
			"width": 140,
		},
		{
			"label": "Purchase Price",
			"fieldname": "purchase_price",
			"fieldtype": "Currency",
			"width": 140,
		},
		{
			"label": "Status",
			"fieldname": "status",
			"fieldtype": "Data",
			"width": 140,
		},
	]


def get_data(filters):
	conditions = ["poi.parenttype = 'Purchase Order'"]
	values = {}

	if filters.get("from_date"):
		conditions.append("po.transaction_date >= %(from_date)s")
		values["from_date"] = filters.from_date
	if filters.get("to_date"):
		conditions.append("po.transaction_date <= %(to_date)s")
		values["to_date"] = filters.to_date

	if filters.get("supplier"):
		conditions.append("po.supplier = %(supplier)s")
		values["supplier"] = filters.supplier

	if filters.get("item"):
		conditions.append("poi.item_code = %(item)s")
		values["item"] = filters.item

	if filters.get("item_group"):
		conditions.append("i.item_group = %(item_group)s")
		values["item_group"] = filters.item_group

	if filters.get("status"):
		conditions.append("po.status = %(status)s")
		values["status"] = filters.status

	where_clause = " and ".join(conditions)

	return frappe.db.sql(
		f"""
		select
			po.supplier as vendor,
			poi.item_code as item,
			poi.description as item_description,
			i.item_group as item_group,
			po.transaction_date as purchase_date,
			poi.qty as qty,
			poi.rate as purchase_price,
			po.status as status
		from `tabPurchase Order` po
		inner join `tabPurchase Order Item` poi on poi.parent = po.name
		left join `tabItem` i on i.name = poi.item_code
		where {where_clause}
		order by po.transaction_date desc, po.name desc, poi.idx asc
		""",
		values,
		as_dict=True,
	)
