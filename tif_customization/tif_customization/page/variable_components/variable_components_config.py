"""Variable salary components for HR portal — maps sheet columns to Salary Component names."""

# Earning components (flexible / monthly entry)
VARIABLE_EARNINGS = [
	{"key": "fuel", "label": "Fuel", "components": ["Fuel Allowance"]},
	{"key": "mobile", "label": "Mobile / Internet", "components": ["Mobile Allowance", "Mobile Allownce"]},
	{"key": "overtime", "label": "Overtime", "components": ["Overtime Allowance", "Hours_Overtime"]},
	{"key": "other_allowance", "label": "Allowance", "components": ["Other Allowance", "Fix_Allowance"]},
	{"key": "arrear", "label": "Arrears", "components": ["Arrear", "Leave Encashment"]},
	{"key": "bonus", "label": "Bonus", "components": ["Bonus"]},
	{"key": "reimbursement", "label": "Reimbursement", "components": ["Reimbursement", "Travelling Allownce"]},
	{"key": "conveyance", "label": "Conveyance", "components": ["Conveyance Allowance"]},
]

# Deduction components (flexible / monthly entry)
VARIABLE_DEDUCTIONS = [
	{"key": "leave_ded", "label": "Leave / Absents", "components": ["Absents Deduction", "Halfday Deduction", "Late Absents"]},
	{"key": "pf", "label": "PF", "components": ["Provident Fund Deduction"], "readonly": True},
	{"key": "fuel_ded", "label": "Fuel Deduction", "components": ["Fuel Deducted", "Conveyance Allowance Deduction"]},
	{"key": "other_ded", "label": "Other Deduction", "components": ["Other Deduction"]},
	{"key": "tax", "label": "Tax", "components": ["Income Tax Deduction", "Withholding Tax", "Income Tax"]},
]


def resolve_component_names():
	"""Return only components that exist in the site, with canonical name per column."""
	import frappe

	existing = set(frappe.get_all("Salary Component", pluck="name"))
	earnings = []
	deductions = []
	for col in VARIABLE_EARNINGS:
		name = _pick_existing(col["components"], existing)
		if name:
			earnings.append({**col, "component": name})
	for col in VARIABLE_DEDUCTIONS:
		name = _pick_existing(col["components"], existing)
		if name:
			deductions.append({**col, "component": name})
	return earnings, deductions


def _pick_existing(candidates, existing):
	for c in candidates:
		if c in existing:
			return c
	return None
