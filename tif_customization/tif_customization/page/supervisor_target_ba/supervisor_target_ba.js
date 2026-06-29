frappe.pages["supervisor-target-ba"].on_page_load = function (wrapper) {
	new SupervisorTargetBasePage(wrapper);
};

class SupervisorTargetBasePage {
	constructor(wrapper) {
		this.page = frappe.ui.make_app_page({
			parent: wrapper,
			title: __("Supervisor Target Base KPI"),
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
			<div class="supervisor-kpi-page p-2">
				<div class="border rounded p-3 mb-3 supervisor-kpi-filters no-print">
					<div class="d-flex align-items-center justify-content-between mb-2">
						<h5 class="mb-0">${__("Filters")}</h5>
						<div>
							<button class="btn btn-sm btn-primary supervisor-apply">${__("Apply")}</button>
							<button class="btn btn-sm btn-default supervisor-reset">${__("Reset")}</button>
							<button class="btn btn-sm btn-default supervisor-print"><i class="fa fa-print"></i> ${__("Print")}</button>
						</div>
					</div>
					<div class="row">
						<div class="col-lg-4 col-md-6 mb-2" data-field="supervisor"></div>
						<div class="col-lg-2 col-md-3 mb-2" data-field="from_date"></div>
						<div class="col-lg-2 col-md-3 mb-2" data-field="to_date"></div>
					</div>
				</div>
				<div class="supervisor-kpi-report"></div>
			</div>
		`);
		$(this.page.body).empty().append(this.body);
		this.inject_styles();
	}

	inject_styles() {
		if ($("#supervisor-kpi-style").length) return;
		$("head").append(`
			<style id="supervisor-kpi-style">
				.supervisor-sheet-wrap { overflow-x: auto; margin-bottom: 18px; }
				.supervisor-sheet {
					border-collapse: collapse;
					width: 100%;
					min-width: 1180px;
					font-size: 12px;
					font-family: Calibri, Arial, sans-serif;
				}
				.supervisor-sheet th, .supervisor-sheet td {
					border: 1px solid #000;
					padding: 6px;
					vertical-align: middle;
					text-align: center;
				}
				.supervisor-sheet .left { text-align: left; }
				.supervisor-sheet .hdr-title {
					background: #b4c6e7;
					font-size: 16px;
					font-weight: 700;
					padding: 8px;
				}
				.supervisor-sheet .hdr-sub {
					background: #b4c6e7;
					font-size: 14px;
					font-weight: 700;
				}
				.supervisor-sheet .col-hdr {
					background: #e8eef7;
					font-weight: 700;
				}
				.supervisor-sheet .target-col { background: #fdf6ec; }
				.supervisor-sheet .actual-col { background: #eef4fb; font-weight: 700; }
				.supervisor-sheet .muted-cell { color: #64748b; }
				.supervisor-sheet .source-cell { font-size: 10px; color: #475569; }
				.supervisor-summary {
					display: flex;
					flex-wrap: wrap;
					gap: 16px;
					margin: 14px 0;
				}
				.supervisor-chip {
					border: 1px solid #d1d5db;
					border-radius: 6px;
					padding: 8px 10px;
					background: #fff;
				}
				@media print {
					.supervisor-kpi-filters, .page-head, .no-print { display: none !important; }
					.supervisor-sheet { font-size: 10px; }
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
				default: frappe.datetime.year_start(today),
				reqd: 1,
			}),
			to_date: this.make_filter({
				label: __("To Date"),
				fieldname: "to_date",
				fieldtype: "Date",
				default: today,
				reqd: 1,
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
		this.body.find(".supervisor-apply").on("click", () => this.load_data());
		this.body.find(".supervisor-print").on("click", () => window.print());
		this.body.find(".supervisor-reset").on("click", () => {
			const today = frappe.datetime.get_today();
			this.filters.supervisor.set_value("");
			this.filters.from_date.set_value(frappe.datetime.year_start(today));
			this.filters.to_date.set_value(today);
			this.load_data();
		});
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
		};
	}

	load_data() {
		const filters = this.get_filter_values();
		if (!filters) return;

		this.body.find(".supervisor-kpi-report").html(`<div class="text-muted p-3">${__("Loading...")}</div>`);
		frappe.call({
			method:
				"tif_customization.tif_customization.page.supervisor_target_ba.supervisor_target_ba.get_report_data",
			args: { filters },
			freeze: true,
			freeze_message: __("Loading supervisor KPI..."),
			callback: (r) => this.render_report(r.message || {}),
			error: () => {
				this.body.find(".supervisor-kpi-report").html(
					`<div class="text-danger p-3">${__("Failed to load supervisor KPI.")}</div>`
				);
			},
		});
	}

	fmt(val, opts = {}) {
		if (val === null || val === undefined || val === "") return opts.blank || "";
		if (opts.suffix === "%") return `${format_number(val, null, { precision: 2 })}%`;
		return format_number(val, null, { precision: opts.precision || 0 });
	}

	render_main_table(data) {
		const divisions = data.divisions || [];
		const divisionHeaders = divisions
			.map((d) => `<th class="target-col">${frappe.utils.escape_html(d.label)}</th>`)
			.join("");
		const rows = (data.rows || [])
			.map((row) => {
				const targets = row.targets || {};
				return `
					<tr>
						<td class="left">${frappe.utils.escape_html(row.particulars || "")}</td>
						<td class="left">${frappe.utils.escape_html(row.explanation || "")}</td>
						${divisions.map((d) => `<td class="target-col">${this.fmt(targets[d.key], { blank: "-" })}</td>`).join("")}
						<td class="target-col">${this.fmt(row.total_target, { blank: "" })}</td>
						<td class="actual-col">${this.fmt(row.actual, { blank: "" })}</td>
						<td class="actual-col">${row.total_target ? this.fmt(row.percent, { suffix: "%" }) : ""}</td>
						<td class="left source-cell">${frappe.utils.escape_html(row.source || "")}</td>
					</tr>
				`;
			})
			.join("");
		const colSpan = 2 + divisions.length + 4;

		return `
			<div class="supervisor-sheet-wrap">
				<table class="supervisor-sheet">
					<tr><th colspan="${colSpan}" class="hdr-title">${frappe.utils.escape_html(data.foundation_title || "")}</th></tr>
					<tr><th colspan="${colSpan}" class="hdr-sub">${frappe.utils.escape_html(data.sheet_title || "")}</th></tr>
					<tr>
						<th class="col-hdr left">${__("Particulars")}</th>
						<th class="col-hdr left">${__("Explanation")}</th>
						${divisionHeaders}
						<th class="col-hdr">${__("Total")}</th>
						<th class="col-hdr">${__("Actual")}</th>
						<th class="col-hdr">${__("Achieved")}</th>
						<th class="col-hdr left">${__("ERP Source")}</th>
					</tr>
					${rows}
				</table>
			</div>
		`;
	}

	render_field_staff(data) {
		const rows = (data.field_staff || [])
			.map(
				(row) => `
					<tr>
						<td class="left">${frappe.utils.escape_html(row.employee_name || row.name || "")}</td>
						<td>${frappe.utils.escape_html(row.user_id || "")}</td>
						<td>${frappe.utils.escape_html(row.department || "")}</td>
						<td>${frappe.utils.escape_html(row.designation || "")}</td>
					</tr>
				`
			)
			.join("");
		const empty = `<tr><td colspan="4" class="muted-cell">${__("No active field staff found for this supervisor.")}</td></tr>`;

		return `
			<div class="supervisor-sheet-wrap">
				<table class="supervisor-sheet" style="min-width: 760px;">
					<tr><th colspan="4" class="hdr-sub">${__("Supervisor Field Staff")}</th></tr>
					<tr>
						<th class="col-hdr left">${__("Employee")}</th>
						<th class="col-hdr">${__("User")}</th>
						<th class="col-hdr">${__("Department")}</th>
						<th class="col-hdr">${__("Designation")}</th>
					</tr>
					${rows || empty}
				</table>
			</div>
		`;
	}

	render_report(data) {
		const notes = (data.notes || [])
			.map((note) => `<li>${frappe.utils.escape_html(note)}</li>`)
			.join("");
		this.body.find(".supervisor-kpi-report").html(`
			<div class="supervisor-summary">
				<div class="supervisor-chip"><strong>${__("Supervisor")}:</strong> ${frappe.utils.escape_html(data.supervisor_label || "")}</div>
				<div class="supervisor-chip"><strong>${__("Period")}:</strong> ${frappe.utils.escape_html(data.from_date || "")} - ${frappe.utils.escape_html(data.to_date || "")}</div>
				<div class="supervisor-chip"><strong>${__("Supervisor Field Staff")}:</strong> ${this.fmt(data.field_staff_count)}</div>
			</div>
			${this.render_main_table(data)}
			${this.render_field_staff(data)}
			<ul class="small text-muted">${notes}</ul>
		`);
	}
}
