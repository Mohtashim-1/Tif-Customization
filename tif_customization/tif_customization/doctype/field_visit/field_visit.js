// Copyright (c) 2026, mohtashim and contributors
// For license information, please see license.txt

const SCHOOL_TYPES = [
	"Marketing",
	"M&E",
	"Joint Visit with SME",
	"Training",
	"Workshop",
	"Teachers Training Meeting",
	"Workshop Arranged",
	"Visits",
	"Registration of New Schools",
	"Enrolment of Volunteers",
	"Model School A",
	"Model School B",
	"Books Demand (Quantity)",
];
const SCHOOL_VISIT_FORM_TYPES = [
	"Marketing",
	"Visits",
	"Registration of New Schools",
	"Enrolment of Volunteers",
	"Model School A",
	"Model School B",
	"Books Demand (Quantity)",
];
const TRAINING_TYPES = ["Training", "Workshop", "Teachers Training Meeting", "Workshop Arranged"];
const MEETING_TYPES = ["Meeting", "Meeting with Ulama and Educationist"];
const COCURRICULAR_TYPES = ["Co-curricular Activity", "Quiz Arranged"];
const ENROLMENT_TYPES = [
	"Enrolment of Participants",
	"Enrolment of Participant in ELP/ TECC/ TTC/ Online Tajweed",
];
const WORKSHOP_ATTENDANCE_TYPES = [
	"Attendance / Registration in One Day / Half day Workshop",
	"Registration of Participant in Workshops",
];
const HIDDEN_TYPE_OPTIONS = [
	"Marketing",
	"M&E",
	"Joint Visit with SME",
	"Training",
	"Meeting",
	"Attendance / Registration in One Day / Half day Workshop",
	"Academic / Other Official Tasks",
	"Academic",
	"Other",
];
const AFFILIATED_YES = ["Yes - Already Affiliated", "Yes - Newly Registered", "Yes"];

const MODEL_SCHOOL_A =
	"Yes - Model School A: (Affiliated atleast 1 Program of all 3 Department of TIF)";
const MODEL_SCHOOL_B =
	"Yes - Model School B: (Affiliated atleast 1 Program of all 2 Department of TIF)";
const MODEL_SCHOOL_NO = "No - This is not a Model School";

function is_affiliated_yes(value) {
	return AFFILIATED_YES.includes(cstr(value)) || cstr(value).startsWith("Yes");
}

function sync_model_school_from_departments(frm) {
	if (!SCHOOL_TYPES.includes(frm.doc.type || "")) {
		return;
	}
	let deptCount = 0;
	if (is_affiliated_yes(frm.doc.qps_affiliated)) {
		deptCount += 1;
	}
	if (is_affiliated_yes(frm.doc.tps_affiliated)) {
		deptCount += 1;
	}
	if (is_affiliated_yes(frm.doc.cee_affiliated)) {
		deptCount += 1;
	}
	let modelSchool = MODEL_SCHOOL_NO;
	if (deptCount >= 3) {
		modelSchool = MODEL_SCHOOL_A;
	} else if (deptCount === 2) {
		modelSchool = MODEL_SCHOOL_B;
	}
	if (frm.doc.model_school !== modelSchool) {
		frm.set_value("model_school", modelSchool);
	}
	if (frm.fields_dict.model_school) {
		frm.set_df_property("model_school", "read_only", 1);
	}
}

function set_hidden(frm, fields, hidden) {
	(fields || []).forEach((field) => {
		if (frm.fields_dict[field]) {
			frm.set_df_property(field, "hidden", hidden ? 1 : 0);
		}
	});
}

let _supervisor_field_visit_access = null;

function fetch_supervisor_field_visit_access(frm, callback) {
	frappe.call({
		method:
			"tif_customization.tif_customization.field_visit_supervisor_only.get_supervisor_field_visit_access",
		args: { name: frm.doc.name || "" },
		callback(r) {
			_supervisor_field_visit_access = r.message || {};
			if (callback) {
				callback();
			}
		},
	});
}

const ENROLMENT_PARTICIPANTS_TYPE = "Enrolment of Participants";
const WORKSHOP_ATTENDANCE_TYPE = "Attendance / Registration in One Day / Half day Workshop";

function sync_field_visit_travel_cost(frm) {
	if (!(frm.doc.type || "").trim()) {
		return;
	}
	frappe.call({
		method: "tif_customization.tif_customization.field_visit_travel_cost.compute_travel_cost",
		args: {
			visit_by: frm.doc.visit_by,
			travel_mode: frm.doc.travel_mode,
			travel_distance_km: frm.doc.travel_distance_km,
		},
		callback(r) {
			const msg = r.message || {};
			if (msg.travel_per_km_rate != null) {
				frm.set_value("travel_per_km_rate", msg.travel_per_km_rate);
			}
			if (msg.auto_cost && msg.travel_cost != null) {
				frm.set_value("travel_cost", msg.travel_cost);
			}
		},
	});
}

function farhan_only_types(access) {
	if (access?.farhan_only_types?.length) {
		return access.farhan_only_types;
	}
	return [ENROLMENT_PARTICIPANTS_TYPE, WORKSHOP_ATTENDANCE_TYPE];
}
const SUPERVISOR_ONLY_ACTIVITY_TYPES_DEFAULT = [
	"Headoffice/ Regional Office/ Out of Station Visit",
	"Academic",
	"Other Official Tasks",
];
const ACADEMIC_LIKE_ACTIVITY_TYPES = [
	"Academic / Other Official Tasks",
	"Academic",
	"Academic Task",
	"Other Official Tasks",
	"Headoffice/ Regional Office/ Out of Station Visit",
];

function supervisor_only_types(access) {
	return access?.supervisor_only_types?.length
		? access.supervisor_only_types
		: SUPERVISOR_ONLY_ACTIVITY_TYPES_DEFAULT;
}

function apply_visible_type_options(frm) {
	if (!frm.fields_dict.type) return;
	const meta = frappe.meta.get_docfield("Field Visit", "type");
	let opts = String(meta?.options || frm.fields_dict.type.df.options || "")
		.split("\n")
		.map((o) => o.trim())
		.filter(Boolean)
		.filter((o) => !HIDDEN_TYPE_OPTIONS.includes(o));
	const current = (frm.doc.type || "").trim();
	if (current && !opts.includes(current)) {
		opts = [current, ...opts];
	}
	frm.set_df_property("type", "options", opts.join("\n"));
}

function apply_supervisor_field_visit_restrictions(frm) {
	const access = _supervisor_field_visit_access || {};
	const can = access.can_manage_supervisor_only;
	const allowed = (access.field_officer_ot_tasks || ["Follow up Calls / Calls to Schools"]).join("\n");
	const blockedTypes = new Set(supervisor_only_types(access));

	const canFarhan = access.can_manage_farhan_only ?? access.can_manage_enrolment_participants;
	const farhanBlocked = new Set(farhan_only_types(access));

	if (access.doc_is_farhan_only && !canFarhan) {
		frm.set_read_only();
		frappe.show_alert(
			{
				message: __(
					"Enrolment of Participants and Half day Workshop attendance can only be edited by Farhan Hussain.",
				),
				indicator: "orange",
			},
			10,
		);
		return;
	}

	if (frm.fields_dict.type && (!canFarhan || !can)) {
		const df = frm.fields_dict.type.df;
		const full = (df.options || "")
			.split("\n")
			.map((o) => o.trim())
			.filter(Boolean);
		if (full.length) {
			let filtered = full;
			if (!canFarhan) {
				filtered = filtered.filter((o) => !farhanBlocked.has(o));
			}
			if (!can) {
				filtered = filtered.filter((o) => !blockedTypes.has(o));
			}
			const current = (frm.doc.type || "").trim();
			if (current && !filtered.includes(current)) {
				filtered = [current, ...filtered];
			}
			frm.set_df_property("type", "options", filtered.join("\n"));
		}
		if (farhanBlocked.has(frm.doc.type) && !canFarhan && !frm.is_new()) {
			frm.set_df_property("type", "read_only", 1);
		}
		if (blockedTypes.has(frm.doc.type) && !can && !frm.is_new()) {
			frm.set_df_property("type", "read_only", 1);
		}
	}

	if (access.doc_is_supervisor_only && !can) {
		frm.set_read_only();
		frappe.show_alert(
			{
				message: __(
					"This visit is a supervisor-only activity (Head office / Academic / Other Official). You cannot edit it.",
				),
				indicator: "orange",
			},
			10,
		);
		return;
	}

	if (!can && frm.fields_dict.ot_type_of_task) {
		frm.set_df_property("ot_type_of_task", "options", allowed);
		const task = frm.doc.ot_type_of_task || "";
		const fo_ok = (access.field_officer_ot_tasks || []).includes(task);
		if (frm.doc.type === "Academic / Other Official Tasks" && task && !fo_ok) {
			frm.set_df_property("ot_type_of_task", "read_only", 1);
		}
	}
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
		"pending_school_name",
		"meeting_with",
		"designation",
		"designation_other",
		"contact_number",
		"school_contacts",
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
		"designation_other",
		"school_contacts",
		"section_break_qps_services",
		"qps_mqh_books",
		"qps_mqh_teachers_guides",
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
		"tps_noorani_qaida_workbook_khi",
		"tps_tajweed_workshop_kids_khi",
		"section_break_cee_services",
		"cee_elp",
		"cee_tecc_foundation",
		"cee_tecc_professional",
		"cee_one_day_workshop",
		"model_school",
		"registered_volunteer",
		"section_break_volunteers",
		"volunteer_enrolments",
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
		"section_break_nazra",
		"me_nazra_quran_status",
		"me_nazra_demand_from_school",
		"me_nazra_tajweed_training",
		"me_nazra_teachers_count",
		"me_nazra_teachers_other",
		"me_nazra_used_teachers_guide",
		"me_nazra_book_taught",
		"me_nazra_classes_per_week",
		"me_nazra_class_duration",
		"me_nazra_took_assessment",
		"me_nazra_tajweed_changes",
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
		"training_workshop_topic",
		"training_mode",
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
		"training_conducted_by_other",
		"section_break_attendees",
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

	const enrolment_fields = ["section_break_enrolment", "enrolment_participants"];

	const workshop_attendance_fields = [
		"section_break_workshop_attendance",
		"workshop_attendees",
	];

	const travel_fields = [
		"section_break_travel",
		"travel_mode",
		"travel_from",
		"travel_to",
		"travel_distance_km",
		"travel_per_km_rate",
		"travel_cost",
		"travel_remarks",
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
		...enrolment_fields,
		...workshop_attendance_fields,
		...travel_fields,
	];

	// Hide all type-specific fields first
	set_hidden(frm, all_type_fields, true);

	// --- Type sections ---
	if (SCHOOL_VISIT_FORM_TYPES.includes(type)) {
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
				"pending_school_name",
				"meeting_with",
				"designation",
				"designation_other",
				"contact_number",
				"school_contacts",
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

	if (TRAINING_TYPES.includes(type)) {
		set_hidden(frm, training_fields, false);
		if (type === "Teachers Training Meeting") {
			set_hidden(frm, ["training_no_of_schools_attended"], true);
			if (cint(frm.doc.training_no_of_schools_attended) !== 1) {
				frm.set_value("training_no_of_schools_attended", 1);
			}
		}
	}

	if (MEETING_TYPES.includes(type)) {
		set_hidden(frm, meeting_fields, false);
	}

	if (ACADEMIC_LIKE_ACTIVITY_TYPES.includes(type) || type === "Other") {
		set_hidden(frm, academic_fields, false);
	}

	if (type === "Co-curricular Activity" || COCURRICULAR_TYPES.includes(type)) {
		set_hidden(frm, cocurricular_fields, false);
	}

	if (ENROLMENT_TYPES.includes(type)) {
		set_hidden(frm, enrolment_fields, false);
	}

	if (WORKSHOP_ATTENDANCE_TYPES.includes(type)) {
		set_hidden(frm, workshop_attendance_fields, false);
	}

	// School + attachments for school-visit types
	if (SCHOOL_TYPES.includes(type)) {
		set_hidden(frm, school_fields, false);
		set_hidden(frm, attachment_fields, false);
		if (type === "M&E") {
			set_hidden(frm, ["registered_volunteer"], false);
			set_hidden(frm, ["section_break_volunteers", "volunteer_enrolments"], true);
		} else if (type !== "Enrolment of Volunteers") {
			set_hidden(
				frm,
				["registered_volunteer", "section_break_volunteers", "volunteer_enrolments"],
				true,
			);
		}
		if (TRAINING_TYPES.includes(type)) {
			set_hidden(
				frm,
				[
					"school_additional_remarks",
					"qps_affiliated",
					"tps_affiliated",
					"cee_affiliated",
					"section_break_qps_services",
					"qps_mqh_books",
					"qps_mqh_teachers_guides",
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
					"tps_noorani_qaida_workbook_khi",
					"tps_tajweed_workshop_kids_khi",
					"section_break_cee_services",
					"cee_elp",
					"cee_tecc_foundation",
					"cee_tecc_professional",
					"cee_one_day_workshop",
					"model_school",
					"registered_volunteer",
					"section_break_volunteers",
					"volunteer_enrolments",
				],
				true,
			);
			set_hidden(
				frm,
				[
					"school_name",
					"meeting_with",
					"designation",
					"designation_other",
					"contact_number",
					"school_contacts",
					"school_address",
					"section_break_school_detail",
				],
				false,
			);
		}
	} else if (type) {
		// Meetings / Academic / Co-curricular / Enrolment / Workshop still get attachments
		set_hidden(frm, attachment_fields, false);
	}

	if (type) {
		set_hidden(frm, travel_fields, false);
	}

	// --- Nested conditional logic ---

	// Marketing: reasons / follow-up
	const show_not_agree =
		SCHOOL_VISIT_FORM_TYPES.includes(type) && (status === "Not Agree" || status === "Other");
	set_hidden(frm, ["reason_not_agreed", "reasons_if_not_agreed"], !show_not_agree);
	set_hidden(
		frm,
		["reasons_if_not_agreed_other"],
		!(show_not_agree && (frm.doc.reason_not_agreed === "Other" || frm.doc.reasons_if_not_agreed === "Other")),
	);
	set_hidden(
		frm,
		["school_remarks_follow_up"],
		!(SCHOOL_VISIT_FORM_TYPES.includes(type) && status === "Need follow up visit"),
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
	set_hidden(
		frm,
		["me_nazra_teachers_other"],
		!(type === "M&E" && frm.doc.me_nazra_teachers_count === "Others"),
	);
	set_hidden(
		frm,
		["training_conducted_by_other"],
		!(TRAINING_TYPES.includes(type) && frm.doc.training_conducted_by === "Other"),
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
	const is_internal = MEETING_TYPES.includes(type) && meeting_type.includes("Internal Meeting");
	const is_external =
		type === "Meeting with Ulama and Educationist" ||
		(MEETING_TYPES.includes(type) && meeting_type.includes("External Meeting"));
	set_hidden(frm, ["mt_internal_meeting_with"], !is_internal);
	set_hidden(frm, ["mt_external_meeting_with"], !is_external);

	// Academic: task-specific fields
	const is_academic_task =
		type === "Academic" ||
		(type === "Academic Task" && (!task || task === "Academic Tasks")) ||
		(type === "Academic / Other Official Tasks" && task === "Academic Tasks");
	const is_calls =
		task.includes("Follow up Calls") &&
		["Academic / Other Official Tasks", "Academic", "Academic Task"].includes(type);
	const is_other_task =
		type === "Other Official Tasks" ||
		(type === "Academic / Other Official Tasks" && task === "Other Official Tasks");
	const is_visit_task =
		type === "Headoffice/ Regional Office/ Out of Station Visit" ||
		(type === "Academic / Other Official Tasks" &&
			(task.includes("Head Office") ||
				task.includes("Regional Office") ||
				task.includes("Out of Station") ||
				task.includes("Meeting of Regional Staff")));

	set_hidden(frm, ["ot_type_of_task"], type !== "Academic / Other Official Tasks");
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
	const show_school = SCHOOL_TYPES.includes(type) && !TRAINING_TYPES.includes(type);
	const show_qps = show_school && is_affiliated_yes(frm.doc.qps_affiliated);
	const show_tps = show_school && is_affiliated_yes(frm.doc.tps_affiliated);
	const show_cee = show_school && is_affiliated_yes(frm.doc.cee_affiliated);

	set_hidden(
		frm,
		[
			"section_break_qps_services",
			"qps_mqh_books",
			"qps_mqh_teachers_guides",
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
			"tps_noorani_qaida_workbook_khi",
			"tps_tajweed_workshop_kids_khi",
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
	set_hidden(
		frm,
		[
			"qps_meeting_educationalist",
			"section_break_participants",
			"participant_names_enrolled",
			"column_break_part",
			"participant_contact_numbers",
		],
		true,
	);

	sync_model_school_from_departments(frm);
}

function _visit_location_defaults(frm, prev_row) {
	const type = frm.doc.type || "";
	if (type === "M&E") {
		return {
			province: (prev_row && prev_row.province) || frm.doc.me_province || "",
			city: (prev_row && prev_row.city) || frm.doc.me_city || "",
		};
	}
	if (TRAINING_TYPES.includes(type)) {
		return {
			province: (prev_row && prev_row.province) || frm.doc.training_province || "",
			city: (prev_row && prev_row.city) || frm.doc.training_city || "",
		};
	}
	return {
		province: (prev_row && prev_row.province) || frm.doc.province || "",
		city: (prev_row && prev_row.city) || frm.doc.city || "",
	};
}

function _training_feedback_defaults(frm, prev_row) {
	return {
		school_organization:
			(prev_row && prev_row.school_organization) ||
			frm.doc.school_name ||
			frm.doc.pending_school_name ||
			frm.doc.me_school_name ||
			"",
		training_venue:
			(prev_row && prev_row.training_venue) || frm.doc.training_venue_name || "",
		training_date: (prev_row && prev_row.training_date) || frm.doc.training_date || "",
		trainer_name:
			(prev_row && prev_row.trainer_name) || frm.doc.training_trainer_name || "",
	};
}

function _enrolment_row_defaults(frm, prev_row) {
	return {
		city: (prev_row && prev_row.city) || frm.doc.city || frm.doc.training_city || "",
		province:
			(prev_row && prev_row.province) || frm.doc.province || frm.doc.training_province || "",
		enroll_in_course: (prev_row && prev_row.enroll_in_course) || "",
		date_of_enrolment:
			(prev_row && prev_row.date_of_enrolment) ||
			frm.doc.visit_date ||
			frm.doc.training_date ||
			frappe.datetime.get_today(),
		other_special_session_name: (prev_row && prev_row.other_special_session_name) || "",
	};
}

function _workshop_row_defaults(frm, prev_row) {
	return {
		school_organization:
			(prev_row && prev_row.school_organization) ||
			frm.doc.school_name ||
			frm.doc.pending_school_name ||
			frm.doc.me_school_name ||
			"",
		training_venue:
			(prev_row && prev_row.training_venue) || frm.doc.training_venue_name || "",
		training_date:
			(prev_row && prev_row.training_date) ||
			frm.doc.training_date ||
			frm.doc.visit_date ||
			frappe.datetime.get_today(),
	};
}

function _prev_child_row(rows, cdn) {
	const list = rows || [];
	if (list.length < 2) return null;
	const idx = list.findIndex((r) => r.name === cdn);
	if (idx > 0) return list[idx - 1];
	return list[list.length - 2] || null;
}

function add_multiple_child_rows(frm, table_field, child_doctype, count, apply_defaults) {
	const n = cint(count) || 1;
	for (let i = 0; i < n; i += 1) {
		const row = frappe.model.add_child(frm.doc, child_doctype, table_field);
		if (apply_defaults) {
			apply_defaults(row, _prev_child_row(frm.doc[table_field], row.name));
		}
	}
	frm.refresh_field(table_field);
}

function setup_city_area_school_queries(frm) {
	const link_opts = { ignore_user_permissions: 1 };
	["city", "me_city", "mt_city", "training_city"].forEach((field) => {
		if (!frm.fields_dict[field]) return;
		frm.set_query(field, () => link_opts);
	});
	const area_city = {
		area: "city",
		me_area: "me_city",
		mt_area: "mt_city",
	};
	Object.entries(area_city).forEach(([area_field, city_field]) => {
		if (!frm.fields_dict[area_field]) return;
		frm.set_query(area_field, () => {
			const filters = {};
			if (frm.doc[city_field]) filters.city = frm.doc[city_field];
			return { filters, ignore_user_permissions: 1 };
		});
	});
	["school_name", "me_school_name"].forEach((field) => {
		if (!frm.fields_dict[field]) return;
		frm.set_query(field, () => ({ ignore_user_permissions: 1 }));
	});
}

function clear_area_if_city_changed(frm, area_field) {
	if (frm.doc[area_field]) {
		frm.set_value(area_field, "");
	}
}

frappe.ui.form.on("Field Visit", {
	onload(frm) {
		apply_visible_type_options(frm);
		setup_city_area_school_queries(frm);
		fetch_supervisor_field_visit_access(frm, () => apply_supervisor_field_visit_restrictions(frm));
	},
	refresh(frm) {
		apply_visible_type_options(frm);
		setup_city_area_school_queries(frm);
		apply_field_visit_logic(frm);
		if ((frm.doc.type || "").trim()) {
			sync_field_visit_travel_cost(frm);
		}
		if (_supervisor_field_visit_access) {
			apply_supervisor_field_visit_restrictions(frm);
		} else {
			fetch_supervisor_field_visit_access(frm, () => apply_supervisor_field_visit_restrictions(frm));
		}

		frm.add_custom_button(__("Open Easy Form"), () => {
			frappe.set_route("smes-activity-form");
		});

		if (TRAINING_TYPES.includes(frm.doc.type)) {
			frm.add_custom_button(
				__("Add Multiple Attendees"),
				() => {
					frappe.prompt(
						[
							{
								fieldname: "count",
								fieldtype: "Int",
								label: __("Number of rows to add"),
								default: 5,
								reqd: 1,
							},
						],
						(values) => {
							add_multiple_child_rows(
								frm,
								"training_attendees",
								"Training Attendee",
								values.count,
								(row, prev) => {
									Object.assign(row, _training_feedback_defaults(frm, prev));
								},
							);
						},
						__("Add Multiple Attendees"),
						__("Add"),
					);
				},
				__("Training"),
			);

			if (!frm.is_new()) {
				frm.add_custom_button(
					__("View Feedback"),
					() => {
						frappe.set_route("List", "Training Attendee Feedback", {
							field_visit: frm.doc.name,
						});
					},
					__("Training"),
				);
			}

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

		if (["Marketing", "M&E", "Joint Visit with SME", ...TRAINING_TYPES].includes(frm.doc.type)) {
			frm.add_custom_button(
				__("Add Multiple Volunteers"),
				() => {
					frappe.prompt(
						[
							{
								fieldname: "count",
								fieldtype: "Int",
								label: __("Number of teachers / volunteers to add"),
								default: 5,
								reqd: 1,
							},
						],
						(values) => {
							add_multiple_child_rows(
								frm,
								"volunteer_enrolments",
								"Field Visit Volunteer",
								values.count,
								(row, prev) => {
									Object.assign(row, _visit_location_defaults(frm, prev));
									if (!row.volunteer_form_submitted) {
										row.volunteer_form_submitted = "No";
									}
								},
							);
						},
						__("Add Multiple Volunteers"),
						__("Add"),
					);
				},
				__("Volunteers"),
			);
		}

		if (ENROLMENT_TYPES.includes(frm.doc.type)) {
			frm.add_custom_button(
				__("Add Multiple Teachers"),
				() => {
					frappe.prompt(
						[
							{
								fieldname: "count",
								fieldtype: "Int",
								label: __("Number of teachers / participants to add"),
								default: 5,
								reqd: 1,
							},
						],
						(values) => {
							add_multiple_child_rows(
								frm,
								"enrolment_participants",
								"Field Visit Enrolment Participant",
								values.count,
								(row, prev) => {
									Object.assign(row, _enrolment_row_defaults(frm, prev));
								},
							);
						},
						__("Add Multiple Teachers"),
						__("Add"),
					);
				},
				__("Enrolment"),
			);
		}

		if (WORKSHOP_ATTENDANCE_TYPES.includes(frm.doc.type)) {
			frm.add_custom_button(
				__("Add Multiple Teachers"),
				() => {
					frappe.prompt(
						[
							{
								fieldname: "count",
								fieldtype: "Int",
								label: __("Number of teachers to add"),
								default: 5,
								reqd: 1,
							},
						],
						(values) => {
							add_multiple_child_rows(
								frm,
								"workshop_attendees",
								"Field Visit Workshop Attendee",
								values.count,
								(row, prev) => {
									Object.assign(row, _workshop_row_defaults(frm, prev));
								},
							);
						},
						__("Add Multiple Teachers"),
						__("Add"),
					);
				},
				__("Workshop"),
			);
		}
	},

	type(frm) {
		apply_field_visit_logic(frm);
		const access = _supervisor_field_visit_access || {};
		const canFarhan = access.can_manage_farhan_only ?? access.can_manage_enrolment_participants;
		const farhanBlocked = new Set(farhan_only_types(access));
		if (frm.doc.type && farhanBlocked.has(frm.doc.type) && !canFarhan) {
			frappe.msgprint({
				title: __("Restricted activity"),
				message: __("Only Farhan Hussain can use this activity type."),
				indicator: "red",
			});
			frm.set_value("type", "");
			return;
		}
		const blocked = new Set(supervisor_only_types(access));
		if (frm.doc.type && blocked.has(frm.doc.type) && !access.can_manage_supervisor_only) {
			frappe.msgprint({
				title: __("Supervisor activity"),
				message: __(
					"Head office / Regional / Out of station, Academic, and Other Official Tasks can only be recorded by a Field Supervisor.",
				),
				indicator: "red",
			});
			frm.set_value("type", "");
			return;
		}
		apply_supervisor_field_visit_restrictions(frm);
	},
	status: apply_field_visit_logic,
	city(frm) {
		clear_area_if_city_changed(frm, "area");
	},
	me_city(frm) {
		clear_area_if_city_changed(frm, "me_area");
	},
	mt_city(frm) {
		clear_area_if_city_changed(frm, "mt_area");
	},
	reason_not_agreed: apply_field_visit_logic,
	qps_affiliated: apply_field_visit_logic,
	tps_affiliated: apply_field_visit_logic,
	cee_affiliated: apply_field_visit_logic,
	me_mqh_book_status: apply_field_visit_logic,
	me_activity_status: apply_field_visit_logic,
	me_number_of_teachers_mqh: apply_field_visit_logic,
	me_nazra_teachers_count: apply_field_visit_logic,
	me_took_assessment: apply_field_visit_logic,
	me_changes_made: apply_field_visit_logic,
	mt_meeting_type: apply_field_visit_logic,
	ot_type_of_task(frm) {
		apply_field_visit_logic(frm);
		apply_supervisor_field_visit_restrictions(frm);
	},
	training_conducted_by: apply_field_visit_logic,

	travel_mode(frm) {
		sync_field_visit_travel_cost(frm);
	},
	travel_distance_km(frm) {
		sync_field_visit_travel_cost(frm);
	},
	visit_by(frm) {
		sync_field_visit_travel_cost(frm);
	},

	volunteer_enrolments_add(frm, cdt, cdn) {
		const row = locals[cdt][cdn];
		const prev = _prev_child_row(frm.doc.volunteer_enrolments, cdn);
		Object.assign(row, _visit_location_defaults(frm, prev));
		if (!row.volunteer_form_submitted) {
			row.volunteer_form_submitted = "No";
		}
		frm.refresh_field("volunteer_enrolments");
	},

	training_attendees_add(frm, cdt, cdn) {
		const row = locals[cdt][cdn];
		const prev = _prev_child_row(frm.doc.training_attendees, cdn);
		Object.assign(row, _training_feedback_defaults(frm, prev));
		frm.refresh_field("training_attendees");
	},

	enrolment_participants_add(frm, cdt, cdn) {
		const row = locals[cdt][cdn];
		const prev = _prev_child_row(frm.doc.enrolment_participants, cdn);
		Object.assign(row, _enrolment_row_defaults(frm, prev));
		frm.refresh_field("enrolment_participants");
	},

	workshop_attendees_add(frm, cdt, cdn) {
		const row = locals[cdt][cdn];
		const prev = _prev_child_row(frm.doc.workshop_attendees, cdn);
		Object.assign(row, _workshop_row_defaults(frm, prev));
		frm.refresh_field("workshop_attendees");
	},
});
