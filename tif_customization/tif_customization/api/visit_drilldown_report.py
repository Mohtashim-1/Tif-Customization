# Copyright (c) 2026, TIF Customization and contributors
# License: MIT
"""Fresh entry point for visit drilldown (forces reload of drilldown module).

Gunicorn --preload can keep a stale field_visit_drilldown in memory. Calling through
this new module + importlib.reload ensures supervisor scoping is always current.
"""

from __future__ import annotations

import importlib

import frappe


@frappe.whitelist()
def get_visit_drilldown(filters=None, metric=None, staff=None):
	from tif_customization.tif_customization.api import field_visit_drilldown as mod

	importlib.reload(mod)
	return mod.get_visit_drilldown(filters=filters, metric=metric, staff=staff)


@frappe.whitelist()
def get_total_schools_by_province(filters=None):
	from tif_customization.tif_customization.api import field_visit_drilldown as mod

	importlib.reload(mod)
	return mod.get_total_schools_by_province(filters=filters)
