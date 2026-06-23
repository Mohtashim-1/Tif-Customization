import json

import frappe

from tif_customization.tif_customization.page.millat_publisher_dashboard.millat_publisher_dashboard import (
	get_dashboard_data as _get_publisher_dashboard_data,
)

MOON_BRIGHT_SUPPLIER = "Moon Bright Publishers"
MOON_BRIGHT_WAREHOUSE = "Moon Bright Warehouse - TIF"


@frappe.whitelist()
def get_dashboard_data(filters=None):
	if isinstance(filters, str):
		filters = json.loads(filters or "{}")
	filters = filters or {}
	filters["supplier"] = MOON_BRIGHT_SUPPLIER
	if not filters.get("warehouse"):
		filters["warehouse"] = MOON_BRIGHT_WAREHOUSE
	return _get_publisher_dashboard_data(filters)
