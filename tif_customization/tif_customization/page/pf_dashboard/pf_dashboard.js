frappe.pages["pf-dashboard"].on_page_load = function (wrapper) {
	frappe.require("/assets/tif_customization/css/pf_dashboard.css");

	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("PF Dashboard"),
		single_column: true,
	});

	if (!window.PFDashboard) {
		window.PFDashboard = class PFDashboard {
			constructor(page) {
				this.page = page;
				this.filters = {
					company: frappe.defaults.get_user_default("Company") || "",
					from_month: frappe.datetime.add_months(frappe.datetime.get_today(), -11).substring(0, 7),
					to_month: frappe.datetime.get_today().substring(0, 7),
				};
				this._data = null;
			}

			make() {
				this.render_layout();
				this.bind_events();
				this.load_companies();
				this.refresh();
			}

			render_layout() {
				this.page.main.html(`
					<div class="pf-dashboard-root">
						<div class="pf-hero">
							<div class="pf-hero__left">
								<h1 class="pf-hero__title">${__("Provident Fund Dashboard")}</h1>
								<p class="pf-hero__sub">${__("Track employee & employer PF contributions, payable balance, and monthly trends aligned with your salary sheet (8.33% of gross).")}</p>
								<div class="pf-hero__badges pf-hero-badges"></div>
							</div>
							<div class="pf-hero__links">
								<a href="/app/pf-contribution-log">${__("PF Logs")}</a>
								<a href="/app/pf-settings">${__("Settings")}</a>
								<a href="/app/salary-register">${__("Salary Register")}</a>
								<a href="/app/employee?custom_pf_applicable=1">${__("PF Employees")}</a>
							</div>
						</div>

						<div class="pf-alert-banner pf-pending-banner" style="display:none"></div>

						<div class="pf-toolbar">
							<div class="filter-field">
								<label>${__("Company")}</label>
								<select class="form-control company-filter"></select>
							</div>
							<div class="filter-field">
								<label>${__("From")}</label>
								<input type="month" class="form-control from-month" />
							</div>
							<div class="filter-field">
								<label>${__("To")}</label>
								<input type="month" class="form-control to-month" />
							</div>
							<div class="pf-toolbar__actions">
								<button class="btn btn-primary btn-sm btn-refresh">
									<i class="fa fa-refresh"></i> ${__("Refresh")}
								</button>
								<div class="dropdown pf-actions-dropdown">
									<button class="btn btn-default btn-sm dropdown-toggle" data-toggle="dropdown">
										${__("Actions")} <span class="caret"></span>
									</button>
									<ul class="dropdown-menu dropdown-menu-right">
										<li><a class="btn-setup-pf">${__("Run PF Setup")}</a></li>
										<li><a class="btn-apply-rates">${__("Apply PF to Full-Time Staff")}</a></li>
										<li><a class="btn-backfill">${__("Backfill PF Logs")}</a></li>
										<li class="divider"></li>
										<li><a href="/app/provident-fund">${__("PF Workspace")}</a></li>
									</ul>
								</div>
							</div>
						</div>

						<div class="pf-kpi-grid pf-kpi-primary"></div>
						<div class="pf-kpi-grid pf-kpi-grid--secondary pf-kpi-secondary"></div>

						<div class="pf-charts">
							<div class="pf-panel">
								<div class="pf-panel__head">
									<h3 class="pf-panel__title">${__("Monthly PF Trend")}</h3>
									<span class="pf-panel__hint pf-monthly-hint"></span>
								</div>
								<div class="pf-chart-area" id="pf-monthly-chart"></div>
							</div>
							<div class="pf-panel">
								<div class="pf-panel__head">
									<h3 class="pf-panel__title">${__("By Source")}</h3>
								</div>
								<div class="pf-chart-area pf-chart-area--sm" id="pf-source-chart"></div>
							</div>
						</div>

						<div class="pf-panel" style="margin-bottom:16px">
							<div class="pf-panel__head">
								<h3 class="pf-panel__title">${__("Department Breakdown")}</h3>
								<span class="pf-panel__hint">${__("Top departments by total PF in selected period")}</span>
							</div>
							<div class="pf-chart-area" id="pf-dept-chart"></div>
						</div>

						<div class="pf-bottom">
							<div class="pf-panel">
								<div class="pf-panel__head">
									<h3 class="pf-panel__title">${__("Top Contributors")}</h3>
									<span class="pf-panel__hint">${__("By total PF in period")}</span>
								</div>
								<ul class="pf-rank-list" id="pf-top-employees"></ul>
							</div>
							<div class="pf-panel">
								<div class="pf-panel__head">
									<h3 class="pf-panel__title">${__("Recent PF Logs")}</h3>
									<span class="pf-panel__hint">${__("Latest 50 entries")}</span>
								</div>
								<div class="pf-table-search">
									<input type="text" class="form-control pf-log-search" placeholder="${__("Search employee, department...")}" />
								</div>
								<div class="pf-table-wrap" id="pf-recent-logs"></div>
							</div>
						</div>

						<div class="pf-config pf-config-strip"></div>
					</div>
				`);

				this.$company = this.page.main.find(".company-filter");
				this.$from = this.page.main.find(".from-month");
				this.$to = this.page.main.find(".to-month");
				this.$from.val(this.filters.from_month);
				this.$to.val(this.filters.to_month);
				this.$log_search = this.page.main.find(".pf-log-search");
			}

			bind_events() {
				this.page.main.find(".btn-refresh").on("click", () => this.refresh());
				this.page.main.find(".btn-setup-pf").on("click", (e) => {
					e.preventDefault();
					this.run_setup();
				});
				this.page.main.find(".btn-backfill").on("click", (e) => {
					e.preventDefault();
					this.run_backfill();
				});
				this.page.main.find(".btn-apply-rates").on("click", (e) => {
					e.preventDefault();
					this.apply_rates();
				});
				this.$company.on("change", () => this.refresh());
				this.$from.on("change", () => this.refresh());
				this.$to.on("change", () => this.refresh());
				this.$log_search.on("input", () => this.filter_logs_table());
			}

			load_companies() {
				frappe.call({
					method: "frappe.client.get_list",
					args: { doctype: "Company", fields: ["name"], order_by: "name" },
					callback: (r) => {
						this.$company.empty();
						(r.message || []).forEach((c) => {
							this.$company.append(
								`<option value="${frappe.utils.escape_html(c.name)}">${frappe.utils.escape_html(c.name)}</option>`,
							);
						});
						if (this.filters.company) this.$company.val(this.filters.company);
					},
				});
			}

			get_filters() {
				return {
					company: this.$company.val(),
					from_month: this.$from.val(),
					to_month: this.$to.val(),
				};
			}

			refresh() {
				frappe.call({
					method: "tif_customization.tif_customization.page.pf_dashboard.pf_dashboard.get_dashboard_data",
					args: this.get_filters(),
					freeze: true,
					freeze_message: __("Loading PF dashboard..."),
					callback: (r) => {
						this._data = r.message || {};
						this.render(this._data);
					},
				});
			}

			fmt_money(v) {
				return frappe.format(flt(v), { fieldtype: "Currency" });
			}

			fmt_period(from_m, to_m) {
				if (!from_m || !to_m) return "";
				const fmt = (ym) => {
					const [y, m] = ym.split("-");
					const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
					return `${months[parseInt(m, 10) - 1]} ${y}`;
				};
				return from_m === to_m ? fmt(from_m) : `${fmt(from_m)} – ${fmt(to_m)}`;
			}

			trend_html(pct) {
				if (pct > 0) {
					return `<span class="pf-kpi__trend pf-kpi__trend--up"><i class="fa fa-arrow-up"></i> ${pct}% ${__("vs last month")}</span>`;
				}
				if (pct < 0) {
					return `<span class="pf-kpi__trend pf-kpi__trend--down"><i class="fa fa-arrow-down"></i> ${Math.abs(pct)}% ${__("vs last month")}</span>`;
				}
				return `<span class="pf-kpi__trend pf-kpi__trend--flat">${__("Same as last month")}</span>`;
			}

			render(data) {
				const s = data.summary || {};
				const policy = data.policy || {};
				const settings = data.settings || {};
				const period = this.fmt_period(data.from_month, data.to_month);

				this.page.main.find(".pf-hero-badges").html(`
					<span class="pf-badge">${frappe.utils.escape_html(data.company || "")}</span>
					<span class="pf-badge">${period}</span>
					<span class="pf-badge">${policy.note || __("8.33% of Gross")}</span>
				`);

				// Pending alerts
				const $banner = this.page.main.find(".pf-pending-banner");
				const alerts = [];
				if (s.pending_slip_logs > 0) {
					alerts.push(
						`${s.pending_slip_logs} ${__("submitted salary slip(s) have no PF log yet.")}`,
					);
				}
				if (s.full_time_not_marked > 0) {
					alerts.push(
						`${s.full_time_not_marked} ${__("full-time employee(s) not marked PF applicable.")}`,
					);
				}
				if (!settings.pf_payable_account) {
					alerts.push(__("PF Settings not configured."));
				}
				if (alerts.length) {
					$banner
						.html(
							`<i class="fa fa-exclamation-triangle"></i> ${alerts.join(" · ")} <a href="#" class="pf-alert-action">${__("Review")}</a>`,
						)
						.show();
					$banner.find(".pf-alert-action").on("click", (e) => {
						e.preventDefault();
						if (s.pending_slip_logs) this.run_backfill();
						else if (s.full_time_not_marked) this.apply_rates();
						else this.run_setup();
					});
				} else {
					$banner.hide();
				}

				// Primary KPIs
				this.page.main.find(".pf-kpi-primary").html(`
					<div class="pf-kpi pf-kpi--highlight" style="--pf-kpi-accent:#0f766e">
						<div class="pf-kpi__icon"><i class="fa fa-users"></i></div>
						<div class="pf-kpi__label">${__("PF Eligible Staff")}</div>
						<div class="pf-kpi__value">${s.eligible_employees || 0}</div>
						<div class="pf-kpi__meta">${s.full_time_active || 0} ${__("full-time active")}</div>
					</div>
					<div class="pf-kpi" style="--pf-kpi-accent:#7c3aed">
						<div class="pf-kpi__icon"><i class="fa fa-line-chart"></i></div>
						<div class="pf-kpi__label">${__("Total PF (Period)")}</div>
						<div class="pf-kpi__value">${this.fmt_money(s.period_total_pf)}</div>
						<div class="pf-kpi__meta">${__("Emp")}: ${this.fmt_money(s.period_employee_pf)} · ${__("Er")}: ${this.fmt_money(s.period_employer_pf)}</div>
					</div>
					<div class="pf-kpi" style="--pf-kpi-accent:#d97706">
						<div class="pf-kpi__icon"><i class="fa fa-calendar"></i></div>
						<div class="pf-kpi__label">${__("Selected Month PF")}</div>
						<div class="pf-kpi__value">${this.fmt_money(s.current_month_total_pf)}</div>
						${this.trend_html(s.month_change_pct)}
					</div>
					<div class="pf-kpi" style="--pf-kpi-accent:#0369a1">
						<div class="pf-kpi__icon"><i class="fa fa-bank"></i></div>
						<div class="pf-kpi__label">${__("PF Payable Balance")}</div>
						<div class="pf-kpi__value">${this.fmt_money(s.pf_payable_balance)}</div>
						<div class="pf-kpi__meta">${__("Ledger balance")}</div>
					</div>
				`);

				// Secondary KPIs
				this.page.main.find(".pf-kpi-secondary").html(`
					<div class="pf-kpi" style="--pf-kpi-accent:#0d6efd">
						<div class="pf-kpi__label">${__("Employee PF (Period)")}</div>
						<div class="pf-kpi__value" style="font-size:18px">${this.fmt_money(s.period_employee_pf)}</div>
					</div>
					<div class="pf-kpi" style="--pf-kpi-accent:#198754">
						<div class="pf-kpi__label">${__("Employer PF (Period)")}</div>
						<div class="pf-kpi__value" style="font-size:18px">${this.fmt_money(s.period_employer_pf)}</div>
					</div>
					<div class="pf-kpi" style="--pf-kpi-accent:#64748b">
						<div class="pf-kpi__label">${__("PF Logs")}</div>
						<div class="pf-kpi__value" style="font-size:18px">${s.logs_in_period || 0}</div>
						<div class="pf-kpi__meta">${s.submitted_slips_in_period || 0} ${__("submitted slips in range")}</div>
					</div>
					<div class="pf-kpi" style="--pf-kpi-accent:#dc2626">
						<div class="pf-kpi__label">${__("Missing PF Logs")}</div>
						<div class="pf-kpi__value" style="font-size:18px">${s.pending_slip_logs || 0}</div>
						<div class="pf-kpi__meta">${__("Submitted slips without log")}</div>
					</div>
				`);

				this.page.main.find(".pf-monthly-hint").text(
					`${data.monthly_chart?.length || 0} ${__("months")}`,
				);

				this.render_monthly_chart(data.monthly_chart || []);
				this.render_source_chart(data.source_breakdown || []);
				this.render_dept_chart(data.department_chart || []);
				this.render_top_employees(data.top_employees || []);
				this._recent_logs = data.recent_logs || [];
				this.render_recent(this._recent_logs);
				this.render_config(settings, policy);
			}

			render_config(settings, policy) {
				const $strip = this.page.main.find(".pf-config-strip");
				if (!settings.pf_payable_account) {
					$strip
						.addClass("pf-config--warn")
						.html(`<span>${__("PF not configured.")} ${__("Run PF Setup from Actions.")}</span>`);
					return;
				}
				$strip.removeClass("pf-config--warn").html(`
					<span class="pf-config__item">${__("Payable")}: <strong>${frappe.utils.escape_html(settings.pf_payable_account)}</strong></span>
					<span class="pf-config__item">${__("Expense")}: <strong>${frappe.utils.escape_html(settings.employer_pf_expense_account || "")}</strong></span>
					<span class="pf-config__item">${__("Deduction")}: <strong>${frappe.utils.escape_html(settings.employee_pf_component || "")}</strong></span>
					<span class="pf-config__item">${__("Employer Comp.")}: <strong>${frappe.utils.escape_html(settings.employer_pf_component || "")}</strong></span>
					<span class="pf-config__item">${__("Default Rate")}: <strong>${policy.employee_rate || 8.33}%</strong> ${__("of")} <strong>${policy.formula_base || "Gross"}</strong></span>
				`);
			}

			empty_chart(el, title, hint) {
				el.innerHTML = `
					<div class="pf-empty">
						<div class="pf-empty__icon"><i class="fa fa-bar-chart"></i></div>
						<div class="pf-empty__title">${title}</div>
						<div class="pf-empty__text">${hint}</div>
					</div>`;
			}

			render_monthly_chart(rows) {
				const el = document.getElementById("pf-monthly-chart");
				if (!el) return;
				const has_data = rows.some((r) => r.total > 0);
				if (!has_data) {
					if (this.monthly_chart) this.monthly_chart.destroy();
					this.empty_chart(
						el,
						__("No PF data yet"),
						__("Submit salary slips with PF components or run Backfill Logs to populate this chart."),
					);
					return;
				}
				if (this.monthly_chart) this.monthly_chart.destroy();
				this.monthly_chart = new frappe.Chart(el, {
					height: 300,
					type: "bar",
					data: {
						labels: rows.map((r) => r.label),
						datasets: [
							{ name: __("Employee PF"), values: rows.map((r) => r.employee) },
							{ name: __("Employer PF"), values: rows.map((r) => r.employer) },
						],
					},
					colors: ["#0f766e", "#14b8a6"],
					barOptions: { stacked: 1, spaceRatio: 0.35 },
				});
			}

			render_source_chart(rows) {
				const el = document.getElementById("pf-source-chart");
				if (!el) return;
				if (!rows.length) {
					if (this.source_chart) this.source_chart.destroy();
					this.empty_chart(el, __("No sources"), __("Logs will show Salary Slip vs Additional Salary split."));
					return;
				}
				if (this.source_chart) this.source_chart.destroy();
				this.source_chart = new frappe.Chart(el, {
					height: 220,
					type: "donut",
					data: {
						labels: rows.map((r) => r.source),
						datasets: [{ values: rows.map((r) => r.count) }],
					},
					colors: ["#0f766e", "#d97706", "#6366f1", "#ec4899"],
				});
			}

			render_dept_chart(rows) {
				const el = document.getElementById("pf-dept-chart");
				if (!el) return;
				if (!rows.length) {
					if (this.dept_chart) this.dept_chart.destroy();
					this.empty_chart(el, __("No department data"), __("Department breakdown appears after PF logs are created."));
					return;
				}
				if (this.dept_chart) this.dept_chart.destroy();
				const labels = rows.map((r) => (r.department || "").substring(0, 22));
				this.dept_chart = new frappe.Chart(el, {
					height: Math.max(220, rows.length * 36),
					type: "bar",
					data: {
						labels,
						datasets: [
							{ name: __("Employee"), values: rows.map((r) => r.employee) },
							{ name: __("Employer"), values: rows.map((r) => r.employer) },
						],
					},
					colors: ["#0f766e", "#99f6e4"],
					barOptions: { stacked: 1, spaceRatio: 0.4 },
					axisOptions: { xAxisMode: "tick", xIsSeries: 0 },
				});
			}

			render_top_employees(rows) {
				const $el = this.page.main.find("#pf-top-employees");
				if (!rows.length) {
					$el.html(`<li class="pf-empty" style="list-style:none">${__("No contributor data in this period.")}</li>`);
					return;
				}
				let html = "";
				rows.forEach((r, i) => {
					html += `<li class="pf-rank-item">
						<span class="pf-rank-num ${i === 0 ? "pf-rank-num--1" : ""}">${i + 1}</span>
						<div class="pf-rank-info">
							<div class="pf-rank-name">${frappe.utils.escape_html(r.employee_name || r.employee)}</div>
							<div class="pf-rank-dept">${frappe.utils.escape_html(r.department || "—")} · ${r.log_count || 0} ${__("logs")}</div>
						</div>
						<div class="pf-rank-amt">${this.fmt_money(r.total_contribution)}</div>
					</li>`;
				});
				$el.html(html);
			}

			render_recent(rows) {
				const $wrap = this.page.main.find("#pf-recent-logs");
				if (!rows.length) {
					$wrap.html(`
						<div class="pf-empty">
							<div class="pf-empty__icon"><i class="fa fa-list-alt"></i></div>
							<div class="pf-empty__title">${__("No PF logs yet")}</div>
							<div class="pf-empty__text">${__("Logs are created when salary slips with PF components are submitted.")}</div>
						</div>`);
					return;
				}
				let html = `<table class="pf-table pf-logs-table"><thead><tr>
					<th>${__("Date")}</th><th>${__("Employee")}</th><th>${__("Department")}</th>
					<th class="text-right">${__("Employee PF")}</th><th class="text-right">${__("Employer PF")}</th>
					<th class="text-right">${__("Total")}</th><th>${__("Source")}</th><th></th>
				</tr></thead><tbody>`;
				rows.forEach((r) => {
					html += `<tr data-search="${frappe.utils.escape_html(
						`${r.employee_name} ${r.department} ${r.source}`.toLowerCase(),
					)}">
						<td>${frappe.datetime.str_to_user(r.posting_date)}</td>
						<td><strong>${frappe.utils.escape_html(r.employee_name || "")}</strong></td>
						<td>${frappe.utils.escape_html(r.department || "")}</td>
						<td class="text-right">${this.fmt_money(r.employee_contribution)}</td>
						<td class="text-right">${this.fmt_money(r.employer_contribution)}</td>
						<td class="text-right"><strong>${this.fmt_money(r.total_contribution)}</strong></td>
						<td><span class="pf-source-tag">${frappe.utils.escape_html(r.source || "")}</span></td>
						<td><a href="/app/pf-contribution-log/${encodeURIComponent(r.name)}">${__("Open")}</a></td>
					</tr>`;
				});
				html += "</tbody></table>";
				$wrap.html(html);
			}

			filter_logs_table() {
				const q = (this.$log_search.val() || "").toLowerCase().trim();
				this.page.main.find(".pf-logs-table tbody tr").each(function () {
					const match = !q || $(this).data("search").indexOf(q) >= 0;
					$(this).toggle(match);
				});
			}

			run_setup() {
				frappe.confirm(__("Run PF setup (components, settings, employee fields)?"), () => {
					frappe.call({
						method: "tif_customization.tif_customization.pf.pf_contribution.setup_pf",
						args: { company: this.$company.val() },
						freeze: true,
						callback: (r) => {
							frappe.show_alert({ message: r.message?.message || __("PF setup done"), indicator: "green" }, 5);
							this.refresh();
						},
					});
				});
			}

			apply_rates() {
				frappe.confirm(
					__(
						"Mark all Full Time (Permanent) employees for PF at 8.33% of Gross? Shahid Khan will be set to 12.77% (employee only).",
					),
					() => {
						frappe.call({
							method: "tif_customization.tif_customization.pf.pf_contribution.apply_employee_pf_rates",
							freeze: true,
							callback: (r) => {
								const m = r.message || {};
								frappe.msgprint(
									__(
										"Updated {0} employee(s) at {1}% gross PF (Shahid Khan: {2}%).",
										[m.updated || 0, m.standard_rate || 8.33, m.shahid_khan_rate || 12.77],
									),
								);
								this.refresh();
							},
						});
					},
				);
			}

			run_backfill() {
				frappe.confirm(__("Create PF logs for submitted salary slips missing logs?"), () => {
					frappe.call({
						method: "tif_customization.tif_customization.pf.pf_contribution.backfill_pf_logs_from_slips",
						args: { company: this.$company.val() },
						freeze: true,
						callback: (r) => {
							const m = r.message || {};
							frappe.msgprint(__("Created {0} log(s) from {1} slips.", [m.created || 0, m.total_slips || 0]));
							this.refresh();
						},
					});
				});
			}
		};
	}

	page.pf_dashboard = new window.PFDashboard(page);
	page.pf_dashboard.make();
};

function flt(v) {
	return parseFloat(v) || 0;
}
