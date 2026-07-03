"""Update Loan Application workflow: HOD → HR → CEO → Accounts."""

import frappe

NEW_STATES = [
	{"state": "Draft", "doc_status": "0", "allow_edit": "Employee", "idx": 1},
	{"state": "Request For HOD Approval", "doc_status": "0", "allow_edit": "HOD", "idx": 2},
	{"state": "Rejected by HOD", "doc_status": "0", "allow_edit": "Employee", "idx": 3},
	{"state": "Request for HR Approval", "doc_status": "0", "allow_edit": "HR User", "idx": 4},
	{"state": "Rejected by HR", "doc_status": "0", "allow_edit": "HR User", "idx": 5},
	{"state": "Request For CEO Approval", "doc_status": "0", "allow_edit": "CEO", "idx": 6},
	{"state": "Rejected By CEO", "doc_status": "0", "allow_edit": "CEO", "idx": 7},
	{"state": "Request For Accounts Approval", "doc_status": "0", "allow_edit": "CFO", "idx": 8},
	{"state": "Rejected by Accounts", "doc_status": "0", "allow_edit": "CFO", "idx": 9},
	{"state": "Approved", "doc_status": "1", "allow_edit": "CFO", "idx": 10},
]

NEW_TRANSITIONS = [
	{"state": "Draft", "action": "Submit", "next_state": "Request For HOD Approval", "allowed": "Employee", "idx": 1},
	{
		"state": "Request For HOD Approval",
		"action": "Approve",
		"next_state": "Request for HR Approval",
		"allowed": "HOD",
		"idx": 2,
	},
	{
		"state": "Request For HOD Approval",
		"action": "Reject",
		"next_state": "Rejected by HOD",
		"allowed": "HOD",
		"idx": 3,
	},
	{
		"state": "Request for HR Approval",
		"action": "Approve",
		"next_state": "Request For CEO Approval",
		"allowed": "HR User",
		"idx": 4,
	},
	{
		"state": "Request for HR Approval",
		"action": "Approve",
		"next_state": "Request For CEO Approval",
		"allowed": "HR Manager",
		"idx": 5,
	},
	{
		"state": "Request for HR Approval",
		"action": "Reject",
		"next_state": "Rejected by HR",
		"allowed": "HR Manager",
		"idx": 6,
	},
	{
		"state": "Request For CEO Approval",
		"action": "Approve",
		"next_state": "Request For Accounts Approval",
		"allowed": "CEO",
		"idx": 7,
	},
	{
		"state": "Request For CEO Approval",
		"action": "Reject",
		"next_state": "Rejected By CEO",
		"allowed": "CEO",
		"idx": 8,
	},
	{
		"state": "Request For Accounts Approval",
		"action": "Approve",
		"next_state": "Approved",
		"allowed": "CFO",
		"idx": 9,
	},
	{
		"state": "Request For Accounts Approval",
		"action": "Reject",
		"next_state": "Rejected by Accounts",
		"allowed": "CFO",
		"idx": 10,
	},
]

LEGACY_STATE_MAP = {
	"Approved by HOD": "Request for HR Approval",
	"Request for COO Approval": "Request for HR Approval",
	"Approved by COO": "Request For CEO Approval",
	"Rejected by COO": "Rejected By CEO",
	"Approved By CEO": "Approved",
}


def execute():
	if not frappe.db.exists("Workflow", "Loan Application"):
		return

	for row in NEW_STATES:
		if not frappe.db.exists("Workflow State", row["state"]):
			frappe.get_doc({"doctype": "Workflow State", "workflow_state_name": row["state"]}).insert(
				ignore_permissions=True
			)

	workflow = frappe.get_doc("Workflow", "Loan Application")
	workflow.states = []
	for row in NEW_STATES:
		workflow.append("states", row)

	workflow.transitions = []
	for row in NEW_TRANSITIONS:
		workflow.append("transitions", row)

	workflow.save(ignore_permissions=True)

	for old_state, new_state in LEGACY_STATE_MAP.items():
		frappe.db.sql(
			"""
			UPDATE `tabLoan Application`
			SET workflow_state = %s
			WHERE workflow_state = %s AND docstatus < 2
			""",
			(new_state, old_state),
		)

	frappe.db.commit()
	frappe.clear_cache(doctype="Loan Application")
