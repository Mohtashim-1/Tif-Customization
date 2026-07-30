frappe.listview_settings["Upcoming Training"] = {
	onload(listview) {
		listview.page.add_inner_button(__("Training & Workshop Report"), () => {
			frappe.set_route("upcoming-training-report");
		});
	},
};
