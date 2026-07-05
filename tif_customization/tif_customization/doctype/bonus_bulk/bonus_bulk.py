import frappe
from frappe.model.document import Document
from frappe.utils import cstr, flt, getdate, nowdate


def _safe_error_message(exc: Exception) -> str:
	msg = cstr(exc) or "Error"
	return msg[:140]


def _split_lines(value):
	if not value:
		return []
	lines = []
	for raw in (value or "").replace(",", "\n").splitlines():
		v = (raw or "").strip()
		if v:
			lines.append(v)
	return list(dict.fromkeys(lines))


def _get_employee_base_salary(employee, company=None, reference_date=None):
	reference_date = reference_date or nowdate()
	ssa_filters = {
		"employee": employee,
		"docstatus": 1,
		"from_date": ("<=", reference_date),
	}
	if company:
		ssa_filters["company"] = company

	base = frappe.db.get_value(
		"Salary Structure Assignment",
		ssa_filters,
		"base",
		order_by="from_date desc, modified desc",
	)
	if base:
		return flt(base)

	slip_filters = {"employee": employee, "docstatus": 1}
	if company:
		slip_filters["company"] = company

	base = frappe.db.get_value(
		"Salary Slip",
		slip_filters,
		"base_gross_pay",
		order_by="end_date desc, modified desc",
	)
	return flt(base) if base else 0.0


def _is_full_attendance(employee, from_date, to_date):
	if not (from_date and to_date):
		return True

	absent_count = frappe.db.count(
		"Attendance",
		{
			"employee": employee,
			"attendance_date": ("between", [from_date, to_date]),
			"docstatus": 1,
			"status": ("in", ["Absent", "Half Day"]),
		},
	)
	return absent_count == 0


def _resolve_cost_center(bulk_doc, employee):
	if bulk_doc.cost_center:
		return bulk_doc.cost_center

	cost_center = frappe.db.get_value("Employee", employee, "payroll_cost_center")
	if cost_center:
		return cost_center

	department = frappe.db.get_value("Employee", employee, "department")
	if department:
		cost_center = frappe.db.get_value("Department", department, "payroll_cost_center")
		if cost_center:
			return cost_center

	import erpnext

	cost_center = erpnext.get_default_cost_center(bulk_doc.company)
	if cost_center:
		return cost_center

	return frappe.db.get_value(
		"Cost Center",
		{"company": bulk_doc.company, "name": ("like", "%Salary%"), "is_group": 0},
		"name",
		order_by="name asc",
	)


class BonusBulk(Document):
	def validate(self):
		self._set_default_payment_accounts()
		self._set_default_cost_center()
		self._remove_empty_employee_rows()
		self._recompute_totals()

	def before_submit(self):
		if not self.get("employees"):
			frappe.throw("Please fetch employees before submitting.")
		self._validate_payment_settings()
		pending = [row for row in self.get("employees") or [] if self._row_needs_processing(row)]
		if pending:
			self._process_bonus_payments()
		failed = [
			row
			for row in self.get("employees") or []
			if flt(row.bonus_amount) and not row.journal_entry and not row.additional_salary
		]
		if failed:
			remarks = ", ".join(filter(None, [row.remarks for row in failed[:3]]))
			frappe.throw(
				"Could not create bonus payments for all employees."
				+ (f" {remarks}" if remarks else " Check accounts and Cost Center.")
			)

	def before_insert(self):
		if not self.posting_date:
			self.posting_date = nowdate()

	def _remove_empty_employee_rows(self):
		rows = [row for row in self.get("employees") or [] if row.employee]
		if len(rows) != len(self.get("employees") or []):
			self.set("employees", rows)

	def _set_default_payment_accounts(self):
		if not self.company:
			return
		if not self.payable_account:
			self.payable_account = frappe.db.get_value(
				"Company", self.company, "default_payroll_payable_account"
			)
		if not self.expense_account:
			event_hint = (self.bonus_event or "").replace(" ", "").upper()
			if "EID" in event_hint:
				self.expense_account = frappe.db.get_value(
					"Account",
					{"company": self.company, "name": ("like", "%EID%"), "is_group": 0},
					"name",
					order_by="name asc",
				)
			if not self.expense_account:
				self.expense_account = frappe.db.get_value(
					"Account",
					{"company": self.company, "account_name": ("like", "%BONUS%"), "is_group": 0},
					"name",
					order_by="name asc",
				)

	def _validate_account_is_ledger(self, account, label):
		if account and frappe.db.get_value("Account", account, "is_group"):
			frappe.throw(
				f"{label} `{account}` is a group account. Please select a ledger (non-group) account."
			)

	def _set_default_cost_center(self):
		if self.cost_center or not self.company:
			return
		import erpnext

		self.cost_center = erpnext.get_default_cost_center(self.company)
		if not self.cost_center:
			self.cost_center = frappe.db.get_value(
				"Cost Center",
				{"company": self.company, "name": ("like", "%Salary%"), "is_group": 0},
				"name",
				order_by="name asc",
			)

	def _validate_payment_settings(self):
		if not self.pay_via_payment_entry:
			if not self.salary_component:
				frappe.throw("Salary Component is required when paying via Salary Slip.")
			return
		if not self.expense_account:
			frappe.throw("Expense Account is required when paying via direct transfer.")
		self._validate_account_is_ledger(self.expense_account, "Expense Account")
		if self.create_payment_entry:
			if not self.payable_account:
				frappe.throw("Payable Account is required when using a separate Payment Entry.")
			self._validate_account_is_ledger(self.payable_account, "Payable Account")
		self._set_default_cost_center()
		if not self.cost_center:
			frappe.throw("Cost Center is required for bonus accounting entries.")
		if self.pay_via_payment_entry and not self.create_payment_entry and not self.bank_account:
			# Bank may still resolve from company default via get_bank_cash_account
			pass

	def _recompute_totals(self):
		total = 0.0
		for row in self.get("employees") or []:
			total += flt(row.bonus_amount)
		self.total_employees = len(self.get("employees") or [])
		self.total_bonus_amount = total

	def _employees_table_payload(self) -> dict:
		return {
			"employees": [row.as_dict() for row in self.get("employees") or []],
			"total_employees": self.total_employees,
			"total_bonus_amount": self.total_bonus_amount,
		}

	@frappe.whitelist()
	def fetch_employees(self):
		if not self.company:
			frappe.throw("Company is required.")
		if not self.bonus_event:
			frappe.throw("Bonus Event is required.")
		if not self.posting_date:
			frappe.throw("Posting Date is required.")
		if not self.pay_via_payment_entry and not self.salary_component:
			frappe.throw("Salary Component is required when paying via Salary Slip.")

		employee_meta = frappe.get_meta("Employee")
		if not employee_meta.has_field("employment_type"):
			frappe.throw("Employee field `employment_type` not found. Please add it or update this customization.")

		full_time_types = _split_lines(self.full_time_employment_types)
		part_time_types = _split_lines(self.part_time_employment_types)
		if not full_time_types and not part_time_types:
			frappe.throw("Please set Full Time / Part Time employment types.")

		self.set("employees", [])

		filters = {"status": "Active", "company": self.company}
		if full_time_types or part_time_types:
			filters["employment_type"] = ("in", list(dict.fromkeys(full_time_types + part_time_types)))

		employees = frappe.get_all(
			"Employee",
			filters=filters,
			fields=["name", "employee_name", "employment_type"],
			order_by="name asc",
		)

		for emp in employees:
			etype = (emp.get("employment_type") or "").strip()
			base_salary = _get_employee_base_salary(emp.name, company=self.company, reference_date=self.posting_date)
			bonus_amount = 0.0
			if etype in full_time_types:
				if self.attendance_check == "ERPNext Attendance (Absent/Half Day)":
					if not _is_full_attendance(emp.name, self.from_date, self.to_date):
						continue
				bonus_amount = (flt(self.full_time_percentage) / 100.0) * flt(base_salary)
			elif etype in part_time_types:
				bonus_amount = flt(self.part_time_amount)
			else:
				continue

			self.append(
				"employees",
				{
					"employee": emp.name,
					"employment_type": etype,
					"base_salary": base_salary,
					"bonus_amount": bonus_amount,
					"status": "Pending",
				},
			)

		self._recompute_totals()
		self.save(ignore_permissions=True)
		return self._employees_table_payload()

	def _create_additional_salary_for_row(self, row):
		if row.additional_salary:
			row.status = "Created"
			return None

		if not flt(row.bonus_amount):
			row.status = "Skipped"
			row.remarks = "Zero bonus amount."
			return None

		additional_salary = frappe.get_doc(
			{
				"doctype": "Additional Salary",
				"employee": row.employee,
				"company": self.company,
				"payroll_date": self.posting_date,
				"salary_component": self.salary_component,
				"amount": flt(row.bonus_amount),
				"overwrite_salary_structure_amount": 1,
			}
		)
		additional_salary.insert(ignore_permissions=True)
		if self.submit_additional_salary:
			additional_salary.submit()

		row.additional_salary = additional_salary.name
		row.status = "Created"
		row.remarks = ""
		return additional_salary.name

	def _get_bank_account(self):
		from erpnext.accounts.doctype.payment_entry.payment_entry import get_bank_cash_account

		bank = get_bank_cash_account(frappe._dict({"company": self.company}), self.bank_account)
		if not bank:
			frappe.throw("Bank Account not found. Please set Bank Account on Bonus Bulk.")
		return bank

	def _create_journal_entry_for_row(self, row):
		if row.journal_entry:
			return row.journal_entry

		if not flt(row.bonus_amount):
			row.status = "Skipped"
			row.remarks = "Zero bonus amount."
			return None

		cost_center = _resolve_cost_center(self, row.employee)
		if not cost_center:
			frappe.throw(f"Cost Center is required for Employee {row.employee}.")

		amount = flt(row.bonus_amount)
		direct_bank = self.pay_via_payment_entry and not self.create_payment_entry

		je = frappe.new_doc("Journal Entry")
		je.voucher_type = "Journal Entry"
		je.company = self.company
		je.posting_date = getdate(self.posting_date)
		je.user_remark = f"Bonus Bulk {self.name or 'Draft'} - {self.bonus_event} - {row.employee}"
		je.append(
			"accounts",
			{
				"account": self.expense_account,
				"debit_in_account_currency": amount,
				"cost_center": cost_center,
			},
		)

		if direct_bank:
			bank = self._get_bank_account()
			je.append(
				"accounts",
				{
					"account": bank.account,
					"credit_in_account_currency": amount,
				},
			)
		else:
			je.append(
				"accounts",
				{
					"account": self.payable_account,
					"credit_in_account_currency": amount,
					"party_type": "Employee",
					"party": row.employee,
				},
			)

		je.insert(ignore_permissions=True)
		should_submit = self.submit_journal_entry or direct_bank
		if should_submit:
			je.submit()

		row.journal_entry = je.name
		return je.name

	def _create_payment_entry_for_row(self, row, journal_entry_name):
		bank = self._get_bank_account()

		amount = flt(row.bonus_amount)
		payable_currency = frappe.db.get_value("Account", self.payable_account, "account_currency")

		pe = frappe.new_doc("Payment Entry")
		pe.payment_type = "Pay"
		pe.company = self.company
		pe.posting_date = getdate(self.posting_date)
		pe.party_type = "Employee"
		pe.party = row.employee
		pe.paid_from = bank.account
		pe.paid_to = self.payable_account
		pe.paid_from_account_currency = bank.account_currency
		pe.paid_to_account_currency = payable_currency
		pe.paid_amount = amount
		pe.received_amount = amount
		pe.cost_center = self.cost_center or _resolve_cost_center(self, row.employee)
		if self.mode_of_payment:
			pe.mode_of_payment = self.mode_of_payment
		pe.setup_party_account_field()
		pe.set_missing_values()
		pe.set_amounts()
		pe.insert(ignore_permissions=True)
		if self.submit_payment_entry:
			pe.submit()
		return pe.name

	def _row_needs_processing(self, row):
		if not flt(row.bonus_amount):
			return False
		if row.additional_salary:
			return False
		if not self.pay_via_payment_entry:
			return not row.additional_salary
		if not row.journal_entry:
			return True
		return bool(self.create_payment_entry and not row.payment_entry)

	def _create_bonus_payment_for_row(self, row):
		if row.additional_salary:
			row.status = "Created"
			return row.additional_salary

		if not self.pay_via_payment_entry:
			return self._create_additional_salary_for_row(row)

		if not flt(row.bonus_amount):
			row.status = "Skipped"
			row.remarks = "Zero bonus amount."
			return None

		je_name = row.journal_entry or self._create_journal_entry_for_row(row)
		if not je_name:
			return None

		row.journal_entry = je_name
		row.status = "Created"
		row.remarks = ""

		if self.create_payment_entry and not row.payment_entry:
			try:
				row.payment_entry = self._create_payment_entry_for_row(row, je_name)
			except Exception as exc:
				row.remarks = f"Payment Entry failed: {_safe_error_message(exc)}"

		return je_name

	def _process_bonus_payments(self):
		created = 0
		for row in self.get("employees") or []:
			try:
				name = self._create_bonus_payment_for_row(row)
				if name:
					created += 1
			except Exception as exc:
				row.status = "Skipped"
				row.remarks = _safe_error_message(exc)
		self._recompute_totals()
		return created

	def _persist_employee_row(self, row):
		if not row.name:
			return
		frappe.db.set_value(
			"Bonus Bulk Employee",
			row.name,
			{
				"journal_entry": row.journal_entry,
				"payment_entry": row.payment_entry,
				"additional_salary": row.additional_salary,
				"status": row.status,
				"remarks": row.remarks,
			},
			update_modified=True,
		)

	@frappe.whitelist()
	def create_bonus_payments(self):
		if not self.company:
			frappe.throw("Company is required.")
		if not self.posting_date:
			frappe.throw("Posting Date is required.")
		if not (self.get("employees") or []):
			frappe.throw("Please add employees first (use Fetch Employees).")
		self._validate_payment_settings()
		created = self._process_bonus_payments()
		self.save(ignore_permissions=True)
		return {
			"created": created,
			"total": len(self.get("employees") or []),
			**self._employees_table_payload(),
		}

	@frappe.whitelist()
	def create_additional_salaries(self):
		"""Backward compatible alias."""
		return self.create_bonus_payments()

	@frappe.whitelist()
	def process_pending_payments(self):
		if self.docstatus != 1:
			frappe.throw("This action is only available after the document is submitted.")
		if not any(self._row_needs_processing(row) for row in self.get("employees") or []):
			frappe.throw("No pending employees to process.")

		self._validate_payment_settings()
		for row in self.get("employees") or []:
			if self._row_needs_processing(row):
				row.status = "Pending"
				if not row.journal_entry:
					row.remarks = ""
		created = self._process_bonus_payments()
		for row in self.get("employees") or []:
			self._persist_employee_row(row)
		self._recompute_totals()
		self.db_set(
			{
				"total_employees": self.total_employees,
				"total_bonus_amount": self.total_bonus_amount,
			}
		)
		return {
			"created": created,
			"total": len(self.get("employees") or []),
			**self._employees_table_payload(),
		}
