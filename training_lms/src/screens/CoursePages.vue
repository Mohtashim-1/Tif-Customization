<script setup>
import { computed, reactive } from "vue";
import {
	state,
	go,
	openDoc,
	goBack,
	addCourse,
	courseById,
	presentCount,
	quizzesForCourse,
	openQuizEditor,
	deleteQuiz,
	isStudent,
	toast,
} from "../store";
import ListTools from "../components/ListTools.vue";
import { useRowSelection } from "../lib/list";
import { exportTable } from "../lib/format";

const form = reactive({
	name: "",
	code: "",
	category: "HSE",
	description: "",
	trainer: "John Smith",
	duration: "1 Day",
	start: "2026-09-22",
	end: "2026-09-22",
	venue: "",
	max: 30,
	passing: 70,
	sessionsCount: 4,
	status: "Active",
});
const filters = reactive({ category: "", trainer: "", status: "" });
const trainerFilter = reactive({ minSessions: "" });

const q = computed(() => (state.headerSearch || "").toLowerCase());
const categories = computed(() => [...new Set(state.courses.map((c) => c.category).filter(Boolean))].sort());
const trainers = computed(() => [...new Set(state.courses.map((c) => c.trainer).filter(Boolean))].sort());
const list = computed(() =>
	state.courses.filter((c) => {
		if (q.value && ![c.name, c.code, c.trainer].join(" ").toLowerCase().includes(q.value)) return false;
		if (filters.category && c.category !== filters.category) return false;
		if (filters.trainer && c.trainer !== filters.trainer) return false;
		if (filters.status && c.status !== filters.status) return false;
		return true;
	})
);
const sel = useRowSelection(list);
const trainerList = computed(() =>
	state.trainers.filter((t) => {
		if (q.value && !t.name.toLowerCase().includes(q.value)) return false;
		if (trainerFilter.minSessions && Number(t.sessions || 0) < Number(trainerFilter.minSessions)) return false;
		return true;
	})
);
const trainerSel = useRowSelection(trainerList, "name");
const courseKpis = computed(() => [
	{ label: "Programs", value: String(list.value.length), hint: "in current filter" },
	{ label: "Categories", value: String(categories.value.length) },
	{ label: "With sessions", value: String(list.value.filter((c) => (c.sessionsCount || 0) > 0).length) },
	{ label: "Trainers", value: String(trainers.value.length) },
]);
const trainerKpis = computed(() => [
	{ label: "Trainers", value: String(trainerList.value.length) },
	{ label: "Sessions", value: String(trainerList.value.reduce((n, t) => n + Number(t.sessions || 0), 0)) },
	{ label: "Upcoming", value: String(trainerList.value.reduce((n, t) => n + Number(t.upcoming || 0), 0)) },
	{ label: "Completed", value: String(trainerList.value.reduce((n, t) => n + Number(t.completed || 0), 0)) },
]);

const course = computed(() => courseById(state.selectedCourseId));
const sessions = computed(() => state.sessions.filter((s) => s.courseId === state.selectedCourseId));
const modules = computed(() => state.modules.filter((m) => m.courseId === state.selectedCourseId));
const quizzes = computed(() => quizzesForCourse(state.selectedCourseId));

function open(c) {
	state.selectedCourseId = c.id;
	openDoc(isStudent.value ? "lms_course" : "course_detail", "courses");
}

function save() {
	if (!form.name) return;
	addCourse({ ...form });
}

function openSession(s) {
	state.selectedSessionId = s.id;
	openDoc("session_detail", "sessions");
}

function exportCourses(kind) {
	const rows = sel.chosen().map((c) => ({
		name: c.name,
		code: c.code,
		category: c.category,
		trainer: c.trainer,
		duration: c.duration,
		sessions: c.sessionsCount,
		status: c.status,
	}));
	exportTable(rows, ["name", "code", "category", "trainer", "duration", "sessions", "status"], kind, "programs");
	if (kind !== "print" && kind !== "pdf") toast("Export ready.");
}

function exportTrainers(kind) {
	const rows = trainerSel.chosen().map((t) => ({
		name: t.name,
		sessions: t.sessions,
		upcoming: t.upcoming,
		completed: t.completed,
	}));
	exportTable(rows, ["name", "sessions", "upcoming", "completed"], kind, "trainers");
	if (kind !== "print" && kind !== "pdf") toast("Export ready.");
}
</script>

<template>
	<div v-if="state.screen === 'courses'">
		<div class="row" style="justify-content: space-between">
			<div>
				<h3 style="margin: 0">Training programs</h3>
				<p style="margin: 4px 0 0; color: var(--muted); font-size: 13px">
					Same catalog as Upcoming Training. Open a program, then schedule a session.
				</p>
			</div>
			<div class="row">
				<button v-if="!isStudent" class="btn" type="button" @click="go('trainers', 'trainers')">Trainers</button>
				<button v-if="!isStudent" class="btn primary" type="button" @click="go('course_create', 'courses')">Create program</button>
			</div>
		</div>
		<ListTools
			:kpis="courseKpis"
			:count="list.length"
			:selected="sel.selected.length"
			@export-csv="exportCourses('csv')"
			@export-xlsx="exportCourses('xlsx')"
			@export-print="exportCourses('print')"
		>
			<div class="form-grid">
				<label class="field">
					<span>Category</span>
					<select v-model="filters.category">
						<option value="">All categories</option>
						<option v-for="cat in categories" :key="cat" :value="cat">{{ cat }}</option>
					</select>
				</label>
				<label class="field">
					<span>Trainer</span>
					<select v-model="filters.trainer">
						<option value="">All trainers</option>
						<option v-for="t in trainers" :key="t" :value="t">{{ t }}</option>
					</select>
				</label>
				<label class="field">
					<span>Status</span>
					<select v-model="filters.status">
						<option value="">All statuses</option>
						<option>Active</option>
						<option>Inactive</option>
					</select>
				</label>
			</div>
		</ListTools>
		<div class="card" style="padding: 0; overflow: hidden; margin-bottom: 14px">
			<table class="data">
				<thead>
					<tr>
						<th class="check"><input type="checkbox" :checked="sel.allOn" @change="sel.toggleAll" /></th>
						<th>Program</th>
						<th>Category</th>
						<th>Trainer</th>
						<th>Sessions</th>
						<th>Status</th>
					</tr>
				</thead>
				<tbody>
					<tr v-for="c in list" :key="c.id" class="click" @click="open(c)">
						<td class="check" @click.stop>
							<input type="checkbox" :checked="sel.selectedSet.has(c.id)" @change="sel.toggle(c.id, $event)" />
						</td>
						<td>
							<div style="font-weight: 600">{{ c.name }}</div>
							<div style="font-size: 12px; color: var(--faint)">{{ c.code }}</div>
						</td>
						<td>{{ c.category }}</td>
						<td>{{ c.trainer }}</td>
						<td>{{ c.sessionsCount }}</td>
						<td><span class="pill" :class="c.status === 'Active' ? 'ok' : 'mute'">{{ c.status }}</span></td>
					</tr>
					<tr v-if="!list.length">
						<td colspan="6" style="padding: 20px; color: var(--muted)">No programs match these filters.</td>
					</tr>
				</tbody>
			</table>
		</div>
		<p v-if="!list.length" class="empty">No programs found. Create a program or check Upcoming Training.</p>
	</div>

	<div v-else-if="state.screen === 'trainers'">
		<div class="row" style="justify-content: space-between">
			<div>
				<h3 style="margin: 0">Trainers</h3>
				<p style="margin: 4px 0 0; color: var(--muted); font-size: 13px">People delivering Upcoming Training.</p>
			</div>
			<button class="btn" type="button" @click="go('courses', 'courses')">Programs</button>
		</div>
		<ListTools
			:kpis="trainerKpis"
			:count="trainerList.length"
			:selected="trainerSel.selected.length"
			@export-csv="exportTrainers('csv')"
			@export-xlsx="exportTrainers('xlsx')"
			@export-print="exportTrainers('print')"
		>
			<div class="form-grid">
				<label class="field">
					<span>Minimum sessions</span>
					<select v-model="trainerFilter.minSessions">
						<option value="">Any</option>
						<option value="1">1+</option>
						<option value="5">5+</option>
						<option value="10">10+</option>
					</select>
				</label>
			</div>
		</ListTools>
		<div class="card" style="padding: 0; overflow: hidden">
			<table class="data">
				<thead>
					<tr>
						<th class="check"><input type="checkbox" :checked="trainerSel.allOn" @change="trainerSel.toggleAll" /></th>
						<th>Trainer</th>
						<th>Sessions</th>
						<th>Upcoming</th>
						<th>Completed</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					<tr v-for="t in trainerList" :key="t.name" class="click" @click="go('sessions', 'sessions')">
						<td class="check" @click.stop>
							<input type="checkbox" :checked="trainerSel.selectedSet.has(t.name)" @change="trainerSel.toggle(t.name, $event)" />
						</td>
						<td>
							<div class="row">
								<span class="ava" :style="{ background: t.color || '#0e7c7b' }">{{ t.initials || t.name.slice(0, 2) }}</span>
								<strong>{{ t.name }}</strong>
							</div>
						</td>
						<td>{{ t.sessions }}</td>
						<td>{{ t.upcoming }}</td>
						<td>{{ t.completed }}</td>
						<td><span style="color: var(--teal); font-weight: 600">View sessions →</span></td>
					</tr>
					<tr v-if="!trainerList.length">
						<td colspan="6" style="padding: 20px; color: var(--muted)">No trainers match these filters.</td>
					</tr>
				</tbody>
			</table>
		</div>
	</div>

	<div v-else-if="state.screen === 'course_create'" class="card" style="max-width: 820px">
		<h3>Create program</h3>
		<div class="form-grid">
			<label class="field full"><span>Program name</span><input v-model="form.name" placeholder="TECC (Professional)" /></label>
			<label class="field">
				<span>Type</span>
				<select v-model="form.category">
					<option>Training</option>
					<option>Workshop</option>
				</select>
			</label>
			<label class="field">
				<span>Trainer</span>
				<select v-model="form.trainer">
					<option value="">Select trainer</option>
					<option v-for="t in state.trainers" :key="t.name" :value="t.name">{{ t.name }}</option>
				</select>
			</label>
			<label class="field full"><span>Description</span><textarea v-model="form.description" rows="3" /></label>
			<label class="field"><span>Passing percentage</span><input v-model.number="form.passing" type="number" /></label>
		</div>
		<div class="row" style="margin-top: 18px">
			<button class="btn primary" type="button" @click="save">Save program</button>
			<button class="btn" type="button" @click="go('courses', 'courses')">Cancel</button>
		</div>
	</div>

	<div v-else-if="state.screen === 'course_detail' && course" class="profile-page">
		<div class="row" style="justify-content: space-between; align-items: flex-start">
			<div>
				<button class="btn ghost" type="button" @click="goBack">← Back</button>
				<div class="q-meta" style="margin-top: 10px">{{ course.code }} · {{ course.category }}</div>
				<h2 style="margin: 6px 0 0">{{ course.name }}</h2>
			</div>
			<div class="row">
				<button class="btn primary" type="button" @click="openQuizEditor(null)">Create quiz</button>
				<button class="btn" type="button" @click="go('session_create', 'sessions')">Create session</button>
			</div>
		</div>
		<div class="card">
			<div class="form-grid">
				<label class="field full"><span>Program name</span><input :value="course.name" readonly /></label>
				<label class="field"><span>Code</span><input :value="course.code" readonly /></label>
				<label class="field"><span>Category</span><input :value="course.category" readonly /></label>
				<label class="field"><span>Trainer</span><input :value="course.trainer || ''" readonly /></label>
				<label class="field"><span>Duration</span><input :value="course.duration || ''" readonly /></label>
				<label class="field"><span>Venue</span><input :value="course.venue || ''" readonly /></label>
				<label class="field"><span>Passing %</span><input :value="course.passing" readonly /></label>
				<label class="field"><span>Dates</span><input :value="[course.start, course.end].filter(Boolean).join(' → ')" readonly /></label>
				<label class="field"><span>Capacity</span><input :value="course.max ? `${course.max} participants` : ''" readonly /></label>
				<label class="field full"><span>Description</span><textarea :value="course.description" rows="3" readonly /></label>
			</div>
		</div>
		<div class="card" style="padding: 0; overflow: hidden">
			<div style="padding: 16px 20px"><h3 style="margin: 0">Training sessions</h3></div>
			<table class="data">
				<thead>
					<tr><th>Session</th><th>Date</th><th>Time</th><th>Present</th><th>Status</th></tr>
				</thead>
				<tbody>
					<tr v-for="s in sessions" :key="s.id" class="click" @click="openSession(s)">
						<td>{{ s.name }}</td>
						<td>{{ s.date }}</td>
						<td>{{ s.start }} – {{ s.end }}</td>
						<td>{{ presentCount(s.id) }} / {{ s.expected }}</td>
						<td><span class="pill mute">{{ s.status }}</span></td>
					</tr>
				</tbody>
			</table>
		</div>
		<div class="card">
			<h3>LMS modules</h3>
			<div v-for="m in modules" :key="m.id" class="card" style="margin-bottom: 8px; box-shadow: none">
				<strong>{{ m.title }}</strong>
				<div style="font-size: 13px; color: var(--muted); margin-top: 6px">{{ (m.lessons || []).join(" · ") }}</div>
			</div>
			<p v-if="!modules.length" class="empty">No modules yet. Add videos, PDFs, and lessons after saving the course.</p>
		</div>
		<div class="card">
			<h3>Quizzes</h3>
			<p style="color: var(--muted); font-size: 13px; margin: 0 0 10px">
				Create a quiz here and click Save. It is stored in ERP, so it remains after refresh.
			</p>
			<table v-if="quizzes.length" class="data">
				<thead>
					<tr><th>Quiz</th><th>Questions</th><th>Pass</th><th>Status</th><th></th></tr>
				</thead>
				<tbody>
					<tr v-for="qz in quizzes" :key="qz.id">
						<td>{{ qz.name }}</td>
						<td>{{ qz.questions?.length || 0 }}</td>
						<td>{{ qz.passing }}%</td>
						<td><span class="pill" :class="qz.published ? 'ok' : 'mute'">{{ qz.published ? "Published" : "Draft" }}</span></td>
						<td>
							<button class="btn ghost" type="button" @click="openQuizEditor(qz)">Edit</button>
							<button class="btn ghost" type="button" @click="deleteQuiz(qz.id)">Delete</button>
						</td>
					</tr>
				</tbody>
			</table>
			<p v-else class="empty">No quiz for this program yet.</p>
			<button class="btn primary" type="button" style="margin-top: 10px" @click="openQuizEditor(null)">Create quiz</button>
		</div>
		<div class="row">
			<button class="btn" type="button" @click="go('lms_course')">Open LMS view</button>
		</div>
	</div>

	<div v-else-if="state.screen === 'course_detail'" class="card">
		<p v-if="state.catalogLoading">Loading program…</p>
		<template v-else>
			<h3 style="margin: 0 0 8px">Program not found</h3>
			<p style="color: var(--muted)">Open a program from the catalog to see sessions and quizzes.</p>
			<button class="btn primary" style="margin-top: 12px" type="button" @click="go('courses', 'courses')">Back to catalog</button>
		</template>
	</div>
</template>
