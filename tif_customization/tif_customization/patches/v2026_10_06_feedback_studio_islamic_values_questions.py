import json

import frappe


def execute():
	"""Load Islamic Values follow-up questions into Feedback Studio for school, teacher, parent, student."""
	from tif_customization.tif_customization.api.feedback_studio import _default_forms, _normalize_forms, _settings

	doc = _settings()
	forms = _default_forms()
	# Keep any custom SME questions already saved.
	try:
		current = json.loads(doc.forms_json or "{}")
	except ValueError:
		current = {}
	if isinstance(current, dict) and isinstance(current.get("sme"), dict):
		forms["sme"] = current["sme"]
	doc.forms_json = json.dumps(_normalize_forms(forms), ensure_ascii=False)
	if not doc.rating_scale:
		doc.rating_scale = 5
	doc.save(ignore_permissions=True)
	frappe.db.commit()
