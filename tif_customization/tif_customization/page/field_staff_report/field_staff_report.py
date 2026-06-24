import json
import csv
from io import StringIO
from datetime import date, datetime, time

import frappe
from frappe import _
from frappe.utils import getdate
from frappe.utils.xlsxutils import make_xlsx


@frappe.whitelist()
def get_report_data(filters=None):
	if not frappe.has_permission("Field Visit", "read"):
		frappe.throw(_("You are not permitted to view Field Visit data."))

	filters = _parse_filters(filters)
	from_date = filters.get("from_date")
	to_date = filters.get("to_date")
	visit_type = filters.get("type")
	user = filters.get("user")
	province = filters.get("province")

	if from_date:
		from_date = getdate(from_date)
	if to_date:
		to_date = getdate(to_date)
	if from_date and to_date and from_date > to_date:
		frappe.throw(_("From Date cannot be after To Date."))

	conditions = ["fv.docstatus < 2"]
	params = {}

	visit_date_expr = """
		CASE
			WHEN fv.type = 'Marketing' THEN COALESCE(fv.visit_date, DATE(fv.timestamp), DATE(fv.modified))
			WHEN fv.type = 'M&E' THEN COALESCE(fv.me_visit_date, fv.me_starting_date, DATE(fv.me_timestamp), DATE(fv.modified))
			WHEN fv.type = 'Training' THEN COALESCE(fv.training_date, DATE(fv.training_timestamp), DATE(fv.modified))
			ELSE DATE(fv.modified)
		END
	"""

	if from_date:
		conditions.append(f"{visit_date_expr} >= %(from_date)s")
		params["from_date"] = from_date
	if to_date:
		conditions.append(f"{visit_date_expr} <= %(to_date)s")
		params["to_date"] = to_date
	if visit_type:
		conditions.append("fv.type = %(visit_type)s")
		params["visit_type"] = visit_type
	if user:
		conditions.append(
			"""(
				CASE
					WHEN fv.type = 'Marketing' THEN COALESCE(fv.visit_by, fv.owner)
					WHEN fv.type = 'M&E' THEN COALESCE(fv.me_visit_by, fv.owner)
					WHEN fv.type = 'Training' THEN COALESCE(fv.training_entry_filled_by, fv.owner)
					ELSE fv.owner
				END
			) = %(user)s"""
		)
		params["user"] = user
	if province:
		conditions.append(
			"""(
				CASE
					WHEN fv.type = 'Marketing' THEN COALESCE(fv.province, '')
					WHEN fv.type = 'M&E' THEN COALESCE(fv.me_province, '')
					WHEN fv.type = 'Training' THEN COALESCE(fv.training_province, '')
					ELSE ''
				END
			) = %(province)s"""
		)
		params["province"] = province

	where_clause = " AND ".join(conditions)
	columns = _get_columns()
	column_sql = ", ".join([f"fv.`{col}`" for col in columns])

	rows = frappe.db.sql(
		f"""
		SELECT
			{column_sql},
			{visit_date_expr} AS _report_visit_date
		FROM `tabField Visit` fv
		WHERE {where_clause}
		ORDER BY _report_visit_date DESC, fv.modified DESC
		""",
		params,
		as_dict=True,
	)
	summary, staff_wise = _build_summary(rows)

	return {
		"columns": columns,
		"labels": _get_labels(columns),
		"rows": rows,
		"total_count": len(rows),
		"summary": summary,
		"staff_wise": staff_wise,
	}


@frappe.whitelist()
def download_report_excel(filters=None):
	report = get_report_data(filters=filters)
	columns = report.get("columns", [])
	labels = report.get("labels", {})
	rows = report.get("rows", [])

	xlsx_data = [[labels.get(col, col) for col in columns]]
	for row in rows:
		xlsx_data.append([_excel_value(row.get(col)) for col in columns])

	xlsx_file = make_xlsx(xlsx_data, "Field Staff Report")
	frappe.response["filename"] = "field_staff_report.xlsx"
	frappe.response["filecontent"] = xlsx_file.getvalue()
	frappe.response["type"] = "binary"


@frappe.whitelist()
def download_report_csv(filters=None):
	report = get_report_data(filters=filters)
	columns = report.get("columns", [])
	labels = report.get("labels", {})
	rows = report.get("rows", [])

	buffer = StringIO()
	writer = csv.writer(buffer)
	writer.writerow([labels.get(col, col) for col in columns])
	for row in rows:
		writer.writerow([_excel_value(row.get(col)) for col in columns])

	frappe.response["filename"] = "field_staff_report.csv"
	frappe.response["filecontent"] = buffer.getvalue()
	frappe.response["type"] = "csv"


def _parse_filters(filters):
	if isinstance(filters, str):
		try:
			return json.loads(filters)
		except Exception:
			return {}
	return filters or {}


def _get_columns():
	excluded = {"_liked_by", "_assign", "_comments", "_seen", "_user_tags"}
	columns = [c for c in frappe.db.get_table_columns("Field Visit") if c not in excluded]
	return columns


def _get_labels(columns):
	meta = frappe.get_meta("Field Visit")
	field_map = {df.fieldname: df.label for df in meta.fields if df.fieldname and df.label}
	standard = {
		"name": "ID",
		"owner": "Owner",
		"creation": "Created On",
		"modified": "Modified On",
		"modified_by": "Modified By",
		"docstatus": "DocStatus",
		"idx": "Index",
		"parent": "Parent",
		"parentfield": "Parent Field",
		"parenttype": "Parent Type",
	}
	return {col: field_map.get(col) or standard.get(col) or col.replace("_", " ").title() for col in columns}


def _build_summary(rows):
	type_counts = {"Marketing": 0, "M&E": 0, "Training": 0, "Meeting": 0, "Other": 0}
	staff_counts = {}
	raw_staff = [_get_field_staff(row) for row in rows]
	user_names = _get_user_names(raw_staff)

	for row, staff_value in zip(rows, raw_staff):
		visit_type = row.get("type") or "Other"
		if visit_type in type_counts:
			type_counts[visit_type] += 1

		staff = (user_names.get(staff_value) or staff_value or _("Unassigned")).strip()
		staff_key = staff.casefold()
		staff_data = staff_counts.setdefault(
			staff_key,
			{
				"staff": staff,
				"total_visits": 0,
				"marketing": 0,
				"me": 0,
				"training": 0,
				"meeting": 0,
				"other": 0,
			},
		)
		staff_data["total_visits"] += 1
		if visit_type == "Marketing":
			staff_data["marketing"] += 1
		elif visit_type == "M&E":
			staff_data["me"] += 1
		elif visit_type == "Training":
			staff_data["training"] += 1
		elif visit_type == "Meeting":
			staff_data["meeting"] += 1
		else:
			staff_data["other"] += 1

	total_visits = len(rows)
	staff_wise = sorted(staff_counts.values(), key=lambda item: (-item["total_visits"], item["staff"]))
	for staff_data in staff_wise:
		staff_data["ratio"] = round(
			(staff_data["total_visits"] / total_visits * 100) if total_visits else 0,
			1,
		)

	active_staff = len(staff_wise)
	return (
		{
			"total_visits": total_visits,
			"marketing_visits": type_counts["Marketing"],
			"me_visits": type_counts["M&E"],
			"training_visits": type_counts["Training"],
			"meeting_visits": type_counts["Meeting"],
			"other_visits": type_counts["Other"],
			"active_staff": active_staff,
			"visits_per_staff": round(total_visits / active_staff, 1) if active_staff else 0,
		},
		staff_wise,
	)


def _get_field_staff(row):
	if row.get("type") == "Marketing":
		return row.get("visit_by") or row.get("owner") or _("Unassigned")
	if row.get("type") == "M&E":
		return row.get("me_visit_by") or row.get("owner") or _("Unassigned")
	if row.get("type") == "Training":
		return row.get("training_entry_filled_by") or row.get("owner") or _("Unassigned")
	if row.get("type") == "Meeting":
		return row.get("mt_visit_by") or row.get("owner") or _("Unassigned")
	return row.get("owner") or _("Unassigned")


def _get_user_names(staff_values):
	emails = sorted({value for value in staff_values if value and "@" in value})
	if not emails:
		return {}
	users = frappe.get_all(
		"User",
		filters={"name": ["in", emails]},
		fields=["name", "full_name"],
	)
	return {user.name: user.full_name for user in users if user.full_name}


def _excel_value(value):
	if isinstance(value, (datetime, date, time)):
		return str(value)
	return value
