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


def _norm_name(value):
	text = re.sub(r"\s+", " ", str(value or "").strip())
	text = TITLE_PREFIXES.sub("", text).strip()
	return text.lower()


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
		fields=["name", "employee_name", "status", "bank_name", "bank_ac_no"],
	)
	index = defaultdict(list)
	for row in rows:
		key = _norm_name(row.employee_name)
		if key:
			index[key].append(row)
	return index


def _match_employee(name, index):
	key = _norm_name(name)
	if not key:
		return None
	hits = index.get(key) or []
	if len(hits) == 1:
		return hits[0]
	if len(hits) > 1:
		# Prefer Active
		active = [h for h in hits if h.status == "Active"]
		return (active or hits)[0]
	# Fuzzy: startswith / contains
	for emp_key, emps in index.items():
		if key in emp_key or emp_key in key:
			active = [h for h in emps if h.status == "Active"]
			return (active or emps)[0]
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
