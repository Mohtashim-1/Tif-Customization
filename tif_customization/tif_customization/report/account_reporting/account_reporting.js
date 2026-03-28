// Copyright (c) 2026, mohtashim and contributors
// For license information, please see license.txt

frappe.query_reports["Account Reporting"] = {
	"filters": [
		{
			fieldname: "company",
			label: __("Company"),
			fieldtype: "Link",
			options: "Company",
			reqd: 1,
			default: frappe.defaults.get_user_default("Company"),
		},
		{
			fieldname: "from_date",
			label: __("From Date"),
			fieldtype: "Date",
			reqd: 1,
			default: frappe.datetime.add_months(frappe.datetime.get_today(), -1),
		},
		{
			fieldname: "to_date",
			label: __("To Date"),
			fieldtype: "Date",
			reqd: 1,
			default: frappe.datetime.get_today(),
		},
		{
			fieldname: "group_by",
			label: __("Group By"),
			fieldtype: "Select",
			reqd: 1,
			default: "Department",
			options: ["Department", "Head", "Department & Head"].join("\n"),
		},
		{
			fieldname: "periodicity",
			label: __("Periodicity"),
			fieldtype: "Select",
			reqd: 1,
			default: "Monthly",
			options: ["Monthly", "Quarterly", "Half-Yearly", "Yearly"].join("\n"),
		},
		{
			fieldname: "department",
			label: __("Department (Cost Center)"),
			fieldtype: "Link",
			options: "Cost Center",
		},
		{
			fieldname: "include_child_cost_centers",
			label: __("Include Child Departments"),
			fieldtype: "Check",
			default: 1,
			depends_on: "eval:doc.department",
		},
		{
			fieldname: "account",
			label: __("Head (Account)"),
			fieldtype: "Link",
			options: "Account",
		},
		{
			fieldname: "include_child_accounts",
			label: __("Include Child Accounts"),
			fieldtype: "Check",
			default: 1,
			depends_on: "eval:doc.account",
		},
		{
			fieldname: "show_opening",
			label: __("Show Opening"),
			fieldtype: "Check",
			default: 1,
		},
		{
			fieldname: "show_dr_cr",
			label: __("Show Debit/Credit"),
			fieldtype: "Check",
			default: 1,
		},
		{
			fieldname: "include_cancelled",
			label: __("Include Cancelled Entries"),
			fieldtype: "Check",
			default: 0,
		},
	]
};
