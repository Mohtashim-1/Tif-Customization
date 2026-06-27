import json

import frappe

from tif_customization.tif_customization.page.millat_publisher_dashboard.millat_publisher_dashboard import (
	get_dashboard_data as _get_publisher_dashboard_data,
)

WASA_SUPPLIER = "WASA Printers (PVT) Ltd"
WASA_WAREHOUSE = ""


@frappe.whitelist()
def get_dashboard_data(filters=None):
	if isinstance(filters, str):
		filters = json.loads(filters or "{}")
	filters = filters or {}
	filters["supplier"] = WASA_SUPPLIER
	if not filters.get("warehouse"):
		filters["warehouse"] = WASA_WAREHOUSE
	return _get_publisher_dashboard_data(filters)
