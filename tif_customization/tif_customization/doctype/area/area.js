// Copyright (c) 2026, mohtashim and contributors
// For license information, please see license.txt

frappe.ui.form.on("Area", {
	refresh(frm) {
		frm.set_intro(
			__(
				"Setup: pick <b>City</b> (required). <b>Province</b> comes from that City automatically."
			),
			"blue"
		);
	},
	city(frm) {
		if (!frm.doc.city) {
			frm.set_value("province", "");
		}
	},
});
