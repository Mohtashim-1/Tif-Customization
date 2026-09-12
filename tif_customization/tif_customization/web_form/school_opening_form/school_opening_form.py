import frappe
from frappe import _

def get_context(context):
	context.title = _("School Opening — Need Analysis Form (SC-1.2)")
	context.no_cache = 1
	context.no_sidebar = 1 