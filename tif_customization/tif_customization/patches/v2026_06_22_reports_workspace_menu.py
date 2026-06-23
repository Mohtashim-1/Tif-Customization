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
		doc.append("links", row)

	doc.save(ignore_permissions=True)
	frappe.clear_cache(doctype="Workspace")
