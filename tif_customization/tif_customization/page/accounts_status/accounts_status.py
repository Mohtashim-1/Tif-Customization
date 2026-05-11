import calendar
import json

import frappe
from frappe.utils import add_months, cint, flt, get_first_day, get_last_day, getdate, nowdate


@frappe.whitelist()
def get_dashboard_data(filters=None):
	"""Trustee-friendly finance monitoring KPIs for Accounts Status page."""
	if isinstance(filters, str):
		filters = json.loads(filters or "{}")
	filters = filters or {}

	_allowed_roles = {"System Manager", "Accounts Manager", "Accounts User", "Trustee"}
	if not (set(frappe.get_roles()) & _allowed_roles):
		frappe.throw("Not permitted", frappe.PermissionError)

	company = (filters.get("company") or frappe.defaults.get_user_default("Company") or "").strip()
	from_date, to_date = _date_range(filters, company)

	out = _empty_payload(company, from_date, to_date)

	# Core KPIs (respect DocType permissions by falling back safely on error)
	out.update(_ar_kpis(company, to_date))
	out.update(_ap_kpis(company, to_date))
	out.update(_draft_voucher_counts(company))
	out.update(_ytd_income_expense(company, from_date, to_date))

	out["monthly_income_expense"] = _monthly_income_expense(company, from_date, to_date)
	out["bank_cash_balances"] = _bank_cash_balances(company, to_date, limit=25)
	out["overdue_receivables"] = _overdue_receivables_rows(company, to_date, limit=20)
	out["overdue_payables"] = _overdue_payables_rows(company, to_date, limit=20)
	out["accounts_user_activity"] = _accounts_user_activity(company, from_date, to_date)

	return out


def _empty_payload(company, from_date, to_date):
	return {
		"filters": {"company": company, "from_date": str(from_date), "to_date": str(to_date)},
		"receivables_outstanding": 0.0,
		"receivables_overdue": 0.0,
		"receivables_overdue_count": 0,
		"payables_outstanding": 0.0,
		"payables_overdue": 0.0,
		"payables_overdue_count": 0,
		"draft_sales_invoices": 0,
		"draft_purchase_invoices": 0,
		"draft_payment_entries": 0,
		"draft_journal_entries": 0,
		"income_ytd": 0.0,
		"expense_ytd": 0.0,
		"net_ytd": 0.0,
		"monthly_income_expense": {"labels": [], "series": []},
		"bank_cash_balances": [],
		"overdue_receivables": [],
		"overdue_payables": [],
		"accounts_user_activity": [],
	}


def _has_field(doctype, fieldname):
	try:
		return bool(frappe.get_meta(doctype).get_field(fieldname))
	except Exception:
		return False


def _date_range(filters, company):
	today = getdate(nowdate())
	from_date = filters.get("from_date")
	to_date = filters.get("to_date")
	if from_date:
		from_date = getdate(from_date)
	if to_date:
		to_date = getdate(to_date)
	if not to_date:
		to_date = today
	if not from_date:
		from_date = _fiscal_year_start(to_date, company)
	if from_date > to_date:
		from_date, to_date = to_date, from_date
	return from_date, to_date


def _fiscal_year_start(dt, company):
	try:
		from erpnext.accounts.utils import get_fiscal_year

		_, fy_start, _ = get_fiscal_year(dt, company=company)
		return getdate(fy_start)
	except Exception:
		# Safe fallback: calendar year
		return getdate(f"{dt.year}-01-01")


def _ar_kpis(company, to_date):
	out = {"receivables_outstanding": 0.0, "receivables_overdue": 0.0, "receivables_overdue_count": 0}
	if not frappe.db.table_exists("Sales Invoice"):
		return out
	if not company or not _has_field("Sales Invoice", "company"):
		return out
	try:
		row = frappe.db.sql(
			"""
			SELECT
				COALESCE(SUM(si.outstanding_amount), 0) AS outstanding,
				COALESCE(SUM(CASE WHEN si.due_date IS NOT NULL AND si.due_date < %(to_date)s THEN si.outstanding_amount ELSE 0 END), 0) AS overdue,
				COALESCE(SUM(CASE WHEN si.due_date IS NOT NULL AND si.due_date < %(to_date)s THEN 1 ELSE 0 END), 0) AS overdue_count
			FROM `tabSales Invoice` si
			WHERE si.docstatus = 1
			  AND si.company = %(company)s
			  AND si.outstanding_amount > 0
			""",
			{"company": company, "to_date": str(to_date)},
			as_dict=True,
		)
		r = (row or [{}])[0]
		out["receivables_outstanding"] = flt(r.get("outstanding"))
		out["receivables_overdue"] = flt(r.get("overdue"))
		out["receivables_overdue_count"] = cint(r.get("overdue_count"))
	except Exception:
		pass
	return out


def _ap_kpis(company, to_date):
	out = {"payables_outstanding": 0.0, "payables_overdue": 0.0, "payables_overdue_count": 0}
	if not frappe.db.table_exists("Purchase Invoice"):
		return out
	if not company or not _has_field("Purchase Invoice", "company"):
		return out
	try:
		row = frappe.db.sql(
			"""
			SELECT
				COALESCE(SUM(pi.outstanding_amount), 0) AS outstanding,
				COALESCE(SUM(CASE WHEN pi.due_date IS NOT NULL AND pi.due_date < %(to_date)s THEN pi.outstanding_amount ELSE 0 END), 0) AS overdue,
				COALESCE(SUM(CASE WHEN pi.due_date IS NOT NULL AND pi.due_date < %(to_date)s THEN 1 ELSE 0 END), 0) AS overdue_count
			FROM `tabPurchase Invoice` pi
			WHERE pi.docstatus = 1
			  AND pi.company = %(company)s
			  AND pi.outstanding_amount > 0
			""",
			{"company": company, "to_date": str(to_date)},
			as_dict=True,
		)
		r = (row or [{}])[0]
		out["payables_outstanding"] = flt(r.get("outstanding"))
		out["payables_overdue"] = flt(r.get("overdue"))
		out["payables_overdue_count"] = cint(r.get("overdue_count"))
	except Exception:
		pass
	return out


def _draft_voucher_counts(company):
	out = {
		"draft_sales_invoices": 0,
		"draft_purchase_invoices": 0,
		"draft_payment_entries": 0,
		"draft_journal_entries": 0,
	}
	params = {"company": company}
	if company:
		company_cond = " AND company = %(company)s "
	else:
		company_cond = ""

	def _count(doctype, extra_where=""):
		if not frappe.db.table_exists(doctype):
			return 0
		if company and not _has_field(doctype, "company"):
			return 0
		try:
			row = frappe.db.sql(
				f"SELECT COUNT(name) AS c FROM `tab{doctype}` WHERE docstatus = 0 {company_cond} {extra_where}",
				params if company else {},
				as_dict=True,
			)
			return cint((row or [{}])[0].get("c"))
		except Exception:
			return 0

	out["draft_sales_invoices"] = _count("Sales Invoice")
	out["draft_purchase_invoices"] = _count("Purchase Invoice")
	out["draft_payment_entries"] = _count("Payment Entry")
	out["draft_journal_entries"] = _count("Journal Entry")
	return out


def _ytd_income_expense(company, from_date, to_date):
	out = {"income_ytd": 0.0, "expense_ytd": 0.0, "net_ytd": 0.0}
	if not frappe.db.table_exists("GL Entry") or not frappe.db.table_exists("Account"):
		return out
	if not company:
		return out
	try:
		row = frappe.db.sql(
			"""
			SELECT
				COALESCE(SUM(CASE WHEN acc.root_type = 'Income' THEN (gle.credit - gle.debit) ELSE 0 END), 0) AS income,
				COALESCE(SUM(CASE WHEN acc.root_type = 'Expense' THEN (gle.debit - gle.credit) ELSE 0 END), 0) AS expense
			FROM `tabGL Entry` gle
			JOIN `tabAccount` acc ON acc.name = gle.account
			WHERE gle.is_cancelled = 0
			  AND gle.company = %(company)s
			  AND gle.posting_date BETWEEN %(from_date)s AND %(to_date)s
			  AND acc.root_type IN ('Income', 'Expense')
			""",
			{"company": company, "from_date": str(from_date), "to_date": str(to_date)},
			as_dict=True,
		)
		r = (row or [{}])[0]
		out["income_ytd"] = flt(r.get("income"))
		out["expense_ytd"] = flt(r.get("expense"))
		out["net_ytd"] = flt(out["income_ytd"]) - flt(out["expense_ytd"])
	except Exception:
		pass
	return out


def _monthly_income_expense(company, from_date, to_date):
	labels = []
	income = []
	expense = []
	if not company or not frappe.db.table_exists("GL Entry") or not frappe.db.table_exists("Account"):
		return {"labels": labels, "series": []}

	cur = get_first_day(from_date)
	while cur <= to_date:
		m_from = get_first_day(cur)
		m_to = min(get_last_day(cur), to_date)
		labels.append(cur.strftime("%b %Y"))
		res = _ytd_income_expense(company, m_from, m_to)
		income.append(flt(res.get("income_ytd")))
		expense.append(flt(res.get("expense_ytd")))
		cur = add_months(cur, 1)

	return {"labels": labels, "series": [{"name": "Income", "data": income}, {"name": "Expense", "data": expense}]}


def _bank_cash_balances(company, to_date, limit=25):
	if not company or not frappe.db.table_exists("GL Entry") or not frappe.db.table_exists("Account"):
		return []
	if not _has_field("Account", "account_type"):
		return []
	try:
		rows = frappe.db.sql(
			f"""
			SELECT
				acc.name AS account,
				COALESCE(NULLIF(TRIM(acc.account_name), ''), acc.name) AS account_name,
				COALESCE(SUM(gle.debit - gle.credit), 0) AS balance
			FROM `tabAccount` acc
			LEFT JOIN `tabGL Entry` gle
				ON gle.account = acc.name
				AND gle.is_cancelled = 0
				AND gle.company = %(company)s
				AND gle.posting_date <= %(to_date)s
			WHERE acc.company = %(company)s
			  AND acc.account_type IN ('Bank', 'Cash')
			GROUP BY acc.name, acc.account_name
			ORDER BY ABS(balance) DESC
			LIMIT {cint(limit)}
			""",
			{"company": company, "to_date": str(to_date)},
			as_dict=True,
		)
		return [
			{"account": r.get("account"), "account_name": r.get("account_name"), "balance": flt(r.get("balance"))}
			for r in (rows or [])
		]
	except Exception:
		return []


def _overdue_receivables_rows(company, to_date, limit=20):
	if not company or not frappe.db.table_exists("Sales Invoice") or not _has_field("Sales Invoice", "company"):
		return []
	fields = ["name", "customer", "posting_date", "due_date", "outstanding_amount", "grand_total"]
	available = [f for f in fields if _has_field("Sales Invoice", f)]
	if not available:
		return []
	try:
		rows = frappe.db.sql(
			f"""
			SELECT {", ".join([f"si.`{f}`" for f in available])}
			FROM `tabSales Invoice` si
			WHERE si.docstatus = 1
			  AND si.company = %(company)s
			  AND si.outstanding_amount > 0
			  AND si.due_date IS NOT NULL
			  AND si.due_date < %(to_date)s
			ORDER BY si.due_date ASC, si.outstanding_amount DESC
			LIMIT {cint(limit)}
			""",
			{"company": company, "to_date": str(to_date)},
			as_dict=True,
		)
		return rows or []
	except Exception:
		return []


def _overdue_payables_rows(company, to_date, limit=20):
	if not company or not frappe.db.table_exists("Purchase Invoice") or not _has_field("Purchase Invoice", "company"):
		return []
	fields = ["name", "supplier", "posting_date", "due_date", "outstanding_amount", "grand_total"]
	available = [f for f in fields if _has_field("Purchase Invoice", f)]
	if not available:
		return []
	try:
		rows = frappe.db.sql(
			f"""
			SELECT {", ".join([f"pi.`{f}`" for f in available])}
			FROM `tabPurchase Invoice` pi
			WHERE pi.docstatus = 1
			  AND pi.company = %(company)s
			  AND pi.outstanding_amount > 0
			  AND pi.due_date IS NOT NULL
			  AND pi.due_date < %(to_date)s
			ORDER BY pi.due_date ASC, pi.outstanding_amount DESC
			LIMIT {cint(limit)}
			""",
			{"company": company, "to_date": str(to_date)},
			as_dict=True,
		)
		return rows or []
	except Exception:
		return []


def _accounts_user_activity(company, from_date, to_date):
	"""Activity summary for accounts users (counts + last touch) within selected range."""
	users = [
		"muhammad.yasir@tif.edu.pk",
		"muhammad.raza@tif.edu.pk",
	]

	doctypes = [
		"Sales Invoice",
		"Purchase Invoice",
		"Payment Entry",
		"Journal Entry",
	]

	out = []
	for user in users:
		row = {
			"user": user,
			"created_count": 0,
			"touched_count": 0,
			"last_doctype": "",
			"last_name": "",
			"last_action_at": "",
			"last_docstatus": None,
		}
		last = None
		for dt in doctypes:
			if not frappe.db.table_exists(dt):
				continue
			company_cond = ""
			params = {"u": user, "from_date": str(from_date), "to_date": str(to_date)}
			if company and _has_field(dt, "company"):
				company_cond = " AND t.company = %(company)s "
				params["company"] = company

			try:
				created = frappe.db.sql(
					f"""
					SELECT COUNT(*) AS c
					FROM `tab{dt}` t
					WHERE t.owner = %(u)s
					  AND t.creation BETWEEN %(from_date)s AND %(to_date)s
					  {company_cond}
					""",
					params,
					as_dict=True,
				)
				row["created_count"] += cint((created or [{}])[0].get("c"))
			except Exception:
				pass

			try:
				touched = frappe.db.sql(
					f"""
					SELECT COUNT(*) AS c
					FROM `tab{dt}` t
					WHERE t.modified_by = %(u)s
					  AND t.modified BETWEEN %(from_date)s AND %(to_date)s
					  {company_cond}
					""",
					params,
					as_dict=True,
				)
				row["touched_count"] += cint((touched or [{}])[0].get("c"))
			except Exception:
				pass

			try:
				last_rows = frappe.db.sql(
					f"""
					SELECT t.name AS name, t.modified AS modified, t.docstatus AS docstatus
					FROM `tab{dt}` t
					WHERE t.modified_by = %(u)s
					  {company_cond}
					ORDER BY t.modified DESC
					LIMIT 1
					""",
					params if company else {"u": user},
					as_dict=True,
				)
				cand = (last_rows or [None])[0]
				if cand and (not last or (cand.get("modified") and cand.get("modified") > last.get("modified"))):
					last = {"doctype": dt, **cand}
			except Exception:
				pass

		if last:
			row["last_doctype"] = last.get("doctype") or ""
			row["last_name"] = last.get("name") or ""
			row["last_action_at"] = str(last.get("modified") or "")
			row["last_docstatus"] = last.get("docstatus")

		out.append(row)

	return out
