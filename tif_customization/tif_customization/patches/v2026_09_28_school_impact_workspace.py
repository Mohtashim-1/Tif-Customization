import frappe
from frappe.modules.import_file import import_file_by_path


SME_LINKS = (
	{
		"label": "School Impact",
		"link_to": "school-impact",
		"link_type": "Page",
	},
	{
		"label": "Feedback Studio",
		"link_to": "feedback-studio",
		"link_type": "Page",
	},
)

IGNORE = {
	"name",
	"parent",
	"parenttype",
	"parentfield",
	"doctype",
	"creation",
	"modified",
	"owner",
	"modified_by",
	"docstatus",
	"idx",
}


def execute():
	"""Add the School Impact page and put it with Feedback Studio on the Reports SME card."""
	page_path = frappe.get_app_path(
		"tif_customization",
		"tif_customization",
		"page",
		"school_impact",
		"school_impact.json",
	)
	import_file_by_path(page_path, force=True, ignore_version=True)

	if not frappe.db.exists("Workspace", "Reports"):
		return

	doc = frappe.get_doc("Workspace", "Reports")
	existing = {(link.label or "").strip().lower() for link in doc.links if link.type == "Link"}
	pending = [row for row in SME_LINKS if row["label"].strip().lower() not in existing]
	if not pending:
		frappe.clear_cache(doctype="Page")
		return

	rebuilt = []
	card = ""
	placed = False
	for link in doc.links:
		if link.type == "Card Break":
			label = (link.label or "").strip().lower()
			if card == "sme" and label != "sme" and not placed:
				rebuilt.extend(_link_rows(pending))
				placed = True
			card = label
		row = {key: value for key, value in link.as_dict().items() if key not in IGNORE}
		if row.get("type") == "Card Break":
			row["link_type"] = None
			row["link_to"] = None
			row["is_query_report"] = 0
		rebuilt.append(row)

	if card == "sme" and not placed:
		rebuilt.extend(_link_rows(pending))
		placed = True

	if not placed:
		return

	doc.links = []
	for row in rebuilt:
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
	frappe.clear_cache(doctype="Workspace")
	frappe.clear_cache(doctype="Page")


def _link_rows(pending):
	return [
		{
			"type": "Link",
			"label": row["label"],
			"link_type": row["link_type"],
			"link_to": row["link_to"],
			"is_query_report": 0,
			"hidden": 0,
			"onboard": 0,
			"link_count": 0,
		}
		for row in pending
	]
