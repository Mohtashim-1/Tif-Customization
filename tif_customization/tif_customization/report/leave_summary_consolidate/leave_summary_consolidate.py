# Copyright (c) 2026, TIF Customization and contributors
# License: MIT

from typing import Dict, List, Optional, Tuple

import frappe
from frappe import _
from frappe.utils import cint, flt, getdate

from tif_customization.tif_customization.doctype.leave_application.leave_application import (
	get_leave_details,
)

DEFAULT_LEAVE_TYPES = ["Annual Leave", "Casual Leave", "Medical Leave"]

LEAVE_DETAIL_FIELDS = (
	("total_leaves", "total_allocated_leaves"),
	("expired_leaves", "expired_leaves"),
	("leaves_pending_approval", "leaves_pending_approval"),
	("leave_allowed_as_per_accrual", "accrued_to_date"),
	("leaves_taken", "used_leaves"),
	("available_leaves_as_per_accrual", "remaining_accrual"),
	("remaining_leaves", "available_ledger"),
)


def execute(filters: Optional[Dict] = None) -> Tuple:
	filters = frappe._dict(filters or {})
	columns = get_columns()
	data = get_data(filters)
	return columns, data


def get_columns() -> List[Dict]:
	return [
		{
			"label": _("Employee"),
			"fieldtype": "Link",
			"fieldname": "employee",
			"options": "Employee",
			"width": 110,
		},
		{
			"label": _("Employee Name"),
			"fieldtype": "Data",
			"fieldname": "employee_name",
			"width": 160,
		},
		{
			"label": _("Employee Code"),
			"fieldtype": "Data",
			"fieldname": "employee_code_old",
			"width": 100,
		},
		{
			"label": _("Department"),
			"fieldtype": "Data",
			"fieldname": "department",
			"width": 140,
		},
		{
			"label": _("Designation"),
			"fieldtype": "Data",
			"fieldname": "designation",
			"width": 140,
		},
		{
			"label": _("As On Date"),
			"fieldtype": "Date",
			"fieldname": "as_on_date",
			"width": 100,
		},
		{
			"label": _("Leave Type"),
			"fieldtype": "Link",
			"fieldname": "leave_type",
			"options": "Leave Type",
			"width": 130,
		},
		{
			"label": _("Total Allocated Leaves"),
			"fieldtype": "Float",
			"fieldname": "total_allocated_leaves",
			"width": 130,
		},
		{
			"label": _("Expired Leaves"),
			"fieldtype": "Float",
			"fieldname": "expired_leaves",
			"width": 110,
		},
		{
			"label": _("Leaves Pending Approval"),
			"fieldtype": "Float",
			"fieldname": "leaves_pending_approval",
			"width": 150,
		},
		{
			"label": _("Accrued To Date"),
			"fieldtype": "Float",
			"fieldname": "accrued_to_date",
			"width": 120,
		},
		{
			"label": _("Used Leaves"),
			"fieldtype": "Float",
			"fieldname": "used_leaves",
			"width": 100,
		},
		{
			"label": _("Remaining (Accrual)"),
			"fieldtype": "Float",
			"fieldname": "remaining_accrual",
			"width": 130,
		},
		{
			"label": _("Available (Ledger)"),
			"fieldtype": "Float",
			"fieldname": "available_ledger",
			"width": 130,
		},
	]


def get_data(filters: Dict) -> List[Dict]:
	as_on_date = getdate(filters.as_on_date or frappe.utils.today())
	precision = max(cint(frappe.db.get_single_value("System Settings", "float_precision") or 2), 1)
	leave_types = _selected_leave_types(filters)

	employees = frappe.get_all(
		"Employee",
		filters=_employee_filters(filters),
		fields=[
			"name",
			"employee_name",
			"employee_code_old",
			"department",
			"designation",
		],
		order_by="employee_name asc",
	)

	data = []
	for employee in employees:
		details = get_leave_details(employee.name, as_on_date) or {}
		allocation = details.get("leave_allocation") or {}

		for leave_type in leave_types:
			row_data = allocation.get(leave_type)
			if not row_data:
				continue

			row = {
				"employee": employee.name,
				"employee_name": employee.employee_name,
				"employee_code_old": employee.employee_code_old,
				"department": employee.department,
				"designation": employee.designation,
				"as_on_date": as_on_date,
				"leave_type": leave_type,
			}
			for source_key, target_key in LEAVE_DETAIL_FIELDS:
				row[target_key] = flt(row_data.get(source_key), precision)

			data.append(row)

	return data


def _selected_leave_types(filters: Dict) -> List[str]:
	if filters.get("leave_type"):
		return [filters.leave_type]
	return DEFAULT_LEAVE_TYPES


def _employee_filters(filters: Dict) -> Dict:
	conditions = {}
	if filters.get("company"):
		conditions["company"] = filters.company
	if filters.get("department"):
		conditions["department"] = filters.department
	if filters.get("employee"):
		conditions["name"] = filters.employee
	if filters.get("employee_status"):
		conditions["status"] = filters.employee_status
	return conditions
