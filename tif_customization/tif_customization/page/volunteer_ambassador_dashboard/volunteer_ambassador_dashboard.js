frappe.pages["volunteer-ambassador-dashboard"].on_page_load = function (wrapper) {
	frappe.tif_customization = frappe.tif_customization || {};
	new frappe.tif_customization.VolunteerAmbassadorDashboard(wrapper);
};

frappe.tif_customization = frappe.tif_customization || {};

frappe.tif_customization.VolunteerAmbassadorDashboard = class VolunteerAmbassadorDashboard {
	constructor(wrapper) {
		this.page = frappe.ui.make_app_page({
			parent: wrapper,
			title: __("Volunteer & Ambassador Dashboard"),
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
		this.load();
	}

	fy_start() {
		const d = frappe.datetime.str_to_obj(frappe.datetime.get_today());
		const y = d.getMonth() + 1 >= 7 ? d.getFullYear() : d.getFullYear() - 1;
		return `${y}-07-01`;
	}

	make_layout() {
		$(this.page.body).html(`
			<div class="vad-root">
				<style>
					.vad-root{padding:4px 12px 28px;color:#0f172a}
					.vad-note{font-size:12px;color:#64748b;margin:0 0 12px;line-height:1.45}
					.vad-filters{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;margin-bottom:12px;align-items:end}
					.vad-filters .frappe-control{margin-bottom:0}
					.vad-actions{display:flex;gap:8px;align-items:end}
					.vad-kpis{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;margin:0 0 14px}
					.vad-kpi{background:#fff;border:1px solid #e5e7eb;border-top:4px solid #059669;border-radius:10px;padding:12px 14px;box-shadow:0 2px 8px rgba(15,23,42,.04)}
					.vad-kpi--amb{border-top-color:#6366f1;background:#eef2ff}
					.vad-kpi--vol{background:#ecfdf5}
					.vad-kpi--mix{border-top-color:#0f766e}
					.vad-kpi .lbl{font-size:11px;font-weight:700;color:#64748b;line-height:1.25}
					.vad-kpi .val{font-size:24px;font-weight:750;margin-top:4px;font-variant-numeric:tabular-nums}
					.vad-kpi .hint{font-size:10px;color:#94a3b8;margin-top:4px}
					.vad-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px}
					.vad-card{background:#fff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden}
					.vad-card h3{margin:0;padding:12px 14px;font-size:13px;font-weight:700;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between;gap:8px}
					.vad-card h3 small{font-weight:500;color:#94a3b8}
					.vad-card .body{padding:0;max-height:280px;overflow:auto}
					.vad-table{width:100%;border-collapse:collapse;font-size:12px}
					.vad-table th,.vad-table td{padding:8px 10px;border-bottom:1px solid #f1f5f9;text-align:left;vertical-align:top}
					.vad-table th{background:#f8fafc;position:sticky;top:0;z-index:1;font-size:10px;text-transform:uppercase;letter-spacing:.03em;color:#475569}
					.vad-table .num{text-align:right;font-variant-numeric:tabular-nums}
					.vad-pill{display:inline-block;padding:1px 7px;border-radius:999px;font-size:10px;font-weight:700}
					.vad-pill.yes{background:#dcfce7;color:#166534}
					.vad-pill.no{background:#f1f5f9;color:#64748b}
					.vad-empty{padding:18px;color:#94a3b8;font-size:13px;text-align:center}
					@media (max-width:960px){.vad-grid{grid-template-columns:1fr}}
				</style>
				<p class="vad-note">${__(
					"Counts people recorded on submitted Field Visits (Volunteer Enrolment and Ambassador Enrolment). Default range is fiscal YTD (1 July → selected To Date)."
				)}</p>
				<div class="vad-filters no-print"></div>
				<div class="vad-kpis"></div>
				<div class="vad-grid">
					<div class="vad-card"><h3>${__("By Province")} <small>${__("Top 25")}</small></h3><div class="body vad-by-province"></div></div>
					<div class="vad-card"><h3>${__("By Field Officer")} <small>${__("Top 25")}</small></h3><div class="body vad-by-officer"></div></div>
				</div>
				<div class="vad-grid">
					<div class="vad-card"><h3>${__("Volunteers")} <small class="vad-vol-count"></small></h3><div class="body vad-vol-table"></div></div>
					<div class="vad-card"><h3>${__("Ambassadors")} <small class="vad-amb-count"></small></h3><div class="body vad-amb-table"></div></div>
				</div>
			</div>
		`);
		this.$root = $(this.page.body).find(".vad-root");
	}

	make_control(df) {
		const wrap = $('<div class="vad-field"></div>').appendTo(this.$root.find(".vad-filters"));
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
		const actions = $('<div class="vad-actions"></div>').appendTo(this.$root.find(".vad-filters"));
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
			method:
				"tif_customization.tif_customization.page.volunteer_ambassador_dashboard.volunteer_ambassador_dashboard.get_dashboard_data",
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
		this.$root.find(".vad-kpis").html(
			[
				{ label: __("Total People"), value: k.total_people, style: "mix", hint: __("Volunteers + Ambassadors") },
				{ label: __("Volunteers"), value: k.volunteers, style: "vol", hint: __("People rows") },
				{ label: __("Ambassadors"), value: k.ambassadors, style: "amb", hint: __("People rows") },
				{ label: __("Volunteer Visits"), value: k.volunteer_visits, style: "vol", hint: __("Distinct Field Visits") },
				{ label: __("Ambassador Visits"), value: k.ambassador_visits, style: "amb", hint: __("Distinct Field Visits") },
				{ label: __("Volunteer Schools"), value: k.volunteer_schools, style: "vol", hint: __("Tagged / linked schools") },
				{ label: __("Ambassador Schools"), value: k.ambassador_schools, style: "amb", hint: __("Tagged / linked schools") },
				{ label: __("Volunteer Forms Yes"), value: k.volunteer_forms_yes, style: "vol", hint: __("Form submitted") },
				{ label: __("Ambassador Forms Yes"), value: k.ambassador_forms_yes, style: "amb", hint: __("Form submitted") },
			]
				.map(
					(c) => `<div class="vad-kpi vad-kpi--${c.style}">
						<div class="lbl">${this.esc(c.label)}</div>
						<div class="val">${cint(c.value)}</div>
						<div class="hint">${this.esc(c.hint)}</div>
					</div>`
				)
				.join("")
		);

		this.render_group(".vad-by-province", d.by_province || []);
		this.render_group(".vad-by-officer", d.by_officer || []);
		this.$root.find(".vad-vol-count").text(`${(d.volunteers || []).length}`);
		this.$root.find(".vad-amb-count").text(`${(d.ambassadors || []).length}`);
		this.render_people(".vad-vol-table", d.volunteers || [], "volunteer");
		this.render_people(".vad-amb-table", d.ambassadors || [], "ambassador");
	}

	render_group(sel, rows) {
		if (!rows.length) {
			this.$root.find(sel).html(`<div class="vad-empty">${__("No data")}</div>`);
			return;
		}
		const body = rows
			.map(
				(r) => `<tr>
					<td>${this.esc(r.label)}</td>
					<td class="num">${cint(r.volunteers)}</td>
					<td class="num">${cint(r.ambassadors)}</td>
					<td class="num"><strong>${cint(r.volunteers) + cint(r.ambassadors)}</strong></td>
				</tr>`
			)
			.join("");
		this.$root.find(sel).html(`
			<table class="vad-table">
				<thead><tr>
					<th>${__("Name")}</th>
					<th class="num">${__("Vol")}</th>
					<th class="num">${__("Amb")}</th>
					<th class="num">${__("Total")}</th>
				</tr></thead>
				<tbody>${body}</tbody>
			</table>
		`);
	}

	render_people(sel, rows, kind) {
		if (!rows.length) {
			this.$root.find(sel).html(`<div class="vad-empty">${__("No {0} in this period", [kind])}</div>`);
			return;
		}
		const body = rows
			.map((r) => {
				const formYes = String(r.form_submitted || "").toLowerCase() === "yes";
				return `<tr>
					<td>
						<div style="font-weight:650">${this.esc(r.name)}</div>
						<div style="color:#64748b;font-size:11px">${this.esc(r.contact)}${r.profession ? " · " + this.esc(r.profession) : ""}</div>
						${r.school ? `<div style="color:#64748b;font-size:11px">🏫 ${this.esc(r.school)}</div>` : ""}
						${r.contribution ? `<div style="color:#52525b;font-size:11px;margin-top:2px">${this.esc(r.contribution)}</div>` : ""}
					</td>
					<td>${this.esc(r.city)}${r.area ? ", " + this.esc(r.area) : ""}<div style="color:#94a3b8;font-size:11px">${this.esc(r.province)}</div></td>
					<td>
						<a href="${this.esc(r.url)}" target="_blank">${this.esc(r.visit)}</a>
						<div style="color:#94a3b8;font-size:11px">${this.esc(r.visit_date)} · ${this.esc(r.officer)}</div>
					</td>
					<td><span class="vad-pill ${formYes ? "yes" : "no"}">${this.esc(r.form_submitted || "No")}</span></td>
				</tr>`;
			})
			.join("");
		this.$root.find(sel).html(`
			<table class="vad-table">
				<thead><tr>
					<th>${__("Person")}</th>
					<th>${__("Location")}</th>
					<th>${__("Visit")}</th>
					<th>${__("Form")}</th>
				</tr></thead>
				<tbody>${body}</tbody>
			</table>
		`);
	}
};
