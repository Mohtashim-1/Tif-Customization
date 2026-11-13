const SP_API = "tif_customization.tif_customization.page.school_profile.school_profile";

const SP_COLORS = {
	Active: "#16a34a",
	"Active New": "#2563eb",
	"Model 0": "#dc2626",
	A: "#f59e0b",
	B: "#ea580c",
	C: "#a16207",
	"0": "#94a3b8",
};
const SP_DEPT = { QPS: "#059669", TPS: "#2563eb", CEE: "#d97706" };
const SP_TONE = { active: "#16a34a", inactive: "#dc2626", none: "#64748b", neutral: "#64748b" };

frappe.pages["school-profile"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("School Profile"),
		single_column: true,
	});
	wrapper.school_profile = new SchoolProfile(page);
};

frappe.pages["school-profile"].on_page_show = function (wrapper) {
	if (wrapper.school_profile) wrapper.school_profile.load_from_url();
};

class SchoolProfile {
	constructor(page) {
		this.page = page;
		this.tab = "overview";
		this.page.set_secondary_action(__("School Database Dashboard New (UAT)"), () => frappe.set_route("school-visit-dashboard"));
		this.$body = $(`<div class="sp-wrap"><style>${this.css()}</style><div class="sp-root"></div></div>`).appendTo(this.page.main);
		this.$root = this.$body.find(".sp-root");

		this.$body.on("click", ".sp-tab", (e) => {
			this.tab = $(e.currentTarget).attr("data-tab");
			this.render();
		});
		this.$body.on("click", "[data-open]", (e) => {
			e.preventDefault();
			const [doctype, name] = $(e.currentTarget).attr("data-open").split("::");
			window.open(`/app/${frappe.router.slug(doctype)}/${encodeURIComponent(name)}`, "_blank");
		});
		this.$body.on("input", ".sp-visit-search", frappe.utils.debounce((e) => {
			this.visit_query = cstr($(e.target).val()).toLowerCase();
			this.render_visit_list();
		}, 250));
		this.$body.on("click", "[data-vtype]", (e) => {
			const t = $(e.currentTarget).attr("data-vtype");
			this.visit_type = this.tab === "visits" && this.visit_type === t ? "" : t;
			this.tab = "visits";
			this.render();
		});
		this.$body.on("click", "[data-tab-go]", (e) => {
			this.tab = $(e.currentTarget).attr("data-tab-go");
			this.visit_type = "";
			this.render();
		});
	}

	load_from_url() {
		const q = new URLSearchParams(window.location.search);
		const school = q.get("school") || (frappe.route_options || {}).school || "";
		const args = { school, from_date: q.get("from") || "", to_date: q.get("to") || "" };
		if (!school) {
			this.$root.html(`<div class="sp-empty">${__("Open a school from the School Database Dashboard New (UAT).")}</div>`);
			return;
		}
		if (this.args && JSON.stringify(this.args) === JSON.stringify(args)) return;
		this.args = args;
		this.tab = "overview";
		this.visit_type = "";
		this.visit_query = "";
		this.$root.html(`<div class="sp-empty">${__("Loading school profile…")}</div>`);
		frappe.call({
			method: `${SP_API}.get_school_profile`,
			args,
			callback: (r) => {
				this.data = r.message;
				this.page.set_title(this.data.label);
				document.title = `${this.data.label} · ${__("School Profile")}`;
				this.render();
			},
			error: () => {
				this.$root.html(`<div class="sp-empty">${__("Could not load this school.")}</div>`);
			},
		});
	}

	css() {
		return `
			.sp-wrap { padding:4px 0 40px; }
			.sp-empty { text-align:center; color:var(--text-muted); padding:60px 0; }
			.sp-hero { border-radius:16px; padding:24px 26px 20px; color:#fff; margin-bottom:16px;
				background: radial-gradient(circle at 90% 10%, rgba(255,255,255,.18), transparent 40%),
					linear-gradient(120deg, #312e81 0%, #4f46e5 45%, #0d9488 100%);
				box-shadow:0 12px 30px -14px rgba(79,70,229,.6); }
			.sp-hero-top { display:flex; justify-content:space-between; gap:20px; flex-wrap:wrap; align-items:flex-start; }
			.sp-hero h2 { color:#fff; font-weight:800; font-size:26px; margin:8px 0 4px; }
			.sp-hero .meta { opacity:.9; font-size:13px; }
			.sp-hero .meta span + span::before { content:"·"; margin:0 8px; opacity:.6; }
			.sp-tag { display:inline-flex; align-items:center; gap:6px; font-size:11.5px; font-weight:700; padding:4px 10px;
				border-radius:20px; background:rgba(255,255,255,.16); border:1px solid rgba(255,255,255,.25); margin-right:6px; }
			.sp-tag i { width:8px; height:8px; border-radius:50%; background:var(--c, #fff); box-shadow:0 0 0 2px rgba(255,255,255,.6); }
			.sp-hero-stats { display:grid; grid-template-columns:repeat(4, minmax(100px, 1fr)); gap:10px; }
			.sp-hero-stat { background:rgba(255,255,255,.14); border:1px solid rgba(255,255,255,.22); border-radius:12px; padding:10px 14px; }
			.sp-hero-stat .n { font-size:22px; font-weight:800; line-height:1.1; }
			.sp-hero-stat .l { font-size:10.5px; text-transform:uppercase; letter-spacing:.06em; opacity:.85; }
			.sp-tabs { display:flex; gap:4px; margin-top:18px; flex-wrap:wrap; }
			.sp-tab { border:0; background:rgba(255,255,255,.1); color:#fff; padding:7px 14px; border-radius:9px; font-size:12.5px; font-weight:600; cursor:pointer; }
			.sp-tab:hover { background:rgba(255,255,255,.2); }
			.sp-tab.on { background:#fff; color:#312e81; }
			.sp-tab b { margin-left:6px; font-size:11px; opacity:.75; }

			.sp-grid { display:grid; gap:14px; margin-bottom:14px; }
			.sp-grid.g2 { grid-template-columns:1fr 1fr; }
			.sp-grid.g3 { grid-template-columns:1.2fr 1fr 1fr; }
			@media (max-width:1000px) { .sp-grid.g2, .sp-grid.g3 { grid-template-columns:1fr; } .sp-hero-stats { grid-template-columns:repeat(2,1fr); } }
			.sp-panel { background:var(--card-bg); border:1px solid var(--border-color); border-radius:14px; padding:16px 18px; }
			.sp-panel.flush { padding:0; overflow:hidden; }
			.sp-panel-h { display:flex; justify-content:space-between; align-items:baseline; gap:10px; margin-bottom:12px; }
			.sp-panel.flush .sp-panel-h { padding:14px 18px 0; }
			.sp-panel-h > span { font-weight:700; font-size:14px; color:var(--heading-color); }
			.sp-panel-h small { color:var(--text-muted); font-size:11px; }

			.sp-status { display:flex; align-items:center; gap:16px; padding:14px; border-radius:12px;
				background:color-mix(in srgb, var(--c) 9%, transparent); border:1px solid color-mix(in srgb, var(--c) 30%, transparent); margin-bottom:14px; }
			.sp-status-ring { width:58px; height:58px; border-radius:50%; flex:none; display:flex; align-items:center; justify-content:center;
				background:var(--c); color:#fff; font-weight:800; font-size:20px; box-shadow:0 0 0 6px color-mix(in srgb, var(--c) 18%, transparent); }
			.sp-status .t { font-size:20px; font-weight:800; color:var(--c); line-height:1.1; }
			.sp-status .s { font-size:12px; color:var(--text-muted); margin-top:3px; }
			.sp-depts { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; }
			.sp-dept { border:1px solid var(--border-color); border-radius:12px; padding:10px 12px; border-top:3px solid var(--c); }
			.sp-dept .code { font-weight:800; color:var(--c); font-size:13px; }
			.sp-dept .v { font-size:12px; font-weight:600; color:var(--heading-color); margin-top:4px; }
			.sp-dept .d { font-size:11px; color:var(--text-muted); }

			.sp-kv { display:grid; grid-template-columns:repeat(2,1fr); gap:12px 18px; }
			.sp-kv .k { font-size:11px; color:var(--text-muted); text-transform:uppercase; letter-spacing:.04em; }
			.sp-kv .v { font-weight:600; color:var(--heading-color); font-size:13px; }
			.sp-pill { display:inline-block; padding:2px 8px; margin:2px 4px 2px 0; border-radius:6px; font-size:11px; font-weight:600;
				color:var(--c); background:color-mix(in srgb, var(--c) 11%, transparent); white-space:nowrap; }
			.sp-badge { display:inline-flex; align-items:center; gap:5px; font-size:11px; font-weight:600; padding:3px 9px; border-radius:20px;
				color:var(--c); background:color-mix(in srgb, var(--c) 12%, transparent); white-space:nowrap; }
			.sp-badge::before { content:""; width:6px; height:6px; border-radius:50%; background:var(--c); }

			.sp-types { display:flex; flex-direction:column; gap:8px; }
			.sp-type { cursor:pointer; padding:4px 6px; border-radius:8px; }
			.sp-type:hover { background:var(--bg-light-gray); }
			.sp-type-top { display:flex; justify-content:space-between; font-size:12.5px; margin-bottom:4px; }
			.sp-bar { height:7px; border-radius:6px; background:var(--bg-light-gray); overflow:hidden; }
			.sp-bar i { display:block; height:100%; border-radius:6px; background:#4f46e5; }

			.sp-table { width:100%; border-collapse:separate; border-spacing:0; }
			.sp-table th { background:var(--subtle-fg); font-size:11px; text-transform:uppercase; letter-spacing:.05em; color:var(--text-muted);
				font-weight:700; padding:10px 14px; white-space:nowrap; border-bottom:1px solid var(--border-color); text-align:left; }
			.sp-table td { padding:10px 14px; font-size:12.5px; border-bottom:1px solid var(--border-color); vertical-align:top; }
			.sp-table tr:last-child td { border-bottom:0; }
			.sp-link { color:#4f46e5; font-weight:600; cursor:pointer; }
			.sp-link:hover { text-decoration:underline; }
			.sp-muted { color:var(--text-muted); }
			.sp-none { color:var(--text-muted); text-align:center; padding:26px 10px; font-size:12.5px; }

			.sp-dn { border:1px solid var(--border-color); border-radius:12px; padding:12px 14px; margin-bottom:10px; }
			.sp-dn-top { display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap; align-items:center; margin-bottom:8px; }
			.sp-dn-meta { display:flex; gap:14px; flex-wrap:wrap; font-size:11.5px; color:var(--text-muted); }
			.sp-dn-meta b { color:var(--heading-color); font-weight:600; }
			.sp-dn-items { display:flex; flex-wrap:wrap; gap:6px; margin-top:8px; }
			.sp-dn-item { font-size:11.5px; padding:4px 9px; border-radius:8px; background:var(--bg-light-gray); }
			.sp-dn-item b { color:#4f46e5; margin-left:4px; }

			.sp-timeline { position:relative; padding-left:26px; }
			.sp-timeline::before { content:""; position:absolute; left:8px; top:6px; bottom:6px; width:2px; background:var(--border-color); }
			.sp-tl { position:relative; margin-bottom:12px; border:1px solid var(--border-color); border-radius:12px; padding:12px 14px; background:var(--card-bg); }
			.sp-tl::before { content:""; position:absolute; left:-23px; top:16px; width:12px; height:12px; border-radius:50%;
				background:var(--c, #4f46e5); box-shadow:0 0 0 3px var(--card-bg), 0 0 0 4px var(--c, #4f46e5); }
			.sp-tl-top { display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap; align-items:center; }
			.sp-tl-date { font-weight:800; color:var(--heading-color); }
			.sp-tl-sub { font-size:12px; color:var(--text-muted); margin-top:2px; }
			.sp-tl-blocks { display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:8px 16px; margin-top:10px; }
			.sp-tl-blocks .k { font-size:10.5px; color:var(--text-muted); text-transform:uppercase; letter-spacing:.05em; font-weight:700; }
			.sp-tl-blocks .v { font-size:12.5px; color:var(--text-color); white-space:pre-wrap; word-break:break-word; }
			.sp-tl-blocks .wide { grid-column:1 / -1; }
			.sp-toolbar { display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-bottom:12px; }
			.sp-toolbar input { max-width:280px; }
			.sp-chip { font-size:11.5px; padding:4px 10px; border-radius:20px; border:1px solid var(--border-color); cursor:pointer; background:var(--card-bg); }
			.sp-chip.on { background:#4f46e5; color:#fff; border-color:#4f46e5; }
		`;
	}

	fmt_date(d) {
		return d ? frappe.datetime.str_to_user(d) : "—";
	}

	ago(d) {
		if (!d) return "";
		const days = frappe.datetime.get_day_diff(frappe.datetime.get_today(), d);
		return days <= 0 ? __("today") : days === 1 ? __("yesterday") : __("{0} days ago", [days]);
	}

	open_attr(doctype, name) {
		return `data-open="${frappe.utils.escape_html(doctype)}::${frappe.utils.escape_html(name)}"`;
	}

	render() {
		const d = this.data;
		if (!d) return;
		const esc = frappe.utils.escape_html;
		const o = d.overall;
		const s = d.stats;
		const bucket = o.bucket || __("Not in report");
		const tabs = [
			["overview", __("Overview"), ""],
			["books", __("Books & Deliveries"), s.books + s.deliveries],
			["sessions", __("Sessions & Trainings"), s.sessions],
			["visits", __("Field Visits"), s.visits],
			["contacts", __("Contacts"), d.contacts.length],
		];
		const loc = [d.info.city, d.info.province].filter(Boolean).map((x) => `<span>${esc(x)}</span>`).join("");
		this.$root.html(`
			<div class="sp-hero">
				<div class="sp-hero-top">
					<div>
						<span class="sp-tag" style="--c:${SP_COLORS[o.bucket] || "#fff"}"><i></i>${esc(__(bucket))}</span>
						${o.model ? `<span class="sp-tag" style="--c:${SP_COLORS[o.model]}"><i></i>${o.model === "0" ? __("Model 0") : __("Model {0}", [o.model])}</span>` : ""}
						${o.master_status ? `<span class="sp-tag"><i style="--c:${o.master_status === "Active" ? SP_COLORS.Active : SP_COLORS["Model 0"]}"></i>${__("Master")}: ${esc(__(o.master_status))}</span>` : ""}
						<h2>${esc(d.label)}</h2>
						<div class="meta">${loc || `<span>${__("Location not recorded")}</span>`}
							<span>${__("Last visit {0}", [this.fmt_date(d.info.last_visit)])}${d.info.last_visit ? ` (${this.ago(d.info.last_visit)})` : ""}</span></div>
					</div>
					<div class="sp-hero-stats">
						<div class="sp-hero-stat"><div class="n">${s.visits}</div><div class="l">${__("Visits")}</div></div>
						<div class="sp-hero-stat"><div class="n">${s.books}</div><div class="l">${__("Books Running")}</div></div>
						<div class="sp-hero-stat"><div class="n">${s.deliveries}</div><div class="l">${__("Deliveries")}</div></div>
						<div class="sp-hero-stat"><div class="n">${s.sessions}</div><div class="l">${__("Sessions")}</div></div>
					</div>
				</div>
				<div class="sp-tabs">${tabs
					.map(([k, l, n]) => `<button class="sp-tab ${this.tab === k ? "on" : ""}" data-tab="${k}">${l}${n !== "" ? `<b>${n}</b>` : ""}</button>`)
					.join("")}</div>
			</div>
			<div class="sp-content"></div>
		`);
		const $c = this.$root.find(".sp-content");
		$c.html(this[`tab_${this.tab}`]());
		if (this.tab === "visits") this.render_visit_list();
	}

	status_panel() {
		const esc = frappe.utils.escape_html;
		const o = this.data.overall;
		const color = SP_COLORS[o.bucket] || "#64748b";
		const explain = {
			Active: __("At least one TIF program (QPS / TPS / CEE) is running at this school."),
			"Active New": __("Newly registered school with a TIF program running."),
			"Model 0": __("Visited by field staff but no TIF program is running yet."),
		}[o.bucket] || __("This school has no visits in the selected period.");
		const mark = { Active: "✓", "Active New": "★", "Model 0": "0" }[o.bucket] || "?";
		const master = Object.fromEntries((o.program_master || []).map((p) => [p.code, p]));
		const depts = (o.affiliation || [])
			.map((a) => {
				const m = master[a.code];
				const running = (o.running || []).filter((r) => r.dept === a.code).length;
				return `<div class="sp-dept" style="--c:${SP_DEPT[a.code]}">
					<div class="code">${a.code}</div>
					<div class="v">${running ? __("{0} program signals", [running]) : __("Not running")}</div>
					<div class="d">${__("Affiliated")}: ${esc(a.value || "—")}</div>
					${m ? `<div class="d">${__("Master")}: <span style="color:${SP_TONE[m.tone]};font-weight:700">${esc(m.label)}</span></div>` : ""}
				</div>`;
			})
			.join("");
		return `<div class="sp-panel">
			<div class="sp-panel-h"><span>${__("Overall Status")}</span>
				<small>${this.data.in_period ? __("Selected period") : __("All time (no visits in selected period)")}</small></div>
			<div class="sp-status" style="--c:${color}">
				<div class="sp-status-ring">${mark}</div>
				<div><div class="t">${esc(__(o.bucket || "—"))}${o.model && o.model !== "0" ? ` · ${__("Model {0}", [o.model])}` : ""}</div>
					<div class="s">${explain}</div></div>
			</div>
			<div class="sp-depts">${depts}</div>
			<div class="mt-3">${
				(o.running || []).length
					? o.running.map((r) => `<span class="sp-pill" style="--c:${SP_DEPT[r.dept] || "#64748b"}">${esc(r.label)}</span>`).join("")
					: `<span class="sp-muted">${__("No program running")}</span>`
			}</div>
		</div>`;
	}

	tab_overview() {
		const esc = frappe.utils.escape_html;
		const d = this.data;
		const i = d.info;
		const kv = (k, v) => `<div><div class="k">${k}</div><div class="v">${v || "—"}</div></div>`;
		const types = Object.entries(d.stats.type_counts).sort((a, b) => b[1] - a[1]);
		const max = Math.max(1, ...types.map((t) => t[1]));
		const recent = d.visits.slice(0, 4).map((v) => this.visit_card(v)).join("");
		return `
			<div class="sp-grid g2">
				${this.status_panel()}
				<div class="sp-panel">
					<div class="sp-panel-h"><span>${__("School Information")}</span></div>
					<div class="sp-kv">
						${kv(__("City"), esc(i.city))}
						${kv(__("Province"), esc(i.province))}
						${kv(__("First Visit"), this.fmt_date(i.first_visit))}
						${kv(__("Last Visit"), `${this.fmt_date(i.last_visit)} <span class="sp-muted">${this.ago(i.last_visit)}</span>`)}
						${kv(__("Last Visited By"), esc(i.last_by))}
						${kv(__("Items Delivered"), d.stats.delivered_qty ? format_number(d.stats.delivered_qty, null, 0) : "")}
						${i.school_doc ? kv(__("School Record"), `<span class="sp-link" ${this.open_attr("School", i.school_doc)}>${esc(i.school_doc)}</span>`) : ""}
						${i.soa ? kv(__("School Opening"), `<span class="sp-link" ${this.open_attr("School Opening Application", i.soa)}>${esc(i.soa)}</span>`) : ""}
					</div>
					${i.address ? `<div class="mt-3"><div class="sp-kv"><div style="grid-column:1/-1"><div class="k">${__("Address")}</div><div class="v">${esc(i.address)}</div></div></div></div>` : ""}
				</div>
			</div>
			<div class="sp-grid g2">
				<div class="sp-panel">
					<div class="sp-panel-h"><span>${__("Visit Types")}</span><small>${__("Click to see those visits")}</small></div>
					<div class="sp-types">${types
						.map(
							([t, n]) => `<div class="sp-type" data-vtype="${esc(t)}">
								<div class="sp-type-top"><span>${esc(t)}</span><b>${n}</b></div>
								<div class="sp-bar"><i style="width:${(n * 100) / max}%"></i></div></div>`
						)
						.join("")}</div>
				</div>
				<div class="sp-panel">
					<div class="sp-panel-h"><span>${__("Books Running")}</span><small>${__("Reported on field visits")}</small></div>
					${this.books_list(true)}
				</div>
			</div>
			<div class="sp-panel">
				<div class="sp-panel-h"><span>${__("Latest Visits")}</span>
					<span class="sp-link" style="font-size:12px" data-tab-go="visits">${__("View all {0}", [d.visits.length])} →</span></div>
				<div class="sp-timeline">${recent || `<div class="sp-none">${__("No visits")}</div>`}</div>
			</div>
		`;
	}

	books_list(compact) {
		const esc = frappe.utils.escape_html;
		const books = this.data.books;
		if (!books.length) return `<div class="sp-none">${__("No books reported on field visits")}</div>`;
		return `<table class="sp-table">
			<thead><tr><th>${__("Book")}</th><th>${__("Detail")}</th><th>${__("Last Reported")}</th>${compact ? "" : `<th>${__("First Reported")}</th><th>${__("Reported By")}</th>`}<th>${__("Visits")}</th></tr></thead>
			<tbody>${books
				.map(
					(b) => `<tr>
						<td><span class="sp-pill" style="--c:${SP_DEPT[b.dept] || "#64748b"}">${esc(b.dept)}</span> <b>${esc(b.label)}</b></td>
						<td>${esc(b.detail) || `<span class="sp-muted">${__("Yes")}</span>`}</td>
						<td style="white-space:nowrap"><span class="sp-link" ${this.open_attr("Field Visit", b.visit)}>${this.fmt_date(b.last)}</span></td>
						${compact ? "" : `<td style="white-space:nowrap">${this.fmt_date(b.first)}</td><td>${esc(b.by)}</td>`}
						<td>${b.times}</td>
					</tr>`
				)
				.join("")}</tbody></table>`;
	}

	tab_books() {
		const esc = frappe.utils.escape_html;
		const d = this.data;
		const items = d.delivered_items;
		const max = Math.max(1, ...items.map((i) => i.qty));
		const dns = d.deliveries
			.map((n) => {
				const color = n.is_return ? "#dc2626" : /deliver|complete|received/i.test(n.status) ? "#16a34a" : "#d97706";
				return `<div class="sp-dn">
					<div class="sp-dn-top">
						<div><span class="sp-link" ${this.open_attr("Delivery Note", n.name)}>${esc(n.name)}</span>
							<span class="sp-muted ml-2">${this.fmt_date(n.posting_date)}</span></div>
						<span class="sp-badge" style="--c:${color}">${n.is_return ? __("Return") : esc(n.status || __("Submitted"))}</span>
					</div>
					<div class="sp-dn-meta">
						<span>${__("Qty")}: <b>${format_number(n.total_qty, null, 0)}</b></span>
						${n.mode ? `<span>${__("Mode")}: <b>${esc(n.mode)}</b></span>` : ""}
						${n.courier ? `<span>${__("Courier")}: <b>${esc(n.courier)}</b></span>` : ""}
						${n.tracking ? `<span>${__("Tracking")}: <b>${esc(n.tracking)}</b></span>` : ""}
						${n.cartons ? `<span>${__("Cartons")}: <b>${n.cartons}</b></span>` : ""}
						${n.received_by ? `<span>${__("Received by")}: <b>${esc(n.received_by)}</b>${n.received_date ? ` (${this.fmt_date(n.received_date)})` : ""}</span>` : ""}
					</div>
					<div class="sp-dn-items">${n.items
						.map((it) => `<span class="sp-dn-item">${esc(it.item_name)}<b>${format_number(it.qty, null, 0)}</b></span>`)
						.join("")}</div>
				</div>`;
			})
			.join("");
		return `
			<div class="sp-panel flush" style="margin-bottom:14px">
				<div class="sp-panel-h"><span>${__("Books Running")}</span><small>${__("From field visit reports")}</small></div>
				<div style="margin-top:12px">${this.books_list(false)}</div>
			</div>
			<div class="sp-grid g2" style="grid-template-columns:1fr 1.4fr">
				<div class="sp-panel">
					<div class="sp-panel-h"><span>${__("Books Sent (Delivery Notes)")}</span><small>${__("Total quantity per item")}</small></div>
					${
						items.length
							? `<div class="sp-types">${items
									.map(
										(i) => `<div><div class="sp-type-top"><span>${esc(i.item_name)}</span><b>${format_number(i.qty, null, 0)} ${esc(i.uom || "")}</b></div>
										<div class="sp-bar"><i style="width:${(i.qty * 100) / max}%;background:#0d9488"></i></div></div>`
									)
									.join("")}</div>`
							: `<div class="sp-none">${
									d.deliveries.length ? __("No items") : __("No Delivery Note found for this school")
							  }</div>`
					}
				</div>
				<div class="sp-panel">
					<div class="sp-panel-h"><span>${__("Delivery Notes")}</span><small>${__("{0} submitted", [d.deliveries.length])}</small></div>
					${dns || `<div class="sp-none">${__("No books have been sent to this school through a Delivery Note yet.")}</div>`}
				</div>
			</div>
		`;
	}

	tab_sessions() {
		const esc = frappe.utils.escape_html;
		const rows = this.data.sessions;
		if (!rows.length) {
			return `<div class="sp-panel"><div class="sp-none">${__("No training, workshop or session recorded for this school.")}</div></div>`;
		}
		const participants = rows.reduce((a, r) => a + (r.participants || 0), 0);
		const src = { "Field Visit": "#4f46e5", "M&E Visit": "#0d9488", "Upcoming Training": "#d97706" };
		return `<div class="sp-panel flush">
			<div class="sp-panel-h"><span>${__("Sessions, Trainings & Workshops")}</span>
				<small>${__("{0} sessions · {1} participants", [rows.length, format_number(participants, null, 0)])}</small></div>
			<div style="margin-top:12px; overflow:auto"><table class="sp-table">
				<thead><tr><th>${__("Date")}</th><th>${__("Type")}</th><th>${__("Topic")}</th><th>${__("Mode")}</th>
					<th>${__("Trainer")}</th><th>${__("Participants")}</th><th>${__("Status")}</th><th>${__("Source")}</th></tr></thead>
				<tbody>${rows
					.map(
						(r) => `<tr>
							<td style="white-space:nowrap"><b>${this.fmt_date(r.date)}</b></td>
							<td>${esc(r.type)}</td>
							<td>${esc(r.topic) || "—"}</td>
							<td>${esc(r.mode) || "—"}</td>
							<td>${esc(r.trainer) || "—"}</td>
							<td>${r.participants || "—"}</td>
							<td>${r.status ? `<span class="sp-badge" style="--c:${/complete|conduct/i.test(r.status) ? "#16a34a" : "#d97706"}">${esc(r.status)}</span>` : "—"}</td>
							<td><span class="sp-link" ${this.open_attr(r.source === "Upcoming Training" ? "Upcoming Training" : "Field Visit", r.name)}
								style="color:${src[r.source]}">${esc(r.source)}</span></td>
						</tr>`
					)
					.join("")}</tbody>
			</table></div>
		</div>`;
	}

	visit_card(v) {
		const esc = frappe.utils.escape_html;
		const color = { Marketing: "#7c3aed", Visits: "#2563eb", "M&E": "#0d9488" }[v.type] || "#d97706";
		const blocks = cstr(v.remarks)
			.split(" | ")
			.map((part) => {
				const idx = part.indexOf(":");
				const k = idx > 0 ? part.slice(0, idx).trim() : "";
				const val = idx > 0 ? part.slice(idx + 1).trim() : part.trim();
				if (!val || val === "—") return "";
				return `<div class="${k === "Visit Summary" ? "wide" : ""}"><div class="k">${esc(k || __("Note"))}</div><div class="v">${esc(val)}</div></div>`;
			})
			.join("");
		return `<div class="sp-tl" style="--c:${color}">
			<div class="sp-tl-top">
				<div><span class="sp-tl-date">${this.fmt_date(v.date)}</span>
					<span class="sp-badge ml-2" style="--c:${color}">${esc(v.type)}</span></div>
				<span class="sp-link" ${this.open_attr("Field Visit", v.name)}>${esc(v.name)} ↗</span>
			</div>
			<div class="sp-tl-sub">${__("By")} <b>${esc(v.staff || "—")}</b>${
			v.meeting_with ? ` · ${__("Met")} <b>${esc(v.meeting_with)}</b>${v.designation ? ` (${esc(v.designation)})` : ""}` : ""
		}</div>
			${blocks ? `<div class="sp-tl-blocks">${blocks}</div>` : ""}
		</div>`;
	}

	tab_visits() {
		const esc = frappe.utils.escape_html;
		const types = Object.keys(this.data.stats.type_counts).sort();
		return `<div class="sp-panel">
			<div class="sp-toolbar">
				<input type="text" class="form-control input-sm sp-visit-search" placeholder="${__("Search remarks, staff, books…")}" value="${esc(this.visit_query || "")}">
				${types.map((t) => `<span class="sp-chip ${this.visit_type === t ? "on" : ""}" data-vtype="${esc(t)}">${esc(t)} · ${this.data.stats.type_counts[t]}</span>`).join("")}
			</div>
			<div class="sp-timeline sp-visit-list"></div>
		</div>`;
	}

	render_visit_list() {
		const q = this.visit_query || "";
		const rows = this.data.visits.filter(
			(v) =>
				(!this.visit_type || v.type === this.visit_type) &&
				(!q || [v.name, v.staff, v.meeting_with, v.remarks, v.type].join(" ").toLowerCase().includes(q))
		);
		this.$root
			.find(".sp-visit-list")
			.html(rows.map((v) => this.visit_card(v)).join("") || `<div class="sp-none">${__("No visits match")}</div>`);
	}

	tab_contacts() {
		const esc = frappe.utils.escape_html;
		const rows = this.data.contacts;
		if (!rows.length) return `<div class="sp-panel"><div class="sp-none">${__("No contacts recorded")}</div></div>`;
		return `<div class="sp-panel flush">
			<div class="sp-panel-h"><span>${__("School Contacts")}</span><small>${__("Latest first")}</small></div>
			<div style="margin-top:12px"><table class="sp-table">
				<thead><tr><th>${__("Name")}</th><th>${__("Designation")}</th><th>${__("Phone")}</th><th>${__("Last Met")}</th><th>${__("Source")}</th></tr></thead>
				<tbody>${rows
					.map(
						(c) => `<tr><td><b>${esc(c.name)}</b></td><td>${esc(c.designation) || "—"}</td>
							<td>${c.phone ? `<a href="tel:${esc(c.phone)}">${esc(c.phone)}</a>` : "—"}</td>
							<td>${this.fmt_date(c.date)}</td><td class="sp-muted">${esc(c.source)}</td></tr>`
					)
					.join("")}</tbody>
			</table></div>
		</div>`;
	}
}
