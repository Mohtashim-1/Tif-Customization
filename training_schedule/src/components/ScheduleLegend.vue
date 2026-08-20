<script setup>
import { CATEGORIES } from "../data/mock";
</script>

<template>
	<footer class="legend">
		<div class="block">
			<span class="title">Categories</span>
			<span v-for="c in CATEGORIES" :key="c.key" class="item">
				<i :style="{ background: c.color }"></i>
				{{ c.label }}
			</span>
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
}

.item i {
	width: 10px;
	height: 10px;
	border-radius: 999px;
	display: inline-block;
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
