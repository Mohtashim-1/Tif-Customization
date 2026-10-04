# Copyright (c) 2026, TIF Customization and contributors
# License: MIT
"""Ambassador enrolment dashboard."""

from __future__ import annotations

import frappe

from tif_customization.tif_customization.page.volunteer_ambassador_dashboard.volunteer_ambassador_dashboard import (
	get_dashboard_data as _shared,
)


@frappe.whitelist()
def get_dashboard_data(filters=None):
	return _shared(filters=filters, kind="ambassador")
