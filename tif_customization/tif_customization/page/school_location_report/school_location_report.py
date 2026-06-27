import json

import frappe
from frappe.utils import cint


PROGRAMS = ("tps", "qps", "cee")
PROGRAM_LABELS = {"tps": "TPS", "qps": "QPS", "cee": "CEE"}
STATUSES = ("Active", "In Active", "No")


@frappe.whitelist()
def get_report_data(filters=None):
	if isinstance(filters, str):
		filters = json.loads(filters or "{}")
	filters = filters or {}

	rows = _get_school_rows(filters)
	filter_options = _get_filter_options()

	return {
		"filters": filters,
		"filter_options": filter_options,
		"summary": _get_summary(rows),
		"province_summary": _group_location_summary(rows, "province"),
		"province_simple": _simple_location_summary(rows, "province"),
		"department_summary": _department_summary(rows),
		"karachi_summary": _department_summary([row for row in rows if _norm(row.get("city")) == "karachi"]),
		"city_summary": _simple_location_summary(rows, "city"),
		"school_details": _school_details(rows),
	}


def _get_school_rows(filters):
	conditions = []
	values = {}

	if filters.get("province"):
		conditions.append("LOWER(COALESCE(province, '')) = LOWER(%(province)s)")
		values["province"] = filters.get("province")
	if filters.get("city"):
		conditions.append("COALESCE(city, '') = %(city)s")
		values["city"] = filters.get("city")
	if filters.get("program") in PROGRAMS:
		program = filters.get("program")
		if filters.get("program_status"):
			conditions.append(f"COALESCE({program}, '') = %(program_status)s")
			values["program_status"] = filters.get("program_status")
		else:
			conditions.append(f"COALESCE({program}, '') != ''")
	elif filters.get("program_status"):
		conditions.append(
			"("
			+ " OR ".join(f"COALESCE({program}, '') = %(program_status)s" for program in PROGRAMS)
			+ ")"
		)
		values["program_status"] = filters.get("program_status")

	if filters.get("school_status"):
		conditions.append("COALESCE(status, '') = %(school_status)s")
		values["school_status"] = filters.get("school_status")
	if filters.get("school_type"):
		conditions.append("COALESCE(school_type, '') = %(school_type)s")
		values["school_type"] = filters.get("school_type")
	if filters.get("search"):
		conditions.append(
			"""(
				name LIKE %(search)s
				OR school_name LIKE %(search)s
				OR city LIKE %(search)s
				OR province LIKE %(search)s
				OR complete_school_address LIKE %(search)s
			)"""
		)
		values["search"] = f"%{filters.get('search')}%"

	where = " AND ".join(conditions)
	if where:
		where = "WHERE " + where

	return frappe.db.sql(
		f"""
		SELECT
			name,
			school_name,
			school_type,
			type_of_school,
			category,
			status,
			province,
			city,
			tps,
			qps,
			cee,
			no_of_students,
			no_of_school,
			complete_school_address
		FROM `tabSchool`
		{where}
		ORDER BY COALESCE(province, ''), COALESCE(city, ''), school_name
		""",
		values,
		as_dict=True,
	)


def _get_filter_options():
	rows = frappe.db.sql(
		"""
		SELECT DISTINCT province, city, school_type, status
		FROM `tabSchool`
		ORDER BY province, city, school_type, status
		""",
		as_dict=True,
	)
	return {
		"provinces": sorted({_display_province(row.province) for row in rows if row.province}),
		"cities": sorted({row.city for row in rows if row.city}),
		"school_types": sorted({row.school_type for row in rows if row.school_type}),
		"school_statuses": sorted({row.status for row in rows if row.status}),
		"program_statuses": list(STATUSES),
		"programs": [{"value": program, "label": PROGRAM_LABELS[program]} for program in PROGRAMS],
	}


def _get_summary(rows):
	return {
		"total_schools": len(rows),
		"provinces": len({_display_province(row.get("province")) for row in rows if _display_province(row.get("province")) != "Not Set"}),
		"cities": len({_display(row.get("city")) for row in rows if _display(row.get("city")) != "Not Set"}),
		"active_schools": sum(1 for row in rows if row.get("status") == "Active"),
		"tps_active": _count_program(rows, "tps", "Active"),
		"qps_active": _count_program(rows, "qps", "Active"),
		"cee_active": _count_program(rows, "cee", "Active"),
	}


def _group_location_summary(rows, fieldname):
	grouped = {}
	for row in rows:
		key = _display_province(row.get(fieldname)) if fieldname == "province" else _display(row.get(fieldname))
		grouped.setdefault(key, _blank_location_row(key))
		item = grouped[key]
		item["tps_active"] += _flag(row, "tps", "Active")
		item["tps_inactive"] += _flag(row, "tps", "In Active")
		item["tps_no"] += _flag(row, "tps", "No")
		item["qps_active"] += _flag(row, "qps", "Active")
		item["qps_inactive"] += _flag(row, "qps", "In Active")
		item["qps_no"] += _flag(row, "qps", "No")
		item["cee_active"] += _flag(row, "cee", "Active")
		item["cee_no"] += _flag(row, "cee", "No")
		item["total_schools"] += 1

	return sorted(grouped.values(), key=lambda row: (-row["total_schools"], row["location"]))


def _simple_location_summary(rows, fieldname):
	grouped = {}
	for row in rows:
		key = _display_province(row.get(fieldname)) if fieldname == "province" else _display(row.get(fieldname))
		grouped[key] = grouped.get(key, 0) + 1
	return [{"location": key, "total_schools": total} for key, total in sorted(grouped.items(), key=lambda item: (-item[1], item[0]))]


def _department_summary(rows):
	result = []
	for program in PROGRAMS:
		active = _count_program(rows, program, "Active")
		inactive = _count_program(rows, program, "In Active")
		no = _count_program(rows, program, "No")
		result.append(
			{
				"department": PROGRAM_LABELS[program],
				"active": active,
				"inactive": inactive,
				"no": no,
				"total": active + inactive + no,
			}
		)
	return result


def _school_details(rows):
	return [
		{
			"name": row.get("name"),
			"school_name": row.get("school_name"),
			"province": _display(row.get("province")),
			"city": _display(row.get("city")),
			"status": row.get("status"),
			"school_type": row.get("school_type"),
			"tps": row.get("tps"),
			"qps": row.get("qps"),
			"cee": row.get("cee"),
			"students": cint(row.get("no_of_students")),
			"address": row.get("complete_school_address"),
		}
		for row in rows[:500]
	]


def _blank_location_row(location):
	return {
		"location": location,
		"tps_active": 0,
		"tps_inactive": 0,
		"tps_no": 0,
		"qps_active": 0,
		"qps_inactive": 0,
		"qps_no": 0,
		"cee_active": 0,
		"cee_no": 0,
		"total_schools": 0,
	}


def _count_program(rows, program, status):
	return sum(_flag(row, program, status) for row in rows)


def _flag(row, program, status):
	return 1 if row.get(program) == status else 0


def _display(value):
	value = (value or "").strip()
	return value or "Not Set"


def _display_province(value):
	value = _display(value)
	if value.lower() == "kpk":
		return "KPK"
	if value.lower() == "ict":
		return "ICT"
	if value.lower() == "ajk":
		return "AJK"
	if value.lower() == "usa":
		return "USA"
	return value


def _norm(value):
	return (value or "").strip().lower()
