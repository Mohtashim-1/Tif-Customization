<script setup>
defineProps({
	kpis: { type: Array, default: () => [] },
	count: { type: Number, default: 0 },
	selected: { type: Number, default: 0 },
});
defineEmits(["export-csv", "export-xlsx", "export-print"]);
</script>

<template>
	<div v-if="kpis.length" class="grid-kpis">
		<div v-for="k in kpis" :key="k.label" class="kpi">
			<div class="l">{{ k.label }}</div>
			<div class="v">{{ k.value }}</div>
			<div v-if="k.hint" class="d stat-mute">{{ k.hint }}</div>
		</div>
	</div>
	<div class="card">
		<slot />
		<div class="row" style="margin-top: 12px; justify-content: space-between">
			<span class="pill mute">{{ selected ? `${selected} selected` : `${count} row${count === 1 ? "" : "s"}` }}</span>
			<div class="row">
				<button class="btn" type="button" @click="$emit('export-csv')">Export CSV</button>
				<button class="btn" type="button" @click="$emit('export-xlsx')">Export Excel</button>
				<button class="btn" type="button" @click="$emit('export-print')">Print</button>
			</div>
		</div>
	</div>
</template>
