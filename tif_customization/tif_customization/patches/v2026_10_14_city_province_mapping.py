# Copyright (c) 2026, The Ilm Foundation and contributors
# License: MIT
"""Ensure Province master rows exist, add City.province / Area.province columns usage,
and backfill City.province from Field Visit majority vote."""

from __future__ import annotations

import frappe
from frappe.utils import cint, cstr


PROVINCES = (
	"Punjab",
	"Sindh",
	"Khyber Pakhtunkhwa",
	"Balochistan",
	"Azad Jammu & Kashmir",
	"Gilgit-Baltistan",
	"Islamabad Capital Territory",
)

# Normalize common Field Visit / legacy labels → Province DocType name
PROVINCE_ALIASES = {
	"punjab": "Punjab",
	"sindh": "Sindh",
	"kpk": "Khyber Pakhtunkhwa",
	"khyber pakhtunkhwa": "Khyber Pakhtunkhwa",
	"kp": "Khyber Pakhtunkhwa",
	"nwfp": "Khyber Pakhtunkhwa",
	"balochistan": "Balochistan",
	"baluchistan": "Balochistan",
	"ajk": "Azad Jammu & Kashmir",
	"azad jammu & kashmir": "Azad Jammu & Kashmir",
	"azad jammu and kashmir": "Azad Jammu & Kashmir",
	"gilgit-baltistan": "Gilgit-Baltistan",
	"gilgit baltistan": "Gilgit-Baltistan",
	"ict": "Islamabad Capital Territory",
	"islamabad": "Islamabad Capital Territory",
	"islamabad capital territory": "Islamabad Capital Territory",
}


def _norm_province(raw: str) -> str:
	text = cstr(raw).strip()
	if not text:
		return ""
	if text in PROVINCES:
		return text
	return PROVINCE_ALIASES.get(text.lower(), "")


def execute():
	if not frappe.db.exists("DocType", "Province"):
		return

	for name in PROVINCES:
		if not frappe.db.exists("Province", name):
			doc = frappe.get_doc({"doctype": "Province", "province": name})
			doc.insert(ignore_permissions=True)

	if not frappe.db.exists("DocType", "City"):
		return
	if not frappe.db.has_column("City", "province"):
		# Column comes from DocType migrate; patch may run after sync.
		return

	# Majority province per city from submitted Field Visits.
	rows = frappe.db.sql(
		"""
		SELECT city, province, COUNT(*) AS n
		FROM `tabField Visit`
		WHERE docstatus = 1
		  AND IFNULL(TRIM(city), '') != ''
		  AND IFNULL(TRIM(province), '') != ''
		GROUP BY city, province
		ORDER BY city ASC, n DESC
		""",
		as_dict=True,
	)
	best: dict[str, tuple[str, int]] = {}
	for row in rows:
		city = cstr(row.city).strip()
		prov = _norm_province(row.province)
		if not city or not prov:
			continue
		n = cint(row.n)
		prev = best.get(city)
		if not prev or n > prev[1]:
			best[city] = (prov, n)

	updated = 0
	for city_name, (prov, _n) in best.items():
		if not frappe.db.exists("City", city_name):
			continue
		current = cstr(frappe.db.get_value("City", city_name, "province") or "").strip()
		if current:
			continue
		frappe.db.set_value("City", city_name, "province", prov, update_modified=False)
		updated += 1

	# Push City.province onto Area.province where Area has city and blank province.
	if frappe.db.has_column("Area", "province") and frappe.db.has_column("Area", "city"):
		frappe.db.sql(
			"""
			UPDATE `tabArea` a
			INNER JOIN `tabCity` c ON c.name = a.city
			SET a.province = c.province
			WHERE IFNULL(TRIM(c.province), '') != ''
			  AND IFNULL(TRIM(a.province), '') = ''
			"""
		)

	frappe.db.commit()
	frappe.logger("patches").info(
		f"v2026_10_14_city_province_mapping: backfilled province on {updated} cities"
	)
