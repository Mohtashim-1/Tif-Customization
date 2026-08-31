frappe.pages["sme-kpi-sheet"].on_page_load = function (wrapper) {
	frappe.require("/assets/tif_customization/js/field_visit_drilldown.js", () => {
		const page = frappe.ui.make_app_page({
			parent: wrapper,
			title: __("SME KPI Sheet"),
			single_column: true,
		});
		wrapper.page = page;
		wrapper.sme_kpi_sheet = new frappe.tif_customization.SmeKpiSheet(page);
	});
};

frappe.pages["sme-kpi-sheet"].on_page_show = function (wrapper) {
	if (wrapper.sme_kpi_sheet && !wrapper.sme_kpi_sheet._loaded_once) {
		wrapper.sme_kpi_sheet._loaded_once = true;
		wrapper.sme_kpi_sheet.load_data();
	}
};

frappe.tif_customization = frappe.tif_customization || {};

frappe.tif_customization.SmeKpiSheet = class SmeKpiSheet {
	constructor(page) {
		this.page = page;
		this.data = null;
		this._loaded_once = false;
		try {
			this.setup_layout();
			this.setup_filters();
			this.bind_actions();
			this.load_staff_options();
			this.show_placeholder();
		} catch (e) {
			console.error("SME KPI Sheet init error", e);
			$(this.page.body).html(
				`<div class="text-danger p-4">${__("Failed to load SME KPI Sheet")}: ${frappe.utils.escape_html(
					e.message || String(e)
				)}</div>`
			);
		}
	}

	setup_layout() {
		this.body = $(`
			<div class="sks-root">
				<style>
					.sks-root{padding:12px 12px 28px;max-width:1180px;margin:0 auto}
					.sks-filters{background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:12px 14px;margin-bottom:14px}
					.sks-sheet-wrap{overflow:auto;background:#fff}
					.sks-sheet{
						border-collapse:collapse;width:100%;min-width:980px;
						font-family:Calibri,Arial,sans-serif;font-size:12px;color:#111
					}
					.sks-sheet th,.sks-sheet td{
						border:1px solid #000;padding:5px 6px;vertical-align:middle;text-align:center
					}
					.sks-sheet .left{text-align:left;white-space:pre-line}
					.sks-sheet .title{background:#b4c6e7;font-weight:800;font-size:18px;padding:10px}
					.sks-sheet .subtitle{background:#b4c6e7;font-weight:700;font-size:15px}
					.sks-sheet .region-tan{background:#f8e4c8;font-weight:800;font-size:14px}
					.sks-sheet .region-blue{background:#c5d9f1;font-weight:800;font-size:14px}
					.sks-sheet .col-hdr{background:#d9e2f3;font-weight:700;font-size:11px}
					.sks-sheet .row-hdr td{background:#f3f3f3;font-weight:700}
					.sks-sheet .actual{background:#c6efce;font-weight:700}
					.sks-sheet .actual.sks-click{cursor:pointer;text-decoration:underline;color:#0f766e}
					.sks-sheet .actual.sks-click:hover{background:#86efac}
					.sks-break{background:#f8fafc;border:1px dashed #94a3b8;border-radius:8px;padding:10px 12px;margin-bottom:12px;font-size:13px}
					.sks-break [data-visit-metric]{cursor:pointer;text-decoration:underline;color:#0f766e}
					.sks-sheet .yellow td{background:#ffff99}
					.sks-sheet .yellow .actual{background:#c6efce}
					.sks-sheet .sum-green{background:#00b050;color:#fff;font-weight:800}
					.sks-sheet .summary-label{text-align:left;font-weight:600}
					.sks-sheet .pct{font-weight:800}
					.sks-bottom{display:grid;grid-template-columns:1.4fr .9fr;gap:18px;margin-top:16px}
					.sks-month{width:100%;border-collapse:collapse;font-size:11px;font-family:Calibri,Arial,sans-serif}
					.sks-month th,.sks-month td{border:1px solid #000;padding:4px 5px;text-align:center}
					.sks-month .left{text-align:left}
					.sks-month .hdr{background:#c6efce;font-weight:700}
					.sks-sign{border:1px solid #000;min-height:42px;margin-top:4px;padding:6px;text-align:left}
					.sks-notes{font-size:11px;margin-top:12px;line-height:1.45}
					.sks-meta{font-size:12px;color:#4b5563;margin:8px 0 0}
					@media (max-width:900px){.sks-bottom{grid-template-columns:1fr}}
					@media print{
						.page-head,.navbar,.sks-filters{display:none!important}
						.sks-root{padding:0;max-width:none}
						.sks-sheet{font-size:10px}
						body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
					}
				</style>
				<div class="sks-filters no-print">
					<div class="d-flex justify-content-between align-items-center mb-2">
						<strong>${__("SME KPI Sheet")} — ${__("Excel layout")}</strong>
						<div>
							<button class="btn btn-sm btn-primary sks-apply">${__("Apply")}</button>
							<button class="btn btn-sm btn-default sks-reset">${__("Reset")}</button>
							<button class="btn btn-sm btn-default sks-print"><i class="fa fa-print"></i> ${__("Print")}</button>
						</div>
					</div>
					<div class="row">
						<div class="col-md-3 mb-2" data-field="staff"></div>
						<div class="col-md-2 mb-2" data-field="sheet"></div>
						<div class="col-md-2 mb-2" data-field="from_date"></div>
						<div class="col-md-2 mb-2" data-field="to_date"></div>
						<div class="col-md-2 mb-2" data-field="working_days"></div>
					</div>
				</div>
				<div class="sks-body"></div>
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
		const route = (frappe.route_options || frappe.get_route_options && frappe.get_route_options()) || {};
		this.filters = {
			staff: this.make_filter({
				label: __("SME / Field Officer"),
				fieldname: "staff",
				fieldtype: "Data",
				default: route.staff || "",
			}),
			sheet: this.make_filter({
				label: __("Excel Sheet"),
				fieldname: "sheet",
				fieldtype: "Select",
				options: "\nkarachi\nurban\nrural",
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
				default: 21,
				reqd: 1,
			}),
		};

		setTimeout(() => {
			const $sel = $(this.filters.sheet.$input);
			$sel.find('option[value=""]').text(__("Auto (from Field Officer)"));
			$sel.find('option[value="karachi"]').text(__("Karachi"));
			$sel.find('option[value="urban"]').text(__("Other Province Urban Areas"));
			$sel.find('option[value="rural"]').text(__("Other Province Rural Areas"));
			if (route.division) {
				const map = {
					Karachi: "karachi",
					"Urban Areas": "urban",
					"Rural Areas": "rural",
					Punjab: "urban",
				};
				if (map[route.division]) this.filters.sheet.set_value(map[route.division]);
			}
		}, 50);

		// Upgrade staff to Autocomplete after options load
		this._staff_options = [];
	}

	load_staff_options() {
		frappe.call({
			method: "tif_customization.tif_customization.page.sme_kpi_sheet.sme_kpi_sheet.get_staff_options",
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
		this.body.find(".sks-apply").on("click", () => this.load_data());
		this.body.find(".sks-print").on("click", () => window.print());
		this.body.find(".sks-reset").on("click", () => {
			const today = frappe.datetime.get_today();
			this.filters.staff.set_value("");
			this.filters.sheet.set_value("");
			this.filters.from_date.set_value(frappe.datetime.month_start(today));
			this.filters.to_date.set_value(today);
			this.filters.working_days.set_value(21);
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
			frappe.tif_customization.open_visit_drilldown({
				from_date: f.from_date,
				to_date: f.to_date,
				staff: f.staff,
				metric,
			});
		});
	}

	show_placeholder() {
		this.body.find(".sks-body").html(
			`<div class="text-muted p-3">${__("Select Field Officer / sheet and click Apply.")}</div>`
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
			sheet: (this.filters.sheet.get_value() || "").trim(),
			from_date,
			to_date,
			working_days: cint(this.filters.working_days.get_value()) || 21,
		};
	}

	load_data() {
		const filters = this.get_filters();
		if (!filters) return;
		this.body.find(".sks-body").html(`<div class="text-muted p-3">${__("Loading...")}</div>`);
		frappe.call({
			method: "tif_customization.tif_customization.page.sme_kpi_sheet.sme_kpi_sheet.get_report_data",
			args: { filters },
			freeze: true,
			freeze_message: __("Loading KPI sheet..."),
			callback: (r) => {
				if (!r.message) {
					this.body.find(".sks-body").html(`<div class="text-danger p-3">${__("No data returned.")}</div>`);
					return;
				}
				this.data = r.message;
				try {
					this.render(r.message);
				} catch (e) {
					console.error(e);
					this.body
						.find(".sks-body")
						.html(`<div class="text-danger p-3">${__("Render error")}: ${frappe.utils.escape_html(e.message || e)}</div>`);
				}
			},
			error: (err) => {
				console.error(err);
				this.body.find(".sks-body").html(`<div class="text-danger p-3">${__("Failed to load report. Check permissions / console.")}</div>`);
			},
		});
	}

	esc(v) {
		return frappe.utils.escape_html(v == null ? "" : String(v));
	}

	fmt(v, precision) {
		if (v === null || v === undefined || v === "") return "";
		if (typeof v === "string" && !/^-?\d+(\.\d+)?$/.test(v)) return this.esc(v);
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

	render(data) {
		const regionCls = data.theme === "blue" ? "region-blue" : "region-tan";
		const skipClick = { model_school_a: 1, model_school_b: 1 };
		const rows = (data.rows || [])
			.map((r) => {
				const trCls = r.highlight === "yellow" ? "yellow" : "";
				const monthly =
					r.monthly_points != null ? `<td class="actual">${this.fmt(r.monthly_points, 2)}</td>` : `<td></td>`;
				const yearly =
					r.yearly_points != null ? `<td class="actual">${this.fmt(r.yearly_points, 3)}</td>` : `<td></td>`;
				const clickable = !skipClick[r.key];
				const actualCls = clickable ? "actual sks-click" : "actual";
				const actualAttr = clickable
					? ` data-visit-metric="${this.esc(r.key)}" title="${__("Click to see Field Visits")}"`
					: "";
				return `<tr class="${trCls}">
					<td class="left">${this.esc(r.label)}</td>
					<td class="left">${this.esc(r.category)}</td>
					<td>${this.esc(r.per_day_target)}</td>
					<td>${this.esc(r.points)}</td>
					<td>${this.esc(r.yearly_target)}</td>
					<td class="${actualCls}"${actualAttr}>${this.fmt(r.actual)}</td>
					${monthly}
					${yearly}
				</tr>`;
			})
			.join("");

		const monthRows = (data.months || [])
			.map(
				(m) => `<tr>
				<td class="left">${this.esc(m.label)}</td>
				<td>${this.fmt(m.score, 2)}</td>
				<td>${this.fmt_pct(m.percent)}</td>
				<td class="hdr">${this.fmt(m.yearly_score, 2)}</td>
				<td class="hdr">${this.fmt_pct(m.yearly_percent)}</td>
			</tr>`
			)
			.join("");

		const visitTotal = data.visit_total != null
			? data.visit_total
			: (data.visit_breakdown || []).reduce((s, b) => s + (b.count || 0), 0);
		const visitParts = (data.visit_breakdown || [])
			.map(
				(b) =>
					`<span data-visit-metric="${this.esc(b.metric || "visits")}">${this.esc(b.type)} ${b.count}</span>`
			)
			.join(" + ");

		this.body.find(".sks-body").html(`
			<div class="sks-break">
				<strong data-visit-metric="visits">${__("Total visits")}: ${this.fmt(visitTotal)}</strong>
				${visitParts ? " = " + visitParts : ""}.
				${__("This is every Field Visit type (Marketing + M&E + Meetings + Training + Other). Click any number to open those documents.")}
			</div>
			<div class="sks-sheet-wrap">
				<table class="sks-sheet">
					<tr><th colspan="8" class="title">${this.esc(data.foundation_title)}</th></tr>
					<tr><th colspan="8" class="subtitle">${this.esc(data.sheet_title)}</th></tr>
					<tr><th colspan="8" class="${regionCls}">${this.esc(data.sheet_label)}</th></tr>
					<tr>
						<th class="col-hdr left">${__("Particulars")}</th>
						<th class="col-hdr left">${__("Task Category")}</th>
						<th class="col-hdr">${__("Per Day Target")}</th>
						<th class="col-hdr">${__("Points of each Category")}</th>
						<th class="col-hdr">${__("Yearly Compulsory Target")}</th>
						<th class="col-hdr">${__("Actual Activities")}</th>
						<th class="col-hdr">${__("Monthly Points Obtain")}</th>
						<th class="col-hdr">${__("Yearly Points Obtain")}</th>
					</tr>
					<tr class="row-hdr">
						<td class="left">${__("Per Day Points to be achived by each SME")}</td>
						<td>-</td>
						<td></td>
						<td>${this.fmt(data.per_day_points)}</td>
						<td>-</td>
						<td></td>
						<td></td>
						<td></td>
					</tr>
					${rows}
					<tr>
						<td colspan="6"></td>
						<td class="sum-green">${this.fmt(data.monthly_total, 2)}</td>
						<td class="sum-green">${this.fmt(data.yearly_total, 3)}</td>
					</tr>
					<tr>
						<td class="summary-label" colspan="2">${__("No of Working Days")}</td>
						<td colspan="2"></td>
						<td>${this.fmt(data.working_days)}</td>
						<td colspan="3"></td>
					</tr>
					<tr>
						<td class="summary-label" colspan="2">${__("Per day Target Points")}</td>
						<td colspan="2"></td>
						<td>${this.fmt(data.per_day_points)}</td>
						<td colspan="3"></td>
					</tr>
					<tr>
						<td class="summary-label" colspan="2"><strong>${__("Total Expected Targets Points Monthly ***")}</strong></td>
						<td colspan="2"></td>
						<td><strong>${this.fmt(data.expected, 2)}</strong></td>
						<td colspan="3"></td>
					</tr>
					<tr>
						<td class="summary-label" colspan="2"><strong>${__("Total Achive Points Monthly")}</strong></td>
						<td colspan="2"></td>
						<td class="actual"><strong>${this.fmt(data.achieved, 2)}</strong></td>
						<td colspan="3"></td>
					</tr>
					<tr>
						<td class="summary-label" colspan="2"><strong>${__("Percentage")}</strong></td>
						<td colspan="2"></td>
						<td class="pct">${this.fmt_pct(data.percent)}</td>
						<td colspan="3"></td>
					</tr>
				</table>
			</div>
			<p class="sks-meta">
				${__("Period")}: <strong>${this.esc(data.from_date)} — ${this.esc(data.to_date)}</strong>
				&nbsp;|&nbsp; ${__("SME")}: <strong>${this.esc(data.staff_label)}</strong>
				&nbsp;|&nbsp; ${__("Sheet")}: <strong>${this.esc(data.sheet_label)}</strong>
			</p>
			<div class="sks-bottom">
				<div>
					<table class="sks-month">
						<tr>
							<th class="left">${__("Month")}</th>
							<th>${__("Monthly Score")}</th>
							<th>${__("Monthly Percentage")}</th>
							<th class="hdr">${__("Yearly Score")}</th>
							<th class="hdr">${__("Yearly Percentage")}</th>
						</tr>
						${monthRows}
					</table>
				</div>
				<div>
					<div><strong>${__("SME Name")}</strong><div class="sks-sign">${this.esc(data.staff_label)}</div></div>
					<div class="mt-2"><strong>${__("SME Signature")}</strong><div class="sks-sign"></div></div>
					<div class="mt-2"><strong>${__("Line Manager Signature")}</strong><div class="sks-sign"></div></div>
				</div>
			</div>
			<ul class="sks-notes">
				${(data.footnotes || []).map((f) => `<li>${this.esc(f)}</li>`).join("")}
			</ul>
		`);
	}
};

function cint(v) {
	return parseInt(v, 10) || 0;
}
