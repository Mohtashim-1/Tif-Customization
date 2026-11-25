"""Add Cancelled workflow state and backfill cancelled Bank Deposits."""

import frappe

from tif_customization.tif_customization.patches.v2026_11_25_bank_deposit_workflow import (
	STATES,
	TRANSITIONS,
	WORKFLOW_NAME,
	_ensure_master,
)


def execute():
	if not frappe.db.exists("DocType", "Bank Deposit"):
		return

	_ensure_master("Workflow State", "workflow_state_name", "Cancelled")

	if not frappe.db.exists("Workflow", WORKFLOW_NAME):
		return

	workflow = frappe.get_doc("Workflow", WORKFLOW_NAME)
	workflow.states = []
	for row in STATES:
		workflow.append("states", row)
	workflow.transitions = []
	for row in TRANSITIONS:
		workflow.append("transitions", row)
	workflow.save(ignore_permissions=True)

	frappe.db.sql(
		"""
		UPDATE `tabBank Deposit`
		SET status = 'Cancelled', workflow_state = 'Cancelled'
		WHERE docstatus = 2
			AND IFNULL(status, '') != 'Cancelled'
		"""
	)

	frappe.db.commit()
	frappe.clear_cache(doctype="Bank Deposit")
	frappe.cache().hdel("workflow", "Bank Deposit")
