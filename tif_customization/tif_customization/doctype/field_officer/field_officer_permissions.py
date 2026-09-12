# Copyright (c) 2026, TIF Customization and contributors
# License: MIT
"""Row-level access for Field Officer records."""

from __future__ import annotations

import frappe

MANAGER_ROLES = {"System Manager", "HR Manager", "Field Staff Manager"}


def _user_roles(user: str | None = None) -> set[str]:
	user = user or frappe.session.user
	return set(frappe.get_roles(user))


def _is_manager(user: str | None = None) -> bool:
	return bool(_user_roles(user) & MANAGER_ROLES)


def _my_field_officer(user: str | None = None) -> str | None:
	user = user or frappe.session.user
	if not user or user == "Guest":
		return None
	return frappe.db.get_value("Field Officer", {"user": user, "status": "Active"}, "name")


def _supervised_field_officers(user: str | None = None) -> set[str]:
	"""Field Officer names this user may view (self + direct field reports)."""
	user = user or frappe.session.user
	allowed = set()
	mine = _my_field_officer(user)
	if mine:
		allowed.add(mine)
		for name in frappe.get_all(
			"Field Officer",
			filters={"parent_field_officer": mine, "status": "Active"},
			pluck="name",
		):
			allowed.add(name)
	return allowed


def get_permission_query_conditions(user: str | None = None) -> str | None:
	user = user or frappe.session.user
	if user == "Administrator" or _is_manager(user):
		return None

	roles = _user_roles(user)
	if "Supervisor Field Staff" not in roles and "Field Staff" not in roles:
		return "`tabField Officer`.name = ''"

	allowed = _supervised_field_officers(user)
	if not allowed:
		return f"(`tabField Officer`.user = {frappe.db.escape(user)})"

	names = ", ".join(frappe.db.escape(n) for n in sorted(allowed))
	return f"`tabField Officer`.name IN ({names})"


def has_permission(doc, ptype: str = "read", user: str | None = None) -> bool:
	user = user or frappe.session.user
	if user == "Administrator" or _is_manager(user):
		return True

	roles = _user_roles(user)
	if ptype != "read" and "Supervisor Field Staff" in roles:
		return False
	if "Supervisor Field Staff" not in roles and "Field Staff" not in roles:
		return False

	allowed = _supervised_field_officers(user)
	return doc.name in allowed
