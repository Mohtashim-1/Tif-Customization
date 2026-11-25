# Copyright (c) 2026, mohtashim and contributors
# For license information, please see license.txt

import frappe
from frappe.utils import get_first_day, get_last_day, getdate, today


@frappe.whitelist()
def get_upcoming_holidays(filters=None):
	"""Count distinct non-weekly-off holidays in the current month (Number Card helper)."""
	start = get_first_day(today())
	end = get_last_day(today())

	count = frappe.db.sql(
		"""
		SELECT COUNT(DISTINCT holiday_date)
		FROM `tabHoliday`
		WHERE holiday_date BETWEEN %s AND %s
			AND IFNULL(weekly_off, 0) = 0
		""",
		(start, end),
	)[0][0]

	return {
		"value": int(count or 0),
		"fieldtype": "Int",
		"route_options": {
			"holiday_date": ["between", [str(getdate(start)), str(getdate(end))]],
			"weekly_off": 0,
		},
		"route": ["List", "Holiday List"],
	}
