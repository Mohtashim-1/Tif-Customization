# Copyright (c) 2026, The Ilm Foundation and contributors
# License: MIT

"""User Wise Rights Report — roles, DocType permissions, and User Permissions."""

from __future__ import annotations

import json

import frappe
from frappe import _
from frappe.utils import cint

PERM_FIELDS = (
	"select",
	"read",
	"write",
	"create",
	"delete",
	"submit",
	"cancel",
	"amend",
	"report",
	"export",
	"import",
	"share",
	"print",
	"email",
)


def _parse_filters(filters):
	if isinstance(filters, str):
		filters = json.loads(filters)
	return filters or {}


def _require_manager():
	if frappe.session.user == "Administrator":
		return
	roles = set(frappe.get_roles())
	if "System Manager" not in roles and "Administrator" not in roles:
		frappe.throw(_("Only System Manager can open User Wise Rights Report."), frappe.PermissionError)


@frappe.whitelist()
def get_report_data(filters=None):
	"""Return user-wise roles summary, or DocType / User Permission detail for one user."""
	_require_manager()
	filters = _parse_filters(filters)

	view = (filters.get("view") or "summary").strip()
	user = (filters.get("user") or "").strip()
	role = (filters.get("role") or "").strip()
	status = (filters.get("status") or "Enabled").strip()
	doctype = (filters.get("doctype") or "").strip()

	if view == "doctype_rights":
		if not user:
			frappe.throw(_("Select a User to view DocType rights."))
		return _doctype_rights(user, doctype)
	if view == "user_permissions":
		return _user_permissions(user=user or None, allow=doctype or None)

	return _summary(user=user or None, role=role or None, status=status)


def _summary(user=None, role=None, status="Enabled"):
	params = {}
	where = ["u.name NOT IN ('Guest', 'Administrator')"]

	if status == "Enabled":
		where.append("u.enabled = 1")
	elif status == "Disabled":
		where.append("u.enabled = 0")

	if user:
		where.append("u.name = %(user)s")
		params["user"] = user

	role_join = ""
	if role:
		role_join = """
			INNER JOIN `tabHas Role` hr_f
				ON hr_f.parent = u.name
				AND hr_f.parenttype = 'User'
				AND hr_f.role = %(role)s
		"""
		params["role"] = role

	users = frappe.db.sql(
		f"""
		SELECT
			u.name AS user,
			u.full_name,
			u.enabled,
			u.user_type,
			u.email,
			u.last_active,
			u.creation
		FROM `tabUser` u
		{role_join}
		WHERE {" AND ".join(where)}
		ORDER BY u.enabled DESC, u.full_name, u.name
		""",
		params,
		as_dict=True,
	)

	if not users:
		return {
			"view": "summary",
			"rows": [],
			"summary": {"users": 0, "enabled": 0, "disabled": 0, "roles_assigned": 0, "user_permissions": 0},
		}

	user_names = [u.user for u in users]

	role_rows = frappe.db.sql(
		"""
		SELECT parent AS user, role
		FROM `tabHas Role`
		WHERE parenttype = 'User'
			AND parent IN %(users)s
			AND IFNULL(role, '') != ''
		ORDER BY parent, role
		""",
		{"users": user_names},
		as_dict=True,
	)

	roles_by_user = {}
	for r in role_rows:
		roles_by_user.setdefault(r.user, []).append(r.role)

	up_counts = dict(
		frappe.db.sql(
			"""
			SELECT user, COUNT(*)
			FROM `tabUser Permission`
			WHERE user IN %(users)s
			GROUP BY user
			""",
			{"users": user_names},
		)
	)

	block_modules = frappe.db.sql(
		"""
		SELECT parent AS user, module
		FROM `tabBlock Module`
		WHERE parenttype = 'User'
			AND parent IN %(users)s
		ORDER BY parent, module
		""",
		{"users": user_names},
		as_dict=True,
	)
	modules_by_user = {}
	for b in block_modules:
		modules_by_user.setdefault(b.user, []).append(b.module)

	rows = []
	enabled = disabled = roles_assigned = user_permissions = 0
	for u in users:
		roles = roles_by_user.get(u.user, [])
		up_count = cint(up_counts.get(u.user))
		blocked = modules_by_user.get(u.user, [])
		if u.enabled:
			enabled += 1
		else:
			disabled += 1
		roles_assigned += len(roles)
		user_permissions += up_count
		rows.append(
			{
				"user": u.user,
				"full_name": u.full_name or u.user,
				"enabled": cint(u.enabled),
				"user_type": u.user_type or "",
				"email": u.email or u.user,
				"last_active": str(u.last_active) if u.last_active else "",
				"roles": roles,
				"role_count": len(roles),
				"user_permission_count": up_count,
				"blocked_modules": blocked,
				"blocked_module_count": len(blocked),
			}
		)

	return {
		"view": "summary",
		"rows": rows,
		"summary": {
			"users": len(rows),
			"enabled": enabled,
			"disabled": disabled,
			"roles_assigned": roles_assigned,
			"user_permissions": user_permissions,
		},
	}


def _role_perm_rows(roles):
	"""DocType permissions for roles — Custom DocPerm overrides standard DocPerm per role+doctype+level."""
	if not roles:
		return []

	fields = ", ".join(f"`{f}`" for f in PERM_FIELDS)
	custom = frappe.db.sql(
		f"""
		SELECT parent AS doctype, role, permlevel, if_owner, {fields}
		FROM `tabCustom DocPerm`
		WHERE role IN %(roles)s
		""",
		{"roles": roles},
		as_dict=True,
	)
	custom_keys = {(c.doctype, c.role, cint(c.permlevel)) for c in custom}

	standard = frappe.db.sql(
		f"""
		SELECT parent AS doctype, role, permlevel, if_owner, {fields}
		FROM `tabDocPerm`
		WHERE role IN %(roles)s
		""",
		{"roles": roles},
		as_dict=True,
	)

	combined = list(custom)
	for s in standard:
		key = (s.doctype, s.role, cint(s.permlevel))
		if key not in custom_keys:
			combined.append(s)
	return combined


def _merge_user_perms(role_rows):
	"""OR permissions across roles for the same DocType + permlevel (+ if_owner)."""
	merged = {}
	for row in role_rows:
		key = (row.doctype, cint(row.permlevel), cint(row.if_owner))
		bucket = merged.get(key)
		if not bucket:
			bucket = {
				"doctype": row.doctype,
				"permlevel": cint(row.permlevel),
				"if_owner": cint(row.if_owner),
				"roles": set(),
			}
			for f in PERM_FIELDS:
				bucket[f] = 0
			merged[key] = bucket
		bucket["roles"].add(row.role)
		for f in PERM_FIELDS:
			if cint(row.get(f)):
				bucket[f] = 1

	out = []
	for bucket in merged.values():
		item = dict(bucket)
		item["roles"] = sorted(item["roles"])
		item["role_count"] = len(item["roles"])
		out.append(item)

	out.sort(key=lambda r: (r["doctype"].lower(), r["permlevel"], -r["if_owner"]))
	return out


def _doctype_rights(user, doctype_filter=None):
	if not frappe.db.exists("User", user):
		frappe.throw(_("User {0} not found").format(user))

	user_doc = frappe.db.get_value(
		"User",
		user,
		["name", "full_name", "enabled", "user_type", "email"],
		as_dict=True,
	)
	roles = frappe.get_roles(user)
	# Guest is always present from get_roles for anonymous; for named users strip Guest if unwanted
	roles = [r for r in roles if r and r != "Guest"]

	role_rows = _role_perm_rows(roles)
	if doctype_filter:
		role_rows = [r for r in role_rows if r.doctype == doctype_filter]

	rows = _merge_user_perms(role_rows)

	# Prefer doctypes where user has at least read or select
	active = [r for r in rows if r.get("read") or r.get("select") or r.get("write") or r.get("create")]

	up_rows = frappe.get_all(
		"User Permission",
		filters={"user": user},
		fields=["name", "allow", "for_value", "is_default", "apply_to_all_doctypes", "applicable_for", "hide_descendants"],
		order_by="allow, for_value",
	)

	blocked = frappe.get_all(
		"Block Module",
		filters={"parent": user, "parenttype": "User"},
		pluck="module",
		order_by="module",
	)

	return {
		"view": "doctype_rights",
		"user": {
			"user": user_doc.name,
			"full_name": user_doc.full_name or user_doc.name,
			"enabled": cint(user_doc.enabled),
			"user_type": user_doc.user_type or "",
			"email": user_doc.email or user_doc.name,
			"roles": roles,
			"blocked_modules": blocked,
		},
		"rows": active,
		"user_permissions": up_rows,
		"summary": {
			"roles": len(roles),
			"doctypes": len(active),
			"user_permissions": len(up_rows),
			"blocked_modules": len(blocked),
		},
		"perm_fields": list(PERM_FIELDS),
	}


def _user_permissions(user=None, allow=None):
	filters = {}
	if user:
		filters["user"] = user
	if allow:
		filters["allow"] = allow

	rows = frappe.get_all(
		"User Permission",
		filters=filters,
		fields=[
			"name",
			"user",
			"allow",
			"for_value",
			"is_default",
			"apply_to_all_doctypes",
			"applicable_for",
			"hide_descendants",
		],
		order_by="user, allow, for_value",
		limit_page_length=5000,
	)

	# Enrich with full name
	users = {r.user for r in rows}
	names = {}
	if users:
		names = dict(
			frappe.db.sql(
				"""
				SELECT name, COALESCE(NULLIF(full_name, ''), name)
				FROM `tabUser`
				WHERE name IN %(users)s
				""",
				{"users": list(users)},
			)
		)
	for r in rows:
		r["full_name"] = names.get(r.user, r.user)

	return {
		"view": "user_permissions",
		"rows": rows,
		"summary": {
			"rows": len(rows),
			"users": len(users),
			"doctypes": len({r.allow for r in rows}),
		},
	}
