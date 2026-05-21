import frappe
from frappe.model.document import Document
from frappe.utils import flt, nowdate


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

	# Fallback to latest submitted salary slip base gross pay.
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

	# Eligibility check based on ERPNext Attendance doctype.
	# We only disqualify if Absent/Half Day exists in the date range.
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


class BonusBulk(Document):
	def validate(self):
		self._recompute_totals()

	def before_insert(self):
		if not self.posting_date:
			self.posting_date = nowdate()

	def _recompute_totals(self):
		total = 0.0
		for row in self.get("employees") or []:
			total += flt(row.bonus_amount)
		self.total_employees = len(self.get("employees") or [])
		self.total_bonus_amount = total

	@frappe.whitelist()
	def fetch_employees(self):
		if not self.company:
			frappe.throw("Company is required.")
		if not self.bonus_event:
			frappe.throw("Bonus Event is required.")
		if not self.posting_date:
			frappe.throw("Posting Date is required.")
		if not self.salary_component:
			frappe.throw("Salary Component is required.")

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
		# Persist so the client can reload the updated child table.
		self.save(ignore_permissions=True)
		return {
			"total_employees": self.total_employees,
			"total_bonus_amount": self.total_bonus_amount,
		}

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

	@frappe.whitelist()
	def create_additional_salaries(self):
		if not self.company:
			frappe.throw("Company is required.")
		if not self.salary_component:
			frappe.throw("Salary Component is required.")
		if not self.posting_date:
			frappe.throw("Posting Date is required.")
		if not (self.get("employees") or []):
			frappe.throw("Please add employees first (use Fetch Employees).")

		created = 0
		for row in self.get("employees") or []:
			name = self._create_additional_salary_for_row(row)
			if name:
				created += 1

		self._recompute_totals()
		self.save(ignore_permissions=True)
		return {"created": created, "total": len(self.get('employees') or [])}
