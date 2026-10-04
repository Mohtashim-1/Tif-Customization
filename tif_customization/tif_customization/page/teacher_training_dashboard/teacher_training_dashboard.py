# Copyright (c) 2026, TIF Customization and contributors
# License: MIT
"""Teacher Training dashboard — Upcoming Training (schedule) + participants + feedback."""

from __future__ import annotations

import json

import frappe
from frappe import _
from frappe.utils import cint, getdate, today

from tif_customization.tif_customization.page.smes_target_base___k.smes_target_base___k import (
	_fiscal_year_start,
)

DOCTYPE = "Upcoming Training"
DEPT_DEFAULT = "T. Training"


def _parse(filters):
	if isinstance(filters, str):
		try:
			return json.loads(filters) or {}
		except Exception:
			return {}
	return filters or {}


def _dates(filters):
	to_date = getdate(filters.get("to_date") or today())
	from_date = filters.get("from_date")
	if from_date:
		from_date = getdate(from_date)
	else:
		fy = _fiscal_year_start(to_date.year, to_date.month)
		from_date = getdate(f"{fy}-07-01")
	if from_date > to_date:
		from_date = to_date
	return from_date, to_date


def _check():
	if frappe.session.user == "Guest":
		frappe.throw(_("Please log in."), frappe.PermissionError)
	if not frappe.has_permission(DOCTYPE, "read"):
		frappe.throw(_("You are not permitted to view Upcoming Training."), frappe.PermissionError)


def _status(row, today_d):
	raw = (row.get("schedule_status") or "").strip().lower()
	if raw in ("completed", "complete"):
		return "completed"
	if raw in ("in progress", "in_progress", "live"):
		return "in_progress"
	if raw == "upcoming":
		return "upcoming"
	day = row.get("training_date")
	if not day:
		return "upcoming"
	day = getdate(day)
	if day < today_d:
		return "completed"
	if day > today_d:
		return "upcoming"
	return "in_progress"


def _customer_titles(tags):
	"""Map Customer name → customer_name for tag_school links."""
	tags = [t for t in { (t or "").strip() for t in tags } if t]
	if not tags or not frappe.db.exists("DocType", "Customer"):
		return {}
	rows = frappe.db.sql(
		"""
		SELECT name, TRIM(IFNULL(customer_name, name)) AS title
		FROM `tabCustomer`
		WHERE name IN %(names)s
		""",
		{"names": tuple(tags)},
		as_dict=True,
	)
	return {r.name: r.title for r in rows}


def _school_label(row, customer_titles=None):
	"""Prefer school_name, then Customer title from tag_school."""
	school_name = (row.get("school_name") or "").strip()
	tag = (row.get("tag_school") or "").strip()
	if school_name:
		return school_name
	if tag:
		titles = customer_titles or {}
		return (titles.get(tag) or tag).strip()
	return ""


def _location_fallback(row):
	"""When school is not tagged — show Online / city · area instead of blank."""
	mode = (row.get("mode_of_training") or "").strip().lower()
	city = (row.get("city") or "").strip()
	area = (row.get("area") or "").strip()
	if mode == "online" and not city:
		return "Online"
	if city and area:
		return f"{city} · {area}"
	if city:
		return city
	if mode == "online":
		return "Online"
	return "Not tagged"


def _program_label(row):
	return (row.get("program") or "").strip() or "(No Program)"


def _title(row):
	if (row.get("type") or "") == "Workshop":
		return (row.get("workshop_topic") or row.get("program") or "Workshop").strip() or "Workshop"
	return (row.get("training_type") or row.get("program") or "Training").strip() or "Training"


def _attendance_map(names):
	if not names or not frappe.db.table_exists("Upcoming Training Attendance"):
		return {}
	rows = frappe.db.sql(
		"""
		SELECT parent,
			COUNT(*) AS total,
			SUM(CASE WHEN attendance_status = 'Present' THEN 1 ELSE 0 END) AS present
		FROM `tabUpcoming Training Attendance`
		WHERE parent IN %(names)s
		GROUP BY parent
		""",
		{"names": tuple(names)},
		as_dict=True,
	)
	return {r.parent: r for r in rows}


def _load_sessions(filters):
	from_date, to_date = _dates(filters)
	department = (filters.get("department") or DEPT_DEFAULT).strip()
	program = (filters.get("program") or "").strip()
	school = (filters.get("school") or "").strip()
	status = (filters.get("status") or "").strip().lower()
	trainer = (filters.get("trainer") or "").strip()
	mode = (filters.get("mode") or "").strip()

	conds = ["IFNULL(docstatus, 0) < 2", "training_date BETWEEN %(from_date)s AND %(to_date)s"]
	params = {"from_date": from_date, "to_date": to_date}
	if department and department.lower() not in ("all", "__all__"):
		conds.append("IFNULL(department_training, '') = %(department)s")
		params["department"] = department
	if program:
		if program == "(No Program)":
			conds.append("IFNULL(TRIM(program), '') = ''")
		else:
			conds.append("program = %(program)s")
			params["program"] = program
	if school:
		if school in ("(Unspecified)", "Not tagged", "Online"):
			conds.append("IFNULL(TRIM(school_name), '') = '' AND IFNULL(TRIM(tag_school), '') = ''")
			if school == "Online":
				conds.append("IFNULL(mode_of_training, '') = 'Online'")
			elif school == "Not tagged":
				conds.append("IFNULL(mode_of_training, '') != 'Online'")
		else:
			# Match school_name, tag_school id, or Customer title
			conds.append(
				"""(
					IFNULL(TRIM(school_name), '') = %(school)s
					OR IFNULL(TRIM(tag_school), '') = %(school)s
					OR tag_school IN (
						SELECT name FROM `tabCustomer`
						WHERE TRIM(IFNULL(customer_name, name)) = %(school)s
					)
					OR IFNULL(TRIM(city), '') = %(school)s
					OR CONCAT(IFNULL(TRIM(city), ''), ' · ', IFNULL(TRIM(area), '')) = %(school)s
				)"""
			)
			params["school"] = school
	if trainer:
		conds.append("IFNULL(TRIM(trainer_name), '') = %(trainer)s")
		params["trainer"] = trainer
	if mode:
		conds.append("IFNULL(mode_of_training, '') = %(mode)s")
		params["mode"] = mode

	rows = frappe.db.sql(
		f"""
		SELECT
			name, type, training_date, training_time, training_end_time, schedule_status,
			training_type, workshop_topic, mode_of_training, participants_category,
			school_name, tag_school, school_type, department_training, city, area,
			trainer_name, program, workshop_for, zoom_id, attendance_count
		FROM `tab{DOCTYPE}`
		WHERE {" AND ".join(conds)}
		ORDER BY training_date DESC, training_time DESC
		LIMIT 5000
		""",
		params,
		as_dict=True,
	)

	today_d = getdate(today())
	marks = _attendance_map([r.name for r in rows])
	customer_titles = _customer_titles([r.tag_school for r in rows])
	sessions = []
	for r in rows:
		st = _status(r, today_d)
		if status and st != status:
			continue
		stats = marks.get(r.name)
		present = cint(stats.present) if stats else cint(r.attendance_count)
		total = cint(stats.total) if stats else present
		if total and present > total:
			present = total
		school = _school_label(r, customer_titles)
		location = _location_fallback(r)
		# Card/filter key: real school when tagged, else location fallback (not a fake school name)
		school_key = school or location
		sessions.append(
			{
				"name": r.name,
				"type": r.type or "Training",
				"title": _title(r),
				"date": str(getdate(r.training_date)) if r.training_date else "",
				"time": str(r.training_time or "")[:5],
				"end_time": str(r.training_end_time or "")[:5],
				"status": st,
				"schedule_status": r.schedule_status or "",
				"training_type": (r.training_type or "").strip(),
				"program": _program_label(r),
				"program_raw": (r.program or "").strip(),
				"school": school_key,
				"school_tagged": bool(school),
				"school_raw": (r.school_name or r.tag_school or "").strip(),
				"tag_school": (r.tag_school or "").strip(),
				"school_type": (r.school_type or "").strip(),
				"city": (r.city or "").strip(),
				"area": (r.area or "").strip(),
				"location": location,
				"trainer": (r.trainer_name or "").strip(),
				"mode": (r.mode_of_training or "").strip(),
				"category": (r.participants_category or "").strip(),
				"department": (r.department_training or "").strip(),
				"present": present,
				"total": total,
				"zoom_id": (r.zoom_id or "").strip(),
				"url": f"/app/upcoming-training/{r.name}",
			}
		)
	return sessions, from_date, to_date


def _group_cards(sessions, key):
	bucket = {}
	for s in sessions:
		label = s.get(key) or "—"
		slot = bucket.setdefault(
			label,
			{
				"label": label,
				"sessions": 0,
				"completed": 0,
				"upcoming": 0,
				"in_progress": 0,
				"participants": 0,
				"present": 0,
			},
		)
		slot["sessions"] += 1
		slot[s["status"]] = slot.get(s["status"], 0) + 1
		slot["participants"] += cint(s["total"])
		slot["present"] += cint(s["present"])
	rows = list(bucket.values())
	rows.sort(key=lambda x: (-x["sessions"], x["label"].lower()))
	return rows


def _field_visit_participants(from_date, to_date):
	"""Training attendees captured on Field Visit (type Training)."""
	if not frappe.db.table_exists("Training Attendee"):
		return []
	return frappe.db.sql(
		"""
		SELECT
			ta.name AS row_name,
			ta.attendee_name,
			ta.contact_number,
			ta.email,
			ta.school_organization,
			ta.training_venue,
			ta.training_date,
			ta.trainer_name,
			ta.designation,
			ta.feedback_submitted,
			ta.feedback_token,
			fv.name AS visit,
			fv.type AS visit_type
		FROM `tabTraining Attendee` ta
		INNER JOIN `tabField Visit` fv ON fv.name = ta.parent
		WHERE fv.docstatus = 1
			AND fv.type = 'Training'
			AND (
				ta.training_date BETWEEN %(from_date)s AND %(to_date)s
				OR (ta.training_date IS NULL AND DATE(fv.creation) BETWEEN %(from_date)s AND %(to_date)s)
			)
		ORDER BY IFNULL(ta.training_date, fv.creation) DESC
		LIMIT 2000
		""",
		{"from_date": from_date, "to_date": to_date},
		as_dict=True,
	)


def _feedback_rows(from_date, to_date):
	if not frappe.db.exists("DocType", "Training Attendee Feedback"):
		return []
	return frappe.db.sql(
		"""
		SELECT
			name, field_visit, attendee_name, email, training_date, trainer_name,
			venue_name, session_category, overall_rating, content_quality,
			trainer_rating, venue_rating, would_recommend,
			what_went_well, improvements, additional_comments, creation
		FROM `tabTraining Attendee Feedback`
		WHERE IFNULL(training_date, DATE(creation)) BETWEEN %(from_date)s AND %(to_date)s
		ORDER BY IFNULL(training_date, creation) DESC
		LIMIT 1000
		""",
		{"from_date": from_date, "to_date": to_date},
		as_dict=True,
	)


def _session_participants(session_names):
	if not session_names or not frappe.db.table_exists("Upcoming Training Attendance"):
		return []
	return frappe.db.sql(
		"""
		SELECT
			a.name AS row_name,
			a.parent AS session,
			a.participant_name,
			a.email,
			a.phone,
			a.join_time,
			a.leave_time,
			a.duration_minutes,
			a.attendance_status,
			a.remarks,
			u.training_date,
			u.program,
			u.school_name,
			u.tag_school,
			u.trainer_name
		FROM `tabUpcoming Training Attendance` a
		INNER JOIN `tabUpcoming Training` u ON u.name = a.parent
		WHERE a.parent IN %(names)s
		ORDER BY u.training_date DESC, a.idx ASC
		LIMIT 3000
		""",
		{"names": tuple(session_names)},
		as_dict=True,
	)


@frappe.whitelist()
def get_dashboard_data(filters=None):
	_check()
	filters = _parse(filters)
	sessions, from_date, to_date = _load_sessions(filters)
	fv_participants = _field_visit_participants(from_date, to_date)
	feedback = _feedback_rows(from_date, to_date)

	present = sum(cint(s["present"]) for s in sessions)
	total_marks = sum(cint(s["total"]) for s in sessions)
	completed = sum(1 for s in sessions if s["status"] == "completed")
	upcoming = sum(1 for s in sessions if s["status"] == "upcoming")
	in_progress = sum(1 for s in sessions if s["status"] == "in_progress")
	named_programs = {s["program"] for s in sessions if s["program"] and s["program"] != "(No Program)"}
	tagged_schools = {s["school"] for s in sessions if s.get("school_tagged")}
	trainers = {s["trainer"] for s in sessions if s["trainer"]}
	online = sum(1 for s in sessions if (s.get("mode") or "").lower() == "online")
	onsite = sum(1 for s in sessions if (s.get("mode") or "").lower() in ("onsite", "in-person", "in person"))
	sessions_with_attendance = sum(1 for s in sessions if cint(s["present"]) or cint(s["total"]))
	fb_ratings = [cint(r.overall_rating) for r in feedback if cint(r.overall_rating)]
	avg_rating = round(sum(fb_ratings) / len(fb_ratings), 2) if fb_ratings else None
	fb_yes = sum(1 for p in fv_participants if cint(p.feedback_submitted))

	options_programs = sorted({s["program"] for s in sessions}, key=str.lower)
	options_schools = sorted({s["school"] for s in sessions}, key=str.lower)
	options_trainers = sorted({s["trainer"] for s in sessions if s["trainer"]}, key=str.lower)
	options_modes = sorted({s["mode"] for s in sessions if s["mode"]}, key=str.lower)

	return {
		"from_date": str(from_date),
		"to_date": str(to_date),
		"kpis": {
			"sessions": len(sessions),
			"completed": completed,
			"upcoming": upcoming,
			"in_progress": in_progress,
			"programs": len(named_programs),
			"programs_total": len({s["program"] for s in sessions}),
			"schools": len(tagged_schools),
			"schools_unspecified": sum(1 for s in sessions if not s.get("school_tagged")),
			"trainers": len(trainers),
			"participants": present,
			"participant_marks": total_marks,
			"schedule_present": present,
			"online": online,
			"onsite": onsite,
			"with_attendance": sessions_with_attendance,
			"fv_participants": len(fv_participants),
			"feedback": len(feedback),
			"feedback_pending": max(0, len(fv_participants) - fb_yes),
			"avg_rating": avg_rating,
		},
		"by_program": _group_cards(sessions, "program"),
		"by_school": _group_cards(sessions, "school"),
		"by_trainer": _group_cards(sessions, "trainer")[:25],
		"by_status": [
			{"label": "Completed", "count": completed},
			{"label": "Upcoming", "count": upcoming},
			{"label": "In Progress", "count": in_progress},
		],
		"recent_sessions": sessions[:50],
		"options": {
			"programs": options_programs,
			"schools": options_schools,
			"trainers": options_trainers,
			"modes": options_modes,
			"departments": ["T. Training", "TPS", "CEE", "QPS", "TIF", "__all__"],
		},
		"links": {
			"schedule": "/training-schedule",
			"list": "/app/upcoming-training",
			"training_card": "/app/training-card",
		},
	}


@frappe.whitelist()
def get_drilldown(filters=None, kind=None, value=None):
	"""kind: program | school | participants | feedback | sessions | trainer | status"""
	_check()
	filters = _parse(filters)
	kind = (kind or "").strip().lower()
	value = (value or "").strip()

	# Narrow filters for card clicks
	local = dict(filters)
	if kind == "program" and value:
		local["program"] = value
	elif kind == "school" and value:
		local["school"] = value
	elif kind == "trainer" and value:
		local["trainer"] = value
	elif kind == "status" and value:
		local["status"] = value.lower().replace(" ", "_")

	sessions, from_date, to_date = _load_sessions(local)
	session_names = [s["name"] for s in sessions]

	out = {
		"kind": kind,
		"value": value,
		"from_date": str(from_date),
		"to_date": str(to_date),
		"sessions": sessions[:300],
		"participants": [],
		"fv_participants": [],
		"feedback": [],
	}

	if kind in ("participants", "program", "school", "trainer", "sessions", "status", ""):
		rows = _session_participants(session_names)
		out["participants"] = [
			{
				"row_name": r.row_name,
				"session": r.session,
				"name": (r.participant_name or "").strip(),
				"email": (r.email or "").strip(),
				"phone": (r.phone or "").strip(),
				"join_time": r.join_time or "",
				"leave_time": r.leave_time or "",
				"duration": cint(r.duration_minutes),
				"status": r.attendance_status or "",
				"date": str(r.training_date) if r.training_date else "",
				"program": (r.program or "").strip() or "(No Program)",
				"school": (r.school_name or r.tag_school or "").strip() or "(Unspecified)",
				"trainer": (r.trainer_name or "").strip(),
				"url": f"/app/upcoming-training/{r.session}",
			}
			for r in rows[:500]
		]

	if kind in ("participants", "feedback", ""):
		fv = _field_visit_participants(from_date, to_date)
		out["fv_participants"] = [
			{
				"row_name": r.row_name,
				"name": (r.attendee_name or "").strip(),
				"contact": (r.contact_number or "").strip(),
				"email": (r.email or "").strip(),
				"school": (r.school_organization or "").strip(),
				"venue": (r.training_venue or "").strip(),
				"date": str(r.training_date) if r.training_date else "",
				"trainer": (r.trainer_name or "").strip(),
				"designation": (r.designation or "").strip(),
				"feedback_submitted": cint(r.feedback_submitted),
				"visit": r.visit,
				"url": f"/app/field-visit/{r.visit}",
			}
			for r in fv[:500]
		]

	if kind in ("feedback", "participants", ""):
		fb = _feedback_rows(from_date, to_date)
		out["feedback"] = [
			{
				"name": r.name,
				"attendee": (r.attendee_name or "").strip(),
				"email": (r.email or "").strip(),
				"date": str(r.training_date) if r.training_date else "",
				"trainer": (r.trainer_name or "").strip(),
				"venue": (r.venue_name or "").strip(),
				"category": (r.session_category or "").strip(),
				"overall": cint(r.overall_rating),
				"content": cint(r.content_quality),
				"trainer_rating": cint(r.trainer_rating),
				"venue_rating": cint(r.venue_rating),
				"recommend": (r.would_recommend or "").strip(),
				"went_well": (r.what_went_well or "").strip(),
				"improvements": (r.improvements or "").strip(),
				"comments": (r.additional_comments or "").strip(),
				"visit": r.field_visit,
				"url": f"/app/training-attendee-feedback/{r.name}",
			}
			for r in fb[:500]
		]

	out["summary"] = {
		"sessions": len(sessions),
		"participants": len(out["participants"]),
		"fv_participants": len(out["fv_participants"]),
		"feedback": len(out["feedback"]),
		"present": sum(cint(s["present"]) for s in sessions),
	}
	return out
