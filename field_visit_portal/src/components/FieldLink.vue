<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";

const props = defineProps({
	labelEn: String,
	labelUr: String,
	mode: { type: String, default: "both" },
	placeholder: { type: String, default: "Select customer" },
	options: { type: Array, default: () => [] },
	search: Function,
});
const model = defineModel({ type: String, default: "" });
const label = defineModel("label", { type: String, default: "" });

const open = ref(false);
const query = ref("");
const extra = ref([]);
const root = ref(null);
const placement = ref("bottom");
let timer = null;

const display = computed(() => label.value || model.value || "");

function asItem(opt) {
	if (opt && typeof opt === "object") {
		return {
			value: String(opt.value ?? ""),
			label: String(opt.label || opt.value || ""),
			description: String(opt.description || ""),
			city: opt.city || "",
			school_type: opt.school_type || "",
		};
	}
	return { value: String(opt || ""), label: String(opt || ""), description: "" };
}

const allLocal = computed(() => (props.options || []).map(asItem).filter((o) => o.value));

const items = computed(() => {
	const q = query.value.trim().toLowerCase();
	const src = extra.value.length ? extra.value : allLocal.value;
	const filtered = q
		? src.filter(
				(o) =>
					o.label.toLowerCase().includes(q) ||
					o.value.toLowerCase().includes(q) ||
					o.description.toLowerCase().includes(q),
			)
		: src;
	return filtered.slice(0, 300);
});

function place() {
	placement.value = "bottom";
}

async function toggle() {
	open.value = !open.value;
	if (!open.value) return;
	query.value = "";
	await nextTick();
	place();
	if (allLocal.value.length) {
		extra.value = allLocal.value;
		return;
	}
	if (!props.search) return;
	try {
		extra.value = ((await props.search("")) || []).map(asItem);
	} catch {
		extra.value = [];
	}
}

async function onInput(e) {
	query.value = e.target.value;
	clearTimeout(timer);
	const q = query.value.trim();
	if (!q || !props.search) return;
	if (allLocal.value.some((o) => o.label.toLowerCase().includes(q.toLowerCase()))) return;
	timer = setTimeout(async () => {
		try {
			extra.value = ((await props.search(q)) || []).map(asItem);
		} catch {
			extra.value = [];
		}
	}, 250);
}

function pick(row) {
	model.value = row.value;
	label.value = row.label || row.value;
	query.value = "";
	open.value = false;
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
		<label>
			<span class="en">{{ labelEn }}</span>
			<span v-if="mode !== 'en' && labelUr" class="ur urdu">{{ labelUr }}</span>
		</label>
		<button type="button" class="trigger" :class="{ empty: !model, open }" @click="toggle">
			<span>{{ display || placeholder }}</span>
			<span class="caret">▾</span>
		</button>
		<div v-if="open" class="menu" :class="placement">
			<input class="filter" :value="query" placeholder="Type to filter…" @input="onInput" />
			<div class="list">
				<button v-if="!items.length" type="button" class="item muted" disabled>No customers found</button>
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
