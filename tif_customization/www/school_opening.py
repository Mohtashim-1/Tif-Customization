import frappe
from frappe import _


def get_context(context):
	context.no_cache = 1
	context.no_sidebar = 1
	context.show_sidebar = 0
	context.full_width = 1
	context.no_breadcrumbs = 1
	context.title = _("School Opening — Need Analysis Form")
	context.form_no = "SC-1.2"
	context.css_version = "20260912c"
