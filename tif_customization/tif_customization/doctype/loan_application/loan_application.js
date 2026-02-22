frappe.ui.form.on("Loan Application", {
	refresh(frm) {
		update_leave_summary(frm);
	},
	applicant(frm) {
		update_leave_summary(frm);
	},
	applicant_type(frm) {
		update_leave_summary(frm);
	},
	posting_date(frm) {
		update_leave_summary(frm);
	},
});

function update_leave_summary(frm) {
	if (!frm.doc.applicant) return;

	frappe.call({
		method:
			"tif_customization.tif_customization.doctype.loan_application.loan_application.get_loan_applicant_leave_summary",
		args: {
			applicant_type: frm.doc.applicant_type,
			applicant: frm.doc.applicant,
			posting_date: frm.doc.posting_date,
		},
		callback: function (r) {
			if (!r || !r.message) return;
			frm.set_value("custom_leaves_availed", r.message.summary || "");
			frm.set_value("custom_current_salary", r.message.current_salary || 0);
		},
	});
}
