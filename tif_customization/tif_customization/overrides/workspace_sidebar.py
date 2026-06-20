"""Hide selected workspaces from sidebar per user without changing roles."""

import frappe
from frappe.desk.desktop import get_workspace_sidebar_items as _get_workspace_sidebar_items


@frappe.whitelist()
def get_workspace_sidebar_items():
	result = _get_workspace_sidebar_items()
	hidden = get_hidden_workspaces_for_user(frappe.session.user)
	if not hidden:
		return result

	result["pages"] = [
		page
		for page in result.get("pages", [])
		if page.get("name") not in hidden and page.get("title") not in hidden
	]
	return result


def boot_session(bootinfo):
	"""Drop hidden default workspace so login/home route does not crash."""
	hidden = get_hidden_workspaces_for_user(frappe.session.user)
	if not hidden:
		return

	default_ws = bootinfo.user.get("default_workspace")
	if not default_ws:
		return

	title = default_ws.get("title") or default_ws.get("name")
	if title in hidden or default_ws.get("name") in hidden:
		bootinfo.user["default_workspace"] = None


def get_hidden_workspaces_for_user(user):
	if user in ("Administrator", "Guest"):
		return set()

	if not frappe.db.has_column("User", "hidden_workspaces"):
		return set()

	value = frappe.db.get_value("User", user, "hidden_workspaces") or ""
	return {name.strip() for name in value.split(",") if name.strip()}
