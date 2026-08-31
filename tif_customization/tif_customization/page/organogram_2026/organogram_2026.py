# Copyright (c) 2026, TIF Customization and contributors
# License: MIT
"""Organogram 2026 — printed TIF chart, names filled from Active Employee."""

from __future__ import annotations

import frappe
from frappe import _


def _n(title, tone="male", match=None, extra_match=None, key=None, figures=1, parent=None):
	return {
		"title": title,
		"key": key or title.replace("\n", " ").strip(),
		"tone": tone,
		"figures": figures,
		"parent": parent,
		"match": list(match or [title.replace("\n", " ")]) + list(extra_match or []),
	}


@frappe.whitelist()
def get_organogram():
	if not frappe.has_permission("Employee", "read"):
		frappe.throw(_("You are not permitted to view Employee data."))

	rows = frappe.get_all(
		"Employee",
		filters={"status": "Active"},
		fields=[
			"name",
			"employee_name",
			"designation",
			"gender",
			"employment_type",
			"department",
			"image",
			"cell_number",
			"company_email",
		],
		order_by="employee_name asc",
	)
	by_desig = {}
	for row in rows:
		key = (row.designation or "").strip().lower()
		by_desig.setdefault(key, []).append(row)
	claimed = set()

	def fill(node):
		people = []
		for label in node.get("match") or []:
			for row in by_desig.get((label or "").strip().lower(), []):
				if row.name in claimed:
					continue
				claimed.add(row.name)
				people.append(_person(row))
		tone = node.get("tone") or "male"
		if people:
			tone = _tone_from_people(people, tone)
		return {
			"title": node["title"],
			"key": node["key"],
			"parent": node.get("parent"),
			"tone": tone,
			"figures": node.get("figures") or 1,
			"people": people,
			"count": len(people),
		}

	return {
		"title": _("ORGANOGRAM 2026"),
		"website": "WWW.TIF.EDU.PK",
		"logo": "/files/TIF-Logo.png",
		"legend": [
			{"key": "part_time", "label": _("Part Time")},
			{"key": "male", "label": _("Male")},
			{"key": "female", "label": _("Female")},
			{"key": "contract_need", "label": _("Contract (As Per Need)")},
			{"key": "contract_fix", "label": _("Contract (Fix Salary)")},
			{"key": "board", "label": _("Directors / Board Members")},
		],
		"directors": fill(
			_n(
				"Directors &\nBoard Members",
				"board",
				match=["Trustee (TIF)"],
				key="directors",
				figures=2,
			)
		),
		"ceo": fill(
			_n(
				"Director, Chairman & CEO",
				"board",
				match=["Chief Executive Officer", "Chairman"],
				key="ceo",
				parent="directors",
			)
		),
		"units": [
			{
				"id": "accounts",
				"label": _("Accounts"),
				"head": fill(
					_n(
						"Virtual CFO & CS",
						"contract_fix",
						match=["CFO & Company Secretary"],
						key="cfo",
						parent="ceo",
					)
				),
				"lanes": [
					{
						"label": "",
						"levels": {
							"4": [
								fill(
									_n(
										"AM Accounts",
										"male",
										match=["Assistant Manager Accounts"],
										key="am_accounts",
										parent="cfo",
									)
								),
								fill(
									_n(
										"AM Finance",
										"male",
										match=["Assistant Manager Finance", "AM Finance"],
										key="am_finance",
										parent="cfo",
									)
								),
							]
						},
					}
				],
			},
			{
				"id": "coo",
				"label": "",
				"head": fill(_n("COO", "male", match=["Chief Operating Officer"], key="coo", parent="ceo")),
				"lanes": [
					{
						"label": _("Marketing"),
						"levels": {
							"4": [
								fill(
									_n(
										"Graphic Designer\n& Video Editor",
										"male",
										match=["Graphic Designer & Video Editor"],
										key="graphic",
										parent="coo",
									)
								)
							],
							"5": [
								fill(
									_n(
										"Sr. Marketing\nExecutive",
										"male",
										match=["Sr. Marketing Executive"],
										key="sr_mkt",
										parent="graphic",
									)
								)
							],
							"6": [
								fill(
									_n(
										"Social Media\nExecutive",
										"male",
										match=["Social Media Executive"],
										key="social",
										parent="sr_mkt",
									)
								)
							],
							"7": [
								fill(
									_n(
										"Jr. Media\nExecutive",
										"male",
										match=["Media Officer", "Jr. Media Executive"],
										key="jr_media",
										parent="social",
									)
								)
							],
						},
					},
					{
						"label": _("HR"),
						"levels": {
							"5": [fill(_n("HR Executive", "male", match=["HR Executive"], key="hr", parent="coo"))]
						},
					},
					{
						"label": _("Supply Chain"),
						"levels": {
							"4": [
								fill(
									_n(
										"Assistant Manager\nSupply Chain",
										"male",
										match=["Assistant Manager -Supply Chain"],
										key="am_sc",
										parent="coo",
									)
								)
							],
							"6": [
								fill(
									_n(
										"Jr. Dispatch\nExecutive",
										"male",
										match=["Supply Chain Assistant", "Jr. Dispatch Executive"],
										key="jr_dispatch",
										parent="am_sc",
									)
								)
							],
						},
					},
					{
						"label": _("IT & ERP"),
						"levels": {
							"4": [
								fill(
									_n(
										"AM-IT",
										"male",
										match=["Assistant Manager IT"],
										key="am_it",
										parent="coo",
									)
								)
							],
							"7": [
								fill(
									_n(
										"ERP Associate",
										"contract_fix",
										match=["ERP Developer"],
										key="erp",
										parent="am_it",
									)
								)
							],
						},
					},
					{
						"label": _("Admin"),
						"levels": {
							"5": [
								fill(
									_n(
										"Admin Executive",
										"female",
										match=["Admin Executive"],
										key="admin",
										parent="coo",
									)
								)
							],
							"6": [
								fill(_n("Office Boy", "male", match=["Office Boy"], key="office_boy", parent="admin")),
								fill(
									_n(
										"Sweeper",
										"male",
										match=["Janitorial (Sweeper)"],
										key="sweeper",
										parent="admin",
									)
								),
								fill(
									_n(
										"Office Maid",
										"part_time",
										match=["Office Maid"],
										key="office_maid",
										parent="admin",
									)
								),
								fill(_n("Drivers", "male", match=["Office Driver"], key="drivers", parent="admin")),
							],
						},
					},
					{
						"label": _("Special Education"),
						"levels": {
							"4": [
								fill(
									_n(
										"Assistant Project\nManager (Sp. Ed)",
										"female",
										match=["Assistant Project Manager (Sp.Ed)"],
										key="apm_sped",
										parent="coo",
									)
								)
							],
							"6": [
								fill(
									_n(
										"Receptionist",
										"female",
										match=["Receptionist - Special Education Department"],
										key="sped_reception",
										parent="apm_sped",
									)
								),
								fill(
									_n(
										"Helper Sp. Ed",
										"female",
										match=["Helper, Sp. Education", "Office Maid Sp. Education"],
										key="sped_helper",
										parent="apm_sped",
									)
								),
							],
							"7": [
								fill(
									_n(
										"Physiotherapist",
										"part_time",
										match=["Physiotherapist"],
										key="physio",
										parent="sped_helper",
									)
								),
								fill(
									_n(
										"Speech Therapist",
										"part_time",
										match=["Speechtherapist"],
										key="speech",
										parent="sped_helper",
									)
								),
							],
						},
					},
				],
			},
			{
				"id": "qps",
				"label": _("Qu'ran Program for Students (QPS)"),
				"head": None,
				"lanes": [
					{
						"label": "",
						"levels": {
							"4": [
								fill(
									_n(
										"Sr. Project Manager QPS",
										"male",
										match=["Sr. Project Manager"],
										key="sr_pm_qps",
										parent="ceo",
									)
								)
							],
							"5": [
								fill(
									_n(
										"Deputy Project\nManager",
										"male",
										match=["Deputy Project Manager"],
										key="dpm_qps",
										parent="sr_pm_qps",
									)
								)
							],
							"6": [
								fill(
									_n(
										"Relationship\nExecutive",
										"male",
										match=["Relationship Executive"],
										key="rel_exec",
										parent="dpm_qps",
									)
								),
								fill(
									_n(
										"Sr. R&D\nExecutive",
										"male",
										match=["Sr. R&D Executive"],
										key="rnd",
										parent="dpm_qps",
									)
								),
							],
							"7": [
								fill(
									_n(
										"Content Executive",
										"male",
										match=["Content Executive"],
										key="content",
										parent="rel_exec",
									)
								),
								fill(
									_n(
										"Jr. Content\nExecutive",
										"male",
										match=["Jr. Content Executive"],
										key="jr_content",
										parent="content",
									)
								),
								fill(
									_n(
										"Jr. Content\nExecutive",
										"part_time",
										match=["Jr. Content Executive (English)"],
										key="jr_content_en",
										parent="jr_content",
									)
								),
							],
						},
					}
				],
			},
			{
				"id": "otr",
				"label": _("OTR"),
				"head": None,
				"lanes": [
					{
						"label": "",
						"levels": {
							"5": [
								fill(
									_n(
										"School Relation\nExecutive",
										"male",
										match=["School Relationship Executive"],
										key="school_rel",
										parent="ceo",
									)
								)
							],
							"6": [
								fill(
									_n(
										"Academic\nExecutive",
										"male",
										match=["Academic Executive"],
										key="academic",
										parent="school_rel",
									)
								)
							],
							"7": [
								fill(
									_n(
										"School Marketing\nExecutive",
										"part_time",
										match=["School Marketing Executive"],
										key="school_mkt",
										parent="academic",
									)
								)
							],
						},
					}
				],
			},
			{
				"id": "ttpd",
				"label": _("Teacher Training"),
				"head": None,
				"lanes": [
					{
						"label": "",
						"levels": {
							"4": [
								fill(
									_n(
										"Manager T&PD",
										"female",
										match=["Manager Training & Program Development"],
										key="mgr_tpd",
										parent="ceo",
									)
								)
							],
							"5": [
								fill(
									_n(
										"Assistant Project\nManager",
										"female",
										match=["Assistant Project Manager"],
										key="apm_tt",
										parent="mgr_tpd",
									)
								)
							],
							"7": [
								fill(
									_n(
										"Trainers",
										"contract_need",
										match=["Teacher Trainer"],
										key="trainers_tt",
										parent="apm_tt",
									)
								)
							],
						},
					}
				],
			},
			{
				"id": "tps",
				"label": _("Tilawat Program for schools (TPS)"),
				"head": None,
				"lanes": [
					{
						"label": "",
						"levels": {
							"4": [
								fill(
									_n(
										"Project Manager TPS",
										"female",
										match=["Project Manager TPS"],
										key="pm_tps",
										parent="ceo",
									)
								)
							],
							"5": [
								fill(
									_n(
										"Sr. Training\nExecutive",
										"female",
										match=["Sr. Training Executive"],
										key="sr_train",
										parent="pm_tps",
									)
								)
							],
							"6": [
								fill(
									_n(
										"Jr. Monitoring\nExecutive",
										"female",
										match=["Jr Monitoring Executive"],
										key="jr_mon",
										parent="sr_train",
									)
								),
								fill(
									_n(
										"Jr. Training\nExecutive",
										"female",
										match=["Jr. Training Executive", "Office Assitant & Trainer"],
										key="jr_train",
										parent="sr_train",
									)
								),
							],
							"7": [
								fill(
									_n(
										"Trainer / Examiner\n& Supporting Staff",
										"contract_fix",
										match=["Trainer", "EXAMINER", "Supporting Staff"],
										key="tps_trainers",
										parent="jr_train",
									)
								),
								fill(
									_n(
										"Online Trainer",
										"contract_need",
										match=["Online Trainer"],
										key="online_trainer",
										parent="tps_trainers",
									)
								),
							],
						},
					}
				],
			},
		],
	}


def _person(row):
	return {
		"id": row.name,
		"name": row.employee_name,
		"designation": row.designation,
		"gender": row.gender,
		"employment_type": row.employment_type,
		"department": row.department,
		"image": row.image,
		"cell_number": row.cell_number,
		"company_email": row.company_email,
	}


def _tone_from_people(people, fallback):
	"""Colour from employment type, else gender — matches the printed legend."""
	types = {(p.get("employment_type") or "").lower() for p in people}
	if any("part time" in t for t in types):
		return "part_time"
	if any("as per need" in t or "qps -" in t or "tps -" in t or "teacher training -" in t for t in types):
		return "contract_need"
	if any("fixed salary" in t or "contract base" in t for t in types):
		return "contract_fix"
	genders = {(p.get("gender") or "").lower() for p in people}
	if genders == {"female"}:
		return "female"
	if genders == {"male"}:
		return "male"
	return fallback
