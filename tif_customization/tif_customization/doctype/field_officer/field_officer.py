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
		self._validate_field_supervisor()

	def _validate_field_supervisor(self):
		parent = (self.parent_field_officer or "").strip()
		if not parent:
			return
		if parent == self.name:
			frappe.throw(_("Field Supervisor cannot be the same officer."))
		if not frappe.db.exists("Field Officer", {"name": parent, "status": "Active"}):
			frappe.throw(_("Field Supervisor must be an active Field Officer."))
		if _is_descendant(parent, self.name):
			frappe.throw(_("Field Supervisor cannot be under this officer in the field team tree."))

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


def _is_descendant(possible_parent: str, node: str) -> bool:
	"""True if `node` appears under `possible_parent` in the Field Officer tree."""
	if not possible_parent or not node or possible_parent == node:
		return False
	current = frappe.db.get_value("Field Officer", node, "parent_field_officer")
	seen = set()
	while current and current not in seen:
		if current == possible_parent:
			return True
		seen.add(current)
		current = frappe.db.get_value("Field Officer", current, "parent_field_officer")
	return False


def resolve_supervisor_field_officer(supervisor: str) -> str | None:
	"""Resolve filter value to a Field Officer name (field supervisor record)."""
	supervisor = (supervisor or "").strip()
	if not supervisor or not frappe.db.exists("DocType", "Field Officer"):
		return None
	if frappe.db.exists("Field Officer", supervisor):
		return supervisor

	row = frappe.db.get_value(
		"Field Officer",
		{"name1": supervisor, "status": "Active"},
		"name",
	)
	if row:
		return row

	from tif_customization.tif_customization.page.supervisor_target_ba.supervisor_target_ba import (
		_get_supervisor_info,
	)

	info = _get_supervisor_info(supervisor)
	employee = info.get("employee")
	if employee:
		return frappe.db.get_value(
			"Field Officer",
			{"employee": employee, "status": "Active"},
			"name",
		)
	return None


def list_field_supervisors(sme_designation: str | None = "School Marketing Executive") -> list[dict]:
	"""Field supervisors = Field Officers who have other Field Officers under them (Field Supervisor link)."""
	if not frappe.db.exists("DocType", "Field Officer"):
		return []

	rows = frappe.db.sql(
		"""
		SELECT
			sup_fo.name AS field_officer,
			sup_fo.name1,
			sup_fo.division,
			sup.name AS employee,
			sup.employee_name,
			sup.user_id,
			sup.designation,
			COUNT(DISTINCT fo.name) AS field_officer_count,
			SUM(CASE WHEN staff.designation = %(sme)s THEN 1 ELSE 0 END) AS sme_count
		FROM `tabField Officer` sup_fo
		INNER JOIN `tabEmployee` sup
			ON sup.name = sup_fo.employee
			AND sup.status = 'Active'
		INNER JOIN `tabField Officer` fo
			ON fo.parent_field_officer = sup_fo.name
			AND fo.status = 'Active'
		INNER JOIN `tabEmployee` staff
			ON staff.name = fo.employee
			AND staff.status = 'Active'
		WHERE sup_fo.status = 'Active'
		GROUP BY sup_fo.name, sup_fo.name1, sup_fo.division, sup.name, sup.employee_name, sup.user_id, sup.designation
		HAVING field_officer_count > 0
		ORDER BY field_officer_count DESC, sup.employee_name
		""",
		{"sme": sme_designation or "School Marketing Executive"},
		as_dict=True,
	)
	return [
		{
			"field_officer": r.field_officer,
			"employee": r.employee,
			"employee_name": r.employee_name,
			"user_id": r.user_id,
			"designation": r.designation or "",
			"division": r.division or "",
			"field_officer_count": int(r.field_officer_count or 0),
			"team_size": int(r.field_officer_count or 0),
			"sme_count": int(r.sme_count or 0),
			"label": r.employee_name or r.name1 or r.user_id or r.employee,
		}
		for r in rows
	]


def get_field_supervisor_subordinate_employees(supervisor: str) -> list[str]:
	"""Employee IDs of active Field Officers under this field supervisor."""
	supervisor_fo = resolve_supervisor_field_officer(supervisor)
	if not supervisor_fo:
		return []

	return frappe.get_all(
		"Field Officer",
		filters={"parent_field_officer": supervisor_fo, "status": "Active"},
		pluck="employee",
	)


@frappe.whitelist()
def sync_field_supervisors_from_hr_reports_to(dry_run: bool | int = True) -> dict:
	"""One-time helper: copy Employee.reports_to → Field Supervisor when the manager is also a Field Officer.

	HR Reports To often points to the department head; use this only to seed field line managers,
	then adjust Field Supervisor manually on each Field Officer.
	"""
	dry_run = frappe.utils.cint(dry_run)
	updated = []
	skipped = []

	for fo in frappe.get_all(
		"Field Officer",
		filters={"status": "Active"},
		fields=["name", "name1", "employee", "parent_field_officer"],
	):
		if not fo.employee:
			skipped.append({"field_officer": fo.name, "reason": "no employee linked"})
			continue
		reports_to = frappe.db.get_value("Employee", fo.employee, "reports_to")
		if not reports_to:
			skipped.append({"field_officer": fo.name, "reason": "no HR reports_to"})
			continue
		supervisor_fo = frappe.db.get_value(
			"Field Officer",
			{"employee": reports_to, "status": "Active"},
			"name",
		)
		if not supervisor_fo:
			skipped.append(
				{
					"field_officer": fo.name,
					"reason": "HR manager is not a Field Officer",
					"hr_reports_to": reports_to,
				}
			)
			continue
		if fo.parent_field_officer == supervisor_fo:
			continue
		updated.append(
			{
				"field_officer": fo.name,
				"from": fo.parent_field_officer,
				"to": supervisor_fo,
			}
		)
		if not dry_run:
			frappe.db.set_value(
				"Field Officer",
				fo.name,
				"parent_field_officer",
				supervisor_fo,
				update_modified=True,
			)
			frappe.db.set_value("Field Officer", supervisor_fo, "is_group", 1, update_modified=True)

	if not dry_run:
		frappe.db.commit()

	return {
		"dry_run": bool(dry_run),
		"updated_count": len(updated),
		"updated": updated,
		"skipped_count": len(skipped),
		"skipped": skipped[:20],
	}


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
