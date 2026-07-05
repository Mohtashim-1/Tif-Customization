import frappe
from frappe.model.document import Document
from frappe.utils import cstr, flt, getdate, nowdate


def _safe_error_message(exc: Exception) -> str:
	msg = cstr(exc) or "Error"
	return msg[:140]


def _allocation_diagnostics(employee: str, leave_type: str, on_date) -> str | None:
	"""Return a short human-friendly reason when Leave Allocation isn't found by HRMS rules."""
	on_date = getdate(on_date)

	alloc = frappe.db.get_value(
		"Leave Allocation",
		{"employee": employee, "leave_type": leave_type},
		["name", "docstatus", "from_date", "to_date"],
		as_dict=True,
		order_by="from_date desc, modified desc",
	)
	if not alloc:
		return None

	from_date = getdate(alloc.from_date) if alloc.from_date else None
	to_date = getdate(alloc.to_date) if alloc.to_date else None

	if alloc.docstatus != 1:
		return f"Leave Allocation {alloc.name} is not submitted."

	if from_date and on_date < from_date:
		return f"Leave Allocation {alloc.name} starts on {from_date}."
	if to_date and on_date > to_date:
		return f"Leave Allocation {alloc.name} ended on {to_date}."

	return f"Leave Allocation {alloc.name} exists but does not match encashment rules."


class LeaveEncashmentBulk(Document):
	def validate(self):
		self._set_default_payment_accounts()
		self._recompute_totals()

	def before_insert(self):
		if not self.encashment_date:
			self.encashment_date = nowdate()
		self._set_default_payment_accounts()

	def _set_default_payment_accounts(self):
		if not self.company:
			return
		if not self.payable_account:
			self.payable_account = frappe.db.get_value(
				"Company", self.company, "default_payroll_payable_account"
			)
		if not self.expense_account:
			self.expense_account = frappe.db.get_value(
				"Account",
				{"company": self.company, "account_name": ("like", "%LEAVE ENCASHMENT%")},
				"name",
			)

	def _recompute_totals(self):
		total = 0.0
		for row in self.get("employees") or []:
			total += flt(row.encashment_amount)
		self.total_employees = len(self.get("employees") or [])
		self.total_encashment_amount = total

	@frappe.whitelist()
	def fetch_employees(self):
		if not self.company:
			frappe.throw("Company is required.")
		if not self.leave_period:
			frappe.throw("Leave Period is required.")
		if not self.leave_type:
			frappe.throw("Leave Type is required.")
		if not self.encashment_date:
			frappe.throw("Encashment Date is required.")

		employee_meta = frappe.get_meta("Employee")
		if not employee_meta.has_field("employment_type"):
			frappe.throw("Employee field `employment_type` not found. Please add it or update this customization.")

		# Backward compatible: field may not exist in DB yet if doctype wasn't reloaded/migrated.
		employment_type = (getattr(self, "employment_type", None) or "").strip() or "Full Time - (Permanent)"

		self.set("employees", [])

		encashment_date = getdate(self.encashment_date)
		employees = frappe.get_all(
			"Employee",
			filters={
				"status": "Active",
				"company": self.company,
				"employment_type": employment_type,
				# Exclude employees who joined after the encashment date (e.g. backdated runs).
				"date_of_joining": ("<=", encashment_date),
			},
			fields=["name", "employee_name", "employment_type"],
			order_by="name asc",
		)

		skipped = 0
		skipped_reasons: dict[str, int] = {}
		for emp in employees:
			try:
				details = _get_row_encashment_details(self, emp.name)
				self.append(
					"employees",
					{
						"employee": emp.name,
						"employment_type": (emp.get("employment_type") or "").strip(),
						"leave_balance": details["leave_balance"],
						"actual_encashable_days": details["actual_encashable_days"],
						"encashment_days": details["encashment_days"],
						"encashment_amount": details["encashment_amount"],
						"status": "Pending",
						"remarks": "",
					},
				)
			except Exception as exc:
				skipped += 1
				msg = _safe_error_message(exc)
				if "No Leaves Allocated to Employee" in msg:
					diag = _allocation_diagnostics(emp.name, self.leave_type, encashment_date)
					if diag:
						msg = diag
				skipped_reasons[msg] = skipped_reasons.get(msg, 0) + 1
				# Do not add rows for ineligible employees.
				continue

		self._recompute_totals()
		# Save only when rows exist; otherwise mandatory validation may fail in older schema.
		if self.get("employees"):
			self.save(ignore_permissions=True)
		return {
			"total_employees": self.total_employees,
			"total_encashment_amount": self.total_encashment_amount,
			"skipped": skipped,
			"skipped_reasons": skipped_reasons,
		}

	@frappe.whitelist()
	def recalculate_employees(self):
		"""Refresh leave balances and amounts for the current encashment date."""
		if not self.encashment_date:
			frappe.throw("Encashment Date is required.")
		if not (self.get("employees") or []):
			frappe.throw("Please add employees first (use Fetch Employees).")

		updated = 0
		for row in self.get("employees") or []:
			if row.leave_encashment:
				continue
			try:
				details = _get_row_encashment_details(self, row.employee, flt(row.encashment_days) or None)
				row.leave_balance = details["leave_balance"]
				row.actual_encashable_days = details["actual_encashable_days"]
				row.encashment_days = details["encashment_days"]
				row.encashment_amount = details["encashment_amount"]
				updated += 1
			except Exception as exc:
				row.remarks = _safe_error_message(exc)
				row.status = "Skipped"

		self._recompute_totals()
		self.save(ignore_permissions=True)
		return {"updated": updated, "total": len(self.get("employees") or [])}

	def _create_leave_encashment_for_row(self, row):
		if row.leave_encashment:
			row.status = "Created"
			return None

		if not flt(row.encashment_days):
			row.status = "Skipped"
			row.remarks = "Zero encashment days."
			return None

		leave_encashment = _build_leave_encashment_doc(self, row)
		leave_encashment.insert(ignore_permissions=True)
		if self.submit_leave_encashment:
			leave_encashment.submit()

		row.leave_encashment = leave_encashment.name
		row.leave_balance = flt(leave_encashment.leave_balance)
		row.actual_encashable_days = flt(leave_encashment.actual_encashable_days)
		row.encashment_days = flt(leave_encashment.encashment_days)
		row.encashment_amount = flt(leave_encashment.encashment_amount)

		if self.pay_via_payment_entry and self.create_payment_entry:
			row.payment_entry = _create_payment_entry_for_leave_encashment(self, leave_encashment.name)

		row.status = "Created"
		row.remarks = ""
		return leave_encashment.name

	@frappe.whitelist()
	def create_leave_encashments(self):
		if not self.company:
			frappe.throw("Company is required.")
		if not self.leave_period:
			frappe.throw("Leave Period is required.")
		if not self.leave_type:
			frappe.throw("Leave Type is required.")
		if not self.encashment_date:
			frappe.throw("Encashment Date is required.")
		if not (self.get("employees") or []):
			frappe.throw("Please add employees first (use Fetch Employees).")
		if self.pay_via_payment_entry:
			if not self.payable_account:
				frappe.throw("Payable Account is required when paying via Payment Entry.")
			if not self.expense_account:
				frappe.throw("Expense Account is required when paying via Payment Entry.")

		# Always recalculate using the selected encashment date before creating records.
		self.recalculate_employees()

		created = 0
		for row in self.get("employees") or []:
			try:
				name = self._create_leave_encashment_for_row(row)
				if name:
					created += 1
			except Exception as exc:
				row.status = "Skipped"
				row.remarks = _safe_error_message(exc)

		self._recompute_totals()
		self.save(ignore_permissions=True)
		return {"created": created, "total": len(self.get("employees") or [])}


def _get_row_encashment_details(bulk_doc, employee, encashment_days=None):
	frappe.clear_messages()
	le = frappe.new_doc("Leave Encashment")
	le.employee = employee
	le.company = bulk_doc.company
	le.leave_period = bulk_doc.leave_period
	le.leave_type = bulk_doc.leave_type
	le.encashment_date = getdate(bulk_doc.encashment_date)
	_apply_payment_entry_settings(bulk_doc, le)
	le.get_leave_details_for_encashment()
	frappe.clear_messages()

	if encashment_days is not None and flt(encashment_days):
		le.encashment_days = flt(encashment_days)
		le.set_encashment_amount()

	return {
		"leave_balance": flt(le.leave_balance),
		"actual_encashable_days": flt(le.actual_encashable_days),
		"encashment_days": flt(le.encashment_days),
		"encashment_amount": flt(le.encashment_amount),
	}


def _apply_payment_entry_settings(bulk_doc, leave_encashment):
	if not bulk_doc.pay_via_payment_entry:
		leave_encashment.pay_via_payment_entry = 0
		return

	leave_encashment.pay_via_payment_entry = 1
	leave_encashment.payable_account = bulk_doc.payable_account
	leave_encashment.expense_account = bulk_doc.expense_account
	leave_encashment.posting_date = getdate(bulk_doc.encashment_date)
	if bulk_doc.cost_center:
		leave_encashment.cost_center = bulk_doc.cost_center
	elif not leave_encashment.cost_center:
		leave_encashment.cost_center = frappe.db.get_value(
			"Employee", leave_encashment.employee, "payroll_cost_center"
		)


def _build_leave_encashment_doc(bulk_doc, row):
	details = _get_row_encashment_details(bulk_doc, row.employee, flt(row.encashment_days) or None)
	leave_encashment = frappe.new_doc("Leave Encashment")
	leave_encashment.employee = row.employee
	leave_encashment.company = bulk_doc.company
	leave_encashment.leave_period = bulk_doc.leave_period
	leave_encashment.leave_type = bulk_doc.leave_type
	leave_encashment.encashment_date = getdate(bulk_doc.encashment_date)
	leave_encashment.encashment_days = details["encashment_days"]
	_apply_payment_entry_settings(bulk_doc, leave_encashment)
	leave_encashment.get_leave_details_for_encashment()
	leave_encashment.encashment_days = details["encashment_days"]
	leave_encashment.set_encashment_amount()
	return leave_encashment


def _create_payment_entry_for_leave_encashment(bulk_doc, leave_encashment_name):
	from hrms.overrides.employee_payment_entry import get_payment_entry_for_employee

	pe = get_payment_entry_for_employee(
		"Leave Encashment",
		leave_encashment_name,
		bank_account=bulk_doc.bank_account,
	)
	pe.posting_date = getdate(bulk_doc.encashment_date)
	if bulk_doc.mode_of_payment:
		pe.mode_of_payment = bulk_doc.mode_of_payment
	pe.insert(ignore_permissions=True)
	if bulk_doc.submit_payment_entry:
		pe.submit()
	return pe.name
