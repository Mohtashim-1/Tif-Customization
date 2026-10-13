frappe.ui.form.on("School Opening Application", {
	refresh(frm) {
		if (frm.doc.docstatus === 1 && frm.doc.customer) {
			frm.add_custom_button(__("Open Customer"), () => {
				frappe.set_route("Form", "Customer", frm.doc.customer);
			});
		}
		if (frm.doc.docstatus === 0 && frm.dashboard) {
			frm.dashboard.set_headline_alert(
				__(
					"Review the guest submission, then Submit to create the ERP Customer (type School)."
				),
				"blue"
			);
		}
		sync_soa_attach_fields(frm);
	},
});

function sync_soa_attach_fields(frm) {
	if (!frm || frm.is_new() || frm.doc.docstatus === 2) {
		return;
	}
	const attach_fields = ["visiting_card", "school_picture", "meeting_picture"];
	const missing = attach_fields.filter((f) => !frm.doc[f]);
	if (!missing.length) {
		return;
	}
	frappe.call({
		method: "tif_customization.tif_customization.overrides.file_attach_sync.sync_doc_attach_fields",
		args: { doctype: frm.doctype, name: frm.docname },
		callback(r) {
			if (r.message && Object.keys(r.message).length) {
				frm.reload_doc();
			}
		},
	});
}
