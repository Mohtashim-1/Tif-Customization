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

function tif_has_pending_bonus_payments(frm) {
	return (frm.doc.employees || []).some((row) => {
		if (!flt(row.bonus_amount) || row.additional_salary) return false;
		if (!frm.doc.pay_via_payment_entry) return !row.additional_salary;
		if (!row.journal_entry) return true;
		return frm.doc.create_payment_entry && !row.payment_entry;
	});
}

function tif_export_bonus_bulk_employees(frm) {
	const employees = frm.doc.employees || [];
	if (!employees.length) {
		frappe.msgprint(__("No employees to download."));
		return;
	}

	const header = [
		"Employee",
		"Employee Name",
		"Employment Type",
		"Base Salary",
		"Bonus Amount",
		"Journal Entry",
		"Payment Entry",
		"Additional Salary",
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
				row.base_salary,
				row.bonus_amount,
				row.journal_entry,
				row.payment_entry,
				row.additional_salary,
				row.status,
				row.remarks,
			].map(tif_csv_escape)
		);
	}

	const safe_name = (frm.doc.name || "bonus-bulk").replace(/[^a-z0-9_-]+/gi, "-");
	tif_download_csv(`bonus-bulk-employees-${safe_name}.csv`, rows);
}

frappe.ui.form.on("Bonus Bulk", {
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

	refresh(frm) {
		frm.set_df_property("employees", "cannot_add_rows", 1);

		if (frm.doc.docstatus === 0) {
			frm.add_custom_button(__("Fetch Employees"), () =>
				tif_call_bulk_method(frm, "fetch_employees", {
					freeze_message: __("Fetching employees..."),
					on_success: (r) => {
						const total = r.message?.total_employees ?? 0;
						frappe.show_alert({
							message: __("Fetched {0} employee(s).", [total]),
							indicator: "green",
						});
					},
				})
			);

			const payment_label = frm.doc.pay_via_payment_entry
				? frm.doc.create_payment_entry
					? __("Create Journal Entry + Payment Entry")
					: __("Create Bonus Payments")
				: __("Create Additional Salaries");

			frm.add_custom_button(payment_label, () =>
				tif_call_bulk_method(frm, "create_bonus_payments", {
					freeze_message: __("Creating bonus payments..."),
					on_success: (r) => {
						const created = r.message?.created ?? 0;
						frappe.msgprint(__("Created {0} payment record(s).", [created]));
					},
				})
			);
		}

		if (frm.doc.docstatus === 1 && tif_has_pending_bonus_payments(frm)) {
			frm.add_custom_button(__("Process Pending Payments"), () =>
				tif_call_bulk_method(frm, "process_pending_payments", {
					freeze_message: __("Creating bonus payments..."),
					on_success: (r) => {
						const created = r.message?.created ?? 0;
						frappe.msgprint(__("Created {0} payment record(s).", [created]));
					},
				})
			);
		}

		const grid = frm.get_field("employees")?.grid;
		if (grid && !grid.__tif_download_added) {
			grid.add_custom_button(__("Download CSV"), () => tif_export_bonus_bulk_employees(frm));
			grid.__tif_download_added = true;
		}
	},
});
