// Copyright (c) 2026, mohtashim and contributors
// For license information, please see license.txt

function set_fields_visibility(frm) {
	const type = frm.doc.type;
	const marketing_fields = [
		'timestamp',
		'month',
		'quarter',
		'visit_by',
		'marketing_visit_category',
		'frequency_of_visits',
		'visit_date',
		'visiting_starting_time',
		'visit_ending_time',
		'city',
		'area',
		'province',
		'school_type',
		'school_name',
		'meeting_with',
		'designation',
		'contact_number',
		'marketing_material_provided',
		'reference',
		'status',
		'reasons_if_not_agreed'
	];

	const me_fields = [
		'me_timestamp',
		'me_month',
		'me_quarter',
		'me_visit_by',
		'me_visit_date',
		'me_starting_date',
		'me_starting_time',
		'me_city',
		'me_area',
		'me_province',
		'me_school_name',
		'me_meeting_with_person_name',
		'me_designation_meeting_with',
		'me_contact_no_meeting_with',
		'me_activity_status',
		'me_mqh_book_status',
		'me_reason_of_above',
		'me_teachers_training_session',
		'me_number_of_teachers_mqh',
		'me_used_teachers_guide',
		'me_mqh_book_version',
		'me_classes_per_week',
		'me_class_duration',
		'me_took_assessment',
		'me_student_behavior_changes',
		'me_changes_made',
		'me_details_of_changes_made',
		'me_new_school_address',
		'me_new_person_name',
		'me_new_person_designation',
		'me_new_person_mobile_number',
		'me_new_person_email',
		'me_assessment_taken_from',
		'me_school_closed'
	];

	const other_fields = [
		'me_timestamp',
		'me_month',
		'me_quarter',
		'me_visit_by',
		'me_visit_date',
		'me_starting_date',
		'me_starting_time',
		'me_city',
		'me_area',
		'me_province',
		'me_school_name',
		'me_meeting_with_person_name',
		'me_designation_meeting_with',
		'me_contact_no_meeting_with',
		'me_activity_status',
		'me_mqh_book_status',
		'me_reason_of_above',
		'me_teachers_training_session',
		'me_number_of_teachers_mqh',
		'me_used_teachers_guide',
		'me_mqh_book_version',
		'me_classes_per_week',
		'me_class_duration',
		'me_took_assessment',
		'me_student_behavior_changes',
		'me_changes_made',
		'me_details_of_changes_made',
		'me_new_school_address',
		'me_new_person_name',
		'me_new_person_designation',
		'me_new_person_mobile_number',
		'me_new_person_email',
		'me_assessment_taken_from',
		'me_school_closed'
	];

	const training_fields = [
		'training_timestamp',
		'training_month',
		'training_quarter',
		'training_session_category',
		'training_school_category',
		'training_date',
		'training_trainer_name',
		'training_entry_filled_by',
		'training_city',
		'training_province',
		'training_venue_name',
		'training_no_of_participants',
		'training_no_of_schools_attended'
	];

	const hide_all = () => {
		[...marketing_fields, ...me_fields, ...training_fields].forEach(field => {
			frm.set_df_property(field, 'hidden', 1);
		});
	};

	hide_all();

	if (type === 'Marketing') {
		marketing_fields.forEach(field => frm.set_df_property(field, 'hidden', 0));
	} else if (type === 'M&E') {
		me_fields.forEach(field => frm.set_df_property(field, 'hidden', 0));
	} else if (type === 'Training') {
		training_fields.forEach(field => frm.set_df_property(field, 'hidden', 0));
	}
	else if (type === 'Other') {
		other_fields.forEach(field => frm.set_df_property(field, 'hidden', 0));
	}
}

frappe.ui.form.on('Field Visit', {
	refresh(frm) {
		set_fields_visibility(frm);
	},
	type(frm) {
		set_fields_visibility(frm);
	}
});
