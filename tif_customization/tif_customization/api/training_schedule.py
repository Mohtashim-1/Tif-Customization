# Copyright (c) 2026, TIF Customization and contributors
# License: MIT
"""API for Training Schedule Vue portal — backed by Upcoming Training."""

from __future__ import annotations

from datetime import time, timedelta

import frappe
from frappe import _
from frappe.utils import add_days, cint, get_first_day, get_last_day, get_quarter_ending, get_quarter_start, getdate, nowdate

DOCTYPE = "Upcoming Training"

FIELDS = (
	"name",
	"type",
	"training_date",
	"training_time",
	"training_end_time",
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
	"zoom_id",
	"zoom_link",
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


DEFAULT_DEPARTMENTS = ("TPS", "CEE", "QPS", "TIF", "T. Training")

LINK_SPECS = {
	"training_type": {"doctype": "Training Type", "title_field": "type", "allow_create": True},
	"trainer": {"doctype": "Trainer", "title_field": "trainer_name", "allow_create": True},
	"program": {"doctype": "Program", "title_field": "program_name", "allow_create": True},
	"city": {"doctype": "City", "title_field": "city", "allow_create": True},
	"school": {"doctype": "Customer", "title_field": "customer_name", "allow_create": False},
	"department": {"doctype": None, "allow_create": False, "fixed": DEFAULT_DEPARTMENTS},
}


def _can_create_link(key=None):
	spec = LINK_SPECS.get(key or "") or {}
	if spec.get("allow_create") is False:
		return False
	doctype = spec.get("doctype") or "Training Type"
	return bool(
		(doctype and frappe.db.exists("DocType", doctype) and frappe.has_permission(doctype, "create"))
		or frappe.has_permission(DOCTYPE, "create")
		or frappe.has_permission(DOCTYPE, "write")
	)


def _can_create_training_type():
	return _can_create_link("training_type")


def _list_doctype_names(doctype, title_field="name"):
	if not doctype or not frappe.db.exists("DocType", doctype):
		return []
	meta = frappe.get_meta(doctype)
	fields = ["name"]
	if title_field and title_field != "name" and meta.has_field(title_field):
		fields.append(title_field)
	rows = frappe.get_all(
		doctype,
		fields=fields,
		order_by="name asc",
		limit_page_length=5000,
		ignore_permissions=True,
	)
	out = []
	seen = set()
	for row in rows:
		label = (row.get(title_field) or row.get("name") or "").strip()
		if not label or label in seen:
			continue
		seen.add(label)
		out.append(label)
	return out


def _list_training_types():
	return _list_doctype_names("Training Type", "type")


def _map_school_type(raw):
	val = (raw or "").strip()
	low = val.lower()
	if low in ("govt", "government", "gov"):
		return "Government"
	if low in ("pvt", "private"):
		return "Private"
	return val


def _list_school_options(txt="", limit=30):
	"""School field lists Customer records (schools are customers in this ERP)."""
	if not frappe.db.exists("DocType", "Customer"):
		return []
	txt = (txt or "").strip()
	limit = max(1, min(cint(limit) or 30, 50))
	meta = frappe.get_meta("Customer")
	has_city = meta.has_field("custom_city")
	has_territory = meta.has_field("territory")
	has_disabled = meta.has_field("disabled")
	city_sql = "IFNULL(custom_city, '')" if has_city else "''"
	territory_sql = "IFNULL(territory, '')" if has_territory else "''"
	where = ["1=1"]
	params = {}
	if has_disabled:
		where.append("IFNULL(disabled, 0) = 0")
	if txt:
		where.append("(name LIKE %(txt)s OR customer_name LIKE %(txt)s)")
		params["txt"] = f"%{txt}%"
	try:
		rows = frappe.db.sql(
			f"""
			SELECT name,
				TRIM(IFNULL(customer_name, name)) AS customer_name,
				{city_sql} AS custom_city,
				{territory_sql} AS territory
			FROM `tabCustomer`
			WHERE {" AND ".join(where)}
			ORDER BY customer_name ASC
			LIMIT {limit}
			""",
			params,
			as_dict=True,
		)
	except Exception:
		frappe.log_error(title="Training Schedule customer search")
		return []
	out = []
	seen = set()
	for row in rows:
		name = (row.get("name") or "").strip()
		label = (row.get("customer_name") or name).strip()
		if not name or name in seen:
			continue
		seen.add(name)
		out.append(
			{
				"value": name,
				"label": label,
				"city": (row.get("custom_city") or row.get("territory") or "").strip(),
			}
		)
	return out


def _resolve_school_link(tag_school=None, school_name=None):
	"""Return (Customer.name, customer_name) for the School field."""
	tag = (tag_school or "").strip()
	title = (school_name or "").strip()
	if tag and frappe.db.exists("Customer", tag):
		return tag, frappe.db.get_value("Customer", tag, "customer_name") or title or tag
	if title:
		found = frappe.db.get_value("Customer", {"customer_name": title}, "name")
		if found:
			return found, frappe.db.get_value("Customer", found, "customer_name") or title
		if frappe.db.exists("Customer", title):
			return title, frappe.db.get_value("Customer", title, "customer_name") or title
	return "", title


def _list_link_options(key, extra=None):
	spec = LINK_SPECS.get(key) or {}
	names = list(spec.get("fixed") or [])
	if spec.get("doctype"):
		names.extend(_list_doctype_names(spec["doctype"], spec.get("title_field") or "name"))
	for value in extra or []:
		if value:
			names.append(value)
	seen = set()
	out = []
	for name in names:
		text = (name or "").strip()
		if not text or text in seen:
			continue
		seen.add(text)
		out.append(text)
	out.sort(key=lambda v: v.casefold())
	return out


def _find_link_record(key, name):
	spec = LINK_SPECS.get(key) or {}
	name = (name or "").strip()
	doctype = spec.get("doctype")
	if not name or not doctype or not frappe.db.exists("DocType", doctype):
		return ""
	if frappe.db.exists(doctype, name):
		return name
	title_field = spec.get("title_field")
	if title_field:
		return frappe.db.get_value(doctype, {title_field: name}, "name") or ""
	return ""


def _find_training_type(name):
	return _find_link_record("training_type", name)


def _ensure_link_record(key, name):
	spec = LINK_SPECS.get(key) or {}
	name = (name or "").strip()
	if not name:
		return ""
	existing = _find_link_record(key, name)
	if existing:
		return existing
	if not spec.get("allow_create"):
		return name
	if not _can_create_link(key):
		frappe.throw(_("You are not permitted to create {0} {1}.").format(spec.get("doctype") or key, name), frappe.PermissionError)
	doctype = spec.get("doctype")
	if not doctype or not frappe.db.exists("DocType", doctype):
		return name
	title_field = spec.get("title_field") or "name"
	payload = {"doctype": doctype}
	if title_field != "name":
		payload[title_field] = name
	doc = frappe.get_doc(payload)
	doc.insert(ignore_permissions=True)
	return doc.name


def _ensure_training_type(name):
	return _ensure_link_record("training_type", name)


def _truthy_flag(value) -> int:
	text = str(value or "").strip().lower()
	return 1 if text in ("1", "yes", "y", "true", "t") else 0


def _attendance_row_dict(row) -> dict:
	row = frappe._dict(row)
	return {
		"name": row.name or "",
		"participant_name": row.participant_name or "",
		"email": row.email or "",
		"join_time": row.join_time or "",
		"leave_time": row.leave_time or "",
		"duration_minutes": cint(row.duration_minutes),
		"is_guest": cint(row.is_guest),
		"recording_disclaimer_response": row.recording_disclaimer_response or "",
		"in_waiting_room": cint(row.in_waiting_room),
		"attendance_status": row.attendance_status or "Present",
		"phone": row.phone or "",
		"zoom_participant_id": row.zoom_participant_id or "",
		"check_in_time": _format_time(row.check_in_time) if row.get("check_in_time") else "",
		"remarks": row.remarks or "",
	}


def _attendance_append_values(row) -> dict | None:
	row = frappe._dict(row)
	name = (row.get("participant_name") or "").strip()
	if not name:
		return None
	return {
		"participant_name": name,
		"email": (row.email or "").strip() or None,
		"join_time": (row.join_time or "").strip() or None,
		"leave_time": (row.leave_time or "").strip() or None,
		"duration_minutes": cint(row.duration_minutes) or None,
		"is_guest": _truthy_flag(row.is_guest),
		"recording_disclaimer_response": (row.recording_disclaimer_response or "").strip() or None,
		"in_waiting_room": _truthy_flag(row.in_waiting_room),
		"attendance_status": row.attendance_status or "Present",
		"phone": (row.phone or "").strip() or None,
		"zoom_participant_id": (row.zoom_participant_id or "").strip() or None,
		"check_in_time": row.check_in_time or None,
		"remarks": (row.remarks or "").strip() or None,
	}


def _normalize_header(value: str) -> str:
	return " ".join((value or "").strip().lower().replace("_", " ").split())


ZOOM_HEADER_MAP = {
	"name (original name)": "participant_name",
	"name(original name)": "participant_name",
	"original name": "participant_name",
	"name": "participant_name",
	"participant name": "participant_name",
	"email": "email",
	"user email": "email",
	"join time": "join_time",
	"leave time": "leave_time",
	"duration (minutes)": "duration_minutes",
	"duration minutes": "duration_minutes",
	"duration": "duration_minutes",
	"guest": "is_guest",
	"recording disclaimer response": "recording_disclaimer_response",
	"in waiting room": "in_waiting_room",
	"phone": "phone",
	"zoom participant id": "zoom_participant_id",
	"attendance": "attendance_status",
	"attendance status": "attendance_status",
	"status": "attendance_status",
	"remarks": "remarks",
}


def _parse_zoom_attendance_csv(content: str) -> list[dict]:
	"""Parse Zoom participants report CSV into attendance row dicts."""
	import csv
	import io

	if not content or not str(content).strip():
		return []

	text = str(content)
	if text.startswith("\ufeff"):
		text = text[1:]

	# Zoom exports sometimes include meeting summary lines before the header row.
	lines = text.splitlines()
	header_idx = 0
	for i, line in enumerate(lines[:40]):
		norm = _normalize_header(line.split(",")[0] if line else "")
		if "name" in norm and ("original" in norm or norm == "name"):
			header_idx = i
			break
		joined = _normalize_header(line)
		if "name (original name)" in joined or joined.startswith("name,email"):
			header_idx = i
			break

	sample = "\n".join(lines[header_idx:])
	reader = csv.DictReader(io.StringIO(sample))
	if not reader.fieldnames:
		frappe.throw(_("Could not read attendance CSV headers."))

	field_map = {}
	for raw in reader.fieldnames:
		key = ZOOM_HEADER_MAP.get(_normalize_header(raw))
		if key:
			field_map[raw] = key

	if "participant_name" not in field_map.values():
		frappe.throw(
			_("CSV must include a Name column (Zoom: Name (original name)). Found: {0}").format(
				", ".join(reader.fieldnames)
			)
		)

	rows = []
	for raw_row in reader:
		mapped = {}
		for raw_key, field in field_map.items():
			mapped[field] = (raw_row.get(raw_key) or "").strip()
		payload = _attendance_append_values(
			{
				**mapped,
				"attendance_status": mapped.get("attendance_status") or "Present",
			}
		)
		if payload:
			rows.append(_attendance_row_dict(payload))
	return rows


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


def _default_end_time(start) -> str:
	secs = _time_to_seconds(start)
	if secs is None:
		return "12:00"
	return _format_time(secs + 2 * 3600)


def _format_time_range(start, end=None) -> str:
	a = _format_time(start)
	b = _format_time(end) if end not in (None, "") else ""
	if a and b:
		return f"{a} – {b}"
	return a or b or ""


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
	present = cint(row.get("attendance_present") or 0)
	total = cint(row.get("attendance_total") or 0)
	return {
		"id": row.name,
		"name": row.name,
		"date": str(getdate(row.training_date)) if row.training_date else None,
		"time": _format_time_range(row.training_time, row.get("training_end_time")),
		"start_time": _format_time(row.training_time),
		"end_time": _format_time(row.get("training_end_time")),
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
		"zoom_id": row.get("zoom_id") or "",
		"zoom_link": row.get("zoom_link") or "",
		"attendance_present": present,
		"attendance_total": total,
		"url": f"/app/upcoming-training/{row.name}",
	}


def _attach_attendance_counts(sessions):
	names = [s.get("name") for s in sessions if s.get("name")]
	if not names:
		return sessions
	if not frappe.db.exists("DocType", "Upcoming Training Attendance"):
		return sessions
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
	by_parent = {r.parent: r for r in rows}
	for s in sessions:
		stats = by_parent.get(s["name"])
		if stats:
			s["attendance_total"] = cint(stats.total)
			s["attendance_present"] = cint(stats.present)
	return sessions


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


def _period_for(view, pivot):
	pivot = getdate(pivot)
	if view == "day":
		return pivot, pivot
	if view == "month":
		return get_first_day(pivot), get_last_day(pivot)
	if view == "quarter":
		return get_quarter_start(pivot), get_quarter_ending(pivot)
	start = _monday_of(pivot)
	return start, add_days(start, 6)


@frappe.whitelist()
def get_schedule_data(week_start=None, view="week", anchor=None):
	"""Schedule for day / week / month / quarter from Upcoming Training."""
	_require_login()
	if not frappe.has_permission(DOCTYPE, "read"):
		frappe.throw(_("You are not permitted to view Upcoming Training."), frappe.PermissionError)

	today = getdate(nowdate())
	view = (view or "week").strip().lower()
	if view not in ("day", "week", "month", "quarter"):
		view = "week"

	pivot = getdate(anchor or week_start or today)
	if not anchor and not week_start:
		start_guess, end_guess = _period_for(view, pivot)
		has = frappe.db.exists(DOCTYPE, {"training_date": ["between", [start_guess, end_guess]]})
		if not has:
			latest = frappe.db.get_value(DOCTYPE, {}, "training_date", order_by="training_date desc")
			if latest:
				pivot = getdate(latest)

	start, end = _period_for(view, pivot)
	rows = _fetch_rows(start, end)
	sessions = _attach_attendance_counts([_row_to_session(r, today) for r in rows])

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
		"view": view,
		"anchor": str(pivot),
		"period_start": str(start),
		"period_end": str(end),
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
	designation = ""
	if frappe.db.exists("DocType", "Employee"):
		emp = frappe.db.get_value(
			"Employee",
			{"user_id": user, "status": "Active"},
			["name", "designation", "employee_name"],
			as_dict=True,
		)
		if not emp:
			emp = frappe.db.get_value(
				"Employee",
				{"user_id": user},
				["name", "designation", "employee_name"],
				as_dict=True,
			)
		if emp:
			designation = (emp.designation or "").strip()
			if designation and frappe.db.exists("DocType", "Designation"):
				title = frappe.db.get_value("Designation", designation, "designation_name")
				if title:
					designation = title
	return {
		"id": user,
		"name": full_name,
		"email": frappe.db.get_value("User", user, "email") or user,
		"role": designation or _("No designation"),
		"designation": designation,
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
	view = (view or "trainers").strip().lower()
	sessions = [_row_to_session(r, today) for r in rows]
	if view in ("sessions", "notifications"):
		sessions = _attach_attendance_counts(sessions)

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
	past_trainers = {(r.get("trainer_name") or "").strip() for r in rows if (r.get("trainer_name") or "").strip()}
	past_programs = {(r.get("program") or "").strip() for r in rows if (r.get("program") or "").strip()}
	past_departments = {(r.get("department_training") or "").strip() for r in rows if (r.get("department_training") or "").strip()}
	past_cities = {(r.get("city") or "").strip() for r in rows if (r.get("city") or "").strip()}
	return {
		"trainers": _list_link_options("trainer", past_trainers),
		"programs": _list_link_options("program", past_programs),
		"training_types": _list_link_options("training_type"),
		"cities": _list_link_options("city", past_cities),
		"schools": _list_school_options(limit=40),
		"departments": _list_link_options("department", past_departments),
		"can_create_training_type": _can_create_link("training_type"),
		"can_create": {
			"training_type": _can_create_link("training_type"),
			"trainer": _can_create_link("trainer"),
			"program": _can_create_link("program"),
			"city": _can_create_link("city"),
			"school": False,
			"department": False,
		},
		"types": ["Training", "Workshop"],
		"modes": ["In-person", "Online", "Onsite"],
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
	attendance = []
	if hasattr(doc, "attendance"):
		for row in doc.attendance or []:
			attendance.append(_attendance_row_dict(row))
	present = sum(1 for a in attendance if a["attendance_status"] == "Present")
	return {
		"name": doc.name,
		"type": doc.type,
		"training_date": str(doc.training_date) if doc.training_date else "",
		"training_time": _format_time(doc.training_time) or "10:00",
		"training_end_time": _format_time(getattr(doc, "training_end_time", None))
		or _default_end_time(doc.training_time),
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
		"tag_school": _resolve_school_link(doc.tag_school, doc.school_name)[0],
		"zoom_id": getattr(doc, "zoom_id", None) or "",
		"zoom_link": getattr(doc, "zoom_link", None) or "",
		"attendance": attendance,
		"attendance_present": present,
		"attendance_total": len(attendance),
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

	if "training_type" in values and frappe.get_meta(DOCTYPE).has_field("training_type"):
		values.training_type = _ensure_link_record("training_type", values.get("training_type"))
	if "trainer_name" in values:
		values.trainer_name = _ensure_link_record("trainer", values.get("trainer_name"))
	if "program" in values:
		values.program = _ensure_link_record("program", values.get("program"))
	if "city" in values:
		values.city = _ensure_link_record("city", values.get("city"))

	tag_school, school_name = _resolve_school_link(values.get("tag_school"), values.get("school_name"))
	values.tag_school = tag_school or None
	if school_name:
		values.school_name = school_name
	if tag_school and not values.get("city"):
		cust_meta = frappe.get_meta("Customer")
		cust_fields = [f for f in ("custom_city", "territory") if cust_meta.has_field(f)]
		if cust_fields:
			cust = frappe.db.get_value("Customer", tag_school, cust_fields, as_dict=True) or {}
			city = (cust.get("custom_city") or cust.get("territory") or "").strip()
			if city and frappe.db.exists("City", city):
				values.city = city

	if values.get("training_time"):
		end_secs = _time_to_seconds(values.get("training_end_time"))
		start_secs = _time_to_seconds(values.get("training_time"))
		if start_secs is not None and (end_secs is None or end_secs <= start_secs):
			values.training_end_time = _default_end_time(values.training_time)

	for field in (
		"type",
		"training_date",
		"training_time",
		"training_end_time",
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
		"zoom_id",
		"zoom_link",
	):
		if field in values and frappe.get_meta(DOCTYPE).has_field(field):
			doc.set(field, values.get(field) or None)

	if "attendance" in values and frappe.get_meta(DOCTYPE).has_field("attendance"):
		doc.set("attendance", [])
		for row in values.get("attendance") or []:
			if isinstance(row, str):
				continue
			payload = _attendance_append_values(row)
			if payload:
				doc.append("attendance", payload)

	doc.save(ignore_permissions=False)
	frappe.db.commit()
	today = getdate(nowdate())
	session = _row_to_session(doc.as_dict(), today)
	_attach_attendance_counts([session])
	return {
		"ok": 1,
		"name": doc.name,
		"session": session,
		"message": _("Upcoming Training {0} saved.").format(doc.name),
	}


@frappe.whitelist()
def search_link_options(key=None, txt=None, limit=20):
	"""Typeahead for portal Link fields (Customer/School)."""
	_require_login()
	key = (key or "").strip()
	if key == "school":
		return _list_school_options(txt=txt, limit=limit)
	spec = LINK_SPECS.get(key) or {}
	doctype = spec.get("doctype")
	title_field = spec.get("title_field") or "name"
	if not doctype:
		q = (txt or "").strip().lower()
		names = _list_link_options(key)
		if q:
			names = [n for n in names if q in n.lower()]
		return [{"value": n, "label": n} for n in names[: max(1, min(cint(limit) or 20, 50))]]
	return [
		{"value": n, "label": n}
		for n in _list_doctype_names(doctype, title_field)
		if not (txt or "").strip() or (txt or "").strip().lower() in n.lower()
	][: max(1, min(cint(limit) or 20, 50))]


@frappe.whitelist()
def create_training_type(name=None):
	"""Back-compat wrapper for Training Type create."""
	return create_link_record(key="training_type", name=name)


@frappe.whitelist()
def create_link_record(key=None, name=None):
	"""Create a linked record from the portal Link field (same as Frappe Create New)."""
	_require_login()
	key = (key or "").strip()
	name = (name or "").strip()
	spec = LINK_SPECS.get(key)
	if not spec:
		frappe.throw(_("Unknown link field: {0}").format(key))
	if not spec.get("allow_create"):
		frappe.throw(_("Creating a new {0} from this form is not allowed.").format(spec.get("doctype") or key))
	if not name:
		frappe.throw(_("{0} name is required.").format(spec.get("doctype") or key))
	existing = _find_link_record(key, name)
	if existing:
		return {
			"ok": 1,
			"name": existing,
			"created": 0,
			"key": key,
			"message": _("{0} {1} already exists.").format(spec.get("doctype"), existing),
		}
	created = _ensure_link_record(key, name)
	frappe.db.commit()
	return {
		"ok": 1,
		"name": created,
		"created": 1,
		"key": key,
		"message": _("{0} {1} created.").format(spec.get("doctype"), created),
	}


@frappe.whitelist()
def parse_attendance_csv(content=None):
	"""Preview Zoom attendance CSV rows before saving to a training."""
	_require_login()
	if not frappe.has_permission(DOCTYPE, "read"):
		frappe.throw(_("You are not permitted to view Upcoming Training."), frappe.PermissionError)
	rows = _parse_zoom_attendance_csv(content or "")
	return {
		"ok": 1,
		"count": len(rows),
		"rows": rows,
		"message": _("Parsed {0} attendance row(s).").format(len(rows)),
	}


@frappe.whitelist()
def import_attendance(name=None, content=None, mode="replace"):
	"""Bulk-import Zoom attendance CSV onto an Upcoming Training (tagged via Zoom ID on the doc)."""
	_require_login()
	if not name:
		frappe.throw(_("Upcoming Training name is required to import attendance."))
	if not frappe.has_permission(DOCTYPE, "write"):
		frappe.throw(_("You are not permitted to update Upcoming Training."), frappe.PermissionError)

	rows = _parse_zoom_attendance_csv(content or "")
	if not rows:
		frappe.throw(_("No attendance rows found in the CSV."))

	doc = frappe.get_doc(DOCTYPE, name)
	mode = (mode or "replace").strip().lower()
	if mode == "replace":
		doc.set("attendance", [])

	existing_keys = {
		((r.participant_name or "").strip().lower(), (r.email or "").strip().lower())
		for r in (doc.attendance or [])
	}
	added = 0
	for row in rows:
		key = ((row.get("participant_name") or "").strip().lower(), (row.get("email") or "").strip().lower())
		if mode == "append" and key in existing_keys:
			continue
		payload = _attendance_append_values(row)
		if not payload:
			continue
		doc.append("attendance", payload)
		existing_keys.add(key)
		added += 1

	doc.save(ignore_permissions=False)
	frappe.db.commit()
	attendance = [_attendance_row_dict(r) for r in doc.attendance or []]
	return {
		"ok": 1,
		"name": doc.name,
		"zoom_id": doc.zoom_id or "",
		"added": added,
		"attendance": attendance,
		"attendance_present": sum(1 for a in attendance if a["attendance_status"] == "Present"),
		"attendance_total": len(attendance),
		"message": _("Imported {0} attendance row(s) for {1}.").format(added, doc.name),
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
