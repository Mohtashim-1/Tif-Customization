// Copyright (c) 2026, mohtashim and contributors
// Add cash Donation slips to a Bank Deposit voucher from the Donation form.

frappe.ui.form.on("Donation", {
	refresh(frm) {
		frm.trigger("render_bank_deposit_actions");
	},

	render_bank_deposit_actions(frm) {
		frm.remove_custom_button(__("Add to Bank Deposit"));
		frm.remove_custom_button(__("Open Bank Deposit"));
		frm.remove_custom_button(__("Create Bank Deposit"));

		if (frm.is_new() || frm.doc.docstatus !== 1) {
			return;
		}

		const method = (frm.doc.payment_method || "").trim().toLowerCase();
		const linked = frm.doc.bank_deposit;

		if (linked) {
			frm.add_custom_button(__("Open Bank Deposit"), () => {
				frappe.set_route("Form", "Bank Deposit", linked);
			}, __("Bank Deposit"));
			return;
		}

		if (method !== "cash") {
			return;
		}

		frm.add_custom_button(__("Create Bank Deposit"), () => {
			frappe.call({
				method:
					"tif_customization.tif_customization.doctype.bank_deposit.bank_deposit.create_bank_deposit_from_donation",
				args: { donation: frm.doc.name },
				freeze: true,
				freeze_message: __("Creating Bank Deposit..."),
				callback(r) {
					if (!r.message || !r.message.name) return;
					frappe.show_alert({
						message: __("Bank Deposit {0} created with this slip.", [r.message.name]),
						indicator: "green",
					});
					frappe.set_route("Form", "Bank Deposit", r.message.name);
				},
			});
		}, __("Bank Deposit"));

		frm.add_custom_button(__("Add to Existing Bank Deposit"), () => {
			frm.trigger("pick_bank_deposit");
		}, __("Bank Deposit"));
	},

	pick_bank_deposit(frm) {
		const d = new frappe.ui.Dialog({
			title: __("Add Slip to Bank Deposit"),
			fields: [
				{
					fieldname: "bank_deposit",
					fieldtype: "Link",
					label: __("Bank Deposit Voucher"),
					options: "Bank Deposit",
					reqd: 1,
					get_query: () => ({
						filters: {
							docstatus: 0,
							company: frm.doc.company || undefined,
							status: ["in", ["Draft", "Rejected"]],
						},
					}),
					description: __(
						"Select a Draft / Rejected Bank Deposit. This cash slip will be added to its table."
					),
				},
			],
			primary_action_label: __("Add Slip"),
			primary_action(values) {
				frappe.call({
					method:
						"tif_customization.tif_customization.doctype.bank_deposit.bank_deposit.add_donation_to_bank_deposit",
					args: {
						donation: frm.doc.name,
						bank_deposit: values.bank_deposit,
					},
					freeze: true,
					callback(r) {
						d.hide();
						frappe.show_alert({
							message: __("Slip added to {0}.", [values.bank_deposit]),
							indicator: "green",
						});
						if (r.message && r.message.name) {
							frappe.set_route("Form", "Bank Deposit", r.message.name);
						} else {
							frm.reload_doc();
						}
					},
				});
			},
		});
		d.show();
	},
});
