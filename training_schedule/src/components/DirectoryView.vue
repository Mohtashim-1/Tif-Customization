<script setup>
import { computed } from "vue";

const props = defineProps({
	loading: { type: Boolean, default: false },
	payload: { type: Object, default: () => ({ view: "", rows: [] }) },
	search: { type: String, default: "" },
});
const emit = defineEmits(["refresh", "add", "edit", "filter-trainer", "filter-program", "filter-room"]);

const view = computed(() => (props.payload?.view || "").toLowerCase());
const rows = computed(() => {
	const q = (props.search || "").trim().toLowerCase();
	const list = props.payload?.rows || [];
	if (!q) return list;
	return list.filter((r) => JSON.stringify(r).toLowerCase().includes(q));
});

const reportKpis = computed(() =>
	Object.entries(props.payload?.summary || {}).filter(([, val]) => typeof val === "number")
);

const copy = {
	trainers: {
		title: "Trainers",
		subtitle: "List of trainers from Upcoming Training. Open a row to see their sessions in list view.",
		empty: "No trainers in this date range.",
	},
	programs: {
		title: "Training Programs",
		subtitle: "Programs and topics from Upcoming Training. Open a row to see matching sessions.",
		empty: "No programs found.",
	},
	sessions: {
		title: "All Sessions",
		subtitle: "Every Upcoming Training record in list view. Create, edit, or open from here.",
		empty: "No sessions in the last 90 days / next 60 days.",
	},
	rooms: {
		title: "Rooms & Venues",
		subtitle: "Grouped by mode and school/city from Upcoming Training.",
		empty: "No venues found.",
	},
	reports: {
		title: "Training Reports",
		subtitle: "Live counts from Upcoming Training. Export stays inside this portal.",
		empty: "No report data.",
	},
	notifications: {
		title: "Upcoming & In Progress",
		subtitle: "Sessions still to run. Click to edit the Upcoming Training record.",
		empty: "No upcoming sessions.",
	},
	settings: {
		title: "Portal Settings",
		subtitle: "How this workspace talks to Upcoming Training.",
		empty: "",
	},
};

function openRow(row) {
	emit("edit", row.name || row.id);
}
</script>

<template>
	<section class="dir" :data-view="view">
		<div class="dir-head">
			<div>
				<p class="kicker">Upcoming Training</p>
				<h2>{{ copy[view]?.title || "Directory" }}</h2>
				<p>{{ copy[view]?.subtitle }}</p>
			</div>
			<div class="actions">
				<button type="button" class="ghost" @click="$emit('refresh')">Refresh</button>
			</div>
		</div>

		<div v-if="loading" class="empty">Loading {{ copy[view]?.title || "data" }}…</div>

		<template v-else-if="view === 'reports'">
			<div class="report-grid">
				<article v-for="[key, val] in reportKpis" :key="key" class="card">
					<div class="label">{{ String(key).replace(/_/g, " ") }}</div>
					<div class="value">{{ val }}</div>
				</article>
			</div>
			<div class="two">
				<div class="panel">
					<h3>By Type</h3>
					<ul>
						<li v-for="r in payload.by_type || []" :key="r.name">
							<span>{{ r.name }}</span><strong>{{ r.count }}</strong>
						</li>
					</ul>
				</div>
				<div class="panel">
					<h3>By Mode</h3>
					<ul>
						<li v-for="r in payload.by_mode || []" :key="r.name">
							<span>{{ r.name }}</span><strong>{{ r.count }}</strong>
						</li>
					</ul>
				</div>
			</div>
			<p class="links">
				<button type="button" class="linkish" @click="$emit('refresh')">Recalculate</button>
			</p>
		</template>

		<template v-else-if="view === 'settings'">
			<div class="settings">
				<article>
					<h3>Data source</h3>
					<p>All menus read and write the <strong>Upcoming Training</strong> DocType. Nothing is mock data.</p>
				</article>
				<article>
					<h3>Create / edit</h3>
					<p>Use <strong>+ New Training</strong> on the Dashboard to create a session. Saves stay in this portal.</p>
				</article>
				<article>
					<h3>Desk list</h3>
					<p>Optional: open the classic Frappe list if you need bulk tools.</p>
					<a href="/app/upcoming-training" target="_blank">Open Upcoming Training list →</a>
				</article>
			</div>
		</template>

		<div v-else-if="!rows.length" class="empty">{{ copy[view]?.empty || "No records found." }}</div>

		<div v-else-if="view === 'trainers'" class="table-wrap">
			<table>
				<thead>
					<tr>
						<th>Trainer</th>
						<th>Sessions</th>
						<th>Upcoming</th>
						<th>Completed</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					<tr v-for="r in rows" :key="r.name">
						<td>
							<div class="person-cell">
								<span class="avatar" :style="{ background: r.color }">{{ r.initials }}</span>
								<strong>{{ r.name }}</strong>
							</div>
						</td>
						<td>{{ r.sessions }}</td>
						<td>{{ r.upcoming || 0 }}</td>
						<td>{{ r.completed || 0 }}</td>
						<td>
							<button type="button" class="linkish" @click="$emit('filter-trainer', r.name)">
								View sessions
							</button>
						</td>
					</tr>
				</tbody>
			</table>
		</div>

		<div v-else-if="view === 'programs'" class="table-wrap">
			<table>
				<thead>
					<tr>
						<th>Program</th>
						<th>Sessions</th>
						<th>Trainers</th>
						<th>Types</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					<tr v-for="r in rows" :key="r.name">
						<td><strong>{{ r.name }}</strong></td>
						<td>{{ r.sessions }}</td>
						<td>{{ r.trainers }}</td>
						<td>{{ r.types }}</td>
						<td>
							<button type="button" class="linkish" @click="$emit('filter-program', r.name)">
								View sessions
							</button>
						</td>
					</tr>
				</tbody>
			</table>
		</div>

		<div v-else-if="view === 'rooms'" class="table-wrap">
			<table>
				<thead>
					<tr>
						<th>Venue / Mode</th>
						<th>Sessions</th>
						<th>Modes</th>
						<th>Cities</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					<tr v-for="r in rows" :key="r.name">
						<td><strong>{{ r.name }}</strong></td>
						<td>{{ r.sessions }}</td>
						<td>{{ r.modes }}</td>
						<td>{{ r.cities }}</td>
						<td>
							<button type="button" class="linkish" @click="$emit('filter-room', r.name)">
								View sessions
							</button>
						</td>
					</tr>
				</tbody>
			</table>
		</div>

		<div v-else class="table-wrap">
			<table>
				<thead>
					<tr>
						<th>Date</th>
						<th>Time</th>
						<th>Title</th>
						<th>Trainer</th>
						<th>Type</th>
						<th>Mode</th>
						<th>Zoom ID</th>
						<th>Attendance</th>
						<th>Status</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					<tr v-for="r in rows" :key="r.id || r.name">
						<td>{{ r.date }}</td>
						<td>{{ r.time }}</td>
						<td>{{ r.title }}</td>
						<td>{{ r.trainerName }}</td>
						<td>{{ r.type }}</td>
						<td>{{ r.mode }}</td>
						<td>{{ r.zoom_id || "—" }}</td>
						<td>
							{{ r.attendance_present || 0 }}/{{ r.attendance_total || 0 }}
						</td>
						<td><span class="pill" :data-status="r.status">{{ r.status }}</span></td>
						<td>
							<button type="button" class="linkish" @click="openRow(r)">Edit / Attendance</button>
						</td>
					</tr>
				</tbody>
			</table>
		</div>
	</section>
</template>

<style scoped>
.dir {
	background: #fff;
	border: 1px solid var(--line);
	border-radius: 18px;
	padding: 18px;
	box-shadow: var(--shadow);
	display: flex;
	flex-direction: column;
	gap: 16px;
	min-height: 420px;
}
.dir[data-view="trainers"] { background: linear-gradient(180deg, #f8fafc 0%, #fff 80px); }
.dir[data-view="programs"] { background: linear-gradient(180deg, #eef2ff 0%, #fff 80px); }
.dir[data-view="sessions"] { background: linear-gradient(180deg, #ecfdf5 0%, #fff 80px); }
.dir[data-view="rooms"] { background: linear-gradient(180deg, #fff7ed 0%, #fff 80px); }
.dir[data-view="reports"] { background: linear-gradient(180deg, #fdf2f8 0%, #fff 80px); }
.dir[data-view="notifications"] { background: linear-gradient(180deg, #f5f3ff 0%, #fff 80px); }
.kicker {
	margin: 0;
	font-size: 11px;
	letter-spacing: 0.12em;
	text-transform: uppercase;
	color: #6366f1;
	font-weight: 700;
}
.dir-head {
	display: flex;
	justify-content: space-between;
	gap: 12px;
	flex-wrap: wrap;
	align-items: flex-start;
}
.dir-head h2 { margin: 4px 0 0; font-size: 24px; }
.dir-head p { margin: 4px 0 0; color: var(--muted); font-size: 13px; max-width: 640px; }
.actions { display: flex; gap: 8px; }
.primary, .ghost {
	border-radius: 10px;
	padding: 10px 14px;
	font-weight: 600;
	border: 1px solid transparent;
}
.primary { background: #4f46e5; color: #fff; }
.ghost { background: #fff; border-color: var(--line); }
.empty { padding: 40px; text-align: center; color: var(--muted); }
.cards {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
	gap: 12px;
}
.person, .prog, .room {
	text-align: left;
	border: 1px solid var(--line);
	background: #fff;
	border-radius: 16px;
	padding: 16px;
	display: flex;
	flex-direction: column;
	gap: 4px;
	box-shadow: var(--shadow);
}
.person:hover, .prog:hover, .room:hover { border-color: #c7d2fe; }
.avatar {
	width: 40px;
	height: 40px;
	border-radius: 12px;
	display: grid;
	place-items: center;
	color: #fff;
	font-weight: 700;
	margin-bottom: 8px;
}
.person-cell {
	display: flex;
	align-items: center;
	gap: 10px;
}
.person-cell .avatar {
	width: 32px;
	height: 32px;
	border-radius: 10px;
	margin-bottom: 0;
	font-size: 11px;
	flex: 0 0 auto;
}
.table-wrap { overflow: auto; background: #fff; border-radius: 12px; }
table { width: 100%; border-collapse: collapse; min-width: 860px; }
th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--line); font-size: 13px; }
th { background: #f8fafc; }
.pill { text-transform: capitalize; font-weight: 600; }
.pill[data-status="completed"] { color: #059669; }
.pill[data-status="in_progress"] { color: #d97706; }
.pill[data-status="upcoming"] { color: #7c3aed; }
.linkish { border: 0; background: none; color: #4f46e5; font-weight: 700; }
.report-grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
	gap: 10px;
}
.card {
	border: 1px solid var(--line);
	border-radius: 12px;
	padding: 12px;
	background: #fff;
}
.card .label { font-size: 11px; color: var(--muted); text-transform: capitalize; }
.card .value { font-size: 20px; font-weight: 700; }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.panel { border: 1px solid var(--line); border-radius: 12px; padding: 12px; background: #fff; }
.panel h3 { margin: 0 0 8px; font-size: 14px; }
.panel ul { list-style: none; margin: 0; padding: 0; }
.panel li { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #f3f4f6; }
.settings { display: grid; gap: 12px; }
.settings article {
	border: 1px solid var(--line);
	border-radius: 14px;
	padding: 16px;
	background: #fff;
}
.settings h3 { margin: 0 0 6px; }
.settings a { color: #4f46e5; font-weight: 600; }
@media (max-width: 800px) { .two { grid-template-columns: 1fr; } }
</style>
