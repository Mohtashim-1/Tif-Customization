<script setup>
import { computed, nextTick, ref, watch } from "vue";

const props = defineProps({
	card: { type: Object, required: true },
	sessions: { type: Array, default: () => [] },
	trainers: { type: Array, default: () => [] },
	periodStart: { type: String, default: "" },
	periodEnd: { type: String, default: "" },
	trainerFilter: { type: String, default: "all" },
});
defineEmits(["close", "open"]);

const fromDate = ref(props.periodStart || "");
const toDate = ref(props.periodEnd || "");
const trainer = ref(props.trainerFilter || "all");
const panel = ref(null);

watch(
	() => [props.periodStart, props.periodEnd, props.trainerFilter, props.card?.key],
	() => {
		fromDate.value = props.periodStart || "";
		toDate.value = props.periodEnd || "";
		trainer.value = props.trainerFilter || "all";
	}
);

watch(
	() => props.card?.key,
	async () => {
		await nextTick();
		panel.value?.scrollIntoView({ behavior: "smooth", block: "start" });
	},
	{ immediate: true }
);

function matchesCard(s) {
	const kind = props.card?.kind || "status";
	const key = props.card?.key;
	if (kind === "status") {
		if (key === "total") return true;
		if (key === "rooms") return Boolean((s.room || "").trim());
		return s.status === key;
	}
	if (kind === "category") return (s.category || "other") === key;
	return true;
}

const filtered = computed(() => {
	return (props.sessions || []).filter((s) => {
		if (!matchesCard(s)) return false;
		if (fromDate.value && s.date && s.date < fromDate.value) return false;
		if (toDate.value && s.date && s.date > toDate.value) return false;
		if (trainer.value !== "all") {
			if (s.trainerId !== trainer.value && s.trainerName !== trainer.value) return false;
		}
		return true;
	});
});

function fmtDate(iso) {
	if (!iso) return "—";
	const d = new Date(`${iso}T00:00:00`);
	return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function statusLabel(s) {
	return (s || "").replace("_", " ");
}
</script>

<template>
	<section ref="panel" class="detail">
		<header>
			<div>
				<p class="kicker">{{ card.kind === "category" ? "Course details" : "Card details" }}</p>
				<h3>{{ card.label }}</h3>
				<p class="sub">{{ filtered.length }} session(s)</p>
			</div>
			<button type="button" class="close" @click="$emit('close')">Close</button>
		</header>

		<div class="filters">
			<label>
				<span>From date</span>
				<input v-model="fromDate" type="date" />
			</label>
			<label>
				<span>To date</span>
				<input v-model="toDate" type="date" />
			</label>
			<label>
				<span>Trainer name</span>
				<select v-model="trainer">
					<option value="all">All Trainers</option>
					<option v-for="t in trainers" :key="t.id" :value="t.id">{{ t.name }}</option>
				</select>
			</label>
		</div>

		<div v-if="!filtered.length" class="empty">No sessions match these filters.</div>

		<div v-else class="list">
			<article v-for="s in filtered" :key="s.id || s.name" class="session">
				<div class="session-head">
					<div>
						<strong>{{ s.title }}</strong>
						<span class="pill" :data-status="s.status">{{ statusLabel(s.status) }}</span>
					</div>
					<button type="button" class="open" @click="$emit('open', s.name || s.id)">Open / Edit</button>
				</div>
				<dl>
					<div><dt>Date</dt><dd>{{ fmtDate(s.date) }}</dd></div>
					<div><dt>Time</dt><dd>{{ s.time || "—" }}</dd></div>
					<div><dt>Trainer</dt><dd>{{ s.trainerName || "—" }}</dd></div>
					<div><dt>Type</dt><dd>{{ s.type || "—" }}</dd></div>
					<div><dt>Program</dt><dd>{{ s.program || "—" }}</dd></div>
					<div><dt>Venue</dt><dd>{{ s.room || "—" }}</dd></div>
					<div><dt>School</dt><dd>{{ s.school || "—" }}</dd></div>
					<div><dt>Department</dt><dd>{{ s.department || "—" }}</dd></div>
					<div><dt>Zoom ID</dt><dd>{{ s.zoom_id || "—" }}</dd></div>
					<div>
						<dt>Attendance</dt>
						<dd>{{ s.attendance_present || 0 }}/{{ s.attendance_total || 0 }}</dd>
					</div>
				</dl>
			</article>
		</div>
	</section>
</template>

<style scoped>
.detail {
	background: #fff;
	border: 1px solid var(--line);
	border-radius: 18px;
	padding: 16px 18px 12px;
	box-shadow: var(--shadow);
	display: flex;
	flex-direction: column;
	gap: 14px;
	scroll-margin-top: 16px;
}
header {
	display: flex;
	justify-content: space-between;
	align-items: flex-start;
	gap: 12px;
}
.kicker {
	margin: 0;
	font-size: 11px;
	letter-spacing: 0.12em;
	text-transform: uppercase;
	color: #6366f1;
	font-weight: 700;
}
h3 {
	margin: 4px 0 0;
	font-size: 20px;
}
.sub,
.empty {
	margin: 4px 0 0;
	color: var(--muted);
	font-size: 13px;
}
.close,
.open {
	border: 1px solid var(--line);
	background: #fff;
	border-radius: 10px;
	padding: 8px 12px;
	font-weight: 600;
}
.open {
	background: #4f46e5;
	border-color: #4f46e5;
	color: #fff;
}
.filters {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
}
.filters label {
	display: flex;
	flex-direction: column;
	gap: 4px;
	font-size: 12px;
	color: var(--muted);
	font-weight: 600;
}
.filters input,
.filters select {
	border: 1px solid var(--line);
	background: #f9fafb;
	border-radius: 10px;
	padding: 8px 12px;
	min-width: 160px;
	color: #111827;
	font-weight: 500;
}
.empty {
	padding: 28px 8px;
	text-align: center;
}
.list {
	display: flex;
	flex-direction: column;
	gap: 12px;
}
.session {
	border: 1px solid #eef2ff;
	border-radius: 14px;
	padding: 12px 14px;
	background: #f8fafc;
}
.session-head {
	display: flex;
	justify-content: space-between;
	gap: 10px;
	align-items: flex-start;
	margin-bottom: 10px;
}
.session-head strong {
	display: block;
	font-size: 15px;
	margin-bottom: 4px;
}
.pill {
	font-size: 11px;
	font-weight: 700;
	text-transform: capitalize;
}
.pill[data-status="completed"] {
	color: #059669;
}
.pill[data-status="in_progress"] {
	color: #d97706;
}
.pill[data-status="upcoming"] {
	color: #7c3aed;
}
dl {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
	gap: 8px 16px;
	margin: 0;
}
dt {
	font-size: 11px;
	color: var(--muted);
	font-weight: 700;
	text-transform: uppercase;
	letter-spacing: 0.04em;
}
dd {
	margin: 2px 0 0;
	font-size: 13px;
	font-weight: 600;
	color: #111827;
}
@media (max-width: 720px) {
	.session-head {
		flex-direction: column;
	}
}
</style>
