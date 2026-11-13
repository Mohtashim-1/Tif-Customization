import base64
import json

import frappe
from frappe import _
from frappe.utils import cint, cstr, escape_html, formatdate, getdate, now_datetime, today

from tif_customization.tif_customization.api.school_dataset import fetch_schools

PAGE_ROLES = ("System Manager", "School Approval", "Field Staff Manager", "SME Manager", "COO", "HOD")

# ~20s for 767 pages; keep well under the 120s gunicorn timeout (mirrored in school_certificate.js)
MAX_DOWNLOAD = 1500
CERT_DOCTYPE = "Mission Partner Certificate"


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
	issued = _issued_numbers([r["school"] for r in filtered])
	for r in filtered:
		r["certificate_no"] = issued.get(r["school"], "")
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


def _font_uri():
	path = frappe.get_app_path("tif_customization", "public", "fonts", "belgiano_serif.woff")
	with open(path, "rb") as f:
		return "data:font/woff;base64," + base64.b64encode(f.read()).decode()


def _issued_numbers(schools):
	if not schools:
		return {}
	return {
		r.school: r.name
		for r in frappe.get_all(CERT_DOCTYPE, filters={"school": ("in", schools)}, fields=["name", "school"])
	}


def _assign_numbers(rows, cert_date):
	"""Same school always keeps its first certificate number (SR TIF-MP0001, ...)."""
	issued = _issued_numbers([r["school"] for r in rows])
	out = {}
	for r in rows:
		name = issued.get(r["school"])
		if name:
			frappe.db.set_value(
				CERT_DOCTYPE,
				name,
				{
					"certificate_date": cert_date,
					"last_downloaded_on": now_datetime(),
					"download_count": cint(frappe.db.get_value(CERT_DOCTYPE, name, "download_count")) + 1,
				},
				update_modified=False,
			)
		else:
			doc = frappe.get_doc(
				{
					"doctype": CERT_DOCTYPE,
					"school": r["school"],
					"school_name": r["school_label"],
					"certificate_date": cert_date,
					"issued_by": frappe.session.user,
					"last_downloaded_on": now_datetime(),
					"download_count": 1,
				}
			).insert(ignore_permissions=True)
			name = doc.name
		out[r["school"]] = name
	return out


def _name_font_size(name):
	n = len(name)
	if n > 60:
		return 22
	if n > 45:
		return 27
	if n > 32:
		return 33
	return 40


def _certificate_html(certs, cert_date):
	img = _certificate_image_uri()
	font = _font_uri()
	date_label = formatdate(cert_date, "dd-MM-yyyy")
	pages = []
	for i, (name, number) in enumerate(certs):
		last = i == len(certs) - 1
		pages.append(
			f"""
<div class="cert"{'' if last else ' style="page-break-after: always;"'}>
	<img class="bg" src="{img}">
	<div class="cert-no"><span>Certificate No.</span>{escape_html(number)}</div>
	<div class="name-wrap"><div class="name" style="font-size:{_name_font_size(name)}pt">{escape_html(name)}</div></div>
	<div class="date">{date_label}</div>
</div>"""
		)
	return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
	@font-face {{ font-family: "Belgiano Serif"; src: url("{font}") format("woff"); font-weight: normal; font-style: normal; }}
	@page {{ size: 297mm 229.4mm; margin: 0; }}
	html, body {{ margin: 0; padding: 0; }}
	.cert {{ position: relative; width: 297mm; height: 229.4mm; overflow: hidden; }}
	.bg {{ position: absolute; left: 0; top: 0; width: 297mm; height: 229.4mm; }}
	.name-wrap {{ position: absolute; left: 22mm; width: 253mm; top: 122mm; height: 32mm; display: table; }}
	.name {{ display: table-cell; vertical-align: middle; text-align: center;
		font-family: "Belgiano Serif", Georgia, serif; color: #263b5e; font-weight: normal; line-height: 1.15; }}
	.date {{ position: absolute; left: 160mm; width: 31mm; top: 207.5mm; text-align: center;
		font-family: "Belgiano Serif", Georgia, serif; font-size: 11pt; color: #263b5e; }}
	.cert-no {{ position: absolute; right: 14mm; top: 15mm; text-align: right; color: #ffffff;
		font-family: "Belgiano Serif", Georgia, serif; font-size: 13pt; letter-spacing: .04em; line-height: 1.25; }}
	.cert-no span {{ display: block; font-size: 7.5pt; letter-spacing: .18em; text-transform: uppercase; opacity: .8; }}
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

	cert_date = getdate(cert_date or today())
	numbers = _assign_numbers([rows[s] for s in schools], cert_date)
	names = [rows[s]["school_label"] for s in schools]
	certs = [(rows[s]["school_label"], numbers[s]) for s in schools]
	pdf = HTML(string=_certificate_html(certs, cert_date)).write_pdf()

	if len(names) == 1:
		filename = f"Mission Partner Certificate - {numbers[schools[0]]} - {names[0]}.pdf"
	else:
		filename = f"Mission Partner Certificates ({len(names)} schools).pdf"
	frappe.local.response.filename = filename.replace("/", "-")
	frappe.local.response.filecontent = pdf
	frappe.local.response.type = "download"
