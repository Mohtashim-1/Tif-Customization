import calendar
from collections import defaultdict

import frappe
from frappe import _
from frappe.utils import cint, flt, formatdate, getdate

from tif_customization.tif_customization.page.salary_register.salary_register import (
	_employment_status,
	_resolve_period_dates,
	get_period_options,
)
from tif_customization.tif_customization.payroll_utils import get_assignment_base_by_employee

# Read-only salary reference columns (gross from Salary Structure Assignment)
SALARY_COLUMNS = [
	{"key": "perm_gross", "label": "Gross (Permanent)"},
	{"key": "contract_gross", "label": "Gross (Contract)"},
	{"key": "gross_pay", "label": "Gross Pay"},
	{"key": "total_deduction", "label": "Total Deduction"},
	{"key": "payment_days", "label": "Days Worked"},
]

PAYMENT_COLUMNS = [
	{"key": "net_pay", "label": "Net Pay"},
	{"key": "payable_amount", "label": "Payable Amount"},
	{"key": "payment_mode", "label": "Mode"},
	{"key": "bank_name", "label": "Bank"},
]
from tif_customization.tif_customization.page.salary_register.salary_register_sections import (
	EMPLOYEE_SECTION_MAP,
	HEADER_ONLY_SECTIONS,
	SECTION_ORDER,
	UNASSIGNED_SECTION,
	get_employee_section,
	sort_key_for_row,
)
from tif_customization.tif_customization.page.variable_components.variable_components_config import (
	resolve_component_names,
)
from tif_customization.tif_customization.pf.pf_contribution import (
	compute_pf_deduction_amount,
	get_pf_meta_for_employee,
)
from tif_customization.tif_customization.page.variable_components.variable_components_roster import (
	apply_attendance_to_amounts,
	attendance_by_employee,
	ensure_period_roster,
	create_custom_period,
	extended_period_options,
	get_period_status,
	mark_period_draft_saved,
	mark_period_finalized,
	get_included_employee_ids,
	period_starting_on_26th,
	tif_26th_cycle_dates,
	initialize_period_roster,
	roster_count,
	set_roster_excluded,
)


def _component_keys(earnings, deductions):
	return [c["key"] for c in earnings] + [c["key"] for c in deductions]


def _key_to_component(earnings, deductions):
	mapping = {}
	for c in earnings + deductions:
		mapping[c["key"]] = c["component"]
	return mapping


@frappe.whitelist()
def get_period_options_for_variable(company=None):
	return extended_period_options(company=company or frappe.defaults.get_global_default("company"))


@frappe.whitelist()
def get_tif_cycle_dates(year, month, cycle_type="tif_payroll_month"):
	"""
	Preview dates for 26th-cycle payroll.
	cycle_type:
	  - tif_payroll_month: June payroll => 26 May – 25 Jun
	  - starts_on_26th: period starting 26 Jun => 26 Jun – 25 Jul
	"""
	year, month = int(year), int(month)
	if cycle_type == "starts_on_26th":
		start, end = period_starting_on_26th(year, month)
	else:
		start, end = tif_26th_cycle_dates(year, month)
	return {
		"start_date": str(start),
		"end_date": str(end),
		"label": f"{formatdate(start)} – {formatdate(end)}",
	}


@frappe.whitelist()
def create_variable_period(company=None, start_date=None, end_date=None, year=None, month=None, cycle_type=None):
	"""Create a payroll period row for the Variable Components dropdown."""
	company = company or frappe.defaults.get_global_default("company")

	if cycle_type and year and month:
		if cycle_type == "starts_on_26th":
			start_date, end_date = period_starting_on_26th(year, month)
		else:
			start_date, end_date = tif_26th_cycle_dates(year, month)
	elif not (start_date and end_date):
		frappe.throw(_("Provide start/end dates or payroll month with cycle type."))

	return create_custom_period(company, start_date, end_date)


@frappe.whitelist()
def initialize_variable_period(month=None, year=None, company=None, start_date=None, end_date=None, force=0):
	start_date, end_date = _resolve_period_dates(month, year, start_date, end_date)
	company = company or frappe.defaults.get_global_default("company")
	return initialize_period_roster(company, start_date, end_date, force=force)


@frappe.whitelist()
def remove_employees_from_period(month=None, year=None, company=None, start_date=None, end_date=None, employees=None):
	import json

	if isinstance(employees, str):
		employees = json.loads(employees or "[]")
	start_date, end_date = _resolve_period_dates(month, year, start_date, end_date)
	company = company or frappe.defaults.get_global_default("company")
	result = set_roster_excluded(company, start_date, end_date, employees, excluded=1)
	result["message"] = _("Removed {0} employee(s) from this period sheet.").format(result.get("updated", 0))
	return result


@frappe.whitelist()
def add_employees_to_period(month=None, year=None, company=None, start_date=None, end_date=None, employees=None):
	import json

	if isinstance(employees, str):
		employees = json.loads(employees or "[]")
	if not employees:
		frappe.throw(_("Select at least one employee to add."))
	start_date, end_date = _resolve_period_dates(month, year, start_date, end_date)
	company = company or frappe.defaults.get_global_default("company")
	result = set_roster_excluded(company, start_date, end_date, employees, excluded=0)
	result["message"] = _("Added {0} employee(s) to this period sheet.").format(result.get("updated", 0))
	return result


@frappe.whitelist()
def get_variable_sheet_data(month=None, year=None, company=None, start_date=None, end_date=None):
	"""Grid data: roster sections, employees, existing Additional Salary amounts."""
	earnings, deductions = resolve_component_names()
	if not earnings and not deductions:
		frappe.throw(_("No variable salary components found. Run PF Setup or create salary components first."))

	start_date, end_date = _resolve_period_dates(month, year, start_date, end_date)
	company = company or frappe.defaults.get_global_default("company")
	payroll_date = getdate(end_date)
	end = getdate(end_date)
	month_label = f"{calendar.month_name[end.month]} {end.year}"

	roster_meta = ensure_period_roster(company, start_date, end_date)
	employee_ids = get_included_employee_ids(company, start_date, end_date)

	slip_employees = frappe.get_all(
		"Salary Slip",
		filters={
			"start_date": start_date,
			"end_date": end_date,
			"docstatus": ["<", 2],
			**({"company": company} if company else {}),
		},
		pluck="employee",
	)
	# Keep employees who already have slips this period even if removed from default roster
	employee_ids = list(set(employee_ids) | set(slip_employees or []))

	if not employee_ids:
		return _empty_response(
			month_label,
			start_date,
			end_date,
			company,
			earnings,
			deductions,
			roster_meta=roster_meta,
		)

	emp_filters = {"name": ["in", employee_ids], "status": "Active"}
	if company:
		emp_filters["company"] = company

	emp_fields = [
		"name",
		"employee_name",
		"designation",
		"department",
		"branch",
		"employment_type",
		"company",
		"bank_name",
		"bank_ac_no",
	]
	if frappe.db.has_column("Employee", "income_tax"):
		emp_fields.append("income_tax")

	employees = frappe.get_all(
		"Employee",
		filters=emp_filters,
		fields=emp_fields,
		order_by="employee_name asc",
	)

	attendance_map = attendance_by_employee(employees, end_date)

	payment_by_emp = _payment_details_by_employee(company, start_date, end_date, employees)
	bank_options = _get_bank_options(employees)

	component_names = [c["component"] for c in earnings + deductions]
	existing_ads = frappe.get_all(
		"Additional Salary",
		filters={
			"employee": ["in", [e.name for e in employees]],
			"salary_component": ["in", component_names],
			"payroll_date": ["between", [start_date, end_date]],
			"docstatus": ["<", 2],
			**({"company": company} if company else {}),
		},
		fields=["name", "employee", "salary_component", "amount", "docstatus"],
	)

	# Map key -> amount per employee (prefer submitted, latest)
	key_map = _key_to_component(earnings, deductions)
	comp_to_key = {v: k for k, v in key_map.items()}
	ads_by_emp = defaultdict(dict)
	ads_doc_by_emp = defaultdict(dict)

	for row in existing_ads:
		key = comp_to_key.get(row.salary_component)
		if not key:
			continue
		emp = row.employee
		prev = ads_by_emp[emp].get(key)
		if prev is None or row.docstatus == 1:
			ads_by_emp[emp][key] = flt(row.amount)
			ads_doc_by_emp[emp][key] = row.name

	slip_salary = _salary_reference_by_employee(employees, start_date, end_date, company)
	earning_keys = [c["key"] for c in earnings]

	rows = []
	for emp in employees:
		section_sort = get_employee_section(emp.name, emp.employee_name)
		section_key = section_sort[0]
		amounts = {}
		docnames = {}
		for col in earnings + deductions:
			key = col["key"]
			amounts[key] = ads_by_emp[emp.name].get(key, 0)
			docnames[key] = ads_doc_by_emp[emp.name].get(key)

		salary_row = slip_salary.get(emp.name, {})
		assigned_gross = flt(salary_row.get("gross_pay"))
		base_gross = flt(salary_row.get("assignment_gross")) or assigned_gross
		variable_earn = sum(flt(amounts.get(k)) for k in earning_keys)
		projected_gross = assigned_gross + variable_earn
		att = attendance_map.get(emp.name) or {}
		amounts = apply_attendance_to_amounts(amounts, base_gross, att, earning_keys)

		amounts["pf"] = compute_pf_deduction_amount(
			emp.name, projected_gross, assigned_base=assigned_gross
		)
		amounts["tax"] = _tax_amount_for_employee(emp, amounts, ads_doc_by_emp.get(emp.name, {}))

		pf_meta = get_pf_meta_for_employee(emp.name)
		default_bank = (emp.bank_name or "").strip()
		default_mode = "Bank" if default_bank else "Cheque"
		saved_payment = payment_by_emp.get(emp.name) or {}
		rows.append(
			{
				"employee": emp.name,
				"employee_name": emp.employee_name,
				"designation": emp.designation or "",
				"department": emp.department or "",
				"branch": emp.branch or "",
				"employment_type": emp.employment_type or "",
				"company": emp.company,
				"bank_ac_no": emp.bank_ac_no or "",
				"default_bank_name": default_bank,
				"section_key": section_key,
				"_section_sort": section_sort,
				"amounts": amounts,
				"additional_salary": docnames,
				"salary": salary_row,
				"attendance": att,
				"pf_applicable": pf_meta["pf_applicable"],
				"pf_rate": pf_meta["pf_rate"],
				"pf_formula_base": pf_meta["pf_formula_base"],
				"income_tax": flt(emp.income_tax),
				"payment": {
					"payment_mode": saved_payment.get("payment_mode") or default_mode,
					"bank_name": saved_payment.get("bank_name") or default_bank,
					"payable_amount": saved_payment.get("payable_amount"),
				},
			}
		)

	section_rows = defaultdict(list)
	for row in rows:
		section_rows[row["section_key"]].append(row)

	sections = []
	grand = defaultdict(float)
	sr = 0
	all_keys = _component_keys(earnings, deductions)
	salary_keys = [c["key"] for c in SALARY_COLUMNS]

	for section_label in SECTION_ORDER:
		items = section_rows.get(section_label) or []
		if not items and section_label not in HEADER_ONLY_SECTIONS:
			continue
		if section_label in HEADER_ONLY_SECTIONS and not items:
			sections.append({"label": section_label, "rows": [], "totals": {}, "header_only": True})
			continue

		items.sort(key=sort_key_for_row)
		section_total = defaultdict(float)
		section_data = []

		for item in items:
			sr += 1
			item["serial"] = sr
			item["section_no"] = SECTION_ORDER.index(section_label) + 1 if section_label in SECTION_ORDER else 0
			section_data.append(item)
			for key in all_keys:
				val = flt(item["amounts"].get(key))
				section_total[key] += val
				grand[key] += val
			for sk in salary_keys:
				val = flt((item.get("salary") or {}).get(sk))
				section_total[sk] += val
				grand[sk] += val

		sections.append(
			{
				"label": section_label,
				"rows": section_data,
				"totals": dict(section_total),
				"header_only": False,
			}
		)

	# Unassigned employees not in SECTION_ORDER
	if section_rows.get(UNASSIGNED_SECTION):
		items = sorted(section_rows[UNASSIGNED_SECTION], key=sort_key_for_row)
		section_total = defaultdict(float)
		for item in items:
			sr += 1
			item["serial"] = sr
			for key in all_keys:
				val = flt(item["amounts"].get(key))
				section_total[key] += val
				grand[key] += val
			for sk in salary_keys:
				val = flt((item.get("salary") or {}).get(sk))
				section_total[sk] += val
				grand[sk] += val
		sections.append(
			{
				"label": UNASSIGNED_SECTION,
				"rows": items,
				"totals": dict(section_total),
				"header_only": False,
			}
		)

	company_name = frappe.db.get_value("Company", company, "company_name") if company else company
	payroll_info = _get_payroll_period_info(company, start_date, end_date)
	payroll_eligible = _get_payroll_eligible_employees(company, start_date, end_date)
	period_status = get_period_status(company, start_date, end_date)

	return {
		"title": _("THE ILM FOUNDATION - VARIABLE COMPONENTS"),
		"subtitle": _("For the Month of {0}").format(month_label),
		"company": company_name or company,
		"company_id": company,
		"period_label": f"{formatdate(start_date)} – {formatdate(end_date)}",
		"payroll_date": str(payroll_date),
		"start_date": str(start_date),
		"end_date": str(end_date),
		"month": end.month,
		"year": end.year,
		"earnings": earnings,
		"deductions": deductions,
		"salary_columns": SALARY_COLUMNS,
		"sections": sections,
		"grand_totals": dict(grand) if grand else {k: 0 for k in all_keys},
		"employee_count": sr,
		"payroll_info": payroll_info,
		"payroll_eligible": payroll_eligible,
		"payment_columns": PAYMENT_COLUMNS,
		"bank_options": bank_options,
		"currency": frappe.db.get_value("Company", company, "default_currency")
		if company
		else frappe.defaults.get_global_default("currency"),
		"roster": {
			"count": roster_count(company, start_date, end_date),
			"on_sheet": len(employees),
			"auto_initialized": bool((roster_meta or {}).get("auto_initialized")),
		},
		"period_status": period_status,
		"is_finalized": period_status.get("status") == "Finalized",
	}


def _empty_response(month_label, start_date, end_date, company, earnings, deductions, roster_meta=None):
	payroll_info = _get_payroll_period_info(company, start_date, end_date)
	return {
		"title": _("THE ILM FOUNDATION - VARIABLE COMPONENTS"),
		"subtitle": _("For the Month of {0}").format(month_label),
		"company": company,
		"period_label": f"{formatdate(start_date)} – {formatdate(end_date)}",
		"payroll_date": str(end_date),
		"start_date": str(start_date),
		"end_date": str(end_date),
		"earnings": earnings,
		"deductions": deductions,
		"salary_columns": SALARY_COLUMNS,
		"sections": [],
		"grand_totals": {},
		"employee_count": 0,
		"payroll_info": payroll_info,
		"payroll_eligible": _get_payroll_eligible_employees(company, start_date, end_date),
		"payment_columns": PAYMENT_COLUMNS,
		"bank_options": _get_bank_options([]),
		"roster": {
			"count": roster_count(company, start_date, end_date),
			"on_sheet": 0,
			"auto_initialized": bool((roster_meta or {}).get("auto_initialized")),
		},
		"period_status": get_period_status(company, start_date, end_date),
		"is_finalized": False,
	}


def _tax_amount_for_employee(emp, amounts, ads_docs_by_key):
	"""Tax from Employee.income_tax; saved Additional Salary for this period overrides."""
	employee_tax = flt(getattr(emp, "income_tax", None) or 0)
	if ads_docs_by_key.get("tax"):
		return flt(amounts.get("tax"))
	return employee_tax


def _default_payment_mode(bank_name):
	return "Bank" if (bank_name or "").strip() else "Cheque"


def _get_bank_options(employees=None):
	"""Distinct bank names from ERPNext Bank + employee master."""
	names = set()
	if frappe.db.exists("DocType", "Bank"):
		for row in frappe.get_all("Bank", fields=["name"], order_by="name asc", limit_page_length=0):
			if row.name:
				names.add(row.name.strip())
	for emp in employees or []:
		bn = (emp.get("bank_name") if isinstance(emp, dict) else getattr(emp, "bank_name", None)) or ""
		if bn.strip():
			names.add(bn.strip())
	saved = frappe.get_all(
		"Variable Components Payment",
		filters={"bank_name": ["!=", ""]},
		pluck="bank_name",
		distinct=True,
	)
	for bn in saved or []:
		if bn and bn.strip():
			names.add(bn.strip())
	return sorted(names, key=lambda x: x.lower())


def _payment_details_by_employee(company, start_date, end_date, employees):
	if not employees or not frappe.db.exists("DocType", "Variable Components Payment"):
		return {}
	rows = frappe.get_all(
		"Variable Components Payment",
		filters={
			"company": company,
			"start_date": start_date,
			"end_date": end_date,
			"employee": ["in", [e.name for e in employees]],
		},
		fields=["employee", "payment_mode", "bank_name", "payable_amount"],
	)
	out = {}
	for row in rows:
		out[row.employee] = {
			"payment_mode": row.payment_mode or "Cheque",
			"bank_name": row.bank_name or "",
			"payable_amount": flt(row.payable_amount) or None,
		}
	return out


@frappe.whitelist()
def save_payment_details(company, start_date, end_date, entries):
	"""Upsert payment mode / bank / payable override per employee for this period."""
	import json

	if isinstance(entries, str):
		entries = json.loads(entries or "[]")
	if not entries:
		return {"saved": 0, "message": _("No payment rows to save")}

	company = company or frappe.defaults.get_global_default("company")
	start_date, end_date = getdate(start_date), getdate(end_date)
	saved = 0

	for entry in entries:
		employee = entry.get("employee")
		if not employee:
			continue
		payment_mode = entry.get("payment_mode") or "Cheque"
		if payment_mode not in ("Cheque", "Bank"):
			payment_mode = "Cheque"
		bank_name = (entry.get("bank_name") or "").strip() if payment_mode == "Bank" else ""
		payable_amount = entry.get("payable_amount")
		payable_amount = flt(payable_amount) if payable_amount not in (None, "", 0) else None

		if payment_mode == "Bank" and not bank_name:
			emp_bank = frappe.db.get_value("Employee", employee, "bank_name")
			bank_name = (emp_bank or "").strip()

		filters = {
			"company": company,
			"start_date": start_date,
			"end_date": end_date,
			"employee": employee,
		}
		name = frappe.db.get_value("Variable Components Payment", filters)
		if name:
			doc = frappe.get_doc("Variable Components Payment", name)
		else:
			doc = frappe.new_doc("Variable Components Payment")
			doc.update(filters)
			emp_name = frappe.db.get_value("Employee", employee, "employee_name")
			doc.employee_name = emp_name

		doc.payment_mode = payment_mode
		doc.bank_name = bank_name
		doc.payable_amount = payable_amount
		doc.flags.ignore_permissions = True
		doc.flags.allow_missing_bank = True
		doc.flags.ignore_validate = True
		if name:
			doc.save(ignore_permissions=True)
		else:
			doc.insert(ignore_permissions=True)
		saved += 1

	return {"saved": saved, "message": _("Saved payment details for {0} employee(s)").format(saved)}


@frappe.whitelist()
def save_period_draft(
	month=None,
	year=None,
	company=None,
	start_date=None,
	end_date=None,
	save_additional_salary=1,
	payment_entries=None,
	variable_entries=None,
):
	"""
	Save draft: all payment rows + variable/PF amounts (Additional Salary) for this period.
	Does not create Payroll Entry or Salary Slips.
	"""
	import json

	start_date, end_date = _resolve_period_dates(month, year, start_date, end_date)
	company = company or frappe.defaults.get_global_default("company")
	period = get_period_status(company, start_date, end_date)
	if period.get("status") == "Finalized":
		frappe.throw(_("This period is already finalized. Reopen is not supported from this page."))

	if isinstance(save_additional_salary, str):
		save_additional_salary = cint(save_additional_salary)

	payroll_result = {"saved": 0}
	variable_result = {"created": 0, "updated": 0, "cancelled": 0, "skipped": 0, "errors": []}

	if payment_entries:
		if isinstance(payment_entries, str):
			payment_entries = json.loads(payment_entries or "[]")
		if payment_entries:
			payroll_result = save_payment_details(company, start_date, end_date, payment_entries)

	if save_additional_salary and variable_entries:
		if isinstance(variable_entries, str):
			variable_entries = json.loads(variable_entries or "[]")
		if variable_entries:
			variable_result = save_variable_components(company, getdate(end_date), variable_entries)

	period = mark_period_draft_saved(company, start_date, end_date)

	return {
		"message": _("Draft saved for this period."),
		"payment_saved": payroll_result.get("saved", 0),
		"variable_result": variable_result,
		"period": period,
	}


def _validate_payment_banks(payment_entries, employees_filter=None):
	"""Raise if Bank mode without bank name (for finalize)."""
	missing = []
	emp_set = set(employees_filter or [])
	for row in payment_entries or []:
		emp = row.get("employee")
		if emp_set and emp not in emp_set:
			continue
		if row.get("payment_mode") != "Bank":
			continue
		bank = (row.get("bank_name") or "").strip()
		if not bank:
			bank = (frappe.db.get_value("Employee", emp, "bank_name") or "").strip()
		if not bank:
			missing.append(emp)
	if missing:
		frappe.throw(_("Bank is required when mode is Bank: {0}").format(", ".join(missing[:15])))


@frappe.whitelist()
def finalize_variable_period(
	month=None,
	year=None,
	company=None,
	start_date=None,
	end_date=None,
	employees=None,
	payment_entries=None,
	variable_entries=None,
):
	"""Save draft then create Payroll Entry + Salary Slips."""
	import json

	if isinstance(employees, str):
		employees = json.loads(employees or "[]")
	if isinstance(payment_entries, str):
		payment_entries = json.loads(payment_entries or "[]")
	if isinstance(variable_entries, str):
		variable_entries = json.loads(variable_entries or "[]")

	start_date, end_date = _resolve_period_dates(month, year, start_date, end_date)
	company = company or frappe.defaults.get_global_default("company")
	period = get_period_status(company, start_date, end_date)
	if period.get("status") == "Finalized":
		frappe.throw(_("This period is already finalized. Open Payroll Entry from the list."))

	if not employees:
		frappe.throw(_("Select at least one employee for payroll."))

	_validate_payment_banks(payment_entries, employees)

	save_period_draft(
		month=month,
		year=year,
		company=company,
		start_date=start_date,
		end_date=end_date,
		save_additional_salary=1,
		payment_entries=payment_entries,
		variable_entries=variable_entries,
	)

	result = create_payroll_from_variable_components(
		month=month,
		year=year,
		company=company,
		start_date=start_date,
		end_date=end_date,
		employees=employees,
		submit_payroll_entry=1,
		save_entries_first=0,
		entries=None,
	)
	result["period"] = mark_period_finalized(company, start_date, end_date)
	result["message"] = _("Period finalized. {0}").format(result.get("message", ""))
	return result


def _salary_reference_by_employee(employees, start_date, end_date, company):
	"""Per-employee figures for variable sheet: gross from SSA; slip used for days/ded/net."""
	reference_date = getdate(end_date)
	assignment_base = get_assignment_base_by_employee(employees, reference_date, company)
	emp_by_name = {e.name: e for e in employees}

	filters = {
		"start_date": start_date,
		"end_date": end_date,
		"docstatus": ["<", 2],
		"employee": ["in", list(emp_by_name.keys())],
	}
	if company:
		filters["company"] = company

	slips = frappe.get_all(
		"Salary Slip",
		filters=filters,
		fields=[
			"name",
			"employee",
			"gross_pay",
			"total_deduction",
			"net_pay",
			"payment_days",
			"total_working_days",
		],
	)
	slip_by_employee = {s.employee: s for s in slips}
	attendance_map = attendance_by_employee(list(emp_by_name.values()), end_date)

	out = {}
	for emp_name, emp in emp_by_name.items():
		slip = slip_by_employee.get(emp_name)
		assigned_gross = assignment_base.get(emp_name)
		gross_pay = assigned_gross if assigned_gross else (flt(slip.gross_pay) if slip else 0)
		att = attendance_map.get(emp_name) or {}

		if not slip and att.get("has_attendance") and assigned_gross:
			month_days = flt(att.get("month_days"))
			payable_days = flt(att.get("payable_days"))
			if month_days > 0 and payable_days > 0 and payable_days < month_days:
				gross_pay = flt(assigned_gross) * (payable_days / month_days)
			else:
				gross_pay = flt(assigned_gross)

		status = _employment_status(emp.employment_type)
		if status == "Contractual":
			perm_gross, contract_gross = 0, gross_pay
		else:
			# Permanent column: full assignment base; gross_pay may be attendance-prorated
			perm_gross = flt(assigned_gross) if assigned_gross else gross_pay
			contract_gross = 0

		row = {
			"assignment_gross": flt(assigned_gross) if assigned_gross else 0,
			"perm_gross": perm_gross,
			"contract_gross": contract_gross,
			"gross_pay": gross_pay,
			"total_deduction": flt(slip.total_deduction) if slip else 0,
			"net_pay": flt(slip.net_pay) if slip else 0,
			"payment_days": flt(slip.payment_days)
			if slip
			else flt(att.get("payable_days")),
			"total_working_days": flt(slip.total_working_days)
			if slip
			else flt(att.get("month_days") or att.get("total_working_days")),
			"payable_days": flt(att.get("payable_days")),
			"month_days": flt(att.get("month_days")),
			"salary_slip": slip.name if slip else "",
			"has_slip": 1 if slip else 0,
			"has_assignment": 1 if assigned_gross else 0,
			"has_attendance": att.get("has_attendance", 0),
			"employee_attendance": att.get("employee_attendance") or "",
			"gross_source": "assignment" if assigned_gross else ("salary_slip" if slip else ""),
			"gross_prorated": 1
			if (not slip and att.get("has_attendance") and assigned_gross)
			else 0,
		}
		out[emp_name] = row
	return out


def _slip_component_amounts(employees, start_date, end_date, component_names, company):
	filters = {
		"start_date": start_date,
		"end_date": end_date,
		"docstatus": ["<", 2],
		"employee": ["in", [e.name for e in employees]],
	}
	if company:
		filters["company"] = company

	slips = frappe.get_all("Salary Slip", filters=filters, pluck="name")
	if not slips:
		return {}

	rows = frappe.db.sql(
		"""
		SELECT ss.employee, sd.salary_component, sd.amount
		FROM `tabSalary Detail` sd
		INNER JOIN `tabSalary Slip` ss ON ss.name = sd.parent
		WHERE sd.parent IN %(parents)s AND sd.salary_component IN %(comps)s
		""",
		{"parents": slips, "comps": component_names},
		as_dict=True,
	)
	out = defaultdict(dict)
	for r in rows:
		out[r.employee][r.salary_component] = flt(r.amount)
	return out


def _projected_gross_for_employee(employee, company, payroll_date, earning_keys, entry_amounts=None):
	"""Assigned gross + variable earnings (DB + in-flight save entries)."""
	from tif_customization.tif_customization.payroll_utils import get_employee_base_from_assignment

	assigned_gross = get_employee_base_from_assignment(employee, company, payroll_date)
	entry_amounts = entry_amounts or {}

	earnings, _ = resolve_component_names()
	earning_components = [c["component"] for c in earnings]
	variable_earn = 0.0
	if earning_components:
		rows = frappe.get_all(
			"Additional Salary",
			filters={
				"employee": employee,
				"salary_component": ["in", earning_components],
				"payroll_date": payroll_date,
				"docstatus": ["<", 2],
				**({"company": company} if company else {}),
			},
			fields=["salary_component", "amount"],
		)
		comp_to_key = {c["component"]: c["key"] for c in earnings}
		db_amounts = {}
		for row in rows:
			key = comp_to_key.get(row.salary_component)
			if key:
				db_amounts[key] = flt(row.amount)

		for key in earning_keys:
			variable_earn += flt(entry_amounts.get(key, db_amounts.get(key)))

	return assigned_gross, assigned_gross + variable_earn


def _find_existing_additional_salary(employee, component, payroll_date):
	return frappe.db.get_value(
		"Additional Salary",
		{
			"employee": employee,
			"salary_component": component,
			"payroll_date": payroll_date,
			"overwrite_salary_structure_amount": 1,
			"docstatus": ["<", 2],
		},
		"name",
		order_by="modified desc",
	)


def _upsert_additional_salary(employee, company, component, amount, payroll_date, ads_name=None):
	"""Create or update one Additional Salary; returns action label."""
	amount = flt(amount)
	ads_name = ads_name or _find_existing_additional_salary(employee, component, payroll_date)

	if amount <= 0:
		if not ads_name or not frappe.db.exists("Additional Salary", ads_name):
			return "skipped"
		doc = frappe.get_doc("Additional Salary", ads_name)
		if doc.docstatus == 0:
			frappe.delete_doc("Additional Salary", ads_name, ignore_permissions=True)
			return "cancelled"
		if doc.docstatus == 1:
			doc.cancel()
			return "cancelled"
		return "skipped"

	if ads_name and frappe.db.exists("Additional Salary", ads_name):
		doc = frappe.get_doc("Additional Salary", ads_name)
		if doc.docstatus == 1:
			if flt(doc.amount) == amount:
				return "skipped"
			doc.cancel()
			ads_name = None
		else:
			doc.amount = amount
			doc.payroll_date = payroll_date
			doc.save(ignore_permissions=True)
			doc.submit()
			return "updated"

	if not ads_name:
		emp_company = frappe.db.get_value("Employee", employee, "company") or company
		doc = frappe.new_doc("Additional Salary")
		doc.employee = employee
		doc.company = emp_company
		doc.salary_component = component
		doc.amount = amount
		doc.payroll_date = payroll_date
		doc.overwrite_salary_structure_amount = 1
		doc.insert(ignore_permissions=True)
		doc.submit()
		return "created"

	return "skipped"


@frappe.whitelist()
def save_variable_components(company, payroll_date, entries):
	"""
	Create/update Additional Salary from portal entries.
	entries: JSON list of {employee, component_key, amount, additional_salary?}
	"""
	import json

	if isinstance(entries, str):
		entries = json.loads(entries)

	if not entries:
		return {"created": 0, "updated": 0, "cancelled": 0, "skipped": 0, "errors": [], "message": _("No entries")}

	earnings, deductions = resolve_component_names()
	key_map = _key_to_component(earnings, deductions)
	earning_keys = [c["key"] for c in earnings]

	# Overlay in-batch earning amounts so PF can be recomputed in the same save request.
	entry_amounts_by_emp = defaultdict(dict)
	for entry in entries:
		key = entry.get("component_key")
		if key in earning_keys:
			entry_amounts_by_emp[entry.get("employee")][key] = flt(entry.get("amount"))

	payroll_date = getdate(payroll_date)
	created = updated = skipped = cancelled = 0
	errors = []

	for entry in entries:
		key = entry.get("component_key")
		component = key_map.get(key)
		if not component:
			continue

		employee = entry.get("employee")
		ads_name = entry.get("additional_salary") or None
		if ads_name in ("", "null", "undefined"):
			ads_name = None

		amount = flt(entry.get("amount"))
		if key == "pf":
			assigned_gross, projected_gross = _projected_gross_for_employee(
				employee,
				company,
				payroll_date,
				earning_keys,
				entry_amounts_by_emp.get(employee),
			)
			amount = compute_pf_deduction_amount(
				employee, projected_gross, assigned_base=assigned_gross
			)

		try:
			action = _upsert_additional_salary(
				employee,
				company,
				component,
				amount,
				payroll_date,
				ads_name=ads_name,
			)
			if action == "created":
				created += 1
			elif action == "updated":
				updated += 1
			elif action == "cancelled":
				cancelled += 1
			else:
				skipped += 1
			frappe.db.commit()
		except Exception as e:
			frappe.db.rollback()
			err_msg = str(e)
			if frappe.message_log:
				err_msg = frappe.message_log[-1].get("message") or err_msg
			errors.append(f"{employee} / {component}: {frappe.utils.strip_html(err_msg)}")
			frappe.log_error(frappe.get_traceback(), "Variable Components Save")

	return {
		"created": created,
		"updated": updated,
		"cancelled": cancelled,
		"skipped": skipped,
		"errors": errors,
		"message": _("Saved: {0} created, {1} updated, {2} removed, {3} skipped").format(
			created, updated, cancelled, skipped
		),
	}


def _find_payroll_entry(company, start_date, end_date):
	rows = frappe.get_all(
		"Payroll Entry",
		filters={
			"company": company,
			"start_date": start_date,
			"end_date": end_date,
			"docstatus": ["<", 2],
		},
		fields=["name", "docstatus", "salary_slips_created"],
		order_by="creation desc",
		limit=1,
	)
	return rows[0] if rows else None


def _get_payroll_eligible_employees(company, start_date, end_date):
	"""Employees who can be added to Payroll Entry for this period (SSA, not already payrolled)."""
	if not frappe.db.exists("DocType", "Payroll Entry"):
		return []
	try:
		defaults = _payroll_entry_defaults(company)
	except Exception:
		return []

	from hrms.payroll.doctype.payroll_entry.payroll_entry import get_employee_list, get_salary_structure

	sal_struct = get_salary_structure(company, defaults["currency"], 0, "Monthly")
	if not sal_struct:
		return []

	filters = frappe._dict(
		company=company,
		currency=defaults["currency"],
		start_date=start_date,
		end_date=end_date,
		payroll_payable_account=defaults["payroll_payable_account"],
		salary_slip_based_on_timesheet=0,
		payroll_frequency="Monthly",
	)
	rows = get_employee_list(filters=filters, as_dict=True, ignore_match_conditions=True) or []
	return [r.employee for r in rows]


def _get_payroll_period_info(company, start_date, end_date):
	"""Summary for Variable Components toolbar (existing PE / slips)."""
	info = {
		"payroll_entry": "",
		"payroll_entry_status": "",
		"payroll_entry_docstatus": None,
		"salary_slips_count": 0,
		"salary_slips_submitted": 0,
	}
	pe = _find_payroll_entry(company, start_date, end_date)
	if not pe:
		info["salary_slips_count"] = frappe.db.count(
			"Salary Slip",
			{
				"company": company,
				"start_date": start_date,
				"end_date": end_date,
				"docstatus": ["<", 2],
			},
		)
		return info

	info["payroll_entry"] = pe.name
	info["payroll_entry_docstatus"] = pe.docstatus
	info["payroll_entry_status"] = {0: "Draft", 1: "Submitted", 2: "Cancelled"}.get(
		cint(pe.docstatus), "Draft"
	)
	slips = frappe.get_all(
		"Salary Slip",
		filters={"payroll_entry": pe.name, "docstatus": ["<", 2]},
		fields=["name", "docstatus"],
	)
	info["salary_slips_count"] = len(slips)
	info["salary_slips_submitted"] = sum(1 for s in slips if s.docstatus == 1)
	return info


def _payroll_entry_defaults(company):
	if not frappe.db.exists("DocType", "Payroll Entry"):
		frappe.throw(_("HRMS Payroll is not installed (Payroll Entry missing)."))

	currency = frappe.db.get_value("Company", company, "default_currency")
	payroll_payable = frappe.db.get_value("Company", company, "default_payroll_payable_account")
	if not payroll_payable:
		frappe.throw(
			_("Set Default Payroll Payable Account on Company {0} before creating payroll.").format(
				company
			)
		)
	return {"currency": currency, "payroll_payable_account": payroll_payable}


def _employees_for_payroll_entry(company, start_date, end_date, employee_ids):
	"""Resolve Payroll Employee Detail rows for selected employees (must have SSA)."""
	from hrms.payroll.doctype.payroll_entry.payroll_entry import get_employee_list, get_salary_structure

	employee_ids = list({e for e in (employee_ids or []) if e})
	if not employee_ids:
		return [], employee_ids

	defaults = _payroll_entry_defaults(company)
	sal_struct = get_salary_structure(company, defaults["currency"], 0, "Monthly")
	if not sal_struct:
		frappe.throw(_("No active Salary Structure found for company {0}.").format(company))

	filters = frappe._dict(
		company=company,
		currency=defaults["currency"],
		start_date=start_date,
		end_date=end_date,
		payroll_payable_account=defaults["payroll_payable_account"],
		salary_slip_based_on_timesheet=0,
		payroll_frequency="Monthly",
	)

	all_rows = get_employee_list(filters=filters, as_dict=True, ignore_match_conditions=True)
	by_emp = {r.employee: r for r in (all_rows or [])}
	selected_set = set(employee_ids)
	rows = [by_emp[e] for e in employee_ids if e in by_emp]
	missing = [e for e in employee_ids if e not in by_emp]
	return rows, missing


@frappe.whitelist()
def get_payroll_run_status(month=None, year=None, company=None, start_date=None, end_date=None):
	start_date, end_date = _resolve_period_dates(month, year, start_date, end_date)
	company = company or frappe.defaults.get_global_default("company")
	return _get_payroll_period_info(company, start_date, end_date)


@frappe.whitelist()
def create_payroll_from_variable_components(
	month=None,
	year=None,
	company=None,
	start_date=None,
	end_date=None,
	employees=None,
	submit_payroll_entry=1,
	save_entries_first=0,
	entries=None,
):
	"""
	Create (or update draft) Payroll Entry for selected employees and generate Salary Slips.
	Save Additional Salary rows first when save_entries_first=1 and entries are passed.
	"""
	import json

	frappe.has_permission("Payroll Entry", "create", throw=True)

	if isinstance(employees, str):
		employees = json.loads(employees or "[]")
	if isinstance(submit_payroll_entry, str):
		submit_payroll_entry = cint(submit_payroll_entry)
	if isinstance(save_entries_first, str):
		save_entries_first = cint(save_entries_first)

	start_date, end_date = _resolve_period_dates(month, year, start_date, end_date)
	company = company or frappe.defaults.get_global_default("company")
	payroll_date = getdate(end_date)

	if save_entries_first and entries:
		if isinstance(entries, str):
			entries = json.loads(entries)
		save_result = save_variable_components(company, payroll_date, entries)
		if save_result.get("errors"):
			frappe.throw(
				_("Fix Additional Salary errors before payroll:<br>") + "<br>".join(
					save_result["errors"][:10]
				)
			)

	if not employees:
		frappe.throw(_("Select at least one employee for payroll."))

	emp_rows, missing = _employees_for_payroll_entry(company, start_date, end_date, employees)
	if not emp_rows:
		frappe.throw(
			_("None of the selected employees are eligible for payroll (active Salary Structure Assignment required).")
		)

	defaults = _payroll_entry_defaults(company)
	existing = _find_payroll_entry(company, start_date, end_date)

	if existing and cint(existing.docstatus) == 1:
		frappe.throw(
			_("Payroll Entry {0} is already submitted for this period. Open it from Payroll Entry list.").format(
				existing.name
			)
		)

	if existing and cint(existing.docstatus) == 0:
		pe = frappe.get_doc("Payroll Entry", existing.name)
		pe.validate_attendance = 0
	else:
		pe = frappe.new_doc("Payroll Entry")
		pe.company = company
		pe.posting_date = payroll_date
		pe.start_date = start_date
		pe.end_date = end_date
		pe.payroll_frequency = "Monthly"
		pe.currency = defaults["currency"]
		pe.exchange_rate = 1
		pe.payroll_payable_account = defaults["payroll_payable_account"]
		pe.salary_slip_based_on_timesheet = 0
		pe.validate_attendance = 0

	pe.set("employees", [])
	for row in emp_rows:
		pe.append(
			"employees",
			{
				"employee": row.employee,
				"employee_name": row.employee_name,
				"department": row.get("department"),
				"designation": row.get("designation"),
			},
		)
	pe.number_of_employees = len(pe.employees)

	if pe.docstatus == 0:
		pe.flags.ignore_validate = False
		if existing:
			pe.save(ignore_permissions=True)
		else:
			pe.insert(ignore_permissions=True)

	salary_slips_before = frappe.get_all(
		"Salary Slip", filters={"payroll_entry": pe.name, "docstatus": ["<", 2]}, pluck="name"
	)

	if submit_payroll_entry and pe.docstatus == 0:
		pe.submit()
		pe.reload()

	salary_slips = frappe.get_all(
		"Salary Slip",
		filters={"payroll_entry": pe.name, "docstatus": ["<", 2]},
		fields=["name", "employee", "employee_name", "docstatus"],
		order_by="employee_name asc",
	)

	return {
		"payroll_entry": pe.name,
		"payroll_entry_url": frappe.utils.get_url_to_form("Payroll Entry", pe.name),
		"payroll_entry_docstatus": pe.docstatus,
		"employees_in_payroll": len(emp_rows),
		"employees_skipped": missing,
		"salary_slips_created": max(0, len(salary_slips) - len(salary_slips_before)),
		"salary_slips": salary_slips,
		"salary_slips_count": len(salary_slips),
		"message": _("Payroll Entry {0} — {1} salary slip(s)").format(pe.name, len(salary_slips)),
		"additional_salary_saved": bool(save_entries_first and entries),
	}
