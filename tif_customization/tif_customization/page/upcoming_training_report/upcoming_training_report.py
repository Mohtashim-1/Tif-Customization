import json
from datetime import time, timedelta

import frappe
from frappe import _
from frappe.utils import getdate, nowdate

DOCTYPE = "Upcoming Training"

# Union of the Training and Workshop field sets; each row only fills the half that applies.
REPORT_FIELDS = (
	"name",
	"type",
	"training_date",
	"training_time",
	"month",
	"training_type",
	"workshop_topic",
	"mode_of_training",
	"participants_category",
	"school_name",
	"school_type",
	"department_training",
	"city",
	"area",
	"trainer_name",
	"program",
	"workshop_for",
)

EXACT_MATCH_FILTERS = (
	"type",
	"mode_of_training",
	"participants_category",
	"school_name",
	"city",
)


def available_fields():
	"""Only request columns the site actually has, so an unmigrated site degrades instead of erroring."""
	meta = frappe.get_meta(DOCTYPE)
	return [f for f in REPORT_FIELDS if f == "name" or meta.get_field(f)]


@frappe.whitelist()
def get_report_data(filters=None):
	if isinstance(filters, str):
		filters = json.loads(filters)
	filters = frappe._dict(filters or {})

	fields = available_fields()

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

	for fieldname in EXACT_MATCH_FILTERS:
		if filters.get(fieldname) and fieldname in fields:
			db_filters[fieldname] = filters.get(fieldname)

	# Topic searches both halves: Training stores it in training_type, Workshop in workshop_topic.
	or_filters = []
	topic = (filters.get("topic") or filters.get("training_type") or "").strip()
	if topic:
		for fieldname in ("training_type", "workshop_topic"):
			if fieldname in fields:
				or_filters.append([fieldname, "like", f"%{topic}%"])

	rows = frappe.get_list(
		DOCTYPE,
		filters=db_filters,
		or_filters=or_filters or None,
		fields=fields,
		order_by="training_date asc, training_time asc, modified desc",
		limit_page_length=1000,
	)

	summary = build_summary(rows)

	formatted_rows = []
	for row in rows:
		row = frappe._dict(row)
		row.training_date = format_report_date(row.training_date)
		row.training_time = format_report_time(row.training_time)
		formatted_rows.append(row)

	return {"rows": formatted_rows, "summary": summary}


def build_summary(rows):
	"""Built from the raw rows, before dates are turned into display strings."""
	today = getdate(nowdate())
	return {
		"total": len(rows),
		"today": sum(getdate(row.training_date) == today for row in rows if row.training_date),
		"trainings": sum(_norm(row.get("type")) == "training" for row in rows),
		"workshops": sum(_norm(row.get("type")) == "workshop" for row in rows),
		"schools": len({row.school_name for row in rows if row.school_name}),
		"cities": len({row.city for row in rows if row.city}),
		"onsite": sum(_norm(row.mode_of_training) == "onsite" for row in rows),
		"online": sum(_norm(row.mode_of_training) == "online" for row in rows),
		"in_person": sum(_norm(row.mode_of_training) in ("in-person", "in person") for row in rows),
		"areas": len({_norm(row.area) for row in rows if _norm(row.area)}),
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
