import json
import os
from urllib.parse import quote

import frappe
from frappe import _

no_cache = 1


def get_context(context):
	context.no_cache = 1
	context.no_sidebar = 1
	context.show_sidebar = 0
	context.full_width = 1
	context.no_breadcrumbs = 1
	context.title = _("ILM Foundation Portal")

	if frappe.session.user == "Guest":
		frappe.local.flags.redirect_location = f"/login?redirect-to={quote('/payroll-portal')}"
		raise frappe.Redirect

	js_url, css_url = _portal_asset_urls()
	context.portal_js = js_url
	context.portal_css = css_url
	context.boot = {
		"csrf_token": frappe.sessions.get_csrf_token(),
		"user": frappe.session.user,
		"full_name": frappe.utils.get_fullname(frappe.session.user),
		"roles": frappe.get_roles(frappe.session.user),
		"company": frappe.defaults.get_user_default("Company")
		or frappe.defaults.get_global_default("company")
		or "The ILM Foundation",
	}
	frappe.db.commit()


def _portal_asset_urls():
	base = "/assets/tif_customization/payroll_portal"
	app_path = frappe.get_app_path("tif_customization")
	public_root = os.path.join(app_path, "public", "payroll_portal")
	manifest_path = os.path.join(public_root, ".vite", "manifest.json")

	js_rel = "assets/payroll_portal.js"
	css_rel = "assets/payroll_portal.css"

	if os.path.exists(manifest_path):
		with open(manifest_path, encoding="utf-8") as fh:
			manifest = json.load(fh)
		entry = manifest.get("index.html") or next(iter(manifest.values()), {})
		if entry.get("file"):
			js_rel = entry["file"]
		css_list = entry.get("css") or []
		if css_list:
			css_rel = css_list[0]

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
