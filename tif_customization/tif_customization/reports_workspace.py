import json

import frappe


CARD_ORDER = ["Supply Chain", "HR", "Accounts", "Purchase", "QPS"]


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

	order = _get_card_order(workspace) or CARD_ORDER
	result = []
	seen = set()

	for title in order:
		if title in sections:
			result.append(sections[title])
			seen.add(title)

	for title, section in sections.items():
		if title not in seen:
			result.append(section)

	return result


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
