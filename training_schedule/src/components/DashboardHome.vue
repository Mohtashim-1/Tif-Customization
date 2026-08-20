<script setup>
import { computed } from "vue";

const props = defineProps({
	loading: { type: Boolean, default: false },
	payload: { type: Object, default: () => ({}) },
});
defineEmits(["add", "edit", "open-schedule", "filter-trainer"]);

function statusLabel(s) {
	return (s || "").replace("_", " ");
}

function fmtDate(iso) {
	if (!iso) return "—";
	const d = new Date(`${iso}T00:00:00`);
	return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

const nextList = computed(() => {
	if ((props.payload.upcoming || []).length) {
		return { title: "Next up", rows: props.payload.upcoming };
	}
	return { title: "Recent sessions", rows: props.payload.recent || [] };
});

const kpis = (s = {}) => [
	{ key: "total", label: "Sessions (90 days)", value: s.total_sessions || 0, tone: "blue" },
	{ key: "done", label: "Completed", value: s.completed || 0, tone: "green" },
	{ key: "live", label: "Today", value: s.in_progress || 0, tone: "orange" },
	{ key: "up", label: "Upcoming", value: s.upcoming || 0, tone: "purple" },
	{ key: "people", label: "Trainers", value: s.total_trainers || 0, tone: "sky" },
];
</script>

<template>
	<section class="dash">
		<div class="hero">
			<div>
				<p class="kicker">Upcoming Training</p>
				<h2>Operations overview</h2>
				<p class="lede">
					{{ payload.greeting || "Today" }} · create, edit, and track sessions here. Desk is not required.
				</p>
			</div>
			<div class="hero-actions">
				<button type="button" class="primary" @click="$emit('add')">+ New Training</button>
				<button type="button" class="ghost" @click="$emit('open-schedule')">Open week grid</button>
			</div>
		</div>

		<div v-if="loading" class="empty">Loading dashboard…</div>
		<template v-else>
			<div class="kpis">
				<article v-for="c in kpis(payload.summary)" :key="c.key" class="kpi" :data-tone="c.tone">
					<div class="kpi-label">{{ c.label }}</div>
					<div class="kpi-value">{{ c.value }}</div>
				</article>
			</div>

			<div class="cols">
				<section class="panel today">
					<header>
						<h3>Today’s agenda</h3>
						<span>{{ (payload.today_sessions || []).length }} session(s)</span>
					</header>
					<div v-if="!(payload.today_sessions || []).length" class="empty-card">
						<p>No Upcoming Training scheduled for today.</p>
						<button type="button" class="primary" @click="$emit('add')">Schedule one</button>
					</div>
					<button
						v-for="s in payload.today_sessions || []"
						:key="s.id"
						type="button"
						class="row"
						@click="$emit('edit', s.name)"
					>
						<time>{{ s.time || "—" }}</time>
						<div>
							<strong>{{ s.title }}</strong>
							<small>{{ s.trainerName }} · {{ s.room }}</small>
						</div>
						<em :data-status="s.status">{{ statusLabel(s.status) }}</em>
					</button>
				</section>

				<section class="panel upcoming">
					<header>
						<h3>{{ nextList.title }}</h3>
						<button type="button" class="link" @click="$emit('open-schedule')">Week view →</button>
					</header>
					<div v-if="!nextList.rows.length" class="empty-card">Nothing to show yet.</div>
					<button
						v-for="s in nextList.rows"
						:key="s.id"
						type="button"
						class="row compact"
						@click="$emit('edit', s.name)"
					>
						<time>{{ fmtDate(s.date) }}</time>
						<div>
							<strong>{{ s.title }}</strong>
							<small>{{ s.trainerName }} · {{ s.time || "—" }}</small>
						</div>
					</button>
				</section>
			</div>

			<div class="cols bottom">
				<section class="panel">
					<header>
						<h3>This week</h3>
						<span>{{ (payload.week_sessions || []).length }} on the calendar</span>
					</header>
					<div class="week-list">
						<div v-for="day in payload.week_days || []" :key="day.date" class="week-day">
							<div class="wd-label">
								<strong>{{ day.label }}</strong>
								<small>{{ day.date.slice(5) }}</small>
							</div>
							<div class="wd-chips">
								<button
									v-for="s in day.sessions"
									:key="s.id"
									type="button"
									class="chip"
									@click="$emit('edit', s.name)"
								>
									{{ s.time || "—" }} {{ s.title }}
								</button>
								<span v-if="!day.sessions.length" class="muted">Free</span>
							</div>
						</div>
					</div>
				</section>

				<section class="panel">
					<header><h3>Active trainers</h3></header>
					<button
						v-for="t in payload.trainers || []"
						:key="t.name"
						type="button"
						class="person"
						@click="$emit('filter-trainer', t.name)"
					>
						<span class="avatar" :style="{ background: t.color }">{{ t.initials }}</span>
						<div>
							<strong>{{ t.name }}</strong>
							<small>{{ t.sessions }} sessions · {{ t.upcoming || 0 }} upcoming</small>
						</div>
					</button>
					<p v-if="!(payload.trainers || []).length" class="muted">No trainers in this window.</p>
				</section>
			</div>
		</template>
	</section>
</template>

<style scoped>
.dash {
	display: flex;
	flex-direction: column;
	gap: 16px;
}
.hero {
	display: flex;
	justify-content: space-between;
	gap: 16px;
	flex-wrap: wrap;
	align-items: flex-end;
	background: linear-gradient(135deg, #0f172a 0%, #312e81 70%);
	color: #fff;
	border-radius: 20px;
	padding: 22px 24px;
}
.kicker {
	margin: 0;
	font-size: 11px;
	letter-spacing: 0.14em;
	text-transform: uppercase;
	color: #c7d2fe;
	font-weight: 700;
}
h2 {
	margin: 6px 0 0;
	font-size: 28px;
	letter-spacing: -0.03em;
}
.lede {
	margin: 6px 0 0;
	color: #cbd5e1;
	font-size: 14px;
	max-width: 560px;
}
.hero-actions,
.kpis {
	display: flex;
	gap: 10px;
	flex-wrap: wrap;
}
.primary,
.ghost {
	border-radius: 10px;
	padding: 10px 14px;
	font-weight: 600;
	border: 1px solid transparent;
}
.primary {
	background: #fff;
	color: #312e81;
}
.ghost {
	background: transparent;
	border-color: rgba(255, 255, 255, 0.25);
	color: #fff;
}
.kpis {
	display: grid;
	grid-template-columns: repeat(5, minmax(0, 1fr));
	gap: 10px;
}
.kpi {
	background: #fff;
	border: 1px solid var(--line);
	border-radius: 16px;
	padding: 14px 16px;
	box-shadow: var(--shadow);
}
.kpi-label {
	font-size: 12px;
	color: var(--muted);
}
.kpi-value {
	font-size: 26px;
	font-weight: 700;
	letter-spacing: -0.04em;
}
.kpi[data-tone="blue"] {
	border-top: 3px solid #6366f1;
}
.kpi[data-tone="green"] {
	border-top: 3px solid #10b981;
}
.kpi[data-tone="orange"] {
	border-top: 3px solid #f59e0b;
}
.kpi[data-tone="purple"] {
	border-top: 3px solid #8b5cf6;
}
.kpi[data-tone="sky"] {
	border-top: 3px solid #0ea5e9;
}
.cols {
	display: grid;
	grid-template-columns: 1.2fr 0.8fr;
	gap: 12px;
}
.panel {
	background: #fff;
	border: 1px solid var(--line);
	border-radius: 18px;
	padding: 16px;
	box-shadow: var(--shadow);
	min-height: 220px;
}
.panel header {
	display: flex;
	justify-content: space-between;
	align-items: baseline;
	margin-bottom: 10px;
}
.panel h3 {
	margin: 0;
	font-size: 16px;
}
.panel header span,
.muted {
	color: var(--muted);
	font-size: 12px;
}
.row {
	width: 100%;
	display: grid;
	grid-template-columns: 72px 1fr auto;
	gap: 10px;
	align-items: center;
	text-align: left;
	border: 0;
	border-bottom: 1px solid #f3f4f6;
	background: transparent;
	padding: 10px 4px;
}
.row.compact {
	grid-template-columns: 92px 1fr;
}
.row strong {
	display: block;
	font-size: 13px;
}
.row small {
	color: var(--muted);
}
.row time {
	font-weight: 700;
	font-size: 12px;
	color: #4338ca;
}
.row em {
	font-style: normal;
	font-size: 11px;
	font-weight: 700;
	text-transform: capitalize;
}
.row em[data-status="completed"] {
	color: #059669;
}
.row em[data-status="in_progress"] {
	color: #d97706;
}
.row em[data-status="upcoming"] {
	color: #7c3aed;
}
.empty,
.empty-card {
	padding: 28px 12px;
	text-align: center;
	color: var(--muted);
}
.link {
	border: 0;
	background: none;
	color: #4f46e5;
	font-weight: 700;
}
.week-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
}
.week-day {
	display: grid;
	grid-template-columns: 72px 1fr;
	gap: 10px;
	align-items: start;
}
.wd-label small {
	display: block;
	color: var(--muted);
}
.wd-chips {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}
.chip {
	border: 1px solid #e0e7ff;
	background: #eef2ff;
	color: #3730a3;
	border-radius: 999px;
	padding: 4px 10px;
	font-size: 11px;
	font-weight: 600;
}
.person {
	width: 100%;
	display: flex;
	gap: 10px;
	align-items: center;
	border: 0;
	background: transparent;
	padding: 8px 0;
	text-align: left;
	border-bottom: 1px solid #f3f4f6;
}
.avatar {
	width: 36px;
	height: 36px;
	border-radius: 12px;
	color: #fff;
	display: grid;
	place-items: center;
	font-weight: 700;
	font-size: 12px;
}
@media (max-width: 1100px) {
	.kpis,
	.cols {
		grid-template-columns: 1fr;
	}
}
</style>
