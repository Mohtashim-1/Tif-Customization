# Copyright (c) 2026, mohtashim and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document

DIVISION_TO_REGION = {
	"Karachi": "karachi",
	"Urban Areas": "urban",
	"Rural Areas": "rural",
	"Punjab": "punjab",
}

REGION_TO_DIVISION = {v: k for k, v in DIVISION_TO_REGION.items()}


class FieldOfficer(Document):
	def validate(self):
		self._sync_from_employee()
		if self.division:
			self.division = self.division.strip()
		if self.division and self.division not in DIVISION_TO_REGION:
			frappe.throw(frappe._("Invalid Type / Division: {0}").format(self.division))

	def _sync_from_employee(self):
		if not self.employee:
			return
		emp = frappe.db.get_value(
			"Employee",
			self.employee,
			["employee_name", "user_id", "branch", "status"],
			as_dict=True,
		)
		if not emp:
			return
		if not self.name1 and emp.employee_name:
			self.name1 = emp.employee_name
		if emp.user_id and (not self.user or self.user != emp.user_id):
			self.user = emp.user_id
		if emp.branch:
			self.branch = emp.branch


def division_to_region(division):
	return DIVISION_TO_REGION.get((division or "").strip()) or None


def suggest_division_from_branch(branch):
	text = (branch or "").strip().lower()
	if not text:
		return ""
	if "karachi" in text:
		return "Karachi"
	# Common urban branches outside Karachi
	urban_hints = (
		"lahore",
		"islamabad",
		"rawalpindi",
		"faisalabad",
		"multan",
		"peshawar",
		"quetta",
		"hyderabad",
		"sialkot",
		"gujranwala",
	)
	if any(h in text for h in urban_hints):
		return "Urban Areas"
	return "Rural Areas"


@frappe.whitelist()
def get_officer_region(officer=None, user=None, employee=None, staff_name=None):
	"""Resolve KPI region key for a Field Officer / user / staff name."""
	filters = {}
	if officer:
		filters["name"] = officer
	elif user:
		filters["user"] = user
	elif employee:
		filters["employee"] = employee
	elif staff_name:
		# Match by display name or user id
		row = frappe.db.sql(
			"""
			SELECT name, division, user, employee, name1, status
			FROM `tabField Officer`
			WHERE status = 'Active'
			  AND (
				name = %(q)s OR name1 = %(q)s OR user = %(q)s
				OR name1 LIKE %(like)s OR user LIKE %(like)s
			  )
			ORDER BY
				CASE
					WHEN name = %(q)s OR name1 = %(q)s OR user = %(q)s THEN 0
					ELSE 1
				END
			LIMIT 1
			""",
			{"q": staff_name, "like": f"%{staff_name}%"},
			as_dict=True,
		)
		if not row:
			return {"region": None, "division": None, "officer": None}
		officer_row = row[0]
		return {
			"region": division_to_region(officer_row.division),
			"division": officer_row.division,
			"officer": officer_row.name,
			"user": officer_row.user,
			"name": officer_row.name1,
		}
	else:
		return {"region": None, "division": None, "officer": None}

	officer_row = frappe.db.get_value(
		"Field Officer",
		filters,
		["name", "division", "user", "employee", "name1", "status"],
		as_dict=True,
	)
	if not officer_row:
		return {"region": None, "division": None, "officer": None}
	return {
		"region": division_to_region(officer_row.division),
		"division": officer_row.division,
		"officer": officer_row.name,
		"user": officer_row.user,
		"name": officer_row.name1,
	}
