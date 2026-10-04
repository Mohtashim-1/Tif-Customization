frappe.pages["volunteer-dashboard"].on_page_load = function (wrapper) {
	frappe.tif_customization = frappe.tif_customization || {};
	new frappe.tif_customization.EnrolmentKindDashboard(wrapper, {
		title: __("Volunteer Dashboard"),
		kind: "volunteer",
		accent: "#059669",
		bg: "#ecfdf5",
		method:
			"tif_customization.tif_customization.page.volunteer_dashboard.volunteer_dashboard.get_dashboard_data",
		note: __(
			"Volunteer enrolments from submitted Field Visits. Default range is fiscal YTD (1 July → To Date)."
		),
		sibling: { label: __("Ambassador Dashboard"), route: "/app/ambassador-dashboard" },
	});
};

frappe.tif_customization = frappe.tif_customization || {};

if (frappe.tif_customization.EnrolmentKindDashboard) {
	// Shared class already loaded from another enrolment dashboard page.
} else
frappe.tif_customization.EnrolmentKindDashboard = class EnrolmentKindDashboard {
	constructor(wrapper, opts) {
		this.opts = opts || {};
		this.page = frappe.ui.make_app_page({
			parent: wrapper,
			title: this.opts.title,
			single_column: true,
		});
		this.data = null;
		this.filters = {};
		this.make();
	}

	make() {
		this.make_layout();
		this.make_filters();
		this.page.set_primary_action(__("Refresh"), () => this.load(), "refresh");
		this.page.add_action_item(__("Open Field Visit Easy"), () => {
			window.open("/field-visit-easy", "_blank");
		});
		if (this.opts.sibling) {
			this.page.add_action_item(this.opts.sibling.label, () => {
				frappe.set_route(this.opts.sibling.route.replace(/^\/app\//, ""));
			});
		}
		this.load();
	}

	fy_start() {
		const d = frappe.datetime.str_to_obj(frappe.datetime.get_today());
		const y = d.getMonth() + 1 >= 7 ? d.getFullYear() : d.getFullYear() - 1;
		return `${y}-07-01`;
	}

	make_layout() {
		const accent = this.opts.accent || "#059669";
		const bg = this.opts.bg || "#ecfdf5";
		$(this.page.body).html(`
			<div class="ekd-root">
				<style>
					.ekd-root{padding:4px 12px 28px;color:#0f172a}
					.ekd-note{font-size:12px;color:#64748b;margin:0 0 12px;line-height:1.45}
					.ekd-filters{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;margin-bottom:12px;align-items:end}
					.ekd-filters .frappe-control{margin-bottom:0}
					.ekd-actions{display:flex;gap:8px;align-items:end}
					.ekd-kpis{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;margin:0 0 14px}
					.ekd-kpi{background:${bg};border:1px solid #e5e7eb;border-top:4px solid ${accent};border-radius:10px;padding:12px 14px;box-shadow:0 2px 8px rgba(15,23,42,.04)}
					.ekd-kpi .lbl{font-size:11px;font-weight:700;color:#64748b;line-height:1.25}
					.ekd-kpi .val{font-size:24px;font-weight:750;margin-top:4px;font-variant-numeric:tabular-nums}
					.ekd-kpi .hint{font-size:10px;color:#94a3b8;margin-top:4px}
					.ekd-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px}
					.ekd-card{background:#fff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden}
					.ekd-card h3{margin:0;padding:12px 14px;font-size:13px;font-weight:700;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between;gap:8px}
					.ekd-card h3 small{font-weight:500;color:#94a3b8}
					.ekd-card .body{padding:0;max-height:260px;overflow:auto}
					.ekd-detail .body{max-height:none}
					.ekd-table{width:100%;border-collapse:collapse;font-size:12px}
					.ekd-table th,.ekd-table td{padding:8px 10px;border-bottom:1px solid #f1f5f9;text-align:left;vertical-align:top}
					.ekd-table th{background:#f8fafc;position:sticky;top:0;z-index:1;font-size:10px;text-transform:uppercase;letter-spacing:.03em;color:#475569;white-space:nowrap}
					.ekd-table .num{text-align:right;font-variant-numeric:tabular-nums}
					.ekd-pill{display:inline-block;padding:1px 7px;border-radius:999px;font-size:10px;font-weight:700}
					.ekd-pill.yes{background:#dcfce7;color:#166534}
					.ekd-pill.no{background:#f1f5f9;color:#64748b}
					.ekd-empty{padding:18px;color:#94a3b8;font-size:13px;text-align:center}
					.ekd-scroll{overflow:auto}
					@media (max-width:960px){.ekd-grid{grid-template-columns:1fr}}
				</style>
				<p class="ekd-note">${this.opts.note || ""}</p>
				<div class="ekd-filters no-print"></div>
				<div class="ekd-kpis"></div>
				<div class="ekd-grid">
					<div class="ekd-card"><h3>${__("By Province")} <small>${__("Top 25")}</small></h3><div class="body ekd-by-province"></div></div>
					<div class="ekd-card"><h3>${__("By City")} <small>${__("Top 25")}</small></h3><div class="body ekd-by-city"></div></div>
				</div>
				<div class="ekd-grid">
					<div class="ekd-card"><h3>${__("By Field Officer")} <small>${__("Top 25")}</small></h3><div class="body ekd-by-officer"></div></div>
					<div class="ekd-card"><h3>${__("By School")} <small>${__("Top 25")}</small></h3><div class="body ekd-by-school"></div></div>
				</div>
				<div class="ekd-card ekd-detail">
					<h3>${__("Details")} <small class="ekd-row-count"></small></h3>
					<div class="body ekd-scroll ekd-detail-table"></div>
				</div>
			</div>
		`);
		this.$root = $(this.page.body).find(".ekd-root");
	}

	make_control(df) {
		const wrap = $('<div class="ekd-field"></div>').appendTo(this.$root.find(".ekd-filters"));
		const control = frappe.ui.form.make_control({
			parent: wrap,
			df: { ...df },
			render_input: true,
		});
		control.refresh();
		if (df.default != null) control.set_value(df.default);
		return control;
	}

	make_filters() {
		const today = frappe.datetime.get_today();
		this.filters = {
			from_date: this.make_control({
				fieldtype: "Date",
				fieldname: "from_date",
				label: __("From Date"),
				default: this.fy_start(),
			}),
			to_date: this.make_control({
				fieldtype: "Date",
				fieldname: "to_date",
				label: __("To Date"),
				default: today,
			}),
			province: this.make_control({
				fieldtype: "Select",
				fieldname: "province",
				label: __("Province"),
				options: [
					"",
					"Punjab",
					"Sindh",
					"Khyber Pakhtunkhwa",
					"Balochistan",
					"Azad Jammu & Kashmir",
					"Gilgit-Baltistan",
					"Islamabad Capital Territory",
				].join("\n"),
			}),
			city: this.make_control({
				fieldtype: "Link",
				fieldname: "city",
				label: __("City"),
				options: "City",
			}),
			staff: this.make_control({
				fieldtype: "Data",
				fieldname: "staff",
				label: __("Field Staff"),
				placeholder: __("Name or email"),
			}),
		};
		const actions = $('<div class="ekd-actions"></div>').appendTo(this.$root.find(".ekd-filters"));
		$(`<button class="btn btn-sm btn-primary">${__("Apply")}</button>`)
			.appendTo(actions)
			.on("click", () => this.load());
		$(`<button class="btn btn-sm btn-default">${__("Reset")}</button>`)
			.appendTo(actions)
			.on("click", () => {
				this.filters.from_date.set_value(this.fy_start());
				this.filters.to_date.set_value(frappe.datetime.get_today());
				this.filters.province.set_value("");
				this.filters.city.set_value("");
				this.filters.staff.set_value("");
				this.load();
			});
	}

	filter_values() {
		return {
			from_date: this.filters.from_date.get_value(),
			to_date: this.filters.to_date.get_value(),
			province: this.filters.province.get_value(),
			city: this.filters.city.get_value(),
			staff: this.filters.staff.get_value(),
		};
	}

	load() {
		frappe.call({
			method: this.opts.method,
			args: { filters: this.filter_values() },
			freeze: true,
			freeze_message: __("Loading dashboard..."),
			callback: (r) => {
				this.data = r.message || {};
				this.render();
			},
		});
	}

	esc(v) {
		return frappe.utils.escape_html(v == null || v === "" ? "—" : String(v));
	}

	render() {
		const d = this.data || {};
		const k = d.kpis || {};
		const plural = d.plural || __("People");
		this.$root.find(".ekd-kpis").html(
			[
				{ label: plural, value: k.people, hint: __("People rows") },
				{ label: __("Visits"), value: k.visits, hint: __("Distinct Field Visits") },
				{ label: __("Schools"), value: k.schools, hint: __("Tagged / linked schools") },
				{ label: __("Forms Yes"), value: k.forms_yes, hint: __("Form submitted") },
				{ label: __("Forms No"), value: k.forms_no, hint: __("Pending / No") },
				{ label: __("Provinces"), value: k.provinces, hint: __("Distinct") },
				{ label: __("Cities"), value: k.cities, hint: __("Distinct") },
				{ label: __("Field Officers"), value: k.officers, hint: __("Distinct") },
			]
				.map(
					(c) => `<div class="ekd-kpi">
						<div class="lbl">${this.esc(c.label)}</div>
						<div class="val">${cint(c.value)}</div>
						<div class="hint">${this.esc(c.hint)}</div>
					</div>`
				)
				.join("")
		);

		this.render_group(".ekd-by-province", d.by_province || []);
		this.render_group(".ekd-by-city", d.by_city || []);
		this.render_group(".ekd-by-officer", d.by_officer || []);
		this.render_group(".ekd-by-school", d.by_school || []);
		this.$root.find(".ekd-row-count").text(`${(d.rows || []).length}`);
		this.render_details(d.rows || []);
	}

	render_group(sel, rows) {
		if (!rows.length) {
			this.$root.find(sel).html(`<div class="ekd-empty">${__("No data")}</div>`);
			return;
		}
		const body = rows
			.map(
				(r) => `<tr>
					<td>${this.esc(r.label)}</td>
					<td class="num"><strong>${cint(r.count)}</strong></td>
				</tr>`
			)
			.join("");
		this.$root.find(sel).html(`
			<table class="ekd-table">
				<thead><tr>
					<th>${__("Name")}</th>
					<th class="num">${__("Count")}</th>
				</tr></thead>
				<tbody>${body}</tbody>
			</table>
		`);
	}

	render_details(rows) {
		if (!rows.length) {
			this.$root
				.find(".ekd-detail-table")
				.html(`<div class="ekd-empty">${__("No records in this period")}</div>`);
			return;
		}
		const body = rows
			.map((r) => {
				const formYes = String(r.form_submitted || "").toLowerCase() === "yes";
				return `<tr>
					<td>
						<div style="font-weight:650">${this.esc(r.name)}</div>
						<div style="color:#64748b;font-size:11px">${this.esc(r.contact)}</div>
						${r.email ? `<div style="color:#94a3b8;font-size:11px">${this.esc(r.email)}</div>` : ""}
					</td>
					<td>${this.esc(r.profession)}</td>
					<td style="max-width:180px">${this.esc(r.contribution)}</td>
					<td>
						${this.esc(r.city)}${r.area && r.area !== "—" ? ", " + this.esc(r.area) : ""}
						<div style="color:#94a3b8;font-size:11px">${this.esc(r.province)}</div>
						${r.address && r.address !== "—" ? `<div style="color:#64748b;font-size:11px;margin-top:2px">${this.esc(r.address)}</div>` : ""}
					</td>
					<td>${this.esc(r.school)}</td>
					<td><span class="ekd-pill ${formYes ? "yes" : "no"}">${this.esc(r.form_submitted || "No")}</span></td>
					<td style="max-width:160px">${this.esc(r.remarks)}</td>
					<td>
						<a href="${frappe.utils.escape_html(r.url || "#")}" target="_blank">${this.esc(r.visit)}</a>
						<div style="color:#94a3b8;font-size:11px">${this.esc(r.visit_date)}</div>
						<div style="color:#94a3b8;font-size:11px">${this.esc(r.visit_type)}</div>
						<div style="color:#64748b;font-size:11px">${this.esc(r.officer)}</div>
					</td>
				</tr>`;
			})
			.join("");
		this.$root.find(".ekd-detail-table").html(`
			<table class="ekd-table">
				<thead><tr>
					<th>${__("Person")}</th>
					<th>${__("Profession")}</th>
					<th>${__("Contribution")}</th>
					<th>${__("Location")}</th>
					<th>${__("School")}</th>
					<th>${__("Form")}</th>
					<th>${__("Remarks")}</th>
					<th>${__("Visit")}</th>
				</tr></thead>
				<tbody>${body}</tbody>
			</table>
		`);
	}
};
