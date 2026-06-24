import json

import frappe
from frappe import _
from frappe.utils import getdate


@frappe.whitelist()
def get_report_data(filters=None):
	"""Return Field Staff Visit report data grouped by section and user."""
	try:
		if isinstance(filters, str):
			filters = json.loads(filters)
		elif not filters:
			filters = {}

		from_date, to_date = _parse_dates(filters)
		user = (filters.get("user") or "").strip() or None
		section = (filters.get("section") or "").strip() or None

		marketing = _get_marketing_visits(from_date, to_date, user=user, section=section)
		me_visits = _get_me_visits(from_date, to_date, user=user, section=section)
		training = _get_training_sessions(from_date, to_date, user=user, section=section)

		return {
			"from_date": str(from_date),
			"to_date": str(to_date),
			"user": user,
			"section": section,
			"marketing": marketing,
			"me": me_visits,
			"training": training,
		}
	except Exception as e:
		frappe.log_error(f"Error in get_report_data: {str(e)}", "Field Staff Visit Report")
		return {"error": str(e)}


def _parse_dates(filters):
	from_date = filters.get("from_date")
	to_date = filters.get("to_date")

	if from_date:
		from_date = getdate(from_date)
	if to_date:
		to_date = getdate(to_date)

	if not from_date or not to_date:
		# Backward compatibility with month/year filters
		month = int(filters.get("month") or 0) or getdate().month
		year = int(filters.get("year") or 0) or getdate().year
		from frappe.utils import get_first_day, get_last_day

		from_date = get_first_day(f"{year}-{month:02d}-01")
		to_date = get_last_day(from_date)

	if from_date > to_date:
		frappe.throw(_("From Date cannot be after To Date."))

	return from_date, to_date


def _user_names(users):
	users = sorted({u for u in users if u})
	if not users:
		return {}
	rows = frappe.get_all("User", filters={"name": ["in", users]}, fields=["name", "full_name"])
	return {row.name: (row.full_name or row.name) for row in rows}


def _section_user_filters(user=None, section=None):
	conditions = []
	params = {}
	if user:
		conditions.append(
			"""(
				TRIM({user_expr}) = %(user)s
				OR u.name = %(user)s
				OR LOWER(TRIM(u.full_name)) = LOWER(%(user)s)
			)"""
		)
		params["user"] = user
	if section:
		conditions.append("COALESCE(e.department, 'Unassigned') = %(section)s")
		params["section"] = section
	return conditions, params


def _aggregate_section_user_rows(rows, metrics_fn):
	"""Group SQL rows by section + user and apply metrics_fn(bucket, row)."""
	buckets = {}
	for row in rows:
		section = row.get("section") or "Unassigned"
		user = row.get("user") or "Unassigned"
		key = (section, user)
		bucket = buckets.setdefault(
			key,
			{
				"section": section,
				"user": user,
				"user_name": user,
			},
		)
		metrics_fn(bucket, row)

	users = {bucket["user"] for bucket in buckets.values() if bucket["user"] not in ("Unassigned", "")}
	name_map = _user_names(users)
	for bucket in buckets.values():
		if bucket["user"] in name_map:
			bucket["user_name"] = name_map[bucket["user"]]

	result_rows = sorted(
		buckets.values(),
		key=lambda item: (item["section"].lower(), item["user_name"].lower()),
	)
	return result_rows


def _employee_join(user_expr):
	return f"""
		LEFT JOIN `tabUser` u ON (
			u.name = TRIM({user_expr})
			OR LOWER(TRIM(u.full_name)) = LOWER(TRIM({user_expr}))
		)
		LEFT JOIN `tabEmployee` e ON (
			e.user_id = u.name
			OR LOWER(TRIM(e.employee_name)) = LOWER(TRIM({user_expr}))
		)
	"""


def _get_marketing_visits(from_date, to_date, user=None, section=None):
	user_expr = "COALESCE(NULLIF(TRIM(fv.visit_by), ''), fv.owner)"
	extra_conditions, extra_params = _section_user_filters(user=user, section=section)
	extra_sql = ""
	if extra_conditions:
		extra_sql = " AND " + " AND ".join(c.replace("{user_expr}", user_expr) for c in extra_conditions)

	rows = frappe.db.sql(
		f"""
		SELECT
			COALESCE(e.department, 'Unassigned') AS section,
			{user_expr} AS user,
			COALESCE(fv.marketing_visit_category, 'Unspecified') AS category,
			COUNT(*) AS cnt
		FROM `tabField Visit` fv
		{_employee_join(user_expr)}
		WHERE fv.docstatus < 2
		AND fv.type = 'Marketing'
		AND COALESCE(fv.visit_date, DATE(fv.timestamp)) BETWEEN %(from_date)s AND %(to_date)s
		{extra_sql}
		GROUP BY COALESCE(e.department, 'Unassigned'), {user_expr}, COALESCE(fv.marketing_visit_category, 'Unspecified')
		""",
		{
			"from_date": from_date,
			"to_date": to_date,
			**extra_params,
		},
		as_dict=True,
	)

	def apply_metrics(bucket, row):
		bucket.setdefault("new", 0)
		bucket.setdefault("followup", 0)
		bucket.setdefault("tps", 0)
		category = row.get("category")
		cnt = row.get("cnt", 0)
		if category == "New":
			bucket["new"] += cnt
		elif category == "Followup & Other Visits":
			bucket["followup"] += cnt
		elif category == "TPS Visits":
			bucket["tps"] += cnt

	result_rows = _aggregate_section_user_rows(rows, apply_metrics)
	totals = {"new": 0, "followup": 0, "tps": 0, "total": 0}
	for row in result_rows:
		row["total"] = row.get("new", 0) + row.get("followup", 0) + row.get("tps", 0)
		totals["new"] += row.get("new", 0)
		totals["followup"] += row.get("followup", 0)
		totals["tps"] += row.get("tps", 0)
		totals["total"] += row.get("total", 0)

	return {"rows": result_rows, "totals": totals}


def _get_me_visits(from_date, to_date, user=None, section=None):
	user_expr = "COALESCE(NULLIF(TRIM(fv.me_visit_by), ''), fv.owner)"
	extra_conditions, extra_params = _section_user_filters(user=user, section=section)
	extra_sql = ""
	if extra_conditions:
		extra_sql = " AND " + " AND ".join(c.replace("{user_expr}", user_expr) for c in extra_conditions)

	rows = frappe.db.sql(
		f"""
		SELECT
			COALESCE(e.department, 'Unassigned') AS section,
			{user_expr} AS user,
			COALESCE(fv.me_activity_status, 'Unspecified') AS status,
			COUNT(*) AS cnt
		FROM `tabField Visit` fv
		{_employee_join(user_expr)}
		WHERE fv.docstatus < 2
		AND fv.type = 'M&E'
		AND COALESCE(fv.me_visit_date, fv.me_starting_date, DATE(fv.me_timestamp)) BETWEEN %(from_date)s AND %(to_date)s
		{extra_sql}
		GROUP BY COALESCE(e.department, 'Unassigned'), {user_expr}, COALESCE(fv.me_activity_status, 'Unspecified')
		""",
		{
			"from_date": from_date,
			"to_date": to_date,
			**extra_params,
		},
		as_dict=True,
	)

	def apply_metrics(bucket, row):
		bucket.setdefault("active", 0)
		bucket.setdefault("inactive", 0)
		status = row.get("status")
		cnt = row.get("cnt", 0)
		if status == "Active":
			bucket["active"] += cnt
		elif status == "Inactive":
			bucket["inactive"] += cnt

	result_rows = _aggregate_section_user_rows(rows, apply_metrics)
	totals = {"active": 0, "inactive": 0, "total": 0}
	for row in result_rows:
		row["total"] = row.get("active", 0) + row.get("inactive", 0)
		totals["active"] += row.get("active", 0)
		totals["inactive"] += row.get("inactive", 0)
		totals["total"] += row.get("total", 0)

	return {"rows": result_rows, "totals": totals}


def _get_training_sessions(from_date, to_date, user=None, section=None):
	user_expr = "COALESCE(NULLIF(TRIM(fv.training_entry_filled_by), ''), fv.owner)"
	extra_conditions, extra_params = _section_user_filters(user=user, section=section)
	extra_sql = ""
	if extra_conditions:
		extra_sql = " AND " + " AND ".join(c.replace("{user_expr}", user_expr) for c in extra_conditions)

	rows = frappe.db.sql(
		f"""
		SELECT
			COALESCE(e.department, 'Unassigned') AS section,
			{user_expr} AS user,
			COALESCE(SUM(fv.training_no_of_schools_attended), 0) AS schools,
			COALESCE(SUM(fv.training_no_of_participants), 0) AS participants
		FROM `tabField Visit` fv
		{_employee_join(user_expr)}
		WHERE fv.docstatus < 2
		AND fv.type = 'Training'
		AND COALESCE(fv.training_date, DATE(fv.training_timestamp)) BETWEEN %(from_date)s AND %(to_date)s
		{extra_sql}
		GROUP BY COALESCE(e.department, 'Unassigned'), {user_expr}
		""",
		{
			"from_date": from_date,
			"to_date": to_date,
			**extra_params,
		},
		as_dict=True,
	)

	def apply_metrics(bucket, row):
		bucket["schools"] = bucket.get("schools", 0) + row.get("schools", 0)
		bucket["participants"] = bucket.get("participants", 0) + row.get("participants", 0)

	result_rows = _aggregate_section_user_rows(rows, apply_metrics)
	totals = {"schools": 0, "participants": 0}
	for row in result_rows:
		totals["schools"] += row.get("schools", 0)
		totals["participants"] += row.get("participants", 0)

	return {"rows": result_rows, "totals": totals}
