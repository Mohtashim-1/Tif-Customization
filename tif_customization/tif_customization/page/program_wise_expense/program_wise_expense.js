frappe.pages["program-wise-expense"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: "Program Wise Expense",
		single_column: true,
	});

	if (!window.ProgramWiseExpenseReport) {
		window.ProgramWiseExpenseReport = class ProgramWiseExpenseReport {
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
					<div class="program-expense-root">
						<div class="program-expense-toolbar">
							<button class="btn btn-primary" id="reload-program-expense">
								<i class="fa fa-refresh"></i> Reload
							</button>
							<button class="btn btn-default" id="print-program-expense">
								<i class="fa fa-print"></i> Print
							</button>
						</div>
						<div id="program-expense-report"></div>
					</div>
				`);
				this.inject_styles();
			}

			bind_events() {
				$("#reload-program-expense").on("click", () => this.load_data());
				$("#print-program-expense").on("click", () => window.print());
			}

			load_data() {
				frappe.call({
					method:
						"tif_customization.tif_customization.page.program_wise_expense.program_wise_expense.get_report_data",
					freeze: true,
					freeze_message: "Loading Program Wise Expense Report...",
					callback: (r) => {
						this.data = r.message || {};
						this.render_report();
					},
					error: () => frappe.msgprint("Unable to load Program Wise Expense report data."),
				});
			}

			render_report() {
				const target = $("#program-expense-report");
				const departments = this.data.departments || [];
				const quarters = this.data.quarters || [];
				const quarterColSpan = departments.length + 1;
				const totalColumns = 1 + quarterColSpan * quarters.length;

				let html = `
					<div class="statement-head">
						<h3>The ILM Foundation</h3>
						<div><strong>${frappe.utils.escape_html(this.data.fiscal_year_label || "")}</strong></div>
						<div>Fiscal Year: ${frappe.utils.escape_html(this.data.fiscal_year_from_date || "")} to ${frappe.utils.escape_html(
					this.data.fiscal_year_to_date || ""
				)}</div>
						<div>As on: ${frappe.utils.escape_html(this.data.as_on_date || "")}</div>
					</div>
				`;

				if (!quarters.length) {
					target.html(html);
					return;
				}

				const quarterHeaderRow = quarters
					.map((quarter) => {
						const rangeLabel = quarter.is_current_quarter
							? `${quarter.from_date} to ${quarter.effective_to_date}`
							: `${quarter.from_date} to ${quarter.to_date}`;
						return `<th class="text-center quarter-head" colspan="${quarterColSpan}">${frappe.utils.escape_html(
							`${quarter.label} (${rangeLabel})`
						)}</th>`;
					})
					.join("");

				const quarterSubHeaderRow = quarters
					.map(
						() => `
							<th class="text-center">TIF (Trust) Total</th>
							<th class="text-center" colspan="${departments.length}">Departments (Programs)</th>
						`
					)
					.join("");

				const quarterDeptHeaderRow = quarters
					.map(() => {
						const deptHeaders = departments
							.map((d, idx) => {
								const extraClass = idx === departments.length - 1 ? "quarter-end-col" : "";
								return `<th class="text-center ${extraClass}">${frappe.utils.escape_html(d.label)}</th>`;
							})
							.join("");
						return `<th class="text-center">Total</th>${deptHeaders}`;
					})
					.join("");

				const baseRows = quarters[0].rows || [];
				let bodyHtml = "";
				baseRows.forEach((baseRow, rowIndex) => {
					if (baseRow.row_type === "spacer") {
						bodyHtml += `<tr class="spacer-row"><td colspan="${totalColumns}"></td></tr>`;
						return;
					}

					if (baseRow.row_type === "section") {
						bodyHtml += `<tr class="section-row"><td colspan="${totalColumns}">${frappe.utils.escape_html(
							baseRow.label || ""
						)}</td></tr>`;
						return;
					}

					const className =
						baseRow.row_type === "grand_total"
							? "grand-total-row"
							: baseRow.row_type === "total"
							? "total-row"
							: "";

					const drillable = baseRow.row_type === "data";
					let quarterCells = "";
					quarters.forEach((quarter) => {
						const row = (quarter.rows || [])[rowIndex] || {};
						quarterCells += this.render_amount_cell(row.total || 0, {
							drillable,
							row_index: rowIndex,
							quarter,
							department_key: null,
						});
						departments.forEach((d, idx) => {
							const extraClass = idx === departments.length - 1 ? "quarter-end-col" : "";
							const cellHtml = this.render_amount_cell(((row.by_department || {})[d.key] || 0), {
								drillable,
								row_index: rowIndex,
								quarter,
								department_key: d.key,
								extra_class: extraClass,
							});
							quarterCells += cellHtml;
						});
					});

					bodyHtml += `
						<tr class="${className}">
							<td>${frappe.utils.escape_html(baseRow.label || "")}</td>
							${quarterCells}
						</tr>
					`;
				});

				html += `
					<div class="table-responsive">
						<table class="table table-bordered statement-table wide-matrix">
							<thead>
								<tr>
									<th rowspan="3" class="text-left">Expense Head</th>
									${quarterHeaderRow}
								</tr>
								<tr>${quarterSubHeaderRow}</tr>
								<tr>${quarterDeptHeaderRow}</tr>
							</thead>
							<tbody>${bodyHtml}</tbody>
						</table>
					</div>
				`;

				target.html(html);
				this.bind_drilldown_events(target);
			}

			format_amount(value) {
				return format_currency(value || 0, frappe.defaults.get_default("currency"));
			}

			render_amount_cell(value, { drillable, row_index, quarter, department_key, extra_class }) {
				const display = this.format_amount(value || 0);
				const numeric = Math.abs(value || 0) >= 0.0001;
				const cls = `text-right ${extra_class || ""}`.trim();

				if (!drillable || !numeric) {
					return `<td class="${cls}">${display}</td>`;
				}

				const from_date = quarter.from_date;
				const to_date = quarter.is_current_quarter ? quarter.effective_to_date : quarter.to_date;
				const dept = department_key || "";

				return `
					<td class="${cls}">
						<a
							href="#"
							class="pwe-drilldown-link"
							data-row-index="${row_index}"
							data-from="${frappe.utils.escape_html(from_date || "")}"
							data-to="${frappe.utils.escape_html(to_date || "")}"
							data-dept="${frappe.utils.escape_html(dept)}"
						>${display}</a>
					</td>
				`;
			}

			bind_drilldown_events(target) {
				target.off("click.program-expense", ".pwe-drilldown-link");
				target.on("click.program-expense", ".pwe-drilldown-link", (e) => {
					e.preventDefault();
					const $link = $(e.currentTarget);
					this.open_drilldown({
						row_index: $link.attr("data-row-index"),
						from_date: $link.attr("data-from"),
						to_date: $link.attr("data-to"),
						department_key: $link.attr("data-dept") || "",
					});
				});
			}

			open_drilldown({ row_index, from_date, to_date, department_key }) {
				frappe.call({
					method:
						"tif_customization.tif_customization.page.program_wise_expense.program_wise_expense.get_drilldown_entries",
					args: {
						row_index,
						from_date,
						to_date,
						department_key: department_key || null,
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
				const toFloat = (value) => {
					if (value === null || value === undefined) return 0;
					if (typeof value === "number") return value;
					const parsed = parseFloat(value);
					return Number.isFinite(parsed) ? parsed : 0;
				};

				const debitTotal = entries.reduce((acc, e) => acc + toFloat(e.debit), 0);
				const creditTotal = entries.reduce((acc, e) => acc + toFloat(e.credit), 0);
				const amountTotalShown = entries.reduce((acc, e) => acc + toFloat(e.amount), 0);

				const titleParts = [
					data.row_label || "Drilldown",
					data.department_key ? `Dept: ${data.department_key}` : "",
					data.from_date && data.to_date ? `${data.from_date} to ${data.to_date}` : "",
				].filter(Boolean);

				const truncatedNote = data.truncated
					? `<div class="text-muted small" style="margin-bottom:8px;">Showing first 2000 GL entries (truncated).</div>`
					: "";

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
								<td>${frappe.utils.escape_html(e.cost_center_name || e.cost_center || "")}</td>
								<td>${frappe.utils.escape_html(party)}</td>
								<td class="text-right">${this.format_amount(e.debit)}</td>
								<td class="text-right">${this.format_amount(e.credit)}</td>
								<td class="text-right">${this.format_amount(e.amount)}</td>
								<td>${frappe.utils.escape_html(e.remarks || "")}</td>
							</tr>
						`;
					})
					.join("");

				const summaryHtml = `
					<div style="margin-bottom:8px;">
						<div><strong>Voucher Count:</strong> ${frappe.utils.escape_html(String(data.voucher_count || 0))}</div>
						<div><strong>Total Amount:</strong> ${this.format_amount(data.total_amount || 0)}</div>
					</div>
				`;

				const html = `
					${summaryHtml}
					${truncatedNote}
					<div class="table-responsive">
						<table class="table table-bordered table-hover pwe-drilldown-table">
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
								<tr class="pwe-drilldown-total-row">
									<td colspan="5"><strong>Total (Shown)</strong></td>
									<td class="text-right"><strong>${this.format_amount(debitTotal)}</strong></td>
									<td class="text-right"><strong>${this.format_amount(creditTotal)}</strong></td>
									<td class="text-right"><strong>${this.format_amount(amountTotalShown)}</strong></td>
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
				if ($("#program-expense-style").length) return;
				$("head").append(`
					<style id="program-expense-style">
						.program-expense-toolbar {
							display: flex;
							gap: 8px;
							margin-bottom: 14px;
						}
						.statement-head {
							margin-bottom: 14px;
						}
						.statement-table td,
						.statement-table th {
							font-size: 12px;
							vertical-align: middle;
						}
						.statement-table td.text-right {
							min-width: 140px;
							white-space: nowrap;
						}
						.statement-table td.text-right .currency,
						.statement-table td.text-right .currency-amount {
							white-space: nowrap;
							display: inline;
						}
						.statement-table td:first-child,
						.statement-table th:first-child {
							min-width: 260px;
							white-space: normal;
						}
						.wide-matrix {
							min-width: 2200px;
						}
						.statement-table .quarter-head {
							background: #e9edf5;
							font-weight: 700;
						}
						.statement-table .quarter-end-col {
							border-right: 3px solid #cbd5e1 !important;
							padding-right: 14px !important;
						}
						.statement-table .section-row td {
							background: #eef2ff;
							font-weight: 700;
						}
						.statement-table .total-row td {
							background: #f8fafc;
							font-weight: 700;
						}
						.statement-table .grand-total-row td {
							background: #e2e8f0;
							font-weight: 700;
						}
						.statement-table .spacer-row td {
							height: 8px;
							border-left: 0;
							border-right: 0;
						}
						.statement-table a.pwe-drilldown-link {
							text-decoration: underline;
						}
						.pwe-drilldown-total-row td {
							background: #f8fafc;
						}
						@media print {
							@page {
								size: A4 landscape;
								margin: 8mm;
							}
							.program-expense-toolbar,
							.page-head {
								display: none !important;
							}
							.statement-table {
								width: 100% !important;
							}
							.statement-table td,
							.statement-table th {
								font-size: 10px;
							}
						}
					</style>
				`);
			}
		};
	}

	const report = new window.ProgramWiseExpenseReport(page);
	report.make();
};
