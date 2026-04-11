frappe.pages["month-wise-expense"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: "Month Wise Expense",
		single_column: true,
	});

	if (!window.MonthWiseExpenseReport) {
		window.MonthWiseExpenseReport = class MonthWiseExpenseReport {
			constructor(page) {
				this.page = page;
				this.data = null;
			}

			make() {
				this.render_layout();
				this.bind_events();
				this.load_data();
			}

			render_layout() {
				this.page.main.html(`
					<div class="month-expense-root">
						<div class="month-expense-toolbar">
							<button class="btn btn-primary" id="reload-month-expense"><i class="fa fa-refresh"></i> Reload</button>
							<button class="btn btn-default" id="print-month-expense"><i class="fa fa-print"></i> Print</button>
						</div>
						<div id="month-expense-report"></div>
					</div>
				`);
				this.inject_styles();
			}

			bind_events() {
				$("#reload-month-expense").on("click", () => this.load_data());
				$("#print-month-expense").on("click", () => window.print());
			}

			load_data() {
				frappe.call({
					method:
						"tif_customization.tif_customization.page.month_wise_expense.month_wise_expense.get_report_data",
					freeze: true,
					freeze_message: "Loading Month Wise Expense...",
					callback: (r) => {
						this.data = r.message || {};
						this.render_report();
					},
					error: () => frappe.msgprint("Unable to load month-wise expense report."),
				});
			}

			render_report() {
				const target = $("#month-expense-report");
				const months = this.data.months || [];
				const monthHeaders = months.map((m) => `<th class="text-center">${frappe.utils.escape_html(m.label)}</th>`).join("");

				let html = `
					<div class="statement-head">
						<div class="head-line strong">The ILM Foundation</div>
						<div class="head-line strong">Expenses for the Period ${frappe.utils.escape_html(
							this.data.fiscal_year_label || ""
						)}</div>
					</div>
				`;

				(this.data.sections || []).forEach((section) => {
					let body = "";
					(section.rows || []).forEach((row) => {
						const cls = row.row_type === "total" ? "total-row" : "";
						const monthCells = months
							.map((m) => `<td class="text-right">${this.format_amount((row.month_values || {})[m.key])}</td>`)
							.join("");

						body += `
							<tr class="${cls}">
								<td>${frappe.utils.escape_html(row.label || "")}</td>
								${monthCells}
								<td class="text-right">${this.format_amount(row.total)}</td>
							</tr>
						`;
					});

					html += `
						<div class="section-block">
							<table class="table table-bordered month-table">
								<thead>
									<tr>
										<th class="section-title">${frappe.utils.escape_html(section.label || "")}</th>
										<th class="text-center months-head" colspan="${months.length + 1}">Months</th>
									</tr>
									<tr>
										<th></th>
										${monthHeaders}
										<th class="text-center">Total</th>
									</tr>
								</thead>
								<tbody>${body}</tbody>
							</table>
						</div>
					`;
				});

				target.html(html);
			}

			format_amount(value) {
				if (value === null || value === undefined) return "-";
				if (Math.abs(value) < 0.0001) return "-";
				return format_currency(value, frappe.defaults.get_default("currency"));
			}

			inject_styles() {
				if ($("#month-expense-style").length) return;
				$("head").append(`
					<style id="month-expense-style">
						.month-expense-toolbar {
							display: flex;
							gap: 8px;
							margin-bottom: 12px;
						}
						.statement-head {
							margin-bottom: 8px;
						}
						.head-line.strong {
							font-weight: 700;
						}
						.section-block {
							margin-bottom: 10px;
						}
						.month-table th,
						.month-table td {
							font-size: 12px;
							padding: 4px 6px;
						}
						.month-table .section-title {
							background: #dbeafe;
							font-weight: 700;
						}
						.month-table .months-head {
							background: #e8eef7;
							font-weight: 700;
						}
						.month-table .total-row td {
							font-weight: 700;
							background: #f1f5f9;
						}
						@media print {
							@page {
								size: A4 landscape;
								margin: 8mm;
							}
							.month-expense-toolbar,
							.page-head {
								display: none !important;
							}
							.month-table th,
							.month-table td {
								font-size: 10px;
								padding: 3px 4px;
							}
						}
					</style>
				`);
			}
		};
	}

	new window.MonthWiseExpenseReport(page).make();
};
