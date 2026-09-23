<script setup>
import { computed, reactive } from "vue";
import { state, go, openDoc, studentById, courseById, sessionById, toast, formatClock } from "../store";
import ListTools from "../components/ListTools.vue";
import { useRowSelection } from "../lib/list";
import { exportTable } from "../lib/format";

const filters = reactive({
	from: "",
	to: "",
	courseId: "",
	status: "",
	trainer: "",
	result: "",
	certStatus: "",
});

const attendanceRows = computed(() =>
	state.attendance.filter((a) => {
		if (filters.from && a.date < filters.from) return false;
		if (filters.to && a.date > filters.to) return false;
		if (filters.courseId && a.courseId !== filters.courseId) return false;
		if (filters.status && a.status !== filters.status) return false;
		if (filters.trainer && sessionById(a.sessionId)?.trainer !== filters.trainer) return false;
		return true;
	})
);
const quizRows = computed(() =>
	state.attempts.filter((a) => {
		if (filters.courseId && a.courseId !== filters.courseId) return false;
		if (filters.result === "pass" && !a.passed) return false;
		if (filters.result === "fail" && a.passed) return false;
		return true;
	})
);
const certRows = computed(() =>
	state.certificates.filter((c) => {
		if (filters.courseId && c.courseId !== filters.courseId) return false;
		if (filters.certStatus && c.status !== filters.certStatus) return false;
		if (filters.from && c.issue && c.issue < filters.from) return false;
		if (filters.to && c.issue && c.issue > filters.to) return false;
		return true;
	})
);
const attSel = useRowSelection(attendanceRows);
const quizSel = useRowSelection(quizRows);
const certSel = useRowSelection(certRows);
const trainers = computed(() => [...new Set(state.sessions.map((s) => s.trainer).filter(Boolean))].sort());

const attKpis = computed(() => [
	{ label: "Records", value: String(attendanceRows.value.length) },
	{ label: "Present", value: String(attendanceRows.value.filter((a) => a.status === "Present").length) },
	{ label: "Students", value: String(new Set(attendanceRows.value.map((a) => a.studentId)).size) },
	{ label: "Sessions", value: String(new Set(attendanceRows.value.map((a) => a.sessionId)).size) },
]);
const quizKpis = computed(() => [
	{ label: "Attempts", value: String(quizRows.value.length) },
	{ label: "Passed", value: String(quizRows.value.filter((a) => a.passed).length) },
	{ label: "Failed", value: String(quizRows.value.filter((a) => !a.passed).length) },
	{
		label: "Avg score",
		value: quizRows.value.length
			? `${Math.round(quizRows.value.reduce((n, a) => n + Number(a.score || 0), 0) / quizRows.value.length)}%`
			: "—",
	},
]);
const certKpis = computed(() => [
	{ label: "Certificates", value: String(certRows.value.length) },
	{ label: "Valid", value: String(certRows.value.filter((c) => c.status === "Valid").length) },
	{ label: "Revoked", value: String(certRows.value.filter((c) => c.status === "Revoked").length) },
	{ label: "Students", value: String(new Set(certRows.value.map((c) => c.studentId)).size) },
]);

const currentKpis = computed(() => {
	if (state.screen === "report_quiz") return quizKpis.value;
	if (state.screen === "report_cert") return certKpis.value;
	return attKpis.value;
});
const currentCount = computed(() => {
	if (state.screen === "report_quiz") return quizRows.value.length;
	if (state.screen === "report_cert") return certRows.value.length;
	return attendanceRows.value.length;
});
const currentSelected = computed(() => {
	if (state.screen === "report_quiz") return quizSel.selected.length;
	if (state.screen === "report_cert") return certSel.selected.length;
	return attSel.selected.length;
});

function doExport(kind) {
	if (state.screen === "report_quiz") {
		const rows = quizSel.chosen().map((a) => ({
			student: studentById(a.studentId)?.name || a.studentName,
			course: courseById(a.courseId)?.name || a.courseName,
			score: a.score,
			result: a.passed ? "Pass" : "Fail",
			when: a.at,
		}));
		exportTable(rows, ["student", "course", "score", "result", "when"], kind, "quiz-results");
	} else if (state.screen === "report_cert") {
		const rows = certSel.chosen().map((c) => ({
			certificate: c.id,
			student: studentById(c.studentId)?.name,
			course: courseById(c.courseId)?.name,
			issue: c.issue,
			expiry: c.expiry,
			status: c.status,
		}));
		exportTable(rows, ["certificate", "student", "course", "issue", "expiry", "status"], kind, "certificates");
	} else {
		const rows = attSel.chosen().map((a) => ({
			student: studentById(a.studentId)?.name,
			id: a.studentId,
			course: courseById(a.courseId)?.name,
			session: sessionById(a.sessionId)?.name,
			date: a.date,
			time: formatClock(a.time),
			status: a.status,
		}));
		exportTable(rows, ["student", "id", "course", "session", "date", "time", "status"], kind, "attendance");
	}
	if (kind !== "print" && kind !== "pdf") toast("Export ready.");
}
</script>

<template>
	<div class="tabs">
		<button class="tab" :class="{ on: state.screen === 'report_attendance' }" type="button" @click="go('report_attendance', 'reports')">
			Attendance
		</button>
		<button class="tab" :class="{ on: state.screen === 'report_quiz' }" type="button" @click="go('report_quiz', 'reports')">
			Quiz results
		</button>
		<button class="tab" :class="{ on: state.screen === 'report_cert' }" type="button" @click="go('report_cert', 'certs')">
			Certificates
		</button>
	</div>
	<ListTools
		:kpis="currentKpis"
		:count="currentCount"
		:selected="currentSelected"
		@export-csv="doExport('csv')"
		@export-xlsx="doExport('xlsx')"
		@export-print="doExport('print')"
	>
		<div class="form-grid">
			<label class="field"><span>From</span><input v-model="filters.from" type="date" /></label>
			<label class="field"><span>To</span><input v-model="filters.to" type="date" /></label>
			<label class="field">
				<span>Course</span>
				<select v-model="filters.courseId">
					<option value="">All courses</option>
					<option v-for="c in state.courses" :key="c.id" :value="c.id">{{ c.name }}</option>
				</select>
			</label>
			<label v-if="state.screen === 'report_attendance'" class="field">
				<span>Trainer</span>
				<select v-model="filters.trainer">
					<option value="">All trainers</option>
					<option v-for="t in trainers" :key="t" :value="t">{{ t }}</option>
				</select>
			</label>
			<label v-if="state.screen === 'report_attendance'" class="field">
				<span>Status</span>
				<select v-model="filters.status">
					<option value="">All statuses</option>
					<option>Present</option>
					<option>Late</option>
					<option>Absent</option>
				</select>
			</label>
			<label v-if="state.screen === 'report_quiz'" class="field">
				<span>Result</span>
				<select v-model="filters.result">
					<option value="">All results</option>
					<option value="pass">Pass</option>
					<option value="fail">Fail</option>
				</select>
			</label>
			<label v-if="state.screen === 'report_cert'" class="field">
				<span>Status</span>
				<select v-model="filters.certStatus">
					<option value="">All statuses</option>
					<option>Valid</option>
					<option>Revoked</option>
					<option>Expired</option>
				</select>
			</label>
		</div>
	</ListTools>

	<div v-if="state.screen === 'report_attendance'" class="card" style="padding: 0; overflow: hidden">
		<table class="data">
			<thead>
				<tr>
					<th class="check"><input type="checkbox" :checked="attSel.allOn" @change="attSel.toggleAll" /></th>
					<th>Student</th>
					<th>Course</th>
					<th>Session</th>
					<th>Date</th>
					<th>Time</th>
					<th>Status</th>
				</tr>
			</thead>
			<tbody>
				<tr v-for="a in attendanceRows" :key="a.id">
					<td class="check">
						<input type="checkbox" :checked="attSel.selectedSet.has(a.id)" @change="attSel.toggle(a.id, $event)" />
					</td>
					<td>{{ studentById(a.studentId)?.name }}</td>
					<td>{{ courseById(a.courseId)?.name }}</td>
					<td>{{ sessionById(a.sessionId)?.name }}</td>
					<td>{{ a.date }}</td>
					<td>{{ formatClock(a.time) }}</td>
					<td><span class="pill ok">{{ a.status }}</span></td>
				</tr>
				<tr v-if="!attendanceRows.length">
					<td colspan="7" style="padding: 20px; color: var(--muted)">No attendance in this range.</td>
				</tr>
			</tbody>
		</table>
	</div>

	<div v-else-if="state.screen === 'report_quiz'" class="card" style="padding: 0; overflow: hidden">
		<table class="data">
			<thead>
				<tr>
					<th class="check"><input type="checkbox" :checked="quizSel.allOn" @change="quizSel.toggleAll" /></th>
					<th>Student</th>
					<th>Course</th>
					<th>Score</th>
					<th>Result</th>
					<th>When</th>
				</tr>
			</thead>
			<tbody>
				<tr v-for="a in quizRows" :key="a.id">
					<td class="check">
						<input type="checkbox" :checked="quizSel.selectedSet.has(a.id)" @change="quizSel.toggle(a.id, $event)" />
					</td>
					<td>{{ studentById(a.studentId)?.name || a.studentName }}</td>
					<td>{{ courseById(a.courseId)?.name || a.courseName }}</td>
					<td>{{ a.score }}%</td>
					<td><span class="pill" :class="a.passed ? 'ok' : 'warn'">{{ a.passed ? "Pass" : "Fail" }}</span></td>
					<td>{{ a.at }}</td>
				</tr>
			</tbody>
		</table>
		<p v-if="!quizRows.length" class="empty">No attempts yet — set up a quiz on a program, then students take it from LMS view.</p>
	</div>

	<div v-else class="card" style="padding: 0; overflow: hidden">
		<table class="data">
			<thead>
				<tr>
					<th class="check"><input type="checkbox" :checked="certSel.allOn" @change="certSel.toggleAll" /></th>
					<th>Certificate</th>
					<th>Student</th>
					<th>Course</th>
					<th>Issue</th>
					<th>Expiry</th>
					<th>Status</th>
				</tr>
			</thead>
			<tbody>
				<tr v-for="c in certRows" :key="c.id" class="click" @click="state.selectedCertId = c.id; openDoc('cert_view', 'certs')">
					<td class="check" @click.stop>
						<input type="checkbox" :checked="certSel.selectedSet.has(c.id)" @change="certSel.toggle(c.id, $event)" />
					</td>
					<td style="font-family: var(--mono)">{{ c.id }}</td>
					<td>{{ studentById(c.studentId)?.name }}</td>
					<td>{{ courseById(c.courseId)?.name }}</td>
					<td>{{ c.issue }}</td>
					<td>{{ c.expiry }}</td>
					<td><span class="pill" :class="c.status === 'Valid' ? 'ok' : 'warn'">{{ c.status }}</span></td>
				</tr>
			</tbody>
		</table>
		<p v-if="!certRows.length" class="empty">No certificates match these filters.</p>
	</div>
</template>
