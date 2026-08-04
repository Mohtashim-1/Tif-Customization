import frappe
from frappe.utils import cint, getdate


def run():
	emp = "HR-EMP-00244"
	apps = frappe.get_all(
		"Leave Application",
		filters={
			"employee": emp,
			"from_date": ("<=", "2026-07-24"),
			"to_date": (">=", "2026-07-24"),
			"docstatus": ["<", 2],
		},
		fields=[
			"name",
			"leave_type",
			"from_date",
			"to_date",
			"total_leave_days",
			"half_day",
			"half_day_date",
			"status",
			"docstatus",
			"creation",
		],
		order_by="creation desc",
	)
	print("Leave apps covering 2026-07-24:")
	for a in apps:
		print(
			f"  {a.name} {a.leave_type} {a.from_date}->{a.to_date} days={a.total_leave_days} "
			f"half={cint(a.half_day)} half_date={a.half_day_date} status={a.status} ds={a.docstatus}"
		)

	# Shift Type late_mark / half_day thresholds
	st = frappe.get_doc("Shift Type", "General Shift")
	print("\nShift Type General Shift:")
	for f in st.as_dict():
		if any(k in f.lower() for k in ("late", "half", "early", "start", "end", "grace", "mark", "calculate")):
			print(f"  {f}={st.get(f)}")

	# Day-wise child table on shift if any
	meta = frappe.get_meta("Shift Type")
	print("\nShift Type tables:", [t.fieldname for t in meta.get_table_fields()])
