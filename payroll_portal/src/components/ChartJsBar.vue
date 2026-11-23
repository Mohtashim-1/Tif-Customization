<script setup>
import { onMounted, onBeforeUnmount, ref, watch } from "vue";
import {
	Chart,
	BarController,
	BarElement,
	CategoryScale,
	LinearScale,
	Tooltip,
	Legend,
	Title,
} from "chart.js";

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend, Title);

const props = defineProps({
	spec: { type: Object, required: true },
	height: { type: Number, default: 300 },
});

const canvas = ref(null);
let chart = null;
const colors = ["#0d6e6e", "#1a8f8f", "#0f1c2e", "#b45309", "#6d28d9", "#047857"];

function render() {
	if (!canvas.value) return;
	if (chart) {
		chart.destroy();
		chart = null;
	}
	const s = props.spec || {};
	const datasets = (s.series || []).map((row, i) => ({
		label: row.name,
		data: row.data || [],
		backgroundColor: colors[i % colors.length],
		borderRadius: 6,
		maxBarThickness: 42,
	}));
	chart = new Chart(canvas.value, {
		type: "bar",
		data: {
			labels: s.labels || [],
			datasets,
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			plugins: {
				legend: { display: datasets.length > 1, position: "bottom" },
				tooltip: {
					callbacks: {
						label: (ctx) =>
							`${ctx.dataset.label}: ${Number(ctx.parsed.y || 0).toLocaleString("en-PK")}`,
					},
				},
			},
			scales: {
				x: {
					ticks: { maxRotation: 40, color: "#5a6b7d", font: { size: 10 } },
					grid: { display: false },
				},
				y: {
					ticks: {
						color: "#5a6b7d",
						callback: (v) => Number(v).toLocaleString("en-PK", { notation: "compact" }),
					},
					grid: { color: "#eef2f7" },
				},
			},
		},
	});
}

watch(
	() => props.spec,
	() => render(),
	{ deep: true }
);

onMounted(render);
onBeforeUnmount(() => {
	if (chart) chart.destroy();
});
</script>

<template>
	<div class="dash-chart-card pp-card">
		<div class="pp-section-head">
			<h2>{{ spec.title }}</h2>
			<span v-if="spec.note" class="dash-muted">{{ spec.note }}</span>
		</div>
		<div class="dash-chart-body" :style="{ height: height + 'px' }">
			<canvas ref="canvas" />
		</div>
	</div>
</template>
