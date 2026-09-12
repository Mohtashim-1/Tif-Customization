from urllib.parse import quote

import frappe
from frappe import _

from tif_customization.tif_customization.api.school_opening_registry import (
	build_school_opening_view,
	resolve_customer_name,
)


def get_context(context):
	context.no_cache = 1
	context.no_sidebar = 1
	context.show_sidebar = 0
	context.full_width = 1
	context.no_breadcrumbs = 1
	context.title = _("School Opening Form")

	raw_customer = (frappe.form_dict.get("customer") or "").strip()
	customer = resolve_customer_name(raw_customer) if raw_customer else ""

	context.customer = customer
	context.missing_customer = not customer

	if not customer:
		return

	if frappe.session.user == "Guest":
		target = f"/school-opening-print?customer={quote(raw_customer or customer)}"
		frappe.local.flags.redirect_location = f"/login?redirect-to={quote(target)}"
		raise frappe.Redirect

	if not frappe.has_permission("Customer", "read", customer):
		frappe.throw(_("Not permitted to view this customer."), frappe.PermissionError)

	view = build_school_opening_view(customer)
	context.data = view
	context.print_mode = False
	context.form_print_body = frappe.render_template(
		"templates/school_opening_form_print.html",
		{"data": view, "print_mode": False},
	)
