<script setup>
import { computed, onMounted, ref } from "vue";
import { apiGet, apiPost } from "../lib/api";
import Bi from "./Bi.vue";

const props = defineProps({
	lang: { type: String, default: "both" },
});

const emit = defineEmits(["navigate", "open-visit"]);

const loading = ref(true);
const error = ref("");
const notice = ref("");
const busyName = ref("");
const data = ref({
	to_approve: [],
	my_pending: [],
	to_approve_count: 0,
	my_pending_count: 0,
	total_count: 0,
	is_supervisor: false,
});

async function load() {
	loading.value = true;
	error.value = "";
	try {
		const res = await apiGet(
			"tif_customization.tif_customization.field_visit_approval.list_pending_approvals",
			{ limit: 50 }
		);
		data.value = res && typeof res === "object" ? res : data.value;
	} catch (e) {
		error.value = e.message || "Could not load pending approvals.";
	} finally {
		loading.value = false;
	}
}

onMounted(load);

const hasAny = computed(
	() => (data.value.to_approve_count || 0) + (data.value.my_pending_count || 0) > 0
);

async function approveRow(row) {
	if (!row?.name || busyName.value) return;
	if (!window.confirm(`Approve and submit ${row.name}? / منظوری دے کر جمع کریں؟`)) return;
	busyName.value = row.name;
	error.value = "";
	notice.value = "";
	try {
		const res = await apiPost(
			"tif_customization.tif_customization.field_visit_approval.approve_field_visit",
			{ name: row.name, submit: 1 }
		);
		notice.value = res.message || `Approved ${row.name}`;
		await load();
	} catch (e) {
		error.value = e.message || "Could not approve.";
	} finally {
		busyName.value = "";
	}
}

async function rejectRow(row) {
	if (!row?.name || busyName.value) return;
	const remarks = window.prompt("Rejection reason / مسترد کرنے کی وجہ:", "") || "";
	if (!window.confirm(`Reject ${row.name}? / مسترد کریں؟`)) return;
	busyName.value = row.name;
	error.value = "";
	notice.value = "";
	try {
		const res = await apiPost(
			"tif_customization.tif_customization.field_visit_approval.reject_field_visit",
			{ name: row.name, remarks }
		);
		notice.value = res.message || `Rejected ${row.name}`;
		await load();
	} catch (e) {
		error.value = e.message || "Could not reject.";
	} finally {
		busyName.value = "";
	}
}

function schoolLabel(row) {
	return row.school_name || "—";
}
</script>

<template>
	<section class="portal-dash fade">
		<div class="portal-dash-head">
			<div>
				<p class="portal-kicker">
					<Bi :mode="lang" en="Notifications" ur="نوٹیفیکیشنز" />
				</p>
				<h1 class="portal-title">
					<Bi :mode="lang" en="Pending Approvals" ur="زیر التواء منظوری" />
				</h1>
				<p class="hero-p" style="margin-top: 6px">
					<Bi
						:mode="lang"
						en="Supervisors approve team visits here. Field officers track their own pending requests."
						ur="سپروائزر یہاں ٹیم کی وزٹ منظور کریں۔ فیلڈ آفیسر اپنی زیر التواء درخواستیں دیکھیں۔"
					/>
				</p>
			</div>
			<div class="portal-dash-actions">
				<button type="button" class="btn btn-ghost" :disabled="loading" @click="load">
					<Bi :mode="lang" en="Refresh" ur="تازہ کریں" />
				</button>
				<button type="button" class="btn btn-primary" @click="emit('navigate', 'new')">
					<Bi :mode="lang" en="New Visit" ur="نیا وزٹ" />
				</button>
			</div>
		</div>

		<div v-if="notice" class="success-banner">{{ notice }}</div>
		<div v-if="error" class="error-banner">{{ error }}</div>
		<div v-if="loading" class="hero-p">Loading pending approvals…</div>

		<template v-else>
			<div class="portal-stat-grid" style="grid-template-columns: repeat(auto-fit, minmax(140px, 1fr))">
				<button type="button" class="portal-stat portal-stat-btn" style="text-align: left; cursor: default">
					<div class="portal-stat-n" style="color: #9a3412">{{ data.to_approve_count || 0 }}</div>
					<div class="portal-stat-l">
						<Bi :mode="lang" en="To approve (supervisor)" ur="منظوری درکار (سپروائزر)" />
					</div>
				</button>
				<button type="button" class="portal-stat portal-stat-btn" style="text-align: left; cursor: default">
					<div class="portal-stat-n" style="color: #92400e">{{ data.my_pending_count || 0 }}</div>
					<div class="portal-stat-l">
						<Bi :mode="lang" en="My pending requests" ur="میری زیر التواء درخواستیں" />
					</div>
				</button>
			</div>

			<div v-if="!hasAny" class="portal-panel" style="margin-top: 16px">
				<div class="portal-empty">
					<Bi
						:mode="lang"
						en="No pending approvals right now."
						ur="اس وقت کوئی زیر التواء منظوری نہیں۔"
					/>
				</div>
			</div>

			<div v-if="(data.to_approve || []).length" class="portal-panel" style="margin-top: 16px">
				<div class="portal-panel-h">
					<strong>
						<Bi :mode="lang" en="Waiting for your approval" ur="آپ کی منظوری کا انتظار" />
					</strong>
					<span class="portal-muted">{{ data.to_approve_count }}</span>
				</div>
				<ul class="portal-recent">
					<li v-for="row in data.to_approve" :key="'a-' + row.name" class="approval-card">
						<div class="portal-recent-top">
							<strong>{{ row.name }}</strong>
							<span class="portal-badge" style="background: #fef3c7; color: #92400e">Pending</span>
						</div>
						<div class="portal-recent-meta">
							<span>{{ row.type || "—" }}</span>
							<span v-if="row.visit_date"> · {{ row.visit_date }}</span>
							<span v-if="row.visit_by"> · {{ row.visit_by }}</span>
						</div>
						<div class="portal-recent-sub">{{ schoolLabel(row) }}</div>
						<pre v-if="row.approval_reasons" class="approval-reasons">{{ row.approval_reasons }}</pre>
						<div class="approval-actions">
							<button
								type="button"
								class="btn btn-green"
								:disabled="busyName === row.name"
								@click="approveRow(row)"
							>
								{{ busyName === row.name ? "…" : "Approve & Submit / منظوری" }}
							</button>
							<button
								type="button"
								class="btn btn-ghost"
								:disabled="busyName === row.name"
								@click="rejectRow(row)"
							>
								Reject / مسترد
							</button>
							<button type="button" class="btn btn-ghost" @click="emit('open-visit', row.name)">
								Open / کھولیں
							</button>
						</div>
					</li>
				</ul>
			</div>

			<div v-if="(data.my_pending || []).length" class="portal-panel" style="margin-top: 16px">
				<div class="portal-panel-h">
					<strong>
						<Bi :mode="lang" en="My visits awaiting supervisor" ur="میری وزٹ سپروائزر کے پاس" />
					</strong>
					<span class="portal-muted">{{ data.my_pending_count }}</span>
				</div>
				<ul class="portal-recent">
					<li v-for="row in data.my_pending" :key="'m-' + row.name" class="approval-card">
						<div class="portal-recent-top">
							<strong>{{ row.name }}</strong>
							<span class="portal-badge" style="background: #ffedd5; color: #9a3412">Awaiting</span>
						</div>
						<div class="portal-recent-meta">
							<span>{{ row.type || "—" }}</span>
							<span v-if="row.visit_date"> · {{ row.visit_date }}</span>
						</div>
						<div class="portal-recent-sub">{{ schoolLabel(row) }}</div>
						<pre v-if="row.approval_reasons" class="approval-reasons">{{ row.approval_reasons }}</pre>
						<div class="approval-actions">
							<button type="button" class="btn btn-primary" @click="emit('open-visit', row.name)">
								Open visit / وزٹ کھولیں
							</button>
						</div>
					</li>
				</ul>
			</div>
		</template>
	</section>
</template>

<style scoped>
.approval-card {
	padding: 12px 0;
	border-bottom: 1px solid #e4e4e7;
}
.approval-card:last-child {
	border-bottom: none;
}
.approval-reasons {
	margin: 8px 0 0;
	padding: 8px 10px;
	background: #fff7ed;
	border-radius: 8px;
	font-size: 12px;
	white-space: pre-wrap;
	font-family: inherit;
	color: #9a3412;
}
.approval-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	margin-top: 10px;
}
.portal-stat-btn {
	border: none;
	background: inherit;
	font: inherit;
}
</style>
