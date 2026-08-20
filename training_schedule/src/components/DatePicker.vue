<script setup>
import { computed, onBeforeUnmount, ref, watch } from "vue";

const model = defineModel({ type: String, default: "" });
const props = defineProps({
	required: { type: Boolean, default: false },
});

const open = ref(false);
const view = ref(new Date());
const root = ref(null);
const pos = ref({ top: 0, left: 0, width: 300 });

function place() {
	if (!root.value) return;
	const r = root.value.getBoundingClientRect();
	pos.value = { top: r.bottom + 6, left: Math.min(r.left, window.innerWidth - 320), width: Math.max(r.width, 280) };
}

function toggle() {
	open.value = !open.value;
	if (open.value) place();
}

watch(
	() => model.value,
	(val) => {
		if (val) view.value = parseIso(val) || new Date();
	},
	{ immediate: true }
);

function parseIso(val) {
	if (!val) return null;
	const d = new Date(`${val}T00:00:00`);
	return Number.isNaN(d.getTime()) ? null : d;
}

function iso(d) {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

const selected = computed(() => parseIso(model.value));
const today = computed(() => iso(new Date()));

const display = computed(() => {
	if (!selected.value) return "Select date";
	return selected.value.toLocaleDateString("en-GB", {
		weekday: "short",
		day: "numeric",
		month: "short",
		year: "numeric",
	});
});

const monthLabel = computed(() =>
	view.value.toLocaleDateString("en-US", { month: "long", year: "numeric" })
);

const cells = computed(() => {
	const year = view.value.getFullYear();
	const month = view.value.getMonth();
	const first = new Date(year, month, 1);
	const startPad = (first.getDay() + 6) % 7;
	const daysInMonth = new Date(year, month + 1, 0).getDate();
	const out = [];
	for (let i = 0; i < startPad; i++) out.push(null);
	for (let day = 1; day <= daysInMonth; day++) out.push(new Date(year, month, day));
	return out;
});

function shiftMonth(dir) {
	const d = new Date(view.value);
	d.setMonth(d.getMonth() + dir);
	view.value = d;
}

function pick(d) {
	model.value = iso(d);
	open.value = false;
}

function pickToday() {
	model.value = today.value;
	view.value = new Date();
	open.value = false;
}

function onDoc(e) {
	if (root.value && !root.value.contains(e.target)) open.value = false;
}

watch(open, (v) => {
	if (v) document.addEventListener("mousedown", onDoc);
	else document.removeEventListener("mousedown", onDoc);
});
onBeforeUnmount(() => document.removeEventListener("mousedown", onDoc));
</script>

<template>
	<div ref="root" class="dp">
		<button type="button" class="trigger" :class="{ empty: !model }" @click="toggle">
			<span class="ico">📅</span>
			<span>{{ display }}</span>
		</button>
		<input :value="model" :required="required" tabindex="-1" class="sr" />
		<div v-if="open" class="pop" :style="{ top: pos.top + 'px', left: pos.left + 'px', width: pos.width + 'px' }">
			<div class="head">
				<button type="button" @click="shiftMonth(-1)">‹</button>
				<strong>{{ monthLabel }}</strong>
				<button type="button" @click="shiftMonth(1)">›</button>
			</div>
			<div class="week">
				<span v-for="w in ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']" :key="w">{{ w }}</span>
			</div>
			<div class="grid">
				<button
					v-for="(d, i) in cells"
					:key="i"
					type="button"
					class="day"
					:disabled="!d"
					:class="{
						empty: !d,
						today: d && iso(d) === today,
						sel: d && selected && iso(d) === iso(selected),
					}"
					@click="d && pick(d)"
				>
					{{ d ? d.getDate() : "" }}
				</button>
			</div>
			<div class="foot">
				<button type="button" @click="pickToday">Today</button>
			</div>
		</div>
	</div>
</template>

<style scoped>
.dp {
	position: relative;
}
.trigger {
	width: 100%;
	display: flex;
	align-items: center;
	gap: 8px;
	border: 1px solid #e5e7eb;
	border-radius: 10px;
	padding: 10px 12px;
	background: #f9fafb;
	text-align: left;
	font: inherit;
}
.trigger.empty {
	color: #9ca3af;
}
.ico {
	font-size: 14px;
}
.pop {
	position: fixed;
	z-index: 120;
	background: #fff;
	border: 1px solid #e5e7eb;
	border-radius: 16px;
	padding: 12px;
	box-shadow: 0 18px 50px rgba(15, 23, 42, 0.18);
}
.head {
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-bottom: 10px;
}
.head button {
	width: 32px;
	height: 32px;
	border: 1px solid #e5e7eb;
	border-radius: 8px;
	background: #fff;
}
.week,
.grid {
	display: grid;
	grid-template-columns: repeat(7, 1fr);
	gap: 4px;
	text-align: center;
}
.week {
	color: #9ca3af;
	font-size: 11px;
	font-weight: 700;
	margin-bottom: 6px;
}
.day {
	height: 34px;
	border: 0;
	background: transparent;
	border-radius: 10px;
	font-weight: 600;
}
.day:hover:not(:disabled) {
	background: #eef2ff;
}
.day.today {
	box-shadow: inset 0 0 0 1px #6366f1;
}
.day.sel {
	background: #4f46e5;
	color: #fff;
}
.day.empty {
	opacity: 0;
}
.foot {
	display: flex;
	justify-content: flex-end;
	margin-top: 8px;
}
.foot button {
	border: 0;
	background: none;
	color: #4f46e5;
	font-weight: 700;
}
.sr {
	position: absolute;
	opacity: 0;
	pointer-events: none;
	width: 0;
	height: 0;
}
</style>
