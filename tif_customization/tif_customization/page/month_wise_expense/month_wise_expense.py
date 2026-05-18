from datetime import date

import calendar
import frappe
from frappe.utils import flt, getdate, nowdate


SECTIONS = [
	{
		"label": "Core operational Expenses",
		"rows": [
			{"label": "Salaries, benefits & allowances", "patterns": ["salary", "allowance", "benefit"]},
			{"label": "Office Rentals", "patterns": ["rent"]},
			{"label": "Travelling Expense", "patterns": ["travel"]},
			{"label": "Conveyance & Transportation (Staff)", "patterns": ["conveyance", "transport"]},
			{"label": "Communication (Mobile Balance & other)", "patterns": ["communication", "mobile"]},
			{"label": "Legal and Professional Core Operational", "patterns": ["legal", "professional"]},
			{"label": "Proofreading Expense", "patterns": ["proofreading"]},
			{"label": "Visiting Faculty", "patterns": ["visiting faculty"]},
			{"label": "Training & Workshop Expense", "patterns": ["training", "workshop"]},
			{"label": "Training & Workshop Refreshment", "patterns": ["training", "refreshment"]},
			{"label": "Entertainment & Other Refreshment", "patterns": ["entertainment", "refreshment"]},
			{"label": "Marketing & Promotions & other activities", "patterns": ["marketing", "promotion"]},
			{"label": "Events & Marketing Activities (Main)", "patterns": ["event"]},
			{"label": "TIF Giveaways", "patterns": ["giveaway"]},
			{"label": "Software Online Fee (Yearly)", "patterns": ["software", "online fee", "subscription"]},
			{"label": "Core Employee Skill Development", "patterns": ["skill development", "employee training"]},
			{"label": "Books for Research Material", "patterns": ["book", "research"]},
			{"label": "Printing, Photocopies & Stationery", "patterns": ["printing", "photocopy", "stationery"]},
			{"label": "Postage & Courier Charges", "patterns": ["postage", "courier"]},
			{"label": "Book Printing Expense", "patterns": ["book printing"]},
			{"label": "BookPrint Related others Exp + Transportation", "patterns": ["book", "transport"]},
		],
	},
	{
		"label": "Revenue Expenditures",
		"rows": [
			{"label": "Salaries, benefits & allowances", "patterns": ["salary", "allowance", "benefit"]},
			{"label": "Office Rentals", "patterns": ["rent"]},
			{"label": "Reimbursement (Iqra School)", "patterns": ["reimbursement", "iqra"]},
			{"label": "Travelling Expense", "patterns": ["travel"]},
			{"label": "Conveyance & Transportation (Staff)", "patterns": ["conveyance", "transport"]},
			{"label": "Utilities (K-Electric, Gas, KWSB)", "patterns": ["utility", "electric", "gas", "water"]},
			{"label": "Communication (PTCL, Mobile Balance)", "patterns": ["communication", "ptcl", "mobile"]},
			{"label": "Internet Expense", "patterns": ["internet"]},
			{"label": "Fuel Expense", "patterns": ["fuel"]},
			{"label": "Vehicle running & maintenance", "patterns": ["vehicle running", "vehicle maintenance", "fuel"]},
			{"label": "Vehicle Insurance (Paid & Refund)", "patterns": ["vehicle insurance", "takaful", "insurance"]},
			{"label": "Generator & UPS maintenance", "patterns": ["generator", "ups", "maintenance"]},
			{"label": "Office maintenance expense", "patterns": ["office maintenance"]},
			{"label": "Office Maint & Renovation Work (Main)", "patterns": ["renovation"]},
			{"label": "Tea Expense (Staff & Others)", "patterns": ["tea", "food", "refreshment"]},
			{"label": "Entertainment & Other Refreshment", "patterns": ["entertainment", "refreshment"]},
			{"label": "Office Supplies (Grocery, Crokery)", "patterns": ["grocery", "crockery", "office supplies"]},
			{"label": "General Expense", "patterns": ["general expense"]},
			{"label": "Legal and Professional - back office", "patterns": ["legal", "professional"]},
			{"label": "Employee Skill Development", "patterns": ["skill development", "employee training"]},
			{"label": "Printing, Photocopies & Stationery", "patterns": ["printing", "photocopy", "stationery"]},
			{"label": "Postage & Courier Charges", "patterns": ["postage", "courier"]},
			{"label": "Marketing & Promotions & other activities", "patterns": ["marketing", "promotion"]},
			{"label": "Events & Marketing Activities (Main)", "patterns": ["event"]},
			{"label": "Website Maintenance Expense", "patterns": ["website", "hosting", "domain"]},
			{"label": "Software Online Fee (Yearly)", "patterns": ["software", "online fee", "subscription"]},
			{"label": "IT & Computer Expenses", "patterns": ["computer", "it expense"]},
			{"label": "Bank Charges", "patterns": ["bank charge"]},
			{"label": "External Auditor", "patterns": ["external auditor", "audit"]},
			{"label": "Internal Auditors", "patterns": ["internal auditor"]},
		],
	},
	{
		"label": "Capital Expenditures",
		"rows": [
			{"label": "Computer Accessories (PC, Laptop, Other)", "patterns": ["computer", "laptop", "accessories"]},
			{"label": "Mobile Phone (Sets)", "patterns": ["mobile phone", "cell phone"]},
			{"label": "Land & Building", "patterns": ["land", "building"]},
			{"label": "Furniture & Fixture", "patterns": ["furniture", "fixture"]},
			{"label": "Intangible - ERP", "patterns": ["erp", "intangible"]},
			{"label": "Electrical equipments", "patterns": ["electrical"]},
			{"label": "UPS System", "patterns": ["ups"]},
			{"label": "Camera (CCTV)", "patterns": ["camera", "cctv"]},
			{"label": "Generator/Solar Energy/Battery", "patterns": ["generator", "solar", "battery"]},
			{"label": "Vehicle", "patterns": ["vehicle purchase", "motor vehicle", "car purchase"]},
		],
	},
]


@frappe.whitelist()
def get_report_data():
	today = getdate(nowdate())
	fy_start_year = today.year if today.month >= 7 else today.year - 1
	fy_start = date(fy_start_year, 7, 1)
	fy_end = date(fy_start_year + 1, 6, 30)

	months = _fy_months(fy_start_year)
	entries = _fetch_gl_data(str(fy_start), str(fy_end))

	section_data = []
	for section in SECTIONS:
		rows = []
		for row_cfg in section["rows"]:
			row = _build_row(row_cfg, months, entries, today)
			rows.append(row)
		rows.append(_build_total_row(rows, months, today))
		section_data.append({"label": section["label"], "rows": rows})

	return {
		"fiscal_year_label": f"Year {fy_start_year} - {fy_start_year + 1}",
		"fiscal_year_from_date": str(fy_start),
		"fiscal_year_to_date": str(fy_end),
		"as_on_date": str(today),
		"months": months,
		"sections": section_data,
	}


def _fy_months(fy_start_year):
	month_defs = [
		("July", fy_start_year, 7),
		("August", fy_start_year, 8),
		("September", fy_start_year, 9),
		("October", fy_start_year, 10),
		("November", fy_start_year, 11),
		("December", fy_start_year, 12),
		("January", fy_start_year + 1, 1),
		("February", fy_start_year + 1, 2),
		("March", fy_start_year + 1, 3),
		("April", fy_start_year + 1, 4),
		("May", fy_start_year + 1, 5),
		("June", fy_start_year + 1, 6),
	]
	return [
		{"label": lbl, "key": f"{y}-{m:02d}", "year": y, "month": m}
		for lbl, y, m in month_defs
	]


def _fetch_gl_data(from_date, to_date):
	return frappe.db.sql(
		"""
		SELECT
			LOWER(COALESCE(acc.account_name, gle.account, '')) AS account_name,
			LOWER(COALESCE(gle.account, '')) AS account_id,
			DATE_FORMAT(gle.posting_date, '%%Y-%%m') AS month_key,
			SUM(COALESCE(gle.debit, 0) - COALESCE(gle.credit, 0)) AS amount
		FROM `tabGL Entry` gle
		LEFT JOIN `tabAccount` acc ON acc.name = gle.account
		WHERE gle.docstatus < 2
		AND gle.posting_date BETWEEN %(from_date)s AND %(to_date)s
		AND IFNULL(gle.is_cancelled, 0) = 0
		-- Keep this as an expense/capex report; don't net Income accounts into totals.
		AND COALESCE(acc.root_type, '') != 'Income'
		GROUP BY account_name, account_id, month_key
		""",
		{"from_date": from_date, "to_date": to_date},
		as_dict=True,
	)


def _build_row(row_cfg, months, entries, today):
	patterns = [p.lower().strip() for p in (row_cfg.get("patterns") or []) if p]
	month_values = {}
	total = 0.0

	for month in months:
		month_key = month["key"]
		month_date = date(month["year"], month["month"], 1)
		if month_date > date(today.year, today.month, 1):
			month_values[month_key] = None
			continue

		amount = 0.0
		for entry in entries:
			if entry.get("month_key") != month_key:
				continue
			if _matches_patterns(entry, patterns):
				amount += flt(entry.get("amount"))
		month_values[month_key] = amount
		total += amount

	return {"row_type": "data", "label": row_cfg["label"], "month_values": month_values, "total": total}


def _build_total_row(rows, months, today):
	month_values = {}
	total = 0.0
	for month in months:
		month_key = month["key"]
		month_date = date(month["year"], month["month"], 1)
		if month_date > date(today.year, today.month, 1):
			month_values[month_key] = None
			continue
		month_sum = sum(flt((r.get("month_values") or {}).get(month_key)) for r in rows)
		month_values[month_key] = month_sum
		total += month_sum
	return {"row_type": "total", "label": "Total", "month_values": month_values, "total": total}


def _matches_patterns(entry, patterns):
	if not patterns:
		return False
	text = f"{entry.get('account_name', '')} {entry.get('account_id', '')}".lower()
	return any(p in text for p in patterns)


def _get_row_patterns(section_label, row_label):
	section_label = (section_label or "").strip()
	row_label = (row_label or "").strip()
	for section in SECTIONS:
		if (section.get("label") or "").strip() != section_label:
			continue
		for row in section.get("rows") or []:
			if (row.get("label") or "").strip() == row_label:
				return [p.lower().strip() for p in (row.get("patterns") or []) if p]
	return []


@frappe.whitelist()
def get_drilldown_entries(section_label, row_label, month_key=None):
	"""
	Return GL Entries matching a row's patterns for either a given month (YYYY-MM) or the current FY.
	"""
	patterns = _get_row_patterns(section_label, row_label)
	if not patterns:
		frappe.throw(f"Unknown row: {section_label} / {row_label}")

	today = getdate(nowdate())
	fy_start_year = today.year if today.month >= 7 else today.year - 1
	fy_start = date(fy_start_year, 7, 1)
	fy_end = date(fy_start_year + 1, 6, 30)

	from_date = fy_start
	to_date = fy_end
	month_key = (month_key or "").strip()
	if month_key:
		try:
			year_str, month_str = month_key.split("-", 1)
			year = int(year_str)
			month = int(month_str)
			from_date = date(year, month, 1)
			to_date = date(year, month, calendar.monthrange(year, month)[1])
		except Exception:
			frappe.throw(f"Invalid month_key: {month_key}")

	# Avoid pulling data for future months beyond current month
	if from_date > date(today.year, today.month, 1):
		return {"entries": [], "total": 0.0, "from_date": str(from_date), "to_date": str(to_date), "truncated": False}

	text_expr = "LOWER(CONCAT(COALESCE(acc.account_name, ''), ' ', COALESCE(gle.account, '')))"
	like_clauses = []
	params = {"from_date": str(from_date), "to_date": str(min(to_date, today))}
	for idx, token in enumerate(patterns):
		param_key = f"p{idx}"
		like_clauses.append(f"{text_expr} LIKE %({param_key})s")
		params[param_key] = f"%{token}%"

	where_patterns = " OR ".join(like_clauses) if like_clauses else "1=0"

	limit = 2000
	params["limit"] = limit + 1
	rows = frappe.db.sql(
		f"""
		SELECT
			gle.posting_date,
			gle.voucher_type,
			gle.voucher_no,
			gle.account,
			acc.account_name,
			gle.cost_center,
			gle.party_type,
			gle.party,
			gle.debit,
			gle.credit,
			( COALESCE(gle.debit, 0) - COALESCE(gle.credit, 0) ) AS amount,
			gle.remarks
		FROM `tabGL Entry` gle
		LEFT JOIN `tabAccount` acc ON acc.name = gle.account
		WHERE gle.docstatus < 2
		AND IFNULL(gle.is_cancelled, 0) = 0
		AND gle.posting_date BETWEEN %(from_date)s AND %(to_date)s
		AND COALESCE(acc.root_type, '') != 'Income'
		AND ( {where_patterns} )
		ORDER BY gle.posting_date ASC, gle.voucher_type ASC, gle.voucher_no ASC, gle.name ASC
		LIMIT %(limit)s
		""",
		params,
		as_dict=True,
	)

	truncated = len(rows) > limit
	rows = rows[:limit]
	total = sum(flt(r.get("amount")) for r in rows)

	return {
		"section_label": section_label,
		"row_label": row_label,
		"from_date": str(from_date),
		"to_date": str(min(to_date, today)),
		"entries": rows,
		"total": total,
		"truncated": truncated,
	}
