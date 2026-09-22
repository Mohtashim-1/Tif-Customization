frappe.listview_settings["Field Visit"] = {
	onload(listview) {
		listview.page.add_inner_button(__("Easy Form"), () => {
			window.open("/field-visit-easy", "_blank");
		});
	},
};
