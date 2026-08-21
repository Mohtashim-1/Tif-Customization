from datetime import date

import frappe
from frappe.utils import flt, getdate, nowdate


DEPARTMENTS = [
	{"key": "cee", "label": "CEE", "keywords": ["cee", "special education", "s.edu", "teacher training"]},
	{"key": "qps", "label": "QPS", "keywords": ["qps", "quran program"]},
	{"key": "tps", "label": "TPS", "keywords": ["tps", "tilawat"]},
	{"key": "fa", "label": "F&A", "keywords": ["f&a", "finance", "accounts", "fa"]},
	{"key": "hr", "label": "HR", "keywords": ["hr", "human resource"]},
	{"key": "admin", "label": "Admin", "keywords": ["admin", "administration"]},
	{"key": "it", "label": "IT", "keywords": ["it", "information technology"]},
	{"key": "marketing", "label": "Marketing", "keywords": ["marketing", "mktg"]},
	{"key": "ceo", "label": "CEO", "keywords": ["ceo", "management"]},
]

PROGRAM_SALARY_DEPTS = {"qps", "cee", "tps"}
SUPPORT_SALARY_DEPTS = {"fa", "hr", "admin", "it", "marketing", "ceo"}


REPORT_ROWS = [
	{"row_type": "section", "label": "Salaries"},
	{
		"row_type": "data",
		"label": "QPS Staff Salaries",
		"is_salary": 1,
		"department_keys": ["qps"],
		"patterns": ["salary"],
	},
	{
		"row_type": "data",
		"label": "CEE Staff Salaries",
		"is_salary": 1,
		"department_keys": ["cee"],
		"patterns": ["salary"],
	},
	{
		"row_type": "data",
		"label": "TPS Staff Salaries",
		"is_salary": 1,
		"department_keys": ["tps"],
		"patterns": ["salary"],
	},
	{
		"row_type": "data",
		"label": "Other Support departments",
		"is_salary": 1,
		"department_keys": list(SUPPORT_SALARY_DEPTS),
		"include_unmatched": 1,
		"patterns": ["salary"],
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
	rows = frappe.db.sql(
		"""
		SELECT
			LOWER(COALESCE(acc.account_name, gle.account, '')) AS account_name,
			LOWER(COALESCE(gle.account, '')) AS account_id,
			LOWER(COALESCE(cc.cost_center_name, gle.cost_center, '')) AS cost_center_name,
			LOWER(COALESCE(gle.cost_center, '')) AS cost_center_id,
			LOWER(COALESCE(parent.cost_center_name, '')) AS parent_cost_center_name,
			LOWER(COALESCE(cc.parent_cost_center, '')) AS parent_cost_center_id,
			LOWER(COALESCE(gparent.cost_center_name, '')) AS grandparent_cost_center_name,
			LOWER(COALESCE(parent.parent_cost_center, '')) AS grandparent_cost_center_id,
			gle.party_type,
			gle.party,
			SUM(COALESCE(gle.debit, 0) - COALESCE(gle.credit, 0)) AS amount
		FROM `tabGL Entry` gle
		LEFT JOIN `tabAccount` acc ON acc.name = gle.account
		LEFT JOIN `tabCost Center` cc ON cc.name = gle.cost_center
		LEFT JOIN `tabCost Center` parent ON parent.name = cc.parent_cost_center
		LEFT JOIN `tabCost Center` gparent ON gparent.name = parent.parent_cost_center
		WHERE gle.docstatus < 2
		AND gle.posting_date BETWEEN %(from_date)s AND %(to_date)s
		AND IFNULL(gle.is_cancelled, 0) = 0
		-- This report is meant for expenses/capex. Exclude Income accounts so
		-- entries like "Rental Income" don't get netted against "Office Rentals".
		AND COALESCE(acc.root_type, '') != 'Income'
		GROUP BY
			account_name, account_id, cost_center_name, cost_center_id,
			parent_cost_center_name, parent_cost_center_id,
			grandparent_cost_center_name, grandparent_cost_center_id,
			gle.party_type, gle.party
		""",
		{"from_date": from_date, "to_date": to_date},
		as_dict=True,
	)
	_attach_employee_departments(rows)
	return rows


def _attach_employee_departments(rows):
	employees = {
		(r.get("party") or "").strip()
		for r in rows
		if (r.get("party_type") or "") == "Employee" and r.get("party")
	}
	if not employees:
		return

	dept_map = {
		row.name: (row.department or "").lower()
		for row in frappe.get_all(
			"Employee",
			filters={"name": ("in", list(employees))},
			fields=["name", "department"],
		)
	}
	for row in rows:
		if (row.get("party_type") or "") == "Employee" and row.get("party"):
			row["employee_department"] = dept_map.get(row.get("party"), "")
		else:
			row["employee_department"] = ""


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
	is_salary = int(config.get("is_salary") or 0)
	department_keys = set(config.get("department_keys") or [])
	include_unmatched = int(config.get("include_unmatched") or 0)

	total = 0.0
	by_department = {d["key"]: 0.0 for d in DEPARTMENTS}

	for entry in entries:
		if is_salary:
			if not _is_salary_account(entry):
				continue
			dept_key = _match_department(entry)
			if not _salary_row_includes_department(dept_key, department_keys, include_unmatched):
				continue
			amount = flt(entry.get("amount"))
			total += amount
			if dept_key:
				by_department[dept_key] += amount
			continue

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


def _salary_row_includes_department(dept_key, department_keys, include_unmatched=0):
	"""Decide if a salary GL amount belongs on this salary report row."""
	if not department_keys and not include_unmatched:
		return True
	if dept_key and dept_key in department_keys:
		return True
	# Other Support: non-program salaries (support depts + unmatched cost centers)
	if include_unmatched and dept_key not in PROGRAM_SALARY_DEPTS:
		return True
	return False


def _is_salary_account(entry):
	account_text = f"{entry.get('account_name', '')} {entry.get('account_id', '')}".lower()
	return "salary" in account_text or "salaries" in account_text


def _matches_patterns(entry, patterns, exclude_patterns=None):
	if not patterns:
		return False
	account_text = f"{entry.get('account_name', '')} {entry.get('account_id', '')}".lower()
	# Require ALL tokens when multiple are provided (AND), so "qps"+"salary"
	# style configs do not match every salary account.
	if not all(token in account_text for token in patterns):
		# Fallback: single-token patterns still match as before
		if len(patterns) == 1:
			if patterns[0] not in account_text:
				return False
		else:
			return False
	exclude_patterns = exclude_patterns or []
	if exclude_patterns and any(token in account_text for token in exclude_patterns):
		return False
	return True


def _department_text(entry):
	parts = [
		entry.get("cost_center_name", ""),
		entry.get("cost_center_id", ""),
		entry.get("parent_cost_center_name", ""),
		entry.get("parent_cost_center_id", ""),
		entry.get("grandparent_cost_center_name", ""),
		entry.get("grandparent_cost_center_id", ""),
		entry.get("employee_department", ""),
	]
	return " ".join(cstr_lower(p) for p in parts if p)


def cstr_lower(value):
	return (value or "").lower()


def _match_department(entry):
	text = _department_text(entry)
	if not text.strip():
		return None

	# Prefer longer / more specific keywords first to avoid "it" false positives.
	candidates = []
	for d in DEPARTMENTS:
		for keyword in d["keywords"]:
			kw = keyword.lower().strip()
			if not kw:
				continue
			if _keyword_in_text(kw, text):
				candidates.append((len(kw), d["key"]))
				break
	if not candidates:
		return None
	candidates.sort(reverse=True)
	return candidates[0][1]


def _keyword_in_text(keyword, text):
	"""Match keyword as substring, but guard short tokens like 'it' / 'fa' / 'hr'."""
	if len(keyword) <= 2:
		# word-ish boundary check
		padded = f" {text.replace('-', ' ').replace('/', ' ').replace('&', ' ')} "
		return f" {keyword} " in padded or f" {keyword} -" in f" {text} "
	return keyword in text


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


def _entry_matches_salary_row(entry, cfg, department_key=None):
	if not _is_salary_account(entry):
		return False
	dept_key = _match_department(entry)
	allowed = set(cfg.get("department_keys") or [])
	include_unmatched = int(cfg.get("include_unmatched") or 0)

	if department_key:
		if dept_key != department_key:
			return False
		return _salary_row_includes_department(dept_key, allowed, include_unmatched)

	return _salary_row_includes_department(dept_key, allowed, include_unmatched)


@frappe.whitelist()
def get_drilldown_entries(row_index, from_date, to_date, department_key=None):
	"""
	Return GL Entries (voucher-wise lines) matching an expense head (row_index) within a date range.
	Optional department_key filters by Cost Center / Employee Department for that department.
	"""
	cfg = _row_config_by_index(row_index)
	if cfg.get("row_type") != "data":
		frappe.throw("Drilldown is available only for expense head rows.")

	from_date = str(getdate(from_date))
	to_date = str(getdate(to_date))
	department_key = (department_key or "").strip() or None
	if department_key:
		_dept_keywords(department_key)

	# Salary rows: resolve in Python so parent cost center + employee department work.
	if int(cfg.get("is_salary") or 0):
		return _salary_drilldown(cfg, row_index, from_date, to_date, department_key)

	patterns = [p.lower().strip() for p in (cfg.get("patterns") or []) if p]
	exclude_patterns = [p.lower().strip() for p in (cfg.get("exclude_patterns") or []) if p]
	if not patterns:
		frappe.throw("No patterns configured for this row.")

	dept_keywords = _dept_keywords(department_key) if department_key else []

	account_text_expr = "LOWER(CONCAT(COALESCE(acc.account_name, ''), ' ', COALESCE(gle.account, '')))"
	cost_center_text_expr = (
		"LOWER(CONCAT("
		"COALESCE(cc.cost_center_name, ''), ' ', COALESCE(gle.cost_center, ''), ' ', "
		"COALESCE(parent.cost_center_name, ''), ' ', COALESCE(cc.parent_cost_center, ''), ' ', "
		"COALESCE(gparent.cost_center_name, ''), ' ', COALESCE(parent.parent_cost_center, ''), ' ', "
		"COALESCE(emp.department, '')"
		"))"
	)

	params = {"from_date": from_date, "to_date": to_date}

	like_clauses = []
	for idx, token in enumerate(patterns):
		key = f"p{idx}"
		like_clauses.append(f"{account_text_expr} LIKE %({key})s")
		params[key] = f"%{token}%"
	where_patterns = " AND ".join(like_clauses) if like_clauses else "1=0"

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

	joins = """
		FROM `tabGL Entry` gle
		LEFT JOIN `tabAccount` acc ON acc.name = gle.account
		LEFT JOIN `tabCost Center` cc ON cc.name = gle.cost_center
		LEFT JOIN `tabCost Center` parent ON parent.name = cc.parent_cost_center
		LEFT JOIN `tabCost Center` gparent ON gparent.name = parent.parent_cost_center
		LEFT JOIN `tabEmployee` emp
			ON gle.party_type = 'Employee' AND emp.name = gle.party
	"""

	summary = frappe.db.sql(
		f"""
		SELECT
			COUNT(DISTINCT CONCAT(COALESCE(gle.voucher_type, ''), '::', COALESCE(gle.voucher_no, ''))) AS voucher_count,
			SUM(COALESCE(gle.debit, 0) - COALESCE(gle.credit, 0)) AS total_amount
		{joins}
		WHERE gle.docstatus < 2
		AND IFNULL(gle.is_cancelled, 0) = 0
		AND gle.posting_date BETWEEN %(from_date)s AND %(to_date)s
		AND COALESCE(acc.root_type, '') != 'Income'
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
			parent.cost_center_name AS parent_cost_center_name,
			emp.department AS employee_department,
			gle.party_type,
			gle.party,
			gle.debit,
			gle.credit,
			( COALESCE(gle.debit, 0) - COALESCE(gle.credit, 0) ) AS amount,
			gle.remarks
		{joins}
		WHERE gle.docstatus < 2
		AND IFNULL(gle.is_cancelled, 0) = 0
		AND gle.posting_date BETWEEN %(from_date)s AND %(to_date)s
		AND COALESCE(acc.root_type, '') != 'Income'
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


def _salary_drilldown(cfg, row_index, from_date, to_date, department_key=None):
	raw = frappe.db.sql(
		"""
		SELECT
			gle.posting_date,
			gle.voucher_type,
			gle.voucher_no,
			gle.account,
			acc.account_name,
			gle.cost_center,
			cc.cost_center_name,
			parent.cost_center_name AS parent_cost_center_name,
			LOWER(COALESCE(cc.cost_center_name, gle.cost_center, '')) AS cost_center_name_l,
			LOWER(COALESCE(gle.cost_center, '')) AS cost_center_id,
			LOWER(COALESCE(parent.cost_center_name, '')) AS parent_cost_center_name_l,
			LOWER(COALESCE(cc.parent_cost_center, '')) AS parent_cost_center_id,
			LOWER(COALESCE(gparent.cost_center_name, '')) AS grandparent_cost_center_name,
			LOWER(COALESCE(parent.parent_cost_center, '')) AS grandparent_cost_center_id,
			gle.party_type,
			gle.party,
			emp.department AS employee_department,
			gle.debit,
			gle.credit,
			( COALESCE(gle.debit, 0) - COALESCE(gle.credit, 0) ) AS amount,
			gle.remarks,
			LOWER(COALESCE(acc.account_name, gle.account, '')) AS account_name,
			LOWER(COALESCE(gle.account, '')) AS account_id
		FROM `tabGL Entry` gle
		LEFT JOIN `tabAccount` acc ON acc.name = gle.account
		LEFT JOIN `tabCost Center` cc ON cc.name = gle.cost_center
		LEFT JOIN `tabCost Center` parent ON parent.name = cc.parent_cost_center
		LEFT JOIN `tabCost Center` gparent ON gparent.name = parent.parent_cost_center
		LEFT JOIN `tabEmployee` emp
			ON gle.party_type = 'Employee' AND emp.name = gle.party
		WHERE gle.docstatus < 2
		AND IFNULL(gle.is_cancelled, 0) = 0
		AND gle.posting_date BETWEEN %(from_date)s AND %(to_date)s
		AND COALESCE(acc.root_type, '') != 'Income'
		AND (
			LOWER(COALESCE(acc.account_name, gle.account, '')) LIKE '%%salary%%'
			OR LOWER(COALESCE(acc.account_name, gle.account, '')) LIKE '%%salaries%%'
		)
		ORDER BY gle.posting_date ASC, gle.voucher_type ASC, gle.voucher_no ASC, gle.name ASC
		""",
		{"from_date": from_date, "to_date": to_date},
		as_dict=True,
	)

	matched = []
	for row in raw:
		entry = {
			"account_name": row.get("account_name"),
			"account_id": row.get("account_id"),
			"cost_center_name": row.get("cost_center_name_l"),
			"cost_center_id": row.get("cost_center_id"),
			"parent_cost_center_name": row.get("parent_cost_center_name_l"),
			"parent_cost_center_id": row.get("parent_cost_center_id"),
			"grandparent_cost_center_name": row.get("grandparent_cost_center_name"),
			"grandparent_cost_center_id": row.get("grandparent_cost_center_id"),
			"employee_department": (row.get("employee_department") or "").lower(),
			"party_type": row.get("party_type"),
			"party": row.get("party"),
			"amount": row.get("amount"),
		}
		if _entry_matches_salary_row(entry, cfg, department_key):
			matched.append(row)

	limit = 2000
	truncated = len(matched) > limit
	entries = matched[:limit]
	voucher_keys = {
		f"{e.get('voucher_type') or ''}::{e.get('voucher_no') or ''}" for e in matched
	}

	return {
		"row_index": int(row_index),
		"row_label": cfg.get("label"),
		"from_date": from_date,
		"to_date": to_date,
		"department_key": department_key,
		"voucher_count": len(voucher_keys),
		"total_amount": sum(flt(e.get("amount")) for e in matched),
		"truncated": truncated,
		"entries": entries,
	}
