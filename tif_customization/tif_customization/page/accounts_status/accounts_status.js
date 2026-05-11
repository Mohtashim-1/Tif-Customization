const TIF_ACCT_PALETTE = {
	lines2: ["#2563eb", "#dc2626"],
	donut: ["#4f46e5", "#ea580c", "#059669", "#e11d48", "#7c3aed", "#0891b2"],
};

frappe.pages["accounts-status"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: "Accounts Status",
		single_column: true,
	});

	class TIFAccountsStatusDashboard {
		constructor(page) {
			this.page = page;
			this.apex_loaded = false;
			this.charts = {};
			this.filters = {
				company: frappe.defaults.get_user_default("Company") || "",
				from_date: null,
				to_date: frappe.datetime.get_today(),
			};
		}

		async make() {
			this.render();
			this.inject_styles();
			this.make_filters();
			await this.load_apexcharts();
			await this.refresh();
		}

		render() {
			this.page.main.html(`
				<div class="tif-acctdash">
					<p class="text-muted" style="font-size:12px;margin:0 0 10px">
						<strong>Trustee monitoring</strong> — receivables, payables, draft vouchers, income/expense and bank/cash balances.
					</p>
					<div class="tif-acctdash__cards">
						<div class="tif-card" data-card="receivables_outstanding">
							<div class="tif-card__label">Receivables outstanding</div>
							<div class="tif-card__value">—</div>
							<div class="tif-card__hint">Sales Invoices (submitted)</div>
						</div>
						<div class="tif-card" data-card="receivables_overdue">
							<div class="tif-card__label">Receivables overdue</div>
							<div class="tif-card__value">—</div>
							<div class="tif-card__hint">Due date &lt; today</div>
						</div>
						<div class="tif-card" data-card="payables_outstanding">
							<div class="tif-card__label">Payables outstanding</div>
							<div class="tif-card__value">—</div>
							<div class="tif-card__hint">Purchase Invoices (submitted)</div>
						</div>
						<div class="tif-card" data-card="payables_overdue">
							<div class="tif-card__label">Payables overdue</div>
							<div class="tif-card__value">—</div>
							<div class="tif-card__hint">Due date &lt; today</div>
						</div>
						<div class="tif-card" data-card="income_ytd">
							<div class="tif-card__label">Income (YTD)</div>
							<div class="tif-card__value">—</div>
							<div class="tif-card__hint">GL Income</div>
						</div>
						<div class="tif-card" data-card="expense_ytd">
							<div class="tif-card__label">Expense (YTD)</div>
							<div class="tif-card__value">—</div>
							<div class="tif-card__hint">GL Expense</div>
						</div>
						<div class="tif-card" data-card="net_ytd">
							<div class="tif-card__label">Net (YTD)</div>
							<div class="tif-card__value">—</div>
							<div class="tif-card__hint">Income − Expense</div>
						</div>
					</div>

					<p class="text-muted" style="font-size:12px;margin:16px 0 8px">
						<strong>Operational</strong> — drafts that need action
					</p>
					<div class="tif-acctdash__cards">
						<div class="tif-card" data-card="draft_sales_invoices">
							<div class="tif-card__label">Draft Sales Invoices</div>
							<div class="tif-card__value">—</div>
							<div class="tif-card__hint">docstatus = 0</div>
						</div>
						<div class="tif-card" data-card="draft_purchase_invoices">
							<div class="tif-card__label">Draft Purchase Invoices</div>
							<div class="tif-card__value">—</div>
							<div class="tif-card__hint">docstatus = 0</div>
						</div>
						<div class="tif-card" data-card="draft_payment_entries">
							<div class="tif-card__label">Draft Payment Entries</div>
							<div class="tif-card__value">—</div>
							<div class="tif-card__hint">docstatus = 0</div>
						</div>
						<div class="tif-card" data-card="draft_journal_entries">
							<div class="tif-card__label">Draft Journal Entries</div>
							<div class="tif-card__value">—</div>
							<div class="tif-card__hint">docstatus = 0</div>
						</div>
					</div>

					<div class="tif-acctdash__grid">
						<div class="tif-panel tif-panel--span2">
							<div class="tif-panel__title">Monthly income vs expense</div>
							<div id="tif-acctdash-income-expense"></div>
						</div>
						<div class="tif-panel">
							<div class="tif-panel__title">Accounts team activity</div>
							<div class="tif-panel__hint">Created &amp; last touched in the selected date range</div>
							<div class="tif-table" data-table="accounts_user_activity"></div>
						</div>
						<div class="tif-panel">
							<div class="tif-panel__title">Bank / Cash balances</div>
							<div class="tif-panel__hint">Top accounts by absolute balance</div>
							<div class="tif-table" data-table="bank_cash_balances"></div>
						</div>
						<div class="tif-panel tif-panel--span2">
							<div class="tif-panel__title">Overdue receivables</div>
							<div class="tif-table" data-table="overdue_receivables"></div>
						</div>
						<div class="tif-panel tif-panel--span2">
							<div class="tif-panel__title">Overdue payables</div>
							<div class="tif-table" data-table="overdue_payables"></div>
						</div>
					</div>
				</div>
			`);
		}

		inject_styles() {
			if (document.getElementById("tif-acctdash-style")) return;
			const style = document.createElement("style");
			style.id = "tif-acctdash-style";
			style.textContent = `
				.tif-acctdash__cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
				@media (max-width: 1200px){.tif-acctdash__cards{grid-template-columns:repeat(2,minmax(0,1fr));}}
				.tif-card{border:1px solid var(--border-color,#e5e7eb);border-radius:10px;background:var(--card-bg,#fff);padding:12px}
				.tif-card__label{font-size:12px;color:var(--text-muted,#64748b);font-weight:600}
				.tif-card__value{font-size:20px;margin-top:6px;font-weight:700}
				.tif-card__hint{font-size:11px;color:var(--text-muted,#64748b);margin-top:4px}
				.tif-acctdash__grid{margin-top:14px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
				@media (max-width: 1200px){.tif-acctdash__grid{grid-template-columns:1fr;}}
				.tif-panel{border:1px solid var(--border-color,#e5e7eb);border-radius:12px;background:var(--card-bg,#fff);padding:12px}
				.tif-panel--span2{grid-column:span 2}
				@media (max-width: 1200px){.tif-panel--span2{grid-column:auto}}
				.tif-panel__title{font-size:13px;font-weight:700;margin-bottom:8px}
				.tif-panel__hint{font-size:11px;color:var(--text-muted,#64748b);margin:-4px 0 10px}
				.tif-table table{width:100%;border-collapse:collapse}
				.tif-table th,.tif-table td{border-top:1px solid var(--border-color,#e5e7eb);padding:8px;font-size:12px}
				.tif-table th{color:var(--text-muted,#64748b);font-weight:700;text-align:left}
				.tif-table td.num{text-align:right;font-variant-numeric:tabular-nums}
				.tif-link{color:var(--text-color,#0f172a);text-decoration:underline;cursor:pointer}
			`;
			document.head.appendChild(style);
		}

		make_filters() {
			this.page.clear_actions && this.page.clear_actions();
			this.page.clear_custom_actions && this.page.clear_custom_actions();

			this.page.add_field({
				label: "Company",
				fieldtype: "Link",
				fieldname: "company",
				options: "Company",
				default: this.filters.company,
				change: () => {
					this.filters.company = this.page.fields_dict.company.get_value() || "";
					this.refresh();
				},
			});

			this.page.add_field({
				label: "From Date",
				fieldtype: "Date",
				fieldname: "from_date",
				default: this.filters.from_date,
				change: () => {
					this.filters.from_date = this.page.fields_dict.from_date.get_value() || null;
					this.refresh();
				},
			});

			this.page.add_field({
				label: "To Date",
				fieldtype: "Date",
				fieldname: "to_date",
				default: this.filters.to_date,
				change: () => {
					this.filters.to_date = this.page.fields_dict.to_date.get_value() || frappe.datetime.get_today();
					this.refresh();
				},
			});
		}

		load_apexcharts() {
			if (this.apex_loaded || window.ApexCharts) {
				this.apex_loaded = true;
				return Promise.resolve();
			}
			return new Promise((resolve, reject) => {
				const existing = document.querySelector('script[data-tif-apexcharts="1"]');
				if (existing) {
					existing.addEventListener("load", () => resolve());
					existing.addEventListener("error", () => reject());
					return;
				}
				const script = document.createElement("script");
				script.dataset.tifApexcharts = "1";
				script.src = "https://cdn.jsdelivr.net/npm/apexcharts@3.49.1";
				script.onload = () => {
					this.apex_loaded = true;
					resolve();
				};
				script.onerror = () => reject(new Error("Failed to load ApexCharts"));
				document.head.appendChild(script);
			});
		}

		set_card(key, value, fmt = false) {
			const el = this.page.main.find(`.tif-card[data-card="${key}"] .tif-card__value`)[0];
			if (!el) return;
			if (value === null || value === undefined || value === "") {
				el.textContent = "—";
				return;
			}
			let formatted;
			if (fmt === "currency") {
				formatted = frappe.format(value, { fieldtype: "Currency" });
			} else if (typeof value === "number") {
				formatted = frappe.format(value, { fieldtype: Number.isInteger(value) ? "Int" : "Currency" });
			} else {
				formatted = String(value);
			}
			const s = String(formatted ?? value);
			el.textContent = frappe.utils?.strip_html ? frappe.utils.strip_html(s) : s.replace(/<[^>]*>/g, "");
		}

		ensure_chart(key, selector, options) {
			if (!window.ApexCharts) return null;
			if (this.charts[key]) return this.charts[key];
			const container = this.page.main.find(selector)[0];
			if (!container) return null;
			const chart = new ApexCharts(container, options);
			chart.render();
			this.charts[key] = chart;
			return chart;
		}

		render_table(key, rows, columns) {
			const container = this.page.main.find(`.tif-table[data-table="${key}"]`)[0];
			if (!container) return;
			const safeRows = rows || [];
			if (!safeRows.length) {
				container.innerHTML = `<div class="text-muted" style="font-size:12px">No data</div>`;
				return;
			}
			const thead = `<thead><tr>${columns.map((c) => `<th>${frappe.utils.escape_html(c.label)}</th>`).join("")}</tr></thead>`;
			const tbody = safeRows
				.map((r) => {
					return `<tr>${columns
						.map((c) => {
							const v = r?.[c.key];
							if (c.type === "currency") {
								const formatted = frappe.format(v || 0, { fieldtype: "Currency" });
								const stripped = frappe.utils?.strip_html
									? frappe.utils.strip_html(String(formatted))
									: String(formatted).replace(/<[^>]*>/g, "");
								return `<td class="num">${frappe.utils.escape_html(stripped)}</td>`;
							}
							if (c.type === "link") {
								const doctype = c.doctype || (c.doctype_key ? r?.[c.doctype_key] : null);
								const label = v || r?.[c.label_key] || "";
								if (!doctype || !v) {
									return `<td>${frappe.utils.escape_html(String(label || ""))}</td>`;
								}
								return `<td><span class="tif-link" data-doctype="${frappe.utils.escape_html(
									String(doctype)
								)}" data-name="${frappe.utils.escape_html(String(v))}">${frappe.utils.escape_html(
									String(label)
								)}</span></td>`;
							}
							return `<td>${frappe.utils.escape_html(String(v ?? ""))}</td>`;
						})
						.join("")}</tr>`;
				})
				.join("");
			container.innerHTML = `<table>${thead}<tbody>${tbody}</tbody></table>`;
			container.querySelectorAll(".tif-link").forEach((el) => {
				el.addEventListener("click", () => {
					const doctype = el.getAttribute("data-doctype");
					const name = el.getAttribute("data-name");
					if (doctype && name) frappe.set_route("Form", doctype, name);
				});
			});
		}

		async refresh() {
			if (!window.ApexCharts) {
				try {
					await this.load_apexcharts();
				} catch (e) {
					frappe.msgprint("ApexCharts could not be loaded.");
					return;
				}
			}
			const filters = { ...this.filters };
			this.page.set_indicator("Loading…", "blue");
			const r = await frappe.call({
				method: "tif_customization.tif_customization.page.accounts_status.accounts_status.get_dashboard_data",
				args: { filters },
			});
			if (this.page.clear_indicator) this.page.clear_indicator();
			const data = r?.message || {};
			this.render_kpis(data);
			this.render_charts(data);
			this.render_tables(data);
		}

		render_kpis(data) {
			this.set_card("receivables_outstanding", data.receivables_outstanding, "currency");
			this.set_card("receivables_overdue", data.receivables_overdue, "currency");
			this.set_card("payables_outstanding", data.payables_outstanding, "currency");
			this.set_card("payables_overdue", data.payables_overdue, "currency");
			this.set_card("income_ytd", data.income_ytd, "currency");
			this.set_card("expense_ytd", data.expense_ytd, "currency");
			this.set_card("net_ytd", data.net_ytd, "currency");
			this.set_card("draft_sales_invoices", data.draft_sales_invoices);
			this.set_card("draft_purchase_invoices", data.draft_purchase_invoices);
			this.set_card("draft_payment_entries", data.draft_payment_entries);
			this.set_card("draft_journal_entries", data.draft_journal_entries);
		}

		render_charts(data) {
			const mode = frappe.get_cookie("theme") === "dark" ? "dark" : "light";
			const d = data.monthly_income_expense || {};
			const chart = this.ensure_chart("income_expense", "#tif-acctdash-income-expense", {
				chart: { type: "line", height: 320, toolbar: { show: false }, zoom: { enabled: false } },
				theme: { mode },
				colors: TIF_ACCT_PALETTE.lines2,
				stroke: { width: 3, curve: "smooth" },
				markers: { size: 3, strokeWidth: 2 },
				grid: { borderColor: "#e2e8f0", strokeDashArray: 4 },
				tooltip: { theme: mode, shared: true, intersect: false },
				noData: { text: "No data" },
				xaxis: { categories: d.labels || [] },
				series: d.series || [],
				yaxis: { labels: { formatter: (v) => frappe.format(v, { fieldtype: "Currency" }) } },
			});
			if (chart) {
				chart.updateOptions({ xaxis: { categories: d.labels || [] }, series: d.series || [] }, false, true);
			}
		}

		render_tables(data) {
			this.render_table("accounts_user_activity", data.accounts_user_activity, [
				{ key: "user", label: "User" },
				{ key: "created_count", label: "Created" },
				{ key: "touched_count", label: "Touched" },
				{ key: "last_name", label: "Last entry", type: "link", doctype_key: "last_doctype" },
				{ key: "last_action_at", label: "Last at" },
			]);
			this.render_table("bank_cash_balances", data.bank_cash_balances, [
				{ key: "account", label: "Account" },
				{ key: "balance", label: "Balance", type: "currency" },
			]);
			this.render_table("overdue_receivables", data.overdue_receivables, [
				{ key: "name", label: "Invoice", type: "link", doctype: "Sales Invoice" },
				{ key: "customer", label: "Customer" },
				{ key: "due_date", label: "Due" },
				{ key: "outstanding_amount", label: "Outstanding", type: "currency" },
			]);
			this.render_table("overdue_payables", data.overdue_payables, [
				{ key: "name", label: "Bill", type: "link", doctype: "Purchase Invoice" },
				{ key: "supplier", label: "Supplier" },
				{ key: "due_date", label: "Due" },
				{ key: "outstanding_amount", label: "Outstanding", type: "currency" },
			]);
		}
	}

	wrapper.tifAccountsStatusDashboard = new TIFAccountsStatusDashboard(page);
	wrapper.tifAccountsStatusDashboard.make();
};
