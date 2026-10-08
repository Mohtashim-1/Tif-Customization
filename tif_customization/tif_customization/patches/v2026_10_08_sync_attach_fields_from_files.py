# Copyright (c) 2026, TIF Customization and contributors
# License: MIT

import frappe


def execute():
	from tif_customization.tif_customization.overrides.file_attach_sync import (
		backfill_attach_fields,
	)

	frappe.flags.in_patch = True
	backfill_attach_fields(
		doctypes=["School Opening Application", "Field Visit"],
	)
