frappe.pages["purchase-from-endowment-fund"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Endowment Fund"),
		single_column: true,
	});

	if (!window.PurchaseFromEndowmentFundReport) {
		window.PurchaseFromEndowmentFundReport = class PurchaseFromEndowmentFundReport {
			constructor(page) {
				this.page = page;
				this.filters = {
					from_date: "",
					to_date: "",
					supplier: "",
				};
			}

			async make() {
				this.render_layout();
				this.bind_events();
				await this.refresh();
			}

			render_layout() {
				this.page.main.html(`
					<div class="zakat-report">
						<div class="zakat-hero">
							<div class="zakat-hero__copy">
								<div class="zakat-eyebrow">${__("Finance Report")}</div>
								<h2>${__("Endowment Fund")}</h2>
								
							</div>
							<div class="zakat-hero__side">
								<div class="zakat-actions">
									<a href="/app/donation?donation_type=Rental%20Income">${__("Endowment Receipts")}</a>
									<a href="/app/account/MEEZAN%20BANK%20-%20TIF">${__("Meezan Bank")}</a>
								</div>
								<div class="zakat-hero-stats" id="zakat-hero-stats"></div>
							</div>
						</div>

						<div class="zakat-toolbar">
							<div class="filter-field">
								<label>${__("From Date")}</label>
								<input type="date" class="form-control input-from-date" />
							</div>
							<div class="filter-field">
								<label>${__("To Date")}</label>
								<input type="date" class="form-control input-to-date" />
							</div>
							<div class="filter-field filter-field--wide">
								<label>${__("Supplier")}</label>
								<input type="text" class="form-control input-supplier" placeholder="${__("Optional supplier filter")}" />
							</div>
							<div class="filter-field">
								<div class="zakat-button-row">
									<button class="btn btn-primary btn-sm btn-refresh">${__("Refresh")}</button>
									<button class="btn btn-default btn-sm btn-clear">${__("All Time")}</button>
									<button class="btn btn-default btn-sm btn-print">${__("Print")}</button>
								</div>
							</div>
						</div>

						<div class="zakat-kpis" id="zakat-kpis"></div>
						<div id="zakat-usage-card"></div>

						<div class="zakat-grid">
							<div class="zakat-panel">
								<div class="zakat-panel__head">
									<div>
										<h3>${__("Monthly Summary")}</h3>
										<p>${__("Received, used, and running balance by month")}</p>
									</div>
								</div>
								<div class="zakat-table-wrap" id="zakat-monthly"></div>
							</div>
							<div class="zakat-panel">
								<div class="zakat-panel__head">
									<div>
										<h3>${__("Supplier-wise Endowment Purchases")}</h3>
										<p>${__("Which suppliers were paid from Endowment-marked entries")}</p>
									</div>
								</div>
								<div class="zakat-table-wrap" id="zakat-suppliers"></div>
							</div>
						</div>

						<div class="zakat-panel">
							<div class="zakat-panel__head">
								<div>
									<h3>${__("Purchase Details")}</h3>
									<p>${__(
										"Submitted supplier Payment Entries linked to Purchase Invoices where remarks or paid-from account mention Endowment or Rental Income"
									)}</p>
								</div>
							</div>
							<div class="zakat-table-wrap zakat-table-wrap--lg" id="zakat-purchases"></div>
						</div>

						<div class="zakat-panel">
							<div class="zakat-panel__head">
								<div>
									<h3>${__("Endowment Received Details")}</h3>
									<p>${__("Received amount is calculated from Rental Income / Endowment donation receipts")}</p>
								</div>
							</div>
							<div class="zakat-table-wrap zakat-table-wrap--lg" id="zakat-received"></div>
						</div>
					</div>
				`);
				this.add_style();
			}

			bind_events() {
				this.page.main.find(".btn-refresh").on("click", () => this.refresh());
				this.page.main.find(".btn-print").on("click", () => window.print());
				this.page.main.find(".btn-clear").on("click", () => {
					this.filters = { from_date: "", to_date: "", supplier: "" };
					this.page.main.find(".input-from-date, .input-to-date, .input-supplier").val("");
					this.refresh();
				});
				this.page.main.find(".input-from-date").on("change", (event) => {
					this.filters.from_date = event.target.value || "";
				});
				this.page.main.find(".input-to-date").on("change", (event) => {
					this.filters.to_date = event.target.value || "";
				});
				this.page.main.find(".input-supplier").on("change", (event) => {
					this.filters.supplier = (event.target.value || "").trim();
				});
			}

			async refresh() {
				this.page.set_indicator(__("Loading…"), "blue");
				try {
					const response = await frappe.call({
						method:
							"tif_customization.tif_customization.page.purchase_from_endowment_fund.purchase_from_endowment_fund.get_report_data",
						args: { filters: this.filters },
					});
					this.data = response.message || {};
					this.render();
				} catch (error) {
					frappe.msgprint(__("Could not load Purchase from Endowment Fund report"));
				} finally {
					this.page.clear_indicator?.();
				}
			}

			render() {
				this.render_hero_stats();
				this.render_kpis();
				this.render_usage_card();
				this.render_monthly();
				this.render_suppliers();
				this.render_purchases();
				this.render_received();
			}

			render_hero_stats() {
				const summary = this.data.summary || {};
				const received = flt(summary.zakat_received);
				const used = flt(summary.purchase_used);
				const percent = received > 0 ? Math.min(100, Math.max(0, (used / received) * 100)) : 0;
				this.page.main.find("#zakat-hero-stats").html(`
					<div class="zakat-hero-stat">
						<span>${__("Received")}</span>
						<strong>${this.compact_money(summary.zakat_received)}</strong>
					</div>
					<div class="zakat-hero-stat">
						<span>${__("Used")}</span>
						<strong>${this.compact_money(summary.purchase_used)}</strong>
					</div>
					<div class="zakat-hero-stat">
						<span>${__("Usage")}</span>
						<strong>${percent.toFixed(1)}%</strong>
					</div>
				`);
			}

			render_kpis() {
				const summary = this.data.summary || {};
				const cards = [
					{ label: __("Endowment Received"), value: this.money(summary.zakat_received), color: "#059669", icon: "↓", hint: __("Received through Rental Income / Endowment receipts") },
					{ label: __("Used for Purchases"), value: this.money(summary.purchase_used), color: "#dc2626", icon: "↑", hint: `${this.num(summary.purchase_count)} ${__("payments")} · ${this.num(summary.invoice_count)} ${__("invoices")}` },
					{ label: __("Remaining Endowment"), value: this.money(summary.remaining_amount), color: "#2563eb", icon: "=", hint: __("Received minus used for purchases") },
					{ label: __("Suppliers"), value: this.num(summary.supplier_count), color: "#7c3aed", icon: "#", hint: __("Paid from Endowment-marked entries") },
				];

				this.page.main.find("#zakat-kpis").html(
					cards
						.map(
							(card) => `
						<div class="zakat-kpi" style="--accent:${card.color}">
							<div class="zakat-kpi__top">
								<div class="zakat-kpi__label">${card.label}</div>
								<div class="zakat-kpi__icon">${card.icon}</div>
							</div>
							<div class="zakat-kpi__value">${card.value}</div>
							<div class="zakat-kpi__hint">${card.hint}</div>
						</div>`
						)
						.join("")
				);
			}

			render_usage_card() {
				const summary = this.data.summary || {};
				const received = flt(summary.zakat_received);
				const used = flt(summary.purchase_used);
				const remaining = flt(summary.remaining_amount);
				const percent = received > 0 ? Math.min(100, Math.max(0, (used / received) * 100)) : 0;

				this.page.main.find("#zakat-usage-card").html(`
					<div class="zakat-usage">
						<div class="zakat-usage__meta">
							<div>
								<div class="zakat-usage__label">${__("Endowment utilization for purchases")}</div>
								<div class="zakat-usage__text">
									${this.money(used)} ${__("used out of")} ${this.money(received)}
								</div>
							</div>
							<div class="zakat-usage__percent">${percent.toFixed(1)}%</div>
						</div>
						<div class="zakat-progress">
							<div class="zakat-progress__bar" style="width:${percent}%"></div>
						</div>
						<div class="zakat-usage__foot">
							<span>${__("Remaining")}: <strong>${this.money(remaining)}</strong></span>
							<span>${__("Source")}: ${__("Rental Income / Endowment receipts + Endowment-marked purchase payments")}</span>
						</div>
					</div>
				`);
			}

			render_monthly() {
				this.render_table(
					"#zakat-monthly",
					[
						{ key: "month", label: __("Month") },
						{ key: "received", label: __("Endowment Received"), fmt: "money", align: "right" },
						{ key: "used", label: __("Used for Purchase"), fmt: "money", align: "right" },
						{ key: "balance", label: __("Running Balance"), fmt: "money", align: "right" },
					],
					this.data.monthly || []
				);
			}

			render_suppliers() {
				this.render_table(
					"#zakat-suppliers",
					[
						{ key: "supplier", label: __("Supplier"), link: "Supplier" },
						{ key: "payment_count", label: __("Payments"), fmt: "num", align: "right" },
						{ key: "invoice_count", label: __("Invoices"), fmt: "num", align: "right" },
						{ key: "amount", label: __("Amount"), fmt: "money", align: "right" },
					],
					this.data.supplier_summary || []
				);
			}

			render_purchases() {
				this.render_table(
					"#zakat-purchases",
					[
						{ key: "posting_date", label: __("Date") },
						{ key: "payment_entry", label: __("Payment Entry"), link: "Payment Entry" },
						{ key: "supplier", label: __("Supplier"), link: "Supplier" },
						{ key: "purchase_invoice", label: __("Purchase Invoice"), link: "Purchase Invoice" },
						{ key: "supplier_invoice_no", label: __("Supplier Inv #") },
						{ key: "amount", label: __("Endowment Used"), fmt: "money", align: "right" },
						{ key: "remarks", label: __("Remarks"), cls: "zakat-remarks" },
					],
					this.data.purchases || []
				);
			}

			render_received() {
				this.render_table(
					"#zakat-received",
					[
						{ key: "posting_date", label: __("Date") },
						{ key: "voucher_type", label: __("Voucher Type") },
						{ key: "voucher_no", label: __("Voucher"), dynamic_link: "voucher_type" },
						{ key: "account", label: __("Receipt Account"), link: "Account" },
						{ key: "amount", label: __("Received"), fmt: "money", align: "right" },
						{ key: "remarks", label: __("Remarks"), cls: "zakat-remarks" },
					],
					this.data.received || []
				);
			}

			render_table(selector, columns, rows) {
				const element = this.page.main.find(selector);
				if (!rows.length) {
					element.html(`<div class="zakat-empty">${__("No records found")}</div>`);
					return;
				}

				const head = columns
					.map((column) => `<th class="${column.align === "right" ? "text-right" : ""}">${column.label}</th>`)
					.join("");
				const body = rows
					.map((row) => {
						const cells = columns
							.map((column) => {
								let value = row[column.key];
								if (column.fmt === "money") value = this.money(value);
								else if (column.fmt === "num") value = this.num(value);
								else value = frappe.utils.escape_html(value == null ? "" : String(value));

								const doctype = column.dynamic_link ? row[column.dynamic_link] : column.link;
								if (doctype && row[column.key]) {
									value = `<span class="zakat-link" data-doctype="${frappe.utils.escape_html(
										doctype
									)}" data-name="${frappe.utils.escape_html(row[column.key])}">${value}</span>`;
								}

								const classes = [column.cls || "", column.align === "right" ? "text-right zakat-amount" : ""]
									.filter(Boolean)
									.join(" ");
								return `<td class="${classes}">${value}</td>`;
							})
							.join("");
						return `<tr>${cells}</tr>`;
					})
					.join("");

				element.html(`<table class="zakat-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`);
				element.find(".zakat-link").on("click", function () {
					frappe.set_route("Form", this.getAttribute("data-doctype"), this.getAttribute("data-name"));
				});
			}

			money(value) {
				return format_currency(flt(value), frappe.defaults.get_default("currency"));
			}

			num(value) {
				return format_number(flt(value), null, 0);
			}

			compact_money(value) {
				const amount = flt(value);
				if (Math.abs(amount) >= 10000000) return `${(amount / 10000000).toFixed(2)} Cr`;
				if (Math.abs(amount) >= 100000) return `${(amount / 100000).toFixed(2)} Lac`;
				return this.money(amount);
			}

			add_style() {
				if ($("#purchase-from-endowment-style").length) return;
				$("head").append(`
					<style id="purchase-from-endowment-style">
						.zakat-report {
							padding: 4px 0 28px;
							color: var(--text-color, #1f2937);
						}

						.zakat-hero {
							position: relative;
							overflow: hidden;
							display: flex;
							justify-content: space-between;
							align-items: stretch;
							gap: 24px;
							flex-wrap: wrap;
							margin: 8px 0 16px;
							padding: 24px 26px;
							border-radius: 20px;
							color: #fff !important;
							background:
								radial-gradient(circle at 86% 18%, rgba(191, 219, 254, .38), transparent 24%),
								radial-gradient(circle at 24% 120%, rgba(16, 185, 129, .38), transparent 32%),
								linear-gradient(135deg, #022c22 0%, #065f46 46%, #1d4ed8 100%);
							box-shadow: 0 20px 48px rgba(15, 23, 42, .18);
						}

						.zakat-hero:after {
							content: "";
							position: absolute;
							right: -70px;
							bottom: -90px;
							width: 260px;
							height: 260px;
							border-radius: 999px;
							background: rgba(255,255,255,.10);
						}

						.zakat-hero__copy,
						.zakat-hero__side {
							position: relative;
							z-index: 1;
						}

						.zakat-hero__copy {
							max-width: 780px;
							min-width: 320px;
							flex: 1;
						}

						.zakat-hero__side {
							display: flex;
							flex-direction: column;
							justify-content: space-between;
							align-items: flex-end;
							gap: 18px;
							min-width: 360px;
						}

						.zakat-eyebrow {
							font-size: 11px;
							font-weight: 700;
							letter-spacing: .12em;
							text-transform: uppercase;
							color: #a7f3d0 !important;
							margin-bottom: 8px;
						}

						.zakat-hero h2 {
							margin: 0 0 7px;
							font-size: 30px;
							font-weight: 850;
							line-height: 1.15;
							letter-spacing: -.03em;
							color: #ffffff !important;
						}

						.zakat-hero p {
							margin: 0;
							color: rgba(255,255,255,.90) !important;
							max-width: 760px;
							font-size: 14px;
							line-height: 1.65;
						}

						.zakat-actions {
							position: relative;
							z-index: 1;
							display: flex;
							gap: 10px;
							flex-wrap: wrap;
							align-items: flex-start;
						}

						.zakat-actions a {
							display: inline-flex;
							align-items: center;
							border: 1px solid rgba(255,255,255,.32);
							border-radius: 999px;
							padding: 7px 11px;
							color: #fff;
							background: rgba(255,255,255,.12);
							text-decoration: none;
							font-size: 12px;
							backdrop-filter: blur(8px);
						}

						.zakat-actions a:hover {
							background: rgba(255,255,255,.20);
							text-decoration: none;
						}

						.zakat-hero-stats {
							display: grid;
							grid-template-columns: repeat(3, minmax(0, 1fr));
							gap: 10px;
							width: 100%;
							max-width: 520px;
						}

						.zakat-hero-stat {
							padding: 12px 14px;
							border: 1px solid rgba(255,255,255,.22);
							border-radius: 14px;
							background: rgba(255,255,255,.12);
							backdrop-filter: blur(10px);
						}

						.zakat-hero-stat span {
							display: block;
							margin-bottom: 4px;
							font-size: 11px;
							font-weight: 700;
							text-transform: uppercase;
							letter-spacing: .05em;
							color: rgba(255,255,255,.72);
						}

						.zakat-hero-stat strong {
							display: block;
							color: #fff;
							font-size: 18px;
							font-weight: 850;
							line-height: 1.15;
						}

						.zakat-toolbar {
							display: flex;
							flex-wrap: wrap;
							gap: 12px;
							align-items: flex-end;
							margin-bottom: 14px;
							padding: 14px;
							border: 1px solid var(--border-color, #e5e7eb);
							border-radius: 14px;
							background: var(--card-bg, #fff);
							box-shadow: 0 1px 2px rgba(15, 23, 42, .04);
						}

						.zakat-toolbar .filter-field { min-width: 150px; }
						.zakat-toolbar label {
							display: block;
							font-size: 11px;
							font-weight: 700;
							text-transform: uppercase;
							letter-spacing: .04em;
							color: var(--text-muted, #6b7280);
							margin-bottom: 5px;
						}
						.filter-field--wide { min-width: 290px; flex: 1; }
						.zakat-button-row { display:flex; gap:8px; flex-wrap:wrap; }

						.zakat-kpis {
							display: grid;
							grid-template-columns: repeat(4, minmax(0, 1fr));
							gap: 12px;
							margin-bottom: 12px;
						}

						.zakat-kpi {
							position: relative;
							overflow: hidden;
							padding: 16px;
							min-height: 112px;
							border: 1px solid var(--border-color, #e5e7eb);
							border-radius: 16px;
							background: linear-gradient(180deg, var(--card-bg, #fff), rgba(248,250,252,.72));
							box-shadow: 0 1px 2px rgba(15, 23, 42, .04);
						}

						.zakat-kpi:before {
							content: "";
							position: absolute;
							inset: 0 0 auto 0;
							height: 4px;
							background: var(--accent);
						}

						.zakat-kpi__top {
							display: flex;
							justify-content: space-between;
							gap: 10px;
							align-items: center;
							margin-bottom: 8px;
						}

						.zakat-kpi__label {
							font-size: 12px;
							font-weight: 700;
							color: var(--text-muted, #6b7280);
						}

						.zakat-kpi__icon {
							display: grid;
							place-items: center;
							width: 28px;
							height: 28px;
							border-radius: 10px;
							color: var(--accent);
							background: #ecfdf5;
							font-weight: 800;
						}

						.zakat-kpi__value {
							font-size: 24px;
							font-weight: 800;
							line-height: 1.15;
							letter-spacing: -.02em;
							word-break: break-word;
						}

						.zakat-kpi__hint {
							font-size: 11px;
							color: var(--text-muted, #6b7280);
							margin-top: 7px;
						}

						.zakat-usage {
							margin-bottom: 12px;
							padding: 16px;
							border: 1px solid var(--border-color, #e5e7eb);
							border-radius: 16px;
							background: var(--card-bg, #fff);
							box-shadow: 0 1px 2px rgba(15, 23, 42, .04);
						}

						.zakat-usage__meta,
						.zakat-usage__foot {
							display: flex;
							justify-content: space-between;
							gap: 12px;
							flex-wrap: wrap;
						}

						.zakat-usage__label {
							font-size: 12px;
							font-weight: 800;
							text-transform: uppercase;
							letter-spacing: .05em;
							color: var(--text-muted, #6b7280);
						}

						.zakat-usage__text { margin-top: 3px; font-size: 14px; font-weight: 650; }
						.zakat-usage__percent { font-size: 24px; font-weight: 850; color: #047857; }
						.zakat-usage__foot { margin-top: 9px; font-size: 12px; color: var(--text-muted, #6b7280); }

						.zakat-progress {
							overflow: hidden;
							height: 12px;
							margin-top: 12px;
							border-radius: 999px;
							background: #e5e7eb;
						}

						.zakat-progress__bar {
							height: 100%;
							border-radius: inherit;
							background: linear-gradient(90deg, #059669, #22c55e);
							box-shadow: 0 0 16px rgba(34,197,94,.35);
						}

						.zakat-grid {
							display: grid;
							grid-template-columns: minmax(0, .9fr) minmax(0, 1.1fr);
							gap: 12px;
							margin-bottom: 12px;
						}

						.zakat-panel {
							border: 1px solid var(--border-color, #e5e7eb);
							border-radius: 16px;
							background: var(--card-bg, #fff);
							padding: 0;
							margin-bottom: 12px;
							box-shadow: 0 1px 2px rgba(15, 23, 42, .04);
							overflow: hidden;
						}

						.zakat-panel__head {
							display: flex;
							justify-content: space-between;
							gap: 12px;
							padding: 14px 16px;
							border-bottom: 1px solid var(--border-color, #e5e7eb);
							background: linear-gradient(180deg, rgba(248,250,252,.96), rgba(248,250,252,.58));
						}

						.zakat-panel h3 {
							margin: 0;
							font-size: 15px;
							font-weight: 750;
						}

						.zakat-panel__head p {
							margin: 4px 0 0;
							font-size: 12px;
							color: var(--text-muted, #6b7280);
						}

						.zakat-table-wrap { max-height: 372px; overflow: auto; }
						.zakat-table-wrap--lg { max-height: 560px; }
						.zakat-table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 12px; }

						.zakat-table th,
						.zakat-table td {
							padding: 10px 12px;
							border-bottom: 1px solid var(--border-color, #e5e7eb);
							text-align: left;
							vertical-align: top;
							white-space: nowrap;
						}

						.zakat-table th {
							position: sticky;
							top: 0;
							z-index: 1;
							background: var(--control-bg, #f8fafc);
							font-size: 11px;
							font-weight: 800;
							text-transform: uppercase;
							letter-spacing: .04em;
							color: var(--text-muted, #6b7280);
						}

						.zakat-table tbody tr:nth-child(even) td { background: rgba(248,250,252,.52); }
						.zakat-table tbody tr:hover td { background: rgba(236,253,245,.78); }
						.zakat-amount { font-weight: 750; color: #111827; }
						.zakat-remarks { min-width: 360px; max-width: 520px; white-space: normal !important; color: #374151; line-height: 1.45; }
						.zakat-link { color: var(--primary, #2563eb); cursor: pointer; font-weight: 650; }
						.zakat-link:hover { text-decoration: underline; }
						.zakat-empty { padding: 28px; text-align: center; color: var(--text-muted, #6b7280); }

						@media(max-width: 1100px) {
							.zakat-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
							.zakat-grid { grid-template-columns: 1fr; }
						}

						@media(max-width: 640px) {
							.zakat-kpis { grid-template-columns: 1fr; }
							.zakat-hero { padding: 18px; }
							.zakat-hero h2 { font-size: 22px; }
							.filter-field--wide { min-width: 100%; }
						}

						@media(max-width: 900px) {
							.zakat-hero__side {
								align-items: stretch;
								min-width: 100%;
							}
							.zakat-hero-stats {
								max-width: none;
							}
						}

						@media print {
							.page-head, .zakat-toolbar, .zakat-actions { display: none !important; }
							.zakat-hero, .zakat-kpi, .zakat-usage, .zakat-panel { box-shadow: none; }
							.zakat-table-wrap { max-height: none; overflow: visible; }
						}
					</style>
				`);
			}

		};
	}

	new window.PurchaseFromEndowmentFundReport(page).make();
};
