import base64
import json

import frappe
from frappe import _
from frappe.utils import cint, cstr, escape_html, formatdate, getdate, today

from tif_customization.tif_customization.api.school_dataset import fetch_schools

PAGE_ROLES = ("System Manager", "School Approval", "Field Staff Manager", "SME Manager", "COO", "HOD")

# ~20s for 767 pages; keep well under the 120s gunicorn timeout (mirrored in school_certificate.js)
MAX_DOWNLOAD = 1500


def _check_access():
	if frappe.session.user == "Administrator":
		return
	if not set(frappe.get_roles()) & set(PAGE_ROLES):
		frappe.throw(_("Not permitted to issue school certificates."), frappe.PermissionError)


def _fetch_schools(from_date=None, to_date=None, schools=None):
	return fetch_schools(from_date=from_date, to_date=to_date, schools=schools)


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
