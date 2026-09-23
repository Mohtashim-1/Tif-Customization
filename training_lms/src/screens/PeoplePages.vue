<script setup>
import { computed, reactive, watch } from "vue";
import {
	state,
	go,
	goBack,
	openDoc,
	addStudent,
	studentById,
	enrollmentsFor,
	attendanceForStudent,
	attemptsFor,
	courseById,
	sessionById,
	toast,
	formatClock,
} from "../store";
import ListTools from "../components/ListTools.vue";
import { useRowSelection } from "../lib/list";
import { exportTable } from "../lib/format";

const form = reactive({
	name: "",
	phone: "",
	email: "",
	cnic: "",
	org: "",
	designation: "",
	employeeId: "",
	gender: "",
});
const filters = reactive({ org: "", status: "", courseId: "" });
const q = computed(() => (state.headerSearch || "").toLowerCase());
const orgs = computed(() => [...new Set(state.students.map((s) => s.org).filter(Boolean))].sort());
const statuses = computed(() => [...new Set(state.students.map((s) => s.status || "Active"))].sort());

const list = computed(() =>
	state.students.filter((s) => {
		const hay = `${s.id} ${s.name} ${s.phone} ${s.email} ${s.cnic} ${s.org}`.toLowerCase();
		const certHit = state.certificates.some(
			(c) => c.studentId === s.id && c.id.toLowerCase().includes(q.value)
		);
		if (q.value && !hay.includes(q.value) && !certHit) return false;
		if (filters.org && s.org !== filters.org) return false;
		if (filters.status && (s.status || "Active") !== filters.status) return false;
		if (filters.courseId && !enrollmentsFor(s.id).some((e) => e.courseId === filters.courseId)) return false;
		return true;
	})
);
const sel = useRowSelection(list);
const student = computed(() => studentById(state.selectedStudentId));
const enrolled = computed(() => enrollmentsFor(state.selectedStudentId));
const att = computed(() => attendanceForStudent(state.selectedStudentId));
const quizzes = computed(() => attemptsFor(state.selectedStudentId));
const certs = computed(() => state.certificates.filter((c) => c.studentId === state.selectedStudentId));
const attSel = useRowSelection(att);
const tabLabels = {
	overview: "Overview",
	courses: "Courses",
	attendance: "Attendance",
	quiz: "Quiz",
	certificates: "Certificates",
	activity: "Activity",
};
const kpis = computed(() => [
	{ label: "Students", value: String(list.value.length), hint: "in current filter" },
	{ label: "With attendance", value: String(list.value.filter((s) => attendanceForStudent(s.id).length).length) },
	{ label: "With certificates", value: String(list.value.filter((s) => state.certificates.some((c) => c.studentId === s.id)).length) },
	{ label: "Organizations", value: String(orgs.value.length) },
]);

function openSession(sessionId) {
	if (!sessionId) {
		toast("No session linked to this record.");
		return;
	}
	const s = sessionById(sessionId);
	if (!s) {
		toast("That session is not in the current catalog.");
		go("sessions", "sessions");
		return;
	}
	state.selectedSessionId = s.id;
	openDoc("session_detail", "sessions");
}

function openCourse(row) {
	const id = row?.courseId || row?.course?.id || row?.courseName || row?.course?.name;
	const c = courseById(id) || state.courses.find((x) => x.name === (row?.course?.name || row?.courseName));
	if (!c) {
		toast("This program is not in the catalog yet.");
		go("courses", "courses");
		return;
	}
	state.selectedCourseId = c.id;
	openDoc("course_detail", "courses");
}

function openCert(c) {
	if (!c?.id) return;
	state.selectedCertId = c.id;
	openDoc("cert_view", "certs");
}

function sessionsFor(courseId) {
	const c = courseById(courseId);
	return state.sessions.filter((s) => s.courseId === courseId || (c && s.courseId === c.id));
}

function open(s) {
	state.selectedStudentId = s.id;
	state.studentTab = "overview";
	openDoc("student_profile", "students");
}

function save() {
	if (!form.name || !form.phone) return;
	addStudent({ ...form });
}

function lastAtt(s) {
	return state.attendance.find((a) => a.studentId === s.id)?.date || "—";
}

watch(
	() => [state.screen, state.selectedStudentId, state.catalogLoading, state.students.length],
	() => {
		if (state.screen !== "student_profile") return;
		if (state.catalogLoading) return;
		if (studentById(state.selectedStudentId)) return;
		if (state.selectedStudentId) return;
		go("students", "students");
	},
	{ immediate: true }
);

function exportStudents(kind) {
	const rows = sel.chosen().map((s) => ({
		id: s.id,
		name: s.name,
		phone: s.phone,
		email: s.email,
		org: s.org,
		courses: enrollmentsFor(s.id).length,
		lastAttendance: lastAtt(s),
		certificates: state.certificates.filter((c) => c.studentId === s.id).length,
		status: s.status || "Active",
	}));
	exportTable(rows, ["id", "name", "phone", "email", "org", "courses", "lastAttendance", "certificates", "status"], kind, "students");
	if (kind !== "print" && kind !== "pdf") toast("Export ready.");
}

function exportAttendance(kind) {
	const rows = attSel.chosen().map((a) => ({
		course: courseById(a.courseId)?.name,
		session: sessionById(a.sessionId)?.name,
		date: a.date,
		time: formatClock(a.time),
		status: a.status,
	}));
	exportTable(rows, ["course", "session", "date", "time", "status"], kind, "student-attendance");
	if (kind !== "print" && kind !== "pdf") toast("Export ready.");
}
</script>

<template>
	<div v-if="state.screen === 'students'">
		<div class="row" style="justify-content: space-between">
			<h3 style="margin: 0">Student database</h3>
		</div>
		<ListTools
			:kpis="kpis"
			:count="list.length"
			:selected="sel.selected.length"
			@export-csv="exportStudents('csv')"
			@export-xlsx="exportStudents('xlsx')"
			@export-print="exportStudents('print')"
		>
			<div class="form-grid">
				<label class="field">
					<span>Organization</span>
					<select v-model="filters.org">
						<option value="">All organizations</option>
						<option v-for="o in orgs" :key="o" :value="o">{{ o }}</option>
					</select>
				</label>
				<label class="field">
					<span>Status</span>
					<select v-model="filters.status">
						<option value="">All statuses</option>
						<option v-for="st in statuses" :key="st" :value="st">{{ st }}</option>
					</select>
				</label>
				<label class="field">
					<span>Program</span>
					<select v-model="filters.courseId">
						<option value="">All programs</option>
						<option v-for="c in state.courses" :key="c.id" :value="c.id">{{ c.name }}</option>
					</select>
				</label>
			</div>
		</ListTools>
		<div class="card" style="margin-bottom: 14px">
			<h3>Add student</h3>
			<div class="form-grid">
				<label class="field"><span>Full name</span><input v-model="form.name" /></label>
				<label class="field"><span>Mobile</span><input v-model="form.phone" /></label>
				<label class="field"><span>Email</span><input v-model="form.email" /></label>
				<label class="field"><span>CNIC</span><input v-model="form.cnic" /></label>
				<label class="field"><span>Organization</span><input v-model="form.org" /></label>
				<label class="field"><span>Designation</span><input v-model="form.designation" /></label>
			</div>
			<button class="btn primary" style="margin-top: 12px" type="button" @click="save">Save student</button>
		</div>
		<div class="card" style="padding: 0; overflow: hidden">
			<table class="data">
				<thead>
					<tr>
						<th class="check"><input type="checkbox" :checked="sel.allOn" @change="sel.toggleAll" /></th>
						<th>Student ID</th>
						<th>Name</th>
						<th>Phone</th>
						<th>Email</th>
						<th>Organization</th>
						<th>Courses</th>
						<th>Last attendance</th>
						<th>Certificates</th>
						<th>Status</th>
					</tr>
				</thead>
				<tbody>
					<tr v-for="s in list" :key="s.id" class="click" @click="open(s)">
						<td class="check" @click.stop>
							<input type="checkbox" :checked="sel.selectedSet.has(s.id)" @change="sel.toggle(s.id, $event)" />
						</td>
						<td style="font-family: var(--mono)">{{ s.id }}</td>
						<td style="font-weight: 600">{{ s.name }}</td>
						<td>{{ s.phone }}</td>
						<td>{{ s.email }}</td>
						<td>{{ s.org }}</td>
						<td>{{ enrollmentsFor(s.id).length }}</td>
						<td>{{ lastAtt(s) }}</td>
						<td>{{ state.certificates.filter((c) => c.studentId === s.id).length }}</td>
						<td><span class="pill ok">{{ s.status }}</span></td>
					</tr>
					<tr v-if="!list.length">
						<td colspan="10" style="padding: 20px; color: var(--muted)">No students match these filters.</td>
					</tr>
				</tbody>
			</table>
		</div>
	</div>

	<div v-else-if="student" class="profile-page">
		<div class="row" style="justify-content: space-between; align-items: flex-start; gap: 12px">
			<div style="min-width: 0">
				<button class="btn ghost" type="button" @click="goBack">← Back</button>
				<div class="q-meta" style="margin-top: 10px">{{ student.id }}</div>
				<h2 style="margin: 4px 0 0">{{ student.name }}</h2>
				<p style="color: var(--muted); margin: 6px 0 0">{{ [student.org, student.designation].filter(Boolean).join(" · ") || "Registered from QR check-in" }}</p>
			</div>
		</div>
		<div class="grid-kpis">
			<div class="kpi"><div class="l">Courses enrolled</div><div class="v">{{ enrolled.length }}</div></div>
			<div class="kpi"><div class="l">Completed</div><div class="v">{{ enrolled.filter((e) => e.progress >= 100).length }}</div></div>
			<div class="kpi"><div class="l">Attendance events</div><div class="v">{{ att.length }}</div></div>
			<div class="kpi"><div class="l">Quizzes passed</div><div class="v">{{ quizzes.filter((q) => q.passed).length }}</div></div>
			<div class="kpi"><div class="l">Certificates</div><div class="v">{{ certs.length }}</div></div>
		</div>
		<div class="tabs">
			<button v-for="t in Object.keys(tabLabels)" :key="t" class="tab" :class="{ on: state.studentTab === t }" type="button" @click="state.studentTab = t">
				{{ tabLabels[t] }}
			</button>
		</div>
		<div v-if="state.studentTab === 'overview'" class="card">
			<div class="form-grid">
				<label class="field"><span>Student ID</span><input :value="student.id" readonly /></label>
				<label class="field"><span>Full name</span><input :value="student.name" readonly /></label>
				<label class="field"><span>Mobile</span><input :value="student.phone || ''" readonly /></label>
				<label class="field"><span>Email</span><input :value="student.email || ''" readonly /></label>
				<label class="field"><span>CNIC</span><input :value="student.cnic || ''" readonly /></label>
				<label class="field"><span>Employee ID</span><input :value="student.employeeId || ''" readonly /></label>
				<label class="field"><span>Organization</span><input :value="student.org || ''" readonly /></label>
				<label class="field"><span>Designation</span><input :value="student.designation || ''" readonly /></label>
				<label class="field"><span>Registered</span><input :value="student.registered || ''" readonly /></label>
				<label class="field"><span>LMS status</span><input :value="student.status || 'Active'" readonly /></label>
			</div>
		</div>
		<div v-else-if="state.studentTab === 'courses'" class="card" style="padding: 0; overflow: hidden">
			<table v-if="enrolled.length" class="data">
				<thead>
					<tr><th>Course</th><th>Progress</th><th>Sessions attended</th><th></th></tr>
				</thead>
				<tbody>
					<template v-for="e in enrolled" :key="e.courseId">
						<tr class="click" @click="openCourse(e)">
							<td>
								<div style="font-weight: 600; color: var(--teal)">{{ e.course?.name || e.courseName || e.courseId }}</div>
								<div style="font-size: 12px; color: var(--faint)">{{ e.course?.code || e.courseId }}</div>
							</td>
							<td>
								<div class="progress" style="min-width: 88px"><i :style="{ width: (e.progress || 0) + '%' }" /></div>
								<div style="font-size: 12px; color: var(--muted); margin-top: 4px">{{ e.progress || 0 }}%</div>
							</td>
							<td>{{ att.filter((a) => a.courseId === e.courseId || a.courseId === e.course?.id).length }}</td>
							<td><span style="color: var(--teal); font-weight: 600">Open →</span></td>
						</tr>
						<tr v-for="s in sessionsFor(e.courseId || e.course?.id)" :key="s.id" class="click" @click="openSession(s.id)">
							<td colspan="4" style="padding-left: 28px; color: var(--muted); font-size: 13px">
								{{ s.name }} · {{ s.date }} · {{ s.start }}–{{ s.end }}
								<span style="color: var(--teal); font-weight: 600; margin-left: 8px">Open session →</span>
							</td>
						</tr>
					</template>
				</tbody>
			</table>
			<p v-else class="empty" style="padding: 20px">No course yet. Attendance from a QR scan will enrol this student.</p>
		</div>
		<div v-else-if="state.studentTab === 'attendance'">
			<ListTools
				:count="att.length"
				:selected="attSel.selected.length"
				@export-csv="exportAttendance('csv')"
				@export-xlsx="exportAttendance('xlsx')"
				@export-print="exportAttendance('print')"
			/>
			<div class="card" style="padding: 0; overflow: hidden">
			<table v-if="att.length" class="data">
				<thead>
					<tr>
						<th class="check"><input type="checkbox" :checked="attSel.allOn" @change="attSel.toggleAll" /></th>
						<th>Course</th>
						<th>Session</th>
						<th>Date</th>
						<th>Time</th>
						<th>Status</th>
					</tr>
				</thead>
				<tbody>
					<tr v-for="a in att" :key="a.id" class="click" @click="openSession(a.sessionId)">
						<td class="check" @click.stop>
							<input type="checkbox" :checked="attSel.selectedSet.has(a.id)" @change="attSel.toggle(a.id, $event)" />
						</td>
						<td>{{ courseById(a.courseId)?.name || "—" }}</td>
						<td style="font-weight: 600">{{ sessionById(a.sessionId)?.name || a.sessionId }}</td>
						<td>{{ a.date }}</td>
						<td>{{ formatClock(a.time) }}</td>
						<td><span class="pill ok">{{ a.status }}</span></td>
					</tr>
				</tbody>
			</table>
			<p v-else class="empty" style="padding: 20px">No attendance recorded for this student.</p>
			</div>
		</div>
		<div v-else-if="state.studentTab === 'quiz'" class="card">
			<div v-for="a in quizzes" :key="a.id" class="feed-row">
				<span>{{ courseById(a.courseId)?.name || a.courseName }} · {{ a.score }}%</span>
				<span class="pill" :class="a.passed ? 'ok' : 'warn'">{{ a.passed ? "Pass" : "Fail" }}</span>
			</div>
			<p v-if="!quizzes.length" class="empty">No attempts yet.</p>
		</div>
		<div v-else-if="state.studentTab === 'certificates'" class="card">
			<div v-for="c in certs" :key="c.id" class="feed-row click" @click="openCert(c)">
				<span>{{ c.id }} · {{ courseById(c.courseId)?.name || c.courseId }}</span>
				<span class="pill ok">{{ c.status }}</span>
			</div>
			<p v-if="!certs.length" class="empty">No certificates issued yet.</p>
		</div>
		<div v-else class="card">
			<div v-for="l in state.audit.filter((x) => String(x.target).includes(student.name) || String(x.target).includes(student.id))" :key="l.id" class="feed-row">
				<span>{{ l.action }}</span>
				<span>{{ l.at }}</span>
			</div>
			<p v-if="!state.audit.filter((x) => String(x.target).includes(student.name) || String(x.target).includes(student.id)).length" class="empty">No activity yet.</p>
		</div>
	</div>

	<div v-else class="card">
		<p v-if="state.catalogLoading">Loading student…</p>
		<template v-else>
			<h3 style="margin: 0 0 8px">Student not found</h3>
			<p style="color: var(--muted)">Open a student from the list to see their profile, attendance, and certificates.</p>
			<button class="btn primary" style="margin-top: 12px" type="button" @click="go('students', 'students')">Back to students</button>
		</template>
	</div>
</template>
