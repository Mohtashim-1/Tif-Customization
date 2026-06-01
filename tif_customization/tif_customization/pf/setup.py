"""One-time / migrate setup for PF salary components, settings, and employee fields."""

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


EMPLOYEE_PF_FIELDS = {
	"Employee": [
		{
			"fieldname": "custom_pf_section",
			"fieldtype": "Section Break",
			"label": "Provident Fund",
			"insert_after": "employment_type",
		},
		{
			"fieldname": "custom_pf_applicable",
			"fieldtype": "Check",
			"label": "PF Applicable",
			"insert_after": "custom_pf_section",
			"default": "0",
		},
		{
			"fieldname": "custom_employee_pf_rate",
			"fieldtype": "Percent",
			"label": "Employee PF Rate (%)",
			"insert_after": "custom_pf_applicable",
			"depends_on": "eval:doc.custom_pf_applicable",
		},
		{
			"fieldname": "custom_employer_pf_rate",
			"fieldtype": "Percent",
			"label": "Employer PF Rate (%)",
			"insert_after": "custom_employee_pf_rate",
			"depends_on": "eval:doc.custom_pf_applicable",
		},
		{
			"fieldname": "custom_pf_formula_base",
			"fieldtype": "Select",
			"label": "PF Base",
			"options": "Base\nGross",
			"insert_after": "custom_employer_pf_rate",
			"depends_on": "eval:doc.custom_pf_applicable",
			"default": "Gross",
		},
	]
}

# Standard PF = 1/12 of gross (8.33%). Shahid Khan uses combined/higher rate per manual sheet.
STANDARD_PF_RATE = 8.33
SHAHID_KHAN_EMPLOYEE_ID = "HR-EMP-00058"
SHAHID_KHAN_PF_RATE = 12.77
FULL_TIME_EMPLOYMENT_TYPE = "Full Time -  (Permanent)"


def setup_pf_custom_fields():
	create_custom_fields(EMPLOYEE_PF_FIELDS, ignore_validate=True)


def _company_abbr(company):
	return frappe.db.get_value("Company", company, "abbr") or company


def _account(name, company):
	abbr = _company_abbr(company)
	if frappe.db.exists("Account", f"{name} - {abbr}"):
		return f"{name} - {abbr}"
	return frappe.db.get_value("Account", {"account_name": name, "company": company})


def ensure_salary_component(name, component_type, accounts, **kwargs):
	if frappe.db.exists("Salary Component", name):
		doc = frappe.get_doc("Salary Component", name)
	else:
		doc = frappe.new_doc("Salary Component")
		doc.salary_component = name
		doc.salary_component_abbr = kwargs.get("abbr") or name[:10].upper()
		doc.type = component_type

	doc.description = kwargs.get("description") or name
	doc.depends_on_payment_days = kwargs.get("depends_on_payment_days", 1)
	doc.remove_if_zero_valued = 1
	doc.is_tax_applicable = 0
	doc.do_not_include_in_total = kwargs.get("do_not_include_in_total", 0)
	doc.statistical_component = kwargs.get("statistical_component", 0)

	if kwargs.get("condition"):
		doc.condition = kwargs["condition"]
	if kwargs.get("formula"):
		doc.amount_based_on_formula = 1
		doc.formula = kwargs["formula"]

	doc.accounts = []
	for company, account in accounts.items():
		if account:
			doc.append("accounts", {"company": company, "account": account})

	doc.flags.ignore_validate = True
	doc.save(ignore_permissions=True)
	return doc.name


def ensure_pf_settings(company):
	payable = _account("Provident Fund Payable", company)
	expense = _account("Employer Provident Fund Expense", company)
	if not payable or not expense:
		frappe.throw(
			f"PF accounts not found for {company}. Create Provident Fund Payable and "
			"Employer Provident Fund Expense first."
		)

	from tif_customization.tif_customization.pf.formulas import (
		EMPLOYEE_PF_FORMULA,
		EMPLOYER_PF_FORMULA,
		PF_CONDITION,
	)

	emp_comp = ensure_salary_component(
		"Provident Fund Deduction",
		"Deduction",
		{company: payable},
		abbr="PF",
		condition=PF_CONDITION,
		formula=EMPLOYEE_PF_FORMULA,
	)

	er_comp = ensure_salary_component(
		"Employer Provident Fund Contribution",
		"Earning",
		{company: expense},
		abbr="EPF",
		do_not_include_in_total=1,
		condition=PF_CONDITION,
		formula=EMPLOYER_PF_FORMULA,
	)

	settings = frappe.get_single("PF Settings")
	settings.company = company
	settings.pf_payable_account = payable
	settings.employer_pf_expense_account = expense
	settings.employee_pf_component = emp_comp
	settings.employer_pf_component = er_comp
	settings.default_employee_pf_rate = STANDARD_PF_RATE
	settings.default_employer_pf_rate = STANDARD_PF_RATE
	settings.pf_formula_base = "Gross"
	settings.flags.ignore_permissions = True
	settings.save()

	return settings


def run_pf_setup_on_migrate():
	"""Ensure employee PF fields exist after migrate; skip full component setup if settings exist."""
	try:
		setup_pf_custom_fields()
		if not frappe.db.exists("PF Settings", "PF Settings"):
			company = frappe.defaults.get_global_default("company") or frappe.db.get_value(
				"Company", {}, "name"
			)
			if company:
				ensure_pf_settings(company)
		fix_pf_salary_component_formulas()
	except Exception:
		frappe.log_error(frappe.get_traceback(), "PF setup on migrate")


def fix_pf_salary_component_formulas():
	"""Patch Salary Component + Structure rows — removes frappe.* from PF formulas."""
	from tif_customization.tif_customization.pf.formulas import (
		EMPLOYEE_PF_FORMULA,
		EMPLOYER_PF_FORMULA,
		PF_COMPONENTS,
		PF_CONDITION,
	)

	updated_components = 0
	updated_rows = 0
	for component, formula in PF_COMPONENTS.items():
		if not frappe.db.exists("Salary Component", component):
			continue
		frappe.db.set_value(
			"Salary Component",
			component,
			{
				"condition": PF_CONDITION,
				"formula": formula,
				"amount_based_on_formula": 1,
			},
			update_modified=False,
		)
		updated_components += 1
		rows = frappe.db.sql(
			"""
			SELECT name FROM `tabSalary Detail`
			WHERE salary_component = %(component)s
			""",
			{"component": component},
		)
		if rows:
			frappe.db.sql(
				"""
				UPDATE `tabSalary Detail`
				SET `condition` = %(condition)s, formula = %(formula)s, amount_based_on_formula = 1
				WHERE salary_component = %(component)s
				""",
				{"condition": PF_CONDITION, "formula": formula, "component": component},
			)
			updated_rows += len(rows)

	frappe.clear_cache(doctype="Salary Component")
	return {"updated_components": updated_components, "updated_structure_rows": updated_rows}


def run_pf_setup(company=None):
	company = company or frappe.defaults.get_global_default("company")
	if not company:
		company = frappe.db.get_single_value("Company", "name")
	if not company:
		frappe.throw("No company found for PF setup.")

	setup_pf_custom_fields()
	ensure_pf_settings(company)
	fix_pf_salary_component_formulas()
	frappe.db.commit()
	return {"company": company, "message": "PF setup completed"}


def apply_full_time_employee_pf_rates():
	"""Mark all full-time permanent employees for PF at standard gross rate; Shahid Khan exception."""
	employees = frappe.get_all(
		"Employee",
		filters={"status": "Active", "employment_type": FULL_TIME_EMPLOYMENT_TYPE},
		fields=["name", "employee_name"],
	)

	updated = 0
	for emp in employees:
		is_shahid = emp.name == SHAHID_KHAN_EMPLOYEE_ID
		frappe.db.set_value(
			"Employee",
			emp.name,
			{
				"custom_pf_applicable": 1,
				"custom_pf_formula_base": "Gross",
				"custom_employee_pf_rate": SHAHID_KHAN_PF_RATE if is_shahid else STANDARD_PF_RATE,
				"custom_employer_pf_rate": 0 if is_shahid else STANDARD_PF_RATE,
			},
			update_modified=False,
		)
		updated += 1

	frappe.db.commit()
	return {
		"updated": updated,
		"standard_rate": STANDARD_PF_RATE,
		"shahid_khan_rate": SHAHID_KHAN_PF_RATE,
		"employment_type": FULL_TIME_EMPLOYMENT_TYPE,
	}
