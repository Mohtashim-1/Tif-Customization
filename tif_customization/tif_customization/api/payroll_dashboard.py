"""Interactive Payroll Dashboard KPIs + chart series for ILM Foundation Portal."""

from __future__ import annotations

import calendar
from collections import defaultdict
from datetime import date

import frappe
from frappe import _
from frappe.utils import add_months, cint, flt, get_first_day, get_last_day, getdate

from tif_customization.tif_customization.api.payroll_portal import PORTAL_ROLES, _assert_portal_access

COMPANY_DEFAULT = "The ILM Foundation"

EMPLOYER_COMPONENTS = (
	"Employer Provident Fund Contribution",
	"EOBI Employer",
	"Social Security Employer",
	"PESSI Employer",
	"SESSI Employer",
)

TAX_COMPONENTS = (
	"Income Tax Deduction",
	"Income Tax",
	"Withholding Tax",
	"Income Tax Slab 2",
	"Income Tax Slab 3",
	"Income Tax Slab 4",
)

EOBI_COMPONENTS = (
	"EOBI",
	"EOBI Employee",
	"EOBI Employer",
	"Provident Fund Deduction",
	"Employer Provident Fund Contribution",
)

SS_COMPONENTS = (
	"Social Security",
	"PESSI",
	"SESSI",
	"Social Security Employer",
	"PESSI Employer",
	"SESSI Employer",
)


def _company(company=None):
	return company or frappe.defaults.get_global_default("company") or COMPANY_DEFAULT


def _tif_period(year=None, month=None, start_date=None, end_date=None):
	"""Resolve TIF 26–25 payroll month (or explicit dates)."""
	if start_date and end_date:
		return getdate(start_date), getdate(end_date)
	today = getdate()
	year = cint(year) or today.year
	month = cint(month) or today.month
	from tif_customization.tif_customization.page.variable_components.variable_components_roster import (
		tif_26th_cycle_dates,
	)

	start, end = tif_26th_cycle_dates(year, month)
	return getdate(start), getdate(end)


def _prev_period(start_date, end_date):
	"""Previous TIF payroll month (end_date month − 1)."""
	end = getdate(end_date)
	d = add_months(end, -1)
	from tif_customization.tif_customization.page.variable_components.variable_components_roster import (
		tif_26th_cycle_dates,
	)

	return tif_26th_cycle_dates(d.year, d.month)


def _roles():
	user = frappe.session.user
	roles = set(frappe.get_roles(user))
	is_admin = user == "Administrator" or "System Manager" in roles
	return {
		"user": user,
		"roles": list(roles),
		"is_director": is_admin or bool(roles & {"Director", "Accounts Manager", "Management"}),
		"is_hr_manager": is_admin or "HR Manager" in roles,
		"is_hr_user": is_admin or bool(roles & {"HR Manager", "HR User"}),
		"is_accounts": is_admin or "Accounts Manager" in roles,
	}


def _visibility(role_flags):
	"""Section/chart visibility per role matrix."""
	if role_flags["is_hr_manager"]:
		return {
			"cost": True,
			"headcount": True,
			"attendance": True,
			"process": True,
			"statutory": True,
			"charts": list(range(1, 17)),
		}
	vis = {
		"cost": False,
		"headcount": False,
		"attendance": False,
		"process": False,
		"statutory": False,
		"charts": [],
	}
	if role_flags["is_director"]:
		vis["cost"] = True
		vis["headcount"] = True
		vis["charts"] = [1, 3, 4, 6, 8]
	if role_flags["is_hr_user"]:
		vis["headcount"] = True
		vis["attendance"] = True
		vis["process"] = True
		vis["statutory"] = True
		vis["charts"] = sorted(set(vis["charts"] + list(range(9, 17))))
	if role_flags["is_accounts"]:
		vis["cost"] = True
		vis["statutory"] = True
		vis["charts"] = sorted(set(vis["charts"] + [2, 6, 10]))
	# fallback: portal access => show summary
	if not any([vis["cost"], vis["headcount"], vis["attendance"], vis["process"], vis["statutory"]]):
		vis["cost"] = True
		vis["headcount"] = True
		vis["charts"] = [1, 4, 5]
	return vis


def _slip_agg(company, start, end):
	row = frappe.db.sql(
		"""
		SELECT
			COUNT(*) AS paid_count,
			COALESCE(SUM(net_pay), 0) AS net_pay,
			COALESCE(SUM(gross_pay), 0) AS gross_pay,
			COALESCE(SUM(total_deduction), 0) AS total_deduction,
			COALESCE(AVG(net_pay), 0) AS avg_net,
			COALESCE(SUM(leave_without_pay), 0) AS lwp_days,
			SUM(CASE WHEN leave_without_pay > 0 THEN 1 ELSE 0 END) AS lwp_employees
		FROM `tabSalary Slip`
		WHERE company=%s AND docstatus=1
			AND start_date >= %s AND end_date <= %s
		""",
		(company, start, end),
		as_dict=True,
	)[0]
	return row


def _component_sum(company, start, end, components, parentfield=None):
	if not components:
		return 0.0
	existing = set(frappe.get_all("Salary Component", pluck="name"))
	comps = [c for c in components if c in existing]
	if not comps:
		return 0.0
	placeholders = ", ".join(["%s"] * len(comps))
	pf_sql = "AND sd.parentfield=%s" if parentfield else ""
	args = [company, start, end, *comps]
	if parentfield:
		args.append(parentfield)
	return flt(
		frappe.db.sql(
			f"""
			SELECT COALESCE(SUM(sd.amount), 0)
			FROM `tabSalary Detail` sd
			INNER JOIN `tabSalary Slip` ss ON ss.name = sd.parent
			WHERE ss.company=%s AND ss.docstatus=1
				AND ss.start_date >= %s AND ss.end_date <= %s
				AND sd.salary_component IN ({placeholders})
				{pf_sql}
			""",
			args,
		)[0][0]
	)


def _missing_checkouts(company, start, end):
	if not frappe.db.exists("DocType", "Employee Checkin"):
		return 0
	return cint(
		frappe.db.sql(
			"""
			SELECT COUNT(*) FROM (
				SELECT a.employee, a.d FROM (
					SELECT employee, DATE(time) AS d,
						SUM(CASE WHEN UPPER(log_type)='IN' THEN 1 ELSE 0 END) AS ins,
						SUM(CASE WHEN UPPER(log_type)='OUT' THEN 1 ELSE 0 END) AS outs
					FROM `tabEmployee Checkin`
					WHERE DATE(time) BETWEEN %s AND %s
					GROUP BY employee, DATE(time)
				) a
				INNER JOIN `tabEmployee` e ON e.name=a.employee AND e.company=%s AND e.status='Active'
				WHERE a.ins > 0 AND a.outs = 0
			) x
			""",
			(start, end, company),
		)[0][0]
	)


def _reconciliation_variance(company, start, end, slip_net):
	"""System slip net vs Variable Components Payment payable total (if any)."""
	if not frappe.db.exists("DocType", "Variable Components Payment"):
		return {"variance": 0, "manual_total": 0, "system_total": slip_net, "note": "No payment sheet"}
	manual = flt(
		frappe.db.sql(
			"""
			SELECT COALESCE(SUM(payable_amount), 0)
			FROM `tabVariable Components Payment`
			WHERE company=%s AND start_date=%s AND end_date=%s
			""",
			(company, start, end),
		)[0][0]
	)
	return {
		"variance": flt(slip_net) - manual,
		"manual_total": manual,
		"system_total": flt(slip_net),
		"note": "Slip net − Variable Components payable",
	}


@frappe.whitelist()
def get_dashboard_bundle(company=None, year=None, month=None, start_date=None, end_date=None):
	"""Full interactive dashboard payload: KPIs + charts + visibility."""
	_assert_portal_access()
	company = _company(company)
	start, end = _tif_period(year, month, start_date, end_date)
	prev_start, prev_end = _prev_period(start, end)
	role_flags = _roles()
	visibility = _visibility(role_flags)

	slip = _slip_agg(company, start, end)
	prev = _slip_agg(company, prev_start, prev_end)
	prev_net = flt(prev.net_pay)
	mom = ((flt(slip.net_pay) - prev_net) / prev_net * 100.0) if prev_net else None

	active = frappe.db.count("Employee", {"company": company, "status": "Active"})
	paid = cint(slip.paid_count)
	missing_slips = max(active - paid, 0)

	cal_start = get_first_day(end)
	cal_end = get_last_day(end)
	new_joiners = frappe.db.count(
		"Employee",
		{
			"company": company,
			"date_of_joining": ["between", [cal_start, cal_end]],
		},
	)
	leavers = frappe.db.sql(
		"""
		SELECT COUNT(*) FROM `tabEmployee`
		WHERE company=%s AND relieving_date BETWEEN %s AND %s
		""",
		(company, cal_start, cal_end),
	)[0][0]

	field_staff = frappe.db.sql(
		"""
		SELECT COUNT(*) FROM `tabEmployee`
		WHERE company=%s AND status='Active'
			AND (
				employment_type LIKE '%%Field%%'
				OR designation LIKE '%%Field%%'
				OR designation LIKE '%%SME%%'
				OR department LIKE '%%Field%%'
			)
		""",
		(company,),
	)[0][0]

	employer_cost = _component_sum(company, start, end, EMPLOYER_COMPONENTS)
	tax_withheld = _component_sum(company, start, end, TAX_COMPONENTS, parentfield="deductions")
	eobi_total = _component_sum(company, start, end, EOBI_COMPONENTS)
	ss_total = _component_sum(company, start, end, SS_COMPONENTS)

	absent = (
		frappe.db.count(
			"Attendance",
			{
				"attendance_date": ["between", [start, end]],
				"status": "Absent",
				"docstatus": 1,
			},
		)
		if frappe.db.exists("DocType", "Attendance")
		else 0
	)
	late = (
		cint(
			frappe.db.sql(
				"""
				SELECT COUNT(*) FROM `tabAttendance`
				WHERE docstatus=1 AND late_entry=1
					AND attendance_date BETWEEN %s AND %s
					AND employee IN (SELECT name FROM `tabEmployee` WHERE company=%s)
				""",
				(start, end, company),
			)[0][0]
		)
		if frappe.db.exists("DocType", "Attendance")
		else 0
	)
	unlinked_bio = frappe.db.sql(
		"""
		SELECT COUNT(*) FROM `tabEmployee`
		WHERE company=%s AND status='Active'
			AND (attendance_device_id IS NULL OR attendance_device_id='')
		""",
		(company,),
	)[0][0]
	missing_co = _missing_checkouts(company, start, end)

	draft_slips = frappe.db.count(
		"Salary Slip",
		{"company": company, "docstatus": 0, "start_date": [">=", start], "end_date": ["<=", end]},
	)
	pending_pe = frappe.db.count("Payroll Entry", {"company": company, "docstatus": 0})
	open_adv = flt(
		frappe.db.sql(
			"""
			SELECT COALESCE(SUM(IFNULL(pending_amount, 0)), 0)
			FROM `tabEmployee Advance`
			WHERE company=%s AND docstatus=1 AND IFNULL(pending_amount,0) > 0
			""",
			(company,),
		)[0][0]
	) if frappe.db.exists("DocType", "Employee Advance") else 0
	pending_leave = (
		frappe.db.count("Leave Application", {"status": "Open"})
		if frappe.db.exists("DocType", "Leave Application")
		else 0
	)
	pending_exp = 0
	if frappe.db.exists("DocType", "Expense Claim"):
		pending_exp = frappe.db.count(
			"Expense Claim",
			{"company": company, "approval_status": ["in", ["Draft", "Pending"]]},
		)

	no_cnic = frappe.db.sql(
		"""
		SELECT COUNT(*) FROM `tabEmployee`
		WHERE company=%s AND status='Active'
			AND (
				IFNULL(cnic,'')='' OR IFNULL(ntn_no_,'')=''
			)
		""",
		(company,),
	)[0][0]

	recon = _reconciliation_variance(company, start, end, slip.net_pay)

	kpis = {
		"cost": [
			_card("net_payroll", "Net Payroll", slip.net_pay, "currency", "Bank transfer total", "ok"),
			_card("gross_payroll", "Gross Payroll", slip.gross_pay, "currency", "Total salary cost", "ok"),
			_card("total_deductions", "Total Deductions", slip.total_deduction, "currency", "Tax, PF, advances…", "warn"),
			_card("avg_net", "Average Net Salary", slip.avg_net, "currency", "Pay level trend", "ok"),
			_card("mom_change", "MoM Payroll Change %", mom, "percent", "vs previous cycle", "warn" if mom and abs(mom) > 5 else "ok"),
			_card("employer_cost", "Employer Contribution", employer_cost, "currency", "PF / EOBI employer", "ok"),
		],
		"headcount": [
			_card("active_employees", "Active Employees", active, "number", "status = Active", "ok"),
			_card("employees_paid", "Employees Paid", paid, "number", "Submitted slips", "ok"),
			_card("missing_slips", "Missing Slips", missing_slips, "number", "Active − Paid", "danger" if missing_slips else "ok"),
			_card("new_joiners", "New Joiners", new_joiners, "number", "Joining this calendar month", "ok"),
			_card("leavers", "Leavers", leavers, "number", "Relieved this calendar month", "warn"),
			_card("field_staff", "Field Staff Headcount", field_staff, "number", "Field / SME designations", "ok"),
		],
		"attendance": [
			_card("lwp_days", "Unpaid Days (LWP)", slip.lwp_days, "number", "Sum leave_without_pay", "warn"),
			_card("lwp_employees", "Employees with LWP", slip.lwp_employees, "number", "LWP > 0", "warn"),
			_card("absent_marks", "Absent Marks", absent, "number", "Attendance Absent", "danger" if absent else "ok"),
			_card("missing_checkouts", "Missing Check-outs", missing_co, "number", "IN without OUT", "warn"),
			_card("late_arrivals", "Late Arrivals", late, "number", "late_entry = 1", "warn"),
			_card("unlinked_bio", "Unlinked Biometric IDs", unlinked_bio, "number", "No attendance_device_id", "danger" if unlinked_bio else "ok"),
		],
		"process": [
			_card("draft_slips", "Draft Salary Slips", draft_slips, "number", "docstatus = 0", "warn" if draft_slips else "ok"),
			_card("pending_pe", "Pending Payroll Entries", pending_pe, "number", "Draft PE", "warn" if pending_pe else "ok"),
			_card("open_advances", "Open Employee Advances", open_adv, "currency", "pending_amount > 0", "warn"),
			_card("pending_leave", "Pending Leave Applications", pending_leave, "number", "status = Open", "warn"),
			_card("pending_expense", "Pending Expense Claims", pending_exp, "number", "Draft / Pending", "warn"),
			_card("recon_variance", "Reconciliation Variance", recon["variance"], "currency", recon["note"], "danger" if abs(flt(recon["variance"])) > 1 else "ok"),
		],
		"statutory": [
			_card("income_tax", "Income Tax Withheld", tax_withheld, "currency", "Salary Detail tax comps", "ok"),
			_card("eobi", "EOBI / PF Total", eobi_total, "currency", "Employee + Employer", "ok"),
			_card("social_security", "Social Security", ss_total, "currency", "PESSI / SESSI if any", "ok"),
			_card("no_cnic_ntn", "Without CNIC / NTN", no_cnic, "number", "Active employees", "danger" if no_cnic else "ok"),
		],
	}

	charts = _build_charts(company, start, end)

	return {
		"company": company,
		"period": {
			"start_date": str(start),
			"end_date": str(end),
			"label": f"{frappe.utils.formatdate(start)} – {frappe.utils.formatdate(end)}",
			"prev_start": str(prev_start),
			"prev_end": str(prev_end),
			"year": end.year,
			"month": end.month,
		},
		"visibility": visibility,
		"roles": role_flags,
		"kpis": kpis,
		"charts": charts,
		"recon": recon,
		"shortcuts": [
			{"label": "Payroll Entry", "route": "/app/payroll-entry"},
			{"label": "Salary Slip", "route": "/app/salary-slip"},
			{"label": "Salary Structure Assignment", "route": "/app/salary-structure-assignment"},
			{"label": "Attendance", "route": "/app/attendance"},
			{"label": "Employee Checkin", "route": "/app/employee-checkin"},
			{"label": "Employee Advance", "route": "/app/employee-advance"},
			{"label": "Amend Payroll", "route": "workbench"},
		],
	}


def _card(id_, label, value, kind, hint, tone):
	return {
		"id": id_,
		"label": label,
		"value": None if value is None else flt(value) if kind in ("currency", "percent", "number") else value,
		"kind": kind,
		"hint": hint,
		"tone": tone,
	}


def _build_charts(company, start, end):
	"""Chart series C1–C16 (Apex / Chart.js ready)."""
	# C1: last 12 months net payroll (by slip end_date month)
	c1_labels, c1_net, c1_gross, c1_ded, c1_count = [], [], [], [], []
	for i in range(11, -1, -1):
		d = add_months(end, -i)
		m_start = get_first_day(d)
		m_end = get_last_day(d)
		row = frappe.db.sql(
			"""
			SELECT COALESCE(SUM(net_pay),0), COALESCE(SUM(gross_pay),0),
				COALESCE(SUM(total_deduction),0), COUNT(*)
			FROM `tabSalary Slip`
			WHERE company=%s AND docstatus=1
				AND end_date BETWEEN %s AND %s
			""",
			(company, m_start, m_end),
		)[0]
		c1_labels.append(d.strftime("%b %Y"))
		c1_net.append(flt(row[0]))
		c1_gross.append(flt(row[1]))
		c1_ded.append(flt(row[2]))
		c1_count.append(cint(row[3]))

	# C4 department donut
	dept_rows = frappe.db.sql(
		"""
		SELECT IFNULL(NULLIF(department,''), 'Unassigned') AS dept, SUM(net_pay) AS amt
		FROM `tabSalary Slip`
		WHERE company=%s AND docstatus=1 AND start_date>=%s AND end_date<=%s
		GROUP BY dept ORDER BY amt DESC LIMIT 12
		""",
		(company, start, end),
		as_dict=True,
	)

	# C5 branch
	branch_rows = frappe.db.sql(
		"""
		SELECT IFNULL(NULLIF(branch,''), 'Unassigned') AS branch, SUM(net_pay) AS amt
		FROM `tabSalary Slip`
		WHERE company=%s AND docstatus=1 AND start_date>=%s AND end_date<=%s
		GROUP BY branch ORDER BY amt DESC LIMIT 12
		""",
		(company, start, end),
		as_dict=True,
	)

	# C7 salary bands
	bands = [("0–40k", 0, 40000), ("40–80k", 40000, 80000), ("80–120k", 80000, 120000), ("120k+", 120000, 10**12)]
	band_counts = []
	for label, lo, hi in bands:
		n = frappe.db.sql(
			"""
			SELECT COUNT(*) FROM `tabSalary Slip`
			WHERE company=%s AND docstatus=1 AND start_date>=%s AND end_date<=%s
				AND net_pay >= %s AND net_pay < %s
			""",
			(company, start, end, lo, hi),
		)[0][0]
		band_counts.append({"label": label, "value": cint(n)})

	# C8 employment type cost
	etype_rows = frappe.db.sql(
		"""
		SELECT IFNULL(NULLIF(e.employment_type,''), 'Unassigned') AS etype, SUM(ss.net_pay) AS amt
		FROM `tabSalary Slip` ss
		INNER JOIN `tabEmployee` e ON e.name = ss.employee
		WHERE ss.company=%s AND ss.docstatus=1 AND ss.start_date>=%s AND ss.end_date<=%s
		GROUP BY etype ORDER BY amt DESC
		""",
		(company, start, end),
		as_dict=True,
	)

	# C9 / C10 component breakdown
	earn_comp = frappe.db.sql(
		"""
		SELECT sd.salary_component AS name, SUM(sd.amount) AS amt
		FROM `tabSalary Detail` sd
		INNER JOIN `tabSalary Slip` ss ON ss.name=sd.parent
		WHERE ss.company=%s AND ss.docstatus=1 AND ss.start_date>=%s AND ss.end_date<=%s
			AND sd.parentfield='earnings' AND IFNULL(sd.do_not_include_in_total,0)=0
		GROUP BY sd.salary_component ORDER BY amt DESC LIMIT 12
		""",
		(company, start, end),
		as_dict=True,
	)
	ded_comp = frappe.db.sql(
		"""
		SELECT sd.salary_component AS name, SUM(sd.amount) AS amt
		FROM `tabSalary Detail` sd
		INNER JOIN `tabSalary Slip` ss ON ss.name=sd.parent
		WHERE ss.company=%s AND ss.docstatus=1 AND ss.start_date>=%s AND ss.end_date<=%s
			AND sd.parentfield='deductions'
		GROUP BY sd.salary_component ORDER BY amt DESC LIMIT 12
		""",
		(company, start, end),
		as_dict=True,
	)

	# C11 overtime / allowance trend (last 6 months)
	allow_labels, ot_vals, allow_vals = [], [], []
	for i in range(5, -1, -1):
		d = add_months(end, -i)
		m_start = get_first_day(d)
		m_end = get_last_day(d)
		ot = _component_sum(company, m_start, m_end, ["Overtime Allowance", "Hours_Overtime"], "earnings")
		al = _component_sum(company, m_start, m_end, ["Other Allowance", "Fix_Allowance"], "earnings")
		allow_labels.append(d.strftime("%b %Y"))
		ot_vals.append(ot)
		allow_vals.append(al)

	# C12 headcount by dept
	hc_dept = frappe.db.sql(
		"""
		SELECT IFNULL(NULLIF(department,''),'Unassigned') AS dept, COUNT(*) AS n
		FROM `tabEmployee`
		WHERE company=%s AND status='Active'
		GROUP BY dept ORDER BY n DESC LIMIT 12
		""",
		(company,),
		as_dict=True,
	)

	# C13 joiners vs leavers last 6 months
	jl_labels, joiners, leavers = [], [], []
	for i in range(5, -1, -1):
		d = add_months(end, -i)
		m_start = get_first_day(d)
		m_end = get_last_day(d)
		j = frappe.db.count("Employee", {"company": company, "date_of_joining": ["between", [m_start, m_end]]})
		l = frappe.db.sql(
			"SELECT COUNT(*) FROM `tabEmployee` WHERE company=%s AND relieving_date BETWEEN %s AND %s",
			(company, m_start, m_end),
		)[0][0]
		jl_labels.append(d.strftime("%b %Y"))
		joiners.append(cint(j))
		leavers.append(cint(l))

	# C14 attendance mix
	att_mix = []
	if frappe.db.exists("DocType", "Attendance"):
		att_mix = frappe.db.sql(
			"""
			SELECT status, COUNT(*) AS n
			FROM `tabAttendance`
			WHERE docstatus=1 AND attendance_date BETWEEN %s AND %s
				AND employee IN (SELECT name FROM `tabEmployee` WHERE company=%s)
			GROUP BY status ORDER BY n DESC
			""",
			(start, end, company),
			as_dict=True,
		)

	# C15 LWP trend
	lwp_labels, lwp_vals = [], []
	for i in range(5, -1, -1):
		d = add_months(end, -i)
		m_start = get_first_day(d)
		m_end = get_last_day(d)
		v = frappe.db.sql(
			"""
			SELECT COALESCE(SUM(leave_without_pay),0) FROM `tabSalary Slip`
			WHERE company=%s AND docstatus=1 AND end_date BETWEEN %s AND %s
			""",
			(company, m_start, m_end),
		)[0][0]
		lwp_labels.append(d.strftime("%b %Y"))
		lwp_vals.append(flt(v))

	# C16 late by department
	late_dept = []
	if frappe.db.exists("DocType", "Attendance"):
		late_dept = frappe.db.sql(
			"""
			SELECT IFNULL(NULLIF(e.department,''),'Unassigned') AS dept, COUNT(*) AS n
			FROM `tabAttendance` a
			INNER JOIN `tabEmployee` e ON e.name=a.employee
			WHERE a.docstatus=1 AND a.late_entry=1
				AND a.attendance_date BETWEEN %s AND %s AND e.company=%s
			GROUP BY dept ORDER BY n DESC LIMIT 12
			""",
			(start, end, company),
			as_dict=True,
		)

	return {
		"c1_net_trend": {
			"id": 1,
			"title": "Monthly Net Payroll (12 months)",
			"type": "line",
			"lib": "apex",
			"labels": c1_labels,
			"series": [{"name": "Net Pay", "data": c1_net}],
		},
		"c2_gross_ded_net": {
			"id": 2,
			"title": "Gross vs Deductions vs Net",
			"type": "bar",
			"lib": "apex",
			"labels": c1_labels[-6:],
			"series": [
				{"name": "Gross", "data": c1_gross[-6:]},
				{"name": "Deductions", "data": c1_ded[-6:]},
				{"name": "Net", "data": c1_net[-6:]},
			],
		},
		"c3_cost_vs_headcount": {
			"id": 3,
			"title": "Payroll Cost vs Headcount",
			"type": "line",
			"lib": "apex",
			"labels": c1_labels,
			"series": [
				{"name": "Net Pay", "type": "line", "data": c1_net},
				{"name": "Employees Paid", "type": "column", "data": c1_count},
			],
		},
		"c4_by_department": {
			"id": 4,
			"title": "Payroll by Department",
			"type": "donut",
			"lib": "apex",
			"labels": [r.dept for r in dept_rows],
			"series": [flt(r.amt) for r in dept_rows],
		},
		"c5_by_branch": {
			"id": 5,
			"title": "Payroll by Branch",
			"type": "bar",
			"lib": "apex",
			"labels": [r.branch for r in branch_rows],
			"series": [{"name": "Net Pay", "data": [flt(r.amt) for r in branch_rows]}],
		},
		"c6_by_cost_center": {
			"id": 6,
			"title": "Payroll by Department (program proxy)",
			"type": "bar",
			"lib": "chartjs",
			"labels": [r.dept for r in dept_rows[:8]],
			"series": [{"name": "Net Pay", "data": [flt(r.amt) for r in dept_rows[:8]]}],
			"note": "Cost center not on Salary Slip — using department",
		},
		"c7_salary_bands": {
			"id": 7,
			"title": "Salary Band Distribution",
			"type": "bar",
			"lib": "chartjs",
			"labels": [b["label"] for b in band_counts],
			"series": [{"name": "Employees", "data": [b["value"] for b in band_counts]}],
		},
		"c8_office_vs_field": {
			"id": 8,
			"title": "Cost by Employment Type",
			"type": "pie",
			"lib": "apex",
			"labels": [r.etype for r in etype_rows],
			"series": [flt(r.amt) for r in etype_rows],
		},
		"c9_earnings": {
			"id": 9,
			"title": "Earnings by Component",
			"type": "bar",
			"lib": "apex",
			"horizontal": True,
			"labels": [r.name for r in earn_comp],
			"series": [{"name": "Amount", "data": [flt(r.amt) for r in earn_comp]}],
		},
		"c10_deductions": {
			"id": 10,
			"title": "Deductions by Component",
			"type": "bar",
			"lib": "apex",
			"horizontal": True,
			"labels": [r.name for r in ded_comp],
			"series": [{"name": "Amount", "data": [flt(r.amt) for r in ded_comp]}],
		},
		"c11_allowance_trend": {
			"id": 11,
			"title": "Overtime / Allowance Trend",
			"type": "line",
			"lib": "apex",
			"labels": allow_labels,
			"series": [
				{"name": "Overtime", "data": ot_vals},
				{"name": "Allowance", "data": allow_vals},
			],
		},
		"c12_headcount_dept": {
			"id": 12,
			"title": "Headcount by Department",
			"type": "bar",
			"lib": "chartjs",
			"labels": [r.dept for r in hc_dept],
			"series": [{"name": "Active", "data": [cint(r.n) for r in hc_dept]}],
		},
		"c13_joiners_leavers": {
			"id": 13,
			"title": "Joiners vs Leavers",
			"type": "bar",
			"lib": "apex",
			"labels": jl_labels,
			"series": [
				{"name": "Joiners", "data": joiners},
				{"name": "Leavers", "data": leavers},
			],
		},
		"c14_attendance_mix": {
			"id": 14,
			"title": "Attendance Status Mix",
			"type": "donut",
			"lib": "apex",
			"labels": [r.status for r in att_mix],
			"series": [cint(r.n) for r in att_mix],
		},
		"c15_lwp_trend": {
			"id": 15,
			"title": "LWP Days Trend",
			"type": "line",
			"lib": "apex",
			"labels": lwp_labels,
			"series": [{"name": "LWP Days", "data": lwp_vals}],
		},
		"c16_late_by_dept": {
			"id": 16,
			"title": "Late Arrivals by Department",
			"type": "bar",
			"lib": "chartjs",
			"labels": [r.dept for r in late_dept],
			"series": [{"name": "Late", "data": [cint(r.n) for r in late_dept]}],
		},
	}


@frappe.whitelist()
def get_payroll_register_bundle(company=None, year=None, month=None, start_date=None, end_date=None):
	"""Payroll Register view only (month cards + department KPIs + table)."""
	_assert_portal_access()
	company = _company(company)
	start, end = _tif_period(year, month, start_date, end_date)

	from tif_customization.tif_customization.page.variable_components.variable_components import (
		_payroll_register_month_kpis,
	)

	month_kpis = _payroll_register_month_kpis(company, start, end, limit=6)

	# Prefer Variable Components Payment for current period; fall back to Salary Slips
	by_department = []
	total_headcount = 0
	total_amount = 0.0

	if frappe.db.exists("DocType", "Variable Components Payment"):
		rows = frappe.db.sql(
			"""
			SELECT
				IFNULL(NULLIF(e.department, ''), 'No Department') AS department,
				COUNT(CASE WHEN IFNULL(p.payable_amount, 0) > 0 THEN 1 END) AS headcount,
				COALESCE(SUM(IFNULL(p.payable_amount, 0)), 0) AS amount
			FROM `tabVariable Components Payment` p
			INNER JOIN `tabEmployee` e ON e.name = p.employee
			WHERE p.company=%s AND p.start_date=%s AND p.end_date=%s
			GROUP BY department
			ORDER BY amount DESC
			""",
			(company, start, end),
			as_dict=True,
		)
		by_department = [
			{"label": r.department, "headcount": cint(r.headcount), "amount": flt(r.amount)}
			for r in rows
			if cint(r.headcount) or flt(r.amount)
		]
		total_headcount = sum(r["headcount"] for r in by_department)
		total_amount = sum(r["amount"] for r in by_department)

	if not by_department:
		rows = frappe.db.sql(
			"""
			SELECT
				IFNULL(NULLIF(department, ''), 'No Department') AS department,
				COUNT(*) AS headcount,
				COALESCE(SUM(net_pay), 0) AS amount
			FROM `tabSalary Slip`
			WHERE company=%s AND docstatus=1
				AND start_date >= %s AND end_date <= %s
			GROUP BY department
			ORDER BY amount DESC
			""",
			(company, start, end),
			as_dict=True,
		)
		by_department = [
			{"label": r.department, "headcount": cint(r.headcount), "amount": flt(r.amount)}
			for r in rows
		]
		total_headcount = sum(r["headcount"] for r in by_department)
		total_amount = sum(r["amount"] for r in by_department)

	# Mark current month card with live totals
	for m in month_kpis:
		if m.get("is_current"):
			m["headcount"] = total_headcount
			m["amount"] = total_amount

	periods = frappe.get_all(
		"Variable Components Period",
		filters={"company": company},
		fields=["period_label", "start_date", "end_date", "status", "payroll_month", "payroll_year"],
		order_by="end_date desc",
		limit=24,
	) if frappe.db.exists("DocType", "Variable Components Period") else []

	return {
		"company": company,
		"period": {
			"start_date": str(start),
			"end_date": str(end),
			"label": f"{frappe.utils.formatdate(start)} – {frappe.utils.formatdate(end)}",
			"year": end.year,
			"month": end.month,
		},
		"total_headcount": total_headcount,
		"total_amount": total_amount,
		"month_kpis": month_kpis,
		"by_department": by_department,
		"periods": [
			{
				"label": p.period_label or f"{p.start_date} – {p.end_date}",
				"start_date": str(p.start_date),
				"end_date": str(p.end_date),
				"status": p.status or "Draft",
				"month": p.payroll_month,
				"year": p.payroll_year,
				"value": f"{p.start_date}|{p.end_date}",
			}
			for p in periods
		],
	}
