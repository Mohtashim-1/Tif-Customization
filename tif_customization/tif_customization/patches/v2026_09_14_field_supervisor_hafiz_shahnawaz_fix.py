# Copyright (c) 2026, TIF Customization and contributors
"""Ensure Hafiz Shahnawaz Awan is a field supervisor and team reports to him."""

import frappe

from tif_customization.tif_customization.doctype.field_officer.field_officer import (
	suggest_division_from_branch,
)


def _employee_by_name_hints(*hints):
	for hint in hints:
		hint = (hint or "").strip()
		if not hint:
			continue
		exact = frappe.db.get_value("Employee", {"employee_name": hint, "status": "Active"}, "name")
		if exact:
			return exact
		rows = frappe.get_all(
			"Employee",
			filters={"employee_name": ["like", f"%{hint}%"], "status": "Active"},
			fields=["name", "employee_name"],
			limit=5,
			order_by="modified desc",
		)
		if not rows:
			continue
		if len(rows) == 1:
			return rows[0].name
		# Prefer exact substring match on full hint
		hl = hint.lower()
		for row in rows:
			if hl in (row.employee_name or "").lower():
				return row.name
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


def _ensure_supervisor_field_officer(employee):
	fo = _field_officer_for_employee(employee)
	if fo:
		frappe.db.set_value("Field Officer", fo, "is_group", 1, update_modified=True)
		return fo

	emp = frappe.db.get_value(
		"Employee",
		employee,
		["employee_name", "user_id", "branch", "status"],
		as_dict=True,
	)
	if not emp or emp.status != "Active":
		return None
	if not emp.user_id:
		frappe.log_error(
			title="Field supervisor patch skipped",
			message=f"Employee {employee} has no user_id; cannot create Field Officer.",
		)
		return None

	name1 = (emp.employee_name or "").strip()
	if frappe.db.exists("Field Officer", name1):
		fo = name1
		frappe.db.set_value(
			"Field Officer",
			fo,
			{"employee": employee, "user": emp.user_id, "status": "Active", "is_group": 1},
			update_modified=True,
		)
		return fo

	doc = frappe.get_doc(
		{
			"doctype": "Field Officer",
			"name1": name1,
			"division": suggest_division_from_branch(emp.branch) or "Karachi",
			"status": "Active",
			"employee": employee,
			"user": emp.user_id,
			"is_group": 1,
		}
	)
	doc.insert(ignore_permissions=True)
	return doc.name


def execute():
	if not frappe.db.exists("DocType", "Field Officer"):
		return

	supervisor_emp = _employee_by_name_hints(
		"Hafiz Shahnawaz Awan",
		"Hafiz Shahnawaz",
		"Haifz Shahnawaz",
		"Shahnawaz Awan",
	)
	if not supervisor_emp:
		frappe.log_error(
			title="Field supervisor patch skipped",
			message="Could not find active Employee for Hafiz Shahnawaz Awan.",
		)
		return

	supervisor_fo = _ensure_supervisor_field_officer(supervisor_emp)
	if not supervisor_fo:
		frappe.log_error(
			title="Field supervisor patch skipped",
			message=f"Could not create or resolve Field Officer for employee {supervisor_emp}.",
		)
		return

	subordinate_hints = [
		("Syed Rehan Haider", ["Syed Rehan Haider", "Rehan Haider", "S. Rahman Haider", "Rahman Haider"]),
		("Sajid Hussain", ["Sajid Hussain", "Sajjid Hussain"]),
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

	frappe.db.commit()
