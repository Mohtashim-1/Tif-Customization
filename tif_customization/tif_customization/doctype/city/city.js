// Copyright (c) 2026, mohtashim and contributors
// For license information, please see license.txt

frappe.ui.form.on("City", {
	refresh(frm) {
		frm.set_intro(
			__(
				"Setup: set <b>Province</b> on each City. Areas link to City. Forms then cascade Area ← City ← Province."
			),
			"blue"
		);
	},
});
