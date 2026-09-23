import re

import frappe
from frappe.sessions import get_csrf_token

no_cache = 1
sitemap = 0


def get_context(context):
	context.no_cache = 1
	token = (frappe.form_dict.get("token") or "").strip()
	if not re.fullmatch(r"[A-Za-z0-9]{16,64}", token):
		token = ""
	context.token = token
	context.csrf_token = get_csrf_token()
	context.title = "Feedback"
