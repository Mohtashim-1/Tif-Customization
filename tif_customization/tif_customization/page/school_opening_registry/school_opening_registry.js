/* School Opening Registry v20260913c */
frappe.pages["school-opening-registry"].on_page_load = function (wrapper) {
	frappe.tif_customization.SchoolOpeningRegistry.clear_stuck_freeze();
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("School Opening Registry"),
		single_column: true,
	});
	new frappe.tif_customization.SchoolOpeningRegistry(page).make();
};

frappe.tif_customization = frappe.tif_customization || {};

frappe.tif_customization.SchoolOpeningRegistry = class SchoolOpeningRegistry {
	static PAGE_LENGTH_OPTIONS = [20, 50, 100, 200];
	static PAGE_LENGTH_STORAGE_KEY = "soa_registry_page_length";

	static clear_stuck_freeze() {
		while (frappe.dom.freeze_count > 0) {
			frappe.dom.unfreeze();
		}
		$("#freeze").removeClass("in").remove();
	}

	constructor(page) {
		this.page = page;
		const saved = parseInt(localStorage.getItem(SchoolOpeningRegistry.PAGE_LENGTH_STORAGE_KEY), 10);
		this.page_length = SchoolOpeningRegistry.PAGE_LENGTH_OPTIONS.includes(saved) ? saved : 50;
		this.start = 0;
		this.total = 0;
		this._loading = false;
		this.filter_fields = {};
	}

	make() {
		this._filter_debounce = null;
		this.make_layout();
		this.make_filters();
		this.load_data(0);
		this.page.set_primary_action(__("Refresh"), () => this.load_data(this.start), "refresh");
		this.page.set_secondary_action(__("Clear filters"), () => this.clear_filters(), "close");
	}

	schedule_reload() {
		clearTimeout(this._filter_debounce);
		this._filter_debounce = setTimeout(() => this.load_data(0), 350);
	}

	make_filters() {
		this.search_field = this.page.add_field({
			label: __("Search"),
			fieldtype: "Data",
			fieldname: "search",
			change: () => this.schedule_reload(),
		});

		this.filter_fields.govt_private = this.page.add_field({
			label: __("Govt / Private"),
			fieldtype: "Select",
			fieldname: "govt_private",
			options: [""],
			change: () => this.schedule_reload(),
		});

		this.filter_fields.status = this.page.add_field({
			label: __("Status"),
			fieldtype: "Select",
			fieldname: "status",
			options: [""],
			change: () => this.schedule_reload(),
		});

		this.filter_fields.territory = this.page.add_field({
			label: __("Territory"),
			fieldtype: "Link",
			fieldname: "territory",
			options: "Territory",
			change: () => this.schedule_reload(),
		});

		this.filter_fields.form_data = this.page.add_field({
			label: __("Form Data"),
			fieldtype: "Select",
			fieldname: "form_data",
			options: ["", "full:Full SC-1.2", "customer_only:Customer only"].join("\n"),
			change: () => this.schedule_reload(),
		});

		frappe.call({
			method: "tif_customization.tif_customization.api.school_opening_registry.get_school_registry_filter_options",
			freeze: false,
			callback: (r) => {
				const opts = r.message || {};
				this._set_select_options(this.filter_fields.govt_private, opts.govt_private || []);
				this._set_select_options(this.filter_fields.status, opts.status || []);
			},
		});
	}

	_set_select_options(field, values) {
		if (!field) {
			return;
		}
		const current = field.get_value() || "";
		const options = [""].concat(values);
		field.df.options = options.join("\n");
		field.refresh();
		if (current && options.includes(current)) {
			field.set_value(current);
		}
	}

	get_filter_args() {
		return {
			search: this.search_field?.get_value() || "",
			govt_private: this.filter_fields.govt_private?.get_value() || "",
			status: this.filter_fields.status?.get_value() || "",
			territory: this.filter_fields.territory?.get_value() || "",
			form_data: this.filter_fields.form_data?.get_value() || "",
		};
	}

	clear_filters() {
		this.search_field?.set_value("");
		this.filter_fields.govt_private?.set_value("");
		this.filter_fields.status?.set_value("");
		this.filter_fields.territory?.set_value("");
		this.filter_fields.form_data?.set_value("");
		this.load_data(0);
	}

	make_layout() {
		$(this.page.body).html(`
			<div class="school-opening-registry" style="padding: 12px;">
				<p class="text-muted small">${__(
					"Open a school customer to view the SC-1.2 form layout, print, or download PDF."
				)}</p>
				<div id="soa-registry-pager" class="flex justify-between align-center text-muted small" style="margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;"></div>
				<div class="table-responsive" style="background:#fff;border:1px solid #d1d8dd;border-radius:8px;">
					<table class="table table-bordered table-hover" style="margin:0;">
						<thead>
							<tr>
								<th>${__("Customer")}</th>
								<th>${__("School Name")}</th>
								<th>${__("Govt / Private")}</th>
								<th>${__("Status")}</th>
								<th>${__("Territory")}</th>
								<th>${__("Form Data")}</th>
								<th style="width:220px">${__("Actions")}</th>
							</tr>
						</thead>
						<tbody id="soa-registry-rows">
							<tr><td colspan="7" class="text-muted text-center">${__("Loading…")}</td></tr>
						</tbody>
					</table>
				</div>
			</div>
		`);

		const $registry = $(this.page.body).find(".school-opening-registry");
		$registry.on("click", ".soa-open-view", function () {
			window.open($(this).data("url"), "_blank");
		});
		$registry.on("click", ".soa-print", function () {
			const w = window.open($(this).data("url"), "_blank");
			if (w) {
				w.addEventListener("load", () => {
					try {
						w.print();
					} catch (e) {
						/* user prints from toolbar */
					}
				});
			}
		});
		$registry.on("click", ".soa-pdf-btn", (e) => {
			const customer = decodeURIComponent($(e.currentTarget).attr("data-customer") || "");
			this.ensure_pdf_download_script().then(() => {
				window.downloadSchoolOpeningPdf?.(customer);
			});
		});
		$registry.on("click", ".soa-page-prev", () => {
			if (this.start > 0) {
				this.load_data(Math.max(0, this.start - this.page_length));
			}
		});
		$registry.on("click", ".soa-page-next", () => {
			if (this.start + this.page_length < this.total) {
				this.load_data(this.start + this.page_length);
			}
		});
		$registry.on("change", ".soa-page-length", (e) => {
			const val = parseInt(e.target.value, 10);
			if (!SchoolOpeningRegistry.PAGE_LENGTH_OPTIONS.includes(val)) {
				return;
			}
			this.page_length = val;
			localStorage.setItem(SchoolOpeningRegistry.PAGE_LENGTH_STORAGE_KEY, String(val));
			this.load_data(0);
		});
	}

	ensure_pdf_download_script() {
		if (window.downloadSchoolOpeningPdf) {
			return Promise.resolve();
		}
		return new Promise((resolve) => {
			frappe.require("/assets/tif_customization/js/school_opening_pdf_download.js?v=20260913", resolve);
		});
	}

	load_data(start) {
		if (this._loading) {
			return;
		}
		this._loading = true;
		this.start = start || 0;
		const $body = $("#soa-registry-rows");
		$body.html(`<tr><td colspan="7" class="text-muted text-center">${__("Loading…")}</td></tr>`);

		frappe.call({
			method: "tif_customization.tif_customization.api.school_opening_registry.list_school_customers",
			args: {
				limit: this.page_length,
				start: this.start,
				...this.get_filter_args(),
			},
			freeze: false,
			callback: (r) => {
				const payload = r.message || {};
				let rows = [];
				if (Array.isArray(payload)) {
					rows = payload;
					this.total = rows.length;
				} else {
					rows = payload.rows || [];
					this.total = payload.total ?? rows.length;
					this.start = payload.start ?? this.start;
					if (payload.page_length) {
						this.page_length = payload.page_length;
					}
				}
				this.render_rows(rows);
				this.render_pager();
			},
			error: () => {
				$body.html(
					`<tr><td colspan="7" class="text-danger text-center">${__(
						"Could not load schools. Please try Refresh."
					)}</td></tr>`
				);
			},
			always: () => {
				this._loading = false;
				frappe.tif_customization.SchoolOpeningRegistry.clear_stuck_freeze();
			},
		});
	}

	render_pager() {
		const $pager = $("#soa-registry-pager");
		if (!this.total) {
			$pager.empty();
			return;
		}
		const from = this.total ? this.start + 1 : 0;
		const to = Math.min(this.start + this.page_length, this.total);
		const prevDisabled = this.start <= 0 ? "disabled" : "";
		const nextDisabled = this.start + this.page_length >= this.total ? "disabled" : "";
		const lengthOptions = SchoolOpeningRegistry.PAGE_LENGTH_OPTIONS.map(
			(n) =>
				`<option value="${n}" ${n === this.page_length ? "selected" : ""}>${n}</option>`
		).join("");
		$pager.html(`
			<span style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
				<span>${__("Showing")} ${from}–${to} ${__("of")} ${this.total}</span>
				<label class="text-muted" style="margin:0;font-weight:normal;">
					${__("Rows per page")}
					<select class="form-control input-xs soa-page-length" style="display:inline-block;width:auto;min-width:4.5rem;margin-left:4px;">${lengthOptions}</select>
				</label>
			</span>
			<span>
				<button type="button" class="btn btn-xs btn-default soa-page-prev" ${prevDisabled}>${__(
					"Previous"
				)}</button>
				<button type="button" class="btn btn-xs btn-default soa-page-next" ${nextDisabled}>${__(
					"Next"
				)}</button>
			</span>
		`);
	}

	render_rows(rows) {
		const $body = $("#soa-registry-rows");
		if (!rows.length) {
			$body.html(`<tr><td colspan="7" class="text-muted text-center">${__("No school customers found.")}</td></tr>`);
			return;
		}

		const html = rows
			.map((row) => {
				const printUrl = `/school-opening-print?customer=${encodeURIComponent(row.customer)}`;
				const custEnc = encodeURIComponent(row.customer);
				const formBadge = row.has_application
					? `<span class="indicator-pill green">${__("Full SC-1.2")}</span>`
					: `<span class="indicator-pill orange">${__("Customer only")}</span>`;
				return `<tr>
					<td><a href="/app/customer/${custEnc}">${frappe.utils.escape_html(row.customer)}</a></td>
					<td>${frappe.utils.escape_html(row.customer_name || "")}</td>
					<td>${frappe.utils.escape_html(row.govt_private || "")}</td>
					<td>${frappe.utils.escape_html(row.status || "")}</td>
					<td>${frappe.utils.escape_html(row.territory || "")}</td>
					<td>${formBadge}</td>
					<td>
						<button type="button" class="btn btn-xs btn-primary soa-open-view" data-url="${printUrl}">${__("Open Form")}</button>
						<button type="button" class="btn btn-xs btn-default soa-print" data-url="${printUrl}">${__("Print")}</button>
						<button type="button" class="btn btn-xs btn-default soa-pdf-btn" data-customer="${encodeURIComponent(
							row.customer
						)}">${__("PDF")}</button>
					</td>
				</tr>`;
			})
			.join("");
		$body.html(html);
	}
};
