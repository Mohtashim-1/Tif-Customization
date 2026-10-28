<script setup>
import { computed, onMounted, reactive, ref, watch } from "vue";
import { apiGet, apiPost, apiUpload, METHOD } from "../lib/api";
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
const uploadingAttachment = ref(false);
const creatingType = ref(false);
const creatingLink = ref("");
const error = ref("");
const importMsg = ref("");
const attachMsg = ref("");
const attachErr = ref("");
const attachStatus = ref(""); // Saving… / Uploading… / Running OCR…
const importMode = ref("replace");
const importAllDates = ref(false);
const fileInput = ref(null);
const attachmentInput = ref(null);
const attachments = ref([]);
const feedbackForms = ref([]);
const OCR_METHOD = "tif_customization.tif_customization.api.workshop_feedback_ocr";
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
	zoom_attendance_file: "",
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
		zoom_attendance_file: "",
		attendance: [],
	});
	importMsg.value = "";
	attachMsg.value = "";
	attachErr.value = "";
	attachStatus.value = "";
	attachments.value = [];
	feedbackForms.value = [];
}

function formatFileSize(bytes) {
	const n = Number(bytes || 0);
	if (!n) return "";
	if (n < 1024) return `${n} B`;
	if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
	return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function triggerAttachmentUpload() {
	attachErr.value = "";
	attachMsg.value = "";
	attachmentInput.value?.click();
}

async function onAttachmentFile(event) {
	const file = event.target?.files?.[0];
	if (!file) {
		attachErr.value = "No file selected. Choose a PDF or image and try again.";
		return;
	}
	uploadingAttachment.value = true;
	error.value = "";
	attachMsg.value = "";
	attachErr.value = "";
	attachStatus.value = "Saving session…";
	try {
		// Attachments + OCR need a saved Upcoming Training — auto-save New Training first.
		const name = await ensureTrainingSaved();
		attachStatus.value = `Uploading ${file.name}…`;
		const result = await apiUpload(`${METHOD}.upload_attachment`, { name }, file);
		attachments.value = result.files || [];
		attachMsg.value = result.message || `Attached ${file.name}.`;

		if (result.needs_ocr && result.file_url) {
			attachStatus.value = "Running OCR on feedback form…";
			try {
				const ocr = await apiPost(`${OCR_METHOD}.process_uploaded_feedback`, {
					name,
					file_url: result.file_url,
					filename: result.file_name || file.name,
				});
				if (Array.isArray(ocr.feedback_forms)) feedbackForms.value = ocr.feedback_forms;
				else await loadFeedbackForms(name);
				attachMsg.value = ocr.message || attachMsg.value;
				const ocrMeta = ocr.ocr || {};
				if (ocrMeta.status === "Failed" || !(ocrMeta.processed > 0)) {
					attachErr.value =
						ocrMeta.error_message ||
						"File attached, but OCR could not read form pages. Open Workshop Feedback OCR to review.";
				}
			} catch (ocrErr) {
				await loadFeedbackForms(name);
				attachErr.value =
					(ocrErr && ocrErr.message) ||
					"File attached, but OCR failed. You can retry from Workshop Feedback OCR.";
			}
		} else {
			await loadFeedbackForms(name);
		}
	} catch (e) {
		const msg = e.message || String(e);
		attachErr.value = msg;
		error.value = msg;
	} finally {
		attachStatus.value = "";
		uploadingAttachment.value = false;
		if (event.target) event.target.value = "";
	}
}

async function loadFeedbackForms(name) {
	if (!name) {
		feedbackForms.value = [];
		return;
	}
	try {
		const res = await apiGet(`${OCR_METHOD}.list_session_feedback`, { name });
		feedbackForms.value = res?.rows || [];
	} catch {
		feedbackForms.value = [];
	}
}

async function removeAttachment(file) {
	if (!file?.name) return;
	if (!window.confirm(`Remove ${file.file_name}?`)) return;
	try {
		const result = await apiPost(`${METHOD}.delete_attachment`, {
			file_id: file.name,
			name: form.name,
		});
		attachments.value = result.files || [];
		attachMsg.value = result.message || "Attachment removed.";
	} catch (e) {
		error.value = e.message || String(e);
	}
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

async function ensureTrainingSaved() {
	if (form.name) return form.name;
	if (!(form.training_date || "").trim()) {
		throw new Error("Set the session date, then import the CSV so the file can be attached.");
	}
	const payload = {
		...form,
		attendance: (form.attendance || []).filter((a) => (a.participant_name || "").trim()),
	};
	const saved = await apiPost(`${METHOD}.save_session`, { values: payload });
	if (!saved?.name) {
		throw new Error("Could not save the training before attaching the CSV. Try Save first.");
	}
	form.name = saved.name;
	// Keep parent editingName in sync so later opens/reloads hit this doc — but stay silent.
	emit("saved", { ...saved, silent: true, bindName: saved.name });
	return form.name;
}

async function onImportFile(event) {
	const file = event.target?.files?.[0];
	if (!file) return;
	importing.value = true;
	error.value = "";
	importMsg.value = "";
	try {
		const content = await file.text();
		// File attach needs a saved Upcoming Training — auto-save New Training first.
		const name = await ensureTrainingSaved();
		const result = await apiPost(`${METHOD}.import_attendance`, {
			name,
			content,
			mode: importMode.value,
			filename: file.name,
			ignore_date: importAllDates.value ? 1 : 0,
		});
		// Re-fetch so the table always matches what was saved (avoids stale empty UI).
		const doc = await apiGet(`${METHOD}.get_session`, { name });
		await applySessionDoc(doc);
		importMsg.value = result.message || `Imported ${result.added || 0} row(s).`;
		if (result.date_mismatch) {
			error.value =
				result.message ||
				"CSV attached, but no rows match this session date. Tick “Import all rows” and import again.";
			importMsg.value = "";
		}
		emit("saved", { ...result, silent: true, bindName: name });
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

async function applySessionDoc(doc) {
	Object.assign(form, {
		...doc,
		attendance: (doc.attendance || []).map((a) => ({ ...blankAttendee(), ...a })),
	});
	attachments.value = doc.attachments || [];
	if (doc.zoom_attendance_file) form.zoom_attendance_file = doc.zoom_attendance_file;
	await loadFeedbackForms(form.name || doc.name);
}

async function load() {
	if (!props.open) return;
	// Don't wipe in-progress import / attachment UI with a concurrent reload.
	if (importing.value || uploadingAttachment.value) return;
	loading.value = true;
	error.value = "";
	importMsg.value = "";
	attachMsg.value = "";
	try {
		options.value = await apiGet(`${METHOD}.get_form_options`);
		if (props.sessionName) {
			const doc = await apiGet(`${METHOD}.get_session`, {
				name: props.sessionName,
			});
			await applySessionDoc(doc);
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
		if (result.name) form.name = result.name;
		const doc = await apiGet(`${METHOD}.get_session`, { name: result.name || form.name });
		attachments.value = doc.attachments || [];
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

				<section class="sec">
					<div class="attend-head">
						<div>
							<h3>Attachments</h3>
							<p>Upload Zoom CSV, photos, PDFs, or other training files.</p>
						</div>
						<div class="attend-actions">
							<input
								ref="attachmentInput"
								type="file"
								accept=".pdf,.png,.jpg,.jpeg,.webp,.tif,.tiff,application/pdf,image/*"
								hidden
								@change="onAttachmentFile"
							/>
							<button
								type="button"
								class="ghost"
								:disabled="uploadingAttachment"
								@click="triggerAttachmentUpload"
							>
								{{ uploadingAttachment ? "Working…" : "+ Upload attachment" }}
							</button>
						</div>
					</div>
					<p class="import-hint">
						Phase 1: upload a scanned Workshop Evaluation Form (PDF/image). New sessions are
						saved automatically, then OCR extracts participant details and tags them to this
						session as Workshop Feedback OCR. Keep files under ~50 MB (compress CamScanner PDFs if needed).
					</p>
					<p v-if="attachStatus" class="import-ok">{{ attachStatus }}</p>
					<p v-if="attachMsg" class="import-ok">{{ attachMsg }}</p>
					<p v-if="attachErr" class="attach-err">{{ attachErr }}</p>
					<div v-if="attachments.length" class="attach-list">
						<div v-for="file in attachments" :key="file.file_url || file.name" class="attach-item">
							<div class="attach-item__main">
								<a :href="file.file_url" target="_blank" rel="noopener" class="attach-link">
									{{ file.file_name }}
								</a>
								<span v-if="file.is_zoom_csv" class="attach-tag">Zoom CSV</span>
								<span v-if="file.file_size" class="attach-size">{{ formatFileSize(file.file_size) }}</span>
							</div>
							<button
								v-if="file.name"
								type="button"
								class="linkish"
								@click="removeAttachment(file)"
							>
								Remove
							</button>
						</div>
					</div>
					<div v-else class="attend-empty">
						No attachments yet. Upload a feedback PDF/image or import Zoom CSV below.
					</div>

					<div v-if="feedbackForms.length" class="feedback-ocr-block">
						<h4>OCR feedback forms ({{ feedbackForms.length }})</h4>
						<div
							v-for="fb in feedbackForms"
							:key="fb.name"
							class="feedback-ocr-card"
							:data-status="fb.status"
						>
							<div class="feedback-ocr-top">
								<strong>{{ fb.participant_name || "Unknown participant" }}</strong>
								<span class="attach-tag">{{ fb.status }}</span>
							</div>
							<div class="feedback-ocr-meta">
								<span v-if="fb.page_number">Page {{ fb.page_number }}<template v-if="fb.page_count">/{{ fb.page_count }}</template></span>
								<span v-if="fb.school"> · {{ fb.school }}</span>
								<span v-if="fb.mobile_no"> · {{ fb.mobile_no }}</span>
								<span v-if="fb.feedback_date"> · {{ fb.feedback_date }}</span>
								<span v-if="fb.topic"> · {{ fb.topic }}</span>
							</div>
							<div class="feedback-ocr-meta muted">
								<a v-if="fb.name" :href="`/app/workshop-feedback-ocr/${fb.name}`" target="_blank" rel="noopener">
									{{ fb.name }}
								</a>
								<span v-if="fb.source_file_name"> · {{ fb.source_file_name }}</span>
								<span v-if="fb.error_message"> · {{ fb.error_message }}</span>
							</div>
						</div>
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
							<label class="mode-pick check-inline" title="Use when Zoom export date does not match this session">
								<input type="checkbox" v-model="importAllDates" />
								Import all rows
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
					<div v-if="form.zoom_attendance_file" class="attach-row">
						<span class="attach-label">Attached CSV</span>
						<a :href="form.zoom_attendance_file" target="_blank" rel="noopener" class="attach-link">
							{{ form.zoom_attendance_file.split("/").pop() }}
						</a>
					</div>
					<p class="import-hint">
						CSV: Name, Email, Join time, Leave time, Duration, Guest, Disclaimer, Waiting room.
						By default only rows whose Zoom join date matches this session date
						({{ form.training_date || "—" }}) are imported.
						If the Zoom file date is wrong, tick <strong>Import all rows</strong> before importing.
					</p>

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
.mode-pick.check-inline {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	min-width: auto;
	font-size: 12px;
	font-weight: 600;
	color: #4b5563;
	padding-bottom: 8px;
}
.mode-pick.check-inline input {
	margin: 0;
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
.attach-err {
	margin: 0 0 8px;
	padding: 8px 10px;
	border-radius: 8px;
	background: #fef2f2;
	color: #b91c1c;
	font-size: 12px;
	font-weight: 600;
}
.attach-row {
	display: flex;
	align-items: center;
	gap: 8px;
	margin: 0 0 8px;
	padding: 8px 10px;
	border-radius: 8px;
	background: #eff6ff;
	font-size: 12px;
}
.attach-label {
	font-weight: 700;
	color: #1d4ed8;
}
.attach-link {
	color: #2563eb;
	font-weight: 600;
	text-decoration: none;
}
.attach-link:hover {
	text-decoration: underline;
}
.attach-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
}
.feedback-ocr-block {
	margin-top: 14px;
	display: flex;
	flex-direction: column;
	gap: 8px;
}
.feedback-ocr-block h4 {
	margin: 0;
	font-size: 13px;
	font-weight: 700;
	color: #374151;
}
.feedback-ocr-card {
	border: 1px solid #e5e7eb;
	border-radius: 10px;
	padding: 10px 12px;
	background: #fafafa;
}
.feedback-ocr-card[data-status="Failed"] {
	border-color: #fecaca;
	background: #fef2f2;
}
.feedback-ocr-card[data-status="Processed"] {
	border-color: #a7f3d0;
	background: #ecfdf5;
}
.feedback-ocr-top {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}
.feedback-ocr-meta {
	margin-top: 4px;
	font-size: 12px;
	color: #4b5563;
}
.feedback-ocr-meta.muted {
	color: #9ca3af;
}
.feedback-ocr-meta a {
	color: #6366f1;
	text-decoration: none;
}
.attach-item {
	display: flex;
	justify-content: space-between;
	align-items: center;
	gap: 10px;
	padding: 10px 12px;
	border: 1px solid #e5e7eb;
	border-radius: 10px;
	background: #fff;
}
.attach-item__main {
	display: flex;
	align-items: center;
	gap: 8px;
	flex-wrap: wrap;
	min-width: 0;
}
.attach-tag {
	font-size: 10px;
	font-weight: 700;
	text-transform: uppercase;
	letter-spacing: 0.04em;
	color: #7c3aed;
	background: #f5f3ff;
	padding: 2px 6px;
	border-radius: 999px;
}
.attach-size {
	font-size: 11px;
	color: #9ca3af;
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
