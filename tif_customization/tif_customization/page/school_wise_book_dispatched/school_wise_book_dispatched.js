frappe.pages["school-wise-book-dispatched"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("City Wise Dispatched Report"),
		single_column: true,
	});
	new frappe.tif_customization.SchoolWiseBookDispatched(page).make();
};

frappe.tif_customization = frappe.tif_customization || {};

frappe.tif_customization.SchoolWiseBookDispatched = class SchoolWiseBookDispatched {
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
			<div class="swbd-page">
				<style>
					.swbd-page{padding:8px 4px 24px;max-width:100%}
					.swbd-filters{
						background:var(--fg-color,#fff);
						border:1px solid var(--border-color,#e5e7eb);
						border-radius:10px;
						padding:14px 16px 6px;
						margin-bottom:16px;
					}
					.swbd-filters .swbd-filter-title{
						font-size:12px;font-weight:600;letter-spacing:.02em;text-transform:uppercase;
						color:var(--text-muted,#6b7280);margin:0 0 10px;
					}
					.swbd-filters .form-group{margin-bottom:12px}
					.swbd-filters .help-box,.swbd-filters .help-box small,.swbd-filters .description{
						display:none !important;
					}
					.swbd-kpis{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:12px;margin-bottom:16px}
					@media (max-width:1500px){.swbd-kpis{grid-template-columns:repeat(4,minmax(0,1fr))}}
					@media (max-width:900px){.swbd-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}}
					@media (max-width:720px){.swbd-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}
					.swbd-kpi{
						position:relative;overflow:hidden;
						padding:14px 14px 12px;
						border-radius:10px;
						border:1px solid var(--border-color,#e5e7eb);
						background:#fff;
						min-height:104px;
						display:flex;flex-direction:column;gap:6px;
						box-sizing:border-box;
						box-shadow:0 1px 2px rgba(15,23,42,.04);
					}
					.swbd-kpi::before{
						content:"";position:absolute;inset:0 auto 0 0;width:4px;
						background:var(--swbd-accent,#64748b);
					}
					.swbd-kpi .label{
						font-size:11px;font-weight:600;letter-spacing:.03em;text-transform:uppercase;
						margin:0;line-height:1.3;color:var(--text-muted,#64748b);
					}
					.swbd-kpi .value{
						font-size:26px;font-weight:700;line-height:1.1;
						color:var(--text-color,#0f172a);font-variant-numeric:tabular-nums;
					}
					.swbd-kpi .hint{font-size:11px;margin-top:auto;line-height:1.3;color:var(--text-muted,#94a3b8)}
					.swbd-kpi-split{
						display:flex;flex-wrap:wrap;gap:6px;margin-top:2px;
					}
					.swbd-pill{
						display:inline-flex;align-items:center;gap:5px;
						padding:3px 8px;border-radius:999px;font-size:11px;font-weight:600;
						background:#f1f5f9;color:#334155;border:1px solid #e2e8f0;
						white-space:nowrap;
					}
					.swbd-pill em{font-style:normal;font-weight:700;color:#0f172a}
					.swbd-pill--school{background:#eff6ff;border-color:#bfdbfe;color:#1e40af}
					.swbd-pill--school em{color:#1d4ed8}
					.swbd-pill--individual{background:#f0fdf4;border-color:#bbf7d0;color:#166534}
					.swbd-pill--individual em{color:#15803d}
					.swbd-kpi--schools{--swbd-accent:#2563eb}
					.swbd-kpi--total{--swbd-accent:#0f766e}
					.swbd-kpi--mqh{--swbd-accent:#7c3aed}
					.swbd-kpi--qaida{--swbd-accent:#059669}
					.swbd-kpi--guide{--swbd-accent:#ea580c}
					.swbd-kpi--kpk{--swbd-accent:#b45309}
					.swbd-kpi--bal{--swbd-accent:#0e7490}
					.swbd-kpi--dns{--swbd-accent:#0891b2}
					.swbd-kpi.is-clickable{cursor:pointer;transition:transform .12s ease,box-shadow .12s ease}
					.swbd-kpi.is-clickable:hover{transform:translateY(-1px);box-shadow:0 4px 12px rgba(15,23,42,.1)}
					.swbd-table-wrap{
						overflow:auto;max-height:calc(100vh - 340px);
						border:1px solid var(--border-color,#e5e7eb);border-radius:10px;background:#fff;
						box-shadow:0 1px 2px rgba(15,23,42,.04);
					}
					.swbd-table{width:100%;border-collapse:separate;border-spacing:0;font-size:12.5px}
					.swbd-table thead th{
						position:sticky;top:0;z-index:1;
						background:#f8fafc;text-align:left;padding:10px 12px;
						border-bottom:1px solid #e2e8f0;white-space:nowrap;
						font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.02em;color:#64748b;
					}
					.swbd-table td{padding:9px 12px;border-bottom:1px solid #f1f5f9;vertical-align:middle;color:#0f172a}
					.swbd-table tbody tr:hover td{background:#f8fafc}
					.swbd-table a{color:#2563eb;text-decoration:none;font-weight:500}
					.swbd-table a:hover{text-decoration:underline}
					.swbd-table tr.swbd-row:hover td{background:#eff6ff}
					.swbd-num-link{font-weight:700}
					.swbd-num{text-align:right;font-variant-numeric:tabular-nums}
					.swbd-muted{color:var(--text-muted,#64748b)}
					.swbd-type{
						display:inline-block;padding:2px 8px;border-radius:999px;
						font-size:11px;font-weight:600;line-height:1.4;
					}
					.swbd-type--school{background:#eff6ff;color:#1d4ed8}
					.swbd-type--individual{background:#f0fdf4;color:#15803d}
					.swbd-type--other{background:#f1f5f9;color:#475569}
					.swbd-empty{padding:28px 16px;text-align:center}
				</style>
				<div class="swbd-filters">
					<div class="swbd-filter-title">${__("Filters")}</div>
					<div id="swbd-filters" class="row"></div>
				</div>
				<div id="swbd-kpis" class="swbd-kpis"></div>
				<div id="swbd-table" class="swbd-table-wrap"></div>
			</div>
		`);
	}

	make_filters() {
		this.from_date = this.make_filter({
			label: __("From Date"),
			fieldtype: "Date",
			fieldname: "from_date",
			default: frappe.datetime.year_start(),
		});
		this.to_date = this.make_filter({
			label: __("To Date"),
			fieldtype: "Date",
			fieldname: "to_date",
			default: frappe.datetime.get_today(),
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
		this.customer_type = this.make_filter({
			label: __("Customer Type"),
			fieldtype: "Select",
			fieldname: "customer_type",
			options: "\nSchool\nIndividual",
		});
		// Tooltip instead of bulky description under the field
		setTimeout(() => {
			this.customer_type.$wrapper
				?.find("label, .control-label")
				.first()
				.attr(
					"title",
					__(
						"School = Customer Type School/Company, or name contains school, foundation, college, system, campus, office, academy"
					)
				);
		}, 0);
		this.city = this.make_filter({
			label: __("City"),
			fieldtype: "Link",
			fieldname: "city",
			options: "City",
		});
		this.province = this.make_filter({
			label: __("Province"),
			fieldtype: "Link",
			fieldname: "province",
			options: "Province",
		});
		this.area = this.make_filter({
			label: __("Area"),
			fieldtype: "Link",
			fieldname: "area",
			options: "Area",
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
			options: "\nMQH\nQaida\nGuide\nKP Edition\nBalouchistan Edition",
		});
	}

	make_filter(df) {
		const wrap = $(`<div class="col-md-3 col-sm-6" style="margin-bottom:8px;"></div>`).appendTo(
			$(this.page.body).find("#swbd-filters")
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
		// Link / Data: also reload after autocomplete select
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
			customer_type: this.customer_type.get_value(),
			city: this.city.get_value(),
			province: this.province.get_value(),
			area: this.area.get_value(),
			school_status: this.school_status.get_value(),
			book_type: this.book_type.get_value(),
		};
	}

	async load_data() {
		$(this.page.body).find("#swbd-table").html(`<div class="swbd-muted" style="padding:16px;">Loading…</div>`);
		const r = await frappe.call({
			method:
				"tif_customization.tif_customization.page.school_wise_book_dispatched.school_wise_book_dispatched.get_report_data",
			args: { filters: this.get_filters() },
		});
		this.rows = r.message?.rows || [];
		this.summary = r.message?.summary || {};
		// Client-side safety: re-apply name keywords so Type/KPIs stay correct
		this.apply_name_school_group();
		this.render_kpis();
		this.render_table();
	}

	name_looks_like_school(name) {
		const keywords = [
			"school",
			"foundation",
			"college",
			"system",
			"campus",
			"office",
			"academy",
			"madrasa",
			"madrassa",
			"university",
		];
		let text = String(name || "")
			.toLowerCase()
			.replace(/[-_/.,()&|+]/g, " ");
		return keywords.some((kw) => text.includes(kw));
	}

	resolve_type_group(row) {
		const raw = String(row.customer_type || "").trim();
		const blob = [row.school_name, row.customer_name, row.customer].filter(Boolean).join(" ");
		if (raw === "School" || raw === "Company" || this.name_looks_like_school(blob)) {
			return "School";
		}
		if (raw === "Individual") {
			return "Individual";
		}
		return "School";
	}

	apply_name_school_group() {
		let school_type_count = 0;
		let individual_count = 0;
		let mqh_school_count = 0;
		let qaida_school_count = 0;
		let guide_school_count = 0;
		let kpk_school_count = 0;
		let bal_school_count = 0;
		this.rows.forEach((row) => {
			const group = this.resolve_type_group(row);
			row.customer_type_group = group;
			const isSchool = group !== "Individual";
			if (isSchool) {
				school_type_count += 1;
				if (flt(row.mqh_qty) > 0) mqh_school_count += 1;
				if (flt(row.qaida_qty) > 0) qaida_school_count += 1;
				if (flt(row.guide_qty) > 0) guide_school_count += 1;
				if (flt(row.kpk_qty) > 0) kpk_school_count += 1;
				if (flt(row.bal_qty) > 0) bal_school_count += 1;
			} else {
				individual_count += 1;
			}
		});
		this.summary = Object.assign({}, this.summary, {
			school_type_count,
			individual_count,
			mqh_school_count,
			qaida_school_count,
			guide_school_count,
			kpk_school_count,
			bal_school_count,
		});
	}

	render_kpis() {
		const s = this.summary;
		const fmt = (n) => frappe.format(n || 0, { fieldtype: "Float", precision: 0 });
		const schoolSplit = `
			<div class="swbd-kpi-split" title="${frappe.utils.escape_html(__("School = Company + School + name keywords"))}">
				<span class="swbd-pill swbd-pill--school">${__("School")} <em>${fmt(s.school_type_count)}</em></span>
				<span class="swbd-pill swbd-pill--individual">${__("Individual")} <em>${fmt(s.individual_count)}</em></span>
			</div>`;
		const schoolCountPill = (count) => `
			<div class="swbd-kpi-split">
				<span class="swbd-pill swbd-pill--school">${__("Schools")} <em>${fmt(count)}</em></span>
			</div>`;
		const cards = [
			{
				label: __("Customers"),
				value: s.schools || 0,
				cls: "swbd-kpi--schools",
				hint: __("Total distinct"),
				extra: schoolSplit,
			},
			{
				label: __("Books Dispatched"),
				value: s.total_qty || 0,
				cls: "swbd-kpi--total",
				hint: __("Click for item-wise qty"),
				bookType: "",
				clickable: true,
			},
			{
				label: __("MQH"),
				value: s.mqh_qty || 0,
				cls: "swbd-kpi--mqh",
				hint: __("Click for item-wise qty"),
				extra: schoolCountPill(s.mqh_school_count),
				bookType: "MQH",
				clickable: true,
			},
			{
				label: __("Qaida"),
				value: s.qaida_qty || 0,
				cls: "swbd-kpi--qaida",
				hint: __("Click for item-wise qty"),
				extra: schoolCountPill(s.qaida_school_count),
				bookType: "Qaida",
				clickable: true,
			},
			{
				label: __("KP Edition"),
				value: s.kpk_qty || 0,
				cls: "swbd-kpi--kpk",
				hint: __("Click for item-wise qty"),
				extra: schoolCountPill(s.kpk_school_count),
				bookType: "KP Edition",
				clickable: true,
			},
			{
				label: __("Balouchistan Edition"),
				value: s.bal_qty || 0,
				cls: "swbd-kpi--bal",
				hint: __("Click for item-wise qty"),
				extra: schoolCountPill(s.bal_school_count),
				bookType: "Balouchistan Edition",
				clickable: true,
			},
			{ label: __("Delivery Notes"), value: s.delivery_notes || 0, cls: "swbd-kpi--dns", hint: __("Submitted DNs") },
		];
		const $kpis = $(this.page.body).find("#swbd-kpis");
		$kpis.html(
			cards
				.map(
					(c) => `
					<div class="swbd-kpi ${c.cls}${c.clickable ? " is-clickable" : ""}"
						${c.clickable ? `data-book-type="${frappe.utils.escape_html(c.bookType || "")}" title="${__(
							"Click for item-wise out qty"
						)}"` : ""}>
						<div class="label">${frappe.utils.escape_html(c.label)}</div>
						<div class="value">${fmt(c.value)}</div>
						${c.extra || ""}
						<div class="hint">${frappe.utils.escape_html(c.hint || "")}</div>
					</div>`
				)
				.join("")
		);
		$kpis.find(".swbd-kpi.is-clickable").on("click", (e) => {
			const bookType = $(e.currentTarget).attr("data-book-type") || "";
			this.show_card_item_wise_qty(bookType);
		});
	}

	show_card_item_wise_qty(bookType) {
		const filters = Object.assign({}, this.get_filters(), {
			card_scope: 1,
			customer: "",
			school: "",
			school_name: "",
			book_type: bookType || "",
		});
		this._open_item_wise_dialog(filters, bookType || __("All Books"));
	}

	columns() {
		return [
			{ key: "school_name", label: __("School / Customer") },
			{ key: "customer_type_group", label: __("Type") },
			{ key: "school_status", label: __("Status") },
			{ key: "city", label: __("City") },
			{ key: "province", label: __("Province") },
			{ key: "area", label: __("Area") },
			{ key: "delivery_notes", label: __("DNs"), num: true },
			{ key: "total_qty", label: __("Total Qty"), num: true },
			{ key: "mqh_qty", label: __("MQH"), num: true },
			{ key: "qaida_qty", label: __("Qaida"), num: true },
			{ key: "guide_qty", label: __("Guide"), num: true },
			{ key: "kpk_qty", label: __("KP Edition"), num: true },
			{ key: "bal_qty", label: __("Balouchistan Edition"), num: true },
			{ key: "other_qty", label: __("Other"), num: true },
			{ key: "last_dispatch_date", label: __("Last Dispatch") },
		];
	}

	type_badge(group, raw) {
		const label = group || raw || "—";
		const cls =
			label === "School"
				? "swbd-type--school"
				: label === "Individual"
					? "swbd-type--individual"
					: "swbd-type--other";
		const title =
			group === "School" && raw && raw !== "School"
				? `title="${frappe.utils.escape_html(__("Customer Type") + ": " + raw)}"`
				: "";
		return `<span class="swbd-type ${cls}" ${title}>${frappe.utils.escape_html(label)}</span>`;
	}

	location_link(doctype, docname, label) {
		const text = frappe.utils.escape_html(label || "") || "";
		if (!docname || !label) {
			return text;
		}
		const href = frappe.utils.get_form_link(doctype, docname);
		return `<a href="${href}" target="_blank">${text}</a>`;
	}

	render_table() {
		const cols = this.columns();
		if (!this.rows.length) {
			$(this.page.body)
				.find("#swbd-table")
				.html(`<div class="swbd-muted swbd-empty">${__("No dispatch data for selected filters.")}</div>`);
			return;
		}
		const head = cols
			.map((c) => `<th class="${c.num ? "swbd-num" : ""}">${frappe.utils.escape_html(c.label)}</th>`)
			.join("");
		const body = this.rows
			.map((row) => {
				const cells = cols
					.map((c) => {
						let val = row[c.key];
						if (c.key === "school_name") {
							const label = frappe.utils.escape_html(val || "");
							val = `<a href="#" class="swbd-item-drill" title="${__(
								"View item-wise qty"
							)}">${label}</a>`;
						} else if (c.key === "total_qty") {
							val = `<a href="#" class="swbd-item-drill swbd-num-link">${frappe.format(
								val || 0,
								{ fieldtype: "Float", precision: 0 }
							)}</a>`;
						} else if (c.num) {
							val = frappe.format(val || 0, { fieldtype: "Float", precision: 0 });
						} else if (c.key === "last_dispatch_date" && val) {
							val = frappe.datetime.str_to_user(val);
						} else if (c.key === "customer_type_group") {
							val = this.type_badge(
								row.customer_type_group || this.resolve_type_group(row),
								row.customer_type
							);
						} else if (c.key === "city") {
							val = this.location_link("City", row.city_doc, row.city) || "—";
						} else if (c.key === "province") {
							val = this.location_link("Province", row.province_doc, row.province) || "—";
						} else if (c.key === "area") {
							val = this.location_link("Area", row.area_doc, row.area) || "—";
						} else if (c.key === "school_status") {
							val = frappe.utils.escape_html(val || "—");
						} else {
							val = frappe.utils.escape_html(val || "—");
						}
						return `<td class="${c.num ? "swbd-num" : ""}">${val}</td>`;
					})
					.join("");
				const idx = this.rows.indexOf(row);
				return `<tr class="swbd-row" data-row-idx="${idx}" style="cursor:pointer;">${cells}</tr>`;
			})
			.join("");
		const $wrap = $(this.page.body).find("#swbd-table");
		$wrap.html(`
			<table class="swbd-table">
				<thead><tr>${head}</tr></thead>
				<tbody>${body}</tbody>
			</table>
		`);
		$wrap.find(".swbd-item-drill").on("click", (e) => {
			e.preventDefault();
			e.stopPropagation();
			const idx = cint($(e.currentTarget).closest("tr").attr("data-row-idx"));
			const row = this.rows[idx];
			if (row) this.show_item_wise_qty(row);
		});
		$wrap.find("tr.swbd-row").on("click", (e) => {
			if ($(e.target).closest("a").length && !$(e.target).closest(".swbd-item-drill").length) {
				return;
			}
			const idx = cint($(e.currentTarget).attr("data-row-idx"));
			const row = this.rows[idx];
			if (row) this.show_item_wise_qty(row);
		});
	}

	show_item_wise_qty(row) {
		const filters = Object.assign({}, this.get_filters(), {
			customer: row.customer || "",
			school: row.school || "",
			school_name: row.school_name || row.customer_name || "",
			card_scope: 0,
		});
		this._open_item_wise_dialog(filters, row.school_name || row.customer || "");
	}

	_open_item_wise_dialog(filters, fallbackLabel) {
		frappe.call({
			method:
				"tif_customization.tif_customization.page.school_wise_book_dispatched.school_wise_book_dispatched.get_item_wise_dispatch",
			args: { filters },
			freeze: true,
			freeze_message: __("Loading item-wise qty..."),
			callback: (r) => {
				const res = r.message || {};
				const items = res.rows || [];
				const fmt = (n) => frappe.format(n || 0, { fieldtype: "Float", precision: 0 });
				const showCustomers = cint(filters.card_scope);
				let body;
				if (!items.length) {
					body = `<p class="text-muted">${__("No item dispatches found.")}</p>`;
				} else {
					body = `
						<p class="text-muted" style="margin:0 0 10px;font-size:12px;">
							${__("Period")}: ${frappe.datetime.str_to_user(res.from_date)} → ${frappe.datetime.str_to_user(res.to_date)}
							· ${__("Items")}: <strong>${items.length}</strong>
							· ${__("Total Out Qty")}: <strong>${fmt(res.total_qty)}</strong>
						</p>
						<div style="max-height:420px;overflow:auto;">
							<table class="table table-bordered table-hover" style="font-size:12px;margin:0;">
								<thead>
									<tr>
										<th>${__("Item Code")}</th>
										<th>${__("Item Name")}</th>
										<th>${__("Type")}</th>
										<th class="text-right">${__("Out Qty")}</th>
										<th>${__("UOM")}</th>
										<th class="text-right">${__("DNs")}</th>
										${showCustomers ? `<th class="text-right">${__("Customers")}</th>` : ""}
										<th>${__("Last Dispatch")}</th>
									</tr>
								</thead>
								<tbody>
									${items
										.map(
											(it) => `<tr>
										<td><a href="/app/item/${encodeURIComponent(it.item_code || "")}" target="_blank">${frappe.utils.escape_html(
											it.item_code || ""
										)}</a></td>
										<td>${frappe.utils.escape_html(it.item_name || "")}</td>
										<td>${frappe.utils.escape_html(it.book_type || "")}</td>
										<td class="text-right"><strong>${fmt(it.qty)}</strong></td>
										<td>${frappe.utils.escape_html(it.uom || "")}</td>
										<td class="text-right">${fmt(it.delivery_notes)}</td>
										${showCustomers ? `<td class="text-right">${fmt(it.customers)}</td>` : ""}
										<td>${it.last_dispatch_date ? frappe.datetime.str_to_user(it.last_dispatch_date) : "—"}</td>
									</tr>`
										)
										.join("")}
								</tbody>
								<tfoot>
									<tr>
										<th colspan="3">${__("Total")}</th>
										<th class="text-right">${fmt(res.total_qty)}</th>
										<th colspan="${showCustomers ? 4 : 3}"></th>
									</tr>
								</tfoot>
							</table>
						</div>`;
				}
				const d = new frappe.ui.Dialog({
					title: __("Item-wise Out Qty: {0}", [res.label || fallbackLabel || ""]),
					size: "extra-large",
					fields: [{ fieldtype: "HTML", fieldname: "html" }],
					primary_action_label: __("Close"),
					primary_action: () => d.hide(),
				});
				d.fields_dict.html.$wrapper.html(body);
				d.show();
			},
		});
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
		a.download = `school_wise_book_dispatched_${frappe.datetime.get_today()}.csv`;
		a.click();
	}

	print_report() {
		const html = $(this.page.body).find("#swbd-table").html();
		const w = window.open("", "_blank");
		w.document.write(`
			<html><head><title>School Wise Book Dispatched</title>
			<style>
				body{font-family:sans-serif;padding:16px}
				table{width:100%;border-collapse:collapse;font-size:12px}
				th,td{border:1px solid #ddd;padding:6px 8px}
				th{background:#f4f5f6;text-align:left}
				.swbd-num{text-align:right}
			</style></head><body>
			<h2>School Wise Book Dispatched</h2>
			${html}
			</body></html>
		`);
		w.document.close();
		w.focus();
		w.print();
	}
};
