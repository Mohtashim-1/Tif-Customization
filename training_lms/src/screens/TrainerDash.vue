<script setup>
import { computed } from "vue";
import { state, go, openDoc, presentCount, courseById, startAttendance, closeAttendance, todayIso, activateQuizForSession } from "../store";

const todayDate = computed(() => todayIso());
const mine = computed(() => {
	const todays = state.sessions.filter((s) => s.date === todayDate.value);
	const list = todays.length ? todays : state.sessions.filter((s) => s.erpStatus !== "completed").slice(0, 12);
	return list.map((s) => ({ ...s, course: courseById(s.courseId), present: presentCount(s.id) }));
});

function open(s) {
	state.selectedSessionId = s.id;
	openDoc("session_detail", "sessions");
}
async function quiz(s) {
	await activateQuizForSession(s);
}
</script>

<template>
	<div class="grid-kpis">
		<div class="kpi">
			<div class="l">Today's sessions</div>
			<div class="v">{{ state.sessions.filter((s) => s.date === todayDate).length }}</div>
			<div class="d stat-warn">From Upcoming Training</div>
		</div>
		<div class="kpi">
			<div class="l">Students present</div>
			<div class="v">{{ mine.reduce((n, s) => n + s.present, 0) }}</div>
			<div class="d stat-ok">Across rooms</div>
		</div>
		<div class="kpi">
			<div class="l">Open QR</div>
			<div class="v">{{ mine.filter((s) => s.qrActive).length }}</div>
			<div class="d stat-mute">Attendance windows</div>
		</div>
		<div class="kpi">
			<div class="l">Trainers</div>
			<div class="v">{{ state.trainers.length }}</div>
			<div class="d stat-mute">Live directory</div>
		</div>
	</div>
	<div class="card" style="padding: 0; overflow: hidden">
		<div style="padding: 17px 20px; border-bottom: 1px solid #eef2f2">
			<h3 style="margin: 0">Today's teaching</h3>
		</div>
		<table class="data">
			<thead>
				<tr>
					<th>Course</th>
					<th>Time</th>
					<th>Students</th>
					<th>Status</th>
					<th>Actions</th>
				</tr>
			</thead>
			<tbody>
				<tr v-if="!mine.length">
					<td colspan="5" style="padding: 20px; color: var(--muted)">No sessions found. Create one from Sessions.</td>
				</tr>
				<tr v-for="s in mine" :key="s.id">
					<td>
						<div style="font-weight: 600">{{ s.course?.name }}</div>
						<div style="font-size: 12px; color: var(--faint)">{{ s.name }} · {{ s.trainer }}</div>
					</td>
					<td style="font-family: var(--mono)">{{ s.start }} – {{ s.end }}</td>
					<td>{{ s.present }} / {{ s.expected || "—" }}</td>
					<td><span class="pill" :class="s.qrActive ? 'ok' : s.status === 'Closed' ? 'info' : 'mute'">{{ s.status }}</span></td>
					<td>
						<div class="row">
							<button class="btn primary" type="button" @click="startAttendance(s.id)">{{ s.qrActive ? "Display QR" : "Start session" }}</button>
							<button class="btn" type="button" @click="open(s)">View attendance</button>
							<button class="btn" type="button" @click="closeAttendance(s.id)">Close</button>
							<button class="btn ghost" type="button" @click="quiz(s)">{{ s.quizLive ? "Quiz is live" : "Activate quiz" }}</button>
						</div>
					</td>
				</tr>
			</tbody>
		</table>
	</div>
</template>
