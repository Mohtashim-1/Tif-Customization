import os

import frappe
from frappe import _

no_cache = 1


def get_context(context):
	context.no_cache = 1

	if frappe.session.user == "Guest":
		frappe.local.flags.redirect_location = "/login?redirect-to=/training-schedule"
		raise frappe.Redirect

	js_url, css_url = _portal_asset_urls()
	context.title = _("Training Schedule")
	context.portal_js = js_url
	context.portal_css = css_url
	context.boot = {
		"sitename": frappe.local.site,
		"user": frappe.session.user,
		"csrf_token": frappe.sessions.get_csrf_token(),
	}


def _portal_asset_urls():
	"""Resolve hashed Vite build files so browsers never stick on an old bundle."""
	base = "/assets/tif_customization/training_schedule"
	app_path = frappe.get_app_path("tif_customization")
	# .../apps/tif_customization/tif_customization/public/training_schedule
	public_root = os.path.join(app_path, "public", "training_schedule")
	manifest_path = os.path.join(public_root, ".vite", "manifest.json")

	js_rel = "assets/training_schedule.js"
	css_rel = "assets/training_schedule.css"

	if os.path.exists(manifest_path):
		import json

		with open(manifest_path, encoding="utf-8") as f:
			manifest = json.load(f)
		entry = manifest.get("index.html") or next(iter(manifest.values()), {})
		if entry.get("file"):
			js_rel = entry["file"]
		css_list = entry.get("css") or []
		if css_list:
			css_rel = css_list[0]

	# Fallback: newest hashed file in assets/
	assets_dir = os.path.join(public_root, "assets")
	if not os.path.exists(os.path.join(public_root, js_rel)) and os.path.isdir(assets_dir):
		js_files = sorted(
			[n for n in os.listdir(assets_dir) if n.endswith(".js")],
			key=lambda n: os.path.getmtime(os.path.join(assets_dir, n)),
			reverse=True,
		)
		css_files = sorted(
			[n for n in os.listdir(assets_dir) if n.endswith(".css")],
			key=lambda n: os.path.getmtime(os.path.join(assets_dir, n)),
			reverse=True,
		)
		if js_files:
			js_rel = f"assets/{js_files[0]}"
		if css_files:
			css_rel = f"assets/{css_files[0]}"

	js_fs = os.path.join(public_root, js_rel)
	css_fs = os.path.join(public_root, css_rel)
	js_v = int(os.path.getmtime(js_fs)) if os.path.exists(js_fs) else 1
	css_v = int(os.path.getmtime(css_fs)) if os.path.exists(css_fs) else 1

	return f"{base}/{js_rel}?v={js_v}", f"{base}/{css_rel}?v={css_v}"
