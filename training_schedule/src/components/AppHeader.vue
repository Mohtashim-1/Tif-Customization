<script setup>
import { onBeforeUnmount, ref, watch } from "vue";
import { apiPost } from "../lib/api";

const props = defineProps({
	user: { type: Object, required: true },
	title: { type: String, default: "Training Schedule" },
	subtitle: { type: String, default: "Upcoming Training workspace" },
	placeholder: { type: String, default: "Search trainers, programs..." },
});
defineEmits(["notify"]);
const search = defineModel("search", { type: String, default: "" });

const menuOpen = ref(false);
const wrap = ref(null);

const profileUrl = () => `/app/user/${encodeURIComponent(props.user.id || props.user.name || "me")}`;

function onDoc(e) {
	if (wrap.value && !wrap.value.contains(e.target)) menuOpen.value = false;
}

watch(menuOpen, (v) => {
	if (v) document.addEventListener("mousedown", onDoc);
	else document.removeEventListener("mousedown", onDoc);
});
onBeforeUnmount(() => document.removeEventListener("mousedown", onDoc));

async function logout() {
	try {
		await apiPost("logout");
	} catch {
		/* still leave the portal */
	}
	window.location.href = "/login?redirect-to=/training-schedule";
}
</script>

<template>
	<header class="header">
		<div class="titles">
			<h1>{{ title }}</h1>
			<p>{{ subtitle }}</p>
		</div>
		<div class="search">
			<span class="search-ico">⌕</span>
			<input v-model="search" type="search" :placeholder="placeholder" />
		</div>
		<div class="actions">
			<button class="bell" type="button" aria-label="Notifications" @click="$emit('notify')">
				🔔
				<span v-if="user.notifications" class="badge">{{ user.notifications }}</span>
			</button>
			<div ref="wrap" class="profile-wrap">
				<button type="button" class="profile" @click="menuOpen = !menuOpen">
					<div class="avatar">{{ user.initials }}</div>
					<div>
						<div class="name">{{ user.name }}</div>
						<div class="role">{{ user.designation || user.role }}</div>
					</div>
					<span class="caret">▾</span>
				</button>
				<div v-if="menuOpen" class="menu">
					<div class="who">
						<strong>{{ user.name }}</strong>
						<small>{{ user.email || user.id }}</small>
					</div>
					<a :href="profileUrl()">My Profile</a>
					<a href="/app">Open Desk</a>
					<a href="/app/upcoming-training">Upcoming Training list</a>
					<button type="button" class="out" @click="logout">Log out</button>
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

.profile-wrap {
	position: relative;
}

.profile {
	display: flex;
	align-items: center;
	gap: 10px;
	background: #fff;
	border: 1px solid var(--line);
	border-radius: 14px;
	padding: 6px 12px 6px 6px;
	font: inherit;
}

.profile:hover,
.bell:hover {
	border-color: #c7d2fe;
}

.caret {
	color: #9ca3af;
	font-size: 12px;
}

.menu {
	position: absolute;
	right: 0;
	top: calc(100% + 8px);
	width: 240px;
	background: #fff;
	border: 1px solid var(--line);
	border-radius: 14px;
	box-shadow: 0 18px 40px rgba(15, 23, 42, 0.12);
	padding: 8px;
	z-index: 40;
	display: flex;
	flex-direction: column;
}

.who {
	padding: 8px 10px 10px;
	border-bottom: 1px solid #f3f4f6;
	margin-bottom: 6px;
}

.who strong {
	display: block;
	font-size: 13px;
}

.who small {
	color: var(--muted);
	font-size: 12px;
}

.menu a,
.out {
	display: block;
	text-align: left;
	border: 0;
	background: none;
	padding: 9px 10px;
	border-radius: 10px;
	font: inherit;
	font-weight: 600;
	font-size: 13px;
	color: #111827;
}

.menu a:hover,
.out:hover {
	background: #eef2ff;
}

.out {
	color: #b91c1c;
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
