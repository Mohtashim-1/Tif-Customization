import json

import frappe
from frappe import _
from frappe.utils import add_days, cint, flt, getdate, today

from tif_customization.tif_customization.utils.supply_chain_books import (
	is_supply_chain_book_item,
)


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
				IFNULL(dn.is_return, 0) AS is_return,
				dn.return_against,
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
				COALESCE((
					SELECT SUM(tc.amount)
					FROM `tabTransport Charges` tc
					WHERE tc.parent = dn.name
					AND tc.parenttype = 'Delivery Note'
					AND tc.parentfield = 'custom_transport_charges'
				), 0) AS transport_charges
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
		jv_courier_by_dn = _get_jv_courier_expense_by_dn(dn_names)
		jv_details_by_dn = _get_jv_courier_details_by_dn(dn_names)

		result_rows = []
		for row in rows:
			dn_name = row.delivery_note_no
			items = items_by_dn.get(dn_name, [])
			warehouses = sorted({i["warehouse"] for i in items if i.get("warehouse")})

			jv_amount = jv_courier_by_dn.get(dn_name)
			courier_payable = _courier_payable(row, jv_amount)
			total_books = sum(flt(i.get("qty", 0)) for i in items if i.get("is_book"))
			total_qty = sum(flt(i.get("qty", 0)) for i in items)
			total_cartons = sum(flt(i.get("custom_cartons", 0)) for i in items)
			books_cost = sum(flt(i.get("book_cost", 0)) for i in items)
			jv_details = jv_details_by_dn.get(dn_name, [])

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
					"delivery_rate": flt(row.custom_delivery_rate),
					"transport_charges": flt(row.transport_charges),
					"jv_courier_amount": flt(jv_amount) if jv_amount is not None else 0.0,
					"courier_jv_entries": jv_details,
					"courier_payable": courier_payable,
					"courier_expense_source": "jv"
					if jv_amount is not None and flt(jv_amount) > 0
					else ("delivery_rate" if (row.custom_delivery_mode or "") == "Courier" else "transport"),
					"books_cost": books_cost,
					"total_books": total_books,
					"total_qty": total_qty,
					"total_cartons": total_cartons,
					"is_return": cint(row.is_return),
					"return_against": row.return_against or "",
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
			dni.parent,
			dni.item_code,
			dni.item_name,
			dni.qty,
			dni.stock_uom,
			dni.warehouse,
			dni.incoming_rate,
			dni.custom_cartons,
			COALESCE(
				NULLIF(dni.incoming_rate, 0),
				NULLIF(it.valuation_rate, 0),
				NULLIF(it.last_purchase_rate, 0),
				0
			) AS unit_cost
		FROM `tabDelivery Note Item` dni
		LEFT JOIN `tabItem` it ON it.name = dni.item_code
		WHERE dni.parent IN %(dn_names)s
		ORDER BY dni.parent, dni.idx
		""",
		{"dn_names": tuple(dn_names)},
		as_dict=True,
	)

	for item in items:
		parent = item.parent
		qty = flt(item.qty)
		unit_cost = flt(item.unit_cost)
		is_book = is_supply_chain_book_item(item.item_code)
		items_by_dn.setdefault(parent, []).append(
			{
				"item_code": item.item_code,
				"item_name": item.item_name,
				"qty": qty,
				"stock_uom": item.stock_uom,
				"warehouse": item.warehouse or "",
				"unit_cost": unit_cost,
				"book_cost": qty * unit_cost if is_book else 0.0,
				"line_cost": qty * unit_cost,
				"custom_cartons": flt(item.custom_cartons),
				"book_type": _book_type(item.item_name, item.item_code) if is_book else "Other",
				"is_book": is_book,
			}
		)
	return items_by_dn


def _get_jv_courier_expense_by_dn(dn_names):
	"""Actual courier expense from Journal Entry (same basis as Courier Report)."""
	if not dn_names:
		return {}

	rows = frappe.db.sql(
		"""
		SELECT
			je.cheque_no AS dn_name,
			COALESCE(SUM(jea.debit - jea.credit), 0) AS amount
		FROM `tabJournal Entry Account` jea
		INNER JOIN `tabJournal Entry` je ON je.name = jea.parent AND je.docstatus = 1
		WHERE je.cheque_no IN %(dn_names)s
		AND (jea.account LIKE %(courier_ac)s OR jea.account LIKE %(courier_exp_ac)s)
		GROUP BY je.cheque_no
		""",
		{
			"dn_names": tuple(dn_names),
			"courier_ac": "%Courier%",
			"courier_exp_ac": "%Courier Expense%",
		},
		as_dict=True,
	)
	return {row.dn_name: flt(row.amount) for row in rows}


def _get_jv_courier_details_by_dn(dn_names):
	"""Per-DN Journal Entry lines for courier charges (for expand detail)."""
	if not dn_names:
		return {}

	rows = frappe.db.sql(
		"""
		SELECT
			je.cheque_no AS dn_name,
			je.name AS journal_entry,
			je.posting_date,
			jea.account,
			COALESCE(jea.debit - jea.credit, 0) AS amount
		FROM `tabJournal Entry Account` jea
		INNER JOIN `tabJournal Entry` je ON je.name = jea.parent AND je.docstatus = 1
		WHERE je.cheque_no IN %(dn_names)s
		AND (jea.account LIKE %(courier_ac)s OR jea.account LIKE %(courier_exp_ac)s)
		AND COALESCE(jea.debit - jea.credit, 0) != 0
		ORDER BY je.posting_date, je.name
		""",
		{
			"dn_names": tuple(dn_names),
			"courier_ac": "%Courier%",
			"courier_exp_ac": "%Courier Expense%",
		},
		as_dict=True,
	)

	out = {}
	for row in rows or []:
		out.setdefault(row.dn_name, []).append(
			{
				"journal_entry": row.journal_entry,
				"posting_date": row.posting_date,
				"account": row.account or "",
				"amount": flt(row.amount),
			}
		)
	return out


def _courier_payable(row, jv_amount=None):
	mode = row.custom_delivery_mode or ""
	if mode == "Courier":
		if jv_amount is not None and flt(jv_amount) > 0:
			return flt(jv_amount)
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
		"total_books_cost": 0,
	}


def _build_summary(rows):
	outbound = [r for r in rows if not cint(r.get("is_return"))]
	returns = [r for r in rows if cint(r.get("is_return"))]
	return {
		"total_delivery_notes": len(rows),
		"total_books": flt(sum(r["total_books"] for r in outbound)),
		"total_courier_payable": flt(sum(r["courier_payable"] for r in rows)),
		"total_books_cost": flt(sum(r["books_cost"] for r in outbound)),
		"return_delivery_notes": len(returns),
	}

