<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import FieldLabel from "./FieldLabel.vue";

const props = defineProps({
	labelEn: String,
	labelUr: String,
	mode: { type: String, default: "both" },
	placeholder: { type: String, default: "Select" },
	emptyText: { type: String, default: "No matching results" },
	allowCustom: { type: Boolean, default: false },
	allowCreate: { type: Boolean, default: false },
	createLabel: { type: String, default: "Create School" },
	required: { type: Boolean, default: false },
	options: { type: Array, default: () => [] },
	search: Function,
});
const model = defineModel({ type: String, default: "" });
const label = defineModel("label", { type: String, default: "" });

const open = ref(false);
const query = ref("");
const extra = ref([]);
const loading = ref(false);
const root = ref(null);
const placement = ref("bottom");
let timer = null;
let searchSeq = 0;

const display = computed(() => label.value || model.value || "");

function asItem(opt) {
	if (opt && typeof opt === "object") {
		return {
			value: String(opt.value ?? opt.name ?? ""),
			label: String(opt.label || opt.value || opt.name || ""),
			description: String(opt.description || opt.city || ""),
			city: opt.city || "",
			school_type: opt.school_type || "",
		};
	}
	return { value: String(opt || ""), label: String(opt || ""), description: "" };
}

const allLocal = computed(() => (props.options || []).map(asItem).filter((o) => o.value));

function matchesQuery(o, q) {
	const tokens = q
		.trim()
		.toLowerCase()
		.split(/\s+/)
		.filter(Boolean);
	if (!tokens.length) return true;
	const hay = `${o.label} ${o.value} ${o.description}`.toLowerCase();
	return tokens.every((t) => hay.includes(t));
}

const items = computed(() => {
	const q = query.value;
	const seen = new Set();
	const out = [];
	for (const o of [...extra.value, ...allLocal.value]) {
		if (!o.value || seen.has(o.value) || !matchesQuery(o, q)) continue;
		seen.add(o.value);
		out.push(o);
	}
	return out.slice(0, 300);
});

function place() {
	placement.value = "bottom";
}

async function runSearch(txt) {
	if (!props.search) return;
	const seq = ++searchSeq;
	loading.value = true;
	try {
		const rows = ((await props.search(txt || "")) || []).map(asItem).filter((o) => o.value);
		if (seq === searchSeq) extra.value = rows;
	} catch {
		if (seq === searchSeq) extra.value = extra.value.length ? extra.value : [];
	} finally {
		if (seq === searchSeq) loading.value = false;
	}
}

async function toggle() {
	open.value = !open.value;
	if (!open.value) return;
	query.value = "";
	extra.value = allLocal.value.slice(0, 300);
	await nextTick();
	place();
	await runSearch("");
}

async function onInput(e) {
	query.value = e.target.value;
	clearTimeout(timer);
	if (!props.search) return;
	timer = setTimeout(() => runSearch(query.value.trim()), 200);
}

function pick(row) {
	model.value = row.value;
	label.value = row.label || row.value;
	query.value = "";
	open.value = false;
}

function useCustom() {
	const q = query.value.trim();
	if (!props.allowCustom || !q) return;
	pick({ value: q, label: q, description: "" });
}

const emit = defineEmits(["create"]);

function hasExactMatch() {
	const q = query.value.trim().toLowerCase();
	if (!q) return false;
	return items.value.some((o) => o.label.toLowerCase() === q || o.value.toLowerCase() === q);
}

function emitCreate() {
	const q = query.value.trim();
	if (!q) return;
	emit("create", q);
	open.value = false;
}

function onFilterKey(e) {
	if (e.key === "Enter" && props.allowCustom && query.value.trim()) {
		e.preventDefault();
		if (items.value[0] && matchesQuery(items.value[0], query.value)) {
			pick(items.value[0]);
			return;
		}
		useCustom();
	}
}

function onDoc(e) {
	if (root.value && root.value.contains(e.target)) return;
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
	clearTimeout(timer);
	document.removeEventListener("mousedown", onDoc);
	window.removeEventListener("resize", place);
	window.removeEventListener("scroll", place, true);
});
</script>

<template>
	<div ref="root" class="field" :class="{ open }">
		<FieldLabel :en="labelEn" :ur="labelUr" :mode="mode" :required="required" />
		<button type="button" class="trigger" :class="{ empty: !model, open }" @click="toggle">
			<span>{{ display || placeholder }}</span>
			<span class="caret">▾</span>
		</button>
		<div v-if="open" class="menu" :class="placement">
			<input class="filter" :value="query" placeholder="Type to filter…" @input="onInput" @keydown="onFilterKey" />
			<div class="list">
				<button v-if="loading && !items.length" type="button" class="item muted" disabled>Loading…</button>
				<button v-else-if="!items.length && !allowCustom && !allowCreate" type="button" class="item muted" disabled>{{ emptyText }}</button>
				<button
					v-if="allowCustom && query.trim() && !hasExactMatch()"
					type="button"
					class="item"
					@click="useCustom"
				>
					<div class="title">Use “{{ query.trim() }}”</div>
					<div class="desc">Save as typed name</div>
				</button>
				<button v-else-if="!items.length && allowCustom && !query.trim()" type="button" class="item muted" disabled>{{ emptyText }}</button>
				<button
					v-for="row in items"
					:key="row.value"
					type="button"
					class="item"
					:class="{ sel: row.value === model }"
					@click="pick(row)"
				>
					<div class="title">{{ row.label }}</div>
					<div v-if="row.description" class="desc">{{ row.description }}</div>
				</button>
				<button
					v-if="allowCreate && query.trim().length >= 2 && !loading && !hasExactMatch()"
					type="button"
					class="item create"
					@click="emitCreate"
				>
					<div class="title">+ {{ createLabel }} “{{ query.trim() }}”</div>
					<div class="desc">Not in School Database — fill School Opening form</div>
				</button>
			</div>
		</div>
	</div>
</template>

<style scoped>
.field {
	position: relative;
	z-index: 1;
}
.field.open {
	z-index: 90;
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
.trigger.empty {
	color: #a1a1aa;
}
.trigger:hover,
.trigger.open {
	border-color: #0f7a3c;
	background: #fff;
	box-shadow: 0 0 0 3px rgba(15, 122, 60, 0.1);
}
.caret {
	margin-left: auto;
	color: #a1a1aa;
}
.menu {
	position: absolute;
	top: calc(100% + 6px);
	left: 0;
	right: 0;
	z-index: 90;
	background: #fff;
	border: 1px solid #e4e4e7;
	border-radius: 12px;
	box-shadow: 0 16px 40px rgba(24, 24, 27, 0.16);
	padding: 8px;
}
.menu.top {
	top: auto;
	bottom: calc(100% + 6px);
}
.filter {
	width: 100%;
	border: 1px solid #e4e4e7;
	border-radius: 8px;
	padding: 8px 10px;
	font: inherit;
	font-size: 13px;
	margin-bottom: 6px;
	outline: none;
}
.filter:focus {
	border-color: #0f7a3c;
}
.list {
	max-height: 260px;
	overflow: auto;
}
.item {
	display: block;
	width: 100%;
	text-align: left;
	border: 0;
	background: transparent;
	border-radius: 8px;
	padding: 8px 10px;
	font: inherit;
	cursor: pointer;
}
.item:hover {
	background: rgba(15, 122, 60, 0.08);
}
.item.sel {
	background: #0f7a3c;
	color: #fff;
}
.item.sel .desc {
	color: rgba(255, 255, 255, 0.8);
}
.item.muted {
	color: #a1a1aa;
	cursor: default;
}
.item.create {
	margin-top: 4px;
	border: 1px dashed #0f7a3c;
	background: rgba(15, 122, 60, 0.06);
}
.item.create .desc {
	color: #0f7a3c;
}
.title {
	font-size: 13px;
	font-weight: 600;
}
.desc {
	font-size: 11px;
	color: #71717a;
	margin-top: 2px;
}
</style>
