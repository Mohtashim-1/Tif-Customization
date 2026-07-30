"""Backfill Upcoming Training.type and .month.

Every record that existed before the Training/Workshop split was a training, and the
new `type` default only applies to new documents. Without this backfill those rows
would have an empty type and the training fields would be hidden by `depends_on`.
"""

import frappe


def execute():
	if not frappe.db.table_exists("Upcoming Training"):
		return

	if frappe.db.has_column("Upcoming Training", "type"):
		frappe.db.sql(
			"""
			UPDATE `tabUpcoming Training`
			SET `type` = 'Training'
			WHERE COALESCE(`type`, '') = ''
			"""
		)

	if frappe.db.has_column("Upcoming Training", "month"):
		frappe.db.sql(
			"""
			UPDATE `tabUpcoming Training`
			SET `month` = MONTHNAME(`training_date`)
			WHERE `training_date` IS NOT NULL AND COALESCE(`month`, '') = ''
			"""
		)

	frappe.clear_cache(doctype="Upcoming Training")
