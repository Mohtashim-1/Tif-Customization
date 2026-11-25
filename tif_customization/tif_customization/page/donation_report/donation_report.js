frappe.pages["donation-report"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Donation Report"),
		single_column: true,
	});
	new frappe.tif_customization.DonationReport(page).make();
};

frappe.tif_customization = frappe.tif_customization || {};

frappe.tif_customization.DonationReport = class DonationReport {
	constructor(page) {
		this.page = page;
		this.data = null;
	}

	make() {
		this.make_layout();
		this.make_filters();
		this.page.set_primary_action(__("Refresh"), () => this.load_data(), "refresh");
		this.page.add_inner_button(__("Print / PDF"), () => this.print_report());
		this.page.add_action_item(__("Export CSV"), () => this.export_csv());
		this.load_data();
	}

	make_layout() {
		$(this.page.body).html(`
			<div class="dnr-root">
				<style>
					.dnr-root{padding:16px 16px 28px;max-width:1240px;margin:0 auto}
					.dnr-note{font-size:12px;color:#6b7280;margin:0 0 12px;line-height:1.45}
					.dnr-filters{margin-bottom:14px}
					.dnr-statement{
						background:#fff;border:1px solid #e5e7eb;border-radius:12px;
						box-shadow:0 1px 2px rgba(15,23,42,.04);overflow:hidden
					}
					.dnr-brand{
						display:flex;justify-content:space-between;gap:16px;align-items:flex-start;
						padding:18px 20px;border-bottom:3px solid #1b5e3b;
						background:linear-gradient(180deg,#f8faf8,#fff)
					}
					.dnr-brand-left{display:flex;gap:14px;align-items:center}
					.dnr-brand-left img{max-height:56px;max-width:120px;object-fit:contain}
					.dnr-company{margin:0;font-size:18px;font-weight:800;color:#123524}
					.dnr-contact{margin:4px 0 0;font-size:11px;color:#6b7280;line-height:1.4}
					.dnr-doc-title{text-align:right}
					.dnr-doc-title h2{margin:0;font-size:16px;font-weight:800;color:#1b5e3b;
						text-transform:uppercase;letter-spacing:.6px}
					.dnr-doc-title .sub{margin-top:4px;font-size:11px;color:#64748b}
					.dnr-party-bar{
						display:grid;grid-template-columns:1.2fr 1fr 1fr 1fr;gap:12px;
						padding:14px 20px;background:#f8fafc;border-bottom:1px solid #e5e7eb
					}
					.dnr-party-bar .lbl{font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.4px}
					.dnr-party-bar .val{margin-top:3px;font-size:13px;font-weight:700;color:#0f172a}
					.dnr-kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;padding:14px 20px}
					.dnr-kpi{border:1px solid #e5e7eb;border-radius:10px;padding:12px 14px;background:#fff}
					.dnr-kpi .lbl{font-size:10px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.4px}
					.dnr-kpi .val{font-size:15px;font-weight:800;margin-top:4px;font-variant-numeric:tabular-nums;color:#123524}
					.dnr-kpi.cash{border-color:#bbf7d0;background:#f0fdf4}
					.dnr-kpi.warn{border-color:#fde68a;background:#fffbeb}
					.dnr-kpi.bank{border-color:#bfdbfe;background:#eff6ff}
					.dnr-section{padding:4px 20px 16px}
					.dnr-section h3{margin:8px 0 10px;font-size:13px;font-weight:800;color:#1b5e3b;
						text-transform:uppercase;letter-spacing:.4px}
					.dnr-method-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px}
					.dnr-method-card{border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px;background:#fff}
					.dnr-method-card .lbl{font-size:11px;font-weight:700;color:#334155}
					.dnr-method-card .val{font-size:14px;font-weight:800;margin-top:4px;color:#123524;
						font-variant-numeric:tabular-nums}
					.dnr-badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:700}
					.dnr-badge.ok{background:#dcfce7;color:#166534}
					.dnr-badge.pending{background:#fef3c7;color:#92400e}
					.dnr-badge.na{background:#f1f5f9;color:#475569}
					.dnr-table-wrap{padding:0 12px 16px;overflow:auto}
					.dnr-table{width:100%;border-collapse:collapse;font-size:12px;min-width:980px}
					.dnr-table th,.dnr-table td{padding:8px;border:1px solid #e5e7eb;vertical-align:top}
					.dnr-table thead th{
						background:#1b5e3b;color:#fff;font-weight:700;white-space:nowrap;
						text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.3px;border-color:#145230
					}
					.dnr-table thead th.num,.dnr-table td.num{text-align:right;font-variant-numeric:tabular-nums}
					.dnr-table tbody tr:nth-child(even){background:#fafcfa}
					.dnr-table tbody tr.dnr-total td{background:#1b5e3b;color:#fff;font-weight:800;border-color:#145230}
					.dnr-link{cursor:pointer;color:#1d4ed8;text-decoration:underline}
					.dnr-chip{display:inline-block;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:700;
						background:#eef6f0;color:#166534;margin-right:4px}
					.dnr-footer{
						display:flex;justify-content:space-between;gap:12px;padding:12px 20px 16px;
						border-top:1px solid #e5e7eb;font-size:11px;color:#6b7280
					}
					.dnr-footer strong{color:#123524}
					@media (max-width:980px){
						.dnr-party-bar,.dnr-kpis{grid-template-columns:1fr 1fr}
						.dnr-brand{flex-direction:column}
						.dnr-doc-title{text-align:left}
					}
					@media print{
						.page-head,.navbar,.dnr-filters,.dnr-note{display:none!important}
						.dnr-root{padding:0;max-width:none}
						.dnr-statement{box-shadow:none;border:0;border-radius:0}
						.dnr-table{min-width:0;font-size:10px}
						body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
					}
				</style>
				<p class="dnr-note no-print">
					Submitted donation receipts for the selected period, with
					<strong>mode of payment</strong>, <strong>cash received</strong>, and
					<strong>cash deposited to bank</strong> (via Bank Deposit).
					Use <strong>Group By</strong> for summaries. <strong>Print / PDF</strong> for statement.
				</p>
				<div id="dnr-filters" class="dnr-filters row no-print"></div>
				<div id="dnr-body"></div>
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
		this.group_by = this.make_filter({
			label: __("Group By"),
			fieldtype: "Select",
			fieldname: "group_by",
			options: "Detail\nDonor\nDonation Type\nCategory\nPayment Method\nBank Account\nCost Center",
			default: "Detail",
			reqd: 1,
		});
		this.donor = this.make_filter({
			label: __("Donor"),
			fieldtype: "Link",
			fieldname: "donor",
			options: "Donor",
		});
		this.donation_type = this.make_filter({
			label: __("Donation Type"),
			fieldtype: "Link",
			fieldname: "donation_type",
			options: "Donation Type",
		});
		this.donation_category = this.make_filter({
			label: __("Category"),
			fieldtype: "Select",
			fieldname: "donation_category",
			options: "\nZakat\nSadaqah\nSponsorship\nGeneral Fund\nProject",
		});
		this.payment_method = this.make_filter({
			label: __("Payment Method"),
			fieldtype: "Select",
			fieldname: "payment_method",
			options: "\nCash\nBank Transfer\nCheque\nCard\nOnline",
		});
		this.bank_account = this.make_filter({
			label: __("Bank Account"),
			fieldtype: "Link",
			fieldname: "bank_account",
			options: "Account",
			get_query: () => ({
				filters: {
					account_type: "Bank",
					is_group: 0,
					company: this.company.get_value() || undefined,
				},
			}),
		});
		this.cost_center = this.make_filter({
			label: __("Cost Center"),
			fieldtype: "Link",
			fieldname: "cost_center",
			options: "Cost Center",
		});
	}

	make_filter(df) {
		const wrap = $('<div class="col-md-2" style="margin-bottom:8px;"></div>');
		$("#dnr-filters").append(wrap);
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
			group_by: this.group_by.get_value() || "Detail",
			donor: this.donor.get_value() || "",
			donation_type: this.donation_type.get_value() || "",
			donation_category: this.donation_category.get_value() || "",
			payment_method: this.payment_method.get_value() || "",
			bank_account: this.bank_account.get_value() || "",
			cost_center: this.cost_center.get_value() || "",
		};
	}

	load_data() {
		const filters = this.get_filters();
		if (!filters.company || !filters.from_date || !filters.to_date) {
			frappe.msgprint(__("Please set Company, From Date and To Date."));
			return;
		}
		$("#dnr-body").html(`<p class="text-muted">${__("Loading...")}</p>`);
		frappe.call({
			method:
				"tif_customization.tif_customization.page.donation_report.donation_report.get_report_data",
			args: { filters },
			callback: (r) => {
				if (!r.message) {
					$("#dnr-body").html(`<p class="text-danger">${__("Failed to load.")}</p>`);
					return;
				}
				this.data = r.message;
				this.render(r.message);
			},
			error: () => {
				$("#dnr-body").html(`<p class="text-danger">${__("Failed to load.")}</p>`);
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
		const brand = data.brand || {};
		const t = data.totals || {};
		const logo = brand.logo
			? `<img src="${this.esc(brand.logo)}" alt="${this.esc(brand.company_name)}" />`
			: "";
		const contact = [brand.phone_no, brand.email, brand.website]
			.filter(Boolean)
			.map((x) => this.esc(x))
			.join(" · ");
		const fromLabel = frappe.datetime.str_to_user(data.from_date);
		const toLabel = frappe.datetime.str_to_user(data.to_date);

		const chips = (data.by_category || [])
			.slice(0, 4)
			.map((c) => `<span class="dnr-chip">${this.esc(c.label)}: ${this.fmt_cur(c.amount)}</span>`)
			.join("");

		const cash = data.cash_summary || {};
		const table =
			data.mode === "summary"
				? this.render_summary_table(data.summary_rows || [], data.group_by, t)
				: this.render_detail_table(data.rows || [], t);

		$("#dnr-body").html(`
			<div class="dnr-statement">
				<div class="dnr-brand">
					<div class="dnr-brand-left">
						${logo}
						<div>
							<p class="dnr-company">${this.esc(brand.company_name || data.company)}</p>
							${contact ? `<div class="dnr-contact">${contact}</div>` : ""}
						</div>
					</div>
					<div class="dnr-doc-title">
						<h2>${__("Donation Report")}</h2>
						<div class="sub">${
							data.mode === "summary"
								? __("Summary by {0}", [__(data.group_by)])
								: __("Receipt Detail")
						}</div>
						<div class="sub">${__("Printed on")} ${frappe.datetime.str_to_user(
							data.printed_on || frappe.datetime.get_today()
						)}</div>
					</div>
				</div>

				<div class="dnr-party-bar">
					<div>
						<div class="lbl">${__("Company")}</div>
						<div class="val">${this.esc(data.company)}</div>
					</div>
					<div>
						<div class="lbl">${__("Period")}</div>
						<div class="val">${fromLabel} – ${toLabel}</div>
					</div>
					<div>
						<div class="lbl">${__("View")}</div>
						<div class="val">${this.esc(data.group_by || "Detail")}</div>
					</div>
					<div>
						<div class="lbl">${__("Category Mix")}</div>
						<div class="val" style="font-weight:500;font-size:12px">${chips || "—"}</div>
					</div>
				</div>

				<div class="dnr-kpis">
					<div class="dnr-kpi"><div class="lbl">${__("Total Received")}</div><div class="val">${this.fmt_cur(
						t.received_amount
					)}</div></div>
					<div class="dnr-kpi cash"><div class="lbl">${__("Cash Received")}</div><div class="val">${this.fmt_cur(
						cash.cash_received
					)}</div></div>
					<div class="dnr-kpi bank"><div class="lbl">${__("Cash Deposited to Bank")}</div><div class="val">${this.fmt_cur(
						cash.cash_deposited
					)}</div></div>
					<div class="dnr-kpi warn"><div class="lbl">${__("Cash Pending Deposit")}</div><div class="val">${this.fmt_cur(
						cash.cash_pending_deposit
					)}</div></div>
					<div class="dnr-kpi"><div class="lbl">${__("Non-Cash Received")}</div><div class="val">${this.fmt_cur(
						cash.non_cash_received
					)}</div></div>
				</div>

				${this.render_payment_methods(data.by_method || [])}
				${this.render_cash_to_bank(cash)}
				${this.render_bank_deposits(data.bank_deposits || {})}

				${table}

				<div class="dnr-footer">
					<div>
						<strong>${__("Note")}:</strong>
						${__(
							"Only submitted Donations are included. Cash deposited = linked to a submitted Bank Deposit."
						)}
					</div>
					<div>${__("Generated from Ilm ERP")}</div>
				</div>
			</div>
		`);

		$("#dnr-body")
			.find(".dnr-open")
			.on("click", (e) => {
				const name = $(e.currentTarget).data("name");
				const dt = $(e.currentTarget).data("doctype") || "Donation";
				if (name) frappe.set_route("Form", dt, name);
			});
	}

	render_payment_methods(methods) {
		if (!methods.length) {
			return "";
		}
		const cards = methods
			.map(
				(m) => `<div class="dnr-method-card">
				<div class="lbl">${this.esc(m.label || "—")}</div>
				<div class="val">${this.fmt_cur(m.amount)}</div>
			</div>`
			)
			.join("");
		return `
			<div class="dnr-section">
				<h3>${__("Mode of Payment")}</h3>
				<div class="dnr-method-grid">${cards}</div>
			</div>`;
	}

	render_cash_to_bank(cash) {
		const banks = cash.by_deposit_bank || [];
		if (!banks.length && !(cash.cash_received > 0)) {
			return "";
		}
		let bankRows = "";
		if (!banks.length) {
			bankRows = `<tr><td colspan="3" class="text-muted text-center">${__(
				"No cash deposited to bank in this period yet."
			)}</td></tr>`;
		} else {
			bankRows = banks
				.map(
					(b) => `<tr>
					<td>${this.esc(b.label)}</td>
					<td class="num">${b.count} ${__("slips")} / ${b.deposit_count} ${__("deposits")}</td>
					<td class="num">${this.fmt_cur(b.amount)}</td>
				</tr>`
				)
				.join("");
			bankRows += `<tr class="dnr-total">
				<td colspan="2">${__("Total Cash Deposited")}</td>
				<td class="num">${this.fmt_cur(cash.cash_deposited)}</td>
			</tr>`;
		}
		return `
			<div class="dnr-section">
				<h3>${__("Cash → Bank Summary")}</h3>
				<div class="dnr-kpis" style="padding:0 0 10px;grid-template-columns:repeat(3,1fr)">
					<div class="dnr-kpi cash"><div class="lbl">${__("Cash Receipts")}</div>
						<div class="val">${cash.cash_receipt_count || 0}</div></div>
					<div class="dnr-kpi bank"><div class="lbl">${__("Deposited Slips")}</div>
						<div class="val">${cash.cash_deposited_count || 0}</div></div>
					<div class="dnr-kpi warn"><div class="lbl">${__("Pending Slips")}</div>
						<div class="val">${cash.cash_pending_count || 0}</div></div>
				</div>
				<div class="dnr-table-wrap" style="padding:0">
					<table class="dnr-table" style="min-width:520px">
						<thead>
							<tr>
								<th>${__("Bank Account (Deposit)")}</th>
								<th class="num">${__("Slips / Deposits")}</th>
								<th class="num">${__("Amount")}</th>
							</tr>
						</thead>
						<tbody>${bankRows}</tbody>
					</table>
				</div>
			</div>`;
	}

	render_bank_deposits(bd) {
		const rows = bd.rows || [];
		if (!rows.length) {
			return `
				<div class="dnr-section">
					<h3>${__("Bank Deposits (Period)")}</h3>
					<p class="text-muted" style="margin:0;font-size:12px">${__(
						"No submitted Bank Deposit vouchers in this deposit-date period."
					)}</p>
				</div>`;
		}
		const body = rows
			.map(
				(r) => `<tr>
				<td><a class="dnr-link dnr-open" data-doctype="Bank Deposit" data-name="${this.esc(
					r.name
				)}">${this.esc(r.name)}</a></td>
				<td>${this.esc(frappe.datetime.str_to_user(r.deposit_date))}</td>
				<td>${this.esc(r.deposit_slip_no || "—")}</td>
				<td>${this.esc(r.bank_account || "—")}
					${
						r.bank_account_no
							? `<div style="color:#64748b;font-size:10px">${this.esc(r.bank_account_no)}</div>`
							: ""
					}
				</td>
				<td class="num">${r.donation_count || 0}</td>
				<td class="num">${this.fmt_cur(r.total_amount)}</td>
				<td>${
					r.journal_entry
						? `<a class="dnr-link dnr-open" data-doctype="Journal Entry" data-name="${this.esc(
								r.journal_entry
						  )}">${this.esc(r.journal_entry)}</a>`
						: "—"
				}</td>
			</tr>`
			)
			.join("");
		return `
			<div class="dnr-section">
				<h3>${__("Bank Deposits Submitted")} (${bd.count || 0} · ${this.fmt_cur(bd.total_amount)})</h3>
				<div class="dnr-table-wrap" style="padding:0">
					<table class="dnr-table" style="min-width:760px">
						<thead>
							<tr>
								<th>${__("Bank Deposit")}</th>
								<th>${__("Date")}</th>
								<th>${__("Slip No")}</th>
								<th>${__("Bank Account")}</th>
								<th class="num">${__("Slips")}</th>
								<th class="num">${__("Amount")}</th>
								<th>${__("Journal Entry")}</th>
							</tr>
						</thead>
						<tbody>
							${body}
							<tr class="dnr-total">
								<td colspan="5">${__("Total Deposited to Bank")}</td>
								<td class="num">${this.fmt_cur(bd.total_amount)}</td>
								<td></td>
							</tr>
						</tbody>
					</table>
				</div>
			</div>`;
	}

	deposit_badge(r) {
		if (r.deposited) {
			return `<span class="dnr-badge ok">${__("Deposited")}</span>`;
		}
		if (r.is_cash) {
			return `<span class="dnr-badge pending">${__("Pending Deposit")}</span>`;
		}
		return `<span class="dnr-badge na">${this.esc(r.payment_method || "—")}</span>`;
	}

	render_detail_table(rows, totals) {
		let body = "";
		if (!rows.length) {
			body = `<tr><td colspan="11" class="text-center text-muted">${__("No donations found.")}</td></tr>`;
		} else {
			body = rows
				.map(
					(r) => `<tr>
					<td><a class="dnr-link dnr-open" data-name="${this.esc(r.name)}">${this.esc(r.name)}</a></td>
					<td>${this.esc(frappe.datetime.str_to_user(r.donation_date))}</td>
					<td>${this.esc(r.donor_name)}${
						r.donor
							? `<div style="color:#64748b;font-size:10px">${this.esc(r.donor)}</div>`
							: ""
					}</td>
					<td>${this.esc(r.donation_type)}
						${
							r.donation_category
								? `<div style="color:#64748b;font-size:10px">${this.esc(r.donation_category)}</div>`
								: ""
						}
					</td>
					<td class="num">${this.fmt_cur(r.received_amount)}</td>
					<td>${this.esc(r.payment_method || "—")}</td>
					<td>${this.deposit_badge(r)}
						${
							r.bank_deposit
								? `<div style="margin-top:3px"><a class="dnr-link dnr-open" data-doctype="Bank Deposit" data-name="${this.esc(
										r.bank_deposit
								  )}">${this.esc(r.bank_deposit)}</a></div>`
								: ""
						}
					</td>
					<td>${this.esc(r.deposit_bank_account || r.bank_account || "—")}</td>
					<td>${this.esc(r.cost_center || "—")}</td>
					<td class="num">${this.fmt_cur(r.outstanding_amount)}</td>
					<td>${this.esc(r.remarks || "")}</td>
				</tr>`
				)
				.join("");
			body += `<tr class="dnr-total">
				<td colspan="4">${__("Total")} (${totals.donation_count || 0})</td>
				<td class="num">${this.fmt_cur(totals.received_amount)}</td>
				<td colspan="4"></td>
				<td class="num">${this.fmt_cur(totals.outstanding_amount)}</td>
				<td></td>
			</tr>`;
		}

		return `
			<div class="dnr-section" style="padding-top:0">
				<h3>${__("Donation Receipts")}</h3>
			</div>
			<div class="dnr-table-wrap">
				<table class="dnr-table" style="min-width:1100px">
					<thead>
						<tr>
							<th>${__("Receipt")}</th>
							<th>${__("Date")}</th>
							<th>${__("Donor")}</th>
							<th>${__("Type")}</th>
							<th class="num">${__("Received")}</th>
							<th>${__("Mode of Payment")}</th>
							<th>${__("Bank Deposit Status")}</th>
							<th>${__("Bank Account")}</th>
							<th>${__("Cost Center")}</th>
							<th class="num">${__("Outstanding")}</th>
							<th>${__("Remarks")}</th>
						</tr>
					</thead>
					<tbody>${body}</tbody>
				</table>
			</div>`;
	}

	render_summary_table(rows, group_by, totals) {
		let body = "";
		if (!rows.length) {
			body = `<tr><td colspan="6" class="text-center text-muted">${__("No donations found.")}</td></tr>`;
		} else {
			body = rows
				.map(
					(r) => `<tr>
					<td>${this.esc(r.label)}</td>
					<td class="num">${r.donation_count}</td>
					<td class="num">${r.unique_donors}</td>
					<td class="num">${this.fmt_cur(r.donation_amount)}</td>
					<td class="num">${this.fmt_cur(r.received_amount)}</td>
					<td class="num">${this.fmt_cur(r.outstanding_amount)}</td>
				</tr>`
				)
				.join("");
			body += `<tr class="dnr-total">
				<td>${__("Total")}</td>
				<td class="num">${totals.donation_count || 0}</td>
				<td class="num">${totals.unique_donors || 0}</td>
				<td class="num">${this.fmt_cur(totals.donation_amount)}</td>
				<td class="num">${this.fmt_cur(totals.received_amount)}</td>
				<td class="num">${this.fmt_cur(totals.outstanding_amount)}</td>
			</tr>`;
		}

		return `
			<div class="dnr-table-wrap">
				<table class="dnr-table" style="min-width:720px">
					<thead>
						<tr>
							<th>${__(group_by || "Group")}</th>
							<th class="num">${__("Receipts")}</th>
							<th class="num">${__("Donors")}</th>
							<th class="num">${__("Donation Amount")}</th>
							<th class="num">${__("Received")}</th>
							<th class="num">${__("Outstanding")}</th>
						</tr>
					</thead>
					<tbody>${body}</tbody>
				</table>
			</div>`;
	}

	print_report() {
		if (!this.data) {
			frappe.msgprint(__("Nothing to print."));
			return;
		}
		const html = $("#dnr-body").html();
		const w = window.open("", "_blank");
		if (!w) {
			frappe.msgprint(__("Please allow pop-ups to print."));
			return;
		}
		w.document.write(`<!DOCTYPE html><html><head>
			<title>${__("Donation Report")}</title>
			<style>
				@page{size:A4 landscape;margin:12mm}
				body{font-family:Arial,Helvetica,sans-serif;margin:12px;color:#0f172a}
				.dnr-brand{display:flex;justify-content:space-between;border-bottom:3px solid #1b5e3b;padding-bottom:10px;margin-bottom:10px}
				.dnr-brand-left{display:flex;gap:12px;align-items:center}
				.dnr-brand-left img{max-height:48px}
				.dnr-company{margin:0;font-size:16px;font-weight:800;color:#123524}
				.dnr-doc-title{text-align:right}
				.dnr-doc-title h2{margin:0;font-size:14px;color:#1b5e3b;text-transform:uppercase}
				.dnr-party-bar,.dnr-kpis{display:flex;gap:10px;flex-wrap:wrap;margin:8px 0}
				.dnr-kpi{border:1px solid #ddd;border-radius:6px;padding:8px 10px;min-width:110px}
				.dnr-kpi .lbl,.dnr-party-bar .lbl{font-size:9px;color:#666;text-transform:uppercase;font-weight:700}
				.dnr-kpi .val,.dnr-party-bar .val{font-size:12px;font-weight:800}
				.dnr-table{width:100%;border-collapse:collapse;font-size:10px}
				.dnr-table th,.dnr-table td{border:1px solid #ccc;padding:4px 6px}
				.dnr-table thead th{background:#1b5e3b;color:#fff}
				.dnr-table .num{text-align:right}
				.dnr-table tbody tr.dnr-total td{background:#1b5e3b;color:#fff;font-weight:800}
				.dnr-chip{display:inline-block;padding:1px 6px;border-radius:8px;font-size:9px;background:#eef6f0;margin-right:3px}
				.dnr-footer{margin-top:10px;font-size:10px;color:#666;display:flex;justify-content:space-between}
				@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
			</style>
		</head><body>
			${html}
			<script>window.onload=function(){setTimeout(function(){window.print()},250)}</script>
		</body></html>`);
		w.document.close();
	}

	export_csv() {
		if (!this.data) {
			frappe.msgprint(__("Nothing to export."));
			return;
		}
		const data = this.data;
		let lines = [];
		if (data.mode === "summary") {
			lines.push([
				data.group_by || "Group",
				"Receipts",
				"Donors",
				"Donation Amount",
				"Received",
				"Outstanding",
			]);
			(data.summary_rows || []).forEach((r) => {
				lines.push([
					r.label,
					r.donation_count,
					r.unique_donors,
					r.donation_amount,
					r.received_amount,
					r.outstanding_amount,
				]);
			});
		} else {
			lines.push([
				"Receipt",
				"Date",
				"Donor",
				"Donor ID",
				"Type",
				"Category",
				"Received",
				"Outstanding",
				"Mode of Payment",
				"Bank Deposit Status",
				"Bank Deposit",
				"Deposit Bank Account",
				"Cost Center",
				"Reference",
				"Remarks",
			]);
			(data.rows || []).forEach((r) => {
				lines.push([
					r.name,
					r.donation_date,
					r.donor_name,
					r.donor,
					r.donation_type,
					r.donation_category,
					r.received_amount,
					r.outstanding_amount,
					r.payment_method,
					r.deposit_status,
					r.bank_deposit,
					r.deposit_bank_account || r.bank_account,
					r.cost_center,
					r.payment_reference,
					r.remarks,
				]);
			});
		}

		const csv = lines
			.map((row) =>
				row
					.map((cell) => {
						const v = cell == null ? "" : String(cell);
						return `"${v.replace(/"/g, '""')}"`;
					})
					.join(",")
			)
			.join("\n");

		const a = document.createElement("a");
		a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
		a.download = `donation-report-${data.from_date}-${data.to_date}.csv`;
		a.click();
	}
};
