frappe.pages["sme-kpi-details"].on_page_load = function (wrapper) {
	frappe.require("/assets/tif_customization/js/field_visit_drilldown.js", () => {
		const page = frappe.ui.make_app_page({
			parent: wrapper,
			title: __("SME KPI Details"),
			single_column: true,
		});
		wrapper.page = page;
		wrapper.sme_kpi_details = new frappe.tif_customization.SmeKpiDetails(page);
	});
};

frappe.pages["sme-kpi-details"].on_page_show = function (wrapper) {
	if (wrapper.sme_kpi_details && !wrapper.sme_kpi_details._loaded_once) {
		wrapper.sme_kpi_details._loaded_once = true;
		wrapper.sme_kpi_details.load_data();
	}
};

frappe.tif_customization = frappe.tif_customization || {};

frappe.tif_customization.SmeKpiDetails = class SmeKpiDetails {
	constructor(page) {
		this.page = page;
		this.data = null;
		this._loaded_once = false;
		this.setup_layout();
		this.setup_filters();
		this.bind_actions();
		this.load_staff_options();
		this.show_placeholder();
	}

	setup_layout() {
		this.body = $(`
			<div class="skd-root">
				<style>
					.skd-root{padding:12px 12px 28px;max-width:1180px;margin:0 auto}
					.skd-filters{background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:12px 14px;margin-bottom:14px}
					.skd-note{font-size:12px;color:#64748b;margin:0 0 12px;line-height:1.45}
					.skd-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin:0 0 14px}
					.skd-kpi{border:1px solid #e5e7eb;border-top:4px solid #64748b;border-radius:10px;background:#fff;padding:12px 14px}
					.skd-kpi__label{color:#64748b;font-size:11px;margin-bottom:6px}
					.skd-kpi__value{color:#0f172a;font-size:22px;font-weight:700;font-variant-numeric:tabular-nums}
					.skd-kpi__hint{margin-top:6px;font-size:10px;color:#94a3b8}
					.skd-kpi--overall{border-top-color:#0f766e}
					.skd-kpi--activity{border-top-color:#2563eb}
					.skd-kpi--outcome{border-top-color:#ca8a04}
					.skd-kpi--days{border-top-color:#7c3aed}
					.skd-table-wrap{overflow:auto;background:#fff;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:14px}
					.skd-table{border-collapse:collapse;width:100%;font-size:12px}
					.skd-table th,.skd-table td{border:1px solid #e5e7eb;padding:6px 8px;vertical-align:middle;text-align:center}
					.skd-table .left{text-align:left}
					.skd-table thead th{background:#f1f5f9;font-weight:700}
					.skd-table .actual{background:#ecfdf5;font-weight:700}
					.skd-table .skd-click{cursor:pointer;text-decoration:underline;color:#0f766e}
					.skd-table .skd-click:hover{background:#bbf7d0}
					.skd-table .sum{background:#0f766e;color:#fff;font-weight:800}
					.skd-low{background:#fef2f2}
					.skd-ok{background:#ecfdf5}
					.skd-green{background:#c6efce;font-weight:700}
					.skd-tier{background:#00b050;color:#fff;font-weight:800}
					.skd-bottom{display:grid;grid-template-columns:1.2fr 1fr;gap:16px;margin:0 0 14px}
					.skd-reward{border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px;background:#fff;margin-bottom:8px}
					.skd-reward strong{display:block;margin-bottom:4px}
					.skd-title{font-size:16px;font-weight:700;margin:4px 0 10px}
					.skd-meta{font-size:12px;color:#64748b;margin:0 0 12px}
					@media (max-width:900px){.skd-bottom{grid-template-columns:1fr}}
					@media print{
						.page-head,.navbar,.skd-filters{display:none!important}
						body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
					}
				</style>
				<div class="skd-filters no-print">
					<div class="d-flex justify-content-between align-items-center mb-2">
						<strong>${__("SME KPI Details")}</strong>
						<div>
							<button class="btn btn-sm btn-primary skd-apply">${__("Apply")}</button>
							<button class="btn btn-sm btn-default skd-reset">${__("Reset")}</button>
							<button class="btn btn-sm btn-default skd-print"><i class="fa fa-print"></i> ${__("Print")}</button>
						</div>
					</div>
					<div class="row">
						<div class="col-md-3 mb-2" data-field="staff"></div>
						<div class="col-md-2 mb-2" data-field="from_date"></div>
						<div class="col-md-2 mb-2" data-field="to_date"></div>
						<div class="col-md-2 mb-2" data-field="working_days"></div>
					</div>
					<p class="skd-note mb-0">
						${__("Leave SME blank to see all Field Officers.")}
						${__("Working days auto-exclude Sunday, gazetted holidays and approved leave (leave blank to auto-calc).")}
						${__("Overall = 70% activity + 30% outcome. New schools = distinct schools from Field Visits, not School master.")}
					</p>
				</div>
				<div class="skd-body"></div>
			</div>
		`);
		$(this.page.body).empty().append(this.body);
	}

	make_filter(df) {
		const $slot = this.body.find(`[data-field="${df.fieldname}"]`);
		const control = frappe.ui.form.make_control({
			parent: $slot.get(0),
			df: { ...df },
			render_input: true,
		});
		control.refresh();
		if (df.default !== undefined && df.default !== null) control.set_value(df.default);
		return control;
	}

	setup_filters() {
		const today = frappe.datetime.get_today();
		const route = (frappe.route_options || (frappe.get_route_options && frappe.get_route_options())) || {};
		this.filters = {
			staff: this.make_filter({
				label: __("SME / Field Officer"),
				fieldname: "staff",
				fieldtype: "Data",
				default: route.staff || "",
			}),
			from_date: this.make_filter({
				label: __("From Date"),
				fieldname: "from_date",
				fieldtype: "Date",
				default: frappe.datetime.month_start(today),
				reqd: 1,
			}),
			to_date: this.make_filter({
				label: __("To Date"),
				fieldname: "to_date",
				fieldtype: "Date",
				default: today,
				reqd: 1,
			}),
			working_days: this.make_filter({
				label: __("Working Days (auto if blank)"),
				fieldname: "working_days",
				fieldtype: "Int",
				default: "",
			}),
		};
		this._staff_options = [];
	}

	load_staff_options() {
		frappe.call({
			method: "tif_customization.tif_customization.page.sme_kpi_details.sme_kpi_details.get_staff_options",
			args: { txt: "" },
			callback: (r) => {
				const rows = r.message || [];
				this._staff_options = rows.map((x) => (typeof x === "string" ? x : x.value)).filter(Boolean);
				const current = this.filters.staff.get_value();
				const $slot = this.body.find('[data-field="staff"]').empty();
				this.filters.staff = frappe.ui.form.make_control({
					parent: $slot.get(0),
					df: {
						label: __("SME / Field Officer"),
						fieldname: "staff",
						fieldtype: "Autocomplete",
						options: this._staff_options,
						default: current || "",
					},
					render_input: true,
				});
				this.filters.staff.refresh();
				if (current) this.filters.staff.set_value(current);
			},
		});
	}

	bind_actions() {
		this.body.find(".skd-apply").on("click", () => this.load_data());
		this.body.find(".skd-print").on("click", () => window.print());
		this.body.find(".skd-reset").on("click", () => {
			const today = frappe.datetime.get_today();
			this.filters.staff.set_value("");
			this.filters.from_date.set_value(frappe.datetime.month_start(today));
			this.filters.to_date.set_value(today);
			this.filters.working_days.set_value("");
			this.show_placeholder();
		});
		if (this.page && this.page.set_primary_action) {
			this.page.set_primary_action(__("Refresh"), () => this.load_data(), "refresh");
		}
		this.body.on("click", "[data-visit-metric]", (e) => {
			const metric = $(e.currentTarget).attr("data-visit-metric");
			if (!metric) return;
			const f = this.get_filters();
			if (!f) return;
			const staff = $(e.currentTarget).attr("data-staff") || f.staff;
			const outcome = {
				enrolment: 1,
				co_curricular: 1,
				new_schools: 1,
				workshop_registration: 1,
				volunteers: 1,
				model_school_a: 1,
				model_school_b: 1,
			};
			const from_date =
				this.data && outcome[metric] && this.data.ytd_from ? this.data.ytd_from : f.from_date;
			frappe.tif_customization.open_visit_drilldown({
				from_date,
				to_date: f.to_date,
				staff,
				metric,
				submitted_only: 1,
			});
		});
		this.body.on("click", "[data-open-staff]", (e) => {
			const staff = $(e.currentTarget).attr("data-open-staff");
			if (!staff) return;
			this.filters.staff.set_value(staff);
			this.load_data();
		});
	}

	show_placeholder() {
		this.body.find(".skd-body").html(
			`<div class="text-muted p-3">${__("Select dates (and optional SME) then click Apply.")}</div>`
		);
	}

	get_filters() {
		const from_date = this.filters.from_date.get_value();
		const to_date = this.filters.to_date.get_value();
		if (!from_date || !to_date) {
			frappe.msgprint(__("Please set From Date and To Date."));
			return null;
		}
		return {
			staff: (this.filters.staff.get_value() || "").trim(),
			from_date,
			to_date,
			working_days: cint(this.filters.working_days.get_value()) || 0,
		};
	}

	load_data() {
		const filters = this.get_filters();
		if (!filters) return;
		this.body.find(".skd-body").html(`<div class="text-muted p-3">${__("Loading...")}</div>`);
		frappe.call({
			method: "tif_customization.tif_customization.page.sme_kpi_details.sme_kpi_details.get_report_data",
			args: { filters },
			freeze: true,
			freeze_message: __("Loading KPI details..."),
			callback: (r) => {
				if (!r.message) {
					this.body.find(".skd-body").html(`<div class="text-danger p-3">${__("No data returned.")}</div>`);
					return;
				}
				this.data = r.message;
				try {
					this.render(r.message);
				} catch (e) {
					console.error(e);
					this.body
						.find(".skd-body")
						.html(
							`<div class="text-danger p-3">${__("Render error")}: ${frappe.utils.escape_html(
								e.message || e
							)}</div>`
						);
				}
			},
			error: () => {
				this.body
					.find(".skd-body")
					.html(`<div class="text-danger p-3">${__("Failed to load report. Check permissions / console.")}</div>`);
			},
		});
	}

	esc(v) {
		return frappe.utils.escape_html(v == null ? "" : String(v));
	}

	fmt(v, precision) {
		if (v === null || v === undefined || v === "") return "";
		const n = Number(v);
		if (Number.isNaN(n)) return this.esc(v);
		const p = precision != null ? precision : Number.isInteger(n) ? 0 : 2;
		try {
			if (typeof format_number === "function") return format_number(n, null, { precision: p });
		} catch (e) {
			/* ignore */
		}
		return n.toFixed(p);
	}

	fmt_pct(v) {
		if (v === null || v === undefined || v === "") return "";
		return `${this.fmt(v, 2)}%`;
	}

	pct_cls(v) {
		return flt(v) < 50 ? "skd-low" : "skd-ok";
	}

	render(data) {
		if (data.mode === "summary") {
			this.render_summary(data);
			return;
		}
		this.render_detail(data);
	}

	render_detail(data) {
		const wd = data.working_days_info || {};
		const activityRows = (data.activity_rows || [])
			.map((r) => {
				const pts = r.monthly_points != null ? this.fmt(r.monthly_points, 2) : "";
				return `<tr>
					<td class="left">${this.esc(r.label)}</td>
					<td class="left">${this.esc(r.category)}</td>
					<td>${this.esc(r.per_day_target)}</td>
					<td>${this.esc(r.points)}</td>
					<td class="actual skd-click" data-visit-metric="${this.esc(r.key)}" data-staff="${this.esc(
					data.staff
				)}">${this.fmt(r.actual)}</td>
					<td class="actual">${pts}</td>
				</tr>`;
			})
			.join("");

		const outcomeRows = (data.outcome_rows || [])
			.map((r) => {
				return `<tr class="${this.pct_cls(r.percent)}">
					<td class="left">${this.esc(r.label)}</td>
					<td>${this.fmt(r.target)}</td>
					<td class="actual skd-click" data-visit-metric="${this.esc(r.metric)}" data-staff="${this.esc(
					data.staff
				)}">${this.fmt(r.actual)}</td>
					<td>${this.fmt_pct(r.percent)}</td>
				</tr>`;
			})
			.join("");

		this.body.find(".skd-body").html(`
			<div class="skd-title">${this.esc(data.staff_label)} — ${this.esc(data.sheet_label)}</div>
			<p class="skd-meta">
				${__("Period")}: <strong>${this.esc(data.from_date)} — ${this.esc(data.to_date)}</strong>
				&nbsp;|&nbsp; ${__("Outcomes YTD")}: <strong>${this.esc(data.ytd_from)} — ${this.esc(data.to_date)}</strong>
				&nbsp;|&nbsp; ${__("FY")}: <strong>${this.esc(data.fiscal_year_label)}</strong>
			</p>
			<div class="skd-kpis">
				<div class="skd-kpi skd-kpi--overall">
					<div class="skd-kpi__label">${__("Overall")}</div>
					<div class="skd-kpi__value">${this.fmt_pct(data.overall_pct)}</div>
					<div class="skd-kpi__hint">70% ${__("activity")} + 30% ${__("outcome")}</div>
				</div>
				<div class="skd-kpi skd-kpi--activity">
					<div class="skd-kpi__label">${__("Activity")}</div>
					<div class="skd-kpi__value">${this.fmt_pct(data.activity_pct)}</div>
					<div class="skd-kpi__hint">${this.fmt(data.activity_actual, 2)} / ${this.fmt(data.activity_target, 2)} ${__("pts")}</div>
				</div>
				<div class="skd-kpi skd-kpi--outcome">
					<div class="skd-kpi__label">${__("Outcome (YTD)")}</div>
					<div class="skd-kpi__value">${this.fmt_pct(data.outcome_pct)}</div>
					<div class="skd-kpi__hint">${__("Average of yearly compulsory mins")}</div>
				</div>
				<div class="skd-kpi skd-kpi--days">
					<div class="skd-kpi__label">${__("Working days")}</div>
					<div class="skd-kpi__value">${this.fmt(data.working_days)}</div>
					<div class="skd-kpi__hint">
						${__("Sun")} ${this.fmt(wd.sundays || 0)} · ${__("Holiday")} ${this.fmt(wd.gazetted || 0)} · ${__("Leave")} ${this.fmt(
			wd.leave_days || 0
		)}
					</div>
				</div>
			</div>

			<div class="skd-title">${__("Activity (period)")}</div>
			<div class="skd-table-wrap">
				<table class="skd-table">
					<thead>
						<tr>
							<th class="left">${__("Particulars")}</th>
							<th class="left">${__("Category")}</th>
							<th>${__("Per day")}</th>
							<th>${__("Points")}</th>
							<th>${__("Actual")}</th>
							<th>${__("Period points")}</th>
						</tr>
					</thead>
					<tbody>
						${activityRows}
						<tr>
							<td class="left" colspan="5"><strong>${__("Total expected")} (${this.fmt(data.working_days)} × ${this.fmt(
			data.per_day_points
		)})</strong></td>
							<td class="sum">${this.fmt(data.activity_target, 2)}</td>
						</tr>
						<tr>
							<td class="left" colspan="5"><strong>${__("Total achieved")}</strong></td>
							<td class="sum">${this.fmt(data.activity_actual, 2)}</td>
						</tr>
					</tbody>
				</table>
			</div>

			<div class="skd-title">${__("Outcomes (YTD vs yearly mins)")}</div>
			<div class="skd-table-wrap">
				<table class="skd-table">
					<thead>
						<tr>
							<th class="left">${__("Outcome")}</th>
							<th>${__("Yearly min")}</th>
							<th>${__("YTD actual")}</th>
							<th>${__("% (capped 100)")}</th>
						</tr>
					</thead>
					<tbody>${outcomeRows}</tbody>
				</table>
			</div>

			<div class="skd-title">${__("Monthly summary")} ***</div>
			<div class="skd-table-wrap">
				<table class="skd-table">
					<tbody>
						<tr>
							<td class="left">${__("No of Working Days")}</td>
							<td>${this.fmt(data.working_days)}</td>
						</tr>
						<tr>
							<td class="left">${__("Per day Target Points")}</td>
							<td>${this.fmt(data.per_day_points)}</td>
						</tr>
						<tr>
							<td class="left"><strong>${__("Total Expected Targets Points Monthly ***")}</strong></td>
							<td><strong>${this.fmt(data.activity_target, 2)}</strong></td>
						</tr>
						<tr>
							<td class="left"><strong>${__("Total Achieve Points Monthly")}</strong></td>
							<td class="skd-green">${this.fmt(data.activity_actual, 2)}</td>
						</tr>
						<tr>
							<td class="left"><strong>${__("Percentage")}</strong></td>
							<td class="skd-green">${this.fmt_pct(data.activity_pct)}</td>
						</tr>
					</tbody>
				</table>
			</div>

			<div class="skd-bottom">
				<div>
					<div class="skd-title">${__("Monthly performance")} (${this.esc(data.fiscal_year_label)})</div>
					<div class="skd-table-wrap">
						<table class="skd-table">
							<thead>
								<tr>
									<th class="left">${__("Month")}</th>
									<th>${__("Monthly Point")}</th>
									<th>${__("Monthly Percentage")}</th>
								</tr>
							</thead>
							<tbody>
								${this.render_month_rows(data)}
								<tr>
									<td class="left"><strong>${__("Total")}</strong></td>
									<td class="skd-green">${this.fmt(data.ytd_activity_actual, 2)}</td>
									<td class="skd-green">${this.fmt_pct(data.ytd_activity_pct)}</td>
								</tr>
								<tr>
									<td class="left skd-green" colspan="2"><strong>${__("Yearly Target Score")}</strong></td>
									<td class="skd-green">${this.fmt(data.yearly_target_score, 2)}</td>
								</tr>
								<tr>
									<td class="left skd-green" colspan="2"><strong>${__("Achievement %")}</strong> (${__("Overall 70/30")})</td>
									<td class="skd-green">${this.fmt_pct(data.overall_pct)}</td>
								</tr>
							</tbody>
						</table>
					</div>
				</div>
				<div>
					<div class="skd-title">${__("Annual Increment (Performance base)")}</div>
					<div class="skd-table-wrap">
						${this.render_increment_table(data)}
					</div>
					<div class="skd-reward">
						<strong>${this.esc(data.reward_note || "")}</strong>
					</div>
					<div class="skd-reward">
						<strong>${this.esc(data.reward_new_schools || "")}</strong>
					</div>
				</div>
			</div>
			<ul class="skd-note">
				${(data.footnotes || []).map((f) => `<li>${this.esc(f)}</li>`).join("")}
			</ul>
		`);
	}

	render_month_rows(data) {
		return (data.months || [])
			.map((m) => {
				const score = m.score == null ? "" : this.fmt(m.score, 2);
				const pct = m.percent == null ? "" : this.fmt_pct(m.percent);
				return `<tr>
					<td class="left">${this.esc(m.label)}</td>
					<td>${score}</td>
					<td>${pct}</td>
				</tr>`;
			})
			.join("");
	}

	render_increment_table(data) {
		const scale = data.increment_scale || [];
		const current = ((data.increment_tier || {}).label || "").toLowerCase();
		const heads = scale
			.map((r) => `<th>${this.esc(r.label)}</th>`)
			.concat(`<th>${__("Achieved")}</th>`)
			.join("");
		const cells = scale
			.map((r) => {
				const cls = (r.label || "").toLowerCase() === current ? "skd-tier" : "";
				return `<td class="${cls}">${this.esc(r.increment)}</td>`;
			})
			.concat(`<td class="skd-green">${this.esc(data.increment_achieved || "")}</td>`)
			.join("");
		return `<table class="skd-table">
			<thead><tr>${heads}</tr></thead>
			<tbody>
				<tr>
					${cells}
				</tr>
				<tr>
					<td class="left" colspan="${scale.length + 1}">
						${__("Current Overall")}: <strong>${this.fmt_pct(data.overall_pct)}</strong>
						— ${__("band")}: <strong>${this.esc((data.increment_tier || {}).label || "")}</strong>
					</td>
				</tr>
			</tbody>
		</table>`;
	}

	render_summary(data) {
		const rows = (data.rows || [])
			.map((r) => {
				return `<tr class="${this.pct_cls(r.overall_pct)}">
					<td class="left skd-click" data-open-staff="${this.esc(r.staff)}">${this.esc(r.staff_label)}</td>
					<td class="left">${this.esc(r.division || r.sheet_label || "")}</td>
					<td>${this.fmt(r.working_days)}</td>
					<td>${this.fmt(r.activity_actual, 1)} / ${this.fmt(r.activity_target, 1)}</td>
					<td>${this.fmt_pct(r.activity_pct)}</td>
					<td class="skd-click" data-visit-metric="new_schools" data-staff="${this.esc(r.staff)}">${this.fmt(
					r.new_schools
				)}</td>
					<td>${this.fmt_pct(r.outcome_pct)}</td>
					<td><strong>${this.fmt_pct(r.overall_pct)}</strong></td>
				</tr>`;
			})
			.join("");

		this.body.find(".skd-body").html(`
			<div class="skd-title">${__("All Field Officers")}</div>
			<p class="skd-meta">
				${__("Period")}: <strong>${this.esc(data.from_date)} — ${this.esc(data.to_date)}</strong>
				&nbsp;|&nbsp; ${__("Outcomes YTD from")} <strong>${this.esc(data.ytd_from)}</strong>
				&nbsp;|&nbsp; ${__("Click a name for detail")}
			</p>
			<div class="skd-table-wrap">
				<table class="skd-table">
					<thead>
						<tr>
							<th class="left">${__("SME")}</th>
							<th class="left">${__("Area")}</th>
							<th>${__("Working days")}</th>
							<th>${__("Activity pts")}</th>
							<th>${__("Activity %")}</th>
							<th>${__("New schools")}</th>
							<th>${__("Outcome %")}</th>
							<th>${__("Overall %")}</th>
						</tr>
					</thead>
					<tbody>${rows || `<tr><td colspan="8" class="text-muted">${__("No Field Officers found.")}</td></tr>`}</tbody>
				</table>
			</div>
			<ul class="skd-note">
				${(data.footnotes || []).map((f) => `<li>${this.esc(f)}</li>`).join("")}
			</ul>
		`);
	}
};

function cint(v) {
	return parseInt(v, 10) || 0;
}

function flt(v) {
	const n = Number(v);
	return Number.isNaN(n) ? 0 : n;
}
