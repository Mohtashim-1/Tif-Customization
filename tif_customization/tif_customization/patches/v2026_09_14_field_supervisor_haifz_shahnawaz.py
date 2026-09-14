# Copyright (c) 2026, TIF Customization and contributors
"""Field team: Haifz Shahnawaz → Syed Rehan Haider, Sajid Hussain, Muhammad Zahid, Arsalan Sohail."""

import frappe


def _employee_by_name_hints(*hints):
	for hint in hints:
		hint = (hint or "").strip()
		if not hint:
			continue
		rows = frappe.get_all(
			"Employee",
			filters={"employee_name": ["like", f"%{hint}%"], "status": "Active"},
			fields=["name"],
			limit=1,
			order_by="modified desc",
		)
		if rows:
			return rows[0].name
	return None


def _field_officer_for_employee(employee):
	if not employee:
		return None
	return frappe.db.get_value(
		"Field Officer",
		{"employee": employee, "status": "Active"},
		"name",
	)


def execute():
	if not frappe.db.exists("DocType", "Field Officer"):
		return

	supervisor_emp = _employee_by_name_hints("Haifz Shahnawaz", "Hafiz Shahnawaz", "Shahnawaz Awan")
	supervisor_fo = _field_officer_for_employee(supervisor_emp)
	if not supervisor_fo:
		frappe.log_error(
			title="Field supervisor patch skipped",
			message=f"Could not resolve Field Officer for supervisor employee {supervisor_emp}",
		)
		return

	subordinate_hints = [
		("Syed Rehan Haider", ["Syed Rehan Haider", "Rehan Haider"]),
		("Sajjid Hussain", ["Sajjid Hussain", "Sajid Hussain"]),
		("Muhammad Zahid", ["Muhammad Zahid"]),
		("Arsalan Sohail", ["Arsalan Sohail", "Hafiz Arsalan Sohail"]),
	]

	for label, hints in subordinate_hints:
		emp = None
		for h in hints:
			emp = _employee_by_name_hints(h)
			if emp:
				break
		fo = _field_officer_for_employee(emp)
		if not fo:
			frappe.log_error(
				title="Field supervisor patch subordinate skipped",
				message=f"No active Field Officer for {label} (employee {emp})",
			)
			continue
		frappe.db.set_value(
			"Field Officer",
			fo,
			"parent_field_officer",
			supervisor_fo,
			update_modified=True,
		)
