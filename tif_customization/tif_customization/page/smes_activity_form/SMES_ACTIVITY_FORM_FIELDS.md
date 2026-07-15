# SMEs Activity Form — Fields & Logic

DocType: **Field Visit**  
Portal: `/app/smes-activity-form`  
Source form: Google Form *SMEs Activities Form 2026–27*

---

## Portal flow (section routing)

Master control field: **Type of Activity** (`type` on Field Visit / `activity_type` on portal)

| Type of Activity (portal label) | Field Visit `type` | Next steps |
|---|---|---|
| Marketing Visit | `Marketing` | Marketing → School Detail → Attachments |
| M&E Visit | `M&E` | M&E → School Detail → Attachments |
| Joint Visit with SME (Only for Supervisor) | `Joint Visit with SME` | Joint → School Detail → Attachments |
| Trainings & Workshops / Teachers Training Meeting | `Training` | Training → School Detail → Attachments |
| Meetings | `Meeting` | Meetings → Attachments *(skip school)* |
| Academic / Other Official Tasks / Calls | `Academic / Other Official Tasks` | Academic → Attachments *(skip school)* |
| Co-curricular Activity | `Co-curricular Activity` | Co-curricular → Attachments *(skip school)* |

```
General
   └─ if Marketing / M&E / Joint / Training → Activity section → School Detail → Attachments
   └─ if Meetings / Academic / Co-curricular → Activity section → Attachments
```

---

## 1. General Information (always)

| Fieldname | Label | Type | Options / Source | Logic |
|---|---|---|---|---|
| `visit_by` | Name of Staff | Data / Select | Active Field Officer / Field Staff | Required |
| `month` | Month | Select | Jan–Dec | Required |
| `visit_date` | Date | Date | — | Required |
| `type` | Type of Activity | Select | See routing table | Required — drives all section logic |
| `visiting_starting_time` / `starting_time` | Starting Time | Time | — | Optional |
| `visit_ending_time` / `ending_time` | Ending Time | Time | — | Optional |
| `city` | City | Link | City | Required |
| `area` | Area | Link | Area (filtered by city) | Required |
| `province` | Province | Select | Sindh, Punjab, KPK, Balochistan, AJK, GB, ICT | Required |

---

## 2. Marketing Visit

**Show when:** `type == Marketing`

| Fieldname | Label | Type | Options | Logic |
|---|---|---|---|---|
| `frequency_of_visits` | Frequency of Visits | Select | New, 1st–4th Follow up visit, Other Visits | Required |
| `marketing_material_provided` | Does Marketing Material Provided? | Check / Yes-No | Yes / No | Required |
| `status` | Status | Select | Agree, Not Agree, Need follow up visit, Will Discuss with Higher Management, Other | Required |
| `reason_not_agreed` | Reasons if not Agreed | Select | Books from other publishers…, Unavailability of Teacher, Lengthy Course, Shortage of time, Sect Issue, Will start in new session, Other | Show if `status` in (`Not Agree`, `Other`) |
| `reasons_if_not_agreed` | Reasons If Not Agreed (details) | Small Text | — | Same as above (extra detail) |
| `reasons_if_not_agreed_other` | Other Reason | Small Text | — | Show if reason = `Other` |
| `school_remarks_follow_up` | School Remarks (If Need Follow up visit) | Small Text | — | Show if `status == Need follow up visit` |

Then → **School Related Detail** → **Attachments**

---

## 3. M&E Visit

**Show when:** `type == M&E`

| Fieldname | Label | Type | Options | Logic |
|---|---|---|---|---|
| `me_mqh_book_status` | Mutalae Quran Hakeem Book Status (M&E) | Select | Active, In-Active | Required |
| `me_inactive_reasons` | Reason of Above (In-Active) | Small Text (multi) | See list A | Show if status = `In-Active` |
| `me_reason_of_above` | Reason of Above | Small Text | — | Same condition (legacy mirror) |
| `me_demand_from_school` | Did you received demand from School? | Select | Yes (Please fill separate demand form), No | Required |
| `me_teachers_training_session` | Has any Teachers Training Session Occurred in School? | Select | Yes, No | Required |
| `me_number_of_teachers_mqh` | Number of Teachers designated for MQH | Select | 1–10, Others | Required |
| `me_teachers_mqh_other` | Number of Teachers (Other) | Data | — | Show if teachers = `Others` |
| `me_used_teachers_guide` | Did you use the Teacher's Guide of MQH for Teaching? | Select | Yes, No | Required |
| `me_mqh_book_version` | Which Version / Language… | Select | See list B | Required |
| `me_mqh_book_part` | Which Part of Mutalae Quran-e-Hakeem Book Taught? | Select | Part-1…Part-7, Other | Required |
| `me_classes_per_week` | How many classes allocated per week for MQH? | Select | 1–5 | Required |
| `me_class_duration` | Duration of Class (in Minutes) | Select | 20–60 Minutes (5-min steps) | Required |
| `me_took_assessment` | Does the teacher conduct assessments for this course? | Select | Yes, No | Required |
| `me_student_behavior_changes` | Students' behavior changes | Select | No Change, Minor Change, Major Change | Required |
| `me_assessment_from_multi` / `me_assessment_taken_from` | From whom have you taken assessment? | Multi | Principal, Class Teacher, Management…, Students | Show if assessment = `Yes` |
| `me_changes_made` | What changes have been Made? | Multi | School Name, Contact Person, Contact Number, Address, Email | Optional |
| `me_details_of_changes_made` | Details of Changes Made | Small Text | — | Show if any change selected |
| `me_new_school_address` | New School Address | Data | — | Show if changes include `Address` |
| `me_new_person_name` | New Person Name | Data | — | Show if Contact Person / Number / Email |
| `me_new_person_designation` | New Person Designation | Data | — | Same |
| `me_new_person_mobile_number` | New Person Mobile Number | Data | — | Show if Contact Number |
| `me_new_person_email` | New Person Email | Data | — | Show if Email |

**List A — Inactive reasons:**  
Books not receive or late delivery of books · Books from other publishers have replaced MQH · Change of Management · Unavailability of Teacher · Untrained Teachers · Change in Government Policy · Sect issue · Lengthy Course · Shortage of time · Course Permanently Stop due to Parents Request · School closed · Stop due to Negative Propaganda · Others

**List B — Book versions:**  
Urdu Original Version · KPK Edition · English Version · Sindhi Version · Braille · Punjab Edition · Balochistan Edition · AJK Edition

Then → **School Related Detail** → **Attachments**

---

## 4. Joint Visit with SME

**Show when:** `type == Joint Visit with SME`

| Fieldname | Label | Type | Options | Logic |
|---|---|---|---|---|
| `joint_visit_with_smes` | Visit with (SME Name) | Small Text (multi) | Active SME / Field Officer names | Required |
| `joint_sme_skill_rating` | SME Skill / Professional Level | Select | Excellent… / Good… / Average… / Poor… | Required |

Then → **School Related Detail** → **Attachments**

---

## 5. Trainings & Workshops

**Show when:** `type == Training`

| Fieldname | Label | Type | Options | Logic |
|---|---|---|---|---|
| `training_arrange_by` | Training Arrange By | Small Text (multi) | SME name list | Required |
| `training_conducted_by` | Training Conducted By | Data / Select | Fixed trainers + SME list | Required |
| `training_session_category` | Training Category | Select | Full Day Session, Half Day Workshop, Teachers Training Meeting (One to One), Awareness Session | Required |
| `training_venue_name` | Venue Name | Data | — | Required |
| `training_no_of_participants` | No. of participants | Int / Data | — | Required |
| `training_no_of_schools_attended` | No. of Schools Attended | Int / Data | — | Required |

Also existing Training section fields (`training_month`, `training_date`, `training_city`, attendees table, etc.) show on Desk when type = Training.

Then → **School Related Detail** → **Attachments**

---

## 6. Meetings

**Show when:** `type == Meeting`  
**Does not** open School Detail (goes to Attachments).

| Fieldname | Label | Type | Options | Logic |
|---|---|---|---|---|
| `mt_meeting_type` | Meeting Type | Select | Internal Meeting (Meeting with TIF Staff), External Meeting (Meeting with Others), Invitation of Personalities to the Head Office, Invitation of Personalities to the Regional Office | Required |
| `mt_meeting_mode` | Meeting Mode | Select | Online, Onsite / In Person | Required |
| `mt_internal_meeting_with` | Internal Meeting with | Select | Regional Office Staff / Supervisors, Meeting with SMEs, Head Office Staff | Show if type = Internal Meeting… |
| `mt_external_meeting_with` | External Meeting with | Select | Ulma Karam, Educationalist, Owner / Director of Chain of School, Govt officials, Influential Personalities, Social Media Activist, Teachers Training | Show if type = External Meeting… |
| `mt_meeting_with_person_name` | Name of Person | Data | — | Optional |
| `mt_contact_no` | Contact Number | Data | — | Optional |
| `mt_venue` | Venue of Meeting | Data | — | Optional |
| `mt_remarks` | Meeting Detail / Remarks | Small Text | — | Optional |

Then → **Attachments**

---

## 7. Academic / Other Official Tasks

**Show when:** `type == Academic / Other Official Tasks`  
**Does not** open School Detail.

| Fieldname | Label | Type | Options | Logic |
|---|---|---|---|---|
| `ot_type_of_task` | Type of Task | Select | Academic Tasks, Head Office Visit, Regional Office Visit, Out of Station Visit, Meeting of Regional Staff (Supervisors) and SMEs, Follow up Calls / Calls to Schools, Other Official Tasks | Required |
| `ot_academic_task_types` | Type of Academic Tasks | Multi | Typing, Proofreading, Review, Matching, Correction, Formatting, Designing, Translation, Other | Show if task = `Academic Tasks` |
| `ot_academic_task_other` | Other Academic Task | Data | — | Show if Academic Tasks includes `Other` |
| `ot_no_of_pages` | No of Pages | Data | — | Show if Academic Tasks |
| `ot_no_of_calls` | No of Calls / No Follow up Calls | Data | — | Show if Follow up Calls… |
| `ot_purpose_of_call` | Purpose of Call | Data | — | Show if Follow up Calls… |
| `ot_follow_up_calls_attach` | Follow up Call Details Sheet | Attach | — | Show if Follow up Calls… |
| `ot_other_official_task_detail` | Detail of other Official Task | Small Text | — | Show if Other Official Tasks |
| `ot_visit_meeting_detail` | Detail of HO / Regional / Out of Station / Meeting… | Small Text | — | Show if Head Office / Regional / Out of Station / Meeting of Regional Staff |
| `ot_hours_spent` | Hours Spent… | Select | 1–8 Hours, Full Day | Required always in this section |

Then → **Attachments**

---

## 8. Co-curricular Activities

**Show when:** `type == Co-curricular Activity`  
**Does not** open School Detail.

| Fieldname | Label | Type | Options | Logic |
|---|---|---|---|---|
| `cc_activity` | Co-curricular Activities | Select | Arrange Quiz in School, Inter School Quiz Competition, Conduct / Arrange Demo Class, Introduce TIF in School Functions, Introduce TIF in Exhibition | Required |
| `cc_venue` | Venue of Co-curricular Activities | Data | — | Optional |
| `cc_no_of_schools` | No of Schools regarding Co-curricular Activities | Data | — | Optional |
| `cc_no_of_participants` | No of Participants regarding Co-curricular Activities | Data | — | Optional |
| `cc_participants_category` | Participants Category… | Multi | Higher management of school, Teachers, Students, Parents, General public | Optional |

Then → **Attachments**

---

## 9. School Related Detail

**Show when:** `type` in (`Marketing`, `M&E`, `Joint Visit with SME`, `Training`)

| Fieldname | Label | Type | Options | Logic |
|---|---|---|---|---|
| `school_name` | School Name | Data | — | Required |
| `meeting_with` / contact person | Contact Person Name | Data | — | Optional |
| `contact_number` | Contact Number | Data | — | Optional |
| `designation` | Designation | Select | Owner, Director, Principal, Admin, Coordinator, Teacher, Receptionist | Required (portal) |
| `school_address` | School Address | Small Text | — | Required |
| `school_type` | School Type | Select | Individual School, Chains of School | Required |
| `reference` | Reference | Data | — | Optional |
| `school_additional_remarks` | Any Additional Remarks regarding School | Small Text | — | Optional |
| `qps_affiliated` | Is this school affiliated with QPS? | Select | Yes - Already Affiliated, Yes - Newly Registered, No - Not Affiliated | Required |
| QPS service Yes/No fields | Which QPS services… | Select Yes/No each | MQH Books, Teachers Guides, Meeting with Educationalist…, Onsite/Online Training, LMS, 50 Days Syllabus, MQH Quiz | Show if QPS starts with `Yes` |
| `tps_affiliated` | Is this school affiliated with TPS? | Select | Same 3 affiliation options | Required |
| TPS service Yes/No fields | Which TPS services… | Select Yes/No | Noorani Qaida, Guide, 1 Day Tajweed, TTC, Customize Course | Show if TPS starts with `Yes` |
| `cee_affiliated` | Affiliated with Teachers Training Dept (CEE)? | Select | Same 3 affiliation options | Required |
| CEE service Yes/No fields | Which CEE services… | Select Yes/No | ELP, TECC Foundation, TECC Professional, One Day Workshop | Show if CEE starts with `Yes` |
| `participant_names_enrolled` | Name of Participant enrolled… | Small Text | — | Optional |
| `participant_contact_numbers` | Contact Number of Above Participant(s) | Data | — | Optional |
| `model_school` | Is this a Model School | Select | Model School A / B / No | Optional |
| `registered_volunteer` | Registered with TIF as a Volunteer | Select | Yes, No | Required |

### QPS fields
`qps_mqh_books`, `qps_mqh_teachers_guides`, `qps_meeting_educationalist`, `qps_onsite_training`, `qps_online_training`, `qps_registration_lms`, `qps_50_days_syllabus`, `qps_mqh_quiz`

### TPS fields
`tps_noorani_qaida`, `tps_noorani_qaida_guide`, `tps_1_day_tajweed_females`, `tps_ttc_tajweed_khi`, `tps_tajweed_customize`

### CEE fields
`cee_elp`, `cee_tecc_foundation`, `cee_tecc_professional`, `cee_one_day_workshop`

---

## 10. Attachments

**Show when:** any activity type is selected

| Fieldname | Label | Type |
|---|---|---|
| `meeting_picture` | Meeting Picture | Attach Image |
| `school_picture` | School Picture | Attach Image |
| `visiting_card_attach` | Visiting Card | Attach |
| `attendance_sheet_attach` | Attendance Sheet (Not any other Pictures) | Attach |
| `training_awareness_pictures` | Pictures of Training & Awareness Session | Attach |
| `attendance_sheet_excel` | MS Excel of Attendance Sheet | Attach |

---

## Nested logic summary (quick)

| Driver field | Value | Shows |
|---|---|---|
| `type` | Marketing | Marketing fields + School + Attachments |
| `type` | M&E | M&E fields + School + Attachments |
| `type` | Joint Visit with SME | Joint fields + School + Attachments |
| `type` | Training | Training fields + School + Attachments |
| `type` | Meeting | Meeting fields + Attachments |
| `type` | Academic / Other Official Tasks | Academic fields + Attachments |
| `type` | Co-curricular Activity | Co-curricular fields + Attachments |
| `status` | Not Agree / Other | Reason fields |
| `status` | Need follow up visit | School remarks |
| `me_mqh_book_status` | In-Active | Inactive reasons |
| `me_number_of_teachers_mqh` | Others | Other teachers text |
| `me_took_assessment` | Yes | Assessment from |
| `me_changes_made` | Address / Contact… | New address / person fields |
| `mt_meeting_type` | Internal… | Internal meeting with |
| `mt_meeting_type` | External… | External meeting with |
| `ot_type_of_task` | Academic Tasks | Academic work types + pages |
| `ot_type_of_task` | Follow up Calls… | Calls + purpose + attach |
| `ot_type_of_task` | Other Official Tasks | Other detail |
| `ot_type_of_task` | HO / Regional / Out of Station / Meeting… | Visit/meeting detail |
| `qps_affiliated` / `tps_` / `cee_` | Yes - Already… / Yes - Newly… | Matching service Yes/No matrix |

---

## Code locations

| Piece | Path |
|---|---|
| Portal UI | `page/smes_activity_form/smes_activity_form.js` |
| Portal API / meta / submit | `page/smes_activity_form/smes_activity_form.py` |
| Desk form logic | `doctype/field_visit/field_visit.js` |
| DocType fields | `doctype/field_visit/field_visit.json` |
