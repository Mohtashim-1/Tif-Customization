<script setup>
import { computed, onMounted, reactive, ref, watch } from "vue";
import { apiGet, apiPost, METHOD } from "../lib/api";
import DatePicker from "./DatePicker.vue";
import LinkSelect from "./LinkSelect.vue";
import TimePicker from "./TimePicker.vue";

const props = defineProps({
	open: { type: Boolean, default: false },
	sessionName: { type: String, default: "" },
	defaults: { type: Object, default: () => ({}) },
});
const emit = defineEmits(["close", "saved"]);

const loading = ref(false);
const saving = ref(false);
const importing = ref(false);
const creatingType = ref(false);
const creatingLink = ref("");
const error = ref("");
const importMsg = ref("");
const importMode = ref("replace");
const fileInput = ref(null);
const options = ref({
	trainers: [],
	programs: [],
	training_types: [],
	can_create_training_type: true,
	can_create: {
		training_type: true,
		trainer: true,
		program: true,
		city: true,
		school: false,
		department: false,
	},
	cities: [],
	schools: [],
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
	training_end_time: "12:00",
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
	schedule_status: "",
	zoom_id: "",
	zoom_link: "",
	attendance: [],
});

const isWorkshop = computed(() => form.type === "Workshop");
const title = computed(() => (form.name ? `Edit ${form.name}` : "New Upcoming Training"));
const presentCount = computed(
	() => (form.attendance || []).filter((a) => a.attendance_status === "Present").length
);

function blankAttendee() {
	return {
		participant_name: "",
		email: "",
		join_time: "",
		leave_time: "",
		duration_minutes: "",
		is_guest: 0,
		recording_disclaimer_response: "",
		in_waiting_room: 0,
		attendance_status: "Present",
		phone: "",
		zoom_participant_id: "",
		check_in_time: "",
		remarks: "",
	};
}

function reset() {
	Object.assign(form, {
		name: "",
		type: "Training",
		training_date: props.defaults.training_date || "",
		training_time: props.defaults.training_time || "10:00",
		training_end_time: props.defaults.training_end_time || "12:00",
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
		schedule_status: "",
		zoom_id: "",
		zoom_link: "",
		attendance: [],
	});
	importMsg.value = "";
}

function addAttendee() {
	form.attendance.push(blankAttendee());
}

function removeAttendee(idx) {
	form.attendance.splice(idx, 1);
}

function mergeImportedRows(rows, mode) {
	const mapped = (rows || []).map((a) => ({ ...blankAttendee(), ...a }));
	if (mode === "append") {
		const keys = new Set(
			form.attendance.map(
				(r) => `${(r.participant_name || "").toLowerCase()}|${(r.email || "").toLowerCase()}`
			)
		);
		for (const row of mapped) {
			const key = `${(row.participant_name || "").toLowerCase()}|${(row.email || "").toLowerCase()}`;
			if (!keys.has(key)) {
				form.attendance.push(row);
				keys.add(key);
			}
		}
	} else {
		form.attendance = mapped;
	}
}

async function onImportFile(event) {
	const file = event.target?.files?.[0];
	if (!file) return;
	importing.value = true;
	error.value = "";
	importMsg.value = "";
	try {
		const content = await file.text();
		if (form.name) {
			const result = await apiPost(`${METHOD}.import_attendance`, {
				name: form.name,
				content,
				mode: importMode.value,
			});
			form.attendance = (result.attendance || []).map((a) => ({ ...blankAttendee(), ...a }));
			importMsg.value = result.message || `Imported ${result.added || 0} row(s).`;
			emit("saved", { ...result, silent: true });
		} else {
			const result = await apiPost(`${METHOD}.parse_attendance_csv`, { content });
			mergeImportedRows(result.rows || [], importMode.value);
			importMsg.value =
				result.message ||
				`Loaded ${result.count || 0} row(s). Save the training to store attendance.`;
		}
	} catch (e) {
		error.value = e.message || String(e);
	} finally {
		importing.value = false;
		if (event.target) event.target.value = "";
	}
}

function triggerImport() {
	fileInput.value?.click();
}

async function createLink(key, field, name) {
	creatingLink.value = key;
	creatingType.value = key === "training_type";
	error.value = "";
	try {
		const result = await apiPost(`${METHOD}.create_link_record`, { key, name });
		const created = (result && result.name) || name;
		const optionKey =
			key === "trainer"
				? "trainers"
				: key === "program"
					? "programs"
					: key === "city"
						? "cities"
						: key === "training_type"
							? "training_types"
							: `${key}s`;
		const current = options.value[optionKey] || [];
		if (!current.includes(created)) {
			options.value[optionKey] = [...current, created].sort((a, b) => a.localeCompare(b));
		}
		form[field] = created;
	} catch (e) {
		error.value = e.message || String(e);
	} finally {
		creatingLink.value = "";
		creatingType.value = false;
	}
}

async function createTrainingType(name) {
	return createLink("training_type", "training_type", name);
}

function canCreate(key) {
	const flags = options.value.can_create || {};
	if (key === "training_type") {
		return flags.training_type !== false && options.value.can_create_training_type !== false;
	}
	return flags[key] === true;
}

function onSchoolSelect(item) {
	form.tag_school = item?.value || "";
	form.school_name = item?.label || "";
	if (item?.city) form.city = item.city;
	if (item?.school_type) form.school_type = item.school_type;
}

watch(
	() => form.tag_school,
	(val) => {
		if (!val) {
			form.school_name = "";
			return;
		}
		const item = (options.value.schools || []).find((s) => s && typeof s === "object" && s.value === val);
		if (item?.label) form.school_name = item.label;
	}
);

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
			Object.assign(form, {
				...doc,
				attendance: (doc.attendance || []).map((a) => ({ ...blankAttendee(), ...a })),
			});
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
		const payload = {
			...form,
			attendance: (form.attendance || []).filter((a) => (a.participant_name || "").trim()),
		};
		const result = await apiPost(`${METHOD}.save_session`, { values: payload });
		emit("saved", result);
	} catch (e) {
		error.value = e.message || String(e);
	} finally {
		saving.value = false;
	}
}

watch(
	() => [
		props.open,
		props.sessionName,
		props.defaults?.training_date,
		props.defaults?.training_time,
		props.defaults?.training_end_time,
	],
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
					<p>Upcoming Training</p>
				</div>
				<button type="button" class="x" @click="$emit('close')">✕</button>
			</header>

			<div v-if="loading" class="state">Loading form…</div>
			<form v-else class="form" @submit.prevent="save">
				<div v-if="error" class="err">{{ error }}</div>

				<section class="sec">
					<h3>When</h3>
					<div class="grid">
						<label>
							Type
							<select v-model="form.type" required>
								<option v-for="t in options.types" :key="t" :value="t">{{ t }}</option>
							</select>
						</label>
						<label>
							Status
							<select v-model="form.schedule_status">
								<option value="">Automatic (from date/time)</option>
								<option value="Upcoming">Upcoming</option>
								<option value="In Progress">In Progress</option>
								<option value="Completed">Completed</option>
							</select>
						</label>
						<label class="pick">
							Date
							<DatePicker v-model="form.training_date" required />
						</label>
						<label class="full">
							Time
							<TimePicker v-model="form.training_time" v-model:end="form.training_end_time" />
						</label>
					</div>
				</section>

				<section class="sec">
					<h3>Training</h3>
					<div class="grid">
						<label>
							Trainer
							<LinkSelect
								v-model="form.trainer_name"
								:options="options.trainers"
								:can-create="canCreate('trainer')"
								:creating="creatingLink === 'trainer'"
								doctype-label="Trainer"
								placeholder="Search trainer"
								@create="(name) => createLink('trainer', 'trainer_name', name)"
							/>
						</label>
						<label v-if="!isWorkshop">
							Training Type
							<LinkSelect
								v-model="form.training_type"
								:options="options.training_types"
								:can-create="canCreate('training_type')"
								:creating="creatingLink === 'training_type'"
								doctype-label="Training Type"
								placeholder="Search training type"
								@create="createTrainingType"
							/>
						</label>
						<label v-else>
							Workshop Topic
							<input v-model="form.workshop_topic" placeholder="Workshop topic" />
						</label>
						<label v-if="!isWorkshop">
							Program
							<LinkSelect
								v-model="form.program"
								:options="options.programs"
								:can-create="canCreate('program')"
								:creating="creatingLink === 'program'"
								doctype-label="Program"
								placeholder="Search program"
								@create="(name) => createLink('program', 'program', name)"
							/>
						</label>
						<label v-else>
							Workshop For
							<input v-model="form.workshop_for" />
						</label>
						<label>
							Department
							<LinkSelect
								v-model="form.department_training"
								:options="options.departments"
								:can-create="false"
								doctype-label="Department"
								placeholder="Search department"
							/>
						</label>
						<label>
							Mode
							<select v-model="form.mode_of_training">
								<option value="">Select</option>
								<option v-for="m in options.modes" :key="m" :value="m">{{ m }}</option>
							</select>
						</label>
						<label>
							Participants
							<select v-model="form.participants_category">
								<option value="">Select</option>
								<option v-for="p in options.participant_categories" :key="p" :value="p">{{ p }}</option>
							</select>
						</label>
					</div>
				</section>

				<section class="sec">
					<h3>Location</h3>
					<div class="grid">
						<label>
							School
							<LinkSelect
								v-model="form.tag_school"
								:options="options.schools"
								:can-create="false"
								search-key="school"
								doctype-label="Customer"
								placeholder="Search customer"
								@select="onSchoolSelect"
							/>
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
							<LinkSelect
								v-model="form.city"
								:options="options.cities"
								:can-create="canCreate('city')"
								:creating="creatingLink === 'city'"
								doctype-label="City"
								placeholder="Search city"
								@create="(name) => createLink('city', 'city', name)"
							/>
						</label>
						<label>
							Area
							<input v-model="form.area" placeholder="Area" />
						</label>
					</div>
				</section>

				<section class="sec">
					<h3>Zoom</h3>
					<div class="zoom-grid">
						<label>
							Zoom ID
							<input
								v-model="form.zoom_id"
								placeholder="e.g. 823 4567 8910"
								autocomplete="off"
							/>
						</label>
						<label>
							Zoom Link
							<input
								v-model="form.zoom_link"
								placeholder="https://zoom.us/j/..."
								autocomplete="off"
							/>
						</label>
					</div>
				</section>

				<section class="sec attend-block">
					<div class="attend-head">
						<div>
							<h3>Attendance</h3>
							<p>
								Tagged to this training
								<template v-if="form.zoom_id"> · Zoom ID {{ form.zoom_id }}</template>
								· {{ presentCount }}/{{ form.attendance.length }} present
							</p>
						</div>
						<div class="attend-actions">
							<label class="mode-pick">
								Import mode
								<select v-model="importMode">
									<option value="replace">Replace all</option>
									<option value="append">Append new</option>
								</select>
							</label>
							<input
								ref="fileInput"
								type="file"
								accept=".csv,text/csv"
								hidden
								@change="onImportFile"
							/>
							<button type="button" class="ghost" :disabled="importing" @click="triggerImport">
								{{ importing ? "Importing…" : "Bulk import CSV" }}
							</button>
							<button type="button" class="ghost" @click="addAttendee">+ Add participant</button>
						</div>
					</div>

					<p v-if="importMsg" class="import-ok">{{ importMsg }}</p>
					<p class="import-hint">CSV: Name, Email, Join time, Leave time, Duration, Guest, Disclaimer, Waiting room.</p>

					<div v-if="!form.attendance.length" class="attend-empty">
						No attendance yet. Import a Zoom CSV or add a participant.
					</div>

					<div v-else class="attend-table-wrap">
						<table class="attend-table">
							<thead>
								<tr>
									<th>Name (original name)</th>
									<th>Email</th>
									<th>Join time</th>
									<th>Leave time</th>
									<th>Duration (min)</th>
									<th>Guest</th>
									<th>Recording disclaimer</th>
									<th>Waiting room</th>
									<th>Status</th>
									<th></th>
								</tr>
							</thead>
							<tbody>
								<tr v-for="(row, idx) in form.attendance" :key="idx">
									<td>
										<input v-model="row.participant_name" placeholder="Name" required />
									</td>
									<td>
										<input v-model="row.email" type="email" placeholder="email@" />
									</td>
									<td>
										<input v-model="row.join_time" placeholder="Join time" />
									</td>
									<td>
										<input v-model="row.leave_time" placeholder="Leave time" />
									</td>
									<td>
										<input v-model="row.duration_minutes" type="number" min="0" />
									</td>
									<td class="center">
										<input v-model="row.is_guest" type="checkbox" true-value="1" false-value="0" />
									</td>
									<td>
										<input v-model="row.recording_disclaimer_response" placeholder="Yes / No" />
									</td>
									<td class="center">
										<input
											v-model="row.in_waiting_room"
											type="checkbox"
											true-value="1"
											false-value="0"
										/>
									</td>
									<td>
										<select v-model="row.attendance_status">
											<option>Present</option>
											<option>Absent</option>
											<option>Late</option>
										</select>
									</td>
									<td>
										<button type="button" class="linkish" @click="removeAttendee(idx)">
											Remove
										</button>
									</td>
								</tr>
							</tbody>
						</table>
					</div>
				</section>

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
	background: rgba(15, 23, 42, 0.4);
	z-index: 200;
	display: grid;
	place-items: center;
	padding: 16px;
}
.sheet {
	width: min(920px, 100%);
	max-height: 92vh;
	overflow: auto;
	background: #fff;
	border-radius: 16px;
	padding: 18px 20px 16px;
	box-shadow: 0 24px 80px rgba(15, 23, 42, 0.22);
}
header {
	display: flex;
	justify-content: space-between;
	align-items: flex-start;
	margin-bottom: 12px;
}
h2 {
	margin: 0;
	font-size: 20px;
	letter-spacing: -0.02em;
}
header p {
	margin: 2px 0 0;
	color: #6b7280;
	font-size: 12px;
}
.x {
	border: 0;
	background: #f3f4f6;
	width: 32px;
	height: 32px;
	border-radius: 8px;
}
.form {
	display: flex;
	flex-direction: column;
	gap: 12px;
}
.sec {
	border: 1px solid #eef0f4;
	background: #fafbfc;
	border-radius: 14px;
	padding: 12px 14px 14px;
}
.sec h3,
.attend-block h3 {
	margin: 0 0 10px;
	font-size: 12px;
	font-weight: 700;
	letter-spacing: 0.06em;
	text-transform: uppercase;
	color: #6b7280;
}
.grid {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 10px 12px;
}
label {
	display: flex;
	flex-direction: column;
	gap: 5px;
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
	padding: 9px 11px;
	font: inherit;
	font-weight: 400;
	background: #fff;
}
input:focus,
select:focus {
	outline: none;
	border-color: #6366f1;
	box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.12);
}
.full {
	grid-column: 1 / -1;
}
.zoom-grid {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 10px 12px;
}
.attend-head {
	display: flex;
	justify-content: space-between;
	gap: 12px;
	align-items: flex-start;
	flex-wrap: wrap;
	margin-bottom: 8px;
}
.attend-head p {
	margin: 0;
	color: #6b7280;
	font-size: 12px;
	font-weight: 400;
}
.attend-actions {
	display: flex;
	gap: 8px;
	align-items: flex-end;
	flex-wrap: wrap;
}
.mode-pick {
	min-width: 130px;
}
.import-hint {
	margin: 0 0 8px;
	font-size: 12px;
	font-weight: 400;
	color: #9ca3af;
}
.import-ok {
	margin: 0 0 8px;
	padding: 8px 10px;
	border-radius: 8px;
	background: #ecfdf5;
	color: #047857;
	font-size: 12px;
	font-weight: 600;
}
.attend-empty {
	padding: 14px;
	text-align: center;
	color: #6b7280;
	background: #fff;
	border-radius: 10px;
	border: 1px dashed #e5e7eb;
	font-size: 13px;
}
.attend-table-wrap {
	overflow: auto;
	background: #fff;
	border-radius: 10px;
	border: 1px solid #e5e7eb;
}
.attend-table {
	width: 100%;
	border-collapse: collapse;
	min-width: 980px;
}
.attend-table th,
.attend-table td {
	padding: 8px;
	border-bottom: 1px solid #f3f4f6;
	text-align: left;
	font-size: 11px;
}
.attend-table th {
	background: #f8fafc;
	white-space: nowrap;
}
.attend-table input,
.attend-table select {
	width: 100%;
	padding: 8px;
}
.attend-table td.center {
	text-align: center;
}
.attend-table td.center input {
	width: auto;
}
.linkish {
	border: 0;
	background: none;
	color: #b91c1c;
	font-weight: 700;
	cursor: pointer;
}
.actions {
	display: flex;
	justify-content: flex-end;
	gap: 8px;
	padding-top: 4px;
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
	padding: 14px;
}
.err {
	color: #b91c1c;
	background: #fef2f2;
	border-radius: 10px;
	padding: 10px 12px;
	font-size: 13px;
}
@media (max-width: 700px) {
	.grid,
	.zoom-grid {
		grid-template-columns: 1fr;
	}
}
</style>
