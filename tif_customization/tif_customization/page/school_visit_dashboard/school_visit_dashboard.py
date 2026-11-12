import frappe
from frappe import _
from frappe.utils import cstr

from tif_customization.tif_customization.api.school_dataset import fetch_schools

# Same audience as SME Summary report; data is still limited by team scope + SME roster
PAGE_ROLES = (
	"System Manager",
	"School Approval",
	"HR Manager",
	"HR User",
	"Field Staff Manager",
	"HOD",
	"COO",
	"SME User",
	"SME Manager",
	"Field Staff",
	"Supervisor Field Staff",
	"Staff Reporting Manager",
)


def _check_access():
	if frappe.session.user == "Administrator":
		return
	if not set(frappe.get_roles()) & set(PAGE_ROLES):
		frappe.throw(_("Not permitted to view the School Dashboard."), frappe.PermissionError)


@frappe.whitelist()
def get_dashboard(from_date=None, to_date=None, search=None, province=None, city=None, bucket=None, model=None):
	_check_access()
	rows = fetch_schools(from_date=from_date, to_date=to_date)

	def count(key, value):
		return sum(1 for r in rows if r[key] == value)

	summary = {
		"total": len(rows),
		"active": count("bucket", "Active"),
		"active_new": count("bucket", "Active New"),
		"model_0": count("bucket", "Model 0"),
		"model_a": count("model", "A"),
		"model_b": count("model", "B"),
		"model_c": count("model", "C"),
		"visits": sum(r["visits"] for r in rows),
	}

	search = cstr(search).strip().lower()
	province = cstr(province).strip()
	city = cstr(city).strip().lower()
	bucket = cstr(bucket).strip()
	model = cstr(model).strip()

	def keep(r):
		if province and r["province"] != province:
			return False
		if city and city not in r["city"].lower():
			return False
		if bucket and r["bucket"] != bucket:
			return False
		if model and r["model"] != model:
			return False
		if search and search not in r["school_label"].lower() and search not in r["school"]:
			return False
		return True

	filtered = sorted((r for r in rows if keep(r)), key=lambda r: r["school_label"].lower())
	by_province = {}
	for r in filtered:
		p = by_province.setdefault(r["province"] or "—", {"province": r["province"] or "—", "total": 0, "active": 0, "active_new": 0, "model_0": 0})
		p["total"] += 1
		p[{"Active": "active", "Active New": "active_new"}.get(r["bucket"], "model_0")] += 1

	return {
		"summary": summary,
		"rows": filtered,
		"by_province": sorted(by_province.values(), key=lambda p: -p["total"]),
		"provinces": sorted({r["province"] for r in rows if r["province"]}),
	}
