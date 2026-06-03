frappe.pages["reconcillation-with-"].on_page_load = function (wrapper) {
	new ReconciliationWithBankPage(wrapper);
};

class ReconciliationWithBankPage {
	constructor(wrapper) {
		this.suspend_filter_change = false;
		this.page = frappe.ui.make_app_page({
			parent: wrapper,
			title: __("Reconciliation with Bank Statements Summary"),
			single_column: true,
		});
		this.setup_layout();
		this.setup_filters();
		this.bind_actions();
		this.show_help_placeholder();
	}

	get_fiscal_defaults() {
		const today = frappe.datetime.str_to_obj(frappe.datetime.get_today());
		const fyStartYear = today.getMonth() + 1 >= 7 ? today.getFullYear() : today.getFullYear() - 1;
		const from = new Date(fyStartYear, 6, 1);
		const to = new Date(fyStartYear + 1, 3, 30);
		if (today < to) {
			to.setTime(today.getTime());
		}
		return {
			from_date: frappe.datetime.obj_to_str(from),
			to_date: frappe.datetime.obj_to_str(to),
		};
	}

	setup_layout() {
		this.body = $(`
			<div class="recon-bank-page p-2">
				<div class="border rounded p-3 mb-3 recon-bank-filters">
					<div class="d-flex align-items-center justify-content-between mb-2">
						<h5 class="mb-0">${__("Filters")}</h5>
						<div>
							<button class="btn btn-sm btn-primary recon-apply">${__("Apply")}</button>
							<button class="btn btn-sm btn-default recon-reset">${__("Reset")}</button>
						</div>
					</div>
					<div class="recon-filter-grid">
						<div class="row recon-filter-row">
							<div class="col-lg-4 col-md-6 recon-filter-field" data-field="company"></div>
							<div class="col-lg-4 col-md-6 recon-filter-field" data-field="from_date"></div>
							<div class="col-lg-4 col-md-6 recon-filter-field" data-field="to_date"></div>
						</div>
						<div class="recon-bank-filter-panel mt-3">
							<div class="recon-bank-filter-panel-head">
								<span class="recon-bank-filter-title">${__("Bank selection")}</span>
								<div class="recon-filter-field recon-filter-check" data-field="all_bank_accounts"></div>
							</div>
							<div class="recon-filter-field recon-filter-banks" data-field="bank_accounts"></div>
						</div>
					</div>
				</div>
				<div class="border rounded p-3">
					<div class="d-flex align-items-center justify-content-between mb-2">
						<h5 class="mb-0">${__("Report")}</h5>
						<div>
							<button class="btn btn-sm btn-success recon-export-excel">
								<i class="fa fa-file-excel-o"></i> ${__("Export Excel")}
							</button>
						</div>
					</div>
					<div class="recon-report"></div>
				</div>
			</div>
		`);
		$(this.page.body).empty().append(this.body);
		this.inject_styles();
	}

	inject_styles() {
		if ($("#recon-bank-style").length) return;
		$("head").append(`
			<style id="recon-bank-style">
				.recon-bank-table { font-size: 12px; margin-bottom: 0; min-width: max-content; }
				.recon-bank-table th, .recon-bank-table td {
					padding: 6px 8px;
					vertical-align: middle;
				}
				.recon-bank-table .recon-title {
					text-align: center;
					font-weight: 700;
					font-size: 15px;
					background: #f8fafc;
				}
				.recon-bank-table .recon-bank-head {
					text-align: center;
					font-weight: 700;
					background: #eef2ff;
					min-width: 140px;
				}
				.recon-bank-table .recon-section {
					background: #b8c9e8;
					font-weight: 700;
					min-width: 160px;
				}
				.recon-bank-table .recon-money { text-align: right; white-space: nowrap; }
				.recon-bank-table .recon-ending td { font-weight: 700; background: #f1f5f9; }
				.recon-bank-scroll { overflow-x: auto; }
				.recon-filter-grid .recon-filter-row {
					margin-left: -8px;
					margin-right: -8px;
				}
				.recon-filter-grid .recon-filter-field {
					padding-left: 8px;
					padding-right: 8px;
					margin-bottom: 12px;
				}
				.recon-filter-grid .recon-filter-field .form-group {
					margin-bottom: 0;
				}
				.recon-filter-grid .recon-filter-field .control-input-wrapper,
				.recon-filter-grid .recon-filter-field .control-input,
				.recon-filter-grid .recon-filter-field input.form-control {
					width: 100% !important;
					max-width: 100%;
				}
				.recon-filter-grid .recon-filter-field .multiselect-list {
					width: 100%;
					min-height: 36px;
				}
				.recon-filter-grid .recon-filter-field .multiselect-list .form-control {
					min-height: 36px;
				}
				.recon-bank-filter-panel {
					border: 1px solid #e2e8f0;
					border-radius: 8px;
					padding: 12px 14px;
					background: #f8fafc;
				}
				.recon-bank-filter-panel-head {
					display: flex;
					align-items: center;
					justify-content: space-between;
					flex-wrap: wrap;
					gap: 8px 16px;
					margin-bottom: 10px;
				}
				.recon-bank-filter-title {
					font-size: 13px;
					font-weight: 600;
					color: #334155;
				}
				.recon-filter-check .form-group {
					display: flex;
					align-items: center;
					margin-bottom: 0 !important;
				}
				.recon-filter-check .checkbox {
					margin: 0;
				}
				.recon-filter-check .control-label {
					margin-bottom: 0;
					padding-left: 6px;
				}
				.recon-filter-banks .form-group .control-label {
					display: block;
					margin-bottom: 6px;
				}
				@media (min-width: 992px) {
					.recon-filter-grid .recon-filter-row .recon-filter-field {
						margin-bottom: 0;
					}
				}
				@media print {
					.recon-bank-filters, .page-head { display: none !important; }
				}
			</style>
		`);
	}

	make_filter(df) {
		const $slot = this.body.find(`.recon-filter-field[data-field="${df.fieldname}"]`);
		if (!$slot.length) return null;
		const control = frappe.ui.form.make_control({
			parent: $slot.get(0),
			df: { ...df, change: () => this.on_filter_change() },
			render_input: true,
		});
		control.refresh();
		if (df.default !== undefined && df.default !== null) control.set_value(df.default);
		return control;
	}

	set_bank_accounts_enabled(enabled) {
		const ctrl = this.filters.bank_accounts;
		if (!ctrl) return;
		ctrl.df.read_only = enabled ? 0 : 1;
		ctrl.refresh();
		const $toggle = ctrl.$list_wrapper?.find(".form-control.cursor-pointer");
		if ($toggle?.length) {
			$toggle.toggleClass("disabled", !enabled).css("pointer-events", enabled ? "" : "none");
			$toggle.css("opacity", enabled ? "" : "0.6");
		}
	}

	setup_filters() {
		const defaults = this.get_fiscal_defaults();
		this.filters = {
			company: this.make_filter({
				label: __("Company"),
				fieldname: "company",
				fieldtype: "Link",
				options: "Company",
				default: frappe.defaults.get_user_default("Company"),
				reqd: 1,
			}),
			all_bank_accounts: this.make_filter({
				label: __("All Bank Accounts"),
				fieldname: "all_bank_accounts",
				fieldtype: "Check",
				default: 1,
			}),
			bank_accounts: this.make_filter({
				label: __("Bank Accounts (select one or more)"),
				fieldname: "bank_accounts",
				fieldtype: "MultiSelectList",
				options: "Bank Account",
				reqd: 0,
				get_data: (txt) => {
					const company = this.filters.company.get_value();
					if (!company) return [];
					return frappe
						.call({
							method:
								"tif_customization.tif_customization.page.reconcillation_with_.reconcillation_with_.get_bank_account_options",
							args: { company, txt: txt || "" },
							async: false,
						})
						.then((r) => r.message || []);
				},
			}),
			from_date: this.make_filter({
				label: __("From Date"),
				fieldname: "from_date",
				fieldtype: "Date",
				default: defaults.from_date,
				reqd: 1,
			}),
			to_date: this.make_filter({
				label: __("To Date"),
				fieldname: "to_date",
				fieldtype: "Date",
				default: defaults.to_date,
				reqd: 1,
			}),
		};

		this.filters.all_bank_accounts.$input.on("change", () => {
			const all = this.filters.all_bank_accounts.get_value();
			this.set_bank_accounts_enabled(!all);
			if (all && this.filters.bank_accounts) {
				this.filters.bank_accounts.set_value([]);
			}
		});
		this.set_bank_accounts_enabled(!this.filters.all_bank_accounts.get_value());
	}

	bind_actions() {
		this.body.find(".recon-apply").on("click", () => this.load_data());
		this.body.find(".recon-export-excel").on("click", () => this.export_excel());
		this.body.find(".recon-reset").on("click", () => {
			const defaults = this.get_fiscal_defaults();
			this.set_filters({
				company: frappe.defaults.get_user_default("Company"),
				all_bank_accounts: 0,
				bank_accounts: [],
				from_date: defaults.from_date,
				to_date: defaults.to_date,
			});
			this.show_help_placeholder();
		});
	}

	on_filter_change() {
		if (this.suspend_filter_change) return;
	}

	set_filters(values) {
		this.suspend_filter_change = true;
		Object.entries(values).forEach(([key, value]) => {
			if (this.filters[key]) this.filters[key].set_value(value ?? "");
		});
		this.set_bank_accounts_enabled(!this.filters.all_bank_accounts.get_value());
		this.suspend_filter_change = false;
	}

	get_filter_values() {
		const bank_accounts = this.filters.bank_accounts.get_value() || [];
		return {
			company: this.filters.company.get_value(),
			all_bank_accounts: this.filters.all_bank_accounts.get_value() ? 1 : 0,
			bank_accounts: Array.isArray(bank_accounts) ? bank_accounts : [],
			from_date: this.filters.from_date.get_value(),
			to_date: this.filters.to_date.get_value(),
		};
	}

	show_help_placeholder() {
		this.body.find(".recon-report").html(
			`<div class="text-muted">${__(
				"Select one or more Bank Accounts (or tick All Bank Accounts), then click Apply."
			)}</div>`
		);
	}

	load_data() {
		const filters = this.get_filter_values();
		if (!filters.all_bank_accounts && !filters.bank_accounts.length) {
			frappe.msgprint(__("Select at least one Bank Account, or enable All Bank Accounts."));
			return;
		}
		this.body.find(".recon-report").html(`<div class="text-muted">${__("Loading...")}</div>`);
		frappe.call({
			method:
				"tif_customization.tif_customization.page.reconcillation_with_.reconcillation_with_.get_report_data",
			args: { filters },
			freeze: true,
			freeze_message: __("Loading report..."),
			callback: (r) => {
				this.render_report(r.message || {});
			},
			error: () => {
				this.body.find(".recon-report").html(
					`<div class="text-danger">${__("Failed to load report.")}</div>`
				);
			},
		});
	}

	export_excel() {
		const filters = this.get_filter_values();
		if (!filters.all_bank_accounts && !filters.bank_accounts.length) {
			frappe.msgprint(__("Select at least one Bank Account, or enable All Bank Accounts."));
			return;
		}
		const url =
			"/api/method/tif_customization.tif_customization.page.reconcillation_with_.reconcillation_with_.download_reconciliation_excel?filters=" +
			encodeURIComponent(JSON.stringify(filters));
		window.open(url, "_blank");
	}

	money(value) {
		return format_currency(flt(value || 0), frappe.defaults.get_default("currency"));
	}

	bankCells(banks, bankValues) {
		return banks
			.map(
				(bank) =>
					`<td class="recon-money">${frappe.utils.escape_html(
						this.money((bankValues || {})[bank.bank_account])
					)}</td>`
			)
			.join("");
	}

	render_report(data) {
		const banks = data.banks || [];
		if (!banks.length) {
			this.body.find(".recon-report").html(
				`<div class="text-muted">${__("No bank accounts found for the selected filters.")}</div>`
			);
			return;
		}

		const donations = data.donations || [];
		const expenses = data.expenses || [];
		const initial = data.initial_amount || {};
		const ending = data.ending_balance || {};
		const title = frappe.utils.escape_html(data.title || __("Reconciliation with Bank Statements Summary"));
		const totalCols = 2 + banks.length;

		const bankHeaders = banks
			.map(
				(bank) =>
					`<th class="recon-bank-head">${frappe.utils.escape_html(
						bank.label || bank.bank_account
					)}</th>`
			)
			.join("");

		const donationRows = donations
			.map((row, idx) => {
				const section =
					idx === 0
						? `<td class="recon-section" rowspan="${donations.length}">${__("Add donation")}</td>`
						: "";
				return `
					<tr>
						${section}
						<td>${frappe.utils.escape_html(row.month_label || "")}</td>
						${this.bankCells(banks, row.banks)}
					</tr>
				`;
			})
			.join("");

		const expenseRows = expenses
			.map((row, idx) => {
				const section =
					idx === 0
						? `<td class="recon-section" rowspan="${expenses.length}">${__(
								"Less monthly payments & expenses"
						  )}</td>`
						: "";
				return `
					<tr>
						${section}
						<td>${frappe.utils.escape_html(row.month_label || "")}</td>
						${this.bankCells(banks, row.banks)}
					</tr>
				`;
			})
			.join("");

		this.body.find(".recon-report").html(`
			<div class="recon-bank-scroll table-responsive">
				<table class="table table-bordered recon-bank-table">
					<thead>
						<tr>
							<th colspan="${totalCols}" class="recon-title">${title}</th>
						</tr>
						<tr>
							<th></th>
							<th></th>
							${bankHeaders}
						</tr>
					</thead>
					<tbody>
						<tr>
							<td>${__("Initial Amount")}</td>
							<td>${frappe.utils.escape_html(initial.date_label || "")}</td>
							${this.bankCells(banks, initial.banks)}
						</tr>
						${donationRows}
						${expenseRows}
						<tr class="recon-ending">
							<td>${__("Ending balance {0}", [ending.date_label || ""])}</td>
							<td></td>
							${this.bankCells(banks, ending.banks)}
						</tr>
					</tbody>
				</table>
			</div>
		`);
	}
}
