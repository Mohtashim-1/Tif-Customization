"""One row per school from submitted Field Visits.

Uses the exact school set, name key, roster and buckets of the SME Summary report
(Total Schools / Active / Active New / Model 0 and Model A/B/C), so every page built
on it shows the same numbers as that report.
"""

import re

import frappe
from frappe.utils import cint, cstr, getdate

# Program fields on Field Visit ("Yes" = running). Meetings are not programs, so
# qps_meeting_educationalist is intentionally left out.
PROGRAMS = (
	("qps_mqh_books", "MQH Books", "QPS"),
	("qps_mqh_teachers_guides", "MQH Teachers Guides", "QPS"),
	("qps_onsite_training", "Onsite Training", "QPS"),
	("qps_online_training", "Online Training", "QPS"),
	("qps_registration_lms", "Registration in LMS", "QPS"),
	("qps_50_days_syllabus", "50 Days Short MQH Syllabus", "QPS"),
	("qps_mqh_quiz", "MQH Quiz Program", "QPS"),
	("tps_noorani_qaida", "Noorani Qaida", "TPS"),
	("tps_noorani_qaida_guide", "Noorani Qaida Teacher's Guide", "TPS"),
	("tps_1_day_tajweed_females", "Intro of Tajweed for Females", "TPS"),
	("tps_ttc_tajweed_khi", "TTC Tajweed Training Course", "TPS"),
	("tps_tajweed_customize", "Tajweed Customize Course", "TPS"),
	("tps_noorani_qaida_workbook_khi", "Noorani Qaida Workbook", "TPS"),
	("tps_tajweed_workshop_kids_khi", "Tajweed Workshop for Kids", "TPS"),
	("cee_elp", "ELP", "CEE"),
	("cee_tecc_foundation", "TECC - Foundation", "CEE"),
	("cee_tecc_professional", "TECC - Professional", "CEE"),
	("cee_one_day_workshop", "One Day Workshop", "CEE"),
)

# Other "program running" signals in registered_school_sql (SME report Active Schools rule)
EXTRA_SIGNALS = (
	("ifnull(fv.me_mqh_book_status, '') != ''", "MQH Books (M&E)", "QPS"),
	# Check fields (0/1): `= 'Yes'` would match 0 in MariaDB, so use the report's yes-test
	("{yes:mt_mqh_sample_provided}", "MQH Sample Provided", "QPS"),
	("{yes:me_teachers_training_session}", "Teachers Training (M&E)", "CEE"),
	(
		"fv.type in ('Workshop Conducted', 'Workshop', 'Workshop Arranged', 'Training', 'Teachers Training Meeting')",
		"Workshop / Training",
		"CEE",
	),
	("ifnull(fv.qps_affiliated, '') like 'Yes%%'", "QPS Affiliated", "QPS"),
	("ifnull(fv.tps_affiliated, '') like 'Yes%%'", "TPS Affiliated", "TPS"),
	("ifnull(fv.cee_affiliated, '') like 'Yes%%'", "CEE Affiliated", "CEE"),
)

PROVINCE_ALIASES = {"KPK": "Khyber Pakhtunkhwa"}

STAFF_SQL = """coalesce(nullif(trim(fv.visit_by), ''), nullif(trim(fv.me_visit_by), ''),
	nullif(trim(fv.mt_visit_by), ''), fv.owner)"""


def clean_label(value):
	return re.sub(r"[\s\u200b\u200c\u200d\u2060\ufeff]+", " ", cstr(value)).strip()


def _latest(expr, visit_day):
	return f"substring_index(group_concat({expr} order by {visit_day} desc separator '||'), '||', 1)"


def fetch_schools(from_date=None, to_date=None, schools=None):
	from tif_customization.tif_customization.api.field_visit_drilldown import (
		_has_named_school_sql,
		_metric_condition,
		_school_key_sql,
		_school_sql,
		_yes_field_sql,
		registered_school_sql,
		school_field_visit_type_sql,
	)
	from tif_customization.tif_customization.field_visit_permissions import (
		apply_team_scope_to_conditions,
		staff_match_sql,
		visit_day_sql,
	)
	from tif_customization.tif_customization.model_school import department_count_sql
	from tif_customization.tif_customization.page.sme_summary_report_copy.sme_summary_report_copy import (
		_get_sme_staff,
		_staff_token_list,
	)

	visit_day = visit_day_sql("fv")
	school_expr = _school_sql("fv")
	school_key = _school_key_sql("fv")
	active_sql = registered_school_sql("fv")
	model0_sql = f"not ({active_sql}) and ({school_field_visit_type_sql('fv')})"
	new_sql = _metric_condition("new_schools", "fv")

	conds = [
		"fv.docstatus = 1",
		f"({_has_named_school_sql('fv')}) and (({active_sql}) or ({model0_sql}) or ({new_sql}))",
	]
	values = {}
	if from_date:
		conds.append(f"{visit_day} >= %(from_date)s")
		values["from_date"] = getdate(from_date)
	if to_date:
		conds.append(f"{visit_day} <= %(to_date)s")
		values["to_date"] = getdate(to_date)
	if schools:
		conds.append(f"{school_key} in %(schools)s")
		values["schools"] = tuple(schools)
	apply_team_scope_to_conditions(conds, values, alias="fv")
	# SME Summary roster (same scope as its Model A/B/C and Total Schools cards)
	roster = _staff_token_list(_get_sme_staff({}))
	values["staff_tokens"] = tuple(t.lower() for t in roster) or ("__none__",)
	conds.append(staff_match_sql("fv", "staff_tokens"))

	def signal_sql(cond):
		if cond.startswith("{yes:"):
			return _yes_field_sql(cond[5:-1], "fv")
		return cond

	flags = [f"max(case when {_yes_field_sql(field, 'fv')} then 1 else 0 end) as `{field}`" for field, _l, _d in PROGRAMS]
	flags += [
		f"max(case when {signal_sql(cond)} then 1 else 0 end) as `extra_{i}`"
		for i, (cond, _l, _d) in enumerate(EXTRA_SIGNALS)
	]
	rows = frappe.db.sql(
		f"""
		select
			{school_key} as school,
			max({school_expr}) as school_label,
			max(nullif(fv.school_name, '')) as customer,
			max({visit_day}) as last_visit,
			min({visit_day}) as first_visit,
			count(*) as visits,
			sum(case when fv.type = 'Marketing' then 1 else 0 end) as marketing_visits,
			sum(case when fv.type = 'Visits' then 1 else 0 end) as followup_visits,
			sum(case when fv.type = 'M&E' then 1 else 0 end) as me_visits,
			{_latest("coalesce(nullif(trim(fv.province), ''), nullif(trim(fv.me_province), ''), nullif(trim(fv.training_province), ''))", visit_day)} as province,
			{_latest("coalesce(nullif(fv.city, ''), nullif(fv.me_city, ''), nullif(fv.training_city, ''))", visit_day)} as city,
			{_latest("nullif(trim(coalesce(fv.school_address, fv.me_new_school_address)), '')", visit_day)} as address,
			{_latest(STAFF_SQL, visit_day)} as last_by,
			{_latest("nullif(fv.type, '')", visit_day)} as last_type,
			max(case when ({active_sql}) then 1 else 0 end) as is_active,
			max(case when ({new_sql}) then 1 else 0 end) as is_new,
			max(case when ({active_sql}) then {department_count_sql("fv")} else 0 end) as dept,
			{", ".join(flags)}
		from `tabField Visit` fv
		where {" and ".join(conds)}
		group by {school_key}
		""",
		values,
		as_dict=True,
	)

	out = []
	for r in rows:
		running = [{"label": label, "dept": dept} for field, label, dept in PROGRAMS if cint(r.get(field))]
		running += [
			{"label": label, "dept": dept}
			for i, (_c, label, dept) in enumerate(EXTRA_SIGNALS)
			if cint(r.get(f"extra_{i}"))
		]
		active = bool(cint(r.is_active))
		dept = cint(r.dept)
		out.append(
			{
				"school": r.school,
				"school_label": clean_label(r.school_label) or clean_label(r.school),
				"customer": r.customer or "",
				"first_visit": r.first_visit,
				"last_visit": r.last_visit,
				"last_by": r.last_by or "",
				"last_type": r.last_type or "",
				"visits": cint(r.visits),
				"marketing_visits": cint(r.marketing_visits),
				"followup_visits": cint(r.followup_visits),
				"me_visits": cint(r.me_visits),
				"province": PROVINCE_ALIASES.get(r.province or "", r.province or ""),
				"city": r.city or "",
				"address": clean_label(r.address),
				"running": running,
				# Same disjoint buckets as the report: new-in-period wins over Active / Model 0
				"bucket": "Active New" if cint(r.is_new) else ("Active" if active else "Model 0"),
				# Model A/B/C split every school with a program running (Active + Active New)
				"model": ("A" if dept >= 3 else "B" if dept == 2 else "C") if active else "0",
				"eligible": active,
			}
		)
	return out
