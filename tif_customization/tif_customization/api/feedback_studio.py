# Copyright (c) 2026, mohtashim and contributors
# For license information, please see license.txt

import json
import re

import frappe
from frappe import _
from frappe.rate_limiter import rate_limit
from frappe.utils import cint, cstr, get_url, now_datetime

AUDIENCES = ("school", "teacher", "parent", "student", "sme")
PUBLIC_ROLES = ("parent", "student", "teacher", "school")
TYPES = ("rating", "choice", "yesno", "text")
TOKEN_RE = re.compile(r"^[A-Fa-f0-9]{16,64}$")
QID_RE = re.compile(r"^[A-Za-z0-9_-]{1,40}$")

LABELS = {
	"school": "School",
	"teacher": "Teacher",
	"parent": "Parent",
	"student": "Student",
	"sme": "SME",
}
COLORS = {
	"school": "#2f5bd3",
	"teacher": "#0f766e",
	"parent": "#1f8a5b",
	"student": "#c8561f",
	"sme": "#7a4cc2",
}


def _desk():
	if frappe.session.user == "Guest":
		frappe.throw(_("Please log in."), frappe.PermissionError)


def _as_obj(value):
	if isinstance(value, str):
		value = value.strip()
		if not value:
			return None
		value = json.loads(value)
	return value


def _scale(value):
	return 10 if str(value) == "10" else 5


def _qid():
	return "q" + frappe.generate_hash(length=10)


def _default_forms():
	def q(qid, qtype, text, options=None, required=True):
		return {
			"id": qid,
			"type": qtype,
			"text": text,
			"required": required,
			"options": options or [],
		}

	freq = ["Daily", "2–3 times a week", "Once a week", "Occasionally", "Not yet"]
	change = ["Significant", "Moderate", "Slight", "No noticeable change"]
	story_use = [
		"Storytelling activity",
		"Classroom lesson",
		"Morning assembly",
		"Discussion / reflection",
		"Role-play / activity",
		"Other",
	]
	values = [
		("respect", "Respect for teachers / elders"),
		("honesty", "Honesty and truthfulness"),
		("kindness", "Kindness and caring"),
		("helping", "Helping others"),
		("sharing", "Sharing and cooperation"),
		("responsibility", "Responsibility"),
		("manners", "Good manners and polite language"),
		("empathy", "Empathy"),
		("cleanliness", "Cleanliness and personal hygiene"),
		("patience", "Patience and gratitude"),
		("punctuality", "Punctuality"),
		("promise", "Keeping a promise"),
	]

	return {
		"school": {
			"title": "School-level implementation",
			"intro": (
				"Complete this when storytelling or teachers’ training has been implemented at school or classroom level. "
				"Ratings: 1 = No change / not at all · 5 = Very significant / consistently."
			),
			"questions": [
				q(
					"sch_extent",
					"choice",
					"To what extent have Islamic values been promoted through this session / training?",
					["Not at all", "Small extent", "Some extent", "Great extent", "Consistently"],
				),
				q(
					"sch_practice",
					"choice",
					"Which practice has been implemented most?",
					[
						"Storytelling",
						"Classroom activities",
						"Morning assembly",
						"Character-building activities",
						"Appreciation / reward system",
						"Parent involvement",
						"Other",
					],
				),
				q(
					"sch_level",
					"choice",
					"Implementation level",
					["School-wide", "Some classes", "Individual teacher / classroom"],
				),
				q(
					"sch_challenge",
					"choice",
					"Main challenge or support needed",
					[
						"Lack of time",
						"Lack of resources",
						"Students’ varying backgrounds",
						"Lack of parental support",
						"Lack of follow-up / support",
						"Other",
					],
				),
				q(
					"sch_support",
					"text",
					"What support would help you implement the learning more effectively?",
				),
				q(
					"sch_where",
					"choice",
					"Where have you observed the most significant change?",
					[
						"Students",
						"Teacher / teaching practice",
						"Classroom environment",
						"School level",
						"No significant change yet",
					],
				),
				q(
					"sch_focus",
					"text",
					"Which Islamic value should receive more focus in the coming months?",
				),
				q(
					"sch_evidence",
					"text",
					"Please share one specific example that demonstrates the change you observed.",
				),
			],
		},
		"teacher": {
			"title": "Teachers’ training – teacher impact",
			"intro": (
				"Complete this if you attended or implemented a Teachers’ Training Workshop. "
				"Rate the change: 1 = No change · 5 = Very significant change."
			),
			"questions": [
				q(
					"tch_apply_values",
					"rating",
					"I understand and apply Islamic values more effectively in teaching.",
				),
				q(
					"tch_techniques",
					"rating",
					"I apply the teaching techniques learned in the workshop.",
				),
				q(
					"tch_storytelling",
					"rating",
					"I use storytelling effectively where appropriate.",
				),
				q(
					"tch_model",
					"rating",
					"I model Islamic values through my own behaviour.",
				),
				q(
					"tch_patience",
					"rating",
					"I show greater patience, kindness and empathy toward students.",
				),
				q(
					"tch_encourage",
					"rating",
					"I encourage positive behaviour and good character.",
				),
				q(
					"tch_activities",
					"rating",
					"I use new classroom activities.",
				),
				q(
					"tch_reflect",
					"rating",
					"I reflect more consciously on my role as teacher and role model.",
				),
				q(
					"tch_changed",
					"choice",
					"Have you changed any teaching practice after the training?",
					["Yes", "Partially", "Not yet"],
				),
				q(
					"tch_change_example",
					"text",
					"If yes, mention one specific change.",
					required=False,
				),
				q(
					"tch_student_impact",
					"text",
					"What impact have you observed in students as a result of applying the training?",
				),
			],
		},
		"parent": {
			"title": "Parent follow-up",
			"intro": (
				"Help us understand how storytelling and values work is showing up at home. "
				"Ratings: 1 = No change · 5 = Very significant change."
			),
			"questions": [
				q(
					"par_stories",
					"choice",
					"How often does your child talk about value-based stories from school?",
					freq,
				),
				q(
					"par_involved",
					"choice",
					"Have you been involved in school character-building or values activities?",
					["Yes", "Partially", "Not yet"],
				),
				q(
					"par_change",
					"choice",
					"Observed change in your child’s character after storytelling / training",
					change,
				),
				q("par_respect", "rating", "Change in respect for teachers / elders"),
				q("par_honesty", "rating", "Change in honesty and truthfulness"),
				q("par_kindness", "rating", "Change in kindness and caring"),
				q("par_helping", "rating", "Change in helping others"),
				q("par_manners", "rating", "Change in good manners and polite language"),
				q("par_cleanliness", "rating", "Change in cleanliness and personal hygiene"),
				q("par_home", "yesno", "Do you support these Islamic values at home?"),
				q(
					"par_example",
					"text",
					"Give one specific example of a positive change you noticed at home.",
				),
				q(
					"par_support",
					"text",
					"What support would help you reinforce these values at home?",
					required=False,
				),
			],
		},
		"student": {
			"title": "Storytelling session – student impact",
			"intro": (
				"Tell us about the value-based stories and any change you noticed. "
				"Ratings: 1 = No change · 5 = Very significant change."
			),
			"questions": [
				q("stu_freq", "choice", "How often were value-based stories used with you?", freq),
				q("stu_how", "choice", "How were the stories used?", story_use),
				q(
					"stu_engage",
					"choice",
					"How interested / engaged were you during the stories?",
					["Very high", "High", "Moderate", "Low", "Very low"],
				),
				q("stu_change", "choice", "Observed change after storytelling", change),
			]
			+ [
				q("stu_" + key, "rating", "Change in: " + label)
				for key, label in values
			]
			+ [
				q(
					"stu_value",
					"text",
					"Which Islamic value was most noticeably reflected in you or your class?",
				),
				q(
					"stu_example",
					"text",
					"Give one specific example of a positive change after storytelling.",
				),
			],
		},
		"sme": {
			"title": "Subject expert review",
			"intro": "Review of curriculum content and delivery.",
			"questions": [
				q("sme_accuracy", "rating", "How accurate and current is the curriculum content?"),
				q(
					"sme_recommend",
					"choice",
					"Overall recommendation",
					["Keep as is", "Minor revisions", "Major revisions"],
				),
				q("sme_notes", "text", "Specific content recommendations"),
			],
		},
	}


def _normalize_forms(raw):
	raw = _as_obj(raw) or {}
	if not isinstance(raw, dict):
		raw = {}
	defaults = _default_forms()
	out = {}
	for aud in AUDIENCES:
		src = raw.get(aud)
		base = defaults[aud]
		if not isinstance(src, dict):
			out[aud] = base
			continue
		questions = []
		for item in (src.get("questions") or [])[:40]:
			if not isinstance(item, dict):
				continue
			qtype = item.get("type") if item.get("type") in TYPES else "text"
			options = []
			if qtype == "choice":
				for opt in (item.get("options") or [])[:20]:
					text = str(opt or "").strip()[:200]
					if text:
						options.append(text)
				if not options:
					options = ["Option 1", "Option 2"]
			qid = str(item.get("id") or "")
			if not QID_RE.fullmatch(qid):
				qid = _qid()
			questions.append(
				{
					"id": qid,
					"type": qtype,
					"text": str(item.get("text") or "")[:500],
					"required": item.get("required") is not False,
					"options": options,
				}
			)
		out[aud] = {
			"title": str(src.get("title") or base["title"])[:180],
			"intro": str(src.get("intro") or "")[:2000],
			"questions": questions,
		}
	return out


def _settings():
	name = "Feedback Studio Settings"
	if not frappe.db.exists(name, name):
		frappe.get_doc({"doctype": name}).insert(ignore_permissions=True)
	doc = frappe.get_doc(name, name)
	changed = False
	for aud in AUDIENCES:
		field = aud + "_token"
		if not doc.get(field):
			doc.set(field, frappe.generate_hash(length=32))
			changed = True
	if changed:
		doc.save(ignore_permissions=True)
	return doc


def _forms(doc):
	raw = doc.forms_json
	if not raw:
		return None
	return _normalize_forms(raw)


def _links(doc):
	return {aud: get_url("/feedback/" + (doc.get(aud + "_token") or "")) for aud in AUDIENCES}


def _request_ip():
	try:
		fwd = (frappe.get_request_header("X-Forwarded-For") or "").split(",")[0].strip()
		if fwd:
			return fwd[:64]
	except Exception:
		pass
	try:
		ip = getattr(frappe.local, "request_ip", None) or ""
		if ip:
			return str(ip)[:64]
	except Exception:
		pass
	try:
		if frappe.request and frappe.request.environ:
			return str(frappe.request.environ.get("REMOTE_ADDR") or "")[:64]
	except Exception:
		pass
	return ""


def _request_user_agent():
	try:
		return str(frappe.get_request_header("User-Agent") or "")[:1000]
	except Exception:
		return ""


def _clean_client_meta(raw):
	raw = _as_obj(raw) or {}
	if not isinstance(raw, dict):
		return {}
	allowed = (
		"platform",
		"language",
		"languages",
		"timezone",
		"timezoneOffset",
		"screenWidth",
		"screenHeight",
		"availWidth",
		"availHeight",
		"colorDepth",
		"pixelRatio",
		"viewportWidth",
		"viewportHeight",
		"touchPoints",
		"cookieEnabled",
		"doNotTrack",
		"hardwareConcurrency",
		"deviceMemory",
		"connectionType",
		"connectionDownlink",
		"referrer",
		"pageUrl",
		"macAddress",
		"deviceId",
		"online",
	)
	out = {}
	for key in allowed:
		if key not in raw:
			continue
		val = raw.get(key)
		if val is None or val == "":
			continue
		if isinstance(val, (list, tuple)):
			out[key] = [cstr(v)[:80] for v in val[:12]]
		elif isinstance(val, (int, float, bool)):
			out[key] = val
		else:
			out[key] = cstr(val)[:500]
	return out


def _device_fields(client_meta=None):
	meta = _clean_client_meta(client_meta)
	mac = cstr(meta.pop("macAddress", "") or "").strip()[:64]
	# Browsers cannot expose real MAC addresses; keep blank unless explicitly provided.
	return {
		"ip_address": _request_ip(),
		"mac_address": mac,
		"user_agent": _request_user_agent(),
		"client_meta_json": json.dumps(meta, ensure_ascii=False) if meta else "",
	}


def _responses():
	out = {aud: [] for aud in AUDIENCES}
	if not frappe.db.table_exists("Feedback Studio Response"):
		return out
	base_fields = ["name", "audience", "answers_json", "submitted_on"]
	extra_fields = [
		"session",
		"sme_name",
		"customer",
		"school_name",
		"school_opening",
		"ip_address",
		"mac_address",
		"user_agent",
		"field_visit",
	]
	try:
		meta = frappe.get_meta("Feedback Studio Response")
		fields = base_fields + [f for f in extra_fields if meta.has_field(f)]
	except Exception:
		fields = base_fields
	rows = frappe.get_all(
		"Feedback Studio Response",
		fields=fields,
		order_by="creation asc",
		limit_page_length=2000,
		ignore_permissions=True,
	)
	for row in rows:
		if row.audience not in out:
			continue
		answers = row.answers_json
		if isinstance(answers, str):
			try:
				answers = json.loads(answers or "{}")
			except ValueError:
				answers = {}
		if not isinstance(answers, dict):
			answers = {}
		item = {"name": row.name, "at": str(row.submitted_on or ""), "answers": answers}
		for key in extra_fields:
			if hasattr(row, key):
				item[key] = getattr(row, key) or ""
		out[row.audience].append(item)
	return out


def _payload(doc):
	forms = _forms(doc) or _default_forms()
	return {
		"fresh": False,
		"forms": forms,
		"ratingScale": _scale(doc.rating_scale),
		"responses": _responses(),
		"links": _links(doc),
	}


def _audience(value):
	if value not in AUDIENCES:
		frappe.throw(_("Unknown feedback group."))
	return value


def _clean_answers(form, scale, raw):
	raw = _as_obj(raw) or {}
	if not isinstance(raw, dict):
		frappe.throw(_("Invalid answers."))
	if not form.get("questions"):
		frappe.throw(_("This form has no questions yet."))
	cleaned = {}
	missing = False
	for question in form["questions"]:
		val = raw.get(question["id"])
		qtype = question["type"]
		if qtype == "rating":
			try:
				num = int(val)
			except (TypeError, ValueError):
				num = None
			if num is None or num < 1 or num > scale:
				if question["required"]:
					missing = True
				continue
			cleaned[question["id"]] = num
		elif qtype == "choice":
			if val in (question.get("options") or []):
				cleaned[question["id"]] = val
			elif question["required"]:
				missing = True
		elif qtype == "yesno":
			if val in ("Yes", "No"):
				cleaned[question["id"]] = val
			elif question["required"]:
				missing = True
		else:
			text = str(val).strip()[:4000] if val is not None else ""
			if text:
				cleaned[question["id"]] = text
			elif question["required"]:
				missing = True
	if missing:
		frappe.throw(_("Please answer every required question."))
	return cleaned


def _store(audience, answers, doc, extra=None, client_meta=None):
	forms = _forms(doc)
	if not forms:
		frappe.throw(_("This form is not ready yet."))
	cleaned = _clean_answers(forms[audience], _scale(doc.rating_scale), answers)
	payload = {
		"doctype": "Feedback Studio Response",
		"audience": audience,
		"answers_json": json.dumps(cleaned, ensure_ascii=False),
		"submitted_on": now_datetime(),
	}
	payload.update(_device_fields(client_meta))
	if extra:
		for key, val in extra.items():
			if val is not None and val != "":
				payload[key] = val
	response = frappe.get_doc(payload)
	response.insert(ignore_permissions=True)
	return response


def _find(token):
	token = (token or "").strip()
	if not TOKEN_RE.fullmatch(token):
		return None
	doc = _settings()
	for aud in AUDIENCES:
		if doc.get(aud + "_token") == token:
			return aud, doc
	return None


def _find_session(token):
	token = (token or "").strip()
	if not TOKEN_RE.fullmatch(token):
		return None
	if not frappe.db.table_exists("Feedback Studio Session"):
		return None
	fields = [
		"name",
		"status",
		"sme_name",
		"customer",
		"school_name",
		"school_opening",
		"sme_response",
		"share_token",
	]
	try:
		if frappe.get_meta("Feedback Studio Session").has_field("field_visit"):
			fields.append("field_visit")
	except Exception:
		pass
	row = frappe.db.get_value(
		"Feedback Studio Session",
		{"share_token": token},
		fields,
		as_dict=True,
	)
	return row


def _share_url(token):
	return get_url("/feedback-share/" + token)


def _share_path(token):
	return "/feedback-share/" + token


def _session_payload(session):
	token = session.share_token if hasattr(session, "share_token") else session.get("share_token")
	field_visit = ""
	if hasattr(session, "field_visit"):
		field_visit = session.field_visit or ""
	elif isinstance(session, dict):
		field_visit = session.get("field_visit") or ""
	return {
		"ok": True,
		"session": session.name if hasattr(session, "name") else session.get("name"),
		"share_token": token,
		"share_url": _share_url(token),
		"feedback_url": _share_path(token),
		"sme_name": session.sme_name if hasattr(session, "sme_name") else session.get("sme_name") or "",
		"school_name": (session.school_name if hasattr(session, "school_name") else session.get("school_name"))
		or (session.customer if hasattr(session, "customer") else session.get("customer"))
		or "",
		"customer": session.customer if hasattr(session, "customer") else session.get("customer") or "",
		"field_visit": field_visit,
	}


def _field_officer_options():
	"""Active Field Officer rows for SME name select."""
	if not frappe.db.exists("DocType", "Field Officer"):
		from tif_customization.tif_customization.page.smes_activity_form.smes_activity_form import (
			get_active_field_officer_staff,
		)

		return [
			{
				"value": s["employee_name"],
				"label": s["employee_name"],
				"field_officer": "",
				"employee": s.get("employee") or "",
				"employee_name": s["employee_name"],
				"division": s.get("division") or "",
			}
			for s in get_active_field_officer_staff()
		]

	rows = frappe.get_all(
		"Field Officer",
		filters={"status": "Active"},
		fields=["name", "name1", "employee", "user", "division"],
		order_by="name1 asc",
		ignore_permissions=True,
	)
	out = []
	seen = set()
	for row in rows:
		label = (row.name1 or row.name or "").strip()
		if not label or label in seen:
			continue
		seen.add(label)
		emp_name = ""
		if row.employee:
			emp_name = frappe.db.get_value("Employee", row.employee, "employee_name") or ""
		out.append(
			{
				"value": label,
				"label": label,
				"field_officer": row.name,
				"employee": row.employee or "",
				"employee_name": emp_name or label,
				"division": row.division or "",
			}
		)
	return out


def _sme_lookup_payload(default_sme=""):
	officers = _field_officer_options()
	staff_names = [o["value"] for o in officers]
	return {
		"staff_options": officers,
		"staff_names": staff_names,
		"default_sme": default_sme if default_sme in staff_names else "",
		"provinces": [
			"Sindh",
			"Punjab",
			"KPK",
			"Balochistan",
			"Gilgit-Baltistan",
			"Azad Jammu & Kashmir",
		],
	}


def _resolve_staff_name(sme_name):
	sme_name = (sme_name or "").strip()
	if not sme_name:
		frappe.throw(_("Please select the SME name."))

	officers = _field_officer_options()
	by_value = {o["value"]: o for o in officers}
	if sme_name in by_value:
		row = by_value[sme_name]
		return {
			"employee": row.get("employee") or "",
			"employee_name": row.get("employee_name") or row["value"],
			"field_officer": row.get("field_officer") or "",
			"display_name": row["value"],
		}

	# Fallback: Field Officer name / name1 direct match
	if frappe.db.exists("DocType", "Field Officer"):
		fo = frappe.db.get_value(
			"Field Officer",
			{"status": "Active", "name1": sme_name},
			["name", "name1", "employee"],
			as_dict=True,
		) or frappe.db.get_value(
			"Field Officer",
			{"status": "Active", "name": sme_name},
			["name", "name1", "employee"],
			as_dict=True,
		)
		if fo:
			emp_name = ""
			if fo.employee:
				emp_name = frappe.db.get_value("Employee", fo.employee, "employee_name") or ""
			return {
				"employee": fo.employee or "",
				"employee_name": emp_name or fo.name1 or fo.name,
				"field_officer": fo.name,
				"display_name": fo.name1 or fo.name,
			}

	frappe.throw(_("SME name must be an active Field Officer."))


def _resolve_customer(customer):
	customer = (customer or "").strip()
	if not customer:
		return None, ""
	if not frappe.db.exists("DocType", "Customer"):
		frappe.throw(_("Customer master is not available."))
	if frappe.db.exists("Customer", customer):
		label = frappe.db.get_value("Customer", customer, "customer_name") or customer
		return customer, label
	found = frappe.db.get_value("Customer", {"customer_name": customer}, "name")
	if found:
		label = frappe.db.get_value("Customer", found, "customer_name") or found
		return found, label
	frappe.throw(_("School / Customer '{0}' was not found. Create it with the School Opening form.").format(customer))


def _create_school_opening(school_opening, sme_name):
	from tif_customization.tif_customization.api.school_opening_form import create_school_opening_application

	data = _as_obj(school_opening) or {}
	if not isinstance(data, dict):
		data = {}
	if not (data.get("tif_representative") or "").strip():
		data["tif_representative"] = sme_name
	if not (data.get("visit_type") or "").strip():
		data["visit_type"] = "Visit with enrollment"
	soa = create_school_opening_application(data)
	return soa


def _create_sme_session_and_response(doc, answers, sme_name, customer=None, school_opening=None, client_meta=None, field_visit=None):
	staff = _resolve_staff_name(sme_name)
	sme_name = staff.get("display_name") or staff["employee_name"]
	customer_name = None
	school_label = ""
	soa_name = None
	field_visit = (field_visit or "").strip() or None

	customer = (customer or "").strip() or None
	soa_payload = _as_obj(school_opening)

	if customer:
		customer_name, school_label = _resolve_customer(customer)
	elif soa_payload:
		soa = _create_school_opening(soa_payload, sme_name)
		soa_name = soa.name
		school_label = soa.school_name
	else:
		frappe.throw(_("Select a Customer / school, or create one with the School Opening form."))

	extra = {
		"sme_name": sme_name,
		"customer": customer_name,
		"school_name": school_label,
		"school_opening": soa_name,
	}
	if field_visit and frappe.get_meta("Feedback Studio Response").has_field("field_visit"):
		extra["field_visit"] = field_visit

	response = _store(
		"sme",
		answers,
		doc,
		extra=extra,
		client_meta=client_meta,
	)

	token = frappe.generate_hash(length=32)
	session_payload = {
		"doctype": "Feedback Studio Session",
		"share_token": token,
		"status": "Open",
		"sme_name": sme_name,
		"sme_employee": staff.get("employee"),
		"customer": customer_name,
		"school_name": school_label,
		"school_opening": soa_name,
		"sme_response": response.name,
		"submitted_on": now_datetime(),
	}
	if field_visit and frappe.get_meta("Feedback Studio Session").has_field("field_visit"):
		session_payload["field_visit"] = field_visit
	session = frappe.get_doc(session_payload)
	session.insert(ignore_permissions=True)
	if frappe.get_meta("Feedback Studio Response").has_field("session"):
		response.db_set("session", session.name, update_modified=False)

	out = {
		"ok": True,
		"session": session.name,
		"share_token": token,
		"share_url": _share_url(token),
		"feedback_url": _share_path(token),
		"customer": customer_name,
		"school_name": school_label,
		"school_opening": soa_name,
		"sme_name": sme_name,
		"response": response.name,
	}
	if field_visit:
		out["field_visit"] = field_visit
	return out


def _ensure_session_for_field_visit(name):
	"""Open (or reuse) a share session tagged to this Field Visit."""
	name = (name or "").strip()
	if not name:
		frappe.throw(_("Field Visit is required."))
	if not frappe.db.exists("Field Visit", name):
		frappe.throw(_("Field Visit {0} was not found.").format(name))
	if not frappe.get_meta("Feedback Studio Session").has_field("field_visit"):
		frappe.throw(_("Feedback is not linked to Field Visit yet."))

	existing_rows = frappe.get_all(
		"Feedback Studio Session",
		filters={"field_visit": name},
		fields=["name", "share_token", "status", "sme_name", "school_name", "customer", "field_visit"],
		order_by="creation desc",
		limit=1,
	)
	existing = existing_rows[0] if existing_rows else None
	if existing:
		if existing.status == "Closed":
			frappe.db.set_value("Feedback Studio Session", existing.name, "status", "Open", update_modified=False)
			existing.status = "Open"
		return _session_payload(existing)

	visit = frappe.get_doc("Field Visit", name)
	sme_name = cstr(visit.visit_by).strip()
	if not sme_name:
		sme_name = frappe.db.get_value("User", frappe.session.user, "full_name") or frappe.session.user

	employee = ""
	try:
		staff = _resolve_staff_name(sme_name)
		sme_name = staff.get("display_name") or staff.get("employee_name") or sme_name
		employee = staff.get("employee") or ""
	except Exception:
		employee = cstr(getattr(visit, "staff_employee", None) or "")

	customer = cstr(visit.school_name).strip() or None
	school_label = ""
	if customer:
		school_label = frappe.db.get_value("Customer", customer, "customer_name") or customer
	elif cstr(getattr(visit, "pending_school_name", None)).strip():
		school_label = cstr(visit.pending_school_name).strip()

	soa_name = None
	reference = cstr(visit.reference).strip()
	if reference and frappe.db.exists("School Opening Application", reference):
		soa_name = reference
		if not school_label:
			school_label = frappe.db.get_value("School Opening Application", soa_name, "school_name") or ""

	token = frappe.generate_hash(length=32)
	session = frappe.get_doc(
		{
			"doctype": "Feedback Studio Session",
			"share_token": token,
			"status": "Open",
			"sme_name": sme_name,
			"sme_employee": employee or None,
			"customer": customer,
			"school_name": school_label,
			"school_opening": soa_name,
			"field_visit": name,
			"submitted_on": now_datetime(),
		}
	)
	session.insert(ignore_permissions=True)
	return _session_payload(session)


@frappe.whitelist()
def start_session_from_field_visit(name):
	"""Desk / easy-form: start community feedback for a saved Field Visit."""
	_desk()
	visit = frappe.get_doc("Field Visit", name)
	visit.check_permission("read")
	return _ensure_session_for_field_visit(name)


@frappe.whitelist()
def get_studio():
	_desk()
	doc = _settings()
	if not doc.forms_json:
		return {
			"fresh": True,
			"forms": {},
			"responses": {aud: [] for aud in AUDIENCES},
			"links": {},
			"ratingScale": 5,
		}
	return _payload(doc)


@frappe.whitelist()
def get_sme_context():
	"""Staff + school lookups for the SME answer form."""
	_desk()
	current_emp = frappe.db.get_value(
		"Employee",
		{"user_id": frappe.session.user, "status": "Active"},
		["name", "employee_name"],
		as_dict=True,
	)
	default_sme = ""
	if current_emp:
		# Prefer Field Officer name1 matching this employee
		fo_name = frappe.db.get_value(
			"Field Officer",
			{"employee": current_emp.name, "status": "Active"},
			"name1",
		)
		default_sme = fo_name or current_emp.employee_name or ""
	payload = _sme_lookup_payload(default_sme=default_sme)
	return payload


@frappe.whitelist()
def search_customers(txt=None, limit=40):
	_desk()
	from tif_customization.tif_customization.page.smes_activity_form.smes_activity_form import (
		_customer_link_options,
	)

	return _customer_link_options(txt=txt, limit=max(1, min(cint(limit) or 40, 100)))


@frappe.whitelist(allow_guest=True, methods=["GET"])
@rate_limit(limit=120, seconds=600)
def search_public_customers(token, txt=None, limit=40):
	"""Customer typeahead for the public SME feedback link."""
	return search_public_link(token=token, doctype="Customer", txt=txt, limit=limit)


@frappe.whitelist(allow_guest=True, methods=["GET"])
@rate_limit(limit=120, seconds=600)
def search_public_link(token, doctype=None, txt=None, limit=40):
	"""Frappe Link-style search for guest SME form (Customer / Field Officer)."""
	found = _find(token)
	if not found or found[0] != "sme":
		frappe.throw(_("This link is not valid."))
	doctype = (doctype or "").strip()
	limit = max(1, min(cint(limit) or 40, 100))
	txt = (txt or "").strip()

	if doctype == "Customer":
		from tif_customization.tif_customization.page.smes_activity_form.smes_activity_form import (
			_customer_link_options,
		)

		rows = _customer_link_options(txt=txt, limit=limit)
		# Frappe Link expects value + description
		return [
			{
				"value": r.get("value"),
				"label": r.get("label") or r.get("value"),
				"description": r.get("description") or "",
			}
			for r in rows
			if r.get("value")
		]

	if doctype == "Field Officer":
		q = txt.lower()
		out = []
		for row in _field_officer_options():
			value = row.get("value") or ""
			label = row.get("label") or value
			division = row.get("division") or ""
			hay = f"{value} {label} {division}".lower()
			if q and q not in hay:
				continue
			out.append(
				{
					"value": value,
					"label": label,
					"description": division,
				}
			)
			if len(out) >= limit:
				break
		return out

	frappe.throw(_("Unsupported link doctype."))


@frappe.whitelist()
def import_local(forms, rating_scale=5, responses=None):
	_desk()
	doc = _settings()
	if doc.forms_json:
		return _payload(doc)
	doc.forms_json = json.dumps(_normalize_forms(forms), ensure_ascii=False)
	doc.rating_scale = _scale(rating_scale)
	doc.save(ignore_permissions=True)
	incoming = _as_obj(responses) or {}
	if (
		isinstance(incoming, dict)
		and frappe.db.table_exists("Feedback Studio Response")
		and not frappe.db.count("Feedback Studio Response")
	):
		for aud in AUDIENCES:
			rows = incoming.get(aud) or []
			if not isinstance(rows, list):
				continue
			for row in rows[-500:]:
				if not isinstance(row, dict):
					continue
				try:
					_store(aud, row.get("answers") or {}, doc)
				except frappe.ValidationError:
					frappe.local.message_log = []
	return _payload(_settings())


@frappe.whitelist()
def save_studio(forms, rating_scale=5):
	_desk()
	doc = _settings()
	doc.forms_json = json.dumps(_normalize_forms(forms), ensure_ascii=False)
	doc.rating_scale = _scale(rating_scale)
	doc.save(ignore_permissions=True)
	return {"links": _links(doc), "ratingScale": _scale(doc.rating_scale)}


@frappe.whitelist()
def submit_response(audience, answers, client_meta=None):
	_desk()
	audience = _audience(audience)
	if audience == "sme":
		frappe.throw(_("Use the SME submit flow with SME name and school."))
	doc = _settings()
	_store(audience, answers, doc, client_meta=client_meta)
	return _responses()[audience]


@frappe.whitelist()
def submit_sme_response(answers, sme_name, customer=None, school_opening=None, client_meta=None):
	"""SME desk submit: require name + Customer (or create School Opening), then share QR/URL."""
	_desk()
	doc = _settings()
	result = _create_sme_session_and_response(
		doc,
		answers,
		sme_name,
		customer=customer,
		school_opening=school_opening,
		client_meta=client_meta,
	)
	result["responses"] = _responses()["sme"]
	return result


@frappe.whitelist()
def clear_responses(audience):
	_desk()
	audience = _audience(audience)
	frappe.db.delete("Feedback Studio Response", {"audience": audience})
	return []


@frappe.whitelist()
def rotate_link(audience):
	_desk()
	audience = _audience(audience)
	token = frappe.generate_hash(length=32)
	_settings()
	frappe.db.set_value("Feedback Studio Settings", "Feedback Studio Settings", audience + "_token", token)
	return get_url("/feedback/" + token)


@frappe.whitelist(allow_guest=True, methods=["GET"])
def get_public_form(token):
	found = _find(token)
	if not found:
		return {"ok": False}
	audience, doc = found
	forms = _forms(doc) or _default_forms()
	form = forms[audience]
	payload = {
		"ok": True,
		"audience": audience,
		"label": LABELS[audience],
		"color": COLORS[audience],
		"title": form["title"],
		"intro": form["intro"],
		"questions": form["questions"],
		"ratingScale": _scale(doc.rating_scale),
	}
	if audience == "sme":
		payload["sme"] = _sme_lookup_payload()
	return payload


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=30, seconds=600)
def submit_public(token, answers, client_meta=None, sme_name=None, customer=None, school_opening=None):
	found = _find(token)
	if not found:
		frappe.throw(_("This link is not valid."))
	audience, doc = found
	if audience == "sme":
		return _create_sme_session_and_response(
			doc,
			answers,
			sme_name,
			customer=customer,
			school_opening=school_opening,
			client_meta=client_meta,
		)
	_store(audience, answers, doc, client_meta=client_meta)
	return {"ok": True}


@frappe.whitelist(allow_guest=True, methods=["GET"])
def get_share_session(token):
	session = _find_session(token)
	if not session or session.status == "Closed":
		return {"ok": False}
	return {
		"ok": True,
		"sme_name": session.sme_name,
		"school_name": session.school_name or session.customer or "",
		"customer": session.customer or "",
		"field_visit": getattr(session, "field_visit", None) or "",
		"roles": [
			{"id": "parent", "label": LABELS["parent"], "color": COLORS["parent"], "hint": "I am a parent / guardian"},
			{"id": "student", "label": LABELS["student"], "color": COLORS["student"], "hint": "I am a student"},
			{"id": "teacher", "label": LABELS["teacher"], "color": COLORS["teacher"], "hint": "I am a teacher"},
			{"id": "school", "label": LABELS["school"], "color": COLORS["school"], "hint": "I represent the school"},
		],
	}


@frappe.whitelist(allow_guest=True, methods=["GET"])
def get_share_form(token, audience):
	session = _find_session(token)
	if not session or session.status == "Closed":
		return {"ok": False}
	if audience not in PUBLIC_ROLES:
		frappe.throw(_("Please choose Parent, Student, Teacher, or School."))
	doc = _settings()
	forms = _forms(doc) or _default_forms()
	form = forms[audience]
	return {
		"ok": True,
		"audience": audience,
		"label": LABELS[audience],
		"color": COLORS[audience],
		"title": form["title"],
		"intro": form["intro"],
		"questions": form["questions"],
		"ratingScale": _scale(doc.rating_scale),
		"school_name": session.school_name or session.customer or "",
		"sme_name": session.sme_name,
		"field_visit": getattr(session, "field_visit", None) or "",
	}


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=40, seconds=600)
def submit_share(token, audience, answers, client_meta=None):
	session = _find_session(token)
	if not session or session.status == "Closed":
		frappe.throw(_("This link is not valid."))
	if audience not in PUBLIC_ROLES:
		frappe.throw(_("Please choose Parent, Student, Teacher, or School."))
	doc = _settings()
	extra = {
			"session": session.name,
			"sme_name": session.sme_name,
			"customer": session.customer,
			"school_name": session.school_name,
			"school_opening": session.school_opening,
		}
	if getattr(session, "field_visit", None):
		extra["field_visit"] = session.field_visit
	_store(
		audience,
		answers,
		doc,
		extra=extra,
		client_meta=client_meta,
	)
	return {"ok": True}
