# Copyright (c) 2026, mohtashim and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt, now_datetime


COO_APPROVER_USERS = frozenset({"shahid.khan@tif.edu.pk"})
COO_APPROVER_ROLES = frozenset({"COO", "System Manager"})
SUBMIT_FOR_APPROVAL_ROLES = frozenset(
	{
		"System Manager",
		"Accounts Manager",
		"Accounts User",
	}
)


class BankDeposit(Document):
	def before_insert(self):
		if self.amended_from:
			self.journal_entry = None
			self.status = "Draft"
			self.submitted_by = None
			self.submitted_for_approval_on = None
			self.approved_by = None
			self.approved_on = None
			self.rejection_reason = None
			self.approval_remarks = None

	def validate(self):
		self._set_defaults()
		if not self.flags.from_approval_action:
			self._ensure_editable()
		self._validate_donations()
		self._calculate_total()

	def _ensure_editable(self):
		if self.is_new() or self.docstatus != 0:
			return
		prev = self.get_doc_before_save()
		if not prev:
			return
		if prev.status in ("Pending COO Approval", "Approved"):
			frappe.throw(
				_("Bank Deposit is {0}. Withdraw / reject (if pending) or ask COO before editing.").format(
					prev.status
				)
			)

	def before_submit(self):
		if self.status != "Approved":
			frappe.throw(
				_("COO must approve this Bank Deposit before submit. Current status: {0}").format(
					self.status
				)
			)
		if not self.donations:
			frappe.throw(_("Add at least one Donation Slip before submit."))
		if flt(self.total_amount) <= 0:
			frappe.throw(_("Total amount must be greater than zero."))

	def on_submit(self):
		je = self._create_cash_to_bank_jv()
		self.db_set("journal_entry", je.name, update_modified=False)

	def on_cancel(self):
		if not self.journal_entry:
			return
		if not frappe.db.exists("Journal Entry", self.journal_entry):
			return
		je = frappe.get_doc("Journal Entry", self.journal_entry)
		if je.docstatus == 1:
			je.cancel()

	def _set_defaults(self):
		settings = _get_donation_settings()
		if not self.company and settings:
			self.company = settings.company
		if not self.cash_account and settings and settings.cash_account:
			self.cash_account = settings.cash_account
		if not self.bank_account and settings and settings.bank_account:
			self.bank_account = settings.bank_account
		if not self.cost_center:
			if settings and settings.default_cost_center:
				self.cost_center = settings.default_cost_center
			elif self.company:
				self.cost_center = frappe.get_cached_value("Company", self.company, "cost_center")
		if not self.status:
			self.status = "Draft"

	def _validate_donations(self):
		if not self.donations:
			return

		seen = set()
		for row in self.donations:
			if not row.donation:
				frappe.throw(_("Donation Slip is required in row {0}.").format(row.idx))
			if row.donation in seen:
				frappe.throw(_("Donation Slip {0} is listed more than once.").format(row.donation))
			seen.add(row.donation)

			donation = frappe.db.get_value(
				"Donation",
				row.donation,
				["name", "docstatus", "payment_method", "received_amount", "donor_name", "donation_date"],
				as_dict=True,
			)
			if not donation:
				frappe.throw(_("Donation Slip {0} does not exist.").format(row.donation))
			if donation.docstatus != 1:
				frappe.throw(_("Donation Slip {0} must be submitted.").format(row.donation))
			if (donation.payment_method or "").strip().lower() != "cash":
				frappe.throw(
					_("Donation Slip {0} is not Cash (payment method: {1}). Only cash donations can be deposited.").format(
						row.donation, donation.payment_method or _("blank")
					)
				)

			row.donation_date = donation.donation_date
			row.donor_name = donation.donor_name
			row.payment_method = donation.payment_method
			row.amount = flt(donation.received_amount)

			other = _find_existing_deposit_for_donation(row.donation, exclude=self.name)
			if other:
				frappe.throw(
					_("Donation Slip {0} is already included in Bank Deposit {1}.").format(
						row.donation, other
					)
				)

	def _calculate_total(self):
		self.total_amount = sum(flt(row.amount) for row in self.donations or [])

	def _create_cash_to_bank_jv(self):
		if not self.cash_account:
			frappe.throw(_("Cash Account is required."))
		if not self.bank_account:
			frappe.throw(_("Bank Account is required."))
		if self.cash_account == self.bank_account:
			frappe.throw(_("Cash Account and Bank Account must be different."))

		cost_center = self.cost_center or frappe.get_cached_value("Company", self.company, "cost_center")
		amount = flt(self.total_amount)
		remark_parts = [f"Bank Deposit {self.name}"]
		if self.deposit_slip_no:
			remark_parts.append(f"Slip {self.deposit_slip_no}")
		user_remark = " | ".join(remark_parts)
		if self.remarks:
			user_remark = f"{user_remark}: {self.remarks}"

		donation_refs = ", ".join(row.donation for row in self.donations if row.donation)

		je = frappe.get_doc(
			{
				"doctype": "Journal Entry",
				"voucher_type": "Bank Entry",
				"company": self.company,
				"posting_date": self.deposit_date,
				"cheque_no": self.deposit_slip_no or self.name,
				"cheque_date": self.deposit_date,
				"user_remark": user_remark,
				"accounts": [
					{
						"account": self.bank_account,
						"debit_in_account_currency": amount,
						"credit_in_account_currency": 0,
						"cost_center": cost_center,
						"user_remark": f"Deposit of cash donations: {donation_refs}",
					},
					{
						"account": self.cash_account,
						"debit_in_account_currency": 0,
						"credit_in_account_currency": amount,
						"cost_center": cost_center,
						"user_remark": f"Cash deposited to bank via {self.name}",
					},
				],
			}
		)
		je.insert(ignore_permissions=True)
		je.submit()
		return je


def _get_donation_settings():
	if not frappe.db.exists("DocType", "Donation Settings"):
		return None
	try:
		return frappe.get_single("Donation Settings")
	except Exception:
		return None


def _find_existing_deposit_for_donation(donation, exclude=None):
	rows = frappe.db.sql(
		"""
		SELECT bd.name
		FROM `tabBank Deposit Donation` bdd
		INNER JOIN `tabBank Deposit` bd ON bd.name = bdd.parent
		WHERE bdd.donation = %s
			AND bd.docstatus < 2
			AND (%s IS NULL OR bd.name != %s)
		LIMIT 1
		""",
		(donation, exclude, exclude),
	)
	return rows[0][0] if rows else None


def _user_can_submit_for_approval():
	roles = set(frappe.get_roles())
	return bool(roles & SUBMIT_FOR_APPROVAL_ROLES)


def _user_can_approve_coo():
	user = frappe.session.user
	if user in COO_APPROVER_USERS:
		return True
	return bool(set(frappe.get_roles()) & COO_APPROVER_ROLES)


def _notify_coo(doc):
	try:
		recipients = []
		for user in COO_APPROVER_USERS:
			if frappe.db.exists("User", user) and frappe.db.get_value("User", user, "enabled"):
				recipients.append(user)
		if not recipients:
			return
		frappe.sendmail(
			recipients=recipients,
			subject=_("Bank Deposit pending COO approval: {0}").format(doc.name),
			message=_(
				"Bank Deposit <b>{0}</b> (Amount: {1}) has been submitted for COO approval.<br>"
				"Deposit Slip: {2}<br>Deposit Date: {3}"
			).format(
				doc.name,
				frappe.format_value(doc.total_amount, {"fieldtype": "Currency"}),
				doc.deposit_slip_no or "-",
				doc.deposit_date,
			),
			reference_doctype=doc.doctype,
			reference_name=doc.name,
		)
		frappe.get_doc(
			{
				"doctype": "Notification Log",
				"subject": _("Bank Deposit pending COO approval: {0}").format(doc.name),
				"email_content": _("Please review and approve Bank Deposit {0}.").format(doc.name),
				"for_user": recipients[0],
				"type": "Alert",
				"document_type": doc.doctype,
				"document_name": doc.name,
			}
		).insert(ignore_permissions=True)
	except Exception:
		frappe.log_error(frappe.get_traceback(), "Bank Deposit COO notify")


@frappe.whitelist()
def get_undeposited_cash_donations(company=None, from_date=None, to_date=None, exclude_deposit=None):
	"""Return submitted Cash donations not yet linked to an active Bank Deposit."""
	filters = {"docstatus": 1, "payment_method": "Cash"}
	if company:
		filters["company"] = company
	if from_date:
		filters["donation_date"] = [">=", from_date]
	if to_date:
		if "donation_date" in filters and isinstance(filters["donation_date"], list):
			filters["donation_date"] = ["between", [from_date, to_date]]
		else:
			filters["donation_date"] = ["<=", to_date]

	donations = frappe.get_all(
		"Donation",
		filters=filters,
		fields=["name", "donation_date", "donor_name", "payment_method", "received_amount", "remarks"],
		order_by="donation_date asc, name asc",
	)
	if not donations:
		return []

	used = {
		r[0]
		for r in frappe.db.sql(
			"""
			SELECT bdd.donation
			FROM `tabBank Deposit Donation` bdd
			INNER JOIN `tabBank Deposit` bd ON bd.name = bdd.parent
			WHERE bd.docstatus < 2
				AND (%s IS NULL OR bd.name != %s)
			""",
			(exclude_deposit, exclude_deposit),
		)
	}
	return [d for d in donations if d.name not in used]


@frappe.whitelist()
def get_approval_actions(name):
	doc = frappe.get_doc("Bank Deposit", name)
	status = doc.status
	return {
		"status": status,
		"can_submit_for_approval": _user_can_submit_for_approval()
		and status in ("Draft", "Rejected")
		and doc.docstatus == 0,
		"can_withdraw_approval": _user_can_submit_for_approval()
		and status == "Pending COO Approval"
		and doc.docstatus == 0,
		"can_approve": _user_can_approve_coo() and status == "Pending COO Approval" and doc.docstatus == 0,
		"can_reject": _user_can_approve_coo() and status == "Pending COO Approval" and doc.docstatus == 0,
		"can_submit_doc": status == "Approved" and doc.docstatus == 0,
	}


@frappe.whitelist()
def submit_for_coo_approval(name):
	doc = frappe.get_doc("Bank Deposit", name)
	if not _user_can_submit_for_approval():
		frappe.throw(_("Only Accounts / System Manager can submit Bank Deposit for COO approval."))
	if doc.docstatus != 0:
		frappe.throw(_("Only draft documents can be submitted for approval."))
	if doc.status not in ("Draft", "Rejected"):
		frappe.throw(_("Only Draft or Rejected deposits can be submitted for COO approval."))
	if not doc.donations:
		frappe.throw(_("Add at least one Donation Slip before submitting for approval."))
	if not doc.deposit_slip_no:
		frappe.throw(_("Deposit Slip No is required before submitting for COO approval."))
	if flt(doc.total_amount) <= 0:
		frappe.throw(_("Total amount must be greater than zero."))

	doc.status = "Pending COO Approval"
	doc.submitted_by = frappe.session.user
	doc.submitted_for_approval_on = now_datetime()
	doc.approved_by = None
	doc.approved_on = None
	doc.rejection_reason = None
	doc.approval_remarks = None
	doc.flags.from_approval_action = True
	doc.save()
	_notify_coo(doc)
	return {"message": _("Submitted to COO for approval."), "status": doc.status}


@frappe.whitelist()
def withdraw_coo_approval(name):
	doc = frappe.get_doc("Bank Deposit", name)
	if not _user_can_submit_for_approval():
		frappe.throw(_("Not permitted to withdraw COO submission."))
	if doc.status != "Pending COO Approval":
		frappe.throw(_("Only deposits pending COO approval can be withdrawn."))
	doc.status = "Draft"
	doc.submitted_by = None
	doc.submitted_for_approval_on = None
	doc.flags.from_approval_action = True
	doc.save()
	return {"message": _("Withdrawn to Draft."), "status": doc.status}


@frappe.whitelist()
def approve_bank_deposit(name, remarks=None):
	doc = frappe.get_doc("Bank Deposit", name)
	if not _user_can_approve_coo():
		frappe.throw(_("Only COO or System Manager can approve Bank Deposit."))
	if doc.status != "Pending COO Approval":
		frappe.throw(_("Only deposits pending COO approval can be approved."))
	doc.status = "Approved"
	doc.approved_by = frappe.session.user
	doc.approved_on = now_datetime()
	doc.approval_remarks = remarks
	doc.rejection_reason = None
	doc.flags.from_approval_action = True
	doc.save()
	return {"message": _("Bank Deposit approved. You can now Submit to create the Cash → Bank JV."), "status": doc.status}


@frappe.whitelist()
def reject_bank_deposit(name, reason=None):
	doc = frappe.get_doc("Bank Deposit", name)
	if not _user_can_approve_coo():
		frappe.throw(_("Only COO or System Manager can reject Bank Deposit."))
	if doc.status != "Pending COO Approval":
		frappe.throw(_("Only deposits pending COO approval can be rejected."))
	if not reason:
		frappe.throw(_("Rejection reason is required."))
	doc.status = "Rejected"
	doc.approved_by = frappe.session.user
	doc.approved_on = now_datetime()
	doc.rejection_reason = reason
	doc.flags.from_approval_action = True
	doc.save()
	return {"message": _("Bank Deposit rejected."), "status": doc.status}
