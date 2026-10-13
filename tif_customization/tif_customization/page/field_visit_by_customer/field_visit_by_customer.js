frappe.pages["field-visit-by-customer"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Field Visits by Customer"),
		single_column: true,
	});
	frappe.tif_customization = frappe.tif_customization || {};
	new frappe.tif_customization.FieldVisitByCustomer(page);
};

frappe.tif_customization = frappe.tif_customization || {};

frappe.tif_customization.FieldVisitByCustomer = class FieldVisitByCustomer {
	constructor(page) {
		this.page = page;
		this.filters = {};
		this.start = 0;
		this.limit = 100;
		this.make();
	}

	make() {
		this.inject_styles();
		this.body = $(`
			<div class="fvbc">
				<header class="fvbc-hero">
					<div>
						<p class="fvbc-eyebrow">${__("Field Visit")}</p>
						<h2 class="fvbc-title">${__("Customers")}</h2>
						<p class="fvbc-sub">${__("Click a customer to open visit details.")}</p>
					</div>
					<div class="fvbc-hero-meta">
						<span class="fvbc-count-pill"><span class="fvbc-cust-count">0</span> ${__("customers")}</span>
					</div>
				</header>

				<section class="fvbc-toolbar">
					<div class="row fvbc-filter-grid"></div>
					<div class="fvbc-toolbar-actions">
						<button type="button" class="btn btn-sm fvbc-btn-ghost fvbc-reset">${__("Reset")}</button>
						<button type="button" class="btn btn-sm fvbc-btn-solid fvbc-apply">${__("Apply")}</button>
					</div>
				</section>

				<section class="fvbc-list-card">
					<div class="fvbc-customer-list"></div>
					<footer class="fvbc-pager"></footer>
				</section>
			</div>
		`);
		$(this.page.body).empty().append(this.body);
		this.setup_filters();
		this.bind();
		this.page.set_primary_action(__("Refresh"), () => this.load_customers(), "refresh");
		this.load_filter_options().then(() => this.load_customers());
	}

	inject_styles() {
		const existing = document.getElementById("fvbc-styles");
		if (existing) existing.remove();
		const css = document.createElement("style");
		css.id = "fvbc-styles";
		css.textContent = `
			.fvbc{
				--fvbc-ink:#1c1917;
				--fvbc-muted:#78716c;
				--fvbc-line:#e7e5e4;
				--fvbc-soft:#fafaf9;
				--fvbc-accent:#0f766e;
				--fvbc-accent-soft:#ccfbf1;
				font-family:"Segoe UI",ui-sans-serif,system-ui,sans-serif;
				color:var(--fvbc-ink);
				padding:4px 2px 24px;
			}
			.fvbc-hero{
				display:flex;justify-content:space-between;align-items:flex-end;gap:16px;
				margin:4px 0 18px;padding:18px 20px;
				background:linear-gradient(135deg,#fafaf9 0%,#f5f5f4 55%,#ecfdf5 100%);
				border:1px solid var(--fvbc-line);border-radius:14px;
			}
			.fvbc-eyebrow{margin:0;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--fvbc-muted);font-weight:600}
			.fvbc-title{margin:4px 0 2px;font-size:22px;font-weight:700;letter-spacing:-.02em}
			.fvbc-sub{margin:0;font-size:13px;color:var(--fvbc-muted)}
			.fvbc-count-pill{
				display:inline-flex;align-items:center;gap:4px;
				padding:6px 12px;border-radius:999px;background:#fff;
				border:1px solid var(--fvbc-line);font-size:12px;color:var(--fvbc-muted);font-weight:600
			}
			.fvbc-toolbar{
				display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:12px;
				margin-bottom:14px;padding:14px 16px;background:#fff;
				border:1px solid var(--fvbc-line);border-radius:12px;
			}
			.fvbc-filter-grid{flex:1;min-width:240px;margin:0}
			.fvbc-toolbar-actions{display:flex;gap:8px;padding-bottom:4px}
			.fvbc-btn-solid{background:var(--fvbc-accent)!important;color:#fff!important;border-color:var(--fvbc-accent)!important;border-radius:8px;font-weight:600}
			.fvbc-btn-solid:hover{filter:brightness(.95)}
			.fvbc-btn-ghost{border-radius:8px;border:1px solid var(--fvbc-line)!important;background:#fff!important;color:var(--fvbc-ink)!important}
			.fvbc-list-card{
				background:#fff;border:1px solid var(--fvbc-line);border-radius:14px;overflow:hidden;
				box-shadow:0 1px 2px rgba(28,25,23,.04);
			}
			.fvbc-table{width:100%;border-collapse:collapse;table-layout:fixed}
			.fvbc-table thead th{
				text-align:left;padding:12px 16px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;
				color:var(--fvbc-muted);background:var(--fvbc-soft);border-bottom:1px solid var(--fvbc-line);font-weight:700
			}
			.fvbc-table tbody td{padding:14px 16px;border-bottom:1px solid var(--fvbc-line);vertical-align:middle;font-size:13px}
			.fvbc-table tbody tr{cursor:pointer;transition:background .15s ease, transform .15s ease}
			.fvbc-table tbody tr:last-child td{border-bottom:none}
			.fvbc-table tbody tr:hover{background:var(--fvbc-accent-soft)}
			.fvbc-table tbody tr:active{transform:scale(.998)}
			.fvbc-name{font-weight:650;color:var(--fvbc-ink);font-size:14px}
			.fvbc-hint{font-size:11px;color:var(--fvbc-muted);margin-top:2px}
			.fvbc-badge{
				display:inline-flex;min-width:28px;justify-content:center;
				padding:3px 10px;border-radius:999px;background:var(--fvbc-ink);color:#fff;
				font-size:12px;font-weight:700
			}
			.fvbc-dates{color:var(--fvbc-muted);font-size:12px;font-variant-numeric:tabular-nums}
			.fvbc-chevron{color:var(--fvbc-muted);font-size:16px;opacity:.7}
			.fvbc-pager{
				display:flex;justify-content:space-between;align-items:center;
				padding:10px 16px;border-top:1px solid var(--fvbc-line);background:var(--fvbc-soft);font-size:12px;color:var(--fvbc-muted)
			}
			.fvbc-empty{padding:48px 20px;text-align:center;color:var(--fvbc-muted)}
			.fvbc-dlg-meta{font-size:12px;color:var(--fvbc-muted);margin:0 0 12px}
			.fvbc-dlg-table{width:100%;border-collapse:collapse;font-size:12.5px}
			.fvbc-dlg-table th{
				text-align:left;padding:8px 10px;background:var(--fvbc-soft);border-bottom:1px solid var(--fvbc-line);
				font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--fvbc-muted);position:sticky;top:0;z-index:1
			}
			.fvbc-dlg-table td{padding:10px;border-bottom:1px solid #f5f5f4;vertical-align:top}
			.fvbc-doc{font-weight:700;color:var(--fvbc-accent);cursor:pointer;text-decoration:none}
			.fvbc-doc:hover{text-decoration:underline}
			.fvbc-remarks{max-width:260px;white-space:pre-wrap;word-break:break-word;color:#44403c;line-height:1.4}
			.fvbc-view-btn{
				border:1px solid var(--fvbc-line)!important;background:#fff!important;border-radius:7px!important;
				font-size:11px!important;font-weight:600!important;padding:3px 8px!important
			}
			.fvbc-view-btn:hover{border-color:var(--fvbc-accent)!important;color:var(--fvbc-accent)!important}
			@media (max-width:768px){
				.fvbc-hero{flex-direction:column;align-items:flex-start}
				.fvbc-table th:nth-child(3),.fvbc-table td:nth-child(3){display:none}
			}
		`;
		document.head.appendChild(css);
	}

	make_filter(df) {
		const col = $('<div class="col-md-3 col-sm-6 mb-2"></div>').appendTo(
			this.body.find(".fvbc-filter-grid")
		);
		const control = frappe.ui.form.make_control({
			parent: col,
			df: { ...df },
			render_input: true,
		});
		control.refresh();
		if (df.default != null) control.set_value(df.default);
		return control;
	}

	setup_filters() {
		this.filters = {
			from_date: this.make_filter({
				label: __("Visit From"),
				fieldname: "from_date",
				fieldtype: "Date",
				default: frappe.datetime.month_start(),
			}),
			to_date: this.make_filter({
				label: __("Visit To"),
				fieldname: "to_date",
				fieldtype: "Date",
				default: frappe.datetime.get_today(),
			}),
			type: this.make_filter({
				label: __("Type"),
				fieldname: "type",
				fieldtype: "Select",
				options: "\n",
			}),
			search: this.make_filter({
				label: __("Search"),
				fieldname: "search",
				fieldtype: "Data",
				placeholder: __("Customer, school, staff, or document"),
			}),
		};
	}

	load_filter_options() {
		return frappe
			.call({
				method:
					"tif_customization.tif_customization.page.field_visit_by_customer.field_visit_by_customer.get_filter_options",
				freeze: false,
			})
			.then((r) => {
				const types = (r.message && r.message.types) || [];
				this.filters.type.df.options = ["", ...types].join("\n");
				this.filters.type.refresh();
			});
	}

	get_filter_values() {
		return {
			from_date: this.filters.from_date.get_value() || "",
			to_date: this.filters.to_date.get_value() || "",
			type: this.filters.type.get_value() || "",
			search: this.filters.search.get_value() || "",
			start: this.start,
			limit: this.limit,
		};
	}

	bind() {
		this.body.on("click", ".fvbc-apply", () => {
			this.start = 0;
			this.load_customers();
		});
		this.body.on("click", ".fvbc-reset", () => {
			this.filters.from_date.set_value(frappe.datetime.month_start());
			this.filters.to_date.set_value(frappe.datetime.get_today());
			this.filters.type.set_value("");
			this.filters.search.set_value("");
			this.start = 0;
			this.load_customers();
		});
		this.body.on("click", ".fvbc-cust-row", (e) => {
			const $row = $(e.currentTarget);
			this.open_visits_dialog({
				customer: $row.attr("data-customer") || "",
				pending_name: $row.attr("data-pending") || "",
				customer_name: $row.attr("data-label") || "",
			});
		});
		this.body.on("keydown", ".fvbc-cust-row", (e) => {
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault();
				$(e.currentTarget).trigger("click");
			}
		});
		this.body.on("click", ".fvbc-prev", () => {
			this.start = Math.max(0, this.start - this.limit);
			this.load_customers();
		});
		this.body.on("click", ".fvbc-next", () => {
			this.start += this.limit;
			this.load_customers();
		});
	}

	load_customers() {
		frappe.call({
			method:
				"tif_customization.tif_customization.page.field_visit_by_customer.field_visit_by_customer.get_customers",
			args: { filters: this.get_filter_values() },
			freeze: true,
			freeze_message: __("Loading customers…"),
			callback: (r) => this.render_customers(r.message || {}),
		});
	}

	render_customers(data) {
		const rows = data.rows || [];
		const total = cint(data.total || 0);
		this.body.find(".fvbc-cust-count").text(total);

		if (!rows.length) {
			this.body
				.find(".fvbc-customer-list")
				.html(`<div class="fvbc-empty">${__("No customers found for these filters.")}</div>`);
			this.body.find(".fvbc-pager").empty();
			return;
		}

		const body = rows
			.map((row) => {
				const label = frappe.utils.escape_html(row.customer_name || row.customer || "—");
				const customer = frappe.utils.escape_html(row.customer || "");
				const pending = frappe.utils.escape_html(row.pending_name || "");
				const first = row.first_visit ? frappe.datetime.str_to_user(row.first_visit) : "—";
				const last = row.last_visit ? frappe.datetime.str_to_user(row.last_visit) : "—";
				const count = cint(row.visit_count);
				return `<tr class="fvbc-cust-row" tabindex="0" role="button"
					data-customer="${customer}" data-pending="${pending}" data-label="${label}"
					title="${__("Open visits")}">
					<td>
						<div class="fvbc-name">${label}</div>
						<div class="fvbc-hint">${__("Click to view visits")}</div>
					</td>
					<td><span class="fvbc-badge">${count}</span></td>
					<td class="fvbc-dates">${first} → ${last}</td>
					<td class="text-right"><span class="fvbc-chevron">›</span></td>
				</tr>`;
			})
			.join("");

		this.body.find(".fvbc-customer-list").html(`
			<table class="fvbc-table">
				<thead>
					<tr>
						<th style="width:48%">${__("Customer")}</th>
						<th style="width:12%">${__("Visits")}</th>
						<th style="width:32%">${__("Visit period")}</th>
						<th style="width:8%"></th>
					</tr>
				</thead>
				<tbody>${body}</tbody>
			</table>
		`);

		const end = Math.min(this.start + this.limit, total);
		this.body.find(".fvbc-pager").html(`
			<span>${this.start + 1}–${end} / ${total}</span>
			<div>
				<button type="button" class="btn btn-xs fvbc-btn-ghost fvbc-prev" ${
					this.start > 0 ? "" : "disabled"
				}>${__("Prev")}</button>
				<button type="button" class="btn btn-xs fvbc-btn-ghost fvbc-next" ${
					this.start + this.limit < total ? "" : "disabled"
				}>${__("Next")}</button>
			</div>
		`);
	}

	open_visits_dialog(selected) {
		const filters = {
			...this.get_filter_values(),
			customer: selected.customer || "",
			pending_name: selected.pending_name || "",
		};

		frappe.call({
			method:
				"tif_customization.tif_customization.page.field_visit_by_customer.field_visit_by_customer.get_visits",
			args: { filters },
			freeze: true,
			freeze_message: __("Loading visits…"),
			callback: (r) => {
				const data = r.message || {};
				const rows = data.rows || [];
				const d = new frappe.ui.Dialog({
					title: selected.customer_name || selected.customer || __("Customer"),
					size: "extra-large",
					fields: [{ fieldtype: "HTML", fieldname: "html" }],
					primary_action_label: __("Close"),
					primary_action: () => d.hide(),
				});

				const tableBody = rows.length
					? rows
							.map((row) => {
								const name = frappe.utils.escape_html(row.name || "");
								const category = frappe.utils.escape_html(row.category || "—");
								const type = frappe.utils.escape_html(row.type || "—");
								const remarks = frappe.utils.escape_html(row.remarks || "—");
								const officer = frappe.utils.escape_html(row.field_officer || "—");
								const visit_date = row.visit_date
									? frappe.datetime.str_to_user(row.visit_date)
									: "—";
								return `<tr>
									<td>
										<a href="#" class="fvbc-doc fvbc-open-doc" data-name="${name}">${name}</a>
										<div class="fvbc-hint">${visit_date}</div>
									</td>
									<td>${category}</td>
									<td>${type}</td>
									<td class="fvbc-remarks">${remarks}</td>
									<td>${officer}</td>
									<td>
										<button type="button" class="btn btn-xs fvbc-view-btn fvbc-open-doc" data-name="${name}">
											${__("View Document")}
										</button>
									</td>
								</tr>`;
							})
							.join("")
					: `<tr><td colspan="6" class="text-center text-muted">${__("No Field Visits")}</td></tr>`;

				d.fields_dict.html.$wrapper.html(`
					<p class="fvbc-dlg-meta">${__("{0} visits · sorted by document name ASC", [
						rows.length,
					])}</p>
					<div style="max-height:460px;overflow:auto;border:1px solid #e7e5e4;border-radius:10px;">
						<table class="fvbc-dlg-table">
							<thead>
								<tr>
									<th>${__("Document")}</th>
									<th>${__("Category")}</th>
									<th>${__("Type")}</th>
									<th>${__("Remarks")}</th>
									<th>${__("Field Officer")}</th>
									<th></th>
								</tr>
							</thead>
							<tbody>${tableBody}</tbody>
						</table>
					</div>
				`);

				d.$wrapper.on("click", ".fvbc-open-doc", (e) => {
					e.preventDefault();
					const name = $(e.currentTarget).attr("data-name");
					if (!name) return;
					d.hide();
					frappe.set_route("Form", "Field Visit", name);
				});

				d.show();
			},
		});
	}
};
