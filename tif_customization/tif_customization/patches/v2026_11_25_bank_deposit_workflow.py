"""Create Bank Deposit workflow: Draft → Pending COO Approval → Approved → Submitted."""

import frappe


WORKFLOW_NAME = "Bank Deposit"

STATES = [
	{
		"state": "Draft",
		"doc_status": "0",
		"allow_edit": "Accounts User",
		"update_field": "status",
		"update_value": "Draft",
		"is_optional_state": 0,
		"idx": 1,
	},
	{
		"state": "Pending COO Approval",
		"doc_status": "0",
		"allow_edit": "COO",
		"update_field": "status",
		"update_value": "Pending COO Approval",
		"is_optional_state": 0,
		"idx": 2,
	},
	{
		"state": "Approved",
		"doc_status": "0",
		"allow_edit": "Accounts User",
		"update_field": "status",
		"update_value": "Approved",
		"is_optional_state": 0,
		"idx": 3,
	},
	{
		"state": "Rejected",
		"doc_status": "0",
		"allow_edit": "Accounts User",
		"update_field": "status",
		"update_value": "Rejected",
		"is_optional_state": 0,
		"idx": 4,
	},
	{
		"state": "Submitted",
		"doc_status": "1",
		"allow_edit": "System Manager",
		"update_field": "status",
		"update_value": "Submitted",
		"is_optional_state": 0,
		"idx": 5,
	},
]

# Roles that can send for COO approval / withdraw / final submit
ACCOUNTS_ROLES = ("Accounts Manager", "Accounts User", "System Manager")
COO_ROLES = ("COO", "System Manager")

TRANSITIONS = []
idx = 1
for role in ACCOUNTS_ROLES:
	TRANSITIONS.append(
		{
			"state": "Draft",
			"action": "Submit for COO Approval",
			"next_state": "Pending COO Approval",
			"allowed": role,
			"allow_self_approval": 1,
			"idx": idx,
		}
	)
	idx += 1
	TRANSITIONS.append(
		{
			"state": "Rejected",
			"action": "Submit for COO Approval",
			"next_state": "Pending COO Approval",
			"allowed": role,
			"allow_self_approval": 1,
			"idx": idx,
		}
	)
	idx += 1
	TRANSITIONS.append(
		{
			"state": "Pending COO Approval",
			"action": "Withdraw",
			"next_state": "Draft",
			"allowed": role,
			"allow_self_approval": 1,
			"idx": idx,
		}
	)
	idx += 1
	TRANSITIONS.append(
		{
			"state": "Approved",
			"action": "Submit",
			"next_state": "Submitted",
			"allowed": role,
			"allow_self_approval": 1,
			"idx": idx,
		}
	)
	idx += 1

for role in COO_ROLES:
	TRANSITIONS.append(
		{
			"state": "Pending COO Approval",
			"action": "Approve",
			"next_state": "Approved",
			"allowed": role,
			"allow_self_approval": 1,
			"idx": idx,
		}
	)
	idx += 1
	TRANSITIONS.append(
		{
			"state": "Pending COO Approval",
			"action": "Reject",
			"next_state": "Rejected",
			"allowed": role,
			"allow_self_approval": 1,
			"idx": idx,
		}
	)
	idx += 1


def _ensure_master(doctype, name_field, name):
	if frappe.db.exists(doctype, name):
		return
	doc = frappe.new_doc(doctype)
	doc.set(name_field, name)
	doc.insert(ignore_permissions=True)


def execute():
	if not frappe.db.exists("DocType", "Bank Deposit"):
		return

	for row in STATES:
		_ensure_master("Workflow State", "workflow_state_name", row["state"])

	for action in ("Submit for COO Approval", "Approve", "Reject", "Withdraw", "Submit"):
		_ensure_master("Workflow Action Master", "workflow_action_name", action)

	for role in set(ACCOUNTS_ROLES + COO_ROLES):
		if not frappe.db.exists("Role", role):
			frappe.get_doc({"doctype": "Role", "role_name": role, "desk_access": 1}).insert(
				ignore_permissions=True
			)

	# Ensure workflow_state field exists on Bank Deposit
	meta = frappe.get_meta("Bank Deposit")
	if not meta.has_field("workflow_state"):
		frappe.get_doc(
			{
				"doctype": "Custom Field",
				"dt": "Bank Deposit",
				"fieldname": "workflow_state",
				"label": "Workflow State",
				"fieldtype": "Link",
				"options": "Workflow State",
				"allow_on_submit": 1,
				"no_copy": 1,
				"hidden": 1,
				"insert_after": "status",
			}
		).insert(ignore_permissions=True)

	if frappe.db.exists("Workflow", WORKFLOW_NAME):
		workflow = frappe.get_doc("Workflow", WORKFLOW_NAME)
	else:
		workflow = frappe.new_doc("Workflow")
		workflow.workflow_name = WORKFLOW_NAME

	workflow.document_type = "Bank Deposit"
	workflow.is_active = 1
	workflow.override_status = 1
	workflow.send_email_alert = 0
	workflow.workflow_state_field = "workflow_state"
	workflow.states = []
	for row in STATES:
		workflow.append("states", row)
	workflow.transitions = []
	for row in TRANSITIONS:
		workflow.append("transitions", row)
	workflow.save(ignore_permissions=True)

	# Backfill draft docs
	frappe.db.sql(
		"""
		UPDATE `tabBank Deposit`
		SET workflow_state = COALESCE(NULLIF(workflow_state, ''), status, 'Draft')
		WHERE docstatus = 0 AND IFNULL(workflow_state, '') = ''
		"""
	)
	frappe.db.sql(
		"""
		UPDATE `tabBank Deposit`
		SET workflow_state = 'Submitted', status = 'Submitted'
		WHERE docstatus = 1 AND IFNULL(workflow_state, '') IN ('', 'Approved', 'Draft')
		"""
	)

	frappe.db.commit()
	frappe.clear_cache(doctype="Bank Deposit")
	frappe.cache().hdel("workflow", "Bank Deposit")
