# Copyright (c) 2026, TIF Customization and contributors
# License: MIT

import json

import frappe
from frappe.utils import add_days, cint, cstr, flt, getdate, today

from tif_customization.tif_customization.page.dispatch_report.dispatch_report import (
	_attach_location_links,
)
from tif_customization.tif_customization.utils.supply_chain_books import (
	sql_book_item_filter,
	with_book_item_params,
)


@frappe.whitelist()
def get_report_data(filters=None):
	filters = _parse_filters(filters)
	rows = _get_school_dispatch_rows(filters)
	return {"rows": rows, "summary": _build_summary(rows)}


@frappe.whitelist()
def get_so_wise_dispatch(filters=None):
	"""One row per Sales Order (plus unlinked DN lines) for sample-file reconciliation.

	City-wise report totals by Customer/School across all Delivery Notes in the
	date range. Sample files are usually Sales Order–wise, so multi-SO schools
	look high and free DN lines (no against_sales_order) also inflate the school total.
	"""
	filters = _parse_filters(filters)
	return {"rows": _get_so_dispatch_rows(filters)}


@frappe.whitelist()
def get_customer_so_breakdown(filters=None):
	"""Sales Order contribution for one customer/school (row drill-down)."""
	filters = _parse_filters(filters)
	customer = cstr(filters.get("customer") or "").strip()
	if not customer:
		frappe.throw(frappe._("Customer is required."))
	rows = _get_so_dispatch_rows(filters)
	total = sum(flt(r.get("total_qty")) for r in rows)
	return {
		"customer": customer,
		"label": rows[0]["school_name"] if rows else customer,
		"from_date": str(filters["from_date"]),
		"to_date": str(filters["to_date"]),
		"rows": rows,
		"total_qty": total,
		"so_count": len(rows),
	}


@frappe.whitelist()
def get_item_wise_dispatch(filters=None):
	"""Item-wise outgoing qty (one school/customer, or all under current filters / card)."""
	filters = _parse_filters(filters)
	customer = cstr(filters.get("customer") or "").strip()
	school = cstr(filters.get("school") or "").strip()
	school_name = cstr(filters.get("school_name") or "").strip()
	# Card drill: no customer — use page filters + optional book_type
	card_scope = cint(filters.get("card_scope") or 0)

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

	if customer:
		where.append("dn.customer = %(customer)s")
		params["customer"] = customer
	elif school or school_name:
		_apply_school_name_filter(
			where,
			params,
			{"school": school, "school_name": school_name, "customer": ""},
			customer_field="dn.customer",
			customer_name_field="dn.customer_name",
		)
	elif not card_scope:
		frappe.throw(frappe._("Customer or school is required."))
	else:
		# Apply same page filters as the main report (city/province/etc.)
		_apply_page_filters_for_items(where, params, filters)

	book_type = (filters.get("book_type") or "").strip()
	_apply_book_type_filter(where, book_type)

	where_clause = " AND ".join(where)
	rows = frappe.db.sql(
		f"""
		SELECT
			dni.item_code,
			COALESCE(NULLIF(dni.item_name, ''), dni.item_code) AS item_name,
			COALESCE(dni.stock_uom, dni.uom, 'Nos') AS uom,
			SUM(COALESCE(dni.qty, 0)) AS qty,
			COUNT(DISTINCT dn.name) AS delivery_notes,
			COUNT(DISTINCT dn.customer) AS customers,
			MAX(dn.posting_date) AS last_dispatch_date
		FROM `tabDelivery Note` dn
		INNER JOIN `tabDelivery Note Item` dni ON dni.parent = dn.name
		LEFT JOIN `tabCustomer` cust ON cust.name = dn.customer
		{_address_join_sql()}
		{_school_join_sql()}
		WHERE {where_clause}
		GROUP BY
			dni.item_code,
			COALESCE(NULLIF(dni.item_name, ''), dni.item_code),
			COALESCE(dni.stock_uom, dni.uom, 'Nos')
		ORDER BY qty DESC, item_name ASC
		""",
		params,
		as_dict=True,
	)

	total_qty = 0.0
	for row in rows:
		row["qty"] = flt(row.get("qty"))
		total_qty += row["qty"]
		row["delivery_notes"] = int(row.get("delivery_notes") or 0)
		row["customers"] = int(row.get("customers") or 0)
		if row.get("last_dispatch_date"):
			row["last_dispatch_date"] = str(getdate(row["last_dispatch_date"]))
		row["book_type"] = _classify_book_type(row.get("item_code"), row.get("item_name"))

	if card_scope:
		label = book_type or frappe._("All Books")
	else:
		label = school_name or customer or school
	return {
		"label": label,
		"customer": customer,
		"book_type": book_type,
		"from_date": str(filters["from_date"]),
		"to_date": str(filters["to_date"]),
		"rows": rows,
		"total_qty": total_qty,
		"item_count": len(rows),
	}


def _apply_page_filters_for_items(where, params, filters):
	"""Reuse city / province / area / status / customer type filters for card drill."""
	if filters.get("school") or filters.get("school_name") or filters.get("customer"):
		_apply_school_name_filter(
			where,
			params,
			filters,
			customer_field="dn.customer",
			customer_name_field="dn.customer_name",
		)
	if filters.get("city"):
		where.append(f"LOWER(TRIM({_city_expr()})) = LOWER(%(city)s)")
		params["city"] = filters["city"]
	if filters.get("province"):
		where.append(f"LOWER(TRIM({_province_expr()})) = LOWER(%(province)s)")
		params["province"] = filters["province"]
	if filters.get("area"):
		where.append(f"LOWER(TRIM({_area_expr()})) = LOWER(%(area)s)")
		params["area"] = filters["area"]
	if filters.get("school_status"):
		where.append("s.status = %(school_status)s")
		params["school_status"] = filters["school_status"]

	customer_type = (filters.get("customer_type") or "").strip()
	name_is_school = _school_name_sql(
		"CONCAT_WS(' ', COALESCE(dn.customer_name, ''), COALESCE(dn.customer, ''), COALESCE(s.school_name, ''))"
	)
	if customer_type == "Individual":
		where.append("IFNULL(cust.customer_type, '') = 'Individual'")
		where.append(f"NOT ({name_is_school})")
	elif customer_type == "School":
		where.append(
			f"(IFNULL(cust.customer_type, '') IN ('School', 'Company') OR ({name_is_school}))"
		)


def _address_join_sql():
	"""One address only — OR on shipping/billing duplicates every DN item row."""
	return """
		LEFT JOIN `tabAddress` addr ON addr.name = COALESCE(
			NULLIF(dn.shipping_address_name, ''),
			NULLIF(dn.customer_address, '')
		)
	"""


def _school_join_sql():
	"""Prefer School linked by customer id; else one row by school_name."""
	return """
		LEFT JOIN `tabSchool` s ON s.name = COALESCE(
			(
				SELECT s_id.name FROM `tabSchool` s_id
				WHERE s_id.name = dn.customer
				LIMIT 1
			),
			(
				SELECT s_nm.name FROM `tabSchool` s_nm
				WHERE s_nm.school_name = dn.customer_name
				ORDER BY s_nm.creation
				LIMIT 1
			)
		)
	"""


def _city_expr():
	# Dispatch destination first; school master city is often wrong / outdated
	# TRIM avoids trailing-space splits (e.g. "karachi ").
	return "COALESCE(NULLIF(TRIM(addr.city), ''), NULLIF(TRIM(dn.custom_city), ''), NULLIF(TRIM(s.city), ''), '')"


def _province_expr():
	return "COALESCE(NULLIF(TRIM(addr.state), ''), NULLIF(TRIM(s.province), ''), '')"


def _area_expr():
	return "COALESCE(NULLIF(TRIM(addr.custom_area), ''), NULLIF(TRIM(dn.custom_area), ''), NULLIF(TRIM(s.area), ''), '')"


def _get_so_dispatch_rows(filters):
	"""DN book qty grouped by Sales Order (against_sales_order), same filters as city report."""
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
		_apply_school_name_filter(
			where,
			params,
			filters,
			customer_field="dn.customer",
			customer_name_field="dn.customer_name",
		)

	if filters.get("city"):
		where.append(f"LOWER(TRIM({_city_expr()})) = LOWER(%(city)s)")
		params["city"] = filters["city"]
	if filters.get("province"):
		where.append(f"LOWER(TRIM({_province_expr()})) = LOWER(%(province)s)")
		params["province"] = filters["province"]
	if filters.get("area"):
		where.append(f"LOWER(TRIM({_area_expr()})) = LOWER(%(area)s)")
		params["area"] = filters["area"]
	if filters.get("school_status"):
		where.append("s.status = %(school_status)s")
		params["school_status"] = filters["school_status"]

	customer_type = (filters.get("customer_type") or "").strip()
	name_is_school = _school_name_sql(
		"CONCAT_WS(' ', COALESCE(dn.customer_name, ''), COALESCE(dn.customer, ''), COALESCE(s.school_name, ''))"
	)
	if customer_type == "Individual":
		where.append("IFNULL(cust.customer_type, '') = 'Individual'")
		where.append(f"NOT ({name_is_school})")
	elif customer_type == "School":
		where.append(
			f"(IFNULL(cust.customer_type, '') IN ('School', 'Company') OR ({name_is_school}))"
		)

	book_type = (filters.get("book_type") or "").strip()
	_apply_book_type_filter(where, book_type)

	sales_order = cstr(filters.get("sales_order") or "").strip()
	if sales_order:
		where.append("dni.against_sales_order = %(sales_order)s")
		params["sales_order"] = sales_order

	where_clause = " AND ".join(where)
	city_expr = _city_expr()
	province_expr = _province_expr()
	area_expr = _area_expr()
	rows = frappe.db.sql(
		f"""
		SELECT
			IFNULL(NULLIF(dni.against_sales_order, ''), '') AS sales_order,
			COALESCE(s.name, '') AS school,
			COALESCE(NULLIF(s.school_name, ''), dn.customer_name, dn.customer) AS school_name,
			COALESCE(dn.customer_name, '') AS customer_name,
			dn.customer AS customer,
			COALESCE(cust.customer_type, '') AS customer_type,
			{city_expr} AS city,
			{province_expr} AS province,
			{area_expr} AS area,
			COUNT(DISTINCT dn.name) AS delivery_notes,
			SUM(COALESCE(dni.qty, 0)) AS total_qty,
			SUM(CASE WHEN {_mqh_case()} THEN COALESCE(dni.qty, 0) ELSE 0 END) AS mqh_qty,
			SUM(CASE WHEN {_qaida_case()} THEN COALESCE(dni.qty, 0) ELSE 0 END) AS qaida_qty,
			SUM(CASE WHEN {_guide_case()} THEN COALESCE(dni.qty, 0) ELSE 0 END) AS guide_qty,
			SUM(CASE WHEN {_kpk_edition_case()} THEN COALESCE(dni.qty, 0) ELSE 0 END) AS kpk_qty,
			SUM(CASE WHEN {_balouchistan_edition_case()} THEN COALESCE(dni.qty, 0) ELSE 0 END) AS bal_qty,
			MIN(dn.posting_date) AS first_dispatch_date,
			MAX(dn.posting_date) AS last_dispatch_date,
			GROUP_CONCAT(DISTINCT dn.name ORDER BY dn.posting_date SEPARATOR ', ') AS delivery_note_list
		FROM `tabDelivery Note` dn
		INNER JOIN `tabDelivery Note Item` dni ON dni.parent = dn.name
		LEFT JOIN `tabCustomer` cust ON cust.name = dn.customer
		{_address_join_sql()}
		{_school_join_sql()}
		WHERE {where_clause}
		GROUP BY
			IFNULL(NULLIF(dni.against_sales_order, ''), ''),
			COALESCE(s.name, ''),
			COALESCE(NULLIF(s.school_name, ''), dn.customer_name, dn.customer),
			dn.customer,
			COALESCE(cust.customer_type, ''),
			{city_expr},
			{province_expr},
			{area_expr}
		ORDER BY last_dispatch_date ASC, sales_order ASC
		""",
		params,
		as_dict=True,
	)

	so_names = [r.sales_order for r in rows if r.sales_order]
	so_meta = {}
	if so_names:
		for so in frappe.db.get_all(
			"Sales Order",
			filters={"name": ["in", so_names]},
			fields=["name", "transaction_date", "po_no", "status"],
		):
			so_meta[so.name] = so

	for row in rows:
		row["total_qty"] = flt(row.get("total_qty"))
		row["mqh_qty"] = flt(row.get("mqh_qty"))
		row["qaida_qty"] = flt(row.get("qaida_qty"))
		row["guide_qty"] = flt(row.get("guide_qty"))
		row["kpk_qty"] = flt(row.get("kpk_qty"))
		row["bal_qty"] = flt(row.get("bal_qty"))
		row["other_qty"] = max(
			0.0,
			flt(
				row["total_qty"]
				- row["mqh_qty"]
				- row["qaida_qty"]
				- row["guide_qty"]
				- row["kpk_qty"]
				- row["bal_qty"]
			),
		)
		row["delivery_notes"] = int(row.get("delivery_notes") or 0)
		if row.get("first_dispatch_date"):
			row["first_dispatch_date"] = str(getdate(row["first_dispatch_date"]))
		if row.get("last_dispatch_date"):
			row["last_dispatch_date"] = str(getdate(row["last_dispatch_date"]))
		meta = so_meta.get(row.get("sales_order")) or {}
		row["so_date"] = str(getdate(meta.transaction_date)) if meta.get("transaction_date") else ""
		row["so_status"] = meta.get("status") or ""
		if not row.get("sales_order"):
			row["sales_order"] = ""
			row["so_label"] = frappe._("No Sales Order (free DN lines)")
		else:
			row["so_label"] = row["sales_order"]
		row["customer_type_group"] = _customer_type_group(
			row.get("customer_type"),
			" ".join(
				[
					cstr(row.get("school_name") or ""),
					cstr(row.get("customer_name") or ""),
					cstr(row.get("customer") or ""),
				]
			),
		)

	_attach_location_links(rows)
	return rows


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
		where.append(f"LOWER(TRIM({_city_expr()})) = LOWER(%(city)s)")
		params["city"] = filters["city"]

	if filters.get("province"):
		where.append(f"LOWER(TRIM({_province_expr()})) = LOWER(%(province)s)")
		params["province"] = filters["province"]

	if filters.get("area"):
		where.append(f"LOWER(TRIM({_area_expr()})) = LOWER(%(area)s)")
		params["area"] = filters["area"]

	if filters.get("school_status"):
		where.append("s.status = %(school_status)s")
		params["school_status"] = filters["school_status"]

	customer_type = (filters.get("customer_type") or "").strip()
	# Name keywords override bad Individual tagging (school/foundation/college/…)
	# Check DN customer name, customer id, and linked School master name.
	name_is_school = _school_name_sql(
		"CONCAT_WS(' ', COALESCE(dn.customer_name, ''), COALESCE(dn.customer, ''), COALESCE(s.school_name, ''))"
	)
	if customer_type == "Individual":
		where.append("IFNULL(cust.customer_type, '') = 'Individual'")
		where.append(f"NOT ({name_is_school})")
	elif customer_type == "School":
		# School = Customer Type School/Company, or name looks like a school
		where.append(
			f"(IFNULL(cust.customer_type, '') IN ('School', 'Company') OR ({name_is_school}))"
		)

	book_type = (filters.get("book_type") or "").strip()
	_apply_book_type_filter(where, book_type)

	where_clause = " AND ".join(where)
	city_expr = _city_expr()
	province_expr = _province_expr()
	area_expr = _area_expr()
	rows = frappe.db.sql(
		f"""
		SELECT
			COALESCE(s.name, '') AS school,
			COALESCE(NULLIF(s.school_name, ''), dn.customer_name, dn.customer) AS school_name,
			COALESCE(dn.customer_name, '') AS customer_name,
			dn.customer AS customer,
			COALESCE(cust.customer_type, '') AS customer_type,
			COALESCE(s.status, '') AS school_status,
			{city_expr} AS city,
			{province_expr} AS province,
			{area_expr} AS area,
			COUNT(DISTINCT dn.name) AS delivery_notes,
			SUM(COALESCE(dni.qty, 0)) AS total_qty,
			SUM(
				CASE
					WHEN {_mqh_case()}
					THEN COALESCE(dni.qty, 0) ELSE 0
				END
			) AS mqh_qty,
			SUM(
				CASE
					WHEN {_qaida_case()}
					THEN COALESCE(dni.qty, 0) ELSE 0
				END
			) AS qaida_qty,
			SUM(
				CASE
					WHEN {_guide_case()}
					THEN COALESCE(dni.qty, 0) ELSE 0
				END
			) AS guide_qty,
			SUM(
				CASE
					WHEN {_kpk_edition_case()}
					THEN COALESCE(dni.qty, 0) ELSE 0
				END
			) AS kpk_qty,
			SUM(
				CASE
					WHEN {_balouchistan_edition_case()}
					THEN COALESCE(dni.qty, 0) ELSE 0
				END
			) AS bal_qty,
			MAX(dn.posting_date) AS last_dispatch_date
		FROM `tabDelivery Note` dn
		INNER JOIN `tabDelivery Note Item` dni ON dni.parent = dn.name
		LEFT JOIN `tabCustomer` cust ON cust.name = dn.customer
		{_address_join_sql()}
		{_school_join_sql()}
		WHERE {where_clause}
		GROUP BY
			COALESCE(s.name, ''),
			COALESCE(NULLIF(s.school_name, ''), dn.customer_name, dn.customer),
			dn.customer,
			COALESCE(cust.customer_type, ''),
			COALESCE(s.status, ''),
			{city_expr},
			{province_expr},
			{area_expr}
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
		row["kpk_qty"] = flt(row.get("kpk_qty"))
		row["bal_qty"] = flt(row.get("bal_qty"))
		row["other_qty"] = max(
			0.0,
			flt(
				row["total_qty"]
				- row["mqh_qty"]
				- row["qaida_qty"]
				- row["guide_qty"]
				- row["kpk_qty"]
				- row["bal_qty"]
			),
		)
		row["delivery_notes"] = int(row.get("delivery_notes") or 0)
		if row.get("last_dispatch_date"):
			row["last_dispatch_date"] = str(getdate(row["last_dispatch_date"]))
		# Check every name field — School master name can omit "Foundation/School"
		# while DN customer_name still has it.
		row["customer_type_group"] = _customer_type_group(
			row.get("customer_type"),
			" ".join(
				[
					cstr(row.get("school_name") or ""),
					cstr(row.get("customer_name") or ""),
					cstr(row.get("customer") or ""),
				]
			),
		)

	_attach_location_links(rows)
	return rows


# Name tokens that mean the customer is a school even if Customer Type = Individual
_SCHOOL_NAME_KEYWORDS = (
	"school",
	"foundation",
	"college",
	"system",
	"campus",
	"office",
	"academy",
	"madrasa",
	"madrassa",
	"university",
)


def _school_name_sql(expr):
	"""SQL: customer/school name contains a school-like keyword."""
	parts = [
		f"LOWER({expr}) LIKE '%%{kw}%%'" for kw in _SCHOOL_NAME_KEYWORDS
	]
	return " OR ".join(parts)


def _name_looks_like_school(name):
	# Normalize punctuation so "School-Rehmat" / "Colleges" still match.
	text = cstr(name or "").strip().lower()
	if not text:
		return False
	for ch in "-_/.,()&|+":
		text = text.replace(ch, " ")
	# Collapse spaces; also match plurals via stem (school in schools)
	return any(kw in text for kw in _SCHOOL_NAME_KEYWORDS)


def _customer_type_group(customer_type, customer_name=None):
	"""Company/School → School; name keywords also → School; else Individual."""
	ct = cstr(customer_type or "").strip()
	if ct in ("School", "Company") or _name_looks_like_school(customer_name):
		return "School"
	if ct == "Individual":
		return "Individual"
	# Blank / other with no school keyword → treat as School for ops reporting
	return "School"


def _kpk_edition_case():
	"""Match KP / KPK Edition lines (codes MQKPUT*, names with KP / KPK)."""
	return (
		"UPPER(COALESCE(dni.item_code,'')) LIKE 'MQKP%%' "
		"OR UPPER(COALESCE(dni.item_code,'')) LIKE '%%KPK%%' "
		"OR UPPER(COALESCE(dni.item_name,'')) LIKE '%%KPK%%' "
		"OR UPPER(COALESCE(dni.item_name,'')) LIKE '%% KP %%' "
		"OR UPPER(COALESCE(dni.item_name,'')) LIKE 'KP %%' "
		"OR UPPER(COALESCE(dni.item_name,'')) LIKE '%%KHYBER%%' "
		"OR UPPER(COALESCE(dni.item_name,'')) LIKE '%%PAKHTUN%%'"
	)


def _balouchistan_edition_case():
	"""Match Balouchistan / Balochistan Edition book lines."""
	return (
		"UPPER(COALESCE(dni.item_name,'')) LIKE '%%BALOUCHISTAN%%' "
		"OR UPPER(COALESCE(dni.item_name,'')) LIKE '%%BALOCHISTAN%%' "
		"OR UPPER(COALESCE(dni.item_code,'')) LIKE '%%BALOUCHISTAN%%' "
		"OR UPPER(COALESCE(dni.item_code,'')) LIKE '%%BALOCHISTAN%%'"
	)


def _qaida_case():
	"""Qaida items including Noorani Qaida Teacher Guide (NQTG)."""
	return (
		"UPPER(COALESCE(dni.item_name,'')) LIKE '%%QAIDA%%' "
		"OR UPPER(COALESCE(dni.item_code,'')) LIKE '%%QAIDA%%' "
		"OR UPPER(COALESCE(dni.item_code,'')) IN ('NQ1', 'NQW', 'NQTG')"
	)


def _guide_case():
	"""MQH Teacher Guides only — not Qaida guides (NQTG) and not MQH textbooks."""
	return (
		"("
		"UPPER(COALESCE(dni.item_code,'')) LIKE 'MQHTG%%' "
		"OR ("
		"(UPPER(COALESCE(dni.item_name,'')) LIKE '%%GUIDE%%' "
		"OR UPPER(COALESCE(dni.item_code,'')) LIKE '%%GUIDE%%' "
		"OR UPPER(COALESCE(dni.item_name,'')) LIKE '%%TEACHER%%GUIDE%%')"
		f" AND NOT ({_qaida_case()})"
		" AND UPPER(COALESCE(dni.item_code,'')) NOT LIKE 'MQHWB%%'"
		")"
		")"
	)


def _mqh_case():
	"""MQH textbooks only — exclude KP / Balouchistan editions and Teacher Guides."""
	return (
		"(UPPER(COALESCE(dni.item_name,'')) LIKE '%%MQH%%' "
		"OR UPPER(COALESCE(dni.item_code,'')) LIKE '%%MQH%%') "
		f"AND NOT ({_kpk_edition_case()}) "
		f"AND NOT ({_balouchistan_edition_case()}) "
		f"AND NOT ({_guide_case()})"
	)


def _apply_book_type_filter(where, book_type):
	book_type = (book_type or "").strip()
	if book_type == "MQH":
		where.append(f"({_mqh_case()})")
	elif book_type == "Qaida":
		where.append(f"({_qaida_case()})")
	elif book_type == "Guide":
		where.append(f"({_guide_case()})")
	elif book_type in ("KP Edition", "KPK Edition"):
		where.append(f"({_kpk_edition_case()})")
	elif book_type in ("Balouchistan Edition", "Balochistan Edition"):
		where.append(f"({_balouchistan_edition_case()})")


def _classify_book_type(item_code, item_name):
	code = cstr(item_code or "").upper()
	name = cstr(item_name or "").upper()
	if "BALOUCHISTAN" in name or "BALOCHISTAN" in name or "BALOUCHISTAN" in code or "BALOCHISTAN" in code:
		return "Balouchistan Edition"
	if (
		code.startswith("MQKP")
		or "KPK" in code
		or "KPK" in name
		or " KP " in f" {name} "
		or name.startswith("KP ")
		or "KHYBER" in name
		or "PAKHTUN" in name
	):
		return "KP Edition"
	if "QAIDA" in name or "QAIDA" in code or code in ("NQ1", "NQW", "NQTG"):
		return "Qaida"
	if code.startswith("MQHTG") or (
		("GUIDE" in name or "GUIDE" in code or "TEACHER" in name and "GUIDE" in name)
		and "QAIDA" not in name
		and not code.startswith("MQHWB")
	):
		return "Guide"
	if "MQH" in name or "MQH" in code:
		return "MQH"
	return "Other"


def _build_summary(rows):
	school_type_count = 0
	individual_count = 0
	mqh_school_count = 0
	qaida_school_count = 0
	guide_school_count = 0
	kpk_school_count = 0
	bal_school_count = 0
	for r in rows:
		group = r.get("customer_type_group") or _customer_type_group(
			r.get("customer_type"),
			" ".join(
				[
					cstr(r.get("school_name") or ""),
					cstr(r.get("customer_name") or ""),
					cstr(r.get("customer") or ""),
				]
			),
		)
		r["customer_type_group"] = group
		is_school = group != "Individual"
		if is_school:
			school_type_count += 1
			if flt(r.get("mqh_qty")) > 0:
				mqh_school_count += 1
			if flt(r.get("qaida_qty")) > 0:
				qaida_school_count += 1
			if flt(r.get("guide_qty")) > 0:
				guide_school_count += 1
			if flt(r.get("kpk_qty")) > 0:
				kpk_school_count += 1
			if flt(r.get("bal_qty")) > 0:
				bal_school_count += 1
		else:
			individual_count += 1

	return {
		"schools": len(rows),
		"school_type_count": school_type_count,
		"individual_count": individual_count,
		"total_qty": sum(flt(r.get("total_qty")) for r in rows),
		"mqh_qty": sum(flt(r.get("mqh_qty")) for r in rows),
		"qaida_qty": sum(flt(r.get("qaida_qty")) for r in rows),
		"guide_qty": sum(flt(r.get("guide_qty")) for r in rows),
		"kpk_qty": sum(flt(r.get("kpk_qty")) for r in rows),
		"bal_qty": sum(flt(r.get("bal_qty")) for r in rows),
		"mqh_school_count": mqh_school_count,
		"qaida_school_count": qaida_school_count,
		"guide_school_count": guide_school_count,
		"kpk_school_count": kpk_school_count,
		"bal_school_count": bal_school_count,
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


_SCHOOL_STATUS = {
	"Active",
	"Inactive",
	"In Process",
	"Closed",
	"Not Interested",
	"Direct Requirement Received",
}
_CUSTOMER_TYPES = {"School", "Individual", "Company", "Partnership"}
_IMPORT_TYPE_MAP = {
	"school": "School",
	"individual": "Individual",
	"company": "Company",
	"partnership": "Partnership",
}


@frappe.whitelist()
def import_school_meta(rows=None):
	"""Update School / Customer / Address fields from exported CSV rows.

	Qty and Delivery Note columns are ignored — those come from submitted Delivery Notes.
	"""
	if isinstance(rows, str):
		rows = json.loads(rows or "[]")
	rows = rows or []
	if not isinstance(rows, list):
		frappe.throw(frappe._("Invalid import rows."))
	if len(rows) > 5000:
		frappe.throw(frappe._("Import is limited to 5,000 rows at a time."))

	can_school = frappe.has_permission("School", "write")
	can_customer = frappe.has_permission("Customer", "write")
	can_address = frappe.has_permission("Address", "write")
	if not (can_school or can_customer or can_address):
		frappe.throw(frappe._("Not permitted to update School / Customer / Address."), frappe.PermissionError)

	updated = 0
	unchanged = 0
	skipped = 0
	errors = []
	details = []

	for idx, raw in enumerate(rows, start=2):
		if not isinstance(raw, dict):
			skipped += 1
			continue
		try:
			result = _import_one_row(raw, can_school, can_customer, can_address)
		except Exception as exc:
			errors.append({"row": idx, "message": cstr(exc)[:240]})
			continue
		if result["status"] == "updated":
			updated += 1
			details.append({"row": idx, "label": result.get("label"), "changes": result.get("changes")})
		elif result["status"] == "unchanged":
			unchanged += 1
		else:
			skipped += 1
			errors.append({"row": idx, "message": result.get("message") or frappe._("Skipped")})

	return {
		"updated": updated,
		"unchanged": unchanged,
		"skipped": skipped,
		"errors": errors[:100],
		"details": details[:100],
		"error_count": len(errors),
	}


def _import_one_row(raw, can_school, can_customer, can_address):
	customer = cstr(raw.get("customer") or raw.get("Customer ID") or "").strip()
	school = cstr(raw.get("school") or raw.get("School ID") or "").strip()
	school_name = cstr(
		raw.get("school_name") or raw.get("School / Customer") or raw.get("School Name") or ""
	).strip()
	status = cstr(raw.get("school_status") or raw.get("Status") or "").strip()
	city = cstr(raw.get("city") or raw.get("City") or "").strip()
	province = cstr(raw.get("province") or raw.get("Province") or "").strip()
	area = cstr(raw.get("area") or raw.get("Area") or "").strip()
	type_raw = cstr(
		raw.get("customer_type")
		or raw.get("Customer Type")
		or raw.get("customer_type_group")
		or raw.get("Type")
		or ""
	).strip()

	school = _resolve_school(school, customer, school_name)
	if not customer and school:
		customer = frappe.db.get_value("School", school, "customer") or ""
		if not customer and frappe.db.exists("Customer", school):
			customer = school

	if not school and not customer:
		return {
			"status": "skipped",
			"message": frappe._("No matching School or Customer (need Customer ID or School ID)."),
		}

	label = school_name or school or customer
	changes = []

	if school and can_school and frappe.db.exists("School", school):
		school_updates = {}
		if status:
			if status not in _SCHOOL_STATUS:
				frappe.throw(frappe._("Invalid Status '{0}' for {1}").format(status, label))
			if cstr(frappe.db.get_value("School", school, "status") or "") != status:
				school_updates["status"] = status
				changes.append(f"status→{status}")
		if city:
			city_name = _resolve_city(city)
			if city_name and cstr(frappe.db.get_value("School", school, "city") or "") != city_name:
				school_updates["city"] = city_name
				changes.append(f"city→{city_name}")
		if _has_col(raw, "province", "Province"):
			current = cstr(frappe.db.get_value("School", school, "province") or "")
			if current != province:
				school_updates["province"] = province
				changes.append(f"province→{province or '(blank)'}")
		if _has_col(raw, "area", "Area"):
			current = cstr(frappe.db.get_value("School", school, "area") or "")
			if current != area:
				school_updates["area"] = area
				changes.append(f"area→{area or '(blank)'}")
		if school_updates:
			frappe.db.set_value("School", school, school_updates, update_modified=True)

	if customer and can_customer and frappe.db.exists("Customer", customer) and type_raw:
		mapped = _IMPORT_TYPE_MAP.get(type_raw.lower())
		if mapped and mapped in _CUSTOMER_TYPES:
			current = cstr(frappe.db.get_value("Customer", customer, "customer_type") or "")
			if current != mapped:
				frappe.db.set_value("Customer", customer, "customer_type", mapped, update_modified=True)
				changes.append(f"customer_type→{mapped}")

	if customer and can_address and (
		_has_col(raw, "city", "City")
		or _has_col(raw, "province", "Province")
		or _has_col(raw, "area", "Area")
	):
		address = _customer_address(customer)
		if address:
			addr_updates = {}
			if _has_col(raw, "city", "City"):
				current = cstr(frappe.db.get_value("Address", address, "city") or "")
				if current != city:
					addr_updates["city"] = city
					changes.append(f"address.city→{city or '(blank)'}")
			if _has_col(raw, "province", "Province"):
				current = cstr(frappe.db.get_value("Address", address, "state") or "")
				if current != province:
					addr_updates["state"] = province
					changes.append(f"address.state→{province or '(blank)'}")
			if _has_col(raw, "area", "Area") and frappe.get_meta("Address").has_field("custom_area"):
				current = cstr(frappe.db.get_value("Address", address, "custom_area") or "")
				if current != area:
					addr_updates["custom_area"] = area
					changes.append(f"address.area→{area or '(blank)'}")
			if addr_updates:
				frappe.db.set_value("Address", address, addr_updates, update_modified=True)

	if not changes:
		return {"status": "unchanged", "label": label}
	return {"status": "updated", "label": label, "changes": changes}


def _has_col(raw, *keys):
	return any(k in raw for k in keys)


def _resolve_school(school, customer, school_name):
	if school and frappe.db.exists("School", school):
		return school
	if customer:
		by_customer = frappe.db.get_value("School", {"customer": customer}, "name")
		if by_customer:
			return by_customer
		if frappe.db.exists("School", customer):
			return customer
	if school_name:
		by_name = frappe.db.get_value("School", {"school_name": school_name}, "name")
		if by_name:
			return by_name
	return ""


def _resolve_city(city):
	if not city:
		return ""
	if frappe.db.exists("City", city):
		return city
	found = frappe.db.get_value("City", {"name": city}, "name")
	if found:
		return found
	# Case-insensitive match
	rows = frappe.db.sql(
		"SELECT name FROM `tabCity` WHERE LOWER(TRIM(name)) = LOWER(%(city)s) LIMIT 1",
		{"city": city},
	)
	return rows[0][0] if rows else ""


def _customer_address(customer):
	"""Prefer address used on the latest Delivery Note, else Dynamic Link primary."""
	dn_addr = frappe.db.sql(
		"""
		SELECT COALESCE(NULLIF(shipping_address_name, ''), NULLIF(customer_address, '')) AS addr
		FROM `tabDelivery Note`
		WHERE customer = %(customer)s
			AND docstatus = 1
			AND COALESCE(NULLIF(shipping_address_name, ''), NULLIF(customer_address, '')) IS NOT NULL
		ORDER BY posting_date DESC, modified DESC
		LIMIT 1
		""",
		{"customer": customer},
	)
	if dn_addr and dn_addr[0][0] and frappe.db.exists("Address", dn_addr[0][0]):
		return dn_addr[0][0]

	linked = frappe.db.sql(
		"""
		SELECT parent FROM `tabDynamic Link`
		WHERE parenttype = 'Address'
			AND link_doctype = 'Customer'
			AND link_name = %(customer)s
		ORDER BY modified DESC
		LIMIT 1
		""",
		{"customer": customer},
	)
	if linked and linked[0][0]:
		return linked[0][0]
	return ""
