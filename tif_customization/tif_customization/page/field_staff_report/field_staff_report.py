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

	return {
		"columns": columns,
		"labels": _get_labels(columns),
		"rows": rows,
		"total_count": len(rows),
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


def _excel_value(value):
	if isinstance(value, (datetime, date, time)):
		return str(value)
	return value
