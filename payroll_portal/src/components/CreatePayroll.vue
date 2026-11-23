<script setup>
import { computed, onMounted, reactive, ref, watch } from "vue";
import { apiGet, apiPost, m, uploadFile } from "../lib/api";

const props = defineProps({
	company: { type: String, default: "" },
});
const emit = defineEmits(["created", "cancel"]);

const now = new Date();
const form = reactive({
	year: now.getFullYear(),
	month: now.getMonth() + 1,
	cycle_type: "tif_payroll_month",
});
const importForm = reactive({
	year: now.getFullYear(),
	month: now.getMonth() + 1,
	sheet_names: "",
});
const preview = ref(null);
const busy = ref(false);
const error = ref("");
const ok = ref("");
const importBusy = ref(false);
const selectedFile = ref(null);
const fileInput = ref(null);

const months = [
	{ v: 1, l: "January" },
	{ v: 2, l: "February" },
	{ v: 3, l: "March" },
	{ v: 4, l: "April" },
	{ v: 5, l: "May" },
	{ v: 6, l: "June" },
	{ v: 7, l: "July" },
	{ v: 8, l: "August" },
	{ v: 9, l: "September" },
	{ v: 10, l: "October" },
	{ v: 11, l: "November" },
	{ v: 12, l: "December" },
];

const years = computed(() => {
	const y = now.getFullYear();
	return [y - 1, y, y + 1];
});

const cycleHint = computed(() =>
	form.cycle_type === "starts_on_26th"
		? "Period starts on the 26th of the selected month."
		: "Payroll month uses previous 26th → selected month 25th (TIF cycle)."
);

const importMonthLabel = computed(() => {
	const mo = months.find((x) => x.v === importForm.month);
	return mo ? mo.l : "";
});

async function refreshPreview() {
	error.value = "";
	try {
		preview.value = await apiGet(m("preview_cycle"), {
			year: form.year,
			month: form.month,
			cycle_type: form.cycle_type,
		});
	} catch (e) {
		preview.value = null;
		error.value = e.message || String(e);
	}
}

watch(
	() => [form.year, form.month, form.cycle_type],
	() => refreshPreview(),
	{ immediate: true }
);

function onFileChange(e) {
	const f = e.target?.files?.[0] || null;
	selectedFile.value = f;
	error.value = "";
}

function clearFile() {
	selectedFile.value = null;
	if (fileInput.value) fileInput.value.value = "";
}

async function create() {
	busy.value = true;
	error.value = "";
	ok.value = "";
	try {
		const res = await apiPost(m("create_period"), {
			company: props.company,
			year: form.year,
			month: form.month,
			cycle_type: form.cycle_type,
		});
		const start = res?.start_date || preview.value?.start_date;
		const end = res?.end_date || preview.value?.end_date;
		if (start && end) {
			await apiPost(m("load_employees"), {
				company: props.company,
				start_date: start,
				end_date: end,
				force: 0,
			});
		}
		ok.value = res?.message || "Payroll period created.";
		emit("created", {
			label: res?.label || preview.value?.label,
			start_date: start,
			end_date: end,
			month: form.month,
			year: form.year,
			status: "Draft",
		});
	} catch (e) {
		error.value = e.message || String(e);
	} finally {
		busy.value = false;
	}
}

async function importSalarySheet() {
	if (!selectedFile.value) {
		error.value = "Choose an Excel salary sheet (.xlsx) to import.";
		return;
	}
	importBusy.value = true;
	error.value = "";
	ok.value = "";
	try {
		const uploaded = await uploadFile(selectedFile.value, { isPrivate: false });
		const fileUrl = uploaded?.file_url || uploaded?.file_name;
		if (!fileUrl) throw new Error("Upload failed — no file URL returned.");

		const res = await apiPost(m("import_sheet"), {
			payroll_month: importForm.month,
			payroll_year: importForm.year,
			company: props.company,
			file_url: fileUrl,
			sheet_names: importForm.sheet_names || "",
			force_roster: 0,
		});

		const issueCount = Number(res?.issue_count || 0);
		const unmatched = res?.unmatched || [];
		ok.value =
			res?.message ||
			`Imported ${res?.matched || 0} employees` +
				(issueCount ? ` · ${issueCount} with issues` : "");

		const start = res?.start_date;
		const end = res?.end_date;
		if (start && end) {
			emit("created", {
				label: res?.period_label || `${start} – ${end}`,
				start_date: start,
				end_date: end,
				month: importForm.month,
				year: importForm.year,
				status: "Draft",
				issue_count: issueCount,
				issues: res?.issues || [],
				unmatched,
			});
		}
	} catch (e) {
		error.value = e.message || String(e);
	} finally {
		importBusy.value = false;
	}
}

onMounted(refreshPreview);
</script>

<template>
	<div>
		<div class="pp-topbar">
			<div>
				<h1>Create Payroll</h1>
				<p>Open a new 26th–25th cycle, load the employee roster, then amend amounts in the workbench.</p>
			</div>
			<button class="pp-btn pp-btn-ghost" type="button" @click="emit('cancel')">Back</button>
		</div>

		<div v-if="error" class="pp-alert error">{{ error }}</div>
		<div v-if="ok" class="pp-alert ok">{{ ok }}</div>

		<div class="pp-grid-2">
			<div class="pp-card">
				<div class="pp-section-head"><h2>New period</h2></div>
				<div class="pp-body">
					<div class="pp-form">
						<div class="pp-field-row">
							<div class="pp-field">
								<label>Payroll month</label>
								<select v-model.number="form.month">
									<option v-for="mo in months" :key="mo.v" :value="mo.v">{{ mo.l }}</option>
								</select>
							</div>
							<div class="pp-field">
								<label>Year</label>
								<select v-model.number="form.year">
									<option v-for="y in years" :key="y" :value="y">{{ y }}</option>
								</select>
							</div>
						</div>
						<div class="pp-field">
							<label>Cycle type</label>
							<select v-model="form.cycle_type">
								<option value="tif_payroll_month">TIF payroll month (26 → 25)</option>
								<option value="starts_on_26th">Starts on 26th of month</option>
							</select>
							<p class="pp-hint" style="margin-top: 0.4rem">{{ cycleHint }}</p>
						</div>

						<div v-if="preview" class="pp-alert info">
							<strong>Period dates:</strong> {{ preview.label || `${preview.start_date} – ${preview.end_date}` }}
						</div>

						<div class="pp-actions">
							<button class="pp-btn pp-btn-primary" type="button" :disabled="busy" @click="create">
								{{ busy ? "Creating…" : "Create & load employees" }}
							</button>
						</div>
					</div>
				</div>
			</div>

			<div class="pp-card">
				<div class="pp-section-head"><h2>Import salary sheet</h2></div>
				<div class="pp-body">
					<p class="pp-hint">
						Upload the Staff Salary Sheet Excel for
						<strong>{{ importMonthLabel }} {{ importForm.year }}</strong>
						(26th→25th cycle). Matched employees open in the amend workbench.
						Inactive / relieved employees still appear in the table with an error marker.
					</p>

					<div class="pp-form" style="margin-top: 1rem">
						<div class="pp-field-row">
							<div class="pp-field">
								<label>Payroll month</label>
								<select v-model.number="importForm.month">
									<option v-for="mo in months" :key="'i' + mo.v" :value="mo.v">{{ mo.l }}</option>
								</select>
							</div>
							<div class="pp-field">
								<label>Year</label>
								<select v-model.number="importForm.year">
									<option v-for="y in years" :key="'iy' + y" :value="y">{{ y }}</option>
								</select>
							</div>
						</div>

						<div class="pp-field">
							<label>Excel file (.xlsx)</label>
							<div class="pp-upload">
								<input
									ref="fileInput"
									class="pp-upload__input"
									type="file"
									accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
									@change="onFileChange"
								/>
								<button
									class="pp-btn pp-btn-ghost"
									type="button"
									:disabled="importBusy"
									@click="fileInput?.click()"
								>
									Choose file
								</button>
								<span class="pp-upload__name">
									{{ selectedFile ? selectedFile.name : "No file chosen" }}
								</span>
								<button
									v-if="selectedFile"
									class="pp-btn pp-btn-ghost"
									type="button"
									:disabled="importBusy"
									@click="clearFile"
								>
									Clear
								</button>
							</div>
						</div>

						<div class="pp-field">
							<label>Sheet names (optional)</label>
							<input
								v-model="importForm.sheet_names"
								type="text"
								placeholder="Leave blank to read all sheets"
							/>
							<p class="pp-hint" style="margin-top: 0.35rem">
								Comma-separated tab names, e.g. July 2026 increment, Sp Edu July 2026
							</p>
						</div>

						<div class="pp-actions">
							<button
								class="pp-btn pp-btn-warn"
								type="button"
								:disabled="importBusy || !selectedFile"
								@click="importSalarySheet"
							>
								{{ importBusy ? "Importing…" : "Upload & import" }}
							</button>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>
