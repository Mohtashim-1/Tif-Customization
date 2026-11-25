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
				is_company_account: 1,
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
		const state = frm.doc.workflow_state || frm.doc.status;
		if (frm.doc.docstatus === 0 && !["Pending COO Approval", "Approved", "Submitted"].includes(state)) {
			frm.add_custom_button(__("Get Cash Donation Slips"), () => {
				frm.trigger("get_cash_donations");
			});
		}
		if (frm.doc.journal_entry && frm.doc.docstatus === 1) {
			frm.add_custom_button(__("Open Journal Entry"), () => {
				frappe.set_route("Form", "Journal Entry", frm.doc.journal_entry);
			});
		}
		if (state === "Approved" && frm.doc.docstatus === 0) {
			frm.dashboard.set_headline_alert(
				__("COO approved. Use Actions → Submit to create Cash → Bank Journal Entry."),
				"green"
			);
		} else if (state === "Pending COO Approval") {
			frm.dashboard.set_headline_alert(
				__("Pending COO approval. Use Actions to Approve, Reject, or Withdraw."),
				"orange"
			);
		} else if (state === "Draft" || state === "Rejected") {
			frm.dashboard.set_headline_alert(
				__("Use Actions → Submit for COO Approval after filling deposit details."),
				"blue"
			);
		}
	},

	company(frm) {
		if (!frm.doc.company) return;
		frappe.db
			.get_value("Donation Settings", "Donation Settings", [
				"cash_account",
				"bank_account",
				"default_cost_center",
				"company",
			])
			.then((r) => {
				const s = r.message || {};
				if (s.company && s.company !== frm.doc.company) return;
				if (!frm.doc.cash_account && s.cash_account) {
					frm.set_value("cash_account", s.cash_account);
				}
				if (!frm.doc.cost_center && s.default_cost_center) {
					frm.set_value("cost_center", s.default_cost_center);
				}
				if (!frm.doc.bank_account && s.bank_account) {
					frappe.db
						.get_value("Bank Account", {
							account: s.bank_account,
							company: frm.doc.company,
							is_company_account: 1,
						}, "name")
						.then((ba) => {
							if (ba.message && ba.message.name) {
								frm.set_value("bank_account", ba.message.name);
							}
						});
				}
			});
	},

	bank_account(frm) {
		if (!frm.doc.bank_account) {
			frm.set_value({
				gl_account: null,
				bank_account_no: null,
				iban: null,
			});
			return;
		}
		frappe.db.get_value(
			"Bank Account",
			frm.doc.bank_account,
			["account", "bank_account_no", "iban"],
			(r) => {
				if (!r) return;
				frm.set_value({
					gl_account: r.account,
					bank_account_no: r.bank_account_no,
					iban: r.iban,
				});
			}
		);
	},

	toggle_editable(frm) {
		const state = frm.doc.workflow_state || frm.doc.status;
		const locked =
			["Pending COO Approval", "Approved", "Submitted"].includes(state) || frm.doc.docstatus > 0;
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
