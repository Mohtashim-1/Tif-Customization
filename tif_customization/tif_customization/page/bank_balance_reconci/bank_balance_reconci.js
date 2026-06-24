frappe.pages["bank-balance-reconci"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: "Donation Received",
		single_column: true,
	});

	if (!window.BankBalanceReconci) {
		window.BankBalanceReconci = class BankBalanceReconci {
			constructor(page) {
				this.page = page;
				this.to_date = frappe.datetime.get_today();
				this.from_date = this.get_fiscal_year_start(this.to_date);
				this.data = null;
			}

			get_fiscal_year_start(ref_date) {
				const dt = frappe.datetime.str_to_obj(ref_date || frappe.datetime.get_today());
				const year = dt.getMonth() >= 6 ? dt.getFullYear() : dt.getFullYear() - 1;
				return `${year}-07-01`;
			}

			make() {
				this.render_layout();
				this.bind_events();
				this.inject_styles();
				this.load_data();
			}

			render_layout() {
				this.page.main.html(`
					<div class="bank-recon-toolbar">
						<div class="row">
							<div class="col-md-3">
								<label>${__("From Date")}</label>
								<input type="date" id="bank-recon-from-date" class="form-control" value="${this.from_date}">
							</div>
							<div class="col-md-3">
								<label>${__("To Date")}</label>
								<input type="date" id="bank-recon-to-date" class="form-control" value="${this.to_date}">
							</div>
							<div class="col-md-3">
								<div id="bank-recon-donor-control"></div>
							</div>
							<div class="col-md-3" style="padding-top:24px;">
								<button class="btn btn-primary" id="bank-recon-apply"><i class="fa fa-filter"></i> ${__("Apply")}</button>
								<button class="btn btn-default" id="bank-recon-fy">${__("Current FY")}</button>
								<button class="btn btn-default" id="bank-recon-print"><i class="fa fa-print"></i> ${__("Print")}</button>
							</div>
						</div>
					</div>
					<div class="row" id="bank-recon-kpis"></div>
					<div id="bank-recon-report"></div>
				`);

				this.donor_control = frappe.ui.form.make_control({
					parent: this.page.main.find("#bank-recon-donor-control"),
					df: {
						fieldname: "donor",
						fieldtype: "Link",
						label: __("Donor"),
						options: "Donor",
					},
					render_input: true,
				});
			}

			bind_events() {
				$("#bank-recon-apply").on("click", () => {
					this.from_date = $("#bank-recon-from-date").val();
					this.to_date = $("#bank-recon-to-date").val();
					if (!this.from_date || !this.to_date) {
						frappe.msgprint(__("Please select both From Date and To Date"));
						return;
					}
					if (this.from_date > this.to_date) {
						frappe.msgprint(__("From Date cannot be after To Date"));
						return;
					}
					this.load_data();
				});
				$("#bank-recon-fy").on("click", () => {
					this.to_date = frappe.datetime.get_today();
					this.from_date = this.get_fiscal_year_start(this.to_date);
					$("#bank-recon-from-date").val(this.from_date);
					$("#bank-recon-to-date").val(this.to_date);
					this.load_data();
				});
				$("#bank-recon-print").on("click", () => window.print());
			}

			load_data() {
				frappe.call({
					method:
						"tif_customization.tif_customization.page.bank_balance_reconci.bank_balance_reconci.get_report_data",
					args: {
						from_date: this.from_date,
						to_date: this.to_date,
						donor: this.donor_control.get_value(),
					},
					freeze: true,
					freeze_message: "Loading Bank Balance Reconciliation...",
					callback: (r) => {
						this.data = r.message || {};
						this.render_report();
					},
					error: () => {
						$("#bank-recon-report").html(`<div class="text-danger">Failed to load report data.</div>`);
					},
				});
			}

			render_report() {
				const data = this.data || {};
				const months = data.months || [];
				const periodLabel = frappe.utils.escape_html(data.period_label || "");
				const sections = data.sections || [
					{ donor_type: __("All Donors"), rows: data.rows || [], totals: data.totals || {} },
				];
				this.render_kpis(data.totals || {});

				$("#bank-recon-report").html(`
					${sections.map((section) => this.render_section_table(section, months, periodLabel)).join("")}
				`);
			}

			render_kpis(totals) {
				const cards = [
					{ label: __("Total Donations"), value: this.money(totals.donation_amount), gradient: "#4facfe, #00f2fe" },
					{ label: __("Total Zakat Donations"), value: this.money(totals.zakat_amount), gradient: "#43e97b, #38f9d7" },
					{ label: __("Total Endowment Funds"), value: this.money(totals.endowment_funds_amount), gradient: "#fa709a, #fee140" },
					{ label: __("Total Donors"), value: this.number(totals.total_donors), gradient: "#667eea, #764ba2" },
				];
				$("#bank-recon-kpis").html(
					cards.map((card) => `
						<div class="col-sm-6 col-lg-3 bank-recon-kpi-column">
							<div class="bank-recon-kpi" style="background: linear-gradient(135deg, ${card.gradient});">
								<div class="bank-recon-kpi-label">${card.label}</div>
								<div class="bank-recon-kpi-value">${card.value}</div>
							</div>
						</div>
					`).join("")
				);
			}

			render_section_table(section, months, periodLabel) {
				const rows = section.rows || [];
				const totals = section.totals || {};
				const donorType = frappe.utils.escape_html(section.donor_type || "");
				const monthHeaders = months.map((month) => `<th>${frappe.utils.escape_html(month.label)}</th>`).join("");
				const body = rows.length
					? rows.map((row) => {
						const monthCells = months
							.map((month) => `<td class="text-right">${this.money((row.month_values || {})[month.key])}</td>`)
							.join("");
						return `
							<tr>
								<td>${frappe.utils.escape_html(row.display_name || "")}</td>
								${monthCells}
								<td class="text-right">${this.money(row.donation_amount)}</td>
								<td class="text-right">${this.money(row.zakat_amount)}</td>
								<td class="text-right">${this.money(row.endowment_funds_amount)}</td>
								<td class="text-right">${this.money(row.total_received)}</td>
								<td class="text-right">${this.money(row.budgeted_amount)}</td>
								<td class="text-right">${this.money(row.balance_commitment)}</td>
								<td>${frappe.utils.escape_html(row.remarks || "")}</td>
							</tr>
						`;
					}).join("")
					: `<tr><td colspan="${months.length + 8}" class="text-center text-muted">${__("No records found")}</td></tr>`;
				const totalMonthCells = months
					.map((month) => `<td class="text-right">${this.money((totals.month_values || {})[month.key])}</td>`)
					.join("");

				return `
					<div class="bank-recon-section-title">${donorType}</div>
					<div class="bank-recon-sheet">
						<table class="table table-bordered bank-recon-table">
							<thead>
								<tr>
									<th colspan="${months.length + 8}" class="sheet-title">The ILM Foundation — ${donorType}</th>
								</tr>
								<tr>
									<th colspan="${months.length + 8}" class="sheet-subtitle">Receipt & Payment Account</th>
								</tr>
								<tr>
									<th class="left-band" rowspan="2">Donations<br>${periodLabel}</th>
									<th colspan="${months.length + 4}" class="center-band">Donations<br>${periodLabel}<br>Actual received</th>
									<th rowspan="2">Budgeted for the year (committed)</th>
									<th rowspan="2">Balance Commitment</th>
									<th rowspan="2">Remarks</th>
								</tr>
								<tr>
									${monthHeaders}
									<th>Donation</th>
									<th>Zakat</th>
									<th>Endowment Funds</th>
									<th>Total Donations</th>
								</tr>
							</thead>
							<tbody>
								${body}
								<tr class="grand-total">
									<td>Total</td>
									${totalMonthCells}
									<td class="text-right">${this.money(totals.donation_amount)}</td>
									<td class="text-right">${this.money(totals.zakat_amount)}</td>
									<td class="text-right">${this.money(totals.endowment_funds_amount)}</td>
									<td class="text-right">${this.money(totals.total_received)}</td>
									<td class="text-right">${this.money(totals.budgeted_amount)}</td>
									<td class="text-right">${this.money(totals.balance_commitment)}</td>
									<td></td>
								</tr>
							</tbody>
						</table>
					</div>
				`;
			}

			money(v) {
				return format_currency(v || 0, frappe.defaults.get_default("currency"));
			}

			number(v) {
				return new Intl.NumberFormat().format(Number(v || 0));
			}

			inject_styles() {
				if ($("#bank-recon-style").length) return;
				$("head").append(`
					<style id="bank-recon-style">
						.bank-recon-toolbar {
							background: #f8fafc;
							border: 1px solid #e2e8f0;
							padding: 12px;
							border-radius: 6px;
							margin-bottom: 10px;
						}
						.bank-recon-table th, .bank-recon-table td {
							font-size: 12px;
							padding: 4px 6px;
							vertical-align: middle;
						}
						.bank-recon-table .sheet-title,
						.bank-recon-table .sheet-subtitle {
							text-align: left;
							font-weight: 700;
							background: #f8fafc;
						}
						.bank-recon-table .left-band {
							background: #8fa9d6;
							color: #0f172a;
							font-weight: 700;
							min-width: 260px;
						}
						.bank-recon-table .center-band {
							text-align: center;
							background: #e5edf9;
							font-weight: 700;
						}
						.bank-recon-table .grand-total td {
							font-weight: 700;
							background: #e2e8f0;
						}
						.bank-recon-section-title {
							font-size: 16px;
							font-weight: 700;
							margin: 18px 0 8px;
							padding: 8px 12px;
							background: #e5edf9;
							border-left: 4px solid #4c6ef5;
						}
						.bank-recon-kpi-column {
							margin-bottom: 14px;
						}
						.bank-recon-kpi {
							min-height: 108px;
							padding: 18px;
							border-radius: 8px;
							color: #fff;
							box-shadow: 0 2px 4px rgba(15, 23, 42, 0.12);
						}
						.bank-recon-kpi-label {
							font-size: 13px;
							opacity: 0.9;
							margin-bottom: 10px;
						}
						.bank-recon-kpi-value {
							font-size: clamp(20px, 2vw, 28px);
							font-weight: 700;
							white-space: nowrap;
						}
						@media print {
							@page {
								size: A4 landscape;
								margin: 8mm;
							}
							.bank-recon-toolbar, .page-head { display: none !important; }
							.bank-recon-table th, .bank-recon-table td { font-size: 10px; }
						}
					</style>
				`);
			}
		};
	}

	new window.BankBalanceReconci(page).make();
};
