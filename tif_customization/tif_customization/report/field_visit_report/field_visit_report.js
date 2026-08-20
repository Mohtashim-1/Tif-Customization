// Copyright (c) 2026, TIF Customization and contributors
// License: MIT

frappe.query_reports["Field Visit Report"] = {
	filters: [
		{
			fieldname: "from_date",
			label: __("From Date"),
			fieldtype: "Date",
			default: frappe.datetime.month_start(),
			reqd: 1,
		},
		{
			fieldname: "to_date",
			label: __("To Date"),
			fieldtype: "Date",
			default: frappe.datetime.get_today(),
			reqd: 1,
		},
		{
			fieldname: "type",
			label: __("Visit Type"),
			fieldtype: "Select",
			options: [
				"",
				"Marketing",
				"M&E",
				"Joint Visit with SME",
				"Training",
				"Meeting",
				"Academic / Other Official Tasks",
				"Co-curricular Activity",
				"Enrolment of Participants",
				"Attendance / Registration in One Day / Half day Workshop",
				"Other",
			].join("\n"),
		},
		{
			fieldname: "city",
			label: __("City"),
			fieldtype: "Link",
			options: "City",
		},
		{
			fieldname: "province",
			label: __("Province"),
			fieldtype: "Select",
			options: [
				"",
				"Punjab",
				"Sindh",
				"Khyber Pakhtunkhwa",
				"Balochistan",
				"Azad Jammu & Kashmir",
				"Gilgit-Baltistan",
				"Islamabad Capital Territory",
			].join("\n"),
		},
		{
			fieldname: "docstatus",
			label: __("Status"),
			fieldtype: "Select",
			options: "\nDraft\nSubmitted\nCancelled",
			default: "Submitted",
		},
		{
			fieldname: "employee",
			label: __("Field Officer"),
			fieldtype: "Link",
			options: "Employee",
			get_query() {
				return {
					query:
						"tif_customization.tif_customization.report.field_visit_report.field_visit_report.employee_query",
				};
			},
		},
		{
			fieldname: "school_name",
			label: __("School / Organization"),
			fieldtype: "Data",
		},
	],

	formatter(value, row, column, data, default_formatter) {
		value = default_formatter(value, row, column, data);
		if (column.fieldname === "name" && data && data.name) {
			value = `<a href="/app/field-visit/${encodeURIComponent(data.name)}">${frappe.utils.escape_html(
				data.name
			)}</a>`;
		}
		// Attach / image paths → openable links
		if (
			data &&
			value &&
			typeof data[column.fieldname] === "string" &&
			String(data[column.fieldname]).startsWith("/files/")
		) {
			const path = data[column.fieldname];
			value = `<a href="${frappe.utils.escape_html(path)}" target="_blank">${frappe.utils.escape_html(
				path.split("/").pop()
			)}</a>`;
		}
		return value;
	},

	onload(report) {
		frappe.call({
			method: "tif_customization.tif_customization.field_visit_permissions.get_my_field_team",
			callback(r) {
				const msg = r.message || {};
				const view_all = cint(msg.view_all);
				const team = msg.team || [];
				const emp_filter = report.get_filter("employee");

				if (view_all) {
					report.page.set_indicator(
						__("Manager view — pick Field Officer to filter, or leave blank for all."),
						"blue"
					);
					if (emp_filter) {
						emp_filter.df.hidden = 0;
						emp_filter.refresh();
					}
				} else if (team.length > 1) {
					report.page.set_indicator(
						__("Team lead view — Field Officer list shows your team only."),
						"blue"
					);
					if (emp_filter) {
						emp_filter.df.hidden = 0;
						emp_filter.refresh();
					}
				} else {
					report.page.set_indicator(
						__("Field user view — only your own Field Visits are shown."),
						"orange"
					);
					if (emp_filter) {
						emp_filter.df.hidden = 1;
						emp_filter.set_input("");
						emp_filter.refresh();
					}
				}
			},
		});

		report.page.add_inner_button(__("Open Field Visits"), () => {
			frappe.set_route("List", "Field Visit");
		});

		report.page.add_inner_button(__("Export Excel"), () => {
			if (!(report.data || []).length) {
				frappe.msgprint(__("Run the report first."));
				return;
			}
			report.export_report();
		});
	},
};
