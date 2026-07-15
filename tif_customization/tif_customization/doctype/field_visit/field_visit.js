// Copyright (c) 2026, mohtashim and contributors
// For license information, please see license.txt

const SCHOOL_TYPES = ["Marketing", "M&E", "Joint Visit with SME", "Training"];
const AFFILIATED_YES = ["Yes - Already Affiliated", "Yes - Newly Registered", "Yes"];

function is_affiliated_yes(value) {
	return AFFILIATED_YES.includes(cstr(value)) || cstr(value).startsWith("Yes");
}

function set_hidden(frm, fields, hidden) {
	(fields || []).forEach((field) => {
		if (frm.fields_dict[field]) {
			frm.set_df_property(field, "hidden", hidden ? 1 : 0);
		}
	});
}

function apply_field_visit_logic(frm) {
	const type = frm.doc.type || "";
	const status = frm.doc.status || "";
	const me_status = frm.doc.me_mqh_book_status || frm.doc.me_activity_status || "";
	const meeting_type = frm.doc.mt_meeting_type || "";
	const task = frm.doc.ot_type_of_task || "";

	const marketing_fields = [
		"section_break_marketing",
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
	];

	const attachment_fields = [
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
		"me_inactive_reasons",
		"me_demand_from_school",
		"me_teachers_training_session",
		"me_number_of_teachers_mqh",
		"me_teachers_mqh_other",
		"me_used_teachers_guide",
		"me_mqh_book_version",
		"me_mqh_book_part",
		"me_classes_per_week",
		"me_class_duration",
		"me_took_assessment",
		"me_student_behavior_changes",
		"me_assessment_taken_from",
		"me_assessment_from_multi",
		"me_changes_made",
		"me_details_of_changes_made",
		"me_new_school_address",
		"me_new_person_name",
		"me_new_person_designation",
		"me_new_person_mobile_number",
		"me_new_person_email",
		"me_school_closed",
	];

	const joint_fields = [
		"section_break_joint",
		"joint_visit_with_smes",
		"joint_sme_skill_rating",
	];

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
		"training_arrange_by",
		"training_conducted_by",
		"training_attendees",
	];

	const meeting_fields = [
		"mt_timestamp",
		"mt_month",
		"mt_quarter",
		"mt_visit_by",
		"mt_meeting_type",
		"mt_meeting_mode",
		"mt_internal_meeting_with",
		"mt_external_meeting_with",
		"mt_agenda",
		"mt_meeting_with_person_name",
		"mt_contact_no",
		"mt_designation",
		"mt_institute_or_organization_name",
		"mt_venue",
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

	const academic_fields = [
		"others_section",
		"ot_type_of_task",
		"ot_academic_task_types",
		"ot_academic_task_other",
		"ot_no_of_pages",
		"ot_no_of_calls",
		"ot_purpose_of_call",
		"ot_follow_up_calls_attach",
		"ot_other_official_task_detail",
		"ot_visit_meeting_detail",
		"ot_hours_spent",
		"ot_remarks",
		"ot_date",
		"ot_start_time",
		"ot_end_time",
	];

	const cocurricular_fields = [
		"section_break_cocurricular",
		"cc_activity",
		"cc_venue",
		"cc_no_of_schools",
		"cc_no_of_participants",
		"cc_participants_category",
	];

	const all_type_fields = [
		...marketing_fields,
		...school_fields,
		...attachment_fields,
		...me_fields,
		...joint_fields,
		...training_fields,
		...meeting_fields,
		...academic_fields,
		...cocurricular_fields,
	];

	// Hide all type-specific fields first
	set_hidden(frm, all_type_fields, true);

	// --- Type sections ---
	if (type === "Marketing") {
		set_hidden(frm, marketing_fields, false);
	}

	if (type === "Joint Visit with SME") {
		// Joint has its own SME fields; also show shared marketing-like visit basics if present
		set_hidden(
			frm,
			[
				"visit_by",
				"month",
				"visit_date",
				"visiting_starting_time",
				"visit_ending_time",
				"city",
				"area",
				"province",
				"school_name",
				"meeting_with",
				"designation",
				"contact_number",
				"school_type",
				"reference",
			],
			false,
		);
		set_hidden(frm, joint_fields, false);
	}

	if (type === "M&E") {
		set_hidden(frm, me_fields, false);
	}

	if (type === "Training") {
		set_hidden(frm, training_fields, false);
	}

	if (type === "Meeting") {
		set_hidden(frm, meeting_fields, false);
	}

	if (type === "Academic / Other Official Tasks" || type === "Other") {
		set_hidden(frm, academic_fields, false);
	}

	if (type === "Co-curricular Activity") {
		set_hidden(frm, cocurricular_fields, false);
	}

	// School + attachments for school-visit types
	if (SCHOOL_TYPES.includes(type)) {
		set_hidden(frm, school_fields, false);
		set_hidden(frm, attachment_fields, false);
	} else if (type) {
		// Meetings / Academic / Co-curricular still get attachments
		set_hidden(frm, attachment_fields, false);
	}

	// --- Nested conditional logic ---

	// Marketing: reasons / follow-up
	const show_not_agree = type === "Marketing" && (status === "Not Agree" || status === "Other");
	set_hidden(frm, ["reason_not_agreed", "reasons_if_not_agreed"], !show_not_agree);
	set_hidden(
		frm,
		["reasons_if_not_agreed_other"],
		!(show_not_agree && (frm.doc.reason_not_agreed === "Other" || frm.doc.reasons_if_not_agreed === "Other")),
	);
	set_hidden(
		frm,
		["school_remarks_follow_up"],
		!(type === "Marketing" && status === "Need follow up visit"),
	);

	// M&E: inactive reasons
	const me_inactive = type === "M&E" && me_status === "In-Active";
	set_hidden(frm, ["me_inactive_reasons", "me_reason_of_above"], !me_inactive);

	// M&E: teachers other
	set_hidden(
		frm,
		["me_teachers_mqh_other"],
		!(type === "M&E" && frm.doc.me_number_of_teachers_mqh === "Others"),
	);

	// M&E: assessment from
	set_hidden(
		frm,
		["me_assessment_taken_from", "me_assessment_from_multi"],
		!(type === "M&E" && frm.doc.me_took_assessment === "Yes"),
	);

	// M&E: TIF office change detail fields (show when any change text present)
	const has_changes = type === "M&E" && cstr(frm.doc.me_changes_made).trim();
	set_hidden(frm, ["me_details_of_changes_made"], !has_changes);
	const changes = cstr(frm.doc.me_changes_made).toLowerCase();
	set_hidden(frm, ["me_new_school_address"], !(type === "M&E" && changes.includes("address")));
	set_hidden(
		frm,
		["me_new_person_name", "me_new_person_designation"],
		!(
			type === "M&E" &&
			(changes.includes("contact person") ||
				changes.includes("contact number") ||
				changes.includes("email") ||
				changes.includes("school name"))
		),
	);
	set_hidden(
		frm,
		["me_new_person_mobile_number"],
		!(type === "M&E" && changes.includes("contact number")),
	);
	set_hidden(frm, ["me_new_person_email"], !(type === "M&E" && changes.includes("email")));

	// Meetings: internal / external with
	const is_internal = type === "Meeting" && meeting_type.includes("Internal Meeting");
	const is_external = type === "Meeting" && meeting_type.includes("External Meeting");
	set_hidden(frm, ["mt_internal_meeting_with"], !is_internal);
	set_hidden(frm, ["mt_external_meeting_with"], !is_external);

	// Academic: task-specific fields
	const is_academic_task = type === "Academic / Other Official Tasks" && task === "Academic Tasks";
	const is_calls = type === "Academic / Other Official Tasks" && task.includes("Follow up Calls");
	const is_other_task = type === "Academic / Other Official Tasks" && task === "Other Official Tasks";
	const is_visit_task =
		type === "Academic / Other Official Tasks" &&
		(task.includes("Head Office") ||
			task.includes("Regional Office") ||
			task.includes("Out of Station") ||
			task.includes("Meeting of Regional Staff"));

	set_hidden(frm, ["ot_academic_task_types", "ot_no_of_pages"], !is_academic_task);
	set_hidden(
		frm,
		["ot_academic_task_other"],
		!(is_academic_task && cstr(frm.doc.ot_academic_task_types).toLowerCase().includes("other")),
	);
	set_hidden(
		frm,
		["ot_no_of_calls", "ot_purpose_of_call", "ot_follow_up_calls_attach"],
		!is_calls,
	);
	set_hidden(frm, ["ot_other_official_task_detail"], !is_other_task);
	set_hidden(frm, ["ot_visit_meeting_detail"], !is_visit_task);

	// School affiliation service matrices
	const show_school = SCHOOL_TYPES.includes(type);
	const show_qps = show_school && is_affiliated_yes(frm.doc.qps_affiliated);
	const show_tps = show_school && is_affiliated_yes(frm.doc.tps_affiliated);
	const show_cee = show_school && is_affiliated_yes(frm.doc.cee_affiliated);

	set_hidden(
		frm,
		[
			"section_break_qps_services",
			"qps_mqh_books",
			"qps_mqh_teachers_guides",
			"qps_meeting_educationalist",
			"qps_onsite_training",
			"qps_online_training",
			"qps_registration_lms",
			"qps_50_days_syllabus",
			"qps_mqh_quiz",
		],
		!show_qps,
	);
	set_hidden(
		frm,
		[
			"section_break_tps_services",
			"tps_noorani_qaida",
			"tps_noorani_qaida_guide",
			"tps_1_day_tajweed_females",
			"tps_ttc_tajweed_khi",
			"tps_tajweed_customize",
		],
		!show_tps,
	);
	set_hidden(
		frm,
		[
			"section_break_cee_services",
			"cee_elp",
			"cee_tecc_foundation",
			"cee_tecc_professional",
			"cee_one_day_workshop",
		],
		!show_cee,
	);
}

frappe.ui.form.on("Field Visit", {
	refresh(frm) {
		apply_field_visit_logic(frm);

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

	type: apply_field_visit_logic,
	status: apply_field_visit_logic,
	reason_not_agreed: apply_field_visit_logic,
	qps_affiliated: apply_field_visit_logic,
	tps_affiliated: apply_field_visit_logic,
	cee_affiliated: apply_field_visit_logic,
	me_mqh_book_status: apply_field_visit_logic,
	me_activity_status: apply_field_visit_logic,
	me_number_of_teachers_mqh: apply_field_visit_logic,
	me_took_assessment: apply_field_visit_logic,
	me_changes_made: apply_field_visit_logic,
	mt_meeting_type: apply_field_visit_logic,
	ot_type_of_task: apply_field_visit_logic,
	ot_academic_task_types: apply_field_visit_logic,
});
