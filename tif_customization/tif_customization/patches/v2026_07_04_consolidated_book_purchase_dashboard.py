import json
import os

import frappe


def execute():
	"""Consolidated Book Purchase & Printing dashboard — sync workspace and import page."""
	app_path = frappe.get_app_path("tif_customization")
	json_path = os.path.join(
		app_path,
		"tif_customization",
		"workspace",
		"reports",
		"reports.json",
	)

	page_path = os.path.join(
		app_path,
		"tif_customization",
		"page",
		"book_purchase_printing_dashboard",
		"book_purchase_printing_dashboard.json",
	)
	if os.path.exists(page_path):
		with open(page_path) as f:
			page_data = json.load(f)
		if not frappe.db.exists("Page", page_data.get("name")):
			doc = frappe.get_doc(page_data)
			doc.insert(ignore_permissions=True)
		else:
			page_doc = frappe.get_doc("Page", page_data.get("name"))
			page_doc.title = page_data.get("title")
			page_doc.roles = []
			for role in page_data.get("roles") or []:
				page_doc.append("roles", role)
			page_doc.save(ignore_permissions=True)

	if not os.path.exists(json_path) or not frappe.db.exists("Workspace", "Reports"):
		frappe.db.commit()
		return

	with open(json_path) as f:
		data = json.load(f)

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
