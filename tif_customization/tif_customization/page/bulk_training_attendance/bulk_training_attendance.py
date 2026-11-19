# Copyright (c) 2026, The Ilm Foundation and contributors
# License: MIT
"""Bulk Training Attendance — list Upcoming Trainings and import Excel/CSV attendance."""

from __future__ import annotations

import json

import frappe
from frappe import _
from frappe.utils import cint, cstr, get_first_day, getdate, today

DOCTYPE = "Upcoming Training"


def _parse(filters):
	if isinstance(filters, str):
		try:
			return json.loads(filters) or {}
		except Exception:
			return {}
	return filters or {}


def _check_read():
	if not frappe.has_permission(DOCTYPE, "read"):
		frappe.throw(_("You are not permitted to view Upcoming Training."), frappe.PermissionError)


def _check_write():
	if not frappe.has_permission(DOCTYPE, "write"):
		frappe.throw(_("You are not permitted to update Upcoming Training."), frappe.PermissionError)


@frappe.whitelist()
def list_sessions(filters=None):
	"""Upcoming Training rows for bulk attendance picker."""
	_check_read()
	filters = _parse(filters)
	today_d = getdate(today())
	from_date = getdate(filters.get("from_date") or get_first_day(today_d))
	to_date = getdate(filters.get("to_date") or today_d)
	if from_date > to_date:
		frappe.throw(_("From Date cannot be after To Date."))

	search = cstr(filters.get("search") or "").strip()
	trainer = cstr(filters.get("trainer") or "").strip()

	fields = [
		"name",
		"training_date",
		"training_time",
		"workshop_topic",
		"training_type",
		"trainer_name",
		"school_name",
		"mode_of_training",
		"zoom_id",
		"city",
	]
	meta_fields = {f.fieldname for f in frappe.get_meta(DOCTYPE).fields}
	fields = [f for f in fields if f == "name" or f in meta_fields]

	flt = {"docstatus": ["<", 2], "training_date": ["between", [from_date, to_date]]}
	if trainer:
		flt["trainer_name"] = trainer

	rows = frappe.get_list(
		DOCTYPE,
		filters=flt,
		fields=fields,
		order_by="training_date desc, training_time desc",
		limit_page_length=500,
	)

	# Attendance counts
	names = [r.name for r in rows]
	stats = {}
	if names and frappe.db.exists("DocType", "Upcoming Training Attendance"):
		has_source = frappe.get_meta("Upcoming Training Attendance").has_field("attendance_source")
		if has_source:
			raw = frappe.db.sql(
				"""
				SELECT parent,
					COUNT(*) AS total,
					SUM(CASE WHEN attendance_status = 'Present' THEN 1 ELSE 0 END) AS present,
					SUM(CASE WHEN IFNULL(attendance_source,'') = 'Zoom' THEN 1 ELSE 0 END) AS zoom,
					SUM(CASE WHEN IFNULL(attendance_source,'') != 'Zoom' THEN 1 ELSE 0 END) AS manual
				FROM `tabUpcoming Training Attendance`
				WHERE parent IN %(names)s
				GROUP BY parent
				""",
				{"names": names},
				as_dict=True,
			)
		else:
			raw = frappe.db.sql(
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
		for r in raw:
			stats[r.parent] = {
				"total": cint(r.total),
				"present": cint(r.present),
				"zoom": cint(r.get("zoom") or 0),
				"manual": cint(r.get("manual") or 0),
			}

	out = []
	for r in rows:
		title = cstr(r.get("workshop_topic") or r.get("training_type") or r.name)
		school = cstr(r.get("school_name") or "")
		if search:
			blob = f"{title} {school} {r.name} {cstr(r.get('trainer_name'))}".lower()
			if search.lower() not in blob:
				continue
		st = stats.get(r.name) or {"total": 0, "present": 0, "zoom": 0, "manual": 0}
		out.append(
			{
				"name": r.name,
				"training_date": str(r.training_date) if r.training_date else "",
				"training_time": cstr(r.get("training_time") or ""),
				"title": title,
				"trainer_name": cstr(r.get("trainer_name") or ""),
				"school_name": school,
				"mode": cstr(r.get("mode_of_training") or ""),
				"zoom_id": cstr(r.get("zoom_id") or ""),
				"city": cstr(r.get("city") or ""),
				"attendance_total": st["total"],
				"attendance_present": st["present"],
				"zoom_count": st.get("zoom") or 0,
				"manual_count": st.get("manual") or 0,
			}
		)
	return {"rows": out, "from_date": str(from_date), "to_date": str(to_date), "count": len(out)}


@frappe.whitelist()
def get_attendance(name=None, source=None):
	"""Full attendance rows for one Upcoming Training (optional Zoom/Manual filter)."""
	_check_read()
	name = cstr(name or "").strip()
	if not name:
		frappe.throw(_("Upcoming Training name is required."))
	if not frappe.db.exists(DOCTYPE, name):
		frappe.throw(_("Upcoming Training {0} not found.").format(name))

	from tif_customization.tif_customization.api.training_schedule import (
		_attendance_row_dict,
		_infer_attendance_source,
	)

	doc = frappe.get_doc(DOCTYPE, name)
	want = cstr(source or "").strip()
	rows = []
	for r in doc.attendance or []:
		row = _attendance_row_dict(r)
		src = row.get("attendance_source") or _infer_attendance_source(row)
		row["attendance_source"] = src
		if want in ("Zoom", "Manual") and src != want:
			continue
		rows.append(row)

	present = sum(1 for a in rows if a.get("attendance_status") == "Present")
	return {
		"name": doc.name,
		"title": cstr(getattr(doc, "workshop_topic", None) or getattr(doc, "training_type", None) or doc.name),
		"training_date": str(doc.training_date) if doc.training_date else "",
		"school_name": cstr(getattr(doc, "school_name", None) or ""),
		"trainer_name": cstr(getattr(doc, "trainer_name", None) or ""),
		"attendance": rows,
		"attendance_total": len(rows),
		"attendance_present": present,
		"zoom_count": sum(1 for a in rows if a.get("attendance_source") == "Zoom"),
		"manual_count": sum(1 for a in rows if a.get("attendance_source") != "Zoom"),
	}


@frappe.whitelist()
def import_file(
	name=None,
	content=None,
	content_b64=None,
	filename=None,
	mode="replace",
	source="Manual",
	ignore_date=0,
):
	"""Proxy to training_schedule.import_attendance (Excel/CSV → one session)."""
	_check_write()
	from tif_customization.tif_customization.api.training_schedule import import_attendance

	return import_attendance(
		name=name,
		content=content,
		content_b64=content_b64,
		filename=filename,
		mode=mode,
		source=source,
		ignore_date=ignore_date,
	)
