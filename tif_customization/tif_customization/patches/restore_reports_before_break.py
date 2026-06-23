import json

import frappe


WORKSPACE = "Reports"


def execute(version_name=None):
	"""Restore Reports workspace to state before accidental bulk delete."""
	version_name = version_name or _latest_bulk_delete_version()
	links = _build_links_from_version(version_name)
	if not links:
		frappe.throw(f"Could not rebuild links from Version {version_name}")

	doc = frappe.get_doc("Workspace", WORKSPACE)
	doc.content = (
		'[{"id":"oABt4p_ANs","type":"custom_block","data":{"custom_block_name":"Reports Menu","col":12}}]'
	)
	doc.custom_blocks = []
	doc.append(
		"custom_blocks",
		{"custom_block_name": "Reports Menu", "label": "Reports Menu"},
	)

	doc.links = []
	for row in links:
		doc.append("links", row)

	doc.save(ignore_permissions=True)
	frappe.db.sql(
		"""
		UPDATE `tabWorkspace Link`
		SET link_type = NULL, link_to = NULL, is_query_report = 0
		WHERE parent = %s AND type = 'Card Break'
		""",
		(doc.name,),
	)
	frappe.db.commit()
	frappe.clear_cache(doctype="Workspace")
	return {"restored_links": len(links), "version": version_name}


def _latest_bulk_delete_version():
	rows = frappe.get_all(
		"Version",
		filters={"ref_doctype": "Workspace", "docname": WORKSPACE},
		fields=["name", "data", "creation"],
		order_by="creation desc",
		limit=20,
	)
	for row in rows:
		try:
			diff = json.loads(row.data or "{}")
		except json.JSONDecodeError:
			continue
		removed_links = [item for item in diff.get("removed", []) if item[0] == "links"]
		if len(removed_links) >= 10:
			return row.name
	frappe.throw("No bulk-delete version found for Reports workspace")


def _build_links_from_version(version_name):
	version = frappe.get_doc("Version", version_name)
	diff = json.loads(version.data or "{}")

	removed = [_clean_link_row(item[1]) for item in diff.get("removed", []) if item[0] == "links"]
	removed_names = {item[1].get("name") for item in diff.get("removed", []) if item[0] == "links"}

	links = {}
	for row in frappe.get_all(
		"Version",
		filters={"ref_doctype": "Workspace", "docname": WORKSPACE},
		fields=["name", "data", "creation"],
		order_by="creation asc",
	):
		if row.name == version_name:
			break
		try:
			data = json.loads(row.data or "{}")
		except json.JSONDecodeError:
			continue
		for _, link in data.get("removed", []):
			if _ == "links" and link.get("name"):
				links.pop(link["name"], None)
		for _, link in data.get("added", []):
			if _ == "links" and link.get("name"):
				links[link["name"]] = link

	stayed = [_clean_link_row(row) for name, row in links.items() if name not in removed_names]
	all_links = sorted(removed + stayed, key=lambda r: int(r.get("idx") or 0))
	for idx, row in enumerate(all_links, start=1):
		row["idx"] = idx
		row.pop("name", None)
	return all_links


def _clean_link_row(row):
	keep = (
		"type",
		"label",
		"link_type",
		"link_to",
		"is_query_report",
		"hidden",
		"onboard",
		"link_count",
		"idx",
		"name",
	)
	out = {field: row.get(field) for field in keep if field in row}
	if out.get("type") == "Card Break":
		out["link_type"] = None
		out["link_to"] = None
		out["is_query_report"] = 0
	return out
