# Copyright (c) 2026, The ILM Foundation and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import get_fullname, getdate, today


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
}


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
	staff_name = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "employee_name")
	if not staff_name:
		staff_name = frappe.db.get_value("User", frappe.session.user, "full_name") or frappe.session.user

	return {
		"staff_name": staff_name,
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
		"provinces": list(PROVINCE_MAP.keys()),
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
		"school_types": ["Public", "Private", "Semi Government", "Madrasa", "Other"],
		"model_school_options": [
			"Yes - Model School A: (Affiliated atleast 1 Program of all 3 Department of TIF)",
			"Yes - Model School B: (Affiliated atleast 1 Program of all 2 Department of TIF)",
			"No - This is not a Model School",
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
	}


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
	elif doc_type == "Meeting":
		doc.mt_visit_by = doc.visit_by
		doc.mt_month = doc.month
		doc.mt_meeting_date = doc.visit_date
		doc.mt_meeting_starting_time = doc.visiting_starting_time
		doc.mt_meeting_ending_time = doc.visit_ending_time
		doc.mt_city = doc.city
		doc.mt_area = doc.area
		doc.mt_meeting_with_person_name = doc.meeting_with
		doc.mt_designation = doc.designation
		doc.mt_contact_no = doc.contact_number
		doc.mt_institute_or_organization_name = doc.school_name
		doc.mt_reference = doc.reference
	elif doc_type in ("Academic / Other Official Tasks", "Co-curricular Activity", "Other"):
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
		doc.training_venue_name = doc.school_name

	doc.insert(ignore_permissions=False)
	frappe.db.commit()

	return {
		"name": doc.name,
		"url": get_url(f"/app/field-visit/{doc.name}"),
		"message": _("Activity saved as {0}").format(doc.name),
	}
