# Copyright (c) 2026, TIF Customization and contributors
"""Do not invent a checkout when the staff forgot to punch out.

If the date has changed and yesterday is still only Check In:
- they cannot save Check Out (HR will set the real out time)
- their next punch is treated as today's Check In
"""

from __future__ import annotations

import frappe
from frappe.utils import get_datetime, now_datetime


def close_stale_open_checkin(doc, method=None):
	"""Hook: Employee Checkin before_insert."""
	if getattr(doc, "flags", None) and doc.flags.get("ignore_stale_checkout_guard"):
		return
	if not doc.employee:
		return

	punch_time = get_datetime(doc.time) if doc.time else now_datetime()
	last = _last_checkin(doc.employee, exclude=doc.name)
	if not last or (last.log_type or "").upper() != "IN":
		return
	if not _is_previous_day_open_in(last, punch_time):
		return

	# Never auto-create yesterday's OUT (they may have left early; only HR knows).
	if (doc.log_type or "").upper() != "OUT":
		return

	doc.log_type = "IN"
	if not (doc.device_id or "").strip():
		doc.device_id = "Check-In (previous checkout pending HR)"


def _last_checkin(employee, exclude=None):
	filters = {"employee": employee}
	if exclude:
		filters["name"] = ["!=", exclude]
	rows = frappe.get_all(
		"Employee Checkin",
		filters=filters,
		fields=["name", "log_type", "time"],
		order_by="time desc",
		limit=1,
	)
	return rows[0] if rows else None


def _is_previous_day_open_in(last, punch_time):
	return get_datetime(last.time).date() < punch_time.date()
