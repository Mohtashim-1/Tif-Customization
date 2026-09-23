<script setup>
import { computed, ref, reactive } from "vue";
import {
	state,
	go,
	courseById,
	studentById,
	certById,
	revokeCertificate,
	currentStudent,
	toast,
} from "../store";
import BrandLogo from "../components/BrandLogo.vue";
import ListTools from "../components/ListTools.vue";
import { useRowSelection } from "../lib/list";
import { exportTable } from "../lib/format";

const reason = ref("");
const verifyInput = ref(state.selectedCertId || "CERT-HLT-2026-000088");
const filters = reactive({ status: "" });
const me = computed(() => currentStudent());
const cert = computed(() => certById(state.selectedCertId) || state.certificates[0]);
const verifyCert = computed(() => certById(state.selectedCertId));
const student = computed(() => studentById(cert.value?.studentId));
const course = computed(() => courseById(cert.value?.courseId));
const mine = computed(() =>
	state.certificates.filter((c) => {
		if (state.roleId === "student" && me.value && c.studentId !== me.value.id) return false;
		if (filters.status && c.status !== filters.status) return false;
		return true;
	})
);
const sel = useRowSelection(mine);
const kpis = computed(() => [
	{ label: "Certificates", value: String(mine.value.length) },
	{ label: "Valid", value: String(mine.value.filter((c) => c.status === "Valid").length) },
	{ label: "Revoked", value: String(mine.value.filter((c) => c.status === "Revoked").length) },
]);
const tplSel = useRowSelection(computed(() => state.templates));
const tplKpis = computed(() => [
	{ label: "Templates", value: String(state.templates.length) },
	{ label: "Active", value: String(state.templates.filter((t) => t.status === "Active").length) },
]);
const verifyUrl = computed(() => {
	const origin = window.location.origin;
	return `${origin}/training-lms/certificate/verify/${cert.value?.id || ""}`;
});
const qrSrc = computed(
	() => `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(verifyUrl.value)}`
);

function open(c) {
	state.selectedCertId = c.id;
	go("cert_view", "certs");
}

function doVerify() {
	state.selectedCertId = verifyInput.value.trim();
}

function revoke() {
	if (!cert.value) return;
	revokeCertificate(cert.value.id, reason.value);
	toast("Certificate revoked.");
}

function exportMine(kind) {
	const rows = sel.chosen().map((c) => ({
		certificate: c.id,
		student: studentById(c.studentId)?.name,
		course: courseById(c.courseId)?.name,
		issue: c.issue,
		expiry: c.expiry,
		status: c.status,
	}));
	exportTable(rows, ["certificate", "student", "course", "issue", "expiry", "status"], kind, "my-certificates");
	if (kind !== "print" && kind !== "pdf") toast("Export ready.");
}

function exportTemplates(kind) {
	const rows = tplSel.chosen().map((t) => ({ name: t.name, courses: t.courses, status: t.status }));
	exportTable(rows, ["name", "courses", "status"], kind, "certificate-templates");
	if (kind !== "print" && kind !== "pdf") toast("Export ready.");
}
</script>

<template>
	<div v-if="state.screen === 'cert_issued' && cert" class="card" style="max-width: 640px; margin: 0 auto; text-align: center">
		<div style="font-size: 40px">🎓</div>
		<h2>Certificate generated</h2>
		<p>An email with View Certificate and Download PDF links has been queued to {{ student?.email }}.</p>
		<p><strong>{{ cert.id }}</strong></p>
		<div class="row" style="justify-content: center">
			<button class="btn primary" type="button" @click="go('cert_view')">View certificate</button>
			<button class="btn" type="button" @click="go('my_certs', 'certs')">My certificates</button>
		</div>
	</div>

	<div v-else-if="state.screen === 'cert_view' && cert" class="cert">
		<BrandLogo :size="72" style="margin: 0 auto 8px" />
		<div class="q-meta">{{ state.orgName }}</div>
		<h2>Certificate of Completion</h2>
		<p>This is to certify that</p>
		<h3 style="font-family: var(--serif); font-size: 28px; margin: 4px 0">{{ student?.name }}</h3>
		<p>{{ student?.id }}</p>
		<p>has successfully completed</p>
		<h3>{{ course?.name }}</h3>
		<p>{{ course?.code }} · Trainer {{ course?.trainer }}</p>
		<p>Result {{ cert.grade }} · Issued {{ cert.issue }} · Valid until {{ cert.expiry }}</p>
		<p style="font-family: var(--mono)">{{ cert.id }}</p>
		<img :src="qrSrc" width="120" height="120" alt="Verify QR" />
		<p class="pill" :class="cert.status === 'Valid' ? 'ok' : 'warn'">{{ cert.status }}</p>
		<div class="row" style="justify-content: center; margin-top: 12px">
			<button class="btn primary" type="button" @click="window.print()">Download PDF</button>
			<button class="btn" type="button" @click="state.selectedCertId = cert.id; go('cert_verify')">Verify certificate</button>
		</div>
	</div>

	<div v-else-if="state.screen === 'cert_verify'" class="mobile-public" style="max-width: 560px">
		<div style="display: flex; flex-direction: column; align-items: center; gap: 8px; margin-bottom: 12px">
			<BrandLogo :size="64" />
			<div style="font-weight: 700">{{ state.orgName }}</div>
		</div>
		<div class="q-meta">Public verification</div>
		<h2>Verify a certificate</h2>
		<label class="field">
			<span>Certificate number</span>
			<input v-model="verifyInput" placeholder="CERT-H2S-2026-001245" />
		</label>
		<button class="btn primary" style="margin: 12px 0" type="button" @click="doVerify">Verify</button>
		<div v-if="!state.selectedCertId" class="empty">Enter a certificate number to continue.</div>
		<div v-else-if="!verifyCert" class="card" style="text-align: center">
			<h2>❌ CERTIFICATE NOT FOUND</h2>
		</div>
		<div v-else class="card" style="text-align: center">
			<h2 v-if="verifyCert.status === 'Revoked'">⚠️ CERTIFICATE REVOKED</h2>
			<h2 v-else-if="verifyCert.status === 'Expired'">⚠️ CERTIFICATE EXPIRED</h2>
			<h2 v-else>✅ VERIFIED CERTIFICATE</h2>
			<p>Student: {{ studentById(verifyCert.studentId)?.name }}</p>
			<p>Student ID: {{ verifyCert.studentId }}</p>
			<p>Course: {{ courseById(verifyCert.courseId)?.name }}</p>
			<p>Issue date: {{ verifyCert.issue }}</p>
			<p>Certificate: {{ verifyCert.id }}</p>
			<p>Status: {{ verifyCert.status }}</p>
			<p v-if="verifyCert.revokedReason">Reason: {{ verifyCert.revokedReason }}</p>
		</div>
		<button class="btn" type="button" @click="go('login')">Back to sign in</button>
	</div>

	<div v-else-if="state.screen === 'my_certs'">
		<ListTools
			:kpis="kpis"
			:count="mine.length"
			:selected="sel.selected.length"
			@export-csv="exportMine('csv')"
			@export-xlsx="exportMine('xlsx')"
			@export-print="exportMine('print')"
		>
			<div class="form-grid">
				<label class="field">
					<span>Status</span>
					<select v-model="filters.status">
						<option value="">All statuses</option>
						<option>Valid</option>
						<option>Revoked</option>
						<option>Expired</option>
					</select>
				</label>
			</div>
		</ListTools>
		<div class="course-grid">
			<article v-for="c in mine" :key="c.id" class="card" :class="{ selected: sel.selectedSet.has(c.id) }">
				<label class="row" style="gap: 8px" @click.stop>
					<input type="checkbox" :checked="sel.selectedSet.has(c.id)" @change="sel.toggle(c.id, $event)" />
					<div class="q-meta">{{ c.id }}</div>
				</label>
				<h3>{{ courseById(c.courseId)?.name }}</h3>
				<p>Issued {{ c.issue }} · Expires {{ c.expiry }}</p>
				<span class="pill" :class="c.status === 'Valid' ? 'ok' : 'warn'">{{ c.status }}</span>
				<div class="row" style="margin-top: 12px">
					<button class="btn primary" type="button" @click="open(c)">View certificate</button>
					<button class="btn" type="button" @click="window.print()">Download PDF</button>
					<button class="btn ghost" type="button" @click="state.selectedCertId = c.id; go('cert_verify')">Verify</button>
				</div>
			</article>
		</div>
	</div>

	<div v-else-if="state.screen === 'cert_templates'">
		<div class="row" style="justify-content: space-between">
			<h3 style="margin: 0">Certificate templates</h3>
			<button class="btn primary" type="button" @click="toast('Template saved as ILM Foundation Classic.')">New template</button>
		</div>
		<ListTools
			:kpis="tplKpis"
			:count="state.templates.length"
			:selected="tplSel.selected.length"
			@export-csv="exportTemplates('csv')"
			@export-xlsx="exportTemplates('xlsx')"
			@export-print="exportTemplates('print')"
		/>
		<div class="course-grid">
			<article v-for="t in state.templates" :key="t.id" class="card" :class="{ selected: tplSel.selectedSet.has(t.id) }">
				<label class="row" style="gap: 8px; margin-bottom: 8px" @click.stop>
					<input type="checkbox" :checked="tplSel.selectedSet.has(t.id)" @change="tplSel.toggle(t.id, $event)" />
					<div class="cover teal" style="height: 80px; flex: 1" />
				</label>
				<h3>{{ t.name }}</h3>
				<p>{{ t.courses }} courses · {{ t.status }}</p>
				<button class="btn" type="button">Edit layout</button>
			</article>
		</div>
		<div v-if="cert" class="card">
			<h3>Revoke an issued certificate</h3>
			<p>{{ cert.id }} — {{ studentById(cert.studentId)?.name }}</p>
			<label class="field"><span>Revocation reason</span><input v-model="reason" placeholder="Attendance dispute / policy" /></label>
			<button class="btn danger" style="margin-top: 10px" type="button" @click="revoke">Revoke</button>
		</div>
	</div>
</template>
