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
	return "System Manager" in user_roles


@frappe.whitelist()
def get_reporting_dashboard_data(
	from_date=None, to_date=None, employee=None, status=None, work_type=None
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

	condition_sql = " AND ".join(conditions)
	data = frappe.db.sql(
		f"""
		SELECT
			r.name,
			r.posting_date,
			r.posting_time,
			CASE
				WHEN r.reported_by = 'frappe.session.user' OR IFNULL(r.reported_by, '') = '' THEN r.owner
				ELSE r.reported_by
			END AS reported_by,
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

	return {
		"can_view_all": can_view_all,
		"rows": data,
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
