import frappe
from frappe.utils import flt


@frappe.whitelist()
def get_school_analytics(school):
	try:
		if not school:
			return {"error": "School is required"}

		doc = frappe.db.get_value(
			"School",
			school,
			[
				"name",
				"school_name",
				"status",
				"territory",
				"city",
				"school_type",
				"books",
				"trainings",
				"tps",
				"qps",
				"cee",
				"no_of_students",
				"total_no_of_quranic_teachers",
			],
			as_dict=True,
		)
		if not doc:
			return {"error": "Invalid School"}

		school_name = doc.get("school_name")
		issued_map = _get_issued_books_map(school_name)
		required_map = _get_required_books_map(school)

		book_status = []
		for book_type in ["QAIDA", "GUIDE", "MQH"]:
			required = flt(required_map.get(book_type, 0))
			issued = flt(issued_map.get(book_type, 0))
			remaining = max(required - issued, 0)

			status = "Complete" if remaining <= 0 and required > 0 else "Pending"
			if required == 0 and issued > 0:
				status = "Issued"
			if required == 0 and issued == 0:
				status = "Pending"

			book_status.append(
				{
					"book_type": book_type,
					"required": required,
					"issued": issued,
					"remaining": remaining,
					"status": status,
				}
			)

		completion = _get_profile_completion(doc)
		monthly = _get_monthly_dispatch(school_name)

		total_required = sum(d["required"] for d in book_status)
		total_issued = sum(d["issued"] for d in book_status)
		total_remaining = sum(d["remaining"] for d in book_status)

		return {
			"school_details": doc,
			"kpis": {
				"students": flt(doc.get("no_of_students") or 0),
				"quranic_teachers": flt(doc.get("total_no_of_quranic_teachers") or 0),
				"total_required_books": total_required,
				"total_issued_books": total_issued,
				"total_remaining_books": total_remaining,
				"profile_completion": completion["percent"],
			},
			"completion": completion,
			"book_status": book_status,
			"charts": {
				"books": _build_books_chart(book_status),
				"completion": _build_completion_chart(completion),
				"monthly": _build_monthly_chart(monthly),
			},
		}
	except Exception as exc:
		frappe.log_error(frappe.get_traceback(), "School Analytics Error")
		return {"error": str(exc)}


def _get_issued_books_map(school_name):
	if not school_name:
		return {"QAIDA": 0, "GUIDE": 0, "MQH": 0}

	row = frappe.db.sql(
		"""
		SELECT
			SUM(
				CASE
					WHEN UPPER(COALESCE(dni.item_name, '')) LIKE '%%QAIDA%%'
						OR UPPER(COALESCE(dni.item_code, '')) LIKE '%%QAIDA%%'
					THEN COALESCE(dni.qty, 0) ELSE 0
				END
			) AS qaida_issued,
			SUM(
				CASE
					WHEN UPPER(COALESCE(dni.item_name, '')) LIKE '%%GUIDE%%'
						OR UPPER(COALESCE(dni.item_code, '')) LIKE '%%GUIDE%%'
					THEN COALESCE(dni.qty, 0) ELSE 0
				END
			) AS guide_issued,
			SUM(
				CASE
					WHEN UPPER(COALESCE(dni.item_name, '')) LIKE '%%MQH%%'
						OR UPPER(COALESCE(dni.item_code, '')) LIKE '%%MQH%%'
					THEN COALESCE(dni.qty, 0) ELSE 0
				END
			) AS mqh_issued
		FROM `tabDelivery Note` dn
		INNER JOIN `tabDelivery Note Item` dni ON dni.parent = dn.name
		WHERE dn.docstatus = 1
			AND IFNULL(dn.is_return, 0) = 0
			AND dn.customer_name = %(school_name)s
		""",
		{"school_name": school_name},
		as_dict=True,
	)

	first = (row and row[0]) or {}
	return {
		"QAIDA": flt(first.get("qaida_issued") or 0),
		"GUIDE": flt(first.get("guide_issued") or 0),
		"MQH": flt(first.get("mqh_issued") or 0),
	}


def _get_required_books_map(school):
	parent = frappe.db.get_value(
		"School",
		school,
		["no_of_students", "total_no_of_quranic_teachers"],
		as_dict=True,
	)
	students = flt((parent or {}).get("no_of_students") or 0)
	teachers = flt((parent or {}).get("total_no_of_quranic_teachers") or 0)

	curriculum_total = frappe.db.sql(
		"""
		SELECT SUM(no_of_student) AS total_students
		FROM `tabSchool Books Curriculum`
		WHERE parent = %(school)s
		""",
		{"school": school},
		as_dict=True,
	)[0]["total_students"]

	mqh_required = flt(curriculum_total or 0) or students

	return {"QAIDA": students, "GUIDE": teachers, "MQH": mqh_required}


def _get_profile_completion(doc):
	# Core profile fields that should ideally be filled for complete school profiling.
	fields = {
		"School Name": doc.get("school_name"),
		"Status": doc.get("status"),
		"Territory": doc.get("territory"),
		"City": doc.get("city"),
		"School Type": doc.get("school_type"),
		"Students": doc.get("no_of_students"),
		"Quranic Teachers": doc.get("total_no_of_quranic_teachers"),
		"Books": doc.get("books"),
		"Trainings": doc.get("trainings"),
		"TPS": doc.get("tps"),
		"QPS": doc.get("qps"),
		"CEE": doc.get("cee"),
	}

	done, remaining = [], []
	for label, value in fields.items():
		if value in [None, "", 0]:
			remaining.append(label)
		else:
			done.append(label)

	total = len(fields) or 1
	percent = round((len(done) / total) * 100, 1)

	return {
		"done_count": len(done),
		"total_count": total,
		"percent": percent,
		"remaining_fields": remaining,
	}


def _get_monthly_dispatch(school_name):
	if not school_name:
		return []

	rows = frappe.db.sql(
		"""
		SELECT
			DATE_FORMAT(dn.posting_date, '%%Y-%%m') AS month_key,
			SUM(
				CASE
					WHEN UPPER(COALESCE(dni.item_name, '')) LIKE '%%MQH%%'
						OR UPPER(COALESCE(dni.item_code, '')) LIKE '%%MQH%%'
					THEN COALESCE(dni.qty, 0) ELSE 0
				END
			) AS mqh_qty,
			SUM(
				CASE
					WHEN UPPER(COALESCE(dni.item_name, '')) LIKE '%%QAIDA%%'
						OR UPPER(COALESCE(dni.item_code, '')) LIKE '%%QAIDA%%'
						OR UPPER(COALESCE(dni.item_name, '')) LIKE '%%GUIDE%%'
						OR UPPER(COALESCE(dni.item_code, '')) LIKE '%%GUIDE%%'
					THEN COALESCE(dni.qty, 0) ELSE 0
				END
			) AS qaida_guide_qty
		FROM `tabDelivery Note` dn
		INNER JOIN `tabDelivery Note Item` dni ON dni.parent = dn.name
		WHERE dn.docstatus = 1
			AND IFNULL(dn.is_return, 0) = 0
			AND dn.customer_name = %(school_name)s
			AND dn.posting_date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
		GROUP BY DATE_FORMAT(dn.posting_date, '%%Y-%%m')
		ORDER BY month_key
		""",
		{"school_name": school_name},
		as_dict=True,
	)
	return rows


def _build_books_chart(book_status):
	labels = [d["book_type"] for d in book_status]
	issued = [d["issued"] for d in book_status]
	remaining = [d["remaining"] for d in book_status]

	return {
		"labels": labels,
		"datasets": [
			{"label": "Issued", "data": issued, "backgroundColor": "#198754"},
			{"label": "Remaining", "data": remaining, "backgroundColor": "#dc3545"},
		],
	}


def _build_completion_chart(completion):
	done = completion.get("done_count", 0)
	total = completion.get("total_count", 0)
	pending = max(total - done, 0)
	return {
		"labels": ["Completed", "Pending"],
		"datasets": [
			{
				"data": [done, pending],
				"backgroundColor": ["#0d6efd", "#ced4da"],
			}
		],
	}


def _build_monthly_chart(rows):
	labels = [r.get("month_key") for r in rows]
	mqh = [flt(r.get("mqh_qty") or 0) for r in rows]
	qaida_guide = [flt(r.get("qaida_guide_qty") or 0) for r in rows]

	return {
		"labels": labels,
		"datasets": [
			{
				"label": "MQH Dispatch",
				"data": mqh,
				"borderColor": "#0d6efd",
				"backgroundColor": "rgba(13,110,253,0.2)",
				"fill": False,
			},
			{
				"label": "Qaida/Guide Dispatch",
				"data": qaida_guide,
				"borderColor": "#20c997",
				"backgroundColor": "rgba(32,201,151,0.2)",
				"fill": False,
			},
		],
	}
