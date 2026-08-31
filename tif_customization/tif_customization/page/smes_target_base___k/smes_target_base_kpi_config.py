"""KPI target base aligned with SMEs Target Base spreadsheet."""

WORKING_DAYS_DEFAULT = 21

REGION_KEYS = ("karachi", "punjab", "urban", "rural")

REGION_LABELS = {
	"karachi": "Karachi",
	"punjab": "Punjab",
	"urban": "Other Province Urban Areas",
	"rural": "Other Province Rural Areas",
}

REGION_SUMMARY = {
	"karachi": {"per_day_target_points": 6, "working_days": WORKING_DAYS_DEFAULT},
	"punjab": {"per_day_target_points": 5, "working_days": WORKING_DAYS_DEFAULT},
	"urban": {"per_day_target_points": 5, "working_days": WORKING_DAYS_DEFAULT},
	"rural": {"per_day_target_points": 4, "working_days": WORKING_DAYS_DEFAULT},
}

INCREMENT_SCALE = [
	{"label": "Below 60%", "max_percent": 60, "increment": "0%"},
	{"label": "Below 70%", "max_percent": 70, "increment": "4%"},
	{"label": "Below 80%", "max_percent": 80, "increment": "6%"},
	{"label": "Below 90%", "max_percent": 90, "increment": "8%"},
	{"label": "Below 100%", "max_percent": 100, "increment": "10%"},
	{"label": "Above 100%", "max_percent": None, "increment": "15% - 25%"},
]

FISCAL_MONTHS = [
	(7, "Jul"), (8, "Aug"), (9, "Sep"), (10, "Oct"), (11, "Nov"), (12, "Dec"),
	(1, "Jan"), (2, "Feb"), (3, "Mar"), (4, "Apr"), (5, "May"), (6, "Jun"),
]


def _t(per_day_target=0, points=0, yearly=None, calc_points=None):
	return {
		"per_day_target": per_day_target,
		"points": points,
		"yearly": yearly,
		"calc_points": calc_points,
	}


def _targets(karachi, punjab, urban, rural):
	return {"karachi": karachi, "punjab": punjab, "urban": urban, "rural": rural}


KPI_ACTIVITIES = [
	{
		"key": "visits",
		"label": "Visits (all Field Visits: Marketing, M&E, Meetings, Academic, etc.)",
		"category": "Core Responsibility",
		"metric": "visits",
		"targets": _targets(_t(3, 2), _t("2-3", 2), _t("2-3", 2), _t(2, 2)),
	},
	{
		"key": "half_day_workshop",
		"label": "Half Day Workshop",
		"category": "Core Responsibility",
		"metric": "half_day_workshop",
		"targets": _targets(_t(1, 6, 6), _t(1, 5, 5), _t(1, 5, 5), _t(1, 4, 4)),
	},
	{
		"key": "full_day_session",
		"label": "Full Day Session",
		"category": "Core Responsibility",
		"metric": "full_day_session",
		"targets": _targets(_t(1, 6, 2), _t(1, 5, 2), _t(1, 5, 2), _t(1, 4, 1)),
	},
	{
		"key": "meeting_ulama",
		"label": "Meeting with Ulama and Educationist",
		"category": "Core Responsibility",
		"metric": "meeting_ulama",
		"targets": _targets(_t(2, 3), _t("1-2", 3), _t("1-2", 3), _t("1-2", 3)),
	},
	{
		"key": "teachers_training_meeting",
		"label": "Teachers Training Meeting",
		"category": "Core Responsibility",
		"metric": "teachers_training_meeting",
		"targets": _targets(_t(2, 3, 12), _t("1-2", 3, 10), _t("1-2", 3, 10), _t("1-2", 3, 8)),
	},
	{
		"key": "headoffice_visit",
		"label": "Headoffice / Regional Office / Out of Station Visit",
		"category": "Core Responsibility",
		"metric": "headoffice_visit",
		"targets": _targets(_t(0, "2-6", 1, 6), _t(0, "2-5", 1, 5), _t(0, "2-5", 1, 5), _t(0, "2-4", 1, 4)),
	},
	{
		"key": "academic_task",
		"label": "Academic Task",
		"category": "Secondary Responsibility",
		"metric": "academic_task",
		"targets": _targets(_t(1, 6), _t(0, 5), _t(1, 5), _t(1, 4)),
	},
	{
		"key": "other_official",
		"label": "Other Official Tasks",
		"category": "Secondary Responsibility",
		"metric": "other_official",
		"targets": _targets(_t(0, "2-6", None, 6), _t(0, "2-5", None, 5), _t(0, "2-5", None, 5), _t(0, "2-4", None, 4)),
	},
	{
		"key": "enrolment",
		"label": "Enrolment of Participant in ELP/ TECC/ 90 Days TTC/ Online Tajweed Customize Course 30/60/90 (Nazra Teachers)",
		"category": "Core Responsibility",
		"metric": "enrolment",
		"targets": _targets(_t(0, 5, 50), _t(0, 0, None), _t(0, 5, 30), _t(0, 5, 10)),
	},
	{
		"key": "co_curricular",
		"label": "Co-curricular Activities (Quiz, Demo Class, Intro in School Functions/ Exhibitions, etc.)",
		"category": "Core Responsibility",
		"metric": "co_curricular",
		"targets": _targets(_t(0, 5, 1), _t(0, 0, 2), _t(0, 10, 2), _t(0, 10, 2)),
	},
	{
		"key": "new_school_registration",
		"label": "Registration of New Schools (Mutalae Quran / Noorani Qaida)",
		"category": "Core Responsibility",
		"metric": "new_school_registration",
		"targets": _targets(_t(0, 5, 24), _t(0, 0, None), _t(0, 0, None), _t(0, 0, None)),
	},
	{
		"key": "workshop_registration",
		"label": "Registration of Participant in One Day / Full Day Workshop",
		"category": "Core Responsibility",
		"metric": "workshop_registration",
		"targets": _targets(_t(0, 5, 148), _t(0, 0, 105), _t(0, 5, 105), _t(0, 5, 65)),
	},
	{
		"key": "model_school_a",
		"label": "Model School A *",
		"category": "Core Responsibility",
		"metric": "model_school_a",
		"targets": _targets(_t(0, 0, 6), _t(0, 0, 4), _t(0, 0, 4), _t(0, 0, 3)),
	},
	{
		"key": "model_school_b",
		"label": "Model School B **",
		"category": "Core Responsibility",
		"metric": "model_school_b",
		"targets": _targets(_t(0, 0, 12), _t(0, 0, 8), _t(0, 0, 8), _t(0, 0, 6)),
	},
]
