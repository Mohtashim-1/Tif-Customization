<script setup>
import { computed, onMounted, reactive, ref, watch } from "vue";
import { apiGet, apiPost, m, money } from "../lib/api";

const props = defineProps({
	company: { type: String, default: "" },
	period: { type: Object, default: null },
	canEdit: { type: Boolean, default: true },
	canApprove: { type: Boolean, default: false },
	canFinalize: { type: Boolean, default: true },
	/** all | main | special_education */
	segment: { type: String, default: "all" },
});
const emit = defineEmits(["back"]);

function isSpecialEducationRow(r) {
	const hay = `${r.department || ""} ${r.designation || ""} ${r.branch || ""}`.toLowerCase();
	return (
		hay.includes("special education") ||
		hay.includes("special child") ||
		hay.includes("sp.edu") ||
		hay.includes("sp.ed") ||
		hay.includes("s.edu") ||
		hay.includes("sp edu")
	);
}

function isSpecialEducationSection(label) {
	const t = String(label || "").toLowerCase();
	return t.includes("special") && (t.includes("education") || t.includes("child"));
}

const loading = ref(true);
const saving = ref(false);
const error = ref("");
const ok = ref("");
const sheet = ref(null);
const search = ref("");
const editableKeys = ref([]);
const periodList = ref([]);
const localPeriod = ref(null);
const showFilters = ref(true);
const showIssuesOnly = ref(false);

/** Frappe child-table style column filters */
const colFilter = reactive({
	serial: "",
	employee: "",
	department: "",
	gross: "",
	net: "",
	mode: "",
	amounts: {},
});

const effectivePeriod = computed(() => props.period || localPeriod.value);

const status = computed(
	() => sheet.value?.period_status?.status || effectivePeriod.value?.status || "Draft"
);
const locked = computed(() =>
	["Pending COO Approval", "Approved", "Finalized"].includes(status.value)
);
const canSave = computed(() => props.canEdit && !locked.value && status.value !== "Finalized");

const flatRows = computed(() => {
	const sections = sheet.value?.sections || [];
	const out = [];
	const segment = props.segment || "all";
	for (const sec of sections) {
		const secIsSp = isSpecialEducationSection(sec.label);
		let rows = sec.rows || [];
		if (segment === "special_education") {
			rows = rows.filter((r) => isSpecialEducationRow(r) || secIsSp);
			if (!rows.length && !(secIsSp && sec.header_only)) continue;
		} else if (segment === "main") {
			if (secIsSp) continue;
			rows = rows.filter((r) => !isSpecialEducationRow(r));
			if (!rows.length && !sec.header_only) continue;
		}
		if (sec.header_only && !rows.length) {
			if (segment === "special_education" && !secIsSp) continue;
			out.push({ _type: "section", label: sec.label });
			continue;
		}
		if (rows.length) {
			out.push({ _type: "section", label: sec.label });
			for (const r of rows) out.push({ _type: "row", ...r });
		}
	}
	return out;
});

const pageTitle = computed(() =>
	props.segment === "special_education" ? "Special Education Payroll" : "Amend Payroll"
);
const pageSubtitle = computed(() =>
	props.segment === "special_education"
		? "Sp Edu staff only — amounts are editable; save keeps your adjustments."
		: null
);

const activeFilterCount = computed(() => {
	let n = 0;
	if (colFilter.serial) n += 1;
	if (colFilter.employee) n += 1;
	if (colFilter.department) n += 1;
	if (colFilter.gross) n += 1;
	if (colFilter.net) n += 1;
	if (colFilter.mode) n += 1;
	for (const v of Object.values(colFilter.amounts || {})) {
		if (String(v || "").trim()) n += 1;
	}
	if (search.value.trim()) n += 1;
	return n;
});

function matchText(hay, needle) {
	const n = String(needle || "").trim().toLowerCase();
	if (!n) return true;
	return String(hay ?? "")
		.toLowerCase()
		.includes(n);
}

function matchNumber(value, needle) {
	const n = String(needle || "").trim();
	if (!n) return true;
	const raw = String(value ?? "");
	// Support > < >= <= = prefixes like power users expect
	const mOp = n.match(/^(>=|<=|>|<|=)\s*(-?\d+(?:\.\d+)?)$/);
	if (mOp) {
		const op = mOp[1];
		const target = Number(mOp[2]);
		const num = Number(value || 0);
		if (op === ">") return num > target;
		if (op === "<") return num < target;
		if (op === ">=") return num >= target;
		if (op === "<=") return num <= target;
		return num === target;
	}
	return raw.includes(n) || String(Number(value || 0)).includes(n);
}

function rowMatchesFilters(r) {
	if (showIssuesOnly.value && !r.has_issue) return false;
	if (!matchText(`${r.employee_name || ""} ${r.employee || ""}`, colFilter.employee)) return false;
	if (!matchText(r.department, colFilter.department)) return false;
	if (!matchText(r.serial, colFilter.serial)) return false;
	if (!matchNumber(r.projected_gross_pay, colFilter.gross)) return false;
	if (!matchNumber(r.projected_net_pay, colFilter.net)) return false;
	if (!matchText(r.payment?.payment_mode, colFilter.mode)) return false;
	for (const col of editableKeys.value) {
		const f = colFilter.amounts[col.key];
		if (!matchNumber(r.amounts?.[col.key], f)) return false;
	}
	const q = search.value.trim().toLowerCase();
	if (q) {
		const hay = `${r.employee_name || ""} ${r.employee || ""} ${r.department || ""} ${r.branch || ""}`.toLowerCase();
		if (!hay.includes(q)) return false;
	}
	return true;
}

const issueCount = computed(() => Number(sheet.value?.issue_count || sheet.value?.employee_issues?.length || 0));

const filteredRows = computed(() => {
	const keep = new Set();
	let lastSection = null;
	for (const r of flatRows.value) {
		if (r._type === "section") {
			lastSection = r;
			continue;
		}
		if (rowMatchesFilters(r)) {
			if (lastSection) keep.add(lastSection);
			keep.add(r);
		}
	}
	return flatRows.value.filter((r) => keep.has(r));
});

const visibleEmployeeCount = computed(
	() => filteredRows.value.filter((r) => r._type === "row").length
);

const totals = computed(() => {
	let net = 0;
	let gross = 0;
	let n = 0;
	for (const r of flatRows.value) {
		if (r._type !== "row") continue;
		n += 1;
		net += Number(r.projected_net_pay || 0);
		gross += Number(r.projected_gross_pay || 0);
	}
	return { n, net, gross };
});

/** Footer totals for currently visible (filtered) employee rows */
const tableTotals = computed(() => {
	const amounts = {};
	for (const col of editableKeys.value) amounts[col.key] = 0;
	let gross = 0;
	let net = 0;
	let n = 0;
	for (const r of filteredRows.value) {
		if (r._type !== "row") continue;
		n += 1;
		gross += Number(r.projected_gross_pay || 0);
		net += Number(r.projected_net_pay || 0);
		for (const col of editableKeys.value) {
			amounts[col.key] += Number(r.amounts?.[col.key] || 0);
		}
	}
	return { n, gross, net, amounts };
});

const colSpan = computed(() => 6 + editableKeys.value.length);

function badgeClass(s) {
	const t = (s || "").toLowerCase();
	if (t.includes("pending")) return "pending";
	if (t.includes("approved")) return "approved";
	if (t.includes("final")) return "finalized";
	if (t.includes("reject")) return "rejected";
	return "draft";
}

function periodArgs() {
	const p = effectivePeriod.value || {};
	return {
		company: props.company || sheet.value?.company_id,
		start_date: p.start_date || sheet.value?.start_date,
		end_date: p.end_date || sheet.value?.end_date,
	};
}

async function loadPeriodList() {
	try {
		periodList.value = (await apiGet(m("list_periods"), { company: props.company })) || [];
	} catch {
		periodList.value = [];
	}
}

function pickPeriod(p) {
	localPeriod.value = {
		label: p.label,
		start_date: p.start_date,
		end_date: p.end_date,
		month: p.month,
		year: p.year,
		status: p.status || "Draft",
	};
	load();
}

function clearFilters() {
	search.value = "";
	colFilter.serial = "";
	colFilter.employee = "";
	colFilter.department = "";
	colFilter.gross = "";
	colFilter.net = "";
	colFilter.mode = "";
	for (const k of Object.keys(colFilter.amounts)) colFilter.amounts[k] = "";
}

function ensureAmountFilters(keys) {
	for (const col of keys) {
		if (!(col.key in colFilter.amounts)) colFilter.amounts[col.key] = "";
	}
}

function buildPayload() {
	const variable_entries = [];
	const payment_entries = [];
	const employees = [];
	const earnDed = [
		...(sheet.value?.earnings || []),
		...(sheet.value?.deductions || []).filter((c) => !c.readonly),
	];
	const hasArrear2 = (sheet.value?.salary_columns || []).some((c) => c.key === "arrear_2");

	for (const r of flatRows.value) {
		if (r._type !== "row") continue;
		employees.push(r.employee);
		for (const col of earnDed) {
			if (col.key === "pf") continue;
			variable_entries.push({
				employee: r.employee,
				component_key: col.key,
				amount: Number(r.amounts?.[col.key] || 0),
				additional_salary: r.additional_salary?.[col.key] || null,
			});
		}
		if (hasArrear2) {
			variable_entries.push({
				employee: r.employee,
				component_key: "arrear_2",
				amount: Number(r.amounts?.arrear_2 || 0),
				additional_salary: r.additional_salary?.arrear_2 || null,
			});
		}
		variable_entries.push({
			employee: r.employee,
			component_key: "pf",
			amount: Number(r.amounts?.pf || 0),
			additional_salary: r.additional_salary?.pf || null,
		});
		payment_entries.push({
			employee: r.employee,
			payment_mode: r.payment?.payment_mode || "Bank",
			bank_name: r.payment?.bank_name || r.default_bank_name || "",
			payable_amount: r.projected_net_pay > 0 ? r.projected_net_pay : null,
		});
	}
	return { variable_entries, payment_entries, employees };
}

function recalcRow(row) {
	const amounts = row.amounts || {};
	const earnKeys = (sheet.value?.earnings || []).map((c) => c.key);
	const dedKeys = (sheet.value?.deductions || []).map((c) => c.key).filter((k) => k !== "pf");
	const base =
		Number(row.salary?.assignment_gross || row.salary?.perm_gross || row.salary?.gross_pay || 0) ||
		0;
	const arrear2 = Number(amounts.arrear_2 || 0);
	let varEarn = 0;
	for (const k of earnKeys) varEarn += Number(amounts[k] || 0);
	let varDed = Number(amounts.pf || 0) + Number(amounts.tax || 0);
	for (const k of dedKeys) {
		if (k === "tax") continue;
		varDed += Number(amounts[k] || 0);
	}
	const gross = base + arrear2 + varEarn;
	const net = gross - varDed;
	row.projected_gross_pay = Math.round(gross);
	row.projected_total_deduction = Math.round(varDed);
	row.projected_net_pay = Math.round(net);
	if (row.payment) row.payment.payable_amount = row.projected_net_pay;
}

/** Editable employee rows only (skip section headers) for Excel-style nav */
const navRows = computed(() => filteredRows.value.filter((r) => r._type === "row"));

const navIndexByEmployee = computed(() => {
	const map = Object.create(null);
	navRows.value.forEach((r, i) => {
		map[r.employee] = i;
	});
	return map;
});

const amountColCount = computed(() => editableKeys.value.length);
/** Amount columns + payment mode */
const navColCount = computed(() => amountColCount.value + 1);

function focusNavCell(rowIdx, colIdx) {
	const rows = navRows.value.length;
	const cols = navColCount.value;
	if (!rows || !cols) return;
	let r = Math.max(0, Math.min(rows - 1, rowIdx));
	let c = Math.max(0, Math.min(cols - 1, colIdx));
	const el = document.querySelector(
		`.wb-table [data-nav-row="${r}"][data-nav-col="${c}"]`
	);
	if (!el) return;
	el.focus();
	if (typeof el.select === "function") {
		try {
			el.select();
		} catch {
			/* ignore */
		}
	}
	el.scrollIntoView({ block: "nearest", inline: "nearest" });
}

function onCellKeydown(e, rowIdx, colIdx, row) {
	const key = e.key;
	const isEnter = key === "Enter";
	const isTab = key === "Tab";
	const el = e.target;

	// ↑↓ always move rows (never spin the number)
	if (key === "ArrowUp" || key === "ArrowDown" || isEnter || isTab) {
		e.preventDefault();
		e.stopPropagation();
		if (row) recalcRow(row);

		let nextRow = rowIdx;
		let nextCol = colIdx;
		const maxR = navRows.value.length - 1;
		const maxC = navColCount.value - 1;

		if (key === "ArrowUp") nextRow = rowIdx - 1;
		else if (key === "ArrowDown" || isEnter) nextRow = rowIdx + 1;
		else if (isTab) {
			if (e.shiftKey) {
				nextCol = colIdx - 1;
				if (nextCol < 0) {
					nextCol = maxC;
					nextRow = rowIdx - 1;
				}
			} else {
				nextCol = colIdx + 1;
				if (nextCol > maxC) {
					nextCol = 0;
					nextRow = rowIdx + 1;
				}
			}
		}

		if (nextRow < 0 || nextRow > maxR || nextCol < 0 || nextCol > maxC) return;
		focusNavCell(nextRow, nextCol);
		return;
	}

	// ←→: move caret inside value; jump cell only at edges (Excel-like)
	if (key === "ArrowLeft" || key === "ArrowRight") {
		if (el && el.tagName === "SELECT") {
			e.preventDefault();
			focusNavCell(rowIdx, key === "ArrowLeft" ? colIdx - 1 : colIdx + 1);
			return;
		}
		const start = el?.selectionStart;
		const end = el?.selectionEnd;
		const len = String(el?.value ?? "").length;
		const allSelected = start === 0 && end === len && len > 0;
		const atStart = start === 0 && end === 0;
		const atEnd = start === len && end === len;
		const jumpLeft = key === "ArrowLeft" && (atStart || allSelected);
		const jumpRight = key === "ArrowRight" && (atEnd || allSelected);
		if (jumpLeft || jumpRight) {
			e.preventDefault();
			if (row) recalcRow(row);
			focusNavCell(rowIdx, key === "ArrowLeft" ? colIdx - 1 : colIdx + 1);
		}
	}
}

function onCellWheel(e) {
	// Prevent mouse-wheel from changing number while focused
	if (document.activeElement === e.target) {
		e.preventDefault();
	}
}

async function load() {
	loading.value = true;
	error.value = "";
	ok.value = "";
	try {
		const args = periodArgs();
		sheet.value = await apiGet(m("get_sheet"), args);
		const earn = (sheet.value.earnings || []).filter((c) => !c.readonly);
		const ded = (sheet.value.deductions || []).filter((c) => !c.readonly && c.key !== "pf");
		editableKeys.value = [...earn, ...ded];
		ensureAmountFilters(editableKeys.value);
	} catch (e) {
		error.value = e.message || String(e);
		sheet.value = null;
	} finally {
		loading.value = false;
	}
}

async function run(action, extra = {}) {
	saving.value = true;
	error.value = "";
	ok.value = "";
	try {
		const payload = buildPayload();
		const args = { ...periodArgs(), ...extra };
		if (["save", "submit", "finalize"].includes(action)) {
			args.payment_entries = JSON.stringify(payload.payment_entries);
			args.variable_entries = JSON.stringify(payload.variable_entries);
		}
		if (action === "finalize") {
			args.employees = JSON.stringify(payload.employees);
		}
		let res;
		if (action === "save") res = await apiPost(m("save_draft"), args);
		else if (action === "submit") res = await apiPost(m("submit_for_approval"), args);
		else if (action === "withdraw") res = await apiPost(m("withdraw_period"), args);
		else if (action === "approve") res = await apiPost(m("approve_period"), args);
		else if (action === "reject") {
			const reason = window.prompt("Rejection reason") || "";
			if (!reason) throw new Error("Rejection reason is required.");
			res = await apiPost(m("reject_period"), { ...args, reason });
		} else if (action === "finalize") res = await apiPost(m("finalize_period"), args);
		else if (action === "load_roster") {
			res = await apiPost(m("load_employees"), { ...args, force: 1 });
		}
		ok.value = res?.message || "Done.";
		await load();
	} catch (e) {
		error.value = e.message || String(e);
	} finally {
		saving.value = false;
	}
}

watch(
	() => [props.period?.start_date, props.period?.end_date],
	() => {
		if (props.period?.start_date) {
			localPeriod.value = null;
			load();
		}
	}
);

onMounted(async () => {
	await loadPeriodList();
	if (effectivePeriod.value?.start_date) load();
	else loading.value = false;
});
</script>

<template>
	<div class="wb-page">
		<div class="pp-topbar wb-topbar">
			<div>
				<h1>{{ pageTitle }}</h1>
				<p>
					{{ sheet?.period_label || effectivePeriod?.label || "Select a period" }}
					<span
						v-if="effectivePeriod && status"
						class="pp-badge"
						:class="badgeClass(status)"
						style="margin-left: 0.5rem"
					>
						{{ status }}
					</span>
				</p>
				<p v-if="pageSubtitle" class="pp-hint" style="margin-top: 0.25rem">{{ pageSubtitle }}</p>
			</div>
			<button class="pp-btn pp-btn-ghost" type="button" @click="emit('back')">Dashboard</button>
		</div>

		<div v-if="error" class="pp-alert error">{{ error }}</div>
		<div v-if="ok" class="pp-alert ok">{{ ok }}</div>
		<div
			v-if="sheet && issueCount"
			class="pp-alert warn wb-issue-bar"
			role="status"
		>
			<div class="wb-issue-bar__main">
				<strong>{{ issueCount }} employee{{ issueCount === 1 ? "" : "s" }} with issues</strong>
				<span>
					Inactive or relieved staff cannot get Additional Salary / payroll transactions.
					Hover a flagged row to see the reason.
				</span>
			</div>
			<button
				class="pp-btn pp-btn-ghost"
				type="button"
				@click="showIssuesOnly = !showIssuesOnly"
			>
				{{ showIssuesOnly ? "Show all employees" : "Show issues only" }}
			</button>
		</div>

		<div v-if="!effectivePeriod?.start_date" class="pp-card" style="margin-bottom: 1rem">
			<div class="pp-section-head"><h2>Open a payroll period</h2></div>
			<div class="pp-body">
				<div v-if="!periodList.length" class="pp-empty">
					No periods found. Create one from the Create Payroll menu.
				</div>
				<div v-for="p in periodList" :key="`${p.start_date}|${p.end_date}`" class="pp-period-row">
					<div>
						<strong>{{ p.label }}</strong>
						<div class="pp-hint">{{ p.start_date }} → {{ p.end_date }}</div>
					</div>
					<button class="pp-btn pp-btn-primary" type="button" @click="pickPeriod(p)">Open</button>
				</div>
			</div>
		</div>

		<div v-if="loading" class="pp-empty">Loading payroll sheet…</div>

		<template v-else-if="sheet">
			<div class="wb-chrome">
				<div class="pp-toolbar wb-toolbar">
					<input
						v-model="search"
						class="pp-search"
						type="search"
						placeholder="Quick search employee / dept…"
					/>
					<div class="pp-actions">
						<button
							class="pp-btn pp-btn-ghost"
							type="button"
							:class="{ 'is-filter-on': showFilters }"
							@click="showFilters = !showFilters"
						>
							{{ showFilters ? "Hide filters" : "Show filters" }}
							<span v-if="activeFilterCount" class="wb-filter-count">{{ activeFilterCount }}</span>
						</button>
						<button
							v-if="activeFilterCount"
							class="pp-btn pp-btn-ghost"
							type="button"
							@click="clearFilters"
						>
							Clear filters
						</button>
						<button
							v-if="canEdit"
							class="pp-btn pp-btn-ghost"
							type="button"
							:disabled="saving"
							@click="run('load_roster')"
						>
							Reload roster
						</button>
						<button
							v-if="canSave"
							class="pp-btn pp-btn-primary"
							type="button"
							:disabled="saving"
							@click="run('save')"
						>
							{{ saving ? "Saving…" : "Save draft" }}
						</button>
						<button
							v-if="canSave"
							class="pp-btn pp-btn-warn"
							type="button"
							:disabled="saving"
							@click="run('submit')"
						>
							Submit for COO
						</button>
						<button
							v-if="canEdit && status === 'Pending COO Approval'"
							class="pp-btn pp-btn-ghost"
							type="button"
							:disabled="saving"
							@click="run('withdraw')"
						>
							Withdraw
						</button>
						<button
							v-if="canApprove && status === 'Pending COO Approval'"
							class="pp-btn pp-btn-ok"
							type="button"
							:disabled="saving"
							@click="run('approve')"
						>
							Approve
						</button>
						<button
							v-if="canApprove && status === 'Pending COO Approval'"
							class="pp-btn pp-btn-danger"
							type="button"
							:disabled="saving"
							@click="run('reject')"
						>
							Reject
						</button>
						<button
							v-if="canFinalize && status === 'Approved'"
							class="pp-btn pp-btn-primary"
							type="button"
							:disabled="saving"
							@click="run('finalize')"
						>
							Finalize & create slips
						</button>
					</div>
				</div>

				<div class="pp-kpi-row wb-kpi">
					<span
						><strong>{{ totals.n }}</strong> employees
						<template v-if="activeFilterCount">
							· showing <strong>{{ visibleEmployeeCount }}</strong>
						</template>
					</span>
					<span>Gross <strong>{{ money(totals.gross) }}</strong></span>
					<span>Net payable <strong>{{ money(totals.net) }}</strong></span>
					<span v-if="sheet.roster">On sheet <strong>{{ sheet.roster.on_sheet }}</strong></span>
				</div>
			</div>

			<div class="pp-card wb-sheet">
				<div class="pp-table-wrap wb-table-wrap">
					<table class="pp-table wb-table">
						<thead>
							<tr>
								<th class="wb-sticky wb-sticky-1">#</th>
								<th class="wb-sticky wb-sticky-2">Employee</th>
								<th class="wb-sticky wb-sticky-3">Dept</th>
								<th v-for="col in editableKeys" :key="col.key" class="num">
									{{ col.label }}
								</th>
								<th class="num">Gross</th>
								<th class="num">Net</th>
								<th>Mode</th>
							</tr>
							<tr v-if="showFilters" class="wb-filter-row">
								<th class="wb-sticky wb-sticky-1">
									<input
										v-model="colFilter.serial"
										class="wb-filter-input"
										type="text"
										placeholder="Filter"
										title="Filter by serial"
									/>
								</th>
								<th class="wb-sticky wb-sticky-2">
									<input
										v-model="colFilter.employee"
										class="wb-filter-input"
										type="text"
										placeholder="Filter"
										title="Filter employee name / ID"
									/>
								</th>
								<th class="wb-sticky wb-sticky-3">
									<input
										v-model="colFilter.department"
										class="wb-filter-input"
										type="text"
										placeholder="Filter"
										title="Filter department"
									/>
								</th>
								<th v-for="col in editableKeys" :key="'f-' + col.key" class="num">
									<input
										v-model="colFilter.amounts[col.key]"
										class="wb-filter-input num"
										type="text"
										placeholder="e.g. >0"
										:title="`Filter ${col.label} (supports >, <, >=, <=)`"
									/>
								</th>
								<th class="num">
									<input
										v-model="colFilter.gross"
										class="wb-filter-input num"
										type="text"
										placeholder="e.g. >100000"
									/>
								</th>
								<th class="num">
									<input
										v-model="colFilter.net"
										class="wb-filter-input num"
										type="text"
										placeholder="e.g. >50000"
									/>
								</th>
								<th>
									<input
										v-model="colFilter.mode"
										class="wb-filter-input"
										type="text"
										placeholder="Bank / Cheque"
									/>
								</th>
							</tr>
						</thead>
						<tbody>
							<template
								v-for="(r, idx) in filteredRows"
								:key="r._type === 'section' ? r.label + idx : r.employee"
							>
								<tr v-if="r._type === 'section'">
									<td class="pp-section-label" :colspan="colSpan">{{ r.label }}</td>
								</tr>
								<tr
									v-else
									class="wb-emp-row"
									:class="{ 'has-issue': r.has_issue }"
									:title="r.has_issue ? r.issue_message : undefined"
								>
									<td class="wb-sticky wb-sticky-1">
										<span
											v-if="r.has_issue"
											class="wb-issue-dot"
											:title="r.issue_message"
										>!</span>
										{{ r.serial }}
									</td>
									<td
										class="wb-sticky wb-sticky-2 wb-emp-cell"
										:title="r.has_issue ? r.issue_message : undefined"
									>
										<strong>{{ r.employee_name }}</strong>
										<div class="pp-hint">
											{{ r.employee }}
											<span v-if="r.has_issue" class="wb-issue-tag">Issue</span>
										</div>
										<div v-if="r.has_issue" class="wb-issue-msg">{{ r.issue_message }}</div>
									</td>
									<td class="wb-sticky wb-sticky-3 wb-dept-cell">
										{{ r.department || "—" }}
									</td>
									<td
										v-for="(col, colIdx) in editableKeys"
										:key="col.key"
										class="num"
									>
										<input
											v-if="canSave && !r.has_issue"
											v-model.number="r.amounts[col.key]"
											class="cell"
											type="text"
											inputmode="decimal"
											autocomplete="off"
											:data-nav-row="navIndexByEmployee[r.employee]"
											:data-nav-col="colIdx"
											@keydown="
												onCellKeydown(
													$event,
													navIndexByEmployee[r.employee],
													colIdx,
													r
												)
											"
											@change="recalcRow(r)"
											@focus="$event.target.select()"
											@wheel="onCellWheel"
										/>
										<span v-else>{{ money(r.amounts?.[col.key]) }}</span>
									</td>
									<td class="num">{{ money(r.projected_gross_pay) }}</td>
									<td class="num">
										<strong>{{ money(r.projected_net_pay) }}</strong>
									</td>
									<td>
										<select
											v-if="canSave"
											v-model="r.payment.payment_mode"
											class="wb-mode"
											:data-nav-row="navIndexByEmployee[r.employee]"
											:data-nav-col="amountColCount"
											@keydown="
												onCellKeydown(
													$event,
													navIndexByEmployee[r.employee],
													amountColCount,
													r
												)
											"
										>
											<option>Bank</option>
											<option>Cheque</option>
											<option>Cash</option>
										</select>
										<span v-else>{{ r.payment?.payment_mode }}</span>
									</td>
								</tr>
							</template>
						</tbody>
						<tfoot v-if="tableTotals.n">
							<tr class="wb-total-row">
								<td class="wb-sticky wb-sticky-1"></td>
								<td class="wb-sticky wb-sticky-2">
									<strong>Total</strong>
									<div class="pp-hint">{{ tableTotals.n }} employees</div>
								</td>
								<td class="wb-sticky wb-sticky-3"></td>
								<td
									v-for="col in editableKeys"
									:key="'t-' + col.key"
									class="num"
								>
									<strong>{{ money(tableTotals.amounts[col.key]) }}</strong>
								</td>
								<td class="num"><strong>{{ money(tableTotals.gross) }}</strong></td>
								<td class="num"><strong>{{ money(tableTotals.net) }}</strong></td>
								<td></td>
							</tr>
						</tfoot>
					</table>
					<div v-if="!filteredRows.length" class="pp-empty">
						No employees match these filters.
						<button
							v-if="activeFilterCount"
							class="pp-btn pp-btn-ghost"
							type="button"
							style="margin-top: 0.6rem"
							@click="clearFilters"
						>
							Clear filters
						</button>
					</div>
				</div>
			</div>
		</template>

		<div v-else-if="effectivePeriod?.start_date" class="pp-empty">Could not load sheet for this period.</div>
	</div>
</template>
