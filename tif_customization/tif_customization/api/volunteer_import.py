# Copyright (c) 2026, TIF Customization and contributors
# License: MIT
"""Import Volunteer Registration rows into Field Visit (Enrolment of Volunteers)."""

from __future__ import annotations

import csv
import io
import re
from collections import defaultdict

import frappe
from frappe import _
from frappe.utils import cstr, get_datetime, getdate, now_datetime, today, validate_email_address

from tif_customization.tif_customization.api.online_workshop_import import (
	_norm_header,
	_parse_date,
	_resolve_employee,
	_resolve_field_officer,
)

_MONTH_NAMES = (
	"",
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
)

VISIT_TYPE = "Enrolment of Volunteers"

TEMPLATE_HEADERS = [
	"S.No.",
	"Volunteer Name",
	"Contact Number",
	"Email",
	"Profession",
	"Contribution / Role",
	"Province",
	"City",
	"Area",
	"Address",
	"School",
	"Volunteer Form Submitted",
	"Remarks",
	"TIF Representative",
	"Visit Date",
]

_HEADER_ALIASES = {
	"s.no.": "serial_no",
	"s.no": "serial_no",
	"sno": "serial_no",
	"serial no": "serial_no",
	"volunteer name": "volunteer_name",
	"name": "volunteer_name",
	"full name": "volunteer_name",
	"contact number": "contact_number",
	"contact no": "contact_number",
	"contact": "contact_number",
	"whatsapp": "contact_number",
	"phone": "contact_number",
	"mobile": "contact_number",
	"mobile no": "contact_number",
	"email": "email",
	"e-mail": "email",
	"email address": "email",
	"profession": "profession",
	"occupation": "profession",
	"your occupation": "profession",
	"job": "profession",
	"contribution / role": "contribution",
	"contribution/role": "contribution",
	"contribution": "contribution",
	"role": "contribution",
	"what is he/she doing": "contribution",
	"other skills": "contribution",
	"province": "province",
	"city": "city",
	"area": "area",
	"area / locality": "area",
	"locality": "area",
	"address": "address",
	"home address": "address",
	"school": "school",
	"school name": "school",
	"school (optional)": "school",
	"volunteer form submitted": "volunteer_form_submitted",
	"form submitted": "volunteer_form_submitted",
	"form": "volunteer_form_submitted",
	"remarks": "remarks",
	"other / remarks": "remarks",
	"other": "remarks",
	"notes": "remarks",
	"tif representative": "officer",
	"representative": "officer",
	"officer": "officer",
	"field officer": "officer",
	"sme": "officer",
	"visit date": "visit_date",
	"enrolment date": "visit_date",
	"enrollment date": "visit_date",
	"timestamp": "visit_date",
	"date": "visit_date",
	"employee id": "employee",
	"employee": "employee",
}

# Google Form skill / availability columns → append into contribution
_SKILL_HEADER_HINTS = (
	"proofreader",
	"information technology",
	"i.t",
	"marketing",
	"data entry",
	"administration",
	"other skills",
	"other occupation",
)


def _vol_norm_header(value):
	"""Normalize sheet headers; strip Google Form trailing ':' / '?'."""
	text = _norm_header(value)
	text = re.sub(r"[:?*]+$", "", text).strip()
	text = re.sub(r"\s+", " ", text)
	return text


def _map_header(raw_header):
	"""Map a raw column title to an import field key."""
	h = _vol_norm_header(raw_header)
	if not h:
		return ""
	if h in _HEADER_ALIASES:
		return _HEADER_ALIASES[h]
	# Prefix / contains matches for Google Form wording
	if h.startswith("name") or h in ("volunteer", "volunteer's name"):
		return "volunteer_name"
	if (
		h.startswith("contact")
		or h.startswith("phone")
		or h.startswith("mobile")
		or "whatsapp" in h
		or h in ("contact no", "contact number")
	) and "please contact" not in h:
		return "contact_number"
	if h.startswith("email") or h == "e-mail":
		return "email"
	if "occupation" in h or h.startswith("profession") or h.startswith("job"):
		return "profession"
	if h.startswith("address") or "home address" in h:
		return "address"
	if h.startswith("city"):
		return "city"
	if h.startswith("province") or h.startswith("state"):
		return "province"
	if h.startswith("area") or "locality" in h:
		return "area"
	if h.startswith("school"):
		return "school"
	if "representative" in h or "referred by" in h or "tif rep" in h:
		return "officer"
	if h in ("timestamp",) or h.startswith("timestamp") or "visit date" in h or "enrol" in h:
		return "visit_date"
	if "remark" in h or h == "notes" or h.startswith("other"):
		return "remarks"
	if any(hint in h for hint in _SKILL_HEADER_HINTS):
		return "_skill"
	return ""

PROVINCE_MAP = {
	"sindh": "Sindh",
	"punjab": "Punjab",
	"kpk": "Khyber Pakhtunkhwa",
	"khyber pakhtunkhwa": "Khyber Pakhtunkhwa",
	"balochistan": "Balochistan",
	"ajk": "Azad Jammu & Kashmir",
	"azad jammu & kashmir": "Azad Jammu & Kashmir",
	"azad jammu and kashmir": "Azad Jammu & Kashmir",
	"gilgit-baltistan": "Gilgit-Baltistan",
	"gilgit baltistan": "Gilgit-Baltistan",
	"islamabad": "Islamabad Capital Territory",
	"islamabad capital territory": "Islamabad Capital Territory",
	"ict": "Islamabad Capital Territory",
}


def _can_import():
	if frappe.has_permission("Field Visit", "create"):
		return True
	frappe.throw(_("You are not permitted to import volunteers."), frappe.PermissionError)


def _map_province(raw):
	text = cstr(raw).strip()
	if not text:
		return ""
	mapped = PROVINCE_MAP.get(text.lower())
	if mapped:
		return mapped
	# Already a valid option?
	opts = {
		"Punjab",
		"Sindh",
		"Khyber Pakhtunkhwa",
		"Balochistan",
		"Azad Jammu & Kashmir",
		"Gilgit-Baltistan",
		"Islamabad Capital Territory",
	}
	for opt in opts:
		if opt.lower() == text.lower():
			return opt
	return text


def _yes_no(raw):
	text = cstr(raw).strip().lower()
	if text in ("1", "y", "yes", "true", "submitted"):
		return "Yes"
	if text in ("0", "n", "no", "false", ""):
		return "No"
	if text.startswith("y"):
		return "Yes"
	return "No"


def _clean_email(raw):
	"""Keep only valid emails; drop typos like Deeba8004gmail.Com (missing @)."""
	text = cstr(raw).strip()
	if not text:
		return ""
	try:
		ok = validate_email_address(text, throw=False)
		return cstr(ok).strip() if ok else ""
	except Exception:
		return ""


def _resolve_city(city_name, province=""):
	city = cstr(city_name).strip()
	if not city or not frappe.db.exists("DocType", "City"):
		return ""
	params = {"city": city.lower()}
	extra = ""
	if province and frappe.db.has_column("City", "province"):
		extra = " AND LOWER(TRIM(IFNULL(province, ''))) = %(prov)s"
		params["prov"] = province.lower()
	city_col = (
		"OR LOWER(TRIM(IFNULL(city, ''))) = %(city)s"
		if frappe.db.has_column("City", "city")
		else ""
	)
	rows = frappe.db.sql(
		f"""
		SELECT name FROM `tabCity`
		WHERE LOWER(TRIM(name)) = %(city)s
		   {city_col}
		{extra}
		LIMIT 1
		""",
		params,
	)
	# Unknown free-text city → leave blank (don't break Link field)
	return rows[0][0] if rows else ""


def _resolve_school(school_name):
	school = cstr(school_name).strip()
	if not school:
		return ""
	if frappe.db.exists("Customer", school):
		return school
	found = frappe.db.get_value("Customer", {"customer_name": school}, "name")
	return found or ""


def _officer_display(officer_name):
	"""Prefer Field Officer name1 for visit_by display."""
	officer = cstr(officer_name).strip()
	if not officer:
		return ""
	if frappe.db.exists("DocType", "Field Officer") and frappe.db.exists("Field Officer", officer):
		return cstr(frappe.db.get_value("Field Officer", officer, "name1") or officer).strip() or officer
	return officer


def _parse_upload(file_url=None, file_content=None, filename=None):
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
			return src_name, []
		mapped = [_map_header(h) for h in header_row]
		rows = []
		for raw in rows_iter:
			if not raw or not any(cstr(c).strip() for c in raw if c is not None):
				continue
			rows.append(_row_from_mapped(mapped, raw))
		return src_name, rows

	text = content.decode("utf-8-sig", errors="replace")
	reader = csv.reader(io.StringIO(text))
	all_rows = list(reader)
	if not all_rows:
		return src_name, []
	mapped = [_map_header(h) for h in all_rows[0]]
	rows = []
	for raw in all_rows[1:]:
		if not any(cstr(c).strip() for c in raw):
			continue
		rows.append(_row_from_mapped(mapped, raw))
	return src_name, rows


def _cell_text(val):
	if val is None:
		return ""
	if hasattr(val, "strftime"):
		# Date → YYYY-MM-DD; Datetime keep date part for visit_date
		try:
			return val.strftime("%Y-%m-%d")
		except Exception:
			return cstr(val).strip()
	return cstr(val).strip()


def _row_from_mapped(mapped, raw):
	"""Build one import dict; keep first value per key; merge skill columns into contribution."""
	item = {}
	skills = []
	for idx, key in enumerate(mapped):
		if not key or idx >= len(raw):
			continue
		text = _cell_text(raw[idx])
		if not text:
			continue
		if key == "_skill":
			skills.append(text)
			continue
		# Prefer first non-empty mapping (e.g. Email before Email address)
		if key not in item or not item[key]:
			item[key] = text
	if skills:
		extra = "; ".join(skills)
		if item.get("contribution"):
			item["contribution"] = f"{item['contribution']}; {extra}"
		else:
			item["contribution"] = extra
	# Google Form has no explicit form-submitted column — treat response row as Yes
	if "volunteer_form_submitted" not in item:
		item["volunteer_form_submitted"] = "Yes"
	return item


@frappe.whitelist()
def download_volunteer_template():
	"""CSV template for Volunteer Registration import."""
	_can_import()
	buf = io.StringIO()
	writer = csv.writer(buf)
	writer.writerow(TEMPLATE_HEADERS)
	writer.writerow(
		[
			"1",
			"Example Volunteer",
			"03001234567",
			"example@email.com",
			"Teacher",
			"School outreach",
			"Sindh",
			"Karachi",
			"Gulshan",
			"House 1, Street 2",
			"",
			"No",
			"",
			"S. Rahman Haider",
			"2026-11-01",
		]
	)
	return {
		"filename": "volunteer_registration_template.csv",
		"content": buf.getvalue(),
		"headers": TEMPLATE_HEADERS,
	}


@frappe.whitelist()
def import_volunteers(
	file_url=None,
	file_content=None,
	filename=None,
	default_visit_date=None,
	force_visit_date=0,
):
	"""Import volunteers as Field Visit → Enrolment of Volunteers (counts on KPI / dashboard)."""
	_can_import()

	src_name, rows = _parse_upload(file_url=file_url, file_content=file_content, filename=filename)
	if not rows:
		frappe.throw(_("No data rows found in the file."))

	# Dialog Timestamp / Visit Date — default = now; always applied when force is on
	fallback_ts = None
	if default_visit_date:
		try:
			fallback_ts = get_datetime(default_visit_date)
		except Exception:
			fallback_ts = None
		if fallback_ts is None:
			d = _parse_date(default_visit_date)
			if d:
				# Date-only from dialog → stamp with current time so Timestamp is filled
				now = now_datetime()
				fallback_ts = now.replace(
					year=d.year, month=d.month, day=d.day
				)
	if fallback_ts is None:
		fallback_ts = now_datetime()
	fallback_date = getdate(fallback_ts)
	# Default ON: dialog timestamp wins (Excel Visit Date ignored)
	use_dialog_date = cstr(force_visit_date).strip().lower() not in ("0", "false", "no", "n")
	batch = now_datetime().strftime("%Y%m%d%H%M%S")
	groups = defaultdict(list)
	errors = []
	skipped = 0

	for idx, row in enumerate(rows, start=2):
		name = cstr(row.get("volunteer_name")).strip()
		if not name:
			skipped += 1
			errors.append(_("Row {0}: Volunteer Name is required").format(idx))
			continue
		contact = cstr(row.get("contact_number")).strip()
		if not contact:
			skipped += 1
			errors.append(_("Row {0}: Contact Number is required for {1}").format(idx, name))
			continue

		officer_raw = cstr(row.get("officer")).strip()
		officer = _resolve_field_officer(officer_raw) if officer_raw else ""
		if officer_raw and not officer:
			errors.append(
				_("Row {0}: TIF Representative '{1}' not matched to Field Officer").format(
					idx, officer_raw
				)
			)
		# Dialog timestamp wins by default (mixed / wrong dates in Excel)
		if use_dialog_date:
			visit_ts = fallback_ts
			visit_date = fallback_date
		else:
			row_date = _parse_date(row.get("visit_date"))
			if row_date:
				visit_date = row_date
				now = now_datetime()
				visit_ts = now.replace(
					year=row_date.year, month=row_date.month, day=row_date.day
				)
			else:
				visit_ts = fallback_ts
				visit_date = fallback_date
		province = _map_province(row.get("province"))
		city = _resolve_city(row.get("city"), province)
		school = _resolve_school(row.get("school"))
		officer_key = officer or officer_raw or "__none__"
		groups[(officer_key, str(visit_date), str(visit_ts))].append(
			{
				"row_no": idx,
				"volunteer_name": name,
				"contact_number": contact,
				"email": _clean_email(row.get("email")),
				"profession": cstr(row.get("profession")).strip(),
				"contribution": cstr(row.get("contribution")).strip(),
				"province": province,
				"city": city,
				"area": cstr(row.get("area")).strip(),
				"address": cstr(row.get("address")).strip(),
				"school": school,
				"volunteer_form_submitted": _yes_no(row.get("volunteer_form_submitted")),
				"remarks": cstr(row.get("remarks")).strip(),
				"officer": officer,
				"officer_raw": officer_raw,
				"employee": _resolve_employee(row.get("employee"), officer or officer_raw),
				"visit_ts": visit_ts,
			}
		)

	created_visits = 0
	created_people = 0
	visit_names = []

	for (officer_key, visit_date_s, _visit_ts_s), people in groups.items():
		# Deduplicate names within the visit (Field Visit validation).
		seen_names = set()
		unique_people = []
		for p in people:
			key = p["volunteer_name"].lower()
			if key in seen_names:
				errors.append(
					_("Row {0}: Duplicate volunteer '{1}' in same visit — skipped").format(
						p["row_no"], p["volunteer_name"]
					)
				)
				skipped += 1
				continue
			seen_names.add(key)
			unique_people.append(p)
		if not unique_people:
			continue

		first = unique_people[0]
		# Never fall back to session user (Administrator) — only real Field Officer / sheet text
		visit_by = _officer_display(first["officer"]) or first["officer_raw"] or ""
		province = first["province"] or ""
		city = first["city"] or ""
		# Prefer a common city/province from the group if first blank.
		if not province:
			for p in unique_people:
				if p["province"]:
					province = p["province"]
					break
		if not city:
			for p in unique_people:
				if p["city"]:
					city = p["city"]
					break

		visit_date = getdate(visit_date_s)
		visit_ts = first.get("visit_ts") or fallback_ts
		try:
			visit_ts = get_datetime(visit_ts)
		except Exception:
			visit_ts = fallback_ts

		doc = frappe.new_doc("Field Visit")
		doc.type = VISIT_TYPE
		# Field Visit form shows Timestamp + Visit Date for Enrolment of Volunteers
		doc.timestamp = visit_ts
		doc.visit_date = visit_date
		doc.month = _MONTH_NAMES[visit_date.month] if 1 <= visit_date.month <= 12 else None
		doc.quarter = f"Q{((visit_date.month - 1) // 3) + 1}"
		doc.visit_by = visit_by
		doc.province = province or None
		doc.city = city or None
		doc.school_additional_remarks = _("Imported volunteer registration batch {0} ({1})").format(
			batch, src_name[:80]
		)
		for p in unique_people:
			entry = {
				"volunteer_name": p["volunteer_name"],
				"contact_number": p["contact_number"],
				"email": p["email"],
				"profession": p["profession"],
				"contribution": p["contribution"],
				"province": p["province"] or province,
				"city": p["city"] or city or None,
				"area": p["area"],
				"address": p["address"],
				"volunteer_form_submitted": p["volunteer_form_submitted"],
				"remarks": p["remarks"],
			}
			if p["school"]:
				entry["school"] = p["school"]
			doc.append("volunteer_enrolments", entry)

		doc.flags.ignore_permissions = True
		doc.insert(ignore_permissions=True)
		try:
			doc.submit()
		except Exception:
			# Keep as draft if submit rules block (approval, etc.)
			frappe.log_error(frappe.get_traceback(), "volunteer_import_submit")
			errors.append(
				_("Visit {0} saved as Draft (could not submit automatically)").format(doc.name)
			)
		created_visits += 1
		created_people += len(unique_people)
		visit_names.append(doc.name)

	frappe.db.commit()
	return {
		"created": created_people,
		"visits": created_visits,
		"visit_names": visit_names[:20],
		"skipped": skipped,
		"batch": batch,
		"errors": errors[:25],
		"message": _("Imported {0} volunteer(s) across {1} visit(s); skipped {2}.").format(
			created_people, created_visits, skipped
		),
	}
