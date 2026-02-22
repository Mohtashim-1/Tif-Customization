frappe.pages["task-reporting"].on_page_load = function (wrapper) {
	new TaskReportingPage(wrapper);
};

class TaskReportingPage {
	constructor(wrapper) {
		this.suspend_filter_change = false;
		this.page = frappe.ui.make_app_page({
			parent: wrapper,
			title: __("Task Reporting"),
			single_column: true,
		});

		this.setup_layout();
		this.setup_filters();
		this.bind_actions();
		this.load_data();
	}

	get_month_start() {
		const dt = new Date();
		dt.setDate(1);
		return dt.toISOString().slice(0, 10);
	}

	setup_layout() {
		this.body = $(`
			<div class="p-2">
				<style>
					.tr-status-badge {
						display: inline-block;
						padding: 2px 8px;
						border-radius: 999px;
						font-size: 12px;
						font-weight: 600;
						line-height: 1.4;
						white-space: nowrap;
					}
					.tr-status-done {
						color: #166534;
						background: #dcfce7;
						border: 1px solid #86efac;
					}
					.tr-status-progress {
						color: #1d4ed8;
						background: #dbeafe;
						border: 1px solid #93c5fd;
					}
					.tr-status-pending {
						color: #92400e;
						background: #fef3c7;
						border: 1px solid #fcd34d;
					}
					.tr-status-other {
						color: #374151;
						background: #f3f4f6;
						border: 1px solid #d1d5db;
					}
				</style>
				<div class="border rounded p-3 mb-3">
					<div class="d-flex align-items-center justify-content-between mb-2">
						<h5 class="mb-0">${__("Filters")}</h5>
						<div>
							<button class="btn btn-sm btn-primary tr-apply">${__("Apply")}</button>
							<button class="btn btn-sm btn-default tr-reset">${__("Reset")}</button>
						</div>
					</div>
					<div class="row tr-filter-grid"></div>
				</div>

				<div class="border rounded p-3">
					<div class="d-flex align-items-center justify-content-between mb-2">
						<h5 class="mb-0">${__("Task Reporting")}</h5>
						<div>
							<button class="btn btn-sm btn-success tr-export-excel">${__("Export Excel")}</button>
							<span class="text-muted tr-count ml-2"></span>
						</div>
					</div>
					<div class="tr-table"></div>
				</div>
			</div>
		`);

		$(this.page.body).empty().append(this.body);
	}

	make_filter(df) {
		const col = $('<div class="col-md-3 mb-2"></div>').appendTo(this.body.find(".tr-filter-grid"));
		const parent = $('<div></div>').appendTo(col);
		const control = frappe.ui.form.make_control({
			parent,
			df: {
				...df,
				change: () => this.on_filter_change(),
			},
			render_input: true,
		});
		control.refresh();
		if (df.default) control.set_value(df.default);
		return control;
	}

	setup_filters() {
		this.filters = {
			from_date: this.make_filter({
				label: __("From Date"),
				fieldname: "from_date",
				fieldtype: "Date",
				default: this.get_month_start(),
			}),
			to_date: this.make_filter({
				label: __("To Date"),
				fieldname: "to_date",
				fieldtype: "Date",
				default: frappe.datetime.get_today(),
			}),
			reported_by: this.make_filter({
				label: __("Reported By"),
				fieldname: "reported_by",
				fieldtype: "Link",
				options: "User",
			}),
			work_type: this.make_filter({
				label: __("Work Type"),
				fieldname: "work_type",
				fieldtype: "Select",
				options: "\nField Visit\nFollow-up Call\nMeeting\nTraining\nDocumentation\nPlanning\nOther",
			}),
			status: this.make_filter({
				label: __("Status"),
				fieldname: "status",
				fieldtype: "Select",
				options: "\nDone\nIn Progress\nPending",
			}),
		};
	}

	bind_actions() {
		this.body.find(".tr-apply").on("click", () => this.load_data());
		this.body.find(".tr-export-excel").on("click", () => this.export_excel());
		this.body.find(".tr-reset").on("click", () => {
			this.set_filters({
				from_date: this.get_month_start(),
				to_date: frappe.datetime.get_today(),
				reported_by: "",
				work_type: "",
				status: "",
			});
			this.load_data();
		});
	}

	on_filter_change() {
		if (this.suspend_filter_change) return;
		this.load_data();
	}

	set_filters(values) {
		this.suspend_filter_change = true;
		Object.entries(values).forEach(([key, value]) => {
			if (this.filters[key]) this.filters[key].set_value(value || "");
		});
		this.suspend_filter_change = false;
	}

	get_filter_values() {
		return {
			from_date: this.filters.from_date.get_value(),
			to_date: this.filters.to_date.get_value(),
			reported_by: this.filters.reported_by.get_value(),
			work_type: this.filters.work_type.get_value(),
			status: this.filters.status.get_value(),
		};
	}

	load_data() {
		this.body.find(".tr-table").html(`<div class="text-muted">${__("Loading...")}</div>`);
		frappe.call({
			method: "tif_customization.tif_customization.page.task_reporting.task_reporting.get_task_reporting_data",
			args: { filters: this.get_filter_values() },
			freeze: false,
			callback: (r) => {
				const data = r.message || { rows: [], columns: [], labels: {}, total_count: 0 };
				this.render_table(data.rows || [], data.columns || [], data.labels || {});
				this.body.find(".tr-count").text(`${data.total_count || 0} ${__("records")}`);
			},
		});
	}

	export_excel() {
		const filters = encodeURIComponent(JSON.stringify(this.get_filter_values()));
		const url = `/api/method/tif_customization.tif_customization.page.task_reporting.task_reporting.download_task_reporting_excel?filters=${filters}`;
		window.open(url, "_blank");
	}

	render_table(rows, columns, labels) {
		if (!rows.length) {
			this.body.find(".tr-table").html(`<div class="text-muted">${__("No data found.")}</div>`);
			return;
		}

		const safeColumns = columns.length ? columns : Object.keys(rows[0] || {});
		const head = safeColumns
			.map((col) => `<th>${frappe.utils.escape_html(labels[col] || col)}</th>`)
			.join("");
		const body = rows
			.map((row) => {
				const tds = safeColumns
					.map((col) => {
						const value = row[col];
						if (col === "reporting_id") {
							const id = frappe.utils.escape_html(value || "");
							return `<td><a href="/app/reporting/${id}">${id}</a></td>`;
						}
						if (col === "status") {
							return `<td>${this.get_status_badge(value)}</td>`;
						}
						return `<td>${frappe.utils.escape_html(value == null || value === "" ? "-" : String(value))}</td>`;
					})
					.join("");
				return `<tr>${tds}</tr>`;
			})
			.join("");

		this.body.find(".tr-table").html(`
			<div class="table-responsive">
				<table class="table table-bordered table-hover mb-0">
					<thead><tr>${head}</tr></thead>
					<tbody>${body}</tbody>
				</table>
			</div>
		`);
	}

	get_status_badge(value) {
		const status = value == null ? "" : String(value);
		const safeStatus = frappe.utils.escape_html(status || "-");
		const normalized = status.trim().toLowerCase();
		let klass = "tr-status-other";

		if (normalized === "done") klass = "tr-status-done";
		else if (normalized === "in progress") klass = "tr-status-progress";
		else if (normalized === "pending") klass = "tr-status-pending";

		return `<span class="tr-status-badge ${klass}">${safeStatus}</span>`;
	}
}
