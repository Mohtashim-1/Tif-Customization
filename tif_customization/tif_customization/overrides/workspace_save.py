import frappe
from frappe import _
from frappe.desk.desktop import new_widget
from frappe.desk.doctype.workspace.workspace import save_page as _original_save_page

REPORTS_WORKSPACE = "Reports"


@frappe.whitelist()
def save_page(title, public, new_widgets, blocks):
	"""Keep Reports workspace links when saving from the visual editor."""
	public = frappe.parse_json(public)
	filters = {"public": public, "label": title}
	if not public:
		filters = {"for_user": frappe.session.user, "label": f"{title}-{frappe.session.user}"}

	pages = frappe.get_all("Workspace", filters=filters, pluck="name")
	if not pages:
		return _original_save_page(title, public, new_widgets, blocks)

	if pages[0] != REPORTS_WORKSPACE:
		return _original_save_page(title, public, new_widgets, blocks)

	return _save_reports_page(pages[0], title, public, new_widgets, blocks)


def _save_reports_page(workspace_name, title, public, new_widgets, blocks):
	doc = frappe.get_doc("Workspace", workspace_name)
	links_backup = [_link_row_for_restore(link.as_dict()) for link in doc.links]

	doc.content = blocks
	_sync_custom_blocks(doc, new_widgets)

	doc.links = []
	for row in links_backup:
		doc.append("links", row)

	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return {"name": title, "public": public, "label": doc.label}


def _sync_custom_blocks(doc, new_widgets):
	widgets = frappe.parse_json(new_widgets) if new_widgets else {}
	custom_blocks = widgets.get("custom_block") if widgets else None
	if not custom_blocks:
		return

	doc.custom_blocks = []
	doc.custom_blocks.extend(
		new_widget(custom_blocks, "Workspace Custom Block", "custom_blocks")
	)


def _link_row_for_restore(row):
	ignore = {
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
	return {key: value for key, value in row.items() if key not in ignore}
