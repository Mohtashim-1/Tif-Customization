<script setup>
import { computed, reactive, ref } from "vue";
import AppSidebar from "./components/AppSidebar.vue";
import AppHeader from "./components/AppHeader.vue";
import FilterBar from "./components/FilterBar.vue";
import SummaryCards from "./components/SummaryCards.vue";
import ScheduleGrid from "./components/ScheduleGrid.vue";
import ScheduleLegend from "./components/ScheduleLegend.vue";
import {
	CURRENT_USER,
	PROGRAMS,
	SESSIONS,
	SUMMARY,
	TRAINERS,
	WEEK_START,
	getTrainer,
} from "./data/mock";

const activeNav = ref("dashboard");
const search = ref("");
const trainerFilter = ref("all");
const programFilter = ref("all");
const statusFilter = ref("all");
const weekOffset = ref(0);
const toast = ref("");

const weekStart = computed(() => {
	const d = new Date(`${WEEK_START}T00:00:00`);
	d.setDate(d.getDate() + weekOffset.value * 7);
	return d;
});

const weekDays = computed(() => {
	return Array.from({ length: 7 }, (_, i) => {
		const d = new Date(weekStart.value);
		d.setDate(d.getDate() + i);
		return d;
	});
});

const weekLabel = computed(() => {
	const start = weekDays.value[0];
	const end = weekDays.value[6];
	const fmt = (d) =>
		d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
	return `${fmt(start).replace(/,?\s*\d{4}$/, "")} – ${fmt(end)}`;
});

function iso(d) {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

const filteredSessions = computed(() => {
	const q = search.value.trim().toLowerCase();
	const weekIsos = new Set(weekDays.value.map(iso));
	return SESSIONS.filter((s) => {
		if (!weekIsos.has(s.date)) return false;
		if (trainerFilter.value !== "all" && s.trainerId !== trainerFilter.value) return false;
		if (programFilter.value !== "all" && s.title !== programFilter.value) return false;
		if (statusFilter.value !== "all" && s.status !== statusFilter.value) return false;
		if (q) {
			const trainer = getTrainer(s.trainerId);
			const hay = `${s.title} ${trainer.name} ${s.room}`.toLowerCase();
			if (!hay.includes(q)) return false;
		}
		return true;
	});
});

function shiftWeek(dir) {
	weekOffset.value += dir;
}

function showToast(msg) {
	toast.value = msg;
	setTimeout(() => {
		toast.value = "";
	}, 2200);
}

function onAddSession() {
	showToast("Add Session — connect to DocType next");
}

function onExport() {
	showToast("Export started");
}
</script>

<template>
	<div class="ts-app">
		<AppSidebar
			:active="activeNav"
			:total-trainers="SUMMARY.total_trainers"
			:calendar-date="weekDays[1]"
			@navigate="activeNav = $event"
		/>
		<main class="ts-main">
			<AppHeader v-model:search="search" :user="CURRENT_USER" />
			<FilterBar
				:week-label="weekLabel"
				:trainers="TRAINERS"
				:programs="PROGRAMS"
				v-model:trainer="trainerFilter"
				v-model:program="programFilter"
				v-model:status="statusFilter"
				@prev="shiftWeek(-1)"
				@next="shiftWeek(1)"
				@add="onAddSession"
				@export="onExport"
			/>
			<SummaryCards :summary="SUMMARY" />
			<ScheduleGrid :days="weekDays" :sessions="filteredSessions" :today-iso="'2026-05-20'" />
			<ScheduleLegend />
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
	animation: slide 0.25s ease;
}

@keyframes slide {
	from {
		transform: translateY(12px);
		opacity: 0;
	}
	to {
		transform: translateY(0);
		opacity: 1;
	}
}

@media (max-width: 980px) {
	.ts-main {
		padding: 16px;
	}
}
</style>
