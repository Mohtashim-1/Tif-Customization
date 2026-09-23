<script setup>
import { computed, reactive, ref } from "vue";
import { state, go, portalSignIn, demoScan } from "../store";
import BrandLogo from "../components/BrandLogo.vue";

const form = reactive({ usr: "", pwd: "" });
const busy = ref(false);
const error = ref("");

const studentMode = computed(() => /^[\d+\s-]{7,}$/.test(String(form.usr || "").trim()));

async function submit() {
	error.value = "";
	busy.value = true;
	try {
		await portalSignIn(form.usr, form.pwd);
	} catch (e) {
		error.value = e.message || "Could not sign in.";
	} finally {
		busy.value = false;
	}
}
</script>

<template>
	<div class="login-grid">
		<div class="login-hero">
			<div class="brand" style="padding: 0">
				<BrandLogo :size="44" />
				<div style="font-size: 17px">{{ state.orgName }}</div>
			</div>
			<div style="max-width: 440px; display: flex; flex-direction: column; gap: 22px">
				<div class="q-meta" style="color: #63c9c0">Training · Attendance · LMS · Certification</div>
				<h1 style="font: 700 42px/1.12 'Source Serif 4', serif; margin: 0; letter-spacing: -0.015em">
					One portal from the classroom door to the certificate.
				</h1>
				<p style="font: 400 15px/1.65 Manrope, sans-serif; color: #a9cfcb; margin: 0">
					Scan-to-attend QR sessions, a mobile-first learner journey, assessments that grade themselves, and
					verifiable digital certificates — connected end to end.
				</p>
			</div>
			<div style="font: 400 12px Manrope, sans-serif; color: #6fa8a3">Connected training platform</div>
		</div>
		<div style="background: #fff; display: flex; align-items: center; justify-content: center; padding: 48px 40px">
			<form style="width: 100%; max-width: 380px; display: flex; flex-direction: column; gap: 18px" @submit.prevent="submit">
				<div>
					<h2 style="font: 700 26px/1.2 Manrope, sans-serif; margin: 0 0 6px">Welcome back</h2>
					<p style="font: 400 14px/1.5 Manrope, sans-serif; color: #5c7078; margin: 0">
						Sign in with your account. Your role is applied automatically.
					</p>
				</div>
				<label class="field">
					<span>{{ studentMode ? "Mobile number" : "Mobile number or email" }}</span>
					<input
						v-model="form.usr"
						autocomplete="username"
						:inputmode="studentMode ? 'tel' : 'email'"
						placeholder="03XX XXXXXXX or staff email"
					/>
				</label>
				<label class="field">
					<span>{{ studentMode ? "Password (last 4 digits of mobile)" : "Password" }}</span>
					<input v-model="form.pwd" type="password" autocomplete="current-password" :placeholder="studentMode ? 'Last 4 digits' : 'Password'" />
				</label>
				<p style="margin: 0; font-size: 13px; color: #5c7078; line-height: 1.45">
					<strong>Students:</strong> login is your mobile number. Password is the last 4 digits of that number.
					Staff use their ERP email and password — the portal detects admin, trainer, or coordinator from your account.
				</p>
				<p v-if="error" class="pill warn" style="margin: 0">{{ error }}</p>
				<button class="btn primary" type="submit" style="padding: 14px; font-size: 15px" :disabled="busy">
					{{ busy ? "Signing in…" : "Sign in" }}
				</button>
				<div style="height: 1px; background: #e8eeee" />
				<button class="btn ghost" type="button" style="text-align: left" @click="demoScan">
					I scanned a session QR code →
				</button>
				<button class="btn" type="button" style="text-align: left" @click="go('cert_verify')">
					Verify a certificate →
				</button>
			</form>
		</div>
	</div>
</template>
