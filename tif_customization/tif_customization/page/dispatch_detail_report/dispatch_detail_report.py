import json

import frappe
from frappe import _
from frappe.utils import add_days, flt, getdate, today


@frappe.whitelist()
def get_dispatch_detail_data(filters=None):
	"""Dispatch detail from Delivery Notes: customer, address, warehouse, books, courier & customer amounts."""
	try:
		if isinstance(filters, str):
			filters = json.loads(filters)
		filters = filters or {}

		from_date = getdate(filters.get("from_date") or add_days(today(), -30))
		to_date = getdate(filters.get("to_date") or today())

		params = {"from_date": from_date, "to_date": to_date}
		where = [
			"dn.docstatus = 1",
			"IFNULL(dn.is_return, 0) = 0",
			"dn.posting_date BETWEEN %(from_date)s AND %(to_date)s",
		]

		if filters.get("customer"):
			where.append("dn.customer = %(customer)s")
			params["customer"] = filters["customer"]

		if filters.get("delivery_mode"):
			where.append("dn.custom_delivery_mode = %(delivery_mode)s")
			params["delivery_mode"] = filters["delivery_mode"]

		if filters.get("courier"):
			where.append("dn.custom_courier = %(courier)s")
			params["courier"] = filters["courier"]

		if filters.get("warehouse"):
			where.append(
				"""EXISTS (
					SELECT 1 FROM `tabDelivery Note Item` dni_w
					WHERE dni_w.parent = dn.name AND dni_w.warehouse = %(warehouse)s
				)"""
			)
			params["warehouse"] = filters["warehouse"]

		if filters.get("city"):
			where.append("(addr.city = %(city)s OR dn.custom_city = %(city)s)")
			params["city"] = filters["city"]

		where_clause = " AND ".join(where)

		rows = frappe.db.sql(
			f"""
			SELECT
				dn.name AS delivery_note_no,
				dn.posting_date,
				dn.customer,
				dn.customer_name,
				dn.shipping_address_name,
				dn.shipping_address,
				dn.custom_delivery_mode,
				dn.custom_courier,
				dn.custom_courier_service,
				dn.custom_delivery_rate,
				dn.custom_courier_mode_of_payment,
				dn.custom_city,
				COALESCE(addr.custom_area, dn.custom_area, '') AS area,
				COALESCE(addr.city, dn.custom_city, '') AS city,
				COALESCE(addr.state, '') AS province,
				COALESCE(addr.country, '') AS country,
				TRIM(BOTH ', ' FROM CONCAT_WS(', ',
					NULLIF(addr.address_line1, ''),
					NULLIF(addr.address_line2, ''),
					NULLIF(COALESCE(addr.city, dn.custom_city), ''),
					NULLIF(addr.state, ''),
					NULLIF(addr.custom_area, ''),
					NULLIF(addr.country, '')
				)) AS shipping_address_text,
				dn.grand_total,
				dn.net_total,
				COALESCE((
					SELECT SUM(tc.amount)
					FROM `tabTransport Charges` tc
					WHERE tc.parent = dn.name
					AND tc.parenttype = 'Delivery Note'
					AND tc.parentfield = 'custom_transport_charges'
				), 0) AS transport_charges,
				COALESCE((
					SELECT SUM(si.outstanding_amount)
					FROM `tabSales Invoice` si
					INNER JOIN `tabSales Invoice Item` sii ON sii.parent = si.name
					WHERE si.docstatus = 1
					AND sii.delivery_note = dn.name
				), 0) AS invoiced_outstanding
			FROM `tabDelivery Note` dn
			LEFT JOIN `tabAddress` addr ON addr.name = dn.shipping_address_name
			WHERE {where_clause}
			ORDER BY dn.posting_date DESC, dn.name DESC
			""",
			params,
			as_dict=True,
		)

		if not rows:
			return {"rows": [], "summary": _empty_summary()}

		dn_names = [r.delivery_note_no for r in rows]
		items_by_dn = _get_items_by_delivery_note(dn_names)

		result_rows = []
		for row in rows:
			dn_name = row.delivery_note_no
			items = items_by_dn.get(dn_name, [])
			warehouses = sorted({i["warehouse"] for i in items if i.get("warehouse")})

			courier_payable = _courier_payable(row)
			customer_amount = flt(row.grand_total or row.net_total or 0)
			if not customer_amount and items:
				customer_amount = sum(flt(i.get("amount", 0)) for i in items)

			outstanding = flt(row.invoiced_outstanding)
			amount_to_receive = outstanding if outstanding else customer_amount

			total_books = sum(flt(i.get("qty", 0)) for i in items)
			total_cartons = sum(flt(i.get("custom_cartons", 0)) for i in items)

			result_rows.append(
				{
					"delivery_note_no": dn_name,
					"posting_date": row.posting_date,
					"customer": row.customer,
					"customer_name": row.customer_name or row.customer,
					"shipping_address": row.shipping_address_text
					or _strip_html(row.shipping_address)
					or "",
					"city": row.city or "",
					"area": row.area or "",
					"province": row.province or "",
					"country": row.country or "",
					"warehouses": warehouses,
					"warehouses_label": ", ".join(warehouses) if warehouses else "",
					"delivery_mode": row.custom_delivery_mode or "",
					"courier": row.custom_courier or "",
					"courier_service": row.custom_courier_service or "",
					"courier_mode_of_payment": row.custom_courier_mode_of_payment or "",
					"courier_payable": courier_payable,
					"customer_amount": customer_amount,
					"amount_to_receive": amount_to_receive,
					"invoiced_outstanding": outstanding,
					"total_books": total_books,
					"total_cartons": total_cartons,
					"items": items,
				}
			)

		return {"rows": result_rows, "summary": _build_summary(result_rows)}
	except Exception:
		frappe.log_error(frappe.get_traceback(), "Dispatch Detail Report Error")
		return {"error": _("Failed to load dispatch detail report."), "rows": [], "summary": _empty_summary()}


@frappe.whitelist()
def get_filter_options():
	"""Filter dropdown values."""
	couriers = frappe.get_all("Courier", fields=["name"], order_by="name")
	warehouses = frappe.get_all(
		"Warehouse", filters={"is_group": 0, "disabled": 0}, fields=["name"], order_by="name"
	)
	cities = frappe.db.sql(
		"""
		SELECT DISTINCT city FROM (
			SELECT city FROM `tabAddress` WHERE city IS NOT NULL AND city != ''
			UNION
			SELECT custom_city AS city FROM `tabDelivery Note`
			WHERE custom_city IS NOT NULL AND custom_city != ''
		) t ORDER BY city
		""",
		as_dict=True,
	)
	return {
		"couriers": [c.name for c in couriers],
		"warehouses": [w.name for w in warehouses],
		"cities": [c.city for c in cities if c.city],
		"delivery_modes": ["Courier", "Transport", "By Hand"],
	}


def _get_items_by_delivery_note(dn_names):
	items_by_dn = {}
	if not dn_names:
		return items_by_dn

	items = frappe.db.sql(
		"""
		SELECT
			parent,
			item_code,
			item_name,
			qty,
			stock_uom,
			warehouse,
			rate,
			amount,
			custom_cartons
		FROM `tabDelivery Note Item`
		WHERE parent IN %(dn_names)s
		ORDER BY parent, idx
		""",
		{"dn_names": tuple(dn_names)},
		as_dict=True,
	)

	for item in items:
		parent = item.parent
		book_type = _book_type(item.item_name, item.item_code)
		items_by_dn.setdefault(parent, []).append(
			{
				"item_code": item.item_code,
				"item_name": item.item_name,
				"qty": flt(item.qty),
				"stock_uom": item.stock_uom,
				"warehouse": item.warehouse or "",
				"rate": flt(item.rate),
				"amount": flt(item.amount),
				"custom_cartons": flt(item.custom_cartons),
				"book_type": book_type,
			}
		)
	return items_by_dn


def _courier_payable(row):
	mode = row.custom_delivery_mode or ""
	if mode == "Courier":
		return flt(row.custom_delivery_rate)
	if mode == "Transport":
		return flt(row.transport_charges)
	return 0.0


def _book_type(item_name, item_code):
	name = (item_name or "").upper()
	code = (item_code or "").upper()
	if "MQH" in name or "MQH" in code:
		return "MQH"
	if "QAIDA" in name or "QAIDA" in code or "GUIDE" in name:
		return "Qaida"
	return "Other"


def _strip_html(text):
	if not text:
		return ""
	import re

	return re.sub(r"<[^>]+>", " ", text).replace("\n", ", ").strip()


def _empty_summary():
	return {
		"total_delivery_notes": 0,
		"total_books": 0,
		"total_courier_payable": 0,
		"total_customer_amount": 0,
		"total_amount_to_receive": 0,
	}


def _build_summary(rows):
	return {
		"total_delivery_notes": len(rows),
		"total_books": flt(sum(r["total_books"] for r in rows)),
		"total_courier_payable": flt(sum(r["courier_payable"] for r in rows)),
		"total_customer_amount": flt(sum(r["customer_amount"] for r in rows)),
		"total_amount_to_receive": flt(sum(r["amount_to_receive"] for r in rows)),
	}
