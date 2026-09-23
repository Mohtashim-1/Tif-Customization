<script setup>
import { computed, onMounted, onUnmounted, watch } from "vue";
import {
	state,
	go,
	courseById,
	currentStudent,
	attemptsFor,
	quizForCourse,
	quizzesForCourse,
	submitQuiz,
	sessionById,
	loadQuizzes,
} from "../store";

const me = computed(() => currentStudent());
const course = computed(() => courseById(state.selectedCourseId));
const enrollment = computed(() =>
	state.enrollments.find((e) => e.studentId === me.value?.id && e.courseId === state.selectedCourseId)
);
const modules = computed(() => state.modules.filter((m) => m.courseId === state.selectedCourseId));
const myAtt = computed(() =>
	state.attendance.filter((a) => a.studentId === me.value?.id && a.courseId === state.selectedCourseId)
);
const quiz = computed(() => {
	const q = quizForCourse(state.selectedCourseId);
	if (!q) return null;
	if (state.roleId === "student" && q.published === 0) return null;
	return q;
});
const draftQuiz = computed(() => quizzesForCourse(state.selectedCourseId)[0] || null);
const tries = computed(() => attemptsFor(me.value?.id, state.selectedCourseId));
const cert = computed(() =>
	state.certificates.find((c) => c.studentId === me.value?.id && c.courseId === state.selectedCourseId && c.status !== "Revoked")
);
const question = computed(() => quiz.value?.questions[state.quizIndex]);
const progress = computed(() =>
	quiz.value ? Math.round(((state.quizIndex + 1) / quiz.value.questions.length) * 100) : 0
);
const canRetake = computed(() => quiz.value && tries.value.length < quiz.value.maxAttempts);

const steps = computed(() => {
	const attended = myAtt.value.some((a) => a.status === "Present" || a.status === "Late");
	const learned = (enrollment.value?.lessonsDone || 0) > 0 || (enrollment.value?.progress || 0) >= 20;
	const attempted = tries.value.length > 0;
	const passed = tries.value.some((t) => t.passed);
	return [
		{ label: "Enrollment", on: true },
		{ label: "Attendance", on: attended },
		{ label: "Learning material", on: learned },
		{ label: "Quiz", on: attempted },
		{ label: "Passed", on: passed },
		{ label: "Certificate issued", on: !!cert.value },
	];
});

let poll;
onMounted(() => {
	loadQuizzes();
	poll = setInterval(() => {
		if (["lms_course", "quiz_start"].includes(state.screen)) loadQuizzes();
	}, 12000);
});
onUnmounted(() => {
	if (poll) clearInterval(poll);
});
watch(
	() => state.selectedCourseId,
	() => loadQuizzes()
);

function openLesson(lesson) {
	state.lessonTitle = typeof lesson === "string" ? lesson : lesson.title;
	state.lessonBody = typeof lesson === "string" ? "" : lesson.content || lesson.summary || "";
	const e = enrollment.value;
	if (e && e.progress < 95) e.progress = Math.min(100, e.progress + 10);
	if (e) e.lessonsDone = (e.lessonsDone || 0) + 1;
	go("lms_lesson");
}

function openQuiz() {
	if (!quiz.value) return;
	state.quiz = quiz.value;
	go("quiz_start");
}

function startQuiz() {
	if (!quiz.value) return;
	if (tries.value.length >= quiz.value.maxAttempts && !tries.value.some((t) => t.passed)) return;
	state.quiz = quiz.value;
	state.quizIndex = 0;
	state.quizAnswers = {};
	state.quizStarted = true;
	go("quiz_attempt");
}

function pick(val) {
	const q = question.value;
	if (!q) return;
	if (q.type === "multi") {
		const cur = new Set(state.quizAnswers[q.id] || []);
		if (cur.has(val)) cur.delete(val);
		else cur.add(val);
		state.quizAnswers[q.id] = [...cur];
	} else {
		state.quizAnswers[q.id] = val;
	}
}

function isOn(i) {
	const q = question.value;
	if (!q) return false;
	const given = state.quizAnswers[q.id];
	if (q.type === "multi") return (given || []).includes(i);
	if (q.type === "short") return false;
	return Number(given) === i;
}

async function submit() {
	await submitQuiz(me.value.id);
}
</script>

<template>
	<div v-if="state.screen === 'lms_course' && course">
		<div class="cover" :class="course.image" style="height: 140px" />
		<div class="row" style="justify-content: space-between">
			<div>
				<div class="q-meta">{{ course.code }}</div>
				<h2 style="margin: 6px 0 0">{{ course.name }}</h2>
				<p>{{ course.description }}</p>
				<p style="color: var(--muted)">Instructor: {{ course.trainer }}</p>
			</div>
			<button class="btn" type="button" @click="go(state.roleId === 'student' ? 'student_dash' : 'course_detail', 'courses')">
				Back
			</button>
		</div>
		<div class="two">
			<div class="card">
				<h3>Progress timeline</h3>
				<div class="timeline">
					<template v-for="(st, i) in steps" :key="st.label">
						<div class="tl">
							<div class="n" :style="{ background: st.on ? '#0e7c7b' : '#c5d4d4', boxShadow: st.on ? '0 0 0 4px #d7efed' : 'none' }" />
							<div>
								<strong>{{ st.label }}</strong>
								<div style="font-size: 12px; color: var(--muted)">{{ st.on ? "Complete" : "Waiting" }}</div>
							</div>
						</div>
						<div v-if="i < steps.length - 1" class="tl">
							<div class="line" />
							<div />
						</div>
					</template>
				</div>
			</div>
			<div class="card">
				<h3>Training material</h3>
				<div v-for="m in modules" :key="m.id" style="margin-bottom: 14px">
					<strong>{{ m.title }}</strong>
					<button
						v-for="lesson in m.lessons"
						:key="lesson.id || lesson.title || lesson"
						class="btn"
						style="display: block; width: 100%; text-align: left; margin-top: 6px"
						type="button"
						@click="openLesson(lesson)"
					>
						{{ lesson.title || lesson }}
					</button>
				</div>
				<div>
					<h3>Attendance history</h3>
					<div v-for="a in myAtt" :key="a.id" class="feed-row">
						<span>{{ sessionById(a.sessionId)?.name }}</span>
						<span class="pill ok">{{ a.status }} · {{ a.time }}</span>
					</div>
				</div>
			</div>
		</div>
		<div class="card">
			<div class="row" style="justify-content: space-between">
				<div>
					<h3 style="margin: 0">{{ quiz?.name || "Final assessment" }}</h3>
					<p style="margin: 6px 0 0; color: var(--muted)">
						<template v-if="quiz">{{ quiz.questions?.length || 0 }} questions · {{ quiz.duration }} min · pass {{ quiz.passing }}%</template>
						<template v-else-if="draftQuiz">Waiting for the trainer to activate this quiz.</template>
						<template v-else>No quiz configured yet. After the trainer activates it, it appears here.</template>
					</p>
				</div>
				<div class="row">
					<button v-if="quiz" class="btn primary" type="button" @click="openQuiz">Open quiz</button>
					<button v-if="cert" class="btn ghost" type="button" @click="state.selectedCertId = cert.id; go('cert_view')">
						View certificate
					</button>
					<span v-else class="pill mute">🔒 Certificate locked</span>
				</div>
			</div>
		</div>
	</div>

	<div v-else-if="state.screen === 'lms_lesson'" class="card" style="max-width: 760px">
		<div class="q-meta">Lesson</div>
		<h2>{{ state.lessonTitle }}</h2>
		<p v-if="state.lessonBody" v-html="state.lessonBody"></p>
		<p v-else>
			This lesson covers the key talking points for <strong>{{ course?.name }}</strong>. Watch the briefing, download
			the one-pager, and mark the checkpoint before returning to the module list.
		</p>
		<div class="cover teal" style="height: 180px" />
		<div class="row">
			<button class="btn">Watch video</button>
			<button class="btn">Download PDF</button>
			<button class="btn ghost">Open presentation</button>
		</div>
		<button class="btn primary" type="button" @click="go('lms_course')">Back to course</button>
	</div>

	<div v-else-if="state.screen === 'quiz_start'" class="card" style="max-width: 560px; margin: 0 auto; text-align: center">
		<div class="q-meta">Assessment</div>
		<h2>Final Assessment</h2>
		<p>Questions: {{ quiz?.questions.length }}</p>
		<p>Time: {{ quiz?.duration }} Minutes</p>
		<p>Passing score: {{ quiz?.passing }}%</p>
		<p>Attempts used: {{ tries.length }} / {{ quiz?.maxAttempts }}</p>
		<button class="btn primary" style="padding: 14px 28px" type="button" :disabled="!canRetake" @click="startQuiz">
			{{ tries.length ? "Retake quiz" : "Start quiz" }}
		</button>
		<p v-if="!canRetake && tries.length" class="pill warn">Attempt limit reached</p>
	</div>

	<div v-else-if="state.screen === 'quiz_attempt' && question" class="card" style="max-width: 680px; margin: 0 auto">
		<div class="row" style="justify-content: space-between">
			<div class="q-meta">Question {{ state.quizIndex + 1 }} of {{ quiz.questions.length }}</div>
			<span>{{ progress }}%</span>
		</div>
		<div class="progress" style="margin: 10px 0 18px"><i :style="{ width: progress + '%' }" /></div>
		<h2 style="font-size: 22px">{{ question.text }}</h2>
		<template v-if="question.type !== 'short'">
			<button
				v-for="(opt, i) in question.options"
				:key="opt"
				class="q-opt"
				:class="{ on: isOn(i) }"
				type="button"
				@click="pick(i)"
			>
				{{ opt }}
			</button>
		</template>
		<label v-else class="field">
			<span>Your answer</span>
			<input :value="state.quizAnswers[question.id]" @input="pick($event.target.value)" />
		</label>
		<div class="row" style="margin-top: 16px">
			<button class="btn" type="button" :disabled="state.quizIndex === 0" @click="state.quizIndex--">Previous</button>
			<button
				v-if="state.quizIndex < quiz.questions.length - 1"
				class="btn primary"
				type="button"
				@click="state.quizIndex++"
			>
				Next
			</button>
			<button v-else class="btn primary" type="button" @click="submit">Submit quiz</button>
		</div>
	</div>

	<div v-else-if="state.screen === 'quiz_result'" class="card" style="max-width: 560px; margin: 0 auto; text-align: center">
		<h2>{{ state.lastResult?.passed ? "Congratulations!" : "Not passed" }}</h2>
		<p style="font-size: 42px; font-weight: 800; margin: 8px 0">{{ state.lastResult?.score }}%</p>
		<p>Passing score: {{ state.lastResult?.passing }}%</p>
		<p class="pill" :class="state.lastResult?.passed ? 'ok' : 'warn'" style="font-size: 14px">
			{{ state.lastResult?.passed ? "✅ PASS" : "❌ NOT PASSED" }}
		</p>
		<div class="row" style="justify-content: center; margin-top: 16px">
			<button v-if="state.lastResult?.passed" class="btn primary" type="button" @click="go('cert_issued')">
				View certificate
			</button>
			<button v-if="canRetake" class="btn" type="button" @click="go('quiz_start')">Retake quiz</button>
			<button class="btn ghost" type="button" @click="go('lms_course')">Back to course</button>
		</div>
	</div>
</template>
