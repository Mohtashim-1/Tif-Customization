# Copyright (c) 2026, TIF Customization and contributors
# License: MIT

import frappe
from frappe import _
from frappe.model.document import Document

from tif_customization.tif_customization.doctype.school_opening_application.school_opening_customer import (
	create_customer_from_application,
)


class SchoolOpeningApplication(Document):
	def on_submit(self):
		if not self.customer:
			create_customer_from_application(self)
