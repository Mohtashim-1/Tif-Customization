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
	refresh(frm) {
		

		if (frm.doc.docstatus === 0) {
			frm.add_custom_button(__("Fetch Employees"), () => {
				return frm.call("fetch_employees").then((r) => {
					const total = r?.message?.total_employees ?? frm.doc.total_employees ?? 0;
					frappe.show_alert({ message: __("Fetched {0} employee(s).", [total]), indicator: "green" });
					return frm.reload_doc();
				});
			});

			frm.add_custom_button(__("Create Additional Salaries"), () => {
				return frm.call("create_additional_salaries").then((r) => {
					const created = r?.message?.created ?? 0;
					frappe.msgprint(__("Created {0} Additional Salary record(s).", [created]));
					frm.refresh();
				});
			});
		}

		const grid = frm.get_field("employees")?.grid;
		if (grid && !grid.__tif_download_added) {
			grid.add_custom_button(__("Download CSV"), () => tif_export_bonus_bulk_employees(frm));
			grid.__tif_download_added = true;
		}
	},
});
