<script setup>
import { computed, onMounted, reactive, ref, watch } from "vue";
import { apiGet, m, money } from "../lib/api";

const props = defineProps({
	company: { type: String, default: "" },
});
const emit = defineEmits(["create", "open"]);

const loading = ref(true);
const refreshing = ref(false);
const error = ref("");
const data = ref(null);

const now = new Date();
const filter = reactive({
	year: now.getFullYear(),
	month: now.getMonth() + 1,
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

const period = computed(() => data.value?.period);
const monthKpis = computed(() => data.value?.month_kpis || []);
const departments = computed(() => data.value?.by_department || []);

function shortDept(label) {
	return String(label || "")
		.replace(/\s*-\s*TIF\s*$/i, "")
		.trim() || "No Department";
}

function badgeClass(status) {
	const s = (status || "").toLowerCase();
	if (s.includes("pending")) return "pending";
	if (s.includes("approved")) return "approved";
	if (s.includes("final")) return "finalized";
	if (s.includes("reject")) return "rejected";
	return "draft";
}

function openMonth(m) {
	emit("open", {
		label: m.period_label || m.label,
		start_date: m.start_date,
		end_date: m.end_date,
		month: m.payroll_month,
		year: m.payroll_year,
		status: m.status || "Draft",
	});
}

async function load({ soft = false } = {}) {
	if (soft) refreshing.value = true;
	else loading.value = true;
	error.value = "";
	try {
		data.value = await apiGet(m("get_payroll_register"), {
			company: props.company,
			year: filter.year,
			month: filter.month,
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

watch(
	() => [filter.year, filter.month],
	() => load({ soft: true })
);

onMounted(() => load());
defineExpose({ reload: load });
</script>

<template>
	<div class="dash reg-dash">
		<header class="dash-hero">
			<div>
				<p class="dash-kicker">Payroll Register</p>
				<h1>Payroll Dashboard</h1>
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
				<button
					class="pp-btn pp-btn-ghost"
					type="button"
					:disabled="loading || refreshing"
					@click="load({ soft: true })"
				>
					{{ refreshing ? "Refreshing…" : "Refresh" }}
				</button>
				<button class="pp-btn pp-btn-primary" type="button" @click="emit('create')">
					Run payroll
				</button>
			</div>
		</header>

		<div v-if="error" class="pp-alert error">{{ error }}</div>
		<div v-if="loading" class="pp-empty">Loading payroll register…</div>

		<template v-else-if="data">
			<section class="pp-card reg-card">
				<div class="reg-head">
					<div>
						<h2>Payroll Register</h2>
						<p class="dash-muted">
							Department wise headcount and payable amount for selected payroll employees
						</p>
					</div>
					<div class="reg-totals">
						<span
							><strong>{{ data.total_headcount || 0 }}</strong> Headcount</span
						>
						<span
							><strong>{{ money(data.total_amount) }}</strong> Amount</span
						>
					</div>
				</div>

				<!-- Month cards: own full-width row -->
				<div v-if="monthKpis.length" class="reg-months">
					<button
						v-for="m in monthKpis"
						:key="m.start_date + m.end_date"
						type="button"
						class="reg-month"
						:class="{ 'is-current': m.is_current }"
						@click="openMonth(m)"
					>
						<div class="reg-month__label">{{ m.label }}</div>
						<div class="reg-month__range">{{ m.start_date }} – {{ m.end_date }}</div>
						<div class="reg-month__stats">
							<div>
								<span>Headcount</span>
								<strong>{{ m.headcount || 0 }}</strong>
							</div>
							<div>
								<span>Amount</span>
								<strong>{{ money(m.amount) }}</strong>
							</div>
						</div>
						<span class="pp-badge" :class="badgeClass(m.status)">{{ m.status || "Draft" }}</span>
					</button>
				</div>

				<!-- Department KPIs: fixed 4-column grid -->
				<div class="reg-dept-title">Department wise KPIs</div>
				<div v-if="departments.length" class="reg-depts">
					<article
						v-for="(row, idx) in departments"
						:key="row.label"
						class="reg-dept"
						:class="`tone-${idx % 8}`"
						:title="row.label"
					>
						<div class="reg-dept__label">{{ shortDept(row.label) }}</div>
						<div class="reg-dept__value">{{ row.headcount || 0 }}</div>
						<div class="reg-dept__hint">{{ money(row.amount) }} · Amount</div>
					</article>
				</div>
				<div v-else class="pp-empty" style="padding: 1rem">No payroll employees for this period.</div>

				<!-- Table -->
				<div class="reg-table-wrap">
					<table class="pp-table reg-table">
						<thead>
							<tr>
								<th>Department</th>
								<th class="num">Headcount</th>
								<th class="num">Amount</th>
							</tr>
						</thead>
						<tbody>
							<tr v-for="row in departments" :key="'t-' + row.label">
								<td>{{ row.label }}</td>
								<td class="num">{{ row.headcount || 0 }}</td>
								<td class="num">{{ money(row.amount) }}</td>
							</tr>
							<tr v-if="!departments.length">
								<td colspan="3" class="pp-hint">No payroll employees selected</td>
							</tr>
						</tbody>
					</table>
				</div>
			</section>

			<!-- Open periods -->
			<section v-if="(data.periods || []).length" class="reg-periods">
				<div class="dash-section__title">Open a period to amend</div>
				<div class="pp-card">
					<div class="pp-body">
						<div
							v-for="p in data.periods.slice(0, 12)"
							:key="p.value"
							class="pp-period-row"
						>
							<div>
								<strong>{{ p.label }}</strong>
								<div class="pp-hint">{{ p.start_date }} → {{ p.end_date }}</div>
							</div>
							<div class="pp-actions">
								<span class="pp-badge" :class="badgeClass(p.status)">{{ p.status }}</span>
								<button class="link" type="button" @click="emit('open', p)">Open</button>
							</div>
						</div>
					</div>
				</div>
			</section>
		</template>
	</div>
</template>
