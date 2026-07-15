// Copyright (c) 2026, mohtashim and contributors
// For license information, please see license.txt

const SCHOOL_TYPES = ["Marketing", "M&E", "Joint Visit with SME"];

function set_fields_visibility(frm) {
	const type = frm.doc.type;
	const marketing_fields = [
		"timestamp",
		"month",
		"quarter",
		"visit_by",
		"marketing_visit_category",
		"frequency_of_visits",
		"visit_date",
		"visiting_starting_time",
		"visit_ending_time",
		"city",
		"area",
		"province",
		"school_type",
		"school_name",
		"meeting_with",
		"designation",
		"contact_number",
		"marketing_material_provided",
		"reference",
		"status",
		"reason_not_agreed",
		"reasons_if_not_agreed",
		"reasons_if_not_agreed_other",
		"school_remarks_follow_up",
	];

	const school_fields = [
		"section_break_school_detail",
		"school_address",
		"school_additional_remarks",
		"qps_affiliated",
		"tps_affiliated",
		"cee_affiliated",
		"section_break_qps_services",
		"qps_mqh_books",
		"qps_mqh_teachers_guides",
		"qps_meeting_educationalist",
		"qps_onsite_training",
		"qps_online_training",
		"qps_registration_lms",
		"qps_50_days_syllabus",
		"qps_mqh_quiz",
		"section_break_tps_services",
		"tps_noorani_qaida",
		"tps_noorani_qaida_guide",
		"tps_1_day_tajweed_females",
		"tps_ttc_tajweed_khi",
		"tps_tajweed_customize",
		"section_break_cee_services",
		"cee_elp",
		"cee_tecc_foundation",
		"cee_tecc_professional",
		"cee_one_day_workshop",
		"section_break_participants",
		"participant_names_enrolled",
		"participant_contact_numbers",
		"model_school",
		"registered_volunteer",
		"section_break_attachments",
		"meeting_picture",
		"school_picture",
		"visiting_card_attach",
		"attendance_sheet_attach",
		"training_awareness_pictures",
		"attendance_sheet_excel",
	];

	const me_fields = [
		"me_timestamp",
		"me_month",
		"me_quarter",
		"me_visit_by",
		"me_visit_date",
		"me_starting_date",
		"me_starting_time",
		"me_city",
		"me_area",
		"me_province",
		"me_school_name",
		"me_meeting_with_person_name",
		"me_designation_meeting_with",
		"me_contact_no_meeting_with",
		"me_activity_status",
		"me_mqh_book_status",
		"me_reason_of_above",
		"me_teachers_training_session",
		"me_number_of_teachers_mqh",
		"me_used_teachers_guide",
		"me_mqh_book_version",
		"me_classes_per_week",
		"me_class_duration",
		"me_took_assessment",
		"me_student_behavior_changes",
		"me_changes_made",
		"me_details_of_changes_made",
		"me_new_school_address",
		"me_new_person_name",
		"me_new_person_designation",
		"me_new_person_mobile_number",
		"me_new_person_email",
		"me_assessment_taken_from",
		"me_school_closed",
	];

	const other_fields = ["ot_remarks", "ot_date", "ot_start_time", "ot_end_time"];

	const training_fields = [
		"training_timestamp",
		"training_month",
		"training_quarter",
		"training_session_category",
		"training_school_category",
		"training_date",
		"training_trainer_name",
		"training_entry_filled_by",
		"training_city",
		"training_province",
		"training_venue_name",
		"training_no_of_participants",
		"training_no_of_schools_attended",
	];

	const meeting_fields = [
		"mt_timestamp",
		"mt_month",
		"mt_quarter",
		"mt_visit_by",
		"mt_agenda",
		"mt_meeting_with_person_name",
		"mt_contact_no",
		"mt_designation",
		"mt_institute_or_organization_name",
		"mt_meeting_date",
		"mt_city",
		"mt_area",
		"mt_meeting_starting_time",
		"mt_meeting_ending_time",
		"mt_mqh_sample_provided",
		"mt_reference",
		"mt_visiting_card",
		"mt_meeting_picture",
		"mt_remarks",
	];

	const all_type_fields = [
		...marketing_fields,
		...school_fields,
		...me_fields,
		...training_fields,
		...meeting_fields,
		...other_fields,
	];

	all_type_fields.forEach((field) => {
		if (frm.fields_dict[field]) frm.set_df_property(field, "hidden", 1);
	});

	if (type === "Marketing" || type === "Joint Visit with SME") {
		marketing_fields.forEach((field) => {
			if (frm.fields_dict[field]) frm.set_df_property(field, "hidden", 0);
		});
	}
	if (SCHOOL_TYPES.includes(type)) {
		school_fields.forEach((field) => {
			if (frm.fields_dict[field]) frm.set_df_property(field, "hidden", 0);
		});
	}
	if (type === "M&E") {
		me_fields.forEach((field) => {
			if (frm.fields_dict[field]) frm.set_df_property(field, "hidden", 0);
		});
	} else if (type === "Training") {
		training_fields.forEach((field) => {
			if (frm.fields_dict[field]) frm.set_df_property(field, "hidden", 0);
		});
	} else if (type === "Meeting") {
		meeting_fields.forEach((field) => {
			if (frm.fields_dict[field]) frm.set_df_property(field, "hidden", 0);
		});
	} else if (type === "Other" || type === "Academic / Other Official Tasks" || type === "Co-curricular Activity") {
		other_fields.forEach((field) => {
			if (frm.fields_dict[field]) frm.set_df_property(field, "hidden", 0);
		});
	}
}

frappe.ui.form.on("Field Visit", {
	refresh(frm) {
		set_fields_visibility(frm);

		frm.add_custom_button(__("Open Easy Form"), () => {
			frappe.set_route("smes-activity-form");
		});

		if (frm.doc.type === "Training" && !frm.is_new()) {
			frm.add_custom_button(
				__("View Feedback"),
				() => {
					frappe.set_route("List", "Training Attendee Feedback", { field_visit: frm.doc.name });
				},
				__("Training"),
			);

			if (frm.doc.docstatus === 1) {
				frm.add_custom_button(
					__("Show Feedback Links"),
					() => {
						frappe.call({
							method: "tif_customization.tif_customization.api.training_feedback_portal.get_training_feedback_links",
							args: { field_visit: frm.doc.name },
							callback(r) {
								const links = r.message || [];
								if (!links.length) {
									frappe.msgprint(
										__("No feedback links yet. Submit the Field Visit with attendees first."),
									);
									return;
								}

								const rows = links
									.map(
										(row) => `
								<tr>
									<td>${frappe.utils.escape_html(row.attendee_name || "")}</td>
									<td>${frappe.utils.escape_html(row.email || "")}</td>
									<td>${row.feedback_submitted ? __("Yes") : __("No")}</td>
									<td style="word-break: break-all;">
										<a href="${row.feedback_link}" target="_blank">${frappe.utils.escape_html(row.feedback_link)}</a>
									</td>
								</tr>
							`,
									)
									.join("");

								const dialog = new frappe.ui.Dialog({
									title: __("Training Feedback Links"),
									size: "large",
									fields: [
										{
											fieldtype: "HTML",
											fieldname: "links_html",
											options: `
										<div class="table-responsive">
											<table class="table table-bordered table-sm">
												<thead>
													<tr>
														<th>${__("Attendee")}</th>
														<th>${__("Email")}</th>
														<th>${__("Submitted")}</th>
														<th>${__("Feedback Link")}</th>
													</tr>
												</thead>
												<tbody>${rows}</tbody>
											</table>
										</div>
									`,
										},
									],
								});
								dialog.show();
							},
						});
					},
					__("Training"),
				);

				frm.add_custom_button(
					__("Send Feedback Links"),
					() => {
						frappe.call({
							method: "tif_customization.tif_customization.api.training_feedback_portal.send_training_feedback_invitations",
							args: { field_visit: frm.doc.name },
							freeze: true,
							callback(r) {
								if (r.message) {
									frappe.show_alert({
										message: r.message.message,
										indicator: "green",
									});
									frm.reload_doc();
								}
							},
						});
					},
					__("Training"),
				);
			}
		}
	},
	type(frm) {
		set_fields_visibility(frm);
	},
	status(frm) {
		set_fields_visibility(frm);
	},
	qps_affiliated(frm) {
		set_fields_visibility(frm);
	},
	tps_affiliated(frm) {
		set_fields_visibility(frm);
	},
	cee_affiliated(frm) {
		set_fields_visibility(frm);
	},
});
