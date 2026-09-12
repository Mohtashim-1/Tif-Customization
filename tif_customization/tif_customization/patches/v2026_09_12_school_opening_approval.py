import frappe
from frappe.custom.doctype.property_setter.property_setter import make_property_setter


ROLE = "School Approval"
APPROVERS = (
	"farhan.hussain@tif.edu.pk",
	"danishawan@tif.edu.pk",
)


def execute():
	_ensure_customer_type_school()
	_ensure_role()
	_assign_approvers()


def _ensure_customer_type_school():
	meta = frappe.get_meta("Customer")
	field = meta.get_field("customer_type")
	if not field:
		return
	options = [o.strip() for o in (field.options or "").split("\n") if o.strip()]
	if "School" in options:
		return
	options.append("School")
	make_property_setter(
		"Customer",
		"customer_type",
		"options",
		"\n".join(options),
		"Select",
		validate_fields_for_doctype=False,
	)


def _ensure_role():
	if frappe.db.exists("Role", ROLE):
		return
	frappe.get_doc({"doctype": "Role", "role_name": ROLE, "desk_access": 1}).insert(
		ignore_permissions=True
	)


def _assign_approvers():
	for user in APPROVERS:
		if not frappe.db.exists("User", user):
			continue
		if frappe.db.exists("Has Role", {"parent": user, "role": ROLE}):
			continue
		frappe.get_doc(
			{
				"doctype": "Has Role",
				"parent": user,
				"parenttype": "User",
				"parentfield": "roles",
				"role": ROLE,
			}
		).insert(ignore_permissions=True)
