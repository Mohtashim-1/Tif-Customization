"""Create Leave Substitute master, seed all employees, and point Leave Application to it."""

import frappe


def execute():
	_update_leave_application_substitute_fields()
	seed_leave_substitutes_from_employees()
	frappe.db.commit()
	frappe.clear_cache(doctype="Leave Application")
	frappe.clear_cache(doctype="Leave Substitute")


def _update_leave_application_substitute_fields():
	field_updates = {
		"Leave Application-custom_substitute_name": {
			"options": "Leave Substitute",
			"label": "Substitute Name",
			"ignore_user_permissions": 1,
		},
		"Leave Application-custom_substitute_contact": {
			"fetch_from": "custom_substitute_name.contact_number",
		},
		"Leave Application-custom_substitute_user": {
			"fetch_from": "custom_substitute_name.user_id",
			"read_only": 1,
		},
	}

	for name, values in field_updates.items():
		if not frappe.db.exists("Custom Field", name):
			continue
		for fieldname, value in values.items():
			frappe.db.set_value("Custom Field", name, fieldname, value)


def seed_leave_substitutes_from_employees():
	if not frappe.db.table_exists("Leave Substitute", cached=False):
		frappe.log_error("Leave Substitute table missing during seed", "Leave Substitute Seed")
		return {"created": 0, "updated": 0, "error": "table_missing"}

	employees = frappe.db.sql(
		"""
		SELECT name, employee_name, cell_number, department, user_id, status
		FROM `tabEmployee`
		ORDER BY name
		""",
		as_dict=True,
	)

	created = 0
	updated = 0
	errors = []

	for emp in employees:
		try:
			is_active = 1 if emp.status == "Active" else 0
			if frappe.db.exists("Leave Substitute", emp.name):
				frappe.db.set_value(
					"Leave Substitute",
					emp.name,
					{
						"substitute_name": emp.employee_name,
						"contact_number": emp.cell_number,
						"department": emp.department,
						"user_id": emp.user_id,
						"is_active": is_active,
					},
					update_modified=False,
				)
				updated += 1
				continue

			frappe.get_doc(
				{
					"doctype": "Leave Substitute",
					"employee": emp.name,
					"substitute_name": emp.employee_name or emp.name,
					"contact_number": emp.cell_number,
					"department": emp.department,
					"user_id": emp.user_id,
					"is_active": is_active,
				}
			).insert(ignore_permissions=True)
			created += 1
		except Exception as exc:
			errors.append(f"{emp.name}: {exc}")

	if errors:
		frappe.log_error("\n".join(errors[:20]), "Leave Substitute Seed Errors")

	return {
		"created": created,
		"updated": updated,
		"total_employees": len(employees),
		"errors": len(errors),
	}
