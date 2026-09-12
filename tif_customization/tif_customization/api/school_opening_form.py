# Copyright (c) 2026, TIF Customization and contributors
# License: MIT

import json

import frappe
from frappe import _
from frappe.utils import cstr, getdate, now_datetime

CONTACT_ROLES = [
	"Director",
	"Administrator",
	"Principal",
	"Vice Principal",
	"Academic Manager",
	"Academic Coordinator",
	"Admin Person",
	"Receptionist",
	"Coordinator",
]



def _list_to_csv(value):
	if value is None:
		return ""
	if isinstance(value, str):
		return value.strip()
	if isinstance(value, (list, tuple)):
		return ", ".join(cstr(v).strip() for v in value if cstr(v).strip())
	return cstr(value)


@frappe.whitelist(allow_guest=True)
def get_school_opening_form_context():
	return {
		"contact_roles": CONTACT_ROLES,
		"form_no": "SC-1.2",
	}


@frappe.whitelist(allow_guest=True, methods=["POST"])
def submit_school_opening_application():
	"""Guest submission from the document-style public form."""
	raw = frappe.form_dict.get("payload") or frappe.form_dict.get("data")
	if not raw:
		try:
			if frappe.request and frappe.request.form:
				raw = frappe.request.form.get("payload")
		except RuntimeError:
			pass
	if not raw:
		frappe.throw(_("No form data received."))
	if isinstance(raw, str):
		data = json.loads(raw)
	else:
		data = raw

	school_name = (data.get("school_name") or "").strip()
	if not school_name:
		frappe.throw(_("Name of School is required."))

	doc = frappe.new_doc("School Opening Application")
	doc.form_date = data.get("form_date") or getdate()
	doc.school_name = school_name
	doc.tif_representative = data.get("tif_representative")
	doc.institution_types = _list_to_csv(data.get("institution_types"))
	doc.institution_category = data.get("institution_category")
	doc.educational_system = _list_to_csv(data.get("educational_system"))
	doc.type_of_school = data.get("type_of_school")
	doc.no_of_campuses = data.get("no_of_campuses")
	doc.no_of_students = data.get("no_of_students")
	doc.structure = data.get("structure")
	doc.academic_shift = data.get("academic_shift")
	doc.teacher_training_services = _list_to_csv(data.get("teacher_training_services"))
	doc.tilawat_services = _list_to_csv(data.get("tilawat_services"))
	doc.quran_program_services = _list_to_csv(data.get("quran_program_services"))
	doc.running_tif_services = _list_to_csv(data.get("running_tif_services"))
	doc.curriculum_in_use = _list_to_csv(data.get("curriculum_in_use"))
	doc.curriculum_others = data.get("curriculum_others")
	doc.fee_structure = data.get("fee_structure")
	doc.website = data.get("website")
	doc.facebook = data.get("facebook")
	doc.instagram = data.get("instagram")
	doc.linkedin = data.get("linkedin")
	doc.other_links = data.get("other_links")
	doc.address = data.get("address")
	doc.area = data.get("area")
	doc.province = data.get("province")
	doc.city = data.get("city")
	doc.country = data.get("country") or "Pakistan"
	doc.marketing_sample_provided = data.get("marketing_sample_provided")
	doc.school_ptcl = data.get("school_ptcl")
	doc.school_mobile = data.get("school_mobile")
	doc.school_whatsapp = data.get("school_whatsapp")
	doc.school_email = data.get("school_email")

	contacts = data.get("key_contacts") or {}
	for role in CONTACT_ROLES:
		row = contacts.get(role) or {}
		doc.append(
			"key_contacts",
			{
				"role": role,
				"contact_name": (row.get("name") or "").strip(),
				"cell_no": (row.get("cell") or "").strip(),
			},
		)

	doc.flags.ignore_permissions = True
	doc.insert()

	_save_request_attachments(doc)

	frappe.db.commit()

	return {
		"name": doc.name,
		"message": _(
			"Your School Opening form was submitted successfully. Reference: {0}. Our team will review it shortly."
		).format(doc.name),
	}


def _save_request_attachments(doc):
	from frappe.utils.file_manager import save_file

	try:
		files = frappe.request.files or {}
	except RuntimeError:
		files = {}
	for key, storage in files.items():
		fieldname = FILE_FIELD_MAP.get(key)
		if not fieldname or not storage:
			continue
		content = storage.stream.read()
		if not content:
			continue
		ret = save_file(
			storage.filename,
			content,
			doc.doctype,
			doc.name,
			is_private=0,
		)
		if ret and ret.file_url:
			doc.db_set(fieldname, ret.file_url, update_modified=False)
