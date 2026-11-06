# Copyright (c) 2026, TIF Customization and contributors
# License: MIT
"""School Opening Need Analysis Form (SC-1.2) — V2 options (Updated 14-OCT-2026)."""

CONTACT_ROLES = [
	"Director",
	"Administrator",
	"Principal",
	"Vice Principal",
	"Academic Manager",
	"Academic Coordinator",
	"Coordinator",
	"Receptionist",
	"Ambassador",
]

VISIT_TYPES = [
	"Visit without enrollment",
	"Visit with enrollment",
]

INSTITUTION_TYPES = [
	"School",
	"College",
	"University",
	"Madrasa",
	"Fahm-Ul-Quran Group",
	"Special School",
]

CATEGORIES = [
	"Provincial Govt.",
	"Private",
]

EDUCATIONAL_SYSTEM = [
	"Pre-Primary",
	"Primary",
	"Secondary",
	"Matric",
	"Intermediate",
	"Hifz-o-Nazra",
	"Cambridge",
	"O / A Levels",
]

# V2 labels this as Type of School (Single Campus / Chain)
STRUCTURE = [
	"Single Campus",
	"Chain",
]

SHIFTS = [
	"Morning",
	"Evening",
	"Both",
]

# Section 2 — Courses & Workshops (stored in teacher_training_services)
COURSES_WORKSHOPS = [
	"ELP",
	"Workshop",
	"TECC Professional",
	"PEF Pakistan Workshop",
	"TECC Foundation",
	"Workshop Value Driven Teaching",
	"Customize Tajweed online Course",
	"Intro to Tajweed",
	"Tajweed Training Course (TTC)",
	"Kids Workshop",
	"Workshop Art of Storytelling",
]

# Section 2 — Services Onboard (stored in quran_program_services)
SERVICES_ONBOARD = [
	"MQH Green Version Part-1 to 7",
	"Noorani Qaida",
	"MQH Green Version Teacher Guide 1 to 5",
	"Noorani Qaida — NQ Workbook",
	"MQH English Version Part-1 – 2",
	"MQH Sindhi Version Part-1 – 3",
	"Noorani Qaida — NQ Teachers Guide",
	"MQH KP Edition Part-1 to 7",
]

RUNNING_TIF = [
	"Quran Program for Student",
	"Tilawat Program for School",
	"Teacher Training",
]

CURRICULUM = [
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
]

FEE_STRUCTURE = [
	"Above 15K",
	"Between 5K – 15K",
	"Below 5K",
]

PROVINCES = [
	"Sindh",
	"Punjab",
	"KPK",
	"Balochistan",
	"Gilgit-Baltistan",
	"Azad Jammu & Kashmir",
]

STUDENT_COUNT_RANGES = [
	"1-10",
	"11-50",
	"51-200",
	"201-500",
	"501-1000",
	"1000+",
]


def school_opening_form_options():
	"""Dict consumed by guest form context, SME activity, and field-visit portal."""
	return {
		"contact_roles": CONTACT_ROLES,
		"school_opening_contact_roles": CONTACT_ROLES,
		"school_opening_visit_types": VISIT_TYPES,
		"school_opening_institution_types": INSTITUTION_TYPES,
		"school_opening_categories": CATEGORIES,
		"school_opening_educational_system": EDUCATIONAL_SYSTEM,
		"school_opening_structure": STRUCTURE,
		"school_opening_shifts": SHIFTS,
		"school_opening_courses_workshops": COURSES_WORKSHOPS,
		"school_opening_teacher_training": COURSES_WORKSHOPS,  # legacy key
		"school_opening_services_onboard": SERVICES_ONBOARD,
		"school_opening_quran": SERVICES_ONBOARD,  # legacy key → Services Onboard
		"school_opening_tilawat": [],  # removed in V2
		"school_opening_running_tif": RUNNING_TIF,
		"school_opening_curriculum": CURRICULUM,
		"school_opening_fee": FEE_STRUCTURE,
		"school_opening_provinces": PROVINCES,
		"school_opening_student_ranges": STUDENT_COUNT_RANGES,
		"form_no": "SC-1.2",
	}
