<script setup>
import { computed } from "vue";
import { TIME_SLOTS, getCategory } from "../data/mock";

const props = defineProps({
	days: { type: Array, required: true },
	sessions: { type: Array, default: () => [] },
	todayIso: { type: String, default: "" },
});
const emit = defineEmits(["open", "create"]);

function iso(d) {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

function dayLabel(d) {
	return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/** Multiple sessions can share a day+slot — keep a list. */
const byCell = computed(() => {
	const map = {};
	for (const s of props.sessions) {
		const key = `${s.date}|${s.slot}`;
		if (!map[key]) map[key] = [];
		map[key].push(s);
	}
	return map;
});

function sessionsAt(day, slotId) {
	return byCell.value[`${iso(day)}|${slotId}`] || [];
}

function statusIcon(status) {
	if (status === "completed") return "✓";
	if (status === "in_progress") return "●";
	return "○";
}

function openSession(s) {
	emit("open", s.name || s.id);
}

function createAt(day, slot) {
	emit("create", {
		training_date: iso(day),
		training_time: slot.start || "10:00",
	});
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
					<td
						v-for="day in days"
						:key="iso(day) + slot.id"
						:class="{ today: iso(day) === todayIso }"
					>
						<template v-if="sessionsAt(day, slot.id).length">
							<article
								v-for="s in sessionsAt(day, slot.id)"
								:key="s.id"
								class="session"
								:style="{
									'--cat': getCategory(s.category).color,
									background: getCategory(s.category).color + '18',
								}"
								@click.stop="openSession(s)"
							>
								<div class="session-top">
									<strong>{{ s.title }}</strong>
									<span class="status" :data-status="s.status">{{ statusIcon(s.status) }}</span>
								</div>
								<div class="meta">
									<span
										class="avatar"
										:style="{ background: s.trainerColor || getCategory(s.category).color }"
									>
										{{ s.trainerInitials || "?" }}
									</span>
									<span>
										{{ s.trainerName }} · {{ s.time || slot.label }} · {{ s.room }}
									</span>
								</div>
							</article>
						</template>
						<button v-else type="button" class="empty" @click="createAt(day, slot)">+ Add</button>
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
	min-height: 64px;
	margin-bottom: 8px;
	cursor: pointer;
	transition: transform 0.15s ease;
}
.session:hover {
	transform: translateY(-1px);
}
.session-top {
	display: flex;
	justify-content: space-between;
	gap: 8px;
	margin-bottom: 8px;
}
.session-top strong {
	font-size: 12px;
	line-height: 1.35;
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
	align-items: flex-start;
	gap: 8px;
	font-size: 11px;
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
	width: 100%;
	text-align: center;
	color: #9ca3af;
	padding: 24px 0;
	border: 1px dashed #e5e7eb;
	background: transparent;
	border-radius: 12px;
}
.empty:hover {
	border-color: #a5b4fc;
	color: #4f46e5;
	background: #eef2ff;
}
</style>
