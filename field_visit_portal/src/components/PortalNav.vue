<script setup>
defineProps({
	page: { type: String, default: "new" },
	lang: { type: String, default: "both" },
});

defineEmits(["navigate"]);

const items = [
	{ id: "dashboard", en: "Dashboard", ur: "ڈیش بورڈ", icon: "grid" },
	{ id: "list", en: "My Visits", ur: "میرے وزٹ", icon: "list" },
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
				<svg v-else viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M12 5v14M5 12h14" />
				</svg>
			</span>
			<span class="portal-nav-label">
				<template v-if="lang === 'ur'">{{ item.ur }}</template>
				<template v-else-if="lang === 'en'">{{ item.en }}</template>
				<template v-else>{{ item.en }} <span class="urdu portal-nav-ur">/ {{ item.ur }}</span></template>
			</span>
		</button>
	</nav>
</template>
