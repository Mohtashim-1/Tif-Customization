frappe.pages["bank-balance-reconci"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: "Bank Balance Reconciliation",
		single_column: true,
	});

	if (!window.BankBalanceReconci) {
		window.BankBalanceReconci = class BankBalanceReconci {
			constructor(page) {
				this.page = page;
				this.reference_date = frappe.datetime.get_today();
				this.data = null;
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
								<label>Reference Date</label>
								<input type="date" id="bank-recon-reference-date" class="form-control" value="${this.reference_date}">
							</div>
							<div class="col-md-9" style="padding-top:24px;">
								<button class="btn btn-primary" id="bank-recon-apply"><i class="fa fa-filter"></i> Apply</button>
								<button class="btn btn-default" id="bank-recon-print"><i class="fa fa-print"></i> Print</button>
							</div>
						</div>
					</div>
					<div id="bank-recon-report"></div>
				`);
			}

			bind_events() {
				$("#bank-recon-apply").on("click", () => {
					this.reference_date = $("#bank-recon-reference-date").val() || frappe.datetime.get_today();
					this.load_data();
				});
				$("#bank-recon-print").on("click", () => window.print());
			}

			load_data() {
				frappe.call({
					method:
						"tif_customization.tif_customization.page.bank_balance_reconci.bank_balance_reconci.get_report_data",
					args: { reference_date: this.reference_date },
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
				const rows = data.rows || [];
				const totals = data.totals || {};

				const monthHeaders = months.map((m) => `<th>${frappe.utils.escape_html(m.label)}</th>`).join("");

				const body = rows
					.map((row) => {
						const monthCells = months
							.map((m) => `<td class="text-right">${this.money((row.month_values || {})[m.key])}</td>`)
							.join("");
						return `
							<tr>
								<td>${frappe.utils.escape_html(row.display_name || "")}</td>
								${monthCells}
								<td class="text-right">${this.money(row.total_received)}</td>
								<td class="text-right">${this.money(row.budgeted_amount)}</td>
								<td class="text-right">${this.money(row.balance_commitment)}</td>
								<td>${frappe.utils.escape_html(row.remarks || "")}</td>
							</tr>
						`;
					})
					.join("");

				const totalMonthCells = months
					.map((m) => `<td class="text-right">${this.money((totals.month_values || {})[m.key])}</td>`)
					.join("");

				$("#bank-recon-report").html(`
					<div class="bank-recon-sheet">
						<table class="table table-bordered bank-recon-table">
							<thead>
								<tr>
									<th colspan="${months.length + 5}" class="sheet-title">The ILM Foundation</th>
								</tr>
								<tr>
									<th colspan="${months.length + 5}" class="sheet-subtitle">Receipt & Payment Account</th>
								</tr>
								<tr>
									<th class="left-band" rowspan="2">Donations from July '${String(data.fiscal_year_label || "").slice(2, 4)} to June '${String(data.fiscal_year_label || "").slice(5, 7)}</th>
									<th colspan="${months.length + 1}" class="center-band">Donations from July '${String(data.fiscal_year_label || "").slice(2, 4)} to June '${String(data.fiscal_year_label || "").slice(5, 7)}<br>Actual received</th>
									<th rowspan="2">Budgeted for the year</th>
									<th rowspan="2">Balance Commitment</th>
									<th rowspan="2">Remarks</th>
								</tr>
								<tr>
									${monthHeaders}
									<th>Total</th>
								</tr>
							</thead>
							<tbody>
								${body}
								<tr class="grand-total">
									<td>Total</td>
									${totalMonthCells}
									<td class="text-right">${this.money(totals.total_received)}</td>
									<td class="text-right">${this.money(totals.budgeted_amount)}</td>
									<td class="text-right">${this.money(totals.balance_commitment)}</td>
									<td></td>
								</tr>
							</tbody>
						</table>
					</div>
				`);
			}

			money(v) {
				return format_currency(v || 0, frappe.defaults.get_default("currency"));
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
