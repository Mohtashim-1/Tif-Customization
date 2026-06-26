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

APPROVED_WORKFLOW_STATES = frozenset({"Approved By CEO"})
LOAN_APPLICATION_ASSIGNMENT_ROLES = ("CEO", "COO", "HR User")


def on_loan_application_submit(doc, method=None):
	"""After final workflow approval, mark application approved and create the Loan."""
	if doc.workflow_state not in APPROVED_WORKFLOW_STATES:
		return

	if doc.status != "Approved":
		frappe.db.set_value("Loan Application", doc.name, "status", "Approved", update_modified=False)

	create_loan_from_application(doc.name)


def sync_loan_application_todo(doc, method=None):
	"""Assign Loan Application to applicant approvers, CEO, COO, and HR users."""
	if getattr(doc, "status", None) == "Rejected" or doc.docstatus == 2:
		_close_all_todos(doc.doctype, doc.name)
		return

	assignees = _get_loan_application_assignees(doc)
	_cleanup_other_open_todos(doc.doctype, doc.name, keep_users=assignees)

	if not assignees:
		return

	from frappe.desk.form.assign_to import add as add_assignment

	description = f"Loan Application {doc.name} has been assigned to you."
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


def _get_loan_application_assignees(doc):
	assignees = set()
	employee = _resolve_employee(doc.applicant_type, doc.applicant)

	if employee:
		assignees.update(_get_employee_approvers(employee))

	for role in LOAN_APPLICATION_ASSIGNMENT_ROLES:
		assignees.update(_get_enabled_users_with_role(role))

	return {user for user in assignees if user and frappe.db.exists("User", user)}


def _get_employee_approvers(employee):
	approvers = set()
	employee_doc = frappe.get_doc("Employee", employee)

	for fieldname in ("leave_approver", "expense_approver", "shift_request_approver"):
		if employee_doc.get(fieldname):
			approvers.add(employee_doc.get(fieldname))

	if employee_doc.reports_to:
		reports_to_user = frappe.db.get_value("Employee", employee_doc.reports_to, "user_id")
		if reports_to_user:
			approvers.add(reports_to_user)

	if employee_doc.department:
		department = frappe.get_doc("Department", employee_doc.department)
		for table_fieldname in ("leave_approvers", "expense_approvers", "shift_request_approver"):
			for row in department.get(table_fieldname) or []:
				if row.approver:
					approvers.add(row.approver)

	return approvers


def _get_enabled_users_with_role(role):
	users = frappe.get_all(
		"Has Role",
		filters={"role": role, "parenttype": "User"},
		pluck="parent",
	)
	return {
		user
		for user in users
		if frappe.db.get_value("User", user, "enabled")
	}


def _cleanup_other_open_todos(doctype: str, name: str, keep_users: set[str] | None):
	if not name:
		return

	open_todos = frappe.get_all(
		"ToDo",
		filters={
			"reference_type": doctype,
			"reference_name": name,
			"status": "Open",
		},
		fields=["name", "allocated_to"],
	)

	keep_users = keep_users or set()
	for todo in open_todos:
		if todo.allocated_to not in keep_users:
			frappe.db.set_value("ToDo", todo.name, "status", "Cancelled", update_modified=False)


def _close_all_todos(doctype: str, name: str):
	if not name:
		return

	frappe.db.sql(
		"""
		UPDATE `tabToDo`
		SET status='Closed'
		WHERE reference_type=%s AND reference_name=%s AND status='Open'
		""",
		(doctype, name),
	)


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
