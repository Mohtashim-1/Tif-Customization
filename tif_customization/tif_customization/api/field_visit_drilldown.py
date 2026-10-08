# Copyright (c) 2026, TIF Customization and contributors
# License: MIT
"""List the Field Visits behind a report number (click-through)."""

from __future__ import annotations

import json
import re

import frappe
from frappe import _
from frappe.utils import cint, getdate

from tif_customization.tif_customization.field_visit_permissions import (
	apply_team_scope_to_conditions,
	expand_staff_tokens,
	staff_match_sql,
	visit_day_sql,
)
from tif_customization.tif_customization.model_school import department_count_sql

METRIC_LABELS = {
	"visits": _("Total Field Visits"),
	"all": _("Total Field Visits"),
	"total": _("Total Field Visits"),
	"marketing": _("Marketing Visits"),
	"monitoring": _("Monitoring (M&E) Visits"),
	"me": _("M&E Visits"),
	"meeting": _("Meetings"),
	"training": _("Workshop Conducted Onsite"),
	"workshop_arranged": _("Workshop Arranged"),
	"workshop_conducted": _("Workshop Conducted Onsite"),
	"academic": _("Academic / Other"),
	"other": _("Other Visits"),
	"followup": _("Follow up Visits"),
	"followup_other": _("Followup & Other Visits"),
	"followup_and_other": _("Followup & Other Visits"),
	"new": _("New School Visits"),
	"me_active": _("M&E Active"),
	"me_inactive": _("M&E Inactive"),
	"grand_total": _("Grand Total (Marketing + Meetings + M&E)"),
	"half_day_workshop": _("Half Day Workshop"),
	"full_day_session": _("Full Day Session"),
	"meeting_ulama": _("Meeting / Ulama and Educationist"),
	"teachers_training_meeting": _("Teachers Training Meeting"),
	"headoffice_visit": _("Head office / Regional / Out of station"),
	"academic_task": _("Academic Task (Content Development)"),
	"other_official": _("Other Official Tasks"),
	"co_curricular": _("Stall Activity / Exhibition"),
	"quiz": _("Quiz Arranged"),
	"new_school_registration": _("Registered Schools"),
	"new_schools": _("Registered Schools"),
	"new_school": _("Registered Schools"),
	"workshop_registration": _("Workshop Participants"),
	"enrolment": _("Enrollment of Participants in Online Course"),
	"volunteers": _("Volunteer visits"),
	"schools": _("Training visits (schools attended)"),
	"participants": _("Training visits (participants)"),
	"school_visits": _("School Visits"),
	"school_visit": _("School Visits"),
	"visited_days": _("Distinct visit days (Marketing / Meeting / M&E / Training)"),
	"model_school_a": _("Model School A"),
	"model_school_b": _("Model School B"),
	"model_a": _("Model A (3 departments)"),
	"model_b": _("Model B (2 departments)"),
	"model_c": _("Model C (1 department or not affiliated)"),
}

TYPE_TO_METRIC = {
	"Marketing": "marketing",
	"Visits": "marketing",
	"M&E": "me",
	"Meeting": "meeting",
	"Training": "training",
	"Workshop": "training",
	"Workshop Conducted": "training",
	"Workshop Arranged": "training",
	"Academic / Other Official Tasks": "academic",
	"Academic Task": "academic_task",
	"Other Official Tasks": "other_official",
	"Co-curricular Activity": "co_curricular",
	"Quiz Arranged": "quiz",
	"Other": "other",
}


def _parse(filters):
	if isinstance(filters, str):
		try:
			return json.loads(filters) or {}
		except Exception:
			return {}
	return filters or {}


def _school_visit_sql(alias: str) -> str:
	"""Marketing + follow-up Visits + M&E. Same set as Total School Visit."""
	a = alias
	return (
		f"{a}.type = 'Marketing'"
		f" OR ({a}.type = 'Visits' AND IFNULL({a}.marketing_visit_category, '') != 'New')"
		f" OR {a}.type = 'M&E'"
	)


def _number_of_school_sql(alias: str) -> str:
	"""Follow-up Visits + New School visits. Same set as the Number of School card."""
	a = alias
	return (
		f"{a}.type = 'Visits'"
		f" OR {a}.type = 'Registration of New Schools'"
		f" OR ({a}.type = 'Marketing' AND IFNULL({a}.marketing_visit_category, '') = 'New')"
	)


def _yes_field_sql(field: str, alias: str = "fv") -> str:
	return f"LOWER(TRIM(IFNULL({alias}.{field},''))) IN ('1','yes','true','y')"


def registered_school_sql(alias: str = "fv") -> str:
	"""School where any book, workshop, or program is running on the visit."""
	a = alias
	yes = lambda f: _yes_field_sql(f, a)
	return f"""(
		IFNULL({a}.me_mqh_book_status, '') != ''
		OR {yes("qps_mqh_books")}
		OR {yes("qps_mqh_teachers_guides")}
		OR {yes("mt_mqh_sample_provided")}
		OR {yes("tps_noorani_qaida")}
		OR {yes("tps_noorani_qaida_guide")}
		OR {yes("tps_noorani_qaida_workbook_khi")}
		OR {a}.type IN (
			'Workshop Conducted', 'Workshop', 'Workshop Arranged',
			'Training', 'Teachers Training Meeting'
		)
		OR {yes("me_teachers_training_session")}
		OR {yes("qps_onsite_training")}
		OR {yes("qps_online_training")}
		OR {yes("tps_1_day_tajweed_females")}
		OR {yes("tps_ttc_tajweed_khi")}
		OR {yes("tps_tajweed_customize")}
		OR {yes("tps_tajweed_workshop_kids_khi")}
		OR {yes("cee_one_day_workshop")}
		OR IFNULL({a}.qps_affiliated, '') LIKE 'Yes%%'
		OR IFNULL({a}.tps_affiliated, '') LIKE 'Yes%%'
		OR IFNULL({a}.cee_affiliated, '') LIKE 'Yes%%'
		OR {yes("qps_registration_lms")}
		OR {yes("qps_50_days_syllabus")}
		OR {yes("qps_mqh_quiz")}
		OR {yes("cee_elp")}
		OR {yes("cee_tecc_foundation")}
		OR {yes("cee_tecc_professional")}
	)"""


def _metric_condition(metric: str, alias: str = "fv") -> str:
	a = alias
	m = (metric or "visits").strip().lower()
	if m in ("visits", "all", "total"):
		return "1=1"
	if m == "visited_days":
		return f"{a}.type IN ('Marketing', 'Visits', 'Meeting', 'M&E', 'Training', 'Workshop', 'Workshop Conducted', 'Workshop Arranged', 'Academic Task', 'Other Official Tasks')"
	if m in ("school_visits", "school_visit"):
		return f"{a}.type IN ('Marketing', 'Visits', 'M&E')"
	if m == "marketing":
		return f"""(
			{a}.type = 'Marketing'
			OR {a}.type = 'Registration of New Schools'
			OR ({a}.type = 'Visits' AND IFNULL({a}.marketing_visit_category, '') = 'New')
		)"""
	if m in ("me", "monitoring"):
		return f"{a}.type = 'M&E'"
	if m == "meeting":
		return f"{a}.type IN ('Meeting', 'Meeting with Ulama and Educationist')"
	if m == "workshop_arranged":
		return f"{a}.type = 'Workshop Arranged'"
	if m == "workshop_conducted":
		return f"{a}.type IN ('Workshop Conducted', 'Workshop')"
	if m == "training":
		return f"{a}.type IN ('Training', 'Workshop', 'Workshop Conducted', 'Workshop Arranged')"
	if m == "half_day_workshop":
		return f"""{a}.type IN ('Training', 'Workshop', 'Workshop Conducted', 'Workshop Arranged') AND LOWER(IFNULL({a}.training_session_category,'')) LIKE '%%half%%'"""
	if m == "full_day_session":
		return f"""{a}.type IN ('Training', 'Workshop', 'Workshop Conducted', 'Workshop Arranged') AND LOWER(IFNULL({a}.training_session_category,'')) NOT LIKE '%%half%%'"""
	if m == "academic_task":
		return f"{a}.type IN ('Academic Task', 'Academic', 'Academic / Other Official Tasks')"
	if m == "other_official":
		return f"{a}.type = 'Other Official Tasks'"
	if m in ("academic",):
		return f"{a}.type IN ('Academic Task', 'Academic', 'Other Official Tasks', 'Academic / Other Official Tasks', 'Other')"
	if m == "other":
		return f"{a}.type NOT IN ('Marketing', 'Visits', 'M&E', 'Training', 'Meeting')"
	if m == "followup":
		return f"{a}.type = 'Visits' AND IFNULL({a}.marketing_visit_category, '') != 'New'"
	if m in ("followup_other", "followup_and_other"):
		return f"""(
			{a}.type = 'Marketing'
			OR ({a}.type = 'Visits' AND IFNULL({a}.marketing_visit_category, '') != 'New')
		)"""
	if m == "new" or m == "new_school_registration":
		return f"""(
			{a}.type = 'Registration of New Schools'
			OR ({a}.type IN ('Marketing', 'Visits') AND {a}.marketing_visit_category = 'New')
		)"""
	if m in ("new_schools", "new_school", "active_schools"):
		# Distinct schools counted in KPI via registered_school_sql; drilldown shows matching visits.
		return registered_school_sql(a)
	if m in ("inactive_schools", "model_school_0", "model_0"):
		return f"NOT ({registered_school_sql(a)})"
	if m == "online_workshop":
		return f"""{a}.type IN ('Workshop Conducted', 'Workshop', 'Workshop Arranged', 'Training')
			AND LOWER(IFNULL({a}.training_mode, '')) LIKE '%%online%%'"""
	if m == "online_participants":
		return f"""{a}.type IN ('Workshop Conducted', 'Workshop', 'Workshop Arranged', 'Training')
			AND LOWER(IFNULL({a}.training_mode, '')) LIKE '%%online%%'"""
	if m == "model_school_a":
		return f"({registered_school_sql(a)}) AND {department_count_sql(a)} >= 3"
	if m == "model_school_b":
		return f"({registered_school_sql(a)}) AND {department_count_sql(a)} = 2"
	if m == "model_school_c":
		return f"({registered_school_sql(a)}) AND {department_count_sql(a)} <= 1"
	if m == "model_a":
		return f"({_number_of_school_sql(a)}) AND {department_count_sql(a)} >= 3"
	if m == "model_b":
		return f"({_number_of_school_sql(a)}) AND {department_count_sql(a)} = 2"
	if m == "model_c":
		return f"({_number_of_school_sql(a)}) AND {department_count_sql(a)} <= 1"
	if m == "me_active":
		return f"""{a}.type = 'M&E' AND LOWER(REPLACE(REPLACE(IFNULL({a}.me_activity_status,''),'-',' '),'  ',' ')) = 'active'"""
	if m == "me_inactive":
		return f"""{a}.type = 'M&E' AND LOWER(REPLACE(REPLACE(IFNULL({a}.me_activity_status,''),'-',' '),'  ',' ')) IN ('inactive', 'in active')"""
	if m == "grand_total":
		return f"{a}.type IN ('Marketing', 'Visits', 'Meeting', 'M&E')"
	if m == "workshop_registration":
		return f"{a}.type IN ('Workshop Conducted', 'Workshop')"
	if m in ("schools", "participants"):
		return f"{a}.type IN ('Training', 'Workshop', 'Workshop Conducted', 'Workshop Arranged', 'Teachers Training Meeting')"
	if m == "enrolment":
		return f"""EXISTS (
			SELECT 1 FROM `tabField Visit Enrolment Participant` ep
			WHERE ep.parent = {a}.name
		)"""
	if m == "volunteers":
		return f"""EXISTS (
			SELECT 1 FROM `tabField Visit Volunteer` vv
			WHERE vv.parent = {a}.name
		)"""
	if m == "meeting_ulama":
		return f"""(
			{a}.type IN ('Meeting', 'Meeting with Ulama and Educationist')
			OR ({a}.type IN ('Marketing', 'Visits') AND (
				LOWER(IFNULL({a}.meeting_with,'')) LIKE '%%ulama%%'
				OR LOWER(IFNULL({a}.meeting_with,'')) LIKE '%%educationist%%'
				OR LOWER(IFNULL({a}.designation,'')) LIKE '%%ulama%%'
			))
		)"""
	if m == "teachers_training_meeting":
		return f"""(
			{a}.type = 'Teachers Training Meeting'
			OR ({a}.type = 'M&E' AND IFNULL({a}.me_teachers_training_session, 0) = 1)
		)"""
	if m == "headoffice_visit":
		return f"""(
			{a}.type = 'Headoffice/ Regional Office/ Out of Station Visit'
			OR LOWER(IFNULL({a}.reference,'')) LIKE '%%head%%office%%'
			OR LOWER(IFNULL({a}.reference,'')) LIKE '%%regional office%%'
			OR LOWER(IFNULL({a}.reference,'')) LIKE '%%out of station%%'
			OR LOWER(IFNULL({a}.me_new_school_address,'')) LIKE '%%head%%office%%'
		)"""
	if m == "quiz":
		return f"{a}.type = 'Quiz Arranged'"
	if m == "co_curricular":
		return f"{a}.type = 'Co-curricular Activity'"
	return "1=0"


def get_visit_type_breakdown(from_date, to_date, staff="", submitted_only=False):
	"""Counts of every Field Visit type in the date range (no 500-row cap)."""
	visit_day = visit_day_sql("fv")
	ds = "fv.docstatus = 1" if submitted_only else "fv.docstatus < 2"
	conditions = [
		ds,
		f"{visit_day} BETWEEN %(from_date)s AND %(to_date)s",
	]
	params = {"from_date": from_date, "to_date": to_date}
	apply_team_scope_to_conditions(conditions, params, alias="fv")
	staff = (staff or "").strip()
	if staff:
		tokens = expand_staff_tokens(staff)
		params["staff_tokens"] = tuple(t.lower() for t in tokens) or ("__none__",)
		conditions.append(staff_match_sql("fv", "staff_tokens"))

	where_sql = " AND ".join(f"({c})" for c in conditions)
	rows = frappe.db.sql(
		f"""
		SELECT IFNULL(NULLIF(TRIM(fv.type), ''), 'Other') AS type, COUNT(*) AS count
		FROM `tabField Visit` fv
		WHERE {where_sql}
		GROUP BY 1
		ORDER BY count DESC, type
		""",
		params,
		as_dict=True,
	)
	breakdown = []
	total = 0
	for r in rows:
		total += cint(r.count)
		breakdown.append(
			{
				"type": r.type,
				"count": cint(r.count),
				"metric": TYPE_TO_METRIC.get(r.type, "other"),
			}
		)
	return {"total": total, "breakdown": breakdown}


def _strip_pending_school_opening(text: str) -> str:
	"""Remove auto note: Pending school (School Opening SOA-…): name."""
	if not text:
		return ""
	text = str(text).replace("\r", "\n")
	# Whole lines that are only the pending-school note
	lines = []
	for line in text.split("\n"):
		stripped = line.strip()
		if re.match(r"(?i)^pending\s+school\s*\(school\s+opening", stripped):
			continue
		if re.match(r"(?i)^pending\s+school\b", stripped) and "school opening" in stripped.lower():
			continue
		lines.append(line)
	text = "\n".join(lines)
	# Inline prefix before the real officer notes
	text = re.sub(
		r"(?i)pending\s+school\s*\(school\s+opening[^)]*\):\s*[^\n|;]*[\n|;]?\s*",
		"",
		text,
	)
	return " ".join(text.split()).strip(" |;")


PROGRAM_SERVICE_LABELS = (
	("qps_mqh_books", "MQH Books"),
	("qps_mqh_teachers_guides", "MQH Teachers Guides"),
	("qps_onsite_training", "Onsite Training"),
	("qps_online_training", "Online Training"),
	("qps_registration_lms", "LMS Registration"),
	("qps_50_days_syllabus", "50 Days MQH Syllabus"),
	("qps_mqh_quiz", "MQH Quiz"),
	("tps_noorani_qaida", "Noorani Qaida"),
	("tps_noorani_qaida_guide", "Noorani Qaida Guide"),
	("tps_noorani_qaida_workbook_khi", "Noorani Qaida Workbook"),
	("tps_1_day_tajweed_females", "1 Day Tajweed (Females)"),
	("tps_ttc_tajweed_khi", "TTC Tajweed"),
	("tps_tajweed_customize", "Tajweed Customize"),
	("tps_tajweed_workshop_kids_khi", "Tajweed Workshop Kids"),
	("cee_elp", "ELP"),
	("cee_tecc_foundation", "TECC Foundation"),
	("cee_tecc_professional", "TECC Professional"),
	("cee_one_day_workshop", "One Day Workshop"),
)

VISIT_REMARKS_EXTRA_SELECT = """
	fv.me_mqh_book_status,
	fv.me_mqh_book_version,
	fv.me_mqh_book_part,
	fv.me_teachers_training_session,
	fv.mt_mqh_sample_provided,
	fv.training_session_category,
	fv.training_workshop_topic,
	fv.training_no_of_participants,
	fv.qps_affiliated,
	fv.tps_affiliated,
	fv.cee_affiliated,
	fv.qps_mqh_books,
	fv.qps_mqh_teachers_guides,
	fv.qps_onsite_training,
	fv.qps_online_training,
	fv.qps_registration_lms,
	fv.qps_50_days_syllabus,
	fv.qps_mqh_quiz,
	fv.tps_noorani_qaida,
	fv.tps_noorani_qaida_guide,
	fv.tps_noorani_qaida_workbook_khi,
	fv.tps_1_day_tajweed_females,
	fv.tps_ttc_tajweed_khi,
	fv.tps_tajweed_customize,
	fv.tps_tajweed_workshop_kids_khi,
	fv.cee_elp,
	fv.cee_tecc_foundation,
	fv.cee_tecc_professional,
	fv.cee_one_day_workshop
"""


def _yes(value) -> bool:
	return str(value or "").strip().lower() in ("1", "yes", "true", "y")


def _clean(value) -> str:
	return " ".join(str(value or "").replace("\r", "\n").split()).strip()


def _books_heading(row) -> str:
	bits = []
	status = _clean(row.get("me_mqh_book_status"))
	version = _clean(row.get("me_mqh_book_version"))
	parts = _clean(row.get("me_mqh_book_part")).replace(" ; ", "; ")
	if status:
		bits.append(status)
	if version:
		bits.append(version)
	if parts:
		bits.append(parts)
	if _yes(row.get("qps_mqh_books")):
		bits.append("MQH Books marked Yes")
	if _yes(row.get("qps_mqh_teachers_guides")):
		bits.append("MQH Teachers Guides Yes")
	if _yes(row.get("mt_mqh_sample_provided")):
		bits.append("Mutalae Quran sample provided")
	if _yes(row.get("tps_noorani_qaida")):
		bits.append("Noorani Qaida")
	if _yes(row.get("tps_noorani_qaida_workbook_khi")):
		bits.append("Noorani Qaida Workbook")
	return " · ".join(bits)


def _workshop_heading(row) -> str:
	bits = []
	vtype = _clean(row.get("type"))
	workshop_types = {
		"Workshop Conducted",
		"Workshop",
		"Workshop Arranged",
		"Training",
		"Teachers Training Meeting",
	}
	if vtype == "Workshop Conducted":
		bits.append("Conducted")
	elif vtype in workshop_types:
		bits.append(vtype)
	cat = _clean(row.get("training_session_category"))
	if cat:
		bits.append(cat)
	topic = _clean(row.get("training_workshop_topic"))
	if topic:
		bits.append(topic)
	teachers = _clean(row.get("me_teachers_training_session"))
	if teachers in ("1", "Yes", "yes"):
		bits.append("Teachers training Yes")
	elif teachers in ("No", "no"):
		bits.append("Teachers training No")
	if _yes(row.get("qps_onsite_training")):
		bits.append("Onsite Training Yes")
	if _yes(row.get("qps_online_training")):
		bits.append("Online Training Yes")
	participants = row.get("training_no_of_participants")
	if participants not in (None, "", 0, "0") and (vtype in workshop_types or bits):
		bits.append(f"Participants {participants}")
	return " · ".join(bits)


def _program_heading(row) -> str:
	bits = []
	for key, label in (
		("qps_affiliated", "QPS"),
		("tps_affiliated", "TPS"),
		("cee_affiliated", "CEE"),
	):
		aff = _clean(row.get(key))
		if aff and aff.lower().startswith("yes"):
			bits.append(f"{label}: {aff}")
	marked = []
	for field, label in PROGRAM_SERVICE_LABELS:
		if field in (
			"qps_mqh_books",
			"qps_mqh_teachers_guides",
			"qps_onsite_training",
			"qps_online_training",
			"tps_noorani_qaida",
			"tps_noorani_qaida_workbook_khi",
		):
			# Already covered under Books / Workshop headings.
			continue
		if _yes(row.get(field)):
			marked.append(label)
	if marked:
		bits.append("; ".join(marked))
	return " · ".join(bits)


def _me_norm(value) -> str:
	raw = (value or "").strip().lower().replace("-", " ").replace("_", " ")
	raw = " ".join(raw.split())
	if raw == "active":
		return "active"
	if raw in ("inactive", "in active"):
		return "inactive"
	return ""


def _me_status_note(row) -> tuple[str, str]:
	"""Active / In-Active plus why.

	Book status (Mutalae Quran) is filled more often than Active / Inactive.
	A blank activity field used to be shown as In-Active even when the school status was Active.
	"""
	activity = _me_norm(row.get("me_activity_status"))
	book = _me_norm(row.get("me_mqh_book_status"))
	reason = _clean(row.get("me_inactive_reasons") or row.get("me_reason_of_above"))
	if book == "active" or (activity == "active" and book != "inactive"):
		if activity == "inactive" and book == "active":
			note = "Activity status says In-Active, but school status is Active"
			if reason:
				note = f"{note}. Reason entered: {reason}"
			return "Active", note
		return "Active", ""
	if book == "inactive" or activity == "inactive":
		why = reason or "Reason not entered on the Field Visit"
		if activity == "active" and book == "inactive":
			why = f"School status is In-Active while activity status is Active. {why}"
		return "In-Active", why
	return "Status not filled", "Active / Inactive was left blank, so this visit is not counted as In-Active"


def _visit_remarks(row) -> str:
	"""Books / Workshop / Program / Visit Summary (every card drilldown)."""
	notes = []
	for key in (
		"mt_remarks",
		"ot_remarks",
		"school_remarks_follow_up",
		"school_additional_remarks",
		"travel_remarks",
		"ot_academic_task_other",
		"ot_other_official_task_detail",
	):
		val = _strip_pending_school_opening((row.get(key) or "").strip())
		if val and val not in notes:
			notes.append(val)
	notes_text = "; ".join(notes) if notes else "—"
	parts = [
		f"Books: {_books_heading(row) or '—'}",
		f"Workshop: {_workshop_heading(row) or '—'}",
		f"Program: {_program_heading(row) or '—'}",
		f"Visit Summary: {notes_text}",
	]
	if (row.get("type") or "") == "M&E":
		label, why = _me_status_note(row)
		if why:
			parts.append(f"Inactive reason: {label}. {why}")
	return " | ".join(parts)


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


def _me_activity_bucket(status: str | None, book_status: str | None = None) -> str:
	"""M&E status. Active book status is not treated as In-Active when activity is blank."""
	label, _why = _me_status_note(
		{"me_activity_status": status, "me_mqh_book_status": book_status}
	)
	return label


def _monitoring_category_breakdown(rows: list) -> list[dict]:
	buckets: dict[str, int] = {}
	for r in rows:
		label = _me_activity_bucket(r.get("me_activity_status"), r.get("me_mqh_book_status"))
		buckets[label] = buckets.get(label, 0) + 1
	order = {_("Active"): 0, _("In-Active"): 1}
	return sorted(
		[{"type": k, "count": v} for k, v in buckets.items()],
		key=lambda x: (order.get(x["type"], 9), x["type"]),
	)


def _enrolment_participant_rows(visits: list) -> list[dict]:
	"""One row per enrolled participant, tagged with the field officer on the visit."""
	if not visits or not frappe.db.table_exists("Field Visit Enrolment Participant"):
		return []
	by_visit = {v["name"]: v for v in visits if v.get("name")}
	if not by_visit:
		return []
	rows = frappe.db.sql(
		"""
		SELECT
			parent AS visit,
			participant_name,
			contact_number,
			city,
			province,
			enroll_in_course,
			date_of_enrolment,
			other_special_session_name
		FROM `tabField Visit Enrolment Participant`
		WHERE parent IN %(names)s
		ORDER BY IFNULL(date_of_enrolment, '1000-01-01') DESC, idx ASC
		""",
		{"names": tuple(by_visit)},
		as_dict=True,
	)
	out = []
	for row in rows:
		visit = by_visit.get(row.visit) or {}
		course = (row.enroll_in_course or "").strip()
		if course == "Other Special Session Offered by TIF" and (row.other_special_session_name or "").strip():
			course = (row.other_special_session_name or "").strip()
		out.append(
			{
				"name": (row.participant_name or "").strip(),
				"contact": (row.contact_number or "").strip(),
				"city": (row.city or "").strip(),
				"province": (row.province or "").strip(),
				"course": course,
				"date": str(row.date_of_enrolment) if row.date_of_enrolment else (visit.get("visit_date") or ""),
				"officer": visit.get("officer") or "",
				"school": visit.get("school") or "",
				"visit": row.visit,
				"url": visit.get("url") or f"/app/field-visit/{row.visit}",
			}
		)
	return out


def _attendance_file_path(file_url: str) -> str | None:
	url = (file_url or "").split("?")[0].strip()
	if url.startswith("/private/files/"):
		name = url.split("/private/files/", 1)[1]
		return frappe.get_site_path("private", "files", name)
	if url.startswith("/files/"):
		name = url.split("/files/", 1)[1]
		return frappe.get_site_path("public", "files", name)
	return None


def _cell_text(value) -> str:
	if value is None:
		return ""
	if isinstance(value, float) and value.is_integer():
		return str(int(value))
	text = str(value).strip()
	if text.endswith(".0") and text[:-2].isdigit():
		return text[:-2]
	return text


def _xlsx_rows(path: str) -> list[dict]:
	"""Read the first sheet. Keys are column letters."""
	import os
	import zipfile
	import xml.etree.ElementTree as ET

	if not path or not os.path.isfile(path):
		return []
	ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
	try:
		with zipfile.ZipFile(path) as book:
			shared = []
			if "xl/sharedStrings.xml" in book.namelist():
				root = ET.fromstring(book.read("xl/sharedStrings.xml"))
				for si in root.findall("m:si", ns):
					shared.append("".join(t.text or "" for t in si.findall(".//m:t", ns)))
			sheet_name = "xl/worksheets/sheet1.xml"
			if sheet_name not in book.namelist():
				sheets = [n for n in book.namelist() if n.startswith("xl/worksheets/sheet")]
				if not sheets:
					return []
				sheet_name = sorted(sheets)[0]
			root = ET.fromstring(book.read(sheet_name))
	except Exception:
		return []

	rows: dict[int, dict] = {}
	for cell in root.findall(".//m:c", ns):
		ref = cell.get("r") or ""
		col = "".join(ch for ch in ref if ch.isalpha())
		row_no = "".join(ch for ch in ref if ch.isdigit())
		if not col or not row_no:
			continue
		node = cell.find("m:v", ns)
		raw = node.text if node is not None else ""
		if cell.get("t") == "s" and str(raw).isdigit():
			idx = int(raw)
			raw = shared[idx] if idx < len(shared) else ""
		rows.setdefault(int(row_no), {})[col] = _cell_text(raw)
	return [rows[i] for i in sorted(rows)]


def _attendance_sheet_people(file_url: str, visit: dict) -> list[dict]:
	"""Names from the Field Visit attendance Excel (Name, School, Designation, Contact)."""
	path = _attendance_file_path(file_url)
	grid = _xlsx_rows(path) if path else []
	if not grid:
		return []
	header_idx = None
	columns = {}
	for i, row in enumerate(grid[:25]):
		labels = {col: (text or "").strip().lower() for col, text in row.items()}
		found = {}
		for col, label in labels.items():
			if "participant" in label or label in ("name", "attendee name", "teacher name"):
				found.setdefault("name", col)
			elif "school" in label or "organization" in label:
				found.setdefault("school", col)
			elif "designation" in label:
				found.setdefault("designation", col)
			elif "contact" in label or "mobile" in label or "phone" in label:
				found.setdefault("contact", col)
		if "name" in found and len(found) >= 2:
			header_idx = i
			columns = found
			break
	if header_idx is None:
		return []
	people = []
	for row in grid[header_idx + 1 :]:
		name = (row.get(columns.get("name", "")) or "").strip()
		if not name or name.lower() in ("name", "name of participants", "s. #", "s#"):
			continue
		if name.replace(".", "").isdigit():
			continue
		people.append(
			{
				"name": name,
				"contact": (row.get(columns.get("contact", "")) or "").strip(),
				"school": (row.get(columns.get("school", "")) or "").strip() or (visit.get("school") or ""),
				"designation": (row.get(columns.get("designation", "")) or "").strip(),
				"date": visit.get("visit_date") or "",
				"officer": visit.get("officer") or "",
				"visit": visit.get("name") or "",
				"url": visit.get("url") or "",
			}
		)
	return people


def _workshop_participant_rows(visits: list, sheet_by_visit: dict) -> list[dict]:
	"""Named workshop participants from the attendee tables, then the attendance Excel."""
	if not visits:
		return []
	by_visit = {v["name"]: v for v in visits if v.get("name")}
	if not by_visit:
		return []
	names = tuple(by_visit)
	out = []
	covered = set()

	def _add(rows, name_key, contact_key, school_key, date_key, designation_key=""):
		for row in rows:
			visit = by_visit.get(row.parent) or {}
			person = (row.get(name_key) or "").strip()
			if not person:
				continue
			covered.add(row.parent)
			out.append(
				{
					"name": person,
					"contact": (row.get(contact_key) or "").strip(),
					"school": (row.get(school_key) or "").strip() or (visit.get("school") or ""),
					"designation": (row.get(designation_key) or "").strip() if designation_key else "",
					"date": str(row.get(date_key)) if row.get(date_key) else (visit.get("visit_date") or ""),
					"officer": visit.get("officer") or "",
					"visit": row.parent,
					"url": visit.get("url") or f"/app/field-visit/{row.parent}",
				}
			)

	if frappe.db.table_exists("Training Attendee"):
		rows = frappe.db.sql(
			"""
			SELECT parent, attendee_name, contact_number, school_organization,
				training_date, designation
			FROM `tabTraining Attendee`
			WHERE parent IN %(names)s
			ORDER BY idx ASC
			""",
			{"names": names},
			as_dict=True,
		)
		_add(rows, "attendee_name", "contact_number", "school_organization", "training_date", "designation")
	if frappe.db.table_exists("Field Visit Workshop Attendee"):
		rows = frappe.db.sql(
			"""
			SELECT parent, attendee_name, contact_number, school_organization, training_date
			FROM `tabField Visit Workshop Attendee`
			WHERE parent IN %(names)s
			ORDER BY idx ASC
			""",
			{"names": names},
			as_dict=True,
		)
		_add(rows, "attendee_name", "contact_number", "school_organization", "training_date")

	for visit_name, visit in by_visit.items():
		if visit_name in covered:
			continue
		sheet = sheet_by_visit.get(visit_name) or ""
		if not sheet:
			continue
		parsed = _attendance_sheet_people(sheet, visit)
		if parsed:
			covered.add(visit_name)
			out.extend(parsed)
	return out


_CAMERA_NAME = re.compile(
	r"(?P<date>20\d{6})[_-](?P<time>\d{6})(?P<ampm>AM|PM)?",
	re.IGNORECASE,
)
_SCREENSHOT_NAME = re.compile(
	r"(?P<year>20\d{2})-(?P<month>\d{2})-(?P<day>\d{2})[^\d]{1,16}"
	r"(?P<hour>\d{1,2})[.\-:](?P<minute>\d{2})[.\-:](?P<second>\d{2})(?:\s*(?P<ampm>AM|PM))?",
	re.IGNORECASE,
)


def _capture_time_from_filename(file_name: str) -> str:
	"""Camera names and laptop screenshots keep the click time in the file name."""
	name = file_name or ""
	match = _CAMERA_NAME.search(name)
	if match:
		raw_date = match.group("date")
		raw_time = match.group("time")
		ampm = (match.group("ampm") or "").upper()
		try:
			year, month, day = int(raw_date[:4]), int(raw_date[4:6]), int(raw_date[6:8])
			hour, minute, second = int(raw_time[:2]), int(raw_time[2:4]), int(raw_time[4:6])
		except ValueError:
			year = month = day = hour = minute = second = 0
			ampm = ""
	else:
		shot = _SCREENSHOT_NAME.search(name)
		if not shot:
			return ""
		try:
			year = int(shot.group("year"))
			month = int(shot.group("month"))
			day = int(shot.group("day"))
			hour = int(shot.group("hour"))
			minute = int(shot.group("minute"))
			second = int(shot.group("second"))
		except (TypeError, ValueError):
			return ""
		ampm = (shot.group("ampm") or "").upper()
	if ampm == "PM" and hour < 12:
		hour += 12
	elif ampm == "AM" and hour == 12:
		hour = 0
	if not (1 <= month <= 12 and 1 <= day <= 31 and 0 <= hour <= 23 and 0 <= minute <= 59 and 0 <= second <= 59):
		return ""
	return f"{year:04d}-{month:02d}-{day:02d} {hour:02d}:{minute:02d}:{second:02d}"


def _visit_images(visit_names: list[str]) -> dict:
	"""Photos on each Field Visit, with the phone capture time when the file name has it."""
	if not visit_names:
		return {}
	rows = frappe.db.sql(
		"""
		SELECT attached_to_name AS visit, file_url, file_name, creation
		FROM `tabFile`
		WHERE attached_to_doctype = 'Field Visit'
		  AND attached_to_name IN %(names)s
		  AND (
			LOWER(file_name) LIKE '%%.jpg'
			OR LOWER(file_name) LIKE '%%.jpeg'
			OR LOWER(file_name) LIKE '%%.png'
			OR LOWER(file_name) LIKE '%%.webp'
		  )
		ORDER BY creation ASC
		""",
		{"names": tuple(visit_names)},
		as_dict=True,
	)
	out: dict[str, list] = {}
	seen = set()
	for row in rows:
		url = (row.file_url or "").strip()
		if not url:
			continue
		key = (row.visit, url)
		if key in seen:
			continue
		seen.add(key)
		captured = _capture_time_from_filename(row.file_name or "")
		out.setdefault(row.visit, []).append(
			{
				"url": url,
				"file_name": row.file_name or "",
				"captured": captured,
				"uploaded": str(row.creation)[:19] if row.creation else "",
			}
		)
	return out


@frappe.whitelist()
def get_visit_drilldown(filters=None, metric=None, staff=None):
	"""Return Field Visit rows that make up a report number."""
	if not frappe.has_permission("Field Visit", "read"):
		frappe.throw(_("You are not permitted to view Field Visit data."), frappe.PermissionError)

	filters = _parse(filters)
	metric = (metric or filters.get("metric") or "visits").strip().lower()
	staff = (staff or filters.get("staff") or filters.get("user") or "").strip()
	from_date = getdate(filters.get("from_date"))
	to_date = getdate(filters.get("to_date"))
	if not from_date or not to_date:
		frappe.throw(_("From Date and To Date are required."))
	if from_date > to_date:
		frappe.throw(_("From Date cannot be after To Date."))

	visit_day = visit_day_sql("fv")
	submitted_only = cint(filters.get("submitted_only") or filters.get("submitted") or 0)
	province = (filters.get("province") or "").strip()
	city = (filters.get("city") or "").strip()
	docstatus_sql = "fv.docstatus = 1" if submitted_only else "fv.docstatus < 2"
	conditions = [
		docstatus_sql,
		f"{visit_day} BETWEEN %(from_date)s AND %(to_date)s",
		_metric_condition(metric, "fv"),
	]
	params = {"from_date": from_date, "to_date": to_date}
	apply_team_scope_to_conditions(conditions, params, alias="fv")
	if staff:
		tokens = expand_staff_tokens(staff)
		params["staff_tokens"] = tuple(t.lower() for t in tokens) or ("__none__",)
		conditions.append(staff_match_sql("fv", "staff_tokens"))
	if province:
		conditions.append(
			"""COALESCE(
				NULLIF(TRIM(fv.province), ''),
				NULLIF(TRIM(fv.me_province), ''),
				NULLIF(TRIM(fv.training_province), '')
			) = %(province)s"""
		)
		params["province"] = province
	if city:
		conditions.append(
			"""COALESCE(
				NULLIF(TRIM(fv.city), ''),
				NULLIF(TRIM(fv.me_city), ''),
				NULLIF(TRIM(fv.training_city), ''),
				NULLIF(TRIM(fv.mt_city), '')
			) = %(city)s"""
		)
		params["city"] = city

	where_sql = " AND ".join(f"({c})" for c in conditions)
	rows = frappe.db.sql(
		f"""
		SELECT
			fv.name,
			fv.type,
			fv.creation AS doc_created,
			fv.docstatus,
			fv.owner,
			fv.visit_by,
			fv.me_visit_by,
			fv.mt_visit_by,
			fv.training_entry_filled_by,
			fv.marketing_visit_category,
			fv.me_activity_status,
			fv.me_inactive_reasons,
			fv.me_reason_of_above,
			fv.mt_remarks,
			fv.ot_remarks,
			fv.school_remarks_follow_up,
			fv.school_additional_remarks,
			fv.travel_remarks,
			fv.ot_academic_task_other,
			fv.ot_other_official_task_detail,
			fv.attendance_sheet_excel,
			{VISIT_REMARKS_EXTRA_SELECT},
			{visit_day} AS visit_date,
			{_school_sql("fv")} AS school,
			{_school_unapproved_sql("fv")} AS school_unapproved,
			COALESCE(NULLIF(TRIM(fv.province), ''), NULLIF(TRIM(fv.me_province), '')) AS province,
			COALESCE(NULLIF(TRIM(fv.area), ''), NULLIF(TRIM(fv.me_area), '')) AS area,
			COALESCE(NULLIF(TRIM(fv.city), ''), NULLIF(TRIM(fv.me_city), '')) AS city
		FROM `tabField Visit` fv
		WHERE {where_sql}
		ORDER BY visit_date DESC, fv.creation DESC
		LIMIT 1000
		""",
		params,
		as_dict=True,
	)

	status_map = {0: "Draft", 1: "Submitted", 2: "Cancelled"}
	out = []
	by_type = {}
	for r in rows:
		vtype = r.type or "Other"
		by_type[vtype] = by_type.get(vtype, 0) + 1
		officer = (
			r.visit_by
			or r.me_visit_by
			or r.mt_visit_by
			or r.training_entry_filled_by
			or r.owner
			or ""
		)
		if vtype == "M&E":
			category, why = _me_status_note(r)
			if why and category == "In-Active":
				category = f"In-Active — {why}"
		else:
			category = r.marketing_visit_category or r.me_activity_status or ""
		remarks = _visit_remarks(r)
		out.append(
			{
				"name": r.name,
				"type": vtype,
				"visit_date": str(r.visit_date) if r.visit_date else "",
				"doc_created": str(r.doc_created)[:19] if r.doc_created else "",
				"school": r.school or "",
				"school_unapproved": cint(r.school_unapproved),
				"school_missing": 0 if (r.school or "").strip() else 1,
				"province": r.province or "",
				"area": r.area or "",
				"city": r.city or "",
				"officer": officer,
				"status": status_map.get(r.docstatus, r.docstatus),
				"category": category,
				"remarks": remarks,
				"participants": cint(r.training_no_of_participants),
				"url": f"/app/field-visit/{r.name}",
				"images": [],
			}
		)

	images_by_visit = _visit_images([v["name"] for v in out])
	for visit in out:
		visit["images"] = images_by_visit.get(visit["name"]) or []

	sheet_by_visit = {r.name: r.attendance_sheet_excel or "" for r in rows}
	if metric == "enrolment":
		participants = _enrolment_participant_rows(out)
	elif metric == "workshop_registration":
		participants = _workshop_participant_rows(out, sheet_by_visit)
	else:
		participants = []

	if metric in ("monitoring", "me"):
		breakdown = _monitoring_category_breakdown(rows)
	elif metric == "enrolment":
		breakdown = []
	else:
		breakdown = [{"type": k, "count": v} for k, v in sorted(by_type.items(), key=lambda x: (-x[1], x[0]))]
	label = METRIC_LABELS.get(metric, metric.replace("_", " ").title())
	parts = [f"{b['type']} {b['count']}" for b in breakdown]
	subtitle = " · ".join(parts) if parts else _("No documents")
	if metric == "enrolment":
		count = len(participants)
	elif metric == "workshop_registration":
		count = sum(cint(v.get("participants")) for v in out)
	else:
		count = len(out)

	return {
		"metric": metric,
		"label": label,
		"count": count,
		"breakdown": breakdown,
		"subtitle": subtitle,
		"title": _("{0}: {1}").format(label, count),
		"from_date": str(from_date),
		"to_date": str(to_date),
		"staff": staff,
		"rows": out,
		"participants": participants,
	}
