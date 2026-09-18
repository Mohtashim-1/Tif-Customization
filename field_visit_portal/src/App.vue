<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import Bi from "./components/Bi.vue";
import FieldInput from "./components/FieldInput.vue";
import FieldSelect from "./components/FieldSelect.vue";
import FieldLink from "./components/FieldLink.vue";
import FieldTextarea from "./components/FieldTextarea.vue";
import FieldDate from "./components/FieldDate.vue";
import FieldTime from "./components/FieldTime.vue";
import SectionTitle from "./components/SectionTitle.vue";
import AttachDrop from "./components/AttachDrop.vue";
import { apiGet, apiPost, uploadFile, METHOD, TRAVEL_METHOD } from "./lib/api";
import {
	ACTIVITY_CARDS,
	QUARTER_OPTIONS,
	TRAVEL_MODE_UR,
	cardsForUser,
	currentMonthName,
	currentQuarter,
	karachiClock,
	resolveActivityType,
	todayISO,
} from "./lib/activities";

const boot = window.field_visit_portal_boot || {};
const step = ref(1);
const lang = ref("both");
const clock = ref("");
const loading = ref(true);
const saving = ref(false);
const error = ref("");
const success = ref(false);
const savedName = ref("");
const showParticipant = ref(false);
const selectedId = ref("");
const meta = ref({
	staff_name: "",
	staff_employee: "",
	staff_options: [],
	activity_types: [],
	customers: [],
	cities: [],
	areas: [],
	months: [],
	enrolment_courses: [],
	travel_modes: [],
	provinces: [],
	province_options_full: [],
	academic_task_types: [],
	book_titles: [],
	today: todayISO(),
	can_manage_farhan_only: false,
	can_manage_supervisor_only: false,
	frequencies: [],
	statuses: [],
	school_types: [],
	designations: [],
	affiliation_options: [],
	marketing_visit_categories: [],
	qps_services: [],
	tps_services: [],
	cee_services: [],
	not_agree_reasons: [],
});

const meeting = reactive({
	meetingWith: "",
	contactNo: "",
	designation: "",
	institute: "",
	instituteLabel: "",
	meetingDate: todayISO(),
	city: "",
	area: "",
	startTime: "10:00",
	endTime: "11:00",
	agenda: "",
	remarks: "",
	mutalaeSample: false,
	frequency: "New",
	status: "Need follow up visit",
});

const visit = reactive({
	month: currentMonthName(),
	quarter: currentQuarter(),
	visitBy: "",
	marketingVisitCategory: "",
	status: "",
	schoolAddress: "",
	schoolAdditionalRemarks: "",
	qpsAffiliated: "",
	tpsAffiliated: "",
	ceeAffiliated: "",
	frequency: "",
	designation: "",
	designationOther: "",
	city: "",
	marketingMaterial: false,
	area: "",
	startTime: "10:00",
	endTime: "11:00",
	visitDate: todayISO(),
	province: "Punjab",
	schoolType: "",
	schoolName: "",
	schoolNameLabel: "",
	contactNumber: "",
	meetingWith: "",
	reference: "",
	reasonsIfNotAgreed: "",
	services: {},
});
const schoolContacts = ref([
	{ id: "1", person_name: "", contact_number: "", designation: "", designation_other: "" },
]);

const training = reactive({
	month: currentMonthName(),
	quarter: currentQuarter(),
	schoolCategory: "Private Schools",
	city: "",
	province: "Punjab",
	noOfSchools: "1",
	date: todayISO(),
	trainerName: "",
	venueName: "",
	entryFilledBy: "",
	noOfParticipants: "",
	trainingCategory: "Teachers Training Meeting (One to One)",
	topics: "",
	mode: "Onsite / In Person",
	otType: "Academic Tasks",
});

const participants = ref([]);
const participantForm = reactive({
	name: "",
	contact: "",
	city: "",
	province: "Punjab",
	course: "",
	date: todayISO(),
	school: "",
});

const books = ref([]);
const travel = reactive({
	needed: true,
	mode: "Own Vehicle / Bike",
	from: "",
	to: "",
	distance: "",
	cost: "",
	perKm: "",
	autoCost: true,
	remarks: "",
});
const attachments = reactive({
	meeting_picture: null,
	school_picture: null,
	visiting_card_attach: null,
	attendance_sheet_attach: null,
	training_awareness_pictures: null,
	attendance_sheet_excel: null,
	card: null,
	meeting: null,
});

const selected = computed(() => ACTIVITY_CARDS.find((c) => c.id === selectedId.value) || null);
const visibleCards = computed(() => cardsForUser(meta.value.activity_types || []));
const customerOptions = computed(() => meta.value.customers || []);
const cityOptions = computed(() => meta.value.cities || []);
const provinceOptions = computed(() => meta.value.province_options_full || meta.value.provinces || []);
const courseOptions = computed(() => meta.value.enrolment_courses || []);
const travelModes = computed(() => meta.value.travel_modes || Object.keys(TRAVEL_MODE_UR));
const bookTitles = computed(() => meta.value.book_titles || ["Noorani Qaida"]);
const areaOptions = computed(() => {
	const city = visit.city || meeting.city || training.city;
	const rows = meta.value.areas || [];
	return rows
		.filter((a) => !city || !a.city || a.city === city)
		.map((a) => ({ value: a.name, label: a.label && a.label !== a.name ? `${a.label}` : a.name }))
		.filter((a) => a.value);
});
const staffOptions = computed(() =>
	(meta.value.staff_options || []).map((s) => s.employee_name || s.employee).filter(Boolean)
);
const staffName = computed(() => visit.visitBy || meta.value.staff_name || boot.full_name || "");
function nonempty(list, fallback) {
	return Array.isArray(list) && list.length ? list : fallback;
}
const marketingCategories = computed(() =>
	nonempty(meta.value.marketing_visit_categories, ["New", "Followup & Other Visits", "TPS Visits"])
);
const frequencyOptions = computed(() =>
	nonempty(meta.value.frequencies, [
		"New",
		"1st Follow up visit",
		"2nd Follow up visit",
		"3rd Follow up visit",
		"4th Follow up visit",
		"Other Visits",
	])
);
const statusOptions = computed(() =>
	nonempty(meta.value.statuses, [
		"Agree",
		"Not Agree",
		"Need follow up visit",
		"Will Discuss with Higher Management",
		"Other",
	])
);
const schoolTypeOptions = computed(() => nonempty(meta.value.school_types, ["Individual School", "Chains of School"]));
const designationOptions = computed(() =>
	nonempty(meta.value.designations, [
		"Owner",
		"Director",
		"Principal",
		"Vice Principal",
		"Admin",
		"Administrator",
		"Incharge",
		"Coordinator",
		"Teacher",
		"Receptionist",
		"Front Desk Officer (FDO)",
		"Other",
	])
);
const affiliationOptions = computed(() =>
	nonempty(meta.value.affiliation_options, [
		"Yes - Already Affiliated",
		"Yes - Newly Registered",
		"No - Not Affiliated",
	])
);
function isAffiliated(val) {
	return ["Yes - Already Affiliated", "Yes - Newly Registered"].includes(val);
}
const travelModeOptions = computed(() =>
	travelModes.value.map((m) => ({
		value: m,
		label: TRAVEL_MODE_UR[m] ? `${m} / ${TRAVEL_MODE_UR[m]}` : m,
	}))
);

let clockTimer;

onMounted(async () => {
	tickClock();
	clockTimer = setInterval(tickClock, 60000);
	try {
		meta.value = { ...meta.value, ...(await apiGet(`${METHOD}.get_form_meta`)) };
		training.entryFilledBy = meta.value.staff_name || training.entryFilledBy;
		training.trainerName = meta.value.staff_name || training.trainerName;
		visit.visitBy = visit.visitBy || meta.value.staff_name || "";
		if (!participantForm.course && courseOptions.value[0]) participantForm.course = courseOptions.value[0];
	} catch (e) {
		error.value = e.message || "Could not load form.";
	} finally {
		loading.value = false;
	}
});

onUnmounted(() => {
	if (clockTimer) clearInterval(clockTimer);
});

function tickClock() {
	clock.value = karachiClock();
}

watch(
	() => [travel.distance, travel.mode, meta.value.staff_name],
	() => refreshTravelCost(),
);

function pickCard(card) {
	selectedId.value = card.id;
	error.value = "";
	setTimeout(() => {
		if (selectedId.value === card.id && step.value === 1) step.value = 2;
	}, 500);
}

async function searchSchools(txt) {
	const rows = await apiGet(`${METHOD}.search_school_customers`, {
		txt: txt || "",
		limit: 80,
	});
	return Array.isArray(rows) ? rows : [];
}

watch(
	() => visit.schoolName,
	async (name) => {
		if (!name) return;
		try {
			const row = await apiGet(`${METHOD}.get_school_customer`, { name });
			if (!row || !row.value) return;
			visit.schoolNameLabel = row.label || visit.schoolNameLabel || name;
			if (row.address && !visit.schoolAddress) visit.schoolAddress = row.address;
			if (row.school_type && !visit.schoolType) visit.schoolType = row.school_type;
			if (row.city && cityOptions.value.includes(row.city) && !visit.city) visit.city = row.city;
		} catch {
			/* ignore */
		}
	},
);

watch(
	() => meeting.institute,
	async (name) => {
		if (!name) return;
		try {
			const row = await apiGet(`${METHOD}.get_school_customer`, { name });
			if (!row || !row.value) return;
			meeting.instituteLabel = row.label || meeting.instituteLabel || name;
			if (row.city && cityOptions.value.includes(row.city) && !meeting.city) meeting.city = row.city;
		} catch {
			/* ignore */
		}
	},
);

async function refreshTravelCost() {
	if (!travel.needed) {
		travel.cost = "";
		return;
	}
	const km = parseFloat(travel.distance);
	if (!km || km <= 0) {
		if (travel.autoCost) travel.cost = "";
		return;
	}
	try {
		const res = await apiGet(`${TRAVEL_METHOD}.compute_travel_cost`, {
			visit_by: staffName.value,
			staff_employee: meta.value.staff_employee,
			travel_mode: travel.mode,
			travel_distance_km: km,
		});
		travel.perKm = res?.travel_per_km_rate || "";
		travel.autoCost = !!res?.auto_cost;
		if (res?.auto_cost) travel.cost = res.travel_cost != null ? String(res.travel_cost) : "";
	} catch {
		/* keep manual */
	}
}

function initials(name) {
	return (name || "")
		.split(" ")
		.map((p) => p[0])
		.filter(Boolean)
		.slice(0, 2)
		.join("")
		.toUpperCase();
}

function addParticipant() {
	if (!participantForm.name || !participantForm.course) return;
	participants.value.push({
		id: String(Date.now()),
		name: participantForm.name,
		contact: participantForm.contact,
		city: participantForm.city || meeting.city || training.city,
		province: participantForm.province,
		course: participantForm.course,
		date: participantForm.date,
		school: participantForm.school,
	});
	participantForm.name = "";
	participantForm.contact = "";
	showParticipant.value = false;
}

function addBook() {
	books.value.push({
		id: String(Date.now()),
		bookName: bookTitles.value[0] || "Noorani Qaida",
		qty: 1,
		school: "",
	});
}

function bookTotal() {
	return books.value.reduce((s, b) => s + (parseInt(b.qty, 10) || 0), 0);
}

function addSchoolContact() {
	schoolContacts.value.push({
		id: String(Date.now()),
		person_name: "",
		contact_number: "",
		designation: "",
		designation_other: "",
	});
}

function removeSchoolContact(id) {
	schoolContacts.value = schoolContacts.value.filter((r) => r.id !== id);
	if (!schoolContacts.value.length) addSchoolContact();
}

function setService(field, value) {
	visit.services = { ...visit.services, [field]: value };
}

function attachField(card) {
	if (card?.group === "training") return "training_awareness_pictures";
	if (card?.group === "enrolment") return "attendance_sheet_attach";
	return "meeting_picture";
}

function buildPayload(submitDoc) {
	const card = selected.value;
	const activityType = resolveActivityType(card, training.otType, meta.value.activity_types || []);
	const visitDate = card?.group === "visits" ? visit.visitDate : meeting.meetingDate || training.date || todayISO();
	const city = card?.group === "visits" ? visit.city : meeting.city || training.city;
	const payload = {
		activity_type: activityType,
		visit_by: staffName.value,
		staff_employee: meta.value.staff_employee,
		month: (card?.group === "visits" ? visit.month : training.month) || currentMonthName(),
		quarter: card?.group === "visits" ? visit.quarter : training.quarter,
		visit_date: visitDate,
		starting_time: card?.group === "visits" ? visit.startTime : meeting.startTime,
		ending_time: card?.group === "visits" ? visit.endTime : meeting.endTime,
		city,
		area: card?.group === "visits" ? visit.area : meeting.area,
		province: card?.group === "visits" ? visit.province : training.province,
		school_name: card?.group === "visits" ? visit.schoolName : meeting.institute || training.venueName,
		contact_person_name: card?.group === "visits" ? visit.meetingWith : meeting.meetingWith,
		contact_number: card?.group === "visits" ? visit.contactNumber : meeting.contactNo,
		designation: card?.group === "visits" ? visit.designation : meeting.designation,
		designation_other: card?.group === "visits" ? visit.designationOther : "",
		school_additional_remarks: card?.group === "visits" ? visit.schoolAdditionalRemarks : meeting.remarks,
		frequency_of_visits: card?.group === "visits" ? visit.frequency : meeting.frequency,
		status: card?.group === "visits" ? visit.status : meeting.status,
		mutalae_sample: meeting.mutalaeSample,
		submit_doc: submitDoc,
	};

	if (travel.needed) {
		payload.travel_mode = travel.mode;
		payload.travel_from = travel.from;
		payload.travel_to = travel.to;
		payload.travel_distance_km = travel.distance ? Number(travel.distance) : null;
		payload.travel_remarks = travel.remarks;
		if (travel.cost !== "") payload.travel_cost = Number(travel.cost);
		if (travel.perKm !== "") payload.travel_per_km_rate = Number(travel.perKm);
	}

	if (card?.group === "visits") {
		payload.marketing_visit_category = visit.marketingVisitCategory;
		payload.school_address = visit.schoolAddress;
		payload.school_type = visit.schoolType;
		payload.reference = visit.reference;
		payload.marketing_material_provided = visit.marketingMaterial;
		payload.qps_affiliated = visit.qpsAffiliated;
		payload.tps_affiliated = visit.tpsAffiliated;
		payload.cee_affiliated = visit.ceeAffiliated;
		payload.reasons_if_not_agreed = visit.reasonsIfNotAgreed;
		payload.school_contacts = schoolContacts.value
			.filter((r) => r.person_name || r.contact_number || r.designation)
			.map((r) => ({
				person_name: r.person_name,
				contact_number: r.contact_number,
				designation: r.designation,
				designation_other: r.designation_other,
			}));
		const firstContact = payload.school_contacts[0];
		if (firstContact) {
			payload.contact_person_name = firstContact.person_name;
			payload.contact_number = firstContact.contact_number;
			payload.designation = firstContact.designation;
			payload.designation_other = firstContact.designation_other;
		}
		Object.assign(payload, visit.services);
	}

	if (card?.group === "meeting") {
		payload.mt_person_name = meeting.meetingWith;
		payload.mt_contact_number = meeting.contactNo;
		payload.mt_venue = meeting.instituteLabel || meeting.institute;
		payload.school_name = meeting.institute;
		payload.mt_meeting_detail = [meeting.agenda, meeting.remarks].filter(Boolean).join("\n");
		payload.mt_meeting_type = "External Meeting (Meeting with Others)";
		payload.mt_external_meeting_with = "Ulma Karam";
		payload.mt_meeting_mode = "Onsite / In Person";
	}

	if (card?.group === "training") {
		payload.training_quarter = training.quarter;
		payload.training_school_category = training.schoolCategory;
		payload.training_session_category = training.trainingCategory;
		payload.training_workshop_topic = training.topics;
		payload.training_mode = training.mode;
		payload.training_trainer_name = training.trainerName || staffName.value;
		payload.training_entry_filled_by = training.entryFilledBy || staffName.value;
		payload.training_venue_name = training.venueName;
		payload.training_no_of_participants = training.noOfParticipants;
		payload.training_no_of_schools = training.noOfSchools;
		payload.city = training.city || city;
		payload.province = training.province;
		payload.visit_date = training.date || visitDate;
		payload.school_name = training.venueName;
	}

	if (card?.group === "academic") {
		payload.ot_type_of_task = training.otType;
		payload.ot_visit_meeting_detail = training.topics || meeting.agenda;
		payload.ot_other_official_task_detail = meeting.remarks;
		payload.city = training.city || city;
		payload.province = training.province;
		payload.visit_date = training.date || visitDate;
	}

	if (card?.id === "enrolment") {
		payload.enrolment_participants = participants.value.map((p) => ({
			participant_name: p.name,
			contact_number: p.contact,
			city: p.city,
			province: p.province,
			enroll_in_course: p.course,
			date_of_enrolment: p.date,
		}));
		payload.training_venue_name = training.venueName;
		payload.training_session_category = training.trainingCategory;
	}

	if (card?.id === "registration") {
		payload.workshop_attendees = participants.value.map((p) => ({
			attendee_name: p.name,
			contact_number: p.contact,
			school_organization: p.school || training.venueName,
			training_venue: training.venueName,
			training_date: p.date,
		}));
	}

	if (card?.group === "books") {
		payload.books_demand = books.value.map((b) => ({
			book_name: b.bookName,
			qty: b.qty,
			school: b.school,
		}));
		if (books.value[0]?.school) payload.school_name = books.value[0].school;
	}

	return payload;
}

async function uploadAttachments(docname) {
	const card = selected.value;
	const jobs = [];
	const map = card?.group === "visits"
		? [
				["meeting_picture", "meeting_picture"],
				["school_picture", "school_picture"],
				["visiting_card_attach", "visiting_card_attach"],
				["attendance_sheet_attach", "attendance_sheet_attach"],
				["training_awareness_pictures", "training_awareness_pictures"],
				["attendance_sheet_excel", "attendance_sheet_excel"],
			]
		: [
				["card", "visiting_card_attach"],
				["meeting", attachField(card)],
			];
	for (const [key, fieldname] of map) {
		if (attachments[key]) {
			jobs.push(uploadFile(attachments[key], { doctype: "Field Visit", docname, fieldname }));
		}
	}
	await Promise.all(jobs);
}

async function saveVisit(submitDoc) {
	error.value = "";
	if (!selected.value) {
		error.value = "Please select an activity type first.";
		return;
	}
	if (!staffName.value) {
		error.value = "Your employee profile is not linked as Field Staff. Ask admin to set user on Employee.";
		return;
	}
	saving.value = true;
	try {
		const result = await apiPost(`${METHOD}.submit_smes_activity`, {
			data: buildPayload(false),
		});
		savedName.value = result.name;
		await uploadAttachments(result.name);
		if (submitDoc) {
			await apiPost(`${METHOD}.submit_field_visit_doc`, { name: result.name });
		}
		success.value = true;
		setTimeout(() => {
			success.value = false;
			resetForm();
		}, 3500);
	} catch (e) {
		error.value = e.message || "Could not save visit.";
	} finally {
		saving.value = false;
	}
}

function resetForm() {
	step.value = 1;
	selectedId.value = "";
	participants.value = [];
	books.value = [];
	attachments.card = null;
	attachments.meeting = null;
	attachments.meeting_picture = null;
	attachments.school_picture = null;
	attachments.visiting_card_attach = null;
	attachments.attendance_sheet_attach = null;
	attachments.training_awareness_pictures = null;
	attachments.attendance_sheet_excel = null;
	schoolContacts.value = [{ id: "1", person_name: "", contact_number: "", designation: "", designation_other: "" }];
	visit.schoolName = "";
	visit.schoolNameLabel = "";
	visit.meetingWith = "";
	visit.contactNumber = "";
	visit.schoolAddress = "";
	visit.schoolAdditionalRemarks = "";
	visit.services = {};
	meeting.meetingWith = "";
	meeting.contactNo = "";
	meeting.institute = "";
	meeting.instituteLabel = "";
	meeting.agenda = "";
	meeting.remarks = "";
	travel.distance = "";
	travel.cost = "";
	savedName.value = "";
}

const steps = [
	{ n: 1, labelEn: "Type of Activity", labelUr: "سرگرمی کی قسم", descEn: "Select", descUr: "منتخب کریں" },
	{ n: 2, labelEn: "Details", labelUr: "تفصیلات", descEn: "Add info", descUr: "معلومات شامل کریں" },
	{ n: 3, labelEn: "Travel & Submit", labelUr: "سفر اور جمع کرائیں", descEn: "Final", descUr: "آخری مرحلہ" },
];
</script>

<template>
	<div>
		<header class="header">
			<div class="wrap header-row">
				<div class="brand">
					<div class="logo">ILM</div>
					<div>
						<div class="brand-title">The ILM Foundation</div>
						<div class="brand-sub">
							<span>FIELD VISIT - EASY FORM</span>
							<span class="urdu" style="font-size: 12px">/ آسان فارم</span>
						</div>
					</div>
				</div>
				<div style="display: flex; align-items: center; gap: 12px">
					<div class="lang-desk">
						<button class="lang-btn" :class="{ on: lang === 'both' }" @click="lang = 'both'">Both / دونوں</button>
						<button class="lang-btn" :class="{ on: lang === 'en' }" @click="lang = 'en'">English</button>
						<button class="lang-btn" :class="{ on: lang === 'ur' }" @click="lang = 'ur'">اردو</button>
					</div>
					<div class="lang-mobile">
						<button class="lang-btn" :class="{ on: lang === 'en' }" @click="lang = 'en'">EN</button>
						<button class="lang-btn both" :class="{ on: lang === 'both' }" @click="lang = 'both'">Both</button>
						<button class="lang-btn urdu" :class="{ on: lang === 'ur' }" @click="lang = 'ur'">اردو</button>
					</div>
					<div class="clock">
						<span class="dot"></span>
						<span>Asia/Karachi {{ clock }}</span>
					</div>
				</div>
			</div>
			<div class="banner">
				<div class="wrap">
					آسان فارم - Easy Form - براہ کرم تمام معلومات اردو اور انگریزی میں سمجھیں • Default: English + Urdu
				</div>
			</div>
		</header>

		<div class="wrap">
			<div class="stepper">
				<template v-for="(s, i) in steps" :key="s.n">
					<div class="step">
						<div class="step-n" :class="{ on: step === s.n, done: step > s.n }">
							{{ step > s.n ? "✓" : s.n }}
						</div>
						<div class="step-label-desk">
							<div class="step-label" :class="{ on: step === s.n }">
								<Bi :mode="lang" :en="s.labelEn" :ur="s.labelUr" />
							</div>
							<div class="step-desc">{{ lang === "ur" ? s.descUr : lang === "en" ? s.descEn : `${s.descEn} / ${s.descUr}` }}</div>
						</div>
					</div>
					<div v-if="i < 2" class="step-line" :class="{ done: step > s.n }"></div>
				</template>
			</div>
		</div>

		<main class="wrap page">
			<div v-if="error" class="error-banner">{{ error }}</div>
			<div v-if="loading" class="hero-p">Loading…</div>

			<section v-else-if="step === 1" class="fade">
				<h1 class="hero">
					Select Activity Type / سرگرمی کی قسم منتخب کریں
					<div class="hero-sub urdu">برائے مہربانی نیچے دیئے گئے کارڈز میں سے ایک کا انتخاب کریں — باقی فیلڈز خود بخود آ جائیں گی</div>
				</h1>
				<p class="hero-p">
					Complex ERPNext form simplified. Choose a card — rest of fields will appear automatically.
					<span class="urdu"> پیچیدہ فارم کو آسان بنایا گیا ہے۔</span>
				</p>
				<div v-if="!visibleCards.length" class="empty">No activity types are available for your login.</div>
				<div class="cards">
					<button
						v-for="card in visibleCards"
						:key="card.id"
						class="card"
						:class="{ selected: selectedId === card.id }"
						@type="button"
						@click="pickCard(card)"
					>
						<div class="card-top">
							<div class="emoji">{{ card.emoji }}</div>
							<span v-if="selectedId === card.id" class="pill">Selected / منتخب</span>
						</div>
						<div class="card-title">
							<template v-if="lang === 'en'">{{ card.titleEn }}</template>
							<div v-else-if="lang === 'ur'" class="urdu" style="font-size: 16px">{{ card.titleUr }}</div>
							<template v-else>
								{{ card.titleEn }}
								<div class="card-title-ur urdu">{{ card.titleUr }}</div>
							</template>
						</div>
						<div class="card-sub">
							<template v-if="lang === 'en'">{{ card.subEn }}</template>
							<span v-else-if="lang === 'ur'" class="urdu">{{ card.subUr }}</span>
							<template v-else>{{ card.subEn }} / {{ card.subUr }}</template>
						</div>
						<div class="card-go">
							<Bi :mode="lang" en="Click to continue" ur="جاری رکھنے کے لیے کلک کریں" /> →
						</div>
					</button>
				</div>
				<div class="tip">
					<div class="tip-ico">💡</div>
					<div>
						<span class="fw">Tip / ٹپ:</span>
						Form auto Asia/Karachi time pe set hai.
						<span class="urdu"> فارم خودکار طور پر کراچی کے وقت پر سیٹ ہے۔</span>
						Aapko Series FV-.MM.-.YY.- jaisa code likhne ki zaroorat nahi — system khud generate kar dega.
						<span class="urdu"> سسٹم خود کوڈ بنا دے گا۔</span>
					</div>
				</div>
			</section>

			<section v-else-if="step === 2 && selected" class="fade">
				<div class="back-row">
					<button class="icon-btn" type="button" @click="step = 1">←</button>
					<div class="emoji" style="background: #0f7a3c; width: 36px; height: 36px; font-size: 18px">{{ selected.emoji }}</div>
					<div>
						<div style="font-weight: 600; font-size: 14px">
							<Bi :mode="lang" :en="selected.titleEn" :ur="selected.titleUr" />
						</div>
						<div style="font-size: 11px; color: #71717a; margin-top: 4px">Step 2 of 3 / مرحلہ 2 از 3</div>
					</div>
					<button class="link-btn" type="button" @click="step = 1">
						<Bi :mode="lang" en="Change activity" ur="سرگرمی تبدیل کریں" />
					</button>
				</div>

				<div class="panel">
					<div class="panel-body" v-if="selected.group === 'visits'">
						<div class="meta-row">
							<div class="readonly-box">
								<div class="k">Type of Activity / سرگرمی کی قسم</div>
								<div class="v">Visits</div>
							</div>
							<div class="readonly-box">
								<div class="k">Series / سیریز</div>
								<div class="v">FV-.MM.-.YY.- <span class="auto">auto</span></div>
							</div>
							<div class="readonly-box">
								<div class="k">Timestamp / وقت</div>
								<div class="v">Asia/Karachi {{ clock }}</div>
							</div>
						</div>

						<SectionTitle :mode="lang" title-en="Visit Details" title-ur="دورے کی تفصیلات" sub-en="Same fields as Field Visit" sub-ur="فیلڈ وزٹ والے تمام فیلڈز" />
						<div class="grid-3">
							<FieldSelect :mode="lang" label-en="Month" label-ur="مہینہ" :options="meta.months" v-model="visit.month" />
							<FieldSelect :mode="lang" label-en="Quarter" label-ur="سہ ماہی" :options="QUARTER_OPTIONS" v-model="visit.quarter" />
							<FieldSelect :mode="lang" label-en="Name of Staff" label-ur="سٹاف کا نام" :options="staffOptions" v-model="visit.visitBy" />
							<FieldSelect :mode="lang" label-en="Marketing Visit Category" label-ur="مارکیٹنگ وزٹ کیٹیگری" :options="marketingCategories" placeholder-en="Select" placeholder-ur="منتخب کریں" v-model="visit.marketingVisitCategory" />
							<FieldSelect :mode="lang" label-en="Frequency of Visits" label-ur="وزٹ کی فریکوئنسی" :options="frequencyOptions" placeholder-en="Select" placeholder-ur="منتخب کریں" v-model="visit.frequency" />
							<FieldSelect :mode="lang" label-en="Status" label-ur="سٹیٹس" :options="statusOptions" placeholder-en="Select" placeholder-ur="منتخب کریں" v-model="visit.status" />
							<FieldDate :mode="lang" label-en="Visit Date" label-ur="وزٹ کی تاریخ" v-model="visit.visitDate" />
							<FieldTime :mode="lang" label-en="Visiting Starting Time" label-ur="آغاز کا وقت" v-model="visit.startTime" />
							<FieldTime :mode="lang" label-en="Visit Ending Time" label-ur="اختتام کا وقت" v-model="visit.endTime" />
							<FieldSelect :mode="lang" label-en="City" label-ur="شہر" :options="cityOptions" placeholder-en="Begin typing for results" placeholder-ur="شہر منتخب کریں" v-model="visit.city" />
							<FieldSelect :mode="lang" label-en="Area" label-ur="علاقہ" :options="areaOptions" placeholder-en="Begin typing for results" placeholder-ur="علاقہ منتخب کریں" v-model="visit.area" />
							<FieldSelect :mode="lang" label-en="Province" label-ur="صوبہ" :options="provinceOptions" v-model="visit.province" />
						</div>
						<FieldSelect
							v-if="visit.status === 'Not Agree' || visit.status === 'Other'"
							:mode="lang"
							label-en="Reasons if not Agreed"
							label-ur="نامنظور کی وجہ"
							:options="meta.not_agree_reasons"
							v-model="visit.reasonsIfNotAgreed"
						/>

						<div class="block-title">School Related Detail / اسکول کی تفصیل</div>
						<div class="grid-2">
							<FieldLink
								:mode="lang"
								label-en="School Name"
								label-ur="اسکول کا نام"
								placeholder="Select school"
								:options="customerOptions"
								:search="searchSchools"
								v-model="visit.schoolName"
								v-model:label="visit.schoolNameLabel"
							/>
							<FieldSelect :mode="lang" label-en="School Type" label-ur="اسکول کی قسم" :options="schoolTypeOptions" placeholder-en="Select" placeholder-ur="منتخب کریں" v-model="visit.schoolType" />
							<FieldTextarea :mode="lang" label-en="School Address" label-ur="اسکول کا پتہ" v-model="visit.schoolAddress" />
							<FieldTextarea :mode="lang" label-en="Any Additional Remarks regarding School" label-ur="اسکول کے بارے میں اضافی ریمارکس" v-model="visit.schoolAdditionalRemarks" />
							<FieldInput :mode="lang" label-en="Reference" label-ur="حوالہ" v-model="visit.reference" />
							<label class="check-row" style="margin-top: 0">
								<input type="checkbox" v-model="visit.marketingMaterial" />
								<div>
									<strong><Bi :mode="lang" en="Does Marketing Material Provided" ur="کیا مارکیٹنگ میٹریل دیا گیا؟" /></strong>
								</div>
							</label>
						</div>

						<div class="block-title">Contact Person / رابطہ شخص</div>
						<div class="table-head">
							<div>
								<div style="font-weight: 600; font-size: 13px"><Bi :mode="lang" en="Contact Persons" ur="رابطہ افراد" /></div>
								<div style="font-size: 11px; color: #71717a">Add one row per person if you met more than one contact.</div>
							</div>
							<button class="btn btn-green" type="button" @click="addSchoolContact">+ Add row</button>
						</div>
						<div class="contact-table">
							<div class="contact-head">
								<div>No.</div>
								<div>Contact Person Name</div>
								<div>Contact Number</div>
								<div>Designation</div>
								<div>Other Designation</div>
								<div></div>
							</div>
							<div v-for="(row, idx) in schoolContacts" :key="row.id" class="contact-row">
								<div class="idx">{{ idx + 1 }}</div>
								<input v-model="row.person_name" placeholder="Name" />
								<input v-model="row.contact_number" placeholder="03XX-" />
								<select v-model="row.designation">
									<option value="">Select</option>
									<option v-for="d in designationOptions" :key="d" :value="d">{{ d }}</option>
								</select>
								<input v-model="row.designation_other" :disabled="row.designation !== 'Other'" placeholder="If Other" />
								<button class="icon-btn" type="button" @click="removeSchoolContact(row.id)">✕</button>
							</div>
						</div>

						<div class="block-title">Affiliation / الحاق</div>
						<div class="grid-1">
							<FieldSelect :mode="lang" label-en="Is this school affiliated with QPS?" label-ur="کیا یہ اسکول QPS سے الحاق شدہ ہے؟" :options="affiliationOptions" placeholder-en="Select" placeholder-ur="منتخب کریں" v-model="visit.qpsAffiliated" />
							<div v-if="isAffiliated(visit.qpsAffiliated)" class="service-grid">
								<div v-for="s in meta.qps_services" :key="s.field" class="service">
									<span>{{ s.label }}</span>
									<select :value="visit.services[s.field] || ''" @change="setService(s.field, $event.target.value)">
										<option value="">—</option>
										<option value="Yes">Yes</option>
										<option value="No">No</option>
									</select>
								</div>
							</div>
							<FieldSelect :mode="lang" label-en="Is this school affiliated with TPS?" label-ur="کیا یہ اسکول TPS سے الحاق شدہ ہے؟" :options="affiliationOptions" placeholder-en="Select" placeholder-ur="منتخب کریں" v-model="visit.tpsAffiliated" />
							<div v-if="isAffiliated(visit.tpsAffiliated)" class="service-grid">
								<div v-for="s in meta.tps_services" :key="s.field" class="service">
									<span>{{ s.label }}</span>
									<select :value="visit.services[s.field] || ''" @change="setService(s.field, $event.target.value)">
										<option value="">—</option>
										<option value="Yes">Yes</option>
										<option value="No">No</option>
									</select>
								</div>
							</div>
							<FieldSelect :mode="lang" label-en="Is this school affiliated with Teachers Training Department (CEE)?" label-ur="کیا یہ اسکول ٹیچرز ٹریننگ ڈیپارٹمنٹ (CEE) سے الحاق شدہ ہے؟" :options="affiliationOptions" placeholder-en="Select" placeholder-ur="منتخب کریں" v-model="visit.ceeAffiliated" />
							<div v-if="isAffiliated(visit.ceeAffiliated)" class="service-grid">
								<div v-for="s in meta.cee_services" :key="s.field" class="service">
									<span>{{ s.label }}</span>
									<select :value="visit.services[s.field] || ''" @change="setService(s.field, $event.target.value)">
										<option value="">—</option>
										<option value="Yes">Yes</option>
										<option value="No">No</option>
									</select>
								</div>
							</div>
						</div>

						<div class="block-title">Attachments / منسلکات</div>
						<div class="attach-grid">
							<AttachDrop :mode="lang" label-en="Meeting Picture" label-ur="ملاقات کی تصویر" :file="attachments.meeting_picture" @pick="attachments.meeting_picture = $event" />
							<AttachDrop :mode="lang" label-en="School Picture" label-ur="اسکول کی تصویر" :file="attachments.school_picture" @pick="attachments.school_picture = $event" />
							<AttachDrop :mode="lang" label-en="Visiting Card" label-ur="وزٹنگ کارڈ" :file="attachments.visiting_card_attach" @pick="attachments.visiting_card_attach = $event" />
							<AttachDrop :mode="lang" label-en="Attendance Sheet" label-ur="حاضری شیٹ" :file="attachments.attendance_sheet_attach" @pick="attachments.attendance_sheet_attach = $event" />
							<AttachDrop :mode="lang" label-en="Pictures of Training & Awareness Session" label-ur="تربیت و آگاہی کی تصاویر" :file="attachments.training_awareness_pictures" @pick="attachments.training_awareness_pictures = $event" />
							<AttachDrop :mode="lang" label-en="MS Excel of Attendance Sheet" label-ur="حاضری کا ایکسل" accept=".xlsx,.xls,.csv" :file="attachments.attendance_sheet_excel" @pick="attachments.attendance_sheet_excel = $event" />
						</div>
					</div>

					<div class="panel-body" v-else-if="selected.group === 'meeting'">
						<SectionTitle
							:mode="lang"
							title-en="Meeting Details"
							title-ur="ملاقات کی تفصیلات"
							sub-en="Basic info required"
							sub-ur="بنیادی معلومات ضروری ہیں"
						/>
						<div class="grid-2">
							<FieldInput :mode="lang" label-en="Meeting With (Person Name) *" label-ur="ملاقات کس سے (شخص کا نام)" placeholder="e.g. Mufti Sahib / مفتی صاحب" v-model="meeting.meetingWith" />
							<FieldInput :mode="lang" label-en="Contact No." label-ur="رابطہ نمبر" placeholder="03XX-XXXXXXX" v-model="meeting.contactNo" />
							<FieldInput :mode="lang" label-en="Designation" label-ur="عہدہ" placeholder="Mohtamim, Principal / مہتمم، پرنسپل" v-model="meeting.designation" />
							<FieldLink
								:mode="lang"
								label-en="Institute / School Name"
								label-ur="ادارہ / اسکول کا نام"
								placeholder="Select customer"
								:options="customerOptions"
								:search="searchSchools"
								v-model="meeting.institute"
								v-model:label="meeting.instituteLabel"
							/>
							<FieldDate :mode="lang" label-en="Date *" label-ur="تاریخ" v-model="meeting.meetingDate" />
							<FieldSelect :mode="lang" label-en="City" label-ur="شہر" :options="cityOptions" placeholder-en="Select city" placeholder-ur="شہر منتخب کریں" v-model="meeting.city" />
							<FieldInput :mode="lang" label-en="Area" label-ur="علاقہ" placeholder="Johar Town" v-model="meeting.area" />
							<div class="grid-2" style="margin-top: 0">
								<FieldTime :mode="lang" label-en="Start Time" label-ur="آغاز کا وقت" v-model="meeting.startTime" />
								<FieldTime :mode="lang" label-en="End Time" label-ur="اختتام کا وقت" v-model="meeting.endTime" />
							</div>
						</div>
						<div class="grid-2" style="margin-top: 24px">
							<FieldTextarea :mode="lang" label-en="Agenda" label-ur="ایجنڈا" placeholder="Purpose of meeting / ملاقات کا مقصد" v-model="meeting.agenda" />
							<FieldTextarea :mode="lang" label-en="Remarks" label-ur="ریمارکس / اگلا قدم" placeholder="Next follow-up?" v-model="meeting.remarks" />
						</div>
						<label class="check-row">
							<input type="checkbox" v-model="meeting.mutalaeSample" />
							<div>
								<strong><Bi :mode="lang" en="Mutalae Quran Sample given?" ur="مطالعہ قرآن کا نمونہ دیا؟" /></strong>
								<span style="font-size: 11px; color: #71717a"> — چیک کریں اگر نمونہ دیا ہے</span>
							</div>
						</label>
						<div style="margin-top: 32px">
							<div style="font-size: 13px; font-weight: 600">Attachments / منسلکات</div>
							<div class="attach-grid">
								<AttachDrop :mode="lang" label-en="Visiting Card" label-ur="وزٹنگ کارڈ" :file="attachments.card" @pick="attachments.card = $event" />
								<AttachDrop :mode="lang" label-en="Meeting / Visit Picture" label-ur="ملاقات کی تصویر" :file="attachments.meeting" @pick="attachments.meeting = $event" />
							</div>
						</div>
					</div>

					<div class="panel-body" v-else-if="selected.group === 'training' || selected.group === 'academic'">
						<SectionTitle
							:mode="lang"
							:title-en="selected.id === 'workshop' ? 'Workshop Details' : selected.group === 'academic' ? 'Official Task Details' : 'Training / Visit Details'"
							:title-ur="selected.id === 'workshop' ? 'ورکشاپ کی تفصیلات' : selected.group === 'academic' ? 'آفیشل ٹاسک کی تفصیلات' : 'تربیت / دورہ کی تفصیلات'"
							:sub-en="`${clock} • Asia/Karachi auto`"
							:sub-ur="`${clock} • خودکار وقت`"
						/>
						<div class="grid-3">
							<FieldSelect v-if="selected.group === 'academic'" :mode="lang" label-en="Type of Task" label-ur="کام کی قسم" :options="meta.academic_task_types" v-model="training.otType" />
							<FieldSelect :mode="lang" label-en="Month" label-ur="مہینہ" :options="meta.months" v-model="training.month" />
							<FieldSelect :mode="lang" label-en="Quarter" label-ur="سہ ماہی" :options="QUARTER_OPTIONS" v-model="training.quarter" />
							<FieldInput v-if="selected.group !== 'academic'" :mode="lang" label-en="School Category" label-ur="اسکول کی کیٹیگری" v-model="training.schoolCategory" />
							<FieldSelect :mode="lang" label-en="City" label-ur="شہر" :options="cityOptions" v-model="training.city" />
							<FieldSelect :mode="lang" label-en="Province" label-ur="صوبہ" :options="provinceOptions" v-model="training.province" />
							<FieldInput v-if="selected.group !== 'academic'" :mode="lang" label-en="No. of Schools" label-ur="اسکولوں کی تعداد" v-model="training.noOfSchools" />
							<FieldDate :mode="lang" label-en="Date" label-ur="تاریخ" v-model="training.date" />
							<FieldInput :mode="lang" label-en="Name of Trainer / Staff" label-ur="ٹرینر / سٹاف کا نام" v-model="training.trainerName" />
							<FieldInput :mode="lang" label-en="Venue Name" label-ur="مقام کا نام" v-model="training.venueName" />
							<FieldInput :mode="lang" label-en="Entry Filled By" label-ur="اندراج کنندہ" v-model="training.entryFilledBy" />
							<FieldInput v-if="selected.group !== 'academic'" :mode="lang" label-en="No. of Participants" label-ur="شرکاء کی تعداد" v-model="training.noOfParticipants" />
							<FieldSelect
								v-if="selected.group !== 'academic'"
								:mode="lang"
								label-en="Training Category"
								label-ur="تربیت کی قسم"
								:options="['Full Day Session', 'Half Day Workshop', 'Teachers Training Meeting (One to One)']"
								v-model="training.trainingCategory"
							/>
						</div>
						<div class="grid-2" style="margin-top: 16px">
							<FieldInput :mode="lang" label-en="Topics / Detail" label-ur="موضوعات / تفصیل" v-model="training.topics" />
							<FieldSelect :mode="lang" label-en="Mode" label-ur="طریقہ" :options="['Onsite / In Person', 'Online', 'Hybrid']" v-model="training.mode" />
						</div>
						<div style="margin-top: 32px">
							<div style="font-size: 13px; font-weight: 600">Attachments / منسلکات</div>
							<div class="attach-grid">
								<AttachDrop :mode="lang" label-en="Pictures" label-ur="تصاویر" :file="attachments.meeting" @pick="attachments.meeting = $event" />
							</div>
						</div>
					</div>

					<div class="panel-body" v-else-if="selected.group === 'enrolment'">
						<div style="display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px">
							<SectionTitle :mode="lang" :title-en="selected.titleEn" :title-ur="selected.titleUr" sub-en="View participants as cards" sub-ur="شرکاء کو کارڈز میں دیکھیں" />
							<button class="btn btn-green" type="button" @click="showParticipant = true">
								<Bi :mode="lang" en="+ Add Participant" ur="شریک شامل کریں" />
							</button>
						</div>
						<div v-if="!participants.length" class="empty">
							<div style="font-size: 28px">👥</div>
							<div style="margin-top: 8px; font-weight: 600">
								<Bi :mode="lang" en="No participants yet" ur="ابھی کوئی شریک نہیں" />
							</div>
							<button class="btn btn-green" style="margin-top: 16px" type="button" @click="showParticipant = true">
								<Bi :mode="lang" en="Add Participant" ur="شریک شامل کریں" />
							</button>
						</div>
						<div v-else class="grid-2" style="margin-top: 20px">
							<div v-for="p in participants" :key="p.id" class="person-card">
								<div class="avatar">{{ initials(p.name) }}</div>
								<div style="flex: 1; min-width: 0">
									<div style="font-weight: 600; font-size: 13px">{{ p.name }}</div>
									<div style="font-size: 11px; color: #71717a">{{ p.course }} • {{ p.city }}, {{ p.province }}</div>
									<div style="font-size: 11px; color: #71717a">{{ p.contact }} • {{ p.date }}</div>
								</div>
								<button class="btn" style="padding: 4px 10px; font-size: 11px" type="button" @click="participants = participants.filter((x) => x.id !== p.id)">
									<Bi :mode="lang" en="Remove" ur="حذف کریں" />
								</button>
							</div>
						</div>
						<div style="margin-top: 28px">
							<SectionTitle :mode="lang" title-en="Training Context (optional)" title-ur="تربیتی سیاق (اختیاری)" small />
							<div class="grid-2">
								<FieldSelect :mode="lang" label-en="Course Name" label-ur="کورس کا نام" :options="courseOptions" v-model="training.trainingCategory" />
								<FieldInput :mode="lang" label-en="School / Institute" label-ur="اسکول / ادارہ" v-model="training.venueName" />
							</div>
						</div>
					</div>

					<div class="panel-body" v-else-if="selected.group === 'books'">
						<div style="display: flex; justify-content: space-between; gap: 12px">
							<SectionTitle :mode="lang" title-en="Books Demand" title-ur="کتب کی طلب" sub-en="Book demand in simple table" sub-ur="سادہ ٹیبل میں کتابوں کی طلب" />
							<button class="btn btn-green" type="button" @click="addBook">
								<Bi :mode="lang" en="+ Add Book" ur="کتاب شامل کریں" />
							</button>
						</div>
						<div class="book-table">
							<div class="book-head">
								<div><Bi :mode="lang" en="Book Name" ur="کتاب کا نام" /></div>
								<div><Bi :mode="lang" en="Qty" ur="تعداد" /></div>
								<div><Bi :mode="lang" en="School" ur="اسکول" /></div>
								<div></div>
							</div>
							<div v-for="b in books" :key="b.id" class="book-row">
								<select v-model="b.bookName">
									<option v-for="t in bookTitles" :key="t" :value="t">{{ t }}</option>
								</select>
								<input type="number" v-model.number="b.qty" />
								<input v-model="b.school" placeholder="School name" />
								<button class="icon-btn" type="button" @click="books = books.filter((x) => x.id !== b.id)">✕</button>
							</div>
							<div v-if="!books.length" class="empty" style="margin: 0; border: 0">
								<Bi :mode="lang" en="No books added yet — Add now" ur="ابھی کوئی کتاب شامل نہیں" />
							</div>
						</div>
						<div style="margin-top: 16px; font-size: 11px; color: #71717a">
							<Bi :mode="lang" en="Total demand:" ur="کل طلب:" />
							<strong>{{ bookTotal() }} books / {{ bookTotal() }} کتب</strong>
						</div>
					</div>

					<div class="panel-foot">
						<div style="font-size: 12px; color: #71717a">
							<Bi :mode="lang" en="Details ok? Travel is next" ur="تفصیلات درست؟ اگلا مرحلہ سفر ہے" />
						</div>
						<button class="btn btn-dark" type="button" @click="step = 3">
							<Bi :mode="lang" en="Continue to Travel →" ur="سفر کی تفصیل →" />
						</button>
					</div>
				</div>
			</section>

			<section v-else-if="step === 3" class="fade">
				<div class="back-row">
					<button class="icon-btn" type="button" @click="step = 2">←</button>
					<div>
						<div style="font-weight: 600; font-size: 15px">
							<Bi :mode="lang" en="Travel & Submit" ur="سفر اور جمع کرائیں" />
						</div>
						<div style="font-size: 11px; color: #71717a">
							<Bi :mode="lang" en="Travel details • Auto cost from Employee per-km rate" ur="سفر کی تفصیلات • خودکار خرچ" />
						</div>
					</div>
				</div>
				<div class="travel-layout">
					<div class="panel panel-body">
						<div style="display: flex; justify-content: space-between; gap: 12px">
							<SectionTitle :mode="lang" title-en="Travel Details" title-ur="سفر کی تفصیلات" sub-en="Add if travel happened, otherwise skip" sub-ur="اگر سفر ہوا ہے تو شامل کریں ورنہ چھوڑ دیں" />
							<label style="display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 500">
								<input type="checkbox" v-model="travel.needed" />
								<Bi :mode="lang" en="Travel?" ur="سفر ہوا؟" />
							</label>
						</div>
						<div v-if="travel.needed" class="grid-2" style="margin-top: 24px">
							<FieldSelect :mode="lang" label-en="Mode of Travel" label-ur="سفر کا ذریعہ" :options="travelModeOptions" v-model="travel.mode" />
							<div></div>
							<FieldInput :mode="lang" label-en="Travel From" label-ur="کہاں سے" placeholder="Office / Home" v-model="travel.from" />
							<FieldInput :mode="lang" label-en="Travel To" label-ur="کہاں تک" placeholder="School / Area" v-model="travel.to" />
							<FieldInput :mode="lang" label-en="Distance (KM)" label-ur="فاصلہ (کلومیٹر)" type="number" placeholder="Leave blank if none" v-model="travel.distance" />
							<FieldInput
								:mode="lang"
								label-en="Travel Cost (Rs)"
								label-ur="سفری اخراجات (روپے)"
								type="number"
								v-model="travel.cost"
								:helper-en="travel.autoCost ? `${travel.distance || 0} KM × ${travel.perKm || 18} Rs` : 'Enter cost only if travel happened'"
								:helper-ur="travel.autoCost ? `${travel.distance || 0} کلومیٹر × ${travel.perKm || 18} روپے` : 'صرف حقیقی سفر کا خرچ لکھیں'"
							/>
							<div style="grid-column: 1 / -1">
								<FieldTextarea :mode="lang" label-en="Travel Remarks" label-ur="سفر کے ریمارکس" v-model="travel.remarks" />
							</div>
						</div>
						<div v-else class="empty">
							<div style="font-size: 24px">🚶</div>
							<div style="margin-top: 8px; font-weight: 500">
								<Bi :mode="lang" en="No travel for this visit" ur="اس دورے میں کوئی سفر نہیں" />
							</div>
						</div>
					</div>
					<div class="summary">
						<div style="font-size: 12px; font-weight: 600; letter-spacing: 0.1em; opacity: 0.7">
							<Bi :mode="lang" en="SUMMARY" ur="خلاصہ" />
						</div>
						<div style="display: flex; gap: 10px; margin-top: 12px; align-items: center">
							<div class="emoji" style="background: rgba(255, 255, 255, 0.15)">{{ selected?.emoji }}</div>
							<div>
								<div style="font-weight: 600">{{ lang === "ur" ? selected?.titleUr : selected?.titleEn }}</div>
								<div style="font-size: 11px; opacity: 0.8">Auto ID after save / خودکار آئی ڈی</div>
							</div>
						</div>
						<div class="summary-row">
							<span style="opacity: 0.7">Activity</span>
							<span>{{ selected?.titleEn }}</span>
						</div>
						<div class="summary-row">
							<span style="opacity: 0.7">City / Province</span>
							<span>{{ selected?.group === "visits" ? visit.city || "-" : meeting.city || training.city || "-" }} • {{ selected?.group === "visits" ? visit.province : training.province || "-" }}</span>
						</div>
						<div v-if="selected?.group === 'enrolment'" class="summary-row">
							<span style="opacity: 0.7">Participants</span>
							<span>{{ participants.length }} added</span>
						</div>
						<div v-if="selected?.group === 'books'" class="summary-row">
							<span style="opacity: 0.7">Books</span>
							<span>{{ bookTotal() }} books</span>
						</div>
						<div class="summary-row">
							<span style="opacity: 0.7">Date</span>
							<span>{{ selected?.group === "visits" ? visit.visitDate : meeting.meetingDate || training.date }}</span>
						</div>
						<div v-if="travel.needed && travel.distance" class="summary-row">
							<span style="opacity: 0.7">Travel</span>
							<span>{{ travel.distance }} KM • Rs {{ travel.cost || "0" }}</span>
						</div>
						<div style="margin-top: 24px; padding: 12px; border-radius: 12px; background: rgba(255, 255, 255, 0.1)">
							<div style="font-size: 11px; opacity: 0.8">Calculation</div>
							<div style="margin-top: 4px; font-weight: 500">
								<template v-if="travel.needed && travel.autoCost">
									{{ travel.distance || 0 }} KM × {{ travel.perKm || 18 }} Rs = Rs {{ travel.cost || 0 }}
								</template>
								<template v-else-if="travel.needed">Rs {{ travel.cost || 0 }}</template>
								<template v-else>
									<Bi :mode="lang" en="No travel cost" ur="سفر کا کوئی خرچ نہیں" />
								</template>
							</div>
							<div style="font-size: 10px; opacity: 0.7; margin-top: 4px">Blank KM stays Rs 0 — no estimated 22 km</div>
						</div>
					</div>
				</div>
			</section>
		</main>

		<div class="dock">
			<div class="dock-inner">
				<div style="display: flex; gap: 8px; margin-left: auto">
					<button v-if="step > 1" class="btn" type="button" @click="step -= 1">
						<Bi :mode="lang" en="Back" ur="واپس" />
					</button>
					<button class="btn btn-green" type="button" :disabled="(step === 1 && !selected) || saving" @click="saveVisit(true)">
						<Bi :mode="lang" en="Submit Visit ✓" ur="جمع کرائیں ✓" />
					</button>
				</div>
			</div>
		</div>

		<div v-if="showParticipant" class="modal-bg" @click.self="showParticipant = false">
			<div class="modal">
				<div style="display: flex; justify-content: space-between">
					<div style="font-weight: 600; font-size: 16px">
						<Bi :mode="lang" en="Add Participant" ur="نیا شریک شامل کریں" />
					</div>
					<button class="icon-btn" type="button" @click="showParticipant = false">✕</button>
				</div>
				<div class="grid-2" style="margin-top: 20px">
					<div style="grid-column: 1 / -1">
						<FieldInput :mode="lang" label-en="Name *" label-ur="نام *" v-model="participantForm.name" />
					</div>
					<FieldInput :mode="lang" label-en="Contact" label-ur="رابطہ" v-model="participantForm.contact" />
					<FieldInput :mode="lang" label-en="City" label-ur="شہر" v-model="participantForm.city" />
					<FieldSelect :mode="lang" label-en="Province" label-ur="صوبہ" :options="provinceOptions" v-model="participantForm.province" />
					<FieldSelect :mode="lang" label-en="Course Name *" label-ur="کورس کا نام *" :options="courseOptions" v-model="participantForm.course" />
					<FieldDate :mode="lang" label-en="Date" label-ur="تاریخ" v-model="participantForm.date" />
				</div>
				<div style="margin-top: 24px; display: flex; justify-content: flex-end; gap: 8px">
					<button class="btn" type="button" @click="showParticipant = false">
						<Bi :mode="lang" en="Cancel" ur="منسوخ کریں" />
					</button>
					<button class="btn btn-green" type="button" @click="addParticipant">
						<Bi :mode="lang" en="Add" ur="شامل کریں" />
					</button>
				</div>
			</div>
		</div>

		<div v-if="success" class="success-bg">
			<div class="success">
				<div class="check">✓</div>
				<div style="margin-top: 20px; font-weight: 700; font-size: 20px">
					<Bi :mode="lang" en="Visit submitted!" ur="دورہ جمع ہو گیا!" />
				</div>
				<div style="font-size: 13px; color: #71717a; margin-top: 8px; line-height: 1.6">
					Your field visit has been saved.
					<strong v-if="savedName"> {{ savedName }}</strong>
					<div class="urdu">آپ کا فیلڈ وزٹ محفوظ ہو گیا ہے۔ ڈیٹا ہیڈ آفس ڈیش بورڈ پر سنک ہو جائے گا۔</div>
				</div>
			</div>
		</div>

	</div>
</template>
