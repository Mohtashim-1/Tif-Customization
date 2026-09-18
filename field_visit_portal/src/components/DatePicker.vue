<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";

const model = defineModel({ type: String, default: "" });

const open = ref(false);
const view = ref(new Date());
const root = ref(null);
const pop = ref(null);
const placement = ref("bottom");
const align = ref("left");

function karachiNow() {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: "Asia/Karachi",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(new Date());
	const get = (t) => parts.find((p) => p.type === t)?.value || "";
	return parseIso(`${get("year")}-${get("month")}-${get("day")}`) || new Date();
}

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
const todayIso = computed(() => iso(karachiNow()));

const display = computed(() => {
	if (!selected.value) return "Select date / تاریخ منتخب کریں";
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
	const startPad = first.getDay();
	const daysInMonth = new Date(year, month + 1, 0).getDate();
	const out = [];
	for (let i = 0; i < startPad; i++) out.push(null);
	for (let day = 1; day <= daysInMonth; day++) out.push(new Date(year, month, day));
	while (out.length % 7) out.push(null);
	return out;
});

function place() {
	if (!root.value) return;
	const r = root.value.getBoundingClientRect();
	const h = pop.value?.offsetHeight || 320;
	const w = pop.value?.offsetWidth || 288;
	const gap = 8;
	const dock = 96;
	const below = window.innerHeight - dock - r.bottom - gap;
	const above = r.top - gap;
	placement.value = below >= Math.min(h, 280) || below >= above ? "bottom" : "top";
	align.value = r.left + w > window.innerWidth - 12 ? "right" : "left";
}

async function toggle() {
	open.value = !open.value;
	if (open.value) {
		await nextTick();
		place();
	}
}

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
	const d = karachiNow();
	model.value = iso(d);
	view.value = d;
	open.value = false;
}

function onDoc(e) {
	const t = e.target;
	if (root.value && root.value.contains(t)) return;
	open.value = false;
}

watch(
	() => model.value,
	(val) => {
		if (val) view.value = parseIso(val) || karachiNow();
	},
	{ immediate: true }
);

watch(open, (v) => {
	if (v) {
		document.addEventListener("mousedown", onDoc);
		window.addEventListener("resize", place);
		window.addEventListener("scroll", place, true);
	} else {
		document.removeEventListener("mousedown", onDoc);
		window.removeEventListener("resize", place);
		window.removeEventListener("scroll", place, true);
	}
});
onBeforeUnmount(() => {
	document.removeEventListener("mousedown", onDoc);
	window.removeEventListener("resize", place);
	window.removeEventListener("scroll", place, true);
});
</script>

<template>
	<div ref="root" class="dp" :class="{ open }">
		<button type="button" class="trigger" :class="{ empty: !model }" @click="toggle">
			<span class="ico">📅</span>
			<span>{{ display }}</span>
			<span class="caret">▾</span>
		</button>
		<div v-if="open" ref="pop" class="pop" :class="[placement, align]">
			<div class="head">
				<button type="button" class="nav" @click="shiftMonth(-1)">‹</button>
				<strong>{{ monthLabel }}</strong>
				<button type="button" class="nav" @click="shiftMonth(1)">›</button>
			</div>
			<div class="cal">
				<div v-for="w in ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']" :key="w" class="dow">{{ w }}</div>
				<button
					v-for="(d, i) in cells"
					:key="i"
					type="button"
					class="day"
					:disabled="!d"
					:class="{
						empty: !d,
						today: d && iso(d) === todayIso,
						sel: d && selected && iso(d) === iso(selected),
					}"
					@click="d && pick(d)"
				>
					{{ d ? d.getDate() : "" }}
				</button>
			</div>
			<div class="foot">
				<button type="button" @click="pickToday">Today / آج</button>
			</div>
		</div>
	</div>
</template>

<style scoped>
.dp {
	position: relative;
	z-index: 1;
}
.dp.open {
	z-index: 80;
}
.trigger {
	width: 100%;
	display: flex;
	align-items: center;
	gap: 8px;
	border: 1px solid #e4e4e7;
	border-radius: 12px;
	padding: 10px 14px;
	background: #fcfcfd;
	text-align: left;
	font: inherit;
	font-size: 13.5px;
}
.trigger:hover,
.trigger:focus {
	border-color: #0f7a3c;
	background: #fff;
	box-shadow: 0 0 0 3px rgba(15, 122, 60, 0.1);
}
.trigger.empty {
	color: #a1a1aa;
}
.ico {
	font-size: 14px;
}
.caret {
	margin-left: auto;
	color: #a1a1aa;
}
.pop {
	position: absolute;
	top: calc(100% + 8px);
	left: 0;
	width: 288px;
	max-width: min(288px, calc(100vw - 24px));
	z-index: 80;
	background: #fff;
	border: 1px solid #e4e4e7;
	border-radius: 16px;
	padding: 12px;
	box-shadow: 0 18px 50px rgba(24, 24, 27, 0.18);
}
.pop.top {
	top: auto;
	bottom: calc(100% + 8px);
}
.pop.right {
	left: auto;
	right: 0;
}
.head {
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-bottom: 8px;
	gap: 8px;
}
.nav {
	width: 28px;
	height: 28px;
	border: 1px solid #e4e4e7;
	border-radius: 8px;
	background: #fff;
	font-size: 16px;
	line-height: 1;
	flex-shrink: 0;
	cursor: pointer;
}
.head strong {
	font-size: 13px;
	font-weight: 700;
	text-align: center;
	flex: 1;
}
.cal {
	display: grid;
	grid-template-columns: repeat(7, 32px);
	grid-auto-rows: 32px;
	justify-content: center;
	gap: 2px;
}
.dow,
.day {
	width: 32px;
	height: 32px;
	margin: 0;
	padding: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	box-sizing: border-box;
}
.dow {
	color: #a1a1aa;
	font-size: 10px;
	font-weight: 700;
	letter-spacing: 0;
}
.day {
	border: 0;
	background: transparent;
	border-radius: 8px;
	font: inherit;
	font-weight: 600;
	font-size: 12.5px;
	line-height: 1;
	cursor: pointer;
}
.day:hover:not(:disabled) {
	background: rgba(15, 122, 60, 0.08);
}
.day.today:not(.sel) {
	box-shadow: inset 0 0 0 1.5px #0f7a3c;
	color: #0f7a3c;
}
.day.sel {
	background: #0f7a3c;
	color: #fff;
}
.day.empty {
	visibility: hidden;
	pointer-events: none;
}
.foot {
	display: flex;
	justify-content: flex-end;
	margin-top: 8px;
}
.foot button {
	border: 0;
	background: none;
	color: #0f7a3c;
	font-weight: 700;
	font-size: 12px;
	cursor: pointer;
	padding: 0;
}
</style>
