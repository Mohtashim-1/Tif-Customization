<script setup>
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { TIME_SLOTS } from "../data/mock";

const model = defineModel({ type: String, default: "10:00" });
const open = ref(false);
const root = ref(null);
const pos = ref({ top: 0, left: 0 });

function place() {
	if (!root.value) return;
	const r = root.value.getBoundingClientRect();
	pos.value = { top: r.bottom + 6, left: Math.min(r.left, window.innerWidth - 300) };
}

function toggle() {
	open.value = !open.value;
	if (open.value) place();
}

const hours = Array.from({ length: 15 }, (_, i) => i + 7);
const minutes = [0, 15, 30, 45];

function parse(val) {
	const [h, m] = String(val || "10:00").split(":");
	return { h: Number(h) || 10, m: Number(m) || 0 };
}

const parts = computed(() => parse(model.value));

const display = computed(() => {
	const { h, m } = parts.value;
	const ampm = h >= 12 ? "PM" : "AM";
	const hr = h % 12 || 12;
	return `${hr}:${String(m).padStart(2, "0")} ${ampm}`;
});

function setTime(h, m) {
	model.value = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function pickSlot(start) {
	model.value = start;
	open.value = false;
}

function onDoc(e) {
	const t = e.target;
	if (root.value && !root.value.contains(t)) open.value = false;
}

watch(open, (v) => {
	if (v) document.addEventListener("mousedown", onDoc);
	else document.removeEventListener("mousedown", onDoc);
});
onBeforeUnmount(() => document.removeEventListener("mousedown", onDoc));
</script>

<template>
	<div ref="root" class="tp">
		<button type="button" class="trigger" @click="toggle">
			<span class="ico">🕒</span>
			<span>{{ display }}</span>
		</button>
		<div v-if="open" class="pop" :style="{ top: pos.top + 'px', left: pos.left + 'px' }">
			<p class="label">Training slots</p>
			<div class="slots">
				<button
					v-for="s in TIME_SLOTS"
					:key="s.id"
					type="button"
					:class="{ on: model === s.start }"
					@click="pickSlot(s.start)"
				>
					{{ s.label }}
				</button>
			</div>
			<p class="label">Custom time</p>
			<div class="wheels">
				<div class="col">
					<button
						v-for="h in hours"
						:key="'h' + h"
						type="button"
						:class="{ on: parts.h === h }"
						@click="setTime(h, parts.m)"
					>
						{{ String(h).padStart(2, "0") }}
					</button>
				</div>
				<div class="col">
					<button
						v-for="m in minutes"
						:key="'m' + m"
						type="button"
						:class="{ on: parts.m === m }"
						@click="setTime(parts.h, m)"
					>
						{{ String(m).padStart(2, "0") }}
					</button>
				</div>
			</div>
			<button type="button" class="done" @click="open = false">Done · {{ display }}</button>
		</div>
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
	background: #f9fafb;
	text-align: left;
	font: inherit;
}
.pop {
	position: fixed;
	z-index: 120;
	width: 280px;
	background: #fff;
	border: 1px solid #e5e7eb;
	border-radius: 16px;
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
	flex-direction: column;
	gap: 4px;
	margin-bottom: 12px;
}
.slots button,
.col button {
	border: 1px solid #e5e7eb;
	background: #fff;
	border-radius: 10px;
	padding: 8px 10px;
	text-align: left;
	font: inherit;
}
.slots button.on,
.col button.on {
	background: #4f46e5;
	color: #fff;
	border-color: #4f46e5;
}
.wheels {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 8px;
	max-height: 180px;
}
.col {
	overflow: auto;
	display: flex;
	flex-direction: column;
	gap: 4px;
	max-height: 180px;
}
.done {
	width: 100%;
	margin-top: 10px;
	border: 0;
	background: #111827;
	color: #fff;
	border-radius: 10px;
	padding: 10px;
	font-weight: 700;
}
</style>
