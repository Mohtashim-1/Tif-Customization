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
	}

	make() {
		this.make_layout();
		this.make_filters();
		this.page.set_primary_action(__("Refresh"), () => this.load_data(), "refresh");
		this.page.add_action_item(__("Export CSV"), () => this.export_csv());
		this.page.add_action_item(__("Print"), () => window.print());
		this.bind_events();
		this.load_data();
	}

	make_layout() {
		$(this.page.body).html(`
			<div class="si-root">
				<style>
					.si-root{padding:16px 16px 32px}
					.si-note{font-size:12px;color:#64748b;margin:0 0 12px;line-height:1.45}
					.si-filters{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;margin-bottom:14px}
					.si-kpis{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin:0 0 16px}
					.si-kpi{background:#fff;border:1px solid #e5e7eb;border-top:4px solid #1b5e3b;border-radius:10px;padding:12px 14px}
					.si-kpi .lbl{font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.04em}
					.si-kpi .val{font-size:22px;font-weight:800;color:#123524;margin-top:4px;font-variant-numeric:tabular-nums}
					.si-kpi .hint{font-size:11px;color:#94a3b8;margin-top:2px}
					.si-grid{display:grid;grid-template-columns:280px 1fr;gap:12px;margin-bottom:14px}
					.si-card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden}
					.si-card h3{margin:0;padding:12px 14px;font-size:13px;font-weight:800;color:#1b5e3b;border-bottom:1px solid #e5e7eb}
					.si-card .body{padding:12px 14px}
					.si-aud{display:flex;align-items:center;gap:8px;margin:0 0 8px;font-size:12px}
					.si-aud .name{width:64px;font-weight:700;color:#334155}
					.si-bar{flex:1;height:8px;background:#f1f5f9;border-radius:99px;overflow:hidden}
					.si-bar span{display:block;height:100%;border-radius:99px}
					.si-aud .num{width:28px;text-align:right;font-variant-numeric:tabular-nums;font-weight:700}
					.si-q{padding:10px 0;border-bottom:1px solid #f1f5f9}
					.si-q:last-child{border-bottom:0}
					.si-q .meta{font-size:11px;color:#64748b;margin-bottom:4px}
					.si-q .prompt{font-size:13px;font-weight:700;color:#0f172a;margin-bottom:6px}
					.si-opt{display:grid;grid-template-columns:minmax(80px,1fr) 1fr 36px;gap:8px;align-items:center;font-size:12px;margin-top:4px}
					.si-pill{display:inline-block;padding:1px 7px;border-radius:99px;font-size:10px;font-weight:700;color:#fff;margin-right:6px}
					.si-table-wrap{overflow:auto;max-height:min(62vh,calc(100vh - 280px))}
					.si-table{width:100%;border-collapse:collapse;font-size:12px;min-width:920px}
					.si-table th,.si-table td{padding:8px 10px;border-bottom:1px solid #e5e7eb;vertical-align:middle}
					.si-table thead th{position:sticky;top:0;background:#1b5e3b;color:#fff;font-size:10px;text-transform:uppercase;text-align:left;z-index:1}
					.si-table .num{text-align:right;font-variant-numeric:tabular-nums}
					.si-table tbody tr{cursor:pointer}
					.si-table tbody tr:hover{background:#f0fdf4}
					.si-score{display:inline-block;min-width:42px;text-align:center;padding:2px 6px;border-radius:99px;font-weight:800;font-size:11px}
					.si-score.high{background:#dcfce7;color:#166534}
					.si-score.mid{background:#fef3c7;color:#92400e}
					.si-score.low{background:#fee2e2;color:#991b1b}
					.si-score.none{background:#f1f5f9;color:#64748b}
					.si-empty{padding:28px 12px;text-align:center;color:#64748b}
					@media (max-width:900px){.si-grid{grid-template-columns:1fr}}
					@media print{
						.page-head,.navbar,.si-filters,.si-note,.no-print{display:none!important}
						.si-table-wrap{max-height:none;overflow:visible}
					}
				</style>
				<p class="si-note">
					${__(
						"School Impact uses submitted Feedback Studio answers. Impact score is the average rating as a percentage of the rating scale. Click a school to see the answers."
					)}
				</p>
				<div class="si-filters no-print"></div>
				<div id="si-body"><p class="text-muted">${__("Loading...")}</p></div>
			</div>
		`);
	}

	make_filters() {
		const $host = $(this.page.body).find(".si-filters");
		const add = (df) => {
			const control = frappe.ui.form.make_control({
				parent: $host,
				df: Object.assign({}, df, { change: () => this.load_data() }),
				render_input: true,
			});
			control.refresh();
			this.filters[df.fieldname] = control;
		};
		add({ fieldtype: "Date", fieldname: "from_date", label: __("From Date") });
		add({ fieldtype: "Date", fieldname: "to_date", label: __("To Date") });
		add({
			fieldtype: "Select",
			fieldname: "audience",
			label: __("Audience"),
			options: "\nSME\nSchool\nParent\nStudent",
		});
		add({ fieldtype: "Data", fieldname: "sme_name", label: __("SME name") });
		add({ fieldtype: "Link", fieldname: "customer", label: __("School"), options: "Customer" });
	}

	filter_values() {
		const audienceMap = { SME: "sme", School: "school", Parent: "parent", Student: "student" };
		const audience = (this.filters.audience && this.filters.audience.get_value()) || "";
		return {
			from_date: (this.filters.from_date && this.filters.from_date.get_value()) || "",
			to_date: (this.filters.to_date && this.filters.to_date.get_value()) || "",
			audience: audienceMap[audience] || "",
			sme_name: (this.filters.sme_name && this.filters.sme_name.get_value()) || "",
			customer: (this.filters.customer && this.filters.customer.get_value()) || "",
		};
	}

	load_data() {
		frappe.call({
			method: "tif_customization.tif_customization.page.school_impact.school_impact.get_report_data",
			args: { filters: this.filter_values() },
			callback: (r) => {
				this.data = (r && r.message) || null;
				this.render();
			},
		});
	}

	bind_events() {
		$(this.page.body).on("click", ".si-school", (event) => {
			const key = $(event.currentTarget).attr("data-key");
			this.open_school(key);
		});
	}

	esc(value) {
		return frappe.utils.escape_html(value == null ? "" : String(value));
	}

	score_class(impact) {
		if (impact == null || impact === "") return "none";
		if (impact >= 80) return "high";
		if (impact >= 60) return "mid";
		return "low";
	}

	audience_color(id) {
		return { sme: "#7a4cc2", school: "#2f5bd3", parent: "#1f8a5b", student: "#c8561f" }[id] || "#64748b";
	}

	render() {
		const data = this.data || {};
		const kpis = data.kpis || [];
		const audiences = data.audiences || [];
		const maxAud = Math.max(1, ...audiences.map((row) => row.count || 0));
		const schools = data.schools || [];
		const questions = data.questions || [];
		const comments = data.comments || [];

		const kpiHtml = kpis
			.map(
				(kpi) => `<div class="si-kpi"><div class="lbl">${this.esc(kpi.label)}</div><div class="val">${this.esc(
					kpi.value
				)}</div><div class="hint">${this.esc(kpi.hint || "")}</div></div>`
			)
			.join("");

		const audHtml = audiences
			.map((row) => {
				const width = Math.round((100 * (row.count || 0)) / maxAud);
				return `<div class="si-aud"><span class="name">${this.esc(row.label)}</span><div class="si-bar"><span style="width:${width}%;background:${this.audience_color(
					row.id
				)}"></span></div><span class="num">${this.esc(row.count)}</span></div>`;
			})
			.join("");

		const questionHtml = questions.length
			? questions.map((q) => this.render_question(q)).join("")
			: `<div class="si-empty">${__("No rating, choice, or yes/no answers in this range.")}</div>`;

		const schoolHtml = schools.length
			? schools
					.map((row) => {
						const by = row.by_audience || {};
						const impact = row.impact == null ? "—" : row.impact + "%";
						const avg = row.avg_rating == null ? "—" : row.avg_rating + " / " + (data.scale || 5);
						return `<tr class="si-school" data-key="${this.esc(row.key)}">
							<td>${this.esc(row.school)}</td>
							<td>${this.esc(row.sme_name)}</td>
							<td class="num">${this.esc(row.responses)}</td>
							<td class="num">${this.esc(by.sme || 0)}</td>
							<td class="num">${this.esc(by.school || 0)}</td>
							<td class="num">${this.esc(by.parent || 0)}</td>
							<td class="num">${this.esc(by.student || 0)}</td>
							<td class="num">${this.esc(avg)}</td>
							<td class="num"><span class="si-score ${this.score_class(row.impact)}">${this.esc(impact)}</span></td>
							<td>${this.esc(row.last_on ? frappe.datetime.str_to_user(row.last_on) : "—")}</td>
						</tr>`;
					})
					.join("")
			: `<tr><td colspan="10" class="si-empty">${__("No feedback submitted for these filters.")}</td></tr>`;

		const commentHtml = comments.length
			? `<div class="si-card" style="margin-top:12px"><h3>${__("Comments")}</h3><div class="si-table-wrap"><table class="si-table"><thead><tr>
					<th>${__("When")}</th><th>${__("Audience")}</th><th>${__("School")}</th><th>${__("Question")}</th><th>${__("Comment")}</th>
				</tr></thead><tbody>${comments
					.map(
						(row) => `<tr>
							<td>${this.esc(row.at ? frappe.datetime.str_to_user(row.at) : "")}</td>
							<td><span class="si-pill" style="background:${this.audience_color(row.audience)}">${this.esc(row.audience_label)}</span></td>
							<td>${this.esc(row.school)}</td>
							<td>${this.esc(row.question)}</td>
							<td>${this.esc(row.text)}</td>
						</tr>`
					)
					.join("")}</tbody></table></div></div>`
			: "";

		$(this.page.body).find("#si-body").html(`
			<div class="si-kpis">${kpiHtml}</div>
			<div class="si-grid">
				<div class="si-card"><h3>${__("By audience")}</h3><div class="body">${audHtml}</div></div>
				<div class="si-card"><h3>${__("Question results")}</h3><div class="body">${questionHtml}</div></div>
			</div>
			<div class="si-card">
				<h3>${__("Schools")}</h3>
				<div class="si-table-wrap">
					<table class="si-table">
						<thead><tr>
							<th>${__("School")}</th>
							<th>${__("SME")}</th>
							<th class="num">${__("Responses")}</th>
							<th class="num">${__("SME")}</th>
							<th class="num">${__("School")}</th>
							<th class="num">${__("Parent")}</th>
							<th class="num">${__("Student")}</th>
							<th class="num">${__("Avg rating")}</th>
							<th class="num">${__("Impact")}</th>
							<th>${__("Last submitted")}</th>
						</tr></thead>
						<tbody>${schoolHtml}</tbody>
					</table>
				</div>
			</div>
			${commentHtml}
		`);
	}

	render_question(q) {
		const pill = `<span class="si-pill" style="background:${this.audience_color(q.audience)}">${this.esc(q.audience_label)}</span>`;
		let body = "";
		if (q.type === "rating") {
			const max = Math.max(1, ...(q.buckets || []).map((b) => b.count || 0));
			body = `<div class="meta">${__("Average")} ${this.esc(q.avg)} / ${this.esc(
				(this.data && this.data.scale) || 5
			)} · ${__("Impact")} ${this.esc(q.impact)}% · ${this.esc(q.count)} ${__("answers")}</div>` +
				(q.buckets || [])
					.map((b) => {
						const width = Math.round((100 * (b.count || 0)) / max);
						return `<div class="si-opt"><span>${this.esc(b.score)}</span><div class="si-bar"><span style="width:${width}%;background:#1b5e3b"></span></div><span class="num">${this.esc(
							b.count
						)}</span></div>`;
					})
					.join("");
		} else if (q.type === "choice") {
			body = (q.options || [])
				.map(
					(opt) =>
						`<div class="si-opt"><span>${this.esc(opt.label)}</span><div class="si-bar"><span style="width:${opt.pct}%;background:#2f5bd3"></span></div><span class="num">${this.esc(
							opt.count
						)}</span></div>`
				)
				.join("");
		} else if (q.type === "yesno") {
			body = `<div class="meta">${__("Yes")} ${this.esc(q.yes_pct)}% · ${this.esc(q.yes)} ${__("yes")} / ${this.esc(
				q.no
			)} ${__("no")}</div><div class="si-bar"><span style="width:${q.yes_pct}%;background:#1f8a5b"></span></div>`;
		}
		return `<div class="si-q">${pill}<div class="prompt">${this.esc(q.text)}</div>${body}</div>`;
	}

	open_school(key) {
		const data = this.data || {};
		const school = (data.schools || []).find((row) => row.key === key);
		const rows = (data.submissions || []).filter((row) => row.school_key === key);
		if (!school) return;
		const body = rows.length
			? rows
					.map((row) => {
						const answers = (row.answers || [])
							.map(
								(ans) =>
									`<div style="margin:4px 0 0 12px;font-size:12px"><strong>${this.esc(
										ans.question
									)}</strong> — ${this.esc(ans.value)}</div>`
							)
							.join("");
						return `<div style="padding:8px 0;border-bottom:1px solid #e5e7eb">
							<div style="font-size:12px;color:#64748b">${this.esc(row.audience_label)} · ${this.esc(
							row.sme_name || "—"
						)} · ${this.esc(row.at ? frappe.datetime.str_to_user(row.at) : "")}</div>
							${answers || `<div style="margin-left:12px;font-size:12px">${this.esc(row.summary || __("No answers"))}</div>`}
						</div>`;
					})
					.join("")
			: `<p>${__("No answers stored for this school.")}</p>`;
		const dialog = new frappe.ui.Dialog({
			title: school.school,
			size: "large",
		});
		dialog.$body.html(body);
		dialog.show();
	}

	export_csv() {
		const data = this.data || {};
		const schools = data.schools || [];
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
			"Parent replies",
			"Student replies",
			"Average rating",
			"Impact %",
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
				by.parent || 0,
				by.student || 0,
				row.avg_rating == null ? "" : row.avg_rating,
				row.impact == null ? "" : row.impact,
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
