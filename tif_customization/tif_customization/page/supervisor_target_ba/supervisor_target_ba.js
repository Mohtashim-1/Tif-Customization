frappe.pages["supervisor-target-ba"].on_page_load = function (wrapper) {
	new SupervisorTargetBasePage(wrapper);
};

class SupervisorTargetBasePage {
	constructor(wrapper) {
		this.page = frappe.ui.make_app_page({
			parent: wrapper,
			title: __("Supervisors Target Base - KPIs"),
			single_column: true,
		});
		this.setup_layout();
		this.setup_filters();
		this.bind_actions();
		this.setup_supervisor_autocomplete();
		this.load_data();
	}

	setup_layout() {
		this.body = $(`
			<div class="stb-root">
				<style>
					.stb-root{padding:12px 12px 28px;max-width:1180px;margin:0 auto}
					.stb-filters{background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:12px 14px;margin-bottom:14px}
					.stb-note{font-size:12px;color:#64748b;margin:0 0 12px;line-height:1.45}
					.stb-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin:0 0 14px}
					.stb-kpi{border:1px solid #e5e7eb;border-top:4px solid #64748b;border-radius:10px;background:#fff;padding:12px 14px}
					.stb-kpi__label{color:#64748b;font-size:11px;margin-bottom:6px}
					.stb-kpi__value{color:#0f172a;font-size:22px;font-weight:700;font-variant-numeric:tabular-nums}
					.stb-kpi__hint{margin-top:6px;font-size:10px;color:#94a3b8}
					.stb-kpi--overall{border-top-color:#0f766e}
					.stb-kpi--activity{border-top-color:#2563eb}
					.stb-kpi--outcome{border-top-color:#ca8a04}
					.stb-kpi--days{border-top-color:#7c3aed}
					.stb-table-wrap{overflow:auto;background:#fff;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:14px}
					.stb-table{border-collapse:collapse;width:100%;font-size:12px}
					.stb-table th,.stb-table td{border:1px solid #e5e7eb;padding:6px 8px;vertical-align:middle;text-align:center}
					.stb-table .left{text-align:left}
					.stb-table thead th{background:#f1f5f9;font-weight:700}
					.stb-table .actual{background:#ecfdf5;font-weight:700}
					.stb-table .sum{background:#0f766e;color:#fff;font-weight:800}
					.stb-low{background:#fef2f2}
					.stb-ok{background:#ecfdf5}
					.stb-green{background:#c6efce;font-weight:700}
					.stb-tier{background:#00b050;color:#fff;font-weight:800}
					.stb-bottom{display:grid;grid-template-columns:1.2fr 1fr;gap:16px;margin:0 0 14px}
					.stb-reward{border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px;background:#fff;margin-bottom:8px;font-size:12px}
					.stb-reward strong{display:block;margin-bottom:4px}
					.stb-title{font-size:16px;font-weight:700;margin:4px 0 10px}
					.stb-meta{font-size:12px;color:#64748b;margin:0 0 12px}
					.stb-sign{display:none;margin-top:18px;font-size:12px}
					.stb-sign td{padding:8px 10px}
					.stb-sign .lbl{font-weight:700;width:200px}
					.stb-sign .box{border:1px solid #000;width:320px;height:30px}
					@media (max-width:900px){.stb-bottom{grid-template-columns:1fr}}
					@media print{
						.page-head,.navbar,.stb-filters,.no-print{display:none!important}
						.stb-sign{display:table}
						body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
					}
				</style>
				<div class="stb-filters no-print">
					<div class="d-flex justify-content-between align-items-center mb-2">
						<strong>${__("Supervisors Target Base - KPIs")}</strong>
						<div>
							<button class="btn btn-sm btn-primary stb-apply">${__("Apply")}</button>
							<button class="btn btn-sm btn-default stb-reset">${__("Reset")}</button>
							<button class="btn btn-sm btn-default stb-print"><i class="fa fa-print"></i> ${__("Print")}</button>
						</div>
					</div>
					<div class="row">
						<div class="col-md-3 mb-2" data-field="supervisor"></div>
						<div class="col-md-2 mb-2" data-field="from_date"></div>
						<div class="col-md-2 mb-2" data-field="to_date"></div>
						<div class="col-md-2 mb-2" data-field="working_days"></div>
					</div>
					<p class="stb-note mb-0">
						${__("Leave Supervisor blank to include all supervisors.")}
						${__("Working days auto-exclude Sunday, gazetted holidays and approved leave (leave blank to auto-calc).")}
						${__("Overall = 70% activity + 30% outcome. Activity points = visits / workshops / meetings / SME visits.")}
					</p>
				</div>
				<div class="stb-body"></div>
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
		this.filters = {
			supervisor: this.make_filter({
				label: __("Supervisor"),
				fieldname: "supervisor",
				fieldtype: "Autocomplete",
				options: [],
				default: "",
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
				label: __("Working Days"),
				fieldname: "working_days",
				fieldtype: "Int",
				description: __("Leave blank to auto-calc"),
			}),
		};
	}

	setup_supervisor_autocomplete() {
		this.filters.supervisor.df.get_query = () => ({
			query:
				"tif_customization.tif_customization.page.supervisor_target_ba.supervisor_target_ba.get_supervisor_options",
		});
		this.filters.supervisor.refresh();
	}

	bind_actions() {
		this.body.find(".stb-apply").on("click", () => this.load_data());
		this.body.find(".stb-print").on("click", () => window.print());
		this.body.find(".stb-reset").on("click", () => {
			const today = frappe.datetime.get_today();
			this.filters.supervisor.set_value("");
			this.filters.from_date.set_value(frappe.datetime.month_start(today));
			this.filters.to_date.set_value(today);
			this.filters.working_days.set_value("");
			this.load_data();
		});
		if (this.page && this.page.set_primary_action) {
			this.page.set_primary_action(__("Refresh"), () => this.load_data(), "refresh");
		}
	}

	get_filter_values() {
		const from_date = this.filters.from_date.get_value();
		const to_date = this.filters.to_date.get_value();
		if (!from_date || !to_date) {
			frappe.msgprint(__("Please set From Date and To Date."));
			return null;
		}
		if (frappe.datetime.str_to_obj(from_date) > frappe.datetime.str_to_obj(to_date)) {
			frappe.msgprint(__("From Date cannot be after To Date."));
			return null;
		}
		return {
			supervisor: (this.filters.supervisor.get_value() || "").trim(),
			from_date,
			to_date,
			working_days: cint(this.filters.working_days.get_value()) || 0,
		};
	}

	load_data() {
		const filters = this.get_filter_values();
		if (!filters) return;
		this.body.find(".stb-body").html(`<div class="text-muted p-3">${__("Loading...")}</div>`);
		frappe.call({
			method:
				"tif_customization.tif_customization.page.supervisor_target_ba.supervisor_target_ba.get_report_data",
			args: { filters },
			freeze: true,
			freeze_message: __("Loading supervisor KPI..."),
			callback: (r) => this.render_report(r.message || {}),
			error: () => {
				this.body
					.find(".stb-body")
					.html(`<div class="text-danger p-3">${__("Failed to load supervisor KPI.")}</div>`);
			},
		});
	}

	esc(v) {
		return frappe.utils.escape_html(v == null ? "" : String(v));
	}

	fmt(val, precision) {
		if (val === null || val === undefined || val === "") return "";
		const p = precision != null ? precision : 0;
		return format_number(val, null, { precision: p });
	}

	fmt_pct(val) {
		if (val === null || val === undefined || val === "") return "";
		return `${format_number(val, null, { precision: 2 })}%`;
	}

	pct_cls(v) {
		return flt(v) < 50 ? "stb-low" : "stb-ok";
	}

	activity_keys() {
		return new Set([
			"individual_school_visits",
			"workshop",
			"meetings",
			"school_visits_with_smes",
			"monthly_meeting_with_smes",
		]);
	}

	outcome_keys() {
		return new Set(["invitation", "enrolment_of_volunteers"]);
	}

	render_kpi_cards(data) {
		const wd = data.working_days_info || {};
		return `
			<div class="stb-kpis">
				<div class="stb-kpi stb-kpi--overall">
					<div class="stb-kpi__label">${__("Overall")}</div>
					<div class="stb-kpi__value">${this.fmt_pct(data.overall_pct)}</div>
					<div class="stb-kpi__hint">70% ${__("activity")} + 30% ${__("outcome")}</div>
				</div>
				<div class="stb-kpi stb-kpi--activity">
					<div class="stb-kpi__label">${__("Activity")}</div>
					<div class="stb-kpi__value">${this.fmt_pct(data.activity_pct)}</div>
					<div class="stb-kpi__hint">
						${this.fmt(data.activity_actual, 2)} / ${this.fmt(data.activity_target, 2)} ${__("pts")}
					</div>
				</div>
				<div class="stb-kpi stb-kpi--outcome">
					<div class="stb-kpi__label">${__("Outcome (YTD)")}</div>
					<div class="stb-kpi__value">${this.fmt_pct(data.outcome_pct)}</div>
					<div class="stb-kpi__hint">${__("Average of yearly compulsory mins")}</div>
				</div>
				<div class="stb-kpi stb-kpi--days">
					<div class="stb-kpi__label">${__("Working days")}</div>
					<div class="stb-kpi__value">${this.fmt(data.working_days)}</div>
					<div class="stb-kpi__hint">
						${__("Sun")} ${this.fmt(wd.sundays || 0)} · ${__("Holiday")} ${this.fmt(wd.gazetted || 0)} · ${__(
							"Leave"
						)} ${this.fmt(wd.leave_days || 0)}
					</div>
				</div>
			</div>
		`;
	}

	render_activity_table(data) {
		const keys = this.activity_keys();
		const rows = (data.rows || [])
			.filter((r) => r.yearly && keys.has(r.key))
			.map((r) => {
				const y = r.yearly || {};
				const m = r.monthly || {};
				return `<tr class="${this.pct_cls(y.percent)}">
					<td class="left">${this.esc(r.particulars)}</td>
					<td class="left">${this.esc(r.explanation)}</td>
					<td>${this.fmt(y.target, 1)}</td>
					<td class="actual">${this.fmt(y.actual)}</td>
					<td>${this.fmt_pct(y.percent)}</td>
					<td>${this.fmt(m.target, 1)}</td>
					<td class="actual">${this.fmt(m.actual)}</td>
					<td>${this.fmt_pct(m.percent)}</td>
				</tr>`;
			})
			.join("");

		return `
			<div class="stb-title">${__("Activity (period)")}</div>
			<div class="stb-table-wrap">
				<table class="stb-table">
					<thead>
						<tr>
							<th class="left">${__("Particulars")}</th>
							<th class="left">${__("Explanation")}</th>
							<th>${__("Yearly target")}</th>
							<th>${__("Yearly actual")}</th>
							<th>${__("Yearly %")}</th>
							<th>${__("Monthly target")}</th>
							<th>${__("Monthly actual")}</th>
							<th>${__("Monthly %")}</th>
						</tr>
					</thead>
					<tbody>
						${rows}
						<tr>
							<td class="left" colspan="7"><strong>${__("Total expected")} (${this.fmt(
								data.working_days
							)} × ${this.fmt(data.per_day_points, 2)})</strong></td>
							<td class="sum">${this.fmt(data.activity_target, 2)}</td>
						</tr>
						<tr>
							<td class="left" colspan="7"><strong>${__("Total achieved")}</strong></td>
							<td class="sum">${this.fmt(data.activity_actual, 2)}</td>
						</tr>
					</tbody>
				</table>
			</div>
		`;
	}

	render_outcome_table(data) {
		const keys = this.outcome_keys();
		const rows = (data.rows || [])
			.filter((r) => r.yearly && keys.has(r.key))
			.map((r) => {
				const y = r.yearly || {};
				return `<tr class="${this.pct_cls(y.percent)}">
					<td class="left">${this.esc(r.particulars)}</td>
					<td>${this.fmt(y.target, 1)}</td>
					<td class="actual">${this.fmt(y.actual)}</td>
					<td>${this.fmt_pct(Math.min(100, flt(y.percent)))}</td>
				</tr>`;
			})
			.join("");

		const other = (data.rows || [])
			.filter((r) => !r.yearly)
			.map(
				(r) => `<tr>
					<td class="left">${this.esc(r.particulars)}</td>
					<td colspan="3" class="left" style="color:#64748b">${this.esc(r.explanation || __("As per need"))}</td>
				</tr>`
			)
			.join("");

		return `
			<div class="stb-title">${__("Outcomes (YTD vs yearly mins)")}</div>
			<div class="stb-table-wrap">
				<table class="stb-table">
					<thead>
						<tr>
							<th class="left">${__("Outcome")}</th>
							<th>${__("Yearly min")}</th>
							<th>${__("YTD actual")}</th>
							<th>${__("% (capped 100)")}</th>
						</tr>
					</thead>
					<tbody>
						${rows || `<tr><td colspan="4" class="text-muted">${__("No outcome KPIs.")}</td></tr>`}
						${other}
					</tbody>
				</table>
			</div>
		`;
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
				const cls = (r.label || "").toLowerCase() === current ? "stb-tier" : "";
				return `<td class="${cls}">${this.esc(r.increment)}</td>`;
			})
			.concat(`<td class="stb-green">${this.esc(data.increment_achieved || "")}</td>`)
			.join("");
		return `<table class="stb-table">
			<thead><tr>${heads}</tr></thead>
			<tbody>
				<tr>${cells}</tr>
				<tr>
					<td class="left" colspan="${scale.length + 1}">
						${__("Current Overall")}: <strong>${this.fmt_pct(data.overall_pct)}</strong>
						— ${__("band")}: <strong>${this.esc((data.increment_tier || {}).label || "")}</strong>
					</td>
				</tr>
			</tbody>
		</table>`;
	}

	render_monthly_sections(data) {
		return `
			<div class="stb-title">${__("Monthly summary")} ***</div>
			<div class="stb-table-wrap">
				<table class="stb-table">
					<tbody>
						<tr>
							<td class="left">${__("No of Working Days")}</td>
							<td>${this.fmt(data.working_days)}</td>
						</tr>
						<tr>
							<td class="left">${__("Per day Target Points")}</td>
							<td>${this.fmt(data.per_day_points, 2)}</td>
						</tr>
						<tr>
							<td class="left"><strong>${__("Total Expected Targets Points Monthly ***")}</strong></td>
							<td><strong>${this.fmt(data.activity_target, 2)}</strong></td>
						</tr>
						<tr>
							<td class="left"><strong>${__("Total Achieve Points Monthly")}</strong></td>
							<td class="stb-green">${this.fmt(data.activity_actual, 2)}</td>
						</tr>
						<tr>
							<td class="left"><strong>${__("Percentage")}</strong></td>
							<td class="stb-green">${this.fmt_pct(data.activity_pct)}</td>
						</tr>
					</tbody>
				</table>
			</div>

			<div class="stb-bottom">
				<div>
					<div class="stb-title">${__("Monthly performance")} (${this.esc(data.fiscal_year_label || "")})</div>
					<div class="stb-table-wrap">
						<table class="stb-table">
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
									<td class="stb-green">${this.fmt(data.ytd_activity_actual, 2)}</td>
									<td class="stb-green">${this.fmt_pct(data.ytd_activity_pct)}</td>
								</tr>
								<tr>
									<td class="left stb-green" colspan="2"><strong>${__("Yearly Target Score")}</strong></td>
									<td class="stb-green">${this.fmt(data.yearly_target_score, 2)}</td>
								</tr>
								<tr>
									<td class="left stb-green" colspan="2"><strong>${__("Achievement %")}</strong> (${__(
										"Overall 70/30"
									)})</td>
									<td class="stb-green">${this.fmt_pct(data.overall_pct)}</td>
								</tr>
							</tbody>
						</table>
					</div>
				</div>
				<div>
					<div class="stb-title">${__("Annual Increment (Performance base)")}</div>
					<div class="stb-table-wrap">
						${this.render_increment_table(data)}
					</div>
					<div class="stb-reward">
						<strong>${this.esc(data.reward_note || "")}</strong>
					</div>
				</div>
			</div>
		`;
	}

	render_field_staff(data) {
		const rows = (data.field_staff || [])
			.map(
				(row) => `<tr>
					<td class="left">${this.esc(row.employee_name || row.name || "")}</td>
					<td>${this.esc(row.user_id || "")}</td>
					<td>${this.esc(row.department || "")}</td>
					<td>${this.esc(row.designation || "")}</td>
				</tr>`
			)
			.join("");
		return `
			<div class="stb-title">${__("Supervisor Field Staff")} (${this.fmt(data.field_staff_count)})</div>
			<div class="stb-table-wrap">
				<table class="stb-table">
					<thead>
						<tr>
							<th class="left">${__("Employee")}</th>
							<th>${__("User")}</th>
							<th>${__("Department")}</th>
							<th>${__("Designation")}</th>
						</tr>
					</thead>
					<tbody>
						${
							rows ||
							`<tr><td colspan="4" class="text-muted">${__(
								"No active field staff found for this supervisor."
							)}</td></tr>`
						}
					</tbody>
				</table>
			</div>
		`;
	}

	render_report(data) {
		const notes = (data.notes || []).map((n) => `<li>${this.esc(n)}</li>`).join("");
		this.body.find(".stb-body").html(`
			<div class="stb-title">${this.esc(data.supervisor_label || __("All Supervisors"))} — ${this.esc(
				data.sheet_title || ""
			)}</div>
			<p class="stb-meta">
				${__("Period")}: <strong>${this.esc(data.from_date)} — ${this.esc(data.to_date)}</strong>
				&nbsp;|&nbsp; ${__("Outcomes YTD")}: <strong>${this.esc(data.ytd_from || data.from_date)} — ${this.esc(
					data.to_date
				)}</strong>
				&nbsp;|&nbsp; ${__("FY")}: <strong>${this.esc(data.fiscal_year_label || "")}</strong>
				&nbsp;|&nbsp; ${__("Month")}: <strong>${this.esc(data.month_label || "")}</strong>
			</p>
			${this.render_kpi_cards(data)}
			${this.render_activity_table(data)}
			${this.render_outcome_table(data)}
			${this.render_monthly_sections(data)}
			${this.render_field_staff(data)}
			<table class="stb-sign">
				<tr><td class="lbl">${__("Regional Staff Name")}</td><td class="box">${
					data.supervisor ? this.esc(data.supervisor_label || "") : ""
				}</td></tr>
				<tr><td class="lbl">${__("Staff Signature")}</td><td class="box"></td></tr>
				<tr><td class="lbl">${__("Line Manager Signature")}</td><td class="box"></td></tr>
			</table>
			<ul class="stb-note">${notes}</ul>
		`);
	}
}

function cint(v) {
	return parseInt(v, 10) || 0;
}

function flt(v) {
	const n = Number(v);
	return Number.isNaN(n) ? 0 : n;
}
