# Copyright (c) 2025, mohtashim and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import now_datetime


class Acknowledgment(Document):
	pass


@frappe.whitelist()
def submit_acknowledgment(acknowledgment, status, remarks=""):
	"""Submit acknowledgment - called from JS"""
	try:
		ack_doc = frappe.get_doc("Acknowledgment", acknowledgment)
		
		# Check if user has permission (should be the requested_by user)
		if ack_doc.requested_by != frappe.session.user:
			frappe.throw(_("You are not authorized to acknowledge this request. Only the requester can acknowledge."))
		
		# Check if already acknowledged/rejected
		if ack_doc.status != "Pending":
			frappe.throw(_("This acknowledgment has already been {0}").format(ack_doc.status.lower()))
		
		# Update status and acknowledgment details
		ack_doc.status = status
		ack_doc.acknowledged_by = frappe.session.user
		ack_doc.acknowledged_date = now_datetime()
		ack_doc.acknowledgment_remarks = remarks
		
		# Save
		ack_doc.save(ignore_permissions=True)
		
		# Submit the document
		ack_doc.submit()
		
		return {
			"status": "success",
			"message": _("Acknowledgment {0} successfully").format(status.lower())
		}
	
	except Exception as e:
		frappe.log_error(f"Error submitting acknowledgment {acknowledgment}: {str(e)}", "Acknowledgment Submit Error")
		frappe.throw(_("Error submitting acknowledgment: {0}").format(str(e)))
