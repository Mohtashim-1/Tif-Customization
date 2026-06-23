function tif_clear_card_break_link_fields(frm, cdt, cdn) {
	const row = locals[cdt][cdn];
	if (!row || row.type !== "Card Break") {
		return;
	}
	if (row.link_type || row.link_to) {
		frappe.model.set_value(cdt, cdn, "link_type", "");
		frappe.model.set_value(cdt, cdn, "link_to", "");
	}
	if (row.is_query_report) {
		frappe.model.set_value(cdt, cdn, "is_query_report", 0);
	}
	tif_unset_card_break_mandatory(row.name);
}

function tif_unset_card_break_mandatory(rowName) {
	["link_type", "link_to"].forEach(function (fieldname) {
		const df = frappe.meta.get_docfield("Workspace Link", fieldname, rowName);
		if (df) df.reqd = 0;
	});
}

function tif_sanitize_workspace_card_breaks(frm) {
	(frm.doc.links || []).forEach((row) => {
		if (row.type === "Card Break") {
			if (row.link_type) row.link_type = "";
			if (row.link_to) row.link_to = "";
			if (row.is_query_report) row.is_query_report = 0;
			tif_unset_card_break_mandatory(row.name);
		}
	});
}

frappe.ui.form.on("Workspace Link", {
	type(frm, cdt, cdn) {
		tif_clear_card_break_link_fields(frm, cdt, cdn);
	},
	link_type(frm, cdt, cdn) {
		tif_clear_card_break_link_fields(frm, cdt, cdn);
	},
});

frappe.ui.form.on("Workspace", {
	refresh(frm) {
		tif_sanitize_workspace_card_breaks(frm);
		if (frm.doc.name === "Reports") {
			frm.layout.show_message(
				__(
					"Edit report links in the Links table below. Do not use the Edit button on the Reports page — that can clear all links."
				)
			);
		}
	},
	before_save(frm) {
		tif_sanitize_workspace_card_breaks(frm);
	},
});
