frappe.pages["smes-target-base---k"].on_page_load = function (wrapper) {
	new SmesTargetBasePage(wrapper);
};

const SME_REGIONS = ["karachi", "punjab", "urban", "rural"];

class SmesTargetBasePage {
	constructor(wrapper) {
		this.page = frappe.ui.make_app_page({
			parent: wrapper,
			title: __("SMEs Target Base - KPIs"),
			single_column: true,
		});
		this.setup_layout();
		this.setup_filters();
		this.bind_actions();
		this.setup_staff_autocomplete();
		this.show_placeholder();
	}

	setup_staff_autocomplete() {
		this.filters.staff.df.get_query = () => ({
			query:
				"tif_customization.tif_customization.page.smes_target_base___k.smes_target_base___k.get_staff_options",
		});
		this.filters.staff.refresh();
	}

	setup_layout() {
		this.body = $(`
			<div class="sme-kpi-page p-2">
				<div class="border rounded p-3 mb-3 sme-kpi-filters no-print">
					<div class="d-flex align-items-center justify-content-between mb-2">
						<h5 class="mb-0">${__("Filters")}</h5>
						<div>
							<button class="btn btn-sm btn-primary sme-apply">${__("Apply")}</button>
							<button class="btn btn-sm btn-default sme-reset">${__("Reset")}</button>
							<button class="btn btn-sm btn-default sme-print"><i class="fa fa-print"></i> ${__("Print")}</button>
						</div>
					</div>
					<div class="row sme-filter-row">
						<div class="col-lg-3 col-md-6 mb-2" data-field="staff"></div>
						<div class="col-lg-2 col-md-4 mb-2" data-field="region"></div>
						<div class="col-lg-2 col-md-4 mb-2" data-field="from_date"></div>
						<div class="col-lg-2 col-md-4 mb-2" data-field="to_date"></div>
						<div class="col-lg-2 col-md-4 mb-2" data-field="working_days"></div>
					</div>
				</div>
				<div class="sme-kpi-report"></div>
			</div>
		`);
		$(this.page.body).empty().append(this.body);
		this.inject_styles();
	}

	inject_styles() {
		if ($("#sme-kpi-style").length) return;
		$("head").append(`
			<style id="sme-kpi-style">
				.sme-sheet-wrap { overflow-x: auto; margin-bottom: 20px; }
				.sme-sheet {
					border-collapse: collapse;
					width: 100%;
					min-width: 1400px;
					font-size: 12px;
					font-family: Calibri, Arial, sans-serif;
				}
				.sme-sheet th, .sme-sheet td {
					border: 1px solid #000;
					padding: 5px 6px;
					vertical-align: middle;
					text-align: center;
				}
				.sme-sheet .left { text-align: left; }
				.sme-sheet .hdr-title {
					background: #b4c6e7;
					font-weight: 700;
					font-size: 16px;
					padding: 8px;
				}
				.sme-sheet .hdr-sub {
					background: #b4c6e7;
					font-weight: 700;
					font-size: 14px;
				}
				.sme-sheet .region-tan { background: #f8e4c8; font-weight: 700; }
				.sme-sheet .region-blue { background: #c5d9f1; font-weight: 700; }
				.sme-sheet .col-tan { background: #fdf6ec; }
				.sme-sheet .col-blue { background: #eef4fb; }
				.sme-sheet .col-hdr { background: #e8eef7; font-weight: 600; font-size: 11px; }
				.sme-sheet .row-bold td { font-weight: 700; background: #f5f5f5; }
				.sme-sheet .row-header td { font-weight: 600; background: #fafafa; }
				.sme-sheet .actual-cell { font-weight: 700; color: #0f172a; }
				.sme-bottom { display: flex; flex-wrap: wrap; gap: 20px; margin-top: 16px; }
				.sme-bottom-block { flex: 1; min-width: 280px; }
				.sme-month-table { font-size: 11px; min-width: 220px; }
				.sme-sign-box {
					border: 1px solid #000;
					min-height: 48px;
					margin-top: 4px;
					padding: 6px;
					text-align: left;
				}
				.sme-footnote { font-size: 11px; margin-top: 12px; }
				@media print {
					.sme-kpi-filters, .page-head, .no-print { display: none !important; }
					.sme-sheet { font-size: 10px; }
				}
			</style>
		`);
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
		const fromDefault = frappe.datetime.month_start(today);
		const route = frappe.get_route_options() || {};

		this.filters = {
			staff: this.make_filter({
				label: __("SME / Field Officer"),
				fieldname: "staff",
				fieldtype: "Autocomplete",
				options: [],
				default: route.staff || "",
			}),
			region: this.make_filter({
				label: __("Type / Division (KPI Sheet)"),
				fieldname: "region",
				fieldtype: "Select",
				options: [
					"",
					"karachi",
					"urban",
					"rural",
					"punjab",
				].join("\n"),
				default: "",
				description: __("Auto from Field Officer when blank"),
			}),
			from_date: this.make_filter({
				label: __("Visit From Date"),
				fieldname: "from_date",
				fieldtype: "Date",
				default: fromDefault,
				reqd: 1,
			}),
			to_date: this.make_filter({
				label: __("Visit To Date"),
				fieldname: "to_date",
				fieldtype: "Date",
				default: today,
				reqd: 1,
			}),
			working_days: this.make_filter({
				label: __("Working Days (for target points)"),
				fieldname: "working_days",
				fieldtype: "Int",
				default: 21,
				reqd: 1,
			}),
		};

		// Friendly labels for region options
		setTimeout(() => {
			const $sel = $(this.filters.region.$input);
			$sel.find('option[value=""]').text(__("Auto (from Field Officer)"));
			$sel.find('option[value="karachi"]').text(__("Karachi"));
			$sel.find('option[value="urban"]').text(__("Urban Areas"));
			$sel.find('option[value="rural"]').text(__("Rural Areas"));
			$sel.find('option[value="punjab"]').text(__("Punjab"));
			if (route.division) {
				const map = {
					Karachi: "karachi",
					"Urban Areas": "urban",
					"Rural Areas": "rural",
					Punjab: "punjab",
				};
				const rk = map[route.division];
				if (rk) this.filters.region.set_value(rk);
			}
		}, 50);
	}

	get_filter_values() {
		const from_date = this.filters.from_date.get_value();
		const to_date = this.filters.to_date.get_value();

		if (!from_date || !to_date) {
			frappe.msgprint({
				title: __("Date range required"),
				message: __("Please set Visit From Date and Visit To Date."),
				indicator: "orange",
			});
			return null;
		}
		if (frappe.datetime.str_to_obj(from_date) > frappe.datetime.str_to_obj(to_date)) {
			frappe.msgprint({
				title: __("Invalid date range"),
				message: __("Visit From Date cannot be after Visit To Date."),
				indicator: "orange",
			});
			return null;
		}

		return {
			staff: (this.filters.staff.get_value() || "").trim(),
			region: (this.filters.region.get_value() || "").trim(),
			from_date,
			to_date,
			working_days: cint(this.filters.working_days.get_value()) || 21,
		};
	}

	bind_actions() {
		this.body.find(".sme-apply").on("click", () => this.load_data());
		this.body.find(".sme-print").on("click", () => window.print());
		this.body.find(".sme-reset").on("click", () => {
			const today = frappe.datetime.get_today();
			this.filters.staff.set_value("");
			this.filters.region.set_value("");
			this.filters.from_date.set_value(frappe.datetime.month_start(today));
			this.filters.to_date.set_value(today);
			this.filters.working_days.set_value(21);
			this.show_placeholder();
		});
	}

	show_placeholder() {
		this.body.find(".sme-kpi-report").html(
			`<div class="text-muted p-3">${__("Set filters and click Apply to load the KPI sheet.")}</div>`
		);
	}

	load_data() {
		const filters = this.get_filter_values();
		if (!filters) return;

		this.body.find(".sme-kpi-report").html(`<div class="text-muted p-3">${__("Loading...")}</div>`);
		frappe.call({
			method:
				"tif_customization.tif_customization.page.smes_target_base___k.smes_target_base___k.get_report_data",
			args: { filters },
			freeze: true,
			freeze_message: __("Loading KPI sheet..."),
			callback: (r) => this.render_report(r.message || {}),
			error: () => {
				this.body.find(".sme-kpi-report").html(
					`<div class="text-danger p-3">${__("Failed to load report.")}</div>`
				);
			},
		});
	}

	fmt(val, opts = {}) {
		if (val === null || val === undefined || val === "") return "";
		if (typeof val === "string" && !/^-?\d+(\.\d+)?$/.test(val)) {
			return frappe.utils.escape_html(val);
		}
		if (opts.suffix === "%") return `${format_number(val, null, { precision: 2 })}%`;
		const precision = opts.precision != null ? opts.precision : 0;
		return format_number(val, null, { precision });
	}

	regionCells(regions, field, theme, opts = {}) {
		return SME_REGIONS.map((rk) => {
			const data = (regions || {})[rk] || {};
			const val = data[field];
			const cls = theme === "blue" ? "col-blue" : "col-tan";
			const inner = opts.show_actual && field === "per_day_target" && data.actual != null
				? `<div class="actual-cell">${this.fmt(data.actual)}</div>`
				: this.fmt(val, opts);
			return `<td class="${cls}">${inner}</td>`;
		}).join("");
	}

	render_main_table(data) {
		const regions = data.regions || [];
		const regionKeys = regions.length ? regions.map((r) => r.key) : SME_REGIONS;
		const themeMap = {};
		regions.forEach((r) => {
			themeMap[r.key] = r.theme || "tan";
		});
		const regionHeader = regions
			.map((r) => {
				const focus = data.focus_region === r.key ? " outline:2px solid #1b5e3b;" : "";
				return `<th colspan="3" class="${r.theme === "blue" ? "region-blue" : "region-tan"}" style="${focus}">${frappe.utils.escape_html(r.label)}${data.focus_region === r.key ? " ★" : ""}</th>`;
			})
			.join("");

		const subHeader = regions
			.map((r) => {
				const cls = r.theme === "blue" ? "col-blue" : "col-tan";
				return `
					<th class="${cls} col-hdr">${__("Per Day Target")}</th>
					<th class="${cls} col-hdr">${__("Points of each Category")}</th>
					<th class="${cls} col-hdr">${__("Yearly Compulsory Target")}</th>
				`;
			})
			.join("");

		const activityRows = (data.activity_rows || [])
			.map((row) => {
				const trClass = row.is_header ? "row-header" : "";
				return `
					<tr class="${trClass}">
						<td class="left">${frappe.utils.escape_html(row.label)}</td>
						<td class="left">${frappe.utils.escape_html(row.category || "")}</td>
						${regionKeys.map((rk) => {
							const reg = (row.regions || {})[rk] || {};
							const theme = themeMap[rk] || "tan";
							const cls = theme === "blue" ? "col-blue" : "col-tan";
							const pdt = row.is_header
								? ""
								: `<span>${this.fmt(reg.per_day_target, { precision: 2 })}</span>${reg.actual != null ? `<div class="actual-cell" style="font-size:10px;">${__("Act")}: ${this.fmt(reg.actual)}</div>` : ""}`;
							const pts = this.fmt(reg.points);
							return `
								<td class="${cls}">${pdt}</td>
								<td class="${cls}">${pts}</td>
								<td class="${cls}">${reg.yearly != null ? this.fmt(reg.yearly) : ""}</td>
							`;
						}).join("")}
					</tr>
				`;
			})
			.join("");

		const summaryRows = (data.summary_rows || [])
			.map((row) => {
				const trClass = row.bold ? "row-bold" : "";
				return `
					<tr class="${trClass}">
						<td class="left" colspan="2">${frappe.utils.escape_html(row.label)}</td>
						${regionKeys.map((rk) => {
							const v = (row.values || {})[rk];
							const theme = themeMap[rk] || "tan";
							const cls = theme === "blue" ? "col-blue" : "col-tan";
							return `<td colspan="3" class="${cls}">${this.fmt(v, { suffix: row.suffix })}</td>`;
						}).join("")}
					</tr>
				`;
			})
			.join("");

		const colSpan = 2 + regionKeys.length * 3;

		return `
			<div class="sme-sheet-wrap">
				<table class="sme-sheet">
					<tr><th colspan="${colSpan}" class="hdr-title">${frappe.utils.escape_html(data.foundation_title || "")}</th></tr>
					<tr><th colspan="${colSpan}" class="hdr-sub">${frappe.utils.escape_html(data.sheet_title || "")}</th></tr>
					<tr>
						<th class="col-hdr left">${__("Particulars")}</th>
						<th class="col-hdr left">${__("Task Category")}</th>
						${regionHeader}
					</tr>
					<tr>
						<th class="col-hdr left"></th>
						<th class="col-hdr left"></th>
						${subHeader}
					</tr>
					${activityRows}
					${summaryRows}
				</table>
			</div>
			<p class="text-muted small mb-2">
				${__("Period")}: ${frappe.utils.escape_html(data.from_date || "")} — ${frappe.utils.escape_html(data.to_date || "")}
				| ${frappe.utils.escape_html(data.staff_label || "")}
				| ${__("KPI Sheet")}: <strong>${frappe.utils.escape_html(data.focus_region_label || "")}</strong>
				| ${__("Act = Field Visit count in selected date range")}
			</p>
		`;
	}

	render_monthly_block(title, months) {
		const rows = (months || [])
			.map(
				(m) => `
			<tr>
				<td class="left">${frappe.utils.escape_html(m.label)}</td>
				<td>${this.fmt(m.score)}</td>
				<td>${this.fmt(m.percent, { suffix: "%" })}</td>
			</tr>
		`
			)
			.join("");
		return `
			<div class="sme-bottom-block">
				<strong>${frappe.utils.escape_html(title)}</strong>
				<table class="sme-sheet sme-month-table mt-1">
					<tr><th class="left">${__("Month")}</th><th>${__("Monthly Score")}</th><th>${__("Percentage")}</th></tr>
					${rows}
					<tr class="row-bold"><td class="left">${__("Additional Yearly Points")}</td><td></td><td>20</td></tr>
					<tr class="row-bold"><td class="left">${__("Total")}</td><td></td><td></td></tr>
				</table>
			</div>
		`;
	}

	render_report(data) {
		const fiscal = data.fiscal_by_region || {};
		const fiscalYear = data.fiscal_year_label || "";
		const monthlyBlocks = (data.regions || SME_REGIONS.map((rk) => ({ key: rk, label: rk })))
			.map(
				(r) =>
					this.render_monthly_block(
						`${__("Monthly performance")} — ${frappe.utils.escape_html(r.label)} (${fiscalYear})`,
						fiscal[r.key]
					)
			)
			.join("");
		const incrementRows = (data.increment_scale || [])
			.map(
				(r) => `<tr><td class="left">${frappe.utils.escape_html(r.label)}</td><td>${frappe.utils.escape_html(r.increment)}</td></tr>`
			)
			.join("");

		const footnotes = (data.footnotes || [])
			.map((f) => `<li>${frappe.utils.escape_html(f)}</li>`)
			.join("");

		this.body.find(".sme-kpi-report").html(`
			${this.render_main_table(data)}
			<div class="sme-bottom">
				${monthlyBlocks}
				<div class="sme-bottom-block">
					<strong>${__("Annual Increment (Performance base)")}</strong>
					<table class="sme-sheet sme-month-table mt-1">
						<tr><th class="left">${__("Achievement")}</th><th>${__("Annual Increment")}</th></tr>
						${incrementRows}
					</table>
					<p class="mt-2 small"><strong>${frappe.utils.escape_html(data.reward_note || "")}</strong></p>
				</div>
				<div class="sme-bottom-block">
					<strong>${__("Signatures")}</strong>
					<div class="mt-2"><label>${__("SME Name")}</label><div class="sme-sign-box">${frappe.utils.escape_html(data.staff_label || data.staff || "")}</div></div>
					<div class="mt-2"><label>${__("Type / Division")}</label><div class="sme-sign-box">${frappe.utils.escape_html((data.officer && data.officer.division) || data.focus_region_label || "")}</div></div>
					<a href="/app/field-officer" class="btn btn-xs btn-default mt-2 no-print">${__("Manage Field Officers")}</a>
					<a href="/app/field-visit" class="btn btn-xs btn-default mt-2 no-print">${__("Open Field Visits")}</a>
				</div>
			</div>
			<ul class="sme-footnote">${footnotes}</ul>
		`);
	}
}

function cint(v) {
	return parseInt(v, 10) || 0;
}
