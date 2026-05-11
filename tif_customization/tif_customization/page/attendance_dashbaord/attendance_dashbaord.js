/**
 * Attendance Dashboard — `/app/attendance-dashbaord`
 * Attendance (Employee Attendance) + Leave (Leave Application).
 */

const TIF_ATT_PALETTE = {
	donut: ["#4f46e5", "#ea580c", "#059669", "#e11d48", "#7c3aed", "#0891b2", "#ca8a04", "#db2777", "#65a30d"],
	present: ["#1d4ed8"],
	incidents: ["#ea580c", "#059669", "#dc2626"],
	punctualityBuckets: ["#059669", "#ca8a04", "#f97316", "#be123c"],
	incidentMix: ["#dc2626", "#ea580c", "#059669", "#7c3aed"],
	deptPair: ["#6366f1", "#f97316"],
};

frappe.pages["attendance-dashbaord"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: "Attendance — Dashboard",
		single_column: true,
	});

	class TIFAttendanceDashboard {
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
						<strong>Attendance</strong> uses <strong>Employee Attendance</strong> (monthly rows).
						<strong>Leave</strong> uses <strong>Leave Application</strong>.
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
							<div class="tif-panel__title">Monthly attendance (Employee Attendance)</div>
							<p class="tif-panel__hint">Present days and incidents use separate charts so small values stay readable.</p>
							<div class="tif-attdash__split-charts">
								<div class="tif-attdash__split-cell">
									<div class="tif-chart-subtitle">Present days</div>
									<div id="tif-attdash-monthly-present"></div>
								</div>
								<div class="tif-attdash__split-cell">
									<div class="tif-chart-subtitle">Absents, lates &amp; half days</div>
									<div id="tif-attdash-monthly-incidents"></div>
								</div>
							</div>
						</div>

						<div class="tif-panel tif-panel--span2">
							<div class="tif-panel__title">Punctuality</div>
							<p class="tif-panel__hint">Staff grouped by Σ lates on their attendance rows in range. Incident mix shows the share of each incident type (totals).</p>
							<div class="tif-attdash__split-charts">
								<div class="tif-attdash__split-cell">
									<div class="tif-chart-subtitle">Employees by Σ lates</div>
									<div id="tif-attdash-punct-buckets"></div>
								</div>
								<div class="tif-attdash__split-cell">
									<div class="tif-chart-subtitle">Incident mix (Σ)</div>
									<div id="tif-attdash-punct-mix"></div>
								</div>
							</div>
						</div>

						<div class="tif-panel">
							<div class="tif-panel__title">Leave applications by status</div>
							<div id="tif-attdash-leave-status"></div>
						</div>

						<div class="tif-panel">
							<div class="tif-panel__title">Top late comers — detail</div>
							<div id="tif-attdash-table-lates"></div>
						</div>

						<div class="tif-panel">
							<div class="tif-panel__title">Highest absents — detail</div>
							<div id="tif-attdash-table-abs"></div>
						</div>

						<div class="tif-panel tif-panel--span2">
							<div class="tif-panel__title">Department — absents vs lates (Σ)</div>
							<div id="tif-attdash-dept"></div>
						</div>

						<div class="tif-panel">
							<div class="tif-panel__title">Present days by branch (unit)</div>
							<div id="tif-attdash-branch"></div>
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
				.tif-attdash__cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
				@media (max-width: 1200px){.tif-attdash__cards{grid-template-columns:repeat(2,minmax(0,1fr));}}
				@media (max-width: 700px){.tif-attdash__cards{grid-template-columns:1fr;}}
				.tif-card{border:1px solid var(--border-color,#e5e7eb);border-radius:10px;background:var(--card-bg,#fff);padding:12px}
				.tif-card__label{font-size:12px;color:var(--text-muted,#64748b);font-weight:700}
				.tif-card__value{font-size:20px;margin-top:6px;font-weight:800}
				.tif-card__hint{font-size:11px;color:var(--text-muted,#64748b);margin-top:4px}
				.tif-attdash__grid{margin-top:14px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
				@media (max-width: 1200px){.tif-attdash__grid{grid-template-columns:1fr;}}
				.tif-panel{border:1px solid var(--border-color,#e5e7eb);border-radius:12px;background:var(--card-bg,#fff);padding:12px}
				.tif-panel--span2{grid-column:span 2}
				@media (max-width: 1200px){.tif-panel--span2{grid-column:auto}}
				.tif-panel__title{font-size:13px;font-weight:800;margin-bottom:6px}
				.tif-panel__hint{font-size:11px;color:var(--text-muted,#64748b);margin:-2px 0 10px}
				.tif-attdash__split-charts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
				@media (max-width: 900px){.tif-attdash__split-charts{grid-template-columns:1fr;}}
				.tif-chart-subtitle{font-size:12px;font-weight:800;margin:0 0 6px;color:var(--text-muted,#64748b)}
			`;
			document.head.appendChild(style);
		}

		make_filters() {
			this.page.add_field({
				label: "Company",
				fieldtype: "Link",
				fieldname: "company",
				options: "Company",
				default: this.filters.company,
				change: () => {
					this.filters.company = this.page.fields_dict.company.get_value() || "";
					this.refresh();
				},
			});
			this.page.add_field({
				label: "Branch",
				fieldtype: "Link",
				fieldname: "branch",
				options: "Branch",
				default: this.filters.branch,
				change: () => {
					this.filters.branch = this.page.fields_dict.branch.get_value() || "";
					this.refresh();
				},
			});
			this.page.add_field({
				label: "Department",
				fieldtype: "Link",
				fieldname: "department",
				options: "Department",
				default: this.filters.department,
				change: () => {
					this.filters.department = this.page.fields_dict.department.get_value() || "";
					this.refresh();
				},
			});
			this.page.add_field({
				label: "Employee",
				fieldtype: "Link",
				fieldname: "employee",
				options: "Employee",
				default: this.filters.employee,
				change: () => {
					this.filters.employee = this.page.fields_dict.employee.get_value() || "";
					this.refresh();
				},
			});
			this.page.add_field({
				label: "From",
				fieldtype: "Date",
				fieldname: "from_date",
				default: this.filters.from_date,
				change: () => {
					this.filters.from_date = this.page.fields_dict.from_date.get_value() || this.filters.from_date;
					this.refresh();
				},
			});
			this.page.add_field({
				label: "To",
				fieldtype: "Date",
				fieldname: "to_date",
				default: this.filters.to_date,
				change: () => {
					this.filters.to_date = this.page.fields_dict.to_date.get_value() || this.filters.to_date;
					this.refresh();
				},
			});
		}

		_apexMode() {
			return frappe.get_cookie("theme") === "dark" ? "dark" : "light";
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

		set_card(key, value, fmt = false) {
			const el = this.page.main.find(`.tif-card[data-card="${key}"] .tif-card__value`)[0];
			if (!el) return;
			if (value === null || value === undefined || value === "") {
				el.textContent = "—";
				return;
			}
			let formatted;
			if (fmt === "currency") formatted = frappe.format(value, { fieldtype: "Currency" });
			else if (fmt === true) formatted = frappe.format(value, { fieldtype: "Float" });
			else if (typeof value === "number" && !Number.isInteger(value)) formatted = frappe.format(value, { fieldtype: "Float" });
			else formatted = frappe.format(value, { fieldtype: "Int" });
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
						`<th style="font-size:12px;color:var(--text-muted);font-weight:700;padding:6px 8px;border-bottom:1px solid var(--border-color,#e5e7eb)">${safe(
							c.label
						)}</th>`
				)
				.join("");
			const td = (row) =>
				columns
					.map((c) => {
						let inner = row?.[c.key];
						let align = "left";
						if (c.format === "Float") {
							inner = frappe.format(inner || 0, { fieldtype: "Float" });
							align = "right";
						} else if (c.format === "Date") {
							inner = inner ? frappe.format(inner, { fieldtype: "Date" }) : "—";
							align = "right";
						} else {
							inner = inner ?? "—";
						}
						const s = frappe.utils?.strip_html ? frappe.utils.strip_html(String(inner)) : String(inner).replace(/<[^>]*>/g, "");
						return `<td style="padding:6px 8px;border-bottom:1px solid var(--border-color,#e5e7eb);text-align:${align}">${safe(
							s
						)}</td>`;
					})
					.join("");
			container.innerHTML = `
				<div style="overflow:auto">
					<table style="width:100%;border-collapse:collapse">
						<thead><tr>${th}</tr></thead>
						<tbody>
							${rows.map((r) => `<tr>${td(r)}</tr>`).join("")}
						</tbody>
					</table>
				</div>
			`;
		}

		async refresh() {
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
			const mode = this._apexMode();
			const donutOpts = {
				chart: { type: "donut", height: 300, toolbar: { show: false } },
				theme: { mode },
				colors: TIF_ATT_PALETTE.donut,
				stroke: { width: 2, colors: ["var(--card-bg, #fff)"] },
				tooltip: { theme: mode, style: { fontSize: "12px" } },
				plotOptions: {
					pie: { donut: { size: "62%", labels: { show: true, name: { fontSize: "12px" }, value: { fontSize: "13px", fontWeight: 600 } } } },
				},
			};

			// Monthly trend split into: present line + incidents line
			{
				const d = data.monthly_attendance_trend || {};
				const labels = d.labels || [];
				const series = d.series || [];
				const presentSeries = (series || []).filter((s) => s?.name === "Present Days");
				const incidentSeries = (series || []).filter((s) => s?.name !== "Present Days");

				const c1 = this.ensure_chart("monthly_present", "#tif-attdash-monthly-present", {
					chart: { type: "line", height: 260, toolbar: { show: false }, zoom: { enabled: false } },
					theme: { mode },
					colors: TIF_ATT_PALETTE.present,
					grid: { borderColor: "#e2e8f0", strokeDashArray: 4 },
					tooltip: { theme: mode, shared: true, intersect: false },
					noData: { text: "No attendance data" },
					stroke: { width: 3, curve: "smooth" },
					markers: { size: 3, strokeWidth: 2 },
					xaxis: { categories: labels },
					series: presentSeries,
				});
				if (c1) {
					c1.updateOptions({ xaxis: { categories: labels } }, false, true);
					c1.updateSeries(presentSeries, true);
				}

				const c2 = this.ensure_chart("monthly_incidents", "#tif-attdash-monthly-incidents", {
					chart: { type: "line", height: 260, toolbar: { show: false }, zoom: { enabled: false } },
					theme: { mode },
					colors: TIF_ATT_PALETTE.incidents,
					grid: { borderColor: "#e2e8f0", strokeDashArray: 4 },
					tooltip: { theme: mode, shared: true, intersect: false },
					noData: { text: "No incidents data" },
					stroke: { width: 3, curve: "smooth" },
					markers: { size: 3, strokeWidth: 2 },
					xaxis: { categories: labels },
					series: incidentSeries,
				});
				if (c2) {
					c2.updateOptions({ xaxis: { categories: labels } }, false, true);
					c2.updateSeries(incidentSeries, true);
				}
			}

			// Punctuality buckets + incident mix
			{
				const d = data.punctuality_late_buckets || {};
				const chart = this.ensure_chart("punct_buckets", "#tif-attdash-punct-buckets", {
					...donutOpts,
					colors: TIF_ATT_PALETTE.punctualityBuckets,
					noData: { text: "No punctuality data" },
					labels: d.labels || [],
					series: d.values || [],
					legend: { position: "bottom", fontWeight: 500 },
				});
				if (chart) {
					chart.updateOptions({ labels: d.labels || [] }, false, true);
					chart.updateSeries(d.values || [], true);
				}
			}
			{
				const d = data.punctuality_incident_mix || {};
				const chart = this.ensure_chart("punct_mix", "#tif-attdash-punct-mix", {
					...donutOpts,
					colors: TIF_ATT_PALETTE.incidentMix,
					noData: { text: "No incidents" },
					labels: d.labels || [],
					series: d.values || [],
					legend: { position: "bottom", fontWeight: 500 },
				});
				if (chart) {
					chart.updateOptions({ labels: d.labels || [] }, false, true);
					chart.updateSeries(d.values || [], true);
				}
			}

			// Leave status donut
			{
				const d = data.leave_status_breakdown || {};
				const chart = this.ensure_chart("leave_status", "#tif-attdash-leave-status", {
					...donutOpts,
					noData: { text: "No leave applications" },
					labels: d.labels || [],
					series: d.values || [],
					legend: { position: "bottom", fontWeight: 500 },
				});
				if (chart) {
					chart.updateOptions({ labels: d.labels || [] }, false, true);
					chart.updateSeries(d.values || [], true);
				}
			}

			// Detail tables
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

			// Department absents vs lates
			{
				const d = data.department_absents_lates || {};
				const chart = this.ensure_chart("dept_pair", "#tif-attdash-dept", {
					chart: { type: "bar", height: 320, toolbar: { show: false } },
					theme: { mode },
					colors: TIF_ATT_PALETTE.deptPair,
					grid: { borderColor: "#e2e8f0", strokeDashArray: 4 },
					tooltip: { theme: mode, shared: true, intersect: false },
					noData: { text: "No incidents by department" },
					plotOptions: { bar: { horizontal: true, barHeight: "65%" } },
					xaxis: { categories: d.labels || [] },
					series: [
						{ name: "Absents", data: d.absents || [] },
						{ name: "Lates", data: d.lates || [] },
					],
					legend: { position: "top", fontWeight: 500 },
				});
				if (chart) {
					chart.updateOptions({ xaxis: { categories: d.labels || [] } }, false, true);
					chart.updateSeries(
						[
							{ name: "Absents", data: d.absents || [] },
							{ name: "Lates", data: d.lates || [] },
						],
						true
					);
				}
			}

			// Branch present days donut
			{
				const d = data.branch_breakdown || {};
				const chart = this.ensure_chart("branch_breakdown", "#tif-attdash-branch", {
					...donutOpts,
					noData: { text: "No branch data" },
					labels: d.labels || [],
					series: d.values || [],
					legend: { position: "bottom", fontWeight: 500 },
				});
				if (chart) {
					chart.updateOptions({ labels: d.labels || [] }, false, true);
					chart.updateSeries(d.values || [], true);
				}
			}
		}
	}

	new TIFAttendanceDashboard(page).make();
};
