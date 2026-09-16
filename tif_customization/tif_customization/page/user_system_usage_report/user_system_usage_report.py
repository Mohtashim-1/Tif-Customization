# Copyright (c) 2026, TIF Customization and contributors
# License: MIT
"""User System Usage — whole-ERP activity: logins, IPs, versions, files, reports, etc."""

from __future__ import annotations

import json
from collections import defaultdict
import frappe
from frappe import _
from frappe.utils import cint, flt, getdate, now_datetime, today

ALLOWED_ROLES = frozenset(
	{
		"System Manager",
		"HR Manager",
		"HR User",
		"HOD",
		"COO",
		"Field Staff Manager",
		"SME Manager",
	}
)

FIELD_STAFF_ROLES = frozenset(
	{
		"Field Staff",
		"SME User",
		"Supervisor Field Staff",
		"Field Staff Manager",
	}
)


def _parse_filters(filters):
	if isinstance(filters, str):
		filters = json.loads(filters)
	return filters or {}


def _require_access():
	if frappe.session.user == "Administrator":
		return
	if not ALLOWED_ROLES.intersection(frappe.get_roles()):
		frappe.throw(_("You are not permitted to view User System Usage Report."), frappe.PermissionError)


def _resolve_dates(filters):
	from_date = getdate(filters.get("from_date") or getdate(today()).replace(day=1))
	to_date = getdate(filters.get("to_date") or today())
	if from_date > to_date:
		from_date, to_date = to_date, from_date
	return from_date, to_date


def _login_on_user_record_in_period(last_login, from_date, to_date) -> int:
	if not last_login:
		return 0
	try:
		ld = getdate(last_login)
	except Exception:
		return 0
	return 1 if from_date <= ld <= to_date else 0


def _format_minutes(minutes) -> str:
	m = cint(minutes or 0)
	if m <= 0:
		return "0m"
	h, rem = divmod(m, 60)
	if h:
		return f"{h}h {rem}m"
	return f"{m}m"


def _session_minutes_from_activity_log(user_ids, from_date, to_date) -> dict[str, int]:
	if not user_ids:
		return {}
	rows = frappe.db.sql(
		"""
		SELECT user, creation, operation
		FROM `tabActivity Log`
		WHERE user IN %(users)s
		AND operation IN ('Login', 'Logout')
		AND status = 'Success'
		AND DATE(creation) BETWEEN %(from_date)s AND %(to_date)s
		ORDER BY user, creation
		""",
		{"users": tuple(user_ids), "from_date": from_date, "to_date": to_date},
		as_dict=True,
	)
	by_user: dict[str, list] = defaultdict(list)
	for row in rows:
		by_user[row.user].append(row)

	out: dict[str, int] = {}
	now = now_datetime()
	for user, events in by_user.items():
		minutes = 0.0
		login_at = None
		for ev in events:
			if ev.operation == "Login":
				login_at = ev.creation
			elif ev.operation == "Logout" and login_at:
				minutes += max(0, (ev.creation - login_at).total_seconds() / 60)
				login_at = None
		if login_at:
			minutes += min(240, max(0, (now - login_at).total_seconds() / 60))
		out[user] = cint(minutes)
	return out


def _session_minutes_from_versions(user_ids, from_date, to_date) -> dict[str, int]:
	if not user_ids:
		return {}
	rows = frappe.db.sql(
		"""
		SELECT owner AS user, DATE(creation) AS day,
			MIN(creation) AS t0, MAX(creation) AS t1, COUNT(*) AS n
		FROM `tabVersion`
		WHERE owner IN %(users)s
		AND DATE(creation) BETWEEN %(from_date)s AND %(to_date)s
		GROUP BY owner, DATE(creation)
		""",
		{"users": tuple(user_ids), "from_date": from_date, "to_date": to_date},
		as_dict=True,
	)
	out: dict[str, int] = defaultdict(int)
	for row in rows:
		if row.t0 and row.t1:
			span = max(0, (row.t1 - row.t0).total_seconds() / 60)
		else:
			span = 0
		out[row.user] += cint(min(480, max(10, span + cint(row.n) * 0.5)))
	return dict(out)


def _days_since(dt) -> int | None:
	if not dt:
		return None
	try:
		return (getdate(today()) - getdate(dt)).days
	except Exception:
		return None


ACTIVITY_METRIC_KEYS = (
	"login_count",
	"doc_changes",
	"documents_created",
	"unique_documents",
	"doctypes_touched",
	"files_uploaded",
	"comments",
	"reports_run",
	"prints_pdf",
	"exports",
	"communications",
	"expense_claims",
	"todos_completed",
	"field_visits_submitted",
	"erp_minutes_est",
)


def _has_period_activity(row: dict) -> bool:
	return any(cint(row.get(k) or 0) for k in ACTIVITY_METRIC_KEYS)


def _engagement_score(row: dict) -> float:
	"""Weighted for general ERP use (Field Visit is a small part)."""
	return flt(
		cint(row.get("login_count") or 0) * 5
		+ min(cint(row.get("doc_changes") or 0), 400) * 0.75
		+ cint(row.get("doctypes_touched") or 0) * 4
		+ cint(row.get("files_uploaded") or 0) * 2
		+ cint(row.get("comments") or 0) * 0.5
		+ cint(row.get("reports_run") or 0) * 3
		+ cint(row.get("exports") or 0) * 2
		+ cint(row.get("communications") or 0) * 0.4
		+ cint(row.get("expense_claims") or 0) * 3
		+ cint(row.get("todos_completed") or 0) * 1.5
		+ cint(row.get("field_visits_submitted") or 0) * 1,
		1,
	)


def _usage_band(row: dict, score: float) -> str:
	if not cint(row.get("enabled")):
		return "Disabled"
	login_count = cint(row.get("login_count") or 0)
	doc_changes = cint(row.get("doc_changes") or 0)
	idle_days = row.get("days_since_active")

	if not _has_period_activity(row):
		if idle_days is not None and idle_days > 45:
			return "Dormant"
		return "Inactive"

	if score >= 80 or login_count >= 8 or doc_changes >= 100 or cint(row.get("doctypes_touched") or 0) >= 12:
		return "High"
	if score >= 25 or login_count >= 2 or doc_changes >= 20 or cint(row.get("doctypes_touched") or 0) >= 4:
		return "Medium"
	return "Low"


@frappe.whitelist()
def get_report_data(filters=None):
	try:
		return _build_report_data(filters)
	except Exception:
		frappe.log_error(title="User System Usage Report")
		frappe.throw(_("Could not load User System Usage Report. Check Error Log for details."))


def _build_report_data(filters=None):
	_require_access()
	filters = _parse_filters(filters)
	from_date, to_date = _resolve_dates(filters)

	department = (filters.get("department") or "").strip()
	role_filter = (filters.get("role") or "").strip()
	user_filter = (filters.get("user") or "").strip()
	status = (filters.get("status") or "Enabled").strip()
	usage_band = (filters.get("usage_band") or "").strip()
	field_staff_only = cint(filters.get("field_staff_only") or 0)
	user_type = (filters.get("user_type") or "All ERP users").strip()
	activity_only = cint(filters.get("activity_only") or 0)

	users = _load_users(
		status=status,
		user_filter=user_filter,
		department=department,
		role_filter=role_filter,
		field_staff_only=field_staff_only,
		user_type=user_type,
	)
	# Do not pull in every active user when a narrow filter is applied.
	if not (user_filter or department or role_filter or field_staff_only):
		users = _merge_users_with_period_activity(users, from_date, to_date, user_type=user_type)
	if not users:
		return _empty_payload(from_date, to_date)

	user_ids = [u["user"] for u in users]
	metrics = _aggregate_metrics(user_ids, from_date, to_date)
	roles = _user_roles(user_ids)

	rows = []
	for u in users:
		uid = u["user"]
		m = metrics.get(uid) or {}
		last_ip = (m.get("last_login_ip") or m.get("last_login_ip_ever") or "").strip()
		login_activity = cint(m.get("login_count") or 0)
		login_user_rec = _login_on_user_record_in_period(u.get("last_login"), from_date, to_date)
		erp_mins = cint(m.get("erp_minutes_est") or 0)
		erp_source = m.get("erp_minutes_source") or ""
		row = {
			**u,
			"roles": ", ".join(roles.get(uid) or []),
			"role_list": roles.get(uid) or [],
			"login_count": login_activity,
			"login_count_activity_log": login_activity,
			"login_on_user_record": login_user_rec,
			"failed_logins": cint(m.get("failed_logins") or 0),
			"last_login_ip": last_ip,
			"last_login_ip_period": (m.get("last_login_ip") or "").strip(),
			"ip_available": 1 if last_ip else 0,
			"distinct_ips": cint(m.get("distinct_ips") or 0),
			"doc_changes": cint(m.get("doc_changes") or 0),
			"documents_created": cint(m.get("documents_created") or 0),
			"unique_documents": cint(m.get("unique_documents") or 0),
			"doctypes_touched": cint(m.get("doctypes_touched") or 0),
			"prints_pdf": cint(m.get("prints_pdf") or 0),
			"active_days": cint(m.get("active_days") or 0),
			"erp_minutes_est": erp_mins,
			"erp_time_label": _format_minutes(erp_mins),
			"erp_minutes_source": erp_source,
			"files_uploaded": cint(m.get("files_uploaded") or 0),
			"comments": cint(m.get("comments") or 0),
			"reports_run": cint(m.get("reports_run") or 0),
			"field_visits_submitted": cint(m.get("field_visits_submitted") or 0),
			"field_visits_created": cint(m.get("field_visits_created") or 0),
			"communications": cint(m.get("communications") or 0),
			"exports": cint(m.get("exports") or 0),
			"expense_claims": cint(m.get("expense_claims") or 0),
			"todos_completed": cint(m.get("todos_completed") or 0),
			"last_login_in_period": m.get("last_login_in_period"),
			"days_since_active": _days_since(u.get("last_active")),
			"days_since_login": _days_since(u.get("last_login")),
		}
		row["engagement_score"] = _engagement_score(row)
		row["usage_band"] = _usage_band(row, row["engagement_score"])
		rows.append(row)

	if user_filter:
		rows = [r for r in rows if r.get("user") == user_filter]

	if activity_only:
		rows = [r for r in rows if _has_period_activity(r)]

	if usage_band:
		rows = [r for r in rows if r.get("usage_band") == usage_band]

	if department:
		rows = [r for r in rows if (r.get("department") or "").strip() == department]

	if role_filter:
		rows = [
			r
			for r in rows
			if role_filter in (r.get("role_list") or [])
		]

	if field_staff_only:
		rows = [
			r
			for r in rows
			if FIELD_STAFF_ROLES.intersection(r.get("role_list") or [])
		]

	rows.sort(
		key=lambda r: (
			-r.get("engagement_score", 0),
			-r.get("login_count", 0),
			r.get("full_name") or r.get("user") or "",
		)
	)

	kpis = _summary_kpis(rows)
	return {
		"from_date": str(from_date),
		"to_date": str(to_date),
		"rows": rows,
		"kpis": kpis,
		"usage_bands": ["High", "Medium", "Low", "Inactive", "Dormant", "Disabled"],
		"data_notes": {
			"login_ip": _(
				"Logins and IP come from Activity Log. User.last_login updates on every login even when Activity Log rows were cleared or never kept—then Logins may show 0 while Last login still shows a date."
			),
			"erp_time": _(
				"Est. ERP time uses Login→Logout from Activity Log when available; otherwise estimated from document activity spread per day (not exact screen time)."
			),
			"documents_created": _(
				"Documents created = first Version record for that document in the period (new records across all modules)."
			),
			"prints_pdf": _("Print/PDF downloads from Access Log (PDF file type)."),
		},
	}


def _empty_payload(from_date, to_date):
	return {
		"from_date": str(from_date),
		"to_date": str(to_date),
		"rows": [],
		"kpis": {
			"users": 0,
			"active_users": 0,
			"high_usage": 0,
			"low_or_inactive": 0,
			"total_logins": 0,
			"total_doc_changes": 0,
			"total_doctypes_touched": 0,
			"total_files": 0,
			"avg_engagement": 0,
		},
		"usage_bands": [],
	}


def _summary_kpis(rows):
	if not rows:
		return _empty_payload(today(), today())["kpis"]

	active = sum(1 for r in rows if _has_period_activity(r))
	low_or_inactive = sum(1 for r in rows if r.get("usage_band") in ("Low", "Inactive", "Dormant"))
	high = sum(1 for r in rows if r.get("usage_band") == "High")
	scores = [flt(r.get("engagement_score") or 0) for r in rows]

	return {
		"users": len(rows),
		"active_users": active,
		"high_usage": high,
		"low_or_inactive": low_or_inactive,
		"total_logins": sum(cint(r.get("login_count") or 0) for r in rows),
		"total_doc_changes": sum(cint(r.get("doc_changes") or 0) for r in rows),
		"total_doctypes_touched": sum(cint(r.get("doctypes_touched") or 0) for r in rows),
		"total_files": sum(cint(r.get("files_uploaded") or 0) for r in rows),
		"total_documents_created": sum(cint(r.get("documents_created") or 0) for r in rows),
		"total_prints_pdf": sum(cint(r.get("prints_pdf") or 0) for r in rows),
		"total_erp_minutes": sum(cint(r.get("erp_minutes_est") or 0) for r in rows),
		"avg_engagement": flt(sum(scores) / len(scores), 1) if scores else 0,
	}


def _user_type_clause(user_type: str) -> list[str]:
	if user_type == "System User":
		return ["u.user_type = 'System User'"]
	if user_type == "Website User":
		return ["u.user_type = 'Website User'"]
	return ["u.user_type IN ('System User', 'Website User')"]


def _user_type_sql(user_type: str, alias: str = "u") -> str:
	clauses = _user_type_clause(user_type)
	return " AND ".join(c.replace("u.", f"{alias}.") for c in clauses)


def _load_users(
	*,
	status,
	user_filter,
	department,
	role_filter,
	field_staff_only,
	user_type="All ERP users",
):
	params = {}
	where = ["u.name NOT IN ('Guest', 'Administrator')", *_user_type_clause(user_type)]

	if status == "Enabled":
		where.append("u.enabled = 1")
	elif status == "Disabled":
		where.append("u.enabled = 0")
	# "All" — no enabled filter

	if user_filter:
		where.append("u.name = %(user)s")
		params["user"] = user_filter

	if department:
		where.append(
			"""EXISTS (
				SELECT 1 FROM `tabEmployee` e2
				WHERE e2.user_id = u.name AND e2.status = 'Active' AND e2.department = %(department)s
			)"""
		)
		params["department"] = department

	if role_filter:
		where.append(
			"""EXISTS (
				SELECT 1 FROM `tabHas Role` hr
				WHERE hr.parent = u.name AND hr.parenttype = 'User' AND hr.role = %(role)s
			)"""
		)
		params["role"] = role_filter

	sql = f"""
		SELECT
			u.name AS user,
			u.full_name,
			u.email,
			u.user_type,
			u.enabled,
			u.last_login,
			u.last_active,
			e.name AS employee,
			e.employee_name,
			e.department,
			e.designation,
			e.status AS employee_status
		FROM `tabUser` u
		LEFT JOIN `tabEmployee` e ON e.user_id = u.name AND e.status = 'Active'
		WHERE {" AND ".join(where)}
		ORDER BY u.full_name, u.name
	"""
	rows = frappe.db.sql(sql, params, as_dict=True)

	if field_staff_only:
		role_map = _user_roles([r.user for r in rows])
		rows = [
			r
			for r in rows
			if FIELD_STAFF_ROLES.intersection(role_map.get(r.user) or [])
		]

	return rows


def _merge_users_with_period_activity(users, from_date, to_date, user_type="All ERP users"):
	"""Include anyone who used ERP in the period (even if disabled / no employee row)."""
	existing = {u["user"] for u in users}
	type_sql = _user_type_sql(user_type, "usr")

	active_ids = frappe.db.sql(
		f"""
		SELECT DISTINCT uid FROM (
			SELECT user AS uid FROM `tabActivity Log`
			WHERE user IS NOT NULL AND user != ''
			AND DATE(creation) BETWEEN %(from_date)s AND %(to_date)s
			UNION
			SELECT owner AS uid FROM `tabVersion`
			WHERE owner IS NOT NULL AND owner != ''
			AND DATE(creation) BETWEEN %(from_date)s AND %(to_date)s
			UNION
			SELECT owner AS uid FROM `tabFile`
			WHERE owner IS NOT NULL AND owner != ''
			AND DATE(creation) BETWEEN %(from_date)s AND %(to_date)s
			UNION
			SELECT comment_by AS uid FROM `tabComment`
			WHERE comment_by IS NOT NULL AND comment_by != ''
			AND DATE(creation) BETWEEN %(from_date)s AND %(to_date)s
		) x
		WHERE uid NOT IN ('Guest', 'Administrator')
		""",
		{"from_date": from_date, "to_date": to_date},
		as_dict=False,
	)
	missing = [row[0] for row in active_ids if row[0] not in existing]
	if not missing:
		return users

	extra = []
	chunk_size = 400
	for i in range(0, len(missing), chunk_size):
		chunk = missing[i : i + chunk_size]
		extra.extend(
			frappe.db.sql(
				f"""
				SELECT
					usr.name AS user,
					usr.full_name,
					usr.email,
					usr.enabled,
					usr.last_login,
					usr.last_active,
					usr.user_type,
					e.name AS employee,
					e.employee_name,
					e.department,
					e.designation,
					e.status AS employee_status
				FROM `tabUser` usr
				LEFT JOIN `tabEmployee` e ON e.user_id = usr.name AND e.status = 'Active'
				WHERE usr.name IN %(missing)s
				AND {type_sql}
				ORDER BY usr.full_name, usr.name
				""",
				{"missing": tuple(chunk)},
				as_dict=True,
			)
		)
	return users + extra


def _user_roles(user_ids):
	if not user_ids:
		return {}
	out = defaultdict(list)
	for i in range(0, len(user_ids), 400):
		chunk = user_ids[i : i + 400]
		for r in frappe.db.sql(
			"""
			SELECT parent, role
			FROM `tabHas Role`
			WHERE parenttype = 'User' AND parent IN %(users)s
			ORDER BY role
			""",
			{"users": tuple(chunk)},
			as_dict=True,
		):
			out[r.parent].append(r.role)
	return out


def _aggregate_metrics(user_ids, from_date, to_date):
	if not user_ids:
		return {}

	out = {u: defaultdict(int) for u in user_ids}
	tuple_users = tuple(user_ids)
	date_args = {"from_date": from_date, "to_date": to_date, "users": tuple_users}

	for r in frappe.db.sql(
		"""
		SELECT user, COUNT(*) AS cnt, MAX(creation) AS last_login
		FROM `tabActivity Log`
		WHERE user IN %(users)s
		AND operation = 'Login' AND status = 'Success'
		AND DATE(creation) BETWEEN %(from_date)s AND %(to_date)s
		GROUP BY user
		""",
		date_args,
		as_dict=True,
	):
		out[r.user]["login_count"] = cint(r.cnt)
		out[r.user]["last_login_in_period"] = str(r.last_login) if r.last_login else None

	for r in frappe.db.sql(
		"""
		SELECT al.user, al.ip_address
		FROM `tabActivity Log` al
		INNER JOIN (
			SELECT user, MAX(creation) AS max_ts
			FROM `tabActivity Log`
			WHERE user IN %(users)s
			AND operation = 'Login' AND status = 'Success'
			AND DATE(creation) BETWEEN %(from_date)s AND %(to_date)s
			GROUP BY user
		) latest ON latest.user = al.user AND latest.max_ts = al.creation
		WHERE al.operation = 'Login' AND al.status = 'Success'
		""",
		date_args,
		as_dict=True,
	):
		out[r.user]["last_login_ip"] = (r.ip_address or "").strip()

	for r in frappe.db.sql(
		"""
		SELECT al.user, al.ip_address
		FROM `tabActivity Log` al
		INNER JOIN (
			SELECT user, MAX(creation) AS max_ts
			FROM `tabActivity Log`
			WHERE user IN %(users)s
			AND operation = 'Login' AND status = 'Success'
			GROUP BY user
		) latest ON latest.user = al.user AND latest.max_ts = al.creation
		WHERE al.operation = 'Login' AND al.status = 'Success'
		""",
		{"users": tuple_users},
		as_dict=True,
	):
		if not out[r.user].get("last_login_ip"):
			out[r.user]["last_login_ip_ever"] = (r.ip_address or "").strip()

	for r in frappe.db.sql(
		"""
		SELECT user, COUNT(DISTINCT ip_address) AS cnt
		FROM `tabActivity Log`
		WHERE user IN %(users)s
		AND operation = 'Login' AND status = 'Success'
		AND DATE(creation) BETWEEN %(from_date)s AND %(to_date)s
		AND ip_address IS NOT NULL AND ip_address != ''
		GROUP BY user
		""",
		date_args,
		as_dict=True,
	):
		out[r.user]["distinct_ips"] = cint(r.cnt)

	for r in frappe.db.sql(
		"""
		SELECT user, COUNT(*) AS cnt
		FROM `tabActivity Log`
		WHERE user IN %(users)s
		AND operation = 'Login' AND status = 'Failed'
		AND DATE(creation) BETWEEN %(from_date)s AND %(to_date)s
		GROUP BY user
		""",
		date_args,
		as_dict=True,
	):
		out[r.user]["failed_logins"] = cint(r.cnt)

	for r in frappe.db.sql(
		"""
		SELECT owner AS user, COUNT(*) AS cnt
		FROM `tabVersion`
		WHERE owner IN %(users)s
		AND DATE(creation) BETWEEN %(from_date)s AND %(to_date)s
		GROUP BY owner
		""",
		date_args,
		as_dict=True,
	):
		out[r.user]["doc_changes"] = cint(r.cnt)

	for r in frappe.db.sql(
		"""
		SELECT owner AS user, COUNT(DISTINCT ref_doctype) AS cnt
		FROM `tabVersion`
		WHERE owner IN %(users)s
		AND DATE(creation) BETWEEN %(from_date)s AND %(to_date)s
		AND ref_doctype IS NOT NULL AND ref_doctype != ''
		GROUP BY owner
		""",
		date_args,
		as_dict=True,
	):
		out[r.user]["doctypes_touched"] = cint(r.cnt)

	for r in frappe.db.sql(
		"""
		SELECT owner AS user, COUNT(*) AS cnt
		FROM `tabFile`
		WHERE owner IN %(users)s
		AND DATE(creation) BETWEEN %(from_date)s AND %(to_date)s
		GROUP BY owner
		""",
		date_args,
		as_dict=True,
	):
		out[r.user]["files_uploaded"] = cint(r.cnt)

	for r in frappe.db.sql(
		"""
		SELECT comment_by AS user, COUNT(*) AS cnt
		FROM `tabComment`
		WHERE comment_by IN %(users)s
		AND DATE(creation) BETWEEN %(from_date)s AND %(to_date)s
		GROUP BY comment_by
		""",
		date_args,
		as_dict=True,
	):
		out[r.user]["comments"] = cint(r.cnt)

	for r in frappe.db.sql(
		"""
		SELECT owner AS user,
			SUM(docstatus = 1) AS submitted,
			COUNT(*) AS created
		FROM `tabField Visit`
		WHERE owner IN %(users)s
		AND DATE(creation) BETWEEN %(from_date)s AND %(to_date)s
		GROUP BY owner
		""",
		date_args,
		as_dict=True,
	):
		out[r.user]["field_visits_submitted"] = cint(r.submitted)
		out[r.user]["field_visits_created"] = cint(r.created)

	for r in frappe.db.sql(
		"""
		SELECT owner AS user, COUNT(*) AS cnt
		FROM `tabCommunication`
		WHERE owner IN %(users)s
		AND DATE(creation) BETWEEN %(from_date)s AND %(to_date)s
		GROUP BY owner
		""",
		date_args,
		as_dict=True,
	):
		out[r.user]["communications"] = cint(r.cnt)

	if frappe.db.table_exists("Access Log"):
		for r in frappe.db.sql(
			"""
			SELECT user, COUNT(*) AS cnt
			FROM `tabAccess Log`
			WHERE user IN %(users)s
			AND DATE(creation) BETWEEN %(from_date)s AND %(to_date)s
			GROUP BY user
			""",
			date_args,
			as_dict=True,
		):
			out[r.user]["exports"] = cint(r.cnt)

		for r in frappe.db.sql(
			"""
			SELECT user, COUNT(*) AS cnt
			FROM `tabAccess Log`
			WHERE user IN %(users)s
			AND DATE(creation) BETWEEN %(from_date)s AND %(to_date)s
			AND report_name IS NOT NULL AND report_name != ''
			GROUP BY user
			""",
			date_args,
			as_dict=True,
		):
			out[r.user]["reports_run"] = cint(r.cnt)

	for r in frappe.db.sql(
		"""
		SELECT owner AS user, COUNT(*) AS cnt
		FROM `tabExpense Claim`
		WHERE owner IN %(users)s
		AND docstatus = 1
		AND DATE(creation) BETWEEN %(from_date)s AND %(to_date)s
		GROUP BY owner
		""",
		date_args,
		as_dict=True,
	):
		out[r.user]["expense_claims"] = cint(r.cnt)

	for r in frappe.db.sql(
		"""
		SELECT allocated_to AS user, COUNT(*) AS cnt
		FROM `tabToDo`
		WHERE allocated_to IN %(users)s
		AND status = 'Closed'
		AND DATE(modified) BETWEEN %(from_date)s AND %(to_date)s
		GROUP BY allocated_to
		""",
		date_args,
		as_dict=True,
	):
		out[r.user]["todos_completed"] = cint(r.cnt)

	for r in frappe.db.sql(
		"""
		SELECT owner AS user,
			COUNT(DISTINCT CONCAT(COALESCE(ref_doctype, ''), '|', COALESCE(docname, ''))) AS cnt
		FROM `tabVersion`
		WHERE owner IN %(users)s
		AND DATE(creation) BETWEEN %(from_date)s AND %(to_date)s
		GROUP BY owner
		""",
		date_args,
		as_dict=True,
	):
		out[r.user]["unique_documents"] = cint(r.cnt)

	for r in frappe.db.sql(
		"""
		SELECT v.owner AS user, COUNT(*) AS cnt
		FROM `tabVersion` v
		INNER JOIN (
			SELECT ref_doctype, docname, MIN(creation) AS first_c
			FROM `tabVersion`
			GROUP BY ref_doctype, docname
		) first_v
			ON first_v.ref_doctype = v.ref_doctype
			AND first_v.docname = v.docname
			AND first_v.first_c = v.creation
		WHERE v.owner IN %(users)s
		AND DATE(v.creation) BETWEEN %(from_date)s AND %(to_date)s
		GROUP BY v.owner
		""",
		date_args,
		as_dict=True,
	):
		out[r.user]["documents_created"] = cint(r.cnt)

	for r in frappe.db.sql(
		"""
		SELECT owner AS user, COUNT(DISTINCT DATE(creation)) AS cnt
		FROM `tabVersion`
		WHERE owner IN %(users)s
		AND DATE(creation) BETWEEN %(from_date)s AND %(to_date)s
		GROUP BY owner
		""",
		date_args,
		as_dict=True,
	):
		out[r.user]["active_days"] = cint(r.cnt)

	if frappe.db.table_exists("Access Log"):
		for r in frappe.db.sql(
			"""
			SELECT user, COUNT(*) AS cnt
			FROM `tabAccess Log`
			WHERE user IN %(users)s
			AND DATE(creation) BETWEEN %(from_date)s AND %(to_date)s
			AND UPPER(COALESCE(file_type, '')) = 'PDF'
			GROUP BY user
			""",
			date_args,
			as_dict=True,
		):
			out[r.user]["prints_pdf"] = cint(r.cnt)

	session_mins = _session_minutes_from_activity_log(user_ids, from_date, to_date)
	version_mins = _session_minutes_from_versions(user_ids, from_date, to_date)
	for uid in user_ids:
		if session_mins.get(uid):
			out[uid]["erp_minutes_est"] = session_mins[uid]
			out[uid]["erp_minutes_source"] = "activity_log"
		elif version_mins.get(uid):
			out[uid]["erp_minutes_est"] = version_mins[uid]
			out[uid]["erp_minutes_source"] = "version_estimate"

	return {k: dict(v) for k, v in out.items()}


@frappe.whitelist()
def get_user_detail(user=None, from_date=None, to_date=None):
	"""Breakdown for one user: top doctypes changed, recent logins."""
	_require_access()
	user = (user or "").strip()
	if not user:
		frappe.throw(_("User is required."))

	from_date = getdate(from_date or today().replace(day=1))
	to_date = getdate(to_date or today())
	if from_date > to_date:
		from_date, to_date = to_date, from_date

	doctypes = frappe.db.sql(
		"""
		SELECT ref_doctype AS doctype, COUNT(*) AS changes
		FROM `tabVersion`
		WHERE owner = %(user)s
		AND DATE(creation) BETWEEN %(from_date)s AND %(to_date)s
		AND ref_doctype IS NOT NULL AND ref_doctype != ''
		GROUP BY ref_doctype
		ORDER BY changes DESC
		LIMIT 25
		""",
		{"user": user, "from_date": from_date, "to_date": to_date},
		as_dict=True,
	)

	logins = frappe.db.sql(
		"""
		SELECT creation, ip_address, status
		FROM `tabActivity Log`
		WHERE user = %(user)s
		AND operation = 'Login'
		AND DATE(creation) BETWEEN %(from_date)s AND %(to_date)s
		ORDER BY creation DESC
		LIMIT 20
		""",
		{"user": user, "from_date": from_date, "to_date": to_date},
		as_dict=True,
	)
	for row in logins:
		row["creation"] = str(row.creation) if row.creation else ""

	user_row = frappe.db.get_value(
		"User",
		user,
		["full_name", "last_login", "last_active"],
		as_dict=True,
	)
	metrics = _aggregate_metrics([user], from_date, to_date).get(user) or {}
	session_mins = _session_minutes_from_activity_log([user], from_date, to_date)
	version_mins = _session_minutes_from_versions([user], from_date, to_date)
	erp_mins = session_mins.get(user) or version_mins.get(user) or 0
	erp_source = "activity_log" if session_mins.get(user) else "version_estimate"

	return {
		"user": user,
		"from_date": str(from_date),
		"to_date": str(to_date),
		"user_profile": user_row,
		"summary": {
			"login_count_activity_log": cint(metrics.get("login_count") or 0),
			"login_on_user_record": _login_on_user_record_in_period(
				user_row.get("last_login") if user_row else None, from_date, to_date
			),
			"last_login_ip": (metrics.get("last_login_ip") or metrics.get("last_login_ip_ever") or ""),
			"doc_changes": cint(metrics.get("doc_changes") or 0),
			"documents_created": cint(metrics.get("documents_created") or 0),
			"unique_documents": cint(metrics.get("unique_documents") or 0),
			"prints_pdf": cint(metrics.get("prints_pdf") or 0),
			"erp_minutes_est": cint(erp_mins),
			"erp_time_label": _format_minutes(erp_mins),
			"erp_minutes_source": erp_source,
		},
		"doctypes": doctypes,
		"logins": logins,
		"notes": {
			"login_ip": _(
				"If Logins = 0 but Last login shows a date, Activity Log login rows are missing (cleared or disabled). IP is only stored in Activity Log."
			),
		},
	}
