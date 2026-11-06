// Copyright (c) 2024, TIF Customization and contributors
// For license information, please see license.txt

frappe.ui.form.on("School", {
	refresh(frm) {
		if (frm.doc.docstatus === 1 && frm.doc.customer) {
			frm.add_custom_button(__("Open Customer"), () => {
				frappe.set_route("Form", "Customer", frm.doc.customer);
			});
		}

		if (frm.doc.docstatus === 0 && frm.doc.status === "In Process") {
			frm.dashboard.set_headline_alert(
				__(
					"Guest submissions stay in Process until a School Approval user submits this record to create the Customer."
				),
				"blue"
			);
		}

		frm.add_custom_button(
			__("Send Welcome Email"),
			function () {
				frm.call({
					method: "tif_customization.tif_customization.doctype.school.school.send_welcome_email",
					args: { school: frm.doc.name },
					callback: function (r) {
						if (r.message) {
							frappe.msgprint(__("Welcome email sent successfully!"));
						}
					},
				});
			},
			__("Actions")
		);

		frm.add_custom_button(__("Refresh Activity"), () => frm.trigger("render_activity_dashboard"));
		frappe.require("/assets/tif_customization/js/field_visit_drilldown.js", () => {
			frm.trigger("render_activity_dashboard");
		});
	},

	render_activity_dashboard(frm) {
		const field = frm.get_field("activity_dashboard_html");
		if (!field || !field.$wrapper) return;
		if (frm.is_new()) {
			field.$wrapper.html(
				`<div class="text-muted" style="padding:12px;">${__(
					"Save the School to load field visits, representatives, books and programs."
				)}</div>`
			);
			return;
		}
		const key = frm.doc.school_name || frm.doc.name;
		frappe.tif_customization.mount_school_activity(field.$wrapper, key, frm.doc.customer);
	},

	category(frm) {
		if (frm.doc.category === "CHAIN OF SCHOOL") {
			frm.set_df_property("no_of_school", "reqd", 1);
		} else {
			frm.set_df_property("no_of_school", "reqd", 0);
			frm.set_value("no_of_school", "");
		}
	},

	school_type(frm) {
		if (frm.doc.school_type === "GOVT") {
			frm.set_df_property("trust_private_registration_code", "reqd", 0);
		} else {
			frm.set_df_property("trust_private_registration_code", "reqd", 1);
		}
	},
});
