frappe.listview_settings["Reporting"] = {
	onload(listview) {
		listview.page.add_inner_button(__("Reporting Report"), () => {
			frappe.set_route("reporting-report");
		});

		const from_date = frappe.datetime.month_start();
		const to_date = frappe.datetime.get_today();
		listview.filter_area.add([
			["Reporting", "posting_date", "Between", [from_date, to_date]],
		]);
	},
};
