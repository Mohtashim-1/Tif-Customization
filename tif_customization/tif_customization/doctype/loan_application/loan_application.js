frappe.ui.form.on("Loan Application", {
	refresh(frm) {
		update_leave_summary(frm);
		add_create_loan_button(frm);
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

function add_create_loan_button(frm) {
	if (frm.doc.docstatus !== 1 || frm.is_new()) {
		return;
	}

	const is_approved =
		frm.doc.status === "Approved" || frm.doc.workflow_state === "Approved By CEO";
	if (!is_approved) {
		return;
	}

	frappe.db.get_value(
		"Loan",
		{ loan_application: frm.doc.name, docstatus: ["<", 2] },
		"name",
		(r) => {
			if (r && r.name) {
				return;
			}

			frm.add_custom_button(__("Loan"), () => {
				frappe.call({
					method:
						"tif_customization.tif_customization.doctype.loan_application.loan_application.create_loan_from_application",
					args: { loan_application_name: frm.doc.name },
					freeze: true,
					callback() {
						frm.reload_doc();
					},
				});
			}, __("Create"));
		}
	);
}

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
