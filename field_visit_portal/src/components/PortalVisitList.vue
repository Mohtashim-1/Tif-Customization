<script setup>
import { onMounted, reactive, ref, watch } from "vue";
import { apiGet, METHOD } from "../lib/api";
import Bi from "./Bi.vue";
import FieldInput from "./FieldInput.vue";
import FieldSelect from "./FieldSelect.vue";
import FieldDate from "./FieldDate.vue";

defineProps({
	lang: { type: String, default: "both" },
});

const emit = defineEmits(["navigate", "open-visit"]);

const loading = ref(true);
const error = ref("");
const rows = ref([]);
const total = ref(0);
const pages = ref(1);
const page = ref(1);
const activityTypes = ref([]);

const filters = reactive({
	search: "",
	activity_type: "all",
	from_date: "",
	to_date: "",
	docstatus: "all",
});

let searchTimer;

async function load(resetPage = false) {
	if (resetPage) page.value = 1;
	loading.value = true;
	error.value = "";
	try {
		const res = await apiGet(`${METHOD}.get_portal_visit_list`, {
			page: page.value,
			page_length: 20,
			search: filters.search || undefined,
			activity_type: filters.activity_type === "all" ? undefined : filters.activity_type || undefined,
			from_date: filters.from_date || undefined,
			to_date: filters.to_date || undefined,
			docstatus: filters.docstatus === "all" ? undefined : filters.docstatus,
		});
		rows.value = res.rows || [];
		total.value = res.total || 0;
		pages.value = res.pages || 1;
		if ((res.activity_types || []).length) {
			activityTypes.value = res.activity_types;
		}
	} catch (e) {
		error.value = e.message || "Could not load visits.";
	} finally {
		loading.value = false;
	}
}

function onSearchInput() {
	clearTimeout(searchTimer);
	searchTimer = setTimeout(() => load(true), 350);
}

watch(
	() => [filters.activity_type, filters.from_date, filters.to_date, filters.docstatus],
	() => load(true)
);

onMounted(load);

const statusOptions = [
	{ value: "all", label: "All statuses / تمام" },
	{ value: "0", label: "Draft / ڈرافٹ" },
	{ value: "1", label: "Submitted / جمع" },
	{ value: "2", label: "Cancelled / منسوخ" },
];

const typeOptions = () => [
	{ value: "all", label: "All types / تمام اقسام" },
	...activityTypes.value.map((t) => ({ value: t, label: t })),
];
</script>

<template>
	<section class="portal-list fade">
		<div class="portal-list-head">
			<div>
				<p class="portal-kicker">
					<Bi :mode="lang" en="Records" ur="ریکارڈز" />
				</p>
				<h1 class="portal-title">
					<Bi :mode="lang" en="My Visits" ur="میرے وزٹ" />
				</h1>
				<p class="hero-p" style="margin-top: 6px">
					<Bi
						:mode="lang"
						en="Search and open visits you (or your team) can access."
						ur="اپنے (یا ٹیم کے) وزٹ تلاش کریں اور کھولیں۔"
					/>
				</p>
			</div>
			<button type="button" class="btn btn-primary" @click="emit('navigate', 'new')">
				<Bi :mode="lang" en="New Visit" ur="نیا وزٹ" />
			</button>
		</div>

			<div class="portal-filters">
			<div class="portal-filter-grow">
				<FieldInput
					v-model="filters.search"
					:mode="lang"
					label-en="Search"
					label-ur="تلاش"
					placeholder="ID, school, city…"
					@update:model-value="onSearchInput"
				/>
			</div>
			<FieldSelect
				v-model="filters.activity_type"
				:mode="lang"
				label-en="Activity"
				label-ur="سرگرمی"
				:options="typeOptions()"
			/>
			<FieldSelect
				v-model="filters.docstatus"
				:mode="lang"
				label-en="Status"
				label-ur="حیثیت"
				:options="statusOptions"
			/>
			<FieldDate v-model="filters.from_date" :mode="lang" label-en="From date" label-ur="تاریخ سے" />
			<FieldDate v-model="filters.to_date" :mode="lang" label-en="To date" label-ur="تاریخ تک" />
		</div>

		<div v-if="error" class="error-banner">{{ error }}</div>
		<div v-if="loading" class="hero-p">Loading visits…</div>

		<template v-else>
			<div class="portal-list-meta">
				<span>{{ total }} <Bi :mode="lang" en="visits" ur="وزٹ" /></span>
				<span v-if="pages > 1"> · page {{ page }} / {{ pages }}</span>
			</div>

			<div v-if="!rows.length" class="portal-empty portal-empty-card">
				<Bi :mode="lang" en="No visits match these filters." ur="ان فلٹرز سے کوئی وزٹ نہیں ملا۔" />
				<button type="button" class="btn btn-primary" style="margin-top: 12px" @click="emit('navigate', 'new')">
					<Bi :mode="lang" en="Create visit" ur="وزٹ بنائیں" />
				</button>
			</div>

			<ul v-else class="portal-visit-rows">
				<li v-for="row in rows" :key="row.name">
					<button type="button" class="portal-visit-row" @click="emit('open-visit', row.name)">
						<div class="portal-visit-main">
							<div class="portal-visit-id">
								<strong>{{ row.name }}</strong>
								<span class="portal-badge" :class="'ds-' + row.docstatus">{{ row.docstatus_label }}</span>
							</div>
							<div class="portal-visit-type">{{ row.type || "—" }}</div>
							<div class="portal-visit-school">{{ row.school || "—" }}</div>
						</div>
						<div class="portal-visit-side">
							<div>{{ row.visit_date || "—" }}</div>
							<div class="portal-muted">{{ row.city || row.officer || "" }}</div>
						</div>
					</button>
				</li>
			</ul>

			<div v-if="pages > 1" class="portal-pager">
				<button type="button" class="btn btn-ghost" :disabled="page <= 1" @click="page--; load()">
					← Prev
				</button>
				<button type="button" class="btn btn-ghost" :disabled="page >= pages" @click="page++; load()">
					Next →
				</button>
			</div>
		</template>
	</section>
</template>
