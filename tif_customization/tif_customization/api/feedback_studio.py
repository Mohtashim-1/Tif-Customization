# Copyright (c) 2026, mohtashim and contributors
# For license information, please see license.txt

import json
import re

import frappe
from frappe import _
from frappe.rate_limiter import rate_limit
from frappe.utils import get_url, now_datetime

AUDIENCES = ("school", "parent", "student", "sme")
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


def _responses():
	out = {aud: [] for aud in AUDIENCES}
	if not frappe.db.table_exists("Feedback Studio Response"):
		return out
	rows = frappe.get_all(
		"Feedback Studio Response",
		fields=["audience", "answers_json", "submitted_on"],
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
		out[row.audience].append({"at": str(row.submitted_on or ""), "answers": answers})
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


def _store(audience, answers, doc):
	forms = _forms(doc)
	if not forms:
		frappe.throw(_("This form is not ready yet."))
	cleaned = _clean_answers(forms[audience], _scale(doc.rating_scale), answers)
	response = frappe.get_doc(
		{
			"doctype": "Feedback Studio Response",
			"audience": audience,
			"answers_json": json.dumps(cleaned, ensure_ascii=False),
			"submitted_on": now_datetime(),
		}
	)
	response.insert(ignore_permissions=True)
	return _responses()[audience]


def _find(token):
	token = (token or "").strip()
	if not TOKEN_RE.fullmatch(token):
		return None
	doc = _settings()
	for aud in AUDIENCES:
		if doc.get(aud + "_token") == token:
			return aud, doc
	return None


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
def submit_response(audience, answers):
	_desk()
	audience = _audience(audience)
	doc = _settings()
	return _store(audience, answers, doc)


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
	return {
		"ok": True,
		"audience": audience,
		"label": LABELS[audience],
		"color": COLORS[audience],
		"title": form["title"],
		"intro": form["intro"],
		"questions": form["questions"],
		"ratingScale": _scale(doc.rating_scale),
	}


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=30, seconds=600)
def submit_public(token, answers):
	found = _find(token)
	if not found:
		frappe.throw(_("This link is not valid."))
	audience, doc = found
	_store(audience, answers, doc)
	return {"ok": True}
