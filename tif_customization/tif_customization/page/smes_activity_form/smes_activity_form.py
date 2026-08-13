# Copyright (c) 2026, The ILM Foundation and contributors
# For license information, please see license.txt

import os

import frappe
from frappe import _
from frappe.utils import get_url, getdate, today

BULK_IMPORT_TEMPLATE = "Field_Visit_Bulk_Import_Template.xlsx"


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

ACTIVITY_TYPE_MAP = {
	"Marketing Visit": "Marketing",
	"M&E Visit": "M&E",
	"Joint Visit with SME (Only for Supervisor)": "Joint Visit with SME",
	"Trainings & Workshops / Teachers Training Meeting": "Training",
	"Meetings": "Meeting",
	"Academic / Other Official Tasks / Calls": "Academic / Other Official Tasks",
	"Co-curricular Activity": "Co-curricular Activity",
	"Enrolment of Participants": "Enrolment of Participants",
	"Enrolment of participants": "Enrolment of Participants",
	"Attendance / Registration in One Day / Half day Workshop": "Attendance / Registration in One Day / Half day Workshop",
}

ENROLMENT_COURSE_OPTIONS = [
	"TECC - Foundation",
	"TECC - Professional",
	"ELP - Education Leadership Program",
	"ETQ - Effective Teaching of the Holy Quran",
	"TTC - 90 Days Tajweed Training Course",
	"Online Tajweed Customized Course 30/60/90 Days",
	"Intro to Tajweed Workshop",
	"Tajweed for Kids Workshop",
	"V Campers - Story Telling Workshops",
	"Other Special Session Offered by TIF",
]

FIELD_OFFICER_ROLES = (
	"Field Staff",
	"Field Staff Manager",
	"Supervisor Field Staff",
)


def get_active_field_officer_staff():
	"""
	Active employees who are Field Officers:
	- Field Officer DocType (status Active) + Employee Active + User enabled
	- OR user has Field Staff / Field Staff Manager / Supervisor Field Staff role,
	  user enabled, and linked Employee is Active.
	"""
	by_employee = {}

	# 1) Explicit Field Officer records
	if frappe.db.exists("DocType", "Field Officer"):
		officers = frappe.get_all(
			"Field Officer",
			filters={"status": "Active"},
			fields=["name", "name1", "employee", "user", "division"],
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
			continue
		by_employee[emp_row.name] = {
			"employee": emp_row.name,
			"employee_name": emp_row.employee_name or emp_row.name,
			"user": user,
		}

	staff = sorted(by_employee.values(), key=lambda r: (r["employee_name"] or "").lower())
	return staff


@frappe.whitelist()
def get_form_meta():
	"""Lookups for the easy SMEs Activity Form portal."""
	cities = frappe.get_all("City", fields=["name"], order_by="name", limit_page_length=500)
	area_fields = ["name"]
	if frappe.db.has_column("Area", "city"):
		area_fields.append("city")
	if frappe.db.has_column("Area", "area"):
		area_fields.append("area")
	areas = frappe.get_all("Area", fields=area_fields, order_by="name", limit_page_length=2000)
	areas = [
		{
			"name": a.name,
			"city": a.get("city") if isinstance(a, dict) else getattr(a, "city", None),
			"label": (a.get("area") if isinstance(a, dict) else getattr(a, "area", None)) or a.name,
		}
		for a in areas
	]
	staff_list = get_active_field_officer_staff()
	staff_names = [s["employee_name"] for s in staff_list]

	current_emp = frappe.db.get_value(
		"Employee",
		{"user_id": frappe.session.user, "status": "Active"},
		["name", "employee_name"],
		as_dict=True,
	)
	staff_name = ""
	staff_employee = ""
	if current_emp and current_emp.employee_name in staff_names:
		staff_name = current_emp.employee_name
		staff_employee = current_emp.name
	elif current_emp:
		# Logged-in employee not in FO list — still prefer name if matches list later
		staff_name = current_emp.employee_name if current_emp.employee_name in staff_names else ""
		staff_employee = current_emp.name if staff_name else ""

	return {
		"staff_name": staff_name,
		"staff_employee": staff_employee,
		"staff_options": staff_list,
		"staff_names": staff_names,
		"bulk_import_template_url": get_bulk_import_template_url(),
		"today": today(),
		"cities": [c.name for c in cities],
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
		"activity_types": list(ACTIVITY_TYPE_MAP.keys()),
		"enrolment_courses": ENROLMENT_COURSE_OPTIONS,
		"travel_modes": [
			"Public Transport",
			"Own Vehicle / Bike",
			"Company Vehicle",
			"Ride Hailing",
			"Walking",
			"Other",
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
			"Admin",
			"Coordinator",
			"Teacher",
			"Receptionist",
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
			"Teachers Training",
		],
		"academic_task_types": [
			"Academic Tasks",
			"Head Office Visit",
			"Regional Office Visit",
			"Out of Station Visit",
			"Meeting of Regional Staff (Supervisors) and SMEs",
			"Follow up Calls / Calls to Schools",
			"Other Official Tasks",
		],
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
			{
				"field": "qps_meeting_educationalist",
				"label": "Meeting with Educationalist, Ulama-e-Kiram and Known Personalities",
			},
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
			"Awareness Session",
		],
		"sme_name_options": _sme_display_names(staff_list),
		"training_conducted_by_options": _training_conducted_by_options(staff_list),
	}


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
	]
	smes = _sme_display_names(staff_list)
	seen = set()
	out = []
	for n in fixed + smes:
		if n and n not in seen:
			seen.add(n)
			out.append(n)
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


@frappe.whitelist()
def submit_smes_activity(data):
	"""Create a Field Visit from the easy SMEs Activity portal."""
	if isinstance(data, str):
		data = frappe.parse_json(data)

	if not data.get("activity_type"):
		frappe.throw(_("Type of Activity is required."))
	if not data.get("visit_by"):
		frappe.throw(_("Name of Staff is required."))
	if not data.get("visit_date"):
		frappe.throw(_("Date is required."))

	allowed_staff = {s["employee_name"]: s for s in get_active_field_officer_staff()}
	if data.get("visit_by") not in allowed_staff:
		frappe.throw(
			_("Name of Staff must be an Active employee with Field Officer / Field Staff rights.")
		)
	staff_meta = allowed_staff[data.get("visit_by")]
	data["staff_employee"] = data.get("staff_employee") or staff_meta.get("employee")

	activity_label = data.get("activity_type")
	doc_type = ACTIVITY_TYPE_MAP.get(activity_label, activity_label)
	province = PROVINCE_MAP.get(data.get("province") or "", data.get("province"))

	doc = frappe.new_doc("Field Visit")
	doc.type = doc_type

	# Shared / marketing-style fields
	doc.visit_by = data.get("visit_by")
	doc.month = data.get("month")
	doc.visit_date = getdate(data.get("visit_date"))
	doc.visiting_starting_time = data.get("starting_time")
	doc.visit_ending_time = data.get("ending_time")
	doc.city = data.get("city")
	doc.area = data.get("area")
	doc.province = province
	doc.frequency_of_visits = data.get("frequency_of_visits")
	material = (data.get("marketing_material_provided") or "").strip().lower()
	doc.marketing_material_provided = 1 if material in ("yes", "1") else 0
	doc.status = data.get("status")
	doc.reason_not_agreed = data.get("reasons_if_not_agreed")
	doc.reasons_if_not_agreed_other = data.get("reasons_if_not_agreed_other")
	# Keep free-text details column for notes / "Other"
	detail_reason = data.get("reasons_if_not_agreed_other") or data.get("reasons_if_not_agreed")
	doc.reasons_if_not_agreed = detail_reason
	doc.school_remarks_follow_up = data.get("school_remarks_follow_up")

	doc.school_name = data.get("school_name")
	doc.meeting_with = data.get("contact_person_name")
	doc.contact_number = data.get("contact_number")
	doc.designation = data.get("designation")
	doc.school_address = data.get("school_address")
	doc.school_type = data.get("school_type")
	doc.reference = data.get("reference")
	doc.school_additional_remarks = data.get("school_additional_remarks")

	doc.qps_affiliated = data.get("qps_affiliated")
	doc.tps_affiliated = data.get("tps_affiliated")
	doc.cee_affiliated = data.get("cee_affiliated")

	for key in (
		"qps_mqh_books",
		"qps_mqh_teachers_guides",
		"qps_meeting_educationalist",
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
		"cee_elp",
		"cee_tecc_foundation",
		"cee_tecc_professional",
		"cee_one_day_workshop",
	):
		if data.get(key):
			doc.set(key, data.get(key))

	doc.participant_names_enrolled = data.get("participant_names_enrolled")
	doc.participant_contact_numbers = data.get("participant_contact_numbers")
	doc.model_school = data.get("model_school")
	doc.registered_volunteer = data.get("registered_volunteer")

	doc.meeting_picture = data.get("meeting_picture")
	doc.school_picture = data.get("school_picture")
	doc.visiting_card_attach = data.get("visiting_card_attach")
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
		doc.me_meeting_with_person_name = doc.meeting_with
		doc.me_designation_meeting_with = doc.designation
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
		doc.me_mqh_book_part = data.get("me_mqh_book_part")
		doc.me_classes_per_week = data.get("me_classes_per_week")
		doc.me_class_duration = data.get("me_class_duration")
		doc.me_took_assessment = data.get("me_took_assessment")
		doc.me_student_behavior_changes = data.get("me_student_behavior_changes")
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
	elif doc_type == "Meeting":
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
		doc.mt_meeting_with_person_name = data.get("mt_person_name") or doc.meeting_with
		doc.mt_contact_no = data.get("mt_contact_number") or doc.contact_number
		doc.mt_venue = data.get("mt_venue")
		doc.mt_remarks = data.get("mt_meeting_detail")
		doc.mt_reference = doc.reference
		doc.mt_visiting_card = data.get("visiting_card_attach")
		doc.mt_meeting_picture = data.get("meeting_picture")
	elif doc_type == "Academic / Other Official Tasks":
		doc.ot_date = doc.visit_date
		doc.ot_start_time = doc.visiting_starting_time
		doc.ot_end_time = doc.visit_ending_time
		doc.ot_type_of_task = data.get("ot_type_of_task")
		academic_types = _as_list(data.get("ot_academic_task_types"))
		doc.ot_academic_task_types = "\n".join(academic_types)
		doc.ot_academic_task_other = data.get("ot_academic_task_other")
		doc.ot_no_of_pages = data.get("ot_no_of_pages")
		doc.ot_no_of_calls = data.get("ot_no_of_calls")
		doc.ot_purpose_of_call = data.get("ot_purpose_of_call")
		doc.ot_follow_up_calls_attach = data.get("ot_follow_up_calls_attach")
		doc.ot_other_official_task_detail = data.get("ot_other_official_task_detail")
		doc.ot_visit_meeting_detail = data.get("ot_visit_meeting_detail")
		doc.ot_hours_spent = data.get("ot_hours_spent")
		doc.ot_remarks = data.get("ot_visit_meeting_detail") or data.get("ot_other_official_task_detail")
	elif doc_type == "Co-curricular Activity":
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
	elif doc_type == "Training":
		doc.training_month = doc.month
		doc.training_date = doc.visit_date
		doc.training_trainer_name = doc.visit_by
		doc.training_entry_filled_by = doc.visit_by
		doc.training_city = doc.city
		doc.training_province = doc.province
		doc.training_session_category = data.get("training_session_category")
		doc.training_venue_name = data.get("training_venue_name") or doc.school_name
		doc.training_no_of_participants = data.get("training_no_of_participants")
		doc.training_no_of_schools_attended = data.get("training_no_of_schools_attended")
		arrange = _as_list(data.get("training_arrange_by"))
		doc.training_arrange_by = "\n".join(arrange)
		doc.training_conducted_by = data.get("training_conducted_by")
	elif doc_type == "Enrolment of Participants":
		_append_enrolment_rows(doc, data)
		_apply_travel_fields(doc, data)
	elif doc_type == "Attendance / Registration in One Day / Half day Workshop":
		_append_workshop_rows(doc, data)
		_apply_travel_fields(doc, data)

	doc.insert(ignore_permissions=False)
	frappe.db.commit()

	return {
		"name": doc.name,
		"url": get_url(f"/app/field-visit/{doc.name}"),
		"message": _("Activity saved as {0}").format(doc.name),
	}


def _apply_travel_fields(doc, data):
	doc.travel_mode = data.get("travel_mode")
	doc.travel_from = data.get("travel_from")
	doc.travel_to = data.get("travel_to")
	doc.travel_distance_km = data.get("travel_distance_km")
	doc.travel_cost = data.get("travel_cost")
	doc.travel_remarks = data.get("travel_remarks")


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
				or province,
				"enroll_in_course": cstr(row.get("enroll_in_course") or "").strip(),
				"date_of_enrolment": row.get("date_of_enrolment") or data.get("visit_date"),
				"other_special_session_name": cstr(row.get("other_special_session_name") or "").strip(),
			},
		)


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
