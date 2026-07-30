# Copyright (c) 2026, TIF Customization and contributors
# License: MIT

from datetime import date as dt_date
from typing import Dict, List, Optional, Tuple

import frappe
from frappe import _
from frappe.utils import cint, flt, formatdate, getdate, nowdate

from tif_customization.tif_customization.page.hr_dashboard.hr_dashboard import (
	_payroll_period_settings,
)

EA_DOCTYPE = "Employee Attendance"
EA_TABLE = "`tabEmployee Attendance`"
METRIC_FIELD = "total_early_goings"

# An Employee Attendance row is labelled by the month its 26th-to-25th window closes
# in, so "July 2025" holds 26 Jun 2025 – 25 Jul 2025. A payroll year therefore runs
# July..June, with Jan..June belonging to the following calendar year.
FIRST_HALF = ("July", "August", "September", "October", "November", "December")
SECOND_HALF = ("January", "February", "March", "April", "May", "June")

UNASSIGNED = "Unassigned"


def execute(filters: Optional[Dict] = None) -> Tuple:
	filters = frappe._dict(filters or {})
	year_from = cint(filters.get("year_from") or default_year_from())
	month_keys = payroll_year_months(year_from)
	return get_columns(month_keys), get_data(filters, month_keys), payroll_year_note(year_from)


def default_year_from() -> int:
	"""Opening calendar year of the payroll year the HR Dashboard treats as current."""
	return getdate(nowdate()).year - 1


def payroll_year_months(year_from: int) -> List[Tuple[str, str]]:
	return [(str(year_from), m) for m in FIRST_HALF] + [(str(year_from + 1), m) for m in SECOND_HALF]


def payroll_year_bounds(year_from: int) -> Tuple[dt_date, dt_date]:
	period_from, period_to = _payroll_period_settings()
	return dt_date(year_from, 6, period_from), dt_date(year_from + 1, 6, period_to)


def payroll_year_note(year_from: int) -> str:
	period_from, period_to = _payroll_period_settings()
	year_start, year_end = payroll_year_bounds(year_from)
	first_start, first_end = dt_date(year_from, 6, period_from), dt_date(year_from, 7, period_to)
	return _(
		"Payroll year {0} to {1}. Each month column is a {2}th-to-{3}th payroll period named"
		" after the month it ends in, so <b>{4}</b> covers {5} to {6}."
	).format(
		formatdate(year_start, "dd MMM yyyy"),
		formatdate(year_end, "dd MMM yyyy"),
		period_from,
		period_to,
		month_label(str(year_from), "July"),
		formatdate(first_start, "dd MMM yyyy"),
		formatdate(first_end, "dd MMM yyyy"),
	)


def month_fieldname(year: str, month: str) -> str:
	return f"m_{year}_{month.lower()}"


def month_label(year: str, month: str) -> str:
	return f"{month[:3]} {str(year)[-2:]}"


def has_field(fieldname: str, doctype: str = EA_DOCTYPE) -> bool:
	try:
		return bool(frappe.get_meta(doctype).get_field(fieldname))
	except Exception:
		return False


def num_sql(field: str, alias: str = "a") -> str:
	"""Sum-safe numeric cast: several Employee Attendance totals are Data fields."""
	return (
		f"COALESCE(CAST(IFNULL(NULLIF(TRIM({alias}.`{field}`), ''), '0') AS DECIMAL(18,4)), 0)"
	)


def get_columns(month_keys: List[Tuple[str, str]]) -> List[Dict]:
	columns = [
		{"label": _("S.No"), "fieldname": "s_no", "fieldtype": "Data", "width": 60},
		{
			"label": _("Employee"),
			"fieldname": "employee",
			"fieldtype": "Link",
			"options": "Employee",
			"width": 110,
		},
		{"label": _("Name"), "fieldname": "employee_name", "fieldtype": "Data", "width": 220},
	]
	for year, month in month_keys:
		columns.append(
			{
				"label": month_label(year, month),
				"fieldname": month_fieldname(year, month),
				"fieldtype": "Float",
				"precision": 0,
				"width": 70,
			}
		)
	columns.append(
		{"label": _("Total"), "fieldname": "total", "fieldtype": "Float", "precision": 0, "width": 85}
	)
	return columns


def build_conditions(filters: Dict, month_keys: List[Tuple[str, str]]) -> Tuple[str, Dict]:
	params: Dict = {"unassigned": UNASSIGNED}
	month_clauses = []
	for i, (year, month) in enumerate(month_keys):
		# TRIM/CAST: month and year are Select fields, so stored values may carry whitespace.
		month_clauses.append(
			f"(TRIM(CAST(a.`year` AS CHAR)) = %(y{i})s AND TRIM(COALESCE(a.`month`, '')) = %(m{i})s)"
		)
		params[f"y{i}"] = year
		params[f"m{i}"] = month

	conditions = ["a.docstatus < 2", "(" + " OR ".join(month_clauses) + ")"]

	# Employee Attendance often leaves company/unit/department blank, so fall back to Employee.
	if filters.get("company") and has_field("company"):
		conditions.append(
			"COALESCE(NULLIF(TRIM(a.`company`), ''), NULLIF(TRIM(e.`company`), '')) = %(company)s"
		)
		params["company"] = filters.get("company")

	if filters.get("branch") and has_field("unit"):
		conditions.append(
			"COALESCE(NULLIF(TRIM(a.`unit`), ''), NULLIF(TRIM(e.`branch`), '')) = %(branch)s"
		)
		params["branch"] = filters.get("branch")

	if filters.get("department"):
		conditions.append(
			"COALESCE(NULLIF(TRIM(a.`department`), ''), NULLIF(TRIM(e.`department`), '')) = %(department)s"
		)
		params["department"] = filters.get("department")

	if filters.get("employee"):
		conditions.append("a.`employee` = %(employee)s")
		params["employee"] = filters.get("employee")

	if filters.get("employment_type") and has_field("employment_type", "Employee"):
		conditions.append("e.`employment_type` = %(employment_type)s")
		params["employment_type"] = filters.get("employment_type")

	if filters.get("only_active") and has_field("status", "Employee"):
		conditions.append("COALESCE(e.`status`, '') = 'Active'")

	return " AND ".join(conditions), params


def fetch_rows(filters: Dict, month_keys: List[Tuple[str, str]]) -> List[Dict]:
	where_sql, params = build_conditions(filters, month_keys)
	return (
		frappe.db.sql(
			f"""
		SELECT
			COALESCE(NULLIF(TRIM(a.`employee`), ''), '') AS employee,
			COALESCE(NULLIF(TRIM(a.`employee_name`), ''), a.`employee`, 'Unknown') AS employee_name,
			COALESCE(
				NULLIF(TRIM(a.`department`), ''), NULLIF(TRIM(e.`department`), ''), %(unassigned)s
			) AS department,
			TRIM(CAST(a.`year` AS CHAR)) AS year,
			TRIM(COALESCE(a.`month`, '')) AS month,
			SUM({num_sql(METRIC_FIELD)}) AS metric
		FROM {EA_TABLE} a
		LEFT JOIN `tabEmployee` e ON e.name = a.`employee`
		WHERE {where_sql}
		GROUP BY employee, employee_name, department, year, month
		""",
			params,
			as_dict=True,
		)
		or []
	)


def get_data(filters: Dict, month_keys: List[Tuple[str, str]]) -> List[Dict]:
	if not frappe.db.table_exists(EA_DOCTYPE) or not has_field(METRIC_FIELD):
		return []

	# (department, employee_name, employee) -> {(year, month): metric}
	buckets: Dict[Tuple[str, str, str], Dict[Tuple[str, str], float]] = {}
	for row in fetch_rows(filters, month_keys):
		key = (row.get("department") or UNASSIGNED, row.get("employee_name") or "Unknown", row.get("employee") or "")
		buckets.setdefault(key, {})[(row.get("year"), row.get("month"))] = flt(row.get("metric"))

	hide_zero = cint(filters.get("hide_zero"))
	data: List[Dict] = []
	grand_totals: Dict[str, float] = {}

	for department in sorted({key[0] for key in buckets}):
		employees = sorted(key for key in buckets if key[0] == department)
		department_totals: Dict[str, float] = {}
		body: List[Dict] = []

		for key in employees:
			monthly = buckets[key]
			row = {"employee": key[2], "employee_name": key[1], "department": department}
			total = 0.0
			for year, month in month_keys:
				value = flt(monthly.get((year, month)))
				row[month_fieldname(year, month)] = value
				total += value
			row["total"] = total

			if hide_zero and not total:
				continue

			body.append(row)
			for column in list(month_fieldname(y, m) for y, m in month_keys) + ["total"]:
				department_totals[column] = flt(department_totals.get(column)) + flt(row.get(column))
				grand_totals[column] = flt(grand_totals.get(column)) + flt(row.get(column))

		if not body:
			continue

		for index, row in enumerate(body, start=1):
			row["s_no"] = index

		data.append(dict(department_totals, employee_name=department, is_group=1))
		data.extend(body)

	if data:
		data.append(dict(grand_totals, employee_name=_("Grand Total"), is_group=1))

	return data
