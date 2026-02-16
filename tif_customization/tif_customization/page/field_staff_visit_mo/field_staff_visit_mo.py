import json

import frappe
from frappe.utils import add_months, get_first_day, get_last_day, getdate


@frappe.whitelist()
def get_report_data(filters=None):
    """Return monthly Field Staff Visit report data."""
    try:
        if isinstance(filters, str):
            filters = json.loads(filters)
        elif not filters:
            filters = {}

        month = int(filters.get("month") or 0) or getdate().month
        year = int(filters.get("year") or 0) or getdate().year
        user = (filters.get("user") or "").strip() or None

        from_date = get_first_day(f"{year}-{month:02d}-01")
        to_date = get_last_day(from_date)

        marketing = _get_marketing_visits(from_date, to_date, user)
        me_visits = _get_me_visits(from_date, to_date, user)
        training = _get_training_sessions(from_date, to_date, user)

        return {
            "month": month,
            "year": year,
            "from_date": str(from_date),
            "to_date": str(to_date),
            "user": user,
            "marketing": marketing,
            "me": me_visits,
            "training": training,
        }
    except Exception as e:
        frappe.log_error(f"Error in get_report_data: {str(e)}", "Field Staff Visit Report")
        return {"error": str(e)}


def _get_marketing_visits(from_date, to_date, user=None):
    rows = frappe.db.sql(
        """
        SELECT
            COALESCE(province, 'Not Set') AS province,
            COALESCE(marketing_visit_category, 'Unspecified') AS category,
            COUNT(*) AS cnt
        FROM `tabField Visit`
        WHERE docstatus < 2
        AND type = 'Marketing'
        AND COALESCE(visit_date, DATE(timestamp)) BETWEEN %(from_date)s AND %(to_date)s
        AND (%(user)s IS NULL OR %(user)s = '' OR COALESCE(visit_by, owner) = %(user)s)
        GROUP BY COALESCE(province, 'Not Set'), COALESCE(marketing_visit_category, 'Unspecified')
        """,
        {"from_date": from_date, "to_date": to_date, "user": user},
        as_dict=True,
    )

    provinces = {}
    for row in rows:
        province = row.get("province")
        category = row.get("category")
        provinces.setdefault(
            province,
            {
                "province": province,
                "new": 0,
                "followup": 0,
                "tps": 0,
                "total": 0,
            },
        )
        if category == "New":
            provinces[province]["new"] += row.get("cnt", 0)
        elif category == "Followup & Other Visits":
            provinces[province]["followup"] += row.get("cnt", 0)
        elif category == "TPS Visits":
            provinces[province]["tps"] += row.get("cnt", 0)

    totals = {"new": 0, "followup": 0, "tps": 0, "total": 0}
    result_rows = []
    for province in sorted(provinces.keys()):
        row = provinces[province]
        row["total"] = row["new"] + row["followup"] + row["tps"]
        totals["new"] += row["new"]
        totals["followup"] += row["followup"]
        totals["tps"] += row["tps"]
        totals["total"] += row["total"]
        result_rows.append(row)

    return {"rows": result_rows, "totals": totals}


def _get_me_visits(from_date, to_date, user=None):
    rows = frappe.db.sql(
        """
        SELECT
            COALESCE(me_province, 'Not Set') AS province,
            COALESCE(me_activity_status, 'Unspecified') AS status,
            COUNT(*) AS cnt
        FROM `tabField Visit`
        WHERE docstatus < 2
        AND type = 'M&E'
        AND COALESCE(me_visit_date, me_starting_date, DATE(me_timestamp)) BETWEEN %(from_date)s AND %(to_date)s
        AND (%(user)s IS NULL OR %(user)s = '' OR COALESCE(me_visit_by, owner) = %(user)s)
        GROUP BY COALESCE(me_province, 'Not Set'), COALESCE(me_activity_status, 'Unspecified')
        """,
        {"from_date": from_date, "to_date": to_date, "user": user},
        as_dict=True,
    )

    provinces = {}
    for row in rows:
        province = row.get("province")
        status = row.get("status")
        provinces.setdefault(
            province,
            {"province": province, "active": 0, "inactive": 0, "total": 0},
        )
        if status == "Active":
            provinces[province]["active"] += row.get("cnt", 0)
        elif status == "Inactive":
            provinces[province]["inactive"] += row.get("cnt", 0)

    totals = {"active": 0, "inactive": 0, "total": 0}
    result_rows = []
    for province in sorted(provinces.keys()):
        row = provinces[province]
        row["total"] = row["active"] + row["inactive"]
        totals["active"] += row["active"]
        totals["inactive"] += row["inactive"]
        totals["total"] += row["total"]
        result_rows.append(row)

    return {"rows": result_rows, "totals": totals}


def _get_training_sessions(from_date, to_date, user=None):
    rows = frappe.db.sql(
        """
        SELECT
            COALESCE(training_province, 'Not Set') AS province,
            COALESCE(SUM(training_no_of_schools_attended), 0) AS schools,
            COALESCE(SUM(training_no_of_participants), 0) AS participants
        FROM `tabField Visit`
        WHERE docstatus < 2
        AND type = 'Training'
        AND COALESCE(training_date, DATE(training_timestamp)) BETWEEN %(from_date)s AND %(to_date)s
        AND (%(user)s IS NULL OR %(user)s = '' OR COALESCE(training_entry_filled_by, owner) = %(user)s)
        GROUP BY COALESCE(training_province, 'Not Set')
        """,
        {"from_date": from_date, "to_date": to_date, "user": user},
        as_dict=True,
    )

    totals = {"schools": 0, "participants": 0}
    result_rows = []
    for row in rows:
        totals["schools"] += row.get("schools", 0)
        totals["participants"] += row.get("participants", 0)
        result_rows.append(row)

    result_rows = sorted(result_rows, key=lambda r: r.get("province") or "")
    return {"rows": result_rows, "totals": totals}
