<script setup>
import { computed, onMounted, reactive, ref, watch } from "vue";
import { apiGet, m, money } from "../lib/api";

const props = defineProps({
	company: { type: String, default: "" },
});

const loading = ref(true);
const refreshing = ref(false);
const error = ref("");
const data = ref(null);

const now = new Date();
const filter = reactive({
	year: now.getFullYear(),
	month: now.getMonth() + 1,
	status: "all",
	search: "",
});

const months = [
	{ v: 1, l: "January" },
	{ v: 2, l: "February" },
	{ v: 3, l: "March" },
	{ v: 4, l: "April" },
	{ v: 5, l: "May" },
	{ v: 6, l: "June" },
	{ v: 7, l: "July" },
	{ v: 8, l: "August" },
	{ v: 9, l: "September" },
	{ v: 10, l: "October" },
	{ v: 11, l: "November" },
	{ v: 12, l: "December" },
];
const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

const slips = computed(() => data.value?.slips || []);
const totals = computed(() => data.value?.totals || { count: 0, gross: 0, deduction: 0, net: 0 });
const period = computed(() => data.value?.period);

function badgeClass(label) {
	const s = (label || "").toLowerCase();
	if (s.includes("submit")) return "finalized";
	if (s.includes("cancel")) return "rejected";
	return "draft";
}

async function load({ soft = false } = {}) {
	if (soft) refreshing.value = true;
	else loading.value = true;
	error.value = "";
	try {
		data.value = await apiGet(m("list_salary_slips"), {
			company: props.company,
			year: filter.year,
			month: filter.month,
			status: filter.status,
			search: filter.search,
		});
		if (data.value?.period?.year) filter.year = data.value.period.year;
		if (data.value?.period?.month) filter.month = data.value.period.month;
	} catch (e) {
		error.value = e.message || String(e);
	} finally {
		loading.value = false;
		refreshing.value = false;
	}
}

let searchTimer = null;
watch(
	() => [filter.year, filter.month, filter.status],
	() => load({ soft: true })
);
watch(
	() => filter.search,
	() => {
		clearTimeout(searchTimer);
		searchTimer = setTimeout(() => load({ soft: true }), 280);
	}
);

onMounted(() => load());
</script>

<template>
	<div class="slips-page">
		<header class="dash-hero">
			<div>
				<p class="dash-kicker">Salary slips</p>
				<h1>Salary Slips</h1>
				<p class="dash-sub">
					{{ company || data?.company || "The ILM Foundation" }}
					<template v-if="period"> · {{ period.label }}</template>
				</p>
			</div>
			<div class="pp-actions dash-filters">
				<select v-model.number="filter.month" class="dash-select">
					<option v-for="mo in months" :key="mo.v" :value="mo.v">{{ mo.l }}</option>
				</select>
				<select v-model.number="filter.year" class="dash-select">
					<option v-for="y in years" :key="y" :value="y">{{ y }}</option>
				</select>
				<select v-model="filter.status" class="dash-select">
					<option value="all">All statuses</option>
					<option value="submitted">Submitted</option>
					<option value="draft">Draft</option>
					<option value="cancelled">Cancelled</option>
				</select>
				<button
					class="pp-btn pp-btn-ghost"
					type="button"
					:disabled="loading || refreshing"
					@click="load({ soft: true })"
				>
					{{ refreshing ? "Refreshing…" : "Refresh" }}
				</button>
				<a class="pp-btn pp-btn-primary" href="/app/salary-slip" target="_blank" rel="noopener">
					Open in Desk
				</a>
			</div>
		</header>

		<div v-if="error" class="pp-alert error">{{ error }}</div>

		<div class="pp-toolbar">
			<input
				v-model="filter.search"
				class="pp-search"
				type="search"
				placeholder="Search employee / dept…"
			/>
			<div class="pp-kpi-row" style="margin: 0">
				<span><strong>{{ totals.count }}</strong> slips</span>
				<span>Gross <strong>{{ money(totals.gross) }}</strong></span>
				<span>Deductions <strong>{{ money(totals.deduction) }}</strong></span>
				<span>Net <strong>{{ money(totals.net) }}</strong></span>
			</div>
		</div>

		<div v-if="loading" class="pp-empty">Loading salary slips…</div>

		<div v-else class="pp-card">
			<div class="pp-table-wrap" style="max-height: min(70vh, 780px)">
				<table class="pp-table">
					<thead>
						<tr>
							<th>Employee</th>
							<th>Department</th>
							<th>Period</th>
							<th>Status</th>
							<th class="num">Gross</th>
							<th class="num">Deduction</th>
							<th class="num">Net</th>
							<th></th>
						</tr>
					</thead>
					<tbody>
						<tr v-for="s in slips" :key="s.name">
							<td>
								<strong>{{ s.employee_name }}</strong>
								<div class="pp-hint">{{ s.employee }}</div>
							</td>
							<td>{{ s.department || "—" }}</td>
							<td>
								{{ s.start_date }} → {{ s.end_date }}
							</td>
							<td>
								<span class="pp-badge" :class="badgeClass(s.status_label)">{{
									s.status_label
								}}</span>
							</td>
							<td class="num">{{ money(s.gross_pay) }}</td>
							<td class="num">{{ money(s.total_deduction) }}</td>
							<td class="num"><strong>{{ money(s.net_pay) }}</strong></td>
							<td>
								<div class="pp-actions">
									<a class="pp-btn pp-btn-ghost" :href="s.form_url" target="_blank" rel="noopener"
										>Open</a
									>
									<a
										class="pp-btn pp-btn-primary"
										:href="s.print_url"
										target="_blank"
										rel="noopener"
										>Print</a
									>
								</div>
							</td>
						</tr>
						<tr v-if="!slips.length">
							<td colspan="8" class="pp-empty">No salary slips for this period.</td>
						</tr>
					</tbody>
				</table>
			</div>
		</div>
	</div>
</template>
