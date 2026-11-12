import base64
import json
import re

import frappe
from frappe import _
from frappe.utils import cint, cstr, escape_html, formatdate, getdate, today

PAGE_ROLES = ("System Manager", "School Approval", "Field Staff Manager", "SME Manager", "COO", "HOD")

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
	("fv.mt_mqh_sample_provided = 'Yes'", "MQH Sample Provided", "QPS"),
	("fv.me_teachers_training_session = 'Yes'", "Teachers Training (M&E)", "CEE"),
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
# ~20s for 767 pages; keep well under the 120s gunicorn timeout (mirrored in school_certificate.js)
MAX_DOWNLOAD = 1500

def _clean_label(value):
	return re.sub(r"[\s\u200b\u200c\u200d\u2060\ufeff]+", " ", cstr(value)).strip()


def _check_access():
	if frappe.session.user == "Administrator":
		return
	if not set(frappe.get_roles()) & set(PAGE_ROLES):
		frappe.throw(_("Not permitted to issue school certificates."), frappe.PermissionError)


def _fetch_schools(from_date=None, to_date=None, schools=None):
	"""One row per school, using the exact school set and buckets of the SME Summary
	"Total Schools" cards (get_total_schools_by_province)."""
	from tif_customization.tif_customization.api.field_visit_drilldown import (
		_has_named_school_sql,
		_metric_condition,
		_school_sql,
		registered_school_sql,
		school_field_visit_type_sql,
	)
	from tif_customization.tif_customization.field_visit_permissions import (
		apply_team_scope_to_conditions,
		visit_day_sql,
	)

	visit_day = visit_day_sql("fv")
	school_expr = _school_sql("fv")
	school_key = f"lower(trim({school_expr}))"
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

	flags = [f"max(case when fv.{field} = 'Yes' then 1 else 0 end) as `{field}`" for field, _l, _d in PROGRAMS]
	flags += [f"max(case when {cond} then 1 else 0 end) as `extra_{i}`" for i, (cond, _l, _d) in enumerate(EXTRA_SIGNALS)]
	rows = frappe.db.sql(
		f"""
		select
			{school_key} as school,
			max({school_expr}) as school_label,
			max(nullif(fv.school_name, '')) as customer,
			max({visit_day}) as last_visit,
			count(*) as visits,
			substring_index(group_concat(coalesce(nullif(trim(fv.province), ''), nullif(trim(fv.me_province), ''), nullif(trim(fv.training_province), ''))
				order by {visit_day} desc separator '||'), '||', 1) as province,
			substring_index(group_concat(coalesce(nullif(fv.city, ''), nullif(fv.me_city, ''), nullif(fv.training_city, ''))
				order by {visit_day} desc separator '||'), '||', 1) as city,
			max(case when ({active_sql}) then 1 else 0 end) as is_active,
			max(case when ({new_sql}) then 1 else 0 end) as is_new,
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
		out.append(
			{
				"school": r.school,
				"school_label": _clean_label(r.school_label) or _clean_label(r.school),
				"last_visit": r.last_visit,
				"visits": r.visits,
				"province": PROVINCE_ALIASES.get(r.province or "", r.province or ""),
				"city": r.city or "",
				"running": running,
				# Same disjoint buckets as the report: new-in-period wins over Active / Model 0
				"bucket": "Active New" if cint(r.is_new) else ("Active" if cint(r.is_active) else "Model 0"),
				"eligible": bool(cint(r.is_active)),
				"customer": r.customer or "",
			}
		)
	return out


@frappe.whitelist()
def get_schools(search=None, province=None, city=None, from_date=None, to_date=None, eligible_only=1):
	_check_access()
	rows = _fetch_schools(from_date=from_date, to_date=to_date)

	total_eligible = sum(1 for r in rows if r["eligible"])
	search = cstr(search).strip().lower()
	province = cstr(province).strip()
	city = cstr(city).strip().lower()

	def keep(r):
		if cint(eligible_only) and not r["eligible"]:
			return False
		if province and r["province"] != province:
			return False
		if city and city not in r["city"].lower():
			return False
		if search and search not in r["school_label"].lower() and search not in r["school"].lower():
			return False
		return True

	filtered = sorted((r for r in rows if keep(r)), key=lambda r: r["school_label"].lower())
	buckets = {b: sum(1 for r in rows if r["bucket"] == b) for b in ("Active", "Active New", "Model 0")}
	return {
		"rows": filtered,
		"total_schools": len(rows),
		"total_eligible": total_eligible,
		"active": buckets["Active"],
		"active_new": buckets["Active New"],
		"model_0": buckets["Model 0"],
		"provinces": sorted({r["province"] for r in rows if r["province"]}),
	}


def _certificate_image_uri():
	path = frappe.get_app_path("tif_customization", "public", "images", "mission_partner_certificate.jpg")
	with open(path, "rb") as f:
		return "data:image/jpeg;base64," + base64.b64encode(f.read()).decode()


def _name_font_size(name):
	n = len(name)
	if n > 60:
		return 22
	if n > 45:
		return 27
	if n > 32:
		return 33
	return 40


def _certificate_html(names, cert_date):
	img = _certificate_image_uri()
	date_label = formatdate(cert_date, "dd-MM-yyyy")
	pages = []
	for i, name in enumerate(names):
		last = i == len(names) - 1
		pages.append(
			f"""
<div class="cert"{'' if last else ' style="page-break-after: always;"'}>
	<img class="bg" src="{img}">
	<div class="name-wrap"><div class="name" style="font-size:{_name_font_size(name)}pt">{escape_html(name)}</div></div>
	<div class="date">{date_label}</div>
</div>"""
		)
	return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
	@page {{ size: 297mm 229.4mm; margin: 0; }}
	html, body {{ margin: 0; padding: 0; }}
	.cert {{ position: relative; width: 297mm; height: 229.4mm; overflow: hidden; }}
	.bg {{ position: absolute; left: 0; top: 0; width: 297mm; height: 229.4mm; }}
	.name-wrap {{ position: absolute; left: 22mm; width: 253mm; top: 122mm; height: 32mm; display: table; }}
	.name {{ display: table-cell; vertical-align: middle; text-align: center;
		font-family: Georgia, "Times New Roman", serif; color: #263b5e; font-weight: bold; line-height: 1.15; }}
	.date {{ position: absolute; left: 160mm; width: 31mm; top: 207.5mm; text-align: center;
		font-family: Arial, Helvetica, sans-serif; font-size: 10.5pt; font-weight: bold; color: #263b5e; }}
</style></head><body>{"".join(pages)}</body></html>"""


@frappe.whitelist()
def download_certificates(schools=None, cert_date=None, from_date=None, to_date=None):
	_check_access()
	if isinstance(schools, str):
		schools = json.loads(schools) if schools.strip().startswith("[") else [schools]
	schools = [cstr(s) for s in (schools or []) if cstr(s).strip()]
	if not schools:
		frappe.throw(_("Select at least one school."))
	if len(schools) > MAX_DOWNLOAD:
		frappe.throw(_("Please download at most {0} certificates at a time.").format(MAX_DOWNLOAD))

	rows = {r["school"]: r for r in _fetch_schools(from_date=from_date, to_date=to_date, schools=schools)}
	not_eligible = [s for s in schools if not rows.get(s, {}).get("eligible")]
	if not_eligible:
		frappe.throw(
			_("These schools have no running program and are not eligible: {0}").format(
				", ".join(not_eligible[:10])
			)
		)

	# WeasyPrint: the server's unpatched wkhtmltopdf ignores custom page size / zero margins
	from weasyprint import HTML

	names = [rows[s]["school_label"] for s in schools]
	pdf = HTML(string=_certificate_html(names, getdate(cert_date or today()))).write_pdf()

	if len(names) == 1:
		filename = f"Mission Partner Certificate - {names[0]}.pdf"
	else:
		filename = f"Mission Partner Certificates ({len(names)} schools).pdf"
	frappe.local.response.filename = filename.replace("/", "-")
	frappe.local.response.filecontent = pdf
	frappe.local.response.type = "download"
