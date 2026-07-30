// Copyright (c) 2026, mohtashim and contributors
// For license information, please see license.txt

const TIF_MONTH_NAMES = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
];

frappe.ui.form.on("Upcoming Training", {
	refresh(frm) {
		frm.add_custom_button(__("Training & Workshop Report"), () => {
			frappe.set_route("upcoming-training-report");
		});
	},

	training_date(frm) {
		set_month_from_date(frm);
	},

	type(frm) {
		set_month_from_date(frm);
	},
});

/** Mirrors the controller so the read-only Month shows immediately, not only after save. */
function set_month_from_date(frm) {
	const date = frm.doc.training_date;
	if (!date) {
		frm.set_value("month", "");
		return;
	}

	const month_index = parseInt(String(date).split("-")[1], 10) - 1;
	frm.set_value("month", TIF_MONTH_NAMES[month_index] || "");
}
