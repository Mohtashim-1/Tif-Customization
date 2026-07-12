"""Restore Leave Application submit for HR and re-activate workflow."""

import frappe


def execute():
	_enable_hr_submit_on_custom_docperm()
	_reactivate_leave_application_workflow()
	frappe.clear_cache(doctype="Leave Application")


def _enable_hr_submit_on_custom_docperm():
	"""Custom DocPerm overrides DocPerm; HR roles must keep submit=1."""
	if not frappe.db.exists("Custom DocPerm", {"parent": "Leave Application"}):
		return

	frappe.db.sql(
		"""
		UPDATE `tabCustom DocPerm`
		SET `submit` = 1
		WHERE parent = 'Leave Application'
		  AND role IN ('HR User', 'HR Manager')
		  AND permlevel = 0
		"""
	)


def _reactivate_leave_application_workflow():
	if not frappe.db.exists("Workflow", "Leave Application"):
		return

	frappe.db.set_value("Workflow", "Leave Application", "is_active", 1, update_modified=False)

	# Ensure HR Manager can also finalize (same as HR User).
	workflow = frappe.get_doc("Workflow", "Leave Application")
	existing = {
		(row.state, row.action, row.next_state, row.allowed)
		for row in workflow.transitions
	}
	needed = [
		{
			"state": "Request for HR Approval",
			"action": "Approve",
			"next_state": "Approved",
			"allowed": "HR Manager",
			"allow_self_approval": 1,
			"update_field": "status",
			"update_value": "Approved",
		},
		{
			"state": "Request for HR Approval",
			"action": "Reject",
			"next_state": "Rejected by HR",
			"allowed": "HR Manager",
			"allow_self_approval": 1,
			"update_field": "status",
			"update_value": "Rejected",
		},
	]
	changed = False
	for row in needed:
		key = (row["state"], row["action"], row["next_state"], row["allowed"])
		if key in existing:
			continue
		workflow.append("transitions", row)
		changed = True

	# Leave Approver role should also be able to act at first stage (not only HOD).
	approver_needed = [
		{
			"state": "Request For Leave Approver Approval",
			"action": "Approve",
			"next_state": "Request for HR Approval",
			"allowed": "Leave Approver",
			"allow_self_approval": 1,
		},
		{
			"state": "Request For Leave Approver Approval",
			"action": "Reject",
			"next_state": "Rejected by Leave Approver",
			"allowed": "Leave Approver",
			"allow_self_approval": 1,
		},
	]
	for row in approver_needed:
		key = (row["state"], row["action"], row["next_state"], row["allowed"])
		if key in existing:
			continue
		workflow.append("transitions", row)
		changed = True

	if changed:
		workflow.save(ignore_permissions=True)
	else:
		frappe.db.commit()
