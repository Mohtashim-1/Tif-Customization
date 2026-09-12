frappe.ui.form.on("School Opening Application", {
	refresh(frm) {
		if (frm.doc.docstatus === 1 && frm.doc.customer) {
			frm.add_custom_button(__("Open Customer"), () => {
				frappe.set_route("Form", "Customer", frm.doc.customer);
			});
		}
		if (frm.doc.docstatus === 0) {
			frm.dashboard.set_headline_alert(
				__(
					"Review the guest submission, then Submit to create the ERP Customer (type School)."
				),
				"blue"
			);
		}
	},
});
