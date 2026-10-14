# Copyright (c) 2026, The Ilm Foundation and contributors
# License: MIT
"""Backfill missing Area.city and City.province so Area → City → Province works.

1. Curated City → Province for known Pakistan cities (fixes blank + bad majority votes)
2. Area.city = Area.name when the area label is itself a City
3. Area.city from Field Visit majority city (when City master exists)
4. Area.province from City.province
"""

from __future__ import annotations

from collections import defaultdict

import frappe
from frappe.utils import cint, cstr


# Canonical Province DocType names
PUNJAB = "Punjab"
SINDH = "Sindh"
KPK = "Khyber Pakhtunkhwa"
BAL = "Balochistan"
AJK = "Azad Jammu & Kashmir"
GB = "Gilgit-Baltistan"
ICT = "Islamabad Capital Territory"

# Lowercase city key → Province. Includes aliases / misspellings present in master.
CITY_PROVINCE = {
	# Punjab
	"ahmadpur": PUNJAB,
	"attock": PUNJAB,
	"bahawalnagar": PUNJAB,
	"bahawalpur": PUNJAB,
	"bhakkar": PUNJAB,
	"burewala": PUNJAB,
	"chakwal": PUNJAB,
	"chichawatni": PUNJAB,
	"chiniot": PUNJAB,
	"chunian": PUNJAB,
	"daska": PUNJAB,
	"dera ghazi khan": PUNJAB,
	"dina": PUNJAB,
	"faisalabad": PUNJAB,
	"fateh jang": PUNJAB,
	"fazal pura": PUNJAB,
	"gojra": PUNJAB,
	"goriwala": PUNJAB,
	"gujar khan": PUNJAB,
	"gujranwala": PUNJAB,
	"gujrat": PUNJAB,
	"hafizabad": PUNJAB,
	"hasilpur": PUNJAB,
	"hazro": PUNJAB,
	"jahanian": PUNJAB,
	"jaranwala": PUNJAB,
	"javeed abad": PUNJAB,
	"jehlum": PUNJAB,
	"jhang": PUNJAB,
	"jhelum": PUNJAB,
	"kamra": PUNJAB,
	"kasur": PUNJAB,
	"khanewal": PUNJAB,
	"khanpur": PUNJAB,
	"kharian": PUNJAB,
	"khushab": PUNJAB,
	"kot adu": PUNJAB,
	"layyah": PUNJAB,
	"lodhran": PUNJAB,
	"mailsi": PUNJAB,
	"mandi bahauddin": PUNJAB,
	"mian channu": PUNJAB,
	"mianwali": PUNJAB,
	"multan": PUNJAB,
	"murree": PUNJAB,
	"muzaffargarh": PUNJAB,
	"nankana sahib": PUNJAB,
	"narowal": PUNJAB,
	"okara": PUNJAB,
	"pakpattan": PUNJAB,
	"pasrur": PUNJAB,
	"pindigheb": PUNJAB,
	"quaidabad": PUNJAB,
	"rahim yar khan": PUNJAB,
	"rajanpur": PUNJAB,
	"rawalpindi": PUNJAB,
	"sadiqabad": PUNJAB,
	"sahiwal": PUNJAB,
	"sanjwal": PUNJAB,
	"sargodha": PUNJAB,
	"shakargarh": PUNJAB,
	"sheikhupura": PUNJAB,
	"shorkot": PUNJAB,
	"sialkot": PUNJAB,
	"sialkowt": PUNJAB,
	"talagang": PUNJAB,
	"taxila": PUNJAB,
	"toba tek singh": PUNJAB,
	"vehari": PUNJAB,
	"wah cantt": PUNJAB,
	"wazirabad": PUNJAB,
	"lahore": PUNJAB,
	"lohore": PUNJAB,
	# Sindh
	"badin": SINDH,
	"badeen": SINDH,
	"benazirabad": SINDH,
	"digri": SINDH,
	"hala": SINDH,
	"hyderabad": SINDH,
	"hydrabad": SINDH,
	"jacobabad": SINDH,
	"jecobabad": SINDH,
	"jaffarabad": SINDH,
	"jamshoro": SINDH,
	"kandhkot": SINDH,
	"karachi": SINDH,
	"kashmor": SINDH,
	"kashmore": SINDH,
	"khairpur mirus": SINDH,
	"khoski": SINDH,
	"larkana": SINDH,
	"matyari": SINDH,
	"mirpur khas": SINDH,
	"naushahro feroze": SINDH,
	"nawabshah": SINDH,
	"noshero feroz": SINDH,
	"pano aqil": SINDH,
	"panoaqil": SINDH,
	"rani pur": SINDH,
	"rohri": SINDH,
	"sanghar": SINDH,
	"shahdadkot": SINDH,
	"shikarpur": SINDH,
	"sukkur": SINDH,
	"tando adam khan": SINDH,
	"tando allahyar": SINDH,
	"tando jam": SINDH,
	"tando muhammad khan": SINDH,
	"tangwani": SINDH,
	"thatta": SINDH,
	"thul": SINDH,
	"thull": SINDH,
	"thull city": SINDH,
	"umerkot": SINDH,
	"sindh": SINDH,
	# Khyber Pakhtunkhwa
	"abbottabad": KPK,
	"bajaur agency": KPK,
	"bajour": KPK,
	"bannu": KPK,
	"batkhela": KPK,
	"battagram": KPK,
	"besham": KPK,
	"buner": KPK,
	"buner, malakand": KPK,
	"chakesar": KPK,
	"charsada": KPK,
	"charsadda": KPK,
	"chitral": KPK,
	"dargai": KPK,
	"dera ismail khan": KPK,
	"dir": KPK,
	"dir upper": KPK,
	"upper dir": KPK,
	"lower dir": KPK,
	"faizabad": KPK,
	"garhi maira": KPK,
	"ghazni khel": KPK,
	"hangu": KPK,
	"haripur": KPK,
	"hazara haripur": KPK,
	"havelian": KPK,
	"karak": KPK,
	"khwaza khela": KPK,
	"kohani": KPK,
	"kohat": KPK,
	"kohistan": KPK,
	"lakki marwat": KPK,
	"malakand": KPK,
	"mansehra": KPK,
	"manshera": KPK,
	"mardan": KPK,
	"mingora": KPK,
	"mohmand": KPK,
	"noshehra": KPK,
	"nowshera": KPK,
	"peshawar": KPK,
	"prshawar": KPK,
	"puran": KPK,
	"sawat": KPK,
	"swat": KPK,
	"swabi": KPK,
	"shangla": KPK,
	"shergarh mardan": KPK,
	"surizai bala": KPK,
	"aman garh": KPK,
	# Balochistan
	"chaman": BAL,
	"gwadar": BAL,
	"hazardar": BAL,
	"hub": BAL,
	"hub chowki": BAL,
	"hub lasbela": BAL,
	"ketch": BAL,
	"khizdar": BAL,
	"khuzdar": BAL,
	"lasbela": BAL,
	"mastung": BAL,
	"nushki": BAL,
	"panjgur": BAL,
	"pishin": BAL,
	"quetta": BAL,
	"sohrab": BAL,
	"sonmiani": BAL,
	"turbat": BAL,
	"uthal": BAL,
	"winder": BAL,
	"zhob": BAL,
	"brohi muhallah": BAL,
	"adalat road": BAL,
	# AJK
	"bhimber": AJK,
	"jhelum valley": AJK,
	"kotli": AJK,
	"mirpur": AJK,
	"muzaffarabad": AJK,
	"rawalakot": AJK,
	# Gilgit-Baltistan
	"chilas": GB,
	"chillas": GB,
	"diamer chilas": GB,
	"gilgit": GB,
	"skardu": GB,
	# ICT
	"islamabad": ICT,
}


def _city_key(name: str) -> str:
	return " ".join(cstr(name).strip().lower().split())


# Map FV / legacy city spellings → existing City master name
CITY_ALIASES = {
	"lohore": "Lahore",
	"hydrabad": "Hyderabad",
	"jecobabad": "Jacobabad",
	"prshawar": "Peshawar",
	"manshera": "Mansehra",
	"sialkowt": "Sialkot",
	"noshehra": "Nowshera",
	"hub": "Hub Lasbela",
	"hub chowki": "Hub Lasbela",
	"panoaqil": "Pano Aqil",
	"thull": "Thull City",
	"bajour": "Bajaur Agency",
	"chillas": "chilas",
	"sawat": "Swat",
	"dir upper": "Upper Dir",
}


def _resolve_city(raw: str) -> str:
	text = cstr(raw).strip()
	if not text:
		return ""
	# Prefer canonical alias even when a misspelled City row also exists.
	alias = CITY_ALIASES.get(_city_key(text))
	if alias and frappe.db.exists("City", alias):
		return alias
	if frappe.db.exists("City", text):
		return text
	# Case-insensitive exact match
	rows = frappe.db.sql(
		"SELECT name FROM `tabCity` WHERE LOWER(TRIM(name)) = %s LIMIT 1",
		(_city_key(text),),
	)
	return rows[0][0] if rows else ""


def _ensure_provinces():
	for name in (PUNJAB, SINDH, KPK, BAL, AJK, GB, ICT):
		if not frappe.db.exists("Province", name):
			frappe.get_doc({"doctype": "Province", "province": name}).insert(ignore_permissions=True)


def _backfill_city_provinces() -> int:
	if not frappe.db.has_column("City", "province"):
		return 0
	updated = 0
	for row in frappe.get_all("City", fields=["name", "province"]):
		want = CITY_PROVINCE.get(_city_key(row.name))
		if not want:
			continue
		current = cstr(row.province).strip()
		# Fill blank or correct wrong majority-vote values for curated cities.
		if current == want:
			continue
		frappe.db.set_value("City", row.name, "province", want, update_modified=False)
		updated += 1
	return updated


def _link_areas_named_like_city() -> int:
	"""When Area.name equals a City name, set Area.city to that city."""
	updated = 0
	blank = frappe.db.sql(
		"""
		SELECT a.name
		FROM `tabArea` a
		INNER JOIN `tabCity` c ON c.name = a.name
		WHERE IFNULL(TRIM(a.city), '') = ''
		""",
		as_dict=True,
	)
	for row in blank:
		frappe.db.set_value("Area", row.name, "city", row.name, update_modified=False)
		updated += 1

	# Case-insensitive: Area.area matches City.name
	blank2 = frappe.db.sql(
		"""
		SELECT a.name AS area_name, c.name AS city_name
		FROM `tabArea` a
		INNER JOIN `tabCity` c ON LOWER(TRIM(c.name)) = LOWER(TRIM(a.area))
		WHERE IFNULL(TRIM(a.city), '') = ''
		""",
		as_dict=True,
	)
	for row in blank2:
		frappe.db.set_value("Area", row.area_name, "city", row.city_name, update_modified=False)
		updated += 1
	return updated


def _backfill_area_city_from_field_visits() -> int:
	rows = frappe.db.sql(
		"""
		SELECT a.name AS area_name, fv.city, COUNT(*) AS n
		FROM `tabArea` a
		INNER JOIN `tabField Visit` fv
			ON fv.area = a.name AND fv.docstatus = 1
		WHERE IFNULL(TRIM(a.city), '') = ''
		  AND IFNULL(TRIM(fv.city), '') != ''
		GROUP BY a.name, fv.city
		""",
		as_dict=True,
	)
	# Collapse alias spellings into canonical City names before majority vote.
	by_area: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
	for row in rows:
		city = _resolve_city(row.city)
		if not city:
			continue
		by_area[row.area_name][city] += cint(row.n)

	updated = 0
	for area_name, counts in by_area.items():
		opts = sorted(counts.items(), key=lambda x: -x[1])
		city, n = opts[0]
		# Skip ambiguous ties (two cities close in count).
		if len(opts) > 1 and opts[0][0] != opts[1][0]:
			second = opts[1][1]
			if second >= max(n * 0.4, 1) and n < 8:
				continue
		frappe.db.set_value("Area", area_name, "city", city, update_modified=False)
		updated += 1
	return updated


def _sync_area_province_from_city() -> int:
	if not (
		frappe.db.has_column("Area", "province") and frappe.db.has_column("Area", "city")
	):
		return 0
	before = frappe.db.sql(
		"""
		SELECT COUNT(*) FROM `tabArea` a
		INNER JOIN `tabCity` c ON c.name = a.city
		WHERE IFNULL(TRIM(c.province), '') != ''
		  AND IFNULL(TRIM(a.province), '') != IFNULL(TRIM(c.province), '')
		"""
	)[0][0]
	frappe.db.sql(
		"""
		UPDATE `tabArea` a
		INNER JOIN `tabCity` c ON c.name = a.city
		SET a.province = c.province
		WHERE IFNULL(TRIM(c.province), '') != ''
		  AND IFNULL(TRIM(a.province), '') != IFNULL(TRIM(c.province), '')
		"""
	)
	return cint(before)


def execute():
	if not frappe.db.exists("DocType", "City") or not frappe.db.exists("DocType", "Area"):
		return
	if frappe.db.exists("DocType", "Province"):
		_ensure_provinces()

	cities = _backfill_city_provinces()
	named = _link_areas_named_like_city()
	from_fv = _backfill_area_city_from_field_visits()
	synced = _sync_area_province_from_city()

	frappe.db.commit()
	frappe.logger("patches").info(
		"v2026_10_15_area_city_province_backfill: "
		f"cities_province={cities}, area_city_named={named}, "
		f"area_city_fv={from_fv}, area_province_synced={synced}"
	)
