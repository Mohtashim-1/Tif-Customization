# Copyright (c) 2026, The ILM Foundation and contributors
# For license information, please see license.txt

import os

import frappe
from frappe import _
from frappe.utils import cint, cstr, get_url, getdate, today

from tif_customization.tif_customization.field_visit_enrolment_access import (
	FARHAN_ONLY_FIELD_VISIT_TYPES,
	can_manage_farhan_only_field_visit,
)
from tif_customization.tif_customization.field_visit_supervisor_only import (
	SUPERVISOR_ONLY_ACTIVITY_TYPES,
	can_manage_supervisor_only_field_visits,
)
from tif_customization.tif_customization.field_visit_permissions import (
	can_edit_submitted_field_visit,
	get_assigned_field_officers,
)
from tif_customization.tif_customization.field_visit_travel_cost import sync_travel_cost
from tif_customization.tif_customization.model_school import sync_model_school_field
from tif_customization.tif_customization.api.school_opening_form import (
	CONTACT_ROLES,
	create_school_opening_application,
)

BULK_IMPORT_TEMPLATE = "Field_Visit_Bulk_Import_Template.xlsx"

_ALL_ACADEMIC_TASK_TYPES = [
	"Academic Tasks",
	"Head Office Visit",
	"Regional Office Visit",
	"Out of Station Visit",
	"Meeting of Regional Staff (Supervisors) and SMEs",
	"Follow up Calls / Calls to Schools",
	"Other Official Tasks",
]


def _academic_task_type_options_for_user():
	return list(_ALL_ACADEMIC_TASK_TYPES)


HIDDEN_ACTIVITY_TYPE_LABELS = {
	"Marketing Visit",
	"M&E Visit",
	"Joint Visit with SME (Only for Supervisor)",
	"Trainings & Workshops / Teachers Training Meeting",
	"Meetings",
	"Academic / Other Official Tasks / Calls",
	"Attendance / Registration in One Day / Half day Workshop",
}

# Same order as Field Visit Type of Activity (Target Base sheet).
SHEET_ACTIVITY_TYPES = [
	"Visits",
	"M&E",
	"Workshop",
	"Meeting with Ulama and Educationist",
	"Internal Meeting",
	"Teachers Training Meeting",
	"Headoffice/ Regional Office/ Out of Station Visit",
	"Academic Task",
	"Other Official Tasks",
	"Enrolment of Participants",
	"Enrolment of Participant in ELP/ TECC/ TTC/ Online Tajweed",
	"Quiz Arranged",
	"Co-curricular Activity",
	"Registration of New Schools",
	"Registration of Participant in Workshops",
	"Workshop Conducted",
	"Workshop Arranged",
	"Books Demand (Quantity)",
	"Enrolment of Volunteers",
	"Enrolment of Ambassadors",
	"Model School A",
	"Model School B",
]

HEADOFFICE_TASK_TYPES = [
	"Head Office Visit",
	"Regional Office Visit",
	"Out of Station Visit",
	"Meeting of Regional Staff (Supervisors) and SMEs",
]

OFFICIAL_TASK_DOC_TYPES = (
	"Academic / Other Official Tasks",
	"Academic",
	"Academic Task",
	"Other Official Tasks",
	"Headoffice/ Regional Office/ Out of Station Visit",
)

# Activity types where portal can file on behalf of a selected field officer
DELEGATED_FIELD_OFFICER_DOC_TYPES = OFFICIAL_TASK_DOC_TYPES + (
	"Enrolment of Participants",
)

MEETING_DOC_TYPES = ("Meeting", "Meeting with Ulama and Educationist", "Internal Meeting")

DESIGNATION_SELECT_OPTIONS = frozenset(
	{
		"Owner",
		"Director",
		"Principal",
		"Vice Principal",
		"Admin",
		"Administrator",
		"Incharge",
		"Coordinator",
		"Teacher",
		"Receptionist",
		"Front Desk Officer (FDO)",
		"Other",
	}
)


def _normalize_designation(value, other=""):
	"""Map free-text titles (Mudaris, Mohtamim, etc.) onto the Designation Select."""
	value = cstr(value).strip()
	other = cstr(other).strip()
	if not value:
		return "", other
	if value in DESIGNATION_SELECT_OPTIONS:
		return value, other if value == "Other" else ""
	return "Other", other or value


# Always offered on the easy portal to every field officer
FIELD_OFFICER_OPEN_ACTIVITY_TYPES = frozenset(
	{
		"Enrolment of Participants",
		"Enrolment of Participant in ELP/ TECC/ TTC/ Online Tajweed",
		"Quiz Arranged",
		"Co-curricular Activity",
		"Workshop Conducted",
		"Workshop",
	}
)


def _activity_type_labels_for_user():
	can_farhan = can_manage_farhan_only_field_visit()
	can_supervisor = can_manage_supervisor_only_field_visits()
	labels = []
	for label in SHEET_ACTIVITY_TYPES:
		mapped = ACTIVITY_TYPE_MAP.get(label, label)
		if mapped in FIELD_OFFICER_OPEN_ACTIVITY_TYPES:
			labels.append(label)
			continue
		if mapped in FARHAN_ONLY_FIELD_VISIT_TYPES and not can_farhan:
			continue
		if mapped in SUPERVISOR_ONLY_ACTIVITY_TYPES and not can_supervisor:
			continue
		labels.append(label)
	return labels


def _bulk_import_template_path():
	for rel in (
		("tif_customization", "page", "smes_activity_form", BULK_IMPORT_TEMPLATE),
		("public", "files", BULK_IMPORT_TEMPLATE),
	):
		path = frappe.get_app_path("tif_customization", *rel)
		if os.path.isfile(path):
			return path
	return None


def get_bulk_import_template_url():
	"""Public assets URL (nginx serves this without a File record)."""
	return "/assets/tif_customization/files/" + BULK_IMPORT_TEMPLATE


def _as_list(value):
	"""Normalize portal multi-select / checkbox values to a list of strings."""
	if value is None or value == "":
		return []
	if isinstance(value, list):
		return [cstr(v).strip() for v in value if cstr(v).strip()]
	if isinstance(value, str):
		# JSON array or newline / comma separated
		raw = value.strip()
		if raw.startswith("["):
			try:
				parsed = frappe.parse_json(raw)
				if isinstance(parsed, list):
					return [cstr(v).strip() for v in parsed if cstr(v).strip()]
			except Exception:
				pass
		parts = [p.strip() for p in raw.replace("\r", "\n").replace(",", "\n").split("\n")]
		return [p for p in parts if p]
	return [cstr(value).strip()]


def cstr(v):
	return "" if v is None else str(v)


PROVINCE_MAP = {
	"Sindh": "Sindh",
	"Punjab": "Punjab",
	"KPK": "Khyber Pakhtunkhwa",
	"Balochistan": "Balochistan",
	"AJK": "Azad Jammu & Kashmir",
	"Gilgit-Baltistan": "Gilgit-Baltistan",
	"ICT": "Islamabad Capital Territory",
}


def _normalize_quarter(value):
	"""Accept 'Q4' or labels like 'Q4 - Oct-Dec'."""
	raw = cstr(value).strip()
	if not raw:
		return ""
	upper = raw.upper()
	for q in ("Q1", "Q2", "Q3", "Q4"):
		if upper == q or upper.startswith(q + " ") or upper.startswith(q + "-"):
			return q
	return raw

ACTIVITY_TYPE_MAP = {
	"Visits": "Visits",
	"M&E": "M&E",
	"Workshop": "Workshop",
	"Meeting with Ulama and Educationist": "Meeting with Ulama and Educationist",
	"Internal Meeting": "Internal Meeting",
	"Teachers Training Meeting": "Teachers Training Meeting",
	"Headoffice/ Regional Office/ Out of Station Visit": "Headoffice/ Regional Office/ Out of Station Visit",
	"Academic Task": "Academic Task",
	"Other Official Tasks": "Other Official Tasks",
	"Enrolment of Participants": "Enrolment of Participants",
	"Enrolment of participants": "Enrolment of Participants",
	"Enrolment of Participant in ELP/ TECC/ TTC/ Online Tajweed": "Enrolment of Participant in ELP/ TECC/ TTC/ Online Tajweed",
	"Quiz Arranged": "Quiz Arranged",
	"Co-curricular Activity": "Co-curricular Activity",
	"Registration of New Schools": "Registration of New Schools",
	"Registration of Participant in Workshops": "Registration of Participant in Workshops",
	"Workshop Conducted": "Workshop Conducted",
	"Workshop Arranged": "Workshop Arranged",
	"Books Demand (Quantity)": "Books Demand (Quantity)",
	"Enrolment of Volunteers": "Enrolment of Volunteers",
	"Enrolment of Ambassadors": "Enrolment of Ambassadors",
	"Model School A": "Model School A",
	"Model School B": "Model School B",
	"Marketing Visit": "Marketing",
	"M&E Visit": "M&E",
	"Joint Visit with SME (Only for Supervisor)": "Joint Visit with SME",
	"Trainings & Workshops / Teachers Training Meeting": "Training",
	"Meetings": "Meeting",
	"Academic / Other Official Tasks / Calls": "Academic / Other Official Tasks",
	"Attendance / Registration in One Day / Half day Workshop": "Attendance / Registration in One Day / Half day Workshop",
}

SCHOOL_NAME_LINK_TYPES = {
	"Marketing",
	"Visits",
	"Registration of New Schools",
	"Enrolment of Volunteers",
	"Enrolment of Ambassadors",
	"Model School A",
	"Model School B",
	"Books Demand (Quantity)",
	"Joint Visit with SME",
	"M&E",
}

ENROLMENT_COURSE_OPTIONS = [
	"TECC - Foundation",
	"TECC - Professional",
	"ELP - Education Leadership Program",
	"ETQ - Effective Teaching of the Holy Quran",
	"TTC - 90 Days Tajweed Training Course",
	"Online Tajweed Customized Course 30/60/90 Days",
	"Other Special Session Offered by TIF",
]

FIELD_OFFICER_ROLES = (
	"Field Staff",
	"Field Staff Manager",
	"Supervisor Field Staff",
)


def _norm_person_name(value):
	"""Collapse whitespace and lowercase for person-name matching."""
	return " ".join(cstr(value or "").lower().split())


def _name_tokens(value):
	return [t for t in _norm_person_name(value).split() if len(t) > 1]


def _employee_name_matches(candidate_name, query_name):
	"""True when query tokens are a subset of candidate name tokens (word-level)."""
	q_tokens = _name_tokens(query_name)
	if not q_tokens:
		return False
	c_tokens = set(_name_tokens(candidate_name))
	if not c_tokens:
		return False
	if _norm_person_name(candidate_name) == _norm_person_name(query_name):
		return True
	return set(q_tokens).issubset(c_tokens)


def _find_active_employee_by_name(full_name):
	"""Best Active Employee whose name matches the given person name."""
	target = _norm_person_name(full_name)
	if not target:
		return None
	employees = frappe.get_all(
		"Employee",
		filters={"status": "Active"},
		fields=["name", "employee_name", "user_id", "status"],
		limit_page_length=5000,
	)
	exact = None
	partial = None
	for emp in employees:
		ename = cstr(emp.employee_name or "").strip()
		if not ename:
			continue
		if _norm_person_name(ename) == target:
			exact = emp
			break
		if _employee_name_matches(ename, full_name) and partial is None:
			partial = emp
	return exact or partial


def _employee_for_user(user=None):
	"""Active Employee linked to user_id, or name-matched when user_id is missing."""
	user = user or frappe.session.user
	if not user or user == "Guest":
		return None
	emp = frappe.db.get_value(
		"Employee",
		{"user_id": user, "status": "Active"},
		["name", "employee_name", "user_id", "status"],
		as_dict=True,
	)
	if emp:
		return emp
	full_name = cstr(frappe.db.get_value("User", user, "full_name") or "").strip()
	if not full_name:
		return None
	return _find_active_employee_by_name(full_name)


def _user_has_field_officer_roles(user=None):
	user = user or frappe.session.user
	return bool(set(frappe.get_roles(user)) & set(FIELD_OFFICER_ROLES))


def get_active_field_officer_staff():
	"""
	Active employees who are Field Officers:
	- Field Officer DocType (status Active) + Employee Active + User enabled
	- OR user has Field Staff / Field Staff Manager / Supervisor Field Staff role,
	  user enabled, and linked (or name-matched) Employee is Active.
	"""
	by_employee = {}

	# 1) Explicit Field Officer records
	if frappe.db.exists("DocType", "Field Officer"):
		officers = frappe.get_all(
			"Field Officer",
			filters={"status": "Active"},
			fields=["name", "name1", "employee", "user", "division", "province", "city", "area"],
		)
		for row in officers:
			emp = row.employee
			if not emp:
				continue
			emp_row = frappe.db.get_value(
				"Employee",
				emp,
				["name", "employee_name", "user_id", "status"],
				as_dict=True,
			)
			if not emp_row or emp_row.status != "Active":
				continue
			user = row.user or emp_row.user_id
			if user and not frappe.db.get_value("User", user, "enabled"):
				continue
			by_employee[emp_row.name] = {
				"employee": emp_row.name,
				"employee_name": emp_row.employee_name or row.name1 or emp_row.name,
				"user": user or "",
				"division": row.division or "",
				"province": cstr(row.get("province") or "").strip(),
				"city": cstr(row.get("city") or "").strip(),
				"area": cstr(row.get("area") or "").strip(),
			}

	# 2) Users with field officer roles
	role_users = frappe.get_all(
		"Has Role",
		filters={
			"role": ["in", list(FIELD_OFFICER_ROLES)],
			"parenttype": "User",
		},
		pluck="parent",
		distinct=True,
	)
	for user in role_users or []:
		if not frappe.db.get_value("User", user, "enabled"):
			continue
		emp_row = frappe.db.get_value(
			"Employee",
			{"user_id": user, "status": "Active"},
			["name", "employee_name", "user_id", "status"],
			as_dict=True,
		)
		if not emp_row:
			# Employee.user_id often unset; match User.full_name → Employee name
			emp_row = _employee_for_user(user)
		if not emp_row:
			continue
		by_employee[emp_row.name] = {
			"employee": emp_row.name,
			"employee_name": emp_row.employee_name or emp_row.name,
			"user": user,
		}

	staff = sorted(by_employee.values(), key=lambda r: (r["employee_name"] or "").lower())
	return staff


def _resolve_visit_staff(data):
	"""
	Resolve Name of Staff / staff_employee to an allowed FO staff row.
	Accepts exact name, employee id, normalized / partial name, or session FO employee.
	"""
	staff_list = get_active_field_officer_staff()
	by_name = {s["employee_name"]: s for s in staff_list}
	by_norm = {_norm_person_name(s["employee_name"]): s for s in staff_list}
	by_emp = {s["employee"]: s for s in staff_list}

	staff_emp = cstr(data.get("staff_employee") or data.get("field_officer") or "").strip()
	visit_by = cstr(data.get("visit_by") or "").strip()

	if staff_emp and staff_emp in by_emp:
		return by_emp[staff_emp]
	if visit_by and visit_by in by_name:
		return by_name[visit_by]
	norm = _norm_person_name(visit_by)
	if norm and norm in by_norm:
		return by_norm[norm]
	if visit_by:
		for row in staff_list:
			if _employee_name_matches(row.get("employee_name"), visit_by) or _employee_name_matches(
				visit_by, row.get("employee_name")
			):
				return row

	# Session user → their employee if already in FO list
	session_emp = _employee_for_user(frappe.session.user)
	if session_emp and session_emp.name in by_emp:
		return by_emp[session_emp.name]

	# FO-role user whose employee was missing from the list (e.g. unlinked user_id)
	if session_emp and _user_has_field_officer_roles(frappe.session.user):
		return {
			"employee": session_emp.name,
			"employee_name": session_emp.employee_name or session_emp.name,
			"user": frappe.session.user,
		}

	return None


@frappe.whitelist()
def get_form_meta():
	"""Lookups for the easy SMEs Activity Form portal."""
	city_fields = ["name"]
	if frappe.db.has_column("City", "province"):
		city_fields.append("province")
	cities = frappe.get_all(
		"City",
		fields=city_fields,
		order_by="name",
		limit_page_length=500,
		ignore_permissions=True,
	)
	areas = _area_link_options(limit=5000)
	staff_list = get_active_field_officer_staff()
	staff_names = [s["employee_name"] for s in staff_list]
	staff_by_emp = {s["employee"]: s for s in staff_list}

	current_emp = _employee_for_user(frappe.session.user)
	staff_name = ""
	staff_employee = ""
	staff_province = ""
	staff_city = ""
	staff_area = ""
	if current_emp and current_emp.name in staff_by_emp:
		staff_name = staff_by_emp[current_emp.name]["employee_name"]
		staff_employee = current_emp.name
		staff_province = cstr(staff_by_emp[current_emp.name].get("province") or "").strip()
		staff_city = cstr(staff_by_emp[current_emp.name].get("city") or "").strip()
		staff_area = cstr(staff_by_emp[current_emp.name].get("area") or "").strip()
	elif current_emp and current_emp.employee_name in staff_names:
		staff_name = current_emp.employee_name
		staff_employee = current_emp.name
		row = next((s for s in staff_list if s.get("employee_name") == staff_name), None) or {}
		staff_province = cstr(row.get("province") or "").strip()
		staff_city = cstr(row.get("city") or "").strip()
		staff_area = cstr(row.get("area") or "").strip()
	elif current_emp and _user_has_field_officer_roles(frappe.session.user):
		# FO-role user matched by name but not yet in compiled list
		staff_name = current_emp.employee_name
		staff_employee = current_emp.name

	# Fallback: Field Officer linked by user / employee even if not in staff_by_emp earlier.
	if (not staff_province and not staff_city) and frappe.db.exists("DocType", "Field Officer"):
		fo = None
		if frappe.session.user:
			fo = frappe.db.get_value(
				"Field Officer",
				{"user": frappe.session.user, "status": "Active"},
				["province", "city", "area", "employee", "name1"],
				as_dict=True,
			)
		if not fo and staff_employee:
			fo = frappe.db.get_value(
				"Field Officer",
				{"employee": staff_employee, "status": "Active"},
				["province", "city", "area", "employee", "name1"],
				as_dict=True,
			)
		if fo:
			staff_province = staff_province or cstr(fo.province or "").strip()
			staff_city = staff_city or cstr(fo.city or "").strip()
			staff_area = staff_area or cstr(fo.area or "").strip()
			if not staff_name:
				staff_name = cstr(fo.name1 or "").strip() or staff_name

	# Normalize short province codes (KPK → Khyber Pakhtunkhwa) for portal selects.
	if staff_province in PROVINCE_MAP:
		staff_province = PROVINCE_MAP[staff_province]

	return {
		"customers": _customer_link_options(limit=5000),
		"staff_name": staff_name,
		"staff_employee": staff_employee,
		"staff_province": staff_province,
		"staff_city": staff_city,
		"staff_area": staff_area,
		"staff_options": staff_list,
		"staff_names": staff_names,
		"can_manage_supervisor_only": can_manage_supervisor_only_field_visits(),
		"assigned_field_officers": get_assigned_field_officers(),
		"can_manage_enrolment_participants": can_manage_farhan_only_field_visit(),
		"can_manage_farhan_only": can_manage_farhan_only_field_visit(),
		"can_edit_submitted": can_edit_submitted_field_visit(),
		"bulk_import_template_url": get_bulk_import_template_url(),
		"today": today(),
		"cities": [
			{
				"value": c.name,
				"label": c.name,
				"name": c.name,
				"province": cstr(c.get("province") or "").strip(),
			}
			for c in cities
			if c.name
		],
		"areas": areas,
		"months": [
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
		],
		"activity_types": _activity_type_labels_for_user(),
		"headoffice_task_types": HEADOFFICE_TASK_TYPES,
		"enrolment_courses": ENROLMENT_COURSE_OPTIONS,
		"travel_modes": [
			"Public Transport",
			"Own Vehicle / Bike",
			"Company Vehicle",
			"Ride Hailing",
			"Walking",
			"Other",
		],
		"book_titles": [
			"Noorani Qaida",
			"Mutalae Quran Hakim - Grade 1",
			"Mutalae Quran Hakim - Grade 2",
			"Tajweed Guide",
			"Teacher's Manual",
		],
		"provinces": list(PROVINCE_MAP.keys()),
		"province_options_full": [
			"Punjab",
			"Sindh",
			"Khyber Pakhtunkhwa",
			"Balochistan",
			"Azad Jammu & Kashmir",
			"Gilgit-Baltistan",
			"Islamabad Capital Territory",
		],
		"marketing_visit_categories": [
			"New",
			"1st Follow up visit",
			"2nd Follow up visit",
			"3rd Follow up visit",
			"4th Follow up visit",
			"Other Visits",
		],
		"frequencies": [
			"New",
			"1st Follow up visit",
			"2nd Follow up visit",
			"3rd Follow up visit",
			"4th Follow up visit",
			"Other Visits",
		],
		"statuses": [
			"Agree",
			"Not Agree",
			"Need follow up visit",
			"Will Discuss with Higher Management",
			"Other",
		],
		"not_agree_reasons": [
			"Books from other publishers are being taught",
			"Unavailability of Teacher",
			"Lengthy Course",
			"Shortage of time",
			"Sect Issue",
			"Will start in new session",
			"Other",
		],
		"school_types": ["Individual School", "Chains of School"],
		"designations": [
			"Owner",
			"Director",
			"Principal",
			"Vice Principal",
			"Admin",
			"Administrator",
			"Incharge",
			"Coordinator",
			"Teacher",
			"Receptionist",
			"Front Desk Officer (FDO)",
			"Other",
		],
		"affiliation_options": [
			"Yes - Already Affiliated",
			"Yes - Newly Registered",
			"No - Not Affiliated",
		],
		"model_school_options": [
			"Yes - Model School A: (Affiliated atleast 1 Program of all 3 Department of TIF)",
			"Yes - Model School B: (Affiliated atleast 1 Program of all 2 Department of TIF)",
			"No - This is not a Model School",
		],
		"meeting_types": [
			"Internal Meeting (Meeting with TIF Staff)",
			"External Meeting (Meeting with Others)",
			"Invitation of Personalities to the Head Office",
			"Invitation of Personalities to the Regional Office",
		],
		"meeting_modes": ["Online", "Onsite / In Person"],
		"internal_meeting_with": [
			"Regional Office Staff / Supervisors",
			"Meeting with SMEs",
			"Head Office Staff",
		],
		"external_meeting_with": [
			"Ulma Karam",
			"Educationalist",
			"Owner / Director of Chain of School",
			"Govt officials",
			"Influential Personalities",
			"Social Media Activist",
		],
		"academic_task_types": _academic_task_type_options_for_user(),
		"academic_work_types": [
			"Typing",
			"Proofreading",
			"Review",
			"Matching",
			"Correction",
			"Formatting",
			"Designing",
			"Translation",
			"Other",
		],
		"hours_spent_options": [
			"1 Hour",
			"2 Hours",
			"3 Hours",
			"4 Hours",
			"5 Hours",
			"6 Hours",
			"7 Hours",
			"8 Hours",
			"Full Day",
		],
		"cocurricular_activities": [
			"Arrange Quiz in School",
			"Inter School Quiz Competition",
			"Conduct / Arrange Demo Class",
			"Introduce TIF in School Functions",
			"Introduce TIF in Exhibition",
		],
		"cocurricular_participant_categories": [
			"Higher management of school",
			"Teachers",
			"Students",
			"Parents",
			"General public",
		],
		"qps_services": [
			{"field": "qps_mqh_books", "label": "MQH Books"},
			{"field": "qps_mqh_teachers_guides", "label": "MQH Teachers Guides"},
			{"field": "qps_onsite_training", "label": "Onsite Training"},
			{"field": "qps_online_training", "label": "Online Training"},
			{"field": "qps_registration_lms", "label": "Registration in LMS"},
			{"field": "qps_50_days_syllabus", "label": "50 Days Short MQH Syllabus (Softcopy Available)"},
			{"field": "qps_mqh_quiz", "label": "Participation in MQH Quiz Program"},
		],
		"tps_services": [
			{"field": "tps_noorani_qaida", "label": "Noorani Qaida"},
			{"field": "tps_noorani_qaida_guide", "label": "Noorani Qaida Teacher's Guide"},
			{
				"field": "tps_1_day_tajweed_females",
				"label": "1 Day session - Intro of Tajweed for Females (Onsite)",
			},
			{"field": "tps_ttc_tajweed_khi", "label": "TTC Tajweed Training Course (For KHI)"},
			{
				"field": "tps_tajweed_customize",
				"label": "Tajweed Customize Course 30/60/90 (Nazra Teachers)",
			},
			{
				"field": "tps_noorani_qaida_workbook_khi",
				"label": "Noorani Qaida Workbook (for Karachi)",
			},
			{
				"field": "tps_tajweed_workshop_kids_khi",
				"label": "Tajweed Workshop for Kids (For Specific Schools in Karachi)",
			},
		],
		"cee_services": [
			{"field": "cee_elp", "label": "ELP"},
			{"field": "cee_tecc_foundation", "label": "TECC - Foundation"},
			{"field": "cee_tecc_professional", "label": "TECC - Professional"},
			{"field": "cee_one_day_workshop", "label": "One Day Workshop"},
		],
		# Activity-section option lists (Google Form sections 2–5)
		"me_inactive_reasons": [
			"Books not receive or late delivery of books",
			"Books from other publishers have replaced MQH",
			"Change of Management",
			"Unavailability of Teacher",
			"Untrained Teachers",
			"Change in Government Policy",
			"Sect issue",
			"Lengthy Course",
			"Shortage of time",
			"Course Permanently Stop due to Parents Request",
			"School closed",
			"Stop due to Negative Propaganda",
			"Others",
		],
		"me_demand_options": [
			"Yes (Please fill separate demand form)",
			"No",
		],
		"me_teachers_count": ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "Others"],
		"me_mqh_versions": [
			"Urdu Original Version",
			"KPK Edition",
			"English Version",
			"Sindhi Version",
			"Braille",
			"Punjab Edition",
			"Balochistan Edition",
			"AJK Edition",
		],
		"me_mqh_parts": [
			"Part-1",
			"Part-2",
			"Part-3",
			"Part-4",
			"Part-5",
			"Part-6",
			"Part-7",
			"Other",
		],
		"me_classes_per_week": ["1", "2", "3", "4", "5"],
		"me_class_durations": [
			"20 Minutes",
			"25 Minutes",
			"30 Minutes",
			"35 Minutes",
			"40 Minutes",
			"45 Minutes",
			"50 Minutes",
			"55 Minutes",
			"60 Minutes",
		],
		"me_behavior_changes": ["No Change", "Minor Change", "Major Change"],
		"me_assessment_from": [
			"Principal",
			"Class Teacher",
			"Management (Incharge / Coordinator / HOO etc)",
			"Students",
		],
		"me_tif_office_changes": [
			"School Name",
			"Contact Person",
			"Contact Number",
			"Address",
			"Email",
		],
		"joint_skill_ratings": [
			"Excellent - Highly skilled and professional",
			"Good - Meets expectations",
			"Average - Needs some improvement",
			"Poor - Requires immediate training/support",
		],
		"training_categories": [
			"Full Day Session",
			"Half Day Workshop",
			"Teachers Training Meeting (One to One)",
		],
		"training_workshop_topics": [
			"ETQ - Effective Teaching of the Holy Quran",
			"Intro to Tajweed Workshop",
			"Tajweed Workshop for Kids (For Specific Schools in Karachi)",
			"Other Special Session Offered by TIF",
		],
		"training_modes": ["Online", "OnSite"],
		"me_nazra_books": ["Noorani Qaida", "Noorani Qaida Workbook"],
		"sme_name_options": _sme_display_names(staff_list),
		"training_conducted_by_options": _training_conducted_by_options(staff_list),
		"school_opening_contact_roles": CONTACT_ROLES,
		"school_opening_visit_types": [
			"Visit without enrollment",
			"Visit with enrollment",
		],
		"school_opening_institution_types": [
			"School",
			"College",
			"University",
			"Madaris",
			"Library",
			"Special School",
		],
		"school_opening_categories": ["Provincial Govt.", "Private"],
		"school_opening_educational_system": [
			"Pre-Primary",
			"Primary",
			"Matric",
			"Intermediate",
			"Hifz-o-Nazra",
			"Cambridge",
			"O / A Levels",
		],
		"school_opening_structure": ["Single Campus", "Chain"],
		"school_opening_shifts": ["Morning", "Evening", "Both"],
		"school_opening_teacher_training": [
			"ELP",
			"One Day Workshop (Intro of Tajweed)",
			"TECC Professional",
			"TECC Foundation",
			"V-Campers",
			"Effective Teaching of the Holy Qur'an Workshop",
			"PEF Pakistan",
			"Intro to Tajweed — One Day Workshop",
			"Tajweed Training Course",
		],
		"school_opening_tilawat": [
			"Noorani Qaida — NQ Teachers Guide",
			"Tajweed Workshop for Kids",
			"Teachers Training (Online)",
			"Teachers Training (On-site)",
			"Noorani Qaida — NQ Workbook",
		],
		"school_opening_quran": [
			"MQH Part-1 + Part-1 (Sample)",
			"MQH Part-1 (MQH T.G Part-1)",
			"MQH Part-2 (MQH T.G Part-2)",
			"MQH Part-3 (MQH T.G Part-3)",
			"MQH Part-4 (MQH T.G Part-4)",
			"MQH Part-5 (MQH T.G Part-5)",
			"MQH Part-6",
			"MQH Part-7",
			"MQH Part-1 — English Version",
			"MQH Part-2 — English Version",
			"MQH Part-1 — Sindhi Version",
			"MQH Part-2 — Sindhi Version",
			"MQH Part-3 — Sindhi Version",
			"Intro Workshops",
		],
		"school_opening_running_tif": [
			"Quran Program for Student",
			"Tilawat Program for School",
			"Teacher Training",
		],
		"school_opening_curriculum": [
			"Oral Nazra",
			"Qaida",
			"Afaq",
			"National Book Foundation",
			"Noorani Qaida (Not TPS)",
			"Iqra Qaida",
			"Spectrum",
			"Rehmani Qaida",
			"Madni Qaida",
			"Gaba",
			"Jamiat Qaida",
			"Qurani Qaida",
			"Moonlight",
			"Islamic Values",
			"CEF",
			"Zia ul Quran",
		],
		"school_opening_fee": ["Above 15K", "Between 5K – 15K", "Below 5K"],
		"school_opening_provinces": [
			"Sindh",
			"Punjab",
			"KPK",
			"Balochistan",
			"Gilgit-Baltistan",
			"Azad Jammu & Kashmir",
		],
	}


def _customer_link_options(txt="", city="", limit=4000):
	"""Customer rows for School Name (Field Visit Link → Customer)."""
	if not frappe.db.exists("DocType", "Customer"):
		return []
	txt = (txt or "").strip()
	city = (city or "").strip()
	limit = max(1, min(cint(limit) or 4000, 5000))
	meta = frappe.get_meta("Customer")
	has_disabled = meta.has_field("disabled")
	has_territory = meta.has_field("territory")
	has_category = meta.has_field("custom_category")
	has_type = meta.has_field("custom_type_of_customer")
	where = ["1=1"]
	params = {}
	if has_disabled:
		where.append("IFNULL(disabled, 0) = 0")
	tokens = [t for t in txt.split() if t]
	for i, token in enumerate(tokens):
		key = f"t{i}"
		where.append(f"(c.name LIKE %({key})s OR c.customer_name LIKE %({key})s)")
		params[key] = f"%{token}%"
	if city and has_territory:
		where.append("(IFNULL(c.territory, '') = '' OR c.territory = %(city)s)")
		params["city"] = city
	category_sql = "IFNULL(c.custom_category, '')" if has_category else "''"
	type_sql = "IFNULL(c.custom_type_of_customer, '')" if has_type else "''"
	territory_sql = "IFNULL(c.territory, '')" if has_territory else "''"
	rows = frappe.db.sql(
		f"""
		SELECT c.name,
			TRIM(IFNULL(c.customer_name, c.name)) AS customer_name,
			{territory_sql} AS territory,
			{category_sql} AS custom_category,
			{type_sql} AS custom_type_of_customer
		FROM `tabCustomer` c
		WHERE {" AND ".join(where)}
		ORDER BY c.customer_name ASC
		LIMIT {limit}
		""",
		params,
		as_dict=True,
	)
	out = []
	seen = set()
	for row in rows:
		name = (row.get("name") or "").strip()
		label = (row.get("customer_name") or name).strip()
		if not name or name in seen:
			continue
		seen.add(name)
		school_type = _school_type_from_customer(row.get("custom_category"))
		bits = [b for b in [row.get("territory"), row.get("custom_type_of_customer")] if b]
		out.append(
			{
				"value": name,
				"label": label,
				"description": " · ".join(bits),
				"city": (row.get("territory") or "").strip(),
				"school_type": school_type,
			}
		)
	return out


def _school_opening_link_options(txt="", city="", limit=50, exclude_values=None):
	"""School Opening Application rows for School Name typeahead (incl. pending drafts)."""
	if not frappe.db.exists("DocType", "School Opening Application"):
		return []
	txt = (txt or "").strip()
	city = (city or "").strip()
	limit = max(1, min(cint(limit) or 50, 100))
	exclude = {cstr(v).strip().lower() for v in (exclude_values or []) if cstr(v).strip()}
	meta = frappe.get_meta("School Opening Application")
	has_city = meta.has_field("city")
	has_province = meta.has_field("province")
	has_type = meta.has_field("type_of_school")
	has_customer = meta.has_field("customer")
	where = ["IFNULL(soa.school_name, '') != ''"]
	params = {}
	tokens = [t for t in txt.split() if t]
	for i, token in enumerate(tokens):
		key = f"soa_t{i}"
		parts = [
			f"soa.name LIKE %({key})s",
			f"soa.school_name LIKE %({key})s",
		]
		if has_customer:
			parts.append(f"IFNULL(soa.customer, '') LIKE %({key})s")
		where.append(f"({' OR '.join(parts)})")
		params[key] = f"%{token}%"
	if city and has_city:
		where.append("(IFNULL(soa.city, '') = '' OR soa.city = %(soa_city)s)")
		params["soa_city"] = city
	city_sql = "IFNULL(soa.city, '')" if has_city else "''"
	province_sql = "IFNULL(soa.province, '')" if has_province else "''"
	type_sql = "IFNULL(soa.type_of_school, '')" if has_type else "''"
	customer_sql = "IFNULL(soa.customer, '')" if has_customer else "''"
	rows = frappe.db.sql(
		f"""
		SELECT
			soa.name,
			TRIM(soa.school_name) AS school_name,
			{customer_sql} AS customer,
			{city_sql} AS city,
			{province_sql} AS province,
			{type_sql} AS type_of_school,
			soa.docstatus
		FROM `tabSchool Opening Application` soa
		WHERE {" AND ".join(where)}
		ORDER BY
			CASE WHEN IFNULL(soa.customer, '') != '' THEN 0 ELSE 1 END,
			soa.modified DESC
		LIMIT {limit * 3}
		""",
		params,
		as_dict=True,
	)
	out = []
	seen = set(exclude)
	for row in rows:
		school_name = cstr(row.get("school_name") or "").strip()
		customer = cstr(row.get("customer") or "").strip()
		if not school_name:
			continue
		# Prefer Customer link when SOA already created one.
		value = customer if customer and frappe.db.exists("Customer", customer) else school_name
		key = value.lower()
		if not value or key in seen:
			continue
		seen.add(key)
		seen.add(school_name.lower())
		status = _("Pending School Opening") if cint(row.get("docstatus")) == 0 and not customer else _("School Opening")
		bits = [b for b in [row.get("city"), row.get("province"), status] if b]
		school_type = _school_type_from_customer(row.get("type_of_school"))
		out.append(
			{
				"value": value,
				"label": school_name,
				"description": " · ".join(bits),
				"city": cstr(row.get("city") or "").strip(),
				"province": cstr(row.get("province") or "").strip(),
				"school_type": school_type,
				"source": "school_opening",
				"application": cstr(row.get("name") or "").strip(),
				"pending": 1 if not customer else 0,
			}
		)
		if len(out) >= limit:
			break
	return out


def _find_school_opening_by_name(value):
	"""Match School Opening Application by doc name or exact school_name."""
	val = cstr(value).strip()
	if not val or not frappe.db.exists("DocType", "School Opening Application"):
		return None
	if frappe.db.exists("School Opening Application", val):
		return frappe.db.get_value(
			"School Opening Application",
			val,
			["name", "school_name", "customer", "city", "province", "address", "docstatus"],
			as_dict=True,
		)
	rows = frappe.db.sql(
		"""
		SELECT name, school_name, IFNULL(customer, '') AS customer,
			IFNULL(city, '') AS city, IFNULL(province, '') AS province,
			IFNULL(address, '') AS address, docstatus
		FROM `tabSchool Opening Application`
		WHERE TRIM(school_name) = %(val)s
		ORDER BY
			CASE WHEN IFNULL(customer, '') != '' THEN 0 ELSE 1 END,
			docstatus DESC,
			modified DESC
		LIMIT 1
		""",
		{"val": val},
		as_dict=True,
	)
	return rows[0] if rows else None


@frappe.whitelist()
def search_school_customers(txt=None, city=None, limit=50):
	"""Typeahead for School Name — Customers + School Opening Applications."""
	if frappe.session.user == "Guest":
		frappe.throw(_("Please log in"), frappe.AuthenticationError)
	limit = max(1, min(cint(limit) or 50, 100))
	# Keep room for School Opening hits (pending drafts are often missing from Customer).
	cust_cap = max(10, (limit * 2) // 3)
	customers = _customer_link_options(txt=txt, city=city, limit=cust_cap)
	seen = {cstr(r.get("value") or "").strip().lower() for r in customers if r.get("value")}
	seen.update(
		cstr(r.get("label") or "").strip().lower() for r in customers if r.get("label")
	)
	soa_cap = max(limit - len(customers), limit // 3, 15)
	soa_rows = _school_opening_link_options(
		txt=txt, city=city, limit=soa_cap, exclude_values=seen
	)
	merged = customers + soa_rows
	# Prefer exact / prefix matches first when user typed something.
	needle = (txt or "").strip().lower()
	if needle:

		def _rank(row):
			label = cstr(row.get("label") or "").strip().lower()
			value = cstr(row.get("value") or "").strip().lower()
			# Pending SOA slightly ahead of same-rank Customer so drafts are visible.
			pending_boost = 0 if cint(row.get("pending")) else 1
			if label == needle or value == needle:
				return (0, pending_boost)
			if label.startswith(needle) or value.startswith(needle):
				return (1, pending_boost)
			return (2, pending_boost)

		merged.sort(key=_rank)
	return merged[:limit]


@frappe.whitelist()
def search_cities(txt=None, province=None, limit=80):
	"""Typeahead for City Link field, limited to the selected Province."""
	if frappe.session.user == "Guest":
		frappe.throw(_("Please log in"), frappe.AuthenticationError)
	return _city_link_options(
		txt=txt,
		province=province,
		limit=max(1, min(cint(limit) or 80, 200)),
	)


def _city_link_options(txt="", province="", limit=80):
	if not frappe.db.exists("DocType", "City"):
		return []
	txt = (txt or "").strip()
	province = (province or "").strip()
	limit = max(1, min(cint(limit) or 80, 500))
	has_city = frappe.db.has_column("City", "city")
	has_province = frappe.db.has_column("City", "province")
	params = {}
	where = ["1=1"]
	if province and has_province:
		where.append("province = %(province)s")
		params["province"] = province
	tokens = [t for t in txt.split() if t]
	for i, token in enumerate(tokens):
		key = f"t{i}"
		parts = [f"name LIKE %({key})s"]
		if has_city:
			parts.append(f"IFNULL(city, '') LIKE %({key})s")
		if has_province:
			parts.append(f"IFNULL(province, '') LIKE %({key})s")
		where.append(f"({' OR '.join(parts)})")
		params[key] = f"%{token}%"
	province_sql = "IFNULL(province, '')" if has_province else "''"
	rows = frappe.db.sql(
		f"""
		SELECT name, {province_sql} AS province
		FROM `tabCity`
		WHERE {" AND ".join(where)}
		ORDER BY name ASC
		LIMIT {limit}
		""",
		params,
		as_dict=True,
	)
	out = []
	seen = set()
	for row in rows:
		name = (row.get("name") or "").strip()
		if not name or name in seen:
			continue
		seen.add(name)
		province = (row.get("province") or "").strip()
		out.append(
			{
				"value": name,
				"label": name,
				"name": name,
				"province": province,
				"description": province,
			}
		)
	return out


@frappe.whitelist()
def get_city_province(city=None):
	"""Return Province for a City (Area → City → Province cascade)."""
	if frappe.session.user == "Guest":
		frappe.throw(_("Please log in"), frappe.AuthenticationError)
	city = cstr(city or "").strip()
	if not city or not frappe.db.exists("DocType", "City"):
		return {"city": city, "province": ""}
	province = ""
	if frappe.db.has_column("City", "province"):
		province = cstr(frappe.db.get_value("City", city, "province") or "").strip()
	return {"city": city, "province": province}


@frappe.whitelist()
def get_area_location(area=None):
	"""Return City + Province for an Area (select Area → auto City / Province)."""
	if frappe.session.user == "Guest":
		frappe.throw(_("Please log in"), frappe.AuthenticationError)
	area = cstr(area or "").strip()
	if not area or not frappe.db.exists("DocType", "Area"):
		return {"area": area, "city": "", "province": ""}
	fields = ["name"]
	if frappe.db.has_column("Area", "city"):
		fields.append("city")
	if frappe.db.has_column("Area", "province"):
		fields.append("province")
	row = frappe.db.get_value("Area", area, fields, as_dict=True) or {}
	city = cstr(row.get("city") or "").strip()
	province = cstr(row.get("province") or "").strip()
	if city and not province and frappe.db.exists("DocType", "City") and frappe.db.has_column(
		"City", "province"
	):
		province = cstr(frappe.db.get_value("City", city, "province") or "").strip()
	return {"area": area, "city": city, "province": province}


def _user_can_create_area(user=None):
	"""Field officers (and their supervisors) may add Area records from the easy form."""
	user = user or frappe.session.user
	if not user or user == "Guest":
		return False
	roles = set(frappe.get_roles(user))
	if roles & set(FIELD_OFFICER_ROLES):
		return True
	if roles & {"System Manager", "Accounts Manager"}:
		return True
	if frappe.db.exists("DocType", "Field Officer"):
		if frappe.db.exists("Field Officer", {"user": user, "status": "Active"}):
			return True
		employee = frappe.db.get_value("Employee", {"user_id": user, "status": "Active"}, "name")
		if employee and frappe.db.exists("Field Officer", {"employee": employee, "status": "Active"}):
			return True
	return False


@frappe.whitelist()
def create_area(area=None, city=None, province=None):
	"""Create an Area under the selected City. Field officers are allowed to add areas."""
	if frappe.session.user == "Guest":
		frappe.throw(_("Please log in"), frappe.AuthenticationError)
	if not _user_can_create_area():
		frappe.throw(_("You are not allowed to add an Area"), frappe.PermissionError)
	area_name = cstr(area or "").strip()
	city_raw = cstr(city or "").strip()
	province = _map_province_name(province) or cstr(province or "").strip()
	if len(area_name) < 2:
		frappe.throw(_("Enter an area name"))

	# Resolve City link (never treat province codes like KPK as a city)
	city = _resolve_school_city(city_raw)
	if not city:
		frappe.throw(_("Select a city before adding an area"))

	city_province = ""
	if frappe.db.has_column("City", "province"):
		city_province = cstr(frappe.db.get_value("City", city, "province") or "").strip()
	if province and city_province and province != city_province:
		# Prefer City master province — form may still send a mapped label that matches
		if _map_province_name(province) != city_province and province != city_province:
			frappe.throw(_("City {0} belongs to {1}").format(city, city_province))
	province = city_province or province

	# Reuse existing Area (case-insensitive / label match) under this city
	existing_row = _find_area_in_city(area_name, city)
	if existing_row:
		return _area_payload(existing_row)

	# Unique area name taken by another city
	if frappe.db.exists("Area", area_name):
		row = frappe.db.get_value("Area", area_name, ["name", "area", "city", "province"], as_dict=True) or {}
		frappe.throw(
			_("Area '{0}' already exists under {1}. Choose it from the list or use a different name.").format(
				area_name, row.get("city") or _("another city")
			)
		)

	doc = frappe.get_doc(
		{
			"doctype": "Area",
			"area": area_name,
			"city": city,
			"province": province,
		}
	)
	doc.insert(ignore_permissions=True)
	return _area_payload(doc)


def _find_area_in_city(area_name, city):
	"""Find Area by name/label under a City (exact, then case-insensitive)."""
	area_name = cstr(area_name or "").strip()
	city = cstr(city or "").strip()
	if not area_name or not city or not frappe.db.exists("DocType", "Area"):
		return None
	has_area = frappe.db.has_column("Area", "area")
	has_city = frappe.db.has_column("Area", "city")
	if not has_city:
		return None
	fields = ["name", "city"]
	if has_area:
		fields.append("area")
	if frappe.db.has_column("Area", "province"):
		fields.append("province")

	# Exact name
	if frappe.db.exists("Area", area_name):
		row = frappe.db.get_value("Area", area_name, fields, as_dict=True) or {}
		if cstr(row.get("city") or "").strip() == city:
			return row

	# Match label / case-insensitive under city
	params = {"city": city, "val": area_name, "val_lower": area_name.lower()}
	conds = ["name = %(val)s", "LOWER(name) = %(val_lower)s"]
	if has_area:
		conds.extend(
			[
				"IFNULL(area, '') = %(val)s",
				"LOWER(IFNULL(area, '')) = %(val_lower)s",
			]
		)
	rows = frappe.db.sql(
		f"""
		SELECT {", ".join(fields)}
		FROM `tabArea`
		WHERE city = %(city)s AND ({" OR ".join(conds)})
		ORDER BY name ASC
		LIMIT 1
		""",
		params,
		as_dict=True,
	)
	return rows[0] if rows else None


def _area_payload(row):
	name = cstr(getattr(row, "name", None) or row.get("name") or "").strip()
	label = cstr(getattr(row, "area", None) or row.get("area") or name).strip() or name
	city_name = cstr(getattr(row, "city", None) or row.get("city") or "").strip()
	province = cstr(getattr(row, "province", None) or row.get("province") or "").strip()
	return {
		"value": name,
		"label": label,
		"name": name,
		"description": " · ".join([p for p in (city_name, province) if p]),
		"city": city_name,
		"province": province,
	}


@frappe.whitelist()
def search_areas(txt=None, city=None, province=None, limit=80):
	"""Typeahead for Area — filtered by City, or by Province when City is not chosen yet."""
	if frappe.session.user == "Guest":
		frappe.throw(_("Please log in"), frappe.AuthenticationError)
	return _area_link_options(
		txt=txt,
		city=city,
		province=province,
		limit=max(1, min(cint(limit) or 80, 200)),
	)


def _area_link_options(txt="", city="", province="", limit=80):
	if not frappe.db.exists("DocType", "Area"):
		return []
	txt = (txt or "").strip()
	city = (city or "").strip()
	province = (province or "").strip()
	limit = max(1, min(cint(limit) or 80, 5000))
	has_area = frappe.db.has_column("Area", "area")
	has_city = frappe.db.has_column("Area", "city")
	has_province = frappe.db.has_column("Area", "province")
	where = ["1=1"]
	params = {}
	tokens = [t for t in txt.split() if t]
	for i, token in enumerate(tokens):
		key = f"t{i}"
		if has_area:
			where.append(f"(name LIKE %({key})s OR IFNULL(area, '') LIKE %({key})s)")
		else:
			where.append(f"name LIKE %({key})s")
		params[key] = f"%{token}%"
	# Province narrows City; City narrows Area.
	if city and has_city:
		where.append("city = %(city)s")
		params["city"] = city
	elif province and has_province:
		where.append("province = %(province)s")
		params["province"] = province
	elif has_city and not tokens:
		where.append("IFNULL(TRIM(city), '') != ''")
	area_sql = "IFNULL(area, name)" if has_area else "name"
	city_sql = "IFNULL(city, '')" if has_city else "''"
	province_sql = "IFNULL(province, '')" if has_province else "''"
	rows = frappe.db.sql(
		f"""
		SELECT name, {area_sql} AS area_label, {city_sql} AS city, {province_sql} AS province
		FROM `tabArea`
		WHERE {" AND ".join(where)}
		ORDER BY area_label ASC
		LIMIT {limit}
		""",
		params,
		as_dict=True,
	)
	out = []
	seen = set()
	for row in rows:
		name = (row.get("name") or "").strip()
		label = (row.get("area_label") or name).strip()
		if not name or name in seen:
			continue
		seen.add(name)
		city_name = (row.get("city") or "").strip()
		province = (row.get("province") or "").strip()
		desc = " · ".join([p for p in (city_name, province) if p])
		out.append(
			{
				"value": name,
				"label": label,
				"name": name,
				"description": desc,
				"city": city_name,
				"province": province,
			}
		)
	return out


@frappe.whitelist()
def get_school_customer(name=None):
	"""Load Customer details to fill School Type / Address / City / Province on the easy form."""
	if frappe.session.user == "Guest":
		frappe.throw(_("Please log in"), frappe.AuthenticationError)
	name = (name or "").strip()
	if not name or not frappe.db.exists("Customer", name):
		return {}
	cust_fields = ["name", "customer_name", "territory", "customer_type"]
	meta = frappe.get_meta("Customer")
	if meta.has_field("custom_category"):
		cust_fields.append("custom_category")
	if meta.has_field("custom_type_of_customer"):
		cust_fields.append("custom_type_of_customer")
	if meta.has_field("customer_primary_address"):
		cust_fields.append("customer_primary_address")
	cust = frappe.db.get_value("Customer", name, cust_fields, as_dict=True) or {}
	addr = _customer_address_row(name, cust.get("customer_primary_address"))
	address = _format_address_row(addr) if addr else ""

	# Prefer Address.city over Customer.territory — territory is often a province
	# code like "KPK", which is not a City (was wiping Area and failing Link validation).
	city = _resolve_school_city(
		cstr((addr or {}).get("city") or "").strip(),
		cstr(cust.get("territory") or "").strip(),
	)
	province = ""
	if city and frappe.db.exists("DocType", "City") and frappe.db.has_column("City", "province"):
		province = cstr(frappe.db.get_value("City", city, "province") or "").strip()
	if not province:
		raw_state = cstr((addr or {}).get("state") or "").strip()
		territory = cstr(cust.get("territory") or "").strip()
		for raw in (raw_state, territory):
			if not raw:
				continue
			mapped = _map_province_name(raw)
			if mapped:
				province = mapped
				break
			province = raw
			break
	school_type = _school_type_from_customer(
		cust.get("custom_category"),
		cust.get("customer_type"),
		cust.get("custom_type_of_customer"),
	)
	return {
		"value": cust.get("name") or name,
		"label": (cust.get("customer_name") or name).strip(),
		"city": city,
		"province": province,
		"school_type": school_type,
		"address": address,
	}


def _map_province_name(raw):
	"""Map abbreviations like KPK → full province name used on the form."""
	raw = cstr(raw or "").strip()
	if not raw:
		return ""
	if raw in PROVINCE_MAP:
		return PROVINCE_MAP[raw]
	title = raw.title()
	if title in PROVINCE_MAP:
		return PROVINCE_MAP[title]
	lower = raw.lower()
	for key, full in PROVINCE_MAP.items():
		if lower == key.lower() or lower == full.lower():
			return full
	# Already a full province label
	for full in PROVINCE_MAP.values():
		if lower == full.lower():
			return full
	return ""


def _is_province_label(value):
	"""True if value looks like a province / territory code, not a city."""
	raw = cstr(value or "").strip()
	if not raw:
		return False
	return bool(_map_province_name(raw)) or raw.upper() in {
		"KPK",
		"KP",
		"AJK",
		"GB",
		"ICT",
		"FATA",
	}


def _resolve_school_city(*candidates):
	"""Pick the first candidate that is a real City (never a province code like KPK)."""
	if not frappe.db.exists("DocType", "City"):
		for c in candidates:
			c = cstr(c or "").strip()
			if c and not _is_province_label(c):
				return c
		return ""

	has_city_field = frappe.db.has_column("City", "city")
	for raw in candidates:
		raw = cstr(raw or "").strip()
		if not raw or _is_province_label(raw):
			continue
		if frappe.db.exists("City", raw):
			return raw
		if has_city_field:
			alt = frappe.db.get_value("City", {"city": raw}, "name")
			if alt:
				return alt
	return ""


def _school_type_from_customer(category=None, customer_type=None, type_of_customer=None):
	"""Map Customer fields → Easy Form school type options."""
	for raw in (category, type_of_customer, customer_type):
		cat = cstr(raw or "").strip().lower()
		if not cat:
			continue
		if cat in ("chain school", "chains of school", "chain of school", "company"):
			return "Chains of School"
		if cat in ("individual school", "individual", "school", "person"):
			return "Individual School"
	return ""


def _customer_address_row(customer, primary_name=None):
	if primary_name and frappe.db.exists("Address", primary_name):
		addr = frappe.get_cached_value(
			"Address",
			primary_name,
			["address_line1", "address_line2", "city", "state", "pincode"],
			as_dict=True,
		)
		if addr:
			return addr
	rows = frappe.db.sql(
		"""
		SELECT addr.address_line1, addr.address_line2, addr.city, addr.state, addr.pincode
		FROM `tabAddress` addr
		INNER JOIN `tabDynamic Link` dl
			ON dl.parent = addr.name AND dl.parenttype = 'Address'
		WHERE dl.link_doctype = 'Customer' AND dl.link_name = %s
		ORDER BY addr.is_primary_address DESC, addr.modified DESC
		LIMIT 1
		""",
		customer,
		as_dict=True,
	)
	return rows[0] if rows else None


def _format_address_row(addr):
	if not addr:
		return ""
	return ", ".join(
		[
			cstr(addr.get(k)).strip()
			for k in ("address_line1", "address_line2", "city", "state", "pincode")
			if cstr(addr.get(k)).strip()
		]
	)


def _customer_address_text(customer, primary_name=None):
	return _format_address_row(_customer_address_row(customer, primary_name))


def _resolve_customer_link(value):
	"""Return a real Customer name, or '' if the text is not a Customer."""
	val = cstr(value).strip()
	if not val or not frappe.db.exists("DocType", "Customer"):
		return ""
	if frappe.db.exists("Customer", val):
		return val
	found = frappe.db.get_value("Customer", {"customer_name": val}, "name")
	if found:
		return found
	rows = frappe.db.sql(
		"""
		SELECT name
		FROM `tabCustomer`
		WHERE name LIKE %(like)s OR customer_name LIKE %(like)s
		ORDER BY
			CASE
				WHEN name = %(val)s THEN 0
				WHEN customer_name = %(val)s THEN 1
				WHEN name LIKE %(prefix)s THEN 2
				ELSE 3
			END,
			customer_name
		LIMIT 5
		""",
		{"val": val, "like": f"%{val}%", "prefix": f"{val}%"},
		as_dict=True,
	)
	names = [(r.get("name") or "").strip() for r in rows if (r.get("name") or "").strip()]
	if len(names) == 1:
		return names[0]
	return ""


def _resolve_area_link(value, city=None):
	"""Map typed/partial Area text to a real Area name for Link validation."""
	val = cstr(value).strip()
	if not val:
		return ""
	if not frappe.db.exists("DocType", "Area"):
		return val
	if frappe.db.exists("Area", val):
		return val

	has_area = frappe.db.has_column("Area", "area")
	has_city = frappe.db.has_column("Area", "city")
	params = {"val": val, "like": f"%{val}%", "prefix": f"{val}%"}
	conds = ["name = %(val)s", "name LIKE %(like)s"]
	if has_area:
		conds.extend(["IFNULL(area, '') = %(val)s", "IFNULL(area, '') LIKE %(like)s"])
	where_sql = "(" + " OR ".join(conds) + ")"
	if city and has_city:
		where_sql += " AND (IFNULL(city, '') = '' OR city = %(city)s)"
		params["city"] = cstr(city).strip()

	rows = frappe.db.sql(
		f"""
		SELECT name
		FROM `tabArea`
		WHERE {where_sql}
		ORDER BY
			CASE
				WHEN name = %(val)s THEN 0
				WHEN IFNULL(area, name) = %(val)s THEN 1
				WHEN name LIKE %(prefix)s THEN 2
				ELSE 3
			END,
			name
		LIMIT 20
		""",
		params,
		as_dict=True,
	)
	names = []
	seen = set()
	for row in rows:
		name = (row.get("name") or "").strip()
		if name and name not in seen:
			seen.add(name)
			names.append(name)

	if val in names:
		return val
	if len(names) == 1:
		return names[0]
	if not names:
		frappe.throw(
			_("Area '{0}' was not found. Select an area from the list.").format(val),
			frappe.LinkValidationError,
		)
	frappe.throw(
		_(
			"Area '{0}' is not a specific Area record. Choose one from the list, for example: {1}"
		).format(val, ", ".join(names[:8])),
		frappe.LinkValidationError,
	)


def _sme_display_names(staff_list):
	names = []
	for s in staff_list:
		n = (s.get("employee_name") or "").strip()
		if not n:
			continue
		if n.lower().startswith("sme"):
			names.append(n)
		else:
			names.append(f"SME - {n}")
	# Extra labels seen on Google Form that may not be employees
	for extra in ("Sohail Athar", "Volunteer"):
		if extra not in names and f"SME - {extra}" not in names:
			names.append(extra)
	return names


def _training_conducted_by_options(staff_list):
	fixed = [
		"Shujauddin Shaikh",
		"Arif Irfanullah",
		"Hafiz Shah Nawaz Awan",
		"Syed Wajahat Ali",
		"Ms. Sumaiya",
		"Ms. Javeria",
	]
	smes = _sme_display_names(staff_list)
	seen = set()
	out = []
	for n in fixed + smes:
		if n and n not in seen:
			seen.add(n)
			out.append(n)
	out.append("Other")
	return out


@frappe.whitelist()
def download_bulk_import_template():
	"""Download Excel template for Field Visit bulk import."""
	path = _bulk_import_template_path()
	if not path:
		frappe.throw(_("Bulk import template file is missing on the server."))

	with open(path, "rb") as handle:
		content = handle.read()

	frappe.local.response.filename = BULK_IMPORT_TEMPLATE
	frappe.local.response.filecontent = content
	frappe.local.response.type = "download"


def _format_follow_up_calls(rows):
	cleaned = []
	lines = []
	for i, row in enumerate(rows or [], 1):
		if not isinstance(row, dict):
			continue
		school = cstr(row.get("school_name_label") or row.get("school_name") or "").strip()
		person = cstr(row.get("person_name") or "").strip()
		contact = cstr(row.get("contact_number") or "").strip()
		designation = cstr(row.get("designation") or "").strip()
		other = cstr(row.get("designation_other") or "").strip()
		purpose = cstr(row.get("purpose") or "").strip()
		if designation == "Other" and other:
			designation = other
		if not any([school, person, contact, designation, purpose]):
			continue
		cleaned.append(
			{
				"school_name": cstr(row.get("school_name") or "").strip(),
				"school_name_label": school,
				"person_name": person,
				"contact_number": contact,
				"designation": cstr(row.get("designation") or "").strip(),
				"designation_other": other,
				"purpose": purpose,
			}
		)
		bits = [f"{i}. School: {school or '-'}"]
		if person:
			bits.append(f"Contact person: {person}")
		if contact:
			bits.append(f"Contact No: {contact}")
		if designation:
			bits.append(f"Designation: {designation}")
		if purpose:
			bits.append(f"Purpose: {purpose}")
		lines.append(", ".join(bits))
	return cleaned, "\n".join(lines)


def _format_other_official_task(data):
	kind = cstr(data.get("ot_official_task_kind") or "").strip()
	assigned = cstr(data.get("ot_task_assigned_by") or "").strip()
	assigned_other = cstr(data.get("ot_task_assigned_by_other") or "").strip()
	if assigned == "Other" and assigned_other:
		assigned = assigned_other
	detail = cstr(data.get("ot_other_official_task_detail") or data.get("ot_academic_work_detail") or "").strip()
	if kind or (assigned and "Assigned by:" not in detail):
		lines = []
		if kind and "Type of official task:" not in detail:
			lines.append(f"Type of official task: {kind}")
		if assigned and "Assigned by:" not in detail:
			lines.append(f"Assigned by: {assigned}")
		if detail:
			lines.append(detail if detail.startswith("Details:") or "Type of official task:" in detail else f"Details: {detail}")
		return "\n".join(lines)
	return detail


def _apply_official_task_fields(doc, data):
	doc.ot_date = doc.visit_date
	doc.ot_start_time = doc.visiting_starting_time
	doc.ot_end_time = doc.visit_ending_time
	task = (data.get("ot_type_of_task") or "").strip()
	if doc.type == "Academic Task" and not task:
		task = "Academic Tasks"
	elif doc.type == "Other Official Tasks":
		task = "Other Official Tasks"
	elif doc.type == "Academic":
		task = task or "Academic Tasks"
	elif doc.type == "Headoffice/ Regional Office/ Out of Station Visit":
		task = task or "Head Office Visit"
	doc.ot_type_of_task = task
	academic_types = _as_list(data.get("ot_academic_task_types"))
	doc.ot_academic_task_types = "\n".join(academic_types)
	doc.ot_academic_task_other = data.get("ot_academic_task_other")
	doc.ot_no_of_pages = data.get("ot_no_of_pages")
	calls, call_detail = _format_follow_up_calls(_parse_rows(data.get("follow_up_calls")))
	if calls and not data.get("ot_no_of_calls"):
		data["ot_no_of_calls"] = len(calls)
	if calls and not data.get("ot_purpose_of_call"):
		data["ot_purpose_of_call"] = calls[0].get("purpose") or call_detail
	if calls and not data.get("school_name"):
		data["school_name"] = calls[0].get("school_name")
	if calls and not data.get("school_contacts"):
		data["school_contacts"] = [
			{
				"person_name": c.get("person_name"),
				"contact_number": c.get("contact_number"),
				"designation": c.get("designation"),
				"designation_other": c.get("designation_other"),
			}
			for c in calls
		]
	doc.ot_no_of_calls = data.get("ot_no_of_calls")
	doc.ot_purpose_of_call = data.get("ot_purpose_of_call")
	doc.ot_follow_up_calls_attach = data.get("ot_follow_up_calls_attach")
	other_detail = _format_other_official_task(data)
	doc.ot_other_official_task_detail = other_detail or data.get("ot_other_official_task_detail")
	doc.ot_visit_meeting_detail = data.get("ot_visit_meeting_detail")
	doc.ot_hours_spent = data.get("ot_hours_spent")
	extra = cstr(data.get("ot_academic_work_detail") or data.get("ot_remarks") or "").strip()
	if call_detail and extra:
		doc.ot_remarks = f"{call_detail}\n{extra}"
	else:
		doc.ot_remarks = (
			call_detail
			or extra
			or data.get("ot_visit_meeting_detail")
			or data.get("ot_other_official_task_detail")
		)
	if calls:
		first = calls[0]
		if not cstr(doc.school_name or "").strip():
			doc.school_name = _resolve_customer_link(first.get("school_name"))
		if not cstr(doc.meeting_with or "").strip() and first.get("person_name"):
			doc.meeting_with = first.get("person_name")
		if not cstr(doc.contact_number or "").strip() and first.get("contact_number"):
			doc.contact_number = first.get("contact_number")
		if not cstr(doc.designation or "").strip() and first.get("designation"):
			doc.designation = first.get("designation")
			doc.designation_other = first.get("designation_other")


def _officer_for_academic_card(doc_type, data):
	"""On Academic / Enrolment cards, a manager files the visit for a selected field officer."""
	if doc_type not in DELEGATED_FIELD_OFFICER_DOC_TYPES:
		return None
	assigned = {o["employee"]: o for o in get_assigned_field_officers()}
	# Managers may pick any active field-officer staff (role-based), not only FO tree
	if can_manage_supervisor_only_field_visits() or (
		doc_type == "Enrolment of Participants" and can_manage_farhan_only_field_visit()
	):
		for row in get_active_field_officer_staff():
			assigned.setdefault(row["employee"], row)
	if not assigned:
		return None
	chosen = cstr(data.get("field_officer") or "").strip()
	officer = assigned.get(chosen)
	if not officer:
		# Allow name match (legacy) → resolve to employee
		for row in assigned.values():
			if cstr(row.get("employee_name") or "").strip() == chosen:
				officer = row
				break
	if not officer:
		frappe.throw(_("Select the field employee in Name of Staff."))
	data["visit_by"] = officer["employee_name"]
	data["staff_employee"] = officer["employee"]
	return officer


@frappe.whitelist()
def submit_smes_activity(data):
	"""Create a Field Visit from the easy SMEs Activity portal."""
	if isinstance(data, str):
		data = frappe.parse_json(data)

	if not data.get("activity_type"):
		frappe.throw(_("Type of Activity is required."))
	if not data.get("visit_date"):
		frappe.throw(_("Date is required."))

	remarks_text = (
		cstr(data.get("school_additional_remarks") or "").strip()
		or cstr(data.get("mt_remarks") or "").strip()
		or cstr(data.get("mt_meeting_detail") or "").strip()
		or cstr(data.get("ot_remarks") or "").strip()
		or cstr(data.get("ot_academic_work_detail") or "").strip()
		or cstr(data.get("ot_visit_meeting_detail") or "").strip()
		or cstr(data.get("travel_remarks") or "").strip()
	)
	if not remarks_text:
		frappe.throw(_("Visit Summary is required for every activity. Please enter visit summary before submitting."))

	activity_label = data.get("activity_type")
	doc_type = ACTIVITY_TYPE_MAP.get(activity_label, activity_label)

	# School visits: address + at least one contact (name + phone) required.
	_school_contact_types = {
		"Visits",
		"Marketing",
		"Registration of New Schools",
		"Enrolment of Volunteers",
		"Enrolment of Ambassadors",
		"Model School A",
		"Model School B",
		"Books Demand (Quantity)",
		"Joint Visit with SME",
	}
	if doc_type in _school_contact_types:
		address = cstr(data.get("school_address") or "").strip()
		if not address:
			frappe.throw(_("School Address is required."))
		contact_rows = data.get("school_contacts") or []
		if isinstance(contact_rows, str):
			try:
				contact_rows = frappe.parse_json(contact_rows) or []
			except Exception:
				contact_rows = []
		valid_contacts = [
			r
			for r in contact_rows
			if isinstance(r, dict)
			and cstr(r.get("person_name") or "").strip()
			and cstr(r.get("contact_number") or "").strip()
		]
		# Books Demand portal uses single contact fields instead of the table.
		if not valid_contacts:
			single_name = cstr(data.get("contact_person_name") or data.get("meeting_with") or "").strip()
			single_phone = cstr(data.get("contact_number") or "").strip()
			if single_name and single_phone:
				valid_contacts = [{"person_name": single_name, "contact_number": single_phone}]
		if not valid_contacts:
			frappe.throw(_("Add at least one Contact Person with name and phone number."))
	for_officer = _officer_for_academic_card(doc_type, data)

	if not data.get("visit_by") and not data.get("staff_employee"):
		frappe.throw(_("Name of Staff is required."))

	staff_meta = _resolve_visit_staff(data)
	if not staff_meta:
		frappe.throw(
			_("Name of Staff must be an Active employee with Field Officer / Field Staff rights.")
		)
	data["visit_by"] = staff_meta.get("employee_name") or data.get("visit_by")
	data["staff_employee"] = staff_meta.get("employee") or data.get("staff_employee")

	province = PROVINCE_MAP.get(data.get("province") or "", data.get("province"))

	doc = frappe.new_doc("Field Visit")
	doc.type = doc_type

	# Shared / marketing-style fields
	doc.visit_by = data.get("visit_by")
	doc.month = data.get("month")
	doc.quarter = _normalize_quarter(data.get("quarter"))
	doc.marketing_visit_category = data.get("marketing_visit_category") or None
	doc.visit_date = getdate(data.get("visit_date"))
	doc.visiting_starting_time = data.get("starting_time")
	doc.visit_ending_time = data.get("ending_time")
	doc.city = data.get("city")
	doc.area = _resolve_area_link(data.get("area"), city=data.get("city"))
	doc.province = province
	doc.frequency_of_visits = data.get("frequency_of_visits") or None
	material = data.get("marketing_material_provided")
	if isinstance(material, str):
		material = material.strip().lower()
	doc.marketing_material_provided = 1 if material in (True, 1, "1", "true", "yes") else 0
	doc.status = data.get("status") or None
	doc.reason_not_agreed = data.get("reasons_if_not_agreed")
	doc.reasons_if_not_agreed_other = data.get("reasons_if_not_agreed_other")
	# Keep free-text details column for notes / "Other"
	detail_reason = data.get("reasons_if_not_agreed_other") or data.get("reasons_if_not_agreed")
	doc.reasons_if_not_agreed = detail_reason
	doc.school_remarks_follow_up = data.get("school_remarks_follow_up")

	raw_school = cstr(data.get("school_name")).strip()
	resolved_school = _resolve_customer_link(raw_school)
	existing_soa = None
	if not resolved_school and raw_school:
		existing_soa = _find_school_opening_by_name(raw_school)
		soa_customer = cstr((existing_soa or {}).get("customer") or "").strip()
		if soa_customer:
			resolved_school = _resolve_customer_link(soa_customer) or (
				soa_customer if frappe.db.exists("Customer", soa_customer) else ""
			)
	school_opening_data = data.get("school_opening")
	soa_doc = None
	if school_opening_data and not resolved_school:
		if not isinstance(school_opening_data, dict):
			school_opening_data = {}
		if not (school_opening_data.get("school_name") or "").strip():
			school_opening_data["school_name"] = raw_school
		if not (school_opening_data.get("tif_representative") or "").strip():
			school_opening_data["tif_representative"] = data.get("visit_by")
		if not (school_opening_data.get("city") or "").strip():
			school_opening_data["city"] = data.get("city")
		if not (school_opening_data.get("area") or "").strip():
			school_opening_data["area"] = data.get("area")
		if not (school_opening_data.get("province") or "").strip():
			school_opening_data["province"] = data.get("province")
		if not (school_opening_data.get("form_date") or "").strip():
			school_opening_data["form_date"] = data.get("visit_date")
		soa_doc = create_school_opening_application(school_opening_data)
		if doc_type == "Books Demand (Quantity)":
			return {
				"name": None,
				"school_opening": soa_doc.name,
				"books_blocked": True,
				"status_message": _(
					"School Opening request {0} was saved. Book Demand can be submitted after this school is added to the School Database."
				).format(soa_doc.name),
			}
	elif doc_type in SCHOOL_NAME_LINK_TYPES and raw_school and not resolved_school and not existing_soa:
		frappe.throw(
			_(
				"School Name '{0}' was not found in Customer or School Opening Applications. Select a school from the list or Create School."
			).format(raw_school),
			frappe.LinkValidationError,
		)
	doc.school_name = resolved_school
	_apply_school_contacts(doc, data)
	doc.school_address = data.get("school_address")
	doc.school_type = data.get("school_type")
	doc.reference = data.get("reference")
	doc.school_additional_remarks = data.get("school_additional_remarks")
	pending_soa = soa_doc
	if not pending_soa and existing_soa and not resolved_school:
		# Selected a pending School Opening Application (no Customer yet).
		pending_soa = frappe._dict(existing_soa)
	if pending_soa:
		pending_name = cstr(
			getattr(pending_soa, "school_name", None)
			or (pending_soa.get("school_name") if isinstance(pending_soa, dict) else None)
			or raw_school
		).strip()
		soa_name = cstr(
			getattr(pending_soa, "name", None)
			or (pending_soa.get("name") if isinstance(pending_soa, dict) else None)
			or ""
		).strip()
		fv_meta = frappe.get_meta("Field Visit")
		if fv_meta.has_field("pending_school_name"):
			doc.pending_school_name = pending_name
		note = _("Pending school (School Opening {0}): {1}").format(soa_name or "—", pending_name)
		extra = cstr(doc.school_additional_remarks or "").strip()
		doc.school_additional_remarks = f"{note}\n{extra}".strip() if extra else note
		soa_address = cstr(
			getattr(pending_soa, "address", None)
			or (pending_soa.get("address") if isinstance(pending_soa, dict) else None)
			or ""
		).strip()
		if not cstr(doc.school_address or "").strip() and soa_address:
			doc.school_address = soa_address
		if not cstr(doc.reference or "").strip() and soa_name:
			doc.reference = soa_name

	doc.qps_affiliated = data.get("qps_affiliated")
	doc.tps_affiliated = data.get("tps_affiliated")
	doc.cee_affiliated = data.get("cee_affiliated")
	sync_model_school_field(doc)

	for key in (
		"qps_mqh_books",
		"qps_mqh_teachers_guides",
		"qps_onsite_training",
		"qps_online_training",
		"qps_registration_lms",
		"qps_50_days_syllabus",
		"qps_mqh_quiz",
		"tps_noorani_qaida",
		"tps_noorani_qaida_guide",
		"tps_1_day_tajweed_females",
		"tps_ttc_tajweed_khi",
		"tps_tajweed_customize",
		"tps_noorani_qaida_workbook_khi",
		"tps_tajweed_workshop_kids_khi",
		"cee_elp",
		"cee_tecc_foundation",
		"cee_tecc_professional",
		"cee_one_day_workshop",
	):
		if data.get(key):
			doc.set(key, data.get(key))

	doc.registered_volunteer = data.get("registered_volunteer")

	doc.meeting_picture = data.get("meeting_picture")
	doc.school_picture = data.get("school_picture")
	doc.visiting_card_attach = data.get("visiting_card_attach")
	if hasattr(doc, "visit_video"):
		doc.visit_video = data.get("visit_video")
	doc.attendance_sheet_attach = data.get("attendance_sheet_attach")
	doc.training_awareness_pictures = data.get("training_awareness_pictures")
	doc.attendance_sheet_excel = data.get("attendance_sheet_excel")

	# Mirror common fields into type-specific sections where useful
	if doc_type == "M&E":
		doc.me_visit_by = doc.visit_by
		doc.me_month = doc.month
		doc.me_visit_date = doc.visit_date
		doc.me_starting_time = doc.visiting_starting_time
		doc.me_city = doc.city
		doc.me_area = doc.area
		doc.me_province = doc.province
		doc.me_school_name = doc.school_name
		doc.me_quarter = doc.quarter
		doc.me_meeting_with_person_name = doc.meeting_with
		doc.me_designation_meeting_with = (
			cstr(data.get("me_designation_meeting_with") or "").strip()
			or (doc.designation_other if doc.designation == "Other" else doc.designation)
		)
		doc.me_contact_no_meeting_with = doc.contact_number

		doc.me_mqh_book_status = data.get("me_mqh_book_status")
		doc.me_activity_status = data.get("me_mqh_book_status")
		inactive = _as_list(data.get("me_inactive_reasons"))
		doc.me_inactive_reasons = "\n".join(inactive)
		doc.me_reason_of_above = doc.me_inactive_reasons
		doc.me_demand_from_school = data.get("me_demand_from_school")
		doc.me_teachers_training_session = data.get("me_teachers_training_session")
		doc.me_number_of_teachers_mqh = data.get("me_number_of_teachers_mqh")
		doc.me_teachers_mqh_other = data.get("me_teachers_mqh_other")
		doc.me_used_teachers_guide = data.get("me_used_teachers_guide")
		doc.me_mqh_book_version = data.get("me_mqh_book_version")
		doc.me_mqh_book_part = "\n".join(_as_list(data.get("me_mqh_book_part")))
		doc.me_classes_per_week = data.get("me_classes_per_week")
		doc.me_class_duration = data.get("me_class_duration")
		doc.me_took_assessment = data.get("me_took_assessment")
		doc.me_student_behavior_changes = data.get("me_student_behavior_changes")
		doc.me_nazra_quran_status = data.get("me_nazra_quran_status")
		doc.me_nazra_demand_from_school = data.get("me_nazra_demand_from_school")
		doc.me_nazra_tajweed_training = data.get("me_nazra_tajweed_training")
		doc.me_nazra_teachers_count = data.get("me_nazra_teachers_count")
		doc.me_nazra_teachers_other = data.get("me_nazra_teachers_other")
		doc.me_nazra_used_teachers_guide = data.get("me_nazra_used_teachers_guide")
		doc.me_nazra_book_taught = data.get("me_nazra_book_taught")
		doc.me_nazra_classes_per_week = data.get("me_nazra_classes_per_week")
		doc.me_nazra_class_duration = data.get("me_nazra_class_duration")
		doc.me_nazra_took_assessment = data.get("me_nazra_took_assessment")
		doc.me_nazra_tajweed_changes = data.get("me_nazra_tajweed_changes")
		assessment_from = _as_list(data.get("me_assessment_from"))
		doc.me_assessment_from_multi = "\n".join(assessment_from)
		doc.me_assessment_taken_from = ", ".join(assessment_from)
		changes = _as_list(data.get("me_changes_made"))
		doc.me_changes_made = "\n".join(changes)
		doc.me_details_of_changes_made = data.get("me_details_of_changes_made")
		doc.me_new_school_address = data.get("me_new_school_address")
		doc.me_new_person_name = data.get("me_new_person_name")
		doc.me_new_person_designation = data.get("me_new_person_designation")
		doc.me_new_person_mobile_number = data.get("me_new_person_mobile_number")
		doc.me_new_person_email = data.get("me_new_person_email")
	elif doc_type == "Joint Visit with SME":
		joint_smes = _as_list(data.get("joint_visit_with_smes"))
		doc.joint_visit_with_smes = "\n".join(joint_smes)
		doc.joint_sme_skill_rating = data.get("joint_sme_skill_rating")
		# Marketing-style fields also collected on joint visits in Google Form
		doc.frequency_of_visits = data.get("frequency_of_visits") or doc.frequency_of_visits
		doc.status = data.get("status") or doc.status
	elif doc_type == "Internal Meeting":
		doc.mt_visit_by = doc.visit_by
		doc.mt_month = doc.month
		doc.mt_meeting_date = doc.visit_date
		doc.mt_meeting_starting_time = doc.visiting_starting_time
		doc.mt_meeting_ending_time = doc.visit_ending_time
		doc.mt_meeting_type = "Internal Meeting (Meeting with TIF Staff)"
		doc.mt_trainer = data.get("mt_trainer")
		doc.training_trainer_name = data.get("mt_trainer")
		doc.mt_agenda = data.get("mt_agenda")
		doc.mt_remarks = data.get("mt_remarks")
		doc.mt_resolution = data.get("mt_resolution")
	elif doc_type == "Meeting" or doc_type == "Meeting with Ulama and Educationist":
		doc.mt_visit_by = doc.visit_by
		doc.mt_month = doc.month
		doc.mt_meeting_date = doc.visit_date
		doc.mt_meeting_starting_time = doc.visiting_starting_time
		doc.mt_meeting_ending_time = doc.visit_ending_time
		doc.mt_city = doc.city
		doc.mt_area = doc.area
		doc.mt_meeting_type = data.get("mt_meeting_type")
		doc.mt_meeting_mode = data.get("mt_meeting_mode")
		doc.mt_internal_meeting_with = data.get("mt_internal_meeting_with")
		doc.mt_external_meeting_with = data.get("mt_external_meeting_with")
		if doc_type == "Meeting with Ulama and Educationist":
			doc.mt_meeting_type = (
				doc.mt_meeting_type or "External Meeting (Meeting with Others)"
			)
			doc.mt_external_meeting_with = doc.mt_external_meeting_with or "Ulma Karam"
		doc.mt_meeting_with_person_name = data.get("mt_person_name") or doc.meeting_with
		doc.mt_contact_no = data.get("mt_contact_number") or doc.contact_number
		doc.mt_designation = cstr(data.get("mt_designation") or data.get("designation") or "").strip()
		doc.mt_venue = cstr(data.get("mt_venue") or raw_school).strip()
		doc.mt_remarks = data.get("mt_meeting_detail")
		doc.mt_reference = doc.reference
		doc.mt_visiting_card = data.get("visiting_card_attach")
		doc.mt_meeting_picture = data.get("meeting_picture")
	elif doc_type in OFFICIAL_TASK_DOC_TYPES:
		_apply_official_task_fields(doc, data)
	elif doc_type in ("Co-curricular Activity", "Quiz Arranged"):
		doc.cc_activity = data.get("cc_activity")
		doc.cc_venue = data.get("cc_venue")
		doc.cc_no_of_schools = data.get("cc_no_of_schools")
		doc.cc_no_of_participants = data.get("cc_no_of_participants")
		cats = _as_list(data.get("cc_participants_category"))
		doc.cc_participants_category = "\n".join(cats)
	elif doc_type == "Other":
		doc.ot_date = doc.visit_date
		doc.ot_start_time = doc.visiting_starting_time
		doc.ot_end_time = doc.visit_ending_time
		doc.ot_remarks = data.get("school_additional_remarks") or data.get("ot_remarks")
	elif doc_type in ("Training", "Workshop", "Teachers Training Meeting", "Workshop Conducted", "Workshop Arranged"):
		doc.training_month = doc.month
		doc.training_date = doc.visit_date
		doc.training_trainer_name = data.get("training_trainer_name") or doc.visit_by
		doc.training_entry_filled_by = data.get("training_entry_filled_by") or doc.visit_by
		doc.training_city = doc.city
		doc.training_province = doc.province
		doc.training_session_category = data.get("training_session_category")
		if not doc.training_session_category and doc_type == "Workshop":
			doc.training_session_category = "Half Day Workshop"
		if not doc.training_session_category and doc_type == "Teachers Training Meeting":
			doc.training_session_category = "Teachers Training Meeting (One to One)"
		if not doc.training_session_category and doc_type in ("Workshop Arranged", "Workshop Conducted"):
			doc.training_session_category = "Half Day Workshop"
		doc.training_workshop_topic = data.get("training_workshop_topic")
		doc.training_mode = data.get("training_mode")
		doc.training_venue_name = data.get("training_venue_name") or doc.school_name
		doc.training_no_of_participants = data.get("training_no_of_participants")
		if doc_type == "Teachers Training Meeting":
			doc.training_no_of_schools_attended = 1
		else:
			doc.training_no_of_schools_attended = data.get("training_no_of_schools_attended") or data.get(
				"training_no_of_schools"
			)
		arrange = _as_list(data.get("training_arrange_by"))
		doc.training_arrange_by = "\n".join(arrange)
		conducted = cstr(data.get("training_conducted_by")).strip()
		if conducted == "Other":
			conducted = cstr(data.get("training_conducted_by_other")).strip() or "Other"
		doc.training_conducted_by = conducted
		doc.training_conducted_by_other = data.get("training_conducted_by_other")
	elif doc_type in (
		"Enrolment of Participants",
		"Enrolment of Participant in ELP/ TECC/ TTC/ Online Tajweed",
	):
		_append_enrolment_rows(doc, data)
	elif doc_type == "Enrolment of Volunteers":
		_append_volunteer_rows(doc, data)
	elif doc_type == "Enrolment of Ambassadors":
		_append_ambassador_rows(doc, data)
	elif doc_type in (
		"Attendance / Registration in One Day / Half day Workshop",
		"Registration of Participant in Workshops",
	):
		_append_workshop_rows(doc, data)

	if data.get("mutalae_sample") in (True, 1, "1", "true", "True", "yes", "Yes"):
		note = "Mutalae Quran Sample given: Yes"
		existing = cstr(doc.school_additional_remarks or "").strip()
		doc.school_additional_remarks = f"{existing}\n{note}".strip() if existing else note

	_apply_books_demand(doc, data)
	_apply_travel_fields(doc, data)
	sync_travel_cost(doc)

	doc.insert(ignore_permissions=False)
	if for_officer and for_officer.get("user") and for_officer["user"] != frappe.session.user:
		frappe.db.set_value("Field Visit", doc.name, "owner", for_officer["user"], update_modified=False)
		doc.owner = for_officer["user"]
	submitted = False
	if data.get("submit_doc") in (True, 1, "1", "true", "True"):
		doc.submit()
		submitted = True
	frappe.db.commit()

	out = {
		"name": doc.name,
		"submitted": submitted,
		"url": get_url(f"/app/field-visit/{doc.name}"),
		"school_opening": soa_doc.name if soa_doc else None,
		"status_message": _("Activity saved as {0}").format(doc.name)
		+ (
			_(" School Opening request {0} was also saved.").format(soa_doc.name)
			if soa_doc
			else ""
		),
	}
	try:
		from tif_customization.tif_customization.api.feedback_studio import _sme_form_url_for_field_visit

		feedback = _sme_form_url_for_field_visit(doc.name) or {}
		# SME form first; public QR is created only after the SME submits that form.
		out["feedback_url"] = feedback.get("feedback_url") or feedback.get("sme_form_url") or ""
		out["field_visit"] = doc.name
	except Exception:
		frappe.log_error(frappe.get_traceback(), "SME feedback URL from Field Visit")
		out["feedback_url"] = ""
	return out


@frappe.whitelist()
def submit_field_visit_doc(name):
	"""Submit a Field Visit created from the easy portal after attachments are uploaded."""
	name = cstr(name or "").strip()
	if not name:
		frappe.throw(_("Field Visit name is required."))
	if not frappe.db.exists("Field Visit", name):
		frappe.throw(_("Field Visit {0} not found.").format(name))
	doc = frappe.get_doc("Field Visit", name)
	if not frappe.has_permission("Field Visit", "submit", doc):
		frappe.throw(_("Not permitted to submit this Field Visit."), frappe.PermissionError)
	if cint(doc.docstatus) == 2:
		frappe.throw(_("Cancelled visits cannot be submitted."))
	if cint(doc.docstatus) == 0:
		doc.submit()
		frappe.db.commit()
	return {
		"name": doc.name,
		"submitted": True,
		"docstatus": cint(doc.docstatus),
		"url": get_url(f"/field-visit-easy?name={doc.name}"),
		"desk_url": get_url(f"/app/field-visit/{doc.name}"),
		"message": _("Visit submitted as {0}").format(doc.name),
	}


def field_visit_easy_path(name):
	from urllib.parse import quote

	return f"/field-visit-easy?name={quote(cstr(name), safe='')}"


def _portal_school_expr(alias="fv"):
	a = alias
	return f"""COALESCE(
		NULLIF(TRIM({a}.school_name), ''),
		NULLIF(TRIM({a}.pending_school_name), ''),
		NULLIF(TRIM({a}.me_school_name), ''),
		NULLIF(TRIM({a}.mt_institute_or_organization_name), ''),
		NULLIF(TRIM({a}.training_venue_name), '')
	)"""


def _portal_officer_expr(alias="fv"):
	a = alias
	return f"""COALESCE(
		NULLIF(TRIM({a}.visit_by), ''),
		NULLIF(TRIM({a}.me_visit_by), ''),
		NULLIF(TRIM({a}.mt_visit_by), ''),
		NULLIF(TRIM({a}.training_entry_filled_by), ''),
		NULLIF(TRIM({a}.training_trainer_name), '')
	)"""


def _portal_city_expr(alias="fv"):
	a = alias
	return f"""COALESCE(
		NULLIF(TRIM({a}.city), ''),
		NULLIF(TRIM({a}.me_city), ''),
		NULLIF(TRIM({a}.mt_city), '')
	)"""


def _resolve_customer_label(value):
	name = cstr(value or "").strip()
	if not name:
		return ""
	if frappe.db.exists("Customer", name):
		return cstr(frappe.db.get_value("Customer", name, "customer_name") or name).strip()
	return name


def _portal_status_label(docstatus):
	return {0: _("Draft"), 1: _("Submitted"), 2: _("Cancelled")}.get(cint(docstatus), cstr(docstatus))


@frappe.whitelist()
def get_portal_dashboard(from_date=None, to_date=None):
	"""Field employee portal home: counts, type breakdown, recent visits."""
	from frappe.utils import add_days, get_first_day, get_last_day

	from tif_customization.tif_customization.field_visit_permissions import (
		apply_team_scope_to_conditions,
		visit_day_sql,
	)

	if frappe.session.user == "Guest":
		frappe.throw(_("Please log in"), frappe.AuthenticationError)

	today_s = today()
	month_start = str(get_first_day(today_s))
	month_end = str(get_last_day(today_s))
	week_start = str(add_days(getdate(today_s), -getdate(today_s).weekday()))
	from_date = cstr(from_date or month_start).strip() or month_start
	to_date = cstr(to_date or today_s).strip() or today_s

	params = {
		"from_date": from_date,
		"to_date": to_date,
		"today": today_s,
		"week_start": week_start,
		"month_start": month_start,
		"month_end": month_end,
	}
	scope = []
	apply_team_scope_to_conditions(scope, params, alias="fv")
	scope_sql = (" AND " + " AND ".join(scope)) if scope else ""
	day_sql = visit_day_sql("fv")

	def _count(extra=""):
		return cint(
			frappe.db.sql(
				f"""
				SELECT COUNT(*)
				FROM `tabField Visit` fv
				WHERE IFNULL(fv.docstatus, 0) < 2
				{scope_sql}
				{extra}
				""",
				params,
			)[0][0]
		)

	total_period = _count(f" AND ({day_sql}) BETWEEN %(from_date)s AND %(to_date)s")
	today_count = _count(f" AND ({day_sql}) = %(today)s")
	week_count = _count(f" AND ({day_sql}) BETWEEN %(week_start)s AND %(today)s")
	month_count = _count(f" AND ({day_sql}) BETWEEN %(month_start)s AND %(month_end)s")
	draft_count = _count(
		f" AND IFNULL(fv.docstatus, 0) = 0 AND ({day_sql}) BETWEEN %(from_date)s AND %(to_date)s"
	)

	by_type = frappe.db.sql(
		f"""
		SELECT IFNULL(NULLIF(TRIM(fv.type), ''), 'Other') AS activity_type, COUNT(*) AS total
		FROM `tabField Visit` fv
		WHERE IFNULL(fv.docstatus, 0) < 2
			AND ({day_sql}) BETWEEN %(from_date)s AND %(to_date)s
			{scope_sql}
		GROUP BY 1
		ORDER BY total DESC
		LIMIT 8
		""",
		params,
		as_dict=True,
	)

	recent = frappe.db.sql(
		f"""
		SELECT
			fv.name,
			fv.type,
			fv.docstatus,
			fv.status,
			({day_sql}) AS visit_date,
			{_portal_school_expr("fv")} AS school,
			{_portal_officer_expr("fv")} AS officer,
			{_portal_city_expr("fv")} AS city,
			fv.modified
		FROM `tabField Visit` fv
		WHERE IFNULL(fv.docstatus, 0) < 2
			{scope_sql}
		ORDER BY fv.modified DESC
		LIMIT 8
		""",
		params,
		as_dict=True,
	)
	for row in recent:
		row["school"] = _resolve_customer_label(row.get("school"))
		row["docstatus_label"] = _portal_status_label(row.get("docstatus"))
		row["url"] = field_visit_easy_path(row.get("name"))
		if row.get("visit_date"):
			row["visit_date"] = str(getdate(row["visit_date"]))

	emp = None
	try:
		from tif_customization.tif_customization.field_visit_permissions import get_employee_for_user

		emp = get_employee_for_user()
	except Exception:
		emp = None
	if not emp:
		emp = _employee_for_user(frappe.session.user)

	full_name = (
		(emp.employee_name if emp else None)
		or frappe.db.get_value("User", frappe.session.user, "full_name")
		or frappe.session.user
	)

	return {
		"user": frappe.session.user,
		"full_name": full_name,
		"employee": emp.name if emp else "",
		"from_date": from_date,
		"to_date": to_date,
		"stats": {
			"today": today_count,
			"this_week": week_count,
			"this_month": month_count,
			"period_total": total_period,
			"drafts": draft_count,
		},
		"by_type": by_type,
		"recent": recent,
	}


@frappe.whitelist()
def get_portal_visit_list(
	page=1,
	page_length=20,
	search=None,
	activity_type=None,
	from_date=None,
	to_date=None,
	docstatus=None,
):
	"""Paginated Field Visit list for the field employee portal."""
	from tif_customization.tif_customization.field_visit_permissions import (
		apply_team_scope_to_conditions,
		visit_day_sql,
	)

	if frappe.session.user == "Guest":
		frappe.throw(_("Please log in"), frappe.AuthenticationError)

	page = max(cint(page) or 1, 1)
	page_length = min(max(cint(page_length) or 20, 1), 100)
	search = cstr(search or "").strip()
	activity_type = cstr(activity_type or "").strip()
	from_date = cstr(from_date or "").strip()
	to_date = cstr(to_date or "").strip()
	docstatus_filter = cstr(docstatus if docstatus is not None else "").strip()

	params = {}
	conditions = []
	apply_team_scope_to_conditions(conditions, params, alias="fv")
	day_sql = visit_day_sql("fv")

	if docstatus_filter in ("0", "1", "2"):
		conditions.append("IFNULL(fv.docstatus, 0) = %(docstatus)s")
		params["docstatus"] = cint(docstatus_filter)
	else:
		conditions.append("IFNULL(fv.docstatus, 0) < 2")

	if activity_type:
		conditions.append("fv.type = %(activity_type)s")
		params["activity_type"] = activity_type

	if from_date:
		conditions.append(f"({day_sql}) >= %(from_date)s")
		params["from_date"] = from_date
	if to_date:
		conditions.append(f"({day_sql}) <= %(to_date)s")
		params["to_date"] = to_date

	if search:
		params["search"] = f"%{search}%"
		conditions.append(
			f"""(
				fv.name LIKE %(search)s
				OR {_portal_school_expr("fv")} LIKE %(search)s
				OR {_portal_officer_expr("fv")} LIKE %(search)s
				OR {_portal_city_expr("fv")} LIKE %(search)s
				OR IFNULL(fv.type, '') LIKE %(search)s
			)"""
		)

	where_sql = (" WHERE " + " AND ".join(conditions)) if conditions else ""
	total = cint(
		frappe.db.sql(
			f"SELECT COUNT(*) FROM `tabField Visit` fv{where_sql}",
			params,
		)[0][0]
	)

	params["limit"] = page_length
	params["offset"] = (page - 1) * page_length
	rows = frappe.db.sql(
		f"""
		SELECT
			fv.name,
			fv.type,
			fv.docstatus,
			fv.status,
			fv.month,
			fv.quarter,
			fv.province,
			({day_sql}) AS visit_date,
			{_portal_school_expr("fv")} AS school,
			{_portal_officer_expr("fv")} AS officer,
			{_portal_city_expr("fv")} AS city,
			fv.modified,
			fv.creation,
			fv.owner
		FROM `tabField Visit` fv
		{where_sql}
		ORDER BY ({day_sql}) DESC, fv.modified DESC
		LIMIT %(limit)s OFFSET %(offset)s
		""",
		params,
		as_dict=True,
	)

	for row in rows:
		row["school"] = _resolve_customer_label(row.get("school"))
		row["docstatus_label"] = _portal_status_label(row.get("docstatus"))
		row["url"] = field_visit_easy_path(row.get("name"))
		if row.get("visit_date"):
			row["visit_date"] = str(getdate(row["visit_date"]))

	# Distinct types for filter (scoped; ignore search/date so dropdown stays useful)
	type_params = {}
	type_conds = []
	apply_team_scope_to_conditions(type_conds, type_params, alias="fv")
	type_conds.append("IFNULL(fv.docstatus, 0) < 2")
	type_conds.append("IFNULL(TRIM(fv.type), '') != ''")
	type_where = " WHERE " + " AND ".join(type_conds)
	type_rows = frappe.db.sql(
		f"""
		SELECT DISTINCT fv.type AS value
		FROM `tabField Visit` fv
		{type_where}
		ORDER BY fv.type
		LIMIT 100
		""",
		type_params,
		as_dict=True,
	)

	return {
		"page": page,
		"page_length": page_length,
		"total": total,
		"pages": max(1, (total + page_length - 1) // page_length) if total else 1,
		"rows": rows,
		"activity_types": [r.value for r in type_rows if r.get("value")],
		"filters": {
			"search": search,
			"activity_type": activity_type,
			"from_date": from_date,
			"to_date": to_date,
			"docstatus": docstatus_filter,
		},
	}


@frappe.whitelist()
def get_field_visit_easy_view(name=None):
	"""Read-only Field Visit payload for /field-visit-easy?name=… view mode."""
	name = cstr(name or "").strip()
	if not name:
		frappe.throw(_("Field Visit name is required."))
	if not frappe.db.exists("Field Visit", name):
		frappe.throw(_("Field Visit {0} not found.").format(name))
	if not frappe.has_permission("Field Visit", "read", name):
		frappe.throw(_("Not permitted to view this Field Visit."), frappe.PermissionError)

	doc = frappe.get_doc("Field Visit", name)
	status_map = {0: _("Draft"), 1: _("Submitted"), 2: _("Cancelled")}
	school = (
		cstr(doc.school_name).strip()
		or cstr(getattr(doc, "pending_school_name", None)).strip()
		or cstr(getattr(doc, "me_school_name", None)).strip()
		or cstr(getattr(doc, "mt_institute_or_organization_name", None)).strip()
		or cstr(getattr(doc, "training_venue_name", None)).strip()
	)
	# Volunteer / ambassador child rows may carry the school when parent is blank.
	if not school:
		for child in getattr(doc, "volunteer_enrolments", None) or []:
			school = cstr(getattr(child, "school", None)).strip()
			if school:
				break
	if not school:
		for child in getattr(doc, "ambassador_enrolments", None) or []:
			school = cstr(getattr(child, "school", None)).strip()
			if school:
				break
	if school and frappe.db.exists("Customer", school):
		school = cstr(frappe.db.get_value("Customer", school, "customer_name") or school).strip()
	officer = (
		cstr(doc.visit_by).strip()
		or cstr(doc.me_visit_by).strip()
		or cstr(doc.mt_visit_by).strip()
		or cstr(doc.training_entry_filled_by).strip()
	)
	visit_date = ""
	try:
		d = doc.get_visit_date()
		visit_date = str(getdate(d)) if d else ""
	except Exception:
		visit_date = cstr(doc.visit_date or doc.me_visit_date or doc.mt_meeting_date or "")

	def row(label, value):
		text = cstr(value).strip()
		if not text:
			return None
		return {"label": label, "value": text}

	sections = []

	def add_section(title, items):
		fields = [f for f in items if f]
		if fields:
			sections.append({"title": title, "fields": fields})

	add_section(
		_("Visit"),
		[
			row(_("Document No"), doc.name),
			row(_("Type"), doc.type),
			row(_("Status"), status_map.get(doc.docstatus, doc.docstatus)),
			row(_("Visit Date"), visit_date),
			row(_("Officer / Visit By"), officer),
			row(_("School"), school),
			row(_("Province"), getattr(doc, "province", None) or getattr(doc, "me_province", None)),
			row(
				_("City"),
				getattr(doc, "city", None)
				or getattr(doc, "me_city", None)
				or getattr(doc, "mt_city", None),
			),
			row(
				_("Area"),
				getattr(doc, "area", None)
				or getattr(doc, "me_area", None)
				or getattr(doc, "mt_area", None),
			),
			row(
				_("Category"),
				getattr(doc, "marketing_visit_category", None) or getattr(doc, "me_activity_status", None),
			),
			row(_("Frequency"), getattr(doc, "frequency_of_visits", None)),
			row(_("Status (Follow-up)"), getattr(doc, "status", None)),
		],
	)
	add_section(
		_("Meeting"),
		[
			row(
				_("Meeting With"),
				getattr(doc, "mt_person_name", None) or getattr(doc, "meeting_with", None),
			),
			row(
				_("Contact"),
				getattr(doc, "mt_contact_number", None) or getattr(doc, "contact_number", None),
			),
			row(
				_("Designation"),
				getattr(doc, "mt_designation", None) or getattr(doc, "designation", None),
			),
			row(
				_("Venue / Institute"),
				getattr(doc, "mt_venue", None) or getattr(doc, "mt_institute_or_organization_name", None),
			),
			row(_("Agenda"), getattr(doc, "mt_agenda", None)),
			row(_("Visit Summary"), getattr(doc, "mt_remarks", None)),
			row(_("Resolution"), getattr(doc, "mt_resolution", None)),
		],
	)
	add_section(
		_("Monitoring & Evaluation"),
		[
			row(_("Activity Status"), getattr(doc, "me_activity_status", None)),
			row(_("Inactive Reasons"), getattr(doc, "me_inactive_reasons", None)),
			row(_("Book Status"), getattr(doc, "me_mqh_book_status", None)),
			row(_("Teachers Training"), getattr(doc, "me_teachers_training_session", None)),
			row(_("Reason"), getattr(doc, "me_reason_of_above", None)),
		],
	)
	# Skip empty training block for volunteer / ambassador enrolments (Participants: 0 noise).
	doc_type = cstr(doc.type or "")
	if doc_type not in ("Enrolment of Volunteers", "Enrolment of Ambassadors"):
		add_section(
			_("Training / Workshop"),
			[
				row(_("Trainer"), getattr(doc, "training_trainer_name", None)),
				row(_("Entry Filled By"), getattr(doc, "training_entry_filled_by", None)),
				row(_("Venue"), getattr(doc, "training_venue_name", None)),
				row(_("Mode"), getattr(doc, "training_mode", None)),
				row(_("Topic"), getattr(doc, "training_workshop_topic", None)),
				row(_("Participants"), getattr(doc, "training_no_of_participants", None)),
				row(_("Schools"), getattr(doc, "training_no_of_schools", None)),
			],
		)

	def _child_school_label(school_id):
		school_id = cstr(school_id or "").strip()
		if not school_id:
			return ""
		if frappe.db.exists("Customer", school_id):
			return cstr(
				frappe.db.get_value("Customer", school_id, "customer_name") or school_id
			).strip()
		return school_id

	def _load_child_rows(doctype, parentfield):
		"""Prefer DB rows so Easy View always shows saved enrolments."""
		if not frappe.db.exists("DocType", doctype):
			return []
		return frappe.get_all(
			doctype,
			filters={"parent": doc.name, "parentfield": parentfield},
			fields=["*"],
			order_by="idx asc",
		)

	volunteer_rows = _load_child_rows("Field Visit Volunteer", "volunteer_enrolments")
	if not volunteer_rows:
		volunteer_rows = list(getattr(doc, "volunteer_enrolments", None) or [])
	if volunteer_rows:
		add_section(
			_("Volunteers"),
			[
				row(_("Registered with TIF as Volunteer"), getattr(doc, "registered_volunteer", None)),
				row(_("Volunteers Enrolled"), len(volunteer_rows)),
			],
		)
		for idx, vol in enumerate(volunteer_rows, start=1):
			vol = frappe._dict(vol) if isinstance(vol, dict) else vol
			add_section(
				_("Volunteer {0}").format(idx),
				[
					row(_("Name"), getattr(vol, "volunteer_name", None)),
					row(_("Contact"), getattr(vol, "contact_number", None)),
					row(_("Email"), getattr(vol, "email", None)),
					row(_("Profession"), getattr(vol, "profession", None)),
					row(_("Contribution / Role"), getattr(vol, "contribution", None)),
					row(_("Province"), getattr(vol, "province", None)),
					row(_("City"), getattr(vol, "city", None)),
					row(_("Area"), getattr(vol, "area", None)),
					row(_("Address"), getattr(vol, "address", None)),
					row(_("School"), _child_school_label(getattr(vol, "school", None))),
					row(_("Form Submitted"), getattr(vol, "volunteer_form_submitted", None)),
					row(_("Visit Summary"), getattr(vol, "remarks", None)),
				],
			)

	ambassador_rows = _load_child_rows("Field Visit Ambassador", "ambassador_enrolments")
	if not ambassador_rows:
		ambassador_rows = list(getattr(doc, "ambassador_enrolments", None) or [])
	if ambassador_rows or doc_type == "Enrolment of Ambassadors":
		add_section(
			_("Ambassadors"),
			[
				row(_("Ambassadors Enrolled"), len(ambassador_rows)),
			],
		)
		for idx, amb in enumerate(ambassador_rows, start=1):
			amb = frappe._dict(amb) if isinstance(amb, dict) else amb
			add_section(
				_("Ambassador {0}").format(idx),
				[
					row(
						_("Name"),
						getattr(amb, "ambassador_name", None) or getattr(amb, "volunteer_name", None),
					),
					row(_("Contact"), getattr(amb, "contact_number", None)),
					row(_("Email"), getattr(amb, "email", None)),
					row(_("Profession"), getattr(amb, "profession", None)),
					row(_("Contribution / Role"), getattr(amb, "contribution", None)),
					row(_("Province"), getattr(amb, "province", None)),
					row(_("City"), getattr(amb, "city", None)),
					row(_("Area"), getattr(amb, "area", None)),
					row(_("Address"), getattr(amb, "address", None)),
					row(_("School"), _child_school_label(getattr(amb, "school", None))),
					row(_("Form Submitted"), getattr(amb, "ambassador_form_submitted", None)),
					row(_("Visit Summary"), getattr(amb, "remarks", None)),
				],
			)

	add_section(
		_("Travel"),
		[
			row(_("Mode"), getattr(doc, "travel_mode", None)),
			row(
				_("Distance (km)"),
				getattr(doc, "travel_distance_km", None) or getattr(doc, "distance_km", None),
			),
			row(_("Travel Visit Summary"), getattr(doc, "travel_remarks", None)),
		],
	)
	visit_summary_notes = []
	for note in (
		getattr(doc, "school_remarks_follow_up", None),
		getattr(doc, "school_additional_remarks", None),
		getattr(doc, "ot_remarks", None),
	):
		text = cstr(note).strip()
		if text and text not in visit_summary_notes:
			visit_summary_notes.append(text)
	add_section(
		_("Visit Summary"),
		[row(_("Visit Summary"), "\n".join(visit_summary_notes))],
	)

	images = []
	for field, label in (
		("school_picture", _("School Picture")),
		("visiting_card", _("Visiting Card")),
		("meeting_picture", _("Meeting Picture")),
		("attendance_sheet_excel", _("Attendance Sheet")),
	):
		path = cstr(doc.get(field) or "").strip()
		if path:
			images.append({"label": label, "url": path})

	docstatus = cint(doc.docstatus)
	# Portal always uses English status keys so the UI can detect Draft reliably
	status_en = {0: "Draft", 1: "Submitted", 2: "Cancelled"}.get(docstatus, str(docstatus))
	can_submit = docstatus == 0 and bool(frappe.has_permission("Field Visit", "submit", doc))
	can_edit = bool(
		docstatus == 0
		or (docstatus == 1 and can_edit_submitted_field_visit() and frappe.has_permission("Field Visit", "write", doc))
	)
	return {
		"name": doc.name,
		"type": doc.type or "",
		"status": status_en,
		"status_label": status_map.get(docstatus, status_en),
		"docstatus": docstatus,
		"can_submit": can_submit,
		"can_edit": can_edit,
		"visit_date": visit_date,
		"school": school,
		"officer": officer,
		"sections": sections,
		"images": images,
		"easy_url": field_visit_easy_path(doc.name),
		"desk_url": f"/app/field-visit/{doc.name}",
	}


def _parse_rows(value):
	rows = value or []
	if isinstance(rows, str):
		try:
			rows = frappe.parse_json(rows) or []
		except Exception:
			rows = []
	return rows if isinstance(rows, list) else []


def _apply_school_contacts(doc, data):
	raw_designation = cstr(data.get("designation") or data.get("mt_designation") or "").strip()
	if (doc.type or "") in (*MEETING_DOC_TYPES, "M&E") and not _parse_rows(data.get("school_contacts")):
		doc.meeting_with = data.get("contact_person_name")
		doc.contact_number = data.get("contact_number")
		# Meeting titles like Mudaris belong on mt_designation (Data), not this Select.
		doc.designation = ""
		doc.designation_other = ""
		return

	rows = _parse_rows(data.get("school_contacts"))
	if not rows:
		rows = [
			{
				"person_name": data.get("contact_person_name"),
				"contact_number": data.get("contact_number"),
				"designation": raw_designation,
				"designation_other": data.get("designation_other"),
			}
		]

	first = None
	for row in rows:
		if not isinstance(row, dict):
			continue
		name = cstr(row.get("person_name") or row.get("contact_person_name") or "").strip()
		contact = cstr(row.get("contact_number") or "").strip()
		designation, other = _normalize_designation(
			row.get("designation"),
			row.get("designation_other"),
		)
		if not (name or contact or designation):
			continue
		doc.append(
			"school_contacts",
			{
				"person_name": name,
				"contact_number": contact,
				"designation": designation,
				"designation_other": other if designation == "Other" else "",
			},
		)
		if first is None:
			first = {
				"person_name": name,
				"contact_number": contact,
				"designation": designation,
				"designation_other": other if designation == "Other" else "",
			}

	if first:
		doc.meeting_with = first["person_name"]
		doc.contact_number = first["contact_number"]
		doc.designation = first["designation"]
		doc.designation_other = first["designation_other"]
	else:
		select_d, other = _normalize_designation(raw_designation, data.get("designation_other"))
		doc.meeting_with = data.get("contact_person_name")
		doc.contact_number = data.get("contact_number")
		doc.designation = select_d
		doc.designation_other = other


def _apply_books_demand(doc, data):
	rows = _parse_rows(data.get("books_demand"))
	if not rows:
		return
	lines = []
	first_school = ""
	for row in rows:
		if not isinstance(row, dict):
			continue
		book = cstr(row.get("book_name") or "").strip()
		qty = cstr(row.get("qty") or "").strip()
		school = cstr(row.get("school") or "").strip()
		if not (book or qty or school):
			continue
		part = book or "Book"
		if qty:
			part = f"{part} × {qty}"
		if school:
			part = f"{part} — {school}"
			if not first_school:
				first_school = school
		lines.append(part)
	if not lines:
		return
	note = "Books demand:\n" + "\n".join(lines)
	existing = cstr(doc.school_additional_remarks or "").strip()
	doc.school_additional_remarks = f"{existing}\n{note}".strip() if existing else note
	if first_school and not cstr(doc.school_name or "").strip():
		doc.school_name = _resolve_customer_link(first_school)


def _apply_travel_fields(doc, data):
	doc.travel_mode = data.get("travel_mode")
	doc.travel_from = data.get("travel_from")
	doc.travel_to = data.get("travel_to")
	doc.travel_distance_km = data.get("travel_distance_km")
	doc.travel_remarks = data.get("travel_remarks")
	if data.get("travel_per_km_rate") not in (None, ""):
		doc.travel_per_km_rate = data.get("travel_per_km_rate")
	if data.get("travel_cost") not in (None, ""):
		doc.travel_cost = data.get("travel_cost")


def _append_enrolment_rows(doc, data):
	rows = data.get("enrolment_participants") or []
	if isinstance(rows, str):
		try:
			rows = frappe.parse_json(rows) or []
		except Exception:
			rows = []
	for row in rows:
		if not isinstance(row, dict):
			continue
		name = cstr(row.get("participant_name") or row.get("name")).strip()
		if not name:
			continue
		doc.append(
			"enrolment_participants",
			{
				"participant_name": name,
				"contact_number": cstr(row.get("contact_number") or "").strip(),
				"city": cstr(row.get("city") or data.get("city") or "").strip(),
				"province": PROVINCE_MAP.get(
					cstr(row.get("province") or "").strip(),
					cstr(row.get("province") or data.get("province") or "").strip(),
				)
				or data.get("province")
				or "",
				"enroll_in_course": cstr(row.get("enroll_in_course") or "").strip(),
				"date_of_enrolment": row.get("date_of_enrolment") or data.get("visit_date"),
				"other_special_session_name": cstr(row.get("other_special_session_name") or "").strip(),
			},
		)


def _append_volunteer_rows(doc, data):
	"""Child table Field Visit Volunteer — contact, location, school, profession."""
	rows = _parse_rows(data.get("volunteer_enrolments") or data.get("volunteers"))
	meta = frappe.get_meta("Field Visit Volunteer")
	has = {df.fieldname for df in meta.fields}
	for row in rows:
		if not isinstance(row, dict):
			continue
		name = cstr(row.get("volunteer_name") or row.get("name")).strip()
		if not name:
			continue
		province = PROVINCE_MAP.get(
			cstr(row.get("province") or "").strip(),
			cstr(row.get("province") or data.get("province") or "").strip(),
		) or cstr(data.get("province") or "").strip()
		school = cstr(row.get("school") or row.get("school_name") or "").strip()
		if school:
			school = _resolve_customer_link(school) or school
		entry = {
			"volunteer_name": name,
			"contact_number": cstr(row.get("contact_number") or row.get("contact") or "").strip(),
			"email": cstr(row.get("email") or "").strip(),
			"province": province,
			"city": cstr(row.get("city") or data.get("city") or "").strip(),
			"volunteer_form_submitted": cstr(row.get("volunteer_form_submitted") or "No").strip()
			or "No",
			"remarks": cstr(row.get("remarks") or "").strip(),
		}
		if "profession" in has:
			entry["profession"] = cstr(row.get("profession") or "").strip()
		if "contribution" in has:
			entry["contribution"] = cstr(
				row.get("contribution") or row.get("what_doing") or ""
			).strip()
		if "area" in has:
			entry["area"] = cstr(row.get("area") or data.get("area") or "").strip()
		if "address" in has:
			entry["address"] = cstr(row.get("address") or "").strip()
		if "school" in has and school:
			entry["school"] = school
		doc.append("volunteer_enrolments", entry)
	# Optional parent school tag from first volunteer school / payload.
	if not cstr(doc.school_name or "").strip():
		parent_school = cstr(data.get("school_name") or "").strip()
		if not parent_school:
			for row in rows:
				if isinstance(row, dict):
					parent_school = cstr(row.get("school") or row.get("school_name") or "").strip()
					if parent_school:
						break
		if parent_school:
			doc.school_name = _resolve_customer_link(parent_school) or parent_school


def _append_ambassador_rows(doc, data):
	"""Child table Field Visit Ambassador — same shape as volunteers."""
	rows = _parse_rows(data.get("ambassador_enrolments") or data.get("ambassadors"))
	meta = frappe.get_meta("Field Visit Ambassador")
	has = {df.fieldname for df in meta.fields}
	for row in rows:
		if not isinstance(row, dict):
			continue
		name = cstr(row.get("ambassador_name") or row.get("name")).strip()
		if not name:
			continue
		province = PROVINCE_MAP.get(
			cstr(row.get("province") or "").strip(),
			cstr(row.get("province") or data.get("province") or "").strip(),
		) or cstr(data.get("province") or "").strip()
		school = cstr(row.get("school") or row.get("school_name") or "").strip()
		if school:
			school = _resolve_customer_link(school) or school
		entry = {
			"ambassador_name": name,
			"contact_number": cstr(row.get("contact_number") or row.get("contact") or "").strip(),
			"email": cstr(row.get("email") or "").strip(),
			"province": province,
			"city": cstr(row.get("city") or data.get("city") or "").strip(),
			"ambassador_form_submitted": cstr(
				row.get("ambassador_form_submitted") or row.get("form_submitted") or "No"
			).strip()
			or "No",
			"remarks": cstr(row.get("remarks") or "").strip(),
		}
		if "profession" in has:
			entry["profession"] = cstr(row.get("profession") or "").strip()
		if "contribution" in has:
			entry["contribution"] = cstr(
				row.get("contribution") or row.get("what_doing") or ""
			).strip()
		if "area" in has:
			entry["area"] = cstr(row.get("area") or data.get("area") or "").strip()
		if "address" in has:
			entry["address"] = cstr(row.get("address") or "").strip()
		if "school" in has and school:
			entry["school"] = school
		doc.append("ambassador_enrolments", entry)
	if not cstr(doc.school_name or "").strip():
		parent_school = cstr(data.get("school_name") or "").strip()
		if not parent_school:
			for row in rows:
				if isinstance(row, dict):
					parent_school = cstr(row.get("school") or row.get("school_name") or "").strip()
					if parent_school:
						break
		if parent_school:
			doc.school_name = _resolve_customer_link(parent_school) or parent_school


def _append_workshop_rows(doc, data):
	rows = data.get("workshop_attendees") or []
	if isinstance(rows, str):
		try:
			rows = frappe.parse_json(rows) or []
		except Exception:
			rows = []
	for row in rows:
		if not isinstance(row, dict):
			continue
		name = cstr(row.get("attendee_name") or row.get("name")).strip()
		if not name:
			continue
		doc.append(
			"workshop_attendees",
			{
				"attendee_name": name,
				"contact_number": cstr(row.get("contact_number") or "").strip(),
				"email": cstr(row.get("email") or "").strip(),
				"school_organization": cstr(row.get("school_organization") or "").strip(),
				"training_venue": cstr(row.get("training_venue") or "").strip(),
				"training_date": row.get("training_date") or data.get("visit_date"),
			},
		)
