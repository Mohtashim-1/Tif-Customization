<script setup>
defineProps({
	summary: { type: Object, required: true },
});

const cards = (s) => [
	{ key: "total", label: "Total Sessions", value: s.total_sessions, tone: "blue", icon: "📅" },
	{ key: "done", label: "Completed", value: s.completed, tone: "green", icon: "✓" },
	{ key: "prog", label: "In Progress", value: s.in_progress, tone: "orange", icon: "⏱" },
	{ key: "up", label: "Upcoming", value: s.upcoming, tone: "purple", icon: "🗓" },
	{
		key: "rooms",
		label: "Rooms Used",
		value: `${s.rooms_used} / ${s.rooms_total}`,
		tone: "sky",
		icon: "🏢",
	},
];
</script>

<template>
	<section class="cards">
		<article v-for="c in cards(summary)" :key="c.key" class="card" :data-tone="c.tone">
			<div class="ico">{{ c.icon }}</div>
			<div>
				<div class="label">{{ c.label }}</div>
				<div class="value">{{ c.value }}</div>
			</div>
		</article>
	</section>
</template>

<style scoped>
.cards {
	display: grid;
	grid-template-columns: repeat(5, minmax(0, 1fr));
	gap: 12px;
}

.card {
	background: #fff;
	border: 1px solid var(--line);
	border-radius: 16px;
	padding: 14px 16px;
	display: flex;
	gap: 12px;
	align-items: center;
	box-shadow: var(--shadow);
	transition: transform 0.18s ease, box-shadow 0.18s ease;
}

.card:hover {
	transform: translateY(-2px);
	box-shadow: 0 10px 28px rgba(15, 23, 42, 0.08);
}

.ico {
	width: 42px;
	height: 42px;
	border-radius: 12px;
	display: grid;
	place-items: center;
	font-size: 16px;
}

.card[data-tone="blue"] .ico {
	background: #dbeafe;
}
.card[data-tone="green"] .ico {
	background: #d1fae5;
}
.card[data-tone="orange"] .ico {
	background: #ffedd5;
}
.card[data-tone="purple"] .ico {
	background: #ede9fe;
}
.card[data-tone="sky"] .ico {
	background: #e0f2fe;
}

.label {
	font-size: 12px;
	color: var(--muted);
}

.value {
	font-size: 22px;
	font-weight: 700;
	letter-spacing: -0.03em;
}

@media (max-width: 1100px) {
	.cards {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}
</style>
