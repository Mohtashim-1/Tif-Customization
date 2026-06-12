import frappe
from frappe import _


def get_context(context):
	context.title = _("School Registration Success")
	context.no_cache = 1
	context.no_sidebar = 1
