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
from frappe.utils import cint, cstr, getdate, now_datetime, today

DOCTYPE = "Online Workshop Participant Entry"

# Matches the registration spreadsheet headers (+ optional Visit Date for period filter).
TEMPLATE_HEADERS = [
	"S.No.",
	"Training Program",
	"Full Name",
	"Father/Husband Name",
	"WhatsApp / Contact Number",
	"Father/Husband Phone / WhatsApp",
	"Email",
	"Home Address",
	"City",
	"Province",
	"Subject",
	"Qualification / Education",
	"Job Title / Teaching Role",
	"Marital Status",
	"Qur'anic Core Values",
	"School / Institute / Organization",
	"School Contact Number",
	"How Did You Hear About Us?",
	"TIF Representative",
	"Visit Date",
]

_HEADER_ALIASES = {
	"s.no.": "serial_no",
	"s.no": "serial_no",
	"sno": "serial_no",
	"s no": "serial_no",
	"serial no": "serial_no",
	"serial number": "serial_no",
	"training program": "training_program",
	"program": "training_program",
	"full name": "full_name",
	"name": "full_name",
	"participant name": "full_name",
	"father/husband name": "father_husband_name",
	"father / husband name": "father_husband_name",
	"father name": "father_husband_name",
	"husband name": "father_husband_name",
	"whatsapp / contact number": "whatsapp_contact",
	"whatsapp/contact number": "whatsapp_contact",
	"whatsapp": "whatsapp_contact",
	"contact number": "whatsapp_contact",
	"contact": "whatsapp_contact",
	"phone": "whatsapp_contact",
	"mobile": "whatsapp_contact",
	"father/husband phone / whatsapp": "father_husband_phone",
	"father/husband phone/whatsapp": "father_husband_phone",
	"father / husband phone / whatsapp": "father_husband_phone",
	"father phone": "father_husband_phone",
	"email": "email",
	"e-mail": "email",
	"home address": "home_address",
	"address": "home_address",
	"city": "city",
	"province": "province",
	"subject": "subject",
	"qualification / education": "qualification_education",
	"qualification/education": "qualification_education",
	"qualification": "qualification_education",
	"education": "qualification_education",
	"job title / teaching role": "job_title_teaching_role",
	"job title/teaching role": "job_title_teaching_role",
	"job title": "job_title_teaching_role",
	"teaching role": "job_title_teaching_role",
	"marital status": "marital_status",
	"qur'anic core values": "quranic_core_values",
	"quranic core values": "quranic_core_values",
	"quranic values": "quranic_core_values",
	"school / institute / organization": "school_venue",
	"school/institute/organization": "school_venue",
	"school / venue": "school_venue",
	"school": "school_venue",
	"institute": "school_venue",
	"organization": "school_venue",
	"school contact number": "school_contact_number",
	"school contact": "school_contact_number",
	"how did you hear about us?": "how_did_you_hear",
	"how did you hear about us": "how_did_you_hear",
	"how did you hear": "how_did_you_hear",
	"tif representative": "officer",
	"representative": "officer",
	"officer": "officer",
	"sme": "officer",
	"visit date": "visit_date",
	"workshop date": "visit_date",
	"training date": "visit_date",
	"date": "visit_date",
	"employee id": "employee",
	"employee": "employee",
	"participants": "participants",
	"category": "category",
	"visit summary": "visit_summary",
	"remarks": "visit_summary",
	"notes": "visit_summary",
}


def _can_import():
	if frappe.has_permission(DOCTYPE, "create"):
		return True
	if frappe.has_permission("Field Visit", "create"):
		return True
	frappe.throw(_("You are not permitted to import Online Workshop Participants."), frappe.PermissionError)


def _norm_header(value):
	text = cstr(value).strip().lower()
	text = text.replace("\u2019", "'").replace("\u2018", "'")
	return re.sub(r"\s+", " ", text)


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
	"""Match imported rows to SME filter tokens (TIF Representative / employee)."""
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


def _participant_remarks(r):
	bits = []
	if r.get("full_name"):
		bits.append(f"Name: {r.full_name}")
	if r.get("training_program"):
		bits.append(f"Program: {r.training_program}")
	if r.get("whatsapp_contact"):
		bits.append(f"Contact: {r.whatsapp_contact}")
	if r.get("email"):
		bits.append(f"Email: {r.email}")
	if r.get("city") or r.get("province"):
		bits.append(f"Location: {', '.join([x for x in [r.get('city'), r.get('province')] if x])}")
	if r.get("subject"):
		bits.append(f"Subject: {r.subject}")
	if r.get("job_title_teaching_role"):
		bits.append(f"Role: {r.job_title_teaching_role}")
	if r.get("how_did_you_hear"):
		bits.append(f"Heard via: {r.how_did_you_hear}")
	if r.get("visit_summary"):
		bits.append(r.visit_summary)
	return " | ".join(bits)


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
			e.serial_no,
			e.training_program,
			e.visit_date,
			e.full_name,
			e.father_husband_name,
			e.whatsapp_contact,
			e.father_husband_phone,
			e.email,
			e.home_address,
			e.city,
			e.province,
			e.subject,
			e.qualification_education,
			e.job_title_teaching_role,
			e.marital_status,
			e.quranic_core_values,
			e.school_venue,
			e.school_contact_number,
			e.how_did_you_hear,
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
		LIMIT 2000
		""",
		params,
		as_dict=True,
	)
	out = []
	for r in rows:
		out.append(
			{
				"name": r.name,
				"type": r.training_program or "Online Workshop (Imported)",
				"visit_date": str(r.visit_date) if r.visit_date else "",
				"school": r.school_venue or "",
				"school_unapproved": 0,
				"school_missing": 0 if (r.school_venue or "").strip() else 1,
				"province": r.province or "",
				"area": "",
				"city": r.city or "",
				"officer": r.officer or "",
				"status": "Imported",
				"category": r.category or "Online",
				"remarks": _participant_remarks(r),
				"participants": cint(r.participants) or 1,
				"url": "",
				"images": [],
				"imported": 1,
				"full_name": r.full_name or "",
				"whatsapp_contact": r.whatsapp_contact or "",
				"email": r.email or "",
				"serial_no": r.serial_no or "",
			}
		)
	return out


@frappe.whitelist()
def download_online_workshop_template():
	"""Return CSV template matching the registration spreadsheet."""
	_can_import()
	buf = io.StringIO()
	writer = csv.writer(buf)
	writer.writerow(TEMPLATE_HEADERS)
	writer.writerow(
		[
			"1",
			"Online Mutalae Quran Workshop",
			"Example Participant",
			"Example Father",
			"03001234567",
			"03007654321",
			"example@email.com",
			"House 1, Street 2",
			"Karachi",
			"Sindh",
			"Quran",
			"BA",
			"Teacher",
			"Married",
			"Honesty",
			"Example School",
			"0211234567",
			"SME / Field Officer",
			"S. Rahman Haider",
			"2026-09-15",
		]
	)
	return {
		"filename": "online_workshop_participants_template.csv",
		"content": buf.getvalue(),
		"headers": TEMPLATE_HEADERS,
	}


@frappe.whitelist()
def import_online_workshop_participants(
	file_url=None, file_content=None, filename=None, default_visit_date=None
):
	"""Import registration CSV/XLSX rows into Online Workshop Participant Entry."""
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

	fallback_date = _parse_date(default_visit_date) or getdate(today())
	batch = now_datetime().strftime("%Y%m%d%H%M%S")
	created = 0
	skipped = 0
	errors = []

	for idx, row in enumerate(rows, start=2):
		full_name = cstr(row.get("full_name")).strip()
		if not full_name:
			skipped += 1
			errors.append(_("Row {0}: Full Name is required").format(idx))
			continue

		visit_date = _parse_date(row.get("visit_date")) or fallback_date
		participants = cint(row.get("participants") or 0) or 1
		officer = cstr(row.get("officer")).strip()
		employee = _resolve_employee(row.get("employee"), officer)

		doc = frappe.get_doc(
			{
				"doctype": DOCTYPE,
				"serial_no": cstr(row.get("serial_no")).strip(),
				"training_program": cstr(row.get("training_program")).strip(),
				"visit_date": visit_date,
				"full_name": full_name,
				"father_husband_name": cstr(row.get("father_husband_name")).strip(),
				"whatsapp_contact": cstr(row.get("whatsapp_contact")).strip(),
				"father_husband_phone": cstr(row.get("father_husband_phone")).strip(),
				"email": cstr(row.get("email")).strip(),
				"home_address": cstr(row.get("home_address")).strip(),
				"city": cstr(row.get("city")).strip(),
				"province": cstr(row.get("province")).strip(),
				"subject": cstr(row.get("subject")).strip(),
				"qualification_education": cstr(row.get("qualification_education")).strip(),
				"job_title_teaching_role": cstr(row.get("job_title_teaching_role")).strip(),
				"marital_status": cstr(row.get("marital_status")).strip(),
				"quranic_core_values": cstr(row.get("quranic_core_values")).strip(),
				"school_venue": cstr(row.get("school_venue")).strip(),
				"school_contact_number": cstr(row.get("school_contact_number")).strip(),
				"how_did_you_hear": cstr(row.get("how_did_you_hear")).strip(),
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
		"message": _("Imported {0} participant(s); skipped {1}.").format(created, skipped),
	}
