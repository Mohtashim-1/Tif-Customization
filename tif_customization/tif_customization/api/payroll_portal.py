"""API for Vue Payroll Portal (FlowHCM-style: Dashboard → Create → Amend → Finalize)."""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import cint, flt, getdate

PORTAL_ROLES = frozenset(
	{
		"System Manager",
		"HR Manager",
		"HR User",
		"Accounts Manager",
		"COO",
	}
)

VC = "tif_customization.tif_customization.page.variable_components.variable_components"


def _assert_portal_access(user=None):
	user = user or frappe.session.user
	if user in (None, "Guest"):
		frappe.throw(_("Please log in."), frappe.PermissionError)
	if user == "Administrator":
		return
	roles = set(frappe.get_roles(user))
	if not (roles & PORTAL_ROLES):
		frappe.throw(_("Not permitted to open Payroll Portal."), frappe.PermissionError)


def _vc(name):
	return frappe.get_attr(f"{VC}.{name}")


def _segment(start_date, end_date):
	from tif_customization.tif_customization.page.variable_components.variable_components_roster import (
		period_segment,
	)

	return period_segment(start_date, end_date)


@frappe.whitelist()
def portal_boot():
	_assert_portal_access()
	user = frappe.session.user
	roles = set(frappe.get_roles(user))
	return {
		"user": user,
		"full_name": frappe.utils.get_fullname(user),
		"roles": list(roles),
		"company": frappe.defaults.get_user_default("Company")
		or frappe.defaults.get_global_default("company")
		or "The ILM Foundation",
		"can_edit": bool(roles & {"System Manager", "HR Manager", "HR User", "Accounts Manager"})
		or user == "Administrator",
		"can_approve": bool(roles & {"System Manager", "COO"})
		or user in {"shahid.khan@tif.edu.pk", "Administrator"},
		"can_finalize": bool(roles & {"System Manager", "HR Manager", "Accounts Manager"})
		or user == "Administrator",
	}


@frappe.whitelist()
def get_dashboard_analytics(company=None, year=None, month=None, start_date=None, end_date=None):
	"""Full KPI + chart dashboard (Apex / Chart.js) — kept for optional use."""
	_assert_portal_access()
	from tif_customization.tif_customization.api.payroll_dashboard import get_dashboard_bundle

	return get_dashboard_bundle(
		company=company,
		year=year,
		month=month,
		start_date=start_date,
		end_date=end_date,
	)


@frappe.whitelist()
def get_payroll_register(company=None, year=None, month=None, start_date=None, end_date=None):
	"""Payroll Register only: month cards + department KPIs + table."""
	_assert_portal_access()
	from tif_customization.tif_customization.api.payroll_dashboard import get_payroll_register_bundle

	return get_payroll_register_bundle(
		company=company,
		year=year,
		month=month,
		start_date=start_date,
		end_date=end_date,
	)


@frappe.whitelist()
def get_dashboard(company=None):
	"""First menu: period pipeline + quick totals."""
	_assert_portal_access()
	company = company or frappe.defaults.get_global_default("company") or "The ILM Foundation"

	counts = {
		"Draft": 0,
		"Pending COO Approval": 0,
		"Approved": 0,
		"Finalized": 0,
		"Rejected": 0,
	}
	rows = []

	if frappe.db.exists("DocType", "Variable Components Period"):
		periods = frappe.get_all(
			"Variable Components Period",
			filters={"company": company},
			fields=[
				"name",
				"period_label",
				"start_date",
				"end_date",
				"status",
				"payroll_month",
				"payroll_year",
				"draft_saved_on",
				"submitted_for_approval_on",
				"approved_on",
				"finalized_on",
			],
			order_by="end_date desc",
			limit=36,
		)
		for p in periods:
			status = (p.status or "Draft").strip() or "Draft"
			if status in counts:
				counts[status] += 1
			rows.append(
				{
					"name": p.name,
					"label": p.period_label
					or f"{p.start_date} – {p.end_date}",
					"start_date": str(p.start_date),
					"end_date": str(p.end_date),
					"status": status,
					"month": p.payroll_month,
					"year": p.payroll_year,
					"value": f"{p.start_date}|{p.end_date}",
					"segment": _segment(p.start_date, p.end_date),
				}
			)

	today = getdate()
	month_start = f"{today.year}-{today.month:02d}-01"
	slip_count = frappe.db.count(
		"Salary Slip",
		{
			"company": company,
			"docstatus": 1,
			"start_date": (">=", month_start),
		},
	)
	net = frappe.db.sql(
		"""
		SELECT COALESCE(SUM(net_pay), 0)
		FROM `tabSalary Slip`
		WHERE company=%s AND docstatus=1 AND start_date >= %s
		""",
		(company, month_start),
	)[0][0]

	return {
		"company": company,
		"counts": counts,
		"periods": rows,
		"salary_slips_this_month": cint(slip_count),
		"net_pay_this_month": flt(net),
		"tips": [
			"Create a 26th–25th payroll period (Field Officers: 21st–20th)",
			"Load employees (or import Salary Sheet)",
			"Adjust earnings & deductions, Save draft",
			"Submit for COO → Approve → Finalize salary slips",
		],
	}


@frappe.whitelist()
def list_periods(company=None):
	_assert_portal_access()
	company = company or frappe.defaults.get_global_default("company")
	options = _vc("get_period_options_for_variable")(company=company) or []
	for opt in options:
		opt["segment"] = _segment(opt.get("start_date"), opt.get("end_date"))
	return options


@frappe.whitelist()
def preview_cycle(year, month, cycle_type="tif_payroll_month"):
	_assert_portal_access()
	return _vc("get_tif_cycle_dates")(year, month, cycle_type=cycle_type)


@frappe.whitelist()
def create_period(company=None, year=None, month=None, cycle_type="tif_payroll_month"):
	_assert_portal_access()
	return _vc("create_variable_period")(
		company=company, year=year, month=month, cycle_type=cycle_type
	)


@frappe.whitelist()
def load_employees(company=None, start_date=None, end_date=None, force=0):
	_assert_portal_access()
	return _vc("initialize_variable_period")(
		company=company, start_date=start_date, end_date=end_date, force=force
	)


@frappe.whitelist()
def get_sheet(company=None, start_date=None, end_date=None, month=None, year=None):
	_assert_portal_access()
	return _vc("get_variable_sheet_data")(
		company=company,
		start_date=start_date,
		end_date=end_date,
		month=month,
		year=year,
	)


@frappe.whitelist()
def compute_sheet(company=None, start_date=None, end_date=None, rows=None):
	"""Fill blank fixed allowances and recompute attendance deductions (not saved)."""
	_assert_portal_access()
	roles = set(frappe.get_roles())
	if not (
		roles & {"System Manager", "HR Manager", "HR User", "Accounts Manager"}
		or frappe.session.user == "Administrator"
	):
		frappe.throw(_("Not permitted to edit payroll."), frappe.PermissionError)
	return _vc("compute_period_amounts")(
		company=company, start_date=start_date, end_date=end_date, rows=rows
	)


@frappe.whitelist()
def save_draft(
	company=None,
	start_date=None,
	end_date=None,
	payment_entries=None,
	variable_entries=None,
):
	_assert_portal_access()
	return _vc("save_period_draft")(
		company=company,
		start_date=start_date,
		end_date=end_date,
		payment_entries=payment_entries,
		variable_entries=variable_entries,
		save_additional_salary=1,
	)


@frappe.whitelist()
def submit_for_approval(
	company=None,
	start_date=None,
	end_date=None,
	payment_entries=None,
	variable_entries=None,
):
	_assert_portal_access()
	return _vc("submit_for_coo_approval")(
		company=company,
		start_date=start_date,
		end_date=end_date,
		payment_entries=payment_entries,
		variable_entries=variable_entries,
	)


@frappe.whitelist()
def approve_period(company=None, start_date=None, end_date=None, remarks=None):
	_assert_portal_access()
	return _vc("approve_variable_period")(
		company=company, start_date=start_date, end_date=end_date, remarks=remarks
	)


@frappe.whitelist()
def reject_period(company=None, start_date=None, end_date=None, reason=None):
	_assert_portal_access()
	return _vc("reject_variable_period")(
		company=company, start_date=start_date, end_date=end_date, reason=reason
	)


@frappe.whitelist()
def withdraw_period(company=None, start_date=None, end_date=None):
	_assert_portal_access()
	return _vc("withdraw_coo_submission")(
		company=company, start_date=start_date, end_date=end_date
	)


@frappe.whitelist()
def finalize_period(
	company=None,
	start_date=None,
	end_date=None,
	employees=None,
	payment_entries=None,
	variable_entries=None,
):
	_assert_portal_access()
	return _vc("finalize_variable_period")(
		company=company,
		start_date=start_date,
		end_date=end_date,
		employees=employees,
		payment_entries=payment_entries,
		variable_entries=variable_entries,
	)


@frappe.whitelist()
def import_sheet(
	payroll_month=7,
	payroll_year=2026,
	company=None,
	file_url=None,
	file_name=None,
	sheet_names=None,
	force_roster=0,
):
	_assert_portal_access()
	from tif_customization.tif_customization.page.variable_components.import_salary_sheet import (
		import_salary_sheet_to_variable_components,
	)

	return import_salary_sheet_to_variable_components(
		payroll_month=payroll_month,
		payroll_year=payroll_year,
		company=company,
		file_url=file_url,
		file_name=file_name,
		sheet_names=sheet_names,
		force_roster=force_roster,
	)


@frappe.whitelist()
def list_salary_slips(
	company=None,
	year=None,
	month=None,
	start_date=None,
	end_date=None,
	status=None,
	search=None,
	department=None,
	branch=None,
	designation=None,
	limit=500,
):
	"""Salary Slips menu: list slips for a TIF payroll month / period."""
	_assert_portal_access()
	from tif_customization.tif_customization.api.payroll_dashboard import _company, _tif_period

	company = _company(company)
	start, end = _tif_period(year, month, start_date, end_date)
	limit = min(cint(limit) or 500, 1000)

	filters = {
		"company": company,
		"start_date": [">=", start],
		"end_date": ["<=", end],
	}
	# status: all | draft | submitted | cancelled
	st = (status or "all").strip().lower()
	if st == "draft":
		filters["docstatus"] = 0
	elif st == "submitted":
		filters["docstatus"] = 1
	elif st == "cancelled":
		filters["docstatus"] = 2

	fields = [
		"name",
		"employee",
		"employee_name",
		"department",
		"designation",
		"branch",
		"start_date",
		"end_date",
		"posting_date",
		"gross_pay",
		"total_deduction",
		"net_pay",
		"docstatus",
		"status",
	]
	rows = frappe.get_all(
		"Salary Slip",
		filters=filters,
		fields=fields,
		order_by="employee_name asc",
		limit_page_length=limit,
	)

	# Options from period+status set (before dept/branch/designation/search filters)
	departments = sorted({(r.department or "").strip() for r in rows if (r.department or "").strip()})
	branches = sorted({(r.branch or "").strip() for r in rows if (r.branch or "").strip()})
	designations = sorted(
		{(r.designation or "").strip() for r in rows if (r.designation or "").strip()}
	)

	dept_f = (department or "").strip()
	branch_f = (branch or "").strip()
	desig_f = (designation or "").strip()
	q = (search or "").strip().lower()

	if dept_f:
		rows = [r for r in rows if (r.department or "").strip() == dept_f]
	if branch_f:
		rows = [r for r in rows if (r.branch or "").strip() == branch_f]
	if desig_f:
		rows = [r for r in rows if (r.designation or "").strip() == desig_f]
	if q:
		rows = [
			r
			for r in rows
			if q
			in f"{r.employee or ''} {r.employee_name or ''} {r.department or ''} {r.designation or ''} {r.branch or ''}".lower()
		]

	def _status_label(r):
		if cint(r.docstatus) == 1:
			return "Submitted"
		if cint(r.docstatus) == 2:
			return "Cancelled"
		return "Draft"

	slips = []
	totals = {"count": 0, "gross": 0.0, "deduction": 0.0, "net": 0.0}
	for r in rows:
		slips.append(
			{
				"name": r.name,
				"employee": r.employee,
				"employee_name": r.employee_name,
				"department": r.department or "",
				"designation": r.designation or "",
				"branch": r.branch or "",
				"start_date": str(r.start_date),
				"end_date": str(r.end_date),
				"posting_date": str(r.posting_date) if r.posting_date else "",
				"gross_pay": flt(r.gross_pay),
				"total_deduction": flt(r.total_deduction),
				"net_pay": flt(r.net_pay),
				"docstatus": cint(r.docstatus),
				"status_label": _status_label(r),
				"form_url": f"/app/salary-slip/{r.name}",
				"print_url": f"/printview?doctype=Salary%20Slip&name={r.name}&format=TIF%20Payslip&no_letterhead=0",
			}
		)
		if cint(r.docstatus) < 2:
			totals["count"] += 1
			totals["gross"] += flt(r.gross_pay)
			totals["deduction"] += flt(r.total_deduction)
			totals["net"] += flt(r.net_pay)

	return {
		"company": company,
		"period": {
			"start_date": str(start),
			"end_date": str(end),
			"label": f"{frappe.utils.formatdate(start)} – {frappe.utils.formatdate(end)}",
			"year": end.year,
			"month": end.month,
		},
		"filter_options": {
			"departments": departments,
			"branches": branches,
			"designations": designations,
		},
		"slips": slips,
		"totals": totals,
	}
