frappe.pages["late-coming-report"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Late Coming Report"),
		single_column: true,
	});

	new window.LateComingReport(page).make();
};

if (typeof window.LateComingReport === "undefined") {
	window.LateComingReport = class LateComingReport {
		constructor(page) {
			this.page = page;
			this.filters = {
				from_date: frappe.datetime.add_months(frappe.datetime.get_today(), -12),
				to_date: frappe.datetime.get_today(),
				company: "",
				department: "",
				branch: "",
				employee: "",
			};
			this.data = { rows: [], summary: {} };
		}

		make() {
			this.render_layout();
			this.setup_link_fields();
			this.load_filter_options();
			this.bind_events();
			this.load_data();
		}

		render_layout() {
			this.page.main.html(`
				<div class="lcr-container" style="padding:16px;">
					<div class="filter-section" style="background:#f8f9fa;padding:16px;border-radius:8px;margin-bottom:16px;">
						<div class="row">
							<div class="col-md-2"><div id="lcr-from-date"></div></div>
							<div class="col-md-2"><div id="lcr-to-date"></div></div>
							<div class="col-md-2"><div id="lcr-company"></div></div>
							<div class="col-md-2"><div id="lcr-department"></div></div>
							<div class="col-md-2"><div id="lcr-branch"></div></div>
							<div class="col-md-2"><div id="lcr-employee"></div></div>
						</div>
						<div class="row" style="margin-top:10px;">
							<div class="col-md-12">
								<button class="btn btn-primary btn-sm" id="lcr-apply"><i class="fa fa-filter"></i> ${__("Apply")}</button>
								<button class="btn btn-default btn-sm" id="lcr-reset">${__("Reset")}</button>
								<button class="btn btn-success btn-sm pull-right" id="lcr-export"><i class="fa fa-file-excel-o"></i> ${__("Export")}</button>
							</div>
						</div>
					</div>

					<div class="row" id="lcr-kpis" style="margin-bottom:16px;"></div>

					<div class="table-responsive">
						<table class="table table-bordered table-hover" id="lcr-table">
							<thead>
								<tr>
									<th style="width:28px;"></th>
									<th>${__("Employee ID")}</th>
									<th>${__("Employee Name")}</th>
									<th>${__("Department")}</th>
									<th>${__("Designation")}</th>
									<th class="text-right">${__("Total Late Count")}</th>
								</tr>
							</thead>
							<tbody id="lcr-tbody">
								<tr><td colspan="6" class="text-center text-muted">${__("Loading...")}</td></tr>
							</tbody>
						</table>
					</div>
				</div>
			`);

			this.from_date_control = frappe.ui.form.make_control({
				parent: this.page.main.find("#lcr-from-date"),
				df: { fieldtype: "Date", label: __("From Date"), fieldname: "from_date" },
				render_input: true,
			});
			this.to_date_control = frappe.ui.form.make_control({
				parent: this.page.main.find("#lcr-to-date"),
				df: { fieldtype: "Date", label: __("To Date"), fieldname: "to_date" },
				render_input: true,
			});
			this.from_date_control.set_value(this.filters.from_date);
			this.to_date_control.set_value(this.filters.to_date);
		}

		setup_link_fields() {
			const link = (parent, options, label, fieldname) =>
				frappe.ui.form.make_control({
					parent: this.page.main.find(parent),
					df: { fieldtype: "Link", options, label, fieldname },
					render_input: true,
				});

			this.company_control = link("#lcr-company", "Company", __("Company"), "company");
			this.department_control = link("#lcr-department", "Department", __("Department"), "department");
			this.branch_control = link("#lcr-branch", "Branch", __("Branch"), "branch");
			this.employee_control = link("#lcr-employee", "Employee", __("Employee"), "employee");
		}

		load_filter_options() {
			frappe.call({
				method: "tif_customization.tif_customization.page.late_coming_report.late_coming_report.get_filter_options",
				callback: () => {},
			});
		}

		bind_events() {
			this.page.main.find("#lcr-apply").on("click", () => this.apply_filters());
			this.page.main.find("#lcr-reset").on("click", () => this.reset_filters());
			this.page.main.find("#lcr-export").on("click", () => this.export_csv());
			this.page.main.on("click", ".lcr-toggle", (e) => {
				const emp = $(e.currentTarget).data("employee");
				const safeId = this.safe_id(emp);
				this.page.main.find(`#lcr-detail-${safeId}`).toggle();
				$(e.currentTarget).find("i").toggleClass("fa-chevron-right fa-chevron-down");
			});
			this.page.main.on("click", ".lcr-month-toggle", (e) => {
				e.stopPropagation();
				const target = $(e.currentTarget).data("target");
				this.page.main.find(`#${target}`).toggle();
				$(e.currentTarget).find("i").toggleClass("fa-chevron-right fa-chevron-down");
			});
		}

		safe_id(value) {
			return frappe.utils.escape_html(String(value)).replace(/[^a-zA-Z0-9_-]/g, "_");
		}

		apply_filters() {
			this.filters.from_date = this.from_date_control.get_value();
			this.filters.to_date = this.to_date_control.get_value();
			this.filters.company = this.company_control.get_value() || "";
			this.filters.department = this.department_control.get_value() || "";
			this.filters.branch = this.branch_control.get_value() || "";
			this.filters.employee = this.employee_control.get_value() || "";
			this.load_data();
		}

		reset_filters() {
			this.filters = {
				from_date: frappe.datetime.add_months(frappe.datetime.get_today(), -12),
				to_date: frappe.datetime.get_today(),
				company: "",
				department: "",
				branch: "",
				employee: "",
			};
			this.from_date_control.set_value(this.filters.from_date);
			this.to_date_control.set_value(this.filters.to_date);
			this.company_control.set_value("");
			this.department_control.set_value("");
			this.branch_control.set_value("");
			this.employee_control.set_value("");
			this.load_data();
		}

		load_data() {
			const $tbody = this.page.main.find("#lcr-tbody");
			$tbody.html(`<tr><td colspan="6" class="text-center text-muted">${__("Loading...")}</td></tr>`);

			frappe.call({
				method: "tif_customization.tif_customization.page.late_coming_report.late_coming_report.get_late_coming_report_data",
				args: { filters: this.filters },
				freeze: true,
				freeze_message: __("Loading late coming data..."),
				callback: (r) => {
					if (r.message?.error) {
						frappe.msgprint({ title: __("Error"), message: r.message.error, indicator: "red" });
						return;
					}
					this.data = r.message || { rows: [], summary: {} };
					this.render_kpis();
					this.render_table();
				},
			});
		}

		render_kpis() {
			const s = this.data.summary || {};
			const cards = [
				{ label: __("Employees With Lates"), value: s.total_employees || 0, color: "#0F62FE" },
				{ label: __("Total Late Count"), value: this.fmt_num(s.total_lates), color: "#DA1E28" },
			];

			this.page.main.find("#lcr-kpis").html(
				cards
					.map(
						(c) => `
					<div class="col-md-6 col-sm-6" style="margin-bottom:8px;">
						<div style="background:#fff;border-left:4px solid ${c.color};padding:12px 14px;border-radius:6px;box-shadow:0 1px 3px rgba(0,0,0,.08);">
							<div style="font-size:11px;color:#666;text-transform:uppercase;">${c.label}</div>
							<div style="font-size:20px;font-weight:600;margin-top:4px;">${c.value}</div>
						</div>
					</div>`
					)
					.join("")
			);
		}

		render_table() {
			const rows = this.data.rows || [];
			const $tbody = this.page.main.find("#lcr-tbody");

			if (!rows.length) {
				$tbody.html(`<tr><td colspan="6" class="text-center text-muted">${__("No late records found")}</td></tr>`);
				return;
			}

			$tbody.empty();
			rows.forEach((row) => {
				const emp = row.employee;
				const safeId = this.safe_id(emp);
				const emp_link = `<a href="/app/employee/${encodeURIComponent(emp)}">${frappe.utils.escape_html(emp)}</a>`;

				$tbody.append(`
					<tr>
						<td><button class="btn btn-xs btn-default lcr-toggle" data-employee="${frappe.utils.escape_html(emp)}"><i class="fa fa-chevron-right"></i></button></td>
						<td>${emp_link}</td>
						<td>${frappe.utils.escape_html(row.employee_name || "")}</td>
						<td>${frappe.utils.escape_html(row.department || "")}</td>
						<td>${frappe.utils.escape_html(row.designation || "")}</td>
						<td class="text-right"><strong>${this.fmt_num(row.total_lates)}</strong></td>
					</tr>
					<tr id="lcr-detail-${safeId}" style="display:none;">
						<td colspan="6" style="background:#fafbfc;padding:0;">${this.render_drilldown(row, safeId)}</td>
					</tr>
				`);
			});
		}

		render_drilldown(row, safeId) {
			const months = row.monthly_history || [];
			if (!months.length) {
				return `<div style="padding:12px;" class="text-muted">${__("No details")}</div>`;
			}

			const month_rows = months
				.map((month, idx) => {
					const targetId = `lcr-month-${safeId}-${idx}`;
					return `
					<tr>
						<td style="width:28px;">
							<button type="button" class="btn btn-xs btn-default lcr-month-toggle" data-target="${targetId}">
								<i class="fa fa-chevron-right"></i>
							</button>
						</td>
						<td><strong>${frappe.utils.escape_html(month.month_label || "")}</strong></td>
						<td class="text-right"><strong>${this.fmt_num(month.late_count)}</strong></td>
					</tr>
					<tr id="${targetId}" style="display:none;">
						<td colspan="3" style="padding:0;background:#fff;">${this.render_month_days(month.days || [])}</td>
					</tr>`;
				})
				.join("");

			return `
				<div style="padding:12px 16px;">
					<div style="font-size:12px;font-weight:600;color:#555;margin-bottom:8px;text-transform:uppercase;">
						${__("Month-wise Late History")}
					</div>
					<table class="table table-condensed table-bordered" style="margin:0;background:#fff;">
						<thead>
							<tr style="background:#eef2f6;">
								<th style="width:28px;"></th>
								<th>${__("Month")}</th>
								<th class="text-right">${__("Late Count")}</th>
							</tr>
						</thead>
						<tbody>${month_rows}</tbody>
					</table>
				</div>`;
		}

		render_month_days(days) {
			if (!days.length) {
				return `<div style="padding:10px;" class="text-muted">${__("No details")}</div>`;
			}

			const day_rows = days
				.map((d) => {
					const att_link = d.attendance_id
						? `<a href="/app/employee-attendance/${encodeURIComponent(d.attendance_id)}">${frappe.utils.escape_html(d.attendance_id)}</a>`
						: "";
					return `
					<tr>
						<td>${frappe.datetime.str_to_user(d.date)}</td>
						<td>${frappe.utils.escape_html(d.day || "")}</td>
						<td>${frappe.utils.escape_html(d.check_in || "")}</td>
						<td>${frappe.utils.escape_html(d.late_coming_hours || "")}</td>
						<td>${att_link}</td>
					</tr>`;
				})
				.join("");

			return `
				<table class="table table-condensed" style="margin:0;">
					<thead>
						<tr style="background:#f5f7fa;">
							<th>${__("Date")}</th>
							<th>${__("Day")}</th>
							<th>${__("Check In")}</th>
							<th>${__("Late Coming Hours")}</th>
							<th>${__("Attendance Sheet")}</th>
						</tr>
					</thead>
					<tbody>${day_rows}</tbody>
				</table>`;
		}

		export_csv() {
			const rows = this.data.rows || [];
			if (!rows.length) {
				frappe.msgprint(__("No data to export"));
				return;
			}

			const lines = [
				[
					"Employee",
					"Employee Name",
					"Department",
					"Designation",
					"Month",
					"Month Late Count",
					"Date",
					"Day",
					"Check In",
					"Late Coming Hours",
					"Period Total Late Count",
				].join(","),
			];

			rows.forEach((row) => {
				const months = row.monthly_history || [];
				if (!months.length) {
					lines.push(
						[
							row.employee,
							this.csv_cell(row.employee_name),
							this.csv_cell(row.department),
							this.csv_cell(row.designation),
							"",
							0,
							"",
							"",
							"",
							"",
							row.total_lates,
						].join(",")
					);
					return;
				}

				months.forEach((month) => {
					(month.days || [{}]).forEach((d) => {
						lines.push(
							[
								row.employee,
								this.csv_cell(row.employee_name),
								this.csv_cell(row.department),
								this.csv_cell(row.designation),
								this.csv_cell(month.month_label),
								month.late_count,
								d.date || "",
								this.csv_cell(d.day),
								this.csv_cell(d.check_in),
								this.csv_cell(d.late_coming_hours),
								row.total_lates,
							].join(",")
						);
					});
				});
			});

			const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `late-coming-report-${frappe.datetime.get_today()}.csv`;
			a.click();
			URL.revokeObjectURL(url);
		}

		csv_cell(val) {
			const s = String(val == null ? "" : val).replace(/"/g, '""');
			return `"${s}"`;
		}

		fmt_num(val) {
			return format_number(flt(val), null, 0);
		}
	};
}
