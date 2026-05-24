import calendar
from collections import defaultdict

import frappe
from frappe import _
from frappe.utils import flt, formatdate, getdate

from tif_customization.tif_customization.page.salary_register.salary_register_sections import (
	HEADER_ONLY_SECTIONS,
	SECTION_ORDER,
	UNASSIGNED_SECTION,
	get_employee_section,
	sort_key_for_row,
)

COMPONENT_MAP = {
	"perm_gross": ("Basic Salary",),
	"contract_gross": ("Contractual Salary",),
	"arrears": ("Leave Encashment",),
	"fuel": ("Fuel Allowance",),
	"mobile": ("Mobile Allowance", "Mobile Allownce"),
	"overtime": ("Overtime Allowance",),
	"other_allowance": (
		"Other Allowance",
		"Conveyance Allowance",
		"Travelling Allownce",
		"Utility Allowance",
		"Reimbursement",
	),
	"leave_ded": ("Absents Deduction", "Halfday Deduction", "Late Absents"),
	"pf": ("Provident Fund", "PF", "Provident Fund Deduction"),
	"fuel_ded": ("Fuel Deducted", "Fuel Deduction", "Conveyance Allowance Deduction"),
	"tax": (
		"Income Tax Deduction",
		"Withholding Tax",
		"Income Tax Slab 2",
		"Income Tax Slab 3",
		"Income Tax Slab 4",
	),
}


def _sum_components(components, keys):
	return sum(flt(components.get(k)) for k in keys)


def _dept_code(department):
	dept = (department or "").lower()
	if "quran" in dept:
		return "QPS"
	if "tilawat" in dept or "schools" in dept:
		return "TPS"
	if "teacher training" in dept or "educational excellence" in dept:
		return "CEE"
	return "TIF"


def _employment_status(employment_type):
	et = (employment_type or "").lower()
	if "contract" in et and "permanent" not in et:
		return "Contractual"
	if "part time" in et:
		return "Part Time"
	if "contract" in et:
		return "Contractual"
	return "Permanent"


def _resolve_period(month=None, year=None):
	today = getdate()
	year = int(year or today.year)
	month = int(month or today.month)

	if not month or month < 1 or month > 12:
		month = today.month

	latest = frappe.db.sql(
		"""
		SELECT start_date, end_date
		FROM `tabSalary Slip`
		WHERE docstatus < 2
		ORDER BY end_date DESC
		LIMIT 1
		""",
		as_dict=True,
	)
	if latest and month == today.month and year == today.year:
		end = getdate(latest[0].end_date)
		year, month = end.year, end.month

	start = getdate(f"{year}-{month:02d}-01")
	last_day = calendar.monthrange(year, month)[1]
	end = getdate(f"{year}-{month:02d}-{last_day}")

	period = frappe.db.sql(
		"""
		SELECT start_date, end_date, COUNT(*) AS slip_count
		FROM `tabSalary Slip`
		WHERE docstatus < 2 AND end_date BETWEEN %s AND %s
		GROUP BY start_date, end_date
		ORDER BY slip_count DESC
		LIMIT 1
		""",
		(start, end),
		as_dict=True,
	)
	if period:
		return period[0].start_date, period[0].end_date

	# Payroll month often ends 25th — try common TIF cycle
	period = frappe.db.sql(
		"""
		SELECT start_date, end_date, COUNT(*) AS slip_count
		FROM `tabSalary Slip`
		WHERE docstatus < 2
			AND YEAR(end_date) = %s AND MONTH(end_date) = %s
		GROUP BY start_date, end_date
		ORDER BY slip_count DESC
		LIMIT 1
		""",
		(year, month),
		as_dict=True,
	)
	if period:
		return period[0].start_date, period[0].end_date

	return start, end


@frappe.whitelist()
def get_period_options():
	rows = frappe.db.sql(
		"""
		SELECT DISTINCT YEAR(end_date) AS year, MONTH(end_date) AS month,
			start_date, end_date, COUNT(*) AS slip_count
		FROM `tabSalary Slip`
		WHERE docstatus < 2
		GROUP BY YEAR(end_date), MONTH(end_date), start_date, end_date
		ORDER BY end_date DESC
		LIMIT 24
		""",
		as_dict=True,
	)
	options = []
	for r in rows:
		end = getdate(r.end_date)
		label = f"{calendar.month_name[end.month]} {end.year} ({formatdate(r.start_date)} – {formatdate(r.end_date)})"
		options.append(
			{
				"label": label,
				"month": end.month,
				"year": end.year,
				"start_date": str(r.start_date),
				"end_date": str(r.end_date),
			}
		)
	return options


@frappe.whitelist()
def get_register_data(month=None, year=None, company=None, start_date=None, end_date=None, include_draft=1):
	start_date, end_date = _resolve_period_dates(month, year, start_date, end_date)
	docstatus = (0, 1) if frappe.utils.cint(include_draft) else (1,)

	filters = {"start_date": start_date, "end_date": end_date, "docstatus": ["in", list(docstatus)]}
	if company:
		filters["company"] = company

	slips = frappe.get_all(
		"Salary Slip",
		filters=filters,
		fields=[
			"name",
			"employee",
			"employee_name",
			"department",
			"designation",
			"branch",
			"company",
			"payment_days",
			"total_working_days",
			"gross_pay",
			"total_deduction",
			"net_pay",
		],
		order_by="employee_name asc",
	)

	if not slips:
		return {
			"title": _("STAFF SALARY SHEET"),
			"subtitle": _("No salary slips found for the selected period."),
			"period_label": f"{formatdate(start_date)} – {formatdate(end_date)}",
			"sections": [],
			"grand_totals": {},
		}

	slip_names = [s.name for s in slips]
	component_rows = frappe.db.sql(
		"""
		SELECT parent, salary_component, amount, parentfield
		FROM `tabSalary Detail`
		WHERE parent IN %(parents)s
		""",
		{"parents": slip_names},
		as_dict=True,
	)
	components_by_slip = defaultdict(dict)
	for row in component_rows:
		components_by_slip[row.parent][row.salary_component] = flt(row.amount)

	employees = {s.employee for s in slips}
	emp_rows = frappe.db.sql(
		"""
		SELECT name, grades, grade, employment_type, bank_ac_no, bank_name,
			date_of_birth, date_of_joining, status, branch
		FROM `tabEmployee`
		WHERE name IN %(emps)s
		""",
		{"emps": list(employees)},
		as_dict=True,
	)
	emp_map = {e.name: e for e in emp_rows}

	company_name = company or slips[0].company
	company_doc = frappe.db.get_value(
		"Company", company_name, ["company_name", "default_currency"], as_dict=True
	)
	end = getdate(end_date)
	month_label = f"{calendar.month_name[end.month]} {end.year}"

	rows = []
	for slip in slips:
		emp = emp_map.get(slip.employee) or {}
		components = components_by_slip.get(slip.name, {})
		employment_type = emp.get("employment_type") or ""

		perm_gross = _sum_components(components, COMPONENT_MAP["perm_gross"])
		contract_gross = _sum_components(components, COMPONENT_MAP["contract_gross"])
		arrears = _sum_components(components, COMPONENT_MAP["arrears"])
		fuel = _sum_components(components, COMPONENT_MAP["fuel"])
		mobile = _sum_components(components, COMPONENT_MAP["mobile"])
		overtime = _sum_components(components, COMPONENT_MAP["overtime"])
		other_allow = _sum_components(components, COMPONENT_MAP["other_allowance"])
		leave_ded = _sum_components(components, COMPONENT_MAP["leave_ded"])
		pf = _sum_components(components, COMPONENT_MAP["pf"])
		fuel_ded = _sum_components(components, COMPONENT_MAP["fuel_ded"])
		tax = _sum_components(components, COMPONENT_MAP["tax"])

		perm_total = perm_gross + arrears
		contract_total = contract_gross + arrears
		ded_total = flt(slip.total_deduction) or (leave_ded + pf + fuel_ded + tax)

		rows.append(
			{
				"salary_slip": slip.name,
				"employee": slip.employee,
				"employee_name": slip.employee_name,
				"designation": slip.designation or "",
				"branch": slip.branch or emp.get("branch") or "",
				"date_of_birth": emp.get("date_of_birth"),
				"grades": emp.get("grades") or emp.get("grade") or "",
				"bank_ac_no": emp.get("bank_ac_no") or "",
				"status": _employment_status(employment_type),
				"dept_code": _dept_code(slip.department),
				"department": slip.department,
				"employment_type": employment_type,
				"section_key": get_employee_section(slip.employee, slip.employee_name)[0],
				"_section_sort": get_employee_section(slip.employee, slip.employee_name),
				"perm_gross": perm_gross,
				"perm_arrears": arrears if contract_gross <= 0 else 0,
				"perm_total": perm_total if contract_gross <= 0 else 0,
				"contract_gross": contract_gross,
				"contract_arrears": arrears if contract_gross > 0 else 0,
				"contract_total": contract_total if contract_gross > 0 else 0,
				"fuel": fuel,
				"mobile": mobile,
				"overtime": overtime,
				"other_allowance": other_allow,
				"days_worked": flt(slip.payment_days),
				"leave_ded": leave_ded,
				"pf": pf,
				"fuel_ded": fuel_ded,
				"ded_total": ded_total,
				"tax": tax,
				"net_pay": flt(slip.net_pay),
				"joining_date": emp.get("date_of_joining"),
				"payment_mode": "Bank Letter",
			}
		)

	section_rows = defaultdict(list)
	for row in rows:
		section_rows[row["section_key"]].append(row)

	sections = []
	grand = defaultdict(float)
	sr = 0

	for section_label in SECTION_ORDER:
		items = section_rows.get(section_label) or []
		is_header_only = section_label in HEADER_ONLY_SECTIONS

		if not items and not is_header_only:
			continue

		items.sort(key=sort_key_for_row)
		section_total = defaultdict(float)
		section_data = []

		for item in items:
			sr += 1
			item["serial"] = sr
			item["section_no"] = SECTION_ORDER.index(section_label) + 1
			section_data.append(item)
			for key in (
				"perm_gross",
				"perm_arrears",
				"perm_total",
				"contract_gross",
				"contract_arrears",
				"contract_total",
				"fuel",
				"mobile",
				"overtime",
				"other_allowance",
				"days_worked",
				"leave_ded",
				"pf",
				"fuel_ded",
				"ded_total",
				"tax",
				"net_pay",
			):
				section_total[key] += flt(item.get(key))
				grand[key] += flt(item.get(key))

		sections.append(
			{
				"label": section_label,
				"rows": section_data,
				"totals": dict(section_total),
				"header_only": is_header_only and not section_data,
			}
		)

	return {
		"title": _("THE ILM FOUNDATION - STAFF SALARY SHEET"),
		"subtitle": _("For the Month of {0}").format(month_label),
		"company": (company_doc or {}).get("company_name") or company_name,
		"period_label": f"{formatdate(start_date)} – {formatdate(end_date)}",
		"start_date": str(start_date),
		"end_date": str(end_date),
		"month": end.month,
		"year": end.year,
		"sections": sections,
		"grand_totals": dict(grand),
		"employee_count": sr,
	}


def _resolve_period_dates(month, year, start_date, end_date):
	if start_date and end_date:
		return getdate(start_date), getdate(end_date)
	return _resolve_period(month, year)
