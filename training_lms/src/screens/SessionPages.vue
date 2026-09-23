<script setup>
import { computed, reactive, onMounted, onUnmounted, watch } from "vue";
import {
	state,
	go,
	openDoc,
	goBack,
	addSession,
	sessionById,
	courseById,
	studentById,
	presentCount,
	sessionAttendance,
	startAttendance,
	closeAttendance,
	markAttendance,
	qrImage,
	qrUrl,
	qrStatus,
	toast,
	mergeServerCheckins,
	activateQuizForSession,
	quizForCourse,
	todayIso,
	formatClock,
} from "../store";
import { apiGet, LMS_METHOD } from "../lib/api";
import ListTools from "../components/ListTools.vue";
import { useRowSelection } from "../lib/list";
import { exportTable } from "../lib/format";

const form = reactive({
	name: "",
	courseId: "",
	trainer: "",
	date: new Date().toLocaleDateString("en-CA"),
	start: "10:00",
	end: "12:30",
	location: "",
	expected: 30,
});
const filters = reactive({ courseId: "", trainer: "", status: "", from: "", to: "" });
const q = computed(() => (state.headerSearch || "").toLowerCase());
const trainers = computed(() => [...new Set(state.sessions.map((s) => s.trainer).filter(Boolean))].sort());
const statuses = computed(() => [...new Set(state.sessions.map((s) => s.status).filter(Boolean))]);
const list = computed(() =>
	state.sessions.filter((s) => {
		const c = courseById(s.courseId);
		const hay = `${s.name} ${s.trainer} ${c?.name || ""}`.toLowerCase();
		if (q.value && !hay.includes(q.value)) return false;
		if (filters.courseId && s.courseId !== filters.courseId) return false;
		if (filters.trainer && s.trainer !== filters.trainer) return false;
		if (filters.status && s.status !== filters.status) return false;
		if (filters.from && s.date < filters.from) return false;
		if (filters.to && s.date > filters.to) return false;
		return true;
	})
);
const sel = useRowSelection(list);
const kpis = computed(() => [
	{ label: "Sessions", value: String(list.value.length), hint: "in current filter" },
	{ label: "Today", value: String(list.value.filter((s) => s.date === todayIso()).length) },
	{
		label: "Attendance open",
		value: String(list.value.filter((s) => s.qrActive || s.status === "Attendance open").length),
	},
	{ label: "Present", value: String(list.value.reduce((n, s) => n + presentCount(s.id), 0)) },
]);
const session = computed(() => sessionById(state.selectedSessionId));
const course = computed(() => courseById(session.value?.courseId));
const rows = computed(() =>
	sessionAttendance(state.selectedSessionId).map((a) => ({
		...a,
		student: studentById(a.studentId),
	}))
);
const quizLive = computed(() => {
	const qz = quizForCourse(session.value?.courseId);
	return !!(session.value?.quizLive || (qz && qz.published !== 0));
});
const liveStatus = computed(() => qrStatus(session.value));
const rowSel = useRowSelection(rows);

let tick;
let poll = 0;
onMounted(() => {
	tick = setInterval(() => {
		state.liveTick += 1;
		poll += 1;
		const s = session.value;
		if (poll % 3 === 0 && s?.qrToken && state.screen === "qr_screen") {
			apiGet(`${LMS_METHOD}.list_checkins`, { token: s.qrToken })
				.then((res) => {
					if (res?.rows) mergeServerCheckins(s.id, res.rows);
				})
				.catch(() => {});
		}
	}, 1000);
});
onUnmounted(() => clearInterval(tick));

watch(
	() => [state.courses.length, state.trainers.length, state.screen],
	() => {
		if (!form.courseId && state.courses[0]) form.courseId = state.selectedCourseId || state.courses[0].id;
		if (!form.trainer && state.trainers[0]) form.trainer = state.trainers[0].name;
	},
	{ immediate: true }
);

function save() {
	if (!form.name || !form.courseId || !form.date) {
		toast("Program, session name, and date are required.");
		return;
	}
	addSession({ ...form });
}
function open(s) {
	state.selectedSessionId = s.id;
	openDoc("session_detail", "sessions");
}
function manual(studentId) {
	const r = markAttendance(studentId, session.value, "Manually Marked");
	toast(r.ok ? "Attendance marked manually." : "Already recorded for this session.");
}
async function activateQuiz() {
	await activateQuizForSession(session.value);
}
const notPresent = computed(() => {
	const ids = new Set(rows.value.map((r) => r.studentId));
	return state.students.filter((s) => !ids.has(s.id));
});
function exportSessions(kind) {
	const data = sel.chosen().map((s) => ({
		session: s.name,
		course: courseById(s.courseId)?.name,
		trainer: s.trainer,
		date: s.date,
		time: `${s.start}–${s.end}`,
		present: `${presentCount(s.id)} / ${s.expected || ""}`,
		status: s.status,
	}));
	exportTable(data, ["session", "course", "trainer", "date", "time", "present", "status"], kind, "sessions");
	if (kind !== "print" && kind !== "pdf") toast("Export ready.");
}
function exportSessionAtt(kind) {
	const data = rowSel.chosen().map((a) => ({
		student: a.student?.name,
		id: a.studentId,
		time: formatClock(a.time),
		status: a.status,
		device: a.device,
	}));
	exportTable(data, ["student", "id", "time", "status", "device"], kind, "session-attendance");
	if (kind !== "print" && kind !== "pdf") toast("Export ready.");
}
</script>

<template>
	<div v-if="state.screen === 'sessions'">
		<div class="row" style="justify-content: space-between">
			<h3 style="margin: 0">Training sessions</h3>
			<button class="btn primary" type="button" @click="go('session_create', 'sessions')">Create session</button>
		</div>
		<ListTools
			:kpis="kpis"
			:count="list.length"
			:selected="sel.selected.length"
			@export-csv="exportSessions('csv')"
			@export-xlsx="exportSessions('xlsx')"
			@export-print="exportSessions('print')"
		>
			<div class="form-grid">
				<label class="field">
					<span>Program</span>
					<select v-model="filters.courseId">
						<option value="">All programs</option>
						<option v-for="c in state.courses" :key="c.id" :value="c.id">{{ c.name }}</option>
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
						<option v-for="st in statuses" :key="st" :value="st">{{ st }}</option>
					</select>
				</label>
				<label class="field"><span>From</span><input v-model="filters.from" type="date" /></label>
				<label class="field"><span>To</span><input v-model="filters.to" type="date" /></label>
			</div>
		</ListTools>
		<div class="card" style="padding: 0; overflow: hidden">
			<table class="data">
				<thead>
					<tr>
						<th class="check"><input type="checkbox" :checked="sel.allOn" @change="sel.toggleAll" /></th>
						<th>Session</th>
						<th>Course</th>
						<th>Trainer</th>
						<th>When</th>
						<th>Present</th>
						<th>Status</th>
					</tr>
				</thead>
				<tbody>
					<tr v-for="s in list" :key="s.id" class="click" @click="open(s)">
						<td class="check" @click.stop>
							<input type="checkbox" :checked="sel.selectedSet.has(s.id)" @change="sel.toggle(s.id, $event)" />
						</td>
						<td style="font-weight: 600">{{ s.name }}</td>
						<td>{{ courseById(s.courseId)?.name }}</td>
						<td>{{ s.trainer }}</td>
						<td>{{ s.date }} · {{ s.start }}–{{ s.end }}</td>
						<td>{{ presentCount(s.id) }} / {{ s.expected }}</td>
						<td><span class="pill" :class="s.qrActive ? 'ok' : 'mute'">{{ s.status }}</span></td>
					</tr>
					<tr v-if="!list.length">
						<td colspan="7" style="padding: 20px; color: var(--muted)">No sessions match these filters.</td>
					</tr>
				</tbody>
			</table>
		</div>
	</div>

	<div v-else-if="state.screen === 'session_create'" class="card" style="max-width: 760px">
		<h3>Create session</h3>
		<div class="form-grid">
			<label class="field full"><span>Session name</span><input v-model="form.name" placeholder="Session 1 — Introduction" /></label>
			<label class="field">
				<span>Program</span>
				<select v-model="form.courseId">
					<option disabled value="">Select program</option>
					<option v-for="c in state.courses" :key="c.id" :value="c.id">{{ c.name }}</option>
				</select>
			</label>
			<label class="field">
				<span>Trainer</span>
				<select v-model="form.trainer">
					<option disabled value="">Select trainer</option>
					<option v-for="t in state.trainers" :key="t.name" :value="t.name">{{ t.name }}</option>
				</select>
			</label>
			<label class="field"><span>Date</span><input v-model="form.date" type="date" /></label>
			<label class="field"><span>Location</span><input v-model="form.location" /></label>
			<label class="field"><span>Start time</span><input v-model="form.start" type="time" /></label>
			<label class="field"><span>End time</span><input v-model="form.end" type="time" /></label>
			<label class="field"><span>Expected students</span><input v-model.number="form.expected" type="number" /></label>
		</div>
		<div class="row" style="margin-top: 18px">
			<button class="btn primary" type="button" @click="save">Save session</button>
			<button class="btn" type="button" @click="go('sessions', 'sessions')">Cancel</button>
		</div>
	</div>

	<div v-else-if="state.screen === 'session_detail' && session" class="profile-page">
		<div class="row" style="justify-content: space-between; align-items: flex-start">
			<div>
				<button class="btn ghost" type="button" @click="goBack">← Back</button>
				<div class="q-meta" style="margin-top: 10px">{{ course?.code }}</div>
				<h2 style="margin: 6px 0 0">{{ session.name }}</h2>
			</div>
			<div class="row">
				<button class="btn primary" type="button" @click="startAttendance(session.id)">
					{{ session.qrActive ? "Display QR" : "Start attendance" }}
				</button>
				<button class="btn" type="button" @click="closeAttendance(session.id)">Close attendance</button>
				<button class="btn ghost" type="button" @click="activateQuiz">
					{{ quizLive ? "Quiz is live" : "Activate quiz" }}
				</button>
			</div>
		</div>
		<div class="card">
			<div class="form-grid">
				<label class="field full"><span>Session name</span><input :value="session.name" readonly /></label>
				<label class="field"><span>Program</span><input :value="course?.name || ''" readonly /></label>
				<label class="field"><span>Trainer</span><input :value="session.trainer || ''" readonly /></label>
				<label class="field"><span>Date</span><input :value="session.date" readonly /></label>
				<label class="field"><span>Time</span><input :value="`${session.start || ''} – ${session.end || ''}`" readonly /></label>
				<label class="field"><span>Location</span><input :value="session.location || ''" readonly /></label>
				<label class="field"><span>Status</span><input :value="session.status" readonly /></label>
			</div>
		</div>
		<div class="grid-kpis">
			<div class="kpi"><div class="l">Present</div><div class="v">{{ presentCount(session.id) }}</div></div>
			<div class="kpi"><div class="l">Absent</div><div class="v">{{ Math.max(session.expected - presentCount(session.id), 0) }}</div></div>
			<div class="kpi"><div class="l">Date</div><div class="v" style="font-size: 18px">{{ session.date }}</div></div>
			<div class="kpi"><div class="l">Window</div><div class="v" style="font-size: 18px">{{ session.start }}–{{ session.end }}</div></div>
		</div>
		<div class="two">
			<div class="card" style="padding: 0; overflow: hidden">
				<div class="row" style="padding: 16px 20px; justify-content: space-between">
					<h3 style="margin: 0">Attendance record</h3>
					<div class="row">
						<button class="btn" type="button" @click="exportSessionAtt('csv')">Export CSV</button>
						<button class="btn" type="button" @click="exportSessionAtt('print')">Print</button>
					</div>
				</div>
				<table class="data">
					<thead>
						<tr>
							<th class="check"><input type="checkbox" :checked="rowSel.allOn" @change="rowSel.toggleAll" /></th>
							<th>Student</th>
							<th>Time</th>
							<th>Status</th>
							<th>Device</th>
						</tr>
					</thead>
					<tbody>
						<tr v-for="a in rows" :key="a.id">
							<td class="check">
								<input type="checkbox" :checked="rowSel.selectedSet.has(a.id)" @change="rowSel.toggle(a.id, $event)" />
							</td>
							<td>
								<div style="font-weight: 600">{{ a.student?.name }}</div>
								<div style="font-size: 12px; color: var(--faint)">{{ a.studentId }}</div>
							</td>
							<td>{{ formatClock(a.time) }}</td>
							<td><span class="pill ok">{{ a.status }}</span></td>
							<td style="font-size: 12px; color: var(--muted)">{{ a.device }}</td>
						</tr>
					</tbody>
				</table>
			</div>
			<div class="card">
				<h3>Manual correction</h3>
				<p style="font-size: 13px; color: var(--muted)">Mark a student who could not scan. This is logged in the audit trail.</p>
				<button
					v-for="st in notPresent"
					:key="st.id"
					class="btn"
					style="width: 100%; text-align: left; margin-bottom: 8px"
					type="button"
					@click="manual(st.id)"
				>
					{{ st.name }} · {{ st.phone }}
				</button>
			</div>
		</div>
	</div>

	<div v-else-if="state.screen === 'session_detail'" class="card">
		<p v-if="state.catalogLoading">Loading session…</p>
		<template v-else>
			<h3 style="margin: 0 0 8px">Session not found</h3>
			<p style="color: var(--muted)">Open a session from the list to view attendance and the QR.</p>
			<button class="btn primary" style="margin-top: 12px" type="button" @click="go('sessions', 'sessions')">Back to sessions</button>
		</template>
	</div>

	<div v-if="state.screen === 'qr_screen' && session">
		<div class="row" style="justify-content: space-between; margin-bottom: 12px">
			<div>
				<div class="q-meta">Live attendance QR</div>
				<p style="margin: 4px 0 0; color: var(--muted); font-size: 13px">{{ course?.name }} · {{ session.date }}</p>
			</div>
			<div class="row">
				<button class="btn primary" type="button" @click="go('session_detail', 'sessions')">Open session</button>
				<button class="btn" type="button" @click="closeAttendance(session.id); go('session_detail', 'sessions')">Close attendance</button>
			</div>
		</div>
		<div class="two">
		<div class="card" style="text-align: center">
			<div class="q-meta">{{ course?.name }}</div>
			<h2 style="cursor: pointer" @click="go('session_detail', 'sessions')">{{ session.name }}</h2>
			<p>Scan this QR to mark attendance.</p>
			<img v-if="session.qrToken" :src="qrImage(session.qrToken)" alt="Attendance QR" width="280" height="280" style="border-radius: 16px" />
			<p v-else class="pill warn">Preparing QR… stay signed in and click Start attendance again if this stays blank.</p>
			<p v-if="session.qrToken" style="font-size: 12px; color: var(--faint); word-break: break-all">{{ qrUrl(session.qrToken) }}</p>
			<p v-if="liveStatus === 'expired' || liveStatus === 'closed'" class="pill warn">Attendance for this session has been closed.</p>
			<p v-else class="pill ok">QR valid · {{ state.settings.qrValidity }} · tick {{ state.liveTick }}</p>
		</div>
		<div class="card">
			<h3>Live attendance</h3>
			<div class="row" style="margin-bottom: 12px">
				<span class="pill ok">Present: {{ presentCount(session.id) }}</span>
				<span class="pill info">Registered today: {{ rows.filter((r) => r.student?.registered === todayIso()).length }}</span>
				<span class="pill mute">Existing: {{ rows.filter((r) => r.student?.registered !== todayIso()).length }}</span>
			</div>
			<div class="live-feed">
				<div v-for="a in rows" :key="a.id" class="feed-row">
					<span>{{ a.student?.name }}</span>
					<span>{{ formatClock(a.time) }} ✅</span>
				</div>
			</div>
		</div>
		</div>
	</div>
</template>
