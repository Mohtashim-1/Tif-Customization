const SD_API = "tif_customization.tif_customization.page.school_visit_dashboard.school_visit_dashboard";
const SD_PAGE_SIZE = 100;

const SD_COLORS = {
	active: "#16a34a",
	active_new: "#2563eb",
	model_0: "#dc2626",
	A: "#f59e0b",
	B: "#ea580c",
	C: "#a16207",
	visits: "#0d9488",
	total: "#4f46e5",
};

const SD_DEPT = {
	QPS: { label: "QPS", color: "#059669" },
	TPS: { label: "TPS", color: "#2563eb" },
	CEE: { label: "CEE", color: "#d97706" },
};

frappe.pages["school-visit-dashboard"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("School Database Dashboard New (UAT)"),
		single_column: true,
	});
	new SchoolDashboard(page);
};

class SchoolDashboard {
	constructor(page) {
		this.page = page;
		this.data = { summary: {}, rows: [], by_province: [] };
		this.shown = SD_PAGE_SIZE;
		this.sort = { key: "school_label", dir: 1 };
		this.make_filters();
		this.make_body();
		this.page.set_primary_action(__("Refresh"), () => this.load(), "refresh");
		this.page.set_secondary_action(__("Export CSV"), () => this.export_csv());
		this.load();
	}

	make_filters() {
		const reload = () => this.load();
		const debounced = frappe.utils.debounce(reload, 400);
		// Same window as SME Summary outcome cards: 1 July of current fiscal year → today
		const today = frappe.datetime.str_to_obj(frappe.datetime.get_today());
		const fy_year = today.getMonth() >= 6 ? today.getFullYear() : today.getFullYear() - 1;
		this.f = {
			search: this.page.add_field({ fieldname: "search", label: __("Search School"), fieldtype: "Data", change: debounced }),
			province: this.page.add_field({
				fieldname: "province",
				label: __("Province"),
				fieldtype: "Select",
				options: [""],
				change: reload,
			}),
			city: this.page.add_field({ fieldname: "city", label: __("City"), fieldtype: "Data", change: debounced }),
			bucket: this.page.add_field({
				fieldname: "bucket",
				label: __("Status"),
				fieldtype: "Select",
				options: ["", "Active", "Active New", "Model 0"],
				change: reload,
			}),
			model: this.page.add_field({
				fieldname: "model",
				label: __("Model"),
				fieldtype: "Select",
				options: [
					{ value: "", label: __("All Models") },
					{ value: "A", label: __("Model A") },
					{ value: "B", label: __("Model B") },
					{ value: "C", label: __("Model C") },
					{ value: "0", label: __("Model 0") },
				],
				change: reload,
			}),
			visit_period: this.page.add_field({
				fieldname: "visit_period",
				label: __("Visit Period"),
				fieldtype: "DateRange",
				default: [`${fy_year}-07-01`, frappe.datetime.get_today()],
				change: reload,
			}),
		};
	}

	make_body() {
		this.$body = $(`
			<div class="sv-dash">
				<style>${this.css()}</style>
				<div class="sv-hero">
					<div class="sv-hero-text">
						<div class="sv-hero-eyebrow">${__("Field Visit Records")}</div>
						<h3 class="sv-hero-title">${__("School Database Dashboard New (UAT)")}</h3>
						<div class="sv-hero-sub"></div>
					</div>
					<div class="sv-hero-stats"></div>
				</div>
				<div class="sv-kpis"></div>
				<div class="sv-grid">
					<div class="sv-panel">
						<div class="sv-panel-h"><span>${__("School Status")}</span><small>${__("Click a segment to filter")}</small></div>
						<div class="sv-split sv-split-status"></div>
						<div class="sv-panel-h mt-4"><span>${__("Model Split")}</span><small>${__("Departments running in active schools")}</small></div>
						<div class="sv-split sv-split-model"></div>
					</div>
					<div class="sv-panel">
						<div class="sv-panel-h"><span>${__("By Province")}</span><small>${__("Current filter")}</small></div>
						<div class="sv-prov"></div>
					</div>
					<div class="sv-panel">
						<div class="sv-panel-h"><span>${__("Top Running Programs")}</span><small>${__("Schools per program")}</small></div>
						<div class="sv-programs"></div>
					</div>
				</div>
				<div class="sv-panel sv-table-panel">
					<div class="sv-panel-h sv-table-h">
						<span>${__("Schools")} <span class="sv-count"></span></span>
						<div class="sv-active-filters"></div>
					</div>
					<div class="sv-scroll"><table class="sv-table">
						<thead><tr>
							<th data-sort="school_label">${__("School")}</th>
							<th data-sort="bucket">${__("Status")}</th>
							<th data-sort="model">${__("Model")}</th>
							<th data-sort="city">${__("Location")}</th>
							<th>${__("Running Programs")}</th>
							<th data-sort="visits" class="text-right">${__("Visits")}</th>
							<th data-sort="last_visit">${__("Last Visit")}</th>
						</tr></thead>
						<tbody></tbody>
					</table></div>
					<div class="sv-more"></div>
				</div>
			</div>
		`).appendTo(this.page.main);

		this.$body.on("click", "[data-field]", (e) => {
			const $c = $(e.currentTarget);
			const field = $c.attr("data-field");
			const value = $c.attr("data-value") || "";
			const other = field === "bucket" ? "model" : "bucket";
			this.f[other].set_value("");
			this.f[field].set_value(this.f[field].get_value() === value ? "" : value);
		});
		this.$body.on("click", "[data-province]", (e) => {
			const p = $(e.currentTarget).attr("data-province");
			this.f.province.set_value(this.f.province.get_value() === p ? "" : p);
		});
		this.$body.on("click", "[data-clear]", (e) => {
			this.f[$(e.currentTarget).attr("data-clear")].set_value("");
		});
		this.$body.on("click", "th[data-sort]", (e) => {
			const key = $(e.currentTarget).attr("data-sort");
			this.sort = { key, dir: this.sort.key === key ? -this.sort.dir : key === "visits" || key === "last_visit" ? -1 : 1 };
			this.shown = SD_PAGE_SIZE;
			this.render_rows();
		});
		this.$body.on("click", "tr.sv-row", (e) => {
			const row = this.sorted_rows()[cint($(e.currentTarget).attr("data-idx"))];
			if (row) window.open(this.profile_url(row), "_blank");
		});
		this.$body.on("click", ".sv-show-more", () => {
			this.shown += SD_PAGE_SIZE;
			this.render_rows();
		});
	}

	css() {
		return `
			.sv-dash { padding: 4px 0 32px; --sv-radius: 14px; }
			.sv-dash * { box-sizing: border-box; }
			.sv-hero { display:flex; justify-content:space-between; align-items:center; gap:20px; flex-wrap:wrap;
				padding:22px 26px; border-radius:var(--sv-radius); margin-bottom:18px; color:#fff;
				background: radial-gradient(circle at 85% 20%, rgba(255,255,255,.18), transparent 40%),
					linear-gradient(120deg, #312e81 0%, #4f46e5 45%, #0d9488 100%);
				box-shadow: 0 10px 30px -12px rgba(79,70,229,.55); }
			.sv-hero-eyebrow { font-size:11px; letter-spacing:.14em; text-transform:uppercase; opacity:.8; font-weight:600; }
			.sv-hero-title { margin:4px 0 6px; font-weight:800; font-size:26px; color:#fff; }
			.sv-hero-sub { font-size:13px; opacity:.88; }
			.sv-hero-stats { display:flex; gap:12px; flex-wrap:wrap; }
			.sv-hero-stat { background:rgba(255,255,255,.14); border:1px solid rgba(255,255,255,.22); backdrop-filter:blur(6px);
				border-radius:12px; padding:10px 18px; min-width:120px; }
			.sv-hero-stat .n { font-size:24px; font-weight:800; line-height:1.1; }
			.sv-hero-stat .l { font-size:11px; opacity:.85; text-transform:uppercase; letter-spacing:.06em; }

			.sv-kpis { display:grid; grid-template-columns:repeat(auto-fill,minmax(190px,1fr)); gap:14px; margin-bottom:18px; }
			.sv-kpi { position:relative; overflow:hidden; background:var(--card-bg); border:1px solid var(--border-color);
				border-radius:var(--sv-radius); padding:16px 16px 14px; cursor:pointer; transition:transform .15s, box-shadow .15s, border-color .15s; }
			.sv-kpi:hover { transform:translateY(-2px); box-shadow:0 8px 22px -10px rgba(15,23,42,.25); }
			.sv-kpi.on { border-color:var(--c); box-shadow:0 0 0 2px var(--c) inset; }
			.sv-kpi.static { cursor:default; }
			.sv-kpi::after { content:""; position:absolute; right:-28px; top:-28px; width:90px; height:90px; border-radius:50%;
				background:var(--c); opacity:.08; }
			.sv-kpi-top { display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; }
			.sv-kpi-ico { width:36px; height:36px; border-radius:10px; display:flex; align-items:center; justify-content:center;
				background:color-mix(in srgb, var(--c) 14%, transparent); color:var(--c); }
			.sv-kpi-ico svg { width:18px; height:18px; }
			.sv-kpi-pct { font-size:11px; font-weight:700; color:var(--c); background:color-mix(in srgb, var(--c) 12%, transparent);
				padding:2px 8px; border-radius:20px; }
			.sv-kpi-val { font-size:28px; font-weight:800; line-height:1.1; color:var(--heading-color); }
			.sv-kpi-lbl { font-size:12.5px; font-weight:600; color:var(--text-color); margin-top:2px; }
			.sv-kpi-hint { font-size:11px; color:var(--text-muted); margin-top:2px; }
			.sv-kpi-bar { height:4px; border-radius:4px; background:var(--bg-light-gray); margin-top:12px; overflow:hidden; }
			.sv-kpi-bar i { display:block; height:100%; background:var(--c); border-radius:4px; transition:width .5s; }

			.sv-grid { display:grid; grid-template-columns:1.1fr 1fr 1fr; gap:14px; margin-bottom:18px; }
			@media (max-width: 1100px) { .sv-grid { grid-template-columns:1fr; } }
			.sv-panel { background:var(--card-bg); border:1px solid var(--border-color); border-radius:var(--sv-radius); padding:16px 18px; }
			.sv-panel-h { display:flex; justify-content:space-between; align-items:baseline; gap:10px; margin-bottom:12px; }
			.sv-panel-h > span { font-weight:700; font-size:14px; color:var(--heading-color); }
			.sv-panel-h small { color:var(--text-muted); font-size:11px; }

			.sv-stack { display:flex; height:14px; border-radius:8px; overflow:hidden; background:var(--bg-light-gray); }
			.sv-stack i { display:block; height:100%; cursor:pointer; transition:filter .15s, width .5s; }
			.sv-stack i:hover { filter:brightness(1.12); }
			.sv-legend { display:grid; grid-template-columns:repeat(auto-fill,minmax(120px,1fr)); gap:8px; margin-top:12px; }
			.sv-leg { display:flex; align-items:center; gap:8px; padding:6px 8px; border-radius:8px; cursor:pointer; border:1px solid transparent; }
			.sv-leg:hover { background:var(--bg-light-gray); }
			.sv-leg.on { border-color:var(--c); background:color-mix(in srgb, var(--c) 8%, transparent); }
			.sv-leg .dot { width:10px; height:10px; border-radius:3px; background:var(--c); flex:none; }
			.sv-leg .t { font-size:11.5px; color:var(--text-muted); line-height:1.2; }
			.sv-leg .t b { display:block; color:var(--heading-color); font-size:14px; }

			.sv-prov { display:flex; flex-direction:column; gap:10px; max-height:300px; overflow:auto; padding-right:4px; }
			.sv-prov-row { cursor:pointer; padding:6px 8px; border-radius:8px; }
			.sv-prov-row:hover { background:var(--bg-light-gray); }
			.sv-prov-row.on { background:color-mix(in srgb, ${SD_COLORS.total} 10%, transparent); box-shadow:0 0 0 1px ${SD_COLORS.total} inset; }
			.sv-prov-top { display:flex; justify-content:space-between; font-size:12.5px; margin-bottom:5px; }
			.sv-prov-top b { color:var(--heading-color); }
			.sv-prov .sv-stack { height:8px; }

			.sv-programs { display:flex; flex-direction:column; gap:9px; max-height:300px; overflow:auto; padding-right:4px; }
			.sv-prog-top { display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px; gap:8px; }
			.sv-prog-top span { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
			.sv-prog-bar { height:7px; border-radius:6px; background:var(--bg-light-gray); overflow:hidden; }
			.sv-prog-bar i { display:block; height:100%; border-radius:6px; transition:width .5s; }
			.sv-empty { color:var(--text-muted); font-size:12px; text-align:center; padding:28px 0; }

			.sv-table-panel { padding:0; overflow:hidden; }
			.sv-table-h { padding:14px 18px; margin:0; border-bottom:1px solid var(--border-color); align-items:center; flex-wrap:wrap; }
			.sv-count { font-weight:600; font-size:12px; color:var(--text-muted); margin-left:6px; }
			.sv-active-filters { display:flex; gap:6px; flex-wrap:wrap; }
			.sv-fchip { font-size:11.5px; padding:3px 6px 3px 10px; border-radius:20px; background:var(--bg-light-gray); color:var(--text-color); display:inline-flex; align-items:center; gap:4px; }
			.sv-fchip button { border:0; background:transparent; color:var(--text-muted); cursor:pointer; padding:0 4px; font-size:14px; line-height:1; }
			.sv-scroll { max-height:64vh; overflow:auto; }
			.sv-table { width:100%; border-collapse:separate; border-spacing:0; }
			.sv-table th { position:sticky; top:0; z-index:1; background:var(--subtle-fg); font-size:11px; text-transform:uppercase;
				letter-spacing:.05em; color:var(--text-muted); font-weight:700; padding:10px 14px; white-space:nowrap; border-bottom:1px solid var(--border-color); }
			.sv-table th[data-sort] { cursor:pointer; user-select:none; }
			.sv-table th[data-sort]:hover { color:var(--heading-color); }
			.sv-table th .arr { margin-left:4px; color:${SD_COLORS.total}; }
			.sv-table td { padding:11px 14px; font-size:12.5px; border-bottom:1px solid var(--border-color); vertical-align:middle; }
			.sv-table tr.sv-row { cursor:pointer; transition:background .1s; }
			.sv-table tr.sv-row:hover td { background:color-mix(in srgb, ${SD_COLORS.total} 5%, transparent); }
			.sv-school { display:flex; align-items:center; gap:10px; min-width:220px; }
			.sv-avatar { width:34px; height:34px; border-radius:10px; flex:none; display:flex; align-items:center; justify-content:center;
				font-weight:800; font-size:12px; color:#fff; }
			.sv-school-name { font-weight:600; color:var(--heading-color); line-height:1.25; }
			.sv-school-sub { font-size:11px; color:var(--text-muted); }
			.sv-badge { display:inline-flex; align-items:center; gap:5px; font-size:11px; font-weight:600; padding:3px 9px; border-radius:20px;
				color:var(--c); background:color-mix(in srgb, var(--c) 12%, transparent); white-space:nowrap; }
			.sv-badge::before { content:""; width:6px; height:6px; border-radius:50%; background:var(--c); }
			.sv-model { display:inline-flex; width:26px; height:26px; border-radius:8px; align-items:center; justify-content:center;
				font-weight:800; font-size:12px; color:var(--c); background:color-mix(in srgb, var(--c) 14%, transparent); }
			.sv-loc { line-height:1.25; } .sv-loc small { color:var(--text-muted); display:block; }
			.sv-pill { display:inline-block; padding:2px 8px; margin:2px 3px 2px 0; border-radius:6px; font-size:10.5px; font-weight:600;
				color:var(--c); background:color-mix(in srgb, var(--c) 11%, transparent); white-space:nowrap; }
			.sv-visits { font-weight:800; font-size:14px; color:var(--heading-color); }
			.sv-ago { font-size:11px; font-weight:600; color:var(--c); }
			.sv-more { text-align:center; padding:12px; }

						`;
	}

	icon(name) {
		const p = {
			school: '<path d="M3 10l9-5 9 5-9 5-9-5z"/><path d="M7 12v5c0 1 2.5 3 5 3s5-2 5-3v-5"/>',
			check: '<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>',
			spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>',
			pause: '<circle cx="12" cy="12" r="9"/><path d="M10 9v6M14 9v6"/>',
			layers: '<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/>',
			pin: '<path d="M12 21s7-6.5 7-12a7 7 0 10-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>',
		}[name];
		return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
	}

	args() {
		const v = {};
		["search", "province", "city", "bucket", "model"].forEach((k) => (v[k] = this.f[k].get_value() || ""));
		const p = this.f.visit_period.get_value() || [];
		v.from_date = p[0] || "";
		v.to_date = p[1] || "";
		return v;
	}

	load() {
		this.$body.css("opacity", this.loaded ? 0.6 : 1);
		frappe.call({
			method: `${SD_API}.get_dashboard`,
			args: this.args(),
			freeze: !this.loaded,
			freeze_message: __("Loading schools…"),
			callback: (r) => {
				this.loaded = true;
				this.data = r.message || { summary: {}, rows: [], by_province: [] };
				const current = this.f.province.get_value();
				this.f.province.df.options = [""].concat(this.data.provinces || []);
				this.f.province.refresh();
				if (current) this.f.province.set_value(current);
				this.shown = SD_PAGE_SIZE;
				this.render();
			},
			always: () => this.$body.css("opacity", 1),
		});
	}

	bucket_color(b) {
		return { Active: SD_COLORS.active, "Active New": SD_COLORS.active_new }[b] || SD_COLORS.model_0;
	}

	model_color(m) {
		return SD_COLORS[m] || "#94a3b8";
	}

	render() {
		const s = this.data.summary || {};
		const bucket = this.f.bucket.get_value();
		const model = this.f.model.get_value();
		const fmt = (n) => format_number(n || 0, null, 0);
		const total = s.total || 0;
		const pct = (n) => (total ? Math.round(((n || 0) * 100) / total) : 0);
		const running = (s.active || 0) + (s.active_new || 0);

		const p = this.f.visit_period.get_value() || [];
		this.$body.find(".sv-hero-sub").html(
			p[0] && p[1]
				? __("Visits from {0} to {1}", [frappe.datetime.str_to_user(p[0]), frappe.datetime.str_to_user(p[1])])
				: __("All visits")
		);
		this.$body.find(".sv-hero-stats").html(`
			<div class="sv-hero-stat"><div class="n">${fmt(total)}</div><div class="l">${__("Schools")}</div></div>
			<div class="sv-hero-stat"><div class="n">${fmt(s.visits)}</div><div class="l">${__("Field Visits")}</div></div>
			<div class="sv-hero-stat"><div class="n">${pct(running)}%</div><div class="l">${__("Programs Running")}</div></div>
		`);

		const kpi = (o) => {
			const on = o.field && (o.field === "bucket" ? bucket : model) === o.value ? "on" : "";
			const attrs = o.field ? `data-field="${o.field}" data-value="${o.value}"` : "";
			return `<div class="sv-kpi ${on} ${o.field ? "" : "static"}" style="--c:${o.color}" ${attrs}>
				<div class="sv-kpi-top">
					<div class="sv-kpi-ico">${this.icon(o.icon)}</div>
					${o.pct != null ? `<span class="sv-kpi-pct">${o.pct}%</span>` : ""}
				</div>
				<div class="sv-kpi-val">${fmt(o.val)}</div>
				<div class="sv-kpi-lbl">${o.label}</div>
				<div class="sv-kpi-hint">${o.hint}</div>
				${o.pct != null ? `<div class="sv-kpi-bar"><i style="width:${o.pct}%"></i></div>` : ""}
			</div>`;
		};
		this.$body.find(".sv-kpis").html(
			[
				kpi({ label: __("Total Schools"), val: total, color: SD_COLORS.total, icon: "school", hint: __("Active + Active New + Model 0"), field: "bucket", value: "" }),
				kpi({ label: __("Active Schools"), val: s.active, color: SD_COLORS.active, icon: "check", hint: __("Program running"), field: "bucket", value: "Active", pct: pct(s.active) }),
				kpi({ label: __("Active New"), val: s.active_new, color: SD_COLORS.active_new, icon: "spark", hint: __("New school, program running"), field: "bucket", value: "Active New", pct: pct(s.active_new) }),
				kpi({ label: __("Model 0"), val: s.model_0, color: SD_COLORS.model_0, icon: "pause", hint: __("Visited, no program running"), field: "bucket", value: "Model 0", pct: pct(s.model_0) }),
				kpi({ label: __("Field Visits"), val: s.visits, color: SD_COLORS.visits, icon: "pin", hint: total ? __("{0} visits per school", [(s.visits / total).toFixed(1)]) : "" }),
			].join("")
		);

		this.render_split(".sv-split-status", "bucket", bucket, [
			{ label: __("Active"), value: "Active", n: s.active, color: SD_COLORS.active },
			{ label: __("Active New"), value: "Active New", n: s.active_new, color: SD_COLORS.active_new },
			{ label: __("Model 0"), value: "Model 0", n: s.model_0, color: SD_COLORS.model_0 },
		]);
		this.render_split(".sv-split-model", "model", model, [
			{ label: __("Model A · 3 depts"), value: "A", n: s.model_a, color: SD_COLORS.A },
			{ label: __("Model B · 2 depts"), value: "B", n: s.model_b, color: SD_COLORS.B },
			{ label: __("Model C · 1 dept"), value: "C", n: s.model_c, color: SD_COLORS.C },
		]);

		this.render_provinces();
		this.render_programs();
		this.render_active_filters();
		this.render_rows();
	}

	render_split(sel, field, current, parts) {
		const sum = parts.reduce((a, p) => a + (p.n || 0), 0);
		const fmt = (n) => format_number(n || 0, null, 0);
		const bar = parts
			.map((p) => {
				const w = sum ? ((p.n || 0) * 100) / sum : 0;
				return `<i data-field="${field}" data-value="${p.value}" title="${p.label}: ${fmt(p.n)}" style="width:${w}%;background:${p.color}"></i>`;
			})
			.join("");
		const legend = parts
			.map((p) => {
				const share = sum ? Math.round(((p.n || 0) * 100) / sum) : 0;
				return `<div class="sv-leg ${current === p.value ? "on" : ""}" style="--c:${p.color}" data-field="${field}" data-value="${p.value}">
					<span class="dot"></span><span class="t"><b>${fmt(p.n)}</b>${p.label} · ${share}%</span></div>`;
			})
			.join("");
		this.$body.find(sel).html(`<div class="sv-stack">${bar}</div><div class="sv-legend">${legend}</div>`);
	}

	render_provinces() {
		const esc = frappe.utils.escape_html;
		const list = this.data.by_province || [];
		const current = this.f.province.get_value();
		const max = Math.max(1, ...list.map((p) => p.total));
		this.$body.find(".sv-prov").html(
			list.length
				? list
						.map((p) => {
							const seg = (n, c) => `<i style="width:${(n * 100) / max}%;background:${c}"></i>`;
							return `<div class="sv-prov-row ${p.province === current ? "on" : ""}" data-province="${esc(p.province)}"
								title="${__("Active")}: ${p.active} · ${__("Active New")}: ${p.active_new} · ${__("Model 0")}: ${p.model_0}">
								<div class="sv-prov-top"><span>${esc(p.province)}</span><b>${format_number(p.total, null, 0)}</b></div>
								<div class="sv-stack">${seg(p.active, SD_COLORS.active)}${seg(p.active_new, SD_COLORS.active_new)}${seg(p.model_0, SD_COLORS.model_0)}</div>
							</div>`;
						})
						.join("")
				: `<div class="sv-empty">${__("No data")}</div>`
		);
	}

	render_programs() {
		const esc = frappe.utils.escape_html;
		const counts = {};
		(this.data.rows || []).forEach((r) =>
			(r.running || []).forEach((p) => {
				const c = (counts[p.label] = counts[p.label] || { label: p.label, dept: p.dept, n: 0 });
				c.n += 1;
			})
		);
		const list = Object.values(counts).sort((a, b) => b.n - a.n).slice(0, 12);
		const max = Math.max(1, ...list.map((p) => p.n));
		this.$body.find(".sv-programs").html(
			list.length
				? list
						.map((p) => {
							const color = (SD_DEPT[p.dept] || {}).color || SD_COLORS.total;
							return `<div>
								<div class="sv-prog-top"><span title="${esc(p.label)}">${esc(p.label)}
									<span class="sv-pill" style="--c:${color}">${esc(p.dept || "")}</span></span>
									<b>${format_number(p.n, null, 0)}</b></div>
								<div class="sv-prog-bar"><i style="width:${(p.n * 100) / max}%;background:${color}"></i></div>
							</div>`;
						})
						.join("")
				: `<div class="sv-empty">${__("No programs running in this selection")}</div>`
		);
	}

	render_active_filters() {
		const esc = frappe.utils.escape_html;
		const labels = { search: __("Search"), province: __("Province"), city: __("City"), bucket: __("Status"), model: __("Model") };
		const chips = Object.keys(labels)
			.filter((k) => this.f[k].get_value())
			.map((k) => {
				let v = this.f[k].get_value();
				if (k === "model") v = v === "0" ? __("Model 0") : __("Model {0}", [v]);
				return `<span class="sv-fchip">${labels[k]}: <b>${esc(v)}</b><button data-clear="${k}" title="${__("Clear")}">×</button></span>`;
			});
		this.$body.find(".sv-active-filters").html(chips.join(""));
	}

	sorted_rows() {
		const { key, dir } = this.sort;
		if (this._sorted && this._sorted.src === this.data.rows && this._sorted.key === key && this._sorted.dir === dir) {
			return this._sorted.rows;
		}
		const val = (r) => {
			const v = r[key];
			if (key === "visits") return v || 0;
			return cstr(v || "").toLowerCase();
		};
		const rows = (this.data.rows || []).slice().sort((a, b) => {
			const x = val(a);
			const y = val(b);
			return x < y ? -dir : x > y ? dir : 0;
		});
		this._sorted = { src: this.data.rows, key, dir, rows };
		return rows;
	}

	initials(name) {
		const words = cstr(name).replace(/[^A-Za-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
		return ((words[0] || "?")[0] + ((words[1] || "")[0] || "")).toUpperCase();
	}

	ago(date) {
		if (!date) return { text: "—", color: "var(--text-muted)" };
		const days = frappe.datetime.get_day_diff(frappe.datetime.get_today(), date);
		const color = days <= 30 ? SD_COLORS.active : days <= 90 ? "#d97706" : SD_COLORS.model_0;
		const text = days <= 0 ? __("Today") : days === 1 ? __("Yesterday") : __("{0} days ago", [days]);
		return { text, color };
	}

	render_rows() {
		const esc = frappe.utils.escape_html;
		const rows = this.sorted_rows();
		this.$body.find(".sv-count").text(`(${format_number(rows.length, null, 0)})`);
		this.$body.find("th[data-sort]").each((_, th) => {
			const $th = $(th);
			$th.find(".arr").remove();
			if ($th.attr("data-sort") === this.sort.key) $th.append(`<span class="arr">${this.sort.dir > 0 ? "▲" : "▼"}</span>`);
		});

		const html = rows
			.slice(0, this.shown)
			.map((r, i) => {
				const bc = this.bucket_color(r.bucket);
				const pills = r.running.length
					? r.running
							.slice(0, 4)
							.map((p) => `<span class="sv-pill" style="--c:${(SD_DEPT[p.dept] || {}).color || "#64748b"}">${esc(p.label)}</span>`)
							.join("") + (r.running.length > 4 ? `<span class="sv-pill" style="--c:#64748b">+${r.running.length - 4}</span>` : "")
					: `<span class="text-muted">—</span>`;
				const ago = this.ago(r.last_visit);
				return `<tr class="sv-row" data-idx="${i}">
					<td><div class="sv-school">
						<div class="sv-avatar" style="background:linear-gradient(135deg, ${bc}, color-mix(in srgb, ${bc} 55%, #0f172a))">${esc(this.initials(r.school_label))}</div>
						<div><div class="sv-school-name">${esc(r.school_label)}</div>
							<div class="sv-school-sub">${r.first_visit ? __("Since {0}", [frappe.datetime.str_to_user(r.first_visit)]) : ""}</div></div>
					</div></td>
					<td><span class="sv-badge" style="--c:${bc}">${esc(__(r.bucket))}</span></td>
					<td><span class="sv-model" style="--c:${this.model_color(r.model)}">${r.model}</span></td>
					<td><div class="sv-loc">${esc(r.city || "—")}<small>${esc(r.province || "")}</small></div></td>
					<td>${pills}</td>
					<td class="text-right"><span class="sv-visits">${r.visits}</span></td>
					<td style="white-space:nowrap">
						<div>${r.last_visit ? frappe.datetime.str_to_user(r.last_visit) : "—"}</div>
						<div class="sv-ago" style="--c:${ago.color}">${ago.text}${r.last_by ? ` · <span class="text-muted">${esc(r.last_by)}</span>` : ""}</div>
					</td>
				</tr>`;
			})
			.join("");
		this.$body
			.find("tbody")
			.html(html || `<tr><td colspan="7"><div class="sv-empty">${__("No schools match these filters")}</div></td></tr>`);
		this.$body
			.find(".sv-more")
			.html(
				rows.length > this.shown
					? `<span class="text-muted small">${__("Showing {0} of {1}", [this.shown, rows.length])}</span>
						<button class="btn btn-xs btn-default sv-show-more ml-2">${__("Show more")}</button>`
					: rows.length
					? `<span class="text-muted small">${__("All {0} schools shown", [rows.length])}</span>`
					: ""
			);
	}

	profile_url(r) {
		const p = this.f.visit_period.get_value() || [];
		const q = new URLSearchParams({ school: r.school, from: p[0] || "", to: p[1] || "" });
		return `/app/school-profile?${q.toString()}`;
	}

	export_csv() {
		const rows = this.sorted_rows();
		if (!rows.length) {
			frappe.msgprint(__("Nothing to export."));
			return;
		}
		const header = [
			"School", "Status", "Model", "City", "Province", "Address", "Running Programs",
			"Visits", "Marketing", "Follow up", "M&E", "First Visit", "Last Visit", "Last Visited By",
		];
		const data = [header].concat(
			rows.map((r) => [
				r.school_label, r.bucket, r.model, r.city, r.province, r.address,
				r.running.map((p) => p.label).join(", "),
				r.visits, r.marketing_visits, r.followup_visits, r.me_visits,
				r.first_visit || "", r.last_visit || "", r.last_by,
			])
		);
		frappe.tools.downloadify(data, null, `School Database Dashboard New ${frappe.datetime.get_today()}`);
	}
}
