/**
 * Attendance & Leave Dashboard — `/app/hr-dashboard`
 * Data: Employee Attendance (monthly summaries) + Leave Application.
 */
frappe.pages["hr-dashboard"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: "Attendance & Leave Dashboard",
		single_column: true,
	});

	if (!window.TIFAttendanceLeaveDashboard) {
		window.TIFAttendanceLeaveDashboard = class TIFAttendanceLeaveDashboard {
			constructor(page) {
				this.page = page;
				this.apex_loaded = false;
				this.charts = {};
				this.filters = {
					company: frappe.defaults.get_user_default("Company") || "",
					branch: "",
					department: "",
					employee: "",
					from_date: frappe.datetime.add_months(frappe.datetime.get_today(), -5),
					to_date: frappe.datetime.get_today(),
				};
			}

			async make() {
				this.render();
				this.inject_styles();
				this.make_filters();
				await this.load_apexcharts();
				await this.refresh();
			}

			render() {
				this.page.main.html(`
					<div class="tif-attdash">
						<p class="text-muted" style="font-size:12px;margin:0 0 10px">
							KPIs and charts use <strong>Employee Attendance</strong> (monthly records). Months overlapping the date range are included.
							Leave widgets use <strong>Leave Application</strong> by leave start date.
						</p>
						<div class="tif-attdash__cards">
							<div class="tif-card" data-card="attendance_records">
								<div class="tif-card__label">Attendance Records</div>
								<div class="tif-card__value">—</div>
								<div class="tif-card__hint">EA docs in range</div>
							</div>
							<div class="tif-card" data-card="employees_covered">
								<div class="tif-card__label">Employees</div>
								<div class="tif-card__value">—</div>
								<div class="tif-card__hint">Distinct staff</div>
							</div>
							<div class="tif-card" data-card="total_present_days">
								<div class="tif-card__label">Σ Present Days</div>
								<div class="tif-card__value">—</div>
								<div class="tif-card__hint">Summed across records</div>
							</div>
							<div class="tif-card" data-card="total_absents">
								<div class="tif-card__label">Σ Absents</div>
								<div class="tif-card__value">—</div>
								<div class="tif-card__hint">Employee Attendance</div>
							</div>
							<div class="tif-card" data-card="total_lates">
								<div class="tif-card__label">Σ Lates</div>
								<div class="tif-card__value">—</div>
								<div class="tif-card__hint">Employee Attendance</div>
							</div>
							<div class="tif-card" data-card="total_half_days">
								<div class="tif-card__label">Σ Half Days</div>
								<div class="tif-card__value">—</div>
								<div class="tif-card__hint">Employee Attendance</div>
							</div>
							<div class="tif-card" data-card="approved_leave_days">
								<div class="tif-card__label">Approved Leave Days</div>
								<div class="tif-card__value">—</div>
								<div class="tif-card__hint">Leave Application</div>
							</div>
							<div class="tif-card" data-card="pending_leave_applications">
								<div class="tif-card__label">Open Leave Apps</div>
								<div class="tif-card__value">—</div>
								<div class="tif-card__hint">Submitted, awaiting</div>
							</div>
						</div>

						<div class="tif-attdash__grid">
							<div class="tif-panel tif-panel--span2">
								<div class="tif-panel__title">Monthly attendance metrics (Employee Attendance)</div>
								<div id="tif-attdash-monthly"></div>
							</div>
							<div class="tif-panel">
								<div class="tif-panel__title">Totals distribution</div>
								<div id="tif-attdash-dist"></div>
							</div>
							<div class="tif-panel">
								<div class="tif-panel__title">Leave applications by status</div>
								<div id="tif-attdash-leave-status"></div>
							</div>
							<div class="tif-panel tif-panel--span2">
								<div class="tif-panel__title">Department — absents vs lates (Σ)</div>
								<div id="tif-attdash-dept"></div>
							</div>
							<div class="tif-panel">
								<div class="tif-panel__title">Present days by branch (unit)</div>
								<div id="tif-attdash-branch"></div>
							</div>
							<div class="tif-panel">
								<div class="tif-panel__title">Approved leave trend</div>
								<div id="tif-attdash-leave-trend"></div>
							</div>
							<div class="tif-panel">
								<div class="tif-panel__title">Leave days by type</div>
								<div id="tif-attdash-leave-type"></div>
							</div>
							<div class="tif-panel tif-panel--span2">
								<div class="tif-panel__title">Top employees by total lates (Σ)</div>
								<div id="tif-attdash-top-lates"></div>
							</div>
							<div class="tif-panel tif-panel--span2">
								<div class="tif-panel__title">Top employees by total absents (Σ)</div>
								<div id="tif-attdash-top-abs"></div>
							</div>
							<div class="tif-panel">
								<div class="tif-panel__title">Highest lates — detail</div>
								<div id="tif-attdash-table-lates"></div>
							</div>
							<div class="tif-panel">
								<div class="tif-panel__title">Highest absents — detail</div>
								<div id="tif-attdash-table-abs"></div>
							</div>
						</div>
					</div>
				`);
			}

			inject_styles() {
				if (document.getElementById("tif-attdash-style")) return;
				const style = document.createElement("style");
				style.id = "tif-attdash-style";
				style.textContent = `
					.tif-attdash__cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:12px;margin:8px 0 14px}
					.tif-card{border:1px solid var(--border-color);border-radius:10px;background:var(--card-bg);padding:12px;min-width:140px}
					.tif-card__label{font-size:12px;color:var(--text-muted);margin-bottom:4px}
					.tif-card__value{font-size:20px;font-weight:700;line-height:1.2}
					.tif-card__hint{font-size:11px;color:var(--text-muted);margin-top:6px}
					.tif-attdash__grid{display:grid;grid-template-columns:repeat(2,minmax(300px,1fr));gap:12px}
					.tif-panel{border:1px solid var(--border-color);border-radius:10px;background:var(--card-bg);padding:12px}
					.tif-panel__title{font-size:13px;font-weight:600;margin-bottom:8px}
					.tif-panel--span2{grid-column:1 / -1}
					.tif-attdash .apexcharts-canvas{margin:0 auto}
					@media (min-width: 1400px){
						.tif-attdash__grid{grid-template-columns:repeat(3,minmax(300px,1fr))}
						.tif-panel--span2{grid-column:1 / -1}
					}
				`;
				document.head.appendChild(style);
			}

			make_filters() {
				this.page.clear_primary_action();
				this.page.set_primary_action("Refresh", () => this.refresh(), "refresh");
				this.page.add_inner_button("Last 6 months", () => this.set_range_months(6));
				this.page.add_inner_button("Last 12 months", () => this.set_range_months(12));
				this.page.add_inner_button("Year to date", () => this.set_range_year());
				this.page.add_inner_button("Clear dept / employee", () => {
					this.page.fields_dict.department?.set_value("");
					this.page.fields_dict.employee?.set_value("");
					this.on_filter_change();
				});

				this.page.add_field({
					fieldname: "company",
					label: "Company",
					fieldtype: "Link",
					options: "Company",
					default: this.filters.company,
					change: () => this.on_filter_change(),
				});
				this.page.add_field({
					fieldname: "branch",
					label: "Branch",
					fieldtype: "Link",
					options: "Branch",
					change: () => this.on_filter_change(),
				});
				this.page.add_field({
					fieldname: "department",
					label: "Department",
					fieldtype: "Link",
					options: "Department",
					change: () => this.on_filter_change(),
				});
				this.page.add_field({
					fieldname: "employee",
					label: "Employee",
					fieldtype: "Link",
					options: "Employee",
					get_query: () => {
						const company = this.page.fields_dict.company?.get_value?.();
						const filters = { status: "Active" };
						if (company) {
							filters.company = company;
						}
						return { filters };
					},
					change: () => this.on_filter_change(),
				});
				this.page.add_field({
					fieldname: "from_date",
					label: "From",
					fieldtype: "Date",
					default: this.filters.from_date,
					change: () => this.on_filter_change(),
				});
				this.page.add_field({
					fieldname: "to_date",
					label: "To",
					fieldtype: "Date",
					default: this.filters.to_date,
					change: () => this.on_filter_change(),
				});
			}

			set_range_months(n) {
				const to = frappe.datetime.get_today();
				const from = frappe.datetime.add_months(to, -Math.abs(n));
				this.page.fields_dict.from_date.set_value(from);
				this.page.fields_dict.to_date.set_value(to);
				this.on_filter_change();
			}

			set_range_year() {
				const to = frappe.datetime.get_today();
				const yearStart = frappe.datetime.year_start(to);
				this.page.fields_dict.from_date.set_value(yearStart);
				this.page.fields_dict.to_date.set_value(to);
				this.on_filter_change();
			}

			on_filter_change() {
				this.filters.company = this.page.fields_dict.company?.get_value() || "";
				this.filters.branch = this.page.fields_dict.branch?.get_value() || "";
				this.filters.department = this.page.fields_dict.department?.get_value() || "";
				this.filters.employee = this.page.fields_dict.employee?.get_value() || "";
				this.filters.from_date = this.page.fields_dict.from_date?.get_value() || "";
				this.filters.to_date = this.page.fields_dict.to_date?.get_value() || "";
				this.refresh();
			}

			/** frappe.format often returns HTML divs; strip for table/KPI text */
			_plain_formatted(val, fieldtype) {
				const raw = frappe.format(val ?? 0, { fieldtype: fieldtype || "Float" });
				let s = String(raw ?? "");
				if (frappe.utils?.strip_html) {
					s = frappe.utils.strip_html(s);
				}
				s = s.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
				return s || "—";
			}

			load_apexcharts() {
				if (this.apex_loaded || window.ApexCharts) {
					this.apex_loaded = true;
					return Promise.resolve();
				}
				return new Promise((resolve, reject) => {
					const existing = document.querySelector('script[data-tif-apexcharts="1"]');
					if (existing) {
						existing.addEventListener("load", () => resolve());
						existing.addEventListener("error", () => reject());
						return;
					}
					const script = document.createElement("script");
					script.dataset.tifApexcharts = "1";
					script.src = "https://cdn.jsdelivr.net/npm/apexcharts@3.49.1";
					script.onload = () => {
						this.apex_loaded = true;
						resolve();
					};
					script.onerror = () => reject(new Error("Failed to load ApexCharts"));
					document.head.appendChild(script);
				});
			}

			set_card(key, value, isFloat = false) {
				const el = this.page.main.find(`.tif-card[data-card="${key}"] .tif-card__value`)[0];
				if (!el) return;
				if (value === null || value === undefined || value === "") {
					el.textContent = "—";
					return;
				}
				let formatted;
				if (isFloat) {
					formatted = frappe.format(value, { fieldtype: "Float" });
				} else if (typeof value === "number" && !Number.isInteger(value)) {
					formatted = frappe.format(value, { fieldtype: "Float" });
				} else {
					formatted = frappe.format(value, { fieldtype: "Int" });
				}
				const s = String(formatted ?? value);
				el.textContent = frappe.utils?.strip_html ? frappe.utils.strip_html(s) : s.replace(/<[^>]*>/g, "");
			}

			ensure_chart(key, selector, options) {
				if (!window.ApexCharts) return null;
				if (this.charts[key]) return this.charts[key];
				const container = this.page.main.find(selector)[0];
				if (!container) return null;
				const chart = new ApexCharts(container, options);
				chart.render();
				this.charts[key] = chart;
				return chart;
			}

			async refresh() {
				if (!window.ApexCharts) {
					try {
						await this.load_apexcharts();
					} catch (e) {
						frappe.msgprint("ApexCharts could not be loaded.");
						return;
					}
				}
				const filters = { ...this.filters };
				this.page.set_indicator("Loading…", "blue");
				const r = await frappe.call({
					method: "tif_customization.tif_customization.page.hr_dashboard.hr_dashboard.get_dashboard_data",
					args: { filters },
				});
				if (this.page.clear_indicator) this.page.clear_indicator();
				const data = r?.message || {};
				this.render_kpis(data);
				this.render_charts(data);
			}

			render_kpis(data) {
				this.set_card("attendance_records", data.attendance_records);
				this.set_card("employees_covered", data.employees_covered);
				this.set_card("total_present_days", data.total_present_days, true);
				this.set_card("total_absents", data.total_absents, true);
				this.set_card("total_lates", data.total_lates, true);
				this.set_card("total_half_days", data.total_half_days, true);
				this.set_card("approved_leave_days", data.approved_leave_days, true);
				this.set_card("pending_leave_applications", data.pending_leave_applications);
			}

			render_charts(data) {
				const theme = {
					mode: frappe.boot?.sysdefaults?.theme || "light",
					palette: "palette4",
				};

				{
					const d = data.monthly_attendance_trend || {};
					const chart = this.ensure_chart("monthly", "#tif-attdash-monthly", {
						chart: { type: "area", height: 340, stacked: false, toolbar: { show: true } },
						theme,
						noData: { text: "No Employee Attendance rows in range" },
						stroke: { width: 2, curve: "smooth" },
						xaxis: { categories: d.labels || [] },
						series: d.series || [],
						dataLabels: { enabled: false },
						legend: { position: "top" },
						yaxis: { labels: { formatter: (v) => (v % 1 === 0 ? String(v) : v.toFixed(1)) } },
					});
					if (chart) {
						chart.updateOptions({ xaxis: { categories: d.labels || [] } }, false, true);
						chart.updateSeries(d.series || [], true);
					}
				}

				{
					const d = data.metrics_distribution || {};
					const chart = this.ensure_chart("dist", "#tif-attdash-dist", {
						chart: { type: "donut", height: 300, toolbar: { show: false } },
						theme,
						noData: { text: "No data" },
						labels: d.labels || [],
						series: d.values || [],
						legend: { position: "bottom" },
						plotOptions: {
							pie: {
								donut: {
									labels: {
										show: true,
										total: {
											show: true,
											label: "Σ metrics",
										},
									},
								},
							},
						},
					});
					if (chart) {
						chart.updateOptions({ labels: d.labels || [] }, false, true);
						chart.updateSeries(d.values || [], true);
					}
				}

				{
					const d = data.leave_status_breakdown || {};
					const chart = this.ensure_chart("leave_stat", "#tif-attdash-leave-status", {
						chart: { type: "donut", height: 300, toolbar: { show: false } },
						theme,
						noData: { text: "No leave applications in range" },
						labels: d.labels || [],
						series: d.values || [],
						legend: { position: "bottom" },
					});
					if (chart) {
						chart.updateOptions({ labels: d.labels || [] }, false, true);
						chart.updateSeries(d.values || [], true);
					}
				}

				{
					const d = data.department_absents_lates || {};
					const labels = d.labels || [];
					const chart = this.ensure_chart("dept", "#tif-attdash-dept", {
						chart: { type: "bar", height: 320, stacked: false, toolbar: { show: false } },
						theme,
						noData: { text: "No department data" },
						plotOptions: { bar: { horizontal: true, borderRadius: 4 } },
						xaxis: { categories: labels },
						series: [
							{ name: "Absents", data: d.absents || [] },
							{ name: "Lates", data: d.lates || [] },
						],
						dataLabels: { enabled: false },
						legend: { position: "top" },
					});
					if (chart) {
						chart.updateOptions({ xaxis: { categories: labels } }, false, true);
						chart.updateSeries(
							[
								{ name: "Absents", data: d.absents || [] },
								{ name: "Lates", data: d.lates || [] },
							],
							true,
						);
					}
				}

				{
					const d = data.branch_breakdown || {};
					const chart = this.ensure_chart("branch", "#tif-attdash-branch", {
						chart: { type: "bar", height: 300, toolbar: { show: false } },
						theme,
						noData: { text: "No branch data" },
						plotOptions: { bar: { borderRadius: 6 } },
						xaxis: { categories: d.labels || [], labels: { rotate: -35 } },
						series: [{ name: "Present days", data: d.values || [] }],
						dataLabels: { enabled: false },
					});
					if (chart) {
						chart.updateOptions({ xaxis: { categories: d.labels || [] } }, false, true);
						chart.updateSeries([{ name: "Present days", data: d.values || [] }], true);
					}
				}

				{
					const d = data.leave_trend || {};
					const chart = this.ensure_chart("leave_tr", "#tif-attdash-leave-trend", {
						chart: { type: "line", height: 300, toolbar: { show: false } },
						theme,
						noData: { text: "No approved leave in range" },
						stroke: { width: 3, curve: "smooth" },
						xaxis: { categories: d.labels || [] },
						series: d.series || [],
						dataLabels: { enabled: false },
					});
					if (chart) {
						chart.updateOptions({ xaxis: { categories: d.labels || [] } }, false, true);
						chart.updateSeries(d.series || [], true);
					}
				}

				{
					const d = data.leaves_by_type || {};
					const chart = this.ensure_chart("leave_type", "#tif-attdash-leave-type", {
						chart: { type: "donut", height: 300, toolbar: { show: false } },
						theme,
						noData: { text: "No data" },
						labels: d.labels || [],
						series: d.values || [],
						legend: { position: "bottom" },
					});
					if (chart) {
						chart.updateOptions({ labels: d.labels || [] }, false, true);
						chart.updateSeries(d.values || [], true);
					}
				}

				{
					const rows = data.top_by_lates || [];
					const labels = rows.map((r) => r.employee_name || "—");
					const values = rows.map((r) => r.value || 0);
					const chart = this.ensure_chart("top_l", "#tif-attdash-top-lates", {
						chart: { type: "bar", height: Math.max(280, rows.length * 28), toolbar: { show: false } },
						theme,
						noData: { text: "No data" },
						plotOptions: { bar: { horizontal: true, borderRadius: 4 } },
						xaxis: { categories: labels },
						series: [{ name: "Total lates", data: values }],
						dataLabels: { enabled: true },
					});
					if (chart) {
						chart.updateOptions({ xaxis: { categories: labels } }, false, true);
						chart.updateSeries([{ name: "Total lates", data: values }], true);
					}
				}

				{
					const rows = data.top_by_absents || [];
					const labels = rows.map((r) => r.employee_name || "—");
					const values = rows.map((r) => r.value || 0);
					const chart = this.ensure_chart("top_a", "#tif-attdash-top-abs", {
						chart: { type: "bar", height: Math.max(280, rows.length * 28), toolbar: { show: false } },
						theme,
						noData: { text: "No data" },
						plotOptions: { bar: { horizontal: true, borderRadius: 4 } },
						xaxis: { categories: labels },
						series: [{ name: "Total absents", data: values }],
						dataLabels: { enabled: true },
					});
					if (chart) {
						chart.updateOptions({ xaxis: { categories: labels } }, false, true);
						chart.updateSeries([{ name: "Total absents", data: values }], true);
					}
				}

				this.render_table("#tif-attdash-table-lates", data.top_by_lates || [], [
					{ key: "employee_name", label: "Employee" },
					{ key: "department", label: "Department" },
					{ key: "value", label: "Σ Lates", format: "Float" },
				]);
				this.render_table("#tif-attdash-table-abs", data.top_by_absents || [], [
					{ key: "employee_name", label: "Employee" },
					{ key: "department", label: "Department" },
					{ key: "value", label: "Σ Absents", format: "Float" },
				]);
			}

			render_table(selector, rows, columns) {
				const container = this.page.main.find(selector)[0];
				if (!container) return;
				if (!rows || !rows.length) {
					container.innerHTML = `<div class="text-muted" style="padding:6px 2px">No data</div>`;
					return;
				}
				const safe = (v) =>
					frappe.utils?.escape_html ? frappe.utils.escape_html(String(v ?? "")) : String(v ?? "");
				const th = columns
					.map(
						(c) =>
							`<th style="font-size:12px;color:var(--text-muted);font-weight:600;padding:6px 8px;border-bottom:1px solid var(--border-color)">${safe(c.label)}</th>`,
					)
					.join("");
				const td = (row) =>
					columns
						.map((c) => {
							let inner;
							let align = "left";
							if (c.format === "Float") {
								inner = this._plain_formatted(row?.[c.key], "Float");
								align = "right";
							} else {
								inner = safe(row?.[c.key] || "—");
							}
							return `<td style="padding:6px 8px;border-bottom:1px solid var(--border-color);text-align:${align}">${inner}</td>`;
						})
						.join("");
				const body = rows.slice(0, 15).map((r) => `<tr>${td(r)}</tr>`).join("");
				container.innerHTML = `
					<div style="overflow:auto;max-height:320px">
						<table class="table table-bordered" style="margin:0;border:0;font-size:12px">
							<thead><tr>${th}</tr></thead>
							<tbody>${body}</tbody>
						</table>
					</div>
				`;
			}
		};
	}

	const view = new window.TIFAttendanceLeaveDashboard(page);
	view.make();
};
