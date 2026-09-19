# Copyright (c) 2026, TIF Customization and contributors
# License: MIT
"""Model School A/B from QPS + TPS + CEE department affiliation."""

from __future__ import annotations

import frappe

AFFILIATED_YES = frozenset({"Yes - Already Affiliated", "Yes - Newly Registered"})

MODEL_SCHOOL_A = (
	"Yes - Model School A: (Affiliated atleast 1 Program of all 3 Department of TIF)"
)
MODEL_SCHOOL_B = (
	"Yes - Model School B: (Affiliated atleast 1 Program of all 2 Department of TIF)"
)
MODEL_SCHOOL_NO = "No - This is not a Model School"

MODEL_SCHOOL_SELECT_OPTIONS = f"\n{MODEL_SCHOOL_A}\n{MODEL_SCHOOL_B}\n{MODEL_SCHOOL_NO}"


def is_department_affiliated(value: str | None) -> bool:
	return (value or "").strip() in AFFILIATED_YES


def count_tif_departments(doc) -> int:
	"""How many of QPS / TPS / CEE the school is affiliated with."""
	get = doc.get if isinstance(doc, dict) else lambda k, d=None: getattr(doc, k, d)
	n = 0
	if is_department_affiliated(get("qps_affiliated")):
		n += 1
	if is_department_affiliated(get("tps_affiliated")):
		n += 1
	if is_department_affiliated(get("cee_affiliated")):
		n += 1
	return n


def derive_model_school(dept_count: int | None = None, doc=None) -> str:
	if dept_count is None:
		dept_count = count_tif_departments(doc or {})
	if dept_count >= 3:
		return MODEL_SCHOOL_A
	if dept_count == 2:
		return MODEL_SCHOOL_B
	return MODEL_SCHOOL_NO


def sync_model_school_field(doc) -> None:
	"""Set model_school from QPS/TPS/CEE (Model A = 3 depts, Model B = 2 depts)."""
	if isinstance(doc, dict):
		doc["model_school"] = derive_model_school(doc=doc)
	else:
		doc.model_school = derive_model_school(doc=doc)


def department_count_sql(alias: str = "fv") -> str:
	a = alias
	yes_sql = ", ".join(frappe.db.escape(v) for v in AFFILIATED_YES)
	return f"""(
		(CASE WHEN IFNULL({a}.qps_affiliated, '') IN ({yes_sql}) THEN 1 ELSE 0 END)
		+ (CASE WHEN IFNULL({a}.tps_affiliated, '') IN ({yes_sql}) THEN 1 ELSE 0 END)
		+ (CASE WHEN IFNULL({a}.cee_affiliated, '') IN ({yes_sql}) THEN 1 ELSE 0 END)
	)"""
