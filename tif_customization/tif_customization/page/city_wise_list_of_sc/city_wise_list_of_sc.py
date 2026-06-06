import json

import frappe
from frappe import _


@frappe.whitelist()
def get_city_wise_schools(filters=None):
	return get_city_wise_customers(filters)


@frappe.whitelist()
def get_city_wise_customers(filters=None):
	if isinstance(filters, str):
		filters = json.loads(filters)
	filters = frappe._dict(filters or {})

	conditions = ["1 = 1"]
	values = {}

	if filters.get("city"):
		conditions.append("TRIM(addr.city) = TRIM(%(city)s)")
		values["city"] = filters.city

	if filters.get("customer"):
		conditions.append("c.name = %(customer)s")
		values["customer"] = filters.customer

	if filters.get("customer_group"):
		conditions.append("c.customer_group = %(customer_group)s")
		values["customer_group"] = filters.customer_group

	if filters.get("territory"):
		conditions.append("c.territory = %(territory)s")
		values["territory"] = filters.territory

	where_clause = " AND ".join(conditions)
	rows = frappe.db.sql(
		f"""
		SELECT
			c.name AS customer,
			c.customer_name,
			c.customer_group,
			c.territory,
			c.customer_type,
			c.mobile_no,
			c.email_id,
			GROUP_CONCAT(DISTINCT TRIM(addr.city) ORDER BY TRIM(addr.city) SEPARATOR ', ') AS city,
			GROUP_CONCAT(DISTINCT addr.name ORDER BY addr.is_primary_address DESC, addr.is_shipping_address DESC, addr.name SEPARATOR ', ') AS address
		FROM `tabCustomer` c
		LEFT JOIN `tabDynamic Link` dl
			ON dl.link_doctype = 'Customer'
			AND dl.link_name = c.name
			AND dl.parenttype = 'Address'
		LEFT JOIN `tabAddress` addr
			ON addr.name = dl.parent
			AND IFNULL(addr.disabled, 0) = 0
		WHERE {where_clause}
		GROUP BY
			c.name,
			c.customer_name,
			c.customer_group,
			c.territory,
			c.customer_type,
			c.mobile_no,
			c.email_id
		ORDER BY IFNULL(city, ''), c.customer_name
		""",
		values,
		as_dict=True,
	)

	return {
		"summary": get_summary(rows),
		"rows": rows,
	}


def get_summary(rows):
	cities = set()
	for row in rows:
		for city in (row.get("city") or "").split(","):
			if city.strip():
				cities.add(city.strip())

	customer_groups = {row.get("customer_group") for row in rows if row.get("customer_group")}

	return {
		"total_customers": len(rows),
		"total_cities": len(cities),
		"customer_groups": len(customer_groups),
		"without_city": len([row for row in rows if not row.get("city")]),
	}


def execute(filters=None):
	data = get_city_wise_customers(filters)
	return get_columns(), data.get("rows", [])


def get_columns():
	return [
		{"label": _("City"), "fieldname": "city", "fieldtype": "Data", "width": 160},
		{"label": _("Customer"), "fieldname": "customer", "fieldtype": "Link", "options": "Customer", "width": 170},
		{"label": _("Customer Name"), "fieldname": "customer_name", "fieldtype": "Data", "width": 220},
		{
			"label": _("Customer Club"),
			"fieldname": "customer_group",
			"fieldtype": "Link",
			"options": "Customer Group",
			"width": 160,
		},
		{"label": _("Territory"), "fieldname": "territory", "fieldtype": "Link", "options": "Territory", "width": 140},
		{"label": _("Customer Type"), "fieldname": "customer_type", "fieldtype": "Data", "width": 130},
		{"label": _("Mobile No"), "fieldname": "mobile_no", "fieldtype": "Data", "width": 130},
		{"label": _("Email"), "fieldname": "email_id", "fieldtype": "Data", "width": 180},
		{"label": _("Address"), "fieldname": "address", "fieldtype": "Data", "width": 220},
	]
