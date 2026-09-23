<script setup>
import { computed, onMounted, onUnmounted } from "vue";
import { state, publicScreens, bootFromPath, loadCatalog, bootSession } from "./store";
import Shell from "./components/Shell.vue";
import LoginScreen from "./screens/LoginScreen.vue";
import AdminDash from "./screens/AdminDash.vue";
import TrainerDash from "./screens/TrainerDash.vue";
import StudentDash from "./screens/StudentDash.vue";
import CoursePages from "./screens/CoursePages.vue";
import SessionPages from "./screens/SessionPages.vue";
import QrFlow from "./screens/QrFlow.vue";
import LmsPages from "./screens/LmsPages.vue";
import CertPages from "./screens/CertPages.vue";
import PeoplePages from "./screens/PeoplePages.vue";
import ReportPages from "./screens/ReportPages.vue";
import AccountPages from "./screens/AccountPages.vue";
import QuizPages from "./screens/QuizPages.vue";

const qrPublic = ["qr_landing", "qr_phone", "qr_register", "att_success"];
const courseScreens = ["courses", "course_create", "course_detail", "trainers", "quiz_edit"];
const sessionScreens = ["sessions", "session_create", "session_detail", "qr_screen"];
const lmsScreens = ["lms_course", "lms_lesson", "quiz_start", "quiz_attempt", "quiz_result"];
const certScreens = ["cert_issued", "cert_view", "cert_verify", "my_certs", "cert_templates"];
const peopleScreens = ["students", "student_profile"];
const reportScreens = ["report_attendance", "report_quiz", "report_cert"];
const accountScreens = ["notifications", "profile", "settings", "audit_logs"];

const isPublic = computed(() => publicScreens.includes(state.screen));

onMounted(async () => {
	window.addEventListener("popstate", bootFromPath);
	await bootSession();
	loadCatalog();
});
onUnmounted(() => window.removeEventListener("popstate", bootFromPath));
</script>

<template>
	<div class="lms-app">
		<LoginScreen v-if="state.screen === 'login'" />
		<QrFlow v-else-if="qrPublic.includes(state.screen)" />
		<CertPages v-else-if="state.screen === 'cert_verify'" />
		<Shell v-else>
			<AdminDash v-if="state.screen === 'admin_dash'" />
			<TrainerDash v-else-if="state.screen === 'trainer_dash'" />
			<StudentDash v-else-if="state.screen === 'student_dash'" />
			<CoursePages v-else-if="courseScreens.includes(state.screen) && state.screen !== 'quiz_edit'" />
			<QuizPages v-else-if="state.screen === 'quiz_edit'" />
			<SessionPages v-else-if="sessionScreens.includes(state.screen)" />
			<LmsPages v-else-if="lmsScreens.includes(state.screen)" />
			<CertPages v-else-if="certScreens.includes(state.screen)" />
			<PeoplePages v-else-if="peopleScreens.includes(state.screen)" />
			<ReportPages v-else-if="reportScreens.includes(state.screen)" />
			<AccountPages v-else-if="accountScreens.includes(state.screen)" />
			<div v-else class="card">This screen is not available for the current role.</div>
		</Shell>
		<div v-if="state.toast" class="toast">{{ state.toast }}</div>
		<div v-if="state.catalogLoading" class="toast" style="left: 24px; right: auto">Loading Upcoming Training…</div>
	</div>
</template>
