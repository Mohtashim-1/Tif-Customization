frappe.pages["vendor-consultant-ledger"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Vendor / Consultant Ledger"),
		single_column: true,
	});
	new frappe.tif_customization.VendorConsultantLedger(page).make();
};

frappe.tif_customization = frappe.tif_customization || {};

frappe.tif_customization.VendorConsultantLedger = class VendorConsultantLedger {
	constructor(page) {
		this.page = page;
		this.data = null;
	}

	make() {
		this.make_layout();
		this.make_filters();
		this.page.set_primary_action(__("Refresh"), () => this.load_data(), "refresh");
		this.page.add_inner_button(__("Print / PDF"), () => this.print_statement());
		this.page.add_action_item(__("Export CSV"), () => this.export_csv());
		this.load_data();
	}

	make_layout() {
		$(this.page.body).html(`
			<div class="vcl-root">
				<style>
					.vcl-root{padding:16px 16px 28px;max-width:1200px;margin:0 auto}
					.vcl-note{font-size:12px;color:#6b7280;margin:0 0 12px;line-height:1.45}
					.vcl-filters{margin-bottom:14px}
					.vcl-statement{
						background:#fff;border:1px solid #e5e7eb;border-radius:12px;
						box-shadow:0 1px 2px rgba(15,23,42,.04);overflow:hidden
					}
					.vcl-brand{
						display:flex;justify-content:space-between;gap:16px;align-items:flex-start;
						padding:18px 20px;border-bottom:3px solid #1b5e3b;background:linear-gradient(180deg,#f8faf8,#fff)
					}
					.vcl-brand-left{display:flex;gap:14px;align-items:center}
					.vcl-brand-left img{max-height:56px;max-width:120px;object-fit:contain}
					.vcl-company{margin:0;font-size:18px;font-weight:800;color:#123524;letter-spacing:.2px}
					.vcl-contact{margin:4px 0 0;font-size:11px;color:#6b7280;line-height:1.4}
					.vcl-doc-title{text-align:right}
					.vcl-doc-title h2{margin:0;font-size:16px;font-weight:800;color:#1b5e3b;text-transform:uppercase;letter-spacing:.6px}
					.vcl-doc-title .sub{margin-top:4px;font-size:11px;color:#64748b}
					.vcl-party-bar{
						display:grid;grid-template-columns:1.4fr 1fr 1fr;gap:12px;
						padding:14px 20px;background:#f8fafc;border-bottom:1px solid #e5e7eb
					}
					.vcl-party-bar .lbl{font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.4px}
					.vcl-party-bar .val{margin-top:3px;font-size:13px;font-weight:700;color:#0f172a}
					.vcl-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;padding:14px 20px}
					.vcl-kpi{border:1px solid #e5e7eb;border-radius:10px;padding:12px 14px;background:#fff}
					.vcl-kpi .lbl{font-size:10px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.4px}
					.vcl-kpi .val{font-size:16px;font-weight:800;margin-top:4px;font-variant-numeric:tabular-nums;color:#123524}
					.vcl-table-wrap{padding:0 12px 16px;overflow:auto}
					.vcl-table{width:100%;border-collapse:collapse;font-size:12px;min-width:920px}
					.vcl-table th,.vcl-table td{padding:8px 8px;border:1px solid #e5e7eb;vertical-align:top}
					.vcl-table thead th{
						background:#1b5e3b;color:#fff;font-weight:700;white-space:nowrap;
						text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.3px;border-color:#145230
					}
					.vcl-table thead th.num,.vcl-table td.num{text-align:right;font-variant-numeric:tabular-nums}
					.vcl-table .left{text-align:left}
					.vcl-table tbody tr:nth-child(even):not(.row-open):not(.row-close){background:#fafcfa}
					.vcl-table .row-open td{background:#eef2ff;font-weight:700}
					.vcl-table .row-close td{background:#1b5e3b;color:#fff;font-weight:800;border-color:#145230}
					.vcl-table .party-link{cursor:pointer;color:#1d4ed8;text-decoration:underline}
					.vcl-footer{
						display:flex;justify-content:space-between;gap:12px;padding:12px 20px 16px;
						border-top:1px solid #e5e7eb;font-size:11px;color:#6b7280
					}
					.vcl-footer strong{color:#123524}
					.vcl-hint{margin:8px 20px 0;font-size:12px;color:#6b7280}
					@media (max-width:900px){
						.vcl-party-bar,.vcl-kpis{grid-template-columns:1fr 1fr}
						.vcl-brand{flex-direction:column}
						.vcl-doc-title{text-align:left}
					}
					@media print{
						.page-head,.layout-side-section,.vcl-filters,.vcl-note,.vcl-hint,
						.navbar,.page-form,.std-form-layout{display:none!important}
						.vcl-root{padding:0;max-width:none}
						.vcl-statement{box-shadow:none;border:0;border-radius:0}
						.vcl-table{min-width:0;font-size:10px}
						body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
					}
				</style>
				<p class="vcl-note no-print">
					Payable ledger for Suppliers (vendors &amp; consultants) from GL Entry.
					Balance = Opening + Credit (invoices) − Debit (payments).
					Select a Supplier for full ledger; leave blank for supplier-wise summary.
					Use <strong>Print / PDF</strong> for a professional statement.
				</p>
				<div id="vcl-filters" class="vcl-filters row no-print"></div>
				<div id="vcl-body"></div>
			</div>
		`);
	}

	make_filters() {
		const today = frappe.datetime.get_today();
		const month_start = frappe.datetime.month_start();
		const company = frappe.defaults.get_user_default("Company") || "";

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
			default: month_start,
			reqd: 1,
		});
		this.to_date = this.make_filter({
			label: __("To Date"),
			fieldtype: "Date",
			fieldname: "to_date",
			default: today,
			reqd: 1,
		});
		this.supplier = this.make_filter({
			label: __("Supplier / Vendor / Consultant"),
			fieldtype: "Link",
			fieldname: "supplier",
			options: "Supplier",
		});
		this.supplier_group = this.make_filter({
			label: __("Supplier Group"),
			fieldtype: "Link",
			fieldname: "supplier_group",
			options: "Supplier Group",
			description: __("Optional — e.g. Services for consultants"),
		});
	}

	make_filter(df) {
		const wrap = $('<div class="col-md-2" style="margin-bottom:8px;"></div>');
		$("#vcl-filters").append(wrap);
		return frappe.ui.form.make_control({
			parent: wrap,
			df: Object.assign({ change: () => this.schedule_load() }, df),
			render_input: true,
		});
	}

	schedule_load() {
		clearTimeout(this._timer);
		this._timer = setTimeout(() => this.load_data(), 350);
	}

	get_filters() {
		return {
			company: this.company.get_value(),
			from_date: this.from_date.get_value(),
			to_date: this.to_date.get_value(),
			supplier: this.supplier.get_value() || "",
			supplier_group: this.supplier_group.get_value() || "",
		};
	}

	load_data() {
		const filters = this.get_filters();
		if (!filters.company || !filters.from_date || !filters.to_date) {
			frappe.msgprint(__("Please set Company, From Date and To Date."));
			return;
		}
		$("#vcl-body").html(`<p class="text-muted">${__("Loading...")}</p>`);
		frappe.call({
			method:
				"tif_customization.tif_customization.page.vendor_consultant_ledger.vendor_consultant_ledger.get_report_data",
			args: { filters },
			callback: (r) => {
				if (!r.message) {
					$("#vcl-body").html(`<p class="text-danger">${__("Failed to load.")}</p>`);
					return;
				}
				this.data = r.message;
				this.render(r.message);
			},
			error: () => {
				$("#vcl-body").html(`<p class="text-danger">${__("Failed to load.")}</p>`);
			},
		});
	}

	fmt_cur(n) {
		return frappe.format(n || 0, { fieldtype: "Currency" });
	}

	esc(v) {
		return frappe.utils.escape_html(v || "");
	}

	party_label(data) {
		if (data.supplier) return this.esc(data.supplier_name || data.supplier);
		if (data.supplier_group) return this.esc(__("Group: {0}", [data.supplier_group]));
		return this.esc(__("All Suppliers"));
	}

	render(data) {
		const fromLabel = frappe.datetime.str_to_user(data.from_date);
		const toLabel = frappe.datetime.str_to_user(data.to_date);
		const brand = data.brand || {};
		const logo = brand.logo
			? `<img src="${this.esc(brand.logo)}" alt="${this.esc(brand.company_name)}" />`
			: "";
		const contact = [brand.phone_no, brand.email, brand.website].filter(Boolean).map(this.esc).join(" · ");

		const table =
			data.mode === "ledger"
				? this.render_ledger_table(data.rows || [])
				: this.render_summary_table(data.party_summary || []);

		$("#vcl-body").html(`
			<div class="vcl-statement">
				<div class="vcl-brand">
					<div class="vcl-brand-left">
						${logo}
						<div>
							<p class="vcl-company">${this.esc(brand.company_name || data.company)}</p>
							${contact ? `<div class="vcl-contact">${contact}</div>` : ""}
						</div>
					</div>
					<div class="vcl-doc-title">
						<h2>${__("Vendor / Consultant Ledger")}</h2>
						<div class="sub">${__("Accounts Payable Statement")}</div>
						<div class="sub">${__("Printed on")} ${frappe.datetime.str_to_user(data.printed_on || frappe.datetime.get_today())}</div>
					</div>
				</div>

				<div class="vcl-party-bar">
					<div>
						<div class="lbl">${__("Party")}</div>
						<div class="val">${this.party_label(data)}</div>
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

				<div class="vcl-kpis">
					<div class="vcl-kpi"><div class="lbl">${__("Opening Payable")}</div><div class="val">${this.fmt_cur(data.opening_balance)}</div></div>
					<div class="vcl-kpi"><div class="lbl">${__("Debit (Paid)")}</div><div class="val">${this.fmt_cur(data.total_debit)}</div></div>
					<div class="vcl-kpi"><div class="lbl">${__("Credit (Invoiced)")}</div><div class="val">${this.fmt_cur(data.total_credit)}</div></div>
					<div class="vcl-kpi"><div class="lbl">${__("Closing Payable")}</div><div class="val">${this.fmt_cur(data.closing_balance)}</div></div>
				</div>

				${table}

				<div class="vcl-footer">
					<div>
						<strong>${__("Note")}:</strong>
						${__("Balance = Opening + Credit (invoices) − Debit (payments). Positive closing is amount payable.")}
					</div>
					<div>${__("Generated from Ilm ERP")}</div>
				</div>
			</div>
			${
				data.mode === "summary"
					? `<p class="vcl-hint no-print">${__("Click a supplier name to open their full ledger.")}</p>`
					: ""
			}
		`);

		$("#vcl-body")
			.find(".party-link")
			.on("click", (e) => {
				const name = $(e.currentTarget).data("supplier");
				if (!name) return;
				this.supplier.set_value(name);
				this.load_data();
			});
	}

	render_ledger_table(rows) {
		const body = rows.length
			? rows
					.map((r) => {
						const cls = r.is_opening ? "row-open" : r.is_closing ? "row-close" : "";
						const voucher = r.voucher_no
							? `<a href="/app/${frappe.router.slug(r.voucher_type)}/${encodeURIComponent(r.voucher_no)}">${this.esc(r.voucher_no)}</a>`
							: "";
						return `
					<tr class="${cls}">
						<td>${r.posting_date ? frappe.datetime.str_to_user(r.posting_date) : ""}</td>
						<td class="left">${this.esc(r.voucher_type)}</td>
						<td class="left">${voucher}</td>
						<td class="left">${this.esc(r.account)}</td>
						<td class="left">${this.esc(r.against)}</td>
						<td class="left">${this.esc(r.remarks)}</td>
						<td class="num">${r.is_opening || r.is_closing ? "" : this.fmt_cur(r.debit)}</td>
						<td class="num">${r.is_opening || r.is_closing ? "" : this.fmt_cur(r.credit)}</td>
						<td class="num">${this.fmt_cur(r.balance)}</td>
					</tr>`;
					})
					.join("")
			: `<tr><td colspan="9" class="text-center text-muted">${__("No entries")}</td></tr>`;

		return `
			<div class="vcl-table-wrap">
				<table class="vcl-table">
					<thead>
						<tr>
							<th>${__("Date")}</th>
							<th>${__("Voucher Type")}</th>
							<th>${__("Voucher No")}</th>
							<th>${__("Account")}</th>
							<th>${__("Against")}</th>
							<th>${__("Remarks")}</th>
							<th class="num">${__("Debit")}</th>
							<th class="num">${__("Credit")}</th>
							<th class="num">${__("Balance")}</th>
						</tr>
					</thead>
					<tbody>${body}</tbody>
				</table>
			</div>`;
	}

	render_summary_table(rows) {
		const body = rows.length
			? rows
					.map(
						(r) => `
				<tr>
					<td class="left">
						<span class="party-link" data-supplier="${this.esc(r.supplier)}">
							${this.esc(r.supplier_name || r.supplier)}
						</span>
					</td>
					<td class="left">${this.esc(r.supplier_group)}</td>
					<td class="num">${this.fmt_cur(r.opening)}</td>
					<td class="num">${this.fmt_cur(r.debit)}</td>
					<td class="num">${this.fmt_cur(r.credit)}</td>
					<td class="num">${this.fmt_cur(r.closing)}</td>
				</tr>`,
					)
					.join("")
			: `<tr><td colspan="6" class="text-center text-muted">${__("No supplier balances in this period")}</td></tr>`;

		return `
			<div class="vcl-table-wrap">
				<table class="vcl-table">
					<thead>
						<tr>
							<th class="left">${__("Supplier / Vendor / Consultant")}</th>
							<th class="left">${__("Group")}</th>
							<th class="num">${__("Opening")}</th>
							<th class="num">${__("Debit (Paid)")}</th>
							<th class="num">${__("Credit (Invoiced)")}</th>
							<th class="num">${__("Closing Payable")}</th>
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

		let rows_html = "";
		if (data.mode === "ledger") {
			rows_html = (data.rows || [])
				.map((r) => {
					const cls = r.is_opening ? "open" : r.is_closing ? "close" : "";
					return `<tr class="${cls}">
						<td>${r.posting_date ? frappe.datetime.str_to_user(r.posting_date) : ""}</td>
						<td>${this.esc(r.voucher_type)}</td>
						<td>${this.esc(r.voucher_no)}</td>
						<td>${this.esc(r.account)}</td>
						<td>${this.esc(r.against)}</td>
						<td>${this.esc(r.remarks)}</td>
						<td class="num">${r.is_opening || r.is_closing ? "" : this.fmt_cur(r.debit)}</td>
						<td class="num">${r.is_opening || r.is_closing ? "" : this.fmt_cur(r.credit)}</td>
						<td class="num">${this.fmt_cur(r.balance)}</td>
					</tr>`;
				})
				.join("");
		} else {
			rows_html = (data.party_summary || [])
				.map(
					(r) => `<tr>
					<td>${this.esc(r.supplier_name || r.supplier)}</td>
					<td>${this.esc(r.supplier_group)}</td>
					<td class="num">${this.fmt_cur(r.opening)}</td>
					<td class="num">${this.fmt_cur(r.debit)}</td>
					<td class="num">${this.fmt_cur(r.credit)}</td>
					<td class="num">${this.fmt_cur(r.closing)}</td>
				</tr>`,
				)
				.join("");
		}

		const head =
			data.mode === "ledger"
				? `<tr>
					<th>Date</th><th>Voucher Type</th><th>Voucher No</th><th>Account</th>
					<th>Against</th><th>Remarks</th><th class="num">Debit</th><th class="num">Credit</th><th class="num">Balance</th>
				</tr>`
				: `<tr>
					<th>Supplier / Vendor / Consultant</th><th>Group</th>
					<th class="num">Opening</th><th class="num">Debit (Paid)</th>
					<th class="num">Credit (Invoiced)</th><th class="num">Closing Payable</th>
				</tr>`;

		const html = `<!DOCTYPE html>
<html>
<head>
	<meta charset="utf-8" />
	<title>${__("Vendor / Consultant Ledger")} — ${this.esc(brand.company_name || data.company)}</title>
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
		.kpi .val{margin-top:3px;font-size:14px;font-weight:800;color:#123524}
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
				<h1>${__("Vendor / Consultant Ledger")}</h1>
				<div class="sub">${__("Accounts Payable Statement")}</div>
				<div class="sub">${__("Printed on")} ${frappe.datetime.str_to_user(data.printed_on || frappe.datetime.get_today())}</div>
			</div>
		</div>
		<div class="meta">
			<div><div class="lbl">${__("Party")}</div><div class="val">${this.party_label(data)}</div></div>
			<div><div class="lbl">${__("Company")}</div><div class="val">${this.esc(data.company)}</div></div>
			<div><div class="lbl">${__("Period")}</div><div class="val">${fromLabel} – ${toLabel}</div></div>
		</div>
		<div class="kpis">
			<div class="kpi"><div class="lbl">${__("Opening Payable")}</div><div class="val">${this.fmt_cur(data.opening_balance)}</div></div>
			<div class="kpi"><div class="lbl">${__("Debit (Paid)")}</div><div class="val">${this.fmt_cur(data.total_debit)}</div></div>
			<div class="kpi"><div class="lbl">${__("Credit (Invoiced)")}</div><div class="val">${this.fmt_cur(data.total_credit)}</div></div>
			<div class="kpi"><div class="lbl">${__("Closing Payable")}</div><div class="val">${this.fmt_cur(data.closing_balance)}</div></div>
		</div>
		<table class="ledger">
			<thead>${head}</thead>
			<tbody>${rows_html || `<tr><td colspan="9">${__("No entries")}</td></tr>`}</tbody>
		</table>
		<div class="footer">
			<div><strong>${__("Note")}:</strong> ${__("Balance = Opening + Credit − Debit. Positive closing is amount payable.")}</div>
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
				w.print();
			} catch (e) {
				/* ignore */
			}
		}, 350);
	}

	export_csv() {
		if (!this.data) {
			frappe.msgprint(__("No data to export."));
			return;
		}
		let lines = [];
		if (this.data.mode === "ledger") {
			lines.push(["Date", "Voucher Type", "Voucher No", "Account", "Against", "Remarks", "Debit", "Credit", "Balance"].join(","));
			(this.data.rows || []).forEach((r) => {
				lines.push(
					[
						r.posting_date || "",
						`"${(r.voucher_type || "").replace(/"/g, '""')}"`,
						`"${(r.voucher_no || "").replace(/"/g, '""')}"`,
						`"${(r.account || "").replace(/"/g, '""')}"`,
						`"${(r.against || "").replace(/"/g, '""')}"`,
						`"${(r.remarks || "").replace(/"/g, '""')}"`,
						r.debit || 0,
						r.credit || 0,
						r.balance || 0,
					].join(","),
				);
			});
		} else {
			lines.push(["Supplier", "Group", "Opening", "Debit", "Credit", "Closing"].join(","));
			(this.data.party_summary || []).forEach((r) => {
				lines.push(
					[
						`"${(r.supplier_name || r.supplier || "").replace(/"/g, '""')}"`,
						`"${(r.supplier_group || "").replace(/"/g, '""')}"`,
						r.opening || 0,
						r.debit || 0,
						r.credit || 0,
						r.closing || 0,
					].join(","),
				);
			});
		}
		const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `vendor-consultant-ledger-${this.data.from_date}-${this.data.to_date}.csv`;
		a.click();
		URL.revokeObjectURL(url);
	}
};
