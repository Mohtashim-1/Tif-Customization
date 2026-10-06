import frappe
from frappe.modules.import_file import import_file_by_path


def execute():
	"""Move Geofencing Report to HR; add School Impact card (Feedback Studio, School Impact)."""
	path = frappe.get_app_path(
		"tif_customization",
		"tif_customization",
		"workspace",
		"reports",
		"reports.json",
	)
	if frappe.db.exists("Workspace", "Reports"):
		import_file_by_path(path, force=True, ignore_version=True)
	frappe.clear_cache(doctype="Workspace")
