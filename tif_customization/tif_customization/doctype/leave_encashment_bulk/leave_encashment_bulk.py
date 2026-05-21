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
		self._recompute_totals()

	def before_insert(self):
		if not self.encashment_date:
			self.encashment_date = nowdate()

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
			# Avoid spamming msgprints from underlying HRMS logic during bulk runs.
			frappe.clear_messages()
			try:
				le = frappe.new_doc("Leave Encashment")
				le.employee = emp.name
				le.company = self.company
				le.leave_period = self.leave_period
				le.leave_type = self.leave_type
				le.encashment_date = self.encashment_date
				le.get_leave_details_for_encashment()
				frappe.clear_messages()

				# Default to ledger-based availability (encashable limits are reflected in actual_encashable_days).
				default_days = flt(le.actual_encashable_days) or flt(le.leave_balance)
				self.append(
					"employees",
					{
						"employee": emp.name,
						"employment_type": (emp.get("employment_type") or "").strip(),
						"leave_balance": flt(le.leave_balance),
						"actual_encashable_days": flt(le.actual_encashable_days),
						"encashment_days": default_days,
						"encashment_amount": flt(le.encashment_amount),
						"status": "Pending",
						"remarks": "",
					},
				)
			except Exception as exc:
				frappe.clear_messages()
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

	def _create_leave_encashment_for_row(self, row):
		if row.leave_encashment:
			row.status = "Created"
			return None

		if not flt(row.encashment_days):
			row.status = "Skipped"
			row.remarks = "Zero encashment days."
			return None

		leave_encashment = frappe.get_doc(
			{
				"doctype": "Leave Encashment",
				"employee": row.employee,
				"company": self.company,
				"leave_period": self.leave_period,
				"leave_type": self.leave_type,
				"encashment_date": self.encashment_date,
				"encashment_days": flt(row.encashment_days),
			}
		)
		leave_encashment.insert(ignore_permissions=True)
		if self.submit_leave_encashment:
			leave_encashment.submit()

		row.leave_encashment = leave_encashment.name
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
