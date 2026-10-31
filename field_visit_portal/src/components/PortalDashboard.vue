<script setup>
import { onMounted, ref } from "vue";
import { apiGet, METHOD } from "../lib/api";
import Bi from "./Bi.vue";

const props = defineProps({
	lang: { type: String, default: "both" },
});

const emit = defineEmits(["navigate", "open-visit"]);

const loading = ref(true);
const error = ref("");
const data = ref(null);
const approvals = ref({
	to_approve_count: 0,
	my_pending_count: 0,
	total_count: 0,
	is_supervisor: false,
});

async function load() {
	loading.value = true;
	error.value = "";
	try {
		data.value = await apiGet(`${METHOD}.get_portal_dashboard`);
		try {
			approvals.value = await apiGet(
				"tif_customization.tif_customization.field_visit_approval.list_pending_approvals",
				{ limit: 50 }
			);
		} catch {
			approvals.value = { to_approve_count: 0, my_pending_count: 0, total_count: 0 };
		}
	} catch (e) {
		error.value = e.message || "Could not load dashboard.";
	} finally {
		loading.value = false;
	}
}

onMounted(load);

const statCards = [
	{ key: "today", en: "Today", ur: "آج" },
	{ key: "this_week", en: "This week", ur: "اس ہفتے" },
	{ key: "this_month", en: "This month", ur: "اس مہینے" },
	{ key: "drafts", en: "Drafts", ur: "ڈرافٹ" },
];

function maxType() {
	const rows = data.value?.by_type || [];
	return Math.max(1, ...rows.map((r) => Number(r.total) || 0));
}
</script>

<template>
	<section class="portal-dash fade">
		<div v-if="loading" class="hero-p">Loading dashboard…</div>
		<div v-else-if="error" class="error-banner">{{ error }}</div>
		<template v-else-if="data">
			<div class="portal-dash-head">
				<div>
					<p class="portal-kicker">
						<Bi :mode="lang" en="Field portal" ur="فیلڈ پورٹل" />
					</p>
					<h1 class="portal-title">
						<template v-if="lang === 'ur'">
							<span class="urdu">السلام علیکم، {{ data.full_name }}</span>
						</template>
						<template v-else-if="lang === 'en'">
							Assalamu alaikum, {{ data.full_name }}
						</template>
						<template v-else>
							Assalamu alaikum / <span class="urdu">السلام علیکم</span>, {{ data.full_name }}
						</template>
					</h1>
					<p class="hero-p" style="margin-top: 6px">
						<Bi
							:mode="lang"
							en="Your visits at a glance — open a visit or start a new one."
							ur="آپ کے وزٹ ایک نظر میں — وزٹ کھولیں یا نیا شروع کریں۔"
						/>
					</p>
				</div>
				<div class="portal-dash-actions">
					<button type="button" class="btn btn-primary" @click="emit('navigate', 'new')">
						<Bi :mode="lang" en="New Visit" ur="نیا وزٹ" />
					</button>
					<button type="button" class="btn btn-ghost" @click="emit('navigate', 'list')">
						<Bi :mode="lang" en="All visits" ur="تمام وزٹ" />
					</button>
				</div>
			</div>

			<div class="portal-stat-grid">
				<div v-for="s in statCards" :key="s.key" class="portal-stat">
					<div class="portal-stat-n">{{ data.stats?.[s.key] ?? 0 }}</div>
					<div class="portal-stat-l">
						<Bi :mode="lang" :en="s.en" :ur="s.ur" />
					</div>
				</div>
			</div>

			<button
				type="button"
				class="portal-panel"
				style="width: 100%; margin: 16px 0 0; text-align: left; cursor: pointer; border: 1px solid #fdba74; background: linear-gradient(135deg, #fff7ed, #fff)"
				@click="emit('navigate', 'approvals')"
			>
				<div class="portal-panel-h" style="margin-bottom: 0">
					<div>
						<strong style="color: #9a3412">
							<Bi :mode="lang" en="Pending Approvals" ur="زیر التواء منظوری" />
						</strong>
						<div class="portal-muted" style="margin-top: 4px">
							<template v-if="approvals.is_supervisor">
								<Bi
									:mode="lang"
									:en="`${approvals.to_approve_count || 0} to approve · ${approvals.my_pending_count || 0} your requests`"
									:ur="`${approvals.to_approve_count || 0} منظوری · ${approvals.my_pending_count || 0} آپ کی درخواستیں`"
								/>
							</template>
							<template v-else>
								<Bi
									:mode="lang"
									:en="`${approvals.my_pending_count || 0} of your visits await supervisor`"
									:ur="`${approvals.my_pending_count || 0} وزٹ سپروائزر کے پاس`"
								/>
							</template>
						</div>
					</div>
					<span
						class="portal-badge"
						:style="{
							background: (approvals.total_count || 0) ? '#ea580c' : '#e4e4e7',
							color: (approvals.total_count || 0) ? '#fff' : '#52525b',
						}"
					>{{ approvals.total_count || 0 }}</span>
				</div>
			</button>

			<div class="portal-dash-grid">
				<div class="portal-panel">
					<div class="portal-panel-h">
						<Bi :mode="lang" en="By activity type" ur="سرگرمی کی قسم کے مطابق" />
						<span class="portal-muted">{{ data.from_date }} → {{ data.to_date }}</span>
					</div>
					<div v-if="!(data.by_type || []).length" class="portal-empty">
						<Bi :mode="lang" en="No visits in this period." ur="اس مدت میں کوئی وزٹ نہیں۔" />
					</div>
					<ul v-else class="portal-type-list">
						<li v-for="row in data.by_type" :key="row.activity_type">
							<div class="portal-type-row">
								<span class="portal-type-name">{{ row.activity_type }}</span>
								<strong>{{ row.total }}</strong>
							</div>
							<div class="portal-type-bar">
								<span :style="{ width: `${(100 * Number(row.total)) / maxType()}%` }"></span>
							</div>
						</li>
					</ul>
				</div>

				<div class="portal-panel">
					<div class="portal-panel-h">
						<Bi :mode="lang" en="Recent visits" ur="حالیہ وزٹ" />
						<button type="button" class="btn btn-ghost btn-sm" @click="emit('navigate', 'list')">
							<Bi :mode="lang" en="View all" ur="سب دیکھیں" />
						</button>
					</div>
					<div v-if="!(data.recent || []).length" class="portal-empty">
						<Bi :mode="lang" en="No visits yet. Create your first one." ur="ابھی کوئی وزٹ نہیں۔ پہلا وزٹ بنائیں۔" />
					</div>
					<ul v-else class="portal-recent">
						<li v-for="row in data.recent" :key="row.name">
							<button type="button" class="portal-recent-btn" @click="emit('open-visit', row.name)">
								<div class="portal-recent-top">
									<strong>{{ row.name }}</strong>
									<span class="portal-badge" :class="'ds-' + row.docstatus">{{ row.docstatus_label }}</span>
								</div>
								<div class="portal-recent-meta">
									<span>{{ row.type || "—" }}</span>
									<span v-if="row.visit_date"> · {{ row.visit_date }}</span>
								</div>
								<div v-if="row.school || row.city" class="portal-recent-sub">
									{{ row.school || "—" }}<span v-if="row.city"> · {{ row.city }}</span>
								</div>
							</button>
						</li>
					</ul>
				</div>
			</div>
		</template>
	</section>
</template>
