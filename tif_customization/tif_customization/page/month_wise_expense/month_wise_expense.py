from datetime import date

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
			{"label": "Events & Marketing Activities (Main)", "patterns": ["event", "marketing"]},
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
			{"label": "Events & Marketing Activities (Main)", "patterns": ["event", "marketing"]},
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
