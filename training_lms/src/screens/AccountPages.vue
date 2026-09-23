<script setup>
import { computed, reactive } from "vue";
import { state, role, go, toast } from "../store";
import ListTools from "../components/ListTools.vue";
import { useRowSelection } from "../lib/list";
import { exportTable } from "../lib/format";

const filters = reactive({ who: "", action: "" });
const notifFilters = reactive({ unread: "" });

const logs = computed(() =>
	state.audit.filter((l) => {
		if (filters.who && l.who !== filters.who) return false;
		if (filters.action && !String(l.action || "").toLowerCase().includes(filters.action.toLowerCase())) return false;
		const q = (state.headerSearch || "").toLowerCase();
		if (q && !`${l.who} ${l.action} ${l.target}`.toLowerCase().includes(q)) return false;
		return true;
	})
);
const people = computed(() => [...new Set(state.audit.map((l) => l.who).filter(Boolean))].sort());
const logSel = useRowSelection(logs);
const kpis = computed(() => [
	{ label: "Events", value: String(logs.value.length) },
	{ label: "People", value: String(people.value.length) },
	{ label: "Today", value: String(logs.value.filter((l) => String(l.at || "").includes(new Date().toISOString().slice(0, 10))).length) },
]);

const notes = computed(() =>
	state.notifications.filter((n) => {
		if (notifFilters.unread === "unread" && !n.unread) return false;
		if (notifFilters.unread === "read" && n.unread) return false;
		const q = (state.headerSearch || "").toLowerCase();
		if (q && !`${n.title} ${n.body}`.toLowerCase().includes(q)) return false;
		return true;
	})
);
const noteSel = useRowSelection(notes);
const noteKpis = computed(() => [
	{ label: "Notifications", value: String(notes.value.length) },
	{ label: "Unread", value: String(notes.value.filter((n) => n.unread).length) },
	{ label: "Read", value: String(notes.value.filter((n) => !n.unread).length) },
]);

function saveSettings() {
	toast("Settings saved for this organization.");
}

function exportLogs(kind) {
	const rows = logSel.chosen().map((l) => ({ when: l.at, who: l.who, action: l.action, target: l.target }));
	exportTable(rows, ["when", "who", "action", "target"], kind, "audit-logs");
	if (kind !== "print" && kind !== "pdf") toast("Export ready.");
}

function exportNotes(kind) {
	const rows = noteSel.chosen().map((n) => ({ title: n.title, body: n.body, time: n.time, unread: n.unread ? "Unread" : "Read" }));
	exportTable(rows, ["title", "body", "time", "unread"], kind, "notifications");
	if (kind !== "print" && kind !== "pdf") toast("Export ready.");
}
</script>

<template>
	<div v-if="state.screen === 'notifications'">
		<ListTools
			:kpis="noteKpis"
			:count="notes.length"
			:selected="noteSel.selected.length"
			@export-csv="exportNotes('csv')"
			@export-xlsx="exportNotes('xlsx')"
			@export-print="exportNotes('print')"
		>
			<div class="form-grid">
				<label class="field">
					<span>Status</span>
					<select v-model="notifFilters.unread">
						<option value="">All</option>
						<option value="unread">Unread</option>
						<option value="read">Read</option>
					</select>
				</label>
			</div>
		</ListTools>
		<div v-for="n in notes" :key="n.id" class="card" style="margin-bottom: 10px" :class="{ selected: noteSel.selectedSet.has(n.id) }">
			<div class="row" style="justify-content: space-between">
				<label class="row" style="gap: 8px" @click.stop>
					<input type="checkbox" :checked="noteSel.selectedSet.has(n.id)" @change="noteSel.toggle(n.id, $event)" />
					<strong>{{ n.title }}</strong>
				</label>
				<span style="font-size: 12px; color: var(--faint)">{{ n.time }}</span>
			</div>
			<p style="margin: 6px 0 0; color: var(--muted)">{{ n.body }}</p>
		</div>
		<p v-if="!notes.length" class="empty">No notifications match these filters.</p>
	</div>

	<div v-else-if="state.screen === 'profile'" class="card" style="max-width: 560px">
		<div class="ava" style="width: 48px; height: 48px; font-size: 16px; margin-bottom: 12px">
			{{ role.name.split(" ").map((w) => w[0]).join("") }}
		</div>
		<h2 style="margin: 0">{{ role.name }}</h2>
		<p>{{ role.label }} · {{ role.email }}</p>
		<p style="color: var(--muted)">{{ state.orgName }}</p>
		<button class="btn" type="button" @click="go('settings', 'settings')">Open settings</button>
	</div>

	<div v-else-if="state.screen === 'settings'" class="card" style="max-width: 640px">
		<h3>Attendance & certification rules</h3>
		<label class="field">
			<span>Default passing percentage</span>
			<input v-model.number="state.settings.passingPercentage" type="number" />
		</label>
		<label class="field">
			<span>QR valid for</span>
			<select v-model="state.settings.qrValidity">
				<option>5 minutes</option>
				<option>10 minutes</option>
				<option>15 minutes</option>
				<option>30 minutes</option>
				<option>Entire session</option>
			</select>
		</label>
		<label class="field" style="flex-direction: row; align-items: center; gap: 10px">
			<input v-model="state.settings.autoIssueCertificate" type="checkbox" />
			<span>Automatically issue certificate after a passing quiz</span>
		</label>
		<label class="field" style="flex-direction: row; align-items: center; gap: 10px">
			<input v-model="state.settings.requireAttendance" type="checkbox" />
			<span>Require attendance before unlocking the quiz</span>
		</label>
		<label class="field" style="flex-direction: row; align-items: center; gap: 10px">
			<input v-model="state.settings.requireQuiz" type="checkbox" />
			<span>Require a passing quiz before certificate eligibility</span>
		</label>
		<p style="font-size: 13px; color: var(--muted)">
			Notification channels: Email and portal are on. SMS and WhatsApp can be connected later without changing this UI.
		</p>
		<button class="btn primary" type="button" @click="saveSettings">Save settings</button>
	</div>

	<div v-else-if="state.screen === 'audit_logs'">
		<ListTools
			:kpis="kpis"
			:count="logs.length"
			:selected="logSel.selected.length"
			@export-csv="exportLogs('csv')"
			@export-xlsx="exportLogs('xlsx')"
			@export-print="exportLogs('print')"
		>
			<div class="form-grid">
				<label class="field">
					<span>Who</span>
					<select v-model="filters.who">
						<option value="">Everyone</option>
						<option v-for="p in people" :key="p" :value="p">{{ p }}</option>
					</select>
				</label>
				<label class="field">
					<span>Action contains</span>
					<input v-model="filters.action" placeholder="QR, certificate…" />
				</label>
			</div>
		</ListTools>
		<div class="card" style="padding: 0; overflow: hidden">
			<table class="data">
				<thead>
					<tr>
						<th class="check"><input type="checkbox" :checked="logSel.allOn" @change="logSel.toggleAll" /></th>
						<th>When</th>
						<th>Who</th>
						<th>Action</th>
						<th>Target</th>
					</tr>
				</thead>
				<tbody>
					<tr v-for="l in logs" :key="l.id">
						<td class="check">
							<input type="checkbox" :checked="logSel.selectedSet.has(l.id)" @change="logSel.toggle(l.id, $event)" />
						</td>
						<td style="font-family: var(--mono); font-size: 12px">{{ l.at }}</td>
						<td>{{ l.who }}</td>
						<td>{{ l.action }}</td>
						<td>{{ l.target }}</td>
					</tr>
					<tr v-if="!logs.length">
						<td colspan="5" style="padding: 20px; color: var(--muted)">No audit events match these filters.</td>
					</tr>
				</tbody>
			</table>
		</div>
	</div>
</template>
