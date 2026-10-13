import frappe
import traceback

name = "SOA-2026-00611"
doc = frappe.get_doc("School Opening Application", name)
print("status", doc.docstatus, "customer", doc.customer)
print(
	"attach",
	repr(doc.get("visiting_card")),
	repr(doc.get("school_picture")),
	repr(doc.get("meeting_picture")),
)
meta = frappe.get_meta("School Opening Application")
for df in meta.fields:
	dep = df.depends_on or ""
	if dep:
		print("depends", df.fieldname, dep[:160])
	if df.fieldtype == "Select" and df.options:
		# check for broken quotes / trailing issues
		if '"' in df.options or "'" in df.options:
			print("select_quotes", df.fieldname, repr(df.options[:100]))

# Client scripts
scripts = frappe.get_all(
	"Client Script",
	filters={"dt": "School Opening Application", "enabled": 1},
	fields=["name", "view", "script"],
)
print("client_scripts", len(scripts))
for s in scripts:
	print("script", s.name, s.view, "len", len(s.script or ""))
	# try parse
	try:
		compile(s.script or "", s.name, "exec")
		print("  compile ok (py-style won't catch js)")
	except Exception:
		pass

# Dashboard
try:
	from tif_customization.tif_customization.doctype.school_opening_application.school_opening_application_dashboard import (
		get_data,
	)

	print("dashboard", get_data())
except Exception:
	traceback.print_exc()
