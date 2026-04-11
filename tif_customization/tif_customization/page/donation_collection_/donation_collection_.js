frappe.pages["donation-collection-"].on_page_load = function (wrapper) {
	console.log("[DonationCollection] on_page_load fired");
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: "Donation Collection Position",
		single_column: true,
	});

	if (!window.DonationCollectionReport) {
		window.DonationCollectionReport = class DonationCollectionReport {
			constructor(page) {
				this.page = page;
				this.filters = {
					period_type: "half_yearly",
					reference_date: frappe.datetime.get_today(),
					from_date: "",
					to_date: "",
				};
			}

			make() {
				console.log("[DonationCollection] make() start", { filters: this.filters });
				this.set_dates_from_period();
				this.render();
				this.inject_styles();
				this.bind_events();
				this.load_data();
				console.log("[DonationCollection] make() complete", { filters: this.filters });
			}

			render() {
				console.log("[DonationCollection] render() called", { period_type: this.filters.period_type });
				this.page.main.html(`
					<div class="donation-filter-box">
						<div class="row">
							<div class="col-md-3">
								<label>Period Type</label>
								<select id="donation-period-type" class="form-control"></select>
							</div>
							<div class="col-md-3">
								<label>Reference Date</label>
								<input type="date" id="donation-reference-date" class="form-control" value="${this.filters.reference_date}">
							</div>
							<div class="col-md-3">
								<label>From Date</label>
								<input type="date" id="donation-from-date" class="form-control" value="${this.filters.from_date}" readonly>
							</div>
							<div class="col-md-3">
								<label>To Date</label>
								<input type="date" id="donation-to-date" class="form-control" value="${this.filters.to_date}" readonly>
							</div>
						</div>
						<div class="row" style="margin-top: 10px;">
							<div class="col-md-12">
								<button class="btn btn-primary" id="donation-apply-filters">
									<i class="fa fa-filter"></i> Apply
								</button>
								<button class="btn btn-default" id="donation-print">
									<i class="fa fa-print"></i> Print
								</button>
							</div>
						</div>
					</div>
					<div class="donation-report-note">
						Current Period: <strong id="donation-period-label"></strong>
					</div>
					<div class="donation-period-chips" style="margin: 6px 0 10px 0;">
						<button class="btn btn-xs btn-default period-chip" data-period="month">Month</button>
						<button class="btn btn-xs btn-default period-chip" data-period="quarter">Quarter</button>
						<button class="btn btn-xs btn-default period-chip" data-period="half_yearly">Half Yearly</button>
						<button class="btn btn-xs btn-default period-chip" data-period="yearly">Yearly</button>
					</div>
					<div id="donation-report-content"></div>
				`);

				const periodOptions = [
					{ value: "month", label: "Month" },
					{ value: "quarter", label: "Quarter" },
					{ value: "half_yearly", label: "Half Yearly" },
					{ value: "yearly", label: "Yearly" },
				];
				const $period = $("#donation-period-type");
				$period.empty();
				periodOptions.forEach((opt) => {
					$period.append(`<option value="${opt.value}">${opt.label}</option>`);
				});
				$period.val(this.filters.period_type);
				this.render_period_label();
				console.log("[DonationCollection] period dropdown initialized", { selected: $period.val() });
			}

			bind_events() {
				$("#donation-period-type, #donation-reference-date").on("change", () => {
					this.filters.period_type = this.normalize_period_type($("#donation-period-type").val());
					this.filters.reference_date = $("#donation-reference-date").val() || frappe.datetime.get_today();
					console.log("[DonationCollection] filter changed", {
						period_type: this.filters.period_type,
						reference_date: this.filters.reference_date,
					});
					this.set_dates_from_period();
					$("#donation-from-date").val(this.filters.from_date);
					$("#donation-to-date").val(this.filters.to_date);
					this.render_period_label();
					this.sync_period_chips();
				});

				$(".period-chip").on("click", (e) => {
					const period = this.normalize_period_type($(e.currentTarget).data("period"));
					console.log("[DonationCollection] period chip clicked", { period });
					this.filters.period_type = period;
					$("#donation-period-type").val(period);
					this.set_dates_from_period();
					$("#donation-from-date").val(this.filters.from_date);
					$("#donation-to-date").val(this.filters.to_date);
					this.render_period_label();
					this.sync_period_chips();
					this.load_data();
				});

				$("#donation-apply-filters").on("click", () => {
					this.filters.period_type = this.normalize_period_type($("#donation-period-type").val());
					this.filters.reference_date = $("#donation-reference-date").val() || frappe.datetime.get_today();
					this.set_dates_from_period();
					$("#donation-from-date").val(this.filters.from_date);
					$("#donation-to-date").val(this.filters.to_date);
					console.log("[DonationCollection] apply clicked", {
						period_type: this.filters.period_type,
						from_date: this.filters.from_date,
						to_date: this.filters.to_date,
					});
					this.render_period_label();
					this.load_data();
					frappe.show_alert({
						message: `Applied: ${this.pretty_period(this.filters.period_type)} (${this.filters.from_date} to ${this.filters.to_date})`,
						indicator: "green",
					});
				});

				$("#donation-print").on("click", () => window.print());
			}

			render_period_label() {
				console.log("[DonationCollection] render_period_label", {
					period_type: this.filters.period_type,
					from_date: this.filters.from_date,
					to_date: this.filters.to_date,
				});
				$("#donation-period-label").text(
					`${this.pretty_period(this.filters.period_type)} (${this.filters.from_date} to ${this.filters.to_date})`
				);
			}

			sync_period_chips() {
				console.log("[DonationCollection] sync_period_chips", { period_type: this.filters.period_type });
				$(".period-chip").removeClass("btn-primary").addClass("btn-default");
				$(`.period-chip[data-period="${this.filters.period_type}"]`).removeClass("btn-default").addClass("btn-primary");
			}

			pretty_period(periodType) {
				periodType = this.normalize_period_type(periodType);
				const map = {
					month: "Month",
					quarter: "Quarter",
					half_yearly: "Half Yearly",
					yearly: "Yearly",
				};
				return map[periodType] || periodType;
			}

			normalize_period_type(periodType) {
				const value = (periodType || "").toString().trim().toLowerCase();
				if (value === "month" || value === "monthly") return "month";
				if (value === "quarter" || value === "quarterly") return "quarter";
				if (value === "year" || value === "yearly" || value === "annual") return "yearly";
				if (value === "half_yearly" || value === "half-yearly" || value === "half yearly" || value === "halfyearly")
					return "half_yearly";
				return "half_yearly";
			}

			set_dates_from_period() {
				this.filters.period_type = this.normalize_period_type(this.filters.period_type);
				const ref = frappe.datetime.str_to_obj(this.filters.reference_date || frappe.datetime.get_today());
				const year = ref.getFullYear();
				const month = ref.getMonth() + 1;
				let fromDate;
				let toDate;

				if (this.filters.period_type === "month") {
					fromDate = new Date(year, month - 1, 1);
					toDate = new Date(year, month, 0);
				} else if (this.filters.period_type === "quarter") {
					const quarterStartMonth = Math.floor((month - 1) / 3) * 3 + 1;
					fromDate = new Date(year, quarterStartMonth - 1, 1);
					toDate = new Date(year, quarterStartMonth + 2, 0);
				} else if (this.filters.period_type === "yearly") {
					fromDate = new Date(year, 0, 1);
					toDate = new Date(year, 11, 31);
				} else {
					if (month <= 6) {
						fromDate = new Date(year, 0, 1);
						toDate = new Date(year, 5, 30);
					} else {
						fromDate = new Date(year, 6, 1);
						toDate = new Date(year, 11, 31);
					}
				}

				this.filters.from_date = frappe.datetime.obj_to_str(fromDate);
				this.filters.to_date = frappe.datetime.obj_to_str(toDate);
				console.log("[DonationCollection] set_dates_from_period computed", {
					period_type: this.filters.period_type,
					reference_date: this.filters.reference_date,
					from_date: this.filters.from_date,
					to_date: this.filters.to_date,
				});
			}

			load_data() {
				console.log("[DonationCollection] load_data() start", {
					from_date: this.filters.from_date,
					to_date: this.filters.to_date,
				});
				frappe.call({
					method:
						"tif_customization.tif_customization.page.donation_collection_.donation_collection_.get_donation_collection_data",
					args: {
						filters: {
							period_type: this.filters.period_type,
							reference_date: this.filters.reference_date,
							from_date: this.filters.from_date,
							to_date: this.filters.to_date,
						},
					},
					callback: (r) => {
						const message = r.message || {};
						const months = message.months || [];
						const rows = message.rows || [];
						const totals = message.totals || {};
						console.log("[DonationCollection] load_data() success", {
							row_count: rows.length,
							months_count: months.length,
							totals,
						});
						this.render_data_table(months, rows, totals);
					},
					error: (err) => {
						console.error("[DonationCollection] load_data() failed", err);
						$("#donation-report-content").html(
							`<div class="text-danger">Failed to load donation collection data.</div>`
						);
					},
				});
			}

			render_data_table(months, rows, totals) {
				if (!rows.length) {
					$("#donation-report-content").html(
						`<div class="text-muted" style="margin-top:10px;">No donation records found for selected period.</div>`
					);
					return;
				}

				const monthHead = months
					.map((m) => `<th class="text-right">${frappe.utils.escape_html(m.label)}</th>`)
					.join("");
				const periodBandLabel = `${this.pretty_period(this.filters.period_type)} (${this.filters.from_date} to ${this.filters.to_date})`;

				const body = rows
					.map(
						(row) => `
						<tr>
							<td>${frappe.utils.escape_html(row.donor_name || "")}</td>
							<td>${frappe.utils.escape_html(row.donor_id || "-")}</td>
							${months
								.map((m) => `<td class="text-right">${this.format_currency((row.month_values || {})[m.key])}</td>`)
								.join("")}
							<td class="text-right summary-start">${this.format_currency(row.committed_amount)}</td>
							<td class="text-right">${this.format_currency(row.other_collection)}</td>
							<td class="text-right">${this.format_currency(row.zakat_fund)}</td>
							<td class="text-right">${this.format_currency(row.total_collection)}</td>
							<td class="text-right">${this.format_currency(row.balance_amount)}</td>
						</tr>
					`
					)
					.join("");

				$("#donation-report-content").html(`
					<div class="table-responsive" style="margin-top: 10px;">
						<table class="table table-bordered donation-matrix-table">
							<thead>
								<tr>
									<th rowspan="2">Donor</th>
									<th rowspan="2">Donor ID</th>
									<th colspan="${months.length}" class="period-band">${frappe.utils.escape_html(periodBandLabel)}</th>
									<th colspan="5" class="summary-band summary-start">Summary</th>
								</tr>
								<tr>
									${monthHead}
									<th class="text-right">Commitment</th>
									<th class="text-right">Donation/Other Collection</th>
									<th class="text-right">Zakat Fund</th>
									<th class="text-right">Total Received</th>
									<th class="text-right">Balance</th>
								</tr>
							</thead>
							<tbody>
								${body}
								<tr class="grand-total-row">
									<td colspan="2">Grand Total</td>
									${months
										.map((m) => `<td class="text-right">${this.format_currency((totals.month_values || {})[m.key])}</td>`)
										.join("")}
									<td class="text-right summary-start">${this.format_currency(totals.committed_amount)}</td>
									<td class="text-right">${this.format_currency(totals.other_collection)}</td>
									<td class="text-right">${this.format_currency(totals.zakat_fund)}</td>
									<td class="text-right">${this.format_currency(totals.total_collection)}</td>
									<td class="text-right">${this.format_currency(totals.balance_amount)}</td>
								</tr>
							</tbody>
						</table>
					</div>
				`);
			}

			format_currency(v) {
				return format_currency(v || 0, frappe.defaults.get_default("currency"));
			}

			inject_styles() {
				if ($("#donation-matrix-style").length) return;
				$("head").append(`
					<style id="donation-matrix-style">
						.donation-matrix-table thead th {
							font-weight: 700;
							vertical-align: middle;
						}
						.donation-matrix-table thead .period-band {
							background: #cfd6e2;
							text-align: center;
							font-size: 15px;
						}
						.donation-matrix-table thead .summary-band {
							background: #dde5f0;
							text-align: center;
						}
						.donation-matrix-table tbody tr:nth-child(odd) {
							background: #fbfcfe;
						}
						.donation-matrix-table .summary-start {
							border-left: 3px solid #c1c9d6 !important;
						}
						.donation-matrix-table .grand-total-row td {
							font-weight: 700;
							background: #d7deea;
						}
					</style>
				`);
			}
		};
	}

	const report = new window.DonationCollectionReport(page);
	report.make();
	report.sync_period_chips();
	console.log("[DonationCollection] report initialized");
};
