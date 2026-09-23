<script setup>
import { computed } from "vue";
import {
	state,
	role,
	go,
	goBack,
	canBack,
	signOut,
	navItems,
	titles,
} from "../store";
import BrandLogo from "./BrandLogo.vue";

const items = computed(() => navItems());
const meta = computed(() => titles[state.screen] || ["", ""]);
const initials = computed(() =>
	role.value.name
		.split(" ")
		.map((w) => w[0])
		.join("")
		.slice(0, 2)
);
const navKey = computed(() => {
	const hit = items.value.find((n) => n.screen === state.screen);
	return hit?.key || state.nav;
});
</script>

<template>
	<div class="shell">
		<aside class="side">
			<div class="brand">
				<BrandLogo :size="32" />
				<div>{{ state.orgName }}</div>
			</div>
			<nav>
				<button
					v-for="item in items"
					:key="item.key"
					class="nav-btn"
					:class="{ on: item.key === navKey }"
					type="button"
					@click="go(item.screen, item.key, { root: true })"
				>
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
						<path :d="item.d" />
					</svg>
					<span>{{ item.label }}</span>
				</button>
			</nav>
			<div class="side-foot">
				<button class="signout" type="button" @click="signOut">Sign out</button>
			</div>
		</aside>
		<div style="display: flex; flex-direction: column; min-width: 0">
			<div class="hidden-desk">
				<button
					v-for="item in items"
					:key="'m-' + item.key"
					class="btn"
					:class="{ primary: item.key === navKey }"
					type="button"
					@click="go(item.screen, item.key, { root: true })"
				>
					{{ item.label }}
				</button>
			</div>
			<header class="top">
				<button v-if="canBack" class="back-btn" type="button" @click="goBack">
					← Back
				</button>
				<div style="min-width: 0">
					<div class="crumb">{{ meta[0] }}</div>
					<div class="screen-title">{{ meta[1] }}</div>
				</div>
				<div class="grow">
					<div class="search">
						<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7C9198" stroke-width="2">
							<circle cx="11" cy="11" r="7" />
							<path d="m20 20-3.5-3.5" />
						</svg>
						<input v-model="state.headerSearch" placeholder="Search students, courses…" />
					</div>
					<button class="icon-btn" type="button" @click="go('notifications', 'notifications')">
						<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#0B2027" stroke-width="1.8" stroke-linecap="round">
							<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />
						</svg>
						<span v-if="state.notifications.some((n) => n.unread)" class="dot" />
					</button>
					<button class="who" type="button" @click="go('profile', 'profile')">
						<div class="ava">{{ initials }}</div>
						<div style="text-align: left">
							<div style="font: 600 12.5px Manrope, sans-serif; line-height: 1.2">{{ role.name }}</div>
							<div style="font: 400 11px Manrope, sans-serif; color: #7c9198">{{ role.label }}</div>
						</div>
					</button>
				</div>
			</header>
			<main class="main">
				<div v-if="state.docLoading" class="doc-loading">
					<div class="doc-load-bar" />
					<div class="card">
						<div class="skel skel-title" />
						<div class="skel skel-sub" />
						<div class="form-grid" style="margin-top: 18px">
							<div v-for="n in 6" :key="n" class="skel skel-field" />
						</div>
					</div>
					<p class="doc-load-msg">Opening document…</p>
				</div>
				<slot v-else />
			</main>
		</div>
	</div>
</template>
