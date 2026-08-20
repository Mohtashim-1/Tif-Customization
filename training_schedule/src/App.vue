<script setup>
import { computed, onMounted, ref } from "vue";
import { apiGet, METHOD } from "./lib/api";
import AppSidebar from "./components/AppSidebar.vue";
import AppHeader from "./components/AppHeader.vue";
import FilterBar from "./components/FilterBar.vue";
import SummaryCards from "./components/SummaryCards.vue";
import ScheduleGrid from "./components/ScheduleGrid.vue";
import ScheduleLegend from "./components/ScheduleLegend.vue";
import DirectoryView from "./components/DirectoryView.vue";
import SessionForm from "./components/SessionForm.vue";

const activeNav = ref("dashboard");
const search = ref("");
const trainerFilter = ref("all");
const programFilter = ref("all");
const statusFilter = ref("all");
const weekOffset = ref(0);
const weekStartIso = ref(null);
const toast = ref("");
const loading = ref(true);
const error = ref("");
const user = ref({
	name: "Loading…",
	role: "",
	initials: "…",
	notifications: 0,
});
const sessions = ref([]);
const trainers = ref([]);
const programs = ref([]);
const summary = ref({
	total_sessions: 0,
	completed: 0,
	in_progress: 0,
	upcoming: 0,
	rooms_used: 0,
	rooms_total: 8,
	total_trainers: 0,
});
const links = ref({
	list: "/app/upcoming-training",
	report: "/app/upcoming-training-report",
});
const todayIso = ref("");
const directory = ref({ view: "", rows: [], summary: null, by_type: [], by_mode: [], links: {} });
const directoryLoading = ref(false);
const dashboard = ref({});
const dashboardLoading = ref(false);
const formOpen = ref(false);
const editingName = ref("");
const formDefaults = ref({});

const pageMeta = computed(() => {
	const map = {
		dashboard: ["Training Schedule", "Weekly planner from Upcoming Training"],
		schedule: ["Weekly Schedule", "Click a session to edit, or an empty slot to create"],
		trainers: ["Trainers", "People delivering Upcoming Training"],
		programs: ["Programs", "Topics and programs from Upcoming Training"],
		sessions: ["Sessions", "Create and edit Upcoming Training here"],
		rooms: ["Rooms & Venues", "Where sessions are delivered"],
		reports: ["Reports", "Counts from Upcoming Training"],
		notifications: ["Notifications", "Upcoming and in-progress sessions"],
		settings: ["Settings", "This portal writes to Upcoming Training"],
	};
	return map[activeNav.value] || map.dashboard;
});

const searchPlaceholder = computed(() => {
	const map = {
		dashboard: "Search trainers, programs…",
		schedule: "Search title, trainer, school…",
		trainers: "Search trainers…",
		programs: "Search programs…",
		sessions: "Search sessions…",
		rooms: "Search venues…",
		reports: "Filter reports…",
		notifications: "Search upcoming…",
		settings: "Search…",
	};
	return map[activeNav.value] || "Search…";
});

function mondayOf(d) {
	const x = new Date(d);
	const day = (x.getDay() + 6) % 7;
	x.setDate(x.getDate() - day);
	x.setHours(0, 0, 0, 0);
	return x;
}

function iso(d) {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

const weekStart = computed(() => {
	if (weekStartIso.value) {
		const base = new Date(`${weekStartIso.value}T00:00:00`);
		base.setDate(base.getDate() + weekOffset.value * 7);
		return base;
	}
	return mondayOf(new Date());
});

const weekDays = computed(() =>
	Array.from({ length: 7 }, (_, i) => {
		const d = new Date(weekStart.value);
		d.setDate(d.getDate() + i);
		return d;
	})
);

const weekLabel = computed(() => {
	const start = weekDays.value[0];
	const end = weekDays.value[6];
	const fmt = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
	return `${fmt(start).replace(/,?\s*\d{4}$/, "")} – ${fmt(end)}`;
});

const filteredSessions = computed(() => {
	const q = search.value.trim().toLowerCase();
	const weekIsos = new Set(weekDays.value.map(iso));
	return sessions.value.filter((s) => {
		if (!weekIsos.has(s.date)) return false;
		if (trainerFilter.value !== "all" && s.trainerId !== trainerFilter.value) return false;
		if (programFilter.value !== "all") {
			const prog = s.program || s.title;
			if (prog !== programFilter.value) return false;
		}
		if (statusFilter.value !== "all" && s.status !== statusFilter.value) return false;
		if (q) {
			const hay = `${s.title} ${s.trainerName} ${s.room} ${s.name} ${s.school}`.toLowerCase();
			if (!hay.includes(q)) return false;
		}
		return true;
	});
});

function showToast(msg) {
	toast.value = msg;
	setTimeout(() => {
		toast.value = "";
	}, 2400);
}

function shiftWeek(dir) {
	weekOffset.value += dir;
	loadWeek();
}

async function loadWeek() {
	loading.value = true;
	error.value = "";
	try {
		const args = {};
		if (weekStartIso.value) {
			const d = new Date(`${weekStartIso.value}T00:00:00`);
			d.setDate(d.getDate() + weekOffset.value * 7);
			args.week_start = iso(d);
		}
		const data = await apiGet(`${METHOD}.get_schedule_data`, args);
		if (!weekStartIso.value && data.week_start) {
			weekStartIso.value = data.week_start;
			weekOffset.value = 0;
		}
		sessions.value = data.sessions || [];
		trainers.value = data.trainers || [];
		programs.value = data.programs || [];
		summary.value = data.summary || summary.value;
		links.value = data.links || links.value;
		todayIso.value = data.today || iso(new Date());
		if (data.user) user.value = { ...user.value, ...data.user };
	} catch (e) {
		error.value = e.message || String(e);
	} finally {
		loading.value = false;
	}
}

function groupWeekDays(sessionList, startDate) {
	const start = mondayOf(startDate);
	return Array.from({ length: 7 }, (_, i) => {
		const d = new Date(start);
		d.setDate(d.getDate() + i);
		const date = iso(d);
		return {
			date,
			label: d.toLocaleDateString("en-US", { weekday: "short" }),
			sessions: sessionList.filter((s) => s.date === date).slice(0, 6),
		};
	});
}

function dashboardFromSessions(sessionList, extra = {}) {
	const today = extra.today || iso(new Date());
	const trainersMap = {};
	for (const s of sessionList) {
		const key = s.trainerName || "Unassigned";
		const b = trainersMap[key] || {
			name: key,
			initials: s.trainerInitials || "?",
			color: s.trainerColor || "#6366f1",
			sessions: 0,
			upcoming: 0,
		};
		b.sessions += 1;
		if (s.status === "upcoming") b.upcoming += 1;
		trainersMap[key] = b;
	}
	return {
		today,
		greeting: extra.greeting || today,
		summary: extra.summary || {
			total_sessions: sessionList.length,
			completed: sessionList.filter((s) => s.status === "completed").length,
			in_progress: sessionList.filter((s) => s.status === "in_progress").length,
			upcoming: sessionList.filter((s) => s.status === "upcoming").length,
			total_trainers: Object.keys(trainersMap).length,
			rooms_used: 0,
			rooms_total: 0,
		},
		today_sessions: sessionList.filter((s) => s.date === today),
		week_sessions: sessionList.filter((s) => {
			const days = groupWeekDays(sessionList, new Date(`${today}T00:00:00`));
			return days.some((d) => d.date === s.date);
		}),
		week_days: groupWeekDays(sessionList, new Date(`${today}T00:00:00`)),
		upcoming: sessionList
			.filter((s) => s.status === "upcoming" || s.status === "in_progress")
			.slice(0, 12),
		recent: [...sessionList]
			.sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`))
			.slice(0, 12),
		trainers: Object.values(trainersMap)
			.sort((a, b) => b.sessions - a.sessions)
			.slice(0, 8),
		user: extra.user,
	};
}

async function loadDashboard() {
	dashboardLoading.value = true;
	error.value = "";
	try {
		try {
			dashboard.value = await apiGet(`${METHOD}.get_dashboard`);
		} catch {
			const dir = await apiGet(`${METHOD}.get_directory`, { view: "sessions" });
			const week = await apiGet(`${METHOD}.get_schedule_data`);
			dashboard.value = dashboardFromSessions(dir.rows || [], {
				today: week.today,
				summary: dir.summary || week.summary,
				user: week.user,
				greeting: week.today,
			});
		}
		if (dashboard.value.user) user.value = { ...user.value, ...dashboard.value.user };
		if (dashboard.value.summary) summary.value = dashboard.value.summary;
	} catch (e) {
		error.value = e.message || String(e);
	} finally {
		dashboardLoading.value = false;
	}
}

async function loadDirectory(view) {
	directoryLoading.value = true;
	try {
		directory.value = await apiGet(`${METHOD}.get_directory`, { view });
	} catch (e) {
		showToast(e.message || String(e));
		directory.value = { view, rows: [] };
	} finally {
		directoryLoading.value = false;
	}
}

function onNavigate(id) {
	activeNav.value = id;
	search.value = "";
	if (id === "dashboard" || id === "schedule") {
		loadWeek();
		return;
	}
	if (id === "settings") {
		directory.value = { view: "settings", rows: [] };
		return;
	}
	loadDirectory(id);
}

function openCreate(defaults = {}) {
	editingName.value = "";
	formDefaults.value = defaults;
	formOpen.value = true;
}

function openEdit(name) {
	if (!name) return;
	editingName.value = name;
	formOpen.value = true;
}

function onSaved(result) {
	formOpen.value = false;
	showToast(result?.message || "Upcoming Training saved");
	if (activeNav.value === "dashboard" || activeNav.value === "schedule") loadWeek();
	else if (activeNav.value !== "settings") loadDirectory(activeNav.value);
}

function onAddSession() {
	openCreate({
		training_date: todayIso.value || iso(new Date()),
		training_time: "10:00",
	});
}

function onCreateSlot(payload) {
	openCreate(payload);
}

function onExport() {
	const start = iso(weekDays.value[0]);
	const end = iso(weekDays.value[6]);
	window.open(
		`/api/method/${METHOD}.export_sessions_csv?from_date=${start}&to_date=${end}`,
		"_blank"
	);
}

function onFilterTrainer(name) {
	trainerFilter.value = name;
	activeNav.value = "schedule";
	loadWeek();
}

function onFilterProgram(name) {
	programFilter.value = name;
	activeNav.value = "schedule";
	loadWeek();
}

function onFilterRoom() {
	activeNav.value = "sessions";
	loadDirectory("sessions");
}

onMounted(() => {
	loadWeek();
});
</script>

<template>
	<div class="ts-app">
		<AppSidebar
			:active="activeNav"
			:total-trainers="summary.total_trainers"
			:calendar-date="weekDays[1] || new Date()"
			@navigate="onNavigate"
		/>
		<main class="ts-main">
			<nav class="ts-mobile-nav">
				<button
					v-for="id in ['dashboard', 'schedule', 'sessions', 'trainers']"
					:key="id"
					type="button"
					:class="{ active: activeNav === id }"
					@click="onNavigate(id)"
				>
					{{ id }}
				</button>
			</nav>

			<AppHeader
				v-model:search="search"
				:user="user"
				:title="pageMeta[0]"
				:subtitle="pageMeta[1]"
				:placeholder="searchPlaceholder"
				@notify="onNavigate('notifications')"
			/>

			<div v-if="error" class="ts-error">
				<strong>Could not load Upcoming Training</strong>
				<p>{{ error }}</p>
				<button type="button" @click="loadWeek">Retry</button>
			</div>

			<template v-else-if="activeNav === 'dashboard' || activeNav === 'schedule'">
				<FilterBar
					:week-label="weekLabel"
					:trainers="trainers"
					:programs="programs"
					v-model:trainer="trainerFilter"
					v-model:program="programFilter"
					v-model:status="statusFilter"
					@prev="shiftWeek(-1)"
					@next="shiftWeek(1)"
					@add="onAddSession"
					@export="onExport"
				/>
				<SummaryCards v-if="activeNav === 'dashboard'" :summary="summary" />
				<div v-if="loading" class="ts-loading">Loading weekly planner…</div>
				<template v-else>
					<ScheduleGrid
						:days="weekDays"
						:sessions="filteredSessions"
						:today-iso="todayIso"
						@open="openEdit"
						@create="onCreateSlot"
					/>
					<ScheduleLegend />
					<p class="ts-hint">
						Week {{ weekLabel }} · {{ filteredSessions.length }} session(s) · click a card to edit, empty slot to add
					</p>
				</template>
			</template>

			<DirectoryView
				v-else
				:loading="directoryLoading"
				:payload="directory"
				:search="search"
				@refresh="loadDirectory(activeNav)"
				@add="onAddSession"
				@edit="openEdit"
				@filter-trainer="onFilterTrainer"
				@filter-program="onFilterProgram"
				@filter-room="onFilterRoom"
			/>

			<SessionForm
				:open="formOpen"
				:session-name="editingName"
				:defaults="formDefaults"
				@close="formOpen = false"
				@saved="onSaved"
			/>

			<div v-if="toast" class="ts-toast">{{ toast }}</div>
		</main>
	</div>
</template>

<style scoped>
.ts-main {
	padding: 22px 28px 32px;
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 18px;
}

.ts-mobile-nav {
	display: none;
}

.ts-loading,
.ts-error {
	background: #fff;
	border: 1px solid var(--line);
	border-radius: 14px;
	padding: 24px;
	box-shadow: var(--shadow);
}

.ts-error {
	border-color: #fecaca;
	background: #fef2f2;
}

.ts-error button {
	margin-top: 8px;
	border: 0;
	background: #6366f1;
	color: #fff;
	padding: 8px 12px;
	border-radius: 8px;
}

.ts-hint {
	margin: 0;
	font-size: 13px;
	color: var(--muted);
}

.ts-toast {
	position: fixed;
	right: 24px;
	bottom: 24px;
	background: #0f172a;
	color: #fff;
	padding: 12px 16px;
	border-radius: 12px;
	box-shadow: var(--shadow);
	z-index: 50;
}

@media (max-width: 980px) {
	.ts-main {
		padding: 16px;
	}
	.ts-mobile-nav {
		display: flex;
		gap: 8px;
		overflow: auto;
	}
	.ts-mobile-nav button {
		border: 1px solid var(--line);
		background: #fff;
		border-radius: 999px;
		padding: 8px 12px;
		text-transform: capitalize;
		font-weight: 600;
		font-size: 12px;
	}
	.ts-mobile-nav button.active {
		background: #4f46e5;
		color: #fff;
		border-color: #4f46e5;
	}
}
</style>
