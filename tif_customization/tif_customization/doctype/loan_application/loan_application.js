const LOAN_ASSIGNMENT_DEBUG_PREFIX = "[Loan Application Assignment]";

frappe.ui.form.on("Loan Application", {
	refresh(frm) {
		update_leave_summary(frm);
		add_create_loan_button(frm);
		reload_assignment_sidebar(frm);
		log_loan_assignment_debug(frm, "refresh", false);
	},
	after_save(frm) {
		refresh_loan_assignment_ui(frm, "after_save");
	},
	after_workflow_action(frm) {
		refresh_loan_assignment_ui(frm, "after_workflow_action");
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

function refresh_loan_assignment_ui(frm, trigger) {
	setTimeout(() => {
		log_loan_assignment_debug(frm, trigger, true);
	}, 300);
}

function reload_assignment_sidebar(frm) {
	if (frm.is_new() || !frm.doc.name || !frm.assign_to) {
		return;
	}

	frappe.call({
		method:
			"tif_customization.tif_customization.doctype.loan_application.loan_application.get_loan_application_sidebar_assignments",
		args: { loan_application_name: frm.doc.name },
		callback(r) {
			const assignments = (r && r.message) || [];
			frm.get_docinfo().assignments = assignments;
			frm.assign_to.render(assignments);
		},
	});
}

function log_loan_assignment_debug(frm, trigger, resync = false) {
	if (frm.is_new() || !frm.doc.name) {
		console.info(LOAN_ASSIGNMENT_DEBUG_PREFIX, {
			trigger,
			message: "New unsaved document — assignment starts after workflow Submit.",
			workflow_state: frm.doc.workflow_state,
		});
		return;
	}

	frappe.call({
		method:
			"tif_customization.tif_customization.doctype.loan_application.loan_application.debug_loan_application_assignment",
		args: {
			loan_application_name: frm.doc.name,
			resync: resync ? 1 : 0,
		},
		callback(r) {
			const debug = (r && r.message) || {};
			console.info(`${LOAN_ASSIGNMENT_DEBUG_PREFIX} ${frm.doc.name} (${trigger})`, {
				workflow_state: debug.workflow_state,
				assignment_stage: debug.assignment_stage,
				stage_mapped: debug.stage_mapped,
				employee: debug.employee,
				reports_to: debug.reports_to,
				hod_user: debug.hod_user,
				open_todos_before: debug.open_todos_before || [],
				sync_result: debug.sync_result || null,
				open_todos_after: debug.open_todos_after || [],
			});
			reload_assignment_sidebar(frm);
			if (!debug.stage_mapped && debug.workflow_state && debug.workflow_state !== "Draft") {
				console.warn(
					LOAN_ASSIGNMENT_DEBUG_PREFIX,
					"No assignment stage mapped for workflow state:",
					debug.workflow_state
				);
			}
		},
		error(err) {
			console.error(LOAN_ASSIGNMENT_DEBUG_PREFIX, trigger, err);
		},
	});
}

function add_create_loan_button(frm) {
	if (frm.doc.docstatus !== 1 || frm.is_new()) {
		return;
	}

	const is_approved =
		frm.doc.status === "Approved" ||
		["Approved", "Approved By CEO", "Approved by Accounts"].includes(frm.doc.workflow_state);
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
