// Age on Healthcare Beneficiary rows (Employee > Health Provider Members)

function set_health_member_age(frm, cdt, cdn) {
	const row = locals[cdt][cdn];
	if (!row.custom_date_of_birth) {
		frappe.model.set_value(cdt, cdn, "custom_age", null);
		return;
	}
	const age = moment().diff(moment(row.custom_date_of_birth), "years");
	frappe.model.set_value(cdt, cdn, "custom_age", age >= 0 ? age : null);
}

frappe.ui.form.on("Healthcare Beneficiary", {
	custom_date_of_birth(frm, cdt, cdn) {
		set_health_member_age(frm, cdt, cdn);
	},
});
