frappe.pages["donor-receipt-report"].on_page_load = function (wrapper) {
	frappe.require("/assets/tif_customization/css/donor_receipt_report.css");

	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Donor Receipt Report"),
		single_column: true,
	});

	const loadCharts = () =>
		new Promise((resolve, reject) => {
			if (window.Chart) return resolve();
			frappe.require(
				"https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js",
				() => (window.Chart ? resolve() : reject(new Error("Chart.js failed to load")))
			);
		});

	if (!window.DonorReceiptReport) {
		window.DonorReceiptReport = class DonorReceiptReport {
			constructor(page) {
				this.page = page;
				this.to_date = frappe.datetime.get_today();
				this.from_date = frappe.datetime.add_months(this.to_date, -12);
				this.active_month = null;
				this.drilldown_rows = [];
				this.chart = null;
				this.data = null;
				this.donor = null;
				this.donor_control = null;
			}

			async make() {
				this.render_layout();
				this.make_donor_filter();
				this.bind_events();
				await loadCharts();
				this.load_summary();
			}

			render_layout() {
				this.page.main.html(`
					<div class="donor-receipt-root">
						<div class="donor-receipt-hero">
							<h1 class="donor-receipt-hero__title">${__("Donor Receipt Report")}</h1>
							<p class="donor-receipt-hero__sub">${__(
								"Track donations month by month, drill into individual receipts, and download official donation receipt PDFs."
							)}</p>
						</div>

						<div class="donor-receipt-toolbar">
							<div>
								<label>${__("From Date")}</label>
								<input type="date" class="form-control input-from-date" value="${this.from_date}" />
							</div>
							<div>
								<label>${__("To Date")}</label>
								<input type="date" class="form-control input-to-date" value="${this.to_date}" />
							</div>
							<div class="donor-receipt-donor-filter">
								<label>${__("Donor")}</label>
								<div class="donor-filter-control"></div>
							</div>
							<div>
								<button class="btn btn-primary btn-sm btn-apply">${__("Apply")}</button>
								<button class="btn btn-default btn-sm btn-fy">${__("Current FY")}</button>
								<button class="btn btn-default btn-sm btn-12m">${__("Last 12 Months")}</button>
							</div>
						</div>

						<div class="donor-receipt-kpis" id="donor-receipt-kpis"></div>

						<div class="donor-receipt-panel">
							<h3 class="donor-receipt-panel__title">${__("Monthly Collection Trend")}</h3>
							<div class="donor-receipt-chart-wrap">
								<canvas id="donor-receipt-chart"></canvas>
							</div>
						</div>

						<div class="donor-receipt-split">
							<div class="donor-receipt-panel" style="margin-bottom:0">
								<h3 class="donor-receipt-panel__title">${__("Months")}</h3>
								<div class="donor-receipt-month-list" id="donor-receipt-months"></div>
							</div>
							<div class="donor-receipt-detail" id="donor-receipt-detail">
								<div class="donor-receipt-placeholder">
									<i class="fa fa-hand-pointer-o"></i>
									<div>${__("Select a month to view donation receipts")}</div>
								</div>
							</div>
						</div>
					</div>
				`);
			}

			make_donor_filter() {
				this.donor_control = frappe.ui.form.make_control({
					parent: this.page.main.find(".donor-filter-control"),
					df: {
						fieldtype: "Link",
						options: "Donor",
						fieldname: "donor",
						placeholder: __("All Donors"),
					},
					render_input: true,
				});
				this.donor_control.set_value(this.donor);
			}

			bind_events() {
				const me = this;
				this.page.main.find(".btn-apply").on("click", () => me.apply_filters());
				this.page.main.find(".btn-fy").on("click", () => {
					me.to_date = frappe.datetime.get_today();
					const dt = frappe.datetime.str_to_obj(me.to_date);
					const year = dt.getMonth() >= 6 ? dt.getFullYear() : dt.getFullYear() - 1;
					me.from_date = `${year}-07-01`;
					me.sync_filter_inputs();
					me.apply_filters();
				});
				this.page.main.find(".btn-12m").on("click", () => {
					me.to_date = frappe.datetime.get_today();
					me.from_date = frappe.datetime.add_months(me.to_date, -12);
					me.sync_filter_inputs();
					me.apply_filters();
				});
			}

			sync_filter_inputs() {
				this.page.main.find(".input-from-date").val(this.from_date);
				this.page.main.find(".input-to-date").val(this.to_date);
			}

			apply_filters() {
				this.from_date = this.page.main.find(".input-from-date").val();
				this.to_date = this.page.main.find(".input-to-date").val();
				this.donor = this.donor_control ? this.donor_control.get_value() : null;
				if (!this.from_date || !this.to_date) {
					frappe.msgprint(__("Please select both From Date and To Date"));
					return;
				}
				if (this.from_date > this.to_date) {
					frappe.msgprint(__("From Date cannot be after To Date"));
					return;
				}
				this.active_month = null;
				this.drilldown_rows = [];
				this.reset_detail_panel();
				this.load_summary();
			}

			reset_detail_panel() {
				this.page.main.find("#donor-receipt-detail").html(`
					<div class="donor-receipt-placeholder">
						<i class="fa fa-hand-pointer-o"></i>
						<div>${__("Select a month to view donation receipts")}</div>
					</div>
				`);
			}

			load_summary() {
				this.page.set_indicator(__("Loading…"), "blue");
				frappe.call({
					method:
						"tif_customization.tif_customization.page.donor_receipt_report.donor_receipt_report.get_month_wise_summary",
					args: {
						from_date: this.from_date,
						to_date: this.to_date,
						donor: this.donor,
					},
					callback: (r) => {
						this.data = r.message || {};
						this.render_kpis();
						this.render_chart();
						this.render_months();
					},
					always: () => {
						if (this.page.clear_indicator) this.page.clear_indicator();
					},
				});
			}

			render_kpis() {
				const totals = this.data.totals || {};
				const monthCount = (this.data.months || []).length;
				const avg = monthCount ? flt(totals.total_amount) / monthCount : 0;
				const cards = [
					{ cls: "donor-receipt-kpi--primary", label: __("Total Receipts"), value: this.fmtNum(totals.donation_count) },
					{ cls: "donor-receipt-kpi--amount", label: __("Total Amount"), value: this.fmtCur(totals.total_amount) },
					{ cls: "donor-receipt-kpi--months", label: __("Months"), value: this.fmtNum(monthCount) },
					{ cls: "donor-receipt-kpi--avg", label: __("Avg / Month"), value: this.fmtCur(avg) },
				];
				this.page.main.find("#donor-receipt-kpis").html(
					cards
						.map(
							(c) => `
						<div class="donor-receipt-kpi ${c.cls}">
							<div class="donor-receipt-kpi__label">${c.label}</div>
							<div class="donor-receipt-kpi__value">${c.value}</div>
						</div>`
						)
						.join("")
				);
			}

			render_chart() {
				const months = [...(this.data.months || [])].reverse();
				const canvas = this.page.main.find("#donor-receipt-chart")[0];
				if (!canvas || !window.Chart) return;

				if (this.chart) {
					this.chart.destroy();
					this.chart = null;
				}

				if (!months.length) {
					const ctx = canvas.getContext("2d");
					ctx.clearRect(0, 0, canvas.width, canvas.height);
					return;
				}

				this.chart = new Chart(canvas.getContext("2d"), {
					type: "bar",
					data: {
						labels: months.map((m) => m.month_label),
						datasets: [
							{
								label: __("Amount"),
								data: months.map((m) => flt(m.total_amount)),
								backgroundColor: "rgba(13, 148, 136, 0.75)",
								borderRadius: 8,
							},
						],
					},
					options: {
						responsive: true,
						maintainAspectRatio: false,
						plugins: { legend: { display: false } },
						scales: {
							y: {
								beginAtZero: true,
								ticks: {
									callback: (v) => this.shortCur(v),
								},
							},
						},
						onClick: (_evt, elements) => {
							if (!elements.length) return;
							const month = months[elements[0].index];
							if (month) this.load_month_drilldown(month.month_key);
						},
					},
				});
			}

			render_months() {
				const months = this.data.months || [];
				const $el = this.page.main.find("#donor-receipt-months");
				if (!months.length) {
					$el.html(`<div class="donor-receipt-empty">${__("No donations for selected period")}</div>`);
					return;
				}

				$el.html(
					months
						.map(
							(m) => `
					<div class="donor-month-card ${this.active_month === m.month_key ? "is-active" : ""}" data-month-key="${frappe.utils.escape_html(m.month_key)}">
						<div class="donor-month-card__top">
							<div class="donor-month-card__label">${frappe.utils.escape_html(m.month_label)}</div>
							<div class="donor-month-card__badge">${this.fmtNum(m.donation_count)} ${__("receipts")}</div>
						</div>
						<div class="donor-month-card__amount">${this.fmtCur(m.total_amount)}</div>
						<div class="donor-month-card__hint">${__("Click to view receipts")}</div>
					</div>`
						)
						.join("")
				);

				const me = this;
				$el.find(".donor-month-card").on("click", function () {
					me.load_month_drilldown(this.getAttribute("data-month-key"));
				});
			}

			load_month_drilldown(month_key) {
				this.active_month = month_key;
				this.page.main.find(".donor-month-card").removeClass("is-active");
				this.page.main
					.find(`.donor-month-card[data-month-key="${month_key}"]`)
					.addClass("is-active");

				const $detail = this.page.main.find("#donor-receipt-detail");
				$detail.html(`<div class="donor-receipt-empty">${__("Loading…")}</div>`);

				frappe.call({
					method:
						"tif_customization.tif_customization.page.donor_receipt_report.donor_receipt_report.get_month_donations",
					args: {
						month_key,
						from_date: this.from_date,
						to_date: this.to_date,
						donor: this.donor,
					},
					callback: (r) => {
						this.drilldown_rows = r.message || [];
						this.render_drilldown(month_key);
					},
				});
			}

			render_drilldown(month_key, filterText = "") {
				const month = (this.data.months || []).find((m) => m.month_key === month_key);
				const title = month ? month.month_label : month_key;
				const $detail = this.page.main.find("#donor-receipt-detail");
				const query = (filterText || "").trim().toLowerCase();

				let donations = this.drilldown_rows || [];
				if (query) {
					donations = donations.filter((d) => {
						const hay = [
							d.name,
							d.donor_name,
							d.donation_type,
							d.payment_method,
							d.remarks,
						]
							.join(" ")
							.toLowerCase();
						return hay.includes(query);
					});
				}

				if (!donations.length) {
					$detail.html(`
						<div class="donor-receipt-detail__head">
							<h4 class="donor-receipt-detail__title">${frappe.utils.escape_html(title)}</h4>
							<input type="text" class="form-control input-sm donor-receipt-detail__search donor-search" placeholder="${__("Search donor, receipt, type...")}" value="${frappe.utils.escape_html(filterText)}" />
						</div>
						<div class="donor-receipt-empty">${query ? __("No matching donations") : __("No donations found")}</div>
					`);
					this.bind_drilldown_events(month_key);
					return;
				}

				const rows = donations
					.map((d) => {
						const name = frappe.utils.escape_html(d.name || "");
						return `
						<tr>
							<td><span class="donor-receipt-link btn-open-donation" data-name="${name}">${name}</span></td>
							<td>${frappe.utils.escape_html(frappe.datetime.str_to_user(d.donation_date) || "")}</td>
							<td>${frappe.utils.escape_html(d.donor_name || "")}</td>
							<td>${frappe.utils.escape_html(d.donation_type || "")}</td>
							<td class="text-right">${this.fmtCur(d.received_amount, d.currency)}</td>
							<td>${frappe.utils.escape_html(d.payment_method || "")}</td>
							<td>
								<button class="btn btn-xs donor-receipt-btn-pdf btn-download-pdf" data-name="${name}">
									<i class="fa fa-download"></i> ${__("PDF")}
								</button>
							</td>
						</tr>`;
					})
					.join("");

				$detail.html(`
					<div class="donor-receipt-detail__head">
						<h4 class="donor-receipt-detail__title">${__("Receipts for")} ${frappe.utils.escape_html(title)} <span style="font-weight:500;color:#64748b">(${donations.length})</span></h4>
						<input type="text" class="form-control input-sm donor-receipt-detail__search donor-search" placeholder="${__("Search donor, receipt, type...")}" value="${frappe.utils.escape_html(filterText)}" />
					</div>
					<div class="donor-receipt-detail__body">
						<table class="donor-receipt-table">
							<thead>
								<tr>
									<th>${__("Receipt No")}</th>
									<th>${__("Date")}</th>
									<th>${__("Donor")}</th>
									<th>${__("Type")}</th>
									<th class="text-right">${__("Amount")}</th>
									<th>${__("Payment")}</th>
									<th>${__("Receipt")}</th>
								</tr>
							</thead>
							<tbody>${rows}</tbody>
						</table>
					</div>
				`);

				this.bind_drilldown_events(month_key);
			}

			bind_drilldown_events(month_key) {
				const me = this;
				const $detail = this.page.main.find("#donor-receipt-detail");
				$detail.find(".donor-search").on("input", function () {
					me.render_drilldown(month_key, this.value);
				});
				$detail.find(".btn-open-donation").on("click", function (e) {
					e.stopPropagation();
					frappe.set_route("Form", "Donation", this.getAttribute("data-name"));
				});
				$detail.find(".btn-download-pdf").on("click", function (e) {
					e.stopPropagation();
					me.download_receipt_pdf(this.getAttribute("data-name"));
				});
			}

			download_receipt_pdf(name) {
				if (!name) return;
				const url = frappe.urllib.get_full_url(
					`/api/method/tif_customization.tif_customization.page.donor_receipt_report.donor_receipt_report.download_donation_receipt_pdf?name=${encodeURIComponent(name)}`
				);
				window.open(url, "_blank");
			}

			fmtNum(v) {
				return format_number(flt(v), null, 0);
			}

			fmtCur(v, currency) {
				return format_currency(flt(v), currency || frappe.defaults.get_default("currency"));
			}

			shortCur(v) {
				const n = flt(v);
				if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
				if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
				return this.fmtNum(n);
			}
		};
	}

	loadCharts()
		.then(() => new window.DonorReceiptReport(page).make())
		.catch(() => frappe.msgprint(__("Chart.js could not be loaded.")));
};
