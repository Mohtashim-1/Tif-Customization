import frappe
from collections import Counter
from frappe.utils import cstr


def clean(v):
	t = cstr(v or "").strip()
	if not t or t.lower() in ("city", "area", "province", "-", "n/a", "na", "none", "null"):
		return ""
	return t


def ensure_province(name):
	name = clean(name)
	if not name:
		return ""
	if not frappe.db.exists("Province", name):
		frappe.get_doc({"doctype": "Province", "province": name}).insert(ignore_permissions=True)
		print("created province", name)
	return name


def ensure_city(name):
	name = clean(name)
	if not name:
		return ""
	if not frappe.db.exists("City", name):
		frappe.get_doc({"doctype": "City", "city": name}).insert(ignore_permissions=True)
		print("created city", name)
	return name


def ensure_area(name, city=""):
	name = clean(name)
	if not name:
		return ""
	city = clean(city)
	if frappe.db.exists("Area", name):
		if city and not frappe.db.get_value("Area", name, "city"):
			c = ensure_city(city)
			if c:
				frappe.db.set_value("Area", name, "city", c, update_modified=False)
		return name
	c = ensure_city(city) if city else ensure_city("Unknown")
	frappe.get_doc({"doctype": "Area", "area": name, "city": c}).insert(ignore_permissions=True)
	print("created area", name, "city", c)
	return name


def execute():
	officers = frappe.get_all(
		"Field Officer",
		filters={"status": "Active"},
		fields=["name", "name1", "employee", "user", "city", "area", "province"],
	)
	updated = []
	for fo in officers:
		if clean(fo.city) and clean(fo.area) and clean(fo.province):
			continue
		params = {}
		conds = ["fv.docstatus=1"]
		ors = []
		if fo.user:
			ors.append("fv.owner=%(user)s")
			ors.append("fv.visit_by=%(user)s")
			params["user"] = fo.user
		emp_name = None
		if fo.employee:
			emp_name = frappe.db.get_value("Employee", fo.employee, "employee_name")
		if emp_name:
			ors.append("fv.visit_by=%(ename)s")
			params["ename"] = emp_name.strip()
		if fo.name1:
			ors.append("fv.visit_by=%(n1)s")
			params["n1"] = fo.name1
		if not ors:
			continue
		conds.append("(" + " OR ".join(ors) + ")")
		rows = frappe.db.sql(
			f"""
			SELECT
				COALESCE(NULLIF(TRIM(fv.province),''), NULLIF(TRIM(fv.me_province),''), NULLIF(TRIM(fv.training_province),'')) AS province,
				COALESCE(NULLIF(TRIM(fv.city),''), NULLIF(TRIM(fv.me_city),''), NULLIF(TRIM(fv.training_city),''), NULLIF(TRIM(fv.mt_city),'')) AS city,
				COALESCE(NULLIF(TRIM(fv.area),''), NULLIF(TRIM(fv.me_area),'')) AS area
			FROM `tabField Visit` fv
			WHERE {" AND ".join(conds)}
			ORDER BY fv.visit_date DESC
			LIMIT 500
			""",
			params,
			as_dict=True,
		)
		pc, cc, ac = Counter(), Counter(), Counter()
		for r in rows:
			p, c, a = clean(r.province), clean(r.city), clean(r.area)
			if p:
				pc[p] += 1
			if c:
				cc[c] += 1
			if a:
				ac[a] += 1
		top_p = pc.most_common(1)[0][0] if pc else ""
		top_c = cc.most_common(1)[0][0] if cc else ""
		top_a = ac.most_common(1)[0][0] if ac else ""
		changes = {}
		if not clean(fo.province) and top_p:
			changes["province"] = ensure_province(top_p)
		if not clean(fo.city) and top_c:
			changes["city"] = ensure_city(top_c)
		if not clean(fo.area) and top_a:
			city_for_area = changes.get("city") or clean(fo.city) or top_c
			changes["area"] = ensure_area(top_a, city_for_area)
		if changes:
			frappe.db.set_value("Field Officer", fo.name, changes, update_modified=False)
			updated.append((fo.name1 or fo.name, changes))

	frappe.db.commit()
	print("UPDATED", len(updated))
	for u in updated:
		print(u)
	print(
		"Fida",
		frappe.db.get_value(
			"Field Officer", "Fida Hussain", ["city", "area", "province"], as_dict=True
		),
	)
