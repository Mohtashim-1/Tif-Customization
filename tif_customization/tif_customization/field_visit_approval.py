# Copyright (c) 2026, TIF Customization and contributors
# License: MIT
"""Supervisor approval rules for Field Visit (portal + desk).

Rules for field officers (supervisors / managers skip):
1. Backdated activity older than 72 hours → Pending Supervisor Approval
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

BACKDATE_HOURS = 72
SAME_SCHOOL_FREE_VISITS = 2
APPROVAL_DT = "Field Visit Approval Request"

# When a Field Supervisor (or any officer with no parent) needs approval,
# escalate to Shahid Khan instead of leaving supervisor_user blank / self.
ESCALATION_APPROVER_USER = "shahid.khan@tif.edu.pk"
ESCALATION_APPROVER_FULL_NAME = "Shahid Khan"


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


def _school_match_keys(school_name):
	"""Customer id + display name variants so visits match even if stored differently."""
	raw = cstr(school_name or "").strip()
	if not raw:
		return []
	keys = {raw}
	if frappe.db.exists("Customer", raw):
		keys.add(raw)
		cname = cstr(frappe.db.get_value("Customer", raw, "customer_name") or "").strip()
		if cname:
			keys.add(cname)
	else:
		# Look up by customer_name
		found = frappe.db.get_value("Customer", {"customer_name": raw}, "name")
		if found:
			keys.add(cstr(found))
			keys.add(raw)
	return [k for k in keys if k]


def count_same_school_visits_in_month(
	school_name,
	activity_date,
	visit_by=None,
	owner=None,
	exclude_name=None,
):
	"""Count this officer's non-cancelled visits to the same school in the calendar month.

	1st and 2nd are free; when this returns >= 2, the next visit is the 3rd+ and needs approval.
	"""
	keys = _school_match_keys(school_name)
	if not keys or not activity_date:
		return 0
	d = getdate(activity_date)
	month_start = get_first_day(d)
	month_end = get_last_day(d)
	params = {
		"from_date": month_start,
		"to_date": month_end,
		"keys": tuple(keys),
	}
	extra = ""
	# Prefer owner (portal user) — more reliable than free-text visit_by
	if owner:
		params["owner"] = cstr(owner).strip()
		extra += " AND fv.owner = %(owner)s"
	elif visit_by:
		params["visit_by"] = cstr(visit_by).strip()
		extra += " AND TRIM(IFNULL(fv.visit_by, '')) = %(visit_by)s"
	if exclude_name:
		params["exclude"] = exclude_name
		extra += " AND fv.name != %(exclude)s"

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
			AND (
				TRIM(IFNULL(fv.school_name, '')) IN %(keys)s
				OR TRIM(IFNULL(fv.me_school_name, '')) IN %(keys)s
				OR TRIM(IFNULL(fv.pending_school_name, '')) IN %(keys)s
			)
			AND COALESCE(fv.visit_date, fv.me_visit_date, fv.training_date, fv.mt_meeting_date, fv.ot_date)
				BETWEEN %(from_date)s AND %(to_date)s
			{reject_filter}
			{extra}
		""",
		params,
		as_dict=True,
	)
	return cint(row[0].cnt) if row else 0


def can_bypass_visit_approval_rules(user: str | None = None) -> bool:
	"""Only System Manager / full Field Visit viewers may skip approval rules.

	Field Supervisors (is_group) must still follow backdate + same-school limits
	when filing school visits themselves.
	"""
	user = user or frappe.session.user
	if user in ("Administrator",) or "System Manager" in frappe.get_roles(user):
		return True
	from tif_customization.tif_customization.field_visit_permissions import can_view_all_field_visits

	return bool(can_view_all_field_visits(user))


def evaluate_approval_requirements(
	*,
	doc_type,
	activity_date,
	school_name=None,
	visit_by=None,
	owner=None,
	exclude_name=None,
	force_skip=False,
):
	"""Apply backdate + same-school rules.

	Same school: 2 visits/month allowed for the officer; from the 3rd visit onward
	supervisor approval is required.
	"""
	reasons = []
	if force_skip:
		return {"needs_approval": False, "reasons": [], "same_school_count": 0, "visit_number": 0}

	if is_backdated_beyond_window(activity_date):
		reasons.append(
			_("Backdated entry older than {0} hours — supervisor approval required.").format(BACKDATE_HOURS)
		)

	same_count = 0
	visit_number = 0
	if (doc_type or "").strip() in SCHOOL_VISIT_TYPES and cstr(school_name or "").strip():
		same_count = count_same_school_visits_in_month(
			school_name,
			activity_date,
			visit_by=visit_by,
			owner=owner,
			exclude_name=exclude_name,
		)
		visit_number = same_count + 1  # this new visit
		if same_count >= SAME_SCHOOL_FREE_VISITS:
			reasons.append(
				_(
					"Same school: {0} visit(s) already this month. "
					"Only 2 visits per school per month are allowed without approval — "
					"this {1}th visit needs supervisor approval."
				).format(same_count, visit_number)
			)

	return {
		"needs_approval": bool(reasons),
		"reasons": reasons,
		"same_school_count": same_count,
		"visit_number": visit_number,
	}


def get_escalation_approver_user():
	"""Shahid Khan — approves supervisor-created / no-parent escalation visits."""
	uid = cstr(ESCALATION_APPROVER_USER).strip()
	if uid and frappe.db.exists("User", uid) and cint(frappe.db.get_value("User", uid, "enabled")):
		return uid
	found = frappe.db.get_value(
		"User",
		{"full_name": ESCALATION_APPROVER_FULL_NAME, "enabled": 1},
		"name",
	)
	return cstr(found or "").strip()


def _is_field_supervisor_user(user: str | None = None) -> bool:
	"""Active Field Officer marked is_group, or parent of other active officers."""
	user = cstr(user or frappe.session.user).strip()
	if not user or not frappe.db.exists("DocType", "Field Officer"):
		return False
	fo = frappe.db.get_value(
		"Field Officer",
		{"user": user, "status": "Active"},
		["name", "is_group"],
		as_dict=True,
	)
	if not fo:
		return False
	if cint(fo.get("is_group")):
		return True
	return bool(
		frappe.db.count(
			"Field Officer",
			{"parent_field_officer": fo.name, "status": "Active"},
		)
	)


def get_supervisor_user_for_employee(employee=None, user=None):
	"""Return the User who should approve this officer's pending visits.

	Normal FO → parent Field Officer's user.
	Supervisor (no parent) / missing parent / would self-approve → Shahid Khan.
	"""
	user = cstr(user or frappe.session.user).strip()
	emp = cstr(employee or "").strip()
	fo = None
	if emp and frappe.db.exists("DocType", "Field Officer"):
		fo = frappe.db.get_value(
			"Field Officer",
			{"employee": emp, "status": "Active"},
			["name", "parent_field_officer", "user", "is_group"],
			as_dict=True,
		)
	if not fo and frappe.db.exists("DocType", "Field Officer"):
		fo = frappe.db.get_value(
			"Field Officer",
			{"user": user, "status": "Active"},
			["name", "parent_field_officer", "user", "is_group"],
			as_dict=True,
		)

	parent = cstr((fo or {}).get("parent_field_officer") or "").strip()
	sup = ""
	if parent:
		sup = cstr(frappe.db.get_value("Field Officer", parent, "user") or "").strip()

	requester = user
	fo_user = cstr((fo or {}).get("user") or "").strip() or requester
	needs_escalation = (
		not sup
		or sup == requester
		or sup == fo_user
		or _is_field_supervisor_user(requester)
		or cint((fo or {}).get("is_group") or 0)
	)
	if needs_escalation:
		escalation = get_escalation_approver_user()
		# Never assign approval to the same person who created the visit
		if escalation and escalation not in (requester, fo_user):
			return escalation
		# If Shahid somehow is the requester, leave empty (System Manager can still approve)
		return escalation if escalation != requester else ""

	return sup


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
		owner=frappe.session.user,
		force_skip=can_bypass_visit_approval_rules(),
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
	remarks_text = cstr(remarks or "").strip()
	if not remarks_text:
		frappe.throw(_("Please add Supervisor Remarks explaining why you are approving this visit."))
	req.status = "Approved"
	req.decided_by = frappe.session.user
	req.decided_on = now_datetime()
	req.approver_remarks = remarks_text
	req.save(ignore_permissions=True)
	submitted = False
	if cint(submit) and cint(doc.docstatus) == 0:
		doc.reload()
		# Already approved — do not re-block on same-school/backdate gate
		doc.flags.skip_visit_approval_gate = True
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
	remarks_text = cstr(remarks or "").strip()
	if not remarks_text:
		frappe.throw(_("Please add Supervisor Remarks explaining why you are rejecting this visit."))
	req.status = "Rejected"
	req.decided_by = frappe.session.user
	req.decided_on = now_datetime()
	req.approver_remarks = remarks_text
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

	escalation_user = get_escalation_approver_user()
	is_supervisor = (
		can_manage_supervisor_only_field_visits(user)
		or can_view_all_field_visits(user)
		or (escalation_user and user == escalation_user)
	)
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
