import frappe
from frappe import _
from frappe.utils import flt


@frappe.whitelist()
def get_dashboard_data(
    school=None, status=None, tps=None, qps=None, cee=None, workshop_status=None
):
    """Return KPI and school-wise data for School Dashboard."""
    try:
        filters = {"docstatus": ["<", 2]}
        if school:
            filters["name"] = school
        if status:
            filters["status"] = status
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
        active_schools = sum(1 for r in rows if r.get("status") == "ACTIVE")
        tps_schools = sum(1 for r in rows if r.get("tps") == "TPS is associated with this school")
        qps_schools = sum(1 for r in rows if r.get("qps") == "QPS is associated with this school")
        cee_schools = sum(1 for r in rows if r.get("cee") == "CEE is associated with this school")

        qaida_guide_dispatch = sum(flt(r.get("qaida_guide_dispatch", 0)) for r in rows)
        mqh_dispatch = sum(flt(r.get("mqh_dispatch", 0)) for r in rows)
        in_process = sum(1 for r in rows if r.get("workshop_status") == "In Process")
        not_interested = sum(1 for r in rows if r.get("workshop_status") == "Not Interested")

        return {
            "kpis": {
                "total_schools": total_schools,
                "active_schools": active_schools,
                "tps_schools": tps_schools,
                "qps_schools": qps_schools,
                "cee_schools": cee_schools,
                "qaida_guide_dispatch": qaida_guide_dispatch,
                "mqh_dispatch": mqh_dispatch,
                "workshop_in_process": in_process,
                "workshop_not_interested": not_interested,
            },
            "rows": rows,
        }
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
            "tps",
            "qps",
            "cee",
            "trainings",
            "training_type_allowed",
        ],
        filters=filters,
        limit_page_length=0,
    )

    if not school_docs:
        return []

    school_names = [d.get("school_name") for d in school_docs if d.get("school_name")]
    dispatch_map = _get_dispatch_map(school_names)
    visit_status_map = _get_latest_marketing_status_map(school_names)

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

        rows.append(
            {
                "school": doc.get("name"),
                "school_name": school_name,
                "status": doc.get("status"),
                "tps": doc.get("tps"),
                "qps": doc.get("qps"),
                "cee": doc.get("cee"),
                "qaida_guide_dispatch": flt(dispatch.get("qaida_guide_dispatch", 0)),
                "mqh_dispatch": flt(dispatch.get("mqh_dispatch", 0)),
                "workshop_training": workshop_training,
                "workshop_status": workshop_status,
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
