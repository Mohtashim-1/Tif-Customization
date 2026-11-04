# Copyright (c) 2026, TIF Customization and contributors
# License: MIT
"""Import Online Workshop Participants for the SME Summary card."""

from __future__ import annotations

import csv
import io
import re
from datetime import datetime

import frappe
from frappe import _
from frappe.utils import cint, cstr, getdate, now_datetime

from tif_customization.tif_customization.field_visit_permissions import expand_staff_tokens

DOCTYPE = "Online Workshop Participant Entry"

TEMPLATE_HEADERS = [
	"Visit Date",
	"School / Venue",
	"Officer",
	"Employee ID",
	"Participants",
	"Category",
	"Visit Summary",
]

_HEADER_ALIASES = {
	"visit date": "visit_date",
	"date": "visit_date",
	"school / venue": "school_venue",
	"school/venue": "school_venue",
	"school": "school_venue",
	"venue": "school_venue",
	"officer": "officer",
	"sme": "officer",
	"employee id": "employee",
	"employee": "employee",
	"emp id": "employee",
	"participants": "participants",
	"participant": "participants",
	"no of participants": "participants",
	"category": "category",
	"visit summary": "visit_summary",
	"summary": "visit_summary",
	"remarks": "visit_summary",
}


def _can_import():
	if frappe.has_permission(DOCTYPE, "create"):
		return True
	# Allow field officers who can create Field Visits to import card data.
	if frappe.has_permission("Field Visit", "create"):
		return True
	frappe.throw(_("You are not permitted to import Online Workshop Participants."), frappe.PermissionError)


def _norm_header(value):
	return re.sub(r"\s+", " ", cstr(value).strip().lower())


def _parse_date(raw):
	text = cstr(raw).strip()
	if not text:
		return None
	try:
		return getdate(text)
	except Exception:
		pass
	for fmt in ("%d-%m-%Y", "%d/%m/%Y", "%Y/%m/%d", "%d-%b-%Y", "%d %b %Y", "%m/%d/%Y"):
		try:
			return getdate(datetime.strptime(text, fmt).date())
		except Exception:
			continue
	return None


def _resolve_employee(employee_id, officer_name):
	emp = cstr(employee_id).strip()
	if emp and frappe.db.exists("Employee", emp):
		return emp
	officer = cstr(officer_name).strip()
	if not officer:
		return ""
	found = frappe.db.get_value("Employee", {"employee_name": officer}, "name")
	if found:
		return found
	# Partial / case-insensitive
	rows = frappe.db.sql(
		"""
		SELECT name FROM `tabEmployee`
		WHERE LOWER(TRIM(employee_name)) = %s
		LIMIT 1
		""",
		(officer.lower(),),
	)
	return rows[0][0] if rows else ""


def _read_csv_rows(content: bytes):
	text = content.decode("utf-8-sig", errors="replace")
	reader = csv.reader(io.StringIO(text))
	rows = list(reader)
	if not rows:
		return [], []
	headers = [_norm_header(h) for h in rows[0]]
	mapped = [_HEADER_ALIASES.get(h, "") for h in headers]
	data = []
	for raw in rows[1:]:
		if not any(cstr(c).strip() for c in raw):
			continue
		item = {}
		for idx, key in enumerate(mapped):
			if not key or idx >= len(raw):
				continue
			item[key] = cstr(raw[idx]).strip()
		data.append(item)
	return mapped, data


def _read_xlsx_rows(content: bytes):
	try:
		from openpyxl import load_workbook
	except Exception:
		frappe.throw(_("Excel support requires openpyxl. Please upload a CSV file instead."))

	wb = load_workbook(filename=io.BytesIO(content), read_only=True, data_only=True)
	ws = wb.active
	rows_iter = ws.iter_rows(values_only=True)
	try:
		header_row = next(rows_iter)
	except StopIteration:
		return [], []
	headers = [_norm_header(h) for h in header_row]
	mapped = [_HEADER_ALIASES.get(h, "") for h in headers]
	data = []
	for raw in rows_iter:
		if not raw or not any(cstr(c).strip() for c in raw if c is not None):
			continue
		item = {}
		for idx, key in enumerate(mapped):
			if not key or idx >= len(raw):
				continue
			val = raw[idx]
			if hasattr(val, "strftime"):
				item[key] = val.strftime("%Y-%m-%d")
			else:
				item[key] = cstr(val).strip()
		data.append(item)
	return mapped, data


def _staff_filter_sql(tokens, alias="e"):
	"""Match imported rows to SME filter tokens (officer name / employee id)."""
	if not tokens:
		return "1=1", {}
	lower_tokens = sorted({cstr(t).strip().lower() for t in tokens if cstr(t).strip()})
	if not lower_tokens:
		return "1=1", {}
	params = {"ow_tokens": lower_tokens}
	return (
		f"""(
			LOWER(TRIM(IFNULL({alias}.officer, ''))) IN %(ow_tokens)s
			OR LOWER(TRIM(IFNULL({alias}.employee, ''))) IN %(ow_tokens)s
		)""",
		params,
	)


def imported_online_stats(from_date, to_date, tokens=None):
	"""Sum of imported online workshop participants in period (optional staff filter)."""
	if not frappe.db.exists("DocType", DOCTYPE):
		return {"workshops": 0, "participants": 0}

	staff_sql, staff_params = _staff_filter_sql(tokens or [])
	params = {
		"from_date": getdate(from_date),
		"to_date": getdate(to_date),
		**staff_params,
	}
	row = frappe.db.sql(
		f"""
		SELECT
			COUNT(*) AS workshops,
			COALESCE(SUM(IFNULL(e.participants, 0)), 0) AS participants
		FROM `tab{DOCTYPE}` e
		WHERE e.visit_date BETWEEN %(from_date)s AND %(to_date)s
		  AND ({staff_sql})
		""",
		params,
		as_dict=True,
	)
	found = row[0] if row else {}
	return {
		"workshops": cint(found.get("workshops") or 0),
		"participants": cint(found.get("participants") or 0),
	}


def imported_online_rows(from_date, to_date, tokens=None):
	"""Rows shaped like Field Visit drilldown entries for the Online Participants card."""
	if not frappe.db.exists("DocType", DOCTYPE):
		return []

	staff_sql, staff_params = _staff_filter_sql(tokens or [])
	params = {
		"from_date": getdate(from_date),
		"to_date": getdate(to_date),
		**staff_params,
	}
	rows = frappe.db.sql(
		f"""
		SELECT
			e.name,
			e.visit_date,
			e.school_venue,
			e.officer,
			e.employee,
			e.participants,
			e.category,
			e.visit_summary,
			e.import_batch
		FROM `tab{DOCTYPE}` e
		WHERE e.visit_date BETWEEN %(from_date)s AND %(to_date)s
		  AND ({staff_sql})
		ORDER BY e.visit_date DESC, e.creation DESC
		LIMIT 1000
		""",
		params,
		as_dict=True,
	)
	out = []
	for r in rows:
		out.append(
			{
				"name": r.name,
				"type": "Online Workshop (Imported)",
				"visit_date": str(r.visit_date) if r.visit_date else "",
				"school": r.school_venue or "",
				"school_unapproved": 0,
				"school_missing": 0 if (r.school_venue or "").strip() else 1,
				"province": "",
				"area": "",
				"city": "",
				"officer": r.officer or "",
				"status": "Imported",
				"category": r.category or "Online",
				"remarks": r.visit_summary or "",
				"participants": cint(r.participants),
				"url": "",
				"images": [],
				"imported": 1,
			}
		)
	return out


@frappe.whitelist()
def download_online_workshop_template():
	"""Return CSV template content for Online Workshop Participants import."""
	_can_import()
	buf = io.StringIO()
	writer = csv.writer(buf)
	writer.writerow(TEMPLATE_HEADERS)
	writer.writerow(
		[
			"2026-09-15",
			"Example School / Zoom",
			"S. Rahman Haider",
			"HR-EMP-00012",
			"25",
			"Online",
			"Online workshop on Mutalae Quran",
		]
	)
	return {
		"filename": "online_workshop_participants_template.csv",
		"content": buf.getvalue(),
		"headers": TEMPLATE_HEADERS,
	}


@frappe.whitelist()
def import_online_workshop_participants(file_url=None, file_content=None, filename=None):
	"""Import CSV/XLSX rows into Online Workshop Participant Entry."""
	_can_import()

	content = None
	src_name = cstr(filename).strip() or "upload"
	if file_content:
		import base64

		raw = file_content
		if isinstance(raw, str) and "," in raw and raw.strip().startswith("data:"):
			raw = raw.split(",", 1)[1]
		content = base64.b64decode(raw)
	elif file_url:
		file_url = cstr(file_url).strip()
		file_doc = frappe.get_doc("File", {"file_url": file_url})
		content = file_doc.get_content()
		src_name = file_doc.file_name or src_name
	else:
		frappe.throw(_("Please attach a CSV or Excel file."))

	lower = src_name.lower()
	if lower.endswith((".xlsx", ".xlsm")):
		_mapped, rows = _read_xlsx_rows(content)
	else:
		_mapped, rows = _read_csv_rows(content)

	if not rows:
		frappe.throw(_("No data rows found in the file."))

	batch = now_datetime().strftime("%Y%m%d%H%M%S")
	created = 0
	skipped = 0
	errors = []

	for idx, row in enumerate(rows, start=2):
		visit_date = _parse_date(row.get("visit_date"))
		participants = cint(row.get("participants") or 0)
		if not visit_date:
			skipped += 1
			errors.append(_("Row {0}: missing or invalid Visit Date").format(idx))
			continue
		if participants <= 0:
			skipped += 1
			errors.append(_("Row {0}: Participants must be greater than 0").format(idx))
			continue

		officer = cstr(row.get("officer")).strip()
		employee = _resolve_employee(row.get("employee"), officer)
		doc = frappe.get_doc(
			{
				"doctype": DOCTYPE,
				"visit_date": visit_date,
				"school_venue": cstr(row.get("school_venue")).strip(),
				"officer": officer,
				"employee": employee or None,
				"participants": participants,
				"category": cstr(row.get("category")).strip() or "Online",
				"visit_summary": cstr(row.get("visit_summary")).strip(),
				"import_batch": batch,
				"source_file": src_name[:140],
			}
		)
		doc.insert(ignore_permissions=True)
		created += 1

	frappe.db.commit()
	return {
		"created": created,
		"skipped": skipped,
		"batch": batch,
		"errors": errors[:20],
		"message": _("Imported {0} row(s); skipped {1}.").format(created, skipped),
	}
