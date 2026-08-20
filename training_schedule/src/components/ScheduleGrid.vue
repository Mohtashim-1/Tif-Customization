<script setup>
import { computed } from "vue";
import { TIME_SLOTS, getCategory, getTrainer } from "../data/mock";

const props = defineProps({
	days: { type: Array, required: true },
	sessions: { type: Array, default: () => [] },
	todayIso: { type: String, default: "" },
});

function iso(d) {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

function dayLabel(d) {
	return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

const byCell = computed(() => {
	const map = {};
	for (const s of props.sessions) {
		map[`${s.date}|${s.slot}`] = s;
	}
	return map;
});

function sessionAt(day, slotId) {
	return byCell.value[`${iso(day)}|${slotId}`] || null;
}

function statusIcon(status) {
	if (status === "completed") return "✓";
	if (status === "in_progress") return "●";
	return "○";
}
</script>

<template>
	<section class="grid-wrap">
		<table class="grid">
			<thead>
				<tr>
					<th class="time-col">Time</th>
					<th
						v-for="day in days"
						:key="iso(day)"
						:class="{ today: iso(day) === todayIso }"
					>
						{{ dayLabel(day) }}
					</th>
				</tr>
			</thead>
			<tbody>
				<tr v-for="slot in TIME_SLOTS" :key="slot.id">
					<td class="time-col">{{ slot.label }}</td>
					<td v-for="day in days" :key="iso(day) + slot.id" :class="{ today: iso(day) === todayIso }">
						<article
							v-if="sessionAt(day, slot.id)"
							class="session"
							:style="{
								'--cat': getCategory(sessionAt(day, slot.id).category).color,
								background: getCategory(sessionAt(day, slot.id).category).color + '18',
							}"
						>
							<div class="session-top">
								<strong>{{ sessionAt(day, slot.id).title }}</strong>
								<span class="status" :data-status="sessionAt(day, slot.id).status">
									{{ statusIcon(sessionAt(day, slot.id).status) }}
								</span>
							</div>
							<div class="meta">
								<span
									class="avatar"
									:style="{ background: getTrainer(sessionAt(day, slot.id).trainerId).color }"
								>
									{{ getTrainer(sessionAt(day, slot.id).trainerId).initials }}
								</span>
								<span>
									{{ getTrainer(sessionAt(day, slot.id).trainerId).name }} ·
									{{ sessionAt(day, slot.id).room }}
								</span>
							</div>
						</article>
						<span v-else class="empty">—</span>
					</td>
				</tr>
			</tbody>
		</table>
	</section>
</template>

<style scoped>
.grid-wrap {
	background: #fff;
	border: 1px solid var(--line);
	border-radius: 18px;
	overflow: auto;
	box-shadow: var(--shadow);
}

.grid {
	width: 100%;
	border-collapse: separate;
	border-spacing: 0;
	min-width: 980px;
}

th,
td {
	border-bottom: 1px solid var(--line);
	border-right: 1px solid #f3f4f6;
	padding: 10px;
	vertical-align: top;
	text-align: left;
}

th {
	background: #f8fafc;
	font-size: 13px;
	font-weight: 600;
	position: sticky;
	top: 0;
	z-index: 1;
}

th.today {
	background: #eef2ff;
	color: #4338ca;
	box-shadow: inset 0 -3px 0 #6366f1;
}

td.today {
	background: #f8faff;
}

.time-col {
	width: 130px;
	font-weight: 600;
	color: #4b5563;
	background: #fafafa;
	position: sticky;
	left: 0;
	z-index: 2;
}

.session {
	border-left: 4px solid var(--cat);
	border-radius: 12px;
	padding: 10px;
	min-height: 72px;
	animation: pop 0.25s ease;
}

@keyframes pop {
	from {
		transform: scale(0.97);
		opacity: 0.5;
	}
	to {
		transform: scale(1);
		opacity: 1;
	}
}

.session-top {
	display: flex;
	justify-content: space-between;
	gap: 8px;
	margin-bottom: 8px;
}

.session-top strong {
	font-size: 13px;
}

.status[data-status="completed"] {
	color: #059669;
}
.status[data-status="in_progress"] {
	color: #d97706;
}
.status[data-status="upcoming"] {
	color: #7c3aed;
}

.meta {
	display: flex;
	align-items: center;
	gap: 8px;
	font-size: 12px;
	color: #4b5563;
}

.avatar {
	width: 22px;
	height: 22px;
	border-radius: 999px;
	color: #fff;
	font-size: 9px;
	font-weight: 700;
	display: grid;
	place-items: center;
	flex: 0 0 auto;
}

.empty {
	display: block;
	text-align: center;
	color: #d1d5db;
	padding: 24px 0;
}
</style>
