import json

import frappe


CARD_ORDER = ["HR", "Supply Chain", "Purchase", "Accounts", "Program", "SME", "Book Purchase and Printing"]

# Website routes that are not Frappe Desk Pages (Dynamic Link cannot store these).
PORTAL_LINKS = {
	"Program": [
		{
			"label": "Training Schedule",
			"link_type": "URL",
			"link_to": "/training-schedule",
			"is_query_report": 0,
			"highlight": True,
		}
	],
}


@frappe.whitelist()
def get_reports_workspace_menu():
	"""Return Reports workspace links grouped by card for the custom menu block."""
	workspace = frappe.get_doc("Workspace", "Reports")
	sections = {}
	current = None

	for link in workspace.links:
		if link.hidden:
			continue

		if link.type == "Card Break":
			current = link.label
			sections[current] = {"title": link.label, "links": []}
		elif link.type == "Link" and current:
			sections[current]["links"].append(
				{
					"label": link.label,
					"link_type": link.link_type,
					"link_to": link.link_to,
					"is_query_report": cint(link.is_query_report),
					"highlight": _should_highlight_link(link.label),
				}
			)

	_inject_portal_links(sections)

	order = _get_card_order(workspace) or CARD_ORDER
	result = []
	seen = set()

	for title in order:
		if title in sections:
			section = sections[title]
			section["links"] = _sort_links_by_color(section["links"])
			result.append(section)
			seen.add(title)

	for title, section in sections.items():
		if title not in seen:
			section["links"] = _sort_links_by_color(section["links"])
			result.append(section)

	return result


def _inject_portal_links(sections):
	for title, extras in PORTAL_LINKS.items():
		if title not in sections:
			sections[title] = {"title": title, "links": []}
		existing = {(link.get("label") or "").strip().lower() for link in sections[title]["links"]}
		for extra in extras:
			if (extra.get("label") or "").strip().lower() in existing:
				continue
			sections[title]["links"].insert(0, extra)


def _sort_links_by_color(links):
	"""Live (blue) links first, then UAT/Dev; preserve original workspace order within each group."""
	return sorted(
		links or [],
		key=lambda link: 0 if link.get("highlight") else 1,
	)


def cint(value):
	try:
		return int(value or 0)
	except (TypeError, ValueError):
		return 0


def _should_highlight_link(label):
	"""Blue = live/production links. Skip labels marked (Dev) or (UAT)."""
	label_lower = (label or "").lower()
	if "(uat)" in label_lower or "(dev)" in label_lower:
		return False
	return True


def _get_card_order(workspace):
	try:
		content = json.loads(workspace.content or "[]")
	except (TypeError, json.JSONDecodeError):
		return None

	order = []
	for block in content:
		if block.get("type") == "card":
			card_name = (block.get("data") or {}).get("card_name")
			if card_name:
				order.append(card_name)
	return order or None
