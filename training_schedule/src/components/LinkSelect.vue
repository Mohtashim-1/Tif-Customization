<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { apiGet, METHOD } from "../lib/api";

const model = defineModel({ type: String, default: "" });
const props = defineProps({
	options: { type: Array, default: () => [] },
	placeholder: { type: String, default: "Search or create" },
	doctypeLabel: { type: String, default: "record" },
	canCreate: { type: Boolean, default: true },
	creating: { type: Boolean, default: false },
	searchKey: { type: String, default: "" },
});
const emit = defineEmits(["create", "select"]);

const open = ref(false);
const query = ref(model.value || "");
const highlight = ref(0);
const root = ref(null);
const input = ref(null);
const pop = ref(null);
const pos = ref({ top: 0, left: 0, width: 320 });
const remoteItems = ref([]);
const searching = ref(false);
let searchTimer = 0;

function optionItems(list) {
	return (list || []).map((item) => {
		if (item && typeof item === "object") {
			const value = String(item.value ?? item.name ?? "");
			return {
				...item,
				value,
				label: String(item.label || item.school_name || item.customer_name || value),
			};
		}
		const value = String(item ?? "");
		return { value, label: value };
	});
}

const items = computed(() => {
	const local = optionItems(props.options);
	if (!props.searchKey) return local;
	const remote = optionItems(remoteItems.value);
	const seen = new Set();
	const out = [];
	for (const item of [...remote, ...local]) {
		if (!item.value || seen.has(item.value)) continue;
		seen.add(item.value);
		out.push(item);
	}
	return out;
});

const selectedItem = computed(() => items.value.find((i) => i.value === model.value) || null);

const displayValue = computed(() => selectedItem.value?.label || model.value || "");

function labelFor(val) {
	return items.value.find((i) => i.value === val)?.label || val || "";
}

async function fetchRemote(txt) {
	if (!props.searchKey) return;
	searching.value = true;
	try {
		const rows = await apiGet(`${METHOD}.search_link_options`, {
			key: props.searchKey,
			txt: txt || "",
			limit: 40,
		});
		remoteItems.value = Array.isArray(rows) ? rows : [];
	} catch {
		remoteItems.value = [];
	} finally {
		searching.value = false;
	}
}

function scheduleSearch(txt) {
	if (!props.searchKey) return;
	window.clearTimeout(searchTimer);
	searchTimer = window.setTimeout(() => fetchRemote(txt), 200);
}

watch(
	() => model.value,
	(val) => {
		const label = labelFor(val);
		if (open.value && val) {
			query.value = label;
			open.value = false;
			return;
		}
		if (!open.value) query.value = label;
	}
);

watch(
	() => props.options,
	() => {
		if (!open.value) query.value = labelFor(model.value);
	}
);

const filtered = computed(() => {
	const q = (query.value || "").trim().toLowerCase();
	const list = items.value;
	if (props.searchKey) return list.slice(0, 40);
	if (!q) return list.slice(0, 120);
	return list.filter((i) => i.label.toLowerCase().includes(q) || i.value.toLowerCase().includes(q)).slice(0, 120);
});

const exactMatch = computed(() => {
	const q = (query.value || "").trim().toLowerCase();
	if (!q) return null;
	return items.value.find((i) => i.label.toLowerCase() === q || i.value.toLowerCase() === q) || null;
});

const showCreate = computed(
	() => props.canCreate && (query.value || "").trim() && !exactMatch.value
);

const emptyText = computed(() => {
	if (searching.value) return "Searching…";
	if ((query.value || "").trim()) return "No matching records";
	if (props.searchKey) return `Type to search ${props.doctypeLabel}`;
	return `No ${props.doctypeLabel} yet`;
});

function place() {
	if (!root.value) return;
	const r = root.value.getBoundingClientRect();
	const width = Math.max(r.width, 280);
	const left = Math.min(r.left, Math.max(8, window.innerWidth - width - 8));
	let top = r.bottom + 6;
	const estimated = 320;
	if (top + estimated > window.innerHeight && r.top > estimated) {
		top = Math.max(8, r.top - estimated - 6);
	}
	pos.value = { top, left, width };
}

function openList() {
	open.value = true;
	query.value = displayValue.value || query.value || "";
	highlight.value = 0;
	place();
	nextTick(() => input.value?.select?.());
	if (props.searchKey) fetchRemote(query.value);
}

function closeList() {
	open.value = false;
	query.value = displayValue.value;
	highlight.value = 0;
}

function selectValue(item) {
	const next = typeof item === "object" && item ? item : { value: String(item || ""), label: String(item || "") };
	model.value = next.value;
	query.value = next.label || next.value;
	open.value = false;
	emit("select", next);
}

function clearValue(event) {
	event.preventDefault();
	event.stopPropagation();
	model.value = "";
	query.value = "";
	open.value = true;
	nextTick(() => input.value?.focus());
	if (props.searchKey) fetchRemote("");
}

function createValue() {
	const name = (query.value || "").trim();
	if (!name || !props.canCreate || props.creating) return;
	emit("create", name);
}

function onInput() {
	if (!open.value) open.value = true;
	place();
	highlight.value = 0;
	scheduleSearch(query.value);
}

function onKey(event) {
	if (event.key === "Escape") {
		closeList();
		return;
	}
	if (event.key === "ArrowDown") {
		event.preventDefault();
		if (!open.value) openList();
		const max = filtered.value.length + (showCreate.value ? 1 : 0) - 1;
		highlight.value = Math.min(highlight.value + 1, Math.max(0, max));
		return;
	}
	if (event.key === "ArrowUp") {
		event.preventDefault();
		highlight.value = Math.max(highlight.value - 1, 0);
		return;
	}
	if (event.key === "Enter") {
		event.preventDefault();
		if (highlight.value < filtered.value.length) {
			const item = filtered.value[highlight.value];
			if (item) selectValue(item);
		} else if (showCreate.value) {
			createValue();
		} else if (exactMatch.value) {
			selectValue(exactMatch.value);
		}
	}
}

function onDoc(event) {
	const t = event.target;
	if (root.value && root.value.contains(t)) return;
	if (pop.value && pop.value.contains(t)) return;
	closeList();
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
	window.clearTimeout(searchTimer);
	document.removeEventListener("mousedown", onDoc);
	window.removeEventListener("resize", place);
});
</script>

<template>
	<div ref="root" class="link-select">
		<div class="control" :class="{ open, filled: !!model }" @click="openList">
			<input
				ref="input"
				v-model="query"
				:placeholder="placeholder"
				autocomplete="off"
				spellcheck="false"
				@focus="openList"
				@input="onInput"
				@keydown="onKey"
			/>
			<button v-if="model" type="button" class="clear" title="Clear" @click="clearValue">✕</button>
			<span class="caret">▾</span>
		</div>
		<Teleport to="body">
			<div
				v-if="open"
				ref="pop"
				class="pop"
				:style="{ top: pos.top + 'px', left: pos.left + 'px', width: pos.width + 'px' }"
			>
			<div v-if="!filtered.length && !showCreate" class="empty">
				{{ emptyText }}
			</div>
			<button
				v-for="(item, idx) in filtered"
				:key="item.value"
				type="button"
				class="opt"
				:class="{ on: idx === highlight }"
				@mouseenter="highlight = idx"
				@click="selectValue(item)"
			>
				{{ item.label }}
			</button>
			<div v-if="canCreate" class="create-wrap">
				<button
					v-if="showCreate"
					type="button"
					class="create"
					:class="{ on: highlight === filtered.length }"
					:disabled="creating"
					@mouseenter="highlight = filtered.length"
					@click="createValue"
				>
					<span class="plus">+</span>
					{{ creating ? "Creating…" : `Create “${query.trim()}”` }}
				</button>
				<button
					v-else
					type="button"
					class="create muted"
					:disabled="creating || !(query || '').trim()"
					@click="createValue"
				>
					<span class="plus">+</span>
					Create New {{ doctypeLabel }}
				</button>
			</div>
			</div>
		</Teleport>
	</div>
</template>

<style scoped>
.link-select {
	position: relative;
}
.control {
	display: flex;
	align-items: center;
	gap: 4px;
	border: 1px solid #e5e7eb;
	border-radius: 10px;
	padding: 0 8px 0 0;
	background: #fff;
}
.control.open,
.control:focus-within {
	border-color: #6366f1;
	box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
	background: #fff;
}
.control input {
	flex: 1;
	border: 0;
	background: transparent;
	padding: 10px 12px;
	font: inherit;
	font-weight: 400;
	min-width: 0;
	outline: none;
}
.clear,
.caret {
	border: 0;
	background: none;
	color: #9ca3af;
	width: 22px;
	height: 22px;
	cursor: pointer;
	flex: none;
}
.pop {
	position: fixed;
	z-index: 320;
	background: #fff;
	border: 1px solid #e5e7eb;
	border-radius: 12px;
	box-shadow: 0 18px 50px rgba(15, 23, 42, 0.18);
	max-height: 280px;
	overflow: auto;
	padding: 6px;
}
.opt,
.create {
	display: block;
	width: 100%;
	text-align: left;
	border: 0;
	background: transparent;
	border-radius: 8px;
	padding: 8px 10px;
	font: inherit;
	font-size: 13px;
	cursor: pointer;
}
.opt.on,
.create.on {
	background: #eef2ff;
	color: #4338ca;
}
.empty {
	padding: 12px 10px;
	color: #6b7280;
	font-size: 13px;
	font-weight: 400;
}
.create-wrap {
	border-top: 1px solid #f3f4f6;
	margin-top: 4px;
	padding-top: 4px;
}
.create {
	display: flex;
	align-items: center;
	gap: 8px;
	color: #4f46e5;
	font-weight: 700;
}
.create.muted {
	color: #6b7280;
	font-weight: 600;
}
.create:disabled {
	opacity: 0.6;
	cursor: wait;
}
.plus {
	display: inline-grid;
	place-items: center;
	width: 18px;
	height: 18px;
	border-radius: 999px;
	background: #eef2ff;
	color: #4f46e5;
	font-weight: 800;
}
</style>
