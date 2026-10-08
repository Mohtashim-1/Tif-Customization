# Copyright (c) 2026, TIF Customization and contributors
# License: MIT
"""Keep Attach / Attach Image fields in sync when a File is linked to them.

Desk ControlAttach uploads a File with attached_to_* set, then relies on
frm.save() to write file_url onto the parent. That save often does not persist
(race, silent client failure, submit without the field). Result: File exists in
Attachments but the Attach field stays empty.

This hook writes the URL onto the parent as soon as the File is inserted.
"""

from __future__ import annotations

import frappe

ATTACH_FIELDTYPES = ("Attach", "Attach Image")


def _is_attach_field(doctype: str, fieldname: str) -> bool:
	if not doctype or not fieldname:
		return False
	try:
		df = frappe.get_meta(doctype).get_field(fieldname)
	except Exception:
		return False
	return bool(df and df.fieldtype in ATTACH_FIELDTYPES)


def sync_attach_field_from_file(doc, method=None):
	"""File after_insert: copy file_url onto parent Attach field."""
	if getattr(doc, "is_folder", None):
		return
	doctype = doc.attached_to_doctype
	name = doc.attached_to_name
	fieldname = doc.attached_to_field
	file_url = doc.file_url
	if not (doctype and name and fieldname and file_url):
		return
	if not _is_attach_field(doctype, fieldname):
		return
	if not frappe.db.exists(doctype, name):
		return

	current = frappe.db.get_value(doctype, name, fieldname)
	if current == file_url:
		return

	frappe.db.set_value(doctype, name, fieldname, file_url, update_modified=False)


def _fill_empty_attach_fields(doctype: str, name: str) -> dict:
	"""Fill empty Attach fields from linked File rows. Returns updated map."""
	meta = frappe.get_meta(doctype)
	attach_fields = [
		df.fieldname for df in meta.fields if df.fieldtype in ATTACH_FIELDTYPES
	]
	if not attach_fields:
		return {}

	files = frappe.get_all(
		"File",
		filters={
			"attached_to_doctype": doctype,
			"attached_to_name": name,
			"attached_to_field": ("in", attach_fields),
		},
		fields=["file_url", "attached_to_field", "creation"],
		order_by="creation desc",
	)
	by_field: dict[str, str] = {}
	for row in files:
		fn = row.attached_to_field
		if fn and row.file_url and fn not in by_field:
			by_field[fn] = row.file_url

	updated = {}
	for fieldname, file_url in by_field.items():
		current = frappe.db.get_value(doctype, name, fieldname)
		if current:
			continue
		frappe.db.set_value(doctype, name, fieldname, file_url, update_modified=False)
		updated[fieldname] = file_url
	return updated


@frappe.whitelist()
def sync_doc_attach_fields(doctype: str, name: str):
	"""Fill empty Attach fields on a document from linked File rows. Returns updated map."""
	frappe.has_permission(doctype, "read", doc=name, throw=True)
	updated = _fill_empty_attach_fields(doctype, name)
	if updated:
		frappe.db.commit()
	return updated


def backfill_attach_fields(doctypes=None, limit: int = 0) -> dict:
	"""One-shot repair: set empty Attach fields from File.attached_to_field."""
	doctypes = doctypes or [
		"School Opening Application",
		"Field Visit",
	]
	stats = {}
	for doctype in doctypes:
		if not frappe.db.exists("DocType", doctype):
			continue
		meta = frappe.get_meta(doctype)
		attach_fields = [
			df.fieldname for df in meta.fields if df.fieldtype in ATTACH_FIELDTYPES
		]
		if not attach_fields:
			stats[doctype] = 0
			continue

		empty_clauses = " OR ".join(f"(IFNULL(`{f}`, '') = '')" for f in attach_fields)
		limit_sql = f"LIMIT {int(limit)}" if limit else ""
		names = frappe.db.sql(
			f"""
			SELECT name FROM `tab{doctype}`
			WHERE {empty_clauses}
			ORDER BY modified DESC
			{limit_sql}
			""",
			pluck=True,
		)
		count = 0
		for name in names:
			if _fill_empty_attach_fields(doctype, name):
				count += 1
		frappe.db.commit()
		stats[doctype] = count
	return stats

