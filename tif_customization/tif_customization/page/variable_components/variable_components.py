import calendar
from collections import defaultdict

import frappe
from frappe import _
from frappe.utils import flt, formatdate, getdate

from tif_customization.tif_customization.page.salary_register.salary_register import (
	COMPONENT_MAP,
	_resolve_period_dates,
	_sum_components,
	get_period_options,
)

# Read-only columns from Salary Slip (like Excel gross / net block)
SALARY_COLUMNS = [
	{"key": "perm_gross", "label": "Gross (Permanent)"},
	{"key": "contract_gross", "label": "Gross (Contract)"},
	{"key": "gross_pay", "label": "Gross Pay"},
	{"key": "total_deduction", "label": "Total Deduction"},
	{"key": "net_pay", "label": "Net Salary"},
	{"key": "payment_days", "label": "Days Worked"},
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


def _component_keys(earnings, deductions):
	return [c["key"] for c in earnings] + [c["key"] for c in deductions]


def _key_to_component(earnings, deductions):
	mapping = {}
	for c in earnings + deductions:
		mapping[c["key"]] = c["component"]
	return mapping


@frappe.whitelist()
def get_period_options_for_variable():
	return get_period_options()


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

	# Active employees in roster (+ any with slips this period)
	roster_ids = list(EMPLOYEE_SECTION_MAP.keys())
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
	employee_ids = list(set(roster_ids) | set(slip_employees or []))

	if not employee_ids:
		return _empty_response(month_label, start_date, end_date, company, earnings, deductions)

	emp_filters = {"name": ["in", employee_ids], "status": "Active"}
	if company:
		emp_filters["company"] = company

	employees = frappe.get_all(
		"Employee",
		filters=emp_filters,
		fields=[
			"name",
			"employee_name",
			"designation",
			"department",
			"branch",
			"employment_type",
			"company",
		],
		order_by="employee_name asc",
	)

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

	# Salary slip snapshot (read-only reference for PF etc.)
	slip_amounts = _slip_component_amounts(employees, start_date, end_date, component_names, company)
	slip_salary = _slip_salary_by_employee(employees, start_date, end_date, company)

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
			# PF readonly: show from slip if no additional salary
			if col.get("readonly") and not amounts[key]:
				amounts[key] = slip_amounts.get(emp.name, {}).get(col["component"], 0)

		rows.append(
			{
				"employee": emp.name,
				"employee_name": emp.employee_name,
				"designation": emp.designation or "",
				"department": emp.department or "",
				"branch": emp.branch or "",
				"employment_type": emp.employment_type or "",
				"company": emp.company,
				"section_key": section_key,
				"_section_sort": section_sort,
				"amounts": amounts,
				"additional_salary": docnames,
				"salary": slip_salary.get(emp.name, {}),
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
	}


def _empty_response(month_label, start_date, end_date, company, earnings, deductions):
	return {
		"title": _("THE ILM FOUNDATION - VARIABLE COMPONENTS"),
		"subtitle": _("For the Month of {0}").format(month_label),
		"company": company,
		"period_label": f"{formatdate(start_date)} – {formatdate(end_date)}",
		"payroll_date": str(end_date),
		"earnings": earnings,
		"deductions": deductions,
		"sections": [],
		"grand_totals": {},
		"employee_count": 0,
	}


def _slip_salary_by_employee(employees, start_date, end_date, company):
	"""Per-employee salary slip figures (read-only reference on variable sheet)."""
	filters = {
		"start_date": start_date,
		"end_date": end_date,
		"docstatus": ["<", 2],
		"employee": ["in", [e.name for e in employees]],
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
	if not slips:
		return {}

	slip_names = [s.name for s in slips]
	component_rows = frappe.db.sql(
		"""
		SELECT parent, salary_component, amount
		FROM `tabSalary Detail`
		WHERE parent IN %(parents)s
		""",
		{"parents": slip_names},
		as_dict=True,
	)
	components_by_slip = defaultdict(dict)
	for row in component_rows:
		components_by_slip[row.parent][row.salary_component] = flt(row.amount)

	out = {}
	for slip in slips:
		components = components_by_slip.get(slip.name, {})
		perm_gross = _sum_components(components, COMPONENT_MAP["perm_gross"])
		contract_gross = _sum_components(components, COMPONENT_MAP["contract_gross"])
		out[slip.employee] = {
			"perm_gross": perm_gross,
			"contract_gross": contract_gross,
			"gross_pay": flt(slip.gross_pay),
			"total_deduction": flt(slip.total_deduction),
			"net_pay": flt(slip.net_pay),
			"payment_days": flt(slip.payment_days),
			"total_working_days": flt(slip.total_working_days),
			"salary_slip": slip.name,
			"has_slip": 1,
		}
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


@frappe.whitelist()
def save_variable_components(company, payroll_date, entries):
	"""
	Create/update Additional Salary from portal entries.
	entries: JSON list of {employee, component_key, amount, additional_salary?}
	"""
	import json

	if isinstance(entries, str):
		entries = json.loads(entries)

	earnings, deductions = resolve_component_names()
	key_map = _key_to_component(earnings, deductions)
	readonly_keys = {c["key"] for c in deductions if c.get("readonly")}

	payroll_date = getdate(payroll_date)
	created = updated = skipped = cancelled = 0
	errors = []

	for entry in entries:
		key = entry.get("component_key")
		if key in readonly_keys:
			skipped += 1
			continue

		component = key_map.get(key)
		if not component:
			continue

		employee = entry.get("employee")
		amount = flt(entry.get("amount"))
		ads_name = entry.get("additional_salary")

		try:
			if amount <= 0:
				if ads_name and frappe.db.exists("Additional Salary", ads_name):
					doc = frappe.get_doc("Additional Salary", ads_name)
					if doc.docstatus == 0:
						frappe.delete_doc("Additional Salary", ads_name, ignore_permissions=True)
						cancelled += 1
					elif doc.docstatus == 1:
						doc.cancel()
						cancelled += 1
				continue

			if ads_name and frappe.db.exists("Additional Salary", ads_name):
				doc = frappe.get_doc("Additional Salary", ads_name)
				if doc.docstatus == 1:
					skipped += 1
					continue
				doc.amount = amount
				doc.payroll_date = payroll_date
				doc.save(ignore_permissions=True)
				doc.submit()
				updated += 1
			else:
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
				created += 1
		except Exception as e:
			errors.append(f"{employee} / {component}: {str(e)}")
			frappe.log_error(frappe.get_traceback(), "Variable Components Save")

	frappe.db.commit()
	return {
		"created": created,
		"updated": updated,
		"cancelled": cancelled,
		"skipped": skipped,
		"errors": errors,
		"message": _("Saved: {0} created, {1} updated, {2} removed").format(created, updated, cancelled),
	}
