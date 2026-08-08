# Copyright (c) 2026, TIF Customization and contributors
# License: MIT

import json

import frappe
from frappe.utils import flt, getdate

from tif_customization.tif_customization.utils.supply_chain_books import (
	sql_book_item_filter,
	with_book_item_params,
)
from tif_customization.tif_customization.page.school_wise_book_dispatched.school_wise_book_dispatched import (
	_apply_school_name_filter,
)


@frappe.whitelist()
def get_report_data(filters=None):
	filters = _parse_filters(filters)
	rows = _get_school_demand_rows(filters)
	return {"rows": rows, "summary": _build_summary(rows)}


def _parse_filters(filters):
	if isinstance(filters, str):
		filters = json.loads(filters or "{}")
	return filters or {}


def _get_school_demand_rows(filters):
	where = [
		"so.docstatus = 1",
		"so.status NOT IN ('Closed', 'Cancelled', 'Completed')",
		"IFNULL(so.per_delivered, 0) < 100",
		"(IFNULL(soi.qty, 0) - IFNULL(soi.delivered_qty, 0)) > 0",
		sql_book_item_filter("soi.item_code").lstrip("AND ").strip(),
	]
	params = with_book_item_params()

	if filters.get("from_date"):
		where.append("so.transaction_date >= %(from_date)s")
		params["from_date"] = getdate(filters["from_date"])
	if filters.get("to_date"):
		where.append("so.transaction_date <= %(to_date)s")
		params["to_date"] = getdate(filters["to_date"])

	if filters.get("school") or filters.get("school_name") or filters.get("customer"):
		_apply_school_name_filter(
			where,
			params,
			filters,
			customer_field="so.customer",
			customer_name_field="so.customer_name",
		)

	if filters.get("city"):
		where.append("(COALESCE(s.city, addr.city, '') = %(city)s)")
		params["city"] = filters["city"]

	if filters.get("province"):
		where.append(
			"(TRIM(COALESCE(s.province, addr.state, '')) = %(province)s)"
		)
		params["province"] = str(filters["province"]).strip()

	if filters.get("sales_order"):
		where.append("so.name = %(sales_order)s")
		params["sales_order"] = filters["sales_order"]

	if filters.get("area"):
		where.append("(COALESCE(s.area, addr.custom_area, '') = %(area)s)")
		params["area"] = filters["area"]

	if filters.get("school_status"):
		where.append("s.status = %(school_status)s")
		params["school_status"] = filters["school_status"]

	book_type = (filters.get("book_type") or "").strip()
	if book_type == "MQH":
		where.append(
			"(UPPER(COALESCE(soi.item_name,'')) LIKE '%%MQH%%' OR UPPER(COALESCE(soi.item_code,'')) LIKE '%%MQH%%')"
		)
	elif book_type == "Qaida":
		where.append(
			"(UPPER(COALESCE(soi.item_name,'')) LIKE '%%QAIDA%%' OR UPPER(COALESCE(soi.item_code,'')) LIKE '%%QAIDA%%')"
		)
	elif book_type == "Guide":
		where.append(
			"(UPPER(COALESCE(soi.item_name,'')) LIKE '%%GUIDE%%' OR UPPER(COALESCE(soi.item_code,'')) LIKE '%%GUIDE%%')"
		)
	elif book_type == "KPK Edition":
		where.append(_kpk_edition_sql())

	where_clause = " AND ".join(where)
	rows = frappe.db.sql(
		f"""
		SELECT
			COALESCE(s.name, '') AS school,
			COALESCE(NULLIF(s.school_name, ''), so.customer_name, so.customer) AS school_name,
			so.customer AS customer,
			COALESCE(s.status, '') AS school_status,
			COALESCE(s.school_type, '') AS school_type,
			COALESCE(s.city, addr.city, '') AS city,
			TRIM(COALESCE(s.province, addr.state, '')) AS province,
			COALESCE(s.area, addr.custom_area, '') AS area,
			COUNT(DISTINCT so.name) AS sales_orders,
			GROUP_CONCAT(DISTINCT so.name ORDER BY so.transaction_date DESC, so.name SEPARATOR ', ') AS sales_order_nos,
			SUM(IFNULL(soi.qty, 0) - IFNULL(soi.delivered_qty, 0)) AS total_pending,
			SUM(IFNULL(soi.qty, 0)) AS total_ordered,
			SUM(IFNULL(soi.delivered_qty, 0)) AS total_delivered,
			SUM(
				CASE
					WHEN UPPER(COALESCE(soi.item_name,'')) LIKE '%%MQH%%'
						OR UPPER(COALESCE(soi.item_code,'')) LIKE '%%MQH%%'
					THEN IFNULL(soi.qty, 0) - IFNULL(soi.delivered_qty, 0) ELSE 0
				END
			) AS mqh_pending,
			SUM(
				CASE
					WHEN UPPER(COALESCE(soi.item_name,'')) LIKE '%%QAIDA%%'
						OR UPPER(COALESCE(soi.item_code,'')) LIKE '%%QAIDA%%'
					THEN IFNULL(soi.qty, 0) - IFNULL(soi.delivered_qty, 0) ELSE 0
				END
			) AS qaida_pending,
			SUM(
				CASE
					WHEN UPPER(COALESCE(soi.item_name,'')) LIKE '%%GUIDE%%'
						OR UPPER(COALESCE(soi.item_code,'')) LIKE '%%GUIDE%%'
					THEN IFNULL(soi.qty, 0) - IFNULL(soi.delivered_qty, 0) ELSE 0
				END
			) AS guide_pending,
			SUM(
				CASE
					WHEN {_kpk_edition_case()}
					THEN IFNULL(soi.qty, 0) - IFNULL(soi.delivered_qty, 0) ELSE 0
				END
			) AS kpk_pending,
			MAX(so.transaction_date) AS last_order_date,
			MIN(so.delivery_date) AS earliest_delivery_date
		FROM `tabSales Order` so
		INNER JOIN `tabSales Order Item` soi ON soi.parent = so.name
		LEFT JOIN `tabAddress` addr ON addr.name = so.customer_address
		LEFT JOIN `tabSchool` s ON (
			s.school_name = so.customer_name
			OR s.name = so.customer
		)
		WHERE {where_clause}
		GROUP BY
			COALESCE(s.name, ''),
			COALESCE(NULLIF(s.school_name, ''), so.customer_name, so.customer),
			so.customer,
			COALESCE(s.status, ''),
			COALESCE(s.school_type, ''),
			COALESCE(s.city, addr.city, ''),
			TRIM(COALESCE(s.province, addr.state, '')),
			COALESCE(s.area, addr.custom_area, '')
		ORDER BY total_pending DESC, school_name ASC
		""",
		params,
		as_dict=True,
	)

	for row in rows:
		for key in (
			"total_pending",
			"total_ordered",
			"total_delivered",
			"mqh_pending",
			"qaida_pending",
			"guide_pending",
			"kpk_pending",
		):
			row[key] = flt(row.get(key))
		row["other_pending"] = max(
			0.0,
			flt(
				row["total_pending"]
				- row["mqh_pending"]
				- row["qaida_pending"]
				- row["guide_pending"]
				- row["kpk_pending"]
			),
		)
		row["sales_orders"] = int(row.get("sales_orders") or 0)
		row["sales_order_nos"] = (row.get("sales_order_nos") or "").strip()
		row["province"] = (row.get("province") or "").strip()
		if row.get("last_order_date"):
			row["last_order_date"] = str(getdate(row["last_order_date"]))
		if row.get("earliest_delivery_date"):
			row["earliest_delivery_date"] = str(getdate(row["earliest_delivery_date"]))

	return rows


def _kpk_edition_sql():
	"""Match KPK Edition / KPK Textbook Board book lines."""
	return (
		"(UPPER(COALESCE(soi.item_name,'')) LIKE '%%KPK%%' "
		"OR UPPER(COALESCE(soi.item_code,'')) LIKE '%%KPK%%')"
	)


def _kpk_edition_case():
	return (
		"UPPER(COALESCE(soi.item_name,'')) LIKE '%%KPK%%' "
		"OR UPPER(COALESCE(soi.item_code,'')) LIKE '%%KPK%%'"
	)


PROVINCE_OPTIONS = (
	"Sindh",
	"Punjab",
	"KPK",
	"Balochistan",
	"ICT",
	"AJK",
	"Gilgit Baltistan",
)


@frappe.whitelist()
def get_filter_options():
	"""Province list for filter (always includes KPK + values seen on open demand)."""
	seen = set(
		frappe.db.sql(
			"""
			SELECT DISTINCT TRIM(COALESCE(s.province, addr.state, '')) AS province
			FROM `tabSales Order` so
			LEFT JOIN `tabAddress` addr ON addr.name = so.customer_address
			LEFT JOIN `tabSchool` s ON (
				s.school_name = so.customer_name
				OR s.name = so.customer
			)
			WHERE so.docstatus = 1
			  AND so.status NOT IN ('Closed', 'Cancelled', 'Completed')
			  AND IFNULL(so.per_delivered, 0) < 100
			  AND TRIM(COALESCE(s.province, addr.state, '')) != ''
			"""
		)
	)
	provinces = []
	for p in PROVINCE_OPTIONS:
		provinces.append(p)
	for p in sorted(v[0] for v in seen if v and v[0]):
		if p not in provinces:
			provinces.append(p)
	return {"provinces": provinces}


def _build_summary(rows):
	return {
		"schools": len(rows),
		"sales_orders": sum(int(r.get("sales_orders") or 0) for r in rows),
		"total_pending": sum(flt(r.get("total_pending")) for r in rows),
		"mqh_pending": sum(flt(r.get("mqh_pending")) for r in rows),
		"qaida_pending": sum(flt(r.get("qaida_pending")) for r in rows),
		"guide_pending": sum(flt(r.get("guide_pending")) for r in rows),
		"kpk_pending": sum(flt(r.get("kpk_pending")) for r in rows),
		"total_ordered": sum(flt(r.get("total_ordered")) for r in rows),
		"total_delivered": sum(flt(r.get("total_delivered")) for r in rows),
	}
