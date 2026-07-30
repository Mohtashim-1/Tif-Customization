// Copyright (c) 2026, TIF Customization and contributors
// License: MIT

frappe.query_reports["TIF Staff Early Going"] = {
	filters: [
		{
			fieldname: "year_from",
			label: __("Payroll Year From (July)"),
			fieldtype: "Select",
			options: tif_payroll_year_options(),
			default: String(tif_current_calendar_year() - 1),
			reqd: 1,
		},
		{
			fieldname: "company",
			label: __("Company"),
			fieldtype: "Link",
			options: "Company",
			default: frappe.defaults.get_user_default("Company"),
		},
		{
			fieldname: "branch",
			label: __("Branch"),
			fieldtype: "Link",
			options: "Branch",
		},
		{
			fieldname: "department",
			label: __("Department"),
			fieldtype: "Link",
			options: "Department",
		},
		{
			fieldname: "employee",
			label: __("Employee"),
			fieldtype: "Link",
			options: "Employee",
		},
		{
			fieldname: "employment_type",
			label: __("Employment Type"),
			fieldtype: "Link",
			options: "Employment Type",
		},
		{
			fieldname: "only_active",
			label: __("Active Employees Only"),
			fieldtype: "Check",
			default: 1,
		},
		{
			fieldname: "hide_zero",
			label: __("Hide Staff With Zero Total"),
			fieldtype: "Check",
			default: 0,
		},
	],

	formatter(value, row, column, data, default_formatter) {
		value = default_formatter(value, row, column, data);
		if (data && data.is_group) {
			value = `<span style="font-weight:700;color:#1f2937">${value == null ? "" : value}</span>`;
		}
		return value;
	},

	onload(report) {
		report.page.add_inner_button(__("Export"), () => {
			if (!tif_has_rows(report)) return;
			report.export_report();
		});

		report.page.add_inner_button(__("Print"), () => {
			if (!tif_has_rows(report)) return;
			const dialog = frappe.ui.get_print_settings(
				false,
				(print_settings) => report.print_report(print_settings),
				report.report_doc.letter_head,
				report.get_visible_columns(),
				true
			);
			report.add_portrait_warning(dialog);
		});
	},
};

/** Twelve month columns print badly on an empty run, so stop before opening a dialog. */
function tif_has_rows(report) {
	if ((report.data || []).length) return true;
	frappe.msgprint(__("Run the report first — there is nothing to export or print."));
	return false;
}

function tif_current_calendar_year() {
	return cint(frappe.datetime.get_today().slice(0, 4));
}

/** Payroll years span two calendar years, so offer a window around the current one. */
function tif_payroll_year_options() {
	const current = tif_current_calendar_year();
	const years = [];
	for (let year = current + 1; year >= current - 6; year--) {
		years.push(String(year));
	}
	return years.join("\n");
}
