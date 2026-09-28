# Copyright (c) 2026, mohtashim and contributors
# For license information, please see license.txt

import json
import re

import frappe
from frappe import _
from frappe.rate_limiter import rate_limit
from frappe.utils import cint, cstr, get_url, now_datetime

AUDIENCES = ("school", "parent", "student", "sme")
PUBLIC_ROLES = ("school", "parent", "student")
TYPES = ("rating", "choice", "yesno", "text")
TOKEN_RE = re.compile(r"^[A-Fa-f0-9]{16,64}$")
QID_RE = re.compile(r"^[A-Za-z0-9_-]{1,40}$")

LABELS = {
	"school": "School",
	"parent": "Parent",
	"student": "Student",
	"sme": "SME",
}
COLORS = {
	"school": "#2f5bd3",
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
	def q(qtype, text, options=None):
		return {
			"id": _qid(),
			"type": qtype,
			"text": text,
			"required": True,
			"options": options or [],
		}

	return {
		"school": {
			"title": "Staff feedback",
			"intro": "Help us understand how the school is supporting you this term.",
			"questions": [
				q("rating", "How well does leadership communicate school priorities?"),
				q("choice", "Which area needs the most support?", ["Resources", "Training", "Workload", "Facilities"]),
				q("text", "What one change would make your work easier?"),
			],
		},
		"parent": {
			"title": "Parent feedback",
			"intro": "Your view helps us partner better with families.",
			"questions": [
				q("rating", "How satisfied are you with communication from the school?"),
				q("yesno", "Do you feel informed about your child’s progress?"),
				q("text", "Anything else you would like us to know?"),
			],
		},
		"student": {
			"title": "Student feedback",
			"intro": "Tell us honestly how school is going for you.",
			"questions": [
				q("rating", "How much do you enjoy your lessons?"),
				q(
					"choice",
					"How do you learn best?",
					["Group work", "On my own", "Hands-on activities", "Listening to the teacher"],
				),
				q("yesno", "Do you feel safe at school?"),
			],
		},
		"sme": {
			"title": "Subject expert review",
			"intro": "Review of curriculum content and delivery.",
			"questions": [
				q("rating", "How accurate and current is the curriculum content?"),
				q("choice", "Overall recommendation", ["Keep as is", "Minor revisions", "Major revisions"]),
				q("text", "Specific content recommendations"),
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
	row = frappe.db.get_value(
		"Feedback Studio Session",
		{"share_token": token},
		[
			"name",
			"status",
			"sme_name",
			"customer",
			"school_name",
			"school_opening",
			"sme_response",
		],
		as_dict=True,
	)
	return row


def _share_url(token):
	return get_url("/feedback-share/" + token)


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


def _create_sme_session_and_response(doc, answers, sme_name, customer=None, school_opening=None, client_meta=None):
	staff = _resolve_staff_name(sme_name)
	sme_name = staff.get("display_name") or staff["employee_name"]
	customer_name = None
	school_label = ""
	soa_name = None

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

	response = _store(
		"sme",
		answers,
		doc,
		extra={
			"sme_name": sme_name,
			"customer": customer_name,
			"school_name": school_label,
			"school_opening": soa_name,
		},
		client_meta=client_meta,
	)

	token = frappe.generate_hash(length=32)
	session = frappe.get_doc(
		{
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
	)
	session.insert(ignore_permissions=True)
	if frappe.get_meta("Feedback Studio Response").has_field("session"):
		response.db_set("session", session.name, update_modified=False)

	return {
		"ok": True,
		"session": session.name,
		"share_token": token,
		"share_url": _share_url(token),
		"customer": customer_name,
		"school_name": school_label,
		"school_opening": soa_name,
		"sme_name": sme_name,
		"response": response.name,
	}


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
		"roles": [
			{"id": "parent", "label": LABELS["parent"], "color": COLORS["parent"], "hint": "I am a parent / guardian"},
			{"id": "school", "label": LABELS["school"], "color": COLORS["school"], "hint": "I represent the school"},
			{"id": "student", "label": LABELS["student"], "color": COLORS["student"], "hint": "I am a student"},
		],
	}


@frappe.whitelist(allow_guest=True, methods=["GET"])
def get_share_form(token, audience):
	session = _find_session(token)
	if not session or session.status == "Closed":
		return {"ok": False}
	if audience not in PUBLIC_ROLES:
		frappe.throw(_("Please choose Parent, School, or Student."))
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
	}


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=40, seconds=600)
def submit_share(token, audience, answers, client_meta=None):
	session = _find_session(token)
	if not session or session.status == "Closed":
		frappe.throw(_("This link is not valid."))
	if audience not in PUBLIC_ROLES:
		frappe.throw(_("Please choose Parent, School, or Student."))
	doc = _settings()
	_store(
		audience,
		answers,
		doc,
		extra={
			"session": session.name,
			"sme_name": session.sme_name,
			"customer": session.customer,
			"school_name": session.school_name,
			"school_opening": session.school_opening,
		},
		client_meta=client_meta,
	)
	return {"ok": True}
