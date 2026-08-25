# Copyright (c) 2026, mohtashim and contributors
# For license information, please see license.txt

import calendar
from datetime import time, timedelta

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import formatdate, getdate


class UpcomingTraining(Document):
	def validate(self):
		self.set_month()
		self.attendance_count = sum(
			1
			for row in (self.attendance or [])
			if (row.attendance_status or "").strip() == "Present"
		)
		self.validate_trainer_not_double_booked()

	def set_month(self):
		"""Month is derived, never typed, so workshop listings can never disagree with the date."""
		self.month = calendar.month_name[getdate(self.training_date).month] if self.training_date else None

	def validate_trainer_not_double_booked(self):
		"""Block assigning the same instructor on the same date and time twice."""
		trainer = (self.trainer_name or "").strip()
		if not trainer or not self.training_date:
			return

		target_start = _time_to_seconds(self.training_time)
		target_end = _time_to_seconds(getattr(self, "training_end_time", None))
		if target_start is not None and (target_end is None or target_end <= target_start):
			target_end = target_start + 2 * 3600
		filters = {
			"training_date": getdate(self.training_date),
			"name": ["!=", self.name or ""],
		}
		fields = ["name", "trainer_name", "training_time", "training_type", "workshop_topic", "type"]
		if frappe.get_meta("Upcoming Training").has_field("training_end_time"):
			fields.append("training_end_time")
		rows = frappe.get_all(
			"Upcoming Training",
			filters=filters,
			fields=fields,
			limit_page_length=200,
		)

		trainer_key = trainer.casefold()
		for row in rows:
			other = (row.trainer_name or "").strip()
			if not other or other.casefold() != trainer_key:
				continue
			other_start = _time_to_seconds(row.training_time)
			other_end = _time_to_seconds(row.get("training_end_time") if hasattr(row, "get") else getattr(row, "training_end_time", None))
			if other_start is not None and (other_end is None or other_end <= other_start):
				other_end = other_start + 2 * 3600
			if target_start is None and other_start is None:
				clash = True
			elif target_start is None or other_start is None:
				clash = False
			else:
				clash = target_start < other_end and other_start < target_end
			if not clash:
				continue

			title = (
				(row.training_type or "").strip()
				or (row.workshop_topic or "").strip()
				or (row.type or "Training")
			)
			time_label = _format_time_range(self.training_time, getattr(self, "training_end_time", None)) or _("(no time)")
			frappe.throw(
				_(
					"Instructor {0} is already assigned on {1} at {2} "
					"(Upcoming Training {3}: {4}). Choose another time or instructor."
				).format(
					trainer,
					formatdate(self.training_date),
					time_label,
					row.name,
					title,
				),
				title=_("Instructor Already Assigned"),
			)


def _time_to_seconds(value):
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


def _format_time(value):
	secs = _time_to_seconds(value)
	if secs is None:
		return ""
	h = secs // 3600
	m = (secs % 3600) // 60
	return f"{h:02d}:{m:02d}"


def _format_time_range(start, end=None):
	a = _format_time(start)
	b = _format_time(end) if end not in (None, "") else ""
	if a and b:
		return f"{a} – {b}"
	return a or b or ""
