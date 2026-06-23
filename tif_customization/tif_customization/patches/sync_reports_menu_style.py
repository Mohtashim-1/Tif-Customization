import json
import os

import frappe

REPORTS_CONTENT = (
	'[{"id":"oABt4p_ANs","type":"custom_block","data":{"custom_block_name":"Reports Menu","col":12}}]'
)


def execute():
	"""Sync Reports Menu custom block styling and remove duplicate workspace header."""
	app_path = frappe.get_app_path("tif_customization")
	block_path = os.path.join(
		app_path,
		"tif_customization",
		"custom_html_block",
		"reports_menu",
		"reports_menu.json",
	)

	with open(block_path) as f:
		data = json.load(f)

	block = frappe.get_doc("Custom HTML Block", "Reports Menu")
	block.html = data.get("html")
	block.style = data.get("style")
	block.script = data.get("script")
	block.save(ignore_permissions=True)

	workspace = frappe.get_doc("Workspace", "Reports")
	workspace.content = REPORTS_CONTENT
	workspace.save(ignore_permissions=True)

	frappe.db.commit()
	frappe.clear_cache()
