<script setup>
defineProps({
	weekLabel: { type: String, required: true },
	trainers: { type: Array, default: () => [] },
	programs: { type: Array, default: () => [] },
});
defineEmits(["prev", "next", "add", "export"]);
const trainer = defineModel("trainer", { type: String, default: "all" });
const program = defineModel("program", { type: String, default: "all" });
const status = defineModel("status", { type: String, default: "all" });
</script>

<template>
	<div class="bar">
		<div class="week">
			<button type="button" class="nav" @click="$emit('prev')">‹</button>
			<span>{{ weekLabel }}</span>
			<button type="button" class="nav" @click="$emit('next')">›</button>
		</div>

		<div class="filters">
			<select v-model="trainer">
				<option value="all">All Trainers</option>
				<option v-for="t in trainers" :key="t.id" :value="t.id">{{ t.name }}</option>
			</select>
			<select v-model="program">
				<option value="all">All Programs</option>
				<option v-for="p in programs" :key="p" :value="p">{{ p }}</option>
			</select>
			<select v-model="status">
				<option value="all">All Status</option>
				<option value="completed">Completed</option>
				<option value="in_progress">In Progress</option>
				<option value="upcoming">Upcoming</option>
			</select>
		</div>

		<div class="actions">
			<button type="button" class="primary" @click="$emit('add')">+ New Training</button>
			<button type="button" class="ghost" @click="$emit('export')">⬇ Export</button>
		</div>
	</div>
</template>

<style scoped>
.bar {
	display: flex;
	flex-wrap: wrap;
	gap: 12px;
	align-items: center;
	justify-content: space-between;
	background: #fff;
	border: 1px solid var(--line);
	border-radius: 16px;
	padding: 12px 14px;
	box-shadow: var(--shadow);
}

.week {
	display: flex;
	align-items: center;
	gap: 10px;
	font-weight: 600;
	min-width: 240px;
}

.nav {
	width: 32px;
	height: 32px;
	border-radius: 10px;
	border: 1px solid var(--line);
	background: #fff;
}

.filters {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

select {
	border: 1px solid var(--line);
	background: #f9fafb;
	border-radius: 10px;
	padding: 8px 12px;
	min-width: 140px;
}

.actions {
	display: flex;
	gap: 8px;
}

.primary,
.ghost {
	border-radius: 10px;
	padding: 10px 14px;
	font-weight: 600;
	border: 1px solid transparent;
}

.primary {
	background: linear-gradient(90deg, #4f46e5, #6366f1);
	color: #fff;
	box-shadow: 0 8px 16px rgba(79, 70, 229, 0.25);
}

.ghost {
	background: #fff;
	border-color: var(--line);
	color: #374151;
}
</style>
