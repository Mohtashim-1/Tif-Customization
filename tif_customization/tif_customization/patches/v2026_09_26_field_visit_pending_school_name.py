# Copyright (c) 2026, TIF Customization and contributors
# License: MIT
"""Backfill pending_school_name from School Opening remarks on Field Visit."""

from __future__ import annotations

import re

import frappe

_PENDING_RE = re.compile(
	r"Pending school \(School Opening\s+([^)]+)\):\s*(.+?)(?:\n|$)",
	re.IGNORECASE,
)


def execute():
	if not frappe.db.exists("DocType", "Field Visit"):
		return
	if not frappe.db.has_column("Field Visit", "pending_school_name"):
		return

	rows = frappe.db.sql(
		"""
		SELECT name, school_additional_remarks, reference
		FROM `tabField Visit`
		WHERE IFNULL(school_name, '') = ''
		  AND IFNULL(pending_school_name, '') = ''
		  AND school_additional_remarks LIKE 'Pending school%%'
		""",
		as_dict=True,
	)
	for row in rows:
		text = row.school_additional_remarks or ""
		m = _PENDING_RE.search(text)
		if not m:
			continue
		soa = (m.group(1) or "").strip()
		pending = (m.group(2) or "").strip()
		vals = {}
		if pending:
			vals["pending_school_name"] = pending[:500]
		if soa and not (row.reference or "").strip():
			vals["reference"] = soa
		if vals:
			frappe.db.set_value("Field Visit", row.name, vals, update_modified=False)
