<script setup>
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { TIME_SLOTS } from "../data/mock";

const start = defineModel({ type: String, default: "10:00" });
const end = defineModel("end", { type: String, default: "12:00" });

const open = ref(false);
const root = ref(null);
const pop = ref(null);
const pos = ref({ top: 0, left: 0, width: 340 });

const hours = Array.from({ length: 16 }, (_, i) => i + 7);
const minutes = [0, 15, 30, 45];

function parse(val, fallback = "10:00") {
	const [h, m] = String(val || fallback).split(":");
	return { h: Number(h) || Number(fallback.split(":")[0]), m: Number(m) || 0 };
}

function pad(n) {
	return String(n).padStart(2, "0");
}

function fmt(h, m) {
	return `${pad(h)}:${pad(m)}`;
}

function toMinutes(val, fallback = "10:00") {
	const { h, m } = parse(val, fallback);
	return h * 60 + m;
}

function fromMinutes(total) {
	const clamped = Math.min(Math.max(total, 7 * 60), 22 * 60 + 45);
	return fmt(Math.floor(clamped / 60), clamped % 60);
}

function pretty(val) {
	const { h, m } = parse(val);
	const ampm = h >= 12 ? "PM" : "AM";
	return `${h % 12 || 12}:${pad(m)} ${ampm}`;
}

function hourLabel(h) {
	const ampm = h >= 12 ? "PM" : "AM";
	return `${h % 12 || 12} ${ampm}`;
}

const startParts = computed(() => parse(start.value, "10:00"));
const endParts = computed(() => parse(end.value, "12:00"));
const display = computed(() => `${pretty(start.value)} – ${pretty(end.value)}`);

function matchingSlot() {
	return TIME_SLOTS.find((s) => s.start === start.value && s.end === end.value);
}

function place() {
	if (!root.value) return;
	const r = root.value.getBoundingClientRect();
	const width = 340;
	const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
	let top = r.bottom + 6;
	if (top + 360 > window.innerHeight && r.top > 240) {
		top = Math.max(8, r.top - 360);
	}
	pos.value = { top, left, width };
}

function toggle() {
	open.value = !open.value;
	if (open.value) place();
}

function ensureEndAfterStart(nextStart, nextEnd) {
	const s = toMinutes(nextStart, "10:00");
	let e = toMinutes(nextEnd, "12:00");
	if (e <= s) e = s + 120;
	return { start: fromMinutes(s), end: fromMinutes(e) };
}

function setStart(h, m) {
	const next = ensureEndAfterStart(fmt(h, m), end.value);
	start.value = next.start;
	end.value = next.end;
}

function setEnd(h, m) {
	const next = ensureEndAfterStart(start.value, fmt(h, m));
	start.value = next.start;
	end.value = next.end;
}

function pickSlot(slot) {
	start.value = slot.start;
	end.value = slot.end;
	open.value = false;
}

function onDoc(e) {
	const t = e.target;
	if (root.value && root.value.contains(t)) return;
	if (pop.value && pop.value.contains(t)) return;
	open.value = false;
}

watch(open, (v) => {
	if (v) {
		document.addEventListener("mousedown", onDoc);
		window.addEventListener("resize", place);
	} else {
		document.removeEventListener("mousedown", onDoc);
		window.removeEventListener("resize", place);
	}
});
onBeforeUnmount(() => {
	document.removeEventListener("mousedown", onDoc);
	window.removeEventListener("resize", place);
});
</script>

<template>
	<div ref="root" class="tp">
		<button type="button" class="trigger" @click="toggle">
			<span class="ico">🕒</span>
			<span>{{ display }}</span>
			<span class="caret">▾</span>
		</button>
		<Teleport to="body">
			<div
				v-if="open"
				ref="pop"
				class="pop"
				:style="{ top: pos.top + 'px', left: pos.left + 'px', width: pos.width + 'px' }"
			>
				<p class="label">Training slots</p>
				<div class="slots">
					<button
						v-for="s in TIME_SLOTS"
						:key="s.id"
						type="button"
						:class="{ on: matchingSlot()?.id === s.id }"
						@click="pickSlot(s)"
					>
						{{ s.label }}
					</button>
				</div>
				<p class="label">Custom time</p>
				<div class="custom">
					<div class="side">
						<span>Start</span>
						<div class="sels">
							<select :value="startParts.h" @change="setStart(Number($event.target.value), startParts.m)">
								<option v-for="h in hours" :key="'sh' + h" :value="h">{{ hourLabel(h) }}</option>
							</select>
							<select :value="startParts.m" @change="setStart(startParts.h, Number($event.target.value))">
								<option v-for="m in minutes" :key="'sm' + m" :value="m">{{ pad(m) }}</option>
							</select>
						</div>
					</div>
					<div class="side">
						<span>End</span>
						<div class="sels">
							<select :value="endParts.h" @change="setEnd(Number($event.target.value), endParts.m)">
								<option v-for="h in hours" :key="'eh' + h" :value="h">{{ hourLabel(h) }}</option>
							</select>
							<select :value="endParts.m" @change="setEnd(endParts.h, Number($event.target.value))">
								<option v-for="m in minutes" :key="'em' + m" :value="m">{{ pad(m) }}</option>
							</select>
						</div>
					</div>
				</div>
				<button type="button" class="done" @click="open = false">Done · {{ display }}</button>
			</div>
		</Teleport>
	</div>
</template>

<style scoped>
.tp {
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
	background: #fff;
	text-align: left;
	font: inherit;
	font-weight: 600;
}
.caret {
	margin-left: auto;
	color: #9ca3af;
}
.pop {
	position: fixed;
	z-index: 320;
	background: #fff;
	border: 1px solid #e5e7eb;
	border-radius: 14px;
	padding: 12px;
	box-shadow: 0 18px 50px rgba(15, 23, 42, 0.18);
}
.label {
	margin: 0 0 8px;
	font-size: 11px;
	font-weight: 700;
	letter-spacing: 0.08em;
	text-transform: uppercase;
	color: #6b7280;
}
.slots {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	margin-bottom: 12px;
}
.slots button {
	border: 1px solid #e5e7eb;
	background: #fff;
	border-radius: 999px;
	padding: 6px 10px;
	font-size: 12px;
	font-weight: 600;
	color: #374151;
	cursor: pointer;
}
.slots button.on {
	background: #4f46e5;
	color: #fff;
	border-color: #4f46e5;
}
.custom {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 10px;
}
.side span {
	display: block;
	margin-bottom: 4px;
	font-size: 11px;
	font-weight: 700;
	color: #6b7280;
}
.sels {
	display: grid;
	grid-template-columns: 1.3fr 0.7fr;
	gap: 6px;
}
.sels select {
	width: 100%;
	border: 1px solid #e5e7eb;
	border-radius: 8px;
	padding: 8px;
	background: #fff;
	font: inherit;
	font-weight: 600;
}
.done {
	width: 100%;
	margin-top: 12px;
	border: 0;
	background: #111827;
	color: #fff;
	border-radius: 10px;
	padding: 10px;
	font-weight: 700;
}
</style>
