import json
from datetime import time, timedelta

import frappe
from frappe import _
from frappe.utils import getdate, nowdate


@frappe.whitelist()
def get_report_data(filters=None):
	if isinstance(filters, str):
		filters = json.loads(filters)
	filters = frappe._dict(filters or {})

	db_filters = {"docstatus": ["<", 2]}
	if filters.get("from_date") and filters.get("to_date"):
		from_date = getdate(filters.from_date)
		to_date = getdate(filters.to_date)
		if from_date > to_date:
			frappe.throw(_("From Date cannot be after To Date"))
		db_filters["training_date"] = ["between", [from_date, to_date]]
	elif filters.get("from_date"):
		db_filters["training_date"] = [">=", getdate(filters.from_date)]
	elif filters.get("to_date"):
		db_filters["training_date"] = ["<=", getdate(filters.to_date)]

	for fieldname in ("training_type", "mode_of_training", "participants_category", "school_name", "city"):
		if filters.get(fieldname):
			db_filters[fieldname] = filters.get(fieldname)

	rows = frappe.get_list(
		"Upcoming Training",
		filters=db_filters,
		fields=[
			"name",
			"training_date",
			"training_time",
			"training_type",
			"mode_of_training",
			"participants_category",
			"school_name",
			"school_type",
			"department_training",
			"city",
			"area",
			"trainer_name",
			"program",
		],
		order_by="training_date asc, training_time asc, modified desc",
		limit_page_length=1000,
	)

	today = getdate(nowdate())
	formatted_rows = []
	for row in rows:
		row = frappe._dict(row)
		row.training_date = format_report_date(row.training_date)
		row.training_time = format_report_time(row.training_time)
		formatted_rows.append(row)

	return {
		"rows": formatted_rows,
		"summary": {
			"total": len(rows),
			"today": sum(getdate(row.training_date) == today for row in rows if row.training_date),
			"schools": len({row.school_name for row in rows if row.school_name}),
			"cities": len({row.city for row in rows if row.city}),
			"onsite": sum(_norm(row.mode_of_training) == "onsite" for row in rows),
			"online": sum(_norm(row.mode_of_training) == "online" for row in rows),
			"in_person": sum(_norm(row.mode_of_training) in ("in-person", "in person") for row in rows),
			"areas": len({_norm(row.area) for row in rows if _norm(row.area)}),
		},
	}


def format_report_date(value):
	if not value:
		return ""

	return getdate(value).strftime("%d-%m-%y")


def format_report_time(value):
	if not value:
		return ""

	if isinstance(value, timedelta):
		total_seconds = int(value.total_seconds())
		hours = total_seconds // 3600
		minutes = (total_seconds % 3600) // 60
		seconds = total_seconds % 60
		return f"{hours:02d}:{minutes:02d}:{seconds:02d}"

	if isinstance(value, time):
		return value.strftime("%H:%M:%S")

	return str(value).split(".")[0]


def _norm(value):
	return (value or "").strip().lower()
