import json
import os

import frappe


def execute():
	"""Add Training Schedule portal link handling on the Reports workspace menu."""
	app_path = frappe.get_app_path("tif_customization")
	block_path = os.path.join(
		app_path,
		"tif_customization",
		"custom_html_block",
		"reports_menu",
		"reports_menu.json",
	)
	if os.path.exists(block_path) and frappe.db.exists("Custom HTML Block", "Reports Menu"):
		with open(block_path) as f:
			data = json.load(f)
		block = frappe.get_doc("Custom HTML Block", "Reports Menu")
		if data.get("script"):
			block.script = data["script"]
		if data.get("html"):
			block.html = data["html"]
		if data.get("style"):
			block.style = data["style"]
		block.save(ignore_permissions=True)
		frappe.db.commit()
		frappe.clear_cache()
