// Copyright (c) 2026, mohtashim and contributors
// For license information, please see license.txt

frappe.ui.form.on("Field Officer", {
	refresh(frm) {
		if (!frm.is_new() && frm.doc.user) {
			frm.add_custom_button(__("Open Target KPI Report"), () => {
				frappe.set_route("smes-target-base---k", {
					staff: frm.doc.name1 || frm.doc.user,
					division: frm.doc.division || "",
				});
			});
			frm.add_custom_button(__("Open SME Summary"), () => {
				frappe.set_route("sme-summary-report");
			});
		}
	},

	employee(frm) {
		if (!frm.doc.employee) return;
		frappe.db.get_value(
			"Employee",
			frm.doc.employee,
			["employee_name", "user_id", "branch"],
			(r) => {
				if (!r) return;
				if (r.employee_name && !frm.doc.name1) {
					frm.set_value("name1", r.employee_name);
				}
				if (r.user_id) {
					frm.set_value("user", r.user_id);
				}
				if (r.branch) {
					frm.set_value("branch", r.branch);
					if (!frm.doc.division) {
						const suggested = suggest_division(r.branch);
						if (suggested) frm.set_value("division", suggested);
					}
				}
			}
		);
	},
});

function suggest_division(branch) {
	const text = (branch || "").toLowerCase();
	if (!text) return "";
	if (text.includes("karachi")) return "Karachi";
	const urban = [
		"lahore",
		"islamabad",
		"rawalpindi",
		"faisalabad",
		"multan",
		"peshawar",
		"quetta",
		"hyderabad",
		"sialkot",
		"gujranwala",
	];
	if (urban.some((h) => text.includes(h))) return "Urban Areas";
	return "Rural Areas";
}
