# Copyright (c) 2026, The Ilm Foundation and contributors
# License: MIT
"""Update Field Visit type → Internal Meeting for:
1) Academic records with ot_type = Meeting of Regional Staff
2) Co-curricular Activity (Stall Activity / Exhibition)
No dashboard / form changes — records only."""

from __future__ import annotations

import frappe


ACADEMIC_TYPES = (
	"Academic Task",
	"Academic",
	"Academic / Other Official Tasks",
)

MEETING_OT = "Meeting of Regional Staff (Supervisors) and SMEs"


def _set_internal_meeting(names):
	for name in names:
		frappe.db.set_value(
			"Field Visit",
			name,
			{
				"type": "Internal Meeting",
				"mt_meeting_type": "Internal Meeting (Meeting with TIF Staff)",
			},
			update_modified=False,
		)


def execute():
	if not frappe.db.exists("DocType", "Field Visit"):
		return

	academic = frappe.db.sql(
		"""
		SELECT name
		FROM `tabField Visit`
		WHERE type IN %(types)s
		  AND IFNULL(TRIM(ot_type_of_task), '') = %(ot)s
		""",
		{"types": ACADEMIC_TYPES, "ot": MEETING_OT},
		as_dict=True,
	)
	_set_internal_meeting([r.name for r in academic])

	stall = frappe.get_all("Field Visit", filters={"type": "Co-curricular Activity"}, pluck="name")
	_set_internal_meeting(stall)

	frappe.db.commit()
	frappe.logger("patches").info(
		"v2026_10_15_academic_to_internal_stall: "
		f"academic_meeting={len(academic)}, stall={len(stall)} → Internal Meeting"
	)
