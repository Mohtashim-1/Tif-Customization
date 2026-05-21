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
				row.status,
				row.remarks,
			].map(tif_csv_escape)
		);
	}

	const safe_name = (frm.doc.name || "leave-encashment-bulk").replace(/[^a-z0-9_-]+/gi, "-");
	tif_download_csv(`leave-encashment-bulk-employees-${safe_name}.csv`, rows);
}

frappe.ui.form.on("Leave Encashment Bulk", {
	refresh(frm) {
		if (frm.doc.docstatus === 0) {
			frm.add_custom_button(__("Fetch Employees"), () => {
				return frm.call("fetch_employees").then((r) => {
					const total = r?.message?.total_employees ?? frm.doc.total_employees ?? 0;
					frappe.show_alert({ message: __("Fetched {0} employee(s).", [total]), indicator: "green" });
					return frm.reload_doc();
				});
			});

			frm.add_custom_button(__("Create Leave Encashments"), () => {
				return frm.call("create_leave_encashments").then((r) => {
					const created = r?.message?.created ?? 0;
					frappe.msgprint(__("Created {0} Leave Encashment record(s).", [created]));
					return frm.reload_doc();
				});
			});
		}

		const grid = frm.get_field("employees")?.grid;
		if (grid && !grid.__tif_download_added) {
			grid.add_custom_button(__("Download CSV"), () => tif_export_leave_encashment_bulk_employees(frm));
			grid.__tif_download_added = true;
		}
	},
});
