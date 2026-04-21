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
						const drillable = row.row_type === "data";
						const monthCells = months
							.map((m) =>
								this.render_amount_cell((row.month_values || {})[m.key], {
									section_label: section.label,
									row_label: row.label,
									month_key: m.key,
									drillable,
								})
							)
							.join("");

						body += `
							<tr class="${cls}">
								<td>${frappe.utils.escape_html(row.label || "")}</td>
								${monthCells}
								${this.render_amount_cell(row.total, {
									section_label: section.label,
									row_label: row.label,
									month_key: null,
									drillable,
								})}
							</tr>
						`;
					});

					html += `
						<div class="section-block">
							<div class="table-responsive">
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
						</div>
					`;
				});

				target.html(html);
				this.bind_drilldown_events(target);
			}

			format_amount(value) {
				if (value === null || value === undefined) return "-";
				if (Math.abs(value) < 0.0001) return "-";
				return format_currency(value, frappe.defaults.get_default("currency"));
			}

			render_amount_cell(value, { section_label, row_label, month_key, drillable }) {
				const display = this.format_amount(value);
				const safeSection = frappe.utils.escape_html(section_label || "");
				const safeRow = frappe.utils.escape_html(row_label || "");
				const safeMonth = month_key ? frappe.utils.escape_html(month_key) : "";

				if (!drillable || display === "-") {
					return `<td class="text-right">${display}</td>`;
				}

				return `
					<td class="text-right">
						<a
							href="#"
							class="drilldown-link"
							data-section="${safeSection}"
							data-row="${safeRow}"
							data-month="${safeMonth}"
						>${display}</a>
					</td>
				`;
			}

			bind_drilldown_events(target) {
				target.off("click.month-expense", ".drilldown-link");
				target.on("click.month-expense", ".drilldown-link", (e) => {
					e.preventDefault();
					const $link = $(e.currentTarget);
					const section_label = $link.attr("data-section") || "";
					const row_label = $link.attr("data-row") || "";
					const month_key = $link.attr("data-month") || "";
					this.open_drilldown({ section_label, row_label, month_key: month_key || null });
				});
			}

			open_drilldown({ section_label, row_label, month_key }) {
				frappe.call({
					method:
						"tif_customization.tif_customization.page.month_wise_expense.month_wise_expense.get_drilldown_entries",
					args: {
						section_label,
						row_label,
						month_key: month_key || "",
					},
					freeze: true,
					freeze_message: "Loading entries...",
					callback: (r) => {
						const data = r.message || {};
						this.show_drilldown_dialog(data);
					},
				});
			}

			show_drilldown_dialog(data) {
				const entries = data.entries || [];
				const titleParts = [
					data.row_label || "Drilldown",
					data.from_date && data.to_date ? `${data.from_date} to ${data.to_date}` : "",
				].filter(Boolean);

				const toFloat = (value) => {
					if (value === null || value === undefined) return 0;
					if (typeof value === "number") return value;
					const parsed = parseFloat(value);
					return Number.isFinite(parsed) ? parsed : 0;
				};

				const debitTotal = entries.reduce((acc, e) => acc + toFloat(e.debit), 0);
				const creditTotal = entries.reduce((acc, e) => acc + toFloat(e.credit), 0);
				const amountTotal = toFloat(data.total);

				const rowsHtml = entries
					.map((e) => {
						const voucher =
							e.voucher_type && e.voucher_no
								? frappe.utils.get_form_link(e.voucher_type, e.voucher_no, true)
								: frappe.utils.escape_html(e.voucher_no || "");
						const party = [e.party_type, e.party].filter(Boolean).join(": ");
						return `
							<tr>
								<td>${frappe.utils.escape_html(e.posting_date || "")}</td>
								<td>${voucher}</td>
								<td>${frappe.utils.escape_html(e.account_name || e.account || "")}</td>
								<td>${frappe.utils.escape_html(e.cost_center || "")}</td>
								<td>${frappe.utils.escape_html(party)}</td>
								<td class="text-right">${this.format_amount(e.debit)}</td>
								<td class="text-right">${this.format_amount(e.credit)}</td>
								<td class="text-right">${this.format_amount(e.amount)}</td>
								<td>${frappe.utils.escape_html(e.remarks || "")}</td>
							</tr>
						`;
					})
					.join("");

				const truncatedNote = data.truncated
					? `<div class="text-muted small" style="margin-bottom:8px;">Showing first 2000 entries (truncated).</div>`
					: "";

				const html = `
					${truncatedNote}
					<div class="table-responsive">
						<table class="table table-bordered table-hover drilldown-table">
							<thead>
								<tr>
									<th style="width: 110px;">Date</th>
									<th style="width: 170px;">Voucher</th>
									<th>Account</th>
									<th>Cost Center</th>
									<th style="width: 160px;">Party</th>
									<th class="text-right" style="width: 110px;">Debit</th>
									<th class="text-right" style="width: 110px;">Credit</th>
									<th class="text-right" style="width: 110px;">Amount</th>
									<th>Remarks</th>
								</tr>
							</thead>
							<tbody>
								${rowsHtml}
								<tr class="drilldown-total-row">
									<td colspan="5"><strong>Total</strong></td>
									<td class="text-right"><strong>${this.format_amount(debitTotal)}</strong></td>
									<td class="text-right"><strong>${this.format_amount(creditTotal)}</strong></td>
									<td class="text-right"><strong>${this.format_amount(amountTotal)}</strong></td>
									<td></td>
								</tr>
							</tbody>
						</table>
					</div>
				`;

				const d = new frappe.ui.Dialog({
					title: titleParts.join(" — "),
					size: "extra-large",
					fields: [{ fieldtype: "HTML", fieldname: "html" }],
				});
				d.fields_dict.html.$wrapper.html(html);
				d.show();
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
						.month-table td.text-right,
						.month-table th.text-center {
							min-width: 130px;
							white-space: nowrap;
						}
						.month-table td:first-child,
						.month-table th:first-child {
							min-width: 260px;
							white-space: normal;
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
						.month-table a.drilldown-link {
							text-decoration: underline;
						}
						.drilldown-total-row td {
							background: #f8fafc;
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
