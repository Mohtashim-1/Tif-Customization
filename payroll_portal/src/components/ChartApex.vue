<script setup>
import { computed, onMounted, onBeforeUnmount, ref, watch } from "vue";
import ApexCharts from "apexcharts";

const props = defineProps({
	spec: { type: Object, required: true },
	height: { type: Number, default: 300 },
});

const el = ref(null);
let chart = null;

const palette = ["#0d6e6e", "#1a8f8f", "#0f1c2e", "#b45309", "#6d28d9", "#047857", "#0369a1", "#be123c"];

function buildOptions() {
	const s = props.spec || {};
	const base = {
		chart: {
			type: s.type === "donut" || s.type === "pie" ? s.type : s.horizontal ? "bar" : s.type || "line",
			height: props.height,
			toolbar: { show: true, tools: { download: true, zoom: true, pan: true, reset: true } },
			fontFamily: "IBM Plex Sans, DM Sans, system-ui, sans-serif",
			animations: { enabled: true, speed: 450 },
			background: "transparent",
		},
		colors: palette,
		dataLabels: { enabled: s.type === "donut" || s.type === "pie" },
		legend: { position: "bottom", fontSize: "11px" },
		tooltip: { theme: "light", y: { formatter: (v) => Number(v || 0).toLocaleString("en-PK") } },
		grid: { borderColor: "#e8eef6", strokeDashArray: 4 },
		stroke: { curve: "smooth", width: s.type === "line" ? 3 : 0 },
	};

	if (s.type === "donut" || s.type === "pie") {
		return {
			...base,
			labels: s.labels || [],
			series: s.series || [],
			plotOptions: {
				pie: {
					donut: { size: s.type === "donut" ? "62%" : "0%" },
				},
			},
		};
	}

	const series = (s.series || []).map((row) => ({
		name: row.name,
		type: row.type,
		data: row.data || [],
	}));

	const opts = {
		...base,
		series,
		xaxis: {
			categories: s.labels || [],
			labels: { style: { colors: "#5a6b7d", fontSize: "11px" }, rotate: -35 },
		},
		yaxis: { labels: { formatter: (v) => Number(v || 0).toLocaleString("en-PK", { notation: "compact" }) } },
		plotOptions: {
			bar: {
				horizontal: !!s.horizontal,
				borderRadius: 4,
				columnWidth: "55%",
			},
		},
	};

	// dual axis for cost vs headcount
	if (s.id === 3 && series.length >= 2) {
		opts.yaxis = [
			{
				title: { text: "Net Pay" },
				labels: { formatter: (v) => Number(v || 0).toLocaleString("en-PK", { notation: "compact" }) },
			},
			{
				opposite: true,
				title: { text: "Headcount" },
				labels: { formatter: (v) => String(Math.round(v || 0)) },
			},
		];
		opts.stroke = { width: [3, 0] };
		opts.chart.type = "line";
	}

	return opts;
}

function render() {
	if (!el.value) return;
	if (chart) {
		chart.destroy();
		chart = null;
	}
	const labels = props.spec?.labels || [];
	const series = props.spec?.series;
	const empty =
		!labels.length &&
		(!series || (Array.isArray(series) && series.length === 0) || (Array.isArray(series) && series.every((x) => !x && x !== 0)));
	if (empty && !(Array.isArray(series) && series.some((r) => (r.data || []).length))) {
		el.value.innerHTML = `<div class="pp-empty" style="padding:2rem">No data for this period</div>`;
		return;
	}
	chart = new ApexCharts(el.value, buildOptions());
	chart.render();
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
		<div ref="el" class="dash-chart-body" />
	</div>
</template>
