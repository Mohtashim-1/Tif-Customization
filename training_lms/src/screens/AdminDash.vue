<script setup>
import { computed } from "vue";
import { state, go, openDoc, presentCount, courseById, startAttendance, todayIso, loadCatalog } from "../store";

const todayDate = computed(() => todayIso());
const kpis = computed(() => [
	{ label: "Trainers", value: String(state.trainers.length), delta: "from Upcoming Training", tone: "#067647" },
	{
		label: "Training programs",
		value: String(state.courses.length),
		delta: state.catalogReady ? "live catalog" : "loading…",
		tone: "#5C7078",
	},
	{
		label: "Today's sessions",
		value: String(state.sessions.filter((s) => s.date === todayDate.value).length),
		delta: `${state.sessions.filter((s) => s.status === "Attendance open" || s.status === "In progress").length} in progress`,
		tone: "#B25E09",
	},
	{
		label: "Attendance today",
		value: String(
			state.sessions.filter((s) => s.date === todayDate.value).reduce((n, s) => n + presentCount(s.id), 0)
		),
		delta: "recorded present",
		tone: "#067647",
	},
	{ label: "All sessions", value: String(state.sessions.length), delta: "last 90 days + next 60", tone: "#5C7078" },
	{ label: "Certificates issued", value: String(state.certificates.length), delta: "digital + verifiable", tone: "#067647" },
]);

const byCourse = computed(() => {
	const max = Math.max(...state.courses.map((c) => c.sessionsCount || 0), 1);
	return state.courses.slice(0, 8).map((c) => ({
		name: c.name,
		count: c.sessionsCount,
		pct: `${Math.min(100, Math.round(((c.sessionsCount || 0) / max) * 100))}%`,
	}));
});

const today = computed(() =>
	state.sessions
		.filter((s) => s.date === todayDate.value)
		.map((s) => ({
			...s,
			course: courseById(s.courseId),
			present: `${presentCount(s.id)} / ${s.expected || "—"}`,
		}))
);

const bars = [98, 112, 86, 124, 104, 132, 118, 141, 128, 150, 138, 156];
const actions = [
	{ label: "Create course", screen: "course_create", nav: "courses" },
	{ label: "Create session", screen: "session_create", nav: "sessions" },
	{ label: "Add student", screen: "students", nav: "students" },
	{
		label: "Generate QR",
		fn: () => {
			const s = today.value[0] || state.sessions.find((x) => x.erpStatus === "in_progress") || state.sessions[0];
			if (s) startAttendance(s.id);
		},
	},
	{ label: "View trainers", screen: "trainers", nav: "trainers" },
	{ label: "Issue certificate", screen: "report_cert", nav: "certs" },
];

function pill(status) {
	if (status === "Attendance open") return "ok";
	if (status === "In progress") return "warn";
	if (status === "Closed") return "info";
	return "mute";
}
</script>

<template>
	<div v-if="state.catalogError" class="card" style="border-color: #f4c7b8">
		<strong>Could not load Upcoming Training.</strong>
		<p style="margin: 6px 0 0; color: var(--muted)">{{ state.catalogError }} Sign in to ERP, then refresh.</p>
		<button class="btn" style="margin-top: 10px" type="button" @click="loadCatalog">Retry</button>
	</div>
	<div class="grid-kpis">
		<div v-for="k in kpis" :key="k.label" class="kpi">
			<div class="l">{{ k.label }}</div>
			<div class="v">{{ k.value }}</div>
			<div class="d" :style="{ color: k.tone }">{{ k.delta }}</div>
		</div>
	</div>
	<div class="two">
		<div class="card">
			<div class="row" style="margin-bottom: 18px">
				<h3 style="margin: 0">Attendance trend</h3>
				<span style="font-size: 12px; color: var(--faint)">last 12 weeks · % of enrolled present</span>
			</div>
			<div class="bars">
				<div v-for="(h, i) in bars" :key="i" class="b">
					<i :style="{ height: h + 'px', background: i > 6 ? (i === 11 ? '#0E7C7B' : '#8ECFCA') : '#CDE7E5' }" />
					<span>W{{ i + 1 }}</span>
				</div>
			</div>
		</div>
		<div class="card" style="display: flex; flex-direction: column; gap: 16px">
			<h3>Quiz pass / fail</h3>
			<div class="row">
				<div class="donut">
					<div class="inner">
						<div style="font: 700 19px Manrope, sans-serif">84%</div>
						<div style="font: 400 10px Manrope, sans-serif; color: var(--faint)">pass rate</div>
					</div>
				</div>
				<div>
					<div class="row" style="margin-bottom: 10px"><span class="pill ok">Passed 1,604</span></div>
					<div class="row"><span class="pill mute">Not passed 305</span></div>
				</div>
			</div>
			<div style="height: 1px; background: #eef2f2" />
			<h3>Sessions by program</h3>
			<div v-for="c in byCourse" :key="c.name" style="margin-bottom: 11px">
				<div class="row" style="justify-content: space-between; font-size: 12px; font-weight: 600">
					<span>{{ c.name }}</span>
					<span style="color: var(--muted)">{{ c.count }}</span>
				</div>
				<div class="progress"><i :style="{ width: c.pct }" /></div>
			</div>
		</div>
	</div>
	<div class="row">
		<button
			v-for="q in actions"
			:key="q.label"
			class="btn"
			type="button"
			@click="q.fn ? q.fn() : go(q.screen, q.nav)"
		>
			<span style="color: var(--teal); font-weight: 700">+</span>
			{{ q.label }}
		</button>
	</div>
	<div class="card" style="padding: 0; overflow: hidden">
		<div class="row" style="padding: 17px 20px; border-bottom: 1px solid #eef2f2">
			<h3 style="margin: 0">Today's sessions</h3>
			<span style="font-size: 12px; color: var(--faint)">{{ todayDate }}</span>
			<button class="btn" style="margin-left: auto; border: 0; background: transparent; color: var(--teal)" type="button" @click="go('sessions', 'sessions')">
				View all sessions →
			</button>
		</div>
		<table class="data">
			<thead>
				<tr>
					<th>Session</th>
					<th>Trainer</th>
					<th>Time</th>
					<th>Present</th>
					<th>Status</th>
				</tr>
			</thead>
			<tbody>
				<tr v-if="!today.length">
					<td colspan="5" style="padding: 20px; color: var(--muted)">No Upcoming Training scheduled for today. Open Sessions to schedule one.</td>
				</tr>
				<tr
					v-for="s in today"
					:key="s.id"
					class="click"
					@click="state.selectedSessionId = s.id; openDoc('session_detail', 'sessions')"
				>
					<td>
						<div style="font-weight: 600">{{ s.name }}</div>
						<div style="color: var(--faint); font-size: 12px">{{ s.course?.name }} · {{ s.course?.code }}</div>
					</td>
					<td>{{ s.trainer }}</td>
					<td style="font-family: var(--mono); color: var(--muted)">{{ s.start }} – {{ s.end }}</td>
					<td style="font-weight: 600">{{ s.present }}</td>
					<td><span class="pill" :class="pill(s.status)">{{ s.status }}</span></td>
				</tr>
			</tbody>
		</table>
	</div>
</template>
