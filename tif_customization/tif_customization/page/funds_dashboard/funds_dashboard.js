frappe.pages["funds-dashboard"].on_page_load = function (wrapper) {
	frappe.require("/assets/tif_customization/css/pf_dashboard.css");
	frappe.require("/assets/tif_customization/css/funds_dashboard.css");

	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Funds Dashboard"),
		single_column: true,
	});

	if (!window.FundsDashboard) {
		window.FundsDashboard = class FundsDashboard {
			constructor(page) {
				this.page = page;
				this.filters = {
					company: frappe.defaults.get_user_default("Company") || "",
					from_date: frappe.datetime.add_months(frappe.datetime.get_today(), -11),
					to_date: frappe.datetime.get_today(),
					period_type: "monthly",
					cost_center: "",
				};
			}

			make() {
				this.render_layout();
				this.bind_events();
				this.load_companies();
				this.load_cost_centers();
				this.refresh();
			}

			render_layout() {
				this.page.main.html(`
					<div class="pf-dashboard-root funds-dashboard-root">
						<div class="pf-hero">
							<div class="pf-hero__left">
								<h1 class="pf-hero__title">${__("Funds Dashboard")}</h1>
								<p class="pf-hero__sub">${__("Monitor donations, other income, donors, payment sources, and cost-center movement in one finance view.")}</p>
								<div class="pf-hero__badges funds-badges"></div>
							</div>
							<div class="pf-hero__links">
								<a href="/app/donation">${__("Donations")}</a>
								<a href="/app/donor">${__("Donors")}</a>
								<a href="/app/donation-analytics">${__("Donation Analytics")}</a>
								<a href="/app/procurement-expense">${__("Expense Report")}</a>
							</div>
						</div>

						<div class="pf-toolbar">
							<div class="filter-field">
								<label>${__("Company")}</label>
								<select class="form-control company-filter"></select>
							</div>
							<div class="filter-field">
								<label>${__("From Date")}</label>
								<input type="date" class="form-control from-date" />
							</div>
							<div class="filter-field">
								<label>${__("To Date")}</label>
								<input type="date" class="form-control to-date" />
							</div>
							<div class="filter-field">
								<label>${__("Period")}</label>
								<select class="form-control period-type">
									<option value="monthly">${__("Monthly")}</option>
									<option value="quarterly">${__("Quarterly")}</option>
									<option value="yearly">${__("Yearly")}</option>
								</select>
							</div>
							<div class="filter-field">
								<label>${__("Cost Center")}</label>
								<select class="form-control cost-center-filter"></select>
							</div>
							<div class="filter-field funds-quick-ranges">
								<label>${__("Quick Range")}</label>
								<button class="btn btn-default btn-xs quick-range" data-months="1">${__("1M")}</button>
								<button class="btn btn-default btn-xs quick-range" data-months="3">${__("3M")}</button>
								<button class="btn btn-default btn-xs quick-range" data-months="6">${__("6M")}</button>
								<button class="btn btn-default btn-xs quick-range active" data-months="12">${__("12M")}</button>
							</div>
							<div class="pf-toolbar__actions">
								<button class="btn btn-primary btn-sm btn-refresh"><i class="fa fa-filter"></i> ${__("Apply")}</button>
								<button class="btn btn-default btn-sm btn-reset"><i class="fa fa-refresh"></i> ${__("Reset")}</button>
								<button class="btn btn-success btn-sm btn-export"><i class="fa fa-file-excel-o"></i> ${__("Export")}</button>
								<button class="btn btn-default btn-sm btn-print"><i class="fa fa-print"></i> ${__("Print")}</button>
							</div>
						</div>

						<div class="funds-filter-strip"></div>

						<div class="pf-kpi-grid funds-kpi-primary"></div>
						<div class="pf-kpi-grid pf-kpi-grid--secondary funds-kpi-secondary"></div>

						<div class="pf-charts">
							<div class="pf-panel">
								<div class="pf-panel__head">
									<h3 class="pf-panel__title">${__("Income & Donation Trend")}</h3>
									<span class="pf-panel__hint funds-period-hint"></span>
								</div>
								<div class="pf-chart-area" id="funds-trend-chart"></div>
							</div>
							<div class="pf-panel">
								<div class="pf-panel__head">
									<h3 class="pf-panel__title">${__("Fund Sources")}</h3>
									<span class="pf-panel__hint">${__("Donation types and income accounts")}</span>
								</div>
								<div class="pf-chart-area pf-chart-area--sm" id="funds-source-chart"></div>
							</div>
						</div>

						<div class="pf-charts">
							<div class="pf-panel">
								<div class="pf-panel__head">
									<h3 class="pf-panel__title">${__("Daily Fund Movement")}</h3>
									<span class="pf-panel__hint">${__("Day-by-day donation and income movement")}</span>
								</div>
								<div class="pf-chart-area" id="funds-daily-chart"></div>
							</div>
							<div class="pf-panel">
								<div class="pf-panel__head">
									<h3 class="pf-panel__title">${__("Payment Method Split")}</h3>
									<span class="pf-panel__hint">${__("Donation receipts only")}</span>
								</div>
								<div class="pf-chart-area pf-chart-area--sm" id="funds-payment-chart"></div>
							</div>
						</div>

						<div class="pf-panel funds-feature-panel" style="margin-bottom:16px">
							<div class="pf-panel__head">
								<h3 class="pf-panel__title">${__("Bank-wise Donations")}</h3>
								<span class="pf-panel__hint">${__("Donation receipts grouped by selected bank account")}</span>
							</div>
							<div class="pf-chart-area" id="funds-bank-chart"></div>
						</div>

						<div class="pf-panel" style="margin-bottom:16px">
							<div class="pf-panel__head">
								<h3 class="pf-panel__title">${__("Cost Center Breakdown")}</h3>
								<span class="pf-panel__hint">${__("Top cost centers by total funds")}</span>
							</div>
							<div class="pf-chart-area" id="funds-department-chart"></div>
						</div>

						<div class="pf-charts">
							<div class="pf-panel">
								<div class="pf-panel__head">
									<h3 class="pf-panel__title">${__("Donation Types")}</h3>
									<span class="pf-panel__hint">${__("Received amount by donation type")}</span>
								</div>
								<div class="pf-chart-area" id="funds-donation-type-chart"></div>
							</div>
							<div class="pf-panel">
								<div class="pf-panel__head">
									<h3 class="pf-panel__title">${__("Donation Categories")}</h3>
									<span class="pf-panel__hint">${__("Zakat, Sadaqah, General Fund, Project")}</span>
								</div>
								<div class="pf-chart-area pf-chart-area--sm" id="funds-donation-category-chart"></div>
							</div>
						</div>

						<div class="pf-charts">
							<div class="pf-panel">
								<div class="pf-panel__head">
									<h3 class="pf-panel__title">${__("Income Accounts")}</h3>
									<span class="pf-panel__hint">${__("Non-donation income GL entries by account")}</span>
								</div>
								<div class="pf-chart-area" id="funds-income-account-chart"></div>
							</div>
							<div class="pf-panel">
								<div class="pf-panel__head">
									<h3 class="pf-panel__title">${__("Donation Size Buckets")}</h3>
									<span class="pf-panel__hint">${__("Receipt count by amount range")}</span>
								</div>
								<div class="pf-chart-area pf-chart-area--sm" id="funds-donation-buckets-chart"></div>
							</div>
						</div>

						<div class="pf-panel funds-donut-showcase" style="margin-bottom:16px">
							<div class="pf-panel__head">
								<h3 class="pf-panel__title">${__("Recommended Donut Insights")}</h3>
								<span class="pf-panel__hint">${__("Click slices to filter the recent funds table or drill into cost centers")}</span>
							</div>
							<div class="funds-donut-grid">
								<div class="funds-donut-card">
									<div class="funds-mini-title">${__("Funds Mix")}</div>
									<div class="pf-chart-area pf-chart-area--sm" id="funds-mix-donut-chart"></div>
								</div>
								<div class="funds-donut-card">
									<div class="funds-mini-title">${__("Top Donor Share")}</div>
									<div class="pf-chart-area pf-chart-area--sm" id="funds-top-donor-donut-chart"></div>
								</div>
								<div class="funds-donut-card">
									<div class="funds-mini-title">${__("Bank Donation Share")}</div>
									<div class="pf-chart-area pf-chart-area--sm" id="funds-bank-donut-chart"></div>
								</div>
								<div class="funds-donut-card">
									<div class="funds-mini-title">${__("Cost Center Share")}</div>
									<div class="pf-chart-area pf-chart-area--sm" id="funds-cost-center-donut-chart"></div>
								</div>
								<div class="funds-donut-card">
									<div class="funds-mini-title">${__("Income Account Share")}</div>
									<div class="pf-chart-area pf-chart-area--sm" id="funds-income-account-donut-chart"></div>
								</div>
								<div class="funds-donut-card funds-donut-card--wide">
									<div class="funds-mini-title">${__("Donation Bucket Amount Share")}</div>
									<div class="pf-chart-area pf-chart-area--sm" id="funds-bucket-amount-donut-chart"></div>
								</div>
							</div>
						</div>

						<div class="pf-charts">
							<div class="pf-panel">
								<div class="pf-panel__head">
									<h3 class="pf-panel__title">${__("Weekday Pattern")}</h3>
									<span class="pf-panel__hint">${__("Which weekdays bring funds in")}</span>
								</div>
								<div class="pf-chart-area" id="funds-weekday-chart"></div>
							</div>
							<div class="pf-panel">
								<div class="pf-panel__head">
									<h3 class="pf-panel__title">${__("Month Seasonality")}</h3>
									<span class="pf-panel__hint">${__("Calendar-month funding pattern")}</span>
								</div>
								<div class="pf-chart-area pf-chart-area--sm" id="funds-month-seasonality-chart"></div>
							</div>
						</div>

						<div class="pf-bottom">
							<div class="pf-panel">
								<div class="pf-panel__head">
									<h3 class="pf-panel__title">${__("Top Donors")}</h3>
									<span class="pf-panel__hint">${__("Donors by received amount")}</span>
								</div>
								<ul class="pf-rank-list" id="funds-top-employees"></ul>
							</div>
							<div class="pf-panel">
								<div class="pf-panel__head">
									<h3 class="pf-panel__title">${__("Recent Funds")}</h3>
									<span class="pf-panel__hint">${__("Latest 100 entries")}</span>
								</div>
								<div class="pf-table-search">
									<input type="text" class="form-control log-search" placeholder="${__("Search donor, bank, cost center, source...")}" />
								</div>
								<div class="pf-table-wrap" id="funds-recent-logs"></div>
							</div>
						</div>

						<div class="pf-panel" style="margin-top:16px">
							<div class="pf-panel__head">
								<h3 class="pf-panel__title">${__("Summary by Cost Center")}</h3>
							</div>
							<div class="pf-table-wrap" id="funds-department-table"></div>
						</div>

						<div class="pf-bottom" style="margin-top:16px">
							<div class="pf-panel">
								<div class="pf-panel__head">
									<h3 class="pf-panel__title">${__("Source Ledger")}</h3>
									<span class="pf-panel__hint">${__("Donation type + income account detail")}</span>
								</div>
								<div class="pf-table-wrap" id="funds-source-table"></div>
							</div>
							<div class="pf-panel">
								<div class="pf-panel__head">
									<h3 class="pf-panel__title">${__("Income Account Detail")}</h3>
									<span class="pf-panel__hint">${__("Income GL accounts only")}</span>
								</div>
								<div class="pf-table-wrap" id="funds-income-account-table"></div>
							</div>
						</div>

						<div class="pf-config funds-config-strip"></div>
					</div>
				`);

				this.$company = this.page.main.find(".company-filter");
				this.$from_date = this.page.main.find(".from-date");
				this.$to_date = this.page.main.find(".to-date");
				this.$period_type = this.page.main.find(".period-type");
				this.$cost_center = this.page.main.find(".cost-center-filter");
				this.$log_search = this.page.main.find(".log-search");
				this.$from_date.val(this.filters.from_date);
				this.$to_date.val(this.filters.to_date);
				this.$period_type.val(this.filters.period_type);
			}

			bind_events() {
				this.page.main.find(".btn-refresh").on("click", () => this.refresh());
				this.page.main.find(".btn-reset").on("click", () => this.reset_filters());
				this.page.main.find(".btn-export").on("click", () => this.export_csv());
				this.page.main.find(".btn-print").on("click", () => window.print());
				this.$log_search.on("input", () => this.filter_logs_table());
				this.page.main.find(".quick-range").on("click", (event) => this.apply_quick_range(event));
			}

			load_companies() {
				frappe.call({
					method: "frappe.client.get_list",
					args: { doctype: "Company", fields: ["name"], order_by: "name" },
					callback: (response) => {
						this.$company.empty();
						(response.message || []).forEach((company) => {
							this.$company.append(`<option value="${this.escape(company.name)}">${this.escape(company.name)}</option>`);
						});
						if (this.filters.company) this.$company.val(this.filters.company);
					},
				});
			}

			load_cost_centers() {
				this.$cost_center.html(`<option value="">${__("All Cost Centers")}</option>`);
				frappe.call({
					method: "frappe.client.get_list",
					args: { doctype: "Cost Center", fields: ["name"], order_by: "name", limit_page_length: 500 },
					callback: (response) => {
						(response.message || []).forEach((cost_center) => {
							this.$cost_center.append(`<option value="${this.escape(cost_center.name)}">${this.escape(cost_center.name)}</option>`);
						});
					},
				});
			}

			get_filters() {
				return {
					company: this.$company.val(),
					from_date: this.$from_date.val(),
					to_date: this.$to_date.val(),
					period_type: this.$period_type.val(),
					cost_center: this.$cost_center.val(),
				};
			}

			reset_filters() {
				this.$from_date.val(frappe.datetime.add_months(frappe.datetime.get_today(), -11));
				this.$to_date.val(frappe.datetime.get_today());
				this.$period_type.val("monthly");
				this.$cost_center.val("");
				this.page.main.find(".quick-range").removeClass("active");
				this.page.main.find('.quick-range[data-months="12"]').addClass("active");
				this.refresh();
			}

			apply_quick_range(event) {
				const months = parseInt($(event.currentTarget).data("months"), 10) || 12;
				this.page.main.find(".quick-range").removeClass("active");
				$(event.currentTarget).addClass("active");
				this.$from_date.val(frappe.datetime.add_months(frappe.datetime.get_today(), -months));
				this.$to_date.val(frappe.datetime.get_today());
				this.refresh();
			}

			refresh() {
				this.page.main.find(".funds-dashboard-root").addClass("is-loading");
				frappe.call({
					method: "tif_customization.tif_customization.page.funds_dashboard.funds_dashboard.get_dashboard_data",
					args: this.get_filters(),
					freeze: true,
					freeze_message: __("Loading funds dashboard..."),
					callback: (response) => {
						this.data = response.message || {};
						this.render(this.data);
					},
					always: () => {
						this.page.main.find(".funds-dashboard-root").removeClass("is-loading");
					},
				});
			}

			render(data) {
				const summary = data.summary || {};
				const settings = data.settings || {};
				this.page.main.find(".funds-badges").html(`
					<span class="pf-badge">${this.escape(data.company || "")}</span>
					<span class="pf-badge">${frappe.datetime.str_to_user(data.from_date)} – ${frappe.datetime.str_to_user(data.to_date)}</span>
					<span class="pf-badge">${this.escape((data.period_type || "monthly").toUpperCase())}</span>
				`);
				this.render_active_filters(data);

				this.page.main.find(".funds-kpi-primary").html(`
					<div class="pf-kpi pf-kpi--highlight" style="--pf-kpi-accent:#ff7a2f">
						<div class="pf-kpi__icon"><i class="fa fa-bank"></i></div>
						<div class="pf-kpi__label">${__("Total Fund")}</div>
						<div class="pf-kpi__value">${this.fmt_money(summary.total_funds)}</div>
						<div class="pf-kpi__meta">${__("Selected period")}</div>
					</div>
					<div class="pf-kpi" style="--pf-kpi-accent:#7048e8">
						<div class="pf-kpi__icon"><i class="fa fa-heart"></i></div>
						<div class="pf-kpi__label">${__("Donation Received")}</div>
						<div class="pf-kpi__value">${this.fmt_money(summary.donation_total)}</div>
						<div class="pf-kpi__meta">${summary.donation_count || 0} ${__("receipts")} · ${summary.unique_donors || 0} ${__("donors")}</div>
					</div>
					<div class="pf-kpi" style="--pf-kpi-accent:#12b886">
						<div class="pf-kpi__icon"><i class="fa fa-line-chart"></i></div>
						<div class="pf-kpi__label">${__("Other Income")}</div>
						<div class="pf-kpi__value">${this.fmt_money(summary.income_total)}</div>
						${this.trend_html(summary.period_change_pct)}
					</div>
					<div class="pf-kpi" style="--pf-kpi-accent:#1c7ed6">
						<div class="pf-kpi__icon"><i class="fa fa-clock-o"></i></div>
						<div class="pf-kpi__label">${__("Outstanding Donations")}</div>
						<div class="pf-kpi__value">${this.fmt_money(summary.outstanding_amount)}</div>
						<div class="pf-kpi__meta">${__("Donation pledges not received")}</div>
					</div>
				`);

				this.page.main.find(".funds-kpi-secondary").html(`
					<div class="pf-kpi" style="--pf-kpi-accent:#1c7ed6">
						<div class="pf-kpi__label">${__("Unique Donors")}</div>
						<div class="pf-kpi__value" style="font-size:18px">${summary.unique_donors || 0}</div>
					</div>
					<div class="pf-kpi" style="--pf-kpi-accent:#64748b">
						<div class="pf-kpi__label">${__("Donation Receipts")}</div>
						<div class="pf-kpi__value" style="font-size:18px">${summary.donation_count || 0}</div>
					</div>
					<div class="pf-kpi" style="--pf-kpi-accent:#ff7a2f">
						<div class="pf-kpi__label">${__("Current Period")}</div>
						<div class="pf-kpi__value" style="font-size:18px">${this.fmt_money(summary.current_period_total)}</div>
					</div>
					<div class="pf-kpi" style="--pf-kpi-accent:#e8590c">
						<div class="pf-kpi__label">${__("Income Entries")}</div>
						<div class="pf-kpi__value" style="font-size:18px">${summary.income_entry_count || 0}</div>
						<div class="pf-kpi__meta">${__("Non-donation income GL entries")}</div>
					</div>
				`);

				this.page.main.find(".funds-period-hint").text(`${data.period_data?.length || 0} ${__("periods")}`);
				this.render_trend_chart(data.period_data || []);
				this.render_source_chart(data.source_data || []);
				this.render_daily_chart(data.daily_data || []);
				this.render_payment_chart(data.payment_method_data || []);
				this.render_bank_account_chart(data.bank_account_data || []);
				this.render_department_chart(data.cost_center_data || []);
				this.render_donation_type_chart(data.donation_type_data || []);
				this.render_donation_category_chart(data.donation_category_data || []);
				this.render_income_account_chart(data.income_account_data || []);
				this.render_donation_buckets_chart(data.donation_buckets || []);
				this.render_funds_mix_donut(summary);
				this.render_top_donor_donut(data.top_donors || []);
				this.render_bank_account_donut(data.bank_account_data || []);
				this.render_cost_center_donut(data.cost_center_data || []);
				this.render_income_account_donut(data.income_account_data || []);
				this.render_bucket_amount_donut(data.donation_buckets || []);
				this.render_weekday_chart(data.weekday_data || []);
				this.render_month_seasonality_chart(data.month_of_year_data || []);
				this.render_top_employees(data.top_donors || []);
				this.render_recent(data.recent_logs || []);
				this.render_department_table(data.cost_center_data || []);
				this.render_source_table(data.source_data || []);
				this.render_income_account_table(data.income_account_data || []);
				this.render_config(settings);
			}

			render_active_filters(data) {
				const chips = [
					`${__("Company")}: ${data.company || __("All")}`,
					`${__("Date")}: ${frappe.datetime.str_to_user(data.from_date)} → ${frappe.datetime.str_to_user(data.to_date)}`,
					`${__("Period")}: ${(data.period_type || "monthly").toUpperCase()}`,
				];
				if (data.cost_center) {
					chips.push(`${__("Cost Center")}: ${data.cost_center}`);
				}
				this.page.main.find(".funds-filter-strip").html(
					chips.map((chip) => `<span class="funds-filter-chip"><i class="fa fa-sliders"></i>${this.escape(chip)}</span>`).join(""),
				);
			}

			render_trend_chart(rows) {
				const element = document.getElementById("funds-trend-chart");
				if (!element) return;
				if (!rows.some((row) => row.total_funds > 0)) {
					this.destroy_chart("trend_chart");
					this.empty_chart(element, __("No fund data yet"), __("Submitted donations and income GL entries will appear here."));
					return;
				}
				this.destroy_chart("trend_chart");
				this.trend_chart = new Chart(this.get_chart_context(element, 300), {
					type: "bar",
					data: {
						labels: rows.map((row) => row.label),
						datasets: [
							{
								label: __("Donations"),
								data: rows.map((row) => row.donation_amount),
								backgroundColor: "#ff7a2f",
								borderColor: "#ff7a2f",
							},
							{
								label: __("Income"),
								data: rows.map((row) => row.income_amount),
								backgroundColor: "#ffd8c2",
								borderColor: "#e8590c",
							},
						],
					},
					options: this.get_chart_options({ stacked: true }),
				});
			}

			render_source_chart(rows) {
				const element = document.getElementById("funds-source-chart");
				if (!element) return;
				if (!rows.length) {
					this.destroy_chart("source_chart");
					this.empty_chart(element, __("No sources"), __("Donation types and income accounts will appear here."));
					return;
				}
				this.destroy_chart("source_chart");
				this.source_chart = new Chart(this.get_chart_context(element, 240), {
					type: "doughnut",
					data: {
						labels: rows.slice(0, 8).map((row) => row.source),
						datasets: [{
							data: rows.slice(0, 8).map((row) => Math.abs(flt(row.amount))),
							backgroundColor: this.chart_colors(),
							borderColor: "#ffffff",
							borderWidth: 2,
							hoverOffset: 14,
							spacing: 2,
						}],
					},
					options: this.get_chart_options({
						legend: true,
						doughnut: true,
						on_click: (index) => this.focus_search(rows.slice(0, 8)[index]?.source, __("Source selected")),
					}),
				});
			}

			render_daily_chart(rows) {
				const element = document.getElementById("funds-daily-chart");
				if (!element) return;
				const plotted = rows.filter((row) => flt(row.total_funds) !== 0);
				const display_rows = plotted.length > 60 ? plotted.slice(plotted.length - 60) : plotted;
				if (!display_rows.length) {
					this.destroy_chart("daily_chart");
					this.empty_chart(element, __("No daily movement"), __("Daily funds appear once there are donations or income entries."));
					return;
				}
				this.destroy_chart("daily_chart");
				this.daily_chart = new Chart(this.get_chart_context(element, 300), {
					type: "line",
					data: {
						labels: display_rows.map((row) => row.label),
						datasets: [
							this.line_dataset(__("Donations"), display_rows.map((row) => row.donation_amount), "#ff7a2f"),
							this.line_dataset(__("Income"), display_rows.map((row) => row.income_amount), "#12b886"),
							this.line_dataset(__("Total"), display_rows.map((row) => row.total_funds), "#1c7ed6"),
						],
					},
					options: this.get_chart_options(),
				});
			}

			render_payment_chart(rows) {
				const element = document.getElementById("funds-payment-chart");
				if (!element) return;
				if (!rows.length) {
					this.destroy_chart("payment_chart");
					this.empty_chart(element, __("No payment methods"), __("Payment split appears from submitted donation receipts."));
					return;
				}
				this.destroy_chart("payment_chart");
				this.payment_chart = new Chart(this.get_chart_context(element, 240), {
					type: "doughnut",
					data: {
						labels: rows.map((row) => row.payment_method),
						datasets: [{
							data: rows.map((row) => Math.abs(flt(row.amount))),
							backgroundColor: this.chart_colors(),
							borderColor: "#ffffff",
							borderWidth: 2,
							hoverOffset: 14,
							spacing: 2,
						}],
					},
					options: this.get_chart_options({
						legend: true,
						doughnut: true,
						on_click: (index) => this.focus_search(rows[index]?.payment_method, __("Payment method selected")),
					}),
				});
			}

			render_bank_account_chart(rows) {
				this.render_donut_chart({
					element_id: "funds-bank-chart",
					chart_key: "bank_account_chart",
					rows,
					label_field: "bank_account",
					value_field: "amount",
					title: __("No bank-wise donations"),
					hint: __("Select Bank Account on Donation receipts to see bank-wise donation split."),
					on_click: (index) => this.focus_search(rows[index]?.bank_account, __("Bank selected")),
					height: 300,
					cutout: "56%",
				});
			}

			render_department_chart(rows) {
				const element = document.getElementById("funds-department-chart");
				if (!element) return;
				if (!rows.length) {
					this.destroy_chart("department_chart");
					this.empty_chart(element, __("No cost center data"), __("Cost center totals appear after donations or income entries are posted."));
					return;
				}
				this.destroy_chart("department_chart");
				const top_rows = rows.slice(0, 12);
				this.department_chart = new Chart(this.get_chart_context(element, Math.max(300, top_rows.length * 34)), {
					type: "bar",
					data: {
						labels: top_rows.map((row) => (row.cost_center || "").substring(0, 24)),
						datasets: [{
							label: __("Total Funds"),
							data: top_rows.map((row) => row.total_funds),
							backgroundColor: "#ff7a2f",
							borderColor: "#ff7a2f",
						}],
					},
					options: this.get_chart_options({
						index_axis: "y",
						on_click: (index) => this.apply_cost_center(top_rows[index]?.cost_center),
					}),
				});
			}

			render_donation_type_chart(rows) {
				this.render_simple_bar_chart({
					element_id: "funds-donation-type-chart",
					chart_key: "donation_type_chart",
					rows,
					label_field: "donation_type",
					value_field: "amount",
					title: __("No donation types"),
					hint: __("Donation type split appears from submitted donation receipts."),
					color: "#ff7a2f",
					on_click: (index) => this.focus_search(rows[index]?.donation_type, __("Donation type selected")),
				});
			}

			render_donation_category_chart(rows) {
				const element = document.getElementById("funds-donation-category-chart");
				if (!element) return;
				if (!rows.length) {
					this.destroy_chart("donation_category_chart");
					this.empty_chart(element, __("No categories"), __("Donation categories appear from Donation Type setup."));
					return;
				}
				this.destroy_chart("donation_category_chart");
				this.donation_category_chart = new Chart(this.get_chart_context(element, 240), {
					type: "doughnut",
					data: {
						labels: rows.map((row) => row.donation_category),
						datasets: [{
							data: rows.map((row) => Math.abs(flt(row.amount))),
							backgroundColor: this.chart_colors(),
							borderColor: "#ffffff",
							borderWidth: 2,
							hoverOffset: 14,
							spacing: 2,
						}],
					},
					options: this.get_chart_options({
						legend: true,
						doughnut: true,
						on_click: (index) => this.focus_search(rows[index]?.donation_category, __("Donation category selected")),
					}),
				});
			}

			render_funds_mix_donut(summary) {
				const rows = [
					{ label: __("Donations"), amount: summary.donation_total, search: __("Donation") },
					{ label: __("Other Income"), amount: summary.income_total, search: __("Income") },
					{ label: __("Outstanding"), amount: summary.outstanding_amount, search: "" },
				].filter((row) => Math.abs(flt(row.amount)) > 0);
				this.render_donut_chart({
					element_id: "funds-mix-donut-chart",
					chart_key: "funds_mix_donut_chart",
					rows,
					label_field: "label",
					value_field: "amount",
					title: __("No funds mix yet"),
					hint: __("Donations, income, and outstanding pledges appear here."),
					on_click: (index) => this.focus_search(rows[index]?.search || rows[index]?.label, __("Funds mix selected")),
				});
			}

			render_top_donor_donut(rows) {
				const top_rows = rows.slice(0, 8);
				this.render_donut_chart({
					element_id: "funds-top-donor-donut-chart",
					chart_key: "top_donor_donut_chart",
					rows: top_rows,
					label_field: "donor_name",
					fallback_label_field: "donor",
					value_field: "donation_amount",
					title: __("No donor share yet"),
					hint: __("Top donor percentage split appears after donation receipts."),
					on_click: (index) => this.focus_search(top_rows[index]?.donor_name || top_rows[index]?.donor, __("Donor selected")),
				});
			}

			render_bank_account_donut(rows) {
				const top_rows = rows.slice(0, 8);
				this.render_donut_chart({
					element_id: "funds-bank-donut-chart",
					chart_key: "bank_account_donut_chart",
					rows: top_rows,
					label_field: "bank_account",
					value_field: "amount",
					title: __("No bank share yet"),
					hint: __("Bank-wise donation share appears after selecting bank accounts on receipts."),
					on_click: (index) => this.focus_search(top_rows[index]?.bank_account, __("Bank selected")),
				});
			}

			render_cost_center_donut(rows) {
				const top_rows = rows.slice(0, 8);
				this.render_donut_chart({
					element_id: "funds-cost-center-donut-chart",
					chart_key: "cost_center_donut_chart",
					rows: top_rows,
					label_field: "cost_center",
					value_field: "total_funds",
					title: __("No cost center share"),
					hint: __("Click a slice to drill into that cost center."),
					on_click: (index) => this.apply_cost_center(top_rows[index]?.cost_center),
				});
			}

			render_income_account_donut(rows) {
				const top_rows = rows.slice(0, 8);
				this.render_donut_chart({
					element_id: "funds-income-account-donut-chart",
					chart_key: "income_account_donut_chart",
					rows: top_rows,
					label_field: "account",
					value_field: "amount",
					title: __("No income account share"),
					hint: __("Income GL account percentage split appears here."),
					on_click: (index) => this.focus_search(top_rows[index]?.account, __("Income account selected")),
				});
			}

			render_bucket_amount_donut(rows) {
				this.render_donut_chart({
					element_id: "funds-bucket-amount-donut-chart",
					chart_key: "bucket_amount_donut_chart",
					rows,
					label_field: "label",
					value_field: "amount",
					title: __("No bucket amount share"),
					hint: __("Donation amount share by receipt size appears here."),
					on_click: (index) => {
						const label = rows[index]?.label;
						if (!label) return;
						frappe.show_alert({ message: __("Donation bucket selected: {0}", [label]), indicator: "purple" }, 4);
					},
				});
			}

			render_income_account_chart(rows) {
				this.render_simple_bar_chart({
					element_id: "funds-income-account-chart",
					chart_key: "income_account_chart",
					rows: rows.slice(0, 12),
					label_field: "account",
					value_field: "amount",
					title: __("No income accounts"),
					hint: __("Income account split appears from GL entries."),
					color: "#12b886",
					on_click: (index) => this.focus_search(rows.slice(0, 12)[index]?.account, __("Income account selected")),
				});
			}

			render_donation_buckets_chart(rows) {
				const element = document.getElementById("funds-donation-buckets-chart");
				if (!element) return;
				if (!rows.some((row) => row.count > 0)) {
					this.destroy_chart("donation_buckets_chart");
					this.empty_chart(element, __("No donation sizes"), __("Donation amount buckets appear after receipts are submitted."));
					return;
				}
				this.destroy_chart("donation_buckets_chart");
				this.donation_buckets_chart = new Chart(this.get_chart_context(element, 240), {
					type: "bar",
					data: {
						labels: rows.map((row) => row.label),
						datasets: [{
							label: __("Receipts"),
							data: rows.map((row) => row.count),
							backgroundColor: "#ff7a2f",
							borderColor: "#ff7a2f",
						}],
					},
					options: this.get_chart_options(),
				});
			}

			render_weekday_chart(rows) {
				this.render_simple_bar_chart({
					element_id: "funds-weekday-chart",
					chart_key: "weekday_chart",
					rows,
					label_field: "label",
					value_field: "amount",
					title: __("No weekday pattern"),
					hint: __("Weekday pattern appears after funds are recorded."),
					color: "#7048e8",
				});
			}

			render_month_seasonality_chart(rows) {
				this.render_simple_bar_chart({
					element_id: "funds-month-seasonality-chart",
					chart_key: "month_seasonality_chart",
					rows,
					label_field: "label",
					value_field: "amount",
					title: __("No month pattern"),
					hint: __("Month seasonality appears after funds are recorded."),
					color: "#1c7ed6",
				});
			}

			render_donut_chart({ element_id, chart_key, rows, label_field, fallback_label_field, value_field, title, hint, on_click, height = 235, cutout = "64%" }) {
				const element = document.getElementById(element_id);
				if (!element) return;
				const filtered_rows = (rows || []).filter((row) => Math.abs(flt(row[value_field])) > 0);
				if (!filtered_rows.length) {
					this.destroy_chart(chart_key);
					this.empty_chart(element, title, hint);
					return;
				}
				this.destroy_chart(chart_key);
				this[chart_key] = new Chart(this.get_chart_context(element, height), {
					type: "doughnut",
					data: {
						labels: filtered_rows.map((row) => (row[label_field] || row[fallback_label_field] || __("Unspecified")).substring(0, 24)),
						datasets: [{
							data: filtered_rows.map((row) => Math.abs(flt(row[value_field]))),
							backgroundColor: this.chart_colors(),
							borderColor: "#ffffff",
							borderWidth: 2,
							hoverOffset: 16,
							spacing: 3,
						}],
					},
					options: this.get_chart_options({
						legend: true,
						doughnut: true,
						cutout,
						on_click: (index) => on_click?.(index),
					}),
				});
			}

			render_simple_bar_chart({ element_id, chart_key, rows, label_field, value_field, title, hint, color, on_click }) {
				const element = document.getElementById(element_id);
				if (!element) return;
				if (!rows.length || !rows.some((row) => flt(row[value_field]) !== 0)) {
					this.destroy_chart(chart_key);
					this.empty_chart(element, title, hint);
					return;
				}
				this.destroy_chart(chart_key);
				this[chart_key] = new Chart(this.get_chart_context(element, Math.max(260, Math.min(430, rows.length * 34))), {
					type: "bar",
					data: {
						labels: rows.map((row) => (row[label_field] || "").substring(0, 28)),
						datasets: [{
							label: __("Amount"),
							data: rows.map((row) => row[value_field]),
							backgroundColor: color,
							borderColor: color,
						}],
					},
					options: this.get_chart_options({ index_axis: rows.length > 7 ? "y" : "x", on_click }),
				});
			}

			render_top_employees(rows) {
				const $element = this.page.main.find("#funds-top-employees");
				if (!rows.length) {
					$element.html(`<li class="pf-empty" style="list-style:none">${__("No donor data in this period.")}</li>`);
					return;
				}
				const html = rows.slice(0, 10).map((row, index) => `
					<li class="pf-rank-item">
						<span class="pf-rank-num ${index === 0 ? "pf-rank-num--1" : ""}">${index + 1}</span>
						<div class="pf-rank-info">
							<div class="pf-rank-name">${this.escape(row.donor_name || row.donor)}</div>
							<div class="pf-rank-dept">${row.donation_count || 0} ${__("receipt(s)")}</div>
						</div>
						<div class="pf-rank-amt">${this.fmt_money(row.donation_amount)}</div>
					</li>`).join("");
				$element.html(html);
			}

			render_recent(rows) {
				const $wrap = this.page.main.find("#funds-recent-logs");
				if (!rows.length) {
					$wrap.html(`<div class="pf-empty"><div class="pf-empty__icon"><i class="fa fa-list-alt"></i></div><div class="pf-empty__title">${__("No funds yet")}</div><div class="pf-empty__text">${__("Submitted donations and income entries will appear here.")}</div></div>`);
					return;
				}
				let html = `<table class="pf-table funds-logs-table"><thead><tr>
					<th>${__("Date")}</th><th>${__("Party / Voucher")}</th><th>${__("Cost Center")}</th><th>${__("Bank")}</th><th>${__("Type")}</th>
					<th>${__("Source")}</th><th class="text-right">${__("Amount")}</th><th></th>
				</tr></thead><tbody>`;
				rows.forEach((row) => {
					html += `<tr data-search="${this.escape(`${row.party || ""} ${row.cost_center || ""} ${row.bank_account || ""} ${row.source || ""} ${row.source_type || ""}`.toLowerCase())}">
						<td>${frappe.datetime.str_to_user(row.posting_date)}</td>
						<td><strong>${this.escape(row.party || "")}</strong></td>
						<td>${this.escape(row.cost_center || "")}</td>
						<td>${this.escape(row.bank_account || "")}</td>
						<td><span class="pf-source-tag">${this.escape(row.source_type || "")}</span></td>
						<td><span class="pf-source-tag">${this.escape(row.source || "")}</span></td>
						<td class="text-right"><strong>${this.fmt_money(row.amount)}</strong></td>
						<td><a href="${this.escape(row.route || "#")}">${__("Open")}</a></td>
					</tr>`;
				});
				html += "</tbody></table>";
				$wrap.html(html);
			}

			render_department_table(rows) {
				const $wrap = this.page.main.find("#funds-department-table");
				if (!rows.length) {
					$wrap.html(`<div class="pf-empty">${__("No cost center summary available.")}</div>`);
					return;
				}
				let html = `<table class="pf-table"><thead><tr>
					<th>${__("Cost Center")}</th><th class="text-right">${__("Donations")}</th>
					<th class="text-right">${__("Income")}</th><th class="text-right">${__("Total Funds")}</th>
					<th class="text-right">${__("Transactions")}</th>
				</tr></thead><tbody>`;
				rows.forEach((row) => {
					html += `<tr>
						<td>${this.escape(row.cost_center || "")}</td>
						<td class="text-right">${this.fmt_money(row.donation_amount)}</td>
						<td class="text-right">${this.fmt_money(row.income_amount)}</td>
						<td class="text-right"><strong>${this.fmt_money(row.total_funds)}</strong></td>
						<td class="text-right">${row.transaction_count || 0}</td>
					</tr>`;
				});
				html += "</tbody></table>";
				$wrap.html(html);
			}

			render_source_table(rows) {
				const $wrap = this.page.main.find("#funds-source-table");
				if (!rows.length) {
					$wrap.html(`<div class="pf-empty">${__("No source summary available.")}</div>`);
					return;
				}
				let html = `<table class="pf-table"><thead><tr>
					<th>${__("Source")}</th><th class="text-right">${__("Amount")}</th><th class="text-right">${__("Count")}</th>
				</tr></thead><tbody>`;
				rows.slice(0, 20).forEach((row) => {
					html += `<tr>
						<td>${this.escape(row.source || "")}</td>
						<td class="text-right"><strong>${this.fmt_money(row.amount)}</strong></td>
						<td class="text-right">${row.count || 0}</td>
					</tr>`;
				});
				html += "</tbody></table>";
				$wrap.html(html);
			}

			render_income_account_table(rows) {
				const $wrap = this.page.main.find("#funds-income-account-table");
				if (!rows.length) {
					$wrap.html(`<div class="pf-empty">${__("No income account summary available.")}</div>`);
					return;
				}
				let html = `<table class="pf-table"><thead><tr>
					<th>${__("Income Account")}</th><th class="text-right">${__("Amount")}</th><th class="text-right">${__("Entries")}</th>
				</tr></thead><tbody>`;
				rows.slice(0, 20).forEach((row) => {
					html += `<tr>
						<td>${this.escape(row.account || "")}</td>
						<td class="text-right"><strong>${this.fmt_money(row.amount)}</strong></td>
						<td class="text-right">${row.count || 0}</td>
					</tr>`;
				});
				html += "</tbody></table>";
				$wrap.html(html);
			}

			render_config(settings) {
				const $strip = this.page.main.find(".funds-config-strip");
				if (!settings.donation_income_account && !settings.bank_account && !settings.cash_account) {
					$strip.addClass("pf-config--warn").html(`<span>${__("Donation Settings are not configured.")}</span>`);
					return;
				}
				$strip.removeClass("pf-config--warn").html(`
					<span class="pf-config__item">${__("Donation Income")}: <strong>${this.escape(settings.donation_income_account || "")}</strong></span>
					<span class="pf-config__item">${__("Restricted Liability")}: <strong>${this.escape(settings.restricted_liability_account || "")}</strong></span>
					<span class="pf-config__item">${__("Bank")}: <strong>${this.escape(settings.bank_account || "")}</strong></span>
					<span class="pf-config__item">${__("Cash")}: <strong>${this.escape(settings.cash_account || "")}</strong></span>
				`);
			}

			filter_logs_table() {
				const query = (this.$log_search.val() || "").toLowerCase().trim();
				this.page.main.find(".funds-logs-table tbody tr").each(function () {
					const matches = !query || ($(this).data("search") || "").indexOf(query) >= 0;
					$(this).toggle(matches);
				});
			}

			apply_cost_center(cost_center) {
				if (!cost_center) return;
				this.$cost_center.val(cost_center);
				frappe.show_alert({ message: __("Filtered by Cost Center: {0}", [cost_center]), indicator: "teal" }, 4);
				this.refresh();
			}

			focus_search(value, message) {
				if (!value) return;
				this.$log_search.val(value);
				this.filter_logs_table();
				this.page.main.find("#funds-recent-logs")[0]?.scrollIntoView({ behavior: "smooth", block: "center" });
				frappe.show_alert({ message: `${message}: ${value}`, indicator: "blue" }, 4);
			}

			export_csv() {
				if (!this.data) return;
				const rows = [
					[__("Funds Dashboard")],
					[__("Company"), this.data.company || ""],
					[__("From Date"), this.data.from_date || "", __("To Date"), this.data.to_date || ""],
					[],
					[__("Cost Center"), __("Donations"), __("Income"), __("Total Funds"), __("Transactions")],
				];
				(this.data.cost_center_data || []).forEach((row) => {
					rows.push([
						row.cost_center || "",
						flt(row.donation_amount),
						flt(row.income_amount),
						flt(row.total_funds),
						row.transaction_count || 0,
					]);
				});
				const csv = rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\n");
				const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
				const link = document.createElement("a");
				link.href = URL.createObjectURL(blob);
				link.download = `funds-dashboard-${frappe.datetime.get_today()}.csv`;
				link.click();
				URL.revokeObjectURL(link.href);
			}

			get_chart_context(element, height) {
				element.innerHTML = `<canvas style="height:${height}px; max-height:${height}px;"></canvas>`;
				return element.querySelector("canvas").getContext("2d");
			}

			destroy_chart(chart_key) {
				if (this[chart_key]) {
					this[chart_key].destroy();
					this[chart_key] = null;
				}
			}

			chart_colors() {
				return ["#ff7a2f", "#1c7ed6", "#12b886", "#7048e8", "#e8590c", "#0ca678", "#1864ab", "#f59f00", "#5c6272", "#fab005"];
			}

			line_dataset(label, data, color) {
				return {
					label,
					data,
					borderColor: color,
					backgroundColor: `${color}22`,
					borderWidth: 2,
					pointRadius: 2,
					tension: 0.35,
					fill: false,
				};
			}

			get_chart_options({ stacked = false, legend = false, index_axis = "x", on_click = null, doughnut = false, cutout = "58%" } = {}) {
				const options = {
					responsive: true,
					maintainAspectRatio: false,
					indexAxis: index_axis,
					cutout: doughnut ? cutout : undefined,
					animation: {
						duration: doughnut ? 1050 : 850,
						easing: doughnut ? "easeOutBack" : "easeOutQuart",
					},
					interaction: {
						mode: "nearest",
						intersect: true,
					},
					onHover: (event, active) => {
						if (event.native?.target) {
							event.native.target.style.cursor = active.length ? "pointer" : "default";
						}
					},
					onClick: (event, active) => {
						if (!on_click || !active.length) return;
						on_click(active[0].index);
					},
					plugins: {
						legend: {
							display: legend || stacked,
							position: "bottom",
							labels: { boxWidth: 10, font: { size: 11 } },
						},
						tooltip: {
							callbacks: {
								label: (context) => {
									const label = context.dataset.label || context.label || "";
									const value = context.raw ?? 0;
									return `${label}: ${this.fmt_money(value)}`;
								},
							},
						},
					},
				};
				if (doughnut) {
					return options;
				}
				options.scales = index_axis === "y" ? {
						x: { stacked, ticks: { callback: (value) => this.compact_number(value), color: "#5c6272" }, grid: { color: "rgba(17, 19, 26, 0.08)" } },
						y: { stacked, ticks: { color: "#5c6272" }, grid: { display: false } },
					} : {
						x: { stacked, ticks: { color: "#5c6272" }, grid: { display: false } },
						y: { stacked, ticks: { callback: (value) => this.compact_number(value), color: "#5c6272" }, grid: { color: "rgba(17, 19, 26, 0.08)" } },
				};
				return options;
			}

			compact_number(value) {
				const amount = Math.abs(flt(value));
				if (amount >= 10000000) return `${Math.round(flt(value) / 1000000)}M`;
				if (amount >= 100000) return `${Math.round(flt(value) / 1000)}K`;
				return value;
			}

			empty_chart(element, title, hint) {
				element.innerHTML = `<div class="pf-empty"><div class="pf-empty__icon"><i class="fa fa-bar-chart"></i></div><div class="pf-empty__title">${title}</div><div class="pf-empty__text">${hint}</div></div>`;
			}

			trend_html(percent) {
				if (percent > 0) return `<span class="pf-kpi__trend pf-kpi__trend--up"><i class="fa fa-arrow-up"></i> ${percent}% ${__("vs previous")}</span>`;
				if (percent < 0) return `<span class="pf-kpi__trend pf-kpi__trend--down"><i class="fa fa-arrow-down"></i> ${Math.abs(percent)}% ${__("vs previous")}</span>`;
				return `<span class="pf-kpi__trend pf-kpi__trend--flat">${__("Same as previous")}</span>`;
			}

			fmt_money(value) {
				return frappe.format(flt(value), { fieldtype: "Currency" });
			}

			escape(value) {
				return frappe.utils.escape_html(value == null ? "" : String(value));
			}
		};
	}

	frappe.require("https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js", () => {
		page.funds_dashboard = new window.FundsDashboard(page);
		page.funds_dashboard.make();
	});
};

function flt(value) {
	return parseFloat(value) || 0;
}
