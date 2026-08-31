"""Rename Field Visits that were saved with school/person names instead of FV-MM-YY-#####."""

import re

import frappe
from frappe.model.naming import make_autoname
from frappe.model.rename_doc import rename_doc
from frappe.utils import getdate

STANDARD = re.compile(r"^FV-\d{2}-\d{2}-\d+$")


def execute():
	if not frappe.db.table_exists("Field Visit"):
		return

	rows = frappe.get_all("Field Visit", fields=["name"], limit_page_length=5000)
	odd = [r.name for r in rows if not STANDARD.match((r.name or "").strip())]
	if not odd:
		return

	for old in odd:
		if not frappe.db.exists("Field Visit", old):
			continue
		doc = frappe.get_doc("Field Visit", old)
		d = getdate(doc.get_visit_date() or doc.creation)
		new = make_autoname(f"FV-{d.strftime('%m')}-{d.strftime('%y')}-.#####")
		rename_doc("Field Visit", old, new, force=True, ignore_permissions=True, show_alert=False)

	frappe.clear_cache(doctype="Field Visit")
