# Copyright (c) 2026, TIF Customization and contributors
# License: MIT
"""Travel cost from distance × per-km fuel rate (Employee master or default)."""

from __future__ import annotations

import frappe
from frappe.utils import flt

DEFAULT_PER_KM_FUEL = 18.0
# When a visit day has no Travel Cost on Field Visit, SME reports estimate this distance.
DEFAULT_DAILY_TRAVEL_KM = 22.0

TRAVEL_ACTIVITY_TYPES = (
	"Enrolment of Participants",
	"Attendance / Registration in One Day / Half day Workshop",
)

KM_AUTO_COST_MODES = frozenset(
	{
		"Own Vehicle / Bike",
		"Company Vehicle",
	}
)


def resolve_per_km_fuel(*, visit_by=None, owner=None, employee=None) -> float:
	"""Per-km rate from Employee; fallback to DEFAULT_PER_KM_FUEL when blank/zero."""
	rate = None
	if employee:
		rate = frappe.db.get_value("Employee", employee, "per_km_for_fuel")
	if rate in (None, "") and visit_by:
		rate = frappe.db.get_value(
			"Employee",
			{"employee_name": visit_by.strip(), "status": "Active"},
			"per_km_for_fuel",
		)
	if rate in (None, "") and owner:
		rate = frappe.db.get_value("Employee", {"user_id": owner}, "per_km_for_fuel")
	per_km = flt(rate)
	return per_km if per_km > 0 else DEFAULT_PER_KM_FUEL


def compute_travel_cost_amount(travel_mode, travel_distance_km, per_km: float) -> float:
	if (travel_mode or "").strip() not in KM_AUTO_COST_MODES:
		return 0.0
	distance = flt(travel_distance_km)
	if distance <= 0:
		return 0.0
	return flt(distance * per_km, 2)


def sync_travel_cost(doc) -> None:
	"""Set travel_per_km_rate and travel_cost on Field Visit when rules apply."""
	if not (doc.type or "").strip():
		return

	per_km = resolve_per_km_fuel(visit_by=doc.visit_by, owner=doc.owner)
	doc.travel_per_km_rate = per_km

	mode = (doc.travel_mode or "").strip()
	if mode in KM_AUTO_COST_MODES:
		doc.travel_cost = compute_travel_cost_amount(mode, doc.travel_distance_km, per_km)


@frappe.whitelist()
def compute_travel_cost(
	visit_by=None,
	owner=None,
	staff_employee=None,
	travel_mode=None,
	travel_distance_km=None,
):
	per_km = resolve_per_km_fuel(
		visit_by=visit_by,
		owner=owner or frappe.session.user,
		employee=staff_employee,
	)
	mode = (travel_mode or "").strip()
	auto = mode in KM_AUTO_COST_MODES
	cost = compute_travel_cost_amount(mode, travel_distance_km, per_km) if auto else None
	return {
		"travel_per_km_rate": per_km,
		"travel_cost": cost,
		"auto_cost": auto,
	}


def daily_travel_allowance(per_km: float | None = None) -> float:
	per_km = flt(per_km) if per_km else DEFAULT_PER_KM_FUEL
	if per_km <= 0:
		per_km = DEFAULT_PER_KM_FUEL
	return flt(DEFAULT_DAILY_TRAVEL_KM * per_km, 2)


def aggregate_visit_expenses_by_staff(
	from_date,
	to_date,
	staff_rows,
	*,
	visit_day_sql: str,
	resolve_staff_key,
	staff_key_index,
) -> dict[str, float]:
	"""Explicit travel_cost per visit day, else estimated daily travel (22 km × per km)."""
	if not staff_rows:
		return {}

	index = staff_key_index(staff_rows)
	per_km_by_key = {}
	for s in staff_rows:
		per_km_by_key[s["key"]] = resolve_per_km_fuel(
			visit_by=s.get("employee_name"),
			owner=s.get("user_id"),
			employee=s.get("employee"),
		)

	try:
		visit_rows = frappe.db.sql(
			f"""
			SELECT
				fv.name,
				fv.type,
				fv.owner,
				fv.visit_by,
				fv.me_visit_by,
				fv.mt_visit_by,
				fv.training_entry_filled_by,
				fv.training_trainer_name,
				COALESCE(fv.travel_cost, 0) AS travel_cost,
				{visit_day_sql} AS visit_day
			FROM `tabField Visit` fv
			WHERE fv.docstatus = 1
			AND {visit_day_sql} IS NOT NULL
			AND {visit_day_sql} BETWEEN %(from_date)s AND %(to_date)s
			""",
			{"from_date": from_date, "to_date": to_date},
			as_dict=True,
		)
	except Exception:
		return {}

	day_totals: dict[tuple[str, str], float] = {}
	for row in visit_rows:
		staff_key = resolve_staff_key(row, index)
		if not staff_key or not row.get("visit_day"):
			continue
		day_key = (staff_key, str(row.visit_day))
		day_totals[day_key] = day_totals.get(day_key, 0.0) + flt(row.get("travel_cost"))

	out: dict[str, float] = {}
	for (staff_key, _day), explicit in day_totals.items():
		if explicit > 0:
			out[staff_key] = out.get(staff_key, 0.0) + explicit
		else:
			out[staff_key] = out.get(staff_key, 0.0) + daily_travel_allowance(
				per_km_by_key.get(staff_key)
			)
	return out
