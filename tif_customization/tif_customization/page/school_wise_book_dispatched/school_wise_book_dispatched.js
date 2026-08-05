frappe.pages["school-wise-book-dispatched"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("School Wise Book Dispatched"),
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
			<div style="padding:16px;">
				<style>
					.swbd-kpis{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:16px;align-items:stretch}
					.swbd-kpi-col{flex:1 1 150px;min-width:140px;max-width:100%;display:flex}
					.swbd-kpi{
						position:relative;overflow:hidden;
						padding:14px 16px;border-radius:10px;
						border:1px solid var(--border-color,#e5e7eb);
						width:100%;
						min-height:108px;
						height:100%;
						display:flex;flex-direction:column;justify-content:space-between;
						box-sizing:border-box;
					}
					.swbd-kpi::before{
						content:"";position:absolute;inset:0 0 auto 0;height:4px;
						background:var(--swbd-accent, transparent);
					}
					.swbd-kpi .label{font-size:12px;margin:0 0 6px;line-height:1.3;color:var(--swbd-muted, var(--text-muted,#6b7280))}
					.swbd-kpi .value{font-size:22px;font-weight:700;line-height:1.2;color:var(--swbd-value, var(--text-color,#111827))}
					.swbd-kpi .hint{font-size:11px;margin-top:auto;padding-top:6px;line-height:1.3;color:var(--swbd-muted, var(--text-muted,#6b7280))}
					.swbd-kpi--schools{--swbd-accent:#1e40af;--swbd-value:#fff;--swbd-muted:#dbeafe;background:linear-gradient(135deg,#1d4ed8 0%,#1e3a8a 100%);border-color:#1e40af;box-shadow:0 6px 16px rgba(30,64,175,.18)}
					.swbd-kpi--total{--swbd-accent:#0f766e;--swbd-value:#fff;--swbd-muted:#ccfbf1;background:linear-gradient(135deg,#0d9488 0%,#115e59 100%);border-color:#0f766e;box-shadow:0 6px 16px rgba(15,118,110,.18)}
					.swbd-kpi--mqh{--swbd-accent:#7c3aed;--swbd-value:#6d28d9;--swbd-muted:#4c1d95;background:linear-gradient(135deg,#f5f3ff 0%,#ede9fe 100%);border-color:#ddd6fe}
					.swbd-kpi--qaida{--swbd-accent:#059669;--swbd-value:#047857;--swbd-muted:#064e3b;background:linear-gradient(135deg,#ecfdf5 0%,#d1fae5 100%);border-color:#a7f3d0}
					.swbd-kpi--guide{--swbd-accent:#ea580c;--swbd-value:#c2410c;--swbd-muted:#7c2d12;background:linear-gradient(135deg,#fff7ed 0%,#ffedd5 100%);border-color:#fed7aa}
					.swbd-kpi--dns{--swbd-accent:#0891b2;--swbd-value:#0e7490;--swbd-muted:#164e63;background:linear-gradient(135deg,#ecfeff 0%,#cffafe 100%);border-color:#a5f3fc}
					.swbd-table-wrap{overflow:auto;border:1px solid var(--border-color,#e5e7eb);border-radius:8px;background:#fff}
					.swbd-table{width:100%;border-collapse:collapse;font-size:13px}
					.swbd-table th{background:var(--control-bg,#f4f5f6);text-align:left;padding:10px 12px;border-bottom:1px solid var(--border-color,#e5e7eb);white-space:nowrap}
					.swbd-table td{padding:9px 12px;border-bottom:1px solid var(--border-color,#eee);vertical-align:top}
					.swbd-table tr:hover td{background:#fafafa}
					.swbd-num{text-align:right;font-variant-numeric:tabular-nums}
					.swbd-muted{color:var(--text-muted,#6b7280)}
				</style>
				<div id="swbd-filters" class="row" style="margin-bottom:12px;"></div>
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
		this.render_kpis();
		this.render_table();
	}

	render_kpis() {
		const s = this.summary;
		const cards = [
			{ label: __("Schools"), value: s.schools || 0, cls: "swbd-kpi--schools", hint: __("Distinct schools / customers") },
			{ label: __("Total Books Dispatched"), value: s.total_qty || 0, cls: "swbd-kpi--total", hint: __("All book items") },
			{ label: __("MQH"), value: s.mqh_qty || 0, cls: "swbd-kpi--mqh", hint: __("MQH books") },
			{ label: __("Qaida"), value: s.qaida_qty || 0, cls: "swbd-kpi--qaida", hint: __("Qaida books") },
			{ label: __("Guide"), value: s.guide_qty || 0, cls: "swbd-kpi--guide", hint: __("Guide books") },
			{ label: __("Delivery Notes"), value: s.delivery_notes || 0, cls: "swbd-kpi--dns", hint: __("Submitted DNs") },
		];
		$(this.page.body)
			.find("#swbd-kpis")
			.html(
				cards
					.map(
						(c) => `
					<div class="swbd-kpi-col">
						<div class="swbd-kpi ${c.cls}">
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
			{ key: "delivery_notes", label: __("DNs"), num: true },
			{ key: "total_qty", label: __("Total Qty"), num: true },
			{ key: "mqh_qty", label: __("MQH"), num: true },
			{ key: "qaida_qty", label: __("Qaida"), num: true },
			{ key: "guide_qty", label: __("Guide"), num: true },
			{ key: "other_qty", label: __("Other"), num: true },
			{ key: "last_dispatch_date", label: __("Last Dispatch") },
		];
	}

	render_table() {
		const cols = this.columns();
		if (!this.rows.length) {
			$(this.page.body)
				.find("#swbd-table")
				.html(`<div class="swbd-muted" style="padding:16px;">No dispatch data for selected filters.</div>`);
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
						if (c.num) val = frappe.format(val || 0, { fieldtype: "Float", precision: 0 });
						else if (c.key === "last_dispatch_date" && val)
							val = frappe.datetime.str_to_user(val);
						else val = frappe.utils.escape_html(val || "");
						return `<td class="${c.num ? "swbd-num" : ""}">${val}</td>`;
					})
					.join("");
				return `<tr>${cells}</tr>`;
			})
			.join("");
		$(this.page.body).find("#swbd-table").html(`
			<table class="swbd-table">
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
