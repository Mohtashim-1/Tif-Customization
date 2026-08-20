<script setup>
const props = defineProps({
	active: { type: String, default: "dashboard" },
	totalTrainers: { type: Number, default: 0 },
	calendarDate: { type: Date, default: () => new Date() },
});
defineEmits(["navigate"]);

const nav = [
	{ id: "dashboard", label: "Dashboard", icon: "▦" },
	{ id: "trainers", label: "Trainers", icon: "◎" },
	{ id: "schedule", label: "Schedule", icon: "☰" },
	{ id: "programs", label: "Training Programs", icon: "◇" },
	{ id: "sessions", label: "Sessions", icon: "▣" },
	{ id: "rooms", label: "Rooms", icon: "⌂" },
	{ id: "reports", label: "Reports", icon: "▤" },
	{ id: "notifications", label: "Notifications", icon: "◉" },
	{ id: "settings", label: "Settings", icon: "⚙" },
];

const cal = (() => {
	const d = props.calendarDate || new Date("2026-05-20");
	const year = d.getFullYear();
	const month = d.getMonth();
	const first = new Date(year, month, 1);
	const startPad = (first.getDay() + 6) % 7; // Mon-first
	const daysInMonth = new Date(year, month + 1, 0).getDate();
	const cells = [];
	for (let i = 0; i < startPad; i++) cells.push(null);
	for (let day = 1; day <= daysInMonth; day++) cells.push(day);
	return {
		label: d.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
		cells,
		today: d.getDate(),
	};
})();
</script>

<template>
	<aside class="sidebar">
		<div class="brand">
			<span class="brand-icon">📅</span>
			<div>
				<div class="brand-title">TRAINING</div>
				<div class="brand-sub">SCHEDULE</div>
			</div>
		</div>

		<nav class="nav">
			<button
				v-for="item in nav"
				:key="item.id"
				class="nav-item"
				:class="{ active: active === item.id }"
				type="button"
				@click="$emit('navigate', item.id)"
			>
				<span class="nav-ico">{{ item.icon }}</span>
				{{ item.label }}
			</button>
		</nav>

		<div class="stat-card">
			<div class="stat-ico">👥</div>
			<div>
				<div class="stat-label">Total Trainers</div>
				<div class="stat-value">{{ totalTrainers }}</div>
			</div>
		</div>

		<div class="mini-cal">
			<div class="mini-cal-head">{{ cal.label }}</div>
			<div class="mini-cal-week">
				<span v-for="w in ['M', 'T', 'W', 'T', 'F', 'S', 'S']" :key="w">{{ w }}</span>
			</div>
			<div class="mini-cal-grid">
				<span
					v-for="(day, idx) in cal.cells"
					:key="idx"
					:class="{ today: day === cal.today, empty: !day }"
				>
					{{ day || "" }}
				</span>
			</div>
		</div>
	</aside>
</template>

<style scoped>
.sidebar {
	background: linear-gradient(180deg, #0b1220 0%, #111827 55%, #0f172a 100%);
	color: #e5e7eb;
	padding: 22px 16px;
	display: flex;
	flex-direction: column;
	gap: 18px;
	border-right: 1px solid rgba(255, 255, 255, 0.04);
}

.brand {
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 4px 8px 12px;
}

.brand-icon {
	width: 42px;
	height: 42px;
	border-radius: 12px;
	display: grid;
	place-items: center;
	background: linear-gradient(145deg, #818cf8, #6366f1);
	box-shadow: 0 8px 20px rgba(99, 102, 241, 0.35);
}

.brand-title {
	font-size: 12px;
	letter-spacing: 0.14em;
	font-weight: 700;
}

.brand-sub {
	font-size: 11px;
	letter-spacing: 0.18em;
	color: #94a3b8;
	font-weight: 600;
}

.nav {
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.nav-item {
	display: flex;
	align-items: center;
	gap: 10px;
	border: 0;
	background: transparent;
	color: #94a3b8;
	text-align: left;
	padding: 10px 12px;
	border-radius: 12px;
	transition: 0.18s ease;
}

.nav-item:hover {
	background: rgba(255, 255, 255, 0.05);
	color: #fff;
}

.nav-item.active {
	background: linear-gradient(90deg, #6366f1, #818cf8);
	color: #fff;
	box-shadow: 0 8px 18px rgba(99, 102, 241, 0.35);
}

.nav-ico {
	width: 18px;
	opacity: 0.9;
}

.stat-card {
	margin-top: auto;
	display: flex;
	gap: 12px;
	align-items: center;
	background: rgba(255, 255, 255, 0.04);
	border: 1px solid rgba(255, 255, 255, 0.06);
	border-radius: 14px;
	padding: 14px;
}

.stat-ico {
	width: 40px;
	height: 40px;
	border-radius: 10px;
	display: grid;
	place-items: center;
	background: rgba(99, 102, 241, 0.2);
}

.stat-label {
	font-size: 12px;
	color: #94a3b8;
}

.stat-value {
	font-size: 20px;
	font-weight: 700;
	color: #fff;
}

.mini-cal {
	background: rgba(255, 255, 255, 0.03);
	border: 1px solid rgba(255, 255, 255, 0.06);
	border-radius: 14px;
	padding: 12px;
}

.mini-cal-head {
	font-size: 13px;
	font-weight: 600;
	margin-bottom: 10px;
	color: #fff;
}

.mini-cal-week,
.mini-cal-grid {
	display: grid;
	grid-template-columns: repeat(7, 1fr);
	gap: 4px;
	text-align: center;
	font-size: 11px;
}

.mini-cal-week {
	color: #64748b;
	margin-bottom: 6px;
}

.mini-cal-grid span {
	padding: 6px 0;
	border-radius: 999px;
	color: #cbd5e1;
}

.mini-cal-grid .empty {
	opacity: 0;
}

.mini-cal-grid .today {
	background: #6366f1;
	color: #fff;
	font-weight: 700;
}

@media (max-width: 980px) {
	.sidebar {
		display: none;
	}
}
</style>
