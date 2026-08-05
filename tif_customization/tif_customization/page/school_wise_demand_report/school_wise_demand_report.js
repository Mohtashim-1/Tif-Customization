frappe.pages["school-wise-demand-report"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("School Wise Demand Report"),
		single_column: true,
	});
	new frappe.tif_customization.SchoolWiseDemandReport(page).make();
};

frappe.tif_customization = frappe.tif_customization || {};

frappe.tif_customization.SchoolWiseDemandReport = class SchoolWiseDemandReport {
	constructor(page) {
		this.page = page;
		this.rows = [];
		this.summary = {};
		this._load_timer = null;
	}

	make() {
		this.make_layout();
		this.make_filters();
		this.page.set_primary_action(__("Refresh"), () => this.load_data(), "refresh");
		this.page.add_action_item(__("Export CSV"), () => this.export_csv());
		this.page.add_action_item(__("Print"), () => this.print_report());
		this.load_data();
	}

	make_layout() {
		$(this.page.body).html(`
			<div style="padding:16px;">
				<style>
					.swdr-kpis{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:16px;align-items:stretch}
					.swdr-kpi-col{flex:1 1 150px;min-width:140px;max-width:100%;display:flex}
					.swdr-kpi{
						position:relative;overflow:hidden;
						padding:14px 16px;border-radius:10px;
						border:1px solid var(--border-color,#e5e7eb);
						width:100%;
						min-height:108px;
						height:100%;
						display:flex;flex-direction:column;justify-content:space-between;
						box-sizing:border-box;
					}
					.swdr-kpi::before{
						content:"";position:absolute;inset:0 0 auto 0;height:4px;
						background:var(--swdr-accent, transparent);
					}
					.swdr-kpi .label{font-size:12px;margin:0 0 6px;line-height:1.3;color:var(--swdr-muted, var(--text-muted,#6b7280))}
					.swdr-kpi .value{font-size:22px;font-weight:700;line-height:1.2;color:var(--swdr-value, var(--text-color,#111827))}
					.swdr-kpi .hint{font-size:11px;margin-top:auto;padding-top:6px;line-height:1.3;color:var(--swdr-muted, var(--text-muted,#6b7280))}
					.swdr-kpi--schools{--swdr-accent:#1e40af;--swdr-value:#fff;--swdr-muted:#dbeafe;background:linear-gradient(135deg,#1d4ed8 0%,#1e3a8a 100%);border-color:#1e40af;box-shadow:0 6px 16px rgba(30,64,175,.18)}
					.swdr-kpi--orders{--swdr-accent:#0f766e;--swdr-value:#fff;--swdr-muted:#ccfbf1;background:linear-gradient(135deg,#0d9488 0%,#115e59 100%);border-color:#0f766e;box-shadow:0 6px 16px rgba(15,118,110,.18)}
					.swdr-kpi--pending{--swdr-accent:#ea580c;--swdr-value:#c2410c;--swdr-muted:#7c2d12;background:linear-gradient(135deg,#fff7ed 0%,#ffedd5 100%);border-color:#fed7aa}
					.swdr-kpi--mqh{--swdr-accent:#7c3aed;--swdr-value:#6d28d9;--swdr-muted:#4c1d95;background:linear-gradient(135deg,#f5f3ff 0%,#ede9fe 100%);border-color:#ddd6fe}
					.swdr-kpi--qaida{--swdr-accent:#059669;--swdr-value:#047857;--swdr-muted:#064e3b;background:linear-gradient(135deg,#ecfdf5 0%,#d1fae5 100%);border-color:#a7f3d0}
					.swdr-kpi--guide{--swdr-accent:#dc2626;--swdr-value:#b91c1c;--swdr-muted:#7f1d1d;background:linear-gradient(135deg,#fef2f2 0%,#fee2e2 100%);border-color:#fecaca}
					.swdr-note{font-size:12px;color:var(--text-muted,#6b7280);margin:0 0 12px}
					.swdr-table-wrap{overflow:auto;border:1px solid var(--border-color,#e5e7eb);border-radius:8px;background:#fff}
					.swdr-table{width:100%;border-collapse:collapse;font-size:13px}
					.swdr-table th{background:var(--control-bg,#f4f5f6);text-align:left;padding:10px 12px;border-bottom:1px solid var(--border-color,#e5e7eb);white-space:nowrap}
					.swdr-table td{padding:9px 12px;border-bottom:1px solid var(--border-color,#eee);vertical-align:top}
					.swdr-table tr:hover td{background:#fafafa}
					.swdr-num{text-align:right;font-variant-numeric:tabular-nums}
					.swdr-muted{color:var(--text-muted,#6b7280)}
					.swdr-pending{color:#b45309;font-weight:600}
				</style>
				<p class="swdr-note">
					Demand = open Sales Orders not fully delivered (book items only).
					Pending qty = Ordered − Delivered. Use School Name to filter by customer / school.
				</p>
				<div id="swdr-filters" class="row" style="margin-bottom:12px;"></div>
				<div id="swdr-kpis" class="swdr-kpis"></div>
				<div id="swdr-table" class="swdr-table-wrap"></div>
			</div>
		`);
	}

	make_filters() {
		this.from_date = this.make_filter({
			label: __("Order From Date"),
			fieldtype: "Date",
			fieldname: "from_date",
		});
		this.to_date = this.make_filter({
			label: __("Order To Date"),
			fieldtype: "Date",
			fieldname: "to_date",
		});
		this.customer = this.make_filter({
			label: __("School Name"),
			fieldtype: "Link",
			fieldname: "customer",
			options: "Customer",
		});
		this.school_name = this.make_filter({
			label: __("School Name Contains"),
			fieldtype: "Data",
			fieldname: "school_name",
		});
		this.school = this.make_filter({
			label: __("School (Master)"),
			fieldtype: "Link",
			fieldname: "school",
			options: "School",
		});
		this.city = this.make_filter({
			label: __("City"),
			fieldtype: "Link",
			fieldname: "city",
			options: "City",
		});
		this.province = this.make_filter({
			label: __("Province"),
			fieldtype: "Data",
			fieldname: "province",
		});
		this.area = this.make_filter({
			label: __("Area"),
			fieldtype: "Data",
			fieldname: "area",
		});
		this.school_status = this.make_filter({
			label: __("School Status"),
			fieldtype: "Select",
			fieldname: "school_status",
			options:
				"\nActive\nInactive\nIn Process\nClosed\nNot Interested\nDirect Requirement Received",
		});
		this.book_type = this.make_filter({
			label: __("Book Type"),
			fieldtype: "Select",
			fieldname: "book_type",
			options: "\nMQH\nQaida\nGuide",
		});
	}

	make_filter(df) {
		const wrap = $(`<div class="col-md-3 col-sm-6" style="margin-bottom:8px;"></div>`).appendTo(
			$(this.page.body).find("#swdr-filters")
		);
		const control = frappe.ui.form.make_control({
			df: Object.assign({}, df, {
				change: () => this.schedule_load(),
			}),
			parent: wrap,
			render_input: true,
		});
		control.refresh();
		if (df.default != null) {
			control.set_value(df.default);
		}
		control.$input?.on("awesomplete-selectcomplete", () => this.schedule_load());
		control.$input?.on("keydown", (e) => {
			if (e.which === 13) this.schedule_load();
		});
		return control;
	}

	schedule_load() {
		clearTimeout(this._load_timer);
		this._load_timer = setTimeout(() => this.load_data(), 250);
	}

	get_filters() {
		return {
			from_date: this.from_date.get_value(),
			to_date: this.to_date.get_value(),
			customer: this.customer.get_value(),
			school_name: this.school_name.get_value(),
			school: this.school.get_value(),
			city: this.city.get_value(),
			province: this.province.get_value(),
			area: this.area.get_value(),
			school_status: this.school_status.get_value(),
			book_type: this.book_type.get_value(),
		};
	}

	async load_data() {
		$(this.page.body).find("#swdr-table").html(`<div class="swdr-muted" style="padding:16px;">Loading…</div>`);
		const r = await frappe.call({
			method:
				"tif_customization.tif_customization.page.school_wise_demand_report.school_wise_demand_report.get_report_data",
			args: { filters: this.get_filters() },
		});
		this.rows = r.message?.rows || [];
		this.summary = r.message?.summary || {};
		this.render_kpis();
		this.render_table();
	}

	render_kpis() {
		const s = this.summary;
		const cards = [
			{ label: __("Schools"), value: s.schools || 0, cls: "swdr-kpi--schools", hint: __("With open demand") },
			{ label: __("Open Sales Orders"), value: s.sales_orders || 0, cls: "swdr-kpi--orders", hint: __("Not fully delivered") },
			{ label: __("Total Pending"), value: s.total_pending || 0, cls: "swdr-kpi--pending", hint: __("Books still due") },
			{ label: __("MQH Pending"), value: s.mqh_pending || 0, cls: "swdr-kpi--mqh", hint: __("MQH demand") },
			{ label: __("Qaida Pending"), value: s.qaida_pending || 0, cls: "swdr-kpi--qaida", hint: __("Qaida demand") },
			{ label: __("Guide Pending"), value: s.guide_pending || 0, cls: "swdr-kpi--guide", hint: __("Guide demand") },
		];
		$(this.page.body)
			.find("#swdr-kpis")
			.html(
				cards
					.map(
						(c) => `
					<div class="swdr-kpi-col">
						<div class="swdr-kpi ${c.cls}">
							<div class="label">${frappe.utils.escape_html(c.label)}</div>
							<div class="value">${frappe.format(c.value, { fieldtype: "Float", precision: 0 })}</div>
							<div class="hint">${frappe.utils.escape_html(c.hint || "")}</div>
						</div>
					</div>`
					)
					.join("")
			);
	}

	columns() {
		return [
			{ key: "school_name", label: __("School") },
			{ key: "school_status", label: __("Status") },
			{ key: "city", label: __("City") },
			{ key: "province", label: __("Province") },
			{ key: "area", label: __("Area") },
			{ key: "sales_orders", label: __("Open SOs"), num: true },
			{ key: "total_ordered", label: __("Ordered"), num: true },
			{ key: "total_delivered", label: __("Delivered"), num: true },
			{ key: "total_pending", label: __("Pending"), num: true, pending: true },
			{ key: "mqh_pending", label: __("MQH Pend"), num: true, pending: true },
			{ key: "qaida_pending", label: __("Qaida Pend"), num: true, pending: true },
			{ key: "guide_pending", label: __("Guide Pend"), num: true, pending: true },
			{ key: "other_pending", label: __("Other Pend"), num: true, pending: true },
			{ key: "last_order_date", label: __("Last Order") },
			{ key: "earliest_delivery_date", label: __("Earliest Delivery") },
		];
	}

	render_table() {
		const cols = this.columns();
		if (!this.rows.length) {
			$(this.page.body)
				.find("#swdr-table")
				.html(`<div class="swdr-muted" style="padding:16px;">No open school demand for selected filters.</div>`);
			return;
		}
		const head = cols
			.map((c) => `<th class="${c.num ? "swdr-num" : ""}">${frappe.utils.escape_html(c.label)}</th>`)
			.join("");
		const body = this.rows
			.map((row) => {
				const cells = cols
					.map((c) => {
						let val = row[c.key];
						let cls = c.num ? "swdr-num" : "";
						if (c.num) {
							const num = Number(val || 0);
							val = frappe.format(num, { fieldtype: "Float", precision: 0 });
							if (c.pending && num > 0) cls += " swdr-pending";
						} else if ((c.key === "last_order_date" || c.key === "earliest_delivery_date") && val) {
							val = frappe.datetime.str_to_user(val);
						} else {
							val = frappe.utils.escape_html(val || "");
						}
						return `<td class="${cls}">${val}</td>`;
					})
					.join("");
				return `<tr>${cells}</tr>`;
			})
			.join("");
		$(this.page.body).find("#swdr-table").html(`
			<table class="swdr-table">
				<thead><tr>${head}</tr></thead>
				<tbody>${body}</tbody>
			</table>
		`);
	}

	export_csv() {
		if (!this.rows.length) {
			frappe.msgprint(__("No data to export"));
			return;
		}
		const cols = this.columns();
		const lines = [cols.map((c) => c.label).join(",")];
		this.rows.forEach((row) => {
			lines.push(
				cols
					.map((c) => {
						const v = row[c.key] == null ? "" : String(row[c.key]);
						return `"${v.replace(/"/g, '""')}"`;
					})
					.join(",")
			);
		});
		const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
		const a = document.createElement("a");
		a.href = URL.createObjectURL(blob);
		a.download = `school_wise_demand_report_${frappe.datetime.get_today()}.csv`;
		a.click();
	}

	print_report() {
		const html = $(this.page.body).find("#swdr-table").html();
		const w = window.open("", "_blank");
		w.document.write(`
			<html><head><title>School Wise Demand Report</title>
			<style>
				body{font-family:sans-serif;padding:16px}
				table{width:100%;border-collapse:collapse;font-size:12px}
				th,td{border:1px solid #ddd;padding:6px 8px}
				th{background:#f4f5f6;text-align:left}
				.swdr-num{text-align:right}
			</style></head><body>
			<h2>School Wise Demand Report</h2>
			${html}
			</body></html>
		`);
		w.document.close();
		w.focus();
		w.print();
	}
};
