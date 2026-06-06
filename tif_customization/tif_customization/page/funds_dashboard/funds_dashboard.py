import calendar
from collections import defaultdict

import frappe
from frappe import _
from frappe.utils import add_days, add_months, flt, get_first_day, get_last_day, getdate


def _default_dates():
	today = getdate()
	return add_months(today, -11), today


def _period_key(posting_date, period_type):
	date_value = getdate(posting_date)
	if period_type == "yearly":
		return str(date_value.year), str(date_value.year)
	if period_type == "quarterly":
		quarter = ((date_value.month - 1) // 3) + 1
		return f"{date_value.year}-Q{quarter}", f"Q{quarter} {date_value.year}"
	return date_value.strftime("%Y-%m"), f"{calendar.month_abbr[date_value.month]} {date_value.year}"


def _period_keys(from_date, to_date, period_type):
	start = get_first_day(from_date)
	end = get_last_day(to_date)
	keys = []
	labels = {}
	cursor = start
	while cursor <= end:
		key, label = _period_key(cursor, period_type)
		if key not in labels:
			keys.append(key)
			labels[key] = label
		cursor = add_months(cursor, 1)
	return keys, labels


def _pct_change(current, previous):
	if not previous:
		return 100.0 if current else 0.0
	return round((flt(current) - flt(previous)) / flt(previous) * 100, 1)


def _sql_in(values):
	if not values:
		return "('')"
	return "(" + ", ".join(frappe.db.escape(value) for value in values) + ")"


def _donation_accounting_entries(filters):
	entries = frappe.get_all(
		"Donation",
		filters=filters,
		fields=["accounting_entry_type", "accounting_entry"],
		limit=10000,
	)
	return {
		(row.accounting_entry_type, row.accounting_entry)
		for row in entries
		if row.accounting_entry_type and row.accounting_entry
	}


def _get_donation_rows(filters):
	return frappe.get_all(
		"Donation",
		filters=filters,
		fields=[
			"name",
			"donation_date",
			"company",
			"donor",
			"donor_name",
			"donation_type",
			"donation_category",
			"payment_method",
			"bank_account",
			"received_amount",
			"outstanding_amount",
			"cost_center",
			"accounting_entry_type",
			"accounting_entry",
		],
		order_by="donation_date desc",
		limit=10000,
	)


def _get_income_rows(company, from_date, to_date, cost_center=None, excluded_vouchers=None):
	conditions = [
		"gle.is_cancelled = 0",
		"gle.posting_date between %(from_date)s and %(to_date)s",
		"acc.root_type = 'Income'",
	]
	values = {"from_date": from_date, "to_date": to_date}
	if company:
		conditions.append("gle.company = %(company)s")
		values["company"] = company
	if cost_center:
		conditions.append("gle.cost_center = %(cost_center)s")
		values["cost_center"] = cost_center

	excluded_vouchers = excluded_vouchers or set()
	if excluded_vouchers:
		excluded_pairs = [
			f"(gle.voucher_type = {frappe.db.escape(voucher_type)} and gle.voucher_no = {frappe.db.escape(voucher_no)})"
			for voucher_type, voucher_no in excluded_vouchers
		]
		conditions.append(f"not ({' or '.join(excluded_pairs)})")

	return frappe.db.sql(
		f"""
		select
			gle.name,
			gle.posting_date,
			gle.company,
			gle.account,
			gle.voucher_type,
			gle.voucher_no,
			gle.party_type,
			gle.party,
			gle.cost_center,
			(gle.credit - gle.debit) as amount
		from `tabGL Entry` gle
		inner join `tabAccount` acc on acc.name = gle.account
		where {" and ".join(conditions)}
		having amount != 0
		order by gle.posting_date desc, gle.creation desc
		limit 10000
		""",
		values=values,
		as_dict=True,
	)


@frappe.whitelist()
def get_dashboard_data(company=None, from_date=None, to_date=None, period_type="monthly", cost_center=None):
	default_from, default_to = _default_dates()
	company = company or frappe.defaults.get_user_default("Company") or frappe.defaults.get_global_default("company")
	from_date = getdate(from_date or default_from)
	to_date = getdate(to_date or default_to)
	period_type = period_type if period_type in ("monthly", "quarterly", "yearly") else "monthly"

	donation_filters = {
		"docstatus": 1,
		"donation_date": ["between", [from_date, to_date]],
	}
	if company:
		donation_filters["company"] = company
	if cost_center:
		donation_filters["cost_center"] = cost_center

	donations = _get_donation_rows(donation_filters)
	income_rows = _get_income_rows(
		company=company,
		from_date=from_date,
		to_date=to_date,
		cost_center=cost_center,
		excluded_vouchers=_donation_accounting_entries(donation_filters),
	)

	period_keys, period_labels = _period_keys(from_date, to_date, period_type)
	by_period = defaultdict(lambda: {"donation": 0, "income": 0, "donation_count": 0, "income_count": 0})
	by_cost_center = defaultdict(lambda: {"donation": 0, "income": 0, "count": 0})
	by_source = defaultdict(lambda: {"amount": 0, "count": 0})
	by_donor = defaultdict(lambda: {"donor_name": "", "amount": 0, "count": 0})
	by_payment_method = defaultdict(lambda: {"amount": 0, "count": 0})
	by_bank_account = defaultdict(lambda: {"amount": 0, "count": 0})
	by_donation_type = defaultdict(lambda: {"amount": 0, "count": 0})
	by_donation_category = defaultdict(lambda: {"amount": 0, "count": 0})
	by_income_account = defaultdict(lambda: {"amount": 0, "count": 0})
	by_weekday = defaultdict(float)
	by_month_of_year = defaultdict(float)
	daily_map = defaultdict(lambda: {"donation": 0, "income": 0})

	donation_total = 0
	income_total = 0
	outstanding_total = 0
	donor_set = set()
	recent_rows = []

	for row in donations:
		amount = flt(row.received_amount)
		outstanding_total += flt(row.outstanding_amount)
		donation_total += amount
		donor_key = row.donor or row.donor_name or _("Anonymous")
		donor_set.add(donor_key)

		period_key, _label = _period_key(row.donation_date, period_type)
		by_period[period_key]["donation"] += amount
		by_period[period_key]["donation_count"] += 1
		daily_map[getdate(row.donation_date)]["donation"] += amount
		by_weekday[getdate(row.donation_date).weekday()] += amount
		by_month_of_year[getdate(row.donation_date).month] += amount

		cost_center_key = row.cost_center or _("Unassigned")
		by_cost_center[cost_center_key]["donation"] += amount
		by_cost_center[cost_center_key]["count"] += 1

		source_key = row.donation_type or _("Donation")
		by_source[f"{_('Donation')}: {source_key}"]["amount"] += amount
		by_source[f"{_('Donation')}: {source_key}"]["count"] += 1
		by_donation_type[source_key]["amount"] += amount
		by_donation_type[source_key]["count"] += 1
		category_key = row.donation_category or _("Uncategorized")
		by_donation_category[category_key]["amount"] += amount
		by_donation_category[category_key]["count"] += 1
		payment_key = row.payment_method or _("Unspecified")
		by_payment_method[payment_key]["amount"] += amount
		by_payment_method[payment_key]["count"] += 1
		bank_key = _("Cash Donations") if (row.payment_method or "").lower() == "cash" else row.bank_account or _("Unspecified Bank")
		by_bank_account[bank_key]["amount"] += amount
		by_bank_account[bank_key]["count"] += 1

		by_donor[donor_key]["donor_name"] = row.donor_name or donor_key
		by_donor[donor_key]["amount"] += amount
		by_donor[donor_key]["count"] += 1

		recent_rows.append(
			{
				"name": row.name,
				"posting_date": row.donation_date,
				"party": row.donor_name or row.donor or _("Anonymous"),
				"cost_center": row.cost_center,
				"source_type": _("Donation"),
				"source": row.donation_type or row.donation_category or _("Donation"),
				"bank_account": bank_key,
				"amount": amount,
				"route": f"/app/donation/{row.name}",
			}
		)

	for row in income_rows:
		amount = flt(row.amount)
		income_total += amount

		period_key, _label = _period_key(row.posting_date, period_type)
		by_period[period_key]["income"] += amount
		by_period[period_key]["income_count"] += 1
		daily_map[getdate(row.posting_date)]["income"] += amount
		by_weekday[getdate(row.posting_date).weekday()] += amount
		by_month_of_year[getdate(row.posting_date).month] += amount

		cost_center_key = row.cost_center or _("Unassigned")
		by_cost_center[cost_center_key]["income"] += amount
		by_cost_center[cost_center_key]["count"] += 1

		by_source[f"{_('Income')}: {row.account}"]["amount"] += amount
		by_source[f"{_('Income')}: {row.account}"]["count"] += 1
		by_income_account[row.account]["amount"] += amount
		by_income_account[row.account]["count"] += 1

		recent_rows.append(
			{
				"name": row.name,
				"posting_date": row.posting_date,
				"party": row.party or row.voucher_no,
				"cost_center": row.cost_center,
				"source_type": _("Income"),
				"source": row.account,
				"amount": amount,
				"route": f"/app/{frappe.scrub(row.voucher_type).replace('_', '-')}/{row.voucher_no}",
			}
		)

	period_data = [
		{
			"period": key,
			"label": period_labels[key],
			"donation_amount": by_period[key]["donation"],
			"income_amount": by_period[key]["income"],
			"total_funds": by_period[key]["donation"] + by_period[key]["income"],
			"donation_count": by_period[key]["donation_count"],
			"income_count": by_period[key]["income_count"],
		}
		for key in period_keys
	]

	cost_center_data = sorted(
		[
			{
				"cost_center": cost_center_key,
				"donation_amount": values["donation"],
				"income_amount": values["income"],
				"total_funds": values["donation"] + values["income"],
				"transaction_count": values["count"],
			}
			for cost_center_key, values in by_cost_center.items()
		],
		key=lambda row: -row["total_funds"],
	)

	source_data = sorted(
		[
			{"source": source, "amount": values["amount"], "count": values["count"]}
			for source, values in by_source.items()
		],
		key=lambda row: -abs(row["amount"]),
	)

	payment_method_data = sorted(
		[
			{"payment_method": method, "amount": values["amount"], "count": values["count"]}
			for method, values in by_payment_method.items()
		],
		key=lambda row: -row["amount"],
	)

	bank_account_data = sorted(
		[
			{"bank_account": bank_account, "amount": values["amount"], "count": values["count"]}
			for bank_account, values in by_bank_account.items()
		],
		key=lambda row: -row["amount"],
	)

	donation_type_data = sorted(
		[
			{"donation_type": donation_type, "amount": values["amount"], "count": values["count"]}
			for donation_type, values in by_donation_type.items()
		],
		key=lambda row: -row["amount"],
	)

	donation_category_data = sorted(
		[
			{"donation_category": category, "amount": values["amount"], "count": values["count"]}
			for category, values in by_donation_category.items()
		],
		key=lambda row: -row["amount"],
	)

	income_account_data = sorted(
		[
			{"account": account, "amount": values["amount"], "count": values["count"]}
			for account, values in by_income_account.items()
		],
		key=lambda row: -abs(row["amount"]),
	)

	top_donors = sorted(
		[
			{
				"donor": donor,
				"donor_name": values["donor_name"],
				"donation_amount": values["amount"],
				"donation_count": values["count"],
			}
			for donor, values in by_donor.items()
		],
		key=lambda row: -row["donation_amount"],
	)[:25]

	recent_rows = sorted(recent_rows, key=lambda row: row["posting_date"], reverse=True)[:100]
	daily_data = []
	cursor = from_date
	while cursor <= to_date:
		values = daily_map[cursor]
		daily_data.append(
			{
				"date": cursor,
				"label": cursor.strftime("%d %b"),
				"donation_amount": values["donation"],
				"income_amount": values["income"],
				"total_funds": values["donation"] + values["income"],
			}
		)
		cursor = add_days(cursor, 1)

	weekday_labels = [_("Mon"), _("Tue"), _("Wed"), _("Thu"), _("Fri"), _("Sat"), _("Sun")]
	weekday_data = [
		{"weekday": idx, "label": weekday_labels[idx], "amount": by_weekday[idx]} for idx in range(7)
	]
	month_labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
	month_of_year_data = [
		{"month": idx, "label": month_labels[idx - 1], "amount": by_month_of_year[idx]}
		for idx in range(1, 13)
	]

	bucket_ranges = [
		("0 - 999", 0, 999),
		("1,000 - 4,999", 1000, 4999),
		("5,000 - 24,999", 5000, 24999),
		("25,000 - 99,999", 25000, 99999),
		("100,000 - 499,999", 100000, 499999),
		("500,000+", 500000, None),
	]
	donation_buckets = [{"label": label, "count": 0, "amount": 0} for label, _min, _max in bucket_ranges]
	for row in donations:
		amount = flt(row.received_amount)
		for index, (_label, min_amount, max_amount) in enumerate(bucket_ranges):
			if amount >= min_amount and (max_amount is None or amount <= max_amount):
				donation_buckets[index]["count"] += 1
				donation_buckets[index]["amount"] += amount
				break

	settings = (
		frappe.get_single("Donation Settings")
		if frappe.db.exists("DocType", "Donation Settings")
		else None
	)
	current_period_total = period_data[-1]["total_funds"] if period_data else 0
	previous_period_total = period_data[-2]["total_funds"] if len(period_data) > 1 else 0

	return {
		"company": company,
		"from_date": from_date,
		"to_date": to_date,
		"period_type": period_type,
		"cost_center": cost_center,
		"summary": {
			"total_funds": donation_total + income_total,
			"donation_total": donation_total,
			"income_total": income_total,
			"donation_count": len(donations),
			"income_entry_count": len(income_rows),
			"unique_donors": len(donor_set),
			"outstanding_amount": outstanding_total,
			"current_period_total": current_period_total,
			"period_change_pct": _pct_change(current_period_total, previous_period_total),
		},
		"period_data": period_data,
		"daily_data": daily_data,
		"cost_center_data": cost_center_data,
		"source_data": source_data,
		"payment_method_data": payment_method_data,
		"bank_account_data": bank_account_data,
		"donation_type_data": donation_type_data,
		"donation_category_data": donation_category_data,
		"income_account_data": income_account_data,
		"weekday_data": weekday_data,
		"month_of_year_data": month_of_year_data,
		"donation_buckets": donation_buckets,
		"top_donors": top_donors,
		"recent_logs": recent_rows,
		"settings": {
			"donation_income_account": getattr(settings, "donation_income_account", None),
			"restricted_liability_account": getattr(settings, "restricted_liability_account", None),
			"bank_account": getattr(settings, "bank_account", None),
			"cash_account": getattr(settings, "cash_account", None),
			"default_cost_center": getattr(settings, "default_cost_center", None),
		},
	}
