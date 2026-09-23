<script setup>
import { computed } from "vue";
import { state, go, enrollmentsFor, currentStudent, attemptsFor, quizForCourse } from "../store";

const me = computed(() => currentStudent());
const enrolled = computed(() => enrollmentsFor(me.value?.id));
const completed = computed(() => enrolled.value.filter((e) => e.progress >= 100).length);
const certs = computed(() => state.certificates.filter((c) => c.studentId === me.value?.id && c.status !== "Revoked"));
const pendingQuiz = computed(
	() =>
		enrolled.value.filter((e) => {
			const q = quizForCourse(e.courseId);
			if (!q) return false;
			const tries = attemptsFor(me.value.id, e.courseId);
			return !tries.some((t) => t.passed);
		}).length
);
const attPct = computed(() => {
	const mine = state.attendance.filter((a) => a.studentId === me.value?.id);
	if (!mine.length) return 0;
	const present = mine.filter((a) => a.status === "Present" || a.status === "Late").length;
	return Math.round((present / Math.max(mine.length, 4)) * 100);
});

function openCourse(e) {
	state.selectedCourseId = e.courseId;
	go("lms_course", "courses");
}

function quizStatus(e) {
	const tries = attemptsFor(me.value.id, e.courseId);
	if (tries.some((t) => t.passed)) return "Passed";
	if (tries.length) return "Attempted";
	return quizForCourse(e.courseId) ? "Pending" : "—";
}

function certStatus(e) {
	const c = certs.value.find((x) => x.courseId === e.courseId);
	return c ? "Issued" : "Locked";
}
</script>

<template>
	<div>
		<h2 style="margin: 0 0 6px; font-size: 26px">Welcome, {{ me?.name }}</h2>
		<p style="margin: 0 0 18px; color: var(--muted)">Your learning, attendance, and certificates in one place.</p>
	</div>
	<div class="grid-kpis">
		<div class="kpi"><div class="l">Enrolled courses</div><div class="v">{{ enrolled.length }}</div></div>
		<div class="kpi"><div class="l">Completed courses</div><div class="v">{{ completed }}</div></div>
		<div class="kpi"><div class="l">Pending quizzes</div><div class="v">{{ pendingQuiz }}</div></div>
		<div class="kpi"><div class="l">Certificates</div><div class="v">{{ certs.length }}</div></div>
		<div class="kpi"><div class="l">Attendance</div><div class="v">{{ attPct }}%</div></div>
	</div>
	<h3 style="margin: 0">My courses</h3>
	<div class="course-grid">
		<article
			v-for="e in enrolled"
			:key="e.courseId"
			class="card"
			style="padding: 0; overflow: hidden; cursor: pointer"
			@click="openCourse(e)"
		>
			<div class="cover" :class="e.course?.image || 'teal'" style="height: 92px; margin: 0; border-radius: 16px 16px 0 0" />
			<div style="padding: 16px; display: flex; flex-direction: column; gap: 10px">
				<div style="font-weight: 700">{{ e.course?.name }}</div>
				<div style="font-size: 12px; color: var(--muted)">{{ e.course?.trainer }}</div>
				<div>
					<div class="row" style="justify-content: space-between; font-size: 12px; margin-bottom: 6px">
						<span>Course progress</span><span>{{ e.progress }}%</span>
					</div>
					<div class="progress"><i :style="{ width: e.progress + '%' }" /></div>
				</div>
				<div class="row">
					<span class="pill ok">Attendance: Present</span>
					<span class="pill" :class="quizStatus(e) === 'Passed' ? 'ok' : 'warn'">Quiz: {{ quizStatus(e) }}</span>
					<span class="pill" :class="certStatus(e) === 'Issued' ? 'ok' : 'mute'">Certificate: {{ certStatus(e) }}</span>
				</div>
				<button class="btn primary" type="button">Continue course</button>
			</div>
		</article>
	</div>
</template>
