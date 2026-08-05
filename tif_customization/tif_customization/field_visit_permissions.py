# Copyright (c) 2026, TIF Customization and contributors
# License: MIT
"""Field lead → field staff scoping for Field Visit visibility."""

from __future__ import annotations

import re

import frappe


# Roles that can see all Field Visits / field staff reports
VIEW_ALL_ROLES = {
	"System Manager",
	"HR Manager",
	"HR User",
	"Field Staff Manager",
	"HOD",
	"COO",
	"Staff Reporting Manager",
}


def can_view_all_field_visits(user: str | None = None) -> bool:
	user = user or frappe.session.user
	if user == "Administrator":
		return True
	roles = set(frappe.get_roles(user))
	return bool(roles & VIEW_ALL_ROLES)


def get_employee_for_user(user: str | None = None) -> dict | None:
	user = user or frappe.session.user
	if not user or user == "Guest":
		return None
	return frappe.db.get_value(
		"Employee",
		{"user_id": user, "status": "Active"},
		["name", "employee_name", "user_id"],
		as_dict=True,
	)


def get_team_employee_rows(user: str | None = None, include_self: bool = True) -> list[dict]:
	"""Employees in scope: self + direct reports (active + inactive for history)."""
	user = user or frappe.session.user
	me = get_employee_for_user(user)
	if not me:
		return []

	rows = []
	seen = set()
	if include_self:
		rows.append(me)
		seen.add(me.name)

	for status_filter in (
		{"reports_to": me.name, "status": "Active"},
		{"reports_to": me.name, "status": ("!=", "Active")},
	):
		for row in frappe.get_all(
			"Employee",
			filters=status_filter,
			fields=["name", "employee_name", "user_id"],
			order_by="employee_name asc",
		):
			if row.name in seen:
				continue
			seen.add(row.name)
			rows.append(row)
	return rows


def _name_variants(employee_name: str) -> set[str]:
	"""Expand messy visit_by spellings used in Field Visit."""
	if not employee_name:
		return set()
	name = " ".join(employee_name.split())
	variants = {name, name.lower(), name.title()}

	parts = [p for p in re.split(r"\s+", name) if p]
	if not parts:
		return variants

	# Initials + last: M Ajmal, M.Ajmal, M. Ajmal
	if len(parts) >= 2:
		first, last = parts[0], parts[-1]
		ini = first[0]
		variants.update(
			{
				f"{ini} {last}",
				f"{ini}.{last}",
				f"{ini}. {last}",
				f"{ini}{last}",
				f"{first} {last}",
				"".join(parts),  # AbdulKabeer
				".".join(parts),  # Abdul.Kabeer
			}
		)
		# Nazim Uddin → Nazim Ud Din style
		if last.lower() in {"uddin", "uddeen"}:
			variants.add(f"{' '.join(parts[:-1])} Ud Din")
			variants.add(f"{' '.join(parts[:-1])} Ud din")

	# Compact no-space / lowercase email-ish
	compact = re.sub(r"[^A-Za-z]", "", name)
	if compact:
		variants.add(compact)
		variants.add(compact.lower())

	return {v.strip() for v in variants if v and v.strip()}


def get_team_owners(user: str | None = None) -> list[str]:
	"""User IDs (emails) that own Field Visits for this lead's team."""
	user = user or frappe.session.user
	owners = {user}
	for row in get_team_employee_rows(user):
		if row.get("user_id"):
			owners.add(row["user_id"])
	return sorted(owners)


def get_team_match_values(user: str | None = None) -> list[str]:
	"""Values that may appear on Field Visit staff/owner fields for this lead's team."""
	values = set(get_team_owners(user))
	user = user or frappe.session.user

	for row in get_team_employee_rows(user):
		if row.get("name"):
			values.add(row["name"])
		if row.get("employee_name"):
			values.update(_name_variants(row["employee_name"]))
		if row.get("user_id"):
			values.add(row["user_id"])

	return sorted({v for v in values if v})


def get_permission_query_conditions(user: str | None = None) -> str | None:
	"""Restrict Field Visit list/query to own + team visits for field leads/staff."""
	user = user or frappe.session.user
	if can_view_all_field_visits(user):
		return None

	owners = get_team_owners(user)
	names = get_team_match_values(user)
	if not owners and not names:
		return f"(`tabField Visit`.owner = {frappe.db.escape(user)})"

	parts = []
	if owners:
		owner_sql = ", ".join(frappe.db.escape(o) for o in owners)
		parts.append(f"`tabField Visit`.owner IN ({owner_sql})")

	if names:
		name_sql = ", ".join(frappe.db.escape(n) for n in names)
		# Match each staff text field independently (do NOT COALESCE — short
		# names like "M Ajmal" would hide the real owner email otherwise).
		for field in (
			"visit_by",
			"me_visit_by",
			"mt_visit_by",
			"training_entry_filled_by",
			"training_trainer_name",
		):
			parts.append(f"TRIM(IFNULL(`tabField Visit`.`{field}`, '')) IN ({name_sql})")

	return "(" + " OR ".join(parts) + ")"


def has_permission(doc, ptype: str = "read", user: str | None = None) -> bool:
	user = user or frappe.session.user
	if can_view_all_field_visits(user):
		return True

	owners = {o.lower() for o in get_team_owners(user)}
	owner = (getattr(doc, "owner", None) or "").strip().lower()
	if owner and owner in owners:
		return True

	values = {v.lower() for v in get_team_match_values(user)}
	for field in (
		"visit_by",
		"me_visit_by",
		"mt_visit_by",
		"training_entry_filled_by",
		"training_trainer_name",
	):
		c = getattr(doc, field, None)
		if c and str(c).strip().lower() in values:
			return True
	return False


def apply_team_scope_to_conditions(conditions: list, params: dict, alias: str = "fv", user: str | None = None):
	"""Append SQL team-scope condition for report queries (non-view-all users)."""
	user = user or frappe.session.user
	if can_view_all_field_visits(user):
		return

	owners = get_team_owners(user)
	names = get_team_match_values(user)
	if not owners:
		conditions.append(f"{alias}.owner = %(scope_user)s")
		params["scope_user"] = user
		return

	params["scope_user"] = user
	params["team_owners"] = tuple(owners)
	params["team_names"] = tuple(names) if names else ("__none__",)

	parts = [f"{alias}.owner IN %(team_owners)s"]
	for field in (
		"visit_by",
		"me_visit_by",
		"mt_visit_by",
		"training_entry_filled_by",
		"training_trainer_name",
	):
		parts.append(f"TRIM(IFNULL({alias}.`{field}`, '')) IN %(team_names)s")

	conditions.append("(" + " OR ".join(parts) + ")")


@frappe.whitelist()
def get_my_field_team():
	"""API for report filters: list staff the current user may monitor."""
	user = frappe.session.user
	if can_view_all_field_visits(user):
		employees = frappe.get_all(
			"Employee",
			filters={"status": "Active"},
			fields=["name", "employee_name", "user_id"],
			order_by="employee_name asc",
			limit_page_length=500,
		)
		return {
			"view_all": 1,
			"team": [
				{
					"employee": e.name,
					"employee_name": e.employee_name,
					"user_id": e.user_id,
					"label": e.employee_name or e.user_id or e.name,
				}
				for e in employees
				if e.user_id or e.employee_name
			],
		}

	team = get_team_employee_rows(user, include_self=True)
	# Active first for filter dropdown
	active = [e for e in team if True]
	return {
		"view_all": 0,
		"team": [
			{
				"employee": e.get("name"),
				"employee_name": e.get("employee_name"),
				"user_id": e.get("user_id"),
				"label": e.get("employee_name") or e.get("user_id") or e.get("name"),
			}
			for e in active
		],
	}
