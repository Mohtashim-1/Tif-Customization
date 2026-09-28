# Copyright (c) 2026, TIF Customization and contributors
# License: MIT
"""Training overview for the Training Card page, from Upcoming Training."""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import cint, getdate, nowdate


def _check():
	if frappe.session.user == "Guest":
		frappe.throw(_("Please log in."), frappe.PermissionError)
	if not frappe.has_permission("Upcoming Training", "read"):
		frappe.throw(_("You are not permitted to view Upcoming Training."), frappe.PermissionError)


def _title(row):
	if (row.type or "") == "Workshop":
		return (row.workshop_topic or row.program or row.training_type or "Workshop").strip() or "Workshop"
	return (row.training_type or row.program or "Training").strip() or "Training"


def _kind(row):
	return "workshop" if (row.type or "") == "Workshop" else "course"


def _program(row):
	return (row.program or "").strip()


def _audience(row):
	cat = (row.participants_category or "").strip().lower()
	if cat in ("school kids", "students", "student"):
		return "students"
	if cat in ("teachers", "teacher", "trainees", "trainee"):
		return "teachers"
	blob = (row.workshop_for or "").lower()
	if "student" in blob or "kid" in blob:
		return "students"
	if "teacher" in blob:
		return "teachers"
	return "students" if _kind(row) == "workshop" else "teachers"


def _status(row, today):
	raw = (row.schedule_status or "").strip().lower()
	if raw in ("completed", "complete"):
		return "completed"
	if raw in ("in progress", "in_progress", "live"):
		return "in_progress"
	if raw == "upcoming":
		return "upcoming"
	if not row.training_date:
		return "upcoming"
	day = getdate(row.training_date)
	if day < today:
		return "completed"
	if day > today:
		return "upcoming"
	return "in_progress"


def _time_label(value):
	text = str(value or "").strip()
	if not text:
		return ""
	parts = text.split(":")
	try:
		hour = int(parts[0])
		minute = int(parts[1]) if len(parts) > 1 else 0
	except ValueError:
		return text[:5]
	suffix = "AM" if hour < 12 else "PM"
	hour12 = hour % 12 or 12
	return f"{hour12}:{minute:02d} {suffix}"


def _attendance(names):
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
		{"names": names},
		as_dict=True,
	)
	return {row.parent: row for row in rows}


def _as_dict(value):
	if isinstance(value, str):
		value = value.strip()
		if not value:
			return {}
		try:
			value = frappe.parse_json(value)
		except Exception:
			return {}
	return value if isinstance(value, dict) else {}


@frappe.whitelist()
def get_dashboard(from_date=None, to_date=None, program=None, trainer=None, mode=None, status=None, filters=None):
	_check()
	today = getdate(nowdate())
	extra = _as_dict(filters)
	from_date = from_date or extra.get("from_date") or f"{today.year}-01-01"
	to_date = to_date or extra.get("to_date") or f"{today.year}-12-31"
	program = (program or extra.get("program") or "").strip()
	trainer = (trainer or extra.get("trainer") or "").strip()
	mode = (mode or extra.get("mode") or "").strip()
	status = (status or extra.get("status") or "").strip().lower()
	start = getdate(from_date)
	end = getdate(to_date)
	if start > end:
		start, end = end, start
	rows = frappe.get_list(
		"Upcoming Training",
		filters={
			"docstatus": ["<", 2],
			"training_date": ["between", [start, end]],
		},
		fields=[
			"name",
			"type",
			"training_date",
			"training_time",
			"training_end_time",
			"schedule_status",
			"training_type",
			"workshop_topic",
			"mode_of_training",
			"participants_category",
			"school_name",
			"tag_school",
			"trainer_name",
			"program",
			"workshop_for",
			"attendance_count",
		],
		order_by="training_date asc, training_time asc",
		limit_page_length=5000,
	)
	marks = _attendance([row.name for row in rows])
	options = {"programs": set(), "trainers": set(), "modes": set()}
	for row in rows:
		if _program(row):
			options["programs"].add(_program(row))
		if (row.trainer_name or "").strip():
			options["trainers"].add(row.trainer_name.strip())
		if (row.mode_of_training or "").strip():
			options["modes"].add(row.mode_of_training.strip())

	groups = {}
	months = {}

	for row in rows:
		row_program = _program(row)
		row_trainer = (row.trainer_name or "").strip()
		row_mode = (row.mode_of_training or "").strip()
		row_status = _status(row, today)
		if program == "__none__":
			if row_program:
				continue
		elif program and row_program != program:
			continue
		if trainer and row_trainer != trainer:
			continue
		if mode and row_mode != mode:
			continue
		if status and row_status != status:
			continue
		title = _title(row)
		kind = _kind(row)
		program = _program(row) if kind == "course" else ""
		key = f"{kind}:{(program or '—').lower()}:{title.lower()}" if kind == "course" else f"workshop:{title.lower()}"
		group = groups.setdefault(
			key,
			{"id": key, "title": title, "kind": kind, "program": program, "sessions": []},
		)
		status = row_status
		stats = marks.get(row.name)
		present = cint(stats.present) if stats else cint(row.attendance_count)
		total = cint(stats.total) if stats else 0
		if total and present > total:
			present = total
		score = round(100.0 * present / total) if total else None
		audience = _audience(row)
		session = {
			"name": row.name,
			"date": str(getdate(row.training_date)) if row.training_date else "",
			"time": _time_label(row.training_time),
			"trainer": (row.trainer_name or "").strip(),
			"mode": (row.mode_of_training or "").strip(),
			"school": (row.school_name or row.tag_school or "").strip(),
			"status": status,
			"present": present,
			"total": total,
			"score": score,
			"audience": audience,
			"teachers": present if audience == "teachers" else 0,
			"students": present if audience == "students" else 0,
		}
		group["sessions"].append(session)
		if row.training_date and status != "upcoming":
			month = str(getdate(row.training_date))[:7]
			bucket = months.setdefault(month, {"course": 0, "workshop": 0})
			bucket[kind] += 1

	trainings = []
	for group in groups.values():
		sessions = group["sessions"]
		conducted = [s for s in sessions if s["status"] != "upcoming"]
		scored = [s["score"] for s in conducted if s["score"] is not None]
		trainings.append(
			{
				"id": group["id"],
				"title": group["title"],
				"kind": group["kind"],
				"program": group.get("program") or "",
				"conducted": len(conducted),
				"upcoming": sum(1 for s in sessions if s["status"] == "upcoming"),
				"teachers": sum(s["teachers"] for s in conducted),
				"students": sum(s["students"] for s in conducted),
				"score": round(sum(scored) / len(scored)) if scored else None,
				"sessions": list(reversed(sessions)),
			}
		)
	trainings.sort(key=lambda item: (-item["conducted"], item["title"].lower()))

	month_keys = sorted(months)
	return {
		"year": start.year,
		"from_date": str(start),
		"to_date": str(end),
		"options": {
			"programs": sorted(options["programs"], key=str.lower),
			"trainers": sorted(options["trainers"], key=str.lower),
			"modes": sorted(options["modes"], key=str.lower),
		},
		"months": [
			{"key": key, "course": months[key]["course"], "workshop": months[key]["workshop"]}
			for key in month_keys
		],
		"trainings": trainings,
	}
