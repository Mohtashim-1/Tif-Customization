# Copyright (c) 2026, TIF Customization and contributors
# License: MIT
"""Public QR attendance tokens for the Training LMS portal.

Tokens are stored in Redis and mirrored in MariaDB so a phone (Guest)
can resolve a QR that was minted in the trainer's logged-in browser.
"""

from __future__ import annotations

import json
import re
import time
from datetime import datetime, time as dt_time, timedelta

import frappe
from frappe import _
from frappe.utils import add_years, now_datetime, nowdate, nowtime

CACHE_PREFIX = "training_lms_qr:"
TABLE = "_training_lms_qr"
TOKEN_RE = re.compile(r"^[A-Za-z0-9_-]{8,64}$")


def _key(token: str) -> str:
	return f"{CACHE_PREFIX}{token}"


def _ttl_seconds(exp_ms: int) -> int:
	now = int(time.time())
	exp = int(exp_ms / 1000) if exp_ms else now + 900
	return max(120, exp - now + 60)


def _ensure_table():
	frappe.db.sql(
		f"""
		CREATE TABLE IF NOT EXISTS `{TABLE}` (
			`token` varchar(64) NOT NULL,
			`payload` longtext,
			`exp` bigint DEFAULT NULL,
			`active` int DEFAULT 1,
			PRIMARY KEY (`token`)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
		"""
	)


def _as_dict(raw):
	if not raw:
		return None
	if isinstance(raw, str):
		try:
			raw = json.loads(raw)
		except (TypeError, ValueError):
			return None
	if isinstance(raw, dict):
		return raw
	return None


def _save(token: str, data: dict):
	exp_ms = int(data.get("exp") or 0)
	payload = frappe.as_json(data)
	frappe.cache.set_value(_key(token), payload, expires_in_sec=_ttl_seconds(exp_ms))
	_ensure_table()
	frappe.db.sql(
		f"""
		INSERT INTO `{TABLE}` (`token`, `payload`, `exp`, `active`)
		VALUES (%s, %s, %s, %s)
		ON DUPLICATE KEY UPDATE `payload`=VALUES(`payload`), `exp`=VALUES(`exp`), `active`=VALUES(`active`)
		""",
		(token, payload, exp_ms, 1 if data.get("active") else 0),
	)
	frappe.db.commit()


def _load(token: str):
	data = _as_dict(frappe.cache.get_value(_key(token)))
	if data:
		return data
	_ensure_table()
	row = frappe.db.sql(
		f"SELECT `payload`, `exp`, `active` FROM `{TABLE}` WHERE `token`=%s",
		token,
		as_dict=True,
	)
	if not row:
		return None
	data = _as_dict(row[0].get("payload")) or {}
	if row[0].get("exp") and not data.get("exp"):
		data["exp"] = row[0]["exp"]
	if "active" not in data:
		data["active"] = row[0].get("active")
	# Warm Redis so subsequent Guest lookups are fast.
	try:
		frappe.cache.set_value(_key(token), frappe.as_json(data), expires_in_sec=_ttl_seconds(data.get("exp") or 0))
	except Exception:
		pass
	return data


def _parse_payload(payload):
	if isinstance(payload, str):
		try:
			payload = json.loads(payload)
		except (TypeError, ValueError):
			payload = {}
	return frappe._dict(payload or {})


def _snapshot(session_name, payload, exp_ms):
	return {
		"ok": 1,
		"id": session_name or payload.get("id") or "",
		"name": payload.get("n") or payload.get("name") or "",
		"courseId": payload.get("c") or payload.get("courseId") or "",
		"courseName": payload.get("cn") or payload.get("courseName") or "",
		"trainer": payload.get("t") or payload.get("trainer") or "",
		"date": payload.get("d") or payload.get("date") or "",
		"start": payload.get("a") or payload.get("start") or "",
		"end": payload.get("b") or payload.get("end") or "",
		"location": payload.get("l") or payload.get("location") or "",
		"exp": exp_ms,
		"active": 1,
		"checkins": [],
	}


def _reasoned(data, reason):
	out = dict(data or {})
	out["ok"] = 1 if reason == "ok" else 0
	out["reason"] = reason
	return out


@frappe.whitelist()
def open_attendance(session_name=None, payload=None, validity_ms=None):
	"""Mint a short QR token. Requires a logged-in ERP user."""
	if frappe.session.user == "Guest":
		frappe.throw(_("Sign in to start attendance."), frappe.PermissionError)
	payload = _parse_payload(payload)
	token = frappe.generate_hash(length=16)
	try:
		validity = int(validity_ms or 15 * 60 * 1000)
	except (TypeError, ValueError):
		validity = 15 * 60 * 1000
	exp_ms = int(time.time() * 1000) + max(60 * 1000, validity)
	data = _snapshot(session_name, payload, exp_ms)
	if not data["id"]:
		frappe.throw(_("Session is required to start attendance."))
	_save(token, data)
	return {"token": token, "exp": exp_ms}


@frappe.whitelist(allow_guest=True)
def resolve_attendance(token=None):
	"""Phone scan lookup — no login required."""
	token = (token or "").strip()
	if not TOKEN_RE.match(token or ""):
		return {"ok": 0, "reason": "invalid"}
	data = _load(token)
	if not data:
		return {"ok": 0, "reason": "invalid"}
	now_ms = int(time.time() * 1000)
	if not data.get("active"):
		return _reasoned(data, "closed")
	if data.get("exp") and now_ms > int(data["exp"]):
		return _reasoned(data, "expired")
	return _reasoned(data, "ok")


@frappe.whitelist()
def close_attendance(token=None, session_name=None):
	if frappe.session.user == "Guest":
		frappe.throw(_("Sign in to close attendance."), frappe.PermissionError)
	token = (token or "").strip()
	if token:
		data = _load(token) or {}
		if data:
			data["active"] = 0
			_save(token, data)
	return {"ok": 1}


@frappe.whitelist(allow_guest=True)
def mark_checkin(token=None, phone=None, student_name=None, email=None, device=None):
	token = (token or "").strip()
	if not TOKEN_RE.match(token or ""):
		return {"ok": 0, "reason": "invalid"}
	data = _load(token)
	if not data:
		return {"ok": 0, "reason": "invalid"}
	now_ms = int(time.time() * 1000)
	if not data.get("active"):
		return {"ok": 0, "reason": "closed"}
	if data.get("exp") and now_ms > int(data["exp"]):
		return {"ok": 0, "reason": "expired"}

	phone = "".join(ch for ch in str(phone or "") if ch.isdigit())[-11:]
	name = (student_name or "").strip() or phone or "Student"
	checkins = list(data.get("checkins") or [])
	for row in checkins:
		if phone and str(row.get("phone") or "")[-11:] == phone:
			return {"ok": 0, "reason": "duplicate", "checkin": row}

	row = {
		"id": frappe.generate_hash(length=10),
		"name": name,
		"phone": phone,
		"email": email or "",
		"device": device or "Phone QR",
		"time": nowtime(),
		"status": "Present",
		"at": str(now_datetime()),
	}
	checkins.append(row)
	data["checkins"] = checkins
	_save(token, data)
	_append_upcoming_attendance(data.get("id"), row)
	student = _upsert_student(
		{
			"name": name,
			"phone": phone,
			"email": email or "",
			"courseId": data.get("courseId") or "",
			"courseName": data.get("courseName") or "",
		}
	)
	if student:
		row["studentId"] = student.get("id")
	return {"ok": 1, "checkin": row, "student": student}


@frappe.whitelist(allow_guest=True)
def list_checkins(token=None, session_name=None):
	token = (token or "").strip()
	data = _load(token) if token else None
	if not data:
		return {"ok": 0, "rows": []}
	rows = []
	for row in data.get("checkins") or []:
		item = dict(row)
		item["time"] = _format_clock(item.get("time") or "")
		rows.append(item)
	return {"ok": 1, "rows": rows}


def _format_clock(value):
	"""Turn Frappe Time / timedelta into a 12-hour clock, e.g. 12:01 AM."""
	if value in (None, ""):
		return ""
	secs = None
	if isinstance(value, timedelta):
		secs = int(value.total_seconds()) % 86400
	elif isinstance(value, dt_time):
		secs = value.hour * 3600 + value.minute * 60 + value.second
	elif isinstance(value, datetime):
		secs = value.hour * 3600 + value.minute * 60 + value.second
	else:
		text = str(value).strip()
		if re.search(r"\b(AM|PM)\b", text, re.I):
			return text
		iso = re.match(r"^\d{4}-\d{2}-\d{2}[ T](\d{1,2}):(\d{2})", text)
		if iso:
			secs = (int(iso.group(1)) % 24) * 3600 + int(iso.group(2)) * 60
		else:
			parts = re.split(r"[:.]", text)
			try:
				h = int(parts[0])
				m = int(parts[1]) if len(parts) > 1 else 0
				secs = (h % 24) * 3600 + (m % 60) * 60
			except (TypeError, ValueError):
				return text
	if secs is None:
		return ""
	h, rem = divmod(max(0, secs), 3600)
	m = rem // 60
	h = h % 24
	ampm = "AM" if h < 12 else "PM"
	h12 = h % 12 or 12
	return f"{h12}:{m:02d} {ampm}"


@frappe.whitelist()
def list_lms_attendance():
	"""QR and Upcoming Training attendance for the LMS student profiles."""
	if frappe.session.user == "Guest":
		return {"rows": []}
	if not frappe.db.exists("DocType", "Upcoming Training Attendance"):
		return {"rows": []}
	child_rows = frappe.get_all(
		"Upcoming Training Attendance",
		fields=[
			"name",
			"parent",
			"participant_name",
			"email",
			"phone",
			"attendance_status",
			"check_in_time",
			"join_time",
			"remarks",
		],
		order_by="modified desc",
		limit_page_length=1500,
	)
	out = []
	for row in child_rows:
		out.append(
			{
				"id": row.name,
				"sessionId": row.parent,
				"parent": row.parent,
				"name": row.participant_name or "",
				"email": row.email or "",
				"phone": row.phone or "",
				"status": row.attendance_status or "Present",
				"time": _format_clock(row.check_in_time or row.join_time or ""),
				"device": "LMS QR" if (row.remarks or "").startswith("LMS QR") else "Upcoming Training",
			}
		)
	return {"rows": out}


def _append_upcoming_attendance(session_name, row):
	if not session_name or not frappe.db.exists("Upcoming Training", session_name):
		return
	try:
		doc = frappe.get_doc("Upcoming Training", session_name)
		phone = row.get("phone") or ""
		for child in doc.get("attendance") or []:
			if phone and (child.phone or "")[-11:] == phone[-11:]:
				return
		doc.append(
			"attendance",
			{
				"participant_name": row.get("name") or "Student",
				"email": row.get("email") or "",
				"phone": phone,
				"attendance_status": "Present",
				"check_in_time": row.get("time"),
				"remarks": "LMS QR check-in",
			},
		)
		doc.flags.ignore_permissions = True
		doc.save(ignore_permissions=True)
		frappe.db.commit()
	except Exception:
		frappe.log_error(frappe.get_traceback(), "LMS QR check-in save")


def _parse_json(value, fallback=None):
	if value in (None, ""):
		return [] if fallback is None else fallback
	if isinstance(value, (list, dict, int, float, bool)):
		return value
	try:
		return json.loads(value)
	except (TypeError, ValueError):
		return [] if fallback is None else fallback


def _quiz_to_dict(doc, include_answers=True):
	questions = []
	for row in doc.get("questions") or []:
		item = {
			"id": row.name or f"q-{row.idx}",
			"type": row.question_type or "mcq",
			"text": row.question_text or "",
			"options": _parse_json(row.options_json, []),
		}
		if include_answers:
			item["answer"] = _parse_json(row.answer_json, 0)
		questions.append(item)
	return {
		"id": doc.name,
		"courseId": doc.course_id,
		"courseName": doc.course_name,
		"name": doc.quiz_title,
		"passing": int(doc.passing or 70),
		"duration": int(doc.duration_minutes or 30),
		"maxAttempts": int(doc.max_attempts or 2),
		"randomize": 1 if doc.randomize else 0,
		"published": 1 if doc.published else 0,
		"questions": questions,
	}


def _grade(quiz_doc, answers):
	answers = answers or {}
	correct = 0
	total = len(quiz_doc.get("questions") or [])
	if not total:
		return {"score": 0, "passing": int(quiz_doc.passing or 70), "passed": 0, "correct": 0, "total": 0}
	for row in quiz_doc.questions:
		qid = row.name or f"q-{row.idx}"
		given = answers.get(qid)
		if given is None:
			given = answers.get(str(row.idx))
		expected = _parse_json(row.answer_json, 0)
		qtype = row.question_type or "mcq"
		ok = False
		if qtype == "multi":
			a = sorted([str(x) for x in (given or [])])
			b = sorted([str(x) for x in (expected if isinstance(expected, list) else [expected])])
			ok = a == b
		elif qtype == "short":
			ok = str(expected or "").strip().lower() in str(given or "").strip().lower() or str(given or "").strip().lower() in str(
				expected or ""
			).strip().lower()
		else:
			try:
				ok = int(given) == int(expected)
			except (TypeError, ValueError):
				ok = str(given) == str(expected)
		if ok:
			correct += 1
	passing = int(quiz_doc.passing or 70)
	score = round((correct / total) * 100)
	return {"score": score, "passing": passing, "passed": 1 if score >= passing else 0, "correct": correct, "total": total}


def _find_quiz_name(course_id):
	course_id = (course_id or "").strip()
	if not course_id:
		return None
	name = frappe.db.get_value("Training LMS Quiz", {"course_id": course_id}, "name")
	if name:
		return name
	name = frappe.db.get_value("Training LMS Quiz", {"course_name": course_id}, "name")
	if name:
		return name
	want = "".join(ch for ch in course_id.lower() if ch.isalnum())
	for row in frappe.get_all(
		"Training LMS Quiz",
		fields=["name", "course_id", "course_name"],
		ignore_permissions=True,
	):
		for val in (row.course_id, row.course_name, row.name):
			if not val:
				continue
			got = "".join(ch for ch in str(val).lower() if ch.isalnum())
			if val == course_id or str(val).lower() == course_id.lower() or (want and got == want):
				return row.name
	return None


@frappe.whitelist(allow_guest=True)
def list_quizzes(course_id=None):
	frappe.flags.ignore_permissions = True
	filters = {}
	if course_id:
		name = _find_quiz_name(course_id)
		if name:
			filters["name"] = name
		else:
			filters["course_id"] = course_id
	names = frappe.get_all(
		"Training LMS Quiz",
		filters=filters,
		pluck="name",
		order_by="modified desc",
		ignore_permissions=True,
	)
	guest = frappe.session.user == "Guest"
	rows = []
	for name in names:
		doc = frappe.get_doc("Training LMS Quiz", name)
		if guest and not int(doc.published or 0):
			continue
		rows.append(_quiz_to_dict(doc, include_answers=not guest))
	return {"rows": rows}


@frappe.whitelist()
def activate_quiz(course_id=None, session_name=None):
	"""Publish the program quiz so students can take it after attendance."""
	if frappe.session.user == "Guest":
		frappe.throw(_("Sign in to activate a quiz."), frappe.PermissionError)
	name = _find_quiz_name(course_id)
	if not name:
		frappe.throw(_("No quiz found for this program. Create it on the course first."))
	doc = frappe.get_doc("Training LMS Quiz", name)
	doc.published = 1
	doc.flags.ignore_permissions = True
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return _quiz_to_dict(doc)


@frappe.whitelist()
def save_quiz(payload=None):
	if frappe.session.user == "Guest":
		frappe.throw(_("Sign in to save a quiz."), frappe.PermissionError)
	payload = _parse_payload(payload)
	name = (payload.get("id") or "").strip()
	if name and frappe.db.exists("Training LMS Quiz", name):
		doc = frappe.get_doc("Training LMS Quiz", name)
		doc.questions = []
	else:
		doc = frappe.new_doc("Training LMS Quiz")
	doc.quiz_title = payload.get("name") or payload.get("quiz_title") or "Final Assessment"
	doc.course_id = payload.get("courseId") or payload.get("course_id") or ""
	doc.course_name = payload.get("courseName") or payload.get("course_name") or ""
	doc.passing = int(payload.get("passing") or 70)
	doc.duration_minutes = int(payload.get("duration") or 30)
	doc.max_attempts = int(payload.get("maxAttempts") or payload.get("max_attempts") or 2)
	doc.randomize = 1 if payload.get("randomize") else 0
	doc.published = 0 if payload.get("published") in (0, "0", False) else 1
	for q in payload.get("questions") or []:
		q = frappe._dict(q)
		doc.append(
			"questions",
			{
				"question_type": q.get("type") or "mcq",
				"question_text": q.get("text") or "",
				"options_json": frappe.as_json(q.get("options") or []),
				"answer_json": frappe.as_json(q.get("answer") if "answer" in q else 0),
			},
		)
	if not doc.questions:
		frappe.throw(_("Add at least one question before saving."))
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return _quiz_to_dict(doc)


@frappe.whitelist()
def delete_quiz(name=None):
	if frappe.session.user == "Guest":
		frappe.throw(_("Sign in to delete a quiz."), frappe.PermissionError)
	if name and frappe.db.exists("Training LMS Quiz", name):
		frappe.delete_doc("Training LMS Quiz", name, ignore_permissions=True)
		frappe.db.commit()
	return {"ok": 1}


@frappe.whitelist(allow_guest=True)
def list_attempts(course_id=None, quiz=None):
	filters = {}
	if course_id:
		filters["course_id"] = course_id
	if quiz:
		filters["quiz"] = quiz
	rows = frappe.get_all(
		"Training LMS Quiz Attempt",
		filters=filters,
		fields=[
			"name",
			"quiz",
			"course_id",
			"course_name",
			"student_id",
			"student_name",
			"phone",
			"score",
			"passed",
			"attempted_at",
		],
		order_by="attempted_at desc",
		limit_page_length=500,
	)
	out = []
	for r in rows:
		out.append(
			{
				"id": r.name,
				"quizId": r.quiz,
				"courseId": r.course_id,
				"courseName": r.course_name,
				"studentId": r.student_id,
				"studentName": r.student_name,
				"phone": r.phone,
				"score": r.score,
				"passed": bool(r.passed),
				"at": str(r.attempted_at or ""),
			}
		)
	return {"rows": out}


@frappe.whitelist(allow_guest=True)
def submit_attempt(quiz=None, answers=None, student_id=None, student_name=None, phone=None):
	if not quiz or not frappe.db.exists("Training LMS Quiz", quiz):
		frappe.throw(_("Quiz not found."))
	doc = frappe.get_doc("Training LMS Quiz", quiz)
	answers = _parse_json(answers, {})
	if not isinstance(answers, dict):
		answers = {}
	# Map editor-local ids (q1) onto child row names where possible.
	mapped = dict(answers)
	for row in doc.questions:
		for key in list(answers.keys()):
			if key in (row.name, f"q-{row.idx}"):
				mapped[row.name] = answers[key]
	result = _grade(doc, mapped)
	used = frappe.db.count(
		"Training LMS Quiz Attempt",
		{"quiz": quiz, "student_id": student_id or "", "phone": phone or ""},
	)
	if doc.max_attempts and used >= int(doc.max_attempts):
		return {**result, "ok": 0, "reason": "limit", "attempt": None}
	att = frappe.get_doc(
		{
			"doctype": "Training LMS Quiz Attempt",
			"quiz": doc.name,
			"course_id": doc.course_id,
			"course_name": doc.course_name,
			"student_id": student_id or "",
			"student_name": student_name or "",
			"phone": phone or "",
			"score": result["score"],
			"passed": result["passed"],
			"attempted_at": now_datetime(),
			"answers_json": frappe.as_json(answers),
		}
	)
	att.flags.ignore_permissions = True
	att.insert(ignore_permissions=True)
	frappe.db.commit()
	return {
		**result,
		"ok": 1,
		"attempt": {
			"id": att.name,
			"quizId": doc.name,
			"courseId": doc.course_id,
			"studentId": student_id,
			"score": result["score"],
			"passed": bool(result["passed"]),
			"at": str(att.attempted_at),
		},
	}


def _digits(phone):
	return "".join(ch for ch in str(phone or "") if ch.isdigit())[-11:]


def _student_to_dict(doc):
	enrollments = []
	for row in doc.get("enrollments") or []:
		enrollments.append(
			{
				"studentId": doc.name,
				"courseId": row.course_id,
				"courseName": row.course_name,
				"progress": int(row.progress or 0),
				"lessonsDone": int(row.lessons_done or 0),
			}
		)
	return {
		"id": doc.name,
		"name": doc.student_name,
		"phone": doc.phone or "",
		"email": doc.email or "",
		"cnic": doc.cnic or "",
		"org": doc.organization or "",
		"designation": doc.designation or "",
		"employeeId": doc.employee_id or "",
		"gender": doc.gender or "",
		"status": doc.status or "Active",
		"registered": str(doc.registered_on or "")[:10],
		"enrollments": enrollments,
	}


def _upsert_student(payload):
	if not frappe.db.exists("DocType", "Training LMS Student"):
		return None
	payload = _parse_payload(payload)
	phone = _digits(payload.get("phone"))
	name = (payload.get("name") or payload.get("student_name") or "").strip()
	if not name and not phone:
		return None
	existing = None
	if payload.get("id") and frappe.db.exists("Training LMS Student", payload.get("id")):
		existing = payload.get("id")
	if not existing and phone:
		existing = frappe.db.get_value("Training LMS Student", {"phone": ["like", f"%{phone}"]}, "name")
	if not existing and payload.get("email"):
		existing = frappe.db.get_value("Training LMS Student", {"email": payload.get("email")}, "name")
	if existing:
		doc = frappe.get_doc("Training LMS Student", existing)
	else:
		doc = frappe.new_doc("Training LMS Student")
		doc.registered_on = nowdate()
	if name:
		doc.student_name = name
	if phone:
		doc.phone = phone
	if payload.get("email"):
		doc.email = payload.get("email")
	if payload.get("cnic"):
		doc.cnic = payload.get("cnic")
	if payload.get("org") or payload.get("organization"):
		doc.organization = payload.get("org") or payload.get("organization")
	if payload.get("designation"):
		doc.designation = payload.get("designation")
	if payload.get("employeeId") or payload.get("employee_id"):
		doc.employee_id = payload.get("employeeId") or payload.get("employee_id")
	if payload.get("gender"):
		doc.gender = payload.get("gender")
	doc.status = payload.get("status") or doc.status or "Active"
	course_id = payload.get("courseId") or payload.get("course_id") or ""
	course_name = payload.get("courseName") or payload.get("course_name") or ""
	if course_id:
		found = False
		for row in doc.get("enrollments") or []:
			if row.course_id == course_id:
				found = True
				if course_name and not row.course_name:
					row.course_name = course_name
				if not row.progress:
					row.progress = 15
				break
		if not found:
			doc.append(
				"enrollments",
				{"course_id": course_id, "course_name": course_name, "progress": 15, "lessons_done": 0},
			)
	doc.flags.ignore_permissions = True
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return _student_to_dict(doc)


@frappe.whitelist(allow_guest=True)
def save_student(payload=None):
	saved = _upsert_student(payload)
	if not saved:
		frappe.throw(_("Name or mobile is required."))
	return saved


@frappe.whitelist()
def list_students():
	if frappe.session.user == "Guest":
		return {"rows": [], "enrollments": []}
	if not frappe.db.exists("DocType", "Training LMS Student"):
		return {"rows": [], "enrollments": []}
	names = frappe.get_all("Training LMS Student", pluck="name", order_by="modified desc", limit_page_length=2000)
	rows = []
	enrollments = []
	for name in names:
		data = _student_to_dict(frappe.get_doc("Training LMS Student", name))
		rows.append(data)
		enrollments.extend(data.get("enrollments") or [])
	return {"rows": rows, "enrollments": enrollments}


@frappe.whitelist()
def save_certificate(payload=None):
	if frappe.session.user == "Guest":
		frappe.throw(_("Sign in to issue a certificate."), frappe.PermissionError)
	payload = _parse_payload(payload)
	student_id = payload.get("studentId") or payload.get("student") or ""
	course_id = payload.get("courseId") or payload.get("course_id") or ""
	if student_id and course_id:
		existing = frappe.db.get_value(
			"Training LMS Certificate",
			{"student": student_id, "course_id": course_id, "status": "Valid"},
			"name",
		)
		if existing:
			doc = frappe.get_doc("Training LMS Certificate", existing)
			return {
				"id": doc.name,
				"studentId": doc.student,
				"courseId": doc.course_id,
				"issue": str(doc.issue_date or ""),
				"expiry": str(doc.expiry_date or ""),
				"status": doc.status,
				"grade": doc.grade or "",
				"revokedReason": doc.revoked_reason or "",
			}
	doc = frappe.new_doc("Training LMS Certificate")
	doc.student = student_id
	doc.student_name = payload.get("studentName") or payload.get("student_name") or ""
	doc.course_id = course_id
	doc.course_name = payload.get("courseName") or payload.get("course_name") or ""
	doc.issue_date = payload.get("issue") or nowdate()
	doc.expiry_date = payload.get("expiry") or add_years(nowdate(), 2)
	doc.grade = payload.get("grade") or ""
	doc.status = payload.get("status") or "Valid"
	doc.insert(ignore_permissions=True)
	frappe.db.commit()
	return {
		"id": doc.name,
		"studentId": doc.student,
		"courseId": doc.course_id,
		"issue": str(doc.issue_date or ""),
		"expiry": str(doc.expiry_date or ""),
		"status": doc.status,
		"grade": doc.grade or "",
		"revokedReason": "",
	}


@frappe.whitelist()
def list_certificates():
	if frappe.session.user == "Guest" or not frappe.db.exists("DocType", "Training LMS Certificate"):
		return {"rows": []}
	rows = frappe.get_all(
		"Training LMS Certificate",
		fields=["name", "student", "student_name", "course_id", "course_name", "issue_date", "expiry_date", "grade", "status", "revoked_reason"],
		order_by="modified desc",
		limit_page_length=1000,
	)
	return {
		"rows": [
			{
				"id": r.name,
				"studentId": r.student,
				"studentName": r.student_name,
				"courseId": r.course_id,
				"courseName": r.course_name,
				"issue": str(r.issue_date or ""),
				"expiry": str(r.expiry_date or ""),
				"grade": r.grade or "",
				"status": r.status or "Valid",
				"revokedReason": r.revoked_reason or "",
			}
			for r in rows
		]
	}


@frappe.whitelist()
def revoke_certificate(name=None, reason=None):
	if frappe.session.user == "Guest":
		frappe.throw(_("Sign in to revoke a certificate."), frappe.PermissionError)
	if not name or not frappe.db.exists("Training LMS Certificate", name):
		frappe.throw(_("Certificate not found."))
	doc = frappe.get_doc("Training LMS Certificate", name)
	doc.status = "Revoked"
	doc.revoked_reason = reason or "Revoked by administrator"
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return {"ok": 1}


STAFF_ROLES = {
	"System Manager",
	"Admin User",
	"Assistant Admin",
	"HR Manager",
	"HR User",
	"Accounts Manager",
	"Education Manager",
	"CEO",
	"CFO",
	"COO",
	"CMO",
	"HOD",
	"Department Head",
}
TRAINER_ROLES = {"Instructor", "Training User"}
COORD_ROLES = {"Course Creator", "Academics User"}
STUDENT_ROLES = {"LMS Student", "Student"}


def portal_role_for(user=None):
	user = user or frappe.session.user
	if not user or user == "Guest":
		return ""
	if user == "Administrator":
		return "super"
	roles = set(frappe.get_roles(user))
	if "System Manager" in roles:
		return "super"
	if roles & TRAINER_ROLES:
		return "trainer"
	full_name = frappe.db.get_value("User", user, "full_name") or ""
	if full_name and frappe.db.exists("DocType", "Trainer") and frappe.db.exists("Trainer", {"trainer_name": full_name}):
		return "trainer"
	desig = ""
	try:
		if frappe.db.exists("DocType", "Employee"):
			desig = frappe.db.get_value("Employee", {"user_id": user}, "designation") or ""
	except Exception:
		desig = ""
	blob = f"{desig} {full_name}".lower()
	if "trainer" in blob or "instructor" in blob:
		return "trainer"
	if roles & COORD_ROLES or "coordinator" in blob:
		return "coordinator"
	core = roles - {"All", "Guest", "Desk User", "Employee", "Employee Self Service", "Inbox User", "Newsletter Manager"}
	if core and core <= STUDENT_ROLES:
		return "student"
	if roles & STAFF_ROLES or (core - STUDENT_ROLES):
		return "admin"
	if roles & STUDENT_ROLES:
		return "student"
	return "admin"


def _find_student_by_phone(phone):
	phone = _digits(phone)
	if not phone or not frappe.db.exists("DocType", "Training LMS Student"):
		return None
	name = frappe.db.get_value("Training LMS Student", {"phone": phone}, "name")
	if not name and len(phone) >= 10:
		name = frappe.db.get_value("Training LMS Student", {"phone": ["like", f"%{phone[-10:]}"]}, "name")
	if not name:
		for row in frappe.get_all("Training LMS Student", fields=["name", "phone"], ignore_permissions=True):
			got = _digits(row.phone)
			if got and (got == phone or got[-10:] == phone[-10:] or got[-11:] == phone[-11:]):
				name = row.name
				break
	if not name:
		return None
	frappe.flags.ignore_permissions = True
	return frappe.get_doc("Training LMS Student", name)


def _session_payload(kind, role, extra=None):
	data = {
		"ok": 1,
		"kind": kind,
		"role": role,
		"user": frappe.session.user,
		"full_name": "",
		"email": "",
		"csrf_token": frappe.sessions.get_csrf_token(),
		"student": None,
	}
	if frappe.session.user != "Guest":
		data["full_name"] = frappe.db.get_value("User", frappe.session.user, "full_name") or frappe.session.user
		data["email"] = frappe.session.user
	if extra:
		data.update(extra)
	return data


def _student_for_user(user):
	if not user or user == "Guest" or not frappe.db.exists("DocType", "Training LMS Student"):
		return None
	name = frappe.db.get_value("Training LMS Student", {"email": user}, "name")
	if name:
		frappe.flags.ignore_permissions = True
		return frappe.get_doc("Training LMS Student", name)
	phone = frappe.db.get_value("User", user, "mobile_no")
	if phone:
		return _find_student_by_phone(phone)
	return None


@frappe.whitelist(allow_guest=True)
def portal_session():
	if frappe.session.user == "Guest":
		return {"ok": 0, "user": "Guest", "role": "", "kind": ""}
	role = portal_role_for(frappe.session.user)
	extra = {}
	if role == "student":
		doc = _student_for_user(frappe.session.user)
		if doc:
			extra["student"] = _student_to_dict(doc)
			extra["kind"] = "student"
	return _session_payload("student" if role == "student" else "staff", role, extra)


@frappe.whitelist(allow_guest=True)
def portal_login(usr=None, pwd=None):
	usr = (usr or frappe.form_dict.get("usr") or "").strip()
	pwd = (pwd or frappe.form_dict.get("pwd") or "").strip()
	if not usr or not pwd:
		frappe.throw(_("Enter your mobile number or email, and your password."))
	digits = _digits(usr)
	if "@" not in usr and len(digits) >= 7:
		return _login_student(digits, pwd)
	return _login_staff(usr, pwd)


def _login_student(phone, pwd):
	frappe.flags.ignore_permissions = True
	doc = _find_student_by_phone(phone)
	if not doc:
		frappe.throw(_("No student found with this mobile number. Scan the session QR to register first."))
	stored = _digits(doc.phone)
	pin = "".join(ch for ch in str(pwd) if ch.isdigit())
	if len(stored) < 4 or pin != stored[-4:]:
		frappe.throw(_("Student password is the last 4 digits of your mobile number."))
	return _session_payload(
		"student",
		"student",
		{
			"user": "Guest",
			"full_name": doc.student_name,
			"email": doc.email or stored,
			"student": _student_to_dict(doc),
		},
	)


def _login_staff(usr, pwd):
	digits = _digits(usr)
	if digits and "@" not in usr:
		try:
			by_mobile = frappe.db.get_value("User", {"enabled": 1, "mobile_no": ["like", f"%{digits[-10:]}"]}, "name")
			if by_mobile:
				usr = by_mobile
		except Exception:
			pass
	try:
		frappe.local.login_manager = frappe.auth.LoginManager()
		frappe.local.login_manager.authenticate(user=usr, pwd=pwd)
		frappe.local.login_manager.post_login()
	except frappe.AuthenticationError:
		frappe.clear_messages()
		frappe.throw(_("Invalid email or password."))
	return _session_payload("staff", portal_role_for(frappe.session.user))


@frappe.whitelist(allow_guest=True)
def portal_logout():
	if frappe.session.user != "Guest":
		frappe.local.login_manager = frappe.auth.LoginManager()
		frappe.local.login_manager.logout()
	return {"ok": 1}


def _require_staff():
	if frappe.session.user == "Guest":
		frappe.throw(_("Sign in to manage courses and lessons."), frappe.PermissionError)


def _slug_id(prefix, name):
	raw = re.sub(r"[^a-z0-9]+", "-", (name or "").lower()).strip("-")[:48] or "other"
	return f"{prefix}-{raw}"


def _course_to_dict(doc):
	return {
		"id": doc.name,
		"courseId": doc.course_id or _slug_id("c", doc.course_title),
		"name": doc.course_title,
		"code": doc.code or "",
		"category": doc.category or "Training",
		"trainer": doc.trainer_name or "",
		"color": doc.color or "#6366f1",
		"duration": doc.duration or "",
		"status": doc.status or "Active",
		"description": doc.description or "",
		"kind": "course",
	}


def _lesson_to_dict(doc):
	return {
		"id": doc.name,
		"title": doc.lesson_title,
		"course": doc.course or "",
		"courseId": doc.course_id or "",
		"courseName": doc.course_name or "",
		"module": doc.module_title or "Lessons",
		"duration": int(doc.duration_minutes or 0),
		"order": int(doc.sort_order or 0),
		"published": int(doc.published or 0),
		"summary": doc.summary or "",
		"content": doc.content or "",
		"kind": "lesson",
	}


def _ensure_training_type(title):
	title = (title or "").strip()
	if not title or not frappe.db.exists("DocType", "Training Type"):
		return
	if frappe.db.exists("Training Type", title):
		return
	try:
		doc = frappe.new_doc("Training Type")
		if frappe.get_meta("Training Type").has_field("type"):
			doc.type = title
		doc.insert(ignore_permissions=True)
	except Exception:
		frappe.log_error(frappe.get_traceback(), "Training Type create")


@frappe.whitelist()
def list_courses():
	if not frappe.db.exists("DocType", "Training LMS Course"):
		return []
	rows = frappe.get_all(
		"Training LMS Course",
		fields=[
			"name",
			"course_title",
			"course_id",
			"code",
			"category",
			"trainer_name",
			"color",
			"duration",
			"status",
			"description",
			"modified",
		],
		order_by="modified desc",
		limit_page_length=500,
		ignore_permissions=True,
	)
	out = []
	for r in rows:
		out.append(_course_to_dict(frappe._dict(r)))
	return out


@frappe.whitelist()
def save_course(payload=None):
	_require_staff()
	payload = _parse_payload(payload)
	title = (payload.get("name") or payload.get("course_title") or "").strip()
	if not title:
		frappe.throw(_("Course name is required."))
	name = (payload.get("id") or "").strip()
	if name and frappe.db.exists("Training LMS Course", name):
		doc = frappe.get_doc("Training LMS Course", name)
	else:
		existing = frappe.db.get_value("Training LMS Course", {"course_title": title}, "name")
		doc = frappe.get_doc("Training LMS Course", existing) if existing else frappe.new_doc("Training LMS Course")
	doc.course_title = title
	doc.course_id = (payload.get("courseId") or payload.get("course_id") or "").strip() or _slug_id("c", title)
	doc.code = (payload.get("code") or "").strip() or doc.course_id.replace("c-", "").upper()[:16]
	doc.category = payload.get("category") or "Training"
	doc.trainer_name = payload.get("trainer") or payload.get("trainer_name") or ""
	doc.color = payload.get("color") or "#6366f1"
	doc.duration = payload.get("duration") or ""
	doc.status = payload.get("status") or "Active"
	doc.description = payload.get("description") or ""
	doc.save(ignore_permissions=True)
	_ensure_training_type(title)
	frappe.db.commit()
	return _course_to_dict(doc)


@frappe.whitelist()
def delete_course(name=None):
	_require_staff()
	if name and frappe.db.exists("Training LMS Course", name):
		frappe.delete_doc("Training LMS Course", name, ignore_permissions=True)
		frappe.db.commit()
	return {"ok": 1}


@frappe.whitelist()
def list_lessons(course_id=None):
	if not frappe.db.exists("DocType", "Training LMS Lesson"):
		return []
	filters = {}
	course_id = (course_id or "").strip()
	if course_id:
		filters["course_id"] = course_id
	rows = frappe.get_all(
		"Training LMS Lesson",
		filters=filters,
		fields=[
			"name",
			"lesson_title",
			"course",
			"course_id",
			"course_name",
			"module_title",
			"duration_minutes",
			"sort_order",
			"published",
			"summary",
			"content",
			"modified",
		],
		order_by="sort_order asc, modified desc",
		limit_page_length=1000,
		ignore_permissions=True,
	)
	if course_id:
		# also match by course name / course link
		extra = frappe.get_all(
			"Training LMS Lesson",
			filters={"course_name": course_id},
			fields=[
				"name",
				"lesson_title",
				"course",
				"course_id",
				"course_name",
				"module_title",
				"duration_minutes",
				"sort_order",
				"published",
				"summary",
				"content",
			],
			ignore_permissions=True,
		)
		seen = {r.name for r in rows}
		for r in extra:
			if r.name not in seen:
				rows.append(r)
	return [_lesson_to_dict(frappe._dict(r)) for r in rows]


@frappe.whitelist()
def save_lesson(payload=None):
	_require_staff()
	payload = _parse_payload(payload)
	title = (payload.get("title") or payload.get("lesson_title") or "").strip()
	if not title:
		frappe.throw(_("Lesson title is required."))
	name = (payload.get("id") or "").strip()
	if name and frappe.db.exists("Training LMS Lesson", name):
		doc = frappe.get_doc("Training LMS Lesson", name)
	else:
		doc = frappe.new_doc("Training LMS Lesson")
	course_name = (payload.get("courseName") or payload.get("course_name") or "").strip()
	course_link = (payload.get("course") or "").strip()
	if course_link and frappe.db.exists("Training LMS Course", course_link):
		course_doc = frappe.get_doc("Training LMS Course", course_link)
		doc.course = course_link
		doc.course_id = course_doc.course_id or _slug_id("c", course_doc.course_title)
		doc.course_name = course_doc.course_title
	else:
		doc.course = None
		doc.course_id = (payload.get("courseId") or payload.get("course_id") or "").strip() or _slug_id(
			"c", course_name
		)
		doc.course_name = course_name
	doc.lesson_title = title
	doc.module_title = payload.get("module") or payload.get("module_title") or "Lessons"
	doc.duration_minutes = int(payload.get("duration") or payload.get("duration_minutes") or 20)
	doc.sort_order = int(payload.get("order") or payload.get("sort_order") or 0)
	doc.published = 0 if payload.get("published") in (0, "0", False) else 1
	doc.summary = payload.get("summary") or ""
	doc.content = payload.get("content") or ""
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return _lesson_to_dict(doc)


@frappe.whitelist()
def delete_lesson(name=None):
	_require_staff()
	if name and frappe.db.exists("Training LMS Lesson", name):
		frappe.delete_doc("Training LMS Lesson", name, ignore_permissions=True)
		frappe.db.commit()
	return {"ok": 1}
