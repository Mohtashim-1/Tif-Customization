frappe.ui.form.on("Customer", {
	refresh(frm) {
		if (frm.is_new()) return;
		frappe.require("/assets/tif_customization/js/field_visit_drilldown.js", () => {
			mount_customer_school_activity(frm);
		});
	},
});

function mount_customer_school_activity(frm) {
	if (!frappe.tif_customization || !frappe.tif_customization.mount_school_activity) return;

	const wrap_id = "customer-school-activity";
	const body_cls = "customer-school-activity-body";
	const schoolKey = frm.doc.customer_name || frm.doc.name;

	// Remove prior mounts (refresh / soft reload).
	frm.$wrapper.find(`#${wrap_id}`).remove();
	if (frm.dashboard && frm.dashboard.wrapper) {
		frm.dashboard.wrapper.find(`#${wrap_id}`).remove();
	}

	const $section = $(`
		<div id="${wrap_id}" class="form-dashboard-section" style="margin: 8px 0 16px;">
			<div class="section-head" style="font-weight:600;margin-bottom:6px;">
				${__("Field Visit Activity")}
			</div>
			<div class="${body_cls}" style="padding:4px 0 8px;"></div>
		</div>
	`);

	// Details tab first — that is where users land (School form shows activity inline too).
	const $detailsPage = frm.layout && frm.layout.wrapper
		? frm.layout.wrapper.find(".form-page").first()
		: $();
	if ($detailsPage.length) {
		$detailsPage.prepend($section);
	} else if (frm.dashboard && frm.dashboard.add_section) {
		frm.dashboard.add_section($section.prop("outerHTML"), __("Field Visit Activity"));
	} else if (frm.dashboard && frm.dashboard.wrapper) {
		frm.dashboard.wrapper.prepend($section);
	} else {
		return;
	}

	const $body = frm.$wrapper.find(`#${wrap_id} .${body_cls}`).first();
	frappe.tif_customization.mount_school_activity($body, schoolKey, frm.doc.name);
}
