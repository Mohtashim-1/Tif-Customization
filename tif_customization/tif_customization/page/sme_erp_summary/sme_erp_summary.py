# Copyright (c) 2026, TIF Customization and contributors
# License: MIT
"""Paper-style SME period summary — matches printed Summary sheet layout."""

from __future__ import annotations

import frappe
from frappe.utils import cint, flt

from tif_customization.tif_customization.page.sme_summary_report_copy.sme_summary_report_copy import (
	get_report_data as _get_summary_data,
	get_sme_employee_query,
)


@frappe.whitelist()
@frappe.validate_and_sanitize_search_inputs
def get_sme_employee_query_proxy(doctype, txt, searchfield, start, page_len, filters):
	return get_sme_employee_query(doctype, txt, searchfield, start, page_len, filters)


@frappe.whitelist()
def get_report_data(filters=None):
	"""Same staff/visit stats as SME Summary Copy, shaped for the paper Summary table."""
	data = _get_summary_data(filters)
	working_days = cint(data.get("working_days") or 0)
	paper_rows = []
	totals = {
		"followup_other": 0,
		"new": 0,
		"meetings": 0,
		"active": 0,
		"inactive": 0,
		"schools": 0,
		"participants": 0,
		"grand_total": 0,
		"expenses": 0.0,
		"visited_days": 0,
		"difference": 0,
	}

	for r in data.get("rows") or []:
		# Paper "Followup & Other Visits" = Visits (non-New) + Marketing type
		followup_other = cint(r.get("followup") or 0) + cint(r.get("marketing") or 0)
		new = cint(r.get("new") or 0)
		# Meeting + Ulama (visit_stats already groups both into meetings)
		meetings = cint(r.get("meetings") or 0)
		if cint(r.get("meeting_ulama") or 0) > meetings:
			meetings = cint(r.get("meeting_ulama") or 0)
		active = cint(r.get("active") or 0)
		inactive = cint(r.get("inactive") or 0)
		# Prefer explicit active/inactive; if only me is set, put remainder in inactive bucket
		me = cint(r.get("me") or 0)
		if me and not active and not inactive:
			active = me
		elif me > active + inactive:
			inactive = max(0, me - active)
		schools = cint(r.get("schools") or 0)
		participants = cint(r.get("participants") or 0)
		grand_total = followup_other + new + meetings + active + inactive
		visited_days = cint(r.get("visited_days") or 0)
		expenses = flt(r.get("expenses") or 0)
		difference = visited_days - working_days

		paper_rows.append(
			{
				"employee": r.get("employee"),
				"employee_name": r.get("employee_name"),
				"user_id": r.get("user_id"),
				"label": r.get("label") or f"SME - {r.get('employee_name') or ''}",
				"division": r.get("division") or r.get("region_label") or "",
				"followup_other": followup_other,
				"new": new,
				"meetings": meetings,
				"active": active,
				"inactive": inactive,
				"schools": schools,
				"participants": participants,
				"grand_total": grand_total,
				"expenses": expenses,
				"visited_days": visited_days,
				"difference": difference,
			}
		)
		for k in (
			"followup_other",
			"new",
			"meetings",
			"active",
			"inactive",
			"schools",
			"participants",
			"grand_total",
			"visited_days",
			"difference",
		):
			totals[k] += cint(paper_rows[-1].get(k) or 0)
		totals["expenses"] += expenses

	paper_rows.sort(
		key=lambda x: (-cint(x.get("grand_total") or 0), (x.get("employee_name") or "").lower())
	)

	totals["expenses"] = flt(totals["expenses"], 2)
	return {
		"from_date": data.get("from_date"),
		"to_date": data.get("to_date"),
		"working_days": working_days,
		"supervisor": data.get("supervisor"),
		"supervisor_label": data.get("supervisor_label"),
		"supervisors": data.get("supervisors") or [],
		"region": data.get("region"),
		"region_label": data.get("region_label"),
		"rows": paper_rows,
		"totals": totals,
		"sme_count": len(paper_rows),
	}
