import json

import frappe

from tif_customization.tif_customization.page.millat_publisher_dashboard.millat_publisher_dashboard import (
	get_dashboard_data as _get_publisher_dashboard_data,
)

SUPPLIER_OPTIONS = [
	{
		"supplier": "Millat Printers & Publishers Peshawar",
		"warehouse": "Millat Warehouse - TIF",
		"label": "Millat Printers & Publishers Peshawar",
	},
	{
		"supplier": "Moon Bright Publishers",
		"warehouse": "Moon Bright Warehouse - TIF",
		"label": "Moon Bright Publishers",
	},
	{
		"supplier": "WASA Printers (PVT) Ltd",
		"warehouse": "",
		"label": "WASA Printers (PVT) Ltd",
	},
]

_DEFAULT_SUPPLIER = SUPPLIER_OPTIONS[0]["supplier"]


def _supplier_map():
	return {row["supplier"]: row for row in SUPPLIER_OPTIONS}


@frappe.whitelist()
def get_supplier_options():
	return SUPPLIER_OPTIONS


@frappe.whitelist()
def get_dashboard_data(filters=None):
	if isinstance(filters, str):
		filters = json.loads(filters or "{}")
	filters = filters or {}

	supplier = (filters.get("supplier") or _DEFAULT_SUPPLIER).strip()
	config = _supplier_map().get(supplier)
	if not config:
		frappe.throw(frappe._("Supplier {0} is not configured for this dashboard.").format(supplier))

	filters["supplier"] = supplier
	if not (filters.get("warehouse") or "").strip():
		filters["warehouse"] = config.get("warehouse") or ""

	return _get_publisher_dashboard_data(filters)
