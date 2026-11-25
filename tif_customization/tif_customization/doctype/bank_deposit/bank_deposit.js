// Copyright (c) 2026, mohtashim and contributors
// For license information, please see license.txt

frappe.ui.form.on("Bank Deposit", {
	setup(frm) {
		frm.set_query("cash_account", () => ({
			filters: {
				company: frm.doc.company,
				account_type: "Cash",
				is_group: 0,
			},
		}));
		frm.set_query("bank_account", () => ({
			filters: {
				company: frm.doc.company,
				account_type: "Bank",
				is_group: 0,
			},
		}));
		frm.set_query("cost_center", () => ({
			filters: {
				company: frm.doc.company,
				is_group: 0,
			},
		}));
		frm.set_query("donation", "donations", () => ({
			filters: {
				docstatus: 1,
				payment_method: "Cash",
				company: frm.doc.company || undefined,
			},
		}));
	},

	refresh(frm) {
		frm.trigger("toggle_editable");
		if (frm.doc.docstatus === 0 && !["Pending COO Approval", "Approved"].includes(frm.doc.status)) {
			frm.add_custom_button(__("Get Cash Donation Slips"), () => {
				frm.trigger("get_cash_donations");
			});
		}
		if (!frm.is_new() && frm.doc.docstatus === 0) {
			frm.trigger("render_approval_buttons");
		}
		if (frm.doc.journal_entry && frm.doc.docstatus === 1) {
			frm.add_custom_button(__("Open Journal Entry"), () => {
				frappe.set_route("Form", "Journal Entry", frm.doc.journal_entry);
			});
		}
		if (frm.doc.status === "Approved" && frm.doc.docstatus === 0) {
			frm.dashboard.set_headline_alert(
				__("COO approved. Click Submit to create Cash → Bank Journal Entry."),
				"green"
			);
		} else if (frm.doc.status === "Pending COO Approval") {
			frm.dashboard.set_headline_alert(
				__("Pending COO approval. Editing is locked until withdraw / approve / reject."),
				"orange"
			);
		}
	},

	company(frm) {
		if (!frm.doc.company) return;
		frappe.db.get_value("Donation Settings", "Donation Settings", [
			"cash_account",
			"bank_account",
			"default_cost_center",
			"company",
		]).then((r) => {
			const s = r.message || {};
			if (s.company && s.company !== frm.doc.company) return;
			if (!frm.doc.cash_account && s.cash_account) {
				frm.set_value("cash_account", s.cash_account);
			}
			if (!frm.doc.bank_account && s.bank_account) {
				frm.set_value("bank_account", s.bank_account);
			}
			if (!frm.doc.cost_center && s.default_cost_center) {
				frm.set_value("cost_center", s.default_cost_center);
			}
		});
	},

	toggle_editable(frm) {
		const locked = ["Pending COO Approval", "Approved"].includes(frm.doc.status) || frm.doc.docstatus > 0;
		frm.toggle_enable(
			[
				"company",
				"deposit_date",
				"deposit_slip_no",
				"deposit_slip_attachment",
				"cash_account",
				"bank_account",
				"cost_center",
				"donations",
				"remarks",
			],
			!locked
		);
	},

	render_approval_buttons(frm) {
		frappe.call({
			method:
				"tif_customization.tif_customization.doctype.bank_deposit.bank_deposit.get_approval_actions",
			args: { name: frm.doc.name },
			callback(r) {
				const a = r.message || {};
				if (a.can_submit_for_approval) {
					frm.add_custom_button(
						__("Submit for COO Approval"),
						() => {
							frappe.call({
								method:
									"tif_customization.tif_customization.doctype.bank_deposit.bank_deposit.submit_for_coo_approval",
								args: { name: frm.doc.name },
								freeze: true,
								callback() {
									frm.reload_doc();
								},
							});
						},
						__("Approval")
					);
				}
				if (a.can_withdraw_approval) {
					frm.add_custom_button(
						__("Withdraw Approval"),
						() => {
							frappe.call({
								method:
									"tif_customization.tif_customization.doctype.bank_deposit.bank_deposit.withdraw_coo_approval",
								args: { name: frm.doc.name },
								freeze: true,
								callback() {
									frm.reload_doc();
								},
							});
						},
						__("Approval")
					);
				}
				if (a.can_approve) {
					frm.add_custom_button(
						__("Approve"),
						() => {
							frappe.prompt(
								[
									{
										fieldname: "remarks",
										fieldtype: "Small Text",
										label: __("Approval Remarks"),
									},
								],
								(values) => {
									frappe.call({
										method:
											"tif_customization.tif_customization.doctype.bank_deposit.bank_deposit.approve_bank_deposit",
										args: { name: frm.doc.name, remarks: values.remarks },
										freeze: true,
										callback() {
											frm.reload_doc();
										},
									});
								},
								__("Approve Bank Deposit"),
								__("Approve")
							);
						},
						__("Approval")
					);
				}
				if (a.can_reject) {
					frm.add_custom_button(
						__("Reject"),
						() => {
							frappe.prompt(
								[
									{
										fieldname: "reason",
										fieldtype: "Small Text",
										label: __("Rejection Reason"),
										reqd: 1,
									},
								],
								(values) => {
									frappe.call({
										method:
											"tif_customization.tif_customization.doctype.bank_deposit.bank_deposit.reject_bank_deposit",
										args: { name: frm.doc.name, reason: values.reason },
										freeze: true,
										callback() {
											frm.reload_doc();
										},
									});
								},
								__("Reject Bank Deposit"),
								__("Reject")
							);
						},
						__("Approval")
					);
				}
			},
		});
	},

	get_cash_donations(frm) {
		const d = new frappe.ui.Dialog({
			title: __("Get Cash Donation Slips"),
			fields: [
				{
					fieldname: "from_date",
					fieldtype: "Date",
					label: __("From Date"),
				},
				{
					fieldname: "to_date",
					fieldtype: "Date",
					label: __("To Date"),
					default: frm.doc.deposit_date || frappe.datetime.get_today(),
				},
			],
			primary_action_label: __("Fetch"),
			primary_action(values) {
				frappe.call({
					method:
						"tif_customization.tif_customization.doctype.bank_deposit.bank_deposit.get_undeposited_cash_donations",
					args: {
						company: frm.doc.company,
						from_date: values.from_date,
						to_date: values.to_date,
						exclude_deposit: frm.doc.name,
					},
					freeze: true,
					callback(r) {
						const rows = r.message || [];
						if (!rows.length) {
							frappe.msgprint(__("No undeposited cash donation slips found for the selected period."));
							d.hide();
							return;
						}
						const existing = new Set((frm.doc.donations || []).map((x) => x.donation));
						let added = 0;
						rows.forEach((row) => {
							if (existing.has(row.name)) return;
							frm.add_child("donations", {
								donation: row.name,
								donation_date: row.donation_date,
								donor_name: row.donor_name,
								payment_method: row.payment_method,
								amount: row.received_amount,
								remarks: row.remarks,
							});
							added += 1;
						});
						frm.refresh_field("donations");
						frm.trigger("recalc_total");
						frappe.show_alert({
							message: __("Added {0} donation slip(s).", [added]),
							indicator: "green",
						});
						d.hide();
					},
				});
			},
		});
		d.show();
	},

	recalc_total(frm) {
		let total = 0;
		(frm.doc.donations || []).forEach((row) => {
			total += flt(row.amount);
		});
		frm.set_value("total_amount", total);
	},
});

frappe.ui.form.on("Bank Deposit Donation", {
	donation(frm, cdt, cdn) {
		const row = locals[cdt][cdn];
		if (!row.donation) return;
		frappe.db.get_value(
			"Donation",
			row.donation,
			["donation_date", "donor_name", "payment_method", "received_amount", "remarks"],
			(r) => {
				if (!r) return;
				frappe.model.set_value(cdt, cdn, {
					donation_date: r.donation_date,
					donor_name: r.donor_name,
					payment_method: r.payment_method,
					amount: r.received_amount,
					remarks: row.remarks || r.remarks,
				});
				frm.trigger("recalc_total");
			}
		);
	},
	donations_remove(frm) {
		frm.trigger("recalc_total");
	},
});
