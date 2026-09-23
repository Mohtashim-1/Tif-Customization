<script setup>
import { categoriesFromSessions } from "../data/mock";

const props = defineProps({
	sessions: { type: Array, default: () => [] },
});
</script>

<template>
	<footer class="legend">
		<div class="block">
			<span class="title">Courses</span>
			<span v-for="c in categoriesFromSessions(sessions)" :key="c.key" class="item">
				<i :style="{ background: c.color }"></i>
				{{ c.label }}
			</span>
			<span v-if="!sessions.length" class="item">No courses in this range</span>
		</div>
		<div class="block">
			<span class="title">Status</span>
			<span class="item"><b class="done">✓</b> Completed</span>
			<span class="item"><b class="prog">●</b> In Progress</span>
			<span class="item"><b class="up">○</b> Upcoming</span>
		</div>
	</footer>
</template>

<style scoped>
.legend {
	display: flex;
	flex-wrap: wrap;
	justify-content: space-between;
	gap: 12px;
	padding: 4px 2px;
	color: #4b5563;
	font-size: 13px;
}

.block {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 12px;
}

.title {
	font-weight: 700;
	color: #111827;
	margin-right: 4px;
}

.item {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	max-width: 280px;
}

.item i {
	width: 10px;
	height: 10px;
	border-radius: 999px;
	display: inline-block;
	flex: 0 0 auto;
}

.done {
	color: #059669;
}
.prog {
	color: #d97706;
}
.up {
	color: #7c3aed;
}
</style>
