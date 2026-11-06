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
		if (!frm.is_new()) {
			frm.add_custom_button(__("Print SC-1.2 Form"), () => {
				const q = new URLSearchParams({ application: frm.doc.name });
				window.open(`/school-opening-print?${q.toString()}`, "_blank");
			});
			frappe.require("/assets/tif_customization/js/field_visit_drilldown.js", () => {
				mount_soa_school_activity(frm);
			});
		}
		sync_soa_attach_fields(frm);
	},
});

function mount_soa_school_activity(frm) {
	const field = frm.get_field("activity_dashboard_html");
	if (!field || !field.$wrapper) {
		return;
	}
	const schoolKey = frm.doc.name || frm.doc.school_name;
	let $wrap = field.$wrapper.find(".soa-school-activity-body");
	if (!$wrap.length) {
		field.$wrapper.html(
			`<div class="soa-school-activity-body" style="padding:4px 0 12px; min-height:120px;"></div>`
		);
		$wrap = field.$wrapper.find(".soa-school-activity-body");
	}
	frappe.tif_customization.mount_school_activity($wrap, schoolKey, frm.doc.customer);
}

function sync_soa_attach_fields(frm) {
	if (!frm || frm.is_new() || frm.doc.docstatus === 2) {
		return;
	}
	const attach_fields = ["visiting_card", "school_picture"];
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
