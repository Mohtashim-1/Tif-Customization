# Copyright (c) 2026, mohtashim and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import flt, getdate
from frappe.query_builder.functions import Sum
from frappe.utils.nestedset import get_descendants_of

from erpnext.accounts.report.financial_statements import get_period_list


def execute(filters=None):
	filters = frappe._dict(filters or {})

	validate_filters(filters)
	company_currency = frappe.get_cached_value("Company", filters.company, "default_currency")

	group_fields = get_group_fields(filters.group_by)
	period_list = get_periods(filters)

	columns = get_columns(filters, group_fields, period_list)
	data = get_data(filters, group_fields, period_list, company_currency)

	return columns, data


def validate_filters(filters):
	if not filters.company:
		frappe.throw(_("Company is required"))

	if not filters.from_date or not filters.to_date:
		frappe.throw(_("From Date and To Date are required"))

	filters.from_date = getdate(filters.from_date)
	filters.to_date = getdate(filters.to_date)

	if filters.from_date > filters.to_date:
		frappe.throw(_("From Date cannot be after To Date"))

	if filters.periodicity not in ("Monthly", "Quarterly", "Half-Yearly", "Yearly"):
		filters.periodicity = "Monthly"

	if filters.group_by not in ("Department", "Head", "Department & Head"):
		filters.group_by = "Department"


def get_group_fields(group_by):
	if group_by == "Head":
		return ["account"]
	if group_by == "Department & Head":
		return ["cost_center", "account"]
	return ["cost_center"]


def get_periods(filters):
	period_list = get_period_list(
		None,
		None,
		filters.from_date,
		filters.to_date,
		"Date Range",
		filters.periodicity,
		company=filters.company,
		ignore_fiscal_year=True,
	)

	# Ensure bounds are clipped to the selected date range
	for p in period_list:
		p.from_date = max(getdate(p.from_date), filters.from_date)
		p.to_date = min(getdate(p.to_date), filters.to_date)

	return period_list


def get_columns(filters, group_fields, period_list):
	columns = []

	if "cost_center" in group_fields:
		columns.append(
			{
				"label": _("Department"),
				"fieldname": "cost_center",
				"fieldtype": "Link",
				"options": "Cost Center",
				"width": 220,
			}
		)

	if "account" in group_fields:
		columns.append(
			{
				"label": _("Head"),
				"fieldname": "account",
				"fieldtype": "Link",
				"options": "Account",
				"width": 220,
			}
		)
		columns.append({"label": _("Head Name"), "fieldname": "account_name", "fieldtype": "Data", "width": 220})

	columns.append({"label": _("Currency"), "fieldname": "currency", "fieldtype": "Link", "options": "Currency", "hidden": 1})

	show_dr_cr = frappe.utils.cint(filters.get("show_dr_cr"))

	if frappe.utils.cint(filters.get("show_opening")):
		if show_dr_cr:
			columns.extend(
				[
					{"label": _("Opening Dr"), "fieldname": "opening_debit", "fieldtype": "Currency", "options": "currency", "width": 120},
					{"label": _("Opening Cr"), "fieldname": "opening_credit", "fieldtype": "Currency", "options": "currency", "width": 120},
				]
			)
		columns.append(
			{"label": _("Opening Balance"), "fieldname": "opening_balance", "fieldtype": "Currency", "options": "currency", "width": 140}
		)

	for p in period_list:
		if show_dr_cr:
			columns.append(
				{
					"label": _("{0} Dr").format(p.label),
					"fieldname": f"{p.key}_debit",
					"fieldtype": "Currency",
					"options": "currency",
					"width": 120,
				}
			)
			columns.append(
				{
					"label": _("{0} Cr").format(p.label),
					"fieldname": f"{p.key}_credit",
					"fieldtype": "Currency",
					"options": "currency",
					"width": 120,
				}
			)
		columns.append(
			{
				"label": p.label,
				"fieldname": f"{p.key}_net",
				"fieldtype": "Currency",
				"options": "currency",
				"width": 140,
			}
		)

	if show_dr_cr:
		columns.extend(
			[
				{"label": _("Total Dr"), "fieldname": "total_debit", "fieldtype": "Currency", "options": "currency", "width": 120},
				{"label": _("Total Cr"), "fieldname": "total_credit", "fieldtype": "Currency", "options": "currency", "width": 120},
			]
		)

	columns.append({"label": _("Net"), "fieldname": "total_net", "fieldtype": "Currency", "options": "currency", "width": 140})
	columns.append(
		{"label": _("Closing Balance"), "fieldname": "closing_balance", "fieldtype": "Currency", "options": "currency", "width": 160}
	)

	return columns


def get_data(filters, group_fields, period_list, company_currency):
	conditions = get_gl_conditions(filters)
	opening_map = get_opening_map(filters, group_fields, conditions) if frappe.utils.cint(filters.get("show_opening")) else {}
	range_entries = get_gl_entries(filters, group_fields, conditions)

	# period bucketing
	periods = [(getdate(p.from_date), getdate(p.to_date), p.key) for p in period_list]
	period_totals = {}

	for row in range_entries:
		period_key = get_period_key(getdate(row.posting_date), periods)
		if not period_key:
			continue
		group_key = tuple((row.get(f) or "") for f in group_fields)
		period_totals.setdefault(group_key, {}).setdefault(period_key, {"debit": 0.0, "credit": 0.0})
		period_totals[group_key][period_key]["debit"] += flt(row.debit)
		period_totals[group_key][period_key]["credit"] += flt(row.credit)

	rows = []
	all_group_keys = set(period_totals.keys()) | set(opening_map.keys())

	account_names = {}
	if "account" in group_fields:
		accounts = sorted({k[group_fields.index("account")] for k in all_group_keys if k[group_fields.index("account")]})
		if accounts:
			account_names = dict(frappe.db.get_all("Account", filters={"name": ["in", accounts]}, fields=["name", "account_name"], as_list=1))

	for group_key in sorted(all_group_keys):
		out = {"currency": company_currency}

		for idx, fieldname in enumerate(group_fields):
			out[fieldname] = group_key[idx] or None

		if "account" in group_fields:
			account = out.get("account")
			out["account_name"] = account_names.get(account, "") if account else ""

		opening = opening_map.get(group_key, {"debit": 0.0, "credit": 0.0})
		opening_debit = flt(opening.get("debit"))
		opening_credit = flt(opening.get("credit"))
		opening_balance = opening_debit - opening_credit

		if frappe.utils.cint(filters.get("show_opening")):
			if frappe.utils.cint(filters.get("show_dr_cr")):
				out["opening_debit"] = opening_debit
				out["opening_credit"] = opening_credit
			out["opening_balance"] = opening_balance

		total_debit = 0.0
		total_credit = 0.0
		net_total = 0.0

		for p in period_list:
			pvals = (period_totals.get(group_key) or {}).get(p.key, {"debit": 0.0, "credit": 0.0})
			debit = flt(pvals["debit"])
			credit = flt(pvals["credit"])
			net = debit - credit

			if frappe.utils.cint(filters.get("show_dr_cr")):
				out[f"{p.key}_debit"] = debit
				out[f"{p.key}_credit"] = credit
			out[f"{p.key}_net"] = net

			total_debit += debit
			total_credit += credit
			net_total += net

		if frappe.utils.cint(filters.get("show_dr_cr")):
			out["total_debit"] = total_debit
			out["total_credit"] = total_credit

		out["total_net"] = net_total
		out["closing_balance"] = opening_balance + net_total

		rows.append(out)

	return rows


def get_period_key(posting_date, periods):
	for from_date, to_date, key in periods:
		if from_date <= posting_date <= to_date:
			return key
	return None


def get_gl_conditions(filters):
	conditions = {"company": filters.company}

	if filters.get("department"):
		cost_centers = [filters.department]
		if frappe.utils.cint(filters.get("include_child_cost_centers")):
			cost_centers += get_descendants_of("Cost Center", filters.department)
		conditions["cost_centers"] = tuple(set(cost_centers))

	if filters.get("account"):
		accounts = [filters.account]
		if frappe.utils.cint(filters.get("include_child_accounts")):
			accounts += get_descendants_of("Account", filters.account)
		conditions["accounts"] = tuple(set(accounts))

	conditions["include_cancelled"] = frappe.utils.cint(filters.get("include_cancelled"))
	return conditions


def get_opening_map(filters, group_fields, conditions):
	gl = frappe.qb.DocType("GL Entry")

	select_fields = [gl[f] for f in group_fields]
	query = (
		frappe.qb.from_(gl)
		.select(*select_fields, Sum(gl.debit).as_("debit"), Sum(gl.credit).as_("credit"))
		.where(gl.company == conditions["company"])
		.where(gl.posting_date < filters.from_date)
	)

	if not conditions.get("include_cancelled"):
		query = query.where(gl.is_cancelled == 0)

	if conditions.get("accounts"):
		query = query.where(gl.account.isin(conditions["accounts"]))
	if conditions.get("cost_centers"):
		query = query.where(gl.cost_center.isin(conditions["cost_centers"]))

	query = query.groupby(*select_fields)

	out = {}
	for r in query.run(as_dict=True):
		key = tuple((r.get(f) or "") for f in group_fields)
		out[key] = {"debit": flt(r.debit), "credit": flt(r.credit)}
	return out


def get_gl_entries(filters, group_fields, conditions):
	gl = frappe.qb.DocType("GL Entry")
	select_fields = [gl.posting_date] + [gl[f] for f in group_fields] + [gl.debit, gl.credit]

	query = (
		frappe.qb.from_(gl)
		.select(*select_fields)
		.where(gl.company == conditions["company"])
		.where(gl.posting_date >= filters.from_date)
		.where(gl.posting_date <= filters.to_date)
	)

	if not conditions.get("include_cancelled"):
		query = query.where(gl.is_cancelled == 0)

	if conditions.get("accounts"):
		query = query.where(gl.account.isin(conditions["accounts"]))
	if conditions.get("cost_centers"):
		query = query.where(gl.cost_center.isin(conditions["cost_centers"]))

	return query.run(as_dict=True)
