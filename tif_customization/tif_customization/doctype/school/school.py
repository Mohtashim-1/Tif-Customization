# Copyright (c) 2025, mohtashim and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint, cstr

from tif_customization.tif_customization.doctype.school.school_customer import (
	create_customer_from_school,
)


class School(Document):
	def before_insert(self):
		if frappe.session.user == "Guest" and not self.status:
			self.status = "In Process"

	def validate(self):
		self.validate_contact_details()
		self.validate_school_details()

	def validate_contact_details(self):
		"""Validate contact details"""
		if self.director_principal_email and not frappe.utils.validate_email_address(
			self.director_principal_email
		):
			frappe.throw("Please enter a valid email address for Director/Principal")

		if self.school_email and not frappe.utils.validate_email_address(self.school_email):
			frappe.throw("Please enter a valid email address for School")

	def validate_school_details(self):
		"""Validate school details"""
		if self.category == "CHAIN OF SCHOOL" and not self.no_of_school:
			frappe.throw("Please specify the number of schools for chain of schools")

		if self.no_of_students and self.no_of_students < 0:
			frappe.throw("Number of students cannot be negative")

		if self.total_no_of_quranic_teachers and self.total_no_of_quranic_teachers < 0:
			frappe.throw("Number of Quranic teachers cannot be negative")

	def on_submit(self):
		"""Approval: create Customer (type School) with mapped field data."""
		if not self.customer:
			create_customer_from_school(self)
		if self.status == "In Process":
			self.db_set("status", "Active", update_modified=False)

	def on_cancel(self):
		frappe.msgprint(_("School opening request cancelled. No customer was created or removed."))


@frappe.whitelist()
def send_welcome_email(school):
	"""Send welcome email to the school"""
	try:
		school_doc = frappe.get_doc("School", school)

		if school_doc.director_principal_email:
			subject = "Welcome to TIF - School Registration Confirmation"
			message = f"""
			Dear {school_doc.director_principal_name or 'School Administrator'},

			Thank you for registering your school with The ILM Foundation (TIF).

			School Details:
			- School Name: {school_doc.school_name}
			- Registration ID: {school_doc.name}
			- Status: {school_doc.status}

			We will review your registration and contact you soon with further details.

			Best regards,
			TIF Team
			"""

			frappe.sendmail(
				recipients=[school_doc.director_principal_email],
				subject=subject,
				message=message,
				now=True,
			)

			return True
		frappe.throw("No email address found for the school")

	except Exception as e:
		frappe.log_error(f"Error sending welcome email: {str(e)}")
		frappe.throw("Error sending welcome email")


@frappe.whitelist()
def resolve_school_route(school=None):
	"""Resolve click target: School → Customer → School Opening Application."""
	key = cstr(school).strip()
	if not key or key in ("—", "-"):
		return {"found": 0, "doctype": "", "name": "", "school_name": ""}

	doc = _resolve_school_doc(key)
	if doc:
		return {
			"found": 1,
			"doctype": "School",
			"name": doc.name,
			"school": doc.name,
			"school_name": cstr(doc.school_name).strip() or key,
			"customer": cstr(doc.customer).strip(),
		}

	customer, display = _resolve_customer(key)
	if customer:
		# Prefer School linked to this customer if any.
		sid = frappe.db.get_value("School", {"customer": customer}, "name")
		if sid:
			school_doc = frappe.get_doc("School", sid)
			return {
				"found": 1,
				"doctype": "School",
				"name": school_doc.name,
				"school": school_doc.name,
				"school_name": cstr(school_doc.school_name).strip() or display or key,
				"customer": customer,
			}
		return {
			"found": 1,
			"doctype": "Customer",
			"name": customer,
			"school": "",
			"school_name": display or key,
			"customer": customer,
		}

	soa = _resolve_school_opening(key)
	if soa:
		return {
			"found": 1,
			"doctype": "School Opening Application",
			"name": soa.name,
			"school": "",
			"school_name": cstr(soa.school_name).strip() or key,
			"customer": cstr(soa.customer).strip() if soa.get("customer") else "",
		}

	return {"found": 0, "doctype": "", "name": "", "school_name": key}


@frappe.whitelist()
def get_school_activity_dashboard(school=None, customer=None):
	"""Field visits, representatives, books & programs for School / Customer / SOA / free-text."""
	key = cstr(school).strip()
	customer_id = cstr(customer).strip()
	if not key and not customer_id:
		frappe.throw(_("School is required."))

	route = resolve_school_route(key or customer_id)
	school_doc = None
	soa_doc = None
	school_name = cstr(route.get("school_name") or key or customer_id).strip()
	status = ""

	if route.get("doctype") == "School" and route.get("name"):
		school_doc = frappe.get_doc("School", route["name"])
		customer_id = customer_id or cstr(school_doc.customer).strip()
		school_name = cstr(school_doc.school_name).strip() or school_name
		status = cstr(school_doc.status).strip()
	elif route.get("doctype") == "Customer" and route.get("name"):
		customer_id = route["name"]
		school_name = route.get("school_name") or school_name
		status = cstr(frappe.db.get_value("Customer", customer_id, "disabled") and "Inactive" or "Active")
	elif route.get("doctype") == "School Opening Application" and route.get("name"):
		soa_doc = frappe.db.get_value(
			"School Opening Application",
			route["name"],
			["name", "school_name", "customer", "docstatus"],
			as_dict=True,
		)
		if soa_doc:
			customer_id = customer_id or cstr(soa_doc.customer).strip()
			school_name = cstr(soa_doc.school_name).strip() or school_name
			status = "Submitted" if cint(soa_doc.docstatus) == 1 else "Draft"
	elif customer_id:
		school_name = (
			cstr(frappe.db.get_value("Customer", customer_id, "customer_name") or "").strip()
			or school_name
			or customer_id
		)

	# Free-text / pending school: still load visits by display name.
	if not customer_id:
		customer_id, display = _resolve_customer(school_name or key)
		if display:
			school_name = display

	visits = _school_field_visits(customer=customer_id, school_name=school_name or key)
	representatives = _school_representatives(school_doc, visits, soa=soa_doc)
	programs = _school_programs(school_doc, visits, customer=customer_id)
	books = _school_books(school_doc, visits, customer=customer_id)

	return {
		"school": (school_doc.name if school_doc else "") or "",
		"school_name": school_name or key,
		"customer": customer_id or "",
		"source_doctype": route.get("doctype") or "",
		"source_name": route.get("name") or "",
		"status": status or "—",
		"visit_count": len(visits),
		"visits": visits,
		"representatives": representatives,
		"programs": programs,
		"books": books,
	}


def _resolve_school_doc(school):
	school = cstr(school).strip()
	if not school:
		return None

	if frappe.db.exists("School", school):
		return frappe.get_doc("School", school)

	sid = frappe.db.get_value("School", {"school_name": school}, "name")
	if sid:
		return frappe.get_doc("School", sid)

	sid = frappe.db.sql(
		"""
		SELECT name FROM `tabSchool`
		WHERE LOWER(TRIM(school_name)) = LOWER(%s)
		ORDER BY modified DESC
		LIMIT 1
		""",
		school,
	)
	if sid:
		return frappe.get_doc("School", sid[0][0])

	customer, display = _resolve_customer(school)
	if customer:
		sid = frappe.db.get_value("School", {"customer": customer}, "name")
		if sid:
			return frappe.get_doc("School", sid)

	if display and display != school:
		sid = frappe.db.sql(
			"""
			SELECT name FROM `tabSchool`
			WHERE LOWER(TRIM(school_name)) = LOWER(%s)
			ORDER BY modified DESC
			LIMIT 1
			""",
			display,
		)
		if sid:
			return frappe.get_doc("School", sid[0][0])

	return None


def _resolve_customer(school):
	"""Return (customer_id, display_name)."""
	school = cstr(school).strip()
	if not school:
		return "", ""

	if frappe.db.exists("Customer", school):
		return school, cstr(frappe.db.get_value("Customer", school, "customer_name") or school).strip()

	found = frappe.db.get_value("Customer", {"customer_name": school}, "name")
	if found:
		return found, school

	row = frappe.db.sql(
		"""
		SELECT name, customer_name FROM `tabCustomer`
		WHERE LOWER(TRIM(customer_name)) = LOWER(%s)
		LIMIT 1
		""",
		school,
		as_dict=True,
	)
	if row:
		return row[0].name, cstr(row[0].customer_name).strip() or school
	return "", ""


def _resolve_school_opening(school):
	"""Match SOA by name or school_name; also FV.reference SOA for pending schools."""
	school = cstr(school).strip()
	if not school or not frappe.db.exists("DocType", "School Opening Application"):
		return None

	if frappe.db.exists("School Opening Application", school):
		return frappe.db.get_value(
			"School Opening Application",
			school,
			["name", "school_name", "customer"],
			as_dict=True,
		)

	soa = frappe.db.sql(
		"""
		SELECT name, school_name, customer
		FROM `tabSchool Opening Application`
		WHERE LOWER(TRIM(IFNULL(school_name, ''))) = LOWER(%s)
		ORDER BY modified DESC
		LIMIT 1
		""",
		school,
		as_dict=True,
	)
	if soa:
		return soa[0]

	ref = frappe.db.sql(
		"""
		SELECT reference
		FROM `tabField Visit`
		WHERE docstatus < 2
		  AND IFNULL(reference, '') LIKE 'SOA-%%'
		  AND (
			LOWER(TRIM(IFNULL(pending_school_name, ''))) = LOWER(%s)
			OR LOWER(TRIM(IFNULL(school_name, ''))) = LOWER(%s)
		  )
		ORDER BY modified DESC
		LIMIT 1
		""",
		(school, school),
	)
	if ref and frappe.db.exists("School Opening Application", ref[0][0]):
		return frappe.db.get_value(
			"School Opening Application",
			ref[0][0],
			["name", "school_name", "customer"],
			as_dict=True,
		)
	return None


def _school_field_visits(customer="", school_name=""):
	from tif_customization.tif_customization.api.field_visit_drilldown import (
		_visit_remarks,
		_resolve_visit_officer,
		_owner_display_names,
	)
	from tif_customization.tif_customization.field_visit_permissions import visit_day_sql

	visit_day = visit_day_sql("fv")
	rows = frappe.db.sql(
		f"""
		SELECT
			fv.name,
			fv.type,
			{visit_day} AS visit_date,
			fv.owner,
			fv.visit_by,
			fv.me_visit_by,
			fv.mt_visit_by,
			fv.training_entry_filled_by,
			fv.meeting_with,
			fv.designation,
			fv.designation_other,
			fv.contact_number,
			fv.status AS visit_status,
			fv.mt_remarks,
			fv.ot_remarks,
			fv.school_remarks_follow_up,
			fv.school_additional_remarks,
			fv.travel_remarks,
			fv.ot_academic_task_other,
			fv.ot_other_official_task_detail,
			fv.me_mqh_book_status,
			fv.me_mqh_book_version,
			fv.me_mqh_book_part,
			fv.me_activity_status,
			fv.me_inactive_reasons,
			fv.me_reason_of_above,
			fv.me_teachers_training_session,
			fv.qps_affiliated,
			fv.tps_affiliated,
			fv.cee_affiliated,
			fv.qps_mqh_books,
			fv.qps_mqh_teachers_guides,
			fv.qps_onsite_training,
			fv.qps_online_training,
			fv.qps_meeting_educationalist,
			fv.qps_registration_lms,
			fv.qps_50_days_syllabus,
			fv.qps_mqh_quiz,
			fv.tps_noorani_qaida,
			fv.tps_noorani_qaida_guide,
			fv.tps_noorani_qaida_workbook_khi,
			fv.tps_1_day_tajweed_females,
			fv.tps_ttc_tajweed_khi,
			fv.tps_tajweed_customize,
			fv.tps_tajweed_workshop_kids_khi,
			fv.cee_elp,
			fv.cee_tecc_foundation,
			fv.cee_tecc_professional,
			fv.cee_one_day_workshop,
			fv.mt_mqh_sample_provided,
			fv.training_session_category,
			fv.training_workshop_topic,
			fv.training_no_of_participants
		FROM `tabField Visit` fv
		LEFT JOIN `tabCustomer` c ON c.name = fv.school_name
		LEFT JOIN `tabCustomer` mc ON mc.name = fv.me_school_name
		WHERE fv.docstatus < 2
		  AND (
			(%(customer)s != '' AND (fv.school_name = %(customer)s OR fv.me_school_name = %(customer)s))
			OR (
				%(school_name)s != ''
				AND (
					LOWER(TRIM(IFNULL(c.customer_name, ''))) = LOWER(%(school_name)s)
					OR LOWER(TRIM(IFNULL(mc.customer_name, ''))) = LOWER(%(school_name)s)
					OR LOWER(TRIM(IFNULL(fv.pending_school_name, ''))) = LOWER(%(school_name)s)
					OR LOWER(TRIM(IFNULL(fv.school_name, ''))) = LOWER(%(school_name)s)
					OR LOWER(TRIM(IFNULL(fv.me_school_name, ''))) = LOWER(%(school_name)s)
					OR LOWER(TRIM(IFNULL(fv.mt_institute_or_organization_name, ''))) = LOWER(%(school_name)s)
					OR LOWER(TRIM(IFNULL(fv.training_venue_name, ''))) = LOWER(%(school_name)s)
				)
			)
		  )
		ORDER BY visit_date DESC, fv.creation DESC
		LIMIT 100
		""",
		{"customer": customer or "", "school_name": school_name or ""},
		as_dict=True,
	)

	owner_names = _owner_display_names([row.owner for row in rows if row.owner])
	visit_names = [row.name for row in rows]
	contacts_by_parent = _visit_contacts_map(visit_names)

	out = []
	for row in rows:
		officer = _resolve_visit_officer(
			row.get("visit_by"),
			row.get("me_visit_by"),
			row.get("mt_visit_by"),
			row.get("training_entry_filled_by"),
		) or owner_names.get(row.owner) or cstr(row.owner).strip()
		out.append(
			{
				"name": row.name,
				"visit_date": str(row.visit_date) if row.visit_date else "",
				"type": cstr(row.type).strip(),
				"field_officer": officer,
				"remarks": _visit_remarks(row),
				"meeting_with": cstr(row.meeting_with).strip(),
				"designation": cstr(row.designation_other or row.designation).strip(),
				"contact_number": cstr(row.contact_number).strip(),
				"contacts": contacts_by_parent.get(row.name) or [],
				"qps_affiliated": cstr(row.qps_affiliated).strip(),
				"tps_affiliated": cstr(row.tps_affiliated).strip(),
				"cee_affiliated": cstr(row.cee_affiliated).strip(),
				"books_line": _books_line_from_row(row),
				"program_line": _program_line_from_row(row),
			}
		)
	return out


def _visit_contacts_map(visit_names):
	if not visit_names:
		return {}
	rows = frappe.db.sql(
		"""
		SELECT parent, person_name, contact_number, designation, designation_other
		FROM `tabField Visit School Contact`
		WHERE parent IN %(parents)s
		ORDER BY idx
		""",
		{"parents": tuple(visit_names)},
		as_dict=True,
	)
	out = {}
	for row in rows:
		out.setdefault(row.parent, []).append(
			{
				"person_name": cstr(row.person_name).strip(),
				"contact_number": cstr(row.contact_number).strip(),
				"designation": cstr(row.designation_other or row.designation).strip(),
				"source": "Field Visit",
			}
		)
	return out


def _school_representatives(doc, visits, soa=None):
	reps = []
	seen = set()

	def add(name, phone="", designation="", source="School"):
		person = cstr(name).strip()
		if not person:
			return
		key = (person.lower(), cstr(phone).strip(), cstr(designation).strip().lower())
		if key in seen:
			return
		seen.add(key)
		reps.append(
			{
				"person_name": person,
				"contact_number": cstr(phone).strip(),
				"designation": cstr(designation).strip(),
				"source": source,
			}
		)

	if doc:
		add(doc.director_principal_name, doc.director_principal_contact, "Director / Principal")
		add(doc.vice_president, "", "Vice President")
		add(doc.coordinator, "", "Coordinator")
		add(doc.incharge, "", "Incharge")
		add(doc.contact_person, doc.contact_number, "Contact Person")

	if soa and soa.get("name") and frappe.db.exists("DocType", "School Opening Contact"):
		for row in frappe.get_all(
			"School Opening Contact",
			filters={"parent": soa.name},
			fields=["contact_name", "cell_no", "role"],
			order_by="idx",
		):
			add(row.contact_name, row.cell_no, row.role, "School Opening")

	for visit in visits:
		add(visit.get("meeting_with"), visit.get("contact_number"), visit.get("designation"), "Field Visit")
		for contact in visit.get("contacts") or []:
			add(
				contact.get("person_name"),
				contact.get("contact_number"),
				contact.get("designation"),
				"Field Visit",
			)
	return reps


def _school_programs(doc, visits, customer=None):
	programs = []
	if doc:
		programs.extend(
			[
				{"name": "QPS", "status": cstr(doc.qps).strip() or "—", "source": "School"},
				{"name": "TPS", "status": cstr(doc.tps).strip() or "—", "source": "School"},
				{"name": "CEE", "status": cstr(doc.cee).strip() or "—", "source": "School"},
			]
		)
		allowed = cstr(doc.allowed_program).strip()
		if allowed:
			programs.append({"name": "Allowed Program", "status": allowed, "source": "School"})
	elif customer and frappe.get_meta("Customer").has_field("custom_books"):
		# custom_books sometimes stores program/services summary on Customer
		pass

	latest_bits = []
	for visit in visits[:5]:
		line = cstr(visit.get("program_line")).strip()
		if line and line not in latest_bits:
			latest_bits.append(line)
	if latest_bits:
		programs.append(
			{
				"name": "Latest Field Visit Programs",
				"status": " · ".join(latest_bits[:3]),
				"source": "Field Visit",
			}
		)
	if not programs:
		programs = [{"name": "Programs", "status": "No program master data yet", "source": "—"}]
	return programs


def _school_books(doc, visits, customer=None):
	books = []
	if doc:
		school_books = cstr(doc.books).strip()
		if school_books:
			books.append({"label": "Books (School)", "detail": school_books, "source": "School"})

		for row in doc.get("books_curriculum_information") or []:
			bits = [
				cstr(row.get("mqh_version")).strip(),
				cstr(row.get("mqh")).strip(),
				cstr(row.get("class")).strip(),
			]
			detail = " · ".join([b for b in bits if b])
			students = row.get("no_of_student")
			if students not in (None, "", 0, "0"):
				detail = f"{detail} ({students} students)" if detail else f"{students} students"
			if detail:
				books.append({"label": "Curriculum", "detail": detail, "source": "School"})

	if customer and frappe.get_meta("Customer").has_field("custom_books"):
		cust_books = cstr(frappe.db.get_value("Customer", customer, "custom_books") or "").strip()
		if cust_books:
			books.append({"label": "Books (Customer)", "detail": cust_books, "source": "Customer"})

	for visit in visits[:8]:
		line = cstr(visit.get("books_line")).strip()
		if line:
			books.append(
				{
					"label": f"Visit {visit.get('name')}",
					"detail": line,
					"source": "Field Visit",
				}
			)
	return books


def _books_line_from_row(row):
	from tif_customization.tif_customization.api.field_visit_drilldown import _books_heading

	return _books_heading(row)


def _program_line_from_row(row):
	from tif_customization.tif_customization.api.field_visit_drilldown import _program_heading

	return _program_heading(row)
