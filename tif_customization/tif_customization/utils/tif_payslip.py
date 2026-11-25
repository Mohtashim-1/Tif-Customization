"""Helpers for TIF Payslip print format (maps slip rows into fixed design labels)."""

from __future__ import annotations

from frappe.utils import flt


def _match(name: str, keywords: list[str]) -> bool:
	n = (name or "").lower()
	return any(kw in n for kw in keywords)


def _is_deduction_label(name: str) -> bool:
	n = (name or "").lower()
	return "deduct" in n or "deduction" in n


def _sum_rows(
	rows,
	keywords: list[str],
	skip_do_not_include: bool = True,
	exclude_deduction_labels: bool = False,
) -> float:
	total = 0.0
	for row in rows or []:
		if skip_do_not_include and getattr(row, "do_not_include_in_total", 0):
			continue
		comp = row.salary_component or ""
		if exclude_deduction_labels and _is_deduction_label(comp):
			continue
		if _match(comp, keywords):
			total += flt(row.amount)
	return total


def _sum_allowance(rows) -> float:
	"""Variable 'Allowance' column: Other Allowance / Fix_Allowance only.

	Do not pull structure allowances (HRA, Medical, Utility, Daily, etc.).
	"""
	total = 0.0
	for row in rows or []:
		if getattr(row, "do_not_include_in_total", 0):
			continue
		name = (row.salary_component or "").strip().lower().replace(" ", "_")
		# Exact-ish keys used on Variable Components sheet
		if name in {
			"other_allowance",
			"fix_allowance",
			"otherallowance",
			"fixallowance",
		} or name.replace("_", " ") in {"other allowance", "fix allowance"}:
			total += flt(row.amount)
			continue
		# Fallback: component name equals "Allowance" only
		if (row.salary_component or "").strip().lower() == "allowance":
			total += flt(row.amount)
	return total


def get_payslip_display(doc) -> dict:
	"""Return fixed-label amounts for the TIF Payslip design from a Salary Slip."""
	earnings = doc.get("earnings") or []
	deductions = doc.get("deductions") or []

	# Never treat "Fuel Deducted" (wrongly parked in earnings) as fuel earning
	fuel_earning = _sum_rows(
		earnings,
		["fuel", "conveyance", "travelling", "traveling"],
		exclude_deduction_labels=True,
	)
	mobile_earning = _sum_rows(earnings, ["mobile", "internet"], exclude_deduction_labels=True)
	overtime_earning = _sum_rows(earnings, ["overtime"], exclude_deduction_labels=True)
	daily_earning = _sum_rows(
		earnings, ["daily allowance", "daily allownce"], exclude_deduction_labels=True
	)
	# Variable Components "Allowance" (Other Allowance / Fix_Allowance)
	allowance_earning = _sum_allowance(earnings)
	bonus_earning = _sum_rows(earnings, ["bonus"], exclude_deduction_labels=True)
	reimbursement_earning = _sum_rows(earnings, ["reimbursement"], exclude_deduction_labels=True)
	arrears_earning = _sum_rows(earnings, ["arrear"], exclude_deduction_labels=True)
	mapped_earning = (
		fuel_earning
		+ mobile_earning
		+ overtime_earning
		+ daily_earning
		+ allowance_earning
		+ bonus_earning
		+ reimbursement_earning
		+ arrears_earning
	)
	# If Fuel Deducted was wrongly added under earnings, keep it out of "Gross Salary" too
	misplaced_fuel_ded = _sum_rows(
		earnings, ["fuel deduct", "fuel deducted", "conveyance allowance deduction"]
	)
	gross_salary = max(flt(doc.gross_pay) - mapped_earning - misplaced_fuel_ded, 0)

	income_tax = _sum_rows(deductions, ["income tax", "withholding tax"])
	pf_eobi = _sum_rows(deductions, ["provident", "eobi"])
	late_absent = _sum_rows(deductions, ["late", "absent", "halfday", "half day"])
	fuel_ded = _sum_rows(deductions, ["fuel", "conveyance"])
	# Prefer Additional Salary amount when deduction row is inflated / duplicated
	if misplaced_fuel_ded > 0 and fuel_ded != misplaced_fuel_ded:
		# ADS amount often sits on the misplaced earning row; use that as display fuel ded
		fuel_ded = misplaced_fuel_ded
	leave_ded = _sum_rows(deductions, ["leave"])
	advance_ded = _sum_rows(deductions, ["advance"])
	other_ded = _sum_rows(deductions, ["other deduction"])
	loan_from_comp = _sum_rows(deductions, ["loan"])
	loan_amt = flt(doc.total_loan_repayment) or loan_from_comp

	# Footer total should reconcile with net payable (include loan repayments when separate).
	total_deductions = flt(doc.gross_pay) - flt(doc.net_pay)
	if total_deductions < 0:
		total_deductions = flt(doc.total_deduction) + (loan_amt if not loan_from_comp else 0)

	return {
		"gross_salary": gross_salary,
		"fuel_earning": fuel_earning,
		"mobile_earning": mobile_earning,
		"overtime_earning": overtime_earning,
		"daily_earning": daily_earning,
		"allowance_earning": allowance_earning,
		"bonus_earning": bonus_earning,
		"reimbursement_earning": reimbursement_earning,
		"arrears_earning": arrears_earning,
		"earnings_total": flt(doc.gross_pay),
		"income_tax": income_tax,
		"pf_eobi": pf_eobi,
		"late_absent": late_absent,
		"loan_amt": loan_amt,
		"advance_ded": advance_ded,
		"fuel_ded": fuel_ded,
		"leave_ded": leave_ded,
		"other_ded": other_ded,
		"total_deductions": total_deductions,
		"net_pay": flt(doc.net_pay),
	}
