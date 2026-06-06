frappe.pages["city-wise-list-of-sc"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("City Wise List of Customers"),
		single_column: true,
	});

	new frappe.tif_customization.CityWiseCustomerList(page).make();
};

frappe.tif_customization = frappe.tif_customization || {};

frappe.tif_customization.CityWiseCustomerList = class CityWiseCustomerList {
	constructor(page) {
		this.page = page;
		this.city_filter = null;
		this.customer_filter = null;
		this.customer_group_filter = null;
		this.territory_filter = null;
	}

	make() {
		this.make_filters();
		this.make_layout();
		this.load_data();
	}

	make_filters() {
		this.city_filter = this.page.add_field({
			label: __("City"),
			fieldtype: "Data",
			fieldname: "city",
			change: () => this.load_data(),
		});

		this.customer_filter = this.page.add_field({
			label: __("Customer"),
			fieldtype: "Link",
			fieldname: "customer",
			options: "Customer",
			change: () => this.load_data(),
		});

		this.customer_group_filter = this.page.add_field({
			label: __("Customer Club"),
			fieldtype: "Link",
			fieldname: "customer_group",
			options: "Customer Group",
			change: () => this.load_data(),
		});

		this.territory_filter = this.page.add_field({
			label: __("Territory"),
			fieldtype: "Link",
			fieldname: "territory",
			options: "Territory",
			change: () => this.load_data(),
		});

		this.page.set_primary_action(__("Refresh"), () => this.load_data(), "refresh");
		this.page.add_action_item(__("Clear Filters"), () => this.clear_filters());
	}

	make_layout() {
		$(this.page.body).html(`
			<div class="city-wise-customer-list" style="padding: 16px;">
				<div id="city-wise-summary" class="row" style="margin-bottom: 16px;"></div>
				<div class="table-responsive" style="background: #fff; border: 1px solid #d1d8dd; border-radius: 8px;">
					<table class="table table-bordered" style="margin-bottom: 0;">
						<thead>
							<tr>
								<th>${__("City")}</th>
								<th>${__("Customer")}</th>
								<th>${__("Customer Name")}</th>
								<th>${__("Customer Club")}</th>
								<th>${__("Territory")}</th>
								<th>${__("Customer Type")}</th>
								<th>${__("Mobile No")}</th>
								<th>${__("Email")}</th>
								<th>${__("Address")}</th>
							</tr>
						</thead>
						<tbody id="city-wise-customer-tbody">
							<tr><td colspan="9" class="text-center text-muted">${__("Loading...")}</td></tr>
						</tbody>
					</table>
				</div>
			</div>
		`);
	}

	get_filters() {
		return {
			city: this.city_filter.get_value(),
			customer: this.customer_filter.get_value(),
			customer_group: this.customer_group_filter.get_value(),
			territory: this.territory_filter.get_value(),
		};
	}

	clear_filters() {
		this.city_filter.set_value("");
		this.customer_filter.set_value("");
		this.customer_group_filter.set_value("");
		this.territory_filter.set_value("");
		this.load_data();
	}

	load_data() {
		const tbody = $(this.page.body).find("#city-wise-customer-tbody");
		tbody.html(`<tr><td colspan="9" class="text-center text-muted">${__("Loading...")}</td></tr>`);

		frappe.call({
			method: "tif_customization.tif_customization.page.city_wise_list_of_sc.city_wise_list_of_sc.get_city_wise_customers",
			args: {
				filters: this.get_filters(),
			},
			callback: (response) => {
				const data = response.message || {};
				this.render_summary(data.summary || {});
				this.render_rows(data.rows || []);
			},
			error: () => {
				tbody.html(
					`<tr><td colspan="9" class="text-center text-danger">${__(
						"Unable to load customers"
					)}</td></tr>`
				);
			},
		});
	}

	render_summary(summary) {
		const cards = [
			[__("Total Customers"), summary.total_customers || 0],
			[__("Cities"), summary.total_cities || 0],
			[__("Customer Clubs"), summary.customer_groups || 0],
			[__("Without City"), summary.without_city || 0],
		];

		$(this.page.body)
			.find("#city-wise-summary")
			.html(
				cards
					.map(
						([label, value]) => `
							<div class="col-md-3">
								<div class="frappe-card" style="padding: 14px; border-radius: 8px; min-height: 86px;">
									<div class="text-muted">${label}</div>
									<div style="font-size: 26px; font-weight: 600;">${this.escape(value)}</div>
								</div>
							</div>
						`
					)
					.join("")
			);
	}

	render_rows(rows) {
		const tbody = $(this.page.body).find("#city-wise-customer-tbody");

		if (!rows.length) {
			tbody.html(`<tr><td colspan="9" class="text-center text-muted">${__("No customers found")}</td></tr>`);
			return;
		}

		tbody.html(
			rows
				.map((row) => {
					const customer_link = this.get_link("Customer", row.customer, row.customer);
					const customer_group_link = row.customer_group
						? this.get_link("Customer Group", row.customer_group, row.customer_group)
						: "";
					const territory_link = row.territory
						? this.get_link("Territory", row.territory, row.territory)
						: "";

					return `
						<tr>
							<td>${this.escape(row.city) || "-"}</td>
							<td>${customer_link}</td>
							<td>${this.escape(row.customer_name)}</td>
							<td>${customer_group_link || "-"}</td>
							<td>${territory_link || "-"}</td>
							<td>${this.escape(row.customer_type)}</td>
							<td>${this.escape(row.mobile_no)}</td>
							<td>${this.escape(row.email_id)}</td>
							<td>${this.escape(row.address)}</td>
						</tr>
					`;
				})
				.join("")
		);
	}

	get_link(doctype, name, label) {
		const route = frappe.utils.get_form_link(doctype, name);
		return `<a href="${route}">${this.escape(label)}</a>`;
	}

	escape(value) {
		return frappe.utils.escape_html(String(value || ""));
	}
};
