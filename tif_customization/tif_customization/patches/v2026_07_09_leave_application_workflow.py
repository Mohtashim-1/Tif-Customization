"""Leave Application workflow: Employee → Leave Approver → HR (submit)."""

import frappe

WORKFLOW_NAME = "Leave Application"

STATES = [
	{"state": "Draft", "doc_status": "0", "allow_edit": "Employee", "idx": 1},
	{"state": "Request For Leave Approver Approval", "doc_status": "0", "allow_edit": "Leave Approver", "idx": 2},
	{"state": "Rejected by Leave Approver", "doc_status": "0", "allow_edit": "Employee", "idx": 3},
	{"state": "Request for HR Approval", "doc_status": "0", "allow_edit": "HR User", "idx": 4},
	{"state": "Rejected by HR", "doc_status": "0", "allow_edit": "HR User", "idx": 5},
	{"state": "Approved", "doc_status": "1", "allow_edit": "HR Manager", "idx": 6},
]

TRANSITIONS = [
	{
		"state": "Draft",
		"action": "Submit",
		"next_state": "Request For Leave Approver Approval",
		"allowed": "Employee",
		"idx": 1,
	},
	{
		"state": "Request For Leave Approver Approval",
		"action": "Approve",
		"next_state": "Request for HR Approval",
		"allowed": "Leave Approver",
		"idx": 2,
	},
	{
		"state": "Request For Leave Approver Approval",
		"action": "Reject",
		"next_state": "Rejected by Leave Approver",
		"allowed": "Leave Approver",
		"idx": 3,
	},
	{
		"state": "Rejected by Leave Approver",
		"action": "Submit",
		"next_state": "Request For Leave Approver Approval",
		"allowed": "Employee",
		"idx": 4,
	},
	{
		"state": "Request for HR Approval",
		"action": "Approve",
		"next_state": "Approved",
		"allowed": "HR User",
		"update_field": "status",
		"update_value": "Approved",
		"idx": 5,
	},
	{
		"state": "Request for HR Approval",
		"action": "Approve",
		"next_state": "Approved",
		"allowed": "HR Manager",
		"update_field": "status",
		"update_value": "Approved",
		"idx": 6,
	},
	{
		"state": "Request for HR Approval",
		"action": "Reject",
		"next_state": "Rejected by HR",
		"allowed": "HR User",
		"update_field": "status",
		"update_value": "Rejected",
		"idx": 7,
	},
	{
		"state": "Request for HR Approval",
		"action": "Reject",
		"next_state": "Rejected by HR",
		"allowed": "HR Manager",
		"update_field": "status",
		"update_value": "Rejected",
		"idx": 8,
	},
]


def execute():
	_ensure_workflow_state_field()
	_ensure_workflow_states()
	_ensure_workflow()
	_revoke_leave_approver_submit()
	_map_existing_documents()
	frappe.clear_cache(doctype="Leave Application")


def _ensure_workflow_state_field():
	if frappe.db.exists("Custom Field", {"dt": "Leave Application", "fieldname": "workflow_state"}):
		return

	frappe.get_doc(
		{
			"doctype": "Custom Field",
			"dt": "Leave Application",
			"fieldname": "workflow_state",
			"fieldtype": "Link",
			"label": "Workflow State",
			"options": "Workflow State",
			"hidden": 1,
			"no_copy": 1,
			"insert_after": "naming_series",
		}
	).insert(ignore_permissions=True)


def _ensure_workflow_states():
	for row in STATES:
		if frappe.db.exists("Workflow State", row["state"]):
			continue
		frappe.get_doc({"doctype": "Workflow State", "workflow_state_name": row["state"]}).insert(
			ignore_permissions=True
		)


def _ensure_workflow():
	if frappe.db.exists("Workflow", WORKFLOW_NAME):
		workflow = frappe.get_doc("Workflow", WORKFLOW_NAME)
	else:
		workflow = frappe.new_doc("Workflow")
		workflow.workflow_name = WORKFLOW_NAME
		workflow.document_type = "Leave Application"
		workflow.is_active = 1
		workflow.send_email_alert = 0
		workflow.workflow_state_field = "workflow_state"

	workflow.states = []
	for row in STATES:
		workflow.append("states", row)

	workflow.transitions = []
	for row in TRANSITIONS:
		workflow.append("transitions", row)

	workflow.save(ignore_permissions=True)


def _revoke_leave_approver_submit():
	frappe.db.sql(
		"""
		UPDATE `tabDocPerm`
		SET `submit` = 0
		WHERE parent = 'Leave Application' AND role = 'Leave Approver'
		"""
	)
	if frappe.db.exists("Custom DocPerm", {"parent": "Leave Application"}):
		frappe.db.sql(
			"""
			UPDATE `tabCustom DocPerm`
			SET `submit` = 0
			WHERE parent = 'Leave Application' AND role = 'Leave Approver'
			"""
		)
		frappe.db.sql(
			"""
			UPDATE `tabCustom DocPerm`
			SET `submit` = 1
			WHERE parent = 'Leave Application'
			  AND role IN ('HR User', 'HR Manager')
			  AND permlevel = 0
			"""
		)


def _map_existing_documents():
	if not frappe.db.has_column("Leave Application", "workflow_state"):
		return

	frappe.db.sql(
		"""
		UPDATE `tabLeave Application`
		SET workflow_state = 'Approved'
		WHERE docstatus = 1
		  AND COALESCE(workflow_state, '') = ''
		"""
	)
	frappe.db.sql(
		"""
		UPDATE `tabLeave Application`
		SET workflow_state = 'Request for HR Approval'
		WHERE docstatus = 0
		  AND COALESCE(status, '') = 'Approved'
		  AND COALESCE(workflow_state, '') = ''
		"""
	)
	frappe.db.sql(
		"""
		UPDATE `tabLeave Application`
		SET workflow_state = 'Request For Leave Approver Approval'
		WHERE docstatus = 0
		  AND COALESCE(status, '') = 'Open'
		  AND COALESCE(workflow_state, '') = ''
		  AND COALESCE(leave_approver, '') != ''
		"""
	)
	frappe.db.sql(
		"""
		UPDATE `tabLeave Application`
		SET workflow_state = 'Draft'
		WHERE docstatus = 0
		  AND COALESCE(workflow_state, '') = ''
		"""
	)
