frappe.pages["school-impact"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("School Impact"),
		single_column: true,
	});
	frappe.tif_customization = frappe.tif_customization || {};
	new frappe.tif_customization.SchoolImpact(page).make();
};

frappe.tif_customization = frappe.tif_customization || {};

frappe.tif_customization.SchoolImpact = class SchoolImpact {
	constructor(page) {
		this.page = page;
		this.data = null;
		this.filters = {};
		this.range = "all";
		this.qAudience = {};
		this.qHidden = {};
		this.sortKey = "responses";
		this.sortDir = -1;
		this.commentQuery = "";
		this.panelKey = "";
	}

	make() {
		this.make_layout();
		this.make_filters();
		this.page.set_primary_action(__("Refresh"), () => this.load_data(), "refresh");
		this.page.add_action_item(__("Export CSV"), () => this.export_csv());
		this.page.add_action_item(__("Print"), () => window.print());
		this.page.add_action_item(__("Copy link"), () => this.copy_link());
		this.bind_events();
		this.load_data();
	}

	make_layout() {
		$(this.page.body).html(`
			<div class="si-root">
				<style>
					.si-root{padding:4px 12px 28px;color:#1f2937}
					.si-note{font-size:12px;color:#64748b;margin:0 0 12px;line-height:1.45}
					.si-filters{display:grid;grid-template-columns:repeat(5,minmax(140px,1fr));gap:10px}
					.si-field label{display:block;font-size:12px;color:#64748b;margin-bottom:4px}
					.si-field select,.si-search{width:100%;height:28px;border:1px solid #d1d5db;border-radius:6px;padding:0 8px;background:#fff;font-size:13px}
					.si-bar-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;margin:10px 0 12px}
					.si-ranges,.si-chips{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
					.si-ranges button,.si-chip,.si-aud-chip{border:1px solid #e5e7eb;background:#fff;border-radius:99px;padding:3px 10px;font-size:12px;color:#334155}
					.si-ranges button.on{background:#14532d;color:#fff;border-color:#14532d}
					.si-chip{background:#f8fafc}
					.si-chip button{border:0;background:transparent;color:#64748b;padding:0 0 0 4px;font-size:14px;line-height:1}
					.si-count{font-size:12px;color:#64748b}
					.si-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:14px}
					.si-kpi{background:#fff;border:1px solid #e5e7eb;border-top:3px solid #166534;border-radius:10px;padding:12px 14px}
					.si-kpi .lbl{font-size:11px;font-weight:700;letter-spacing:.04em;color:#64748b}
					.si-kpi .val{font-size:26px;font-weight:750;color:#14532d;line-height:1.15;margin-top:2px}
					.si-kpi .hint{font-size:12px;color:#94a3b8;margin-top:2px}
					.si-split{display:grid;grid-template-columns:minmax(260px,320px) minmax(0,1fr);gap:12px;margin-bottom:14px;align-items:start}
					.si-card{background:#fff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;margin-bottom:12px}
					.si-card h3{margin:0;padding:12px 14px;font-size:14px;font-weight:700;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center}
					.si-card h3 small{font-weight:500;color:#94a3b8;font-size:11px}
					.si-card .body{padding:12px 14px}
					.si-aud{display:flex;align-items:center;gap:8px;width:100%;border:0;background:transparent;padding:4px 0;font-size:13px;text-align:left}
					.si-aud .name{width:62px;font-weight:650}
					.si-track{flex:1;height:8px;background:#f1f5f9;border-radius:99px;overflow:hidden}
					.si-track span{display:block;height:100%;border-radius:99px}
					.si-aud .num{width:28px;text-align:right;font-variant-numeric:tabular-nums;font-weight:700}
					.si-days{display:flex;align-items:flex-end;gap:3px;height:128px;padding-top:8px}
					.si-days button{flex:1;border:0;background:#166534;border-radius:3px 3px 0 0;min-width:4px;padding:0}
					.si-days button:hover{background:#14532d}
					.si-day-labels{display:flex;justify-content:space-between;font-size:11px;color:#94a3b8;margin-top:4px}
					.si-q{padding:12px 14px;border-bottom:1px solid #f1f5f9}
					.si-q:last-child{border-bottom:0}
					.si-q-top{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}
					.si-kind{font-size:10px;font-weight:800;letter-spacing:.06em;color:#64748b}
					.si-q-top button.linkish{border:0;background:transparent;color:#64748b;font-size:12px}
					.si-ask{font-size:14px;font-weight:700;margin:4px 0}
					.si-meta{font-size:12px;color:#64748b;margin-bottom:8px}
					.si-chips-q{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px}
					.si-aud-chip.on{color:#fff;border-color:transparent}
					.si-opt{display:grid;grid-template-columns:92px 1fr 28px;gap:8px;align-items:center;font-size:12px;margin-top:5px}
					.si-table-wrap{overflow:auto;max-height:min(52vh,520px)}
					.si-table{width:100%;border-collapse:collapse;font-size:12px;min-width:980px}
					.si-table th,.si-table td{padding:8px 10px;border-bottom:1px solid #e5e7eb;vertical-align:middle}
					.si-table thead th{position:sticky;top:0;background:#14532d;color:#fff;font-size:10px;letter-spacing:.03em;text-transform:uppercase;text-align:left;cursor:pointer;z-index:1}
					.si-table .num{text-align:right;font-variant-numeric:tabular-nums}
					.si-table tbody tr{cursor:pointer}
					.si-table tbody tr:hover{background:#f0fdf4}
					.si-score{display:inline-block;min-width:42px;text-align:center;padding:2px 7px;border-radius:99px;font-weight:800;font-size:11px}
					.si-score.high{background:#dcfce7;color:#166534}
					.si-score.mid{background:#fef3c7;color:#92400e}
					.si-score.low{background:#fee2e2;color:#991b1b}
					.si-score.none{background:#f1f5f9;color:#64748b}
					.si-pill{display:inline-block;padding:1px 8px;border-radius:99px;font-size:10px;font-weight:700;color:#fff}
					.si-comments-head{display:flex;justify-content:space-between;gap:8px;align-items:center}
					.si-search{max-width:240px}
					.si-empty{padding:18px;color:#64748b;font-size:13px}
					.si-backdrop{position:fixed;inset:0;background:rgba(15,23,42,.35);z-index:1040}
					.si-panel{position:fixed;top:0;right:0;width:min(440px,100%);height:100%;background:#fff;z-index:1050;box-shadow:-8px 0 24px rgba(0,0,0,.12);overflow:auto;padding:16px 18px 28px}
					.si-panel h2{font-size:18px;margin:0 0 4px}
					.si-panel .sub{color:#64748b;font-size:12px;margin-bottom:12px}
					.si-ans{padding:8px 0;border-top:1px solid #f1f5f9;font-size:13px}
					.si-ans b{display:block;margin-bottom:2px}
					@media (max-width:1100px){
						.si-filters,.si-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}
						.si-split{grid-template-columns:1fr}
					}
					@media print{
						.page-head,.navbar,.si-filters,.si-bar-row,.no-print,.si-backdrop,.si-panel{display:none!important}
						.si-table-wrap{max-height:none;overflow:visible}
					}
				</style>
				<p class="si-note">${__(
					"Built from submitted Feedback Studio answers. Impact score is the average rating as a share of the rating scale. Click a school or a comment to see every answer."
				)}</p>
				<div class="si-filters no-print"></div>
				<div class="si-bar-row no-print">
					<div>
						<div class="si-ranges"></div>
						<div class="si-chips"></div>
					</div>
					<div class="si-count"></div>
				</div>
				<div id="si-body"><p class="text-muted">${__("Loading...")}</p></div>
			</div>
		`);
	}

	make_filters() {
		const $host = $(this.page.body).find(".si-filters");
		const addDate = (fieldname, label) => {
			const wrap = $('<div class="si-field"></div>').appendTo($host);
			const control = frappe.ui.form.make_control({
				parent: wrap,
				df: { fieldtype: "Date", fieldname, label: __(label), change: () => this.on_dates_changed() },
				render_input: true,
			});
			control.refresh();
			this.filters[fieldname] = control;
		};
		addDate("from_date", "From date");
		addDate("to_date", "To date");
		$host.append(`
			<div class="si-field"><label>${__("Audience")}</label>
				<select data-filter="audience">
					<option value="">${__("All audiences")}</option>
					<option value="sme">${__("SME")}</option>
					<option value="school">${__("School")}</option>
					<option value="teacher">${__("Teacher")}</option>
					<option value="parent">${__("Parent")}</option>
					<option value="student">${__("Student")}</option>
				</select>
			</div>
			<div class="si-field"><label>${__("SME name")}</label><select data-filter="sme_name"><option value="">${__("All SMEs")}</option></select></div>
			<div class="si-field"><label>${__("School")}</label><select data-filter="school_key"><option value="">${__("All schools")}</option></select></div>
		`);
		this.draw_ranges();
	}

	bind_events() {
		const root = $(this.page.body);
		root.on("change", "[data-filter]", () => this.load_data());
		root.on("click", ".si-ranges button", (event) => {
			this.range = $(event.currentTarget).attr("data-range");
			this.apply_range();
		});
		root.on("click", ".si-chip button", (event) => {
			event.preventDefault();
			this.clear_chip($(event.currentTarget).attr("data-clear"));
		});
		root.on("click", ".si-aud", (event) => {
			root.find('[data-filter="audience"]').val($(event.currentTarget).attr("data-aud"));
			this.load_data();
		});
		root.on("click", ".si-days button", (event) => {
			const day = $(event.currentTarget).attr("data-day");
			this.range = "";
			this.set_dates(day, day);
			this.load_data();
		});
		root.on("click", ".si-aud-chip", (event) => {
			const key = $(event.currentTarget).attr("data-q");
			const aud = $(event.currentTarget).attr("data-aud");
			this.qAudience[key] = this.qAudience[key] === aud ? "" : aud;
			this.render();
		});
		root.on("click", ".si-hide", (event) => {
			const key = $(event.currentTarget).attr("data-q");
			this.qHidden[key] = !this.qHidden[key];
			this.render();
		});
		root.on("click", ".si-sort", (event) => {
			const key = $(event.currentTarget).attr("data-sort");
			if (this.sortKey === key) this.sortDir *= -1;
			else {
				this.sortKey = key;
				this.sortDir = key === "school" || key === "sme_name" ? 1 : -1;
			}
			this.render();
		});
		root.on("click", ".si-school", (event) => this.open_panel($(event.currentTarget).attr("data-key")));
		root.on("click", ".si-comment", (event) => this.open_panel($(event.currentTarget).attr("data-key")));
		root.on("input", ".si-search", (event) => {
			this.commentQuery = event.target.value || "";
			this.render_comments();
		});
		$(document).on("keydown.school-impact", (event) => {
			if (event.key === "Escape") this.close_panel();
		});
	}

	on_dates_changed() {
		if (this._silentDates) return;
		this.range = "";
		this.load_data();
	}

	set_dates(from, to) {
		this._silentDates = true;
		this.filters.from_date.set_value(from);
		this.filters.to_date.set_value(to);
		this._silentDates = false;
	}

	apply_range() {
		const today = frappe.datetime.get_today();
		let from = "";
		let to = "";
		if (this.range === "today") {
			from = to = today;
		} else if (this.range === "7") {
			from = frappe.datetime.add_days(today, -6);
			to = today;
		} else if (this.range === "14") {
			from = frappe.datetime.add_days(today, -13);
			to = today;
		}
		this.set_dates(from, to);
		this.load_data();
	}

	clear_chip(key) {
		if (key === "dates") {
			this.range = "all";
			this.filters.from_date.set_value("");
			this.filters.to_date.set_value("");
		} else {
			$(this.page.body).find(`[data-filter="${key}"]`).val("");
		}
		this.load_data();
	}

	filter_values() {
		return {
			from_date: (this.filters.from_date && this.filters.from_date.get_value()) || "",
			to_date: (this.filters.to_date && this.filters.to_date.get_value()) || "",
			audience: $(this.page.body).find('[data-filter="audience"]').val() || "",
			sme_name: $(this.page.body).find('[data-filter="sme_name"]').val() || "",
			school_key: $(this.page.body).find('[data-filter="school_key"]').val() || "",
		};
	}

	load_data() {
		const filters = this.filter_values();
		frappe.call({
			method: "tif_customization.tif_customization.page.school_impact.school_impact.get_report_data",
			args: { filters },
			callback: (r) => {
				this.data = (r && r.message) || null;
				this.fill_options();
				this.draw_ranges();
				this.draw_chips();
				this.render();
			},
		});
	}

	fill_options() {
		const options = (this.data && this.data.options) || {};
		const sme = $(this.page.body).find('[data-filter="sme_name"]');
		const school = $(this.page.body).find('[data-filter="school_key"]');
		const smeVal = sme.val();
		const schoolVal = school.val();
		sme.html(`<option value="">${__("All SMEs")}</option>`);
		(options.smes || []).forEach((name) => {
			sme.append(`<option value="${this.esc(name)}">${this.esc(name)}</option>`);
		});
		school.html(`<option value="">${__("All schools")}</option>`);
		(options.schools || []).forEach((row) => {
			school.append(`<option value="${this.esc(row.key)}">${this.esc(row.label)}</option>`);
		});
		sme.val(smeVal || "");
		school.val(schoolVal || "");
	}

	draw_ranges() {
		const ranges = [
			["all", __("All time")],
			["today", __("Today")],
			["7", __("Last 7 days")],
			["14", __("Last 14 days")],
		];
		$(this.page.body)
			.find(".si-ranges")
			.html(
				ranges
					.map(
						([id, label]) =>
							`<button type="button" data-range="${id}" class="${this.range === id ? "on" : ""}">${this.esc(label)}</button>`
					)
					.join("")
			);
	}

	draw_chips() {
		const filters = this.filter_values();
		const chips = [];
		if (filters.from_date || filters.to_date) {
			chips.push({
				key: "dates",
				label: `${filters.from_date || "…"} – ${filters.to_date || "…"}`,
			});
		}
		if (filters.audience) chips.push({ key: "audience", label: this.audience_label(filters.audience) });
		if (filters.sme_name) chips.push({ key: "sme_name", label: filters.sme_name });
		if (filters.school_key) {
			const school = ((this.data && this.data.options && this.data.options.schools) || []).find(
				(row) => row.key === filters.school_key
			);
			chips.push({ key: "school_key", label: (school && school.label) || __("School") });
		}
		const host = $(this.page.body).find(".si-chips");
		host.html(
			chips.length
				? chips
						.map(
							(chip) =>
								`<span class="si-chip">${this.esc(chip.label)}<button type="button" data-clear="${this.esc(chip.key)}" aria-label="${__(
									"Remove"
								)}">×</button></span>`
						)
						.join("")
				: `<span class="text-muted" style="font-size:12px">${__("No filters applied")}</span>`
		);
		const shown = ((this.data && this.data.kpis) || []).find((row) => row.key === "responses");
		const total = (this.data && this.data.total_all) || 0;
		$(this.page.body)
			.find(".si-count")
			.text(`${(shown && shown.value) || 0} ${__("of")} ${total} ${__("responses")}`);
	}

	esc(value) {
		return frappe.utils.escape_html(value == null ? "" : String(value));
	}

	audience_label(id) {
		return { sme: __("SME"), school: __("School"), teacher: __("Teacher"), parent: __("Parent"), student: __("Student") }[id] || id || "";
	}

	audience_color(id) {
		return { sme: "#7a4cc2", school: "#2f5bd3", teacher: "#0f766e", parent: "#1f8a5b", student: "#c8561f" }[id] || "#64748b";
	}

	score_class(impact) {
		if (impact == null || impact === "") return "none";
		if (impact >= 80) return "high";
		if (impact >= 60) return "mid";
		return "low";
	}

	bar_color(score, scale) {
		const pct = score / (scale || 5);
		if (pct >= 0.9) return "#15803d";
		if (pct >= 0.7) return "#22c55e";
		if (pct >= 0.5) return "#f59e0b";
		if (pct >= 0.3) return "#f97316";
		return "#ef4444";
	}

	rating_caption(score, scale) {
		if (Number(scale) !== 5) return String(score);
		if (score === 5) return __("5 · Excellent");
		if (score === 1) return __("1 · Poor");
		return String(score);
	}

	kpi_map() {
		const map = {};
		((this.data && this.data.kpis) || []).forEach((row) => {
			map[row.key] = row;
		});
		return map;
	}

	render() {
		const data = this.data || {};
		const kpis = this.kpi_map();
		const cards = ["responses", "schools", "smes", "rating", "impact", "positive", "community", "visits"]
			.map((key) => kpis[key])
			.filter(Boolean)
			.map(
				(kpi) => `<div class="si-kpi"><div class="lbl">${this.esc(kpi.label)}</div><div class="val">${this.esc(
					kpi.value
				)}</div><div class="hint">${this.esc(kpi.hint || "")}</div></div>`
			)
			.join("");
		$(this.page.body).find("#si-body").html(`
			<div class="si-kpis">${cards}</div>
			<div class="si-split">
				<div>
					${this.render_audiences()}
					${this.render_days()}
				</div>
				<div class="si-card"><h3>${__("Question results")}</h3>${this.render_questions()}</div>
			</div>
			${this.render_schools()}
			${this.render_comments_card()}
		`);
		if (this.panelKey) this.open_panel(this.panelKey, true);
	}

	render_audiences() {
		const rows = (this.data && this.data.audiences) || [];
		const max = Math.max(1, ...rows.map((row) => row.count || 0));
		const body = rows
			.map((row) => {
				const width = Math.round((100 * (row.count || 0)) / max);
				return `<button type="button" class="si-aud" data-aud="${this.esc(row.id)}">
					<span class="name">${this.esc(row.label)}</span>
					<span class="si-track"><span style="width:${width}%;background:${this.audience_color(row.id)}"></span></span>
					<span class="num">${this.esc(row.count)}</span>
				</button>`;
			})
			.join("");
		return `<div class="si-card"><h3>${__("By audience")}<small>${__("Click to filter")}</small></h3><div class="body">${body}</div></div>`;
	}

	render_days() {
		const days = (this.data && this.data.days) || [];
		if (!days.length) {
			return `<div class="si-card"><h3>${__("Responses by day")}</h3><div class="si-empty">${__("No submissions in this range.")}</div></div>`;
		}
		const max = Math.max(1, ...days.map((day) => day.count || 0));
		const bars = days
			.map((day) => {
				const height = Math.max(2, Math.round((110 * (day.count || 0)) / max));
				return `<button type="button" data-day="${this.esc(day.date)}" style="height:${height}px" title="${this.esc(
					day.date + ": " + day.count
				)}"></button>`;
			})
			.join("");
		return `<div class="si-card"><h3>${__("Responses by day")}<small>${__("Click a day")}</small></h3><div class="body">
			<div class="si-days">${bars}</div>
			<div class="si-day-labels"><span>${this.esc(frappe.datetime.str_to_user(days[0].date))}</span><span>${this.esc(
			frappe.datetime.str_to_user(days[days.length - 1].date)
		)}</span></div>
		</div></div>`;
	}

	grouped_questions() {
		const groups = [];
		const index = {};
		((this.data && this.data.questions) || []).forEach((question) => {
			const key = `${question.type}|${question.text}`;
			if (!index[key]) {
				index[key] = { key, text: question.text, type: question.type, parts: [] };
				groups.push(index[key]);
			}
			index[key].parts.push(question);
		});
		return groups;
	}

	parts_for(group) {
		const picked = this.qAudience[group.key];
		if (!picked) return group.parts;
		return group.parts.filter((part) => part.audience === picked);
	}

	render_questions() {
		const groups = this.grouped_questions();
		if (!groups.length) return `<div class="si-empty">${__("No rating or choice answers in this range.")}</div>`;
		return groups.map((group) => this.render_question(group)).join("");
	}

	render_question(group) {
		const parts = this.parts_for(group);
		const audiences = ["sme", "school", "teacher", "parent", "student"].filter((id) =>
			group.parts.some((part) => part.audience === id)
		);
		const chips = audiences
			.map((id) => {
				const on = this.qAudience[group.key] === id;
				const style = on ? ` style="background:${this.audience_color(id)}"` : "";
				return `<button type="button" class="si-aud-chip${on ? " on" : ""}" data-q="${this.esc(group.key)}" data-aud="${id}"${style}>${this.esc(
					this.audience_label(id)
				)}</button>`;
			})
			.join("");
		const hidden = this.qHidden[group.key];
		let body = "";
		if (!hidden) body = this.render_question_body(group, parts);
		return `<div class="si-q">
			<div class="si-q-top">
				<div>
					<div class="si-chips-q">${chips}</div>
					<div class="si-kind">${this.esc(group.type)}</div>
					<div class="si-ask">${this.esc(group.text)}</div>
				</div>
				<button type="button" class="linkish si-hide" data-q="${this.esc(group.key)}">${hidden ? __("Show") : __("Hide")}</button>
			</div>
			${body}
		</div>`;
	}

	render_question_body(group, parts) {
		const scale = (this.data && this.data.scale) || 5;
		if (!parts.length) return `<div class="si-meta">${__("No answers for this audience.")}</div>`;
		if (group.type === "rating") {
			const count = parts.reduce((sum, part) => sum + (part.count || 0), 0);
			const avgSum = parts.reduce((sum, part) => sum + (part.avg || 0) * (part.count || 0), 0);
			const avg = count ? Math.round((avgSum / count) * 10) / 10 : 0;
			const impact = scale ? Math.round((100 * avg) / scale) : 0;
			const buckets = [];
			for (let score = scale; score >= 1; score -= 1) {
				const total = parts.reduce((sum, part) => {
					const found = (part.buckets || []).find((bucket) => bucket.score === score);
					return sum + ((found && found.count) || 0);
				}, 0);
				buckets.push({ score, count: total });
			}
			const max = Math.max(1, ...buckets.map((bucket) => bucket.count));
			const bars = buckets
				.map((bucket) => {
					const width = Math.round((100 * bucket.count) / max);
					return `<div class="si-opt"><span>${this.esc(this.rating_caption(bucket.score, scale))}</span><span class="si-track"><span style="width:${width}%;background:${this.bar_color(
						bucket.score,
						scale
					)}"></span></span><span class="num">${this.esc(bucket.count)}</span></div>`;
				})
				.join("");
			return `<div class="si-meta">${__("Average")} ${this.esc(avg)} / ${scale} · ${__("Impact")} ${impact}% · ${this.esc(
				count
			)} ${__("answers")}</div>${bars}`;
		}
		if (group.type === "choice") {
			const counts = {};
			parts.forEach((part) => {
				(part.options || []).forEach((option) => {
					counts[option.label] = (counts[option.label] || 0) + option.count;
				});
			});
			const options = Object.keys(counts)
				.map((label) => ({ label, count: counts[label] }))
				.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
			const total = options.reduce((sum, option) => sum + option.count, 0) || 1;
			const max = Math.max(1, ...options.map((option) => option.count));
			const bars = options
				.map((option) => {
					const width = Math.round((100 * option.count) / max);
					return `<div class="si-opt"><span>${this.esc(option.label)}</span><span class="si-track"><span style="width:${width}%;background:#2f5bd3"></span></span><span class="num">${this.esc(
						option.count
					)}</span></div>`;
				})
				.join("");
			const top = options[0] ? options[0].label : "";
			return `<div class="si-meta">${this.esc(total)} ${__("answers")}${top ? ` · ${__("Most chosen")}: ${this.esc(top)}` : ""}</div>${bars}`;
		}
		const yes = parts.reduce((sum, part) => sum + (part.yes || 0), 0);
		const no = parts.reduce((sum, part) => sum + (part.no || 0), 0);
		const total = yes + no || 1;
		const pct = Math.round((100 * yes) / total);
		return `<div class="si-meta">${__("Yes")} ${pct}% · ${this.esc(yes)} ${__("yes")} / ${this.esc(no)} ${__("no")}</div>
			<div class="si-track"><span style="width:${pct}%;background:#1f8a5b"></span></div>`;
	}

	sorted_schools() {
		const rows = ((this.data && this.data.schools) || []).slice();
		const key = this.sortKey;
		const dir = this.sortDir;
		const numeric = !["school", "sme_name", "last_on"].includes(key);
		rows.sort((a, b) => {
			let left = a[key];
			let right = b[key];
			const audienceKey = { aud_sme: "sme", aud_school: "school", aud_teacher: "teacher", aud_parent: "parent", aud_student: "student" }[key];
			if (audienceKey) {
				left = (a.by_audience && a.by_audience[audienceKey]) || 0;
				right = (b.by_audience && b.by_audience[audienceKey]) || 0;
			}
			if (numeric) return ((Number(left) || 0) - (Number(right) || 0)) * dir;
			return String(left || "").localeCompare(String(right || "")) * dir;
		});
		return rows;
	}

	render_schools() {
		const scale = (this.data && this.data.scale) || 5;
		const rows = this.sorted_schools();
		const body = rows.length
			? rows
					.map((row) => {
						const by = row.by_audience || {};
						const impact = row.impact == null ? "—" : `${row.impact}%`;
						const avg = row.avg_rating == null ? "—" : `${row.avg_rating} / ${scale}`;
						const when = row.last_on ? frappe.datetime.str_to_user(row.last_on) : "—";
						return `<tr class="si-school" data-key="${this.esc(row.key)}">
							<td>${this.esc(row.school || __("Not linked to a school"))}</td>
							<td>${this.esc(row.sme_name)}</td>
							<td class="num">${this.esc(row.responses)}</td>
							<td class="num">${this.esc(by.sme || 0)}</td>
							<td class="num">${this.esc(by.school || 0)}</td>
							<td class="num">${this.esc(by.teacher || 0)}</td>
							<td class="num">${this.esc(by.parent || 0)}</td>
							<td class="num">${this.esc(by.student || 0)}</td>
							<td class="num">${this.esc(avg)}</td>
							<td class="num"><span class="si-score ${this.score_class(row.impact)}">${this.esc(impact)}</span></td>
							<td class="num">${this.esc(row.visits == null ? "—" : row.visits)}</td>
							<td>${this.esc(when)}</td>
						</tr>`;
					})
					.join("")
			: `<tr><td colspan="12" class="si-empty">${__("No feedback submitted for these filters.")}</td></tr>`;
		const head = [
			["school", __("School")],
			["sme_name", __("SME")],
			["responses", __("Responses")],
			["aud_sme", __("SME")],
			["aud_school", __("School")],
			["aud_teacher", __("Teacher")],
			["aud_parent", __("Parent")],
			["aud_student", __("Student")],
			["avg_rating", __("Avg rating")],
			["impact", __("Impact")],
			["visits", __("Visits")],
			["last_on", __("Last submitted")],
		]
			.map(
				([key, label]) => `<th class="si-sort" data-sort="${key}">${this.esc(label)}</th>`
			)
			.join("");
		return `<div class="si-card"><h3>${__("Schools")}<small>${__("Sort by any column · click a row for answers")}</small></h3>
			<div class="si-table-wrap"><table class="si-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div></div>`;
	}

	render_comments_card() {
		const count = ((this.data && this.data.comments) || []).length;
		return `<div class="si-card"><h3 class="si-comments-head"><span>${__("Comments")} ${count}</span>
			<input class="si-search no-print" type="search" placeholder="${__("Search comments, schools, SMEs…")}" value="${this.esc(
			this.commentQuery
		)}"></h3>
			<div class="si-table-wrap"><table class="si-table"><thead><tr>
				<th>${__("When")}</th><th>${__("Audience")}</th><th>${__("School")}</th><th>${__("SME")}</th><th>${__("Rating")}</th><th>${__("Comment")}</th>
			</tr></thead><tbody class="si-comment-body">${this.comment_rows()}</tbody></table></div></div>`;
	}

	comment_rows() {
		const scale = (this.data && this.data.scale) || 5;
		const query = (this.commentQuery || "").trim().toLowerCase();
		let rows = (this.data && this.data.comments) || [];
		if (query) {
			rows = rows.filter((row) =>
				[row.text, row.school, row.sme_name, row.audience_label, row.question].join(" ").toLowerCase().includes(query)
			);
		}
		if (!rows.length) return `<tr><td colspan="6" class="si-empty">${__("No comments.")}</td></tr>`;
		return rows
			.map((row) => {
				const when = row.at ? frappe.datetime.str_to_user(row.at) : "";
				const rating = row.rating == null ? "—" : `${row.rating} / ${scale}`;
				return `<tr class="si-comment" data-key="${this.esc(row.school_key)}">
					<td>${this.esc(when)}</td>
					<td><span class="si-pill" style="background:${this.audience_color(row.audience)}">${this.esc(row.audience_label)}</span></td>
					<td>${this.esc(row.school)}</td>
					<td>${this.esc(row.sme_name || "—")}</td>
					<td>${this.esc(rating)}</td>
					<td>${this.esc(row.text)}</td>
				</tr>`;
			})
			.join("");
	}

	render_comments() {
		$(this.page.body).find(".si-comment-body").html(this.comment_rows());
	}

	open_panel(key, keep) {
		if (!key) return;
		this.panelKey = key;
		const data = this.data || {};
		const school = (data.schools || []).find((row) => row.key === key);
		const rows = (data.submissions || []).filter((row) => row.school_key === key);
		const title = (school && school.school) || (rows[0] && rows[0].school) || __("Feedback");
		const blocks = rows.length
			? rows
					.map((row) => {
						const answers = (row.answers || [])
							.map(
								(answer) =>
									`<div class="si-ans"><b>${this.esc(answer.question)}</b>${this.esc(answer.value)}</div>`
							)
							.join("");
						return `<div style="margin-top:14px">
							<span class="si-pill" style="background:${this.audience_color(row.audience)}">${this.esc(row.audience_label)}</span>
							<span style="font-size:12px;color:#64748b"> ${this.esc(row.sme_name || "—")} · ${this.esc(
							row.at ? frappe.datetime.str_to_user(row.at) : ""
						)}</span>
							${answers || `<div class="si-ans">${__("No answers")}</div>`}
						</div>`;
					})
					.join("")
			: `<p>${__("No answers stored for this school.")}</p>`;
		this.close_panel(true);
		const panel = $(`
			<div class="si-backdrop"></div>
			<aside class="si-panel">
				<div style="display:flex;justify-content:space-between;gap:8px">
					<h2>${this.esc(title)}</h2>
					<button type="button" class="btn btn-default btn-xs si-panel-close">${__("Close")}</button>
				</div>
				<div class="sub">${this.esc(rows.length)} ${__("submissions")}</div>
				<button type="button" class="btn btn-primary btn-sm si-panel-filter">${__("Show only this school")}</button>
				${blocks}
			</aside>
		`);
		$("body").append(panel);
		panel.filter(".si-backdrop, .si-panel").add($(".si-panel-close")).on("click", (event) => {
			if ($(event.target).is(".si-backdrop, .si-panel-close")) this.close_panel();
		});
		$(".si-panel-filter").on("click", () => {
			$(this.page.body).find('[data-filter="school_key"]').val(key);
			this.close_panel();
			this.load_data();
		});
	}

	close_panel(silent) {
		$(".si-backdrop, .si-panel").remove();
		if (!silent) this.panelKey = "";
	}

	copy_link() {
		const params = new URLSearchParams();
		Object.entries(this.filter_values()).forEach(([key, value]) => {
			if (value) params.set(key, value);
		});
		const url = `${window.location.origin}${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
		if (navigator.clipboard && navigator.clipboard.writeText) {
			navigator.clipboard.writeText(url);
			frappe.show_alert({ message: __("Link copied"), indicator: "green" });
			return;
		}
		frappe.msgprint(url);
	}

	export_csv() {
		const schools = this.sorted_schools();
		if (!schools.length) {
			frappe.msgprint(__("Nothing to export."));
			return;
		}
		const header = [
			"School",
			"SME",
			"Responses",
			"SME replies",
			"School replies",
			"Teacher replies",
			"Parent replies",
			"Student replies",
			"Average rating",
			"Impact %",
			"Visits",
			"Last submitted",
		];
		const lines = [header.join(",")];
		schools.forEach((row) => {
			const by = row.by_audience || {};
			const cells = [
				row.school,
				row.sme_name,
				row.responses,
				by.sme || 0,
				by.school || 0,
				by.teacher || 0,
				by.parent || 0,
				by.student || 0,
				row.avg_rating == null ? "" : row.avg_rating,
				row.impact == null ? "" : row.impact,
				row.visits == null ? "" : row.visits,
				row.last_on || "",
			];
			lines.push(cells.map((cell) => `"${String(cell == null ? "" : cell).replace(/"/g, '""')}"`).join(","));
		});
		const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = "school-impact.csv";
		link.click();
		URL.revokeObjectURL(url);
	}
};
