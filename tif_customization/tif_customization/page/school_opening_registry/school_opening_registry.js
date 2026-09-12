frappe.pages["school-opening-registry"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("School Opening Registry"),
		single_column: true,
	});

	new frappe.tif_customization.SchoolOpeningRegistry(page).make();
};

frappe.tif_customization = frappe.tif_customization || {};

frappe.tif_customization.SchoolOpeningRegistry = class SchoolOpeningRegistry {
	constructor(page) {
		this.page = page;
	}

	make() {
		this.make_filters();
		this.make_layout();
		this.load_data();
		this.ensure_pdf_download_script();

		this.page.set_primary_action(__("Refresh"), () => this.load_data(), "refresh");
	}

	ensure_pdf_download_script() {
		if (window.downloadSchoolOpeningPdf) {
			return;
		}
		frappe.require("/assets/tif_customization/js/school_opening_pdf_download.js?v=20260912g");
	}

	make_filters() {
		this.search_field = this.page.add_field({
			label: __("Search"),
			fieldtype: "Data",
			fieldname: "search",
			change: () => this.load_data(),
		});
	}

	make_layout() {
		$(this.page.body).html(`
			<div class="school-opening-registry" style="padding: 12px;">
				<p class="text-muted small">${__(
					"Open a school customer to view the SC-1.2 form layout, print, or download PDF."
				)}</p>
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
	}

	load_data() {
		const search = this.search_field?.get_value() || "";
		frappe.call({
			method: "tif_customization.tif_customization.api.school_opening_registry.list_school_customers",
			args: { search, limit: 300 },
			callback: (r) => this.render_rows(r.message || []),
		});
	}

	render_rows(rows) {
		const $body = $("#soa-registry-rows");
		if (!rows.length) {
			$body.html(`<tr><td colspan="7" class="text-muted text-center">${__("No school customers found.")}</td></tr>`);
			return;
		}

		$body.empty();
		rows.forEach((row) => {
			const printUrl = `/school-opening-print?customer=${encodeURIComponent(row.customer)}`;
			const formBadge = row.has_application
				? `<span class="indicator-pill green">${__("Full SC-1.2")}</span>`
				: `<span class="indicator-pill orange">${__("Customer only")}</span>`;

			const $tr = $(`
				<tr>
					<td><a href="/app/customer/${encodeURIComponent(row.customer)}">${frappe.utils.escape_html(row.customer)}</a></td>
					<td>${frappe.utils.escape_html(row.customer_name || "")}</td>
					<td>${frappe.utils.escape_html(row.govt_private || "")}</td>
					<td>${frappe.utils.escape_html(row.status || "")}</td>
					<td>${frappe.utils.escape_html(row.territory || "")}</td>
					<td>${formBadge}</td>
					<td>
						<button type="button" class="btn btn-xs btn-primary soa-open-view" data-url="${printUrl}">${__("Open Form")}</button>
						<button type="button" class="btn btn-xs btn-default soa-print" data-url="${printUrl}">${__("Print")}</button>
						<button type="button" class="btn btn-xs btn-default soa-pdf-btn">${__("PDF")}</button>
					</td>
				</tr>
			`);
			$tr.find(".soa-pdf-btn").data("customer", row.customer);
			$body.append($tr);
		});

		$body.find(".soa-open-view").on("click", function () {
			window.open($(this).data("url"), "_blank");
		});
		$body.find(".soa-print").on("click", function () {
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
		$body.find(".soa-pdf-btn").on("click", function () {
			const customer = $(this).data("customer");
			if (window.downloadSchoolOpeningPdf) {
				window.downloadSchoolOpeningPdf(customer);
			}
		});
	}
};
