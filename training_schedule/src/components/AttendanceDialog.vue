<script setup>
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { apiGet, apiPost, METHOD } from "../lib/api";

const props = defineProps({
	open: { type: Boolean, default: false },
	sessionName: { type: String, default: "" },
});
const emit = defineEmits(["close", "saved"]);

const COLS = [
	{ key: "participant_name", label: "Name" },
	{ key: "institute", label: "Institute" },
	{ key: "phone", label: "Cell No" },
	{ key: "email", label: "Email" },
	{ key: "signed", label: "Sign", type: "sign" },
];

function blankRow() {
	return {
		participant_name: "",
		institute: "",
		phone: "",
		email: "",
		signed: "Yes",
		attendance_status: "Present",
	};
}

function ensureMinRows(list, min = 5) {
	const rows = (list || []).map((r) => ({
		...blankRow(),
		...r,
		signed: r.signed || (r.attendance_status === "Absent" ? "No" : "Yes"),
	}));
	while (rows.length < min) rows.push(blankRow());
	return rows;
}

const loading = ref(false);
const saving = ref(false);
const error = ref("");
const meta = ref({ title: "", date: "", trainer: "" });
const rows = ref(ensureMinRows([]));
const tableRef = ref(null);

const filledCount = computed(
	() => rows.value.filter((r) => (r.participant_name || "").trim()).length
);
const presentCount = computed(
	() =>
		rows.value.filter(
			(r) => (r.participant_name || "").trim() && (r.signed || "Yes") === "Yes"
		).length
);

async function load() {
	if (!props.sessionName) return;
	loading.value = true;
	error.value = "";
	try {
		const doc = await apiGet(`${METHOD}.get_session`, { name: props.sessionName });
		meta.value = {
			title: doc.workshop_topic || doc.training_type || doc.name || "Session",
			date: doc.training_date || "",
			trainer: doc.trainer_name || "",
		};
		rows.value = ensureMinRows(doc.attendance || []);
		await nextTick();
		focusCell(0, 0);
	} catch (e) {
		error.value = e.message || String(e);
		rows.value = ensureMinRows([]);
	} finally {
		loading.value = false;
	}
}

watch(
	() => [props.open, props.sessionName],
	([open]) => {
		if (open && props.sessionName) load();
	}
);

onMounted(() => {
	if (props.open && props.sessionName) load();
});

function cellSelector(rowIdx, colIdx) {
	return `[data-row="${rowIdx}"][data-col="${colIdx}"]`;
}

function focusCell(rowIdx, colIdx) {
	const el = tableRef.value?.querySelector(cellSelector(rowIdx, colIdx));
	if (!el) return;
	el.focus();
	if (el.select) el.select();
}

function addRows(count = 1) {
	for (let i = 0; i < count; i++) rows.value.push(blankRow());
}

function removeRow(idx) {
	rows.value.splice(idx, 1);
	if (rows.value.length < 5) rows.value = ensureMinRows(rows.value);
}

function onSignChange(row) {
	row.attendance_status = row.signed === "Yes" ? "Present" : "Absent";
}

function navigate(rowIdx, colIdx, key, shiftKey) {
	const maxCol = COLS.length - 1;
	const maxRow = rows.value.length - 1;
	let r = rowIdx;
	let c = colIdx;

	if (key === "Tab") {
		if (shiftKey) {
			c -= 1;
			if (c < 0) {
				c = maxCol;
				r -= 1;
			}
		} else {
			c += 1;
			if (c > maxCol) {
				c = 0;
				r += 1;
			}
		}
	} else if (key === "Enter") {
		r += shiftKey ? -1 : 1;
	} else if (key === "ArrowDown") {
		r += 1;
	} else if (key === "ArrowUp") {
		r -= 1;
	} else if (key === "ArrowLeft") {
		c -= 1;
	} else if (key === "ArrowRight") {
		c += 1;
	} else {
		return false;
	}

	if (r > maxRow) {
		addRows(1);
		r = rows.value.length - 1;
	}
	r = Math.max(0, Math.min(r, rows.value.length - 1));
	c = Math.max(0, Math.min(c, maxCol));
	nextTick(() => focusCell(r, c));
	return true;
}

function onKeydown(e, rowIdx, colIdx) {
	const key = e.key;
	const navKeys = ["Tab", "Enter", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
	if (!navKeys.includes(key)) return;

	const isSelect = COLS[colIdx]?.type === "sign";
	// Allow native select open with arrows unless Alt held — still move on Tab/Enter.
	if (isSelect && (key === "ArrowUp" || key === "ArrowDown") && !e.altKey) {
		return;
	}
	if (key === "ArrowLeft" || key === "ArrowRight") {
		const el = e.target;
		if (el && typeof el.selectionStart === "number") {
			const atStart = el.selectionStart === 0 && el.selectionEnd === 0;
			const atEnd =
				el.selectionStart === el.value.length && el.selectionEnd === el.value.length;
			if (key === "ArrowLeft" && !atStart) return;
			if (key === "ArrowRight" && !atEnd) return;
		}
	}
	e.preventDefault();
	navigate(rowIdx, colIdx, key, e.shiftKey);
}

async function save() {
	saving.value = true;
	error.value = "";
	try {
		const payload = rows.value
			.filter((r) => (r.participant_name || "").trim())
			.map((r) => ({
				participant_name: (r.participant_name || "").trim(),
				institute: (r.institute || "").trim(),
				phone: (r.phone || "").trim(),
				email: (r.email || "").trim(),
				signed: r.signed === "No" ? "No" : "Yes",
				attendance_status: r.signed === "No" ? "Absent" : "Present",
			}));
		const result = await apiPost(`${METHOD}.save_attendance`, {
			name: props.sessionName,
			attendance: payload,
		});
		emit("saved", result);
		emit("close");
	} catch (e) {
		error.value = e.message || String(e);
	} finally {
		saving.value = false;
	}
}
</script>

<template>
	<div v-if="open" class="overlay" @click.self="$emit('close')">
		<section class="sheet" role="dialog" aria-label="Attendance">
			<header>
				<div>
					<p class="kicker">Attendance</p>
					<h2>{{ meta.title || "Mark attendance" }}</h2>
					<p class="sub">
						{{ sessionName }}
						<template v-if="meta.date"> · {{ meta.date }}</template>
						<template v-if="meta.trainer"> · {{ meta.trainer }}</template>
						· {{ presentCount }}/{{ filledCount }} signed
					</p>
				</div>
				<button type="button" class="close" @click="$emit('close')">✕</button>
			</header>

			<p class="hint">
				Excel-style entry · Tab / Shift+Tab move cells · Enter / ↑↓ move rows · type in the last row to add more
			</p>

			<p v-if="error" class="err">{{ error }}</p>
			<div v-if="loading" class="loading">Loading attendance…</div>

			<div v-else ref="tableRef" class="grid-wrap">
				<table class="sheet-table">
					<thead>
						<tr>
							<th class="row-num">#</th>
							<th v-for="col in COLS" :key="col.key">{{ col.label }}</th>
							<th class="row-act"></th>
						</tr>
					</thead>
					<tbody>
						<tr v-for="(row, rIdx) in rows" :key="rIdx">
							<td class="row-num">{{ rIdx + 1 }}</td>
							<td v-for="(col, cIdx) in COLS" :key="col.key">
								<select
									v-if="col.type === 'sign'"
									v-model="row.signed"
									:data-row="rIdx"
									:data-col="cIdx"
									@change="onSignChange(row)"
									@keydown="onKeydown($event, rIdx, cIdx)"
								>
									<option value="Yes">Yes</option>
									<option value="No">No</option>
								</select>
								<input
									v-else
									v-model="row[col.key]"
									:type="col.key === 'email' ? 'email' : 'text'"
									:data-row="rIdx"
									:data-col="cIdx"
									:placeholder="col.label"
									autocomplete="off"
									@keydown="onKeydown($event, rIdx, cIdx)"
								/>
							</td>
							<td class="row-act">
								<button type="button" class="linkish" title="Clear row" @click="removeRow(rIdx)">
									×
								</button>
							</td>
						</tr>
					</tbody>
				</table>
			</div>

			<footer>
				<button type="button" class="ghost" @click="addRows(5)">+ 5 rows</button>
				<div class="spacer"></div>
				<button type="button" class="ghost" @click="$emit('close')">Cancel</button>
				<button type="button" class="primary" :disabled="saving || loading" @click="save">
					{{ saving ? "Saving…" : "Save Attendance" }}
				</button>
			</footer>
		</section>
	</div>
</template>

<style scoped>
.overlay {
	position: fixed;
	inset: 0;
	background: rgba(15, 23, 42, 0.45);
	z-index: 260;
	display: grid;
	place-items: center;
	padding: 16px;
}
.sheet {
	width: min(960px, 100%);
	max-height: 92vh;
	overflow: auto;
	background: #fff;
	border-radius: 16px;
	padding: 16px 18px 14px;
	box-shadow: 0 24px 80px rgba(15, 23, 42, 0.25);
	display: flex;
	flex-direction: column;
	gap: 10px;
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
	color: #0f766e;
	font-weight: 700;
}
h2 {
	margin: 2px 0 0;
	font-size: 20px;
	letter-spacing: -0.02em;
}
.sub,
.hint {
	margin: 4px 0 0;
	font-size: 13px;
	color: #64748b;
}
.close {
	border: 0;
	background: #f1f5f9;
	width: 34px;
	height: 34px;
	border-radius: 10px;
	cursor: pointer;
	font-size: 16px;
}
.err {
	margin: 0;
	padding: 8px 10px;
	border-radius: 8px;
	background: #fef2f2;
	color: #b91c1c;
	font-size: 13px;
}
.loading {
	padding: 24px;
	text-align: center;
	color: #64748b;
}
.grid-wrap {
	border: 1px solid #cbd5e1;
	border-radius: 10px;
	overflow: auto;
	max-height: min(58vh, 520px);
	background: #f8fafc;
}
.sheet-table {
	width: 100%;
	border-collapse: collapse;
	min-width: 720px;
	background: #fff;
	font-size: 13px;
}
.sheet-table th,
.sheet-table td {
	border: 1px solid #e2e8f0;
	padding: 0;
}
.sheet-table th {
	background: #f1f5f9;
	color: #334155;
	font-weight: 700;
	text-align: left;
	padding: 8px 10px;
	position: sticky;
	top: 0;
	z-index: 1;
}
.row-num {
	width: 40px;
	text-align: center !important;
	color: #94a3b8;
	background: #f8fafc;
	padding: 6px !important;
	font-variant-numeric: tabular-nums;
}
.row-act {
	width: 36px;
	text-align: center;
	background: #fafafa;
}
.sheet-table input,
.sheet-table select {
	width: 100%;
	border: 0;
	outline: none;
	padding: 9px 10px;
	font: inherit;
	background: transparent;
	box-sizing: border-box;
}
.sheet-table input:focus,
.sheet-table select:focus {
	background: #ecfdf5;
	box-shadow: inset 0 0 0 2px #14b8a6;
}
.linkish {
	border: 0;
	background: transparent;
	color: #94a3b8;
	cursor: pointer;
	font-size: 16px;
	line-height: 1;
	padding: 4px 8px;
}
.linkish:hover {
	color: #b91c1c;
}
footer {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	align-items: center;
	padding-top: 4px;
}
.spacer {
	flex: 1;
}
.ghost,
.primary {
	border-radius: 10px;
	padding: 9px 14px;
	font-weight: 600;
	cursor: pointer;
	border: 1px solid #cbd5e1;
	background: #fff;
}
.primary {
	background: #0f766e;
	border-color: #0f766e;
	color: #fff;
}
.primary:disabled {
	opacity: 0.6;
	cursor: not-allowed;
}
</style>
