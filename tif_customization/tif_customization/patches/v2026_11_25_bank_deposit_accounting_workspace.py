"""Add Bank Deposit link under Accounting → Banking (and Donations workspace)."""

import frappe


def _ensure_workspace_link(workspace_name, label, link_to, link_type="DocType", after_label=None):
	if not frappe.db.exists("Workspace", workspace_name):
		return

	ws = frappe.get_doc("Workspace", workspace_name)
	for row in ws.links:
		if row.type == "Link" and row.link_to == link_to:
			return

	idx = None
	if after_label:
		for row in ws.links:
			if (row.label or "") == after_label:
				idx = row.idx + 1
				break

	ws.append(
		"links",
		{
			"type": "Link",
			"label": label,
			"link_type": link_type,
			"link_to": link_to,
			"onboard": 0,
			"idx": idx or (len(ws.links) + 1),
		},
	)

	# Keep link order: insert after target label when possible
	if idx:
		ordered = []
		inserted = False
		for row in ws.links:
			# newly appended row is last; skip until insert point
			if row.link_to == link_to and row is ws.links[-1]:
				continue
			ordered.append(row)
			if not inserted and (row.label or "") == after_label:
				ordered.append(ws.links[-1])
				inserted = True
		if not inserted:
			ordered.append(ws.links[-1])
		ws.links = []
		for i, row in enumerate(ordered, start=1):
			row.idx = i
			ws.append(
				"links",
				{
					"type": row.type,
					"label": row.label,
					"link_type": row.link_type,
					"link_to": row.link_to,
					"onboard": row.onboard,
					"dependencies": row.dependencies,
					"only_for": row.only_for,
					"icon": row.icon,
					"description": row.description,
				},
			)

	ws.flags.ignore_links = True
	ws.flags.ignore_validate = True
	ws.save(ignore_permissions=True)


def execute():
	_ensure_workspace_link(
		"Accounting",
		label="Bank Deposit",
		link_to="Bank Deposit",
		after_label="Bank Account",
	)
	_ensure_workspace_link(
		"Donations",
		label="Bank Deposit",
		link_to="Bank Deposit",
		after_label="Donation",
	)
	_ensure_workspace_link(
		"Accounts Addon",
		label="Bank Deposit",
		link_to="Bank Deposit",
		after_label="Cash Expense",
	)

	frappe.db.commit()
	frappe.clear_cache()
