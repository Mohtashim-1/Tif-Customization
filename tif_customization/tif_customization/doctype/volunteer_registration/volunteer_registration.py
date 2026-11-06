# Copyright (c) 2026, TIF Customization and contributors
# License: MIT

import frappe
from frappe.model.document import Document
from frappe.utils import cstr, getdate


class VolunteerRegistration(Document):
	pass


def sync_volunteer_from_field_visit(doc, method=None):
	"""Keep Volunteer Registration in sync when Field Visit (Enrolment of Volunteers) is saved/submitted."""
	if (doc.type or "").strip() != "Enrolment of Volunteers":
		return
	if cint(doc.docstatus) == 2:
		# Cancelled — leave Volunteer Registration as historical record
		return

	from tif_customization.tif_customization.page.volunteer_ambassador_dashboard.volunteer_ambassador_dashboard import (
		_field_officer_label,
	)

	visit_date = None
	try:
		visit_date = doc.get_visit_date()
	except Exception:
		visit_date = doc.visit_date
	officer = _field_officer_label(doc.visit_by, getattr(doc, "me_visit_by", None))
	if not officer:
		raw = cstr(doc.visit_by or "").strip()
		if raw and raw.lower() not in ("administrator", "guest", "admin"):
			officer = raw

	for row in doc.get("volunteer_enrolments") or []:
		_upsert_from_child(row, doc.name, visit_date, officer, doc.docstatus)


def _upsert_from_child(row, visit_name, visit_date, officer, docstatus):
	source_row = cstr(row.name or "").strip()
	if not source_row:
		return
	name = frappe.db.get_value("Volunteer Registration", {"source_row": source_row}, "name")
	payload = {
		"volunteer_name": cstr(row.volunteer_name).strip(),
		"contact_number": cstr(row.contact_number).strip(),
		"email": cstr(getattr(row, "email", "") or "").strip(),
		"profession": cstr(getattr(row, "profession", "") or "").strip(),
		"contribution": cstr(getattr(row, "contribution", "") or "").strip(),
		"province": cstr(getattr(row, "province", "") or "").strip() or None,
		"city": cstr(getattr(row, "city", "") or "").strip() or None,
		"area": cstr(getattr(row, "area", "") or "").strip(),
		"address": cstr(getattr(row, "address", "") or "").strip(),
		"school": cstr(getattr(row, "school", "") or "").strip() or None,
		"volunteer_form_submitted": cstr(
			getattr(row, "volunteer_form_submitted", "") or "No"
		).strip()
		or "No",
		"remarks": cstr(getattr(row, "remarks", "") or "").strip(),
		"visit_date": getdate(visit_date) if visit_date else None,
		"field_officer": officer or "",
		"field_visit": visit_name,
		"source_row": source_row,
	}
	if not payload["volunteer_name"]:
		return

	# Skip invalid email so Data(Email) doesn't block sync
	if payload["email"]:
		try:
			from frappe.utils import validate_email_address

			if not validate_email_address(payload["email"], throw=False):
				payload["email"] = ""
		except Exception:
			payload["email"] = ""

	# City link: blank if not in City master (resolve case-insensitive)
	if payload["city"]:
		city_name = frappe.db.sql(
			"""
			SELECT name FROM `tabCity`
			WHERE LOWER(TRIM(name)) = %s
			   OR LOWER(TRIM(IFNULL(city, ''))) = %s
			LIMIT 1
			""",
			(payload["city"].lower(), payload["city"].lower()),
		)
		payload["city"] = city_name[0][0] if city_name else None

	valid_provinces = {
		"Punjab",
		"Sindh",
		"Khyber Pakhtunkhwa",
		"Balochistan",
		"Azad Jammu & Kashmir",
		"Gilgit-Baltistan",
		"Islamabad Capital Territory",
	}
	if payload["province"] and payload["province"] not in valid_provinces:
		payload["province"] = None

	if name:
		doc = frappe.get_doc("Volunteer Registration", name)
		doc.update(payload)
		doc.flags.ignore_permissions = True
		doc.save(ignore_permissions=True)
	else:
		doc = frappe.get_doc({"doctype": "Volunteer Registration", **payload})
		doc.flags.ignore_permissions = True
		doc.insert(ignore_permissions=True)


def cint(v):
	try:
		return int(v or 0)
	except Exception:
		return 0


@frappe.whitelist()
def sync_all_from_field_visits():
	"""One-shot / maintenance: copy all Enrolment of Volunteers child rows into Volunteer Registration."""
	if not frappe.has_permission("Volunteer Registration", "create"):
		frappe.throw(frappe._("Not permitted"), frappe.PermissionError)

	visits = frappe.get_all(
		"Field Visit",
		filters={"type": "Enrolment of Volunteers", "docstatus": ["<", 2]},
		pluck="name",
	)
	before = frappe.db.count("Volunteer Registration")
	for visit_name in visits:
		doc = frappe.get_doc("Field Visit", visit_name)
		sync_volunteer_from_field_visit(doc)
	frappe.db.commit()
	total = frappe.db.count("Volunteer Registration")
	return {
		"message": frappe._(
			"Synced. Volunteer Registration records: {0} (was {1})"
		).format(total, before),
		"total": total,
		"before": before,
	}
