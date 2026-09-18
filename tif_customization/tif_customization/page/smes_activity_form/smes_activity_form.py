# Copyright (c) 2026, The ILM Foundation and contributors
# For license information, please see license.txt

import os

import frappe
from frappe import _
from frappe.utils import cint, get_url, getdate, today

from tif_customization.tif_customization.field_visit_enrolment_access import (
	FARHAN_ONLY_FIELD_VISIT_TYPES,
	can_manage_farhan_only_field_visit,
)
from tif_customization.tif_customization.field_visit_supervisor_only import (
	FIELD_OFFICER_ALLOWED_OT_TASKS,
	SUPERVISOR_ONLY_ACTIVITY_TYPES,
	can_manage_supervisor_only_field_visits,
)
from tif_customization.tif_customization.field_visit_travel_cost import sync_travel_cost

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
	if can_manage_supervisor_only_field_visits():
		return list(_ALL_ACADEMIC_TASK_TYPES)
	return sorted(FIELD_OFFICER_ALLOWED_OT_TASKS)


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
	"Workshop",
	"Meeting with Ulama and Educationist",
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
	"Workshop Arranged",
	"Books Demand (Quantity)",
	"Enrolment of Volunteers",
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


def _activity_type_labels_for_user():
	can_farhan = can_manage_farhan_only_field_visit()
	can_supervisor = can_manage_supervisor_only_field_visits()
	labels = []
	for label in SHEET_ACTIVITY_TYPES:
		mapped = ACTIVITY_TYPE_MAP.get(label, label)
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

ACTIVITY_TYPE_MAP = {
	"Visits": "Visits",
	"Workshop": "Workshop",
	"Meeting with Ulama and Educationist": "Meeting with Ulama and Educationist",
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
	"Workshop Arranged": "Workshop Arranged",
	"Books Demand (Quantity)": "Books Demand (Quantity)",
	"Enrolment of Volunteers": "Enrolment of Volunteers",
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
		"customers": _customer_link_options(limit=5000),
		"staff_name": staff_name,
		"staff_employee": staff_employee,
		"staff_options": staff_list,
		"staff_names": staff_names,
		"can_manage_supervisor_only": can_manage_supervisor_only_field_visits(),
		"can_manage_enrolment_participants": can_manage_farhan_only_field_visit(),
		"can_manage_farhan_only": can_manage_farhan_only_field_visit(),
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
			"Followup & Other Visits",
			"TPS Visits",
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
			"Yes - Model School A: (Affiliated with programmes from 2 or more TIF departments)",
			"Yes - Model School B: (Affiliated with programmes from 1 TIF department)",
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
	}


def _customer_link_options(txt="", limit=4000):
	"""Customer rows for School Name (Field Visit Link → Customer)."""
	if not frappe.db.exists("DocType", "Customer"):
		return []
	txt = (txt or "").strip()
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
	if txt:
		where.append("(c.name LIKE %(txt)s OR c.customer_name LIKE %(txt)s)")
		params["txt"] = f"%{txt}%"
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



@frappe.whitelist()
def search_school_customers(txt=None, city=None, limit=50):
	"""Typeahead for School Name — Field Visit links this to Customer."""
	if frappe.session.user == "Guest":
		frappe.throw(_("Please log in"), frappe.AuthenticationError)
	return _customer_link_options(txt=txt, limit=max(1, min(cint(limit) or 50, 100)))

@frappe.whitelist()
def get_school_customer(name=None):
	"""Load Customer details to fill School Address / Type on the easy form."""
	if frappe.session.user == "Guest":
		frappe.throw(_("Please log in"), frappe.AuthenticationError)
	name = (name or "").strip()
	if not name or not frappe.db.exists("Customer", name):
		return {}
	cust_fields = ["name", "customer_name", "territory"]
	meta = frappe.get_meta("Customer")
	if meta.has_field("custom_category"):
		cust_fields.append("custom_category")
	if meta.has_field("customer_primary_address"):
		cust_fields.append("customer_primary_address")
	cust = frappe.db.get_value("Customer", name, cust_fields, as_dict=True) or {}
	address = _customer_address_text(name, cust.get("customer_primary_address"))
	return {
		"value": cust.get("name") or name,
		"label": (cust.get("customer_name") or name).strip(),
		"city": (cust.get("territory") or "").strip(),
		"school_type": _school_type_from_customer(cust.get("custom_category")),
		"address": address,
	}


def _school_type_from_customer(category):
	cat = (category or "").strip().lower()
	if cat in ("chain school", "chains of school", "chain of school"):
		return "Chains of School"
	if cat in ("individual school", "individual"):
		return "Individual School"
	return ""


def _customer_address_text(customer, primary_name=None):
	if primary_name and frappe.db.exists("Address", primary_name):
		addr = frappe.get_cached_value(
			"Address",
			primary_name,
			["address_line1", "address_line2", "city", "state", "pincode"],
			as_dict=True,
		)
		if addr:
			return ", ".join(
				[cstr(addr.get(k)).strip() for k in ("address_line1", "address_line2", "city", "state", "pincode") if cstr(addr.get(k)).strip()]
			)
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
	if not rows:
		return ""
	addr = rows[0]
	return ", ".join(
		[cstr(addr.get(k)).strip() for k in ("address_line1", "address_line2", "city", "state", "pincode") if cstr(addr.get(k)).strip()]
	)


def _resolve_customer_link(value):
	"""Accept Customer name or customer_name and return the Customer ID."""
	val = cstr(value).strip()
	if not val:
		return ""
	if frappe.db.exists("Customer", val):
		return val
	found = frappe.db.get_value("Customer", {"customer_name": val}, "name")
	return found or val


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


def _apply_official_task_fields(doc, data):
	doc.ot_date = doc.visit_date
	doc.ot_start_time = doc.visiting_starting_time
	doc.ot_end_time = doc.visit_ending_time
	task = (data.get("ot_type_of_task") or "").strip()
	if doc.type == "Academic Task":
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
	doc.ot_no_of_calls = data.get("ot_no_of_calls")
	doc.ot_purpose_of_call = data.get("ot_purpose_of_call")
	doc.ot_follow_up_calls_attach = data.get("ot_follow_up_calls_attach")
	doc.ot_other_official_task_detail = data.get("ot_other_official_task_detail")
	doc.ot_visit_meeting_detail = data.get("ot_visit_meeting_detail")
	doc.ot_hours_spent = data.get("ot_hours_spent")
	doc.ot_remarks = data.get("ot_visit_meeting_detail") or data.get("ot_other_official_task_detail")


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
	doc.quarter = data.get("quarter")
	doc.marketing_visit_category = data.get("marketing_visit_category")
	doc.visit_date = getdate(data.get("visit_date"))
	doc.visiting_starting_time = data.get("starting_time")
	doc.visit_ending_time = data.get("ending_time")
	doc.city = data.get("city")
	doc.area = data.get("area")
	doc.province = province
	doc.frequency_of_visits = data.get("frequency_of_visits")
	material = data.get("marketing_material_provided")
	if isinstance(material, str):
		material = material.strip().lower()
	doc.marketing_material_provided = 1 if material in (True, 1, "1", "true", "yes") else 0
	doc.status = data.get("status")
	doc.reason_not_agreed = data.get("reasons_if_not_agreed")
	doc.reasons_if_not_agreed_other = data.get("reasons_if_not_agreed_other")
	# Keep free-text details column for notes / "Other"
	detail_reason = data.get("reasons_if_not_agreed_other") or data.get("reasons_if_not_agreed")
	doc.reasons_if_not_agreed = detail_reason
	doc.school_remarks_follow_up = data.get("school_remarks_follow_up")

	doc.school_name = _resolve_customer_link(data.get("school_name"))
	_apply_school_contacts(doc, data)
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
		doc.me_designation_meeting_with = (
			doc.designation_other if doc.designation == "Other" else doc.designation
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
		doc.mt_venue = data.get("mt_venue")
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
	elif doc_type in ("Training", "Workshop", "Teachers Training Meeting", "Workshop Arranged"):
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
		if not doc.training_session_category and doc_type == "Workshop Arranged":
			doc.training_session_category = "Half Day Workshop"
		doc.training_workshop_topic = data.get("training_workshop_topic")
		doc.training_mode = data.get("training_mode")
		doc.training_venue_name = data.get("training_venue_name") or doc.school_name
		doc.training_no_of_participants = data.get("training_no_of_participants")
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
	submitted = False
	if data.get("submit_doc") in (True, 1, "1", "true", "True"):
		doc.submit()
		submitted = True
	frappe.db.commit()

	return {
		"name": doc.name,
		"submitted": submitted,
		"url": get_url(f"/app/field-visit/{doc.name}"),
		"message": _("Activity saved as {0}").format(doc.name),
	}


@frappe.whitelist()
def submit_field_visit_doc(name):
	"""Submit a Field Visit created from the easy portal after attachments are uploaded."""
	if not name:
		frappe.throw(_("Field Visit name is required."))
	doc = frappe.get_doc("Field Visit", name)
	if doc.docstatus == 0:
		doc.submit()
		frappe.db.commit()
	return {
		"name": doc.name,
		"submitted": True,
		"url": get_url(f"/app/field-visit/{doc.name}"),
		"message": _("Visit submitted as {0}").format(doc.name),
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
	rows = _parse_rows(data.get("school_contacts"))
	if not rows:
		rows = [
			{
				"person_name": data.get("contact_person_name"),
				"contact_number": data.get("contact_number"),
				"designation": data.get("designation"),
				"designation_other": data.get("designation_other"),
			}
		]

	first = None
	for row in rows:
		if not isinstance(row, dict):
			continue
		name = cstr(row.get("person_name") or row.get("contact_person_name") or "").strip()
		contact = cstr(row.get("contact_number") or "").strip()
		designation = cstr(row.get("designation") or "").strip()
		other = cstr(row.get("designation_other") or "").strip()
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
		doc.meeting_with = data.get("contact_person_name")
		doc.contact_number = data.get("contact_number")
		doc.designation = data.get("designation")
		doc.designation_other = data.get("designation_other")


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
		doc.school_name = first_school


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
