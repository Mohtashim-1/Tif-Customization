<script setup>
import FieldInput from "./FieldInput.vue";
import FieldSelect from "./FieldSelect.vue";
import FieldTextarea from "./FieldTextarea.vue";
import FieldDate from "./FieldDate.vue";

const props = defineProps({
	mode: { type: String, default: "both" },
	model: { type: Object, required: true },
	options: { type: Object, default: () => ({}) },
	booksBlocked: { type: Boolean, default: false },
});
const emit = defineEmits(["cancel"]);

function list(key, fallback) {
	const rows = props.options?.[key];
	return Array.isArray(rows) && rows.length ? rows : fallback;
}

const visitTypes = list("school_opening_visit_types", ["Visit without enrollment", "Visit with enrollment"]);
const institutionTypes = list("school_opening_institution_types", [
	"School",
	"College",
	"University",
	"Madrasa",
	"Fahm-Ul-Quran Group",
	"Special School",
]);
const categories = list("school_opening_categories", ["Provincial Govt.", "Private"]);
const eduSystem = list("school_opening_educational_system", [
	"Pre-Primary",
	"Primary",
	"Secondary",
	"Matric",
	"Intermediate",
	"Hifz-o-Nazra",
	"Cambridge",
	"O / A Levels",
]);
const structures = list("school_opening_structure", ["Single Campus", "Chain"]);
const shifts = list("school_opening_shifts", ["Morning", "Evening", "Both"]);
const coursesWorkshops = list("school_opening_courses_workshops", list("school_opening_teacher_training", [
	"ELP",
	"Workshop",
	"TECC Professional",
	"PEF Pakistan Workshop",
	"TECC Foundation",
	"Workshop Value Driven Teaching",
	"Customize Tajweed online Course",
	"Intro to Tajweed",
	"Tajweed Training Course (TTC)",
	"Kids Workshop",
	"Workshop Art of Storytelling",
]));
const servicesOnboard = list("school_opening_services_onboard", list("school_opening_quran", [
	"MQH Green Version Part-1 to 7",
	"Noorani Qaida",
	"MQH Green Version Teacher Guide 1 to 5",
	"Noorani Qaida — NQ Workbook",
	"MQH English Version Part-1 – 2",
	"MQH Sindhi Version Part-1 – 3",
	"Noorani Qaida — NQ Teachers Guide",
	"MQH KP Edition Part-1 to 7",
]));
const runningTif = list("school_opening_running_tif", [
	"Quran Program for Student",
	"Tilawat Program for School",
	"Teacher Training",
]);
const curriculum = list("school_opening_curriculum", [
	"Oral Nazra",
	"Qaida",
	"Afaq",
	"National Book Foundation",
	"Noorani Qaida (Not TPS)",
	"Iqra Qaida",
	"Spectrum",
	"Rehmani Qaida",
	"Madni Qaida",
	"Gaba",
	"Jamiat Qaida",
	"Qurani Qaida",
	"Moonlight",
	"Islamic Values",
	"CEF",
	"Zia ul Quran",
]);
const fees = list("school_opening_fee", ["Above 15K", "Between 5K – 15K", "Below 5K"]);
const provinces = list("school_opening_provinces", [
	"Sindh",
	"Punjab",
	"KPK",
	"Balochistan",
	"Gilgit-Baltistan",
	"Azad Jammu & Kashmir",
]);
const roles = list("school_opening_contact_roles", [
	"Director",
	"Administrator",
	"Principal",
	"Vice Principal",
	"Academic Manager",
	"Academic Coordinator",
	"Admin Person",
	"Receptionist",
	"Coordinator",
	"Ambassador",
]);

function toggle(arr, value) {
	const listVal = Array.isArray(arr) ? arr : [];
	const i = listVal.indexOf(value);
	if (i >= 0) listVal.splice(i, 1);
	else listVal.push(value);
}

function contact(role) {
	if (!props.model.key_contacts) props.model.key_contacts = {};
	if (!props.model.key_contacts[role]) props.model.key_contacts[role] = { name: "", cell: "" };
	return props.model.key_contacts[role];
}
</script>

<template>
	<div class="soa-panel">
		<div class="soa-head">
			<div>
				<div class="soa-title">Create School / اسکول رجسٹر کریں</div>
				<div class="soa-sub">Same fields as School Opening Form V2 (SC-1.2). Saves a School Opening request.</div>
			</div>
			<button type="button" class="btn" @click="emit('cancel')">Cancel</button>
		</div>
		<div v-if="booksBlocked" class="soa-warn">
			Book Demand stays disabled until this school is added to the School Database. You can submit the School Opening request now; after approval, submit Book Demand normally.
		</div>
		<div class="block-title">1 Institution Profile</div>
		<div class="academic-work">
			<div class="field">
				<label><span class="en">Type<span class="req">*</span></span></label>
				<div class="work-types">
					<label v-for="v in visitTypes" :key="v" class="work-chip">
						<input type="radio" :value="v" v-model="model.visit_type" />
						<span>{{ v }}</span>
					</label>
				</div>
			</div>
			<div class="field">
				<label><span class="en">Type of Institution</span></label>
				<div class="work-types">
					<label v-for="v in institutionTypes" :key="v" class="work-chip">
						<input type="checkbox" :checked="model.institution_types.includes(v)" @change="toggle(model.institution_types, v)" />
						<span>{{ v }}</span>
					</label>
				</div>
			</div>
			<div class="grid-2" style="margin-top: 0">
				<FieldInput :mode="mode" label-en="Name of School" label-ur="اسکول کا نام" required v-model="model.school_name" />
				<FieldInput :mode="mode" label-en="TIF Representative" label-ur="ٹی آئی ایف نمائندہ" v-model="model.tif_representative" />
				<FieldDate :mode="mode" label-en="Form Date" label-ur="فارم کی تاریخ" v-model="model.form_date" />
				<FieldSelect :mode="mode" label-en="Category" label-ur="کیٹیگری" :options="categories" v-model="model.institution_category" />
			</div>
			<div class="field">
				<label><span class="en">Educational System</span></label>
				<div class="work-types">
					<label v-for="v in eduSystem" :key="v" class="work-chip">
						<input type="checkbox" :checked="model.educational_system.includes(v)" @change="toggle(model.educational_system, v)" />
						<span>{{ v }}</span>
					</label>
				</div>
			</div>
			<div class="grid-3" style="margin-top: 0">
				<div class="field">
					<label><span class="en">Type of School</span></label>
					<div class="work-types">
						<label v-for="v in structures" :key="v" class="work-chip">
							<input type="radio" :value="v" v-model="model.structure" />
							<span>{{ v }}</span>
						</label>
					</div>
				</div>
				<FieldInput :mode="mode" type="number" label-en="No. of Campuses" label-ur="کیمپس کی تعداد" v-model="model.no_of_campuses" />
				<FieldInput :mode="mode" label-en="No. of Students" label-ur="طلباء کی تعداد" v-model="model.no_of_students" />
			</div>
			<div class="field">
				<label><span class="en">Academic Session — Shift</span></label>
				<div class="work-types">
					<label v-for="v in shifts" :key="v" class="work-chip">
						<input type="radio" :value="v" v-model="model.academic_shift" />
						<span>{{ v }}</span>
					</label>
				</div>
			</div>
		</div>

		<div class="block-title">2 Services of Interest</div>
		<div class="academic-work">
			<div class="field">
				<label><span class="en">Courses &amp; Workshops</span></label>
				<div class="work-types">
					<label v-for="v in coursesWorkshops" :key="v" class="work-chip">
						<input type="checkbox" :checked="model.teacher_training_services.includes(v)" @change="toggle(model.teacher_training_services, v)" />
						<span>{{ v }}</span>
					</label>
				</div>
			</div>
			<div class="field">
				<label><span class="en">Services Onboard</span></label>
				<div class="work-types">
					<label v-for="v in servicesOnboard" :key="v" class="work-chip">
						<input type="checkbox" :checked="model.quran_program_services.includes(v)" @change="toggle(model.quran_program_services, v)" />
						<span>{{ v }}</span>
					</label>
				</div>
			</div>
		</div>

		<div class="block-title">3 Current Engagement with TIF</div>
		<div class="academic-work">
			<div class="field">
				<label><span class="en">School Already Running TIF Services</span></label>
				<div class="work-types">
					<label v-for="v in runningTif" :key="v" class="work-chip">
						<input type="checkbox" :checked="model.running_tif_services.includes(v)" @change="toggle(model.running_tif_services, v)" />
						<span>{{ v }}</span>
					</label>
				</div>
			</div>
			<div class="field">
				<label><span class="en">Curriculum Currently in Use</span></label>
				<div class="work-types">
					<label v-for="v in curriculum" :key="v" class="work-chip">
						<input type="checkbox" :checked="model.curriculum_in_use.includes(v)" @change="toggle(model.curriculum_in_use, v)" />
						<span>{{ v }}</span>
					</label>
				</div>
			</div>
			<FieldInput :mode="mode" label-en="Others" label-ur="دیگر" v-model="model.curriculum_others" />
			<div class="field">
				<label><span class="en">Fee Structure</span></label>
				<div class="work-types">
					<label v-for="v in fees" :key="v" class="work-chip">
						<input type="radio" :value="v" v-model="model.fee_structure" />
						<span>{{ v }}</span>
					</label>
				</div>
			</div>
		</div>

		<div class="block-title">5 Online Presence</div>
		<div class="grid-2">
			<FieldInput :mode="mode" label-en="Website" v-model="model.website" />
			<FieldInput :mode="mode" label-en="Facebook" v-model="model.facebook" />
			<FieldInput :mode="mode" label-en="Instagram" v-model="model.instagram" />
			<FieldInput :mode="mode" label-en="LinkedIn" v-model="model.linkedin" />
		</div>
		<FieldTextarea :mode="mode" label-en="Other Links" v-model="model.other_links" />

		<div class="block-title">6 Location</div>
		<div class="academic-work">
			<FieldTextarea :mode="mode" label-en="Address" label-ur="پتہ" required v-model="model.address" />
			<div class="grid-2" style="margin-top: 0">
				<FieldSelect :mode="mode" label-en="Province" label-ur="صوبہ" :options="provinces" v-model="model.province" />
				<FieldInput :mode="mode" label-en="City" label-ur="شہر" v-model="model.city" />
				<FieldInput :mode="mode" label-en="Area" label-ur="علاقہ" v-model="model.area" />
				<FieldInput :mode="mode" label-en="Other Country" v-model="model.country" />
			</div>
		</div>

		<div class="block-title">7 Key Contacts</div>
		<div class="contact-table soa-contacts">
			<div class="contact-head">
				<div>Role</div>
				<div>Name</div>
				<div>Cell No.</div>
			</div>
			<div v-for="role in roles" :key="role" class="contact-row soa-contact-row">
				<div class="idx">{{ role }}</div>
				<input v-model="contact(role).name" placeholder="Name" />
				<input v-model="contact(role).cell" placeholder="03XX-" />
			</div>
		</div>
		<div class="grid-2" style="margin-top: 12px">
			<FieldInput :mode="mode" label-en="School PTCL / Mobile Number" v-model="model.school_ptcl" />
			<FieldInput :mode="mode" label-en="School Mobile" v-model="model.school_mobile" />
			<FieldInput :mode="mode" label-en="School Email" v-model="model.school_email" />
		</div>
	</div>
</template>
