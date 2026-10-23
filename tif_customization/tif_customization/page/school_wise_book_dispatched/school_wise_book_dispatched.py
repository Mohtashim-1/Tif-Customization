# Copyright (c) 2026, TIF Customization and contributors
# License: MIT

import json

import frappe
from frappe.utils import add_days, cstr, flt, getdate, today

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
def get_item_wise_dispatch(filters=None):
	"""Item-wise outgoing qty for one school/customer within the report filters."""
	filters = _parse_filters(filters)
	customer = cstr(filters.get("customer") or "").strip()
	school = cstr(filters.get("school") or "").strip()
	school_name = cstr(filters.get("school_name") or "").strip()
	if not customer and not school and not school_name:
		frappe.throw(frappe._("Customer or school is required."))

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

	# Prefer exact customer match when available
	if customer:
		where.append("dn.customer = %(customer)s")
		params["customer"] = customer
	else:
		_apply_school_name_filter(
			where,
			params,
			{"school": school, "school_name": school_name, "customer": ""},
			customer_field="dn.customer",
			customer_name_field="dn.customer_name",
		)

	book_type = (filters.get("book_type") or "").strip()
	if book_type == "MQH":
		where.append(f"({_mqh_case()})")
	elif book_type == "Qaida":
		where.append(
			"(UPPER(COALESCE(dni.item_name,'')) LIKE '%%QAIDA%%' OR UPPER(COALESCE(dni.item_code,'')) LIKE '%%QAIDA%%')"
		)
	elif book_type == "Guide":
		where.append(
			"(UPPER(COALESCE(dni.item_name,'')) LIKE '%%GUIDE%%' OR UPPER(COALESCE(dni.item_code,'')) LIKE '%%GUIDE%%')"
		)
	elif book_type in ("KP Edition", "KPK Edition"):
		where.append(f"({_kpk_edition_case()})")

	where_clause = " AND ".join(where)
	rows = frappe.db.sql(
		f"""
		SELECT
			dni.item_code,
			COALESCE(NULLIF(dni.item_name, ''), dni.item_code) AS item_name,
			COALESCE(dni.stock_uom, dni.uom, 'Nos') AS uom,
			SUM(COALESCE(dni.qty, 0)) AS qty,
			COUNT(DISTINCT dn.name) AS delivery_notes,
			MAX(dn.posting_date) AS last_dispatch_date
		FROM `tabDelivery Note` dn
		INNER JOIN `tabDelivery Note Item` dni ON dni.parent = dn.name
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
		if row.get("last_dispatch_date"):
			row["last_dispatch_date"] = str(getdate(row["last_dispatch_date"]))
		# Book type label for display
		code = cstr(row.get("item_code") or "").upper()
		name = cstr(row.get("item_name") or "").upper()
		if (
			code.startswith("MQKP")
			or "KPK" in code
			or "KPK" in name
			or " KP " in f" {name} "
			or name.startswith("KP ")
			or "KHYBER" in name
			or "PAKHTUN" in name
		):
			row["book_type"] = "KP Edition"
		elif "QAIDA" in name or "QAIDA" in code:
			row["book_type"] = "Qaida"
		elif "GUIDE" in name or "GUIDE" in code:
			row["book_type"] = "Guide"
		elif "MQH" in name or "MQH" in code:
			row["book_type"] = "MQH"
		else:
			row["book_type"] = "Other"

	label = school_name or customer or school
	return {
		"label": label,
		"customer": customer,
		"from_date": str(filters["from_date"]),
		"to_date": str(filters["to_date"]),
		"rows": rows,
		"total_qty": total_qty,
		"item_count": len(rows),
	}


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
			"LOWER(TRIM(COALESCE(s.city, addr.city, dn.custom_city, ''))) = LOWER(%(city)s)"
		)
		params["city"] = filters["city"]

	if filters.get("province"):
		where.append(
			"LOWER(TRIM(COALESCE(s.province, addr.state, ''))) = LOWER(%(province)s)"
		)
		params["province"] = filters["province"]

	if filters.get("area"):
		where.append(
			"LOWER(TRIM(COALESCE(s.area, addr.custom_area, dn.custom_area, ''))) = LOWER(%(area)s)"
		)
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
	if book_type == "MQH":
		where.append(f"({_mqh_case()})")
	elif book_type == "Qaida":
		where.append(
			"(UPPER(COALESCE(dni.item_name,'')) LIKE '%%QAIDA%%' OR UPPER(COALESCE(dni.item_code,'')) LIKE '%%QAIDA%%')"
		)
	elif book_type == "Guide":
		where.append(
			"(UPPER(COALESCE(dni.item_name,'')) LIKE '%%GUIDE%%' OR UPPER(COALESCE(dni.item_code,'')) LIKE '%%GUIDE%%')"
		)
	elif book_type in ("KP Edition", "KPK Edition"):
		where.append(f"({_kpk_edition_case()})")

	where_clause = " AND ".join(where)
	rows = frappe.db.sql(
		f"""
		SELECT
			COALESCE(s.name, '') AS school,
			COALESCE(NULLIF(s.school_name, ''), dn.customer_name, dn.customer) AS school_name,
			COALESCE(dn.customer_name, '') AS customer_name,
			dn.customer AS customer,
			COALESCE(cust.customer_type, '') AS customer_type,
			COALESCE(s.status, '') AS school_status,
			COALESCE(s.city, addr.city, dn.custom_city, '') AS city,
			COALESCE(s.province, addr.state, '') AS province,
			COALESCE(s.area, addr.custom_area, dn.custom_area, '') AS area,
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
			SUM(
				CASE
					WHEN {_kpk_edition_case()}
					THEN COALESCE(dni.qty, 0) ELSE 0
				END
			) AS kpk_qty,
			MAX(dn.posting_date) AS last_dispatch_date
		FROM `tabDelivery Note` dn
		INNER JOIN `tabDelivery Note Item` dni ON dni.parent = dn.name
		LEFT JOIN `tabCustomer` cust ON cust.name = dn.customer
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
			COALESCE(cust.customer_type, ''),
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
		row["kpk_qty"] = flt(row.get("kpk_qty"))
		row["other_qty"] = max(
			0.0,
			flt(
				row["total_qty"]
				- row["mqh_qty"]
				- row["qaida_qty"]
				- row["guide_qty"]
				- row["kpk_qty"]
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


def _mqh_case():
	"""MQH books excluding KP Edition so the two cards don't overlap."""
	return (
		"(UPPER(COALESCE(dni.item_name,'')) LIKE '%%MQH%%' "
		"OR UPPER(COALESCE(dni.item_code,'')) LIKE '%%MQH%%') "
		f"AND NOT ({_kpk_edition_case()})"
	)


def _build_summary(rows):
	school_type_count = 0
	individual_count = 0
	mqh_school_count = 0
	qaida_school_count = 0
	guide_school_count = 0
	kpk_school_count = 0
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
		"mqh_school_count": mqh_school_count,
		"qaida_school_count": qaida_school_count,
		"guide_school_count": guide_school_count,
		"kpk_school_count": kpk_school_count,
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
