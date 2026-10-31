<script setup>
import { onMounted, ref, watch } from "vue";
import { apiGet } from "../lib/api";

const props = defineProps({
	page: { type: String, default: "new" },
	lang: { type: String, default: "both" },
});

defineEmits(["navigate"]);

const badge = ref(0);

async function refreshBadge() {
	try {
		const res = await apiGet(
			"tif_customization.tif_customization.field_visit_approval.list_pending_approvals",
			{ limit: 50 }
		);
		badge.value = Number(res?.total_count || 0);
	} catch {
		badge.value = 0;
	}
}

onMounted(refreshBadge);
watch(
	() => props.page,
	(p) => {
		if (p === "approvals" || p === "dashboard") refreshBadge();
	}
);

const items = [
	{ id: "dashboard", en: "Dashboard", ur: "ڈیش بورڈ", icon: "grid" },
	{ id: "list", en: "My Visits", ur: "میرے وزٹ", icon: "list" },
	{ id: "approvals", en: "Approvals", ur: "منظوری", icon: "bell" },
	{ id: "new", en: "New Visit", ur: "نیا وزٹ", icon: "plus" },
];
</script>

<template>
	<nav class="portal-nav" aria-label="Portal">
		<button
			v-for="item in items"
			:key="item.id"
			type="button"
			class="portal-nav-item"
			:class="{ on: page === item.id }"
			@click="$emit('navigate', item.id)"
		>
			<span class="portal-nav-ico" aria-hidden="true">
				<svg v-if="item.icon === 'grid'" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
					<rect x="3" y="3" width="7" height="7" rx="1" />
					<rect x="14" y="3" width="7" height="7" rx="1" />
					<rect x="3" y="14" width="7" height="7" rx="1" />
					<rect x="14" y="14" width="7" height="7" rx="1" />
				</svg>
				<svg v-else-if="item.icon === 'list'" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
				</svg>
				<svg v-else-if="item.icon === 'bell'" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
					<path d="M13.73 21a2 2 0 0 1-3.46 0" />
				</svg>
				<svg v-else viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M12 5v14M5 12h14" />
				</svg>
			</span>
			<span class="portal-nav-label">
				<template v-if="lang === 'ur'">{{ item.ur }}</template>
				<template v-else-if="lang === 'en'">{{ item.en }}</template>
				<template v-else>{{ item.en }} <span class="urdu portal-nav-ur">/ {{ item.ur }}</span></template>
			</span>
			<span v-if="item.id === 'approvals' && badge > 0" class="portal-nav-badge">{{ badge > 99 ? "99+" : badge }}</span>
		</button>
	</nav>
</template>

<style scoped>
.portal-nav-badge {
	margin-left: 6px;
	min-width: 18px;
	height: 18px;
	padding: 0 5px;
	border-radius: 999px;
	background: #ea580c;
	color: #fff;
	font-size: 11px;
	font-weight: 700;
	line-height: 18px;
	text-align: center;
}
</style>
