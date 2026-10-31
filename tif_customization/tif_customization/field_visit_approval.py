# Copyright (c) 2026, TIF Customization and contributors
# License: MIT
"""Supervisor approval rules for Field Visit (portal + desk).

Rules for field officers (supervisors / managers skip):
1. Backdated activity older than 48 hours → Pending Supervisor Approval
2. Same school visited 2+ times already in the calendar month → 3rd+ needs approval

Approval state lives on DocType "Field Visit Approval Request" (avoids Field Visit row-size limits).
"""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import (
	add_to_date,
	cint,
	cstr,
	get_datetime,
	get_first_day,
	get_last_day,
	getdate,
	now_datetime,
)

SCHOOL_VISIT_TYPES = frozenset(
	{
		"Visits",
		"Marketing",
		"M&E",
		"Joint Visit with SME",
		"Registration of New Schools",
		"Books Demand (Quantity)",
		"Enrolment of Volunteers",
		"Enrolment of Ambassadors",
		"Model School A",
		"Model School B",
	}
)

BACKDATE_HOURS = 48
SAME_SCHOOL_FREE_VISITS = 2
APPROVAL_DT = "Field Visit Approval Request"


def _activity_date(doc_or_data):
	if hasattr(doc_or_data, "get_visit_date"):
		d = doc_or_data.get_visit_date()
		if d:
			return getdate(d)
	data = doc_or_data
	keys = ("visit_date", "me_visit_date", "training_date", "mt_meeting_date", "ot_date", "date")
	for key in keys:
		raw = None
		if isinstance(data, dict):
			raw = data.get(key)
		elif hasattr(data, "get"):
			raw = data.get(key)
		else:
			raw = getattr(data, key, None)
		if raw:
			try:
				return getdate(raw)
			except Exception:
				continue
	return None


def is_backdated_beyond_window(activity_date, hours=BACKDATE_HOURS):
	if not activity_date:
		return False
	d = getdate(activity_date)
	cutoff = add_to_date(now_datetime(), hours=-int(hours or BACKDATE_HOURS))
	day_end = get_datetime(f"{d} 23:59:59")
	return day_end < cutoff


def count_same_school_visits_in_month(school_name, activity_date, visit_by=None, exclude_name=None):
	school = cstr(school_name or "").strip()
	if not school or not activity_date:
		return 0
	d = getdate(activity_date)
	month_start = get_first_day(d)
	month_end = get_last_day(d)
	params = {"school": school, "from_date": month_start, "to_date": month_end}
	extra = ""
	if visit_by:
		params["visit_by"] = cstr(visit_by).strip()
		extra += " AND TRIM(IFNULL(fv.visit_by, '')) = %(visit_by)s"
	if exclude_name:
		params["exclude"] = exclude_name
		extra += " AND fv.name != %(exclude)s"

	# Exclude rejected approvals
	reject_join = ""
	reject_filter = ""
	if frappe.db.table_exists("tabField Visit Approval Request"):
		reject_join = f" LEFT JOIN `tab{APPROVAL_DT}` ar ON ar.field_visit = fv.name "
		reject_filter = " AND IFNULL(ar.status, '') != 'Rejected' "

	row = frappe.db.sql(
		f"""
		SELECT COUNT(*) AS cnt
		FROM `tabField Visit` fv
		{reject_join}
		WHERE fv.docstatus < 2
			AND TRIM(IFNULL(fv.school_name, '')) = %(school)s
			AND COALESCE(fv.visit_date, fv.me_visit_date, fv.training_date, fv.mt_meeting_date, fv.ot_date)
				BETWEEN %(from_date)s AND %(to_date)s
			{reject_filter}
			{extra}
		""",
		params,
		as_dict=True,
	)
	return cint(row[0].cnt) if row else 0


def evaluate_approval_requirements(
	*,
	doc_type,
	activity_date,
	school_name=None,
	visit_by=None,
	exclude_name=None,
	force_skip=False,
):
	reasons = []
	if force_skip:
		return {"needs_approval": False, "reasons": [], "same_school_count": 0}

	if is_backdated_beyond_window(activity_date):
		reasons.append(
			_("Backdated entry older than {0} hours — supervisor approval required.").format(BACKDATE_HOURS)
		)

	same_count = 0
	if (doc_type or "").strip() in SCHOOL_VISIT_TYPES and cstr(school_name or "").strip():
		same_count = count_same_school_visits_in_month(
			school_name, activity_date, visit_by=visit_by, exclude_name=exclude_name
		)
		if same_count >= SAME_SCHOOL_FREE_VISITS:
			reasons.append(
				_(
					"Same school already visited {0} time(s) this month — 3rd+ visit needs supervisor approval."
				).format(same_count)
			)

	return {
		"needs_approval": bool(reasons),
		"reasons": reasons,
		"same_school_count": same_count,
	}


def get_supervisor_user_for_employee(employee=None, user=None):
	user = user or frappe.session.user
	emp = cstr(employee or "").strip()
	fo = None
	if emp and frappe.db.exists("DocType", "Field Officer"):
		fo = frappe.db.get_value(
			"Field Officer",
			{"employee": emp, "status": "Active"},
			["name", "parent_field_officer", "user"],
			as_dict=True,
		)
	if not fo and frappe.db.exists("DocType", "Field Officer"):
		fo = frappe.db.get_value(
			"Field Officer",
			{"user": user, "status": "Active"},
			["name", "parent_field_officer", "user"],
			as_dict=True,
		)
	parent = cstr((fo or {}).get("parent_field_officer") or "").strip()
	if not parent:
		return ""
	return cstr(frappe.db.get_value("Field Officer", parent, "user") or "").strip()


def get_approval_request(field_visit):
	name = cstr(field_visit or "").strip()
	if not name or not frappe.db.exists("DocType", APPROVAL_DT):
		return None
	existing = frappe.db.get_value(APPROVAL_DT, {"field_visit": name}, "name")
	if not existing:
		return None
	return frappe.get_doc(APPROVAL_DT, existing)


def apply_pending_approval(doc, reasons, supervisor_user=None):
	"""Create/update Pending approval request for this Field Visit."""
	reason_text = "\n".join(cstr(r) for r in (reasons or []) if cstr(r).strip())
	if not doc or not doc.name:
		return reason_text
	if not frappe.db.exists("DocType", APPROVAL_DT):
		return reason_text

	req = get_approval_request(doc.name)
	if req:
		req.status = "Pending"
		req.reasons = reason_text
		req.supervisor_user = supervisor_user or req.supervisor_user
		req.requested_by = frappe.session.user
		req.requested_on = now_datetime()
		req.decided_by = None
		req.decided_on = None
		req.approver_remarks = None
		req.save(ignore_permissions=True)
	else:
		req = frappe.get_doc(
			{
				"doctype": APPROVAL_DT,
				"field_visit": doc.name,
				"status": "Pending",
				"reasons": reason_text,
				"requested_by": frappe.session.user,
				"requested_on": now_datetime(),
				"supervisor_user": supervisor_user or "",
			}
		)
		req.insert(ignore_permissions=True)
	return reason_text


def notify_supervisor_pending(doc, supervisor_user=None):
	sup = cstr(supervisor_user or "").strip()
	if not sup or not doc or not doc.name:
		return
	try:
		if hasattr(frappe.share, "add"):
			frappe.share.add("Field Visit", doc.name, user=sup, read=1, write=1, submit=1, notify=0)
		else:
			frappe.share.add_docshare(
				"Field Visit",
				doc.name,
				sup,
				read=1,
				write=1,
				submit=1,
				flags={"ignore_share_permission": True},
			)
	except Exception:
		frappe.log_error(frappe.get_traceback(), "Field Visit share to supervisor")

	try:
		frappe.get_doc(
			{
				"doctype": "Notification Log",
				"subject": _("Field Visit {0} needs your approval").format(doc.name),
				"email_content": cstr((get_approval_request(doc.name) or frappe._dict()).get("reasons") or ""),
				"for_user": sup,
				"type": "Alert",
				"document_type": "Field Visit",
				"document_name": doc.name,
				"from_user": frappe.session.user,
			}
		).insert(ignore_permissions=True)
	except Exception:
		frappe.log_error(frappe.get_traceback(), "Field Visit supervisor notification")


def user_can_approve_field_visit(doc, user=None):
	user = user or frappe.session.user
	if user in ("Administrator",) or "System Manager" in frappe.get_roles(user):
		return True
	from tif_customization.tif_customization.field_visit_permissions import can_view_all_field_visits
	from tif_customization.tif_customization.field_visit_supervisor_only import (
		can_manage_supervisor_only_field_visits,
	)

	if can_view_all_field_visits(user):
		return True
	if not can_manage_supervisor_only_field_visits(user):
		return False
	owner = cstr(getattr(doc, "owner", "") or "")
	if get_supervisor_user_for_employee(user=owner) == user:
		return True
	visit_by = cstr(getattr(doc, "visit_by", "") or "")
	if visit_by and frappe.db.exists("DocType", "Field Officer"):
		emp = frappe.db.get_value("Employee", {"employee_name": visit_by}, "name")
		if emp and get_supervisor_user_for_employee(employee=emp) == user:
			return True
	req = get_approval_request(getattr(doc, "name", None) or getattr(doc, "field_visit", None))
	if req and cstr(req.supervisor_user or "") == user:
		return True
	return False


def block_submit_if_pending(doc):
	req = get_approval_request(doc.name)
	if req and cstr(req.status or "") == "Pending":
		frappe.throw(
			_(
				"This Field Visit is pending supervisor approval and cannot be submitted yet.\n{0}"
			).format(cstr(req.reasons or "")),
			title=_("Supervisor Approval Required"),
		)


def approval_payload_for_visit(name):
	req = get_approval_request(name)
	if not req:
		return {
			"needs_supervisor_approval": 0,
			"approval_status": "",
			"approval_reasons": "",
			"approved_by": "",
			"approved_on": "",
			"approver_remarks": "",
		}
	pending = cstr(req.status or "") == "Pending"
	return {
		"needs_supervisor_approval": 1 if pending else 0,
		"approval_status": cstr(req.status or ""),
		"approval_reasons": cstr(req.reasons or ""),
		"approved_by": cstr(req.decided_by or ""),
		"approved_on": cstr(req.decided_on or ""),
		"approver_remarks": cstr(req.approver_remarks or ""),
	}


@frappe.whitelist()
def check_field_visit_approval(data=None):
	if isinstance(data, str):
		data = frappe.parse_json(data) or {}
	data = data or {}
	from tif_customization.tif_customization.field_visit_supervisor_only import (
		can_manage_supervisor_only_field_visits,
	)
	from tif_customization.tif_customization.page.smes_activity_form.smes_activity_form import (
		ACTIVITY_TYPE_MAP,
	)

	doc_type = ACTIVITY_TYPE_MAP.get(data.get("activity_type"), data.get("activity_type"))
	activity_date = _activity_date(data)
	result = evaluate_approval_requirements(
		doc_type=doc_type,
		activity_date=activity_date,
		school_name=data.get("school_name"),
		visit_by=data.get("visit_by"),
		force_skip=can_manage_supervisor_only_field_visits(),
	)
	result["activity_date"] = cstr(activity_date or "")
	return result


@frappe.whitelist()
def approve_field_visit(name, remarks=None, submit=1):
	name = cstr(name or "").strip()
	doc = frappe.get_doc("Field Visit", name)
	if not user_can_approve_field_visit(doc):
		frappe.throw(_("Not permitted to approve this Field Visit."), frappe.PermissionError)
	req = get_approval_request(name)
	if not req or cstr(req.status or "") != "Pending":
		frappe.throw(_("This visit is not pending approval."))
	req.status = "Approved"
	req.decided_by = frappe.session.user
	req.decided_on = now_datetime()
	if remarks:
		req.approver_remarks = cstr(remarks)
	req.save(ignore_permissions=True)
	submitted = False
	if cint(submit) and cint(doc.docstatus) == 0:
		doc.reload()
		doc.submit()
		submitted = True
	frappe.db.commit()
	return {
		"name": doc.name,
		"approval_status": "Approved",
		"submitted": submitted,
		"docstatus": cint(doc.docstatus),
		"message": _("Approved {0}").format(doc.name)
		+ (_(" and submitted.") if submitted else _(".")),
	}


@frappe.whitelist()
def reject_field_visit(name, remarks=None):
	name = cstr(name or "").strip()
	doc = frappe.get_doc("Field Visit", name)
	if not user_can_approve_field_visit(doc):
		frappe.throw(_("Not permitted to reject this Field Visit."), frappe.PermissionError)
	req = get_approval_request(name)
	if not req or cstr(req.status or "") != "Pending":
		frappe.throw(_("This visit is not pending approval."))
	req.status = "Rejected"
	req.decided_by = frappe.session.user
	req.decided_on = now_datetime()
	req.approver_remarks = cstr(remarks or _("Rejected by supervisor"))
	req.save(ignore_permissions=True)
	frappe.db.commit()
	return {
		"name": doc.name,
		"approval_status": "Rejected",
		"message": _("Rejected {0}").format(doc.name),
	}


def _approval_row(r, fv, *, can_approve=False, role=""):
	school = cstr(fv.get("school_name") or "").strip()
	if school and frappe.db.exists("Customer", school):
		school = cstr(frappe.db.get_value("Customer", school, "customer_name") or school).strip()
	return {
		"name": fv.get("name") or r.get("field_visit"),
		"request_name": r.get("name"),
		"type": fv.get("type") or "",
		"visit_by": fv.get("visit_by") or "",
		"visit_date": cstr(fv.get("visit_date") or ""),
		"school_name": school,
		"approval_reasons": cstr(r.get("reasons") or ""),
		"requested_by": cstr(r.get("requested_by") or ""),
		"requested_on": cstr(r.get("requested_on") or ""),
		"owner": fv.get("owner") or "",
		"can_approve": bool(can_approve),
		"role": role,
	}


@frappe.whitelist()
def list_pending_approvals(limit=50):
	"""Pending approvals for the logged-in user.

	Returns:
	- to_approve: visits this supervisor/manager can approve
	- my_pending: visits this field officer submitted that still await approval
	"""
	from tif_customization.tif_customization.field_visit_permissions import can_view_all_field_visits
	from tif_customization.tif_customization.field_visit_supervisor_only import (
		can_manage_supervisor_only_field_visits,
	)

	user = frappe.session.user
	limit = cint(limit) or 50
	empty = {
		"to_approve": [],
		"my_pending": [],
		"to_approve_count": 0,
		"my_pending_count": 0,
		"total_count": 0,
		"is_supervisor": False,
	}
	if not frappe.db.exists("DocType", APPROVAL_DT):
		return empty

	is_supervisor = can_manage_supervisor_only_field_visits(user) or can_view_all_field_visits(user)
	rows = frappe.get_all(
		APPROVAL_DT,
		filters={"status": "Pending"},
		fields=["name", "field_visit", "reasons", "requested_by", "requested_on", "supervisor_user"],
		order_by="requested_on desc",
		limit_page_length=max(limit * 3, 100),
	)

	to_approve = []
	my_pending = []
	for r in rows:
		fv_name = r.get("field_visit")
		if not fv_name or not frappe.db.exists("Field Visit", fv_name):
			continue
		fv = frappe.db.get_value(
			"Field Visit",
			fv_name,
			["name", "type", "visit_by", "visit_date", "school_name", "owner", "docstatus"],
			as_dict=True,
		) or {}
		if cint(fv.get("docstatus")) == 2:
			continue
		fake = frappe._dict({**fv, "field_visit": fv_name})
		can_appr = user_can_approve_field_visit(fake, user)
		mine = cstr(r.get("requested_by") or "") == user or cstr(fv.get("owner") or "") == user

		if can_appr and len(to_approve) < limit:
			to_approve.append(_approval_row(r, fv, can_approve=True, role="approver"))
		elif mine and not can_appr and len(my_pending) < limit:
			my_pending.append(_approval_row(r, fv, can_approve=False, role="requester"))
		elif mine and can_appr and len(my_pending) < limit:
			# Supervisor's own backdated entry shouldn't need them, but if pending show both
			pass

	# Field officer's own pending (always include even if they somehow can approve)
	if len(my_pending) < limit:
		for r in rows:
			if len(my_pending) >= limit:
				break
			fv_name = r.get("field_visit")
			if not fv_name:
				continue
			if any(x["name"] == fv_name for x in my_pending) or any(x["name"] == fv_name for x in to_approve):
				continue
			fv = frappe.db.get_value(
				"Field Visit",
				fv_name,
				["name", "type", "visit_by", "visit_date", "school_name", "owner", "docstatus"],
				as_dict=True,
			) or {}
			if cint(fv.get("docstatus")) == 2:
				continue
			mine = cstr(r.get("requested_by") or "") == user or cstr(fv.get("owner") or "") == user
			if mine:
				my_pending.append(_approval_row(r, fv, can_approve=False, role="requester"))

	return {
		"to_approve": to_approve,
		"my_pending": my_pending,
		"to_approve_count": len(to_approve),
		"my_pending_count": len(my_pending),
		"total_count": len(to_approve) + len(my_pending),
		"is_supervisor": bool(is_supervisor),
	}
