<script setup>
import { computed } from "vue";
import { getCategory } from "../data/mock";

const props = defineProps({
	view: { type: String, default: "month" },
	periodStart: { type: String, required: true },
	periodEnd: { type: String, required: true },
	sessions: { type: Array, default: () => [] },
	todayIso: { type: String, default: "" },
});
const emit = defineEmits(["open", "create", "open-day"]);

function parse(isoStr) {
	return new Date(`${isoStr}T00:00:00`);
}

function iso(d) {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

function monthGrid(year, month) {
	const first = new Date(year, month, 1);
	const startPad = (first.getDay() + 6) % 7;
	const daysInMonth = new Date(year, month + 1, 0).getDate();
	const cells = [];
	for (let i = 0; i < startPad; i++) cells.push(null);
	for (let day = 1; day <= daysInMonth; day++) cells.push(new Date(year, month, day));
	while (cells.length % 7) cells.push(null);
	return cells;
}

const months = computed(() => {
	const start = parse(props.periodStart);
	const end = parse(props.periodEnd);
	const list = [];
	const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
	while (cursor <= end) {
		list.push({
			year: cursor.getFullYear(),
			month: cursor.getMonth(),
			label: cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
			cells: monthGrid(cursor.getFullYear(), cursor.getMonth()),
		});
		cursor.setMonth(cursor.getMonth() + 1);
	}
	return list;
});

const byDate = computed(() => {
	const map = {};
	for (const s of props.sessions) {
		if (!s.date) continue;
		if (!map[s.date]) map[s.date] = [];
		map[s.date].push(s);
	}
	return map;
});

function onDay(d) {
	if (!d) return;
	emit("open-day", iso(d));
}

function addOn(d) {
	emit("create", { training_date: iso(d), training_time: "10:00" });
}
</script>

<template>
	<section class="board" :data-view="view">
		<article v-for="m in months" :key="m.label" class="month">
			<header>{{ m.label }}</header>
			<div class="weekdays">
				<span v-for="w in ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']" :key="w">{{ w }}</span>
			</div>
			<div class="cells">
				<div
					v-for="(d, i) in m.cells"
					:key="i"
					class="cell"
					:class="{ empty: !d, today: d && iso(d) === todayIso }"
				>
					<template v-if="d">
						<div class="cell-head">
							<button type="button" class="num" @click="onDay(d)">{{ d.getDate() }}</button>
							<button type="button" class="plus" title="Add training" @click="addOn(d)">+</button>
						</div>
						<button
							v-for="s in (byDate[iso(d)] || []).slice(0, view === 'quarter' ? 2 : 4)"
							:key="s.id"
							type="button"
							class="chip"
							:style="{ '--cat': getCategory(s.category).color }"
							@click="$emit('open', s.name)"
						>
							<span>{{ s.time || "—" }}</span>
							<strong>{{ s.title }}</strong>
						</button>
						<small v-if="(byDate[iso(d)] || []).length > (view === 'quarter' ? 2 : 4)">
							+{{ (byDate[iso(d)] || []).length - (view === 'quarter' ? 2 : 4) }} more
						</small>
					</template>
				</div>
			</div>
		</article>
	</section>
</template>

<style scoped>
.board {
	display: grid;
	gap: 14px;
}
.board[data-view="quarter"] {
	grid-template-columns: repeat(3, minmax(0, 1fr));
}
.month {
	background: #fff;
	border: 1px solid var(--line);
	border-radius: 18px;
	padding: 14px;
	box-shadow: var(--shadow);
}
.month header {
	font-weight: 700;
	margin-bottom: 10px;
}
.weekdays,
.cells {
	display: grid;
	grid-template-columns: repeat(7, minmax(0, 1fr));
	gap: 6px;
}
.weekdays {
	color: #9ca3af;
	font-size: 11px;
	font-weight: 700;
	margin-bottom: 6px;
	text-align: center;
}
.cell {
	min-height: 108px;
	border: 1px solid #f3f4f6;
	border-radius: 12px;
	padding: 6px;
	background: #fafafa;
}
.cell.today {
	background: #eef2ff;
	border-color: #c7d2fe;
}
.cell.empty {
	background: transparent;
	border-color: transparent;
}
.cell-head {
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-bottom: 4px;
}
.num,
.plus {
	border: 0;
	background: none;
	font-weight: 700;
}
.plus {
	color: #6366f1;
	opacity: 0;
}
.cell:hover .plus {
	opacity: 1;
}
.chip {
	width: 100%;
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: 1px;
	border: 0;
	border-left: 3px solid var(--cat);
	background: #fff;
	border-radius: 8px;
	padding: 4px 6px;
	margin-bottom: 4px;
	text-align: left;
}
.chip span {
	font-size: 10px;
	color: #6b7280;
}
.chip strong {
	font-size: 11px;
	line-height: 1.25;
}
small {
	color: #6b7280;
	font-size: 10px;
}
@media (max-width: 1100px) {
	.board[data-view="quarter"] {
		grid-template-columns: 1fr;
	}
	.cell {
		min-height: 84px;
	}
}
</style>
