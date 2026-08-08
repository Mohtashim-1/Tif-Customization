frappe.pages["upcoming-training-report"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Upcoming Training and Workshop"),
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
		this.make_layout();
		this.make_filters();
		this.load_data();
	}

	make_filters() {
		this.type = this.make_filter_control({
			label: __("Type"),
			fieldtype: "Select",
			fieldname: "type",
			options: "\nTraining\nWorkshop",
			change: () => this.load_data(),
		});
		this.from_date = this.make_filter_control({
			label: __("From Date"),
			fieldtype: "Date",
			fieldname: "from_date",
			change: () => this.load_data(),
		});
		this.to_date = this.make_filter_control({
			label: __("To Date"),
			fieldtype: "Date",
			fieldname: "to_date",
			change: () => this.load_data(),
		});
		this.topic = this.make_filter_control({
			label: __("Training Type / Workshop Topic"),
			fieldtype: "Data",
			fieldname: "topic",
			change: () => this.load_data(),
		});
		this.mode_of_training = this.make_filter_control({
			label: __("Mode of Training"),
			fieldtype: "Select",
			fieldname: "mode_of_training",
			options: "\nIn-person\nOnline\nOnsite",
			change: () => this.load_data(),
		});
		this.participants_category = this.make_filter_control({
			label: __("Participants Category"),
			fieldtype: "Select",
			fieldname: "participants_category",
			options: "\nSchool Kids\nTrainees\nTeachers",
			change: () => this.load_data(),
		});
		this.school_name = this.make_filter_control({
			label: __("School Name"),
			fieldtype: "Data",
			fieldname: "school_name",
			change: () => this.load_data(),
		});
		this.city = this.make_filter_control({
			label: __("City"),
			fieldtype: "Link",
			fieldname: "city",
			options: "City",
			change: () => this.load_data(),
		});

		$(this.page.body)
			.find("#upcoming-training-clear-filters")
			.on("click", () => this.clear_filters());

		this.page.set_primary_action(__("Refresh"), () => this.load_data(), "refresh");
		this.page.add_inner_button(__("New Training"), () => this.new_record("Training"));
		this.page.add_inner_button(__("New Workshop"), () => this.new_record("Workshop"));
		this.page.add_action_item(__("Clear Filters"), () => this.clear_filters());
		this.page.add_action_item(__("Export CSV"), () => this.export_csv());
	}

	new_record(type) {
		frappe.route_options = { type };
		frappe.new_doc("Upcoming Training");
	}

	make_filter_control(df) {
		const field_area = $(`<div class="col-md-3 col-sm-6"></div>`).appendTo(
			$(this.page.body).find("#upcoming-training-filters")
		);

		return frappe.ui.form.make_control({
			df,
			parent: field_area,
			render_input: true,
		});
	}

	make_layout() {
		$(this.page.body).html(`
			<div style="padding: 16px;">
				<style>
					.upcoming-training-kpi {
						position: relative;
						overflow: hidden;
						padding: 14px 16px;
						border-radius: 10px;
						min-height: 92px;
						border: 1px solid var(--border-color, #e5e7eb);
					}
					.upcoming-training-kpi:before {
						content: "";
						position: absolute;
						inset: 0 0 auto 0;
						height: 4px;
						background: var(--accent);
					}
					.upcoming-training-kpi__label {
						font-size: 12px;
						font-weight: 600;
						color: var(--text-muted, #6b7280);
					}
					.upcoming-training-kpi__value {
						margin-top: 8px;
						font-size: 28px;
						line-height: 1;
						font-weight: 700;
					}
				</style>
				<div class="frappe-card" style="padding: 14px; margin-bottom: 16px; border-radius: 8px;">
					<div id="upcoming-training-filters" class="row"></div>
					<div class="text-right" style="margin-top: 8px;">
						<button class="btn btn-default btn-sm" id="upcoming-training-clear-filters">${__("Clear Filters")}</button>
					</div>
				</div>
				<div id="upcoming-training-summary" class="row" style="margin-bottom: 16px;"></div>
				<div class="table-responsive" style="background: #fff; border: 1px solid #d1d8dd; border-radius: 8px;">
					<table class="table table-bordered" style="margin-bottom: 0; white-space: nowrap;">
						<thead><tr>${this.columns().map((column) => `<th>${column.label}</th>`).join("")}</tr></thead>
						<tbody id="upcoming-training-tbody">
							<tr><td colspan="${this.columns().length}" class="text-center text-muted">${__("Loading...")}</td></tr>
						</tbody>
					</table>
				</div>
			</div>
		`);
	}

	columns() {
		return [
			{ fieldname: "training_date", label: __("Date") },
			{ fieldname: "training_time", label: __("Time") },
			{ fieldname: "type", label: __("Type") },
			{ fieldname: "month", label: __("Month") },
			{
				fieldname: "topic",
				label: __("Training Type / Workshop Topic"),
				// Training and Workshop store this in different fields; show whichever the row uses.
				value: (row) => row.training_type || row.workshop_topic,
			},
			{ fieldname: "mode_of_training", label: __("Mode of Training") },
			{ fieldname: "participants_category", label: __("Participants Category") },
			{ fieldname: "school_name", label: __("School Name") },
			{ fieldname: "school_type", label: __("School Type") },
			{ fieldname: "department_training", label: __("Department Training") },
			{ fieldname: "city", label: __("City") },
			{ fieldname: "area", label: __("Area") },
			{ fieldname: "trainer_name", label: __("Name of Trainer") },
			{ fieldname: "program", label: __("Program") },
			{ fieldname: "workshop_for", label: __("Workshop For") },
		];
	}

	cell_value(row, column) {
		return column.value ? column.value(row) : row[column.fieldname];
	}

	get_filters() {
		return {
			type: this.type.get_value(),
			from_date: this.from_date.get_value(),
			to_date: this.to_date.get_value(),
			topic: this.topic.get_value(),
			mode_of_training: this.mode_of_training.get_value(),
			participants_category: this.participants_category.get_value(),
			school_name: this.school_name.get_value(),
			city: this.city.get_value(),
		};
	}

	clear_filters() {
		[
			this.type,
			this.from_date,
			this.to_date,
			this.topic,
			this.mode_of_training,
			this.participants_category,
			this.school_name,
			this.city,
		].forEach((field) => field.set_value(""));
		this.load_data();
	}

	load_data() {
		const tbody = $(this.page.body).find("#upcoming-training-tbody");
		const span = this.columns().length;
		tbody.html(`<tr><td colspan="${span}" class="text-center text-muted">${__("Loading...")}</td></tr>`);

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
				tbody.html(`<tr><td colspan="${span}" class="text-center text-danger">${__("Unable to load report")}</td></tr>`);
			},
		});
	}

	render_summary(summary) {
		const cards = [
			[__("Total Records"), summary.total || 0, "#2563eb"],
			[__("Upcoming"), summary.upcoming || 0, "#059669"],
			[__("Completed"), summary.completed || 0, "#64748b"],
			[__("Scheduled Today"), summary.today || 0, "#7c3aed"],
			[__("Trainings"), summary.trainings || 0, "#0891b2"],
			[__("Workshops"), summary.workshops || 0, "#c026d3"],
			[__("Onsite"), summary.onsite || 0, "#059669"],
			[__("Online"), summary.online || 0, "#0284c7"],
			[__("In-person"), summary.in_person || 0, "#ea580c"],
			[__("Areas"), summary.areas || 0, "#be123c"],
			[__("Schools"), summary.schools || 0, "#4f46e5"],
			[__("Cities"), summary.cities || 0, "#0f766e"],
		];
		$(this.page.body)
			.find("#upcoming-training-summary")
			.html(
				cards
					.map(
						([label, value, color]) => `
							<div class="col-lg-3 col-md-4 col-sm-6" style="margin-bottom: 12px;">
								<div class="frappe-card upcoming-training-kpi" style="--accent:${color}">
									<div class="upcoming-training-kpi__label">${label}</div>
									<div class="upcoming-training-kpi__value">${value}</div>
								</div>
							</div>`
					)
					.join("")
			);
	}

	render_rows() {
		const tbody = $(this.page.body).find("#upcoming-training-tbody");
		const columns = this.columns();
		if (!this.rows.length) {
			tbody.html(
				`<tr><td colspan="${columns.length}" class="text-center text-muted">${__(
					"No upcoming trainings or workshops found"
				)}</td></tr>`
			);
			return;
		}

		tbody.html(
			this.rows
				.map((row) => {
					const cells = columns.map((column) => {
						const value = this.escape(this.cell_value(row, column)) || "-";
						if (column.fieldname === "training_date") {
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
			...this.rows.map((row) => columns.map((column) => this.cell_value(row, column) || "")),
		];
		frappe.tools.downloadify(data, null, __("Upcoming Training Report"));
	}

	escape(value) {
		return frappe.utils.escape_html(String(value || ""));
	}
};
