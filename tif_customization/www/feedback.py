import re

import frappe
from frappe.sessions import get_csrf_token

no_cache = 1
sitemap = 0


def get_context(context):
	context.no_cache = 1
	# Force browsers / proxies to skip stale copies of this guest form.
	try:
		frappe.local.response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
		frappe.local.response.headers["Pragma"] = "no-cache"
		frappe.local.response.headers["Expires"] = "0"
	except Exception:
		pass

	token = (frappe.form_dict.get("token") or "").strip()
	if not re.fullmatch(r"[A-Za-z0-9]{16,64}", token):
		token = ""
	field_visit = (frappe.form_dict.get("field_visit") or "").strip()
	context.token = token
	context.field_visit = field_visit
	context.csrf_token = get_csrf_token()
	context.title = "Feedback"
	context.sme_bootstrap = None
	context.visit_prefill = None

	if token:
		try:
			from tif_customization.tif_customization.api.feedback_studio import (
				_field_visit_context,
				_find,
				_sme_lookup_payload,
			)

			found = _find(token)
			if found and found[0] == "sme":
				context.sme_bootstrap = _sme_lookup_payload()
				context.title = "Subject expert review"
				if field_visit:
					try:
						context.visit_prefill = _field_visit_context(field_visit)
					except Exception:
						context.visit_prefill = None
		except Exception:
			frappe.log_error(title="Feedback page SME bootstrap")
