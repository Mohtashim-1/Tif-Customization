<script setup>
import { computed, onMounted, reactive, ref, watch } from "vue";
import { apiGet, apiPost, METHOD } from "../lib/api";
import DatePicker from "./DatePicker.vue";
import TimePicker from "./TimePicker.vue";

const props = defineProps({
	open: { type: Boolean, default: false },
	sessionName: { type: String, default: "" },
	defaults: { type: Object, default: () => ({}) },
});
const emit = defineEmits(["close", "saved"]);

const loading = ref(false);
const saving = ref(false);
const error = ref("");
const options = ref({
	trainers: [],
	programs: [],
	training_types: [],
	cities: [],
	types: ["Training", "Workshop"],
	modes: ["In-person", "Online", "Onsite"],
	departments: ["TPS", "CEE", "QPS", "TIF", "T. Training"],
	participant_categories: ["School Kids", "Trainees", "Teachers"],
	school_types: ["Private", "Government"],
});
const form = reactive({
	name: "",
	type: "Training",
	training_date: "",
	training_time: "10:00",
	training_type: "",
	workshop_topic: "",
	mode_of_training: "Online",
	participants_category: "",
	school_name: "",
	school_type: "",
	department_training: "",
	city: "",
	area: "",
	trainer_name: "",
	program: "",
	workshop_for: "",
	tag_school: "",
});

const isWorkshop = computed(() => form.type === "Workshop");
const title = computed(() => (form.name ? `Edit ${form.name}` : "New Upcoming Training"));

function reset() {
	Object.assign(form, {
		name: "",
		type: "Training",
		training_date: props.defaults.training_date || "",
		training_time: props.defaults.training_time || "10:00",
		training_type: "",
		workshop_topic: "",
		mode_of_training: "Online",
		participants_category: "",
		school_name: "",
		school_type: "",
		department_training: "",
		city: "",
		area: "",
		trainer_name: "",
		program: "",
		workshop_for: "",
		tag_school: "",
	});
}

async function load() {
	if (!props.open) return;
	loading.value = true;
	error.value = "";
	try {
		options.value = await apiGet(`${METHOD}.get_form_options`);
		if (props.sessionName) {
			const doc = await apiGet(`${METHOD}.get_session`, {
				name: props.sessionName,
			});
			Object.assign(form, doc);
		} else {
			reset();
		}
	} catch (e) {
		error.value = e.message || String(e);
	} finally {
		loading.value = false;
	}
}

async function save() {
	saving.value = true;
	error.value = "";
	try {
		const result = await apiPost(`${METHOD}.save_session`, { values: { ...form } });
		emit("saved", result);
	} catch (e) {
		error.value = e.message || String(e);
	} finally {
		saving.value = false;
	}
}

watch(
	() => [props.open, props.sessionName, props.defaults?.training_date, props.defaults?.training_time],
	() => load()
);
onMounted(load);
</script>

<template>
	<div v-if="open" class="overlay" @click.self="$emit('close')">
		<section class="sheet">
			<header>
				<div>
					<h2>{{ title }}</h2>
					<p>Saves directly to Upcoming Training</p>
				</div>
				<button type="button" class="x" @click="$emit('close')">✕</button>
			</header>

			<div v-if="loading" class="state">Loading form…</div>
			<form v-else class="grid" @submit.prevent="save">
				<div v-if="error" class="err">{{ error }}</div>
				<label>
					Type
					<select v-model="form.type" required>
						<option v-for="t in options.types" :key="t" :value="t">{{ t }}</option>
					</select>
				</label>
				<label class="pick">
					Date
					<DatePicker v-model="form.training_date" required />
				</label>
				<label class="pick">
					Time
					<TimePicker v-model="form.training_time" />
				</label>
				<label>
					Trainer
					<input v-model="form.trainer_name" list="ts-trainers" placeholder="Name of trainer" />
					<datalist id="ts-trainers">
						<option v-for="t in options.trainers" :key="t" :value="t" />
					</datalist>
				</label>
				<label v-if="!isWorkshop">
					Training Type
					<input v-model="form.training_type" list="ts-types" placeholder="Topic / type" />
					<datalist id="ts-types">
						<option v-for="t in options.training_types" :key="t" :value="t" />
					</datalist>
				</label>
				<label v-else>
					Workshop Topic
					<input v-model="form.workshop_topic" placeholder="Workshop topic" />
				</label>
				<label v-if="!isWorkshop">
					Program
					<input v-model="form.program" list="ts-programs" />
					<datalist id="ts-programs">
						<option v-for="p in options.programs" :key="p" :value="p" />
					</datalist>
				</label>
				<label v-else>
					Workshop For
					<input v-model="form.workshop_for" />
				</label>
				<label>
					Mode
					<select v-model="form.mode_of_training">
						<option value="">Select</option>
						<option v-for="m in options.modes" :key="m" :value="m">{{ m }}</option>
					</select>
				</label>
				<label>
					Department
					<select v-model="form.department_training">
						<option value="">Select</option>
						<option v-for="d in options.departments" :key="d" :value="d">{{ d }}</option>
					</select>
				</label>
				<label>
					School
					<input v-model="form.school_name" />
				</label>
				<label>
					School Type
					<select v-model="form.school_type">
						<option value="">Select</option>
						<option v-for="s in options.school_types" :key="s" :value="s">{{ s }}</option>
					</select>
				</label>
				<label>
					City
					<input v-model="form.city" list="ts-cities" />
					<datalist id="ts-cities">
						<option v-for="c in options.cities" :key="c" :value="c" />
					</datalist>
				</label>
				<label>
					Area
					<input v-model="form.area" />
				</label>
				<label>
					Participants
					<select v-model="form.participants_category">
						<option value="">Select</option>
						<option v-for="p in options.participant_categories" :key="p" :value="p">{{ p }}</option>
					</select>
				</label>
				<div class="actions">
					<button type="button" class="ghost" @click="$emit('close')">Cancel</button>
					<button type="submit" class="primary" :disabled="saving">
						{{ saving ? "Saving…" : "Save to Upcoming Training" }}
					</button>
				</div>
			</form>
		</section>
	</div>
</template>

<style scoped>
.overlay {
	position: fixed;
	inset: 0;
	background: rgba(15, 23, 42, 0.45);
	z-index: 80;
	display: grid;
	place-items: center;
	padding: 20px;
}
.sheet {
	width: min(860px, 100%);
	max-height: 92vh;
	overflow: auto;
	background: #fff;
	border-radius: 18px;
	padding: 20px;
	box-shadow: 0 24px 80px rgba(15, 23, 42, 0.25);
}
header {
	display: flex;
	justify-content: space-between;
	align-items: flex-start;
	margin-bottom: 16px;
}
h2 {
	margin: 0;
	font-size: 22px;
}
header p {
	margin: 4px 0 0;
	color: #6b7280;
	font-size: 13px;
}
.x {
	border: 0;
	background: #f3f4f6;
	width: 36px;
	height: 36px;
	border-radius: 10px;
}
.grid {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 12px;
}
label {
	display: flex;
	flex-direction: column;
	gap: 6px;
	font-size: 12px;
	font-weight: 600;
	color: #374151;
}
.pick {
	position: relative;
	z-index: 2;
}
input,
select {
	border: 1px solid #e5e7eb;
	border-radius: 10px;
	padding: 10px 12px;
	font: inherit;
	font-weight: 400;
	background: #f9fafb;
}
.actions {
	grid-column: 1 / -1;
	display: flex;
	justify-content: flex-end;
	gap: 8px;
	margin-top: 8px;
}
.primary,
.ghost {
	border-radius: 10px;
	padding: 10px 14px;
	font-weight: 600;
	border: 1px solid transparent;
}
.primary {
	background: #4f46e5;
	color: #fff;
}
.ghost {
	background: #fff;
	border-color: #e5e7eb;
}
.state,
.err {
	padding: 18px;
}
.err {
	grid-column: 1 / -1;
	color: #b91c1c;
	background: #fef2f2;
	border-radius: 10px;
	padding: 12px;
}
@media (max-width: 700px) {
	.grid {
		grid-template-columns: 1fr;
	}
}
</style>
