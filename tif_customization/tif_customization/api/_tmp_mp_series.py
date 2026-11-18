def run():
	import re
	import frappe

	print("autoname", frappe.get_meta("Mission Partner Certificate").autoname)

	all_s = frappe.db.sql(
		"SELECT name, current FROM tabSeries WHERE name LIKE %s",
		("%TIF-MP%",),
		as_dict=True,
	)
	print("series", all_s)

	rows = frappe.get_all(
		"Mission Partner Certificate",
		fields=["name", "school_name"],
		order_by="creation asc",
		limit_page_length=2000,
	)
	print("certs", len(rows), [r.name for r in rows[:10]])

	pat = re.compile(r"^SR TIF-MP(\d+)$")
	renamed = 0
	for r in rows:
		m = pat.match(r.name or "")
		if not m:
			continue
		num = int(m.group(1))
		new_name = f"SR TIF-MP{num:05d}"
		if new_name == r.name:
			continue
		if frappe.db.exists("Mission Partner Certificate", new_name):
			print("skip exists", new_name)
			continue
		frappe.rename_doc("Mission Partner Certificate", r.name, new_name, force=True, merge=False)
		renamed += 1
		print("renamed", r.name, "->", new_name)

	max_n = 0
	for name in frappe.get_all("Mission Partner Certificate", pluck="name"):
		m = pat.match(name)
		if m:
			max_n = max(max_n, int(m.group(1)))

	# Frappe series key for "SR TIF-MP.#####" is "SR TIF-MP."
	key = "SR TIF-MP."
	frappe.db.sql("DELETE FROM tabSeries WHERE name=%s", (key,))
	if max_n:
		frappe.db.sql("INSERT INTO tabSeries (name, current) VALUES (%s, %s)", (key, max_n))
	frappe.db.commit()

	print("renamed_count", renamed, "series_current", max_n)
	print("sample", frappe.get_all("Mission Partner Certificate", pluck="name", limit_page_length=5))
