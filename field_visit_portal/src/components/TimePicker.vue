<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";

const model = defineModel({ type: String, default: "10:00" });

const open = ref(false);
const root = ref(null);
const pop = ref(null);
const placement = ref("bottom");
const align = ref("left");

const hours12 = Array.from({ length: 12 }, (_, i) => i + 1);
const minutes = Array.from({ length: 12 }, (_, i) => i * 5);

function pad(n) {
	return String(n).padStart(2, "0");
}

function parse(val) {
	const [hRaw, mRaw] = String(val || "10:00").split(":");
	let h = Number(hRaw);
	let m = Number(mRaw);
	if (Number.isNaN(h)) h = 10;
	if (Number.isNaN(m)) m = 0;
	m = Math.min(55, Math.round(m / 5) * 5);
	const ampm = h >= 12 ? "PM" : "AM";
	const h12 = h % 12 || 12;
	return { h, m, ampm, h12 };
}

function fmt(h12, m, ampm) {
	let h = Number(h12);
	if (ampm === "AM") h = h === 12 ? 0 : h;
	else h = h === 12 ? 12 : h + 12;
	return `${pad(h)}:${pad(m)}`;
}

const parts = computed(() => parse(model.value));

const display = computed(() => {
	const { h12, m, ampm } = parts.value;
	return `${h12}:${pad(m)} ${ampm}`;
});

function setTime(h12, m, ampm) {
	model.value = fmt(h12, m, ampm);
}

function place() {
	if (!root.value) return;
	const r = root.value.getBoundingClientRect();
	const h = pop.value?.offsetHeight || 160;
	const w = pop.value?.offsetWidth || Math.max(r.width, 240);
	const gap = 8;
	const dock = 96;
	const below = window.innerHeight - dock - r.bottom - gap;
	const above = r.top - gap;
	placement.value = below >= h || below >= above ? "bottom" : "top";
	align.value = r.left + w > window.innerWidth - 12 ? "right" : "left";
}

async function toggle() {
	open.value = !open.value;
	if (open.value) {
		await nextTick();
		place();
	}
}

function onDoc(e) {
	const t = e.target;
	if (root.value && root.value.contains(t)) return;
	open.value = false;
}

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
	<div ref="root" class="tp" :class="{ open }">
		<button type="button" class="trigger" @click="toggle">
			<span class="ico">🕒</span>
			<span>{{ display }}</span>
			<span class="caret">▾</span>
		</button>
		<div v-if="open" ref="pop" class="pop" :class="[placement, align]">
			<div class="label">Select time / وقت منتخب کریں</div>
			<div class="sels">
				<select :value="parts.h12" @change="setTime(Number($event.target.value), parts.m, parts.ampm)">
					<option v-for="h in hours12" :key="'h' + h" :value="h">{{ h }}</option>
				</select>
				<select :value="parts.m" @change="setTime(parts.h12, Number($event.target.value), parts.ampm)">
					<option v-for="m in minutes" :key="'m' + m" :value="m">{{ pad(m) }}</option>
				</select>
				<select :value="parts.ampm" @change="setTime(parts.h12, parts.m, $event.target.value)">
					<option value="AM">AM</option>
					<option value="PM">PM</option>
				</select>
			</div>
			<button type="button" class="done" @click="open = false">Done · {{ display }}</button>
		</div>
	</div>
</template>

<style scoped>
.tp {
	position: relative;
	z-index: 1;
}
.tp.open {
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
	font-weight: 600;
}
.trigger:hover,
.trigger:focus {
	border-color: #0f7a3c;
	background: #fff;
	box-shadow: 0 0 0 3px rgba(15, 122, 60, 0.1);
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
	width: 100%;
	min-width: 240px;
	z-index: 80;
	background: #fff;
	border: 1px solid #e4e4e7;
	border-radius: 16px;
	padding: 14px;
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
.label {
	font-size: 11px;
	font-weight: 700;
	letter-spacing: 0.04em;
	color: #71717a;
	margin-bottom: 10px;
}
.sels {
	display: grid;
	grid-template-columns: 1fr 1fr 1fr;
	gap: 8px;
}
.sels select {
	width: 100%;
	border: 1px solid #e4e4e7;
	border-radius: 10px;
	padding: 10px 8px;
	background: #fcfcfd;
	font: inherit;
	font-weight: 600;
	font-size: 14px;
	text-align: center;
}
.sels select:focus {
	border-color: #0f7a3c;
	outline: none;
	box-shadow: 0 0 0 3px rgba(15, 122, 60, 0.1);
}
.done {
	width: 100%;
	margin-top: 12px;
	border: 0;
	background: #0f7a3c;
	color: #fff;
	border-radius: 10px;
	padding: 10px;
	font-weight: 700;
	cursor: pointer;
}
</style>
