frappe.pages["no-of-students-repor"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("No of Students Report"),
		single_column: true,
	});

	new frappe.tif_customization.NoOfStudentsReport(page).make();
};

frappe.tif_customization = frappe.tif_customization || {};

frappe.tif_customization.NoOfStudentsReport = class NoOfStudentsReport {
	constructor(page) {
		this.page = page;
		this.customer_filter = null;
		this.customer_group_filter = null;
		this.territory_filter = null;
		this.city_filter = null;
		this.no_of_students_filter = null;
	}

	make() {
		this.make_filters();
		this.make_layout();
		this.load_data();
	}

	make_filters() {
		this.customer_filter = this.page.add_field({
			label: __("Customer"),
			fieldtype: "Link",
			fieldname: "customer",
			options: "Customer",
			change: () => this.load_data(),
		});

		this.customer_group_filter = this.page.add_field({
			label: __("Customer Group"),
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

		this.city_filter = this.page.add_field({
			label: __("City"),
			fieldtype: "Data",
			fieldname: "city",
			change: () => this.load_data(),
		});

		this.no_of_students_filter = this.page.add_field({
			label: __("No of Students"),
			fieldtype: "Select",
			fieldname: "no_of_students",
			options: "\n1-10\n11-50\n51-100\n101-200\n201-500\n501-1000\n1000+",
			change: () => this.load_data(),
		});

		this.page.set_primary_action(__("Refresh"), () => this.load_data(), "refresh");
		this.page.add_action_item(__("Clear Filters"), () => this.clear_filters());
	}

	make_layout() {
		$(this.page.body).html(`
			<div class="no-of-students-report" style="padding: 16px;">
				<div id="students-summary" class="row" style="margin-bottom: 16px;"></div>
				<div class="table-responsive" style="background: #fff; border: 1px solid #d1d8dd; border-radius: 8px;">
					<table class="table table-bordered" style="margin-bottom: 0;">
						<thead>
							<tr>
								<th>${__("Customer")}</th>
								<th>${__("Customer Name")}</th>
								<th>${__("No of Students")}</th>
								<th>${__("Customer Group")}</th>
								<th>${__("Territory")}</th>
								<th>${__("City")}</th>
								<th>${__("Customer Type")}</th>
								<th>${__("Mobile No")}</th>
								<th>${__("Email")}</th>
							</tr>
						</thead>
						<tbody id="students-report-tbody">
							<tr><td colspan="9" class="text-center text-muted">${__("Loading...")}</td></tr>
						</tbody>
					</table>
				</div>
			</div>
		`);
	}

	get_filters() {
		return {
			customer: this.customer_filter.get_value(),
			customer_group: this.customer_group_filter.get_value(),
			territory: this.territory_filter.get_value(),
			city: this.city_filter.get_value(),
			no_of_students: this.no_of_students_filter.get_value(),
		};
	}

	clear_filters() {
		this.customer_filter.set_value("");
		this.customer_group_filter.set_value("");
		this.territory_filter.set_value("");
		this.city_filter.set_value("");
		this.no_of_students_filter.set_value("");
		this.load_data();
	}

	load_data() {
		const tbody = $(this.page.body).find("#students-report-tbody");
		tbody.html(`<tr><td colspan="9" class="text-center text-muted">${__("Loading...")}</td></tr>`);

		frappe.call({
			method: "tif_customization.tif_customization.page.no_of_students_repor.no_of_students_repor.get_no_of_students_report",
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
						"Unable to load student report"
					)}</td></tr>`
				);
			},
		});
	}

	render_summary(summary) {
		const cards = [
			[__("Total Customers"), summary.total_customers || 0],
			[__("Customers With Students"), summary.customers_with_students || 0],
			[__("Student Ranges"), summary.student_ranges || 0],
			[__("Without Students"), summary.without_students || 0],
		];

		$(this.page.body)
			.find("#students-summary")
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
		const tbody = $(this.page.body).find("#students-report-tbody");

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
							<td>${customer_link}</td>
							<td>${this.escape(row.customer_name)}</td>
							<td class="text-right">${this.escape(row.no_of_students || 0)}</td>
							<td>${customer_group_link || "-"}</td>
							<td>${territory_link || "-"}</td>
							<td>${this.escape(row.city) || "-"}</td>
							<td>${this.escape(row.customer_type)}</td>
							<td>${this.escape(row.mobile_no)}</td>
							<td>${this.escape(row.email_id)}</td>
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
