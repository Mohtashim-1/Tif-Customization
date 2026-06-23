frappe.pages["donor-receipt-report"].on_page_load = function (wrapper) {
	frappe.require("/assets/tif_customization/css/donor_receipt_report.css");

	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Donor Receipt Report"),
		single_column: true,
	});

	if (!window.DonorReceiptReport) {
		window.DonorReceiptReport = class DonorReceiptReport {
			constructor(page) {
				this.page = page;
				this.to_date = frappe.datetime.get_today();
				this.from_date = this.get_fiscal_year_start(this.to_date);
				this.active_month = null;
				this.data = null;
			}

			get_fiscal_year_start(ref_date) {
				const dt = frappe.datetime.str_to_obj(ref_date || frappe.datetime.get_today());
				const year = dt.getMonth() >= 6 ? dt.getFullYear() : dt.getFullYear() - 1;
				return `${year}-07-01`;
			}

			make() {
				this.render_layout();
				this.bind_events();
				this.load_summary();
			}

			render_layout() {
				this.page.main.html(`
					<div class="donor-receipt-root">
						<div class="donor-receipt-hero">
							<h1 class="donor-receipt-hero__title">${__("Donor Receipt Report")}</h1>
							<p class="donor-receipt-hero__sub">${__(
								"Month-wise donation summary with drill-down to individual receipts and PDF download."
							)}</p>
						</div>

						<div class="donor-receipt-toolbar">
							<div>
								<label>${__("From Date")}</label>
								<input type="date" class="form-control input-from-date" value="${this.from_date}" />
							</div>
							<div>
								<label>${__("To Date")}</label>
								<input type="date" class="form-control input-to-date" value="${this.to_date}" />
							</div>
							<div>
								<button class="btn btn-primary btn-sm btn-apply">${__("Apply")}</button>
								<button class="btn btn-default btn-sm btn-fy">${__("Current FY")}</button>
							</div>
						</div>

						<div class="donor-receipt-kpis" id="donor-receipt-kpis"></div>

						<div class="donor-receipt-panel">
							<h3 class="donor-receipt-panel__title">${__("Month-wise Donations")}</h3>
							<div id="donor-receipt-months"></div>
							<div id="donor-receipt-drilldown" class="donor-receipt-drilldown" style="display:none;"></div>
						</div>
					</div>
				`);
			}

			bind_events() {
				const me = this;
				this.page.main.find(".btn-apply").on("click", () => me.apply_filters());
				this.page.main.find(".btn-fy").on("click", () => {
					me.to_date = frappe.datetime.get_today();
					me.from_date = me.get_fiscal_year_start(me.to_date);
					me.page.main.find(".input-from-date").val(me.from_date);
					me.page.main.find(".input-to-date").val(me.to_date);
					me.apply_filters();
				});
			}

			apply_filters() {
				this.from_date = this.page.main.find(".input-from-date").val();
				this.to_date = this.page.main.find(".input-to-date").val();
				if (!this.from_date || !this.to_date) {
					frappe.msgprint(__("Please select both From Date and To Date"));
					return;
				}
				if (this.from_date > this.to_date) {
					frappe.msgprint(__("From Date cannot be after To Date"));
					return;
				}
				this.active_month = null;
				this.page.main.find("#donor-receipt-drilldown").hide().empty();
				this.load_summary();
			}

			load_summary() {
				this.page.set_indicator(__("Loading…"), "blue");
				frappe.call({
					method:
						"tif_customization.tif_customization.page.donor_receipt_report.donor_receipt_report.get_month_wise_summary",
					args: {
						from_date: this.from_date,
						to_date: this.to_date,
					},
					callback: (r) => {
						this.data = r.message || {};
						this.render_kpis();
						this.render_months();
					},
					always: () => {
						if (this.page.clear_indicator) this.page.clear_indicator();
					},
				});
			}

			render_kpis() {
				const totals = this.data.totals || {};
				const cards = [
					{ label: __("Total Receipts"), value: this.fmtNum(totals.donation_count) },
					{ label: __("Total Amount"), value: this.fmtCur(totals.total_amount) },
					{ label: __("Months"), value: this.fmtNum((this.data.months || []).length) },
				];
				this.page.main.find("#donor-receipt-kpis").html(
					cards
						.map(
							(c) => `
						<div class="donor-receipt-kpi">
							<div class="donor-receipt-kpi__label">${c.label}</div>
							<div class="donor-receipt-kpi__value">${c.value}</div>
						</div>`
						)
						.join("")
				);
			}

			render_months() {
				const months = this.data.months || [];
				const $el = this.page.main.find("#donor-receipt-months");
				if (!months.length) {
					$el.html(`<div class="donor-receipt-empty">${__("No donations for selected period")}</div>`);
					return;
				}

				const rows = months
					.map(
						(m) => `
					<tr class="donor-receipt-month-row" data-month-key="${frappe.utils.escape_html(m.month_key)}">
						<td>${frappe.utils.escape_html(m.month_label)}</td>
						<td class="text-right">${this.fmtNum(m.donation_count)}</td>
						<td class="text-right">${this.fmtCur(m.total_amount)}</td>
						<td><span class="donor-receipt-link">${__("View details")}</span></td>
					</tr>`
					)
					.join("");

				const totals = this.data.totals || {};
				$el.html(`
					<table class="donor-receipt-table">
						<thead>
							<tr>
								<th>${__("Month")}</th>
								<th class="text-right">${__("Receipts")}</th>
								<th class="text-right">${__("Amount")}</th>
								<th>${__("Action")}</th>
							</tr>
						</thead>
						<tbody>
							${rows}
							<tr class="donor-receipt-grand">
								<td>${__("Total")}</td>
								<td class="text-right">${this.fmtNum(totals.donation_count)}</td>
								<td class="text-right">${this.fmtCur(totals.total_amount)}</td>
								<td></td>
							</tr>
						</tbody>
					</table>
				`);

				const me = this;
				$el.find(".donor-receipt-month-row").on("click", function () {
					const monthKey = this.getAttribute("data-month-key");
					me.load_month_drilldown(monthKey, this);
				});
			}

			load_month_drilldown(month_key, rowEl) {
				this.active_month = month_key;
				this.page.main.find(".donor-receipt-month-row").removeClass("is-active");
				$(rowEl).addClass("is-active");

				const $drill = this.page.main.find("#donor-receipt-drilldown");
				$drill.show().html(`<div class="donor-receipt-empty">${__("Loading…")}</div>`);

				frappe.call({
					method:
						"tif_customization.tif_customization.page.donor_receipt_report.donor_receipt_report.get_month_donations",
					args: {
						month_key,
						from_date: this.from_date,
						to_date: this.to_date,
					},
					callback: (r) => {
						this.render_drilldown(month_key, r.message || []);
					},
				});
			}

			render_drilldown(month_key, donations) {
				const month = (this.data.months || []).find((m) => m.month_key === month_key);
				const title = month ? month.month_label : month_key;
				const $drill = this.page.main.find("#donor-receipt-drilldown");

				if (!donations.length) {
					$drill.html(`<div class="donor-receipt-empty">${__("No donations found")}</div>`);
					return;
				}

				const rows = donations
					.map((d) => {
						const name = frappe.utils.escape_html(d.name || "");
						return `
						<tr>
							<td><span class="donor-receipt-link btn-open-donation" data-name="${name}">${name}</span></td>
							<td>${frappe.utils.escape_html(frappe.datetime.str_to_user(d.donation_date) || "")}</td>
							<td>${frappe.utils.escape_html(d.donor_name || "")}</td>
							<td>${frappe.utils.escape_html(d.donation_type || "")}</td>
							<td class="text-right">${this.fmtCur(d.received_amount, d.currency)}</td>
							<td>${frappe.utils.escape_html(d.payment_method || "")}</td>
							<td>
								<button class="btn btn-xs btn-default btn-download-pdf" data-name="${name}">
									<i class="fa fa-download"></i> ${__("PDF")}
								</button>
							</td>
						</tr>`;
					})
					.join("");

				$drill.html(`
					<h4 style="margin:0 0 10px;">${__("Donations for")} ${frappe.utils.escape_html(title)}</h4>
					<div style="overflow:auto; max-height:420px;">
						<table class="donor-receipt-table">
							<thead>
								<tr>
									<th>${__("Receipt No")}</th>
									<th>${__("Date")}</th>
									<th>${__("Donor")}</th>
									<th>${__("Type")}</th>
									<th class="text-right">${__("Amount")}</th>
									<th>${__("Payment")}</th>
									<th>${__("Receipt")}</th>
								</tr>
							</thead>
							<tbody>${rows}</tbody>
						</table>
					</div>
				`);

				const me = this;
				$drill.find(".btn-open-donation").on("click", function (e) {
					e.stopPropagation();
					frappe.set_route("Form", "Donation", this.getAttribute("data-name"));
				});
				$drill.find(".btn-download-pdf").on("click", function (e) {
					e.stopPropagation();
					me.download_receipt_pdf(this.getAttribute("data-name"));
				});
			}

			download_receipt_pdf(name) {
				if (!name) return;
				const params = new URLSearchParams({
					doctype: "Donation",
					name,
					format: "Donation Receipt",
				});
				const url = frappe.urllib.get_full_url(
					`/api/method/frappe.utils.print_format.download_pdf?${params.toString()}`
				);
				window.open(url, "_blank");
			}

			fmtNum(v) {
				return format_number(flt(v), null, 0);
			}

			fmtCur(v, currency) {
				return format_currency(flt(v), currency || frappe.defaults.get_default("currency"));
			}
		};
	}

	new window.DonorReceiptReport(page).make();
};
