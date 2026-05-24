"""Fixed section roster for ILM Foundation salary register (order + employee placement)."""

import re

# Display order — section headers appear even when empty (header_only=True)
SECTION_DEFINITIONS = [
	{"label": "C-Levels - Full Time & Contract", "header_only": False},
	{"label": "Heads and Senior Staff", "header_only": False},
	{"label": "Quran Program for Students - Full Time & Part Time", "header_only": False},
	{"label": "Teacher Training  -  Part Time", "header_only": False},
	{"label": "Tilawat Prgoram for Schools - Full Time & Part Time", "header_only": False},
	{"label": "HR & Admin - Full Time & Part Time", "header_only": False},
	{"label": "Marketing - Full Time", "header_only": False},
	{
		"label": "Special Childern Education Center - Mehmoodabad - Full Time & Part Time",
		"header_only": False,
	},
	{
		"label": "Information Technology - Full Time,  Part Time & Contract Fix Salary",
		"header_only": False,
	},
	{"label": "Accounts and Finance - Full Time & Contract Fix Salary", "header_only": False},
	{"label": "Parttime Permenant/Probation Staff", "header_only": True},
	{"label": "QPS Field Staff ( Part Time)", "header_only": False},
	{"label": "Project Base - QPS - Contract ( As Per Need)", "header_only": False},
	{"label": "Contract Staff ( TIF )", "header_only": False},
	{
		"label": "Master Trainer, Teacher Trainers & Storyteller (CEE) Contract per session (As per Need)",
		"header_only": True,
	},
	{
		"label": "Teachers, Trainers, Supporting Staff & Examiner TPS - Contract ( As per Need)",
		"header_only": False,
	},
	{"label": "Other Staff (Not in roster)", "header_only": False},
]

SECTION_ORDER = [s["label"] for s in SECTION_DEFINITIONS]
HEADER_ONLY_SECTIONS = {s["label"] for s in SECTION_DEFINITIONS if s.get("header_only")}

# employee_id -> sort index within section (built from ordered lists below)
_ROSTER_BY_SECTION = [
	(
		"C-Levels - Full Time & Contract",
		[
			"HR-EMP-00075",  # Shujauddin Shaikh
			"HR-EMP-00058",  # Shahid Khan
			"HR-EMP-00005",  # Muhammad Irfan
		],
	),
	(
		"Heads and Senior Staff",
		[
			"HR-EMP-00006",  # Hafiz Shahnawaz Awan
			"HR-EMP-00053",  # Fozia Fayyaz
		],
	),
	(
		"Quran Program for Students - Full Time & Part Time",
		[
			"HR-EMP-00007",  # Syed Wajahat Ali
			"HR-EMP-00018",  # Ahmed Ali
			"HR-EMP-00023",  # Muhammad Muzammil
			"HR-EMP-00154",  # Taj Munir
			"HR-EMP-00164",  # Muhammad Hasnain Osawala
			"HR-EMP-00011",  # Muhammad Adil
			"HR-EMP-00024",  # M. Sohail Ather
			"HR-EMP-00028",  # Rahmanuddin
			"HR-EMP-00230",  # Nadeemullah
			"HR-EMP-00165",  # Ahmed Hussain
			"HR-EMP-00275",  # Azmat Ullah
			"HR-EMP-00037",  # M. Jalaluddin
			"HR-EMP-00032",  # Muhammad Asad
		],
	),
	(
		"Teacher Training  -  Part Time",
		[
			"HR-EMP-00041",  # Tayyiba Zahid
			"HR-EMP-00043",  # Rukhsana Saeedi
			"HR-EMP-00202",  # Faiza Salam
		],
	),
	(
		"Tilawat Prgoram for Schools - Full Time & Part Time",
		[
			"HR-EMP-00054",  # Tabassum Shaukat Ali
			"HR-EMP-00074",  # Tuba M. Waheed
			"HR-EMP-00056",  # Hammad Saleem
			"HR-EMP-00240",  # Sumaiya Mufeed
			"HR-EMP-00302",  # Tabassum Baig
			"HR-EMP-00296",  # Jawaria Saeed
		],
	),
	(
		"HR & Admin - Full Time & Part Time",
		[
			"HR-EMP-00068",  # Anas Khan
			"HR-EMP-00065",  # Mairaj Habibullah
			"HR-EMP-00063",  # Rizwan
			"HR-EMP-00071",  # Arshad Ahmed
			"HR-EMP-00067",  # Muhammad Jamil
			"HR-EMP-00070",  # Syed Jamal Ahmed
			"HR-EMP-00073",  # Imran Ahmed
			"HR-EMP-00009",  # Muhammad Danish (Danish Awan)
			"HR-EMP-00020",  # M. Jawwad Akram
			"HR-EMP-00167",  # Hasan Ameer Uddin
			"HR-EMP-00193",  # Asif Akhtar
			"HR-EMP-00222",  # Mehar Ali
			"HR-EMP-00217",  # Sumaira Irfan
			"HR-EMP-00242",  # Muhammad Hamza Ahmed
			"HR-EMP-00312",  # Muhammad Asghar
			"HR-EMP-00047",  # Asma Anjum
		],
	),
	(
		"Marketing - Full Time",
		[
			"HR-EMP-00031",  # Muhammad Qasim
			"HR-EMP-00244",  # Habib ur Rehman
			"HR-EMP-00284",  # Syed Yahya Kamal
			"HR-EMP-00045",  # Anwar Khan Afridi
		],
	),
	(
		"Special Childern Education Center - Mehmoodabad - Full Time & Part Time",
		[
			"HR-EMP-00042",  # Samina Almas
			"HR-EMP-00044",  # Khadija tul Kubra
			"HR-EMP-00049",  # Fatima Sughra
			"HR-EMP-00050",  # Salma Aslam
			"HR-EMP-00052",  # Samina Yousuf
			"HR-EMP-00051",  # Nawab Gul
		],
	),
	(
		"Information Technology - Full Time,  Part Time & Contract Fix Salary",
		[
			"HR-EMP-00298",  # Muhammad Siddiq
			"HR-EMP-00254",  # Mohtashim Shoaib
			"HR-EMP-00297",  # Syed Farhan Hussain Shah
		],
	),
	(
		"Accounts and Finance - Full Time & Contract Fix Salary",
		[
			"HR-EMP-00066",  # Muhammad Raza
			"HR-EMP-00194",  # Yasir Yaseen
			"HR-EMP-00152",  # Muhammad Daniyal
		],
	),
	(
		"QPS Field Staff ( Part Time)",
		[
			"HR-EMP-00010",  # Azeem Baig
			"HR-EMP-00013",  # Muhammad Zahid
			"HR-EMP-00016",  # Sahibzada Usama bin Jalil
			"HR-EMP-00022",  # Muhammad Ajmal
			"HR-EMP-00025",  # Abdul Raheem
			"HR-EMP-00026",  # Naeem Saeed
			"HR-EMP-00033",  # Abdul Kabeer
			"HR-EMP-00014",  # Sajid Hussain
			"HR-EMP-00036",  # M. Adnan Munir
			"HR-EMP-00039",  # Muhammad Zubair
			"HR-EMP-00162",  # Fida Hussain
			"HR-EMP-00159",  # Muhammad Waqas Khan
			"HR-EMP-00160",  # Mansoor Ahmad Awan
			"HR-EMP-00188",  # Shafiq ur Rehman
			"HR-EMP-00187",  # Sami Ullah
			"HR-EMP-00255",  # Nazim Uddin
			"HR-EMP-00286",  # Shams ur Rehman
		],
	),
	(
		"Project Base - QPS - Contract ( As Per Need)",
		[
			"HR-EMP-00012",  # S. Rahman Haider
			"HR-EMP-00034",  # Syed Faisal Rehan
			"HR-EMP-00038",  # Hafiz Arsalan Sohail
			"HR-EMP-00315",  # Muhammad Ishaq
		],
	),
	(
		"Contract Staff ( TIF )",
		[
			"HR-EMP-00216",  # Areeba Imran
			"HR-EMP-00181",  # Misbah Mansoor
		],
	),
	(
		"Teachers, Trainers, Supporting Staff & Examiner TPS - Contract ( As per Need)",
		[
			"HR-EMP-00182",  # Sheema M Attaullah
			"HR-EMP-00127",  # Sadia Muhammad Bilal
			"HR-EMP-00129",  # Rabia Bibi Muhammad Younis
			"HR-EMP-00142",  # Bisma Shahnawaz
			"HR-EMP-00143",  # Saba Kaleem Uddin
			"HR-EMP-00138",  # Asia Meer Samad
			"HR-EMP-00126",  # Naureen Ismail
			"HR-EMP-00271",  # Safia Raheel
			"HR-EMP-00268",  # Ishrat Akram
			"HR-EMP-00140",  # Kosar M Amir
			"HR-EMP-00171",  # Shakila Anwar saeed
			"HR-EMP-00175",  # Shahida Azeem
			"HR-EMP-00232",  # Asiya Asad
			"HR-EMP-00145",  # Muhammad Aziz Yaqoob Khan
		],
	),
]

EMPLOYEE_SECTION_MAP = {}
for section_label, employee_ids in _ROSTER_BY_SECTION:
	for sort_idx, employee_id in enumerate(employee_ids):
		EMPLOYEE_SECTION_MAP[employee_id] = (section_label, sort_idx)

# Name aliases when ID not in roster (normalized name -> section label + optional sort hint)
_NAME_ALIASES = {
	"hafiz shahnawaz awan": ("Heads and Senior Staff", 0),
	"fozia fayyaz": ("Heads and Senior Staff", 1),
	"rahmanuddin": ("Quran Program for Students - Full Time & Part Time", 7),
	"nadeemullah": ("Quran Program for Students - Full Time & Part Time", 8),
	"muhammad danish": ("HR & Admin - Full Time & Part Time", 7),
	"hasan ameer uddin": ("HR & Admin - Full Time & Part Time", 9),
	"sumaira irfan": ("HR & Admin - Full Time & Part Time", 12),
	"anwar khan afridi": ("Marketing - Full Time", 3),
	"syed farhan hussain shah": ("Information Technology - Full Time,  Part Time & Contract Fix Salary", 2),
	"s rahman haider": ("Project Base - QPS - Contract ( As Per Need)", 0),
	"syed faisal rehan": ("Project Base - QPS - Contract ( As Per Need)", 1),
}

UNASSIGNED_SECTION = "Other Staff (Not in roster)"


def _normalize_name(name):
	if not name:
		return ""
	n = name.lower().strip()
	n = re.sub(r"^(mr\.?|ms\.?|mrs\.?)\s*", "", n)
	n = re.sub(r"[^a-z0-9\s]", " ", n)
	return re.sub(r"\s+", " ", n).strip()


def get_employee_section(employee_id, employee_name=None):
	if employee_id in EMPLOYEE_SECTION_MAP:
		return EMPLOYEE_SECTION_MAP[employee_id]

	if employee_name:
		norm = _normalize_name(employee_name)
		if norm in _NAME_ALIASES:
			return _NAME_ALIASES[norm]

	return (UNASSIGNED_SECTION, 9999)


def sort_key_for_row(row):
	section_label, sort_idx = row.get("_section_sort", (UNASSIGNED_SECTION, 9999))
	section_order = SECTION_ORDER.index(section_label) if section_label in SECTION_ORDER else len(SECTION_ORDER)
	return (section_order, sort_idx, (row.get("employee_name") or "").lower())
