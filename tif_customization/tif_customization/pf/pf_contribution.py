"""Provident Fund — logs, salary slip & additional salary hooks."""

import frappe
from frappe import _
from frappe.utils import flt, getdate


def get_pf_settings():
	if not frappe.db.exists("DocType", "PF Settings"):
		return None
	return frappe.get_single("PF Settings")


def _component_amount(slip_doc, component_name):
	if not component_name:
		return 0
	for row in slip_doc.get("deductions") or []:
		if row.salary_component == component_name:
			return flt(row.amount)
	for row in slip_doc.get("earnings") or []:
		if row.salary_component == component_name:
			return flt(row.amount)
	return 0


def _pf_base_from_slip(slip_doc):
	settings = get_pf_settings()
	emp_base = frappe.db.get_value("Employee", slip_doc.employee, "custom_pf_formula_base")
	use_gross = (emp_base or getattr(settings, "pf_formula_base", None) or "Gross") == "Gross"
	if use_gross:
		return flt(slip_doc.gross_pay)
	for row in slip_doc.get("earnings") or []:
		if row.salary_component == "Basic Salary":
			return flt(row.amount)
	return flt(slip_doc.gross_pay)


def _employee_pf_rates(employee):
	emp = frappe.db.get_value(
		"Employee",
		employee,
		["custom_pf_applicable", "custom_employee_pf_rate", "custom_employer_pf_rate"],
		as_dict=True,
	) or {}
	settings = get_pf_settings()
	return {
		"applicable": frappe.utils.cint(emp.get("custom_pf_applicable")),
		"employee_rate": flt(emp.get("custom_employee_pf_rate"))
		or flt(getattr(settings, "default_employee_pf_rate", 0)),
		"employer_rate": flt(emp.get("custom_employer_pf_rate"))
		or flt(getattr(settings, "default_employer_pf_rate", 0)),
	}


def get_pf_formula_base_for_employee(employee):
	"""Return 'Gross' or 'Basic' per employee / PF Settings."""
	settings = get_pf_settings()
	emp_base = frappe.db.get_value("Employee", employee, "custom_pf_formula_base")
	formula = emp_base or getattr(settings, "pf_formula_base", None) or "Gross"
	return formula if formula in ("Gross", "Basic") else "Gross"


def get_pf_base_amount(employee, gross_pay, assigned_base=None):
	"""PF calculation base for variable sheet / previews.

	gross_pay: permanent gross + Arrear 2 (excludes fuel, mobile, etc.).
	"""
	if get_pf_formula_base_for_employee(employee) == "Gross":
		return flt(gross_pay)
	return flt(assigned_base if assigned_base is not None else gross_pay)


def compute_pf_deduction_amount(employee, gross_pay, assigned_base=None):
	"""Employee PF deduction from gross pay and assignment base."""
	rates = _employee_pf_rates(employee)
	if not rates["applicable"] or not rates["employee_rate"]:
		return 0.0
	pf_base = get_pf_base_amount(employee, gross_pay, assigned_base)
	return flt(pf_base) * flt(rates["employee_rate"]) / 100


def get_pf_meta_for_employee(employee):
	"""Rates and flags for client-side PF preview on Variable Components."""
	rates = _employee_pf_rates(employee)
	return {
		"pf_applicable": rates["applicable"],
		"pf_rate": rates["employee_rate"],
		"pf_formula_base": get_pf_formula_base_for_employee(employee),
	}


def get_amounts_from_salary_slip(salary_slip):
	"""Return dict of PF amounts from a Salary Slip doc or name."""
	doc = salary_slip
	if isinstance(salary_slip, str):
		doc = frappe.get_doc("Salary Slip", salary_slip)

	settings = get_pf_settings()
	if not settings:
		return None

	rates = _employee_pf_rates(doc.employee)
	if not rates["applicable"]:
		return None

	emp_amt = _component_amount(doc, settings.employee_pf_component)
	er_amt = _component_amount(doc, settings.employer_pf_component)

	if not emp_amt and rates["employee_rate"]:
		base = _pf_base_from_slip(doc)
		emp_amt = base * rates["employee_rate"] / 100
	if not er_amt and rates["employer_rate"]:
		base = _pf_base_from_slip(doc)
		er_amt = base * rates["employer_rate"] / 100

	return {
		"employee_contribution": emp_amt,
		"employer_contribution": er_amt,
		"employee_pf_rate": rates["employee_rate"],
		"employer_pf_rate": rates["employer_rate"],
		"pf_base_amount": _pf_base_from_slip(doc),
	}


def _existing_log(filters):
	return frappe.db.exists("PF Contribution Log", filters)


def create_pf_log(
	employee,
	company,
	source,
	employee_contribution,
	employer_contribution,
	posting_date=None,
	salary_slip=None,
	additional_salary=None,
	remarks=None,
	employee_pf_rate=0,
	employer_pf_rate=0,
	pf_base_amount=0,
):
	posting_date = posting_date or getdate()
	d = getdate(posting_date)
	dup_filters = {"employee": employee, "source": source, "status": ["!=", "Cancelled"]}
	if salary_slip:
		dup_filters["salary_slip"] = salary_slip
	if additional_salary:
		dup_filters["additional_salary"] = additional_salary

	if _existing_log(dup_filters):
		return frappe.get_doc("PF Contribution Log", _existing_log(dup_filters))

	log = frappe.new_doc("PF Contribution Log")
	log.employee = employee
	log.company = company
	log.posting_date = posting_date
	log.payroll_month = d.strftime("%B %Y")
	log.source = source
	log.salary_slip = salary_slip
	log.additional_salary = additional_salary
	log.employee_contribution = flt(employee_contribution)
	log.employer_contribution = flt(employer_contribution)
	log.employee_pf_rate = flt(employee_pf_rate)
	log.employer_pf_rate = flt(employer_pf_rate)
	log.pf_base_amount = flt(pf_base_amount)
	log.status = "Posted"
	log.remarks = remarks
	log.insert(ignore_permissions=True)
	return log


def sync_log_from_salary_slip(doc, method=None):
	if doc.docstatus != 1:
		return
	if not frappe.db.exists("DocType", "PF Contribution Log"):
		return

	amounts = get_amounts_from_salary_slip(doc)
	if not amounts:
		return
	if not amounts["employee_contribution"] and not amounts["employer_contribution"]:
		return

	create_pf_log(
		employee=doc.employee,
		company=doc.company,
		source="Salary Slip",
		employee_contribution=amounts["employee_contribution"],
		employer_contribution=amounts["employer_contribution"],
		posting_date=doc.end_date or doc.posting_date,
		salary_slip=doc.name,
		remarks=_("Auto-created from Salary Slip {0}").format(doc.name),
		employee_pf_rate=amounts["employee_pf_rate"],
		employer_pf_rate=amounts["employer_pf_rate"],
		pf_base_amount=amounts["pf_base_amount"],
	)


def cancel_log_from_salary_slip(doc, method=None):
	if not frappe.db.exists("DocType", "PF Contribution Log"):
		return
	name = frappe.db.get_value(
		"PF Contribution Log",
		{"salary_slip": doc.name, "status": ["!=", "Cancelled"]},
	)
	if name:
		log = frappe.get_doc("PF Contribution Log", name)
		log.status = "Cancelled"
		log.save(ignore_permissions=True)


def sync_log_from_additional_salary(doc, method=None):
	if doc.docstatus != 1:
		return
	if not frappe.db.exists("DocType", "PF Contribution Log"):
		return

	settings = get_pf_settings()
	if not settings:
		return

	pf_components = {settings.employee_pf_component, settings.employer_pf_component}
	if doc.salary_component not in pf_components:
		return

	rates = _employee_pf_rates(doc.employee)
	amount = flt(doc.amount)
	emp_amt = amount if doc.salary_component == settings.employee_pf_component else 0
	er_amt = amount if doc.salary_component == settings.employer_pf_component else 0

	create_pf_log(
		employee=doc.employee,
		company=doc.company,
		source="Additional Salary",
		employee_contribution=emp_amt,
		employer_contribution=er_amt,
		posting_date=doc.payroll_date,
		additional_salary=doc.name,
		remarks=_("From Additional Salary {0}").format(doc.name),
		employee_pf_rate=rates["employee_rate"],
		employer_pf_rate=rates["employer_rate"],
	)


def cancel_log_from_additional_salary(doc, method=None):
	if not frappe.db.exists("DocType", "PF Contribution Log"):
		return
	name = frappe.db.get_value(
		"PF Contribution Log",
		{"additional_salary": doc.name, "status": ["!=", "Cancelled"]},
	)
	if name:
		log = frappe.get_doc("PF Contribution Log", name)
		log.status = "Cancelled"
		log.save(ignore_permissions=True)


@frappe.whitelist()
def setup_pf(company=None):
	from tif_customization.tif_customization.pf.setup import run_pf_setup

	return run_pf_setup(company)


@frappe.whitelist()
def fix_pf_formulas():
	"""Repair PF component/structure formulas (removes invalid frappe.* in eval)."""
	from tif_customization.tif_customization.pf.setup import fix_pf_salary_component_formulas

	result = fix_pf_salary_component_formulas()
	frappe.db.commit()
	return result


@frappe.whitelist()
def sync_pf_workspace():
	from tif_customization.tif_customization.pf.sync_workspace import sync_provident_fund_workspace

	return sync_provident_fund_workspace()


@frappe.whitelist()
def apply_employee_pf_rates():
	"""Apply 8.33% gross PF to all full-time employees; Shahid Khan at 12.77%."""
	from tif_customization.tif_customization.pf.setup import apply_full_time_employee_pf_rates

	return apply_full_time_employee_pf_rates()


@frappe.whitelist()
def backfill_pf_logs_from_slips(company=None, from_date=None, to_date=None):
	"""Create PF logs for submitted salary slips that do not have one yet."""
	filters = {"docstatus": 1}
	if company:
		filters["company"] = company
	if from_date:
		filters["start_date"] = [">=", from_date]
	if to_date:
		filters["end_date"] = ["<=", to_date]

	slips = frappe.get_all("Salary Slip", filters=filters, pluck="name")
	created = 0
	for name in slips:
		if frappe.db.exists("PF Contribution Log", {"salary_slip": name, "status": ["!=", "Cancelled"]}):
			continue
		doc = frappe.get_doc("Salary Slip", name)
		amounts = get_amounts_from_salary_slip(doc)
		if amounts and (amounts["employee_contribution"] or amounts["employer_contribution"]):
			create_pf_log(
				employee=doc.employee,
				company=doc.company,
				source="Salary Slip",
				employee_contribution=amounts["employee_contribution"],
				employer_contribution=amounts["employer_contribution"],
				posting_date=doc.end_date,
				salary_slip=doc.name,
				remarks=_("Backfilled from Salary Slip"),
				employee_pf_rate=amounts["employee_pf_rate"],
				employer_pf_rate=amounts["employer_pf_rate"],
				pf_base_amount=amounts["pf_base_amount"],
			)
			created += 1

	frappe.db.commit()
	return {"created": created, "total_slips": len(slips)}
