"""Sync Provident Fund workspace from app JSON into the site."""

import os

import frappe
from frappe.modules.import_file import import_file_by_path


def sync_provident_fund_workspace():
	"""Import/update Provident Fund workspace and clear role restrictions."""
	app_path = frappe.get_app_path("tif_customization")
	json_path = os.path.join(
		app_path,
		"tif_customization",
		"workspace",
		"provident_fund",
		"provident_fund.json",
	)

	import_file_by_path(json_path, force=True)

	if frappe.db.exists("Workspace", "Provident Fund"):
		frappe.db.set_value(
			"Workspace",
			"Provident Fund",
			{"parent_page": "", "public": 1, "is_hidden": 0},
			update_modified=True,
		)
		frappe.db.delete("Has Role", {"parent": "Provident Fund", "parenttype": "Workspace"})

	frappe.clear_cache()
	frappe.db.commit()
	return {"message": "Provident Fund workspace synced", "name": "Provident Fund"}
