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

				<div class="reporting-kpis mb-3"></div>

				<div class="border rounded p-3">
					<h5 class="mb-2">${__("Report Details")}</h5>
					<div class="reporting-report-list"></div>
				</div>
			</div>
			<style>
				.reporting-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}
				.reporting-kpi{border:1px solid var(--border-color,#e5e7eb);border-top:4px solid #64748b;border-radius:10px;background:#fff;padding:14px 16px;box-shadow:0 2px 8px rgba(15,23,42,.05)}
				.reporting-kpi__label{color:#64748b;font-size:12px;margin-bottom:6px}
				.reporting-kpi__value{color:#0f172a;font-size:24px;font-weight:700;line-height:1.1;font-variant-numeric:tabular-nums}
				.reporting-kpi__hint{margin-top:6px;font-size:11px;color:#94a3b8}
				.reporting-kpi--missing{border-top-color:#dc2626;cursor:pointer}
				.reporting-kpi--missing:hover{box-shadow:0 4px 14px rgba(15,23,42,.12)}
				.reporting-missing-dates{font-size:12px;color:#475569;max-width:420px}
			</style>
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
				this.payload = payload;
				this.apply_permissions(payload);
				this.render_kpis(payload);
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
		this.body.find(".reporting-kpi--missing").off("click").on("click", () => {
			this.show_missing_report_detail();
		});
	}

	render_kpis(payload) {
		const k = payload.kpis || {};
		const missing = payload.missing_reports || {};
		const missing_count = missing.employee_count || 0;
		const working_days = missing.working_days || 0;
		const expected = missing.expected_employees || 0;
		const cards = [
			[__("Total Reports"), k.total_reports || 0, "", ""],
			[__("Active Employees"), k.active_employees || 0, "", ""],
			[
				__("Did not add reports"),
				missing_count,
				"reporting-kpi--missing",
				__(
					"{0} of {1} employees missed at least one day · Sundays excluded · {2} working days · click for names",
					[missing_count, expected, working_days],
				),
			],
		];
		this.body.find(".reporting-kpis").html(
			cards
				.map(
					([label, value, extra, hint]) => `
				<div class="reporting-kpi ${extra}">
					<div class="reporting-kpi__label">${label}</div>
					<div class="reporting-kpi__value">${frappe.utils.escape_html(String(value))}</div>
					${hint ? `<div class="reporting-kpi__hint">${hint}</div>` : ""}
				</div>`
				)
				.join(""),
		);
	}

	show_missing_report_detail() {
		const missing = (this.payload && this.payload.missing_reports) || {};
		const rows = missing.employees || [];
		if (!rows.length) {
			frappe.msgprint({
				title: __("Employees without reports"),
				message: __("Everyone submitted a report on working days in this range. Sundays are excluded."),
				indicator: "green",
			});
			return;
		}

		const body = rows
			.map((row) => {
				const dates = (row.missing_dates || [])
					.map((d) => frappe.datetime.str_to_user(d))
					.join(", ");
				const emp = frappe.utils.escape_html(row.employee_name || row.employee || "");
				const emp_id = frappe.utils.escape_html(row.employee || "");
				const dept = frappe.utils.escape_html(row.department || "-");
				const user = encodeURIComponent(row.user || "");
				return `
					<tr>
						<td>
							<a href="/app/employee/${emp_id}">${emp}</a>
							<div class="text-muted" style="font-size:11px">${emp_id}</div>
						</td>
						<td>${dept}</td>
						<td class="text-right">${cint(row.missing_days)}</td>
						<td class="reporting-missing-dates">${frappe.utils.escape_html(dates)}</td>
						<td>
							${
								row.user
									? `<a href="#" class="missing-filter-emp" data-user="${user}">${__("Show reports")}</a>`
									: "-"
							}
						</td>
					</tr>`;
			})
			.join("");

		const dialog = new frappe.ui.Dialog({
			title: __("Employees who did not add reports ({0})", [rows.length]),
			size: "extra-large",
			fields: [
				{
					fieldtype: "HTML",
					fieldname: "missing_html",
				},
			],
		});
		dialog.fields_dict.missing_html.$wrapper.html(`
			<p class="text-muted">
				${__("Working days in range (Sundays excluded)")}: <strong>${cint(missing.working_days)}</strong>.
				${__("Active employees expected")}: <strong>${cint(missing.expected_employees)}</strong>.
			</p>
			<div class="table-responsive">
				<table class="table table-bordered table-hover">
					<thead>
						<tr>
							<th>${__("Employee")}</th>
							<th>${__("Section")}</th>
							<th>${__("Missing days")}</th>
							<th>${__("Missing dates")}</th>
							<th></th>
						</tr>
					</thead>
					<tbody>${body}</tbody>
				</table>
			</div>
		`);
		dialog.show();
		dialog.$wrapper.find(".missing-filter-emp").on("click", (e) => {
			e.preventDefault();
			const user = decodeURIComponent($(e.currentTarget).attr("data-user") || "");
			dialog.hide();
			if (user) this.set_filter_and_reload("employee", user);
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
