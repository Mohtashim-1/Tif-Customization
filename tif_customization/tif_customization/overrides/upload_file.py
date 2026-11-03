"""Sanitize multipart upload fields.

Some mobile WebViews send FormData values with a leading CRLF
(e.g. doctype="\\r\\nField Visit"), which makes Frappe look up a
non-existent DocType under frappe.core.doctype.\\r\\nfield_visit.
"""

from __future__ import annotations

import frappe
from frappe.utils import cstr


def _clean_form_dict_keys(*keys: str) -> None:
	for key in keys:
		val = frappe.form_dict.get(key)
		if val is None:
			continue
		cleaned = cstr(val).strip().strip("\ufeff")
		if cleaned != val:
			frappe.form_dict[key] = cleaned


@frappe.whitelist(allow_guest=True)
def upload_file():
	"""Wrap core upload_file after stripping doctype/docname/fieldname."""
	_clean_form_dict_keys("doctype", "docname", "fieldname", "docfield", "file_name", "folder")
	from frappe.handler import upload_file as core_upload_file

	return core_upload_file()
