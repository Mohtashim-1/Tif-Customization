# Copyright (c) 2026, TIF Customization and contributors
# License: MIT
"""API for Training Schedule Vue portal — backed by Upcoming Training."""

from __future__ import annotations

from datetime import time, timedelta

import frappe
from frappe import _
from frappe.utils import add_days, getdate, nowdate

DOCTYPE = "Upcoming Training"

FIELDS = (
	"name",
	"type",
	"training_date",
	"training_time",
	"training_type",
	"workshop_topic",
	"mode_of_training",
	"participants_category",
	"school_name",
	"school_type",
	"department_training",
	"city",
	"area",
	"trainer_name",
	"program",
	"workshop_for",
	"tag_school",
	"modified",
)

SLOT_DEFS = (
	{"id": "s1", "label": "08:00 – 10:00", "start_hour": 8},
	{"id": "s2", "label": "10:15 – 12:15", "start_hour": 10},
	{"id": "s3", "label": "12:30 – 02:30", "start_hour": 12},
	{"id": "s4", "label": "02:45 – 04:45", "start_hour": 14},
	{"id": "s5", "label": "05:00 – 07:00", "start_hour": 17},
)

DEPT_CATEGORY = {
	"tps": "technical",
	"cee": "leadership",
	"qps": "communication",
	"tif": "management",
	"t. training": "other",
}


def _require_login():
	if frappe.session.user == "Guest":
		frappe.throw(_("Please log in to open Training Schedule."), frappe.PermissionError)


def _available_fields():
	meta = frappe.get_meta(DOCTYPE)
	return [f for f in FIELDS if f == "name" or meta.get_field(f)]


def _time_to_seconds(value) -> int | None:
	if value is None or value == "":
		return None
	if isinstance(value, timedelta):
		return int(value.total_seconds())
	if isinstance(value, time):
		return value.hour * 3600 + value.minute * 60 + value.second
	text = str(value).split(".")[0]
	parts = text.split(":")
	try:
		h = int(parts[0])
		m = int(parts[1]) if len(parts) > 1 else 0
		s = int(parts[2]) if len(parts) > 2 else 0
		return h * 3600 + m * 60 + s
	except Exception:
		return None


def _format_time(value) -> str:
	secs = _time_to_seconds(value)
	if secs is None:
		return ""
	h = secs // 3600
	m = (secs % 3600) // 60
	return f"{h:02d}:{m:02d}"


def _slot_for_time(value) -> str:
	secs = _time_to_seconds(value)
	if secs is None:
		return "s3"
	hour = secs // 3600
	best = SLOT_DEFS[0]["id"]
	best_diff = 99
	for slot in SLOT_DEFS:
		diff = abs(hour - slot["start_hour"])
		if diff < best_diff:
			best_diff = diff
			best = slot["id"]
	return best


def _status_for_date(training_date, today):
	d = getdate(training_date)
	if d < today:
		return "completed"
	if d == today:
		return "in_progress"
	return "upcoming"


def _title_for_row(row) -> str:
	return (
		(row.get("training_type") or "").strip()
		or (row.get("workshop_topic") or "").strip()
		or (row.get("program") or "").strip()
		or (row.get("type") or "Training")
	)


def _category_for_row(row) -> str:
	dept = (row.get("department_training") or "").strip().lower()
	if dept in DEPT_CATEGORY:
		return DEPT_CATEGORY[dept]
	typ = (row.get("type") or "").strip().lower()
	if typ == "workshop":
		return "marketing"
	return "other"


def _venue_for_row(row) -> str:
	mode = (row.get("mode_of_training") or "").strip()
	school = (row.get("school_name") or row.get("tag_school") or "").strip()
	city = (row.get("city") or "").strip()
	area = (row.get("area") or "").strip()
	place = school or city or ""
	if not place and area and area.lower() != mode.lower():
		place = area
	parts = [p for p in (mode, place) if p]
	return " · ".join(parts) if parts else "—"


def _initials(name: str) -> str:
	parts = [p for p in (name or "").split() if p]
	if not parts:
		return "?"
	if len(parts) == 1:
		return parts[0][:2].upper()
	return (parts[0][0] + parts[-1][0]).upper()


def _color_for_name(name: str) -> str:
	palette = ("#6366f1", "#10b981", "#f59e0b", "#ec4899", "#0ea5e9", "#8b5cf6", "#ef4444", "#14b8a6")
	if not name:
		return palette[0]
	return palette[sum(ord(c) for c in name) % len(palette)]


def _row_to_session(row, today):
	row = frappe._dict(row)
	trainer = (row.trainer_name or "").strip() or _("Unassigned")
	return {
		"id": row.name,
		"name": row.name,
		"date": str(getdate(row.training_date)) if row.training_date else None,
		"time": _format_time(row.training_time),
		"slot": _slot_for_time(row.training_time),
		"title": _title_for_row(row),
		"trainerId": trainer,
		"trainerName": trainer,
		"trainerInitials": _initials(trainer),
		"trainerColor": _color_for_name(trainer),
		"room": _venue_for_row(row),
		"category": _category_for_row(row),
		"status": _status_for_date(row.training_date, today) if row.training_date else "upcoming",
		"type": row.type or "Training",
		"program": row.program or "",
		"mode": row.mode_of_training or "",
		"city": row.city or "",
		"area": row.area or "",
		"school": row.school_name or row.tag_school or "",
		"department": row.department_training or "",
		"participants_category": row.participants_category or "",
		"url": f"/app/upcoming-training/{row.name}",
	}


def _fetch_rows(from_date, to_date):
	fields = _available_fields()
	return frappe.get_list(
		DOCTYPE,
		filters={
			"docstatus": ["<", 2],
			"training_date": ["between", [from_date, to_date]],
		},
		fields=fields,
		order_by="training_date asc, training_time asc",
		limit_page_length=2000,
	)


def _build_summary(sessions, today):
	rooms = {(s.get("room") or "").strip() for s in sessions if (s.get("room") or "").strip()}
	trainers = {(s.get("trainerName") or "").strip() for s in sessions if (s.get("trainerName") or "").strip()}
	return {
		"total_sessions": len(sessions),
		"completed": sum(1 for s in sessions if s.get("status") == "completed"),
		"in_progress": sum(1 for s in sessions if s.get("status") == "in_progress"),
		"upcoming": sum(1 for s in sessions if s.get("status") == "upcoming"),
		"rooms_used": len(rooms),
		"rooms_total": max(len(rooms), 8),
		"total_trainers": len(trainers),
		"today": str(today),
	}


def _monday_of(d):
	d = getdate(d)
	return add_days(d, -((d.weekday()) % 7))


@frappe.whitelist()
def get_schedule_data(week_start=None):
	"""Week schedule + filters from Upcoming Training."""
	_require_login()
	if not frappe.has_permission(DOCTYPE, "read"):
		frappe.throw(_("You are not permitted to view Upcoming Training."), frappe.PermissionError)

	today = getdate(nowdate())
	if week_start:
		start = _monday_of(week_start)
	else:
		start = _monday_of(today)
		has = frappe.db.exists(DOCTYPE, {"training_date": ["between", [start, add_days(start, 6)]]})
		if not has:
			latest = frappe.db.get_value(DOCTYPE, {}, "training_date", order_by="training_date desc")
			if latest:
				start = _monday_of(latest)

	end = add_days(start, 6)
	rows = _fetch_rows(start, end)
	sessions = [_row_to_session(r, today) for r in rows]

	trainers_map = {}
	programs = set()
	for s in sessions:
		tid = s["trainerId"]
		if tid not in trainers_map:
			trainers_map[tid] = {
				"id": tid,
				"name": s["trainerName"],
				"initials": s["trainerInitials"],
				"color": s["trainerColor"],
			}
		if s.get("program"):
			programs.add(s["program"])
		elif s.get("title"):
			programs.add(s["title"])

	return {
		"user": _current_user_payload(sessions),
		"week_start": str(start),
		"week_end": str(end),
		"today": str(today),
		"slots": list(SLOT_DEFS),
		"sessions": sessions,
		"trainers": sorted(trainers_map.values(), key=lambda t: t["name"].lower()),
		"programs": sorted(programs),
		"summary": _build_summary(sessions, today),
		"links": {
			"new": "/app/upcoming-training/new",
			"list": "/app/upcoming-training",
			"report": "/app/upcoming-training-report",
		},
	}


def _current_user_payload(sessions=None):
	user = frappe.session.user
	full_name = frappe.db.get_value("User", user, "full_name") or user
	initials = "".join([p[0] for p in full_name.split()[:2] if p]).upper() or "U"
	sessions = sessions or []
	return {
		"id": user,
		"name": full_name,
		"email": frappe.db.get_value("User", user, "email") or user,
		"role": "Admin" if "System Manager" in frappe.get_roles() else "User",
		"initials": initials,
		"notifications": sum(1 for s in sessions if s.get("status") in ("upcoming", "in_progress")),
	}


@frappe.whitelist()
def get_dashboard():
	"""Operations overview — distinct from the weekly calendar grid."""
	_require_login()
	if not frappe.has_permission(DOCTYPE, "read"):
		frappe.throw(_("You are not permitted to view Upcoming Training."), frappe.PermissionError)

	today = getdate(nowdate())
	rows = _fetch_rows(add_days(today, -90), add_days(today, 60))
	sessions = [_row_to_session(r, today) for r in rows]
	week_start = _monday_of(today)
	week_days = []
	for i in range(7):
		d = add_days(week_start, i)
		iso = str(d)
		day_sessions = [s for s in sessions if s.get("date") == iso]
		week_days.append(
			{
				"date": iso,
				"label": d.strftime("%a"),
				"sessions": day_sessions[:6],
			}
		)

	today_iso = str(today)
	week_sessions = [
		s for s in sessions if s.get("date") and week_start <= getdate(s["date"]) <= add_days(week_start, 6)
	]
	if not week_sessions:
		latest = None
		for s in sessions:
			if s.get("date") and (latest is None or s["date"] > latest):
				latest = s["date"]
		if latest:
			week_start = _monday_of(latest)
			week_days = []
			for i in range(7):
				d = add_days(week_start, i)
				iso = str(d)
				day_sessions = [s for s in sessions if s.get("date") == iso]
				week_days.append(
					{
						"date": iso,
						"label": d.strftime("%a"),
						"sessions": day_sessions[:6],
					}
				)
			week_sessions = [
				s for s in sessions if s.get("date") and week_start <= getdate(s["date"]) <= add_days(week_start, 6)
			]

	upcoming = [
		s
		for s in sessions
		if s.get("status") in ("upcoming", "in_progress") and (s.get("date") or "") >= today_iso
	]
	upcoming.sort(key=lambda s: (s.get("date") or "", s.get("time") or ""))
	recent = sorted(sessions, key=lambda s: (s.get("date") or "", s.get("time") or ""), reverse=True)[:12]

	trainers = {}
	for s in sessions:
		key = s["trainerName"]
		b = trainers.setdefault(
			key,
			{
				"name": key,
				"initials": s["trainerInitials"],
				"color": s["trainerColor"],
				"sessions": 0,
				"upcoming": 0,
			},
		)
		b["sessions"] += 1
		if s.get("status") == "upcoming":
			b["upcoming"] += 1

	first = (frappe.db.get_value("User", frappe.session.user, "first_name") or "").strip()
	greeting = f"Good day{', ' + first if first else ''}"

	return {
		"user": _current_user_payload(sessions),
		"today": today_iso,
		"greeting": f"{greeting} · {today.strftime('%d %b %Y')}",
		"summary": _build_summary(sessions, today),
		"today_sessions": [s for s in sessions if s.get("date") == today_iso],
		"week_sessions": week_sessions,
		"week_days": week_days,
		"week_start": str(week_start),
		"upcoming": upcoming[:12],
		"recent": recent,
		"trainers": sorted(trainers.values(), key=lambda t: (-t["sessions"], t["name"].lower()))[:8],
		"links": {
			"list": "/app/upcoming-training",
			"report": "/app/upcoming-training-report",
		},
	}


@frappe.whitelist()
def get_directory(view="trainers", from_date=None, to_date=None):
	"""Sidebar menus: trainers / programs / sessions / rooms / reports data."""
	_require_login()
	if not frappe.has_permission(DOCTYPE, "read"):
		frappe.throw(_("You are not permitted to view Upcoming Training."), frappe.PermissionError)

	today = getdate(nowdate())
	if not from_date or not to_date:
		# last 90 days + next 60
		from_date = add_days(today, -90)
		to_date = add_days(today, 60)
	else:
		from_date = getdate(from_date)
		to_date = getdate(to_date)

	rows = _fetch_rows(from_date, to_date)
	sessions = [_row_to_session(r, today) for r in rows]
	view = (view or "trainers").strip().lower()

	if view == "trainers":
		bucket = {}
		for s in sessions:
			key = s["trainerName"]
			b = bucket.setdefault(
				key,
				{
					"name": key,
					"initials": s["trainerInitials"],
					"color": s["trainerColor"],
					"sessions": 0,
					"upcoming": 0,
					"completed": 0,
				},
			)
			b["sessions"] += 1
			b[s["status"]] = b.get(s["status"], 0) + 1
		return {
			"view": view,
			"rows": sorted(bucket.values(), key=lambda r: (-r["sessions"], r["name"].lower())),
		}

	if view == "programs":
		bucket = {}
		for s in sessions:
			key = s.get("program") or s.get("title") or s.get("type") or "Other"
			b = bucket.setdefault(key, {"name": key, "sessions": 0, "trainers": set(), "types": set()})
			b["sessions"] += 1
			b["trainers"].add(s["trainerName"])
			b["types"].add(s.get("type") or "")
		out = []
		for b in bucket.values():
			out.append(
				{
					"name": b["name"],
					"sessions": b["sessions"],
					"trainers": len(b["trainers"]),
					"types": ", ".join(sorted(t for t in b["types"] if t)),
				}
			)
		return {"view": view, "rows": sorted(out, key=lambda r: (-r["sessions"], r["name"].lower()))}

	if view == "rooms":
		bucket = {}
		for s in sessions:
			key = s.get("room") or "—"
			b = bucket.setdefault(key, {"name": key, "sessions": 0, "modes": set(), "cities": set()})
			b["sessions"] += 1
			if s.get("mode"):
				b["modes"].add(s["mode"])
			if s.get("city"):
				b["cities"].add(s["city"])
		out = []
		for b in bucket.values():
			out.append(
				{
					"name": b["name"],
					"sessions": b["sessions"],
					"modes": ", ".join(sorted(b["modes"])),
					"cities": ", ".join(sorted(b["cities"])),
				}
			)
		return {"view": view, "rows": sorted(out, key=lambda r: (-r["sessions"], r["name"].lower()))}

	if view == "reports":
		summary = _build_summary(sessions, today)
		by_type = {}
		by_mode = {}
		for s in sessions:
			by_type[s.get("type") or "Other"] = by_type.get(s.get("type") or "Other", 0) + 1
			by_mode[s.get("mode") or "—"] = by_mode.get(s.get("mode") or "—", 0) + 1
		return {
			"view": view,
			"summary": summary,
			"by_type": [{"name": k, "count": v} for k, v in sorted(by_type.items())],
			"by_mode": [{"name": k, "count": v} for k, v in sorted(by_mode.items())],
			"links": {
				"report": "/app/upcoming-training-report",
				"list": "/app/upcoming-training",
			},
		}

	if view == "notifications":
		upcoming = [s for s in sessions if s.get("status") in ("upcoming", "in_progress")]
		upcoming.sort(key=lambda s: (s.get("date") or "", s.get("time") or ""))
		return {"view": view, "rows": upcoming[:40]}

	# sessions (default list)
	return {"view": "sessions", "rows": sessions}


@frappe.whitelist()
def get_form_options():
	"""Lookups for the in-portal Upcoming Training form."""
	_require_login()
	today = getdate(nowdate())
	rows = _fetch_rows(add_days(today, -365), add_days(today, 180))
	trainers = sorted(
		{(r.get("trainer_name") or "").strip() for r in rows if (r.get("trainer_name") or "").strip()}
	)
	programs = sorted({(r.get("program") or "").strip() for r in rows if (r.get("program") or "").strip()})
	training_types = []
	if frappe.db.exists("DocType", "Training Type"):
		training_types = frappe.get_all(
			"Training Type",
			fields=["name"],
			order_by="name asc",
			limit_page_length=200,
		)
	cities = []
	if frappe.db.exists("DocType", "City"):
		cities = frappe.get_all("City", fields=["name"], order_by="name asc", limit_page_length=300)
	return {
		"trainers": trainers,
		"programs": programs,
		"training_types": [t.name for t in training_types],
		"cities": [c.name for c in cities],
		"types": ["Training", "Workshop"],
		"modes": ["In-person", "Online", "Onsite"],
		"departments": ["TPS", "CEE", "QPS", "TIF", "T. Training"],
		"participant_categories": ["School Kids", "Trainees", "Teachers"],
		"school_types": ["Private", "Government"],
	}


@frappe.whitelist()
def get_session(name):
	_require_login()
	if not name:
		frappe.throw(_("Session name is required."))
	if not frappe.has_permission(DOCTYPE, "read"):
		frappe.throw(_("You are not permitted to view Upcoming Training."), frappe.PermissionError)
	doc = frappe.get_doc(DOCTYPE, name)
	return {
		"name": doc.name,
		"type": doc.type,
		"training_date": str(doc.training_date) if doc.training_date else "",
		"training_time": _format_time(doc.training_time),
		"training_type": doc.training_type or "",
		"workshop_topic": doc.workshop_topic or "",
		"mode_of_training": doc.mode_of_training or "",
		"participants_category": doc.participants_category or "",
		"school_name": doc.school_name or "",
		"school_type": doc.school_type or "",
		"department_training": doc.department_training or "",
		"city": doc.city or "",
		"area": doc.area or "",
		"trainer_name": doc.trainer_name or "",
		"program": doc.program or "",
		"workshop_for": doc.workshop_for or "",
		"tag_school": doc.tag_school or "",
	}


@frappe.whitelist()
def save_session(values=None):
	"""Create or update Upcoming Training from the portal."""
	_require_login()
	if isinstance(values, str):
		import json

		values = json.loads(values)
	values = frappe._dict(values or {})
	if not values.get("training_date"):
		frappe.throw(_("Training date is required."))
	if not values.get("type"):
		values.type = "Training"

	can_create = frappe.has_permission(DOCTYPE, "create")
	can_write = frappe.has_permission(DOCTYPE, "write")
	name = (values.get("name") or "").strip()
	if name:
		if not can_write:
			frappe.throw(_("You are not permitted to update Upcoming Training."), frappe.PermissionError)
		doc = frappe.get_doc(DOCTYPE, name)
	else:
		if not can_create:
			frappe.throw(_("You are not permitted to create Upcoming Training."), frappe.PermissionError)
		doc = frappe.new_doc(DOCTYPE)

	for field in (
		"type",
		"training_date",
		"training_time",
		"training_type",
		"workshop_topic",
		"mode_of_training",
		"participants_category",
		"school_name",
		"school_type",
		"department_training",
		"city",
		"area",
		"trainer_name",
		"program",
		"workshop_for",
		"tag_school",
	):
		if field in values:
			doc.set(field, values.get(field) or None)

	doc.save(ignore_permissions=False)
	frappe.db.commit()
	today = getdate(nowdate())
	return {
		"ok": 1,
		"name": doc.name,
		"session": _row_to_session(doc.as_dict(), today),
		"message": _("Upcoming Training {0} saved.").format(doc.name),
	}


@frappe.whitelist()
def delete_session(name):
	_require_login()
	if not name:
		frappe.throw(_("Session name is required."))
	if not frappe.has_permission(DOCTYPE, "delete"):
		frappe.throw(_("You are not permitted to delete Upcoming Training."), frappe.PermissionError)
	frappe.delete_doc(DOCTYPE, name, ignore_permissions=False)
	frappe.db.commit()
	return {"ok": 1, "message": _("Upcoming Training {0} deleted.").format(name)}


@frappe.whitelist()
def export_sessions_csv(from_date=None, to_date=None):
	"""CSV of Upcoming Training rows for the current portal range."""
	_require_login()
	if not frappe.has_permission(DOCTYPE, "read"):
		frappe.throw(_("You are not permitted to view Upcoming Training."), frappe.PermissionError)
	today = getdate(nowdate())
	from_date = getdate(from_date or add_days(today, -90))
	to_date = getdate(to_date or add_days(today, 60))
	rows = _fetch_rows(from_date, to_date)
	frappe.response["result"] = rows
	frappe.response["type"] = "csv"
	frappe.response["doctype"] = DOCTYPE
	return rows
