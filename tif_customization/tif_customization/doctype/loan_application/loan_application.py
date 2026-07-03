import frappe
from frappe import _
from frappe.utils import add_days, flt, getdate, nowdate

from hrms.hr.doctype.leave_application.leave_application import (
	get_leave_details as hrms_get_leave_details,
)
from lending.loan_management.doctype.loan_application.loan_application import create_loan
from lending.loan_management.doctype.loan_repayment.loan_repayment import (
	get_pending_principal_amount,
)
from tif_customization.tif_customization.doctype.leave_application.leave_application import (
	get_leave_details as custom_get_leave_details,
)

APPROVED_WORKFLOW_STATES = frozenset({"Approved", "Approved By CEO", "Approved by Accounts"})
REJECTED_WORKFLOW_STATES = frozenset(
	{
		"Rejected by HOD",
		"Rejected by HR",
		"Rejected by COO",
		"Rejected By CEO",
		"Rejected by Accounts",
	}
)

# Only these users are assigned at each workflow step (not every user with the role).
LOAN_HR_ASSIGNEES = frozenset(
	{
		"anas.khan@tif.edu.pk",
		"shahid.khan@tif.edu.pk",
	}
)
LOAN_CEO_ASSIGNEES = frozenset(
	{
		"arif@tif.edu.pk",
	}
)
LOAN_ACCOUNTS_ASSIGNEES = frozenset(
	{
		"muhammad.raza@tif.edu.pk",
		"irfan@tif.edu.pk",
	}
)

# Maps workflow_state → assignment stage (only current-step users get ToDos).
WORKFLOW_ASSIGNMENT_STAGE = {
	"Request For HOD Approval": "hod",
	"Request for HR Approval": "hr",
	"Request For HR Approval": "hr",
	"Approved by HOD": "hr",
	"Request for COO Approval": "hr",
	"Request For CEO Approval": "ceo",
	"Approved by COO": "ceo",
	"Request For Accounts Approval": "accounts",
	"Approved By CEO": "accounts",
}

_NORMALIZED_ASSIGNMENT_STAGE = {
	state.strip().lower(): stage for state, stage in WORKFLOW_ASSIGNMENT_STAGE.items()
}


def on_loan_application_submit(doc, method=None):
	"""After final workflow approval, mark application approved and create the Loan."""
	if doc.workflow_state not in APPROVED_WORKFLOW_STATES:
		return

	if doc.status != "Approved":
		frappe.db.set_value("Loan Application", doc.name, "status", "Approved", update_modified=False)

	create_loan_from_application(doc.name)


def sync_loan_application_todo(doc, method=None):
	"""Add assignees for the current workflow step without removing earlier assignees."""
	debug = _sync_loan_application_todo(doc)
	if frappe.flags.loan_assignment_debug:
		return debug


def _sync_loan_application_todo(doc):
	debug = _build_assignment_debug(doc)

	if getattr(doc, "status", None) == "Rejected" or doc.docstatus == 2:
		_close_all_todos(doc.doctype, doc.name)
		debug["action"] = "closed_all_cancelled"
		_log_assignment_debug(doc, debug)
		return debug

	if (doc.workflow_state or "") in REJECTED_WORKFLOW_STATES:
		debug["action"] = "skipped_rejected_state_keep_assignments"
		_log_assignment_debug(doc, debug)
		return debug

	if doc.docstatus == 1:
		debug["action"] = "skipped_approved_keep_assignments"
		_log_assignment_debug(doc, debug)
		return debug

	assignees = _get_loan_application_assignees(doc)
	debug["resolved_assignees"] = sorted(assignees)

	if not assignees:
		debug["action"] = "no_assignees_for_state"
		_log_assignment_debug(doc, debug)
		return debug

	from frappe.desk.form.assign_to import add as add_assignment

	description = f"Loan Application {doc.name} requires your action ({doc.workflow_state})."
	created = []
	skipped = []
	for user in assignees:
		if frappe.get_all(
			"ToDo",
			filters={
				"reference_type": doc.doctype,
				"reference_name": doc.name,
				"allocated_to": user,
				"status": "Open",
			},
			limit=1,
		):
			skipped.append(user)
			continue

		add_assignment(
			{
				"assign_to": [user],
				"doctype": doc.doctype,
				"name": doc.name,
				"description": description,
				"priority": "High",
			},
			ignore_permissions=True,
		)
		created.append(user)

	debug["action"] = "assigned"
	debug["created_assignments"] = created
	debug["skipped_existing"] = skipped
	debug["open_todos_after"] = _get_open_todo_users(doc.doctype, doc.name)
	_log_assignment_debug(doc, debug)
	return debug


@frappe.whitelist()
def get_loan_application_sidebar_assignments(loan_application_name):
	"""Return open assignments for the form sidebar."""
	from frappe.desk.form.load import get_assignments

	return get_assignments("Loan Application", loan_application_name)


@frappe.whitelist()
def debug_loan_application_assignment(loan_application_name, resync=0):
	"""Return assignment diagnostics and optionally re-run sync (for browser console debugging)."""
	doc = frappe.get_doc("Loan Application", loan_application_name)
	resync = frappe.parse_json(resync) if isinstance(resync, str) else resync
	debug = _build_assignment_debug(doc)
	debug["open_todos_before"] = _get_open_todo_users(doc.doctype, doc.name)

	if resync:
		frappe.flags.loan_assignment_debug = True
		sync_result = _sync_loan_application_todo(doc)
		debug["sync_result"] = sync_result
		frappe.db.commit()

	debug["open_todos_after"] = _get_open_todo_users(doc.doctype, doc.name)
	return debug


def _get_assignment_stage(workflow_state):
	return _NORMALIZED_ASSIGNMENT_STAGE.get((workflow_state or "").strip().lower())


def _build_assignment_debug(doc):
	employee = _resolve_employee(doc.applicant_type, doc.applicant)
	reports_to = frappe.db.get_value("Employee", employee, "reports_to") if employee else None
	hod_user = None
	if reports_to:
		hod_user = frappe.db.get_value("Employee", reports_to, "user_id")

	stage = _get_assignment_stage(doc.workflow_state)
	return {
		"loan_application": doc.name,
		"workflow_state": doc.workflow_state,
		"docstatus": doc.docstatus,
		"status": doc.status,
		"applicant": doc.applicant,
		"employee": employee,
		"reports_to": reports_to,
		"hod_user": hod_user,
		"assignment_stage": stage,
		"stage_mapped": bool(stage),
	}


def _get_open_todo_users(doctype, name):
	return frappe.get_all(
		"ToDo",
		filters={"reference_type": doctype, "reference_name": name, "status": "Open"},
		pluck="allocated_to",
	)


def _log_assignment_debug(doc, debug):
	frappe.logger("loan_application_assignment").info(
		"Loan Application assignment sync for {name}: {debug}".format(
			name=doc.name, debug=frappe.as_json(debug)
		)
	)


def _get_loan_application_assignees(doc):
	stage = _get_assignment_stage(doc.workflow_state)
	if not stage:
		return set()

	employee = _resolve_employee(doc.applicant_type, doc.applicant)

	if stage == "hod":
		return _get_employee_hod_users(employee)
	if stage == "hr":
		return _filter_valid_users(LOAN_HR_ASSIGNEES)
	if stage == "ceo":
		return _filter_valid_users(LOAN_CEO_ASSIGNEES)
	if stage == "accounts":
		return _filter_valid_users(LOAN_ACCOUNTS_ASSIGNEES)
	if stage == "coo":
		return _filter_valid_users(LOAN_CEO_ASSIGNEES)

	return set()


def _filter_valid_users(users):
	return {
		user
		for user in users
		if user and frappe.db.get_value("User", user, "enabled")
	}


def _get_employee_hod_users(employee):
	if not employee:
		return set()

	reports_to = frappe.db.get_value("Employee", employee, "reports_to")
	if not reports_to:
		return set()

	user = frappe.db.get_value("Employee", reports_to, "user_id")
	if not user or not frappe.db.get_value("User", user, "enabled"):
		return set()

	return {user}


def _close_all_todos(doctype: str, name: str):
	if not name:
		return

	from frappe.desk.form.assign_to import close_all_assignments

	close_all_assignments(doctype, name, ignore_permissions=True)


@frappe.whitelist()
def create_loan_from_application(loan_application_name, submit=True):
	existing_loan = frappe.db.get_value(
		"Loan",
		{"loan_application": loan_application_name, "docstatus": ["<", 2]},
		"name",
	)
	if existing_loan:
		return existing_loan

	application = frappe.get_doc("Loan Application", loan_application_name)
	if (
		application.workflow_state in APPROVED_WORKFLOW_STATES
		and application.status != "Approved"
	):
		frappe.db.set_value(
			"Loan Application", loan_application_name, "status", "Approved", update_modified=False
		)

	loan = create_loan(loan_application_name, submit=0)

	if loan.is_term_loan and not loan.repayment_start_date:
		loan.repayment_start_date = _get_repayment_start_date(application)

	loan.insert()
	if submit:
		loan.submit()

	frappe.msgprint(
		_("Loan {0} created from Loan Application {1}.").format(
			frappe.bold(loan.name), frappe.bold(loan_application_name)
		),
		alert=True,
	)
	return loan.name

def _get_repayment_start_date(application):
	if application.applicant_type == "Employee" and application.applicant:
		relieving_date = frappe.db.get_value("Employee", application.applicant, "relieving_date")
		if relieving_date:
			return add_days(getdate(relieving_date), 4)

	reference_date = getdate(application.posting_date or nowdate())
	return add_days(reference_date, 4)


def populate_previous_loan_and_leave_details(doc, method=None):
	"""Populate custom previous loan and leave fields on Loan Application."""
	if doc.doctype != "Loan Application":
		return

	_set_previous_loan_details(doc)
	_set_leave_details(doc)
	_set_current_salary(doc)


def _set_previous_loan_details(doc):
	if not doc.applicant or not doc.applicant_type:
		doc.custom_previous_loan = "No"
		doc.custom_details_of_previous_loan = "Applicant is not selected."
		return

	filters = {
		"applicant_type": doc.applicant_type,
		"applicant": doc.applicant,
		"docstatus": 1,
	}
	if doc.company:
		filters["company"] = doc.company

	loans = frappe.get_all(
		"Loan",
		filters=filters,
		fields=[
			"name",
			"loan_application",
			"loan_product",
			"status",
			"posting_date",
			"loan_amount",
			"total_principal_paid",
			"total_payment",
			"disbursed_amount",
			"total_interest_payable",
			"debit_adjustment_amount",
			"credit_adjustment_amount",
			"written_off_amount",
			"refund_amount",
		],
		order_by="posting_date desc, creation desc",
	)

	# Exclude loan created from the same loan application during edits.
	if doc.name and not str(doc.name).startswith("new-"):
		loans = [loan for loan in loans if loan.get("loan_application") != doc.name]

	if not loans:
		doc.custom_previous_loan = "No"
		doc.custom_details_of_previous_loan = "No previous loan record found."
		return

	lines = []
	total_returned = 0.0
	total_pending = 0.0

	for idx, loan in enumerate(loans, start=1):
		returned_amount = flt(loan.get("total_principal_paid"))
		pending_amount = max(flt(get_pending_principal_amount(frappe._dict(loan))), 0.0)

		total_returned += returned_amount
		total_pending += pending_amount

		lines.append(
			f"{idx}. Loan {loan.get('name')} | Product: {loan.get('loan_product') or '-'} | "
			f"Status: {loan.get('status') or '-'} | Amount: {flt(loan.get('loan_amount')):.2f} | "
			f"Returned: {returned_amount:.2f} | Pending: {pending_amount:.2f}"
		)

	lines.append(
		f"Total Previous Loans: {len(loans)} | Total Returned: {total_returned:.2f} | "
		f"Total Pending: {total_pending:.2f}"
	)

	doc.custom_previous_loan = "Yes"
	doc.custom_details_of_previous_loan = "\n".join(lines)


def _set_leave_details(doc):
	employee = _resolve_employee(doc.applicant_type, doc.applicant)
	if not employee:
		return

	reference_date = doc.posting_date or nowdate()
	leave_allocation = _get_leave_allocation(employee, reference_date)

	if not leave_allocation:
		doc.custom_leaves_availed = "No leave allocation found."
		return

	lines = []
	for leave_type, details in sorted(leave_allocation.items()):
		lines.append(
			f"{leave_type}: Remaining {flt(details.get('remaining_leaves')):.2f}, "
			f"Taken {flt(details.get('leaves_taken')):.2f}, "
			f"Pending Approval {flt(details.get('leaves_pending_approval')):.2f}"
		)

	doc.custom_leaves_availed = "\n".join(lines)


def _resolve_employee(applicant_type, applicant):
	if not applicant:
		return None

	if applicant_type == "Employee":
		return applicant

	# Fallback: some forms may have applicant type mismatched while employee id is selected.
	if str(applicant).startswith("HR-EMP-") and frappe.db.exists("Employee", applicant):
		return applicant

	return None


def _get_leave_allocation(employee, reference_date):
	leave_response = custom_get_leave_details(employee, reference_date) or {}
	leave_allocation = leave_response.get("leave_allocation") or {}
	if leave_allocation:
		return leave_allocation

	# Fallback to stock HRMS API in case override context is not active in this execution path.
	leave_response = hrms_get_leave_details(employee, reference_date) or {}
	return leave_response.get("leave_allocation") or {}


def _set_current_salary(doc):
	employee = _resolve_employee(doc.applicant_type, doc.applicant)
	if not employee:
		return

	reference_date = doc.posting_date or nowdate()
	doc.custom_current_salary = _get_current_salary(employee, doc.company, reference_date)


def _get_current_salary(employee, company=None, reference_date=None):
	reference_date = reference_date or nowdate()
	ssa_filters = {
		"employee": employee,
		"docstatus": 1,
		"from_date": ("<=", reference_date),
	}
	if company:
		ssa_filters["company"] = company

	salary = frappe.db.get_value(
		"Salary Structure Assignment",
		ssa_filters,
		"base",
		order_by="from_date desc, modified desc",
	)
	if salary:
		return flt(salary)

	# Fallback to latest submitted salary slip gross salary.
	slip_filters = {
		"employee": employee,
		"docstatus": 1,
	}
	if company:
		slip_filters["company"] = company

	salary = frappe.db.get_value(
		"Salary Slip",
		slip_filters,
		"base_gross_pay",
		order_by="end_date desc, modified desc",
	)
	return flt(salary) if salary else 0.0


@frappe.whitelist()
def get_loan_applicant_leave_summary(applicant_type, applicant, posting_date=None):
	employee = _resolve_employee(applicant_type, applicant)
	if not employee:
		return {"summary": "", "current_salary": 0.0}

	reference_date = posting_date or nowdate()
	current_salary = _get_current_salary(employee, reference_date=reference_date)
	leave_allocation = _get_leave_allocation(employee, reference_date)
	if not leave_allocation:
		return {"summary": "No leave allocation found.", "current_salary": current_salary}

	lines = []
	for leave_type, details in sorted(leave_allocation.items()):
		lines.append(
			f"{leave_type}: Remaining {flt(details.get('remaining_leaves')):.2f}, "
			f"Taken {flt(details.get('leaves_taken')):.2f}, "
			f"Pending Approval {flt(details.get('leaves_pending_approval')):.2f}"
		)

	return {"summary": "\n".join(lines), "current_salary": current_salary}
