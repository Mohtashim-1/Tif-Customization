# Copyright (c) 2026, mohtashim and contributors
# For license information, please see license.txt

from collections import Counter, defaultdict

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint, flt, getdate


class Reporting(Document):
	pass


def _can_view_all_reports():
	user_roles = set(frappe.get_roles(frappe.session.user))
	return bool(user_roles & {"System Manager", "COO", "Staff Reporting Manager"})


def _resolved_reported_by_sql():
	return """CASE
		WHEN r.reported_by = 'frappe.session.user' OR IFNULL(r.reported_by, '') = '' THEN r.owner
		ELSE r.reported_by
	END"""


def _get_user_department_map(users):
	users = sorted({u for u in users if u})
	if not users:
		return {}

	rows = frappe.db.sql(
		"""
		SELECT e.user_id AS user, e.department
		FROM `tabEmployee` e
		WHERE e.user_id IN %(users)s
			AND IFNULL(e.user_id, '') != ''
		""",
		{"users": users},
		as_dict=True,
	)
	return {row.user: (row.department or _("Unassigned")) for row in rows}


def _get_users_for_section(section):
	if not section:
		return []
	return frappe.get_all(
		"Employee",
		filters={"department": section, "user_id": ["is", "set"]},
		pluck="user_id",
	)


def _build_section_users_wise(rows):
	users = {row.get("reported_by") for row in rows if row.get("reported_by")}
	user_names = {
		u.name: (u.full_name or u.name)
		for u in frappe.get_all("User", filters={"name": ["in", list(users)]}, fields=["name", "full_name"])
	} if users else {}
	department_map = _get_user_department_map(users)

	user_stats = {}
	for row in rows:
		user = row.get("reported_by")
		if not user:
			continue
		stats = user_stats.setdefault(
			user,
			{
				"user": user,
				"user_name": user_names.get(user) or user,
				"section": department_map.get(user, _("Unassigned")),
				"report_names": set(),
				"total_tasks": 0,
				"completed_tasks": 0,
			},
		)
		stats["report_names"].add(row.get("name"))
		if row.get("task_status"):
			stats["total_tasks"] += 1
			if row.get("task_status") == "Done":
				stats["completed_tasks"] += 1

	sections = {}
	for stats in user_stats.values():
		section = stats["section"]
		section_data = sections.setdefault(
			section,
			{"section": section, "total_reports": 0, "total_tasks": 0, "users": []},
		)
		user_row = {
			"user": stats["user"],
			"user_name": stats["user_name"],
			"total_reports": len(stats["report_names"]),
			"total_tasks": stats["total_tasks"],
			"completed_tasks": stats["completed_tasks"],
		}
		section_data["users"].append(user_row)
		section_data["total_reports"] += user_row["total_reports"]
		section_data["total_tasks"] += user_row["total_tasks"]

	section_list = []
	for section_data in sections.values():
		section_data["users"] = sorted(
			section_data["users"],
			key=lambda item: (-item["total_reports"], item["user_name"].lower()),
		)
		section_data["active_users"] = len(section_data["users"])
		section_list.append(section_data)

	return sorted(section_list, key=lambda item: (-item["total_reports"], item["section"].lower()))


@frappe.whitelist()
def get_reporting_dashboard_data(
	from_date=None, to_date=None, employee=None, section=None, status=None, work_type=None
):
	if not frappe.has_permission("Reporting", "read"):
		frappe.throw(_("You are not permitted to view Reporting data."))

	if from_date:
		from_date = getdate(from_date)
	if to_date:
		to_date = getdate(to_date)
	if from_date and to_date and from_date > to_date:
		frappe.throw(_("From Date cannot be after To Date."))

	can_view_all = _can_view_all_reports()
	if not can_view_all:
		employee = frappe.session.user

	conditions = ["r.docstatus < 2"]
	params = {}

	if from_date:
		conditions.append("r.posting_date >= %(from_date)s")
		params["from_date"] = from_date
	if to_date:
		conditions.append("r.posting_date <= %(to_date)s")
		params["to_date"] = to_date
	if employee:
		conditions.append(
			"""(
				r.reported_by = %(employee)s
				OR (
					(r.reported_by = 'frappe.session.user' OR IFNULL(r.reported_by, '') = '')
					AND r.owner = %(employee)s
				)
			)"""
		)
		params["employee"] = employee
	if status:
		conditions.append("sr.status = %(status)s")
		params["status"] = status
	if work_type:
		conditions.append("sr.work_type = %(work_type)s")
		params["work_type"] = work_type
	if section:
		section_users = _get_users_for_section(section)
		if not section_users:
			return {
				"can_view_all": can_view_all,
				"rows": [],
				"kpis": {
					"total_reports": 0,
					"total_tasks": 0,
					"completed_tasks": 0,
					"completion_rate": 0,
					"active_employees": 0,
				},
				"charts": {
					"status": {"labels": [], "values": []},
					"work_type": {"labels": [], "values": []},
					"daily_trend": {"labels": [], "values": []},
				},
				"section_users_wise": [],
			}
		conditions.append(f"{_resolved_reported_by_sql()} IN %(section_users)s")
		params["section_users"] = tuple(section_users)

	reported_by_sql = _resolved_reported_by_sql()
	condition_sql = " AND ".join(conditions)
	data = frappe.db.sql(
		f"""
		SELECT
			r.name,
			r.posting_date,
			r.posting_time,
			{reported_by_sql} AS reported_by,
			r.description,
			r.docstatus,
			sr.work_type,
			sr.activity,
			sr.status AS task_status,
			sr.start_time,
			sr.end_time
		FROM `tabReporting` r
		LEFT JOIN `tabReporting Staff Report` sr
			ON sr.parent = r.name
			AND sr.parenttype = 'Reporting'
		WHERE {condition_sql}
		ORDER BY r.posting_date DESC, r.posting_time DESC, r.modified DESC
		LIMIT 500
		""",
		params,
		as_dict=True,
	)

	report_names = set()
	employees = set()
	status_counter = Counter()
	work_type_counter = Counter()
	date_counter = defaultdict(int)
	total_tasks = 0
	completed_tasks = 0

	for row in data:
		report_names.add(row.name)
		if row.reported_by:
			employees.add(row.reported_by)
		if row.task_status:
			total_tasks += 1
			status_counter[row.task_status] += 1
			if row.task_status == "Done":
				completed_tasks += 1
		if row.work_type:
			work_type_counter[row.work_type] += 1
		if row.posting_date:
			date_counter[str(row.posting_date)] += 1

	trend_dates = sorted(date_counter.keys())
	trend_counts = [date_counter[d] for d in trend_dates]
	completion_rate = flt((completed_tasks / total_tasks) * 100, 2) if total_tasks else 0
	section_users_wise = _build_section_users_wise(data)

	return {
		"can_view_all": can_view_all,
		"rows": data,
		"section_users_wise": section_users_wise,
		"kpis": {
			"total_reports": cint(len(report_names)),
			"total_tasks": cint(total_tasks),
			"completed_tasks": cint(completed_tasks),
			"completion_rate": completion_rate,
			"active_employees": cint(len(employees)),
		},
		"charts": {
			"status": {
				"labels": list(status_counter.keys()),
				"values": list(status_counter.values()),
			},
			"work_type": {
				"labels": list(work_type_counter.keys()),
				"values": list(work_type_counter.values()),
			},
			"daily_trend": {
				"labels": trend_dates,
				"values": trend_counts,
			},
		},
	}
