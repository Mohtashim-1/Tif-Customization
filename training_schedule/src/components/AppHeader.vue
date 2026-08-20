<script setup>
defineProps({
	user: { type: Object, required: true },
});
const search = defineModel("search", { type: String, default: "" });
</script>

<template>
	<header class="header">
		<div class="titles">
			<h1>Training Schedule</h1>
			<p>Manage and view all trainer schedules</p>
		</div>
		<div class="search">
			<span class="search-ico">⌕</span>
			<input v-model="search" type="search" placeholder="Search trainers, programs..." />
		</div>
		<div class="actions">
			<button class="bell" type="button" aria-label="Notifications">
				🔔
				<span v-if="user.notifications" class="badge">{{ user.notifications }}</span>
			</button>
			<div class="profile">
				<div class="avatar">{{ user.initials }}</div>
				<div>
					<div class="name">{{ user.name }}</div>
					<div class="role">{{ user.role }}</div>
				</div>
			</div>
		</div>
	</header>
</template>

<style scoped>
.header {
	display: grid;
	grid-template-columns: 1fr minmax(220px, 420px) auto;
	gap: 18px;
	align-items: center;
}

.titles h1 {
	margin: 0;
	font-size: 28px;
	letter-spacing: -0.03em;
}

.titles p {
	margin: 4px 0 0;
	color: var(--muted);
	font-size: 14px;
}

.search {
	position: relative;
}

.search-ico {
	position: absolute;
	left: 14px;
	top: 50%;
	transform: translateY(-50%);
	color: #9ca3af;
}

.search input {
	width: 100%;
	border: 1px solid var(--line);
	background: #fff;
	border-radius: 999px;
	padding: 12px 16px 12px 38px;
	outline: none;
	box-shadow: var(--shadow);
}

.search input:focus {
	border-color: #c7d2fe;
	box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.12);
}

.actions {
	display: flex;
	align-items: center;
	gap: 14px;
	justify-content: flex-end;
}

.bell {
	position: relative;
	width: 42px;
	height: 42px;
	border-radius: 12px;
	border: 1px solid var(--line);
	background: #fff;
}

.badge {
	position: absolute;
	top: -4px;
	right: -4px;
	background: #ef4444;
	color: #fff;
	font-size: 10px;
	font-weight: 700;
	min-width: 18px;
	height: 18px;
	border-radius: 999px;
	display: grid;
	place-items: center;
}

.profile {
	display: flex;
	align-items: center;
	gap: 10px;
	background: #fff;
	border: 1px solid var(--line);
	border-radius: 14px;
	padding: 6px 12px 6px 6px;
}

.avatar {
	width: 36px;
	height: 36px;
	border-radius: 999px;
	background: linear-gradient(145deg, #818cf8, #6366f1);
	color: #fff;
	display: grid;
	place-items: center;
	font-weight: 700;
	font-size: 12px;
}

.name {
	font-weight: 600;
	font-size: 13px;
}

.role {
	font-size: 12px;
	color: var(--muted);
}

@media (max-width: 1100px) {
	.header {
		grid-template-columns: 1fr;
	}
}
</style>
