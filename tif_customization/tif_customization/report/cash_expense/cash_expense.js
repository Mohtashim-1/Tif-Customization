// Copyright (c) 2026, The Ilm Foundation and contributors
// License: MIT

frappe.query_reports["Cash Expense"] = {
	filters: [
		{
			fieldname: "company",
			label: __("Company"),
			fieldtype: "Link",
			options: "Company",
			default: frappe.defaults.get_user_default("Company") || "The ILM Foundation",
			reqd: 1,
		},
		{
			fieldname: "from_date",
			label: __("From Date"),
			fieldtype: "Date",
			default: frappe.defaults.get_user_default("year_start_date") || "2026-07-01",
			reqd: 1,
		},
		{
			fieldname: "to_date",
			label: __("To Date"),
			fieldtype: "Date",
			default: frappe.defaults.get_user_default("year_end_date") || "2027-06-30",
			reqd: 1,
		},
		{
			fieldname: "account",
			label: __("Cash Account"),
			fieldtype: "Link",
			options: "Account",
			default: "PETTY CASH - TIF",
			reqd: 1,
			get_query: function () {
				return {
					filters: {
						company: frappe.query_report.get_filter_value("company"),
						account_type: "Cash",
						is_group: 0,
					},
				};
			},
		},
		{
			fieldname: "cost_center",
			label: __("Cost Center"),
			fieldtype: "Link",
			options: "Cost Center",
			get_query: function () {
				return {
					filters: {
						company: frappe.query_report.get_filter_value("company"),
						is_group: 0,
					},
				};
			},
		},
	],
};
