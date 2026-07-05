function tif_csv_escape(value) {
	if (value === null || value === undefined) return '""';
	const s = String(value);
	return `"${s.replace(/"/g, '""')}"`;
}

function tif_download_csv(filename, rows) {
	const csv = rows.map((r) => r.join(",")).join("\n") + "\n";
	const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
	const url = window.URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	window.URL.revokeObjectURL(url);
}

function tif_save_if_dirty(frm) {
	if (frm.is_dirty()) {
		return frm.save();
	}
	return Promise.resolve();
}

function tif_reload_from_server(frm) {
	if (!frm.doc.name || frm.doc.__islocal) {
		return Promise.resolve();
	}
	frappe.model.clear_doc(frm.doctype, frm.doc.name);
	return frappe.model.with_doc(frm.doctype, frm.doc.name, () => {
		frm.refresh();
	});
}

function tif_call_bulk_method(frm, method, { freeze_message, on_success } = {}) {
	return tif_save_if_dirty(frm).then(() =>
		frappe
			.call({
				doc: frm.doc,
				method,
				freeze: true,
				freeze_message: freeze_message || __("Please wait..."),
			})
			.then((r) => {
				if (r.exc) {
					return;
				}
				return tif_reload_from_server(frm).then(() => on_success?.(r));
			})
	);
}

function tif_export_leave_encashment_bulk_employees(frm) {
	const employees = frm.doc.employees || [];
	if (!employees.length) {
		frappe.msgprint(__("No employees to download."));
		return;
	}

	const header = [
		"Employee",
		"Employee Name",
		"Employment Type",
		"Leave Balance",
		"Actual Encashable Days",
		"Encashment Days",
		"Encashment Amount",
		"Leave Encashment",
		"Payment Entry",
		"Status",
		"Remarks",
	];

	const rows = [header.map(tif_csv_escape)];
	for (const row of employees) {
		rows.push(
			[
				row.employee,
				row.employee_name,
				row.employment_type,
				row.leave_balance,
				row.actual_encashable_days,
				row.encashment_days,
				row.encashment_amount,
				row.leave_encashment,
				row.payment_entry,
				row.status,
				row.remarks,
			].map(tif_csv_escape)
		);
	}

	const safe_name = (frm.doc.name || "leave-encashment-bulk").replace(/[^a-z0-9_-]+/gi, "-");
	tif_download_csv(`leave-encashment-bulk-employees-${safe_name}.csv`, rows);
}

function tif_has_pending_encashments(frm) {
	return (frm.doc.employees || []).some(
		(row) => !row.leave_encashment && row.status !== "Skipped" && flt(row.encashment_days)
	);
}

frappe.ui.form.on("Leave Encashment Bulk", {
	onload(frm) {
		frm.set_query("payable_account", () => ({
			filters: { company: frm.doc.company, is_group: 0 },
		}));
		frm.set_query("expense_account", () => ({
			filters: { company: frm.doc.company, is_group: 0 },
		}));
		frm.set_query("bank_account", () => ({
			filters: { company: frm.doc.company, account_type: "Bank", is_group: 0 },
		}));
		frm.set_query("cost_center", () => ({
			filters: { company: frm.doc.company, is_group: 0 },
		}));
	},

	company(frm) {
		if (!frm.doc.company) return;
		frappe.db.get_value("Company", frm.doc.company, "default_payroll_payable_account", (r) => {
			if (r?.default_payroll_payable_account) {
				frm.set_value("payable_account", r.default_payroll_payable_account);
			}
		});
		if (!frm.doc.cost_center) {
			frappe.db.get_value(
				"Cost Center",
				{ company: frm.doc.company, name: ["like", "%Salary%"], is_group: 0 },
				"name",
				(r) => {
					if (r?.name) {
						frm.set_value("cost_center", r.name);
					}
				}
			);
		}
	},

	encashment_date(frm) {
		if ((frm.doc.employees || []).length && !frm.is_new()) {
			frappe.show_alert({
				message: __(
					"Encashment Date changed — click Recalculate to refresh leave balances for the selected Leave Period."
				),
				indicator: "orange",
			});
		}
	},

	leave_period(frm) {
		if ((frm.doc.employees || []).length && !frm.is_new()) {
			frappe.show_alert({
				message: __("Leave Period changed — click Recalculate to refresh leave balances."),
				indicator: "orange",
			});
		}
	},

	refresh(frm) {
		// Employee rows are populated only via Fetch Employees — block blank manual rows.
		frm.set_df_property("employees", "cannot_add_rows", 1);

		if (frm.doc.docstatus === 0) {
			frm.add_custom_button(__("Fetch Employees"), () =>
				tif_call_bulk_method(frm, "fetch_employees", {
					freeze_message: __("Fetching employees..."),
					on_success: (r) => {
						const total = r.message?.total_employees ?? 0;
						const skipped = r.message?.skipped ?? 0;
						frappe.show_alert({
							message: __("Fetched {0} employee(s).", [total]),
							indicator: "green",
						});
						if (skipped) {
							frappe.msgprint({
								title: __("Some employees skipped"),
								message: __("Skipped {0} employee(s). Check server logs or try Recalculate.", [
									skipped,
								]),
								indicator: "orange",
							});
						}
					},
				})
			);

			if ((frm.doc.employees || []).length) {
				frm.add_custom_button(__("Recalculate"), () =>
					tif_call_bulk_method(frm, "recalculate_employees", {
						freeze_message: __("Recalculating leave balances..."),
						on_success: (r) => {
							const updated = r.message?.updated ?? 0;
							frappe.show_alert({
								message: __("Recalculated {0} employee row(s).", [updated]),
								indicator: "green",
							});
						},
					})
				);
			}

			frm.add_custom_button(__("Create Leave Encashments"), () =>
				tif_call_bulk_method(frm, "create_leave_encashments", {
					freeze_message: __("Creating Leave Encashments..."),
					on_success: (r) => {
						const created = r.message?.created ?? 0;
						frappe.msgprint(__("Created {0} Leave Encashment record(s).", [created]));
					},
				})
			);
		}

		if (frm.doc.docstatus === 1 && tif_has_pending_encashments(frm)) {
			frm.add_custom_button(__("Process Pending Encashments"), () =>
				tif_call_bulk_method(frm, "process_pending_encashments", {
					freeze_message: __("Creating Leave Encashments and Payment Entries..."),
					on_success: (r) => {
						const created = r.message?.created ?? 0;
						frappe.msgprint(__("Created {0} Leave Encashment record(s).", [created]));
					},
				})
			);
		}

		const grid = frm.get_field("employees")?.grid;
		if (grid && !grid.__tif_download_added) {
			grid.add_custom_button(__("Download CSV"), () => tif_export_leave_encashment_bulk_employees(frm));
			grid.__tif_download_added = true;
		}
	},
});
