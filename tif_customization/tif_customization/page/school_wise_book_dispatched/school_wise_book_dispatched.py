# Copyright (c) 2026, TIF Customization and contributors
# License: MIT

import json

import frappe
from frappe.utils import add_days, flt, getdate, today

from tif_customization.tif_customization.utils.supply_chain_books import (
	sql_book_item_filter,
	with_book_item_params,
)


@frappe.whitelist()
def get_report_data(filters=None):
	filters = _parse_filters(filters)
	rows = _get_school_dispatch_rows(filters)
	return {"rows": rows, "summary": _build_summary(rows)}


def _parse_filters(filters):
	if isinstance(filters, str):
		filters = json.loads(filters or "{}")
	filters = filters or {}

	from_date = filters.get("from_date") or add_days(today(), -30)
	to_date = filters.get("to_date") or today()
	filters["from_date"] = getdate(from_date)
	filters["to_date"] = getdate(to_date)
	return filters


def _get_school_dispatch_rows(filters):
	where = [
		"dn.docstatus = 1",
		"IFNULL(dn.is_return, 0) = 0",
		"dn.posting_date BETWEEN %(from_date)s AND %(to_date)s",
		sql_book_item_filter("dni.item_code").lstrip("AND ").strip(),
	]
	params = with_book_item_params(
		{
			"from_date": filters["from_date"],
			"to_date": filters["to_date"],
		}
	)

	if filters.get("school") or filters.get("school_name") or filters.get("customer"):
		_apply_school_name_filter(where, params, filters, customer_field="dn.customer", customer_name_field="dn.customer_name")

	if filters.get("city"):
		where.append(
			"(COALESCE(s.city, addr.city, dn.custom_city, '') = %(city)s)"
		)
		params["city"] = filters["city"]

	if filters.get("province"):
		where.append(
			"(COALESCE(s.province, addr.state, '') = %(province)s)"
		)
		params["province"] = filters["province"]

	if filters.get("area"):
		where.append(
			"(COALESCE(s.area, addr.custom_area, dn.custom_area, '') = %(area)s)"
		)
		params["area"] = filters["area"]

	if filters.get("school_status"):
		where.append("s.status = %(school_status)s")
		params["school_status"] = filters["school_status"]

	book_type = (filters.get("book_type") or "").strip()
	if book_type == "MQH":
		where.append(
			"(UPPER(COALESCE(dni.item_name,'')) LIKE '%%MQH%%' OR UPPER(COALESCE(dni.item_code,'')) LIKE '%%MQH%%')"
		)
	elif book_type == "Qaida":
		where.append(
			"(UPPER(COALESCE(dni.item_name,'')) LIKE '%%QAIDA%%' OR UPPER(COALESCE(dni.item_code,'')) LIKE '%%QAIDA%%')"
		)
	elif book_type == "Guide":
		where.append(
			"(UPPER(COALESCE(dni.item_name,'')) LIKE '%%GUIDE%%' OR UPPER(COALESCE(dni.item_code,'')) LIKE '%%GUIDE%%')"
		)

	where_clause = " AND ".join(where)
	rows = frappe.db.sql(
		f"""
		SELECT
			COALESCE(s.name, '') AS school,
			COALESCE(NULLIF(s.school_name, ''), dn.customer_name, dn.customer) AS school_name,
			dn.customer AS customer,
			COALESCE(s.status, '') AS school_status,
			COALESCE(s.city, addr.city, dn.custom_city, '') AS city,
			COALESCE(s.province, addr.state, '') AS province,
			COALESCE(s.area, addr.custom_area, dn.custom_area, '') AS area,
			COUNT(DISTINCT dn.name) AS delivery_notes,
			SUM(COALESCE(dni.qty, 0)) AS total_qty,
			SUM(
				CASE
					WHEN UPPER(COALESCE(dni.item_name,'')) LIKE '%%MQH%%'
						OR UPPER(COALESCE(dni.item_code,'')) LIKE '%%MQH%%'
					THEN COALESCE(dni.qty, 0) ELSE 0
				END
			) AS mqh_qty,
			SUM(
				CASE
					WHEN UPPER(COALESCE(dni.item_name,'')) LIKE '%%QAIDA%%'
						OR UPPER(COALESCE(dni.item_code,'')) LIKE '%%QAIDA%%'
					THEN COALESCE(dni.qty, 0) ELSE 0
				END
			) AS qaida_qty,
			SUM(
				CASE
					WHEN UPPER(COALESCE(dni.item_name,'')) LIKE '%%GUIDE%%'
						OR UPPER(COALESCE(dni.item_code,'')) LIKE '%%GUIDE%%'
					THEN COALESCE(dni.qty, 0) ELSE 0
				END
			) AS guide_qty,
			MAX(dn.posting_date) AS last_dispatch_date
		FROM `tabDelivery Note` dn
		INNER JOIN `tabDelivery Note Item` dni ON dni.parent = dn.name
		LEFT JOIN `tabAddress` addr ON (
			addr.name = dn.shipping_address_name
			OR addr.name = dn.customer_address
		)
		LEFT JOIN `tabSchool` s ON (
			s.school_name = dn.customer_name
			OR s.name = dn.customer
		)
		WHERE {where_clause}
		GROUP BY
			COALESCE(s.name, ''),
			COALESCE(NULLIF(s.school_name, ''), dn.customer_name, dn.customer),
			dn.customer,
			COALESCE(s.status, ''),
			COALESCE(s.city, addr.city, dn.custom_city, ''),
			COALESCE(s.province, addr.state, ''),
			COALESCE(s.area, addr.custom_area, dn.custom_area, '')
		ORDER BY total_qty DESC, school_name ASC
		""",
		params,
		as_dict=True,
	)

	for row in rows:
		row["total_qty"] = flt(row.get("total_qty"))
		row["mqh_qty"] = flt(row.get("mqh_qty"))
		row["qaida_qty"] = flt(row.get("qaida_qty"))
		row["guide_qty"] = flt(row.get("guide_qty"))
		row["other_qty"] = max(
			0.0,
			flt(row["total_qty"] - row["mqh_qty"] - row["qaida_qty"] - row["guide_qty"]),
		)
		row["delivery_notes"] = int(row.get("delivery_notes") or 0)
		if row.get("last_dispatch_date"):
			row["last_dispatch_date"] = str(getdate(row["last_dispatch_date"]))

	return rows


def _build_summary(rows):
	return {
		"schools": len(rows),
		"total_qty": sum(flt(r.get("total_qty")) for r in rows),
		"mqh_qty": sum(flt(r.get("mqh_qty")) for r in rows),
		"qaida_qty": sum(flt(r.get("qaida_qty")) for r in rows),
		"guide_qty": sum(flt(r.get("guide_qty")) for r in rows),
		"delivery_notes": sum(int(r.get("delivery_notes") or 0) for r in rows),
	}


def _apply_school_name_filter(where, params, filters, customer_field, customer_name_field):
	"""Match School / Customer / free-text school name against DN/SO customer fields."""
	clauses = []
	school = (filters.get("school") or "").strip()
	customer = (filters.get("customer") or "").strip()
	school_name = (filters.get("school_name") or "").strip()

	if school:
		resolved = frappe.db.get_value("School", school, "school_name") or school
		params["school_id"] = school
		params["school_resolved"] = resolved
		params["school_resolved_like"] = f"%{resolved}%"
		clauses.append(
			f"""(
				{customer_field} = %(school_id)s
				OR {customer_name_field} = %(school_resolved)s
				OR {customer_field} = %(school_resolved)s
				OR {customer_name_field} LIKE %(school_resolved_like)s
				OR {customer_field} LIKE %(school_resolved_like)s
			)"""
		)

	if customer:
		cust_name = frappe.db.get_value("Customer", customer, "customer_name") or customer
		params["customer_id"] = customer
		params["customer_resolved"] = cust_name
		params["customer_resolved_like"] = f"%{cust_name}%"
		clauses.append(
			f"""(
				{customer_field} = %(customer_id)s
				OR {customer_name_field} = %(customer_resolved)s
				OR {customer_field} = %(customer_resolved)s
				OR {customer_name_field} LIKE %(customer_resolved_like)s
				OR {customer_field} LIKE %(customer_resolved_like)s
			)"""
		)

	if school_name:
		params["school_name_like"] = f"%{school_name}%"
		params["school_name_exact"] = school_name
		clauses.append(
			f"""(
				{customer_name_field} = %(school_name_exact)s
				OR {customer_field} = %(school_name_exact)s
				OR {customer_name_field} LIKE %(school_name_like)s
				OR {customer_field} LIKE %(school_name_like)s
			)"""
		)

	if clauses:
		# AND across different filter inputs; each input expands with OR internally
		where.extend(clauses)
