frappe.pages["upcoming-training-report"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Upcoming Training Report"),
		single_column: true,
	});

	new frappe.tif_customization.UpcomingTrainingReport(page).make();
};

frappe.tif_customization = frappe.tif_customization || {};

frappe.tif_customization.UpcomingTrainingReport = class UpcomingTrainingReport {
	constructor(page) {
		this.page = page;
		this.rows = [];
	}

	make() {
		this.make_filters();
		this.make_layout();
		this.load_data();
	}

	make_filters() {
		this.from_date = this.page.add_field({
			label: __("From Date"),
			fieldtype: "Date",
			fieldname: "from_date",
		});
		this.to_date = this.page.add_field({
			label: __("To Date"),
			fieldtype: "Date",
			fieldname: "to_date",
		});
		this.training_type = this.page.add_field({
			label: __("Training Type"),
			fieldtype: "Data",
			fieldname: "training_type",
		});
		this.school_name = this.page.add_field({
			label: __("School Name"),
			fieldtype: "Link",
			fieldname: "school_name",
			options: "School",
		});
		this.city = this.page.add_field({
			label: __("City"),
			fieldtype: "Link",
			fieldname: "city",
			options: "City",
		});

		this.page.set_primary_action(__("Refresh"), () => this.load_data(), "refresh");
		this.page.add_inner_button(__("New Training"), () => frappe.new_doc("Upcoming Training"));
		this.page.add_action_item(__("Clear Filters"), () => this.clear_filters());
		this.page.add_action_item(__("Export CSV"), () => this.export_csv());
	}

	make_layout() {
		$(this.page.body).html(`
			<div style="padding: 16px;">
				<div id="upcoming-training-summary" class="row" style="margin-bottom: 16px;"></div>
				<div class="table-responsive" style="background: #fff; border: 1px solid #d1d8dd; border-radius: 8px;">
					<table class="table table-bordered" style="margin-bottom: 0; white-space: nowrap;">
						<thead><tr>${this.columns().map((column) => `<th>${column.label}</th>`).join("")}</tr></thead>
						<tbody id="upcoming-training-tbody">
							<tr><td colspan="12" class="text-center text-muted">${__("Loading...")}</td></tr>
						</tbody>
					</table>
				</div>
			</div>
		`);
	}

	columns() {
		return [
			{ fieldname: "training_date", label: __("UP Coming Training Date") },
			{ fieldname: "training_time", label: __("UP Coming Training Time") },
			{ fieldname: "training_type", label: __("UP Coming Training Type") },
			{ fieldname: "mode_of_training", label: __("Mode of Training") },
			{ fieldname: "participants_category", label: __("Participants Category") },
			{ fieldname: "school_name", label: __("School Name") },
			{ fieldname: "school_type", label: __("School Type") },
			{ fieldname: "department_training", label: __("Department Training") },
			{ fieldname: "city", label: __("City") },
			{ fieldname: "area", label: __("Area") },
			{ fieldname: "trainer_name", label: __("Name of Trainer") },
			{ fieldname: "program", label: __("Program") },
		];
	}

	get_filters() {
		return {
			from_date: this.from_date.get_value(),
			to_date: this.to_date.get_value(),
			training_type: this.training_type.get_value(),
			school_name: this.school_name.get_value(),
			city: this.city.get_value(),
		};
	}

	clear_filters() {
		[this.from_date, this.to_date, this.training_type, this.school_name, this.city].forEach((field) =>
			field.set_value("")
		);
		this.load_data();
	}

	load_data() {
		const tbody = $(this.page.body).find("#upcoming-training-tbody");
		tbody.html(`<tr><td colspan="12" class="text-center text-muted">${__("Loading...")}</td></tr>`);

		frappe.call({
			method:
				"tif_customization.tif_customization.page.upcoming_training_report.upcoming_training_report.get_report_data",
			args: { filters: this.get_filters() },
			callback: (response) => {
				const data = response.message || {};
				this.rows = data.rows || [];
				this.render_summary(data.summary || {});
				this.render_rows();
			},
			error: () => {
				tbody.html(`<tr><td colspan="12" class="text-center text-danger">${__("Unable to load report")}</td></tr>`);
			},
		});
	}

	render_summary(summary) {
		const cards = [
			[__("Total Trainings"), summary.total || 0],
			[__("Training Today"), summary.today || 0],
			[__("Schools"), summary.schools || 0],
			[__("Cities"), summary.cities || 0],
		];
		$(this.page.body)
			.find("#upcoming-training-summary")
			.html(
				cards
					.map(
						([label, value]) => `<div class="col-md-3"><div class="frappe-card" style="padding: 14px; border-radius: 8px;"><div class="text-muted">${label}</div><div style="font-size: 26px; font-weight: 600;">${value}</div></div></div>`
					)
					.join("")
			);
	}

	render_rows() {
		const tbody = $(this.page.body).find("#upcoming-training-tbody");
		if (!this.rows.length) {
			tbody.html(`<tr><td colspan="12" class="text-center text-muted">${__("No upcoming trainings found")}</td></tr>`);
			return;
		}

		tbody.html(
			this.rows
				.map((row) => {
					const cells = this.columns().map((column, index) => {
						const value = this.escape(row[column.fieldname]) || "-";
						if (index === 0) {
							return `<td><a href="${frappe.utils.get_form_link("Upcoming Training", row.name)}">${value}</a></td>`;
						}
						return `<td>${value}</td>`;
					});
					return `<tr>${cells.join("")}</tr>`;
				})
				.join("")
		);
	}

	export_csv() {
		if (!this.rows.length) {
			frappe.msgprint(__("There is no data to export"));
			return;
		}
		const columns = this.columns();
		const data = [
			columns.map((column) => column.label),
			...this.rows.map((row) => columns.map((column) => row[column.fieldname] || "")),
		];
		frappe.tools.downloadify(data, null, __("Upcoming Training Report"));
	}

	escape(value) {
		return frappe.utils.escape_html(String(value || ""));
	}
};
