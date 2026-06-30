frappe.pages["dispatch-detail-report"].on_page_load = function (wrapper) {
	const $wrapper = $(wrapper);
	if ($wrapper.find(".ddr-container").length) {
		$wrapper.find(".ddr-container").closest(".layout-main-section").empty();
	}

	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Dispatch Detail Report"),
		single_column: true,
	});

	new window.DispatchDetailReport(page).make();
};

if (typeof window.DispatchDetailReport === "undefined") {
	window.DispatchDetailReport = class DispatchDetailReport {
	constructor(page) {
		this.page = page;
		this.filters = {
			from_date: frappe.datetime.add_days(frappe.datetime.get_today(), -30),
			to_date: frappe.datetime.get_today(),
			customer: "",
			delivery_mode: "",
			courier: "",
			warehouse: "",
			city: "",
		};
		this.data = { rows: [], summary: {} };
		this.filter_options = {};
	}

	make() {
		this.render_layout();
		this.setup_link_fields();
		this.load_filter_options();
		this.bind_events();
		this.load_data();
	}

	render_layout() {
		this.page.main.html(`
			<div class="ddr-container" style="padding:16px;">
				<div class="filter-section" style="background:#f8f9fa;padding:16px;border-radius:8px;margin-bottom:16px;">
					<div class="row">
						<div class="col-md-2"><div id="ddr-from-date"></div></div>
						<div class="col-md-2"><div id="ddr-to-date"></div></div>
						<div class="col-md-2"><div id="ddr-customer"></div></div>
						<div class="col-md-2">
							<label>${__("Delivery Mode")}</label>
							<select id="ddr-delivery-mode" class="form-control"><option value="">${__("All")}</option></select>
						</div>
						<div class="col-md-2">
							<label>${__("Courier")}</label>
							<select id="ddr-courier" class="form-control"><option value="">${__("All")}</option></select>
						</div>
						<div class="col-md-2">
							<label>${__("Warehouse")}</label>
							<select id="ddr-warehouse" class="form-control"><option value="">${__("All")}</option></select>
						</div>
					</div>
					<div class="row" style="margin-top:10px;">
						<div class="col-md-3">
							<label>${__("City")}</label>
							<select id="ddr-city" class="form-control"><option value="">${__("All Cities")}</option></select>
						</div>
						<div class="col-md-9" style="padding-top:24px;">
							<button class="btn btn-primary btn-sm" id="ddr-apply"><i class="fa fa-filter"></i> ${__("Apply")}</button>
							<button class="btn btn-default btn-sm" id="ddr-reset">${__("Reset")}</button>
							<button class="btn btn-success btn-sm pull-right" id="ddr-export"><i class="fa fa-file-excel-o"></i> ${__("Export")}</button>
						</div>
					</div>
				</div>

				<div class="row" id="ddr-kpis" style="margin-bottom:16px;"></div>

				<div class="table-responsive">
					<table class="table table-bordered table-hover" id="ddr-table">
						<thead>
							<tr>
								<th style="width:28px;"></th>
								<th>${__("Delivery Note")}</th>
								<th>${__("Date")}</th>
								<th>${__("Customer")}</th>
								<th>${__("Ship To Address")}</th>
								<th>${__("Warehouse")}</th>
								<th>${__("Mode")}</th>
								<th>${__("Courier")}</th>
								<th class="text-right">${__("Books")}</th>
								<th class="text-right">${__("Courier Payable")}</th>
								<th class="text-right">${__("Customer Amount")}</th>
								<th class="text-right">${__("Amount To Receive")}</th>
							</tr>
						</thead>
						<tbody id="ddr-tbody">
							<tr><td colspan="12" class="text-center text-muted">${__("Loading...")}</td></tr>
						</tbody>
					</table>
				</div>
			</div>
		`);

		this.from_date_control = frappe.ui.form.make_control({
			parent: this.page.main.find("#ddr-from-date"),
			df: { fieldtype: "Date", label: __("From Date"), fieldname: "from_date" },
			render_input: true,
		});
		this.to_date_control = frappe.ui.form.make_control({
			parent: this.page.main.find("#ddr-to-date"),
			df: { fieldtype: "Date", label: __("To Date"), fieldname: "to_date" },
			render_input: true,
		});
		this.from_date_control.set_value(this.filters.from_date);
		this.to_date_control.set_value(this.filters.to_date);
	}

	setup_link_fields() {
		this.customer_control = frappe.ui.form.make_control({
			parent: this.page.main.find("#ddr-customer"),
			df: {
				fieldtype: "Link",
				options: "Customer",
				label: __("Customer"),
				fieldname: "customer",
			},
			render_input: true,
		});
	}

	load_filter_options() {
		frappe.call({
			method:
				"tif_customization.tif_customization.page.dispatch_detail_report.dispatch_detail_report.get_filter_options",
			callback: (r) => {
				if (!r.message) return;
				this.filter_options = r.message;
				this.populate_select("#ddr-delivery-mode", r.message.delivery_modes || []);
				this.populate_select("#ddr-courier", r.message.couriers || []);
				this.populate_select("#ddr-warehouse", r.message.warehouses || []);
				this.populate_select("#ddr-city", r.message.cities || []);
			},
		});
	}

	populate_select(selector, values) {
		const $el = this.page.main.find(selector);
		values.forEach((v) => $el.append(`<option value="${frappe.utils.escape_html(v)}">${frappe.utils.escape_html(v)}</option>`));
	}

	bind_events() {
		this.page.main.find("#ddr-apply").on("click", () => this.apply_filters());
		this.page.main.find("#ddr-reset").on("click", () => this.reset_filters());
		this.page.main.find("#ddr-export").on("click", () => this.export_csv());
		this.page.main.on("click", ".ddr-toggle", (e) => {
			const dn = $(e.currentTarget).data("dn");
			this.page.main.find(`#ddr-detail-${CSS.escape(dn)}`).toggle();
			$(e.currentTarget).find("i").toggleClass("fa-chevron-right fa-chevron-down");
		});
	}

	apply_filters() {
		this.filters.from_date = this.from_date_control.get_value();
		this.filters.to_date = this.to_date_control.get_value();
		this.filters.customer = this.customer_control.get_value() || "";
		this.filters.delivery_mode = this.page.main.find("#ddr-delivery-mode").val() || "";
		this.filters.courier = this.page.main.find("#ddr-courier").val() || "";
		this.filters.warehouse = this.page.main.find("#ddr-warehouse").val() || "";
		this.filters.city = this.page.main.find("#ddr-city").val() || "";
		this.load_data();
	}

	reset_filters() {
		this.filters = {
			from_date: frappe.datetime.add_days(frappe.datetime.get_today(), -30),
			to_date: frappe.datetime.get_today(),
			customer: "",
			delivery_mode: "",
			courier: "",
			warehouse: "",
			city: "",
		};
		this.from_date_control.set_value(this.filters.from_date);
		this.to_date_control.set_value(this.filters.to_date);
		this.customer_control.set_value("");
		this.page.main.find("#ddr-delivery-mode, #ddr-courier, #ddr-warehouse, #ddr-city").val("");
		this.load_data();
	}

	load_data() {
		const $tbody = this.page.main.find("#ddr-tbody");
		$tbody.html(`<tr><td colspan="12" class="text-center text-muted">${__("Loading...")}</td></tr>`);

		frappe.call({
			method:
				"tif_customization.tif_customization.page.dispatch_detail_report.dispatch_detail_report.get_dispatch_detail_data",
			args: { filters: this.filters },
			freeze: true,
			freeze_message: __("Loading dispatch details..."),
			callback: (r) => {
				if (r.message?.error) {
					frappe.msgprint({ title: __("Error"), message: r.message.error, indicator: "red" });
					return;
				}
				this.data = r.message || { rows: [], summary: {} };
				this.render_kpis();
				this.render_table();
			},
		});
	}

	render_kpis() {
		const s = this.data.summary || {};
		const cards = [
			{ label: __("Delivery Notes"), value: s.total_delivery_notes || 0, color: "#0F62FE" },
			{ label: __("Total Books"), value: this.fmt_num(s.total_books), color: "#198038" },
			{ label: __("Courier Payable"), value: this.fmt_currency(s.total_courier_payable), color: "#DA1E28" },
			{ label: __("Customer Amount"), value: this.fmt_currency(s.total_customer_amount), color: "#8A3FFC" },
			{ label: __("Amount To Receive"), value: this.fmt_currency(s.total_amount_to_receive), color: "#FF832B" },
		];

		this.page.main.find("#ddr-kpis").html(
			cards
				.map(
					(c) => `
				<div class="col-md-2 col-sm-4 col-xs-6" style="margin-bottom:8px;">
					<div style="background:#fff;border-left:4px solid ${c.color};padding:12px 14px;border-radius:6px;box-shadow:0 1px 3px rgba(0,0,0,.08);">
						<div style="font-size:11px;color:#666;text-transform:uppercase;">${c.label}</div>
						<div style="font-size:20px;font-weight:600;margin-top:4px;">${c.value}</div>
					</div>
				</div>`
				)
				.join("")
		);
	}

	render_table() {
		const rows = this.data.rows || [];
		const $tbody = this.page.main.find("#ddr-tbody");

		if (!rows.length) {
			$tbody.html(`<tr><td colspan="12" class="text-center text-muted">${__("No records found")}</td></tr>`);
			return;
		}

		$tbody.empty();
		rows.forEach((row) => {
			const dn = row.delivery_note_no;
			const dn_link = `<a href="/app/delivery-note/${encodeURIComponent(dn)}">${frappe.utils.escape_html(dn)}</a>`;

			$tbody.append(`
				<tr class="ddr-main-row">
					<td><button class="btn btn-xs btn-default ddr-toggle" data-dn="${frappe.utils.escape_html(dn)}"><i class="fa fa-chevron-right"></i></button></td>
					<td>${dn_link}</td>
					<td>${frappe.datetime.str_to_user(row.posting_date)}</td>
					<td>${frappe.utils.escape_html(row.customer_name || "")}</td>
					<td style="max-width:220px;white-space:normal;font-size:12px;">${frappe.utils.escape_html(row.shipping_address || "")}</td>
					<td style="font-size:12px;">${frappe.utils.escape_html(row.warehouses_label || "")}</td>
					<td>${frappe.utils.escape_html(row.delivery_mode || "")}</td>
					<td style="font-size:12px;">${frappe.utils.escape_html([row.courier, row.courier_service].filter(Boolean).join(" / "))}</td>
					<td class="text-right">${this.fmt_num(row.total_books)}</td>
					<td class="text-right">${this.fmt_currency(row.courier_payable)}</td>
					<td class="text-right">${this.fmt_currency(row.customer_amount)}</td>
					<td class="text-right"><strong>${this.fmt_currency(row.amount_to_receive)}</strong></td>
				</tr>
				<tr id="ddr-detail-${frappe.utils.escape_html(dn)}" style="display:none;">
					<td colspan="12" style="background:#fafbfc;padding:0;">
						${this.render_item_drilldown(row)}
					</td>
				</tr>
			`);
		});
	}

	render_item_drilldown(row) {
		const items = row.items || [];
		if (!items.length) {
			return `<div style="padding:12px;" class="text-muted">${__("No book lines")}</div>`;
		}

		const item_rows = items
			.map(
				(it) => `
			<tr>
				<td>${frappe.utils.escape_html(it.item_code || "")}</td>
				<td>${frappe.utils.escape_html(it.item_name || "")}</td>
				<td><span class="label label-default">${frappe.utils.escape_html(it.book_type || "")}</span></td>
				<td>${frappe.utils.escape_html(it.warehouse || "")}</td>
				<td class="text-right">${this.fmt_num(it.qty)}</td>
				<td class="text-right">${this.fmt_num(it.custom_cartons)}</td>
				<td class="text-right">${this.fmt_currency(it.rate)}</td>
				<td class="text-right">${this.fmt_currency(it.amount)}</td>
			</tr>`
			)
			.join("");

		const meta = [
			row.city && `${__("City")}: ${row.city}`,
			row.area && `${__("Area")}: ${row.area}`,
			row.province && `${__("Province")}: ${row.province}`,
			row.courier_mode_of_payment && `${__("Courier Payment")}: ${row.courier_mode_of_payment}`,
			row.invoiced_outstanding > 0 && `${__("Invoiced Outstanding")}: ${this.fmt_currency(row.invoiced_outstanding)}`,
		]
			.filter(Boolean)
			.join(" · ");

		return `
			<div style="padding:12px 16px;">
				<div style="font-size:12px;color:#555;margin-bottom:8px;">${frappe.utils.escape_html(meta)}</div>
				<table class="table table-condensed table-bordered" style="margin:0;background:#fff;">
					<thead>
						<tr style="background:#eef2f6;">
							<th>${__("Item Code")}</th>
							<th>${__("Book / Item")}</th>
							<th>${__("Type")}</th>
							<th>${__("Warehouse")}</th>
							<th class="text-right">${__("Qty")}</th>
							<th class="text-right">${__("Cartons")}</th>
							<th class="text-right">${__("Rate")}</th>
							<th class="text-right">${__("Amount")}</th>
						</tr>
					</thead>
					<tbody>${item_rows}</tbody>
				</table>
			</div>`;
	}

	export_csv() {
		const rows = this.data.rows || [];
		if (!rows.length) {
			frappe.msgprint(__("No data to export"));
			return;
		}

		const lines = [
			[
				"Delivery Note",
				"Date",
				"Customer",
				"Address",
				"City",
				"Area",
				"Warehouse",
				"Delivery Mode",
				"Courier",
				"Item Code",
				"Item Name",
				"Book Type",
				"Item Warehouse",
				"Qty",
				"Cartons",
				"Rate",
				"Amount",
				"Courier Payable",
				"Customer Amount",
				"Amount To Receive",
			].join(","),
		];

		rows.forEach((row) => {
			(row.items || [{}]).forEach((it) => {
				lines.push(
					[
						row.delivery_note_no,
						row.posting_date,
						this.csv_cell(row.customer_name),
						this.csv_cell(row.shipping_address),
						this.csv_cell(row.city),
						this.csv_cell(row.area),
						this.csv_cell(row.warehouses_label),
						this.csv_cell(row.delivery_mode),
						this.csv_cell(row.courier),
						this.csv_cell(it.item_code),
						this.csv_cell(it.item_name),
						this.csv_cell(it.book_type),
						this.csv_cell(it.warehouse),
						it.qty || 0,
						it.custom_cartons || 0,
						it.rate || 0,
						it.amount || 0,
						row.courier_payable || 0,
						row.customer_amount || 0,
						row.amount_to_receive || 0,
					].join(",")
				);
			});
		});

		const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `dispatch-detail-${frappe.datetime.get_today()}.csv`;
		a.click();
		URL.revokeObjectURL(url);
	}

	csv_cell(val) {
		const s = String(val == null ? "" : val).replace(/"/g, '""');
		return `"${s}"`;
	}

	fmt_currency(val) {
		return format_currency(flt(val), frappe.defaults.get_default("currency"));
	}

	fmt_num(val) {
		return format_number(flt(val), null, 0);
	}
	};
}
