import json
import os

import frappe


def execute():
	"""Restore Reports workspace links and custom HTML block layout."""
	app_path = frappe.get_app_path("tif_customization")
	json_path = os.path.join(
		app_path,
		"tif_customization",
		"workspace",
		"reports",
		"reports.json",
	)

	if not os.path.exists(json_path):
		return

	with open(json_path) as f:
		data = json.load(f)

	if not frappe.db.exists("Workspace", "Reports"):
		return

	doc = frappe.get_doc("Workspace", "Reports")
	doc.content = data.get("content") or doc.content
	doc.custom_blocks = []
	for row in data.get("custom_blocks") or []:
		doc.append(
			"custom_blocks",
			{
				"custom_block_name": row.get("custom_block_name"),
				"label": row.get("label") or row.get("custom_block_name"),
			},
		)

	doc.links = []
	for row in data.get("links") or []:
		if row.get("type") == "Card Break":
			row.pop("link_type", None)
			row.pop("link_to", None)
			row.pop("is_query_report", None)
			row.pop("report_ref_doctype", None)
		doc.append("links", row)

	for link in doc.links:
		if link.type == "Card Break":
			link.link_type = None
			link.link_to = None
			link.is_query_report = 0

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
