"""Helpers for TIF Payslip print format (maps slip rows into fixed design labels)."""

from __future__ import annotations

from frappe.utils import flt


def _match(name: str, keywords: list[str]) -> bool:
	n = (name or "").lower()
	return any(kw in n for kw in keywords)


def _sum_rows(rows, keywords: list[str], skip_do_not_include: bool = True) -> float:
	total = 0.0
	for row in rows or []:
		if skip_do_not_include and getattr(row, "do_not_include_in_total", 0):
			continue
		if _match(row.salary_component, keywords):
			total += flt(row.amount)
	return total


def get_payslip_display(doc) -> dict:
	"""Return fixed-label amounts for the TIF Payslip design from a Salary Slip."""
	earnings = doc.get("earnings") or []
	deductions = doc.get("deductions") or []

	fuel_earning = _sum_rows(earnings, ["fuel", "conveyance", "travelling", "traveling"])
	mobile_earning = _sum_rows(earnings, ["mobile", "internet"])
	overtime_earning = _sum_rows(earnings, ["overtime"])
	daily_earning = _sum_rows(earnings, ["daily allowance", "daily allownce"])
	arrears_earning = _sum_rows(earnings, ["arrear"])
	mapped_earning = fuel_earning + mobile_earning + overtime_earning + daily_earning + arrears_earning
	gross_salary = max(flt(doc.gross_pay) - mapped_earning, 0)

	income_tax = _sum_rows(deductions, ["income tax", "withholding tax"])
	pf_eobi = _sum_rows(deductions, ["provident", "eobi"])
	late_absent = _sum_rows(deductions, ["late", "absent", "halfday", "half day"])
	fuel_ded = _sum_rows(deductions, ["fuel", "conveyance"])
	leave_ded = _sum_rows(deductions, ["leave"])
	advance_ded = _sum_rows(deductions, ["advance"])
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
		"arrears_earning": arrears_earning,
		"earnings_total": flt(doc.gross_pay),
		"income_tax": income_tax,
		"pf_eobi": pf_eobi,
		"late_absent": late_absent,
		"loan_amt": loan_amt,
		"advance_ded": advance_ded,
		"fuel_ded": fuel_ded,
		"leave_ded": leave_ded,
		"total_deductions": total_deductions,
		"net_pay": flt(doc.net_pay),
	}
