frappe.pages["cash-expense"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Cash Expense"),
		single_column: true,
	});
	wrapper.cash_expense_page = new frappe.tif_customization.CashExpensePage(page, wrapper);
	wrapper.cash_expense_page.make();
};

frappe.pages["cash-expense"].on_page_show = function (wrapper) {
	const page = wrapper.cash_expense_page;
	if (page && page._ready) page.load_data();
};

frappe.tif_customization = frappe.tif_customization || {};

frappe.tif_customization.CashExpensePage = class CashExpensePage {
	constructor(page, wrapper) {
		this.page = page;
		this.wrapper = wrapper;
		this.data = null;
		this._ready = false;
		this.defaults = {
			company: "The ILM Foundation",
			account: "PETTY CASH - TIF",
			from_date: "2026-07-01",
			to_date: "2027-06-30",
		};
	}

	make() {
		this._ready = false;
		this.make_layout();
		this.make_filters();
		this.page.set_primary_action(__("Refresh"), () => this.load_data(), "refresh");
		this.page.add_inner_button(__("Print / PDF"), () => this.print_statement());
		this.page.add_action_item(__("Export CSV"), () => this.export_csv());
		// Sync defaults first (no race), then load — avoids empty first paint
		this.apply_defaults_sync();
		this._ready = true;
		this.load_data();
		// Optional: refine FY from server without blocking first render
		this.refine_fy_dates();
	}

	make_layout() {
		$(this.page.body).empty().html(`
			<div class="ce-root">
				<style>
					.ce-root{padding:12px 16px 28px;width:100%;max-width:none;margin:0}
					.ce-root .page-form,.ce-filters{width:100%}
					.ce-statement{width:100%}
					.ce-note{font-size:12px;color:#6b7280;margin:0 0 12px;line-height:1.45}
					.ce-filters{margin-bottom:14px}
					.ce-statement{
						background:#fff;border:1px solid #e5e7eb;border-radius:12px;
						box-shadow:0 1px 2px rgba(15,23,42,.04);overflow:hidden
					}
					.ce-brand{
						display:flex;justify-content:space-between;gap:16px;align-items:flex-start;
						padding:18px 20px;border-bottom:3px solid #1b5e3b;background:linear-gradient(180deg,#f8faf8,#fff)
					}
					.ce-brand-left{display:flex;gap:14px;align-items:center}
					.ce-brand-left img{max-height:56px;max-width:120px;object-fit:contain}
					.ce-company{margin:0;font-size:18px;font-weight:800;color:#123524;letter-spacing:.2px}
					.ce-contact{margin:4px 0 0;font-size:11px;color:#6b7280;line-height:1.4}
					.ce-doc-title{text-align:right}
					.ce-doc-title h2{margin:0;font-size:16px;font-weight:800;color:#1b5e3b;text-transform:uppercase;letter-spacing:.6px}
					.ce-doc-title .sub{margin-top:4px;font-size:11px;color:#64748b}
					.ce-party-bar{
						display:grid;grid-template-columns:1.4fr 1fr 1fr;gap:12px;
						padding:14px 20px;background:#f8fafc;border-bottom:1px solid #e5e7eb
					}
					.ce-party-bar .lbl{font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.4px}
					.ce-party-bar .val{margin-top:3px;font-size:13px;font-weight:700;color:#0f172a}
					.ce-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;padding:14px 20px}
					.ce-kpi{border:1px solid #e5e7eb;border-radius:10px;padding:12px 14px;background:#fff}
					.ce-kpi .lbl{font-size:10px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.4px}
					.ce-kpi .val{font-size:16px;font-weight:800;margin-top:4px;font-variant-numeric:tabular-nums;color:#123524;text-align:right}
					.ce-table-wrap{padding:0 12px 16px;overflow:auto}
					.ce-table{width:100%;border-collapse:collapse;font-size:12px;min-width:0;table-layout:auto}
					.ce-table th:nth-child(3),.ce-table td:nth-child(3){min-width:220px;width:35%}
					.ce-table th,.ce-table td{padding:8px 8px;border:1px solid #e5e7eb;vertical-align:top}
					.ce-table thead th{
						background:#1b5e3b;color:#fff;font-weight:700;white-space:nowrap;
						text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.3px;border-color:#145230
					}
					.ce-table thead th.num,.ce-table td.num{text-align:right;font-variant-numeric:tabular-nums}
					.ce-table .left{text-align:left}
					.ce-table tbody tr:nth-child(even):not(.row-open):not(.row-close){background:#fafcfa}
					.ce-table .row-open td{background:#eef2ff;font-weight:700}
					.ce-table .row-close td{background:#1b5e3b;color:#fff;font-weight:800;border-color:#145230}
					.ce-table a{color:#1d4ed8;text-decoration:underline}
					.ce-footer{
						display:flex;justify-content:space-between;gap:12px;padding:12px 20px 16px;
						border-top:1px solid #e5e7eb;font-size:11px;color:#6b7280
					}
					.ce-footer strong{color:#123524}
					@media (max-width:900px){
						.ce-party-bar,.ce-kpis{grid-template-columns:1fr 1fr}
						.ce-brand{flex-direction:column}
						.ce-doc-title{text-align:left}
					}
					@media print{
						.page-head,.layout-side-section,.ce-filters,.ce-note,
						.navbar,.page-form,.std-form-layout{display:none!important}
						.ce-root{padding:0;max-width:none}
						.ce-statement{box-shadow:none;border:0;border-radius:0}
						.ce-table{min-width:0;font-size:10px}
						body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
					}
				</style>
				<p class="ce-note no-print">
					${__("Cash expense ledger from GL Entry (default: Petty Cash). Balance = Opening + Debit − Credit.")}
					${__("Use")} <strong>${__("Print / PDF")}</strong> ${__("for a statement.")}
				</p>
				<div class="ce-filters row no-print"></div>
				<div class="ce-report-body"></div>
			</div>
		`);
		this.$root = $(this.page.body).find(".ce-root");
		this.$filters = this.$root.find(".ce-filters");
		this.$report = this.$root.find(".ce-report-body");
	}

	make_filters() {
		const d = this.defaults;
		const company = frappe.defaults.get_user_default("Company") || d.company;
		const fy_start = frappe.defaults.get_user_default("year_start_date") || d.from_date;
		const fy_end = frappe.defaults.get_user_default("year_end_date") || d.to_date;

		this.company = this.make_filter({
			label: __("Company"),
			fieldtype: "Link",
			fieldname: "company",
			options: "Company",
			default: company,
			reqd: 1,
		});
		this.from_date = this.make_filter({
			label: __("From Date"),
			fieldtype: "Date",
			fieldname: "from_date",
			default: fy_start,
			reqd: 1,
		});
		this.to_date = this.make_filter({
			label: __("To Date"),
			fieldtype: "Date",
			fieldname: "to_date",
			default: fy_end,
			reqd: 1,
		});
		this.account = this.make_filter({
			label: __("Cash Account"),
			fieldtype: "Link",
			fieldname: "account",
			options: "Account",
			default: d.account,
			reqd: 1,
			get_query: () => ({
				filters: {
					company: this.company.get_value() || d.company,
					account_type: "Cash",
					is_group: 0,
				},
			}),
		});
		this.cost_center = this.make_filter({
			label: __("Cost Center"),
			fieldtype: "Link",
			fieldname: "cost_center",
			options: "Cost Center",
			get_query: () => ({
				filters: {
					company: this.company.get_value() || d.company,
					is_group: 0,
				},
			}),
		});
	}

	apply_defaults_sync() {
		const d = this.defaults;
		const company = frappe.defaults.get_user_default("Company") || d.company;
		const fy_start = frappe.defaults.get_user_default("year_start_date") || d.from_date;
		const fy_end = frappe.defaults.get_user_default("year_end_date") || d.to_date;
		this.set_filter_value(this.company, company);
		this.set_filter_value(this.from_date, fy_start);
		this.set_filter_value(this.to_date, fy_end);
		this.set_filter_value(this.account, d.account);
	}

	set_filter_value(control, value) {
		if (!control || value == null || value === "") return;
		// Write model + input immediately (Link set_value alone is async and often blank on first paint)
		control.value = value;
		control.last_value = value;
		if (control.df) control.df.default = value;
		if (typeof control.set_input === "function") {
			control.set_input(value);
		} else if (control.$input) {
			control.$input.val(value);
		}
		try {
			control.set_value(value);
		} catch (e) {
			/* ignore */
		}
	}

	refine_fy_dates() {
		frappe.db
			.get_list("Fiscal Year", {
				fields: ["year_start_date", "year_end_date"],
				filters: { disabled: 0 },
				order_by: "year_start_date desc",
				limit: 1,
			})
			.then((years) => {
				const fy = (years && years[0]) || {};
				if (!fy.year_start_date || !fy.year_end_date) return;
				const cur_from = this.from_date.get_value();
				const cur_to = this.to_date.get_value();
				// Only overwrite if still on bootstrap defaults
				if (!cur_from || cur_from === this.defaults.from_date) {
					this.set_filter_value(this.from_date, fy.year_start_date);
				}
				if (!cur_to || cur_to === this.defaults.to_date) {
					this.set_filter_value(this.to_date, fy.year_end_date);
				}
			})
			.catch(() => {});
	}

	make_filter(df) {
		const wrap = $('<div class="col-md-2" style="margin-bottom:8px;"></div>');
		this.$filters.append(wrap);
		const control = frappe.ui.form.make_control({
			parent: wrap.get(0),
			df: Object.assign(
				{
					change: () => {
						if (this._ready) this.schedule_load();
					},
				},
				df
			),
			render_input: true,
		});
		control.refresh();
		if (df.default != null && df.default !== "") {
			this.set_filter_value(control, df.default);
		}
		return control;
	}

	schedule_load() {
		clearTimeout(this._timer);
		this._timer = setTimeout(() => this.load_data(), 350);
	}

	get_filters() {
		const d = this.defaults;
		return {
			company: this.company.get_value() || d.company,
			from_date: this.from_date.get_value() || d.from_date,
			to_date: this.to_date.get_value() || d.to_date,
			account: this.account.get_value() || d.account,
			cost_center: this.cost_center.get_value() || "",
		};
	}

	load_data() {
		const filters = this.get_filters();
		if (!filters.company || !filters.from_date || !filters.to_date || !filters.account) {
			frappe.msgprint(__("Please set Company, dates and Cash Account."));
			return;
		}
		this.$report.html(`<p class="text-muted">${__("Loading...")}</p>`);
		frappe.call({
			method: "tif_customization.tif_customization.page.cash_expense.cash_expense.get_report_data",
			args: { filters },
			callback: (r) => {
				if (!r.message) {
					this.$report.html(`<p class="text-danger">${__("Failed to load.")}</p>`);
					return;
				}
				this.data = r.message;
				this.render(r.message);
			},
			error: () => {
				this.$report.html(`<p class="text-danger">${__("Failed to load.")}</p>`);
			},
		});
	}

	fmt_cur(n) {
		return frappe.format(n || 0, { fieldtype: "Currency" });
	}

	esc(v) {
		return frappe.utils.escape_html(v == null ? "" : String(v));
	}

	render(data) {
		const fromLabel = frappe.datetime.str_to_user(data.from_date);
		const toLabel = frappe.datetime.str_to_user(data.to_date);
		const brand = data.brand || {};
		const logo = brand.logo
			? `<img src="${this.esc(brand.logo)}" alt="${this.esc(brand.company_name)}" />`
			: "";
		const contact = [brand.phone_no, brand.email, brand.website].filter(Boolean).map((x) => this.esc(x)).join(" · ");

		this.$report.html(`
			<div class="ce-statement">
				<div class="ce-brand">
					<div class="ce-brand-left">
						${logo}
						<div>
							<p class="ce-company">${this.esc(brand.company_name || data.company)}</p>
							${contact ? `<div class="ce-contact">${contact}</div>` : ""}
						</div>
					</div>
					<div class="ce-doc-title">
						<h2>${__("Cash Expense")}</h2>
						<div class="sub">${__("Petty Cash / Cash Account Statement")}</div>
						<div class="sub">${__("Printed on")} ${frappe.datetime.str_to_user(data.printed_on || frappe.datetime.get_today())}</div>
					</div>
				</div>

				<div class="ce-party-bar">
					<div>
						<div class="lbl">${__("Account")}</div>
						<div class="val">${this.esc(data.account)}</div>
					</div>
					<div>
						<div class="lbl">${__("Company")}</div>
						<div class="val">${this.esc(data.company)}</div>
					</div>
					<div>
						<div class="lbl">${__("Period")}</div>
						<div class="val">${fromLabel} – ${toLabel}</div>
					</div>
				</div>

				<div class="ce-kpis">
					<div class="ce-kpi"><div class="lbl">${__("Opening Balance")}</div><div class="val">${this.fmt_cur(data.opening_balance)}</div></div>
					<div class="ce-kpi"><div class="lbl">${__("Debit")}</div><div class="val">${this.fmt_cur(data.total_debit)}</div></div>
					<div class="ce-kpi"><div class="lbl">${__("Credit")}</div><div class="val">${this.fmt_cur(data.total_credit)}</div></div>
					<div class="ce-kpi"><div class="lbl">${__("Closing Balance")}</div><div class="val">${this.fmt_cur(data.closing_balance)}</div></div>
				</div>

				${this.render_table(data.rows || [])}

				<div class="ce-footer">
					<div>
						<strong>${__("Note")}:</strong>
						${__("Balance = Opening + Debit − Credit. Credits are cash expenses / outflows.")}
					</div>
					<div>${__("Generated from Ilm ERP")}</div>
				</div>
			</div>
		`);
	}

	render_table(rows) {
		const body = rows.length
			? rows
					.map((r) => {
						const cls = r.is_opening ? "row-open" : r.is_closing ? "row-close" : "";
						const voucher = r.voucher_no
							? `<a href="/app/${frappe.router.slug(r.voucher_type)}/${encodeURIComponent(r.voucher_no)}">${this.esc(r.voucher_no)}</a>`
							: "";
						return `
					<tr class="${cls}">
						<td class="left">${voucher}</td>
						<td>${r.posting_date ? frappe.datetime.str_to_user(r.posting_date) : ""}</td>
						<td class="left">${this.esc(r.remarks)}</td>
						<td class="num">${r.is_opening || r.is_closing ? "" : this.fmt_cur(r.debit)}</td>
						<td class="num">${r.is_opening || r.is_closing ? "" : this.fmt_cur(r.credit)}</td>
						<td class="num">${this.fmt_cur(r.balance)}</td>
						<td class="left">${this.esc(r.cost_center)}</td>
					</tr>`;
					})
					.join("")
			: `<tr><td colspan="7" class="text-center text-muted">${__("No entries")}</td></tr>`;

		return `
			<div class="ce-table-wrap">
				<table class="ce-table">
					<thead>
						<tr>
							<th class="left">${__("Voucher Number")}</th>
							<th>${__("Date")}</th>
							<th class="left">${__("Remarks")}</th>
							<th class="num">${__("Debit")}</th>
							<th class="num">${__("Credit")}</th>
							<th class="num">${__("Balance")}</th>
							<th class="left">${__("Cost Center")}</th>
						</tr>
					</thead>
					<tbody>${body}</tbody>
				</table>
			</div>`;
	}

	print_statement() {
		if (!this.data) {
			frappe.msgprint(__("Load the report first."));
			return;
		}
		const data = this.data;
		const brand = data.brand || {};
		const fromLabel = frappe.datetime.str_to_user(data.from_date);
		const toLabel = frappe.datetime.str_to_user(data.to_date);
		const logo = brand.logo
			? `<img src="${this.esc(brand.logo)}" style="max-height:64px;max-width:140px;object-fit:contain" />`
			: "";
		const contact = [brand.phone_no, brand.email, brand.website].filter(Boolean).map((x) => this.esc(x)).join(" · ");

		const rows_html = (data.rows || [])
			.map((r) => {
				const cls = r.is_opening ? "open" : r.is_closing ? "close" : "";
				return `<tr class="${cls}">
					<td>${this.esc(r.voucher_no)}</td>
					<td>${r.posting_date ? frappe.datetime.str_to_user(r.posting_date) : ""}</td>
					<td>${this.esc(r.remarks)}</td>
					<td class="num">${r.is_opening || r.is_closing ? "" : this.fmt_cur(r.debit)}</td>
					<td class="num">${r.is_opening || r.is_closing ? "" : this.fmt_cur(r.credit)}</td>
					<td class="num">${this.fmt_cur(r.balance)}</td>
					<td>${this.esc(r.cost_center)}</td>
				</tr>`;
			})
			.join("");

		const html = `<!DOCTYPE html>
<html>
<head>
	<meta charset="utf-8" />
	<title>${__("Cash Expense")} — ${this.esc(brand.company_name || data.company)}</title>
	<style>
		@page { size: A4 landscape; margin: 12mm; }
		*{box-sizing:border-box}
		body{font-family:Calibri,Arial,sans-serif;color:#111827;margin:0;padding:0;background:#fff}
		.page{padding:8px}
		.toolbar{margin:0 0 12px;display:flex;gap:8px}
		.toolbar button{border:0;border-radius:8px;padding:8px 14px;font-weight:700;cursor:pointer}
		.btn-print{background:#1B5E3B;color:#fff}
		.btn-close{background:#E5E7EB;color:#111827}
		.brand{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;padding-bottom:10px;border-bottom:3px solid #1B5E3B}
		.brand-left{display:flex;gap:12px;align-items:center}
		.company{margin:0;font-size:20px;font-weight:800;color:#123524}
		.contact{margin-top:4px;font-size:11px;color:#6B7280}
		.doc-title{text-align:right}
		.doc-title h1{margin:0;font-size:18px;color:#1B5E3B;text-transform:uppercase;letter-spacing:.5px}
		.doc-title .sub{margin-top:4px;font-size:11px;color:#64748B}
		.meta{display:grid;grid-template-columns:1.4fr 1fr 1fr;gap:10px;margin:12px 0;padding:10px 12px;background:#F8FAFC;border:1px solid #E5E7EB;border-radius:8px}
		.meta .lbl{font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase}
		.meta .val{margin-top:2px;font-size:13px;font-weight:700}
		.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px}
		.kpi{border:1px solid #E5E7EB;border-radius:8px;padding:8px 10px}
		.kpi .lbl{font-size:9px;font-weight:700;color:#6B7280;text-transform:uppercase}
		.kpi .val{margin-top:3px;font-size:14px;font-weight:800;color:#123524;text-align:right}
		table.ledger{width:100%;border-collapse:collapse;table-layout:fixed}
		table.ledger th{background:#1B5E3B;color:#fff;font-size:9.5px;font-weight:700;text-transform:uppercase;padding:7px 5px;border:1px solid #145230;text-align:left}
		table.ledger td{padding:5px;border:1px solid #E5E7EB;font-size:10.5px;vertical-align:top;word-wrap:break-word}
		table.ledger th.num,table.ledger td.num{text-align:right}
		table.ledger tr:nth-child(even):not(.open):not(.close){background:#FAFCFA}
		tr.open td{background:#EEF2FF;font-weight:700}
		tr.close td{background:#1B5E3B;color:#fff;font-weight:800;border-color:#145230}
		.footer{margin-top:14px;padding-top:8px;border-top:1px solid #E5E7EB;display:flex;justify-content:space-between;font-size:10px;color:#6B7280}
		.footer strong{color:#123524}
		@media print{
			body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
			.toolbar{display:none!important}
		}
	</style>
</head>
<body>
	<div class="page">
		<div class="toolbar">
			<button class="btn-print" onclick="window.print()">${__("Print / Save PDF")}</button>
			<button class="btn-close" onclick="window.close()">${__("Close")}</button>
		</div>
		<div class="brand">
			<div class="brand-left">
				${logo}
				<div>
					<p class="company">${this.esc(brand.company_name || data.company)}</p>
					${contact ? `<div class="contact">${contact}</div>` : ""}
				</div>
			</div>
			<div class="doc-title">
				<h1>${__("Cash Expense")}</h1>
				<div class="sub">${__("Petty Cash / Cash Account Statement")}</div>
				<div class="sub">${__("Printed on")} ${frappe.datetime.str_to_user(data.printed_on || frappe.datetime.get_today())}</div>
			</div>
		</div>
		<div class="meta">
			<div><div class="lbl">${__("Account")}</div><div class="val">${this.esc(data.account)}</div></div>
			<div><div class="lbl">${__("Company")}</div><div class="val">${this.esc(data.company)}</div></div>
			<div><div class="lbl">${__("Period")}</div><div class="val">${fromLabel} – ${toLabel}</div></div>
		</div>
		<div class="kpis">
			<div class="kpi"><div class="lbl">${__("Opening Balance")}</div><div class="val">${this.fmt_cur(data.opening_balance)}</div></div>
			<div class="kpi"><div class="lbl">${__("Debit")}</div><div class="val">${this.fmt_cur(data.total_debit)}</div></div>
			<div class="kpi"><div class="lbl">${__("Credit")}</div><div class="val">${this.fmt_cur(data.total_credit)}</div></div>
			<div class="kpi"><div class="lbl">${__("Closing Balance")}</div><div class="val">${this.fmt_cur(data.closing_balance)}</div></div>
		</div>
		<table class="ledger">
			<thead>
				<tr>
					<th>Voucher Number</th><th>Date</th><th>Remarks</th>
					<th class="num">Debit</th><th class="num">Credit</th><th class="num">Balance</th>
					<th>Cost Center</th>
				</tr>
			</thead>
			<tbody>${rows_html || `<tr><td colspan="7">${__("No entries")}</td></tr>`}</tbody>
		</table>
		<div class="footer">
			<div><strong>${__("Note")}:</strong> ${__("Balance = Opening + Debit − Credit.")}</div>
			<div>${__("Generated from Ilm ERP")}</div>
		</div>
	</div>
</body>
</html>`;

		const w = window.open("", "_blank");
		if (!w) {
			frappe.msgprint(__("Please allow pop-ups to print the statement."));
			return;
		}
		w.document.open();
		w.document.write(html);
		w.document.close();
		setTimeout(() => {
			try {
				w.focus();
			} catch (e) {}
		}, 200);
	}

	export_csv() {
		if (!this.data || !(this.data.rows || []).length) {
			frappe.msgprint(__("Nothing to export."));
			return;
		}
		const header = [
			"Voucher Number",
			"Date",
			"Remarks",
			"Debit",
			"Credit",
			"Balance",
			"Cost Center",
		];
		const data = [header].concat(
			(this.data.rows || []).map((r) => [
				r.voucher_no || "",
				r.posting_date || "",
				(r.remarks || "").replace(/\n/g, " "),
				r.is_opening || r.is_closing ? "" : r.debit,
				r.is_opening || r.is_closing ? "" : r.credit,
				r.balance,
				r.cost_center || "",
			])
		);
		frappe.tools.downloadify(data, null, `Cash Expense ${frappe.datetime.get_today()}`);
	}
};
