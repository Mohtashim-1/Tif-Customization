<script setup>
import { computed, onMounted, reactive, ref, watch } from "vue";
import { apiGet, apiPost, LMS_METHOD, METHOD } from "../lib/api";
import DatePicker from "./DatePicker.vue";
import TimePicker from "./TimePicker.vue";

const emit = defineEmits(["toast", "open-session"]);

const PALETTE = [
	"#6366f1",
	"#8b5cf6",
	"#a78bfa",
	"#0ea5e9",
	"#10b981",
	"#34d399",
	"#f59e0b",
	"#facc15",
	"#f97316",
	"#ef4444",
	"#ec4899",
	"#f9a8d4",
];

const kind = ref("course");
const loading = ref(false);
const saving = ref(false);
const error = ref("");
const search = ref("");
const editingId = ref("");
const courses = ref([]);
const lessons = ref([]);
const sessions = ref([]);
const trainers = ref([]);
const options = ref({ modes: ["In-person", "Online", "Onsite"], types: ["Training", "Workshop"] });

const courseForm = reactive(blankCourse());
const sessionForm = reactive(blankSession());
const lessonForm = reactive(blankLesson());

function blankCourse() {
	return {
		id: "",
		name: "",
		code: "",
		category: "Training",
		trainer: "",
		color: "#6366f1",
		duration: "",
		status: "Active",
		description: "",
	};
}
function blankSession() {
	return {
		name: "",
		type: "Training",
		training_date: new Date().toISOString().slice(0, 10),
		training_time: "10:00",
		training_end_time: "12:00",
		trainer_name: "",
		training_type: "",
		program: "",
		mode_of_training: "In-person",
		school_name: "",
		color: "#6366f1",
	};
}
function blankLesson() {
	return {
		id: "",
		title: "",
		course: "",
		courseName: "",
		module: "Lessons",
		duration: 20,
		order: 0,
		published: 1,
		summary: "",
		content: "",
	};
}

const kinds = [
	{ id: "course", label: "Courses", hint: "Program cards (Word Cube, Storytelling…)" },
	{ id: "session", label: "Sessions", hint: "Scheduled cards on the weekly planner" },
	{ id: "lesson", label: "Lessons", hint: "Learning material inside a course" },
];

const kpis = computed(() => [
	{ label: "Courses", value: courses.value.length, tone: "purple" },
	{ label: "Sessions", value: sessions.value.length, tone: "blue" },
	{ label: "Lessons", value: lessons.value.length, tone: "green" },
]);

const filtered = computed(() => {
	const q = search.value.trim().toLowerCase();
	if (kind.value === "course") {
		return courses.value.filter((c) => !q || `${c.name} ${c.trainer} ${c.category}`.toLowerCase().includes(q));
	}
	if (kind.value === "session") {
		return sessions.value.filter(
			(s) => !q || `${s.title} ${s.trainerName} ${s.program} ${s.room}`.toLowerCase().includes(q)
		);
	}
	return lessons.value.filter((l) => !q || `${l.title} ${l.courseName} ${l.module}`.toLowerCase().includes(q));
});

const preview = computed(() => {
	if (kind.value === "course") {
		return {
			title: courseForm.name || "Course title",
			meta: [courseForm.trainer || "Trainer", courseForm.duration || "Duration"].filter(Boolean).join(" · "),
			color: courseForm.color,
			tag: courseForm.category,
		};
	}
	if (kind.value === "session") {
		const course = courses.value.find((c) => c.name === sessionForm.training_type || c.name === sessionForm.program);
		return {
			title: sessionForm.training_type || sessionForm.program || "Session title",
			meta: [sessionForm.trainer_name || "Trainer", `${sessionForm.training_time} – ${sessionForm.training_end_time}`, sessionForm.school_name]
				.filter(Boolean)
				.join(" · "),
			color: course?.color || sessionForm.color,
			tag: sessionForm.training_date,
		};
	}
	const course = courses.value.find((c) => c.id === lessonForm.course || c.name === lessonForm.courseName);
	return {
		title: lessonForm.title || "Lesson title",
		meta: [course?.name || lessonForm.courseName || "Course", `${lessonForm.duration || 0} min`].join(" · "),
		color: course?.color || "#0ea5e9",
		tag: lessonForm.module || "Lesson",
	};
});

function initials(name) {
	return String(name || "?")
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((w) => w[0])
		.join("")
		.toUpperCase();
}

async function load() {
	loading.value = true;
	error.value = "";
	try {
		const [courseRows, lessonRows, sessionDir, formOpts] = await Promise.all([
			apiGet(`${LMS_METHOD}.list_courses`).catch(() => []),
			apiGet(`${LMS_METHOD}.list_lessons`).catch(() => []),
			apiGet(`${METHOD}.get_directory`, { view: "sessions" }).catch(() => ({ rows: [] })),
			apiGet(`${METHOD}.get_form_options`).catch(() => ({})),
		]);
		courses.value = Array.isArray(courseRows) ? courseRows : [];
		lessons.value = Array.isArray(lessonRows) ? lessonRows : [];
		sessions.value = sessionDir.rows || [];
		trainers.value = formOpts.trainers || [];
		options.value = {
			modes: formOpts.modes || options.value.modes,
			types: formOpts.types || options.value.types,
		};
		const fromPrograms = formOpts.training_types || formOpts.programs || [];
		for (const name of fromPrograms) {
			if (name && !courses.value.some((c) => c.name === name)) {
				courses.value.push({
					id: "",
					name,
					category: "Training",
					trainer: "",
					color: PALETTE[courses.value.length % PALETTE.length],
					status: "Active",
					description: "From Upcoming Training catalog",
				});
			}
		}
	} catch (e) {
		error.value = e.message || String(e);
	} finally {
		loading.value = false;
	}
}

function resetForm() {
	editingId.value = "";
	Object.assign(courseForm, blankCourse());
	Object.assign(sessionForm, blankSession());
	Object.assign(lessonForm, blankLesson());
}

function startNew() {
	resetForm();
}

function pickCourse(c) {
	kind.value = "course";
	editingId.value = c.id || c.name;
	Object.assign(courseForm, blankCourse(), {
		id: c.id || "",
		name: c.name || "",
		code: c.code || "",
		category: c.category || "Training",
		trainer: c.trainer || "",
		color: c.color || "#6366f1",
		duration: c.duration || "",
		status: c.status || "Active",
		description: c.description || "",
	});
}

function pickSession(s) {
	kind.value = "session";
	editingId.value = s.name;
	Object.assign(sessionForm, blankSession(), {
		name: s.name || "",
		type: s.type || "Training",
		training_date: s.date || "",
		training_time: s.start_time || "10:00",
		training_end_time: s.end_time || "12:00",
		trainer_name: s.trainerName || "",
		training_type: s.title || s.program || "",
		program: s.program || s.title || "",
		mode_of_training: s.mode || "In-person",
		school_name: s.room || "",
	});
}

function pickLesson(l) {
	kind.value = "lesson";
	editingId.value = l.id;
	Object.assign(lessonForm, blankLesson(), {
		id: l.id || "",
		title: l.title || "",
		course: l.course || "",
		courseName: l.courseName || "",
		module: l.module || "Lessons",
		duration: l.duration || 20,
		order: l.order || 0,
		published: l.published ?? 1,
		summary: l.summary || "",
		content: l.content || "",
	});
}

function onCourseSelect(name) {
	const c = courses.value.find((x) => x.name === name || x.id === name);
	if (!c) return;
	if (kind.value === "session") {
		sessionForm.training_type = c.name;
		sessionForm.program = c.name;
		sessionForm.color = c.color || sessionForm.color;
		if (c.trainer) sessionForm.trainer_name = c.trainer;
	}
	if (kind.value === "lesson") {
		lessonForm.course = c.id || "";
		lessonForm.courseName = c.name;
	}
}

async function save() {
	saving.value = true;
	error.value = "";
	try {
		if (kind.value === "course") {
			if (!courseForm.name.trim()) throw new Error("Course name is required.");
			const saved = await apiPost(`${LMS_METHOD}.save_course`, { payload: { ...courseForm } });
			emit("toast", `Course card saved: ${saved.name}`);
		} else if (kind.value === "session") {
			if (!sessionForm.training_date) throw new Error("Session date is required.");
			if (!sessionForm.training_type && !sessionForm.program) {
				throw new Error("Pick a course for this session card.");
			}
			await apiPost(`${METHOD}.save_session`, {
				values: {
					name: sessionForm.name || undefined,
					type: sessionForm.type,
					training_date: sessionForm.training_date,
					training_time: sessionForm.training_time,
					training_end_time: sessionForm.training_end_time,
					trainer_name: sessionForm.trainer_name,
					training_type: sessionForm.training_type || sessionForm.program,
					program: sessionForm.program || sessionForm.training_type,
					mode_of_training: sessionForm.mode_of_training,
					school_name: sessionForm.school_name,
					schedule_status: "Upcoming",
				},
			});
			emit("toast", "Session card saved to Upcoming Training.");
		} else {
			if (!lessonForm.title.trim()) throw new Error("Lesson title is required.");
			if (!lessonForm.course && !lessonForm.courseName) throw new Error("Pick a course for this lesson.");
			await apiPost(`${LMS_METHOD}.save_lesson`, { payload: { ...lessonForm } });
			emit("toast", "Lesson card saved.");
		}
		await load();
		resetForm();
	} catch (e) {
		error.value = e.message || String(e);
	} finally {
		saving.value = false;
	}
}

async function removeCurrent() {
	if (!editingId.value) return;
	if (!window.confirm("Delete this card?")) return;
	saving.value = true;
	try {
		if (kind.value === "course" && courseForm.id) {
			await apiPost(`${LMS_METHOD}.delete_course`, { name: courseForm.id });
		} else if (kind.value === "lesson" && lessonForm.id) {
			await apiPost(`${LMS_METHOD}.delete_lesson`, { name: lessonForm.id });
		} else {
			throw new Error("Sessions are deleted from Upcoming Training in ERP.");
		}
		emit("toast", "Card deleted.");
		await load();
		resetForm();
	} catch (e) {
		error.value = e.message || String(e);
	} finally {
		saving.value = false;
	}
}

watch(kind, () => {
	search.value = "";
});

onMounted(load);
</script>

<template>
	<section class="studio">
		<div class="head">
			<div>
				<p class="kicker">Create cards</p>
				<h2>Courses, sessions &amp; lessons</h2>
				<p>Build the colored cards used on the weekly planner and in the LMS. Everything saves to ERP.</p>
			</div>
			<button type="button" class="ghost" @click="load">Refresh</button>
		</div>

		<div class="kpis">
			<div v-for="k in kpis" :key="k.label" class="kpi" :data-tone="k.tone">
				<span>{{ k.label }}</span>
				<strong>{{ k.value }}</strong>
			</div>
		</div>

		<div class="tabs">
			<button
				v-for="t in kinds"
				:key="t.id"
				type="button"
				:class="{ on: kind === t.id }"
				@click="kind = t.id; startNew()"
			>
				{{ t.label }}
				<small>{{ t.hint }}</small>
			</button>
		</div>

		<p v-if="error" class="err">{{ error }}</p>
		<p v-if="loading" class="muted">Loading cards…</p>

		<div class="layout">
			<div class="list-col">
				<div class="list-bar">
					<input v-model="search" type="search" :placeholder="`Search ${kind}s…`" />
					<button type="button" class="primary" @click="startNew">+ New {{ kind }}</button>
				</div>
				<div v-if="!filtered.length && !loading" class="empty">No {{ kind }} cards yet. Create one on the right.</div>
				<div class="grid">
					<button
						v-for="item in filtered"
						:key="item.id || item.name"
						type="button"
						class="mini"
						:class="{ on: editingId === (item.id || item.name) }"
						:style="{ '--cat': item.color || item.trainerColor || '#6366f1' }"
						@click="kind === 'course' ? pickCourse(item) : kind === 'session' ? pickSession(item) : pickLesson(item)"
					>
						<div class="mini-top">
							<strong>{{ item.name || item.title }}</strong>
							<span v-if="kind === 'session'" class="dot">{{ item.status === 'completed' ? '✓' : '○' }}</span>
						</div>
						<div class="mini-meta">
							<template v-if="kind === 'course'">{{ item.trainer || 'No trainer' }} · {{ item.category }}</template>
							<template v-else-if="kind === 'session'">
								{{ item.trainerName }} · {{ item.date }} · {{ item.start_time }}
							</template>
							<template v-else>{{ item.courseName || 'Course' }} · {{ item.duration }} min</template>
						</div>
					</button>
				</div>
			</div>

			<aside class="form-col">
				<div class="preview" :style="{ '--cat': preview.color }">
					<div class="preview-tag">{{ preview.tag }}</div>
					<strong>{{ preview.title }}</strong>
					<div class="preview-meta">
						<span class="ava">{{ initials(preview.meta) }}</span>
						{{ preview.meta }}
					</div>
				</div>

				<form class="form" @submit.prevent="save">
					<template v-if="kind === 'course'">
						<label>Course name
							<input v-model="courseForm.name" required placeholder="Storytelling" />
						</label>
						<label>Code
							<input v-model="courseForm.code" placeholder="STORY" />
						</label>
						<label>Category
							<select v-model="courseForm.category">
								<option>Training</option>
								<option>Workshop</option>
								<option>Leadership</option>
								<option>Communication</option>
								<option>Technical</option>
								<option>Management</option>
								<option>Other</option>
							</select>
						</label>
						<label>Trainer
							<input v-model="courseForm.trainer" list="card-trainers" placeholder="Muhammad Ajmal" />
						</label>
						<label>Duration
							<input v-model="courseForm.duration" placeholder="2 hours" />
						</label>
						<label>Status
							<select v-model="courseForm.status">
								<option>Active</option>
								<option>Inactive</option>
							</select>
						</label>
						<label class="full">Description
							<textarea v-model="courseForm.description" rows="3" placeholder="What this course covers" />
						</label>
						<div class="full colors">
							<span>Card color</span>
							<button
								v-for="c in PALETTE"
								:key="c"
								type="button"
								class="swatch"
								:class="{ on: courseForm.color === c }"
								:style="{ background: c }"
								@click="courseForm.color = c"
							/>
						</div>
					</template>

					<template v-else-if="kind === 'session'">
						<label class="full">Course
							<select :value="sessionForm.training_type || sessionForm.program" @change="onCourseSelect($event.target.value)">
								<option value="">Select course</option>
								<option v-for="c in courses" :key="c.name" :value="c.name">{{ c.name }}</option>
							</select>
						</label>
						<label>Type
							<select v-model="sessionForm.type">
								<option v-for="t in options.types" :key="t" :value="t">{{ t }}</option>
							</select>
						</label>
						<label>Date
							<DatePicker v-model="sessionForm.training_date" required />
						</label>
						<label>Start
							<TimePicker v-model="sessionForm.training_time" />
						</label>
						<label>End
							<TimePicker v-model="sessionForm.training_end_time" />
						</label>
						<label>Trainer
							<input v-model="sessionForm.trainer_name" list="card-trainers" />
						</label>
						<label>Mode
							<select v-model="sessionForm.mode_of_training">
								<option v-for="m in options.modes" :key="m" :value="m">{{ m }}</option>
							</select>
						</label>
						<label class="full">Venue / school
							<input v-model="sessionForm.school_name" placeholder="Room or school" />
						</label>
					</template>

					<template v-else>
						<label class="full">Course
							<select :value="lessonForm.course || lessonForm.courseName" @change="onCourseSelect($event.target.value)">
								<option value="">Select course</option>
								<option v-for="c in courses" :key="c.id || c.name" :value="c.id || c.name">{{ c.name }}</option>
							</select>
						</label>
						<label class="full">Lesson title
							<input v-model="lessonForm.title" required placeholder="What is storytelling?" />
						</label>
						<label>Module
							<input v-model="lessonForm.module" placeholder="Module 1" />
						</label>
						<label>Minutes
							<input v-model.number="lessonForm.duration" type="number" min="1" />
						</label>
						<label>Order
							<input v-model.number="lessonForm.order" type="number" min="0" />
						</label>
						<label class="check">
							<input v-model="lessonForm.published" type="checkbox" :true-value="1" :false-value="0" />
							Published
						</label>
						<label class="full">Summary
							<textarea v-model="lessonForm.summary" rows="2" />
						</label>
						<label class="full">Lesson body
							<textarea v-model="lessonForm.content" rows="5" placeholder="Students will see this in the LMS." />
						</label>
					</template>

					<div class="actions">
						<button class="primary" type="submit" :disabled="saving">
							{{ saving ? "Saving…" : editingId ? "Update card" : "Create card" }}
						</button>
						<button v-if="kind !== 'session' && editingId" type="button" class="danger" :disabled="saving" @click="removeCurrent">
							Delete
						</button>
						<button type="button" class="ghost" @click="startNew">Clear</button>
					</div>
				</form>
			</aside>
		</div>

		<datalist id="card-trainers">
			<option v-for="t in trainers" :key="t" :value="typeof t === 'string' ? t : t.name" />
		</datalist>
	</section>
</template>

<style scoped>
.studio {
	display: flex;
	flex-direction: column;
	gap: 16px;
}
.head {
	display: flex;
	justify-content: space-between;
	align-items: flex-start;
	gap: 16px;
}
.kicker {
	margin: 0;
	font-size: 11px;
	letter-spacing: 0.14em;
	text-transform: uppercase;
	color: #6366f1;
	font-weight: 700;
}
h2 {
	margin: 4px 0 6px;
	font-size: 22px;
}
.head p {
	margin: 0;
	color: var(--muted);
	font-size: 13px;
}
.kpis {
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	gap: 10px;
}
.kpi {
	background: #fff;
	border: 1px solid var(--line);
	border-radius: 14px;
	padding: 12px 14px;
	box-shadow: var(--shadow);
	display: flex;
	justify-content: space-between;
	align-items: center;
}
.kpi span {
	color: var(--muted);
	font-size: 13px;
}
.kpi strong {
	font-size: 22px;
}
.kpi[data-tone="purple"] strong { color: #7c3aed; }
.kpi[data-tone="blue"] strong { color: #2563eb; }
.kpi[data-tone="green"] strong { color: #059669; }
.tabs {
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	gap: 8px;
}
.tabs button {
	text-align: left;
	border: 1px solid var(--line);
	background: #fff;
	border-radius: 14px;
	padding: 12px 14px;
}
.tabs button small {
	display: block;
	color: var(--muted);
	font-size: 11px;
	margin-top: 4px;
	font-weight: 400;
}
.tabs button.on {
	border-color: #6366f1;
	background: #eef2ff;
	box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.12);
}
.layout {
	display: grid;
	grid-template-columns: 1.15fr 0.85fr;
	gap: 16px;
	align-items: start;
}
.list-col,
.form-col {
	background: #fff;
	border: 1px solid var(--line);
	border-radius: 16px;
	padding: 16px;
	box-shadow: var(--shadow);
}
.list-bar {
	display: flex;
	gap: 8px;
	margin-bottom: 12px;
}
.list-bar input {
	flex: 1;
	border: 1px solid var(--line);
	border-radius: 10px;
	padding: 9px 12px;
}
.grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px;
}
.mini {
	text-align: left;
	border: 1px solid color-mix(in srgb, var(--cat) 35%, #e5e7eb);
	background: color-mix(in srgb, var(--cat) 14%, #fff);
	border-radius: 12px;
	padding: 10px 12px;
}
.mini.on {
	box-shadow: 0 0 0 3px color-mix(in srgb, var(--cat) 25%, transparent);
}
.mini-top {
	display: flex;
	justify-content: space-between;
	gap: 8px;
}
.mini-top strong {
	font-size: 13px;
}
.mini-meta {
	margin-top: 6px;
	font-size: 12px;
	color: #475569;
}
.preview {
	border-radius: 14px;
	padding: 14px;
	margin-bottom: 14px;
	background: color-mix(in srgb, var(--cat) 18%, #fff);
	border: 1px solid color-mix(in srgb, var(--cat) 40%, #e5e7eb);
}
.preview-tag {
	font-size: 11px;
	font-weight: 700;
	color: var(--cat);
	margin-bottom: 6px;
	text-transform: uppercase;
	letter-spacing: 0.06em;
}
.preview-meta {
	display: flex;
	align-items: center;
	gap: 8px;
	margin-top: 8px;
	font-size: 12px;
	color: #475569;
}
.ava {
	width: 22px;
	height: 22px;
	border-radius: 999px;
	background: var(--cat);
	color: #fff;
	display: grid;
	place-items: center;
	font-size: 9px;
	font-weight: 700;
}
.form {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 10px;
}
.form label {
	display: flex;
	flex-direction: column;
	gap: 6px;
	font-size: 12px;
	font-weight: 600;
	color: #334155;
}
.form .full {
	grid-column: 1 / -1;
}
.form input,
.form select,
.form textarea {
	border: 1px solid var(--line);
	border-radius: 10px;
	padding: 8px 10px;
	font-weight: 400;
}
.colors {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	align-items: center;
}
.swatch {
	width: 22px;
	height: 22px;
	border-radius: 999px;
	border: 2px solid #fff;
	box-shadow: 0 0 0 1px #e5e7eb;
	padding: 0;
}
.swatch.on {
	box-shadow: 0 0 0 2px #111827;
}
.check {
	flex-direction: row !important;
	align-items: center;
	gap: 8px;
}
.actions {
	grid-column: 1 / -1;
	display: flex;
	gap: 8px;
	margin-top: 6px;
}
.primary,
.ghost,
.danger {
	border: 0;
	border-radius: 10px;
	padding: 9px 14px;
	font-weight: 600;
}
.primary {
	background: #4f46e5;
	color: #fff;
}
.ghost {
	background: #f1f5f9;
	color: #0f172a;
	border: 1px solid var(--line);
}
.danger {
	background: #fef2f2;
	color: #b91c1c;
}
.empty,
.muted,
.err {
	margin: 0;
	font-size: 13px;
}
.err {
	color: #b91c1c;
	background: #fef2f2;
	border: 1px solid #fecaca;
	padding: 10px 12px;
	border-radius: 10px;
}
@media (max-width: 980px) {
	.layout,
	.grid,
	.form,
	.tabs,
	.kpis {
		grid-template-columns: 1fr;
	}
}
</style>
