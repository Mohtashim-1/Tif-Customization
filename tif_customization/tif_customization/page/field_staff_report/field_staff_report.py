import json
import csv
import re
from io import StringIO
from datetime import date, datetime, time

import frappe
from frappe import _
from frappe.utils import cint, getdate
from frappe.utils.xlsxutils import make_xlsx

# Screen table only — Field Visit has ~200 columns; dumping them froze the page.
DISPLAY_COLUMNS = [
	"name",
	"visit_date",
	"type",
	"school",
	"officer",
	"category",
	"province",
	"remarks",
	"docstatus",
	"images",
]
DISPLAY_LABELS = {
	"name": "Document No",
	"visit_date": "Visit Date",
	"type": "Type",
	"school": "School / Venue",
	"officer": "Field Staff",
	"category": "Category",
	"province": "Province",
	"remarks": "School Status",
	"docstatus": "Status",
	"images": "School Images",
}
IMAGE_FIELDS = (
	("school_picture", "School Picture"),
	("meeting_picture", "Meeting Picture"),
	("training_awareness_pictures", "Training & Awareness"),
	("mt_meeting_picture", "Meeting Picture"),
)
# Service checkboxes marked Yes on the Field Visit form (QPS / TPS / CEE).
PROGRAM_SERVICE_FIELDS = (
	("qps_mqh_books", "QPS: MQH Books"),
	("qps_mqh_teachers_guides", "QPS: MQH Teachers Guides"),
	("qps_onsite_training", "QPS: Onsite Training"),
	("qps_online_training", "QPS: Online Training"),
	("qps_registration_lms", "QPS: Registration in LMS"),
	("qps_50_days_syllabus", "QPS: 50 Days MQH Syllabus"),
	("qps_mqh_quiz", "QPS: MQH Quiz"),
	("qps_meeting_educationalist", "QPS: Meeting Educationalist / Ulama"),
	("tps_noorani_qaida", "TPS: Noorani Qaida"),
	("tps_noorani_qaida_guide", "TPS: Noorani Qaida Guide"),
	("tps_noorani_qaida_workbook_khi", "TPS: Noorani Qaida Workbook"),
	("tps_1_day_tajweed_females", "TPS: 1 Day Tajweed (Females)"),
	("tps_ttc_tajweed_khi", "TPS: TTC Tajweed"),
	("tps_tajweed_customize", "TPS: Tajweed Customize"),
	("tps_tajweed_workshop_kids_khi", "TPS: Tajweed Workshop Kids"),
	("cee_elp", "CEE: ELP"),
	("cee_tecc_foundation", "CEE: TECC Foundation"),
	("cee_tecc_professional", "CEE: TECC Professional"),
	("cee_one_day_workshop", "CEE: One Day Workshop"),
)
PAGE_SIZE = 100


@frappe.whitelist()
def get_report_data(filters=None):
	if not frappe.has_permission("Field Visit", "read"):
		frappe.throw(_("You are not permitted to view Field Visit data."))

	filters = _parse_filters(filters)
	from_date = filters.get("from_date")
	to_date = filters.get("to_date")
	if from_date:
		from_date = getdate(from_date)
	if to_date:
		to_date = getdate(to_date)
	if from_date and to_date and from_date > to_date:
		frappe.throw(_("From Date cannot be after To Date."))

	where_clause, params, visit_date_expr = _build_where(filters, from_date, to_date)
	summary = _sql_summary(where_clause, params)

	for_export = cint(filters.get("for_export"))
	limit_sql = ""
	if not for_export:
		limit = min(max(cint(filters.get("limit") or PAGE_SIZE), 1), 500)
		offset = max(cint(filters.get("offset") or 0), 0)
		params["limit"] = limit
		params["offset"] = offset
		limit_sql = " LIMIT %(limit)s OFFSET %(offset)s"
	else:
		limit = summary["total_visits"]
		offset = 0

	service_select = ",\n\t\t\t".join(f"fv.{fn}" for fn, _label in PROGRAM_SERVICE_FIELDS)
	rows = frappe.db.sql(
		f"""
		SELECT
			fv.name,
			fv.type,
			fv.docstatus,
			fv.school_name,
			fv.pending_school_name,
			fv.me_school_name,
			fv.school_picture,
			fv.meeting_picture,
			fv.training_awareness_pictures,
			fv.mt_meeting_picture,
			fv.mt_remarks,
			fv.ot_remarks,
			fv.school_remarks_follow_up,
			fv.school_additional_remarks,
			fv.travel_remarks,
			fv.ot_academic_task_other,
			fv.ot_other_official_task_detail,
			fv.me_activity_status,
			fv.me_mqh_book_status,
			fv.me_mqh_book_version,
			fv.me_mqh_book_part,
			fv.me_teachers_training_session,
			fv.me_reason_of_above,
			fv.training_session_category,
			fv.training_workshop_topic,
			fv.training_no_of_participants,
			fv.training_no_of_schools_attended,
			fv.mt_mqh_sample_provided,
			fv.marketing_material_provided,
			fv.qps_affiliated,
			fv.tps_affiliated,
			fv.cee_affiliated,
			{service_select},
			{visit_date_expr} AS visit_date,
			{_school_sql("fv")} AS school,
			{_officer_sql("fv")} AS officer,
			{_category_sql("fv")} AS category,
			{_province_sql("fv")} AS province,
			{_school_unapproved_sql("fv")} AS school_unapproved,
			CASE WHEN {_school_sql("fv")} IS NULL THEN 1 ELSE 0 END AS school_missing
		FROM `tabField Visit` fv
		WHERE {where_clause}
		ORDER BY visit_date DESC, fv.modified DESC
		{limit_sql}
		""",
		params,
		as_dict=True,
	)
	_format_status(rows)
	_enrich_remarks_and_programs(rows)
	_attach_school_images(rows)

	return {
		"columns": DISPLAY_COLUMNS,
		"labels": DISPLAY_LABELS,
		"rows": rows,
		"total_count": summary["total_visits"],
		"shown_count": len(rows),
		"offset": offset,
		"limit": limit if not for_export else len(rows),
		"summary": summary,
		"staff_wise": [],
	}


@frappe.whitelist()
def download_report_excel(filters=None):
	filters = _parse_filters(filters)
	filters["for_export"] = 1
	report = get_report_data(filters=filters)
	columns = [c for c in report.get("columns", []) if c != "images"]
	labels = report.get("labels", {})
	rows = report.get("rows", [])

	xlsx_data = [[labels.get(col, col) for col in columns]]
	for row in rows:
		xlsx_data.append([_excel_value(row.get(col)) for col in columns])

	xlsx_file = make_xlsx(xlsx_data, "SME Daily Reporting")
	frappe.response["filename"] = "field_staff_report.xlsx"
	frappe.response["filecontent"] = xlsx_file.getvalue()
	frappe.response["type"] = "binary"


@frappe.whitelist()
def download_report_csv(filters=None):
	filters = _parse_filters(filters)
	filters["for_export"] = 1
	report = get_report_data(filters=filters)
	columns = [c for c in report.get("columns", []) if c != "images"]
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


def _build_where(filters, from_date, to_date):
	from tif_customization.tif_customization.field_visit_permissions import (
		apply_team_scope_to_conditions,
		can_view_all_field_visits,
		expand_staff_tokens,
		staff_is_in_team,
		staff_match_sql,
		visit_day_sql,
	)

	visit_type = filters.get("type")
	user = filters.get("user")
	province = filters.get("province")
	city = (filters.get("city") or "").strip()

	conditions = ["fv.docstatus < 2"]
	params = {}
	apply_team_scope_to_conditions(conditions, params, alias="fv")
	visit_date_expr = visit_day_sql("fv")

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
		if not can_view_all_field_visits() and not staff_is_in_team(user):
			frappe.throw(_("You can only view reports for your field staff."))
		tokens = expand_staff_tokens(user)
		params["staff_tokens"] = tuple(t.lower() for t in tokens) or ("__none__",)
		conditions.append(staff_match_sql("fv", "staff_tokens"))
	if province:
		conditions.append(f"({_province_sql('fv')}) = %(province)s")
		params["province"] = province
	if city:
		conditions.append(f"({_city_sql('fv')}) = %(city)s")
		params["city"] = city

	return " AND ".join(conditions), params, visit_date_expr


def _school_sql(alias="fv"):
	a = alias
	return f"""COALESCE(
		NULLIF(TRIM({a}.school_name), ''),
		NULLIF(TRIM({a}.pending_school_name), ''),
		NULLIF(TRIM({a}.me_school_name), ''),
		NULLIF(TRIM({a}.mt_institute_or_organization_name), ''),
		NULLIF(TRIM({a}.training_venue_name), ''),
		(
			SELECT NULLIF(TRIM(soa.school_name), '')
			FROM `tabSchool Opening Application` soa
			WHERE soa.name = {a}.reference
			LIMIT 1
		)
	)"""


def _officer_sql(alias="fv"):
	a = alias
	return f"""CASE
		WHEN {a}.type = 'Marketing' THEN COALESCE(NULLIF(TRIM({a}.visit_by), ''), {a}.owner)
		WHEN {a}.type = 'M&E' THEN COALESCE(NULLIF(TRIM({a}.me_visit_by), ''), {a}.owner)
		WHEN {a}.type = 'Training' THEN COALESCE(NULLIF(TRIM({a}.training_entry_filled_by), ''), {a}.owner)
		WHEN {a}.type = 'Meeting' THEN COALESCE(NULLIF(TRIM({a}.mt_visit_by), ''), {a}.owner)
		ELSE COALESCE(NULLIF(TRIM({a}.visit_by), ''), {a}.owner)
	END"""


def _province_sql(alias="fv"):
	"""Show a province whenever one was entered, on any activity type.

	The form stores it on province, me_province, or training_province
	depending on the activity. Use the first one that has a value.
	"""
	a = alias
	return f"""COALESCE(
		NULLIF(TRIM({a}.province), ''),
		NULLIF(TRIM({a}.me_province), ''),
		NULLIF(TRIM({a}.training_province), '')
	)"""


def _city_sql(alias="fv"):
	"""City from any activity type: visits, M&E, training, or meeting."""
	a = alias
	return f"""COALESCE(
		NULLIF(TRIM({a}.city), ''),
		NULLIF(TRIM({a}.me_city), ''),
		NULLIF(TRIM({a}.training_city), ''),
		NULLIF(TRIM({a}.mt_city), '')
	)"""


def _category_sql(alias="fv"):
	a = alias
	return f"""COALESCE(
		NULLIF(TRIM({a}.marketing_visit_category), ''),
		NULLIF(TRIM({a}.me_activity_status), ''),
		NULLIF(TRIM({a}.training_session_category), '')
	)"""


def _school_unapproved_sql(alias="fv"):
	a = alias
	return f"""CASE
		WHEN NULLIF(TRIM({a}.school_name), '') IS NOT NULL THEN 0
		WHEN NULLIF(TRIM({a}.pending_school_name), '') IS NOT NULL THEN 1
		WHEN EXISTS (
			SELECT 1
			FROM `tabSchool Opening Application` soa
			WHERE soa.name = {a}.reference
			LIMIT 1
		) THEN 1
		ELSE 0
	END"""


def _sql_summary(where_clause, params):
	type_rows = frappe.db.sql(
		f"""
		SELECT IFNULL(NULLIF(TRIM(fv.type), ''), 'Other') AS type, COUNT(*) AS cnt
		FROM `tabField Visit` fv
		WHERE {where_clause}
		GROUP BY 1
		""",
		params,
		as_dict=True,
	)
	type_counts = {"Marketing": 0, "M&E": 0, "Training": 0, "Meeting": 0, "Other": 0}
	total = 0
	for r in type_rows:
		n = cint(r.cnt)
		total += n
		if r.type in type_counts:
			type_counts[r.type] += n
		else:
			type_counts["Other"] += n

	officers = frappe.db.sql(
		f"""
		SELECT DISTINCT {_officer_sql("fv")} AS officer
		FROM `tabField Visit` fv
		WHERE {where_clause}
		""",
		params,
		as_dict=True,
	)
	canonical = _staff_canonical_map()
	raw = [(r.officer or "").strip() for r in officers]
	user_names = _get_user_names(raw)
	unique = set()
	for staff_value in raw:
		mapped = user_names.get(staff_value) or staff_value or _("Unassigned")
		unique.add(_canonical_staff_label(mapped, canonical).casefold())
	active_staff = len(unique)

	return {
		"total_visits": total,
		"marketing_visits": type_counts["Marketing"],
		"me_visits": type_counts["M&E"],
		"training_visits": type_counts["Training"],
		"meeting_visits": type_counts["Meeting"],
		"other_visits": type_counts["Other"],
		"active_staff": active_staff,
		"visits_per_staff": round(total / active_staff, 1) if active_staff else 0,
	}


def _format_status(rows):
	labels = {0: "Draft", 1: "Submitted", 2: "Cancelled"}
	for row in rows:
		row["docstatus"] = labels.get(row.get("docstatus"), row.get("docstatus"))


def _clean_text(value):
	if value is None:
		return ""
	text = str(value).replace("\r", "\n").strip()
	text = re.sub(r"\n+", "; ", text)
	text = re.sub(r"\s+", " ", text).strip()
	return text


def _strip_pending_school_opening(text: str) -> str:
	"""Drop auto-inserted Pending school (School Opening SOA-…) lines from remarks."""
	if not text:
		return ""
	parts = re.split(r"\s*[;\n]\s*|\s*\|\s*", text)
	kept = []
	for part in parts:
		part = part.strip()
		if not part:
			continue
		if re.match(r"(?i)^pending\s+school\s*\(school\s+opening", part):
			continue
		if re.match(r"(?i)^pending\s+school\b", part) and "school opening" in part.lower():
			continue
		kept.append(part)
	# Also strip inline prefix: "Pending school (School Opening SOA-x): Name; rest"
	out = "; ".join(kept)
	out = re.sub(
		r"(?i)pending\s+school\s*\(school\s+opening[^)]*\):\s*[^;|]*[;|]?\s*",
		"",
		out,
	).strip(" ;|")
	return _clean_text(out)


def _yes_value(value) -> bool:
	raw = (str(value) if value is not None else "").strip().lower()
	return raw in ("1", "yes", "true", "y")


def _enrich_remarks_and_programs(rows):
	"""Same Books / Workshop / Program / Remarks headings as SME card drilldowns."""
	from tif_customization.tif_customization.api.field_visit_drilldown import (
		_books_heading,
		_program_heading,
		_visit_remarks,
		_workshop_heading,
	)

	customers = set()
	for row in rows:
		for key in ("school_name", "me_school_name"):
			cust = (row.get(key) or "").strip()
			if cust:
				customers.add(cust)
	so_books = _sales_order_books_by_customer(customers)

	drop_keys = [
		"mt_remarks",
		"ot_remarks",
		"school_remarks_follow_up",
		"school_additional_remarks",
		"travel_remarks",
		"ot_academic_task_other",
		"ot_other_official_task_detail",
		"me_activity_status",
		"me_mqh_book_status",
		"me_mqh_book_version",
		"me_mqh_book_part",
		"me_teachers_training_session",
		"me_reason_of_above",
		"training_session_category",
		"training_workshop_topic",
		"training_no_of_participants",
		"training_no_of_schools_attended",
		"mt_mqh_sample_provided",
		"marketing_material_provided",
		"qps_affiliated",
		"tps_affiliated",
		"cee_affiliated",
		"school_name",
		"pending_school_name",
		"me_school_name",
		*[fn for fn, _label in PROGRAM_SERVICE_FIELDS],
	]

	for row in rows:
		# Append Sales Order books into Program heading when present.
		cust = (row.get("school_name") or row.get("me_school_name") or "").strip()
		so_items = so_books.get(cust) or []
		if so_items:
			so_text = "Sales Order: " + "; ".join(so_items[:8])
			if len(so_items) > 8:
				so_text += f" (+{len(so_items) - 8} more)"
			# Temporarily stash so _program_heading-style text can include SO in remarks.
			row["_so_books_extra"] = so_text

		remarks = _visit_remarks(row)
		if row.get("_so_books_extra"):
			# Inject SO books into Program: section.
			parts = remarks.split(" | ")
			for i, part in enumerate(parts):
				if part.startswith("Program:"):
					body = part[len("Program:") :].strip()
					if body in ("", "—"):
						parts[i] = f"Program: {row['_so_books_extra']}"
					else:
						parts[i] = f"Program: {body} · {row['_so_books_extra']}"
					break
			remarks = " | ".join(parts)
		row["remarks"] = remarks

		# Compact programs column mirrors the three headings (for export / filter).
		program_bits = []
		books = _books_heading(row)
		if books:
			program_bits.append(f"Books: {books}")
		workshop = _workshop_heading(row)
		if workshop:
			program_bits.append(f"Workshop: {workshop}")
		program = _program_heading(row)
		if program:
			program_bits.append(f"Program: {program}")
		if row.get("_so_books_extra"):
			program_bits.append(row["_so_books_extra"])
		row["programs"] = " | ".join(program_bits) if program_bits else ""

		for key in drop_keys + ["_so_books_extra"]:
			row.pop(key, None)


def _sales_order_books_by_customer(customers):
	"""Recent submitted Sales Order item names per school (Customer)."""
	if not customers:
		return {}
	rows = frappe.db.sql(
		"""
		SELECT
			so.customer,
			soi.item_name,
			soi.item_code,
			SUM(soi.qty) AS qty,
			MAX(so.transaction_date) AS last_date
		FROM `tabSales Order` so
		INNER JOIN `tabSales Order Item` soi ON soi.parent = so.name
		WHERE so.docstatus = 1
		  AND so.customer IN %(customers)s
		  AND so.transaction_date >= DATE_SUB(CURDATE(), INTERVAL 18 MONTH)
		GROUP BY so.customer, soi.item_name, soi.item_code
		ORDER BY so.customer, last_date DESC, soi.item_name
		""",
		{"customers": tuple(customers)},
		as_dict=True,
	)
	out = {}
	for row in rows:
		cust = (row.customer or "").strip()
		if not cust:
			continue
		name = _clean_text(row.item_name or row.item_code)
		if not name:
			continue
		qty = cint(row.qty)
		label = f"{name} × {qty}" if qty else name
		out.setdefault(cust, []).append(label)
	return out


def _attach_school_images(rows):
	urls = []
	for row in rows:
		for field, _label in IMAGE_FIELDS:
			url = (row.get(field) or "").strip()
			if url:
				urls.append(url)
	file_times = _file_upload_times(urls)

	for row in rows:
		images = []
		seen = set()
		for field, label in IMAGE_FIELDS:
			url = (row.pop(field, None) or "").strip()
			if not url or url in seen:
				continue
			seen.add(url)
			captured = _guess_capture_time_from_filename(url)
			uploaded = file_times.get(url)
			if captured:
				taken_at = captured
				taken_label = _("Captured")
			elif uploaded:
				taken_at = uploaded
				taken_label = _("Uploaded")
			else:
				taken_at = ""
				taken_label = ""
			images.append(
				{
					"label": label,
					"url": url,
					"taken_at": taken_at,
					"taken_label": taken_label,
				}
			)
		row["images"] = images


def _file_upload_times(urls):
	"""Earliest File.creation per file_url (upload / attach time)."""
	unique = sorted({(u or "").strip() for u in urls if (u or "").strip()})
	if not unique:
		return {}
	rows = frappe.db.sql(
		"""
		SELECT file_url, MIN(creation) AS creation
		FROM `tabFile`
		WHERE file_url IN %(urls)s
		GROUP BY file_url
		""",
		{"urls": tuple(unique)},
		as_dict=True,
	)
	out = {}
	for row in rows:
		url = (row.file_url or "").strip()
		if url and row.creation:
			out[url] = str(row.creation)[:19]
	return out


def _guess_capture_time_from_filename(url: str) -> str:
	"""Best-effort camera/WhatsApp time from the file name (not EXIF)."""
	name = (url or "").rsplit("/", 1)[-1]
	# IMG_20260915_105654 / IMG20260915105654
	m = re.search(r"(20\d{2})(\d{2})(\d{2})[_-]?(\d{2})(\d{2})(\d{2})", name)
	if m:
		y, mo, d, hh, mm, ss = m.groups()
		return f"{y}-{mo}-{d} {hh}:{mm}:{ss}"
	# 2026-10-03 style
	m = re.search(r"(20\d{2})[-_](\d{2})[-_](\d{2})", name)
	if m:
		y, mo, d = m.groups()
		return f"{y}-{mo}-{d}"
	# WhatsApp / phone compact date: IMG-20261003-WA0009
	m = re.search(r"(20\d{2})(\d{2})(\d{2})", name)
	if m:
		y, mo, d = m.groups()
		if 1 <= int(mo) <= 12 and 1 <= int(d) <= 31:
			return f"{y}-{mo}-{d}"
	return ""


def _build_summary(rows):
	type_counts = {"Marketing": 0, "M&E": 0, "Training": 0, "Meeting": 0, "Other": 0}
	staff_counts = {}
	raw_staff = [_get_field_staff(row) for row in rows]
	canonical = _staff_canonical_map()
	user_names = _get_user_names(raw_staff)

	for row, staff_value in zip(rows, raw_staff):
		visit_type = row.get("type") or "Other"
		if visit_type in type_counts:
			type_counts[visit_type] += 1
		else:
			type_counts["Other"] += 1

		mapped = user_names.get(staff_value) or staff_value or _("Unassigned")
		staff = _canonical_staff_label(mapped, canonical)
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


def _staff_canonical_map():
	"""Map emails / spellings (Abdul.Kabeer) to Employee Name so one person is one staff."""
	cache = frappe.cache()
	cached = cache.get_value("tif_fsr_staff_canonical")
	if cached:
		return cached
	mapping = {}
	employees = frappe.get_all(
		"Employee",
		fields=["employee_name", "user_id"],
		limit_page_length=5000,
	)
	for emp in employees:
		name = (emp.employee_name or "").strip()
		if not name:
			continue
		mapping[name.lower()] = name
		mapping[name.replace(" ", ".").lower()] = name
		mapping[name.replace(" ", "").lower()] = name
		compact = re.sub(r"[^a-z]", "", name.lower())
		if compact:
			mapping[compact] = name
		if emp.user_id:
			mapping[emp.user_id.strip().lower()] = name
	cache.set_value("tif_fsr_staff_canonical", mapping, expires_in_sec=3600)
	return mapping


def _canonical_staff_label(raw, mapping):
	s = (raw or "").strip()
	if not s:
		return _("Unassigned")
	return (
		mapping.get(s.lower())
		or mapping.get(re.sub(r"[^a-z]", "", s.lower()))
		or s
	)


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
