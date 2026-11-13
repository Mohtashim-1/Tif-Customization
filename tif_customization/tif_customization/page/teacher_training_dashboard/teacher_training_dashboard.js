frappe.pages["teacher-training-dashboard"].on_page_load = function (wrapper) {
	frappe.tif_customization = frappe.tif_customization || {};
	new frappe.tif_customization.TeacherTrainingDashboard(wrapper);
};

frappe.tif_customization = frappe.tif_customization || {};

frappe.tif_customization.TeacherTrainingDashboard = class TeacherTrainingDashboard {
	constructor(wrapper) {
		this.page = frappe.ui.make_app_page({
			parent: wrapper,
			title: __("Teacher Training Dashboard"),
			single_column: true,
		});
		this.data = null;
		this.view = "overview";
		this.period = "FY";
		this.fy = this.current_fy();
		this.department = "T. Training";
		this.program = null;
		this.program_trainer = "";
		this.kind_filter = "";
		this.inst_sort = { key: "sessions", dir: -1 };
		this.make();
	}

	current_fy() {
		const d = frappe.datetime.str_to_obj(frappe.datetime.get_today());
		return d.getMonth() + 1 >= 7 ? d.getFullYear() : d.getFullYear() - 1;
	}

	make() {
		if (!document.getElementById("tt-fonts")) {
			$("head").append(
				`<link id="tt-fonts" rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap">`
			);
		}
		$(this.page.body).html(`<div class="tt-app">${this.styles()}<aside class="tt-side"></aside><main class="tt-main"></main></div>`);
		this.$app = $(this.page.body).find(".tt-app");
		this.$side = this.$app.find(".tt-side");
		this.$main = this.$app.find(".tt-main");
		this.bind();
		this.load();
	}

	styles() {
		return `<style>
.tt-app{--ink:#1E1B4B;--teal:#6366F1;--teal2:#8B5CF6;--paper:#F5F6FF;--sand:#F59E0B;--line:#E6E8F5;--mute:#6B6F8A;
	display:grid;grid-template-columns:220px 1fr;min-height:calc(100vh - 120px);background:var(--paper);
	font-family:"Public Sans",system-ui,sans-serif;color:var(--ink);border-radius:14px;overflow:hidden;margin:0 0 24px}
.tt-app *{box-sizing:border-box}
.tt-mono{font-family:"IBM Plex Mono",ui-monospace,monospace}
.tt-side{background:linear-gradient(180deg,#312E81 0%,#5B21B6 55%,#9D174D 100%);color:#DDD6FE;padding:22px 14px;display:flex;flex-direction:column;gap:4px}
.tt-brand{display:flex;gap:10px;align-items:center;padding:0 8px 20px}
.tt-brand .mk{width:34px;height:34px;border-radius:9px;background:linear-gradient(135deg,#F59E0B,#EC4899);box-shadow:0 6px 14px rgba(236,72,153,.4);color:#fff;display:grid;place-items:center;font-weight:800}
.tt-brand b{display:block;color:#fff;font-size:14px}.tt-brand small{font-size:11px;color:#C4B5FD}
.tt-nav{display:flex;justify-content:space-between;align-items:center;padding:9px 10px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;color:#DDD6FE}
.tt-nav:hover{background:rgba(255,255,255,.1);color:#fff}
.tt-nav.on{background:rgba(255,255,255,.18);color:#fff;box-shadow:inset 3px 0 0 #FBBF24}
.tt-nav .ct{font-size:11px;background:#FBBF24;color:#1E1B4B;font-weight:700;padding:1px 7px;border-radius:10px}
.tt-side-foot{margin-top:auto;padding:14px 10px 0;border-top:1px solid rgba(255,255,255,.15);font-size:11px;color:#DDD6FE;line-height:1.6}
.tt-side-foot a{color:#FDE68A}
.tt-main{padding:22px 26px 30px;min-width:0}
.tt-head{display:flex;justify-content:space-between;align-items:flex-end;gap:14px;flex-wrap:wrap;margin-bottom:18px}
.tt-head h1{font-size:24px;font-weight:800;margin:0;letter-spacing:-.01em;background:linear-gradient(90deg,#4F46E5,#DB2777);-webkit-background-clip:text;background-clip:text;color:transparent;display:inline-block}
.tt-head p{margin:4px 0 0;color:var(--mute);font-size:13px}
.tt-ctrl{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.tt-seg{display:flex;background:#fff;border:1px solid var(--line);border-radius:9px;padding:3px}
.tt-seg button{border:0;background:transparent;padding:5px 11px;border-radius:6px;font-size:12px;font-weight:700;color:var(--mute);cursor:pointer}
.tt-seg button.on{background:linear-gradient(135deg,#6366F1,#EC4899);color:#fff}
.tt-sel{border:1px solid var(--line);background:#fff;border-radius:9px;padding:6px 10px;font-size:12px;font-weight:600;color:var(--ink);height:34px}
.tt-btn{border:0;background:linear-gradient(135deg,#6366F1,#EC4899);box-shadow:0 6px 14px rgba(99,102,241,.3);color:#fff;border-radius:9px;padding:0 14px;height:34px;font-size:12px;font-weight:700;cursor:pointer}
.tt-btn:hover{filter:brightness(1.08)}
.tt-btn.ghost{background:#fff;color:var(--ink);border:1px solid var(--line);box-shadow:none}
.tt-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin-bottom:14px}
.tt-kpi{--c:#6366F1;--bg:#EEF2FF;background:linear-gradient(160deg,var(--bg),#fff 70%);border:1px solid var(--line);border-top:4px solid var(--c);border-radius:12px;padding:14px 16px;position:relative;overflow:hidden}
.tt-kpi::after{content:"";position:absolute;right:-18px;top:-18px;width:70px;height:70px;border-radius:50%;background:var(--c);opacity:.12}
.tt-kpis>.tt-kpi:nth-child(1){--c:#6366F1;--bg:#EEF2FF}
.tt-kpis>.tt-kpi:nth-child(2){--c:#EC4899;--bg:#FDF2F8}
.tt-kpis>.tt-kpi:nth-child(3){--c:#10B981;--bg:#ECFDF5}
.tt-kpis>.tt-kpi:nth-child(4){--c:#F59E0B;--bg:#FFFBEB}
.tt-kpis>.tt-kpi:nth-child(5){--c:#06B6D4;--bg:#ECFEFF}
.tt-kpi .l{font-size:11px;font-weight:700;color:var(--c);text-transform:uppercase;letter-spacing:.05em}
.tt-kpi .v{font-size:28px;font-weight:800;margin-top:6px;font-variant-numeric:tabular-nums;color:var(--ink)}
.tt-kpi .s{font-size:11px;color:var(--mute);margin-top:2px}
.tt-band{background:linear-gradient(110deg,#4F46E5 0%,#9333EA 40%,#DB2777 75%,#F97316 100%);box-shadow:0 12px 28px rgba(147,51,234,.25);color:#fff;border-radius:14px;padding:16px 20px;display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:14px}
.tt-band>div{background:rgba(255,255,255,.12);border-radius:10px;padding:10px 12px}
.tt-band .l{font-size:11px;text-transform:uppercase;letter-spacing:.06em;opacity:.9;font-weight:700}
.tt-band .v{font-size:26px;font-weight:800;margin-top:4px}
.tt-band .s{font-size:11px;opacity:.8}
.tt-grid2{display:grid;grid-template-columns:1.5fr 1fr;gap:14px;margin-bottom:14px}
.tt-card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:16px 18px;min-width:0;box-shadow:0 4px 14px rgba(79,70,229,.05)}
.tt-card-h{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px;gap:8px}
.tt-card-h h3{font-size:14px;font-weight:800;margin:0;color:var(--ink)}
.tt-card-h small{font-size:11px;color:var(--mute)}
.tt-legend{display:flex;gap:12px;font-size:11px;color:var(--mute)}
.tt-legend i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:4px;vertical-align:-1px}
.tt-bars{display:flex;align-items:flex-end;gap:8px;height:190px;padding-top:14px}
.tt-bar{flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;height:100%;justify-content:flex-end;min-width:0}
.tt-bar .stk{width:100%;max-width:38px;display:flex;flex-direction:column-reverse;border-radius:5px 5px 2px 2px;overflow:hidden;cursor:default}
.tt-bar .c{background:linear-gradient(180deg,#8B5CF6,#4F46E5)}.tt-bar .u{background:linear-gradient(180deg,#FBBF24,#F472B6)}
.tt-bar .n{font-size:11px;font-weight:700;color:var(--ink)}
.tt-bar .m{font-size:10px;color:var(--mute);text-transform:uppercase}
.tt-hb{display:grid;grid-template-columns:62px 1fr 40px;gap:8px;align-items:center;margin:0 0 9px;font-size:12px}
.tt-hb .tr{height:9px;background:#EEEDE6;border-radius:6px;overflow:hidden}
.tt-hb .tr b{display:block;height:100%;border-radius:6px}
.tt-hb .num{text-align:right;font-weight:700}
.tt-code{--pc:#6366F1;display:inline-block;font-family:"IBM Plex Mono",monospace;font-size:10.5px;font-weight:700;background:color-mix(in srgb,var(--pc) 14%,#fff);color:var(--pc);padding:2px 6px;border-radius:5px;white-space:nowrap}
.tt-tbl{width:100%;border-collapse:collapse;font-size:12.5px}
.tt-tbl th{font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--mute);font-weight:700;text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);white-space:nowrap}
.tt-tbl th.sort{cursor:pointer}.tt-tbl th.sort:hover{color:var(--ink)}
.tt-tbl td{padding:10px;border-bottom:1px solid #EEF0FA;vertical-align:middle}
.tt-tbl tr.click{cursor:pointer}.tt-tbl tr.click:hover td{background:#F5F3FF}
.tt-tbl .r{text-align:right;font-variant-numeric:tabular-nums}
.tt-pname{font-weight:700;color:var(--ink);line-height:1.3}
.tt-psub{font-size:11px;color:var(--mute);margin-top:2px}
.tt-pill{display:inline-block;font-size:10.5px;font-weight:700;padding:3px 8px;border-radius:20px;white-space:nowrap}
.tt-pill.completed{background:#D1FAE5;color:#047857}
.tt-pill.progress{background:#FEF3C7;color:#B45309}
.tt-pill.upcoming{background:#E0E7FF;color:#4338CA}
.tt-prog{display:flex;align-items:center;gap:8px;min-width:120px}
.tt-prog .tr{flex:1;height:6px;background:#EEEDE6;border-radius:6px;overflow:hidden}
.tt-prog .tr b{display:block;height:100%;background:linear-gradient(90deg,#10B981,#06B6D4)}
.tt-prog span{font-size:11px;color:var(--mute);white-space:nowrap}
.tt-inst{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #F0EFE9}
.tt-inst:last-child{border-bottom:0}
.tt-av{width:32px;height:32px;border-radius:50%;background:var(--ink);box-shadow:0 3px 8px rgba(30,27,75,.18);color:#fff;display:grid;place-items:center;font-size:11px;font-weight:700;flex:none}
.tt-inst .nm{flex:1;min-width:0}.tt-inst .nm b{display:block;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tt-inst .nm small{font-size:11px;color:var(--mute)}
.tt-inst .st{text-align:right;font-size:12px;font-weight:700}.tt-inst .st small{display:block;font-weight:500;color:var(--mute);font-size:10.5px}
.tt-chips{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px}
.tt-chip{border:1px solid var(--line);background:#fff;border-radius:20px;padding:5px 12px;font-size:12px;font-weight:600;cursor:pointer;color:var(--ink)}
.tt-chip.on{background:linear-gradient(135deg,#6366F1,#EC4899);color:#fff;border-color:transparent}
.tt-pcards{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:12px}
.tt-pc{background:#fff;border:1px solid var(--line);border-top:4px solid var(--pc,#6366F1);border-radius:14px;padding:16px;cursor:pointer;transition:box-shadow .15s,transform .15s}
.tt-pc:hover{box-shadow:0 10px 24px rgba(27,31,42,.08);transform:translateY(-1px)}
.tt-pc .top{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
.tt-pc h4{font-size:14px;font-weight:800;margin:0 0 4px;line-height:1.3;color:var(--ink)}
.tt-pc .sub{font-size:11px;color:var(--mute);margin-bottom:12px}
.tt-pc .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:12px;padding-top:12px;border-top:1px solid #F0EFE9}
.tt-pc .stats b{display:block;font-size:16px;font-weight:800}.tt-pc .stats small{font-size:10px;color:var(--mute);text-transform:uppercase}
.tt-back{background:none;border:0;color:var(--teal);font-weight:700;font-size:12px;cursor:pointer;padding:0;margin-bottom:8px}
.tt-src{margin-bottom:12px}.tt-src .row{display:flex;justify-content:space-between;font-size:12px;margin-bottom:5px}
.tt-src .tr{height:8px;background:#EEEDE6;border-radius:6px;overflow:hidden}.tt-src .tr b{display:block;height:100%;border-radius:6px}
.tt-empty{padding:30px;text-align:center;color:var(--mute);font-size:13px}
.tt-note{font-size:11px;color:var(--mute);margin-top:10px;line-height:1.5}
@media (max-width:1100px){.tt-kpis{grid-template-columns:repeat(3,1fr)}.tt-grid2{grid-template-columns:1fr}.tt-band{grid-template-columns:repeat(2,1fr)}}
@media (max-width:760px){.tt-app{grid-template-columns:1fr}.tt-side{flex-direction:row;flex-wrap:wrap;padding:12px}.tt-brand,.tt-side-foot{display:none}.tt-kpis{grid-template-columns:repeat(2,1fr)}.tt-main{padding:16px}}
</style>`;
	}

	bind() {
		const me = this;
		this.$app.on("click", "[data-view]", function () {
			me.view = $(this).data("view");
			me.program = null;
			me.render();
		});
		this.$app.on("click", "[data-period]", function () {
			me.period = $(this).data("period");
			me.render();
		});
		this.$app.on("change", ".tt-fy", function () {
			me.fy = cint($(this).val());
			me.period = "FY";
			me.load();
		});
		this.$app.on("change", ".tt-dept", function () {
			me.department = $(this).val();
			me.load();
		});
		this.$app.on("click", ".tt-export", () => this.export_csv());
		this.$app.on("click", ".tt-refresh", () => this.load());
		this.$app.on("click", "[data-program]", function () {
			me.program = $(this).attr("data-program");
			me.program_trainer = "";
			me.view = "program";
			me.render();
		});
		this.$app.on("click", "[data-kind]", function () {
			me.kind_filter = $(this).attr("data-kind");
			me.render();
		});
		this.$app.on("click", "[data-ptrainer]", function () {
			me.program_trainer = $(this).attr("data-ptrainer");
			me.render();
		});
		this.$app.on("click", "[data-isort]", function () {
			const k = $(this).data("isort");
			me.inst_sort = me.inst_sort.key === k ? { key: k, dir: -me.inst_sort.dir } : { key: k, dir: k === "name" ? 1 : -1 };
			me.render();
		});
		this.$app.on("click", "[data-session]", function () {
			window.open(`/app/upcoming-training/${encodeURIComponent($(this).data("session"))}`, "_blank");
		});
	}

	load() {
		this.$main.html(`<div class="tt-empty">${__("Loading training data…")}</div>`);
		frappe.call({
			method: "tif_customization.tif_customization.page.teacher_training_dashboard.teacher_training_dashboard.get_overview",
			args: { fy: this.fy, department: this.department },
			callback: (r) => {
				this.data = r.message || null;
				this.render();
			},
		});
	}

	// ---------- helpers ----------
	esc(v) {
		return frappe.utils.escape_html(v == null ? "" : String(v));
	}
	fmt(n, d = 0) {
		return Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });
	}
	color(key) {
		const pal = ["#6366F1", "#EC4899", "#10B981", "#F59E0B", "#06B6D4", "#8B5CF6", "#EF4444", "#14B8A6", "#F97316", "#3B82F6"];
		let h = 0;
		for (const ch of String(key || "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
		return pal[h % pal.length];
	}
	code_chip(p) {
		return `<span class="tt-code" style="--pc:${this.color(p.label)}">${this.esc(p.code)}</span>`;
	}
	avatar(name) {
		const c = this.color(name);
		return `<div class="tt-av" style="background:linear-gradient(135deg,${c},${this.color(name + "~")})">${this.initials(name)}</div>`;
	}
	initials(name) {
		return (name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
	}
	period_range() {
		const fy = this.data.fy;
		const q = { Q1: [`${fy}-07-01`, `${fy}-09-30`], Q2: [`${fy}-10-01`, `${fy}-12-31`], Q3: [`${fy + 1}-01-01`, `${fy + 1}-03-31`], Q4: [`${fy + 1}-04-01`, `${fy + 1}-06-30`] };
		return q[this.period] || [this.data.from_date, this.data.to_date];
	}
	period_label() {
		const fy = this.data.fy;
		const base = `FY ${fy}-${String(fy + 1).slice(2)}`;
		return this.period === "FY" ? base : `${this.period} · ${base}`;
	}
	sessions() {
		const [a, b] = this.period_range();
		return (this.data.sessions || []).filter((s) => s.date >= a && s.date <= b);
	}
	unmatched_fv() {
		const [a, b] = this.period_range();
		return (this.data.fv_unmatched || []).filter((f) => f.date >= a && f.date <= b);
	}
	feedback() {
		const [a, b] = this.period_range();
		return (this.data.feedback || []).filter((f) => f.date >= a && f.date <= b);
	}
	people(s) {
		return Math.max(s.present || 0, s.fv || 0);
	}
	rating(rows) {
		const r = rows.filter((f) => f.overall > 0);
		return r.length ? r.reduce((t, f) => t + f.overall, 0) / r.length : null;
	}
	rating_text(v) {
		return v == null ? "—" : `${this.fmt(v, 1)}<small style="color:var(--mute);font-weight:500">/5</small>`;
	}
	program_meta(label) {
		return (this.data.programs || []).find((p) => p.label === label) || { label, code: "—", kind: "" };
	}
	program_stats(list) {
		const by = {};
		list.forEach((s) => {
			const p = (by[s.program] = by[s.program] || { label: s.program, sessions: 0, done: 0, people: 0, minutes: 0, trainers: new Set(), cities: {}, kind: s.kind });
			p.sessions += 1;
			if (s.status === "completed") {
				p.done += 1;
				p.minutes += s.minutes || 0;
			}
			p.people += this.people(s);
			if (s.trainer) p.trainers.add(s.trainer);
			if (s.city) p.cities[s.city] = (p.cities[s.city] || 0) + 1;
		});
		const fb = this.feedback();
		return Object.values(by)
			.map((p) => {
				const meta = this.program_meta(p.label);
				const city = Object.entries(p.cities).sort((a, b) => b[1] - a[1])[0];
				return Object.assign(p, {
					code: meta.code,
					city: city ? city[0] : "",
					status: p.done === p.sessions ? "completed" : p.done ? "progress" : "upcoming",
					rating: this.rating(fb.filter((f) => f.program === p.label)),
				});
			})
			.sort((a, b) => b.sessions - a.sessions || b.people - a.people);
	}
	status_pill(st) {
		const t = { completed: __("Completed"), progress: __("In progress"), upcoming: __("Upcoming") }[st] || st;
		return `<span class="tt-pill ${st}">${t}</span>`;
	}
	instructor_stats(list) {
		const by = {};
		const fb = this.feedback();
		list.forEach((s) => {
			if (!s.trainer) return;
			const t = (by[s.trainer] = by[s.trainer] || { name: s.trainer, sessions: 0, done: 0, minutes: 0, people: 0, programs: new Set(), onsite: 0, online: 0, last: "" });
			t.sessions += 1;
			if (s.status === "completed") {
				t.done += 1;
				t.minutes += s.minutes || 0;
				if (s.date > t.last) t.last = s.date;
			}
			t.people += this.people(s);
			t.programs.add(s.program);
			if (/online/i.test(s.mode)) t.online += 1;
			else t.onsite += 1;
		});
		return Object.values(by).map((t) =>
			Object.assign(t, {
				hours: t.minutes / 60,
				nprog: t.programs.size,
				rating: this.rating(fb.filter((f) => (f.trainer || "").toLowerCase() === t.name.toLowerCase())),
			})
		);
	}

	// ---------- render ----------
	render() {
		if (!this.data) {
			this.$main.html(`<div class="tt-empty">${__("Could not load training data.")}</div>`);
			return;
		}
		this.render_side();
		const body = { overview: () => this.view_overview(), programs: () => this.view_programs(), instructors: () => this.view_instructors(), program: () => this.view_program() }[this.view]();
		this.$main.html(this.header() + body);
	}

	render_side() {
		const list = this.sessions();
		const nprog = new Set(list.map((s) => s.program)).size;
		const ninst = new Set(list.map((s) => s.trainer).filter(Boolean)).size;
		const nav = (k, label, ct) =>
			`<div class="tt-nav ${this.view === k || (k === "programs" && this.view === "program") ? "on" : ""}" data-view="${k}"><span>${label}</span>${ct != null ? `<span class="ct">${ct}</span>` : ""}</div>`;
		this.$side.html(`
			<div class="tt-brand"><div class="mk">TT</div><div><b>${__("Teacher Training")}</b><small>${__("Directorate view")}</small></div></div>
			${nav("overview", __("Overview"))}
			${nav("programs", __("Programs"), nprog)}
			${nav("instructors", __("Instructors"), ninst)}
			<div class="tt-side-foot">
				${__("Department")}: <b style="color:#fff">${this.esc(this.department === "__all__" ? __("All") : this.department)}</b><br>
				${__("Data as of")} ${frappe.datetime.str_to_user(this.data.today)}<br>
				<a href="${this.data.links.schedule}" target="_blank">${__("Open Training Schedule")} ↗</a><br>
				<a href="${this.data.links.list}" target="_blank">${__("Upcoming Training list")} ↗</a>
			</div>`);
	}

	header() {
		const titles = {
			overview: [__("Training overview"), __("Programs, sessions and instructor activity across the directorate.")],
			programs: [__("Programs"), __("Every program and workshop topic delivered in the period.")],
			instructors: [__("Instructors"), __("Delivery load and reach per instructor.")],
			program: [this.program || "", this.program_meta(this.program).kind || ""],
		}[this.view];
		const fy0 = this.current_fy();
		const fys = [fy0 + 1, fy0, fy0 - 1, fy0 - 2]
			.map((y) => `<option value="${y}" ${y === this.data.fy ? "selected" : ""}>FY ${y}-${String(y + 1).slice(2)}</option>`)
			.join("");
		const depts = [["T. Training", "T. Training"], ["TPS", "TPS"], ["CEE", "CEE"], ["QPS", "QPS"], ["TIF", "TIF"], ["__all__", __("All departments")]]
			.map(([v, l]) => `<option value="${v}" ${v === this.department ? "selected" : ""}>${l}</option>`)
			.join("");
		const seg = ["FY", "Q1", "Q2", "Q3", "Q4"]
			.map((p) => `<button data-period="${p}" class="${this.period === p ? "on" : ""}">${p === "FY" ? this.data.fy : p}</button>`)
			.join("");
		return `
			<div class="tt-head">
				<div>
					${this.view === "program" ? `<button class="tt-back" data-view="programs">← ${__("All programs")}</button>` : ""}
					<h1>${this.esc(titles[0])}</h1>
					<p>${this.esc(titles[1])}${titles[1] ? " · " : ""}${this.period_label()}</p>
				</div>
				<div class="tt-ctrl">
					<select class="tt-sel tt-dept">${depts}</select>
					<select class="tt-sel tt-fy">${fys}</select>
					<div class="tt-seg">${seg}</div>
					<button class="tt-btn ghost tt-refresh" title="${__("Refresh")}">↻</button>
					<button class="tt-btn tt-export">${__("Export report")}</button>
				</div>
			</div>`;
	}

	kpi(l, v, s) {
		return `<div class="tt-kpi"><div class="l">${l}</div><div class="v">${v}</div><div class="s">${s || "&nbsp;"}</div></div>`;
	}

	view_overview() {
		const list = this.sessions();
		if (!list.length) return `<div class="tt-card tt-empty">${__("No training sessions in this period.")}</div>`;
		const done = list.filter((s) => s.status === "completed");
		const upcoming = list.length - done.length;
		const progs = this.program_stats(list);
		const delivered = progs.filter((p) => p.done > 0).length;
		const unm = this.unmatched_fv().length;
		const present = list.reduce((t, s) => t + (s.present || 0), 0);
		const people = list.reduce((t, s) => t + this.people(s), 0) + unm;
		const fvAll = list.reduce((t, s) => t + (s.fv || 0), 0) + unm;
		const instructors = new Set(done.map((s) => s.trainer).filter(Boolean)).size;
		const hours = done.reduce((t, s) => t + (s.minutes || 0), 0) / 60;
		const withPeople = done.filter((s) => this.people(s) > 0);
		const avgAtt = withPeople.length ? withPeople.reduce((t, s) => t + this.people(s), 0) / withPeople.length : 0;
		const online = done.filter((s) => /online/i.test(s.mode)).length;
		const onsitePct = done.length ? Math.round(((done.length - online) / done.length) * 100) : 0;
		const schools = new Set(list.map((s) => s.school).filter(Boolean)).size;
		const fb = this.feedback();
		const rating = this.rating(fb);

		return `
			<div class="tt-kpis">
				${this.kpi(__("Programs delivered"), this.fmt(delivered), __("{0} programs scheduled", [progs.length]))}
				${this.kpi(__("Sessions conducted"), this.fmt(done.length), __("+{0} scheduled", [upcoming]))}
				${this.kpi(__("Teachers trained"), this.fmt(people), __("{0} schedule · {1} field visit", [this.fmt(present), this.fmt(fvAll)]))}
				${this.kpi(__("Instructors engaged"), this.fmt(instructors), __("delivered at least one session"))}
				${this.kpi(__("Training hours"), this.fmt(hours, 0), __("from session start/end times"))}
			</div>
			<div class="tt-band">
				<div><div class="l">${__("Avg attendance")}</div><div class="v">${this.fmt(avgAtt, 1)}</div><div class="s">${__("teachers per session · recorded on {0} of {1}", [withPeople.length, done.length])}</div></div>
				<div><div class="l">${__("Session rating")}</div><div class="v">${rating == null ? "—" : this.fmt(rating, 1) + " / 5"}</div><div class="s">${fb.length ? __("{0} feedback forms", [fb.length]) : __("No feedback forms submitted yet")}</div></div>
				<div><div class="l">${__("Onsite delivery")}</div><div class="v">${onsitePct}%</div><div class="s">${__("{0} onsite · {1} online", [done.length - online, online])}</div></div>
				<div><div class="l">${__("Schools reached")}</div><div class="v">${this.fmt(schools)}</div><div class="s">${__("distinct schools in sessions")}</div></div>
			</div>
			<div class="tt-grid2">
				<div class="tt-card">
					<div class="tt-card-h"><h3>${__("Sessions by month")}</h3>
						<div class="tt-legend"><span><i style="background:#6366F1"></i>${__("Conducted")}</span><span><i style="background:#F472B6"></i>${__("Scheduled")}</span></div></div>
					${this.month_chart(list)}
				</div>
				<div class="tt-card">
					<div class="tt-card-h"><h3>${__("Teachers reached by program")}</h3><small>${__("attendance + field visit")}</small></div>
					${this.reach_bars(progs)}
				</div>
			</div>
			<div class="tt-grid2">
				<div class="tt-card">
					<div class="tt-card-h"><h3>${__("Programs")}</h3><small><a href="#" data-view="programs" onclick="return false">${__("View all")} →</a></small></div>
					${this.program_table(progs.slice(0, 8))}
				</div>
				<div class="tt-card">
					<div class="tt-card-h"><h3>${__("Most active instructors")}</h3><small><a href="#" data-view="instructors" onclick="return false">${__("View all")} →</a></small></div>
					${this.top_instructors(list)}
				</div>
			</div>`;
	}

	month_chart(list) {
		const [a, b] = this.period_range();
		const months = [];
		const d = frappe.datetime.str_to_obj(a);
		const end = frappe.datetime.str_to_obj(b);
		d.setDate(1);
		while (d <= end) {
			months.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: d.toLocaleString("en", { month: "short" }), c: 0, u: 0 });
			d.setMonth(d.getMonth() + 1);
		}
		list.forEach((s) => {
			const m = months.find((x) => x.key === s.date.slice(0, 7));
			if (m) s.status === "completed" ? (m.c += 1) : (m.u += 1);
		});
		const max = Math.max(1, ...months.map((m) => m.c + m.u));
		return `<div class="tt-bars">${months
			.map((m) => {
				const tot = m.c + m.u;
				const h = (tot / max) * 150;
				return `<div class="tt-bar" title="${m.label}: ${m.c} ${__("conducted")}, ${m.u} ${__("scheduled")}">
					<span class="n">${tot || ""}</span>
					<div class="stk" style="height:${Math.max(h, tot ? 4 : 0)}px">
						<div class="c" style="flex:${m.c}"></div><div class="u" style="flex:${m.u}"></div>
					</div>
					<span class="m">${m.label}</span></div>`;
			})
			.join("")}</div>`;
	}

	reach_bars(progs) {
		const rows = progs.filter((p) => p.people > 0).sort((a, b) => b.people - a.people).slice(0, 8);
		if (!rows.length) return `<div class="tt-empty">${__("No attendance recorded yet.")}</div>`;
		const max = Math.max(...rows.map((p) => p.people));
		return (
			rows
				.map(
					(p) => `<div class="tt-hb" data-program="${this.esc(p.label)}" style="cursor:pointer" title="${this.esc(p.label)}">
				${this.code_chip(p)}
				<div class="tr"><b style="width:${(p.people / max) * 100}%;background:linear-gradient(90deg,${this.color(p.label)},${this.color(p.label + "~")})"></b></div>
				<span class="num">${this.fmt(p.people)}</span></div>`
				)
				.join("") + `<div class="tt-note">${__("Field-visit attendees that can't be tied to a scheduled session are counted in Teachers trained only.")}</div>`
		);
	}

	program_table(progs) {
		if (!progs.length) return `<div class="tt-empty">${__("No programs.")}</div>`;
		return `<table class="tt-tbl"><thead><tr>
			<th>${__("Program")}</th><th>${__("Status")}</th><th>${__("Sessions")}</th>
			<th class="r">${__("Teachers")}</th><th class="r">${__("Hours")}</th><th class="r">${__("Rating")}</th></tr></thead><tbody>
			${progs
				.map(
					(p) => `<tr class="click" data-program="${this.esc(p.label)}">
				<td>${this.code_chip(p)}
					<div class="tt-pname" style="margin-top:4px">${this.esc(p.label)}</div>
					<div class="tt-psub">${this.esc(p.kind)}${p.city ? " · " + this.esc(p.city) : ""}</div></td>
				<td>${this.status_pill(p.status)}</td>
				<td><div class="tt-prog"><div class="tr"><b style="width:${(p.done / p.sessions) * 100}%"></b></div><span>${p.done}/${p.sessions}</span></div></td>
				<td class="r">${this.fmt(p.people)}</td>
				<td class="r">${this.fmt(p.minutes / 60, 1)}</td>
				<td class="r">${this.rating_text(p.rating)}</td></tr>`
				)
				.join("")}</tbody></table>`;
	}

	top_instructors(list) {
		const rows = this.instructor_stats(list).sort((a, b) => b.sessions - a.sessions || b.hours - a.hours).slice(0, 7);
		if (!rows.length) return `<div class="tt-empty">${__("No instructors.")}</div>`;
		return rows
			.map(
				(t) => `<div class="tt-inst">${this.avatar(t.name)}
				<div class="nm"><b>${this.esc(t.name)}</b><small>${__("{0} programs · {1} teachers", [t.nprog, this.fmt(t.people)])}</small></div>
				<div class="st">${t.sessions}<small>${__("sessions")} · ${this.fmt(t.hours, 0)}h</small></div></div>`
			)
			.join("");
	}

	view_programs() {
		const all = this.program_stats(this.sessions());
		const kinds = [...new Set(all.map((p) => p.kind).filter(Boolean))];
		const progs = this.kind_filter ? all.filter((p) => p.kind === this.kind_filter) : all;
		const chips = [["", __("All")], ...kinds.map((k) => [k, k])]
			.map(([v, l]) => `<span class="tt-chip ${this.kind_filter === v ? "on" : ""}" data-kind="${this.esc(v)}">${this.esc(l)} · ${v ? all.filter((p) => p.kind === v).length : all.length}</span>`)
			.join("");
		if (!progs.length) return `<div class="tt-chips">${chips}</div><div class="tt-card tt-empty">${__("No programs in this period.")}</div>`;
		return `<div class="tt-chips">${chips}</div><div class="tt-pcards">${progs
			.map(
				(p) => `<div class="tt-pc" data-program="${this.esc(p.label)}" style="--pc:${this.color(p.label)}">
				<div class="top">${this.code_chip(p)}${this.status_pill(p.status)}</div>
				<h4>${this.esc(p.label)}</h4>
				<div class="sub">${this.esc(p.kind)}${p.city ? " · " + this.esc(p.city) : ""}</div>
				<div class="tt-prog"><div class="tr"><b style="width:${(p.done / p.sessions) * 100}%"></b></div><span>${p.done}/${p.sessions} ${__("sessions")}</span></div>
				<div class="stats">
					<div><b>${this.fmt(p.people)}</b><small>${__("Teachers")}</small></div>
					<div><b>${this.fmt(p.minutes / 60, 0)}</b><small>${__("Hours")}</small></div>
					<div><b>${p.trainers.size}</b><small>${__("Instr.")}</small></div>
					<div><b>${p.rating == null ? "—" : this.fmt(p.rating, 1)}</b><small>${__("Rating")}</small></div>
				</div></div>`
			)
			.join("")}</div>`;
	}

	view_instructors() {
		const rows = this.instructor_stats(this.sessions());
		if (!rows.length) return `<div class="tt-card tt-empty">${__("No instructors in this period.")}</div>`;
		const { key, dir } = this.inst_sort;
		rows.sort((a, b) => {
			const x = a[key] == null ? -1 : a[key];
			const y = b[key] == null ? -1 : b[key];
			return (typeof x === "string" ? x.localeCompare(y) : x - y) * dir;
		});
		const th = (k, l, r) => `<th class="sort ${r ? "r" : ""}" data-isort="${k}">${l}${key === k ? (dir > 0 ? " ↑" : " ↓") : ""}</th>`;
		return `<div class="tt-card"><table class="tt-tbl"><thead><tr>
			${th("name", __("Instructor"))}${th("nprog", __("Programs"), 1)}${th("sessions", __("Sessions"), 1)}${th("done", __("Conducted"), 1)}
			${th("hours", __("Hours"), 1)}${th("people", __("Teachers"), 1)}<th>${__("Onsite / Online")}</th>${th("rating", __("Rating"), 1)}${th("last", __("Last session"), 1)}
			</tr></thead><tbody>${rows
				.map(
					(t) => `<tr>
				<td><div style="display:flex;align-items:center;gap:10px">${this.avatar(t.name)}<span class="tt-pname">${this.esc(t.name)}</span></div></td>
				<td class="r">${t.nprog}</td><td class="r">${t.sessions}</td><td class="r">${t.done}</td>
				<td class="r">${this.fmt(t.hours, 1)}</td><td class="r">${this.fmt(t.people)}</td>
				<td><div class="tt-prog"><div class="tr"><b style="width:${(t.onsite / t.sessions) * 100}%"></b></div><span>${t.onsite} / ${t.online}</span></div></td>
				<td class="r">${this.rating_text(t.rating)}</td>
				<td class="r tt-mono" style="font-size:11.5px">${t.last ? frappe.datetime.str_to_user(t.last) : "—"}</td></tr>`
				)
				.join("")}</tbody></table></div>`;
	}

	view_program() {
		const all = this.sessions().filter((s) => s.program === this.program);
		if (!all.length) return `<div class="tt-card tt-empty">${__("No sessions for this program in the selected period.")}</div>`;
		const p = this.program_stats(all)[0];
		const trainers = [...p.trainers].sort();
		const list = this.program_trainer ? all.filter((s) => s.trainer === this.program_trainer) : all;
		const present = all.reduce((t, s) => t + (s.present || 0), 0);
		const fv = all.reduce((t, s) => t + (s.fv || 0), 0);
		const fbRows = this.feedback().filter((f) => f.program === this.program);
		const max = Math.max(1, present, fv, fbRows.length);
		const src = (l, n, color) => `<div class="tt-src"><div class="row"><span>${l}</span><b>${this.fmt(n)}</b></div><div class="tr"><b style="width:${(n / max) * 100}%;background:${color}"></b></div></div>`;
		const chips = [["", __("All instructors")], ...trainers.map((t) => [t, t])]
			.map(([v, l]) => `<span class="tt-chip ${this.program_trainer === v ? "on" : ""}" data-ptrainer="${this.esc(v)}">${this.esc(l)}</span>`)
			.join("");
		return `
			<div style="display:flex;gap:8px;align-items:center;margin:-6px 0 14px">${this.code_chip(p)}${this.status_pill(p.status)}${p.city ? `<span class="tt-psub" style="margin:0">${this.esc(p.city)}</span>` : ""}</div>
			<div class="tt-kpis">
				${this.kpi(__("Sessions"), `${p.done}<span style="font-size:16px;color:var(--mute)">/${p.sessions}</span>`, __("conducted / scheduled"))}
				${this.kpi(__("Teachers"), this.fmt(p.people), __("attendance + field visit"))}
				${this.kpi(__("Training hours"), this.fmt(p.minutes / 60, 1), __("conducted sessions"))}
				${this.kpi(__("Instructors"), trainers.length, "")}
				${this.kpi(__("Rating"), p.rating == null ? "—" : this.fmt(p.rating, 1), fbRows.length ? __("{0} feedback forms", [fbRows.length]) : __("no feedback yet"))}
			</div>
			<div class="tt-grid2" style="grid-template-columns:1fr 2.2fr">
				<div class="tt-card">
					<div class="tt-card-h"><h3>${__("Participant sources")}</h3></div>
					${src(__("Schedule attendance (Present)"), present, "linear-gradient(90deg,#6366F1,#8B5CF6)")}
					${src(__("Field visit attendees"), fv, "linear-gradient(90deg,#10B981,#06B6D4)")}
					${src(__("Feedback forms"), fbRows.length, "linear-gradient(90deg,#F59E0B,#EC4899)")}
					<div class="tt-note">${__("Teachers per session use the higher of schedule attendance and field-visit attendees, so the same teacher isn't counted twice.")}</div>
				</div>
				<div class="tt-card">
					<div class="tt-card-h"><h3>${__("Sessions")}</h3><small>${list.length} ${__("shown")}</small></div>
					<div class="tt-chips">${chips}</div>
					<table class="tt-tbl"><thead><tr><th>#</th><th>${__("Date")}</th><th>${__("Module")}</th><th>${__("Instructor")}</th><th>${__("Mode")}</th>
						<th class="r">${__("Hrs")}</th><th class="r">${__("Teachers")}</th><th>${__("Status")}</th></tr></thead><tbody>
					${list
						.map(
							(s, i) => `<tr class="click" data-session="${this.esc(s.name)}" title="${this.esc(s.school || "")}">
						<td class="tt-mono" style="color:var(--mute)">${i + 1}</td>
						<td class="tt-mono" style="font-size:11.5px;white-space:nowrap">${frappe.datetime.str_to_user(s.date)}</td>
						<td><div class="tt-pname" style="font-weight:600">${this.esc(s.module || "—")}</div>${s.school ? `<div class="tt-psub">${this.esc(s.school)}</div>` : ""}</td>
						<td>${this.esc(s.trainer || "—")}</td><td>${this.esc(s.mode || "—")}</td>
						<td class="r">${s.minutes ? this.fmt(s.minutes / 60, 1) : "—"}</td>
						<td class="r">${this.people(s) || "—"}</td>
						<td>${this.status_pill(s.status === "completed" ? "completed" : "upcoming")}</td></tr>`
						)
						.join("")}</tbody></table>
				</div>
			</div>`;
	}

	export_csv() {
		const list = this.view === "program" ? this.sessions().filter((s) => s.program === this.program) : this.sessions();
		const rows = [["Session", "Date", "Program", "Type", "Module", "Instructor", "Mode", "City", "School", "Hours", "Present", "Field Visit Attendees", "Status"]];
		list.forEach((s) =>
			rows.push([s.name, s.date, s.program, s.kind, s.module, s.trainer, s.mode, s.city, s.school, (s.minutes / 60).toFixed(1), s.present, s.fv, s.status])
		);
		frappe.tools.downloadify(rows, null, `Teacher Training ${this.period_label()}`);
	}
};
