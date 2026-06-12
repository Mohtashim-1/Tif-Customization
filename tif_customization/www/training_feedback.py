import frappe
from frappe import _


def get_context(context):
	context.no_cache = 1
	context.no_sidebar = 1
	context.title = _("Training Feedback")
	context.token = frappe.form_dict.get("token")
