<script setup>
import { computed, reactive, onMounted, watch } from "vue";
import {
	state,
	go,
	sessionFromToken,
	courseById,
	qrStatus,
	studentByPhone,
	markAttendance,
	registerStudent,
	studentById,
	resolveCheckin,
	persistStudent,
	loadQuizzes,
	quizForCourse,
	persistUi,
} from "../store";
import BrandLogo from "../components/BrandLogo.vue";

const session = computed(() => sessionFromToken(state.checkinToken));
const course = computed(() => courseById(session.value?.courseId));
const status = computed(() => qrStatus(session.value, state.checkinToken));

onMounted(() => {
	if (state.checkinToken) resolveCheckin(state.checkinToken);
});
watch(
	() => state.checkinToken,
	(tok) => {
		if (tok && state.checkinResolving) resolveCheckin(tok);
	}
);
const student = computed(() => studentById(state.checkinStudentId));
const form = reactive({
	name: "",
	phone: "",
	email: "",
	cnic: "",
	org: "",
	designation: "",
	employeeId: "",
	gender: "",
	dob: "",
});

function continueLanding() {
	if (status.value !== "ok") return;
	go("qr_phone");
}

function lookup() {
	state.checkinError = "";
	const s = session.value;
	if (!s || status.value !== "ok") {
		state.checkinError = "closed";
		return;
	}
	const found = studentByPhone(state.checkinPhone);
	if (found) {
		const r = markAttendance(found.id, s);
		state.checkinStudentId = found.id;
		state.roleId = "student";
		state.displayName = found.name;
		state.userEmail = found.phone || found.email || "";
		state.checkinError = r.ok ? "" : "duplicate";
		persistStudent(found, { courseId: s.courseId, courseName: courseById(s.courseId)?.name || "" }).catch(() => {});
		go("att_success");
		return;
	}
	form.phone = state.checkinPhone;
	go("qr_register");
}

async function submitReg() {
	const s = session.value;
	if (!s || status.value !== "ok") {
		state.checkinError = "closed";
		return;
	}
	form.phone = form.phone || state.checkinPhone;
	const r = await registerStudent(form, s);
	state.checkinStudentId = r.student.id;
	state.roleId = "student";
	state.displayName = r.student.name;
	state.userEmail = r.student.phone || r.student.email || "";
	state.checkinError = r.attendance.ok ? "" : "duplicate";
	go("att_success");
}

async function toLms() {
	state.roleId = "student";
	if (session.value) state.selectedCourseId = session.value.courseId;
	persistUi();
	await loadQuizzes();
	const qz = quizForCourse(state.selectedCourseId);
	if (qz) state.quiz = qz;
	go("lms_course", "courses");
}
</script>

<template>
	<div class="mobile-public">
		<template v-if="state.screen === 'qr_landing'">
			<div style="display: flex; flex-direction: column; align-items: center; gap: 10px; margin-bottom: 18px">
				<BrandLogo :size="72" />
				<div style="font-weight: 700">{{ state.orgName }}</div>
			</div>
			<div class="q-meta">Session check-in</div>
			<template v-if="status === 'loading' || state.checkinResolving">
				<h2>Opening session…</h2>
				<p style="color: var(--muted)">Please wait while we verify this QR code.</p>
			</template>
			<template v-else-if="status === 'ok'">
				<h2 style="margin: 8px 0 4px">{{ course?.name }}</h2>
				<p style="margin: 0; color: var(--muted)">{{ session?.name }}</p>
				<div class="card" style="margin-top: 18px">
					<div><strong>Trainer</strong><div>{{ session?.trainer }}</div></div>
					<div style="margin-top: 10px"><strong>Date</strong><div>{{ session?.date }}</div></div>
					<div style="margin-top: 10px"><strong>Time</strong><div>{{ session?.start }} – {{ session?.end }}</div></div>
					<div style="margin-top: 10px"><strong>Location</strong><div>{{ session?.location }}</div></div>
				</div>
				<button class="btn primary" style="margin-top: 18px; width: 100%; padding: 14px" type="button" @click="continueLanding">
					Continue
				</button>
			</template>
			<template v-else>
				<h2 v-if="status === 'invalid'">This attendance link is not valid.</h2>
				<h2 v-else>Attendance for this session has been closed.</h2>
				<p>Please contact your instructor.</p>
				<p v-if="status === 'expired'" style="color: var(--muted); font-size: 13px">The QR code has expired. Ask your trainer to display a new one.</p>
				<button class="btn" type="button" @click="go('login')">Back</button>
			</template>
		</template>

		<template v-else-if="state.screen === 'qr_phone'">
			<div class="q-meta">Identify yourself</div>
			<h2>Enter your mobile number</h2>
			<p style="color: var(--muted)">We’ll match you to an existing student record when possible.</p>
			<label class="field" style="margin: 18px 0">
				<span>Mobile number</span>
				<input v-model="state.checkinPhone" inputmode="tel" placeholder="03XX XXXXXXX" />
			</label>
			<button class="btn primary" style="width: 100%; padding: 14px" type="button" @click="lookup">Continue</button>
		</template>

		<template v-else-if="state.screen === 'qr_register'">
			<div class="q-meta">New learner</div>
			<h2>Quick registration</h2>
			<p style="color: var(--muted)">We’ll create your student ID, LMS login (mobile + last 4 digits), and mark today’s attendance.</p>
			<div class="field" style="margin-top: 14px"><span>Full name</span><input v-model="form.name" /></div>
			<div class="field"><span>Mobile number</span><input v-model="form.phone" /></div>
			<div class="field"><span>Email address</span><input v-model="form.email" type="email" /></div>
			<div class="field"><span>CNIC / National ID / Passport</span><input v-model="form.cnic" /></div>
			<div class="field"><span>Date of birth</span><input v-model="form.dob" type="date" /></div>
			<div class="field">
				<span>Gender</span>
				<select v-model="form.gender">
					<option value="">Prefer not to say</option>
					<option>Male</option>
					<option>Female</option>
				</select>
			</div>
			<div class="field"><span>Company / organization</span><input v-model="form.org" /></div>
			<div class="field"><span>Designation</span><input v-model="form.designation" /></div>
			<div class="field"><span>Employee ID</span><input v-model="form.employeeId" /></div>
			<button class="btn primary" style="width: 100%; margin-top: 16px; padding: 14px" type="button" @click="submitReg">
				Create account & mark attendance
			</button>
		</template>

		<template v-else>
			<div style="font-size: 42px; margin: 12px 0">✅</div>
			<h2>{{ state.checkinError === "duplicate" ? "Already marked present" : "Attendance Marked Successfully" }}</h2>
			<p v-if="state.screen === 'att_success' && student?.registered === '2026-09-22' && !state.checkinError">
				Registration Completed
			</p>
			<div class="card" style="margin-top: 12px; text-align: left">
				<div>Welcome, <strong>{{ student?.name }}</strong></div>
				<div style="margin-top: 8px">Student ID: <strong>{{ student?.id }}</strong></div>
				<div style="margin-top: 8px">Course: <strong>{{ course?.name }}</strong></div>
				<div style="margin-top: 8px">Attendance: <strong>Present</strong></div>
				<div style="margin-top: 12px; padding-top: 10px; border-top: 1px solid #eef2f2; font-size: 13px; color: var(--muted)">
					Portal login: your mobile number.<br />
					Password: last 4 digits of that number.
				</div>
			</div>
			<button class="btn primary" style="width: 100%; margin-top: 18px; padding: 14px" type="button" @click="toLms">
				Continue to Course
			</button>
		</template>
	</div>
</template>
