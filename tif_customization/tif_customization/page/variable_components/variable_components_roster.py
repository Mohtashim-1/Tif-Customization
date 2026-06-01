"""Period roster + Employee Attendance helpers for Variable Components."""

import calendar

import frappe
from frappe import _
from frappe.utils import add_months, cint, flt, formatdate, getdate

_PAYROLL_MONTHS = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
]


def month_year_from_period_end(end_date):
	end_date = getdate(end_date)
	return _PAYROLL_MONTHS[end_date.month - 1], end_date.year


def _roster_doctype_exists():
	return frappe.db.exists("DocType", "Variable Components Roster")


def get_active_employees(company, start_date, end_date):
	"""Active employees for company valid during payroll period."""
	start_date, end_date = getdate(start_date), getdate(end_date)
	filters = {"status": "Active"}
	if company:
		filters["company"] = company

	employees = frappe.get_all(
		"Employee",
		filters=filters,
		fields=[
			"name",
			"employee_name",
			"designation",
			"department",
			"branch",
			"employment_type",
			"company",
			"bank_name",
			"bank_ac_no",
			"date_of_joining",
			"relieving_date",
		],
		order_by="employee_name asc",
	)
	out = []
	for emp in employees:
		joining = emp.get("date_of_joining")
		relieving = emp.get("relieving_date")
		if joining and getdate(joining) > end_date:
			continue
		if relieving and getdate(relieving) < start_date:
			continue
		out.append(emp)
	return out


def roster_count(company, start_date, end_date):
	if not _roster_doctype_exists():
		return 0
	return frappe.db.count(
		"Variable Components Roster",
		{"company": company, "start_date": start_date, "end_date": end_date},
	)


def initialize_period_roster(company, start_date, end_date, force=0):
	"""Create roster rows for all active employees (first-time setup for period)."""
	if not _roster_doctype_exists():
		frappe.throw(_("Variable Components Roster DocType is not installed. Run bench migrate."))

	start_date, end_date = getdate(start_date), getdate(end_date)
	company = company or frappe.defaults.get_global_default("company")

	if roster_count(company, start_date, end_date) and not cint(force):
		included = len(get_included_employee_ids(company, start_date, end_date))
		return {
			"initialized": False,
			"employee_count": included,
			"message": _("Period roster already exists ({0} employees on sheet). Use Reload to refresh.").format(
				included
			),
		}

	active = get_active_employees(company, start_date, end_date)
	created = updated = 0
	for emp in active:
		filters = {
			"company": company,
			"start_date": start_date,
			"end_date": end_date,
			"employee": emp.name,
		}
		name = frappe.db.get_value("Variable Components Roster", filters)
		if name:
			doc = frappe.get_doc("Variable Components Roster", name)
			if doc.excluded and not doc.manually_added:
				doc.excluded = 0
				doc.save(ignore_permissions=True)
				updated += 1
		else:
			doc = frappe.new_doc("Variable Components Roster")
			doc.update(filters)
			doc.employee_name = emp.employee_name
			doc.excluded = 0
			doc.manually_added = 0
			doc.insert(ignore_permissions=True)
			created += 1

	return {
		"initialized": True,
		"created": created,
		"updated": updated,
		"employee_count": len(get_included_employee_ids(company, start_date, end_date)),
		"message": _("Loaded {0} active employees for this period.").format(created + updated),
	}


def get_included_employee_ids(company, start_date, end_date):
	if not _roster_doctype_exists():
		return [e.name for e in get_active_employees(company, start_date, end_date)]

	rows = frappe.get_all(
		"Variable Components Roster",
		filters={
			"company": company,
			"start_date": start_date,
			"end_date": end_date,
			"excluded": 0,
		},
		pluck="employee",
	)
	return list(rows or [])


def ensure_period_roster(company, start_date, end_date):
	"""Auto-create roster on first open of a period."""
	if not _roster_doctype_exists():
		return {"auto_initialized": False}
	if roster_count(company, start_date, end_date):
		return {"auto_initialized": False}
	result = initialize_period_roster(company, start_date, end_date, force=0)
	result["auto_initialized"] = True
	return result


def set_roster_excluded(company, start_date, end_date, employees, excluded=1):
	employees = list({e for e in (employees or []) if e})
	if not employees:
		return {"updated": 0}

	start_date, end_date = getdate(start_date), getdate(end_date)
	updated = 0
	for employee in employees:
		filters = {
			"company": company,
			"start_date": start_date,
			"end_date": end_date,
			"employee": employee,
		}
		name = frappe.db.get_value("Variable Components Roster", filters)
		if name:
			frappe.db.set_value(
				"Variable Components Roster",
				name,
				{"excluded": cint(excluded), "manually_added": 0 if excluded else 1},
				update_modified=True,
			)
		else:
			doc = frappe.new_doc("Variable Components Roster")
			doc.update(filters)
			doc.employee_name = frappe.db.get_value("Employee", employee, "employee_name")
			doc.excluded = cint(excluded)
			doc.manually_added = 0 if excluded else 1
			doc.insert(ignore_permissions=True)
		updated += 1

	return {"updated": updated}


def _uncovered_half_day_deduction(doc):
	try:
		from hr_vfg.hr_vfg.hr_ventureforce_global.report.monthly_attendance_summary.monthly_attendance_summary import (
			_uncovered_half_day_deduction as _ded,
		)

		return _ded(doc)
	except Exception:
		deduction = 0.0
		for row in doc.table1 or []:
			if row.half_day:
				deduction += 0.5
		return deduction


def attendance_by_employee(employees, end_date):
	"""Payable days and deductions from Employee Attendance (hr_vfg)."""
	if not frappe.db.exists("DocType", "Employee Attendance"):
		return {}

	month_str, year = month_year_from_period_end(end_date)
	out = {}
	for emp in employees:
		emp_name = emp.name if hasattr(emp, "name") else emp
		ea_name = frappe.db.get_value(
			"Employee Attendance",
			{"employee": emp_name, "month": month_str, "year": year},
			"name",
		)
		if not ea_name:
			out[emp_name] = {
				"has_attendance": 0,
				"employee_attendance": "",
				"month_days": 0,
				"payable_days": 0,
				"present_days": 0,
				"deduction_days": 0,
				"total_absents": 0,
				"attendance_month": month_str,
				"attendance_year": year,
			}
			continue

		doc = frappe.get_doc("Employee Attendance", ea_name)
		half_day_deduction = _uncovered_half_day_deduction(doc)
		deduction_days = flt(doc.total_absents) + half_day_deduction + flt(doc.lates_for_absent)
		month_days = flt(doc.month_days)
		payable_days = max(0.0, month_days - flt(deduction_days))

		out[emp_name] = {
			"has_attendance": 1,
			"employee_attendance": ea_name,
			"month_days": month_days,
			"payable_days": payable_days,
			"present_days": flt(doc.present_days),
			"deduction_days": deduction_days,
			"total_absents": flt(doc.total_absents),
			"half_day_deduction": half_day_deduction,
			"lates_for_absent": flt(doc.lates_for_absent),
			"total_working_days": flt(doc.total_working_days) or month_days,
			"attendance_month": month_str,
			"attendance_year": year,
		}
	return out


def apply_attendance_to_amounts(amounts, assigned_gross, attendance, earning_keys):
	"""Pro-rate leave deduction from attendance when not already entered."""
	if not attendance or not attendance.get("has_attendance"):
		return amounts

	month_days = flt(attendance.get("month_days"))
	deduction_days = flt(attendance.get("deduction_days"))
	if month_days <= 0 or deduction_days <= 0:
		return amounts

	if flt(amounts.get("leave_ded")) > 0:
		return amounts

	per_day = flt(assigned_gross) / month_days if assigned_gross else 0
	if per_day > 0:
		amounts["leave_ded"] = per_day * deduction_days
	return amounts


def tif_26th_cycle_dates(year, month):
	"""
	TIF payroll month (by end date): June 2026 => 26 May 2026 – 25 Jun 2026.
	"""
	year, month = int(year), int(month)
	end = getdate(f"{year}-{month:02d}-25")
	prev = add_months(getdate(f"{year}-{month:02d}-01"), -1)
	start = getdate(f"{prev.year}-{prev.month:02d}-26")
	return start, end


def period_starting_on_26th(year, month):
	"""Period that starts 26th of given month: 26 Jun 2026 – 25 Jul 2026."""
	year, month = int(year), int(month)
	start = getdate(f"{year}-{month:02d}-26")
	nxt = add_months(start, 1)
	end = getdate(f"{nxt.year}-{nxt.month:02d}-25")
	return start, end


def custom_period_options(company=None):
	if not frappe.db.exists("DocType", "Variable Components Period"):
		return []
	filters = {}
	if company:
		filters["company"] = company
	rows = frappe.get_all(
		"Variable Components Period",
		filters=filters,
		fields=[
			"company",
			"period_label",
			"start_date",
			"end_date",
			"payroll_month",
			"payroll_year",
		],
		order_by="end_date desc",
		limit=48,
	)
	options = []
	for r in rows:
		end = getdate(r.end_date)
		options.append(
			{
				"label": r.period_label
				or f"{formatdate(r.start_date)} – {formatdate(r.end_date)}",
				"month": r.payroll_month or end.month,
				"year": r.payroll_year or end.year,
				"start_date": str(r.start_date),
				"end_date": str(r.end_date),
				"company": r.company,
				"is_custom_period": 1,
			}
		)
	return options


def get_period_status(company, start_date, end_date):
	"""Draft / finalized state for the active payroll period."""
	if not frappe.db.exists("DocType", "Variable Components Period"):
		return {"status": "Draft", "draft_saved_on": None, "finalized_on": None}
	row = frappe.db.get_value(
		"Variable Components Period",
		{"company": company, "start_date": getdate(start_date), "end_date": getdate(end_date)},
		["name", "status", "draft_saved_on", "finalized_on", "period_label"],
		as_dict=True,
	)
	if not row:
		return {"status": "Draft", "draft_saved_on": None, "finalized_on": None}
	return {
		"name": row.name,
		"status": row.status or "Draft",
		"draft_saved_on": row.draft_saved_on,
		"finalized_on": row.finalized_on,
		"period_label": row.period_label,
	}


def _get_or_create_period_doc(company, start_date, end_date):
	start_date, end_date = getdate(start_date), getdate(end_date)
	company = company or frappe.defaults.get_global_default("company")
	name = frappe.db.get_value(
		"Variable Components Period",
		{"company": company, "start_date": start_date, "end_date": end_date},
	)
	if name:
		return frappe.get_doc("Variable Components Period", name)
	doc = frappe.new_doc("Variable Components Period")
	doc.company = company
	doc.start_date = start_date
	doc.end_date = end_date
	doc.status = "Draft"
	doc.insert(ignore_permissions=True)
	return doc


def mark_period_draft_saved(company, start_date, end_date):
	doc = _get_or_create_period_doc(company, start_date, end_date)
	if doc.status == "Finalized":
		frappe.throw(_("This period is already finalized. Cannot save draft."))
	doc.status = "Draft"
	doc.draft_saved_on = frappe.utils.now_datetime()
	doc.save(ignore_permissions=True)
	return get_period_status(company, start_date, end_date)


def mark_period_finalized(company, start_date, end_date):
	doc = _get_or_create_period_doc(company, start_date, end_date)
	doc.status = "Finalized"
	doc.finalized_on = frappe.utils.now_datetime()
	if not doc.draft_saved_on:
		doc.draft_saved_on = doc.finalized_on
	doc.save(ignore_permissions=True)
	return get_period_status(company, start_date, end_date)


def create_custom_period(company, start_date, end_date):
	"""Save a payroll period for Variable Components dropdown."""
	if not frappe.db.exists("DocType", "Variable Components Period"):
		frappe.throw(_("Run bench migrate to install Variable Components Period."))

	company = company or frappe.defaults.get_global_default("company")
	start_date, end_date = getdate(start_date), getdate(end_date)
	if end_date < start_date:
		frappe.throw(_("End Date cannot be before Start Date."))

	existing = frappe.db.get_value(
		"Variable Components Period",
		{"company": company, "start_date": start_date, "end_date": end_date},
		"name",
	)
	if existing:
		doc = frappe.get_doc("Variable Components Period", existing)
	else:
		doc = frappe.new_doc("Variable Components Period")
		doc.company = company
		doc.start_date = start_date
		doc.end_date = end_date
		doc.status = "Draft"
		doc.insert(ignore_permissions=True)
		doc.reload()

	end = getdate(end_date)
	label = doc.period_label or f"{calendar.month_name[end.month]} {end.year} ({formatdate(start_date)} – {formatdate(end_date)})"
	return {
		"name": doc.name,
		"label": label,
		"month": end.month,
		"year": end.year,
		"start_date": str(start_date),
		"end_date": str(end_date),
		"company": company,
		"message": _("Payroll period created: {0}").format(label),
	}


def extended_period_options(company=None):
	"""Period dropdown: custom periods + salary slips + attendance + calendar months."""
	from tif_customization.tif_customization.page.salary_register.salary_register import get_period_options

	seen = set()
	options = []

	def _add(opt):
		key = (str(opt.get("start_date")), str(opt.get("end_date")))
		if key in seen:
			return
		seen.add(key)
		options.append(opt)

	for opt in custom_period_options(company):
		_add(opt)

	for opt in get_period_options() or []:
		_add(opt)

	if frappe.db.exists("DocType", "Employee Attendance"):
		rows = frappe.db.sql(
			"""
			SELECT DISTINCT year, month
			FROM `tabEmployee Attendance`
			WHERE docstatus < 2
			ORDER BY year DESC, FIELD(month,
				'January','February','March','April','May','June',
				'July','August','September','October','November','December') DESC
			LIMIT 18
			""",
			as_dict=True,
		)
		for r in rows or []:
			try:
				month_idx = _PAYROLL_MONTHS.index(r.month) + 1
			except ValueError:
				continue
			year = int(r.year)
			last_day = calendar.monthrange(year, month_idx)[1]
			start = getdate(f"{year}-{month_idx:02d}-01")
			end = getdate(f"{year}-{month_idx:02d}-{last_day}")
			_add(
				{
					"label": f"{r.month} {year} ({frappe.utils.formatdate(start)} – {frappe.utils.formatdate(end)})",
					"month": month_idx,
					"year": year,
					"start_date": str(start),
					"end_date": str(end),
				}
			)

	today = getdate()
	for i in range(12):
		d = frappe.utils.add_months(today, -i)
		year, month = d.year, d.month
		last_day = calendar.monthrange(year, month)[1]
		start = getdate(f"{year}-{month:02d}-01")
		end = getdate(f"{year}-{month:02d}-{last_day}")
		_add(
			{
				"label": f"{calendar.month_name[month]} {year}",
				"month": month,
				"year": year,
				"start_date": str(start),
				"end_date": str(end),
			}
		)

	return options[:36]
