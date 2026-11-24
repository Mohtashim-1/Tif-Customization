"""Import TIF Staff Salary Sheet Excel into Variable Components (Additional Salary + payments)."""

from __future__ import annotations

import os
import re
from collections import defaultdict

import frappe
from frappe import _
from frappe.utils import cint, flt, getdate

from tif_customization.tif_customization.page.variable_components.variable_components_roster import (
	employee_payroll_block_reason,
	initialize_period_roster,
	set_roster_excluded,
	tif_26th_cycle_dates,
)

# Excel column indexes (1-based) for Staff Salary Sheet layout
COL = {
	"serial": 1,
	"section_serial": 2,
	"employee_name": 3,
	"designation": 4,
	"branch": 5,
	"bank_account": 8,
	"status": 9,
	"department": 10,
	"gross": 11,
	"fuel": 17,
	"mobile": 18,
	"overtime": 19,
	"allowance": 20,
	"days_worked": 21,
	"leave_ded": 22,
	"pf": 23,
	"fuel_ded": 24,
	"tax": 26,
	"net": 27,
	"payment_mode": 29,
}

TITLE_PREFIXES = re.compile(
	r"^(mr\.?|mrs\.?|ms\.?|miss\.?|dr\.?|eng\.?)\s+",
	re.IGNORECASE,
)

# Excel name (normalized) → Employee ID when spellings differ too much for fuzzy match
EXCEL_NAME_ALIASES = {
	"nadeem ullah": "HR-EMP-00230",  # Nadeemullah
	"danish awan": "HR-EMP-00009",  # Muhammad Danish
	"hassan ameer uddin": "HR-EMP-00167",  # Hasan Ameer Uddin
	"sumera irfan": "HR-EMP-00217",  # Sumaira Irfan
	"hafiz muhammad hamza": "HR-EMP-00242",  # Muhammad Hamza Ahmed
	"muhammad hamza": "HR-EMP-00242",
	"mansoor ahmed awan": "HR-EMP-00160",  # Mansoor Ahmad Awan
	"mansoor ahmad awan": "HR-EMP-00160",
	"s rehman haider": "HR-EMP-00012",  # S. Rahman Haider
	"rehman haider": "HR-EMP-00012",
	"rahman uddin": "HR-EMP-00028",  # Rahmanuddin
	"rahmanuddin": "HR-EMP-00028",
	"afroz anees": "HR-EMP-00288",  # Afroz Yasmeen
	"sheema m attalluah": "HR-EMP-00182",  # Sheema M Attaullah
	"sheema m attaullah": "HR-EMP-00182",
	"sadia bilal": "HR-EMP-00127",  # Sadia Muhammad Bilal
	"rabia bibi younis": "HR-EMP-00129",  # Rabia Bibi Muhammad Younis
	"saba kaleem ud din": "HR-EMP-00143",  # Saba Kaleem Uddin
	"saba kaleem uddin": "HR-EMP-00143",
	"asia mir samad": "HR-EMP-00138",  # Asia Meer Samad
	"fatima nazam uddin": "HR-EMP-00134",  # Fatima Nizam ud din
	"fatima nizam uddin": "HR-EMP-00134",
	"rabia a ghaffar": "HR-EMP-00318",  # Rabia Adul Ghaffar
	"muhammad aziz khan": "HR-EMP-00145",  # Muhammad Aziz Yaqoob Khan
	"saima noor ahmed": "HR-EMP-00090",  # Saima Noor Muhammad
	"amreen shafique rehman": "HR-EMP-00123",  # Amreen Shafiq-ur-Rehman
	"uzma hakeemullah": "HR-EMP-00212",  # Uzma Hakimullah
	"uzma hakimullah": "HR-EMP-00212",
	"shadab tabassum": "HR-EMP-00266",  # Shahdab Tabassum
	"shahdab tabassum": "HR-EMP-00266",
	"nadia sultan": "HR-EMP-00079",  # Nadia Muhammad Sultan
	"kosar amir": "HR-EMP-00140",  # Kosar M Amir
	"shakila anwer": "HR-EMP-00171",  # Shakila Anwar saeed
	"shakila anwar": "HR-EMP-00171",
	"warisha jamil": "HR-EMP-00146",  # Warisha Jameel Ashraf
	"ayesha siddiqa": "HR-EMP-00170",  # Aisha Siddiqa
	"aisha siddiqa": "HR-EMP-00170",
	"zaynep alp": "HR-EMP-00235",  # Ayse Zenep Alp
	"atiqa faheem": "HR-EMP-00228",  # Ateeqa Faheem
	"ateeqa faheem": "HR-EMP-00228",
	"fatima dar": "HR-EMP-00259",  # Dr. Fatima Rehan Dar
	"omaira alam": "HR-EMP-00257",  # Omaira Tabbasum Alam
	"arobah malik": "HR-EMP-00234",  # Arubah Malik
	"arubah malik": "HR-EMP-00234",
}


def _norm_name(value):
	text = str(value or "").strip().lower()
	text = TITLE_PREFIXES.sub("", text).strip()
	text = text.replace(".", " ")
	text = re.sub(r"[-_/']+", " ", text)
	# Common Urdu/roman spelling collapses
	text = re.sub(r"\budd?\s*in\b", "uddin", text)
	text = re.sub(r"\bud\s*din\b", "uddin", text)
	text = re.sub(r"\bahmed\b", "ahmad", text)
	text = re.sub(r"\bhakeemullah\b", "hakimullah", text)
	text = re.sub(r"\battalluah\b", "attaullah", text)
	text = re.sub(r"\bjameel\b", "jamil", text)
	text = re.sub(r"\bnazam\b", "nizam", text)
	text = re.sub(r"\bmeer\b", "mir", text)
	text = re.sub(r"\bhafiz\b", " ", text)
	text = re.sub(r"[^a-z0-9\s]", " ", text)
	text = re.sub(r"\s+", " ", text).strip()
	return text


def _name_tokens(value):
	stop = {"m", "s", "md", "bin", "binti", "ur", "al"}
	return [t for t in _norm_name(value).split() if len(t) > 1 and t not in stop]


def _cell_num(ws, row, col):
	val = ws.cell(row, col).value
	if val is None:
		return 0.0
	if isinstance(val, (int, float)):
		return flt(val)
	text = str(val).strip().replace(",", "")
	if not text or text in {"-", "—", "–"}:
		return 0.0
	try:
		return flt(text)
	except Exception:
		return 0.0


def _cell_str(ws, row, col):
	val = ws.cell(row, col).value
	if val is None:
		return ""
	return str(val).strip()


def _is_section_row(ws, row):
	name = _cell_str(ws, row, COL["employee_name"])
	serial = ws.cell(row, COL["serial"]).value
	if name and serial is None and not _cell_str(ws, row, COL["designation"]):
		# Section headers put title in employee-name column without S#
		return True
	if name and not serial and _cell_num(ws, row, COL["gross"]) == 0 and not _cell_str(
		ws, row, COL["status"]
	):
		return True
	return False


def _is_employee_row(ws, row):
	serial = ws.cell(row, COL["serial"]).value
	name = _cell_str(ws, row, COL["employee_name"])
	if not name or serial is None:
		return False
	try:
		float(serial)
	except Exception:
		return False
	if _is_section_row(ws, row):
		return False
	return True


def _payment_mode(raw):
	text = (raw or "").strip().lower()
	if "cheque" in text or "check" in text:
		return "Cheque"
	if "bank" in text:
		return "Bank"
	return "Bank"


def _employee_name_index():
	rows = frappe.get_all(
		"Employee",
		filters={"status": ("in", ["Active", "Left", "Suspended", "Inactive"])},
		fields=[
			"name",
			"employee_name",
			"status",
			"bank_name",
			"bank_ac_no",
			"date_of_joining",
			"relieving_date",
		],
	)
	index = defaultdict(list)
	by_id = {}
	for row in rows:
		by_id[row.name] = row
		key = _norm_name(row.employee_name)
		if key:
			index[key].append(row)
		# Also index without first/middle fillers for reverse lookup
		tokens = _name_tokens(row.employee_name)
		if tokens:
			index[" ".join(tokens)].append(row)
	index["_all"] = rows
	index["_by_id"] = by_id
	return index


def _pick_best(hits):
	if not hits:
		return None
	if len(hits) == 1:
		return hits[0]
	active = [h for h in hits if h.status == "Active"]
	return (active or hits)[0]


def _token_score(excel_tokens, emp_tokens):
	if not excel_tokens or not emp_tokens:
		return 0.0
	ex, em = set(excel_tokens), set(emp_tokens)
	overlap = ex & em
	if not overlap:
		# prefix soft match (jamil/jameel already normalized)
		soft = 0
		for a in ex:
			for b in em:
				if a.startswith(b) or b.startswith(a) or (len(a) > 3 and len(b) > 3 and a[:4] == b[:4]):
					soft += 1
					break
		if not soft:
			return 0.0
		overlap_n = soft
	else:
		overlap_n = len(overlap)
	return overlap_n / max(len(ex), 1) + 0.15 * (overlap_n / max(len(em), 1))


def _match_employee(name, index):
	key = _norm_name(name)
	if not key:
		return None

	# 1) Explicit alias (known Excel ↔ ERP spelling gaps)
	alias_id = EXCEL_NAME_ALIASES.get(key)
	if not alias_id:
		alias_id = EXCEL_NAME_ALIASES.get(" ".join(_name_tokens(name)))
	if alias_id:
		hit = (index.get("_by_id") or {}).get(alias_id)
		if hit:
			return hit

	hits = index.get(key) or []
	picked = _pick_best(hits)
	if picked:
		return picked

	# 2) Contains / startswith on normalized full name
	for emp_key, emps in index.items():
		if emp_key.startswith("_"):
			continue
		if key in emp_key or emp_key in key:
			picked = _pick_best(emps)
			if picked:
				return picked

	# 3) Token overlap scoring across all employees
	excel_tokens = _name_tokens(name)
	if len(excel_tokens) < 1:
		return None
	best = None
	best_score = 0.0
	for emp in index.get("_all") or []:
		score = _token_score(excel_tokens, _name_tokens(emp.employee_name))
		# Prefer Active on ties
		if score > best_score or (
			score == best_score
			and score >= 0.6
			and best
			and best.status != "Active"
			and emp.status == "Active"
		):
			best_score = score
			best = emp
	# Require strong overlap (e.g. 2/2 or 2/3+)
	if best and best_score >= 0.66:
		return best
	return None


def parse_salary_sheet_file(file_path, sheet_names=None):
	"""Return list of parsed employee dicts from workbook path."""
	import openpyxl

	wb = openpyxl.load_workbook(file_path, data_only=True)
	wanted = set(sheet_names) if sheet_names else None
	rows_out = []
	for sheet_name in wb.sheetnames:
		if wanted is not None and sheet_name not in wanted:
			continue
		# Prefer main month sheets + Sp Edu for that month
		ws = wb[sheet_name]
		section = ""
		for r in range(1, (ws.max_row or 0) + 1):
			if _is_section_row(ws, r):
				section = _cell_str(ws, r, COL["employee_name"])
				continue
			if not _is_employee_row(ws, r):
				continue
			emp_name = _cell_str(ws, r, COL["employee_name"])
			rows_out.append(
				{
					"sheet": sheet_name,
					"section": section,
					"excel_name": emp_name,
					"designation": _cell_str(ws, r, COL["designation"]),
					"branch": _cell_str(ws, r, COL["branch"]),
					"department": _cell_str(ws, r, COL["department"]),
					"status": _cell_str(ws, r, COL["status"]),
					"bank_account": _cell_str(ws, r, COL["bank_account"]),
					"gross": _cell_num(ws, r, COL["gross"]),
					"fuel": _cell_num(ws, r, COL["fuel"]),
					"mobile": _cell_num(ws, r, COL["mobile"]),
					"overtime": _cell_num(ws, r, COL["overtime"]),
					"allowance": _cell_num(ws, r, COL["allowance"]),
					"days_worked": _cell_num(ws, r, COL["days_worked"]),
					"leave_ded": _cell_num(ws, r, COL["leave_ded"]),
					"pf": _cell_num(ws, r, COL["pf"]),
					"fuel_ded": _cell_num(ws, r, COL["fuel_ded"]),
					"tax": _cell_num(ws, r, COL["tax"]),
					"net": _cell_num(ws, r, COL["net"]),
					"payment_mode": _payment_mode(_cell_str(ws, r, COL["payment_mode"])),
				}
			)
	return rows_out


def _default_july_sheets():
	return ["July 2026 increment", "Sp Edu July 2026"]


def _resolve_file_path(file_url=None, file_name=None):
	"""Resolve uploaded File / public path."""
	if file_url:
		# /files/xxx.xlsx or /private/files/xxx
		rel = file_url.lstrip("/")
		candidates = []
		if rel.startswith("files/"):
			candidates.append(frappe.get_site_path("public", rel))
			candidates.append(frappe.get_site_path("private", rel))
		candidates.extend(
			[
				frappe.get_site_path(rel),
				frappe.get_site_path("public", rel),
				frappe.get_site_path("private", rel),
			]
		)
		for path in candidates:
			if path and os.path.exists(path):
				return path
		# File doctype by url
		fname = frappe.db.get_value("File", {"file_url": file_url}, "name")
		if fname:
			return frappe.get_doc("File", fname).get_full_path()

	if file_name:
		# prefer exact public files path used on UAT
		path = frappe.get_site_path("public", "files", file_name)
		if os.path.exists(path):
			return path
		fname = frappe.db.get_value("File", {"file_name": file_name}, "name")
		if fname:
			return frappe.get_doc("File", fname).get_full_path()

	# Fallback known salary sheet
	fallback = frappe.get_site_path("public", "files", "Salary Sheet 2026-2027.xlsx")
	if os.path.exists(fallback):
		return fallback
	frappe.throw(_("Salary sheet file not found."))


@frappe.whitelist()
def import_salary_sheet_to_variable_components(
	payroll_month=7,
	payroll_year=2026,
	company=None,
	file_url=None,
	file_name=None,
	sheet_names=None,
	force_roster=0,
):
	"""
	Import Staff Salary Sheet Excel into Variable Components for a 26–25 payroll month.

	July 2026 sheet => period 26 Jun 2026 – 25 Jul 2026.
	Creates/updates Additional Salary + Variable Components Payment; loads roster.
	Editable afterward on /app/variable-components (HR Manager / System Manager).
	"""
	import json

	roles = set(frappe.get_roles())
	if not (
		roles & {"System Manager", "HR Manager", "HR User", "Accounts Manager"}
		or frappe.session.user == "Administrator"
	):
		frappe.throw(_("Not permitted to import salary sheet."), frappe.PermissionError)

	if isinstance(sheet_names, str):
		raw = sheet_names.strip()
		if not raw:
			sheet_names = None
		elif raw.startswith("["):
			sheet_names = json.loads(raw)
		else:
			sheet_names = [s.strip() for s in raw.split(",") if s.strip()]

	# Custom uploads: parse all workbook sheets unless names were provided.
	# Legacy quick-import (no file) still defaults to July sheet tabs.
	if sheet_names is None and not file_url and not file_name:
		sheet_names = _default_july_sheets()

	company = company or frappe.defaults.get_global_default("company") or "The ILM Foundation"
	payroll_month, payroll_year = cint(payroll_month), cint(payroll_year)
	start_date, end_date = tif_26th_cycle_dates(payroll_year, payroll_month)
	payroll_date = getdate(end_date)

	path = _resolve_file_path(file_url=file_url, file_name=file_name)
	parsed = parse_salary_sheet_file(path, sheet_names=sheet_names)
	if not parsed and sheet_names:
		# Named tabs missing — retry whole workbook
		parsed = parse_salary_sheet_file(path, sheet_names=None)
	if not parsed:
		frappe.throw(_("No employee rows found in the Excel file."))

	# Ensure period roster exists
	initialize_period_roster(company, start_date, end_date, force=cint(force_roster))

	index = _employee_name_index()
	matched = []
	unmatched = []
	issues = []
	issues_by_emp = {}
	variable_entries = []
	payment_entries = []
	employee_ids = []

	component_keys = (
		("fuel", "fuel"),
		("mobile", "mobile"),
		("overtime", "overtime"),
		("allowance", "other_allowance"),
		("leave_ded", "leave_ded"),
		("fuel_ded", "fuel_ded"),
		("tax", "tax"),
	)

	for row in parsed:
		emp = _match_employee(row["excel_name"], index)
		if not emp:
			unmatched.append(row["excel_name"])
			continue
		matched.append(
			{
				"excel_name": row["excel_name"],
				"employee": emp.name,
				"employee_name": emp.employee_name,
			}
		)
		employee_ids.append(emp.name)

		block = employee_payroll_block_reason(emp, payroll_date)
		if block and emp.name not in issues_by_emp:
			issue = {
				"employee": emp.name,
				"employee_name": emp.employee_name,
				"excel_name": row["excel_name"],
				"message": block,
			}
			issues_by_emp[emp.name] = issue
			issues.append(issue)

		# Only create Additional Salary for eligible (Active) employees
		if not block:
			for excel_key, component_key in component_keys:
				amount = flt(row.get(excel_key))
				variable_entries.append(
					{
						"employee": emp.name,
						"component_key": component_key,
						"amount": amount,
					}
				)

		# Keep payment / payable from sheet so the row still appears with amounts
		mode = row["payment_mode"]
		bank = (emp.bank_name or "").strip()
		payment_entries.append(
			{
				"employee": emp.name,
				"payment_mode": mode,
				"bank_name": bank if mode == "Bank" else "",
				"payable_amount": flt(row["net"]) or None,
			}
		)

	# Include matched employees on roster (clear excluded) — including blocked ones
	if employee_ids:
		set_roster_excluded(company, start_date, end_date, list(set(employee_ids)), excluded=0)

	from tif_customization.tif_customization.page.variable_components.variable_components import (
		save_payment_details,
		save_variable_components,
	)
	from tif_customization.tif_customization.page.variable_components.variable_components_roster import (
		mark_period_draft_saved,
	)

	variable_result = save_variable_components(company, payroll_date, variable_entries)
	# Map any leftover ADS save errors onto the issue list
	for err in variable_result.get("errors") or []:
		emp_id = str(err).split(" / ", 1)[0].strip()
		if emp_id and emp_id not in issues_by_emp:
			msg = frappe.utils.strip_html(str(err))
			emp_name = frappe.db.get_value("Employee", emp_id, "employee_name") or emp_id
			issue = {"employee": emp_id, "employee_name": emp_name, "excel_name": "", "message": msg}
			issues_by_emp[emp_id] = issue
			issues.append(issue)

	payment_result = save_payment_details(company, start_date, end_date, payment_entries)
	period = mark_period_draft_saved(company, start_date, end_date)
	frappe.clear_messages()

	ok_count = len(set(employee_ids)) - len(issues_by_emp)
	msg = _(
		"Imported {0} employees into Variable Components ({1} – {2})."
	).format(len(set(employee_ids)), start_date, end_date)
	if issues:
		msg += " " + _("{0} employee(s) have issues and need review.").format(len(issues))
	if unmatched:
		msg += " " + _("{0} name(s) from Excel were not matched.").format(len(unmatched))

	return {
		"ok": True,
		"company": company,
		"start_date": str(start_date),
		"end_date": str(end_date),
		"period_label": f"{start_date} – {end_date}",
		"sheets": sheet_names,
		"parsed_rows": len(parsed),
		"matched": len(matched),
		"imported_ok": max(ok_count, 0),
		"unmatched": unmatched,
		"issues": issues,
		"issue_count": len(issues),
		"variable_result": variable_result,
		"payment_saved": payment_result.get("saved", 0),
		"period": period,
		"page": "/app/variable-components",
		"message": msg,
	}
