import frappe
from frappe import _
from frappe.exceptions import PermissionError
from frappe.utils import cint, flt, nowdate


@frappe.whitelist()
def get_dashboard_data(
    school=None,
    school_name=None,
    status=None,
    field_officer_name=None,
    tps=None,
    qps=None,
    cee=None,
    workshop_status=None,
    include_upcoming_trainings=0,
):
    """Return KPI and school-wise data for School Dashboard."""
    try:
        include_upcoming_trainings = cint(include_upcoming_trainings)
        filters = {"docstatus": ["<", 2]}
        if school:
            filters["name"] = school
        if school_name:
            filters["school_name"] = ["like", f"%{school_name.strip()}%"]
        if status:
            normalized_status = _normalize_school_status(status)
            if normalized_status:
                filters["status"] = ["in", _status_filter_values(normalized_status)]
        if field_officer_name:
            matched_users = _get_users_matching(field_officer_name)
            if not matched_users:
                return {
                    "kpis": _empty_kpis(include_upcoming_trainings),
                    "rows": [],
                    "upcoming_trainings": _get_upcoming_trainings() if include_upcoming_trainings else [],
                }
            filters["field_officer"] = ["in", matched_users]
        if tps:
            filters["tps"] = (
                "TPS is associated with this school" if tps == "Yes" else ["!=", "TPS is associated with this school"]
            )
        if qps:
            filters["qps"] = (
                "QPS is associated with this school" if qps == "Yes" else ["!=", "QPS is associated with this school"]
            )
        if cee:
            filters["cee"] = (
                "CEE is associated with this school" if cee == "Yes" else ["!=", "CEE is associated with this school"]
            )

        rows = _get_school_rows(filters)
        if workshop_status:
            rows = [r for r in rows if (r.get("workshop_status") or "") == workshop_status]

        total_schools = len(rows)

        status_counts = {
            "Active": 0,
            "Inactive": 0,
            "Closed": 0,
            "In Process": 0,
            "Not Interested": 0,
            "Direct Requirement Received": 0,
            "Other": 0,
        }
        for r in rows:
            normalized = _normalize_school_status(r.get("status"))
            r["status_display"] = normalized
            if normalized in status_counts:
                status_counts[normalized] += 1
            else:
                status_counts["Other"] += 1

        active_schools = status_counts.get("Active", 0)
        tps_schools = sum(1 for r in rows if r.get("tps") == "TPS is associated with this school")
        qps_schools = sum(1 for r in rows if r.get("qps") == "QPS is associated with this school")
        cee_schools = sum(1 for r in rows if r.get("cee") == "CEE is associated with this school")

        qaida_guide_dispatch = sum(flt(r.get("qaida_guide_dispatch", 0)) for r in rows)
        mqh_dispatch = sum(flt(r.get("mqh_dispatch", 0)) for r in rows)
        in_process = sum(1 for r in rows if r.get("workshop_status") == "In Process")
        not_interested = sum(1 for r in rows if r.get("workshop_status") == "Not Interested")

        upcoming_trainings = []
        upcoming_trainings_count = None
        if include_upcoming_trainings:
            upcoming_trainings = _get_upcoming_trainings()
            upcoming_trainings_count = frappe.db.count(
                "Field Visit",
                {
                    "docstatus": ["<", 2],
                    "type": "Training",
                    "training_date": [">=", nowdate()],
                },
            )

        kpis = {
            "total_schools": total_schools,
            "active_schools": active_schools,
            "inactive_schools": status_counts.get("Inactive", 0),
            "closed_schools": status_counts.get("Closed", 0),
            "in_process_schools": status_counts.get("In Process", 0),
            "not_interested_schools": status_counts.get("Not Interested", 0),
            "direct_requirement_received_schools": status_counts.get("Direct Requirement Received", 0),
            "tps_schools": tps_schools,
            "qps_schools": qps_schools,
            "cee_schools": cee_schools,
            "qaida_guide_dispatch": qaida_guide_dispatch,
            "mqh_dispatch": mqh_dispatch,
            "workshop_in_process": in_process,
            "workshop_not_interested": not_interested,
        }
        if include_upcoming_trainings:
            kpis["upcoming_trainings"] = upcoming_trainings_count or 0

        return {"kpis": kpis, "rows": rows, "upcoming_trainings": upcoming_trainings}
    except Exception as exc:
        frappe.log_error(frappe.get_traceback(), "School Dashboard Error")
        return {"error": str(exc), "kpis": {}, "rows": []}


def _get_school_rows(filters):
    school_docs = frappe.get_all(
        "School",
        fields=[
            "name",
            "school_name",
            "status",
            "remarks",
            "field_officer",
            "tps",
            "qps",
            "cee",
            "books",
            "trainings",
            "training_type_allowed",
        ],
        filters=filters,
        limit_page_length=0,
    )

    if not school_docs:
        return []

    school_docnames = [d.get("name") for d in school_docs if d.get("name")]
    school_names = [d.get("school_name") for d in school_docs if d.get("school_name")]
    dispatch_map = _get_dispatch_map(school_names)
    visit_status_map = _get_latest_marketing_status_map(school_names)
    latest_remark_map = _get_latest_remark_map(school_docnames)
    field_officer_name_map = _get_user_full_name_map(
        list({d.get("field_officer") for d in school_docs if d.get("field_officer")})
    )

    rows = []
    for doc in school_docs:
        school_name = doc.get("school_name")
        dispatch = dispatch_map.get(school_name, {})
        visit_status = visit_status_map.get(school_name, "")
        workshop_status = _map_workshop_status(visit_status)
        workshop_training = (
            doc.get("trainings")
            or doc.get("training_type_allowed")
            or _("Not Set")
        )
        latest_remark = latest_remark_map.get(doc.get("name")) or doc.get("remarks")

        services = "-"
        if _normalize_school_status(doc.get("status")) == "Active":
            service_bits = []
            if (doc.get("books") or "").strip():
                service_bits.append("Books")
            if (doc.get("trainings") or "").strip() or (doc.get("training_type_allowed") or "").strip():
                service_bits.append("Trainings")
            if workshop_status in {"Agreed", "In Process"}:
                service_bits.append("Workshops")
            if service_bits:
                services = ", ".join(service_bits)

        rows.append(
            {
                "school": doc.get("name"),
                "school_name": school_name,
                "status": doc.get("status"),
                "latest_remark": latest_remark,
                "field_officer": doc.get("field_officer"),
                "field_officer_name": field_officer_name_map.get(doc.get("field_officer")) or "",
                "tps": doc.get("tps"),
                "qps": doc.get("qps"),
                "cee": doc.get("cee"),
                "qaida_guide_dispatch": flt(dispatch.get("qaida_guide_dispatch", 0)),
                "mqh_dispatch": flt(dispatch.get("mqh_dispatch", 0)),
                "workshop_training": workshop_training,
                "workshop_status": workshop_status,
                "services": services,
            }
        )

    return rows


def _get_dispatch_map(school_names):
    if not school_names:
        return {}

    rows = frappe.db.sql(
        """
        SELECT
            dn.customer_name AS school_name,
            SUM(
                CASE
                    WHEN UPPER(COALESCE(dni.item_name, '')) LIKE '%%QAIDA%%'
                        OR UPPER(COALESCE(dni.item_code, '')) LIKE '%%QAIDA%%'
                        OR UPPER(COALESCE(dni.item_name, '')) LIKE '%%GUIDE%%'
                        OR UPPER(COALESCE(dni.item_code, '')) LIKE '%%GUIDE%%'
                    THEN COALESCE(dni.qty, 0)
                    ELSE 0
                END
            ) AS qaida_guide_dispatch,
            SUM(
                CASE
                    WHEN UPPER(COALESCE(dni.item_name, '')) LIKE '%%MQH%%'
                        OR UPPER(COALESCE(dni.item_code, '')) LIKE '%%MQH%%'
                    THEN COALESCE(dni.qty, 0)
                    ELSE 0
                END
            ) AS mqh_dispatch
        FROM `tabDelivery Note` dn
        INNER JOIN `tabDelivery Note Item` dni ON dni.parent = dn.name
        WHERE dn.docstatus = 1
          AND IFNULL(dn.is_return, 0) = 0
          AND dn.customer_name IN %(school_names)s
        GROUP BY dn.customer_name
        """,
        {"school_names": tuple(school_names)},
        as_dict=True,
    )

    return {r.get("school_name"): r for r in rows}


def _get_latest_marketing_status_map(school_names):
    if not school_names:
        return {}

    rows = frappe.db.sql(
        """
        SELECT fv.school_name, fv.status
        FROM `tabField Visit` fv
        INNER JOIN (
            SELECT school_name, MAX(modified) AS last_modified
            FROM `tabField Visit`
            WHERE docstatus < 2
              AND type = 'Marketing'
              AND IFNULL(school_name, '') != ''
              AND school_name IN %(school_names)s
            GROUP BY school_name
        ) latest
            ON latest.school_name = fv.school_name
            AND latest.last_modified = fv.modified
        WHERE fv.docstatus < 2
          AND fv.type = 'Marketing'
        """,
        {"school_names": tuple(school_names)},
        as_dict=True,
    )
    return {r.get("school_name"): r.get("status") for r in rows}


def _map_workshop_status(marketing_status):
    status = (marketing_status or "").strip().lower()
    if status == "pending":
        return "In Process"
    if status == "not agreed":
        return "Not Interested"
    if status == "agreed":
        return "Agreed"
    return "Unknown"


def _is_active_status(status):
    return (status or "").strip().upper() == "ACTIVE"


def _title_case_status(status):
    if status == "NOT INTERESTED":
        return "Not Interested"
    return status.title()


def _normalize_school_status(status):
    value = (status or "").strip()
    if not value:
        return ""
    upper = value.upper()
    if upper in {"PENDING", "IN PROCESS"}:
        return "In Process"
    if upper in {"NOT INTERESTED", "NOT-INTERESTED"}:
        return "Not Interested"
    if upper in {"DIRECT REQUIREMENT RECEIVED", "DIRECT_REQUIREMENT_RECEIVED"}:
        return "Direct Requirement Received"
    if upper == "ACTIVE":
        return "Active"
    if upper == "INACTIVE":
        return "Inactive"
    if upper == "CLOSED":
        return "Closed"
    return value


def _status_filter_values(normalized_status):
    # Keep backward-compatibility with older values stored in DB (e.g. "Pending")
    if normalized_status == "In Process":
        return ["In Process", "Pending"]
    return [normalized_status]


def _get_users_matching(field_officer_name):
    term = (field_officer_name or "").strip()
    if not term:
        return []
    term_like = f"%{term}%"
    users = frappe.get_all(
        "User",
        filters={
            "enabled": 1,
            "name": ["not in", ["Administrator", "Guest"]],
            "full_name": ["like", term_like],
        },
        pluck="name",
        limit_page_length=200,
    )
    if users:
        return users

    # fallback: match by user id/email-like value
    return frappe.get_all(
        "User",
        filters={
            "enabled": 1,
            "name": ["not in", ["Administrator", "Guest"]],
            "name": ["like", term_like],
        },
        pluck="name",
        limit_page_length=200,
    )


def _get_user_full_name_map(user_ids):
    user_ids = [u for u in (user_ids or []) if u]
    if not user_ids:
        return {}
    rows = frappe.get_all("User", filters={"name": ["in", user_ids]}, fields=["name", "full_name"], limit_page_length=0)
    return {r.get("name"): (r.get("full_name") or "") for r in rows}


def _get_latest_remark_map(school_docnames):
    school_docnames = [s for s in (school_docnames or []) if s]
    if not school_docnames:
        return {}

    rows = frappe.db.sql(
        """
        SELECT reference_name AS school, content, creation
        FROM `tabComment`
        WHERE comment_type = 'Comment'
          AND reference_doctype = 'School'
          AND reference_name IN %(schools)s
        ORDER BY creation DESC
        """,
        {"schools": tuple(school_docnames)},
        as_dict=True,
    )

    latest = {}
    for r in rows:
        school = r.get("school")
        if school and school not in latest:
            latest[school] = frappe.utils.strip_html(r.get("content") or "").strip()
    return latest


def _get_upcoming_trainings():
    return frappe.get_all(
        "Field Visit",
        filters={
            "docstatus": ["<", 2],
            "type": "Training",
            "training_date": [">=", nowdate()],
        },
        fields=[
            "name",
            "training_date",
            "training_city",
            "training_province",
            "training_venue_name",
            "training_session_category",
            "training_trainer_name",
            "training_no_of_participants",
            "training_no_of_schools_attended",
        ],
        order_by="training_date asc, modified desc",
        limit_page_length=50,
    )


def _empty_kpis(include_upcoming_trainings):
    base = {
        "total_schools": 0,
        "active_schools": 0,
        "inactive_schools": 0,
        "closed_schools": 0,
        "in_process_schools": 0,
        "not_interested_schools": 0,
        "direct_requirement_received_schools": 0,
        "tps_schools": 0,
        "qps_schools": 0,
        "cee_schools": 0,
        "qaida_guide_dispatch": 0,
        "mqh_dispatch": 0,
        "workshop_in_process": 0,
        "workshop_not_interested": 0,
        "upcoming_trainings": 0,
    }
    if not cint(include_upcoming_trainings):
        base.pop("upcoming_trainings", None)
    return base


@frappe.whitelist()
def get_school_remarks(school):
    school = (school or "").strip()
    if not school:
        return []
    if not frappe.has_permission("School", ptype="read", doc=school):
        frappe.throw(_("Not permitted"), PermissionError)

    rows = frappe.db.sql(
        """
        SELECT name, owner, creation, content
        FROM `tabComment`
        WHERE comment_type = 'Comment'
          AND reference_doctype = 'School'
          AND reference_name = %(school)s
        ORDER BY creation DESC
        LIMIT 200
        """,
        {"school": school},
        as_dict=True,
    )
    for r in rows:
        r["content"] = frappe.utils.strip_html(r.get("content") or "").strip()
    return rows


@frappe.whitelist()
def add_school_remark(school, remark):
    school = (school or "").strip()
    remark = (remark or "").strip()
    if not school:
        frappe.throw(_("School is required"))
    if not remark:
        frappe.throw(_("Remark is required"))
    if not frappe.has_permission("School", ptype="read", doc=school):
        frappe.throw(_("Not permitted"), PermissionError)

    doc = frappe.get_doc("School", school)
    doc.add_comment("Comment", text=remark)
    return {"ok": True}
