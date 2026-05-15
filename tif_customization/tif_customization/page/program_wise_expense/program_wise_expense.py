from datetime import date

import frappe
from frappe.utils import flt, getdate, nowdate


DEPARTMENTS = [
	{"key": "cee", "label": "CEE", "keywords": ["cee"]},
	{"key": "qps", "label": "QPS", "keywords": ["qps"]},
	{"key": "tps", "label": "TPS", "keywords": ["tps"]},
	{"key": "fa", "label": "F&A", "keywords": ["f&a", "finance", "accounts", "fa"]},
	{"key": "hr", "label": "HR", "keywords": ["hr", "human resource"]},
	{"key": "admin", "label": "Admin", "keywords": ["admin", "administration"]},
	{"key": "it", "label": "IT", "keywords": ["it", "information technology"]},
	{"key": "marketing", "label": "Marketing", "keywords": ["marketing"]},
	{"key": "ceo", "label": "CEO", "keywords": ["ceo"]},
]


REPORT_ROWS = [
	{"row_type": "section", "label": "Salaries"},
	{"row_type": "data", "label": "QPS Staff Salaries", "patterns": ["qps", "salary"]},
	{"row_type": "data", "label": "CEE Staff Salaries", "patterns": ["cee", "salary"]},
	{"row_type": "data", "label": "TPS Staff Salaries", "patterns": ["tps", "salary"]},
	{
		"row_type": "data",
		"label": "Other Support departments",
		"patterns": ["salary"],
		"exclude_patterns": ["qps", "cee", "tps"],
	},
	{"row_type": "total", "label": "Total", "section": "Salaries"},
	{"row_type": "spacer"},
	{"row_type": "section", "label": "Operational Expenses"},
	{"row_type": "data", "label": "Training & Workshop Expense", "patterns": ["training", "workshop"]},
	{"row_type": "data", "label": "TTC Conveyance Allowance", "patterns": ["ttc", "conveyance"]},
	{
		"row_type": "data",
		"label": "Book Printing Expense and Transportation",
		"patterns": ["book printing", "transport", "transportation"],
	},
	{"row_type": "data", "label": "Office Rentals", "patterns": ["rent"]},
	{"row_type": "data", "label": "Travelling and Conveyance Expense", "patterns": ["travel", "conveyance"]},
	{"row_type": "data", "label": "Marketing & Promotions & other activities", "patterns": ["marketing", "promotion"]},
	{"row_type": "data", "label": "TIF Giveaways", "patterns": ["giveaway"]},
	{"row_type": "data", "label": "Legal and Professional Core Operational", "patterns": ["legal", "professional"]},
	{"row_type": "data", "label": "Fees and Subscriptions", "patterns": ["subscription", "fee"]},
	{"row_type": "data", "label": "Printing, Photocopies & Stationery", "patterns": ["printing", "photocopy", "stationery"]},
	{"row_type": "data", "label": "Staff Tea and Food Expenses", "patterns": ["food", "tea", "refreshment"]},
	{"row_type": "data", "label": "Office Supplies (Grocery, Crokery)", "patterns": ["grocery", "crockery", "office supplies"]},
	{"row_type": "data", "label": "Utlities (K-Electric, Gas, KWSB)", "patterns": ["utility", "electric", "gas", "water"]},
	{
		"row_type": "data",
		"label": "Communication (PTCL, Mobile Balance & Internet)",
		"patterns": ["communication", "internet", "mobile", "ptcl", "telephone"],
	},
	{"row_type": "data", "label": "Courier charges", "patterns": ["courier"]},
	{
		"row_type": "data",
		"label": "Vehicle running & maintenance",
		"patterns": ["vehicle running", "vehicle maintenance", "fuel"],
	},
	{"row_type": "data", "label": "Vehicle Takaful", "patterns": ["takaful", "insurance"]},
	{"row_type": "data", "label": "Office maintenance expense", "patterns": ["office maintenance"]},
	{"row_type": "data", "label": "Website Maintenance Expense", "patterns": ["website", "domain", "hosting"]},
	{"row_type": "data", "label": "IT & Computer Expenses", "patterns": ["computer", "software", "it expense"]},
	{"row_type": "data", "label": "Bank Charges", "patterns": ["bank charge"]},
	{"row_type": "data", "label": "Depreciation", "patterns": ["depreciation"]},
	{"row_type": "data", "label": "External Auditor", "patterns": ["auditor", "audit"]},
	{"row_type": "data", "label": "Donation", "patterns": ["donation"]},
	{"row_type": "total", "label": "Total", "section": "Operational Expenses"},
	{"row_type": "spacer"},
	{"row_type": "section", "label": "Capital Expenditures"},
	{"row_type": "data", "label": "Computer Accessories (PC, Laptop, Other)", "patterns": ["computer", "laptop", "accessories"]},
	{"row_type": "data", "label": "Mobile Phone (Sets)", "patterns": ["mobile phone", "cell phone"]},
	{"row_type": "data", "label": "Land & Building", "patterns": ["land", "building"]},
	{"row_type": "data", "label": "Furniture & Fixture", "patterns": ["furniture", "fixture"]},
	{"row_type": "data", "label": "Intangible - ERP", "patterns": ["erp", "intangible"]},
	{"row_type": "data", "label": "Electrical equipments", "patterns": ["electrical"]},
	{"row_type": "data", "label": "UPS System", "patterns": ["ups"]},
	{"row_type": "data", "label": "Camera (CCTV)", "patterns": ["camera", "cctv"]},
	{"row_type": "data", "label": "Generator/Solar Energy/Battery", "patterns": ["generator", "solar", "battery"]},
	{"row_type": "data", "label": "Vehicle", "patterns": ["vehicle purchase", "motor vehicle", "car purchase"]},
	{"row_type": "total", "label": "Total", "section": "Capital Expenditures"},
	{"row_type": "spacer"},
	{"row_type": "grand_total", "label": "Total Expenses"},
]


@frappe.whitelist()
def get_report_data(from_date=None, to_date=None):
	today = getdate(nowdate())

	# Optional custom date range (single "Selected Range" bucket)
	if from_date or to_date:
		from_dt = getdate(from_date) if from_date else None
		to_dt = getdate(to_date) if to_date else None

		# Sensible defaults if only one side is provided
		if not from_dt and to_dt:
			from_dt = to_dt
		if from_dt and not to_dt:
			to_dt = today

		if from_dt > to_dt:
			from_dt, to_dt = to_dt, from_dt
		entries = _fetch_gl_data(str(from_dt), str(to_dt))
		return {
			"fiscal_year_label": "Selected Range",
			"fiscal_year_from_date": str(from_dt),
			"fiscal_year_to_date": str(to_dt),
			"as_on_date": str(to_dt),
			"departments": [{"key": d["key"], "label": d["label"]} for d in DEPARTMENTS],
			"quarters": [
				{
					"key": "range",
					"label": "Selected Range",
					"from_date": str(from_dt),
					"to_date": str(to_dt),
					"effective_to_date": str(to_dt),
					"is_current_quarter": True,
					"rows": _build_rows(entries),
				}
			],
		}

	fy_start_year = today.year if today.month >= 7 else today.year - 1
	fy_start = date(fy_start_year, 7, 1)
	fy_end = date(fy_start_year + 1, 6, 30)

	quarters = [
		{"key": "q1", "label": "Q1 (Jul-Sep)", "from_date": date(fy_start_year, 7, 1), "to_date": date(fy_start_year, 9, 30)},
		{"key": "q2", "label": "Q2 (Oct-Dec)", "from_date": date(fy_start_year, 10, 1), "to_date": date(fy_start_year, 12, 31)},
		{"key": "q3", "label": "Q3 (Jan-Mar)", "from_date": date(fy_start_year + 1, 1, 1), "to_date": date(fy_start_year + 1, 3, 31)},
		{"key": "q4", "label": "Q4 (Apr-Jun)", "from_date": date(fy_start_year + 1, 4, 1), "to_date": date(fy_start_year + 1, 6, 30)},
	]

	quarter_payload = []
	for q in quarters:
		from_date = q["from_date"]
		to_date = q["to_date"]
		if today < from_date:
			entries = []
			effective_to = from_date
		else:
			effective_to = min(to_date, today)
			entries = _fetch_gl_data(str(from_date), str(effective_to))

		quarter_payload.append(
			{
				"key": q["key"],
				"label": q["label"],
				"from_date": str(from_date),
				"to_date": str(to_date),
				"effective_to_date": str(effective_to),
				"is_current_quarter": from_date <= today <= to_date,
				"rows": _build_rows(entries),
			}
		)

	return {
		"fiscal_year_label": f"FY {fy_start_year}-{str(fy_start_year + 1)[2:]}",
		"fiscal_year_from_date": str(fy_start),
		"fiscal_year_to_date": str(fy_end),
		"as_on_date": str(today),
		"departments": [{"key": d["key"], "label": d["label"]} for d in DEPARTMENTS],
		"quarters": quarter_payload,
	}


def _fetch_gl_data(from_date, to_date):
	return frappe.db.sql(
		"""
		SELECT
			LOWER(COALESCE(acc.account_name, gle.account, '')) AS account_name,
			LOWER(COALESCE(gle.account, '')) AS account_id,
			LOWER(COALESCE(cc.cost_center_name, gle.cost_center, '')) AS cost_center_name,
			LOWER(COALESCE(gle.cost_center, '')) AS cost_center_id,
			SUM(COALESCE(gle.debit, 0) - COALESCE(gle.credit, 0)) AS amount
		FROM `tabGL Entry` gle
		LEFT JOIN `tabAccount` acc ON acc.name = gle.account
		LEFT JOIN `tabCost Center` cc ON cc.name = gle.cost_center
		WHERE gle.docstatus < 2
		AND gle.posting_date BETWEEN %(from_date)s AND %(to_date)s
		AND IFNULL(gle.is_cancelled, 0) = 0
		GROUP BY account_name, account_id, cost_center_name, cost_center_id
		""",
		{"from_date": from_date, "to_date": to_date},
		as_dict=True,
	)


def _build_rows(entries):
	rows = []
	section_bucket = {}

	for cfg in REPORT_ROWS:
		row_type = cfg.get("row_type")

		if row_type == "spacer":
			rows.append({"row_type": "spacer"})
			continue

		if row_type == "section":
			rows.append({"row_type": "section", "label": cfg.get("label")})
			continue

		if row_type == "data":
			row = _build_data_row(cfg, entries)
			rows.append(row)
			section = _current_section(rows)
			if section:
				section_bucket.setdefault(section, []).append(row)
			continue

		if row_type == "total":
			section = cfg.get("section")
			total_row = _sum_rows(section_bucket.get(section, []))
			total_row.update({"row_type": "total", "label": cfg.get("label")})
			rows.append(total_row)
			continue

		if row_type == "grand_total":
			section_totals = [r for r in rows if r.get("row_type") == "total"]
			grand = _sum_rows(section_totals)
			grand.update({"row_type": "grand_total", "label": cfg.get("label")})
			rows.append(grand)

	return rows


def _build_data_row(config, entries):
	patterns = [p.lower().strip() for p in (config.get("patterns") or []) if p]
	exclude_patterns = [p.lower().strip() for p in (config.get("exclude_patterns") or []) if p]

	total = 0.0
	by_department = {d["key"]: 0.0 for d in DEPARTMENTS}

	for entry in entries:
		if not _matches_patterns(entry, patterns, exclude_patterns):
			continue
		amount = flt(entry.get("amount"))
		total += amount
		dept_key = _match_department(entry)
		if dept_key:
			by_department[dept_key] += amount

	return {
		"row_type": "data",
		"label": config.get("label"),
		"total": total,
		"by_department": by_department,
	}


def _matches_patterns(entry, patterns, exclude_patterns=None):
	if not patterns:
		return False
	account_text = f"{entry.get('account_name', '')} {entry.get('account_id', '')}".lower()
	if not any(token in account_text for token in patterns):
		return False
	exclude_patterns = exclude_patterns or []
	if exclude_patterns and any(token in account_text for token in exclude_patterns):
		return False
	return True


def _match_department(entry):
	text = f"{entry.get('cost_center_name', '')} {entry.get('cost_center_id', '')}".lower()
	for d in DEPARTMENTS:
		if any(k in text for k in d["keywords"]):
			return d["key"]
	return None


def _sum_rows(rows):
	total = {
		"total": 0.0,
		"by_department": {d["key"]: 0.0 for d in DEPARTMENTS},
	}
	for row in rows:
		total["total"] += flt(row.get("total"))
		for d in DEPARTMENTS:
			key = d["key"]	
			total["by_department"][key] += flt((row.get("by_department") or {}).get(key))
	return total


def _current_section(rows):
	for row in reversed(rows):
		if row.get("row_type") == "section":
			return row.get("label")
	return None


def _row_config_by_index(row_index):
	try:
		row_index = int(row_index)
	except Exception:
		frappe.throw("Invalid row_index")

	idx = -1
	for cfg in REPORT_ROWS:
		row_type = cfg.get("row_type")
		idx += 1
		if idx == row_index:
			return cfg

	frappe.throw("Invalid row_index")


def _dept_keywords(department_key):
	if not department_key:
		return []
	for d in DEPARTMENTS:
		if d.get("key") == department_key:
			return [k.lower().strip() for k in (d.get("keywords") or []) if k]
	frappe.throw(f"Invalid department_key: {department_key}")


@frappe.whitelist()
def get_drilldown_entries(row_index, from_date, to_date, department_key=None):
	"""
	Return GL Entries (voucher-wise lines) matching an expense head (row_index) within a date range.
	Optional department_key filters by Cost Center keywords for that department.
	"""
	cfg = _row_config_by_index(row_index)
	if cfg.get("row_type") != "data":
		frappe.throw("Drilldown is available only for expense head rows.")

	patterns = [p.lower().strip() for p in (cfg.get("patterns") or []) if p]
	exclude_patterns = [p.lower().strip() for p in (cfg.get("exclude_patterns") or []) if p]
	if not patterns:
		frappe.throw("No patterns configured for this row.")

	dept_keywords = _dept_keywords((department_key or "").strip() or None)

	from_date = str(getdate(from_date))
	to_date = str(getdate(to_date))

	account_text_expr = "LOWER(CONCAT(COALESCE(acc.account_name, ''), ' ', COALESCE(gle.account, '')))"
	cost_center_text_expr = "LOWER(CONCAT(COALESCE(cc.cost_center_name, ''), ' ', COALESCE(gle.cost_center, '')))"

	params = {"from_date": from_date, "to_date": to_date}

	like_clauses = []
	for idx, token in enumerate(patterns):
		key = f"p{idx}"
		like_clauses.append(f"{account_text_expr} LIKE %({key})s")
		params[key] = f"%{token}%"
	where_patterns = " OR ".join(like_clauses) if like_clauses else "1=0"

	where_exclude = ""
	if exclude_patterns:
		ex = []
		for idx, token in enumerate(exclude_patterns):
			key = f"ex{idx}"
			ex.append(f"{account_text_expr} LIKE %({key})s")
			params[key] = f"%{token}%"
		where_exclude = f" AND NOT ( {' OR '.join(ex)} ) "

	where_dept = ""
	if dept_keywords:
		de = []
		for idx, token in enumerate(dept_keywords):
			key = f"d{idx}"
			de.append(f"{cost_center_text_expr} LIKE %({key})s")
			params[key] = f"%{token}%"
		where_dept = f" AND ( {' OR '.join(de)} ) "

	where_sql = f"( {where_patterns} ) {where_exclude} {where_dept}"

	# Accurate totals even if the entries list is truncated
	summary = frappe.db.sql(
		f"""
		SELECT
			COUNT(DISTINCT CONCAT(COALESCE(gle.voucher_type, ''), '::', COALESCE(gle.voucher_no, ''))) AS voucher_count,
			SUM(COALESCE(gle.debit, 0) - COALESCE(gle.credit, 0)) AS total_amount
		FROM `tabGL Entry` gle
		LEFT JOIN `tabAccount` acc ON acc.name = gle.account
		LEFT JOIN `tabCost Center` cc ON cc.name = gle.cost_center
		WHERE gle.docstatus < 2
		AND IFNULL(gle.is_cancelled, 0) = 0
		AND gle.posting_date BETWEEN %(from_date)s AND %(to_date)s
		AND {where_sql}
		""",
		params,
		as_dict=True,
	)
	summary = (summary or [{}])[0] or {}

	limit = 2000
	params["limit"] = limit + 1
	entries = frappe.db.sql(
		f"""
		SELECT
			gle.posting_date,
			gle.voucher_type,
			gle.voucher_no,
			gle.account,
			acc.account_name,
			gle.cost_center,
			cc.cost_center_name,
			gle.party_type,
			gle.party,
			gle.debit,
			gle.credit,
			( COALESCE(gle.debit, 0) - COALESCE(gle.credit, 0) ) AS amount,
			gle.remarks
		FROM `tabGL Entry` gle
		LEFT JOIN `tabAccount` acc ON acc.name = gle.account
		LEFT JOIN `tabCost Center` cc ON cc.name = gle.cost_center
		WHERE gle.docstatus < 2
		AND IFNULL(gle.is_cancelled, 0) = 0
		AND gle.posting_date BETWEEN %(from_date)s AND %(to_date)s
		AND {where_sql}
		ORDER BY gle.posting_date ASC, gle.voucher_type ASC, gle.voucher_no ASC, gle.name ASC
		LIMIT %(limit)s
		""",
		params,
		as_dict=True,
	)

	truncated = len(entries) > limit
	entries = entries[:limit]

	return {
		"row_index": int(row_index),
		"row_label": cfg.get("label"),
		"from_date": from_date,
		"to_date": to_date,
		"department_key": department_key,
		"voucher_count": int(summary.get("voucher_count") or 0),
		"total_amount": flt(summary.get("total_amount") or 0),
		"truncated": truncated,
		"entries": entries,
	}
