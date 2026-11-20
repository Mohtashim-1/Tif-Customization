<script setup>
import { onMounted, ref } from "vue";
import { apiGet } from "../lib/api";
import Bi from "./Bi.vue";

defineProps({
	lang: { type: String, default: "both" },
});

const loading = ref(true);
const error = ref("");
const rows = ref([]);

async function load() {
	loading.value = true;
	error.value = "";
	try {
		const res = await apiGet(
			"tif_customization.tif_customization.api.school_opening_registry.list_my_school_opening_tasks",
			{ limit: 50 }
		);
		rows.value = res?.rows || [];
	} catch (e) {
		error.value = e.message || "Could not load school opening tasks.";
		rows.value = [];
	} finally {
		loading.value = false;
	}
}

onMounted(load);
</script>

<template>
	<section class="portal-dash fade">
		<div class="portal-dash-head">
			<div>
				<p class="portal-kicker">
					<Bi :mode="lang" en="School Opening" ur="اسکول اوپننگ" />
				</p>
				<h1 class="portal-title">
					<Bi :mode="lang" en="Forms sent to you" ur="آپ کو بھیجے گئے فارم" />
				</h1>
				<p class="hero-p" style="margin-top: 6px">
					<Bi
						:mode="lang"
						en="Complete missing information, then Save on the form. Head Office will review after you finish."
						ur="گمشدہ معلومات مکمل کریں، فارم پر سیو کریں۔ مکمل ہونے پر ہیڈ آفس جائزہ لے گا۔"
					/>
				</p>
			</div>
			<button type="button" class="btn btn-ghost" @click="load">
				<Bi :mode="lang" en="Refresh" ur="ریفریش" />
			</button>
		</div>

		<div v-if="loading" class="hero-p">Loading…</div>
		<div v-else-if="error" class="error-banner">{{ error }}</div>
		<div v-else-if="!rows.length" class="portal-panel" style="margin-top: 16px">
			<p class="hero-p" style="margin: 0">
				<Bi
					:mode="lang"
					en="No School Opening forms waiting for you right now."
					ur="اس وقت آپ کے لیے کوئی اسکول اوپننگ فارم زیر التواء نہیں ہے۔"
				/>
			</p>
		</div>
		<div v-else class="portal-panel" style="margin-top: 16px; padding: 0; overflow: hidden">
			<table class="soa-task-table">
				<thead>
					<tr>
						<th><Bi :mode="lang" en="School" ur="اسکول" /></th>
						<th><Bi :mode="lang" en="City" ur="شہر" /></th>
						<th><Bi :mode="lang" en="Sent" ur="بھیجا" /></th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					<tr v-for="r in rows" :key="r.application">
						<td>
							<strong>{{ r.school_name || r.application }}</strong>
							<div class="portal-muted">{{ r.application }}</div>
							<div v-if="r.ho_to_fo_note" class="soa-ho-note">
								<strong>
									<Bi :mode="lang" en="HO note" ur="ہیڈ آفس نوٹ" />:
								</strong>
								{{ r.ho_to_fo_note }}
							</div>
						</td>
						<td>{{ r.city || "—" }}</td>
						<td>{{ r.sent_to_fo_on || r.modified || "—" }}</td>
						<td style="text-align: right">
							<a class="btn btn-primary" :href="r.print_url" target="_blank" rel="noopener">
								<Bi :mode="lang" en="Open Form" ur="فارم کھولیں" />
							</a>
						</td>
					</tr>
				</tbody>
			</table>
		</div>
	</section>
</template>

<style scoped>
.soa-task-table {
	width: 100%;
	border-collapse: collapse;
	font-size: 13px;
}
.soa-task-table th,
.soa-task-table td {
	padding: 12px 14px;
	border-bottom: 1px solid #e5e7eb;
	text-align: left;
	vertical-align: top;
}
.soa-task-table th {
	background: #f8fafc;
	font-size: 11px;
	text-transform: uppercase;
	letter-spacing: 0.04em;
	color: #64748b;
}
.soa-ho-note {
	margin-top: 6px;
	padding: 8px 10px;
	border-radius: 8px;
	background: #fff7ed;
	border: 1px solid #fdba74;
	color: #9a3412;
	font-size: 12px;
	line-height: 1.4;
}
</style>
