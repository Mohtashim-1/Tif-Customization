frappe.ui.form.on("Customer", {
	refresh(frm) {
		if (frm.is_new()) return;
		frappe.require("/assets/tif_customization/js/field_visit_drilldown.js", () => {
			mount_customer_school_activity(frm);
		});
	},
});

function mount_customer_school_activity(frm) {
	if (!frm.dashboard) return;
	const wrap_id = "customer-school-activity";
	frm.dashboard.wrapper.find(`#${wrap_id}`).remove();
	const $section = $(
		`<div id="${wrap_id}" class="form-dashboard-section" style="margin-top:12px;">
			<div class="section-head">${__("Field Visit Activity")}</div>
			<div class="customer-school-activity-body" style="padding:4px 0 12px;"></div>
		</div>`
	);
	frm.dashboard.wrapper.append($section);
	frappe.tif_customization.mount_school_activity(
		$section.find(".customer-school-activity-body"),
		frm.doc.customer_name || frm.doc.name,
		frm.doc.name
	);
}
