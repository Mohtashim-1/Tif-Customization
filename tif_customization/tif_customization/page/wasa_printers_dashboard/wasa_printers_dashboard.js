frappe.pages["wasa-printers-dashboard"].on_page_load = function (wrapper) {
	frappe.require("/assets/tif_customization/css/millat_publisher_dashboard.css");

	const SUPPLIER = "WASA Printers (PVT) Ltd";
	const SUPPLIER_Q = encodeURIComponent(SUPPLIER);
	const WASA_WAREHOUSE = "";

	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("WASA Printers Dashboard"),
		single_column: true,
	});

	const loadCharts = () =>
		new Promise((resolve, reject) => {
			if (window.Chart) return resolve();
			frappe.require(
				"https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js",
				() => (window.Chart ? resolve() : reject(new Error("Chart.js failed to load")))
			);
		});

	if (!window.WasaPrintersDashboard) {
		window.WasaPrintersDashboard = class WasaPrintersDashboard {
			constructor(page) {
				this.page = page;
				this.charts = {};
				this.filters = {
					from_date: "",
					to_date: "",
					warehouse: WASA_WAREHOUSE,
				};
			}

			async make() {
				this.render_layout();
				this.bind_events();
				await loadCharts();
				await this.refresh();
			}

			render_layout() {
				this.page.main.html(`
					<div class="millat-dash-root">
						<div class="millat-hero">
							<div>
								<h1 class="millat-hero__title">${__("WASA Printers Dashboard")}</h1>
								<p class="millat-hero__sub">${__(
									"Complete view of orders placed, material received, invoices, and payments for WASA Printers (PVT) Ltd."
								)}</p>
							</div>
							<div class="millat-hero__links">
								<a href="/app/purchase-order?supplier=${SUPPLIER_Q}">${__("Purchase Orders")}</a>
								<a href="/app/purchase-invoice?supplier=${SUPPLIER_Q}">${__("Purchase Invoices")}</a>
							</div>
						</div>

						<div class="millat-toolbar">
							<div class="filter-field">
								<label>${__("From Date")}</label>
								<input type="date" class="form-control input-from-date" />
							</div>
							<div class="filter-field">
								<label>${__("To Date")}</label>
								<input type="date" class="form-control input-to-date" />
							</div>
							<div class="filter-field">
								<button class="btn btn-primary btn-sm btn-refresh">${__("Refresh")}</button>
								<button class="btn btn-default btn-sm btn-clear-dates">${__("All Time")}</button>
							</div>
						</div>

						<div class="millat-kpi-grid" id="wasa-kpi-grid"></div>

						<div class="millat-charts-row millat-charts-row--trend">
							<div class="millat-panel">
								<h3 class="millat-panel__title">${__("Monthly Trend — Ordered vs Received vs Paid")}</h3>
								<div class="millat-chart-wrap" id="wasa-trend-wrap">
									<canvas id="wasa-trend-chart"></canvas>
								</div>
							</div>
						</div>

						<div class="millat-charts-row millat-charts-row--split">
							<div class="millat-panel">
								<h3 class="millat-panel__title">${__("Receive Status (Qty)")}</h3>
								<div class="millat-chart-wrap millat-chart-wrap--sm" id="wasa-fulfill-wrap">
									<canvas id="wasa-fulfill-chart"></canvas>
								</div>
							</div>
							<div class="millat-panel">
								<h3 class="millat-panel__title">${__("Payment Status (Amount)")}</h3>
								<div class="millat-chart-wrap millat-chart-wrap--sm" id="wasa-payment-wrap">
									<canvas id="wasa-payment-chart"></canvas>
								</div>
							</div>
						</div>

						<div class="millat-charts-row millat-charts-row--trend">
							<div class="millat-panel">
								<h3 class="millat-panel__title">${__("Top Items — Ordered vs Received")}</h3>
								<div class="millat-chart-wrap millat-chart-wrap--items" id="wasa-items-wrap">
									<canvas id="wasa-items-chart"></canvas>
								</div>
							</div>
						</div>

						<div class="millat-tables">
							<div class="millat-panel">
								<h3 class="millat-panel__title">${__("Purchase Orders")}</h3>
								<div class="millat-table-wrap" id="wasa-po-table"></div>
							</div>
							<div class="millat-panel">
								<h3 class="millat-panel__title">${__("Purchase Invoices")}</h3>
								<div class="millat-table-wrap" id="wasa-pi-table"></div>
							</div>
							<div class="millat-panel">
								<h3 class="millat-panel__title">${__("Delivery Notes")}</h3>
								<div class="millat-table-wrap" id="wasa-dn-table"></div>
							</div>
							<div class="millat-panel">
								<h3 class="millat-panel__title">${__("Payments")}</h3>
								<div class="millat-table-wrap" id="wasa-pay-table"></div>
							</div>
						</div>
					</div>
				`);
			}

			bind_events() {
				const me = this;
				this.page.main.find(".btn-refresh").on("click", () => me.refresh());
				this.page.main.find(".btn-clear-dates").on("click", () => {
					me.filters.from_date = "";
					me.filters.to_date = "";
					me.page.main.find(".input-from-date").val("");
					me.page.main.find(".input-to-date").val("");
					me.refresh();
				});
				this.page.main.find(".input-from-date").on("change", function () {
					me.filters.from_date = this.value || "";
				});
				this.page.main.find(".input-to-date").on("change", function () {
					me.filters.to_date = this.value || "";
				});
				if (!this._resizeBound) {
					this._resizeBound = true;
					$(window).on("resize.wasa_printers_dash", () => {
						Object.values(this.charts).forEach((c) => c?.resize?.());
					});
				}
			}

			async refresh() {
				this.page.set_indicator(__("Loading…"), "blue");
				try {
					const r = await frappe.call({
						method:
							"tif_customization.tif_customization.page.wasa_printers_dashboard.wasa_printers_dashboard.get_dashboard_data",
						args: { filters: this.filters },
					});
					this.data = r?.message || {};
					this.render_kpis();
					requestAnimationFrame(() => this.render_charts());
					this.render_tables();
				} catch (e) {
					frappe.msgprint(__("Could not load dashboard data"));
				} finally {
					if (this.page.clear_indicator) this.page.clear_indicator();
				}
			}

			render_kpis() {
				const s = this.data.summary || {};
				const cards = [
					{ cls: "millat-kpi--ordered", label: __("POs Placed"), value: this.fmtNum(s.po_count), hint: this.fmtCur(s.ordered_amount) },
					{ cls: "millat-kpi--ordered", label: __("Ordered Book Qty"), value: this.fmtNum(s.ordered_qty), hint: __("Till date / filtered") },
					{ cls: "millat-kpi--received", label: __("Received Book Qty"), value: this.fmtNum(s.received_qty), hint: `${this.fmtNum(s.pr_count)} ${__("receipts")}` },
					{ cls: "millat-kpi--received", label: __("Delivered Book Qty"), value: this.fmtNum(s.delivered_qty), hint: `${this.fmtNum(s.dn_count)} ${__("delivery notes")}` },
					{ cls: "millat-kpi--paid", label: __("Paid Book Amount"), value: this.fmtCur(s.paid_amount), hint: `${__("Outstanding")}: ${this.fmtCur(s.outstanding_amount)}` },
				];
				this.page.main.find("#wasa-kpi-grid").html(
					cards
						.map(
							(c) => `
						<div class="millat-kpi ${c.cls}">
							<div class="millat-kpi__label">${c.label}</div>
							<div class="millat-kpi__value">${c.value}</div>
							<div class="millat-kpi__hint">${c.hint}</div>
						</div>`
						)
						.join("")
				);
			}

			render_charts() {
				const trend = this.data.monthly_trend || {};
				this.upsert_chart("trend", "wasa-trend-chart", "wasa-trend-wrap", {
					type: "line",
					data: {
						labels: trend.labels || [],
						datasets: [
							{ label: __("Ordered"), data: trend.ordered || [], borderColor: "#2563eb", backgroundColor: "rgba(37,99,235,0.1)", tension: 0.3 },
							{ label: __("Received"), data: trend.received || [], borderColor: "#059669", backgroundColor: "rgba(5,150,105,0.1)", tension: 0.3 },
							{ label: __("Paid"), data: trend.paid || [], borderColor: "#7c3aed", backgroundColor: "rgba(124,58,237,0.1)", tension: 0.3 },
						],
					},
					options: this._baseOptions(true),
				});

				const fulfill = this.data.fulfillment || {};
				this.upsert_donut_chart(
					"fulfill",
					"wasa-fulfill-chart",
					"wasa-fulfill-wrap",
					fulfill.labels || [],
					fulfill.values || [],
					["#059669", "#f97316"],
					"num"
				);

				const pay = this.data.payment_status || {};
				this.upsert_donut_chart(
					"payment",
					"wasa-payment-chart",
					"wasa-payment-wrap",
					pay.labels || [],
					pay.values || [],
					["#7c3aed", "#dc2626"],
					"cur"
				);

				const items = (this.data.items || []).slice(0, 12);
				this.upsert_chart("items", "wasa-items-chart", "wasa-items-wrap", {
					type: "bar",
					data: {
						labels: items.map((i) => i.item_code),
						datasets: [
							{ label: __("Ordered"), data: items.map((i) => i.ordered_qty), backgroundColor: "#2563eb" },
							{ label: __("Received"), data: items.map((i) => i.received_qty), backgroundColor: "#059669" },
						],
					},
					options: this._baseOptions(false),
				}, !items.length);
			}

			render_tables() {
				this.render_table(
					"#wasa-po-table",
					[
						{ key: "name", label: __("PO"), link: "Purchase Order" },
						{ key: "transaction_date", label: __("Date") },
						{ key: "status", label: __("Status") },
						{ key: "ordered_qty", label: __("Ordered Qty"), fmt: "num" },
						{ key: "received_qty", label: __("Received Qty"), fmt: "num" },
						{ key: "pending_qty", label: __("Pending Qty"), fmt: "num" },
						{ key: "grand_total", label: __("Amount"), fmt: "cur" },
					],
					this.data.purchase_orders || []
				);
				this.render_table(
					"#wasa-pi-table",
					[
						{ key: "name", label: __("Invoice"), link: "Purchase Invoice" },
						{ key: "posting_date", label: __("Date") },
						{ key: "grand_total", label: __("Amount"), fmt: "cur" },
						{ key: "outstanding_amount", label: __("Outstanding"), fmt: "cur" },
						{ key: "status", label: __("Status") },
					],
					this.data.purchase_invoices || []
				);
				this.render_table(
					"#wasa-dn-table",
					[
						{ key: "name", label: __("Delivery Note"), link: "Delivery Note" },
						{ key: "posting_date", label: __("Date") },
						{ key: "customer", label: __("Customer"), link: "Customer" },
						{ key: "delivered_qty", label: __("Qty"), fmt: "num" },
						{ key: "grand_total", label: __("Amount"), fmt: "cur" },
						{ key: "status", label: __("Status") },
					],
					this.data.delivery_notes || []
				);
				this.render_table(
					"#wasa-pay-table",
					[
						{ key: "payment_entry", label: __("Payment"), link: "Payment Entry" },
						{ key: "posting_date", label: __("Date") },
						{ key: "purchase_invoice", label: __("Invoice"), link: "Purchase Invoice" },
						{ key: "mode_of_payment", label: __("Mode") },
						{ key: "amount", label: __("Amount"), fmt: "cur" },
					],
					this.data.payments || []
				);
			}

			render_table(selector, columns, rows) {
				const $el = this.page.main.find(selector);
				if (!rows.length) {
					$el.html(`<div class="millat-empty">${__("No records")}</div>`);
					return;
				}
				const head = columns.map((c) => `<th>${c.label}</th>`).join("");
				const body = rows
					.map((row) => {
						const tds = columns
							.map((c) => {
								let val = row[c.key];
								if (c.fmt === "num") val = this.fmtNum(val);
								else if (c.fmt === "cur") val = this.fmtCur(val);
								else val = frappe.utils.escape_html(val == null ? "" : String(val));
								if (c.link && row[c.key]) {
									val = `<span class="millat-link" data-doctype="${c.link}" data-name="${frappe.utils.escape_html(
										row[c.key]
									)}">${val}</span>`;
								}
								return `<td>${val}</td>`;
							})
							.join("");
						return `<tr>${tds}</tr>`;
					})
					.join("");
				$el.html(`<table class="millat-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`);
				$el.find(".millat-link").on("click", function () {
					frappe.set_route("Form", this.getAttribute("data-doctype"), this.getAttribute("data-name"));
				});
			}

			upsert_donut_chart(key, canvasId, wrapId, labels, values, colors, valueFmt = "cur") {
				const total = (values || []).reduce((s, v) => s + flt(v), 0);
				if (total <= 0) {
					this._show_chart_empty(wrapId, canvasId, key);
					return;
				}
				this._clear_chart_empty(wrapId, canvasId);
				const fmt = valueFmt === "num" ? (v) => this.fmtNum(v) : (v) => this.fmtCur(v);
				this.upsert_chart(key, canvasId, wrapId, {
					type: "doughnut",
					data: {
						labels,
						datasets: [{ data: values, backgroundColor: colors }],
					},
					options: {
						...this._donutOptions(),
						plugins: {
							...this._donutOptions().plugins,
							tooltip: {
								callbacks: {
									label: (ctx) => `${ctx.label}: ${fmt(flt(ctx.raw))}`,
								},
							},
						},
					},
				});
			}

			_show_chart_empty(wrapId, canvasId, key) {
				if (this.charts[key]) {
					this.charts[key].destroy();
					delete this.charts[key];
				}
				const $wrap = this.page.main.find(`#${wrapId}`);
				$wrap.find("canvas").hide();
				if (!$wrap.find(".millat-chart-empty").length) {
					$wrap.append(`<div class="millat-chart-empty">${__("No data for selected period")}</div>`);
				}
			}

			_clear_chart_empty(wrapId, canvasId) {
				const $wrap = this.page.main.find(`#${wrapId}`);
				$wrap.find(".millat-chart-empty").remove();
				$wrap.find("canvas").show();
			}

			upsert_chart(key, canvasId, wrapId, config, showEmpty = false) {
				const $wrap = this.page.main.find(`#${wrapId}`);
				const canvas = $wrap.find(`#${canvasId}`)[0];
				if (!canvas || !window.Chart) return;

				if (showEmpty) {
					this._show_chart_empty(wrapId, canvasId, key);
					return;
				}
				this._clear_chart_empty(wrapId, canvasId);

				if (this.charts[key]) {
					this.charts[key].destroy();
				}
				this.charts[key] = new Chart(canvas.getContext("2d"), config);
			}

			_baseOptions(stacked) {
				return {
					responsive: true,
					maintainAspectRatio: false,
					plugins: { legend: { position: "bottom" } },
					scales: {
						y: {
							beginAtZero: true,
							stacked,
							ticks: {
								callback: (v) => (stacked ? v : this.shortNum(v)),
							},
						},
						x: { stacked },
					},
				};
			}

			_donutOptions() {
				return {
					responsive: true,
					maintainAspectRatio: false,
					cutout: "55%",
					plugins: { legend: { position: "bottom" } },
				};
			}

			fmtNum(v) {
				return format_number(flt(v), null, 0);
			}

			fmtCur(v) {
				return format_currency(flt(v), frappe.defaults.get_default("currency"));
			}

			shortNum(v) {
				const n = flt(v);
				if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
				if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
				return this.fmtNum(n);
			}
		};
	}

	loadCharts()
		.then(() => new window.WasaPrintersDashboard(page).make())
		.catch(() => frappe.msgprint(__("Chart.js could not be loaded.")));
};
