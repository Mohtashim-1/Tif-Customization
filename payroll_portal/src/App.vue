<script setup>
import { onMounted, ref } from "vue";
import { apiGet, m } from "./lib/api";
import Dashboard from "./components/Dashboard.vue";
import CreatePayroll from "./components/CreatePayroll.vue";
import Workbench from "./components/Workbench.vue";
import SalarySlips from "./components/SalarySlips.vue";
import tifLogo from "./assets/tif_logo.png";

const boot = window.payroll_portal_boot || {};
const page = ref("dashboard"); // dashboard | create | workbench | slips
const company = ref(boot.company || "");
const session = ref({
	full_name: boot.full_name || boot.user || "",
	user: boot.user || "",
	can_edit: true,
	can_approve: false,
	can_finalize: true,
});
const activePeriod = ref(null);
const bootError = ref("");

const menus = [
	{ id: "dashboard", title: "Dashboard", sub: "Payroll Register" },
	{ id: "create", title: "Run Payroll", sub: "New 26–25 cycle" },
	{ id: "workbench", title: "Amend Payroll", sub: "Adjust & finalize" },
	{ id: "slips", title: "Salary Slips", sub: "View & print slips" },
];

function go(id) {
	page.value = id;
}

function openPeriod(p) {
	activePeriod.value = p;
	page.value = "workbench";
}

function onCreated(p) {
	activePeriod.value = p;
	page.value = "workbench";
}

onMounted(async () => {
	try {
		const data = await apiGet(m("portal_boot"));
		session.value = { ...session.value, ...data };
		if (data.company) company.value = data.company;
	} catch (e) {
		bootError.value = e.message || String(e);
	}
});
</script>

<template>
	<div class="pp-shell" :class="{ 'is-workbench': page === 'workbench' }">
		<aside class="pp-nav">
			<div class="pp-brand">
				<img class="pp-brand__logo" :src="tifLogo" alt="The ILM Foundation" />
				<div class="pp-brand__text">
					<p class="pp-brand__eyebrow">The ILM Foundation</p>
					<h1 class="pp-brand__name">ILM Portal</h1>
				</div>
			</div>

			<nav class="pp-nav__list">
				<button
					v-for="item in menus"
					:key="item.id"
					type="button"
					class="pp-nav__btn"
					:class="{ 'is-active': page === item.id }"
					@click="go(item.id)"
				>
					<strong>{{ item.title }}</strong>
					<span>{{ item.sub }}</span>
				</button>
			</nav>

			<div class="pp-nav__user">
				<strong>{{ session.full_name || "User" }}</strong>
				<span>{{ session.user }}</span>
			</div>
		</aside>

		<main
			class="pp-main"
			:class="{ 'is-workbench': page === 'workbench', 'is-create': page === 'create' }"
		>
			<div v-if="bootError" class="pp-alert error">{{ bootError }}</div>

			<Dashboard
				v-if="page === 'dashboard'"
				:company="company"
				@create="go('create')"
				@open="openPeriod"
			/>
			<CreatePayroll
				v-else-if="page === 'create'"
				:company="company"
				@created="onCreated"
				@cancel="go('dashboard')"
			/>
			<SalarySlips v-else-if="page === 'slips'" :company="company" />
			<Workbench
				v-else
				:company="company"
				:period="activePeriod"
				:can-edit="session.can_edit"
				:can-approve="session.can_approve"
				:can-finalize="session.can_finalize"
				@back="go('dashboard')"
			/>
		</main>
	</div>
</template>
