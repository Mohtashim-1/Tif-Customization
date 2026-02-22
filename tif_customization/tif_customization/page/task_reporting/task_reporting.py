import json
from datetime import date, datetime, time

import frappe
from frappe import _
from frappe.utils import getdate
from frappe.utils.xlsxutils import make_xlsx


@frappe.whitelist()
def get_task_reporting_data(filters=None):
	if not frappe.has_permission("Reporting", "read"):
		frappe.throw(_("You are not permitted to view Reporting data."))

	filters = _parse_filters(filters)
	from_date = filters.get("from_date")
	to_date = filters.get("to_date")
	reported_by = filters.get("reported_by")
	work_type = filters.get("work_type")
	status = filters.get("status")

	if from_date:
		from_date = getdate(from_date)
	if to_date:
		to_date = getdate(to_date)
	if from_date and to_date and from_date > to_date:
		frappe.throw(_("From Date cannot be after To Date."))

	conditions = ["r.docstatus < 2"]
	params = {}

	if from_date:
		conditions.append("r.posting_date >= %(from_date)s")
		params["from_date"] = from_date
	if to_date:
		conditions.append("r.posting_date <= %(to_date)s")
		params["to_date"] = to_date
	if reported_by:
		conditions.append(
			"""(
				r.reported_by = %(reported_by)s
				OR (
					(r.reported_by = 'frappe.session.user' OR IFNULL(r.reported_by, '') = '')
					AND r.owner = %(reported_by)s
				)
			)"""
		)
		params["reported_by"] = reported_by
	if work_type:
		conditions.append("sr.work_type = %(work_type)s")
		params["work_type"] = work_type
	if status:
		conditions.append("sr.status = %(status)s")
		params["status"] = status

	condition_sql = " AND ".join(conditions)
	columns = _get_columns()

	rows = frappe.db.sql(
		f"""
		SELECT
			r.name AS reporting_id,
			CASE
				WHEN r.reported_by = 'frappe.session.user' OR IFNULL(r.reported_by, '') = '' THEN r.owner
				ELSE r.reported_by
			END AS reported_by,
			r.posting_date,
			r.posting_time,
			sr.work_type,
			sr.activity,
			sr.status,
			sr.start_time,
			sr.end_time
		FROM `tabReporting` r
		INNER JOIN `tabReporting Staff Report` sr
			ON sr.parent = r.name
			AND sr.parenttype = 'Reporting'
		WHERE {condition_sql}
		ORDER BY r.posting_date DESC, r.posting_time DESC, r.modified DESC, sr.idx ASC
		LIMIT 1000
		""",
		params,
		as_dict=True,
	)

	return {
		"columns": columns,
		"labels": _get_labels(),
		"rows": rows,
		"total_count": len(rows),
	}


@frappe.whitelist()
def download_task_reporting_excel(filters=None):
	report = get_task_reporting_data(filters=filters)
	columns = report.get("columns", [])
	labels = report.get("labels", {})
	rows = report.get("rows", [])

	xlsx_data = [[labels.get(col, col) for col in columns]]
	for row in rows:
		xlsx_data.append([_excel_value(row.get(col)) for col in columns])

	xlsx_file = make_xlsx(xlsx_data, "Task Reporting")
	frappe.response["filename"] = "task_reporting.xlsx"
	frappe.response["filecontent"] = xlsx_file.getvalue()
	frappe.response["type"] = "binary"


def _parse_filters(filters):
	if isinstance(filters, str):
		try:
			return json.loads(filters)
		except Exception:
			return {}
	return filters or {}


def _get_columns():
	return [
		"reporting_id",
		"reported_by",
		"posting_date",
		"posting_time",
		"work_type",
		"activity",
		"status",
		"start_time",
		"end_time",
	]


def _get_labels():
	return {
		"reporting_id": "Reporting ID",
		"reported_by": "Reported By",
		"posting_date": "Posting Date",
		"posting_time": "Posting Time",
		"work_type": "Work Type",
		"activity": "Daily Activity",
		"status": "Status",
		"start_time": "Start Time",
		"end_time": "End Time",
	}


def _excel_value(value):
	if isinstance(value, (datetime, date, time)):
		return str(value)
	return value
