"""Salary Structure formulas for PF — safe for Salary Slip eval (no frappe.*)."""

# Employee custom fields are merged into eval `data` via get_data_for_eval().

PF_CONDITION = "custom_pf_applicable"

PF_BASE_EXPR = (
	"gross_pay if (custom_pf_formula_base or pf_formula_base_setting or 'Gross') == 'Gross' else base"
)

EMPLOYEE_PF_FORMULA = (
	f"flt({PF_BASE_EXPR}) * flt(custom_employee_pf_rate or pf_default_employee_rate or 0) / 100"
)

EMPLOYER_PF_FORMULA = f"flt({PF_BASE_EXPR}) * flt(custom_employer_pf_rate or 0) / 100"

PF_COMPONENTS = {
	"Provident Fund Deduction": EMPLOYEE_PF_FORMULA,
	"Employer Provident Fund Contribution": EMPLOYER_PF_FORMULA,
}
