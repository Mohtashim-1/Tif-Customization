<script setup>
import { computed } from "vue";
import { categoriesFromSessions } from "../data/mock";

const props = defineProps({
	summary: { type: Object, required: true },
	sessions: { type: Array, default: () => [] },
	activeKey: { type: String, default: "" },
});
const emit = defineEmits(["select"]);

const statusCards = computed(() => {
	const s = props.summary || {};
	return [
		{ kind: "status", key: "total", label: "Total Sessions", value: s.total_sessions || 0, tone: "blue", icon: "📅" },
		{ kind: "status", key: "completed", label: "Completed", value: s.completed || 0, tone: "green", icon: "✓" },
		{ kind: "status", key: "in_progress", label: "In Progress", value: s.in_progress || 0, tone: "orange", icon: "⏱" },
		{ kind: "status", key: "upcoming", label: "Upcoming", value: s.upcoming || 0, tone: "purple", icon: "🗓" },
		{
			kind: "status",
			key: "rooms",
			label: "Rooms Used",
			value: `${s.rooms_used || 0} / ${s.rooms_total || 8}`,
			tone: "sky",
			icon: "🏢",
		},
	];
});

const categoryCards = computed(() =>
	categoriesFromSessions(props.sessions).map((cat) => ({
		kind: "category",
		key: cat.key,
		label: cat.label,
		value: cat.count,
		color: cat.color,
	}))
);

function select(card) {
	emit("select", card);
}
</script>

<template>
	<section class="wrap">
		<div class="cards">
			<button
				v-for="c in statusCards"
				:key="c.key"
				type="button"
				class="card"
				:data-tone="c.tone"
				:class="{ on: activeKey === c.key }"
				@click="select(c)"
			>
				<div class="ico">{{ c.icon }}</div>
				<div>
					<div class="label">{{ c.label }}</div>
					<div class="value">{{ c.value }}</div>
				</div>
			</button>
		</div>

		<p class="cat-title">By course / session</p>
		<div v-if="!categoryCards.length" class="cat-empty">No courses in this date range.</div>
		<div v-else class="cats">
			<button
				v-for="c in categoryCards"
				:key="c.key"
				type="button"
				class="cat"
				:class="{ on: activeKey === c.key }"
				@click="select(c)"
			>
				<span class="dot" :style="{ background: c.color }"></span>
				<span class="cat-label">{{ c.label }}</span>
				<strong>{{ c.value }}</strong>
			</button>
		</div>
	</section>
</template>

<style scoped>
.wrap {
	display: flex;
	flex-direction: column;
	gap: 10px;
}
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
	text-align: left;
	cursor: pointer;
	transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
}

.card:hover,
.cat:hover {
	transform: translateY(-2px);
	box-shadow: 0 10px 28px rgba(15, 23, 42, 0.08);
}

.card.on {
	border-color: #6366f1;
	box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.18);
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

.cat-empty {
	font-size: 13px;
	color: var(--muted);
}

.cats {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
	gap: 8px;
}

.cat {
	background: #fff;
	border: 1px solid var(--line);
	border-radius: 12px;
	padding: 10px 12px;
	display: flex;
	align-items: center;
	gap: 8px;
	cursor: pointer;
	text-align: left;
	box-shadow: var(--shadow);
}

.cat.on {
	border-color: #6366f1;
	box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.16);
}

.dot {
	width: 8px;
	height: 8px;
	border-radius: 99px;
	flex: 0 0 auto;
}

.cat-label {
	flex: 1;
	font-size: 12px;
	color: #334155;
	font-weight: 600;
	line-height: 1.3;
	display: -webkit-box;
	-webkit-line-clamp: 2;
	-webkit-box-orient: vertical;
	overflow: hidden;
}

.cat strong {
	font-size: 16px;
}

@media (max-width: 1100px) {
	.cards {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
	.cats {
		grid-template-columns: 1fr;
	}
}
</style>
