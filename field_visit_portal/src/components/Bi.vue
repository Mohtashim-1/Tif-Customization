<script setup>
defineProps({
	en: { type: String, default: "" },
	ur: { type: String, default: "" },
	mode: { type: String, default: "both" },
	as: { type: String, default: "span" },
});
</script>

<template>
	<span v-if="mode === 'en'">{{ en }}</span>
	<span v-else-if="mode === 'ur'" class="urdu">{{ ur }}</span>
	<span v-else class="bi">
		<span>{{ en }}</span>
		<span v-if="ur" class="urdu muted"> / {{ ur }}</span>
	</span>
</template>

<style scoped>
.bi {
	display: inline-flex;
	flex-wrap: wrap;
	align-items: baseline;
	gap: 6px;
}
.muted {
	font-size: 11px;
	color: #71717a;
	font-weight: 400;
}
</style>
