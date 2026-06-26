frappe.pages["reporting-report"].on_page_load = function (wrapper) {
	new ReportingDataPage(wrapper);
};

class ReportingDataPage {
	constructor(wrapper) {
		this.suspend_filter_change = false;
		this.page = frappe.ui.make_app_page({
			parent: wrapper,
			title: __("Reporting Report"),
			single_column: true
		});

		this.setup_actions();
		this.setup_layout();
		this.setup_filters();
		this.bind_filter_actions();
		this.load_data();
	}

	setup_actions() {
		this.page.set_primary_action(__("Add Daily Report"), () => {
			frappe.new_doc("Reporting");
		});
	}

	get_month_start() {
		const dt = new Date();
		dt.setDate(1);
		return dt.toISOString().slice(0, 10);
	}

	setup_layout() {
		this.body = $(`
			<div class="p-2">
				<div class="border rounded p-3 mb-3">
					<div class="d-flex align-items-center justify-content-between mb-2">
						<h5 class="mb-0">${__("Filters")}</h5>
						<div>
							<button class="btn btn-sm btn-primary reporting-apply-filter">${__("Apply")}</button>
							<button class="btn btn-sm btn-default reporting-reset-filter">${__("Reset")}</button>
						</div>
					</div>
					<div class="row reporting-filter-grid"></div>
				</div>

				<div class="border rounded p-3">
					<h5 class="mb-2">${__("Report Details")}</h5>
					<div class="reporting-report-list"></div>
				</div>
			</div>
		`);

		$(this.page.body).empty().append(this.body);
	}

	make_filter(df) {
		const col = $('<div class="col-md-3 mb-2"></div>').appendTo(this.body.find(".reporting-filter-grid"));
		const wrapper = $('<div></div>').appendTo(col);
		const control = frappe.ui.form.make_control({
			parent: wrapper,
			df: {
				...df,
				change: () => this.on_filter_change()
			},
			render_input: true
		});
		control.refresh();
		if (df.default) {
			control.set_value(df.default);
		}
		return control;
	}

	setup_filters() {
		this.filters = {
			from_date: this.make_filter({
				label: __("From Date"),
				fieldname: "from_date",
				fieldtype: "Date",
				default: this.get_month_start()
			}),
			to_date: this.make_filter({
				label: __("To Date"),
				fieldname: "to_date",
				fieldtype: "Date",
				default: frappe.datetime.get_today()
			}),
			employee: this.make_filter({
				label: __("Employee"),
				fieldname: "employee",
				fieldtype: "Link",
				options: "User"
			}),
			section: this.make_filter({
				label: __("Section"),
				fieldname: "section",
				fieldtype: "Link",
				options: "Department"
			}),
			status: this.make_filter({
				label: __("Status"),
				fieldname: "status",
				fieldtype: "Select",
				options: "\nDone\nIn Progress\nPending"
			}),
			work_type: this.make_filter({
				label: __("Work Type"),
				fieldname: "work_type",
				fieldtype: "Select",
				options: "\nField Visit\nFollow-up Call\nMeeting\nTraining\nDocumentation\nPlanning\nOther"
			})
		};
	}

	on_filter_change() {
		if (this.suspend_filter_change) return;
		this.load_data();
	}

	set_filters(values) {
		this.suspend_filter_change = true;
		Object.entries(values).forEach(([key, value]) => {
			if (this.filters[key]) {
				this.filters[key].set_value(value);
			}
		});
		this.suspend_filter_change = false;
	}

	bind_filter_actions() {
		this.body.find(".reporting-apply-filter").on("click", () => this.load_data());
		this.body.find(".reporting-reset-filter").on("click", () => {
			const values = {
				from_date: this.get_month_start(),
				to_date: frappe.datetime.get_today(),
				section: "",
				status: "",
				work_type: ""
			};
			if (!this.filters.employee.df.read_only) values.employee = "";
			this.set_filters(values);
			this.load_data();
		});
	}

	get_filter_values() {
		return {
			from_date: this.filters.from_date.get_value(),
			to_date: this.filters.to_date.get_value(),
			employee: this.filters.employee.get_value(),
			section: this.filters.section.get_value(),
			status: this.filters.status.get_value(),
			work_type: this.filters.work_type.get_value()
		};
	}

	load_data() {
		frappe.call({
			method: "tif_customization.tif_customization.doctype.reporting.reporting.get_reporting_dashboard_data",
			args: this.get_filter_values(),
			freeze: false,
			callback: (r) => {
				const payload = r.message || {};
				this.apply_permissions(payload);
				this.render_table(payload.rows || []);
				this.bind_drilldown_actions();
			}
		});
	}

	apply_permissions(payload) {
		if (payload.can_view_all) {
			this.filters.employee.df.read_only = 0;
			this.filters.employee.refresh();
			return;
		}

		this.filters.employee.df.read_only = 1;
		if (this.filters.employee.get_value() !== frappe.session.user) {
			this.set_filters({ employee: frappe.session.user });
		}
		this.filters.employee.refresh();
	}

	get_status_text(status, docstatus) {
		if (status) return status;
		return docstatus === 1 ? "Submitted" : "Draft";
	}

	set_filter_and_reload(fieldname, value) {
		if (!this.filters[fieldname]) return;
		this.set_filters({ [fieldname]: value || "" });
		this.load_data();
	}

	bind_drilldown_actions() {
		this.body.find(".drilldown-employee").off("click").on("click", (e) => {
			e.preventDefault();
			const raw = $(e.currentTarget).attr("data-value") || "";
			const value = decodeURIComponent(raw);
			if (this.filters.employee.df.read_only && value !== frappe.session.user) return;
			this.set_filter_and_reload("employee", value);
		});

		this.body.find(".drilldown-status").off("click").on("click", (e) => {
			e.preventDefault();
			const raw = $(e.currentTarget).attr("data-value") || "";
			this.set_filter_and_reload("status", decodeURIComponent(raw));
		});

		this.body.find(".drilldown-work-type").off("click").on("click", (e) => {
			e.preventDefault();
			const raw = $(e.currentTarget).attr("data-value") || "";
			this.set_filter_and_reload("work_type", decodeURIComponent(raw));
		});
	}

	render_table(rows) {
		const container = this.body.find(".reporting-report-list");
		if (!rows.length) {
			container.html(`<div class="text-muted">${__("No reports found for selected filters.")}</div>`);
			return;
		}

		const table_rows = rows
			.map((row) => {
				const dt = `${frappe.datetime.str_to_user(row.posting_date || "")} ${row.posting_time || ""}`.trim();
				const employee = row.reported_by || "-";
				const workType = row.work_type || "-";
				const status = this.get_status_text(row.task_status, row.docstatus);
				const employeeText = employee === "-"
					? "-"
					: `<a href="#" class="drilldown-employee" data-value="${encodeURIComponent(employee)}">${frappe.utils.escape_html(employee)}</a>`;
				const workTypeText = workType === "-"
					? "-"
					: `<a href="#" class="drilldown-work-type" data-value="${encodeURIComponent(workType)}">${frappe.utils.escape_html(workType)}</a>`;
				const statusText = row.task_status
					? `<a href="#" class="drilldown-status" data-value="${encodeURIComponent(row.task_status)}">${frappe.utils.escape_html(status)}</a>`
					: frappe.utils.escape_html(status || "-");
				return `
					<tr>
						<td><a href="/app/reporting/${row.name}">${frappe.utils.escape_html(row.name || "")}</a></td>
						<td>${employeeText}</td>
						<td>${frappe.utils.escape_html(dt || "-")}</td>
						<td>${workTypeText}</td>
						<td>${frappe.utils.escape_html(row.activity || row.description || "-")}</td>
						<td>${statusText}</td>
					</tr>
				`;
			})
			.join("");

		container.html(`
			<div class="table-responsive">
				<table class="table table-bordered table-hover mb-0">
					<thead>
						<tr>
							<th>${__("Report")}</th>
							<th>${__("Employee")}</th>
							<th>${__("Date/Time")}</th>
							<th>${__("Work Type")}</th>
							<th>${__("Task / Activity")}</th>
							<th>${__("Status")}</th>
						</tr>
					</thead>
					<tbody>${table_rows}</tbody>
				</table>
			</div>
		`);
	}
}
