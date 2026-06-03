"""Extend Health Provider Plan select options to include E and F."""

import frappe

PLAN_OPTIONS = "\nA\nB\nC\nD\nE\nF"


def execute():
	frappe.db.set_value(
		"Custom Field",
		"Healthcare Beneficiary-custom_plan",
		"options",
		PLAN_OPTIONS,
		update_modified=False,
	)
	frappe.clear_cache(doctype="Healthcare Beneficiary")
