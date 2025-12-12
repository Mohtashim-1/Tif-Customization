// Copyright (c) 2025, mohtashim and contributors
// For license information, please see license.txt

frappe.ui.form.on("Acknowledgment", {
	refresh(frm) {
		// Show acknowledge/reject buttons only if status is Pending
		if (frm.doc.status === "Pending" && frm.doc.requested_by === frappe.session.user) {
			// Only show buttons if current user is the requester
			frm.add_custom_button(__("Acknowledge"), function() {
				acknowledge_items(frm, "Acknowledged");
			}, __("Actions"));
			
			frm.add_custom_button(__("Reject"), function() {
				acknowledge_items(frm, "Rejected");
			}, __("Actions"));
		}
		
		// Make acknowledgment_remarks editable only when status is Pending
		if (frm.doc.status !== "Pending") {
			frm.set_df_property("acknowledgment_remarks", "read_only", 1);
		} else {
			frm.set_df_property("acknowledgment_remarks", "read_only", 0);
		}
	},
	
	requested_by(frm) {
		// Check if current user is the requester
		if (frm.doc.requested_by === frappe.session.user) {
			frm.set_df_property("acknowledgment_remarks", "read_only", 0);
		}
	}
});

function acknowledge_items(frm, status) {
	// Show dialog for remarks if rejecting
	if (status === "Rejected") {
		let d = new frappe.ui.Dialog({
			title: __("Rejection Remarks"),
			fields: [
				{
					fieldtype: "Small Text",
					fieldname: "remarks",
					label: __("Remarks"),
					reqd: 1,
					default: frm.doc.acknowledgment_remarks || ""
				}
			],
			primary_action_label: __("Reject"),
			primary_action(values) {
				if (!values.remarks) {
					frappe.msgprint(__("Please provide rejection remarks"));
					return;
				}
				submit_acknowledgment(frm, status, values.remarks);
				d.hide();
			}
		});
		d.show();
	} else {
		// For acknowledgment, remarks are optional
		submit_acknowledgment(frm, status, frm.doc.acknowledgment_remarks || "");
	}
}

function submit_acknowledgment(frm, status, remarks) {
	frappe.confirm(
		__("Are you sure you want to {0} this acknowledgment?", [status.toLowerCase()]),
		function() {
			// Yes
			frappe.call({
				method: "tif_customization.tif_customization.doctype.acknowledgment.acknowledgment.submit_acknowledgment",
				args: {
					acknowledgment: frm.doc.name,
					status: status,
					remarks: remarks
				},
				callback: function(r) {
					if (!r.exc) {
						frappe.msgprint({
							message: __("Acknowledgment {0} successfully", [status.toLowerCase()]),
							indicator: "green"
						});
						frm.reload_doc();
					}
				}
			});
		},
		function() {
			// No
		}
	);
}
