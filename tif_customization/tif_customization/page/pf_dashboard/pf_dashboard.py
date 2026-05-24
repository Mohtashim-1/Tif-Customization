import calendar
from collections import defaultdict

import frappe
from frappe import _
from frappe.utils import flt, getdate, get_first_day, get_last_day, add_months


def _month_range(year, month):
	start = get_first_day(f"{year}-{month:02d}-01")
	end = get_last_day(start)
	return start, end


def _month_keys(from_month, to_month):
	fy, fm = map(int, from_month.split("-"))
	ty, tm = map(int, to_month.split("-"))
	keys = []
	cursor = getdate(f"{fy}-{fm:02d}-01")
	end_cursor = getdate(f"{ty}-{tm:02d}-01")
	while cursor <= end_cursor:
		keys.append(cursor.strftime("%Y-%m"))
		cursor = add_months(cursor, 1)
	return keys


@frappe.whitelist()
def get_dashboard_data(company=None, from_month=None, to_month=None):
	company = company or frappe.defaults.get_global_default("company")
	today = getdate()
	from_month = from_month or add_months(today.replace(day=1), -11).strftime("%Y-%m")
	to_month = to_month or today.strftime("%Y-%m")
	month_keys = _month_keys(from_month, to_month)
	month_set = set(month_keys)

	logs = frappe.get_all(
		"PF Contribution Log",
		filters={"company": company, "status": "Posted"},
		fields=[
			"name",
			"employee",
			"employee_name",
			"department",
			"posting_date",
			"payroll_month",
			"employee_contribution",
			"employer_contribution",
			"total_contribution",
			"source",
			"salary_slip",
			"employee_pf_rate",
			"employer_pf_rate",
		],
		order_by="posting_date desc",
		limit=5000,
	)

	filtered = [r for r in logs if getdate(r.posting_date).strftime("%Y-%m") in month_set]

	emp_total = er_total = 0
	by_month = defaultdict(lambda: {"employee": 0, "employer": 0, "count": 0})
	by_dept = defaultdict(lambda: {"employee": 0, "employer": 0, "count": 0})
	by_source = defaultdict(int)
	by_employee = defaultdict(
		lambda: {"employee_name": "", "department": "", "employee": 0, "employer": 0, "count": 0}
	)

	for row in filtered:
		emp_amt = flt(row.employee_contribution)
		er_amt = flt(row.employer_contribution)
		emp_total += emp_amt
		er_total += er_amt
		key = getdate(row.posting_date).strftime("%Y-%m")
		by_month[key]["employee"] += emp_amt
		by_month[key]["employer"] += er_amt
		by_month[key]["count"] += 1
		dept = row.department or _("Unassigned")
		by_dept[dept]["employee"] += emp_amt
		by_dept[dept]["employer"] += er_amt
		by_dept[dept]["count"] += 1
		by_source[row.source or "Unknown"] += 1
		emp_key = row.employee
		by_employee[emp_key]["employee_name"] = row.employee_name
		by_employee[emp_key]["department"] = row.department
		by_employee[emp_key]["employee"] += emp_amt
		by_employee[emp_key]["employer"] += er_amt
		by_employee[emp_key]["count"] += 1

	monthly_chart = []
	for key in month_keys:
		y, m = map(int, key.split("-"))
		monthly_chart.append(
			{
				"month": key,
				"label": f"{calendar.month_abbr[m]} {y}",
				"employee": by_month[key]["employee"],
				"employer": by_month[key]["employer"],
				"total": by_month[key]["employee"] + by_month[key]["employer"],
				"count": by_month[key]["count"],
			}
		)

	dept_chart = sorted(
		[
			{
				"department": k,
				"employee": v["employee"],
				"employer": v["employer"],
				"total": v["employee"] + v["employer"],
				"count": v["count"],
			}
			for k, v in by_dept.items()
		],
		key=lambda x: -x["total"],
	)[:12]

	top_employees = sorted(
		[
			{
				"employee": k,
				"employee_name": v["employee_name"],
				"department": v["department"],
				"employee_contribution": v["employee"],
				"employer_contribution": v["employer"],
				"total_contribution": v["employee"] + v["employer"],
				"log_count": v["count"],
			}
			for k, v in by_employee.items()
		],
		key=lambda x: -x["total_contribution"],
	)[:10]

	# Current vs previous month (based on to_month filter)
	sy, sm = map(int, to_month.split("-"))
	ms, me = _month_range(sy, sm)
	prev_start = add_months(ms, -1)
	prev_end = get_last_day(prev_start)
	current_month_logs = [r for r in filtered if ms <= getdate(r.posting_date) <= me]
	prev_month_logs = [
		r for r in filtered if prev_start <= getdate(r.posting_date) <= prev_end
	]

	cm_emp = sum(flt(r.employee_contribution) for r in current_month_logs)
	cm_er = sum(flt(r.employer_contribution) for r in current_month_logs)
	pm_emp = sum(flt(r.employee_contribution) for r in prev_month_logs)
	pm_er = sum(flt(r.employer_contribution) for r in prev_month_logs)
	cm_total = cm_emp + cm_er
	pm_total = pm_emp + pm_er

	eligible = frappe.db.count("Employee", {"status": "Active", "custom_pf_applicable": 1})
	full_time_active = frappe.db.count(
		"Employee",
		{"status": "Active", "employment_type": "Full Time -  (Permanent)"},
	)
	full_time_not_marked = frappe.db.count(
		"Employee",
		{
			"status": "Active",
			"employment_type": "Full Time -  (Permanent)",
			"custom_pf_applicable": 0,
		},
	)

	payable_balance = 0
	settings = frappe.get_single("PF Settings") if frappe.db.exists("PF Settings", "PF Settings") else None
	if settings and settings.pf_payable_account:
		from erpnext.accounts.utils import get_balance_on

		payable_balance = flt(
			get_balance_on(account=settings.pf_payable_account, company=company)
		)

	# Submitted salary slips in period without PF log
	slip_filters = {"docstatus": 1, "company": company}
	if from_month:
		slip_filters["start_date"] = [">=", getdate(f"{from_month}-01")]
	if to_month:
		_month_start, me_slip = _month_range(*map(int, to_month.split("-")))
		slip_filters["end_date"] = ["<=", me_slip]

	submitted_slips = frappe.get_all("Salary Slip", filters=slip_filters, pluck="name")
	logged_slips = set(
		frappe.get_all(
			"PF Contribution Log",
			filters={
				"salary_slip": ["in", submitted_slips],
				"status": ["!=", "Cancelled"],
			},
			pluck="salary_slip",
		)
	) if submitted_slips else set()
	pending_slip_logs = len(submitted_slips) - len(logged_slips)

	recent = sorted(filtered, key=lambda r: r.posting_date, reverse=True)[:50]

	policy = {
		"employee_rate": flt(getattr(settings, "default_employee_pf_rate", 8.33)),
		"employer_rate": flt(getattr(settings, "default_employer_pf_rate", 8.33)),
		"formula_base": getattr(settings, "pf_formula_base", "Gross") or "Gross",
		"note": _("Standard: {0}% of {1} (≈ 1/12 of annual gross)").format(
			flt(getattr(settings, "default_employee_pf_rate", 8.33)),
			getattr(settings, "pf_formula_base", "Gross") or "Gross",
		),
	}

	return {
		"company": company,
		"from_month": from_month,
		"to_month": to_month,
		"summary": {
			"eligible_employees": eligible,
			"full_time_active": full_time_active,
			"full_time_not_marked": full_time_not_marked,
			"period_employee_pf": emp_total,
			"period_employer_pf": er_total,
			"period_total_pf": emp_total + er_total,
			"current_month_employee_pf": cm_emp,
			"current_month_employer_pf": cm_er,
			"current_month_total_pf": cm_total,
			"prev_month_total_pf": pm_total,
			"month_change_pct": _pct_change(cm_total, pm_total),
			"logs_in_period": len(filtered),
			"pf_payable_balance": payable_balance,
			"pending_slip_logs": pending_slip_logs,
			"submitted_slips_in_period": len(submitted_slips),
		},
		"policy": policy,
		"monthly_chart": monthly_chart,
		"department_chart": dept_chart,
		"source_breakdown": [{"source": k, "count": v} for k, v in by_source.items()],
		"top_employees": top_employees,
		"recent_logs": recent,
		"settings": {
			"pf_payable_account": getattr(settings, "pf_payable_account", None),
			"employer_pf_expense_account": getattr(settings, "employer_pf_expense_account", None),
			"employee_pf_component": getattr(settings, "employee_pf_component", None),
			"employer_pf_component": getattr(settings, "employer_pf_component", None),
		},
	}


def _pct_change(current, previous):
	if not previous:
		return 100.0 if current else 0.0
	return round((flt(current) - flt(previous)) / flt(previous) * 100, 1)
