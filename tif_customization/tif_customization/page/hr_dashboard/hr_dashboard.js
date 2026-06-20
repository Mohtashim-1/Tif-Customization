/**
 * HR Dashboard — `/app/hr-dashboard`
 * Workforce (hiring / attrition / headcount distributions).
 */

/** Distinct series colors (avoid single teal / low contrast) */
const TIF_HR_PALETTE = {
	donut: ["#4f46e5", "#ea580c", "#059669", "#e11d48", "#7c3aed", "#0891b2", "#ca8a04", "#db2777", "#65a30d"],
	lines4: ["#2563eb", "#ea580c", "#059669", "#dc2626"],
	present: ["#1d4ed8"],
	incidents: ["#ea580c", "#059669", "#dc2626"],
	hires: ["#2563eb", "#dc2626"],
	deptPair: ["#6366f1", "#f97316"],
	/** Punctuality pie: on-time → severe */
	punctualityBuckets: ["#059669", "#ca8a04", "#f97316", "#be123c"],
	/** Incident mix: absents, lates, half days, early goings */
	incidentMix: ["#dc2626", "#ea580c", "#059669", "#7c3aed"],
};

frappe.pages["hr-dashboard"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: "HR Dashboard",
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
						
						<div class="tif-attdash__cards" style="display:none">
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

						<p class="text-muted" style="font-size:12px;margin:16px 0 8px">
							<strong>Workforce</strong> — hiring &amp; attrition (Employee master)
						</p>
							<div class="tif-attdash__cards">
								<div class="tif-card" data-card="active_headcount">
									<div class="tif-card__label">Active headcount</div>
									<div class="tif-card__value">—</div>
									<div class="tif-card__hint">Current Active</div>
								</div>
								<div class="tif-card" data-card="new_hires">
									<div class="tif-card__label">New hires</div>
									<div class="tif-card__value">—</div>
									<div class="tif-card__hint">Joining in range</div>
								</div>
								<div class="tif-card" data-card="left_employees">
									<div class="tif-card__label">Attrition (exits)</div>
									<div class="tif-card__value">—</div>
									<div class="tif-card__hint">Left in range</div>
								</div>
								<div class="tif-card" data-card="attrition_rate">
									<div class="tif-card__label">Attrition rate</div>
									<div class="tif-card__value">—</div>
									<div class="tif-card__hint">Exits ÷ active × 100</div>
								</div>
								<div class="tif-card" data-card="new_hires_this_year">
									<div class="tif-card__label">New hires (this year)</div>
									<div class="tif-card__value">—</div>
									<div class="tif-card__hint">Jan 1 → today</div>
								</div>
								<div class="tif-card" data-card="left_employees_this_year">
									<div class="tif-card__label">Left employees (this year)</div>
									<div class="tif-card__value">—</div>
									<div class="tif-card__hint">Jan 1 → today</div>
								</div>
								<div class="tif-card" data-card="total_left_employees">
									<div class="tif-card__label">Total left employees</div>
									<div class="tif-card__value">—</div>
									<div class="tif-card__hint">All-time status = Left</div>
								</div>
							</div>

						<p class="text-muted" style="font-size:12px;margin:16px 0 8px">
							<strong>This month</strong> (calendar) · <strong>Pakistan </strong> · <strong>CNIC</strong>
							</p>
							<div class="tif-attdash__cards">
							<div class="tif-card" data-card="new_hires_this_month">
								<div class="tif-card__label">New hires (this month)</div>
								<div class="tif-card__value">—</div>
								<div class="tif-card__hint">Date of joining in current month</div>
							</div>
							<div class="tif-card" data-card="left_employees_this_month">
								<div class="tif-card__label">Left employees (this month)</div>
								<div class="tif-card__value">—</div>
								<div class="tif-card__hint">Relieving / status Left in month</div>
							</div>
								<div class="tif-card" data-card="active_headcount_pakistan">
									<div class="tif-card__label">Pakistan (active)</div>
									<div class="tif-card__value">—</div>
									<div class="tif-card__hint">Nationality / branch name match</div>
								</div>
							
							<div class="tif-card" data-card="probation_employees_count">
								<div class="tif-card__label">Probation (active)</div>
								<div class="tif-card__value">—</div>
								<div class="tif-card__hint">Best-effort (custom fields)</div>
							</div>
								<div class="tif-card" data-card="cnic_expired_count">
									<div class="tif-card__label">CNIC expired</div>
									<div class="tif-card__value">—</div>
									<div class="tif-card__hint">Active; expiry before today</div>
								</div>
									<div class="tif-card" data-card="cnic_upcoming_count">
										<div class="tif-card__label">CNIC expiring soon</div>
										<div class="tif-card__value">—</div>
										<div class="tif-card__hint">Active; next — days</div>
									</div>
								</div>

						<div class="tif-attdash__grid">
							<div class="tif-panel tif-panel--span2">
								<div class="tif-panel__title">Hiring vs attrition (monthly counts)</div>
								<div id="tif-attdash-hire-attr"></div>
							</div>
							<div class="tif-panel">
								<div class="tif-panel__title">Active headcount by employment type</div>
								<div id="tif-attdash-emp-type"></div>
							</div>
							<div class="tif-panel">
								<div class="tif-panel__title">Gender (active employees)</div>
								<div id="tif-dash-wf-gender"></div>
							</div>
							<div class="tif-panel">
								<div class="tif-panel__title">Grade (active)</div>
								<div id="tif-dash-wf-grade"></div>
							</div>
							<div class="tif-panel">
								<div class="tif-panel__title">Branch — Employee master (active)</div>
								<div id="tif-dash-wf-ebranch"></div>
							</div>
							<div class="tif-panel">
								<div class="tif-panel__title">City (active)</div>
								<div id="tif-dash-wf-city"></div>
							</div>
							<div class="tif-panel tif-panel--span2">
								<div class="tif-panel__title">Designation (active count)</div>
								<div id="tif-dash-wf-desig"></div>
							</div>
							<div class="tif-panel tif-panel--span2">
								<div class="tif-panel__title">Department (active count)</div>
								<div id="tif-dash-wf-dept"></div>
							</div>
							<div class="tif-panel tif-panel--span2" style="display:none">
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
							<div class="tif-panel tif-panel--span2" style="display:none">
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
							<div class="tif-panel" style="display:none">
								<div class="tif-panel__title">Totals distribution</div>
								<div id="tif-attdash-dist"></div>
							</div>
							<div class="tif-panel" style="display:none">
								<div class="tif-panel__title">Leave applications by status</div>
								<div id="tif-attdash-leave-status"></div>
							</div>
							<div class="tif-panel tif-panel--span2" style="display:none">
								<div class="tif-panel__title">Department — absents vs lates (Σ)</div>
								<div id="tif-attdash-dept"></div>
							</div>
							<div class="tif-panel" style="display:none">
								<div class="tif-panel__title">Present days by branch (unit)</div>
								<div id="tif-attdash-branch"></div>
							</div>
							<div class="tif-panel" style="display:none">
								<div class="tif-panel__title">Approved leave trend</div>
								<div id="tif-attdash-leave-trend"></div>
							</div>
							<div class="tif-panel" style="display:none">
								<div class="tif-panel__title">Leave days by type</div>
								<div id="tif-attdash-leave-type"></div>
							</div>
							<div class="tif-panel tif-panel--span2" style="display:none">
								<div class="tif-panel__title">Top late comers (Σ lates)</div>
								<div id="tif-attdash-top-lates"></div>
							</div>
							<div class="tif-panel tif-panel--span2" style="display:none">
								<div class="tif-panel__title">Top employees by total absents (Σ)</div>
								<div id="tif-attdash-top-abs"></div>
							</div>
							<div class="tif-panel tif-panel--span2">
								<div class="tif-panel__title">CNIC expired — detail</div>
								<p class="tif-panel__hint">Active employees with CNIC Expiry before today (if field exists).</p>
								<div id="tif-attdash-cnic-expired"></div>
							</div>
							<div class="tif-panel tif-panel--span2">
								<div class="tif-panel__title">CNIC expiring soon — detail</div>
								<p class="tif-panel__hint">Active employees whose CNIC expiry is within the configured upcoming days.</p>
								<div id="tif-attdash-cnic-upcoming"></div>
							</div>
							<div class="tif-panel tif-panel--span2">
								<div class="tif-panel__title">City × Branch (active) — top</div>
								<p class="tif-panel__hint">Best-effort city (Employee city/current_city/residence_city or Current Address → city).</p>
								<div id="tif-attdash-city-branch"></div>
							</div>
							<div class="tif-panel tif-panel--span2">
								<div class="tif-panel__title">Probation employees — detail</div>
								<p class="tif-panel__hint">Uses probation_end_date / is_on_probation / employment_type contains “probation” (first match).</p>
								<div id="tif-attdash-probation"></div>
							</div>
							<div class="tif-panel" style="display:none">
								<div class="tif-panel__title">Top late comers — detail</div>
								<div id="tif-attdash-table-lates"></div>
							</div>
							<div class="tif-panel" style="display:none">
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
					.tif-panel{border:1px solid var(--border-color);border-radius:10px;background:var(--card-bg);padding:12px;box-shadow:0 1px 2px rgba(15,23,42,.06)}
					.tif-panel__title{font-size:13px;font-weight:600;margin-bottom:8px}
					.tif-panel--span2{grid-column:1 / -1}
					.tif-attdash .apexcharts-canvas{margin:0 auto}
					.tif-panel__hint{font-size:11px;color:var(--text-muted);margin:0 0 10px;line-height:1.4}
					.tif-attdash__split-charts{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start}
					@media (max-width:960px){.tif-attdash__split-charts{grid-template-columns:1fr}}
					.tif-chart-subtitle{font-size:12px;font-weight:600;margin-bottom:6px;color:var(--text-muted)}
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

			_apexMode() {
				return frappe.boot?.sysdefaults?.theme === "dark" ? "dark" : "light";
			}

			/** Horizontal bar category axis — reduce ellipsis truncation on long names */
			_xaxisCategoriesNoTrim(labels) {
				return {
					categories: labels,
					labels: {
						trim: false,
						hideOverlappingLabels: false,
						maxHeight: 400,
						style: { fontSize: "11px" },
					},
				};
			}

			/** ApexCharts defaults: animations + light shadow (restores “live” feel) */
			_chartAnim(partial) {
				return {
					...partial,
					animations: {
						enabled: true,
						easing: "easeinout",
						speed: 700,
						animateGradually: { enabled: true, delay: 100 },
						dynamicAnimation: { enabled: true, speed: 400 },
					},
					dropShadow: {
						enabled: true,
						top: 2,
						left: 0,
						blur: 6,
						opacity: 0.1,
						color: "#000",
					},
				};
			}

			/** Map punctuality bucket label → color (subset of buckets keeps correct semantics) */
			_lateBucketColors(labels) {
				const order = ["0 lates", "1-5 lates", "6-15 lates", "16+ lates"];
				const pal = TIF_HR_PALETTE.punctualityBuckets;
				return (labels || []).map((lb) => {
					const i = order.indexOf(lb);
					return i >= 0 ? pal[i] : pal[pal.length - 1];
				});
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
				if (fmt === "currency") {
					formatted = frappe.format(value, { fieldtype: "Currency" });
				} else if (fmt === true) {
					formatted = frappe.format(value, { fieldtype: "Float" });
				} else if (typeof value === "number" && !Number.isInteger(value)) {
					formatted = frappe.format(value, { fieldtype: "Float" });
				} else {
					formatted = frappe.format(value, { fieldtype: "Int" });
				}
				const s = String(formatted ?? value);
				el.textContent = frappe.utils?.strip_html ? frappe.utils.strip_html(s) : s.replace(/<[^>]*>/g, "");
			}

			set_card_hint(key, hint) {
				const el = this.page.main.find(`.tif-card[data-card="${key}"] .tif-card__hint`)[0];
				if (!el) return;
				el.textContent = hint || "";
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

				this.set_card("active_headcount", data.active_headcount);
				this.set_card("new_hires", data.new_hires);
				this.set_card("left_employees", data.left_employees);
				const arEl = this.page.main.find('.tif-card[data-card="attrition_rate"] .tif-card__value')[0];
				if (arEl) {
					const v = data.attrition_rate;
					arEl.textContent =
						v === null || v === undefined || v === ""
							? "—"
							: `${Number(v).toFixed(2)}%`;
				}

				this.set_card("new_hires_this_month", data.new_hires_this_month);
				this.set_card("left_employees_this_month", data.left_employees_this_month);
				this.set_card("new_hires_this_year", data.new_hires_this_year);
				this.set_card("left_employees_this_year", data.left_employees_this_year);
				this.set_card("total_left_employees", data.total_left_employees);
				this.set_card("payroll_salary_slips_this_month", data.payroll_salary_slips_this_month);
				this.set_card("payroll_net_pay_this_month", data.payroll_net_pay_this_month, "currency");
				this.set_card("active_headcount_pakistan", data.active_headcount_pakistan);
				this.set_card("probation_employees_count", data.probation_employees_count);
				this.set_card("cnic_expired_count", data.cnic_expired_count);
				this.set_card("cnic_upcoming_count", data.cnic_upcoming_count);
				const d = Number(data.cnic_upcoming_days || 30);
				this.set_card_hint("cnic_upcoming_count", `Active; next ${Number.isFinite(d) ? d : 30} days`);
			}

			render_charts(data) {
				const mode = this._apexMode();
				const donutOpts = {
					chart: this._chartAnim({ type: "donut", height: 300, toolbar: { show: false } }),
					theme: { mode },
					colors: TIF_HR_PALETTE.donut,
					stroke: { width: 2, colors: ["var(--card-bg, #fff)"] },
					tooltip: { theme: mode, style: { fontSize: "12px" } },
					plotOptions: {
						pie: {
							donut: {
								size: "62%",
								labels: { show: true, name: { fontSize: "12px" }, value: { fontSize: "13px", fontWeight: 600 } },
							},
						},
					},
				};

				{
					const d = data.hiring_attrition_trend || {};
					const chart = this.ensure_chart("hire_attr", "#tif-attdash-hire-attr", {
						chart: this._chartAnim({ type: "line", height: 300, toolbar: { show: false }, zoom: { enabled: false } }),
						theme: { mode },
						colors: TIF_HR_PALETTE.hires,
						grid: { borderColor: "#e2e8f0", strokeDashArray: 4, xaxis: { lines: { show: true } }, yaxis: { lines: { show: true } } },
						tooltip: { theme: mode, shared: true, intersect: false },
						noData: { text: "No workforce movement in range" },
						stroke: { width: 3, curve: "smooth" },
						markers: { size: 4, strokeWidth: 2, hover: { size: 6 } },
						xaxis: { categories: d.labels || [] },
						series: d.series || [],
						dataLabels: { enabled: false },
						legend: { position: "top", fontWeight: 500 },
						yaxis: { labels: { formatter: (v) => (Number.isFinite(v) ? String(Math.round(v)) : "") } },
					});
					if (chart) {
						chart.updateOptions({ xaxis: { categories: d.labels || [] } }, false, true);
						chart.updateSeries(d.series || [], true);
					}
				}

				{
					const d = data.headcount_by_employment_type || {};
					const chart = this.ensure_chart("emp_type", "#tif-attdash-emp-type", {
						...donutOpts,
						noData: { text: "No employment type data" },
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
					const d = data.headcount_by_gender || {};
					const chart = this.ensure_chart("wf_gender", "#tif-dash-wf-gender", {
						...donutOpts,
						noData: { text: "No gender data" },
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
					const d = data.headcount_by_city || {};
					const chart = this.ensure_chart("wf_city", "#tif-dash-wf-city", {
						...donutOpts,
						noData: { text: "No city data" },
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
					const d = data.headcount_by_grade || {};
					const labels = d.labels || [];
					const values = d.values || [];
					const chart = this.ensure_chart("wf_grade", "#tif-dash-wf-grade", {
						chart: this._chartAnim({
							type: "bar",
							height: Math.max(280, labels.length * 32),
							toolbar: { show: false },
						}),
						theme: { mode },
						colors: ["#4f46e5"],
						grid: { borderColor: "#e2e8f0", strokeDashArray: 4 },
						noData: { text: "No grade field / data" },
						plotOptions: { bar: { horizontal: true, borderRadius: 4, barHeight: "72%" } },
						xaxis: this._xaxisCategoriesNoTrim(labels),
						series: [{ name: "Employees", data: values }],
						dataLabels: { enabled: true, style: { fontSize: "11px", fontWeight: 600 } },
					});
					if (chart) {
						chart.updateOptions({ xaxis: this._xaxisCategoriesNoTrim(labels) }, false, true);
						chart.updateSeries([{ name: "Employees", data: values }], true);
					}
				}

				{
					const d = data.headcount_by_employee_branch || {};
					const labels = d.labels || [];
					const values = d.values || [];
					const chart = this.ensure_chart("wf_ebr", "#tif-dash-wf-ebranch", {
						chart: this._chartAnim({
							type: "bar",
							height: Math.max(280, labels.length * 32),
							toolbar: { show: false },
						}),
						theme: { mode },
						colors: ["#0891b2"],
						grid: { borderColor: "#e2e8f0", strokeDashArray: 4 },
						noData: { text: "No branch data" },
						plotOptions: { bar: { horizontal: true, borderRadius: 4, barHeight: "72%" } },
						xaxis: this._xaxisCategoriesNoTrim(labels),
						series: [{ name: "Employees", data: values }],
						dataLabels: { enabled: false },
					});
					if (chart) {
						chart.updateOptions({ xaxis: this._xaxisCategoriesNoTrim(labels) }, false, true);
						chart.updateSeries([{ name: "Employees", data: values }], true);
					}
				}

				{
					const d = data.headcount_by_designation || {};
					const labels = d.labels || [];
					const values = d.values || [];
					const chart = this.ensure_chart("wf_des", "#tif-dash-wf-desig", {
						chart: this._chartAnim({
							type: "bar",
							height: Math.max(360, labels.length * 30),
							toolbar: { show: false },
						}),
						theme: { mode },
						colors: ["#7c3aed"],
						grid: { borderColor: "#e2e8f0", strokeDashArray: 4 },
						noData: { text: "No designation data" },
						plotOptions: { bar: { horizontal: true, borderRadius: 4, barHeight: "70%" } },
						xaxis: this._xaxisCategoriesNoTrim(labels),
						series: [{ name: "Employees", data: values }],
						dataLabels: { enabled: false },
					});
					if (chart) {
						chart.updateOptions({ xaxis: this._xaxisCategoriesNoTrim(labels) }, false, true);
						chart.updateSeries([{ name: "Employees", data: values }], true);
					}
				}

				{
					const d = data.headcount_by_department || {};
					const labels = d.labels || [];
					const values = d.values || [];
					const chart = this.ensure_chart("wf_dep", "#tif-dash-wf-dept", {
						chart: this._chartAnim({
							type: "bar",
							height: Math.max(380, labels.length * 30),
							toolbar: { show: false },
						}),
						theme: { mode },
						colors: ["#ea580c"],
						grid: { borderColor: "#e2e8f0", strokeDashArray: 4 },
						noData: { text: "No department data" },
						plotOptions: { bar: { horizontal: true, borderRadius: 4, barHeight: "70%" } },
						xaxis: this._xaxisCategoriesNoTrim(labels),
						series: [{ name: "Employees", data: values }],
						dataLabels: { enabled: false },
					});
					if (chart) {
						chart.updateOptions({ xaxis: this._xaxisCategoriesNoTrim(labels) }, false, true);
						chart.updateSeries([{ name: "Employees", data: values }], true);
					}
				}

				{
					const d = data.monthly_attendance_trend || {};
					const labels = d.labels || [];
					const seriesList = d.series || [];
					const presentSeries = seriesList.find((s) => (s.name || "").toLowerCase().includes("present")) || {
						name: "Present Days",
						data: [],
					};
					const incidentSeries = seriesList.filter((s) => !(s.name || "").toLowerCase().includes("present"));

					const chP = this.ensure_chart("monthly_p", "#tif-attdash-monthly-present", {
						chart: this._chartAnim({ type: "area", height: 280, toolbar: { show: false }, zoom: { enabled: false } }),
						theme: { mode },
						colors: TIF_HR_PALETTE.present,
						grid: { borderColor: "#e2e8f0", strokeDashArray: 4 },
						tooltip: { theme: mode, shared: true, intersect: false },
						noData: { text: "No present-day data" },
						stroke: { width: 2, curve: "smooth" },
						fill: {
							type: "gradient",
							gradient: { shadeIntensity: 0.35, opacityFrom: 0.45, opacityTo: 0.05, stops: [0, 90, 100] },
						},
						xaxis: { categories: labels },
						series: [presentSeries],
						dataLabels: { enabled: false },
						legend: { show: false },
						yaxis: { labels: { formatter: (v) => (v % 1 === 0 ? String(v) : v.toFixed(1)) } },
					});
					if (chP) {
						chP.updateOptions({ xaxis: { categories: labels } }, false, true);
						chP.updateSeries([presentSeries], true);
					}

					const zeroPad = labels.map(() => 0);
					const incidentFallback = [
						{ name: "Absents", data: zeroPad },
						{ name: "Lates", data: zeroPad },
						{ name: "Half Days", data: zeroPad },
					];
					const chI = this.ensure_chart("monthly_i", "#tif-attdash-monthly-incidents", {
						chart: this._chartAnim({ type: "line", height: 280, toolbar: { show: false }, zoom: { enabled: false } }),
						theme: { mode },
						colors: TIF_HR_PALETTE.incidents,
						grid: { borderColor: "#e2e8f0", strokeDashArray: 4 },
						tooltip: { theme: mode, shared: true, intersect: false },
						noData: { text: "No incident rows (absents / lates / half days)" },
						stroke: { width: 2, curve: "smooth" },
						markers: { size: 4, strokeWidth: 2 },
						xaxis: { categories: labels },
						series: incidentSeries.length ? incidentSeries : incidentFallback,
						dataLabels: { enabled: false },
						legend: { position: "top", fontWeight: 500 },
						yaxis: { labels: { formatter: (v) => (v % 1 === 0 ? String(v) : v.toFixed(1)) }, min: 0 },
					});
					if (chI) {
						chI.updateOptions({ xaxis: { categories: labels } }, false, true);
						chI.updateSeries(incidentSeries.length ? incidentSeries : incidentFallback, true);
					}
				}

				{
					const d = data.punctuality_late_buckets || {};
					const labels = d.labels || [];
					const values = d.values || [];
					const bucketCols = this._lateBucketColors(labels);
					const chart = this.ensure_chart("punct_bk", "#tif-attdash-punct-buckets", {
						chart: this._chartAnim({ type: "pie", height: 300, toolbar: { show: false } }),
						theme: { mode },
						colors: bucketCols,
						labels,
						series: values,
						stroke: { width: 2, colors: ["var(--card-bg, #fff)"] },
						tooltip: {
							theme: mode,
							fillSeriesColor: true,
							y: {
								formatter: (val) =>
									`${Number.isFinite(val) ? Math.round(val) : val} employees`,
							},
						},
						plotOptions: {
							pie: {
								expandOnClick: true,
								offsetY: 2,
							},
						},
						dataLabels: {
							enabled: true,
							dropShadow: { enabled: false },
							formatter: (val, opts) => {
								const s = opts?.w?.config?.series;
								const n = Array.isArray(s) ? s[opts.seriesIndex] : null;
								return Number.isFinite(n) ? String(Math.round(n)) : "";
							},
						},
						legend: { position: "bottom", fontWeight: 500 },
						noData: { text: "No employees / lates data in range" },
					});
					if (chart) {
						chart.updateOptions({ labels, colors: this._lateBucketColors(labels) }, false, true);
						chart.updateSeries(values, true);
					}
				}

				{
					const d = data.punctuality_incident_mix || {};
					const labels = d.labels || [];
					const values = d.values || [];
					const chart = this.ensure_chart("punct_mix", "#tif-attdash-punct-mix", {
						chart: this._chartAnim({ type: "pie", height: 300, toolbar: { show: false } }),
						theme: { mode },
						colors: TIF_HR_PALETTE.incidentMix,
						labels,
						series: values,
						stroke: { width: 2, colors: ["var(--card-bg, #fff)"] },
						tooltip: {
							theme: mode,
							fillSeriesColor: true,
							y: {
								formatter: (val) => {
									if (!Number.isFinite(val)) return "";
									const t = Math.round(val * 100) / 100;
									return t % 1 === 0 ? String(Math.round(t)) : t.toFixed(1);
								},
							},
						},
						plotOptions: {
							pie: {
								expandOnClick: true,
								offsetY: 2,
							},
						},
						dataLabels: {
							enabled: true,
							dropShadow: { enabled: false },
							formatter: (pct, opts) => {
								const s = opts?.w?.config?.series;
								const n = Array.isArray(s) ? s[opts.seriesIndex] : null;
								if (!Number.isFinite(n) || !Number.isFinite(pct)) return "";
								const t = Math.round(n * 100) / 100;
								const num = t % 1 === 0 ? String(Math.round(t)) : t.toFixed(1);
								return `${num} (${pct.toFixed(0)}%)`;
							},
						},
						legend: { position: "bottom", fontWeight: 500 },
						noData: { text: "No incident totals in range" },
					});
					if (chart) {
						chart.updateOptions({ labels, colors: TIF_HR_PALETTE.incidentMix }, false, true);
						chart.updateSeries(values, true);
					}
				}

				{
					const d = data.metrics_distribution || {};
					const chart = this.ensure_chart("dist", "#tif-attdash-dist", {
						...donutOpts,
						noData: { text: "No data" },
						labels: d.labels || [],
						series: d.values || [],
						legend: { position: "bottom", fontWeight: 500 },
						plotOptions: {
							pie: {
								donut: {
									size: "62%",
									labels: {
										show: true,
										name: { fontSize: "12px" },
										value: { fontSize: "13px", fontWeight: 600 },
										total: {
											show: true,
											label: "Σ metrics",
											fontWeight: 600,
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
						...donutOpts,
						noData: { text: "No leave applications in range" },
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
					const d = data.department_absents_lates || {};
					const labels = d.labels || [];
					const chart = this.ensure_chart("dept", "#tif-attdash-dept", {
						chart: this._chartAnim({
							type: "bar",
							height: Math.max(320, labels.length * 28),
							stacked: false,
							toolbar: { show: false },
						}),
						theme: { mode },
						colors: TIF_HR_PALETTE.deptPair,
						grid: { borderColor: "#e2e8f0", strokeDashArray: 4 },
						tooltip: { theme: mode, shared: true, intersect: false },
						noData: { text: "No department data" },
						plotOptions: { bar: { horizontal: true, borderRadius: 4, barHeight: "68%" } },
						xaxis: this._xaxisCategoriesNoTrim(labels),
						series: [
							{ name: "Absents", data: d.absents || [] },
							{ name: "Lates", data: d.lates || [] },
						],
						dataLabels: { enabled: false },
						legend: { position: "top", fontWeight: 500 },
					});
					if (chart) {
						chart.updateOptions({ xaxis: this._xaxisCategoriesNoTrim(labels) }, false, true);
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
						chart: this._chartAnim({ type: "bar", height: 300, toolbar: { show: false } }),
						theme: { mode },
						colors: ["#0d9488"],
						grid: { borderColor: "#e2e8f0", strokeDashArray: 4 },
						noData: { text: "No branch data" },
						plotOptions: { bar: { borderRadius: 6, columnWidth: "72%" } },
						xaxis: { categories: d.labels || [], labels: { rotate: -35, trim: false, style: { fontSize: "11px" } } },
						series: [{ name: "Present days", data: d.values || [] }],
						dataLabels: { enabled: false },
					});
					if (chart) {
						chart.updateOptions({ xaxis: { categories: d.labels || [], labels: { rotate: -35, trim: false } } }, false, true);
						chart.updateSeries([{ name: "Present days", data: d.values || [] }], true);
					}
				}

				{
					const d = data.leave_trend || {};
					const chart = this.ensure_chart("leave_tr", "#tif-attdash-leave-trend", {
						chart: this._chartAnim({ type: "line", height: 300, toolbar: { show: false }, zoom: { enabled: false } }),
						theme: { mode },
						colors: ["#2563eb", "#ca8a04"],
						grid: { borderColor: "#e2e8f0", strokeDashArray: 4 },
						tooltip: { theme: mode, shared: true, intersect: false },
						noData: { text: "No approved leave in range" },
						stroke: { width: 2, curve: "smooth" },
						markers: { size: 4, strokeWidth: 2 },
						xaxis: { categories: d.labels || [] },
						series: d.series || [],
						dataLabels: { enabled: false },
						legend: { position: "top", fontWeight: 500 },
					});
					if (chart) {
						chart.updateOptions({ xaxis: { categories: d.labels || [] } }, false, true);
						chart.updateSeries(d.series || [], true);
					}
				}

				{
					const d = data.leaves_by_type || {};
					const chart = this.ensure_chart("leave_type", "#tif-attdash-leave-type", {
						...donutOpts,
						noData: { text: "No data" },
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
					const rows = data.top_by_lates || [];
					const labels = rows.map((r) => r.employee_name || "—");
					const values = rows.map((r) => r.value || 0);
					const chart = this.ensure_chart("top_l", "#tif-attdash-top-lates", {
						chart: this._chartAnim({ type: "bar", height: Math.max(300, rows.length * 30), toolbar: { show: false } }),
						theme: { mode },
						colors: ["#ea580c"],
						grid: { borderColor: "#e2e8f0", strokeDashArray: 4 },
						noData: { text: "No data" },
						plotOptions: { bar: { horizontal: true, borderRadius: 4, barHeight: "72%" } },
						xaxis: this._xaxisCategoriesNoTrim(labels),
						series: [{ name: "Total lates", data: values }],
						dataLabels: { enabled: true, style: { fontSize: "11px", fontWeight: 600 } },
					});
					if (chart) {
						chart.updateOptions({ xaxis: this._xaxisCategoriesNoTrim(labels) }, false, true);
						chart.updateSeries([{ name: "Total lates", data: values }], true);
					}
				}

				{
					const rows = data.top_by_absents || [];
					const labels = rows.map((r) => r.employee_name || "—");
					const values = rows.map((r) => r.value || 0);
					const chart = this.ensure_chart("top_a", "#tif-attdash-top-abs", {
						chart: this._chartAnim({ type: "bar", height: Math.max(300, rows.length * 30), toolbar: { show: false } }),
						theme: { mode },
						colors: ["#dc2626"],
						grid: { borderColor: "#e2e8f0", strokeDashArray: 4 },
						noData: { text: "No data" },
						plotOptions: { bar: { horizontal: true, borderRadius: 4, barHeight: "72%" } },
						xaxis: this._xaxisCategoriesNoTrim(labels),
						series: [{ name: "Total absents", data: values }],
						dataLabels: { enabled: true, style: { fontSize: "11px", fontWeight: 600 } },
					});
					if (chart) {
						chart.updateOptions({ xaxis: this._xaxisCategoriesNoTrim(labels) }, false, true);
						chart.updateSeries([{ name: "Total absents", data: values }], true);
					}
				}

				this.render_table("#tif-attdash-cnic-expired", data.cnic_expired_employees || [], [
					{ key: "employee_name", label: "Employee" },
					{ key: "employee_id", label: "Employee ID" },
					{ key: "department", label: "Department" },
					{ key: "cnic_expiry", label: "CNIC expiry", format: "Date" },
				]);
				this.render_table("#tif-attdash-cnic-upcoming", data.cnic_upcoming_employees || [], [
					{ key: "employee_name", label: "Employee" },
					{ key: "employee_id", label: "Employee ID" },
					{ key: "department", label: "Department" },
					{ key: "cnic_expiry", label: "CNIC expiry", format: "Date" },
				]);
				this.render_table("#tif-attdash-city-branch", data.headcount_by_city_branch || [], [
					{ key: "city", label: "City" },
					{ key: "branch", label: "Branch" },
					{ key: "count", label: "Employees", format: "Int" },
				]);
				this.render_table("#tif-attdash-probation", data.probation_employees || [], [
					{ key: "employee_name", label: "Employee" },
					{ key: "employee_id", label: "Employee ID" },
					{ key: "department", label: "Department" },
					{ key: "probation_until", label: "Probation until", format: "Date" },
				]);
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
							} else if (c.format === "Int") {
								inner = this._plain_formatted(row?.[c.key], "Int");
								align = "right";
							} else if (c.format === "Date") {
								const dv = row?.[c.key];
								inner = dv
									? this._plain_formatted(dv, "Date")
									: "—";
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
