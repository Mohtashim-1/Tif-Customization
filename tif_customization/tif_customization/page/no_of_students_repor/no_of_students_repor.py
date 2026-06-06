import json

import frappe


@frappe.whitelist()
def get_no_of_students_report(filters=None):
	if isinstance(filters, str):
		filters = json.loads(filters)
	filters = frappe._dict(filters or {})

	conditions = ["1 = 1"]
	values = {}

	if filters.get("customer"):
		conditions.append("c.name = %(customer)s")
		values["customer"] = filters.customer

	if filters.get("customer_group"):
		conditions.append("c.customer_group = %(customer_group)s")
		values["customer_group"] = filters.customer_group

	if filters.get("territory"):
		conditions.append("c.territory = %(territory)s")
		values["territory"] = filters.territory

	if filters.get("city"):
		conditions.append("TRIM(addr.city) = TRIM(%(city)s)")
		values["city"] = filters.city

	if filters.get("no_of_students"):
		conditions.append("c.custom_no_of_students = %(no_of_students)s")
		values["no_of_students"] = filters.no_of_students

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
			c.custom_no_of_students AS no_of_students,
			GROUP_CONCAT(DISTINCT TRIM(addr.city) ORDER BY TRIM(addr.city) SEPARATOR ', ') AS city
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
			c.email_id,
			c.custom_no_of_students
		ORDER BY c.customer_name
		""",
		values,
		as_dict=True,
	)

	for row in rows:
		row.no_of_students = row.no_of_students or ""

	return {
		"summary": get_summary(rows),
		"rows": rows,
	}


def get_summary(rows):
	customers_with_students = len([row for row in rows if row.get("no_of_students")])
	student_ranges = {row.get("no_of_students") for row in rows if row.get("no_of_students")}

	return {
		"total_customers": len(rows),
		"customers_with_students": customers_with_students,
		"student_ranges": len(student_ranges),
		"without_students": len(rows) - customers_with_students,
	}
