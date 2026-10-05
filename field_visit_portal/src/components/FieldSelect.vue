<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import FieldLabel from "./FieldLabel.vue";

const props = defineProps({
	labelEn: String,
	labelUr: String,
	mode: { type: String, default: "both" },
	options: { type: Array, default: () => [] },
	placeholderEn: { type: String, default: "Select" },
	placeholderUr: { type: String, default: "منتخب کریں" },
	required: { type: Boolean, default: false },
	searchable: { type: Boolean, default: false },
});
const model = defineModel({ type: [String, Number], default: "" });

const open = ref(false);
const root = ref(null);
const searchInput = ref(null);
const query = ref("");
const placement = ref("bottom");

function optionValue(opt) {
	if (opt == null) return "";
	return typeof opt === "object" ? String(opt.value ?? "") : String(opt);
}
function optionLabel(opt) {
	if (opt == null) return "";
	if (typeof opt !== "object") return String(opt);
	return String(opt.label || opt.value || "");
}
function optionSearchText(opt) {
	if (opt == null) return "";
	if (typeof opt !== "object") return String(opt).toLowerCase();
	const parts = [opt.label, opt.value, opt.description, opt.searchText, opt.alias];
	return parts.filter(Boolean).join(" ").toLowerCase();
}

const items = computed(() => (Array.isArray(props.options) ? props.options.filter((o) => optionValue(o) !== "") : []));

const filtered = computed(() => {
	const q = query.value.trim().toLowerCase();
	if (!q) return items.value;
	return items.value.filter((o) => optionSearchText(o).includes(q));
});

const display = computed(() => {
	const match = items.value.find((o) => optionValue(o) === String(model.value ?? ""));
	if (match) return optionLabel(match);
	return props.mode === "ur" ? props.placeholderUr : props.placeholderEn;
});

function place() {
	if (!root.value) return;
	const r = root.value.getBoundingClientRect();
	const spaceBelow = window.innerHeight - 96 - r.bottom;
	placement.value = spaceBelow < 220 && r.top > spaceBelow ? "top" : "bottom";
}

async function toggle() {
	open.value = !open.value;
	if (open.value) {
		query.value = "";
		await nextTick();
		place();
		if (props.searchable && searchInput.value) searchInput.value.focus();
	}
}

function pick(opt) {
	model.value = optionValue(opt);
	open.value = false;
	query.value = "";
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
	document.removeEventListener("mousedown", onDoc);
	window.removeEventListener("resize", place);
	window.removeEventListener("scroll", place, true);
});
</script>

<template>
	<div ref="root" class="field" :class="{ open }">
		<FieldLabel :en="labelEn" :ur="labelUr" :mode="mode" :required="required" />
		<button type="button" class="trigger" :class="{ empty: !model, open }" @click="toggle">
			<span>{{ display }}</span>
			<span class="caret">▾</span>
		</button>
		<div v-if="open" class="menu" :class="placement">
			<div v-if="searchable" class="search-wrap" @mousedown.prevent>
				<input
					ref="searchInput"
					v-model="query"
					type="search"
					class="search"
					:placeholder="mode === 'ur' ? 'تلاش…' : 'Type to search…'"
					autocomplete="off"
				/>
			</div>
			<button v-if="!filtered.length" type="button" class="item muted" disabled>
				{{ searchable && query ? "No matches" : "No options" }}
			</button>
			<button
				v-for="opt in filtered"
				:key="optionValue(opt)"
				type="button"
				class="item"
				:class="{ sel: optionValue(opt) === String(model ?? '') }"
				@click="pick(opt)"
			>
				{{ optionLabel(opt) }}
			</button>
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
	max-height: 280px;
	overflow: auto;
	z-index: 90;
	background: #fff;
	border: 1px solid #e4e4e7;
	border-radius: 12px;
	box-shadow: 0 16px 40px rgba(24, 24, 27, 0.16);
	padding: 6px;
}
.menu.top {
	top: auto;
	bottom: calc(100% + 6px);
}
.search-wrap {
	padding: 4px 4px 8px;
	position: sticky;
	top: 0;
	background: #fff;
	z-index: 1;
}
.search {
	width: 100%;
	border: 1px solid #e4e4e7;
	border-radius: 8px;
	padding: 8px 10px;
	font: inherit;
	font-size: 13px;
	background: #fafafa;
}
.search:focus {
	outline: none;
	border-color: #0f7a3c;
	background: #fff;
}
.item {
	display: block;
	width: 100%;
	text-align: left;
	border: 0;
	background: transparent;
	border-radius: 8px;
	padding: 9px 10px;
	font: inherit;
	font-size: 13px;
	cursor: pointer;
}
.item:hover {
	background: rgba(15, 122, 60, 0.08);
}
.item.sel {
	background: #0f7a3c;
	color: #fff;
}
.item.muted {
	color: #a1a1aa;
	cursor: default;
}
</style>
