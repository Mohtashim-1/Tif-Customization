import json

import frappe
from frappe.utils import flt


@frappe.whitelist()
def get_bank_usage(filters=None):
	if isinstance(filters, str):
		filters = json.loads(filters)
	filters = frappe._dict(filters or {})

	conditions = [
		"pe.docstatus = 1",
		"pe.payment_type = 'Pay'",
		"per.reference_doctype = 'Purchase Invoice'",
		"pe.posting_date BETWEEN %(from_date)s AND %(to_date)s",
		"COALESCE(mop.type, 'Other') != 'Cash'",
	]
	values = {
		"from_date": filters.get("from_date"),
		"to_date": filters.get("to_date"),
	}

	cost_centers = filters.get("cost_centers") or []
	if cost_centers:
		conditions.append("pe.cost_center IN %(cost_centers)s")
		values["cost_centers"] = tuple(cost_centers)

	rows = frappe.db.sql(
		f"""
		SELECT
			COALESCE(pe.paid_from, 'Not Specified') AS account,
			COALESCE(SUM(COALESCE(per.allocated_amount, pe.paid_amount, 0)), 0) AS amount,
			COUNT(DISTINCT pe.name) AS payment_count
		FROM `tabPayment Entry` pe
		INNER JOIN `tabPayment Entry Reference` per ON per.parent = pe.name
		INNER JOIN `tabPurchase Invoice` pi ON pi.name = per.reference_name
		LEFT JOIN `tabMode of Payment` mop ON mop.name = pe.mode_of_payment
		WHERE {' AND '.join(conditions)}
		GROUP BY COALESCE(pe.paid_from, 'Not Specified')
		ORDER BY amount DESC
		""",
		values,
		as_dict=True,
	)

	for row in rows:
		account = row.get("account")
		bank_account = None
		if account != "Not Specified":
			bank_account = frappe.db.get_value(
				"Bank Account",
				{"account": account, "is_company_account": 1},
				["bank", "bank_account_no"],
				as_dict=True,
			)
		account_name = frappe.db.get_value("Account", account, "account_name") if account != "Not Specified" else None
		row["bank"] = (bank_account or {}).get("bank") or account_name or account
		row["bank_account_no"] = (bank_account or {}).get("bank_account_no") or ""
		row["amount"] = flt(row.get("amount"))

	return rows
