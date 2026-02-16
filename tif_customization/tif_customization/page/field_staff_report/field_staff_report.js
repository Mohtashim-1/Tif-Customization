frappe.pages["field-staff-report"].on_page_load = function (wrapper) {
	new FieldStaffReportPage(wrapper);
};

class FieldStaffReportPage {
	constructor(wrapper) {
		this.suspend_filter_change = false;
		this.page = frappe.ui.make_app_page({
			parent: wrapper,
			title: __("Field Staff Report"),
			single_column: true
		});

		this.setup_layout();
		this.setup_filters();
		this.bind_actions();
		this.load_data();
	}

	get_month_start() {
		const dt = new Date();
		dt.setDate(1);
		return dt.toISOString().slice(0, 10);
	}

	setup_layout() {
		this.body = $(`
			<div class="p-2">
				<div class="border rounded p-3 mb-3">
					<div class="d-flex align-items-center justify-content-between mb-2">
						<h5 class="mb-0">${__("Filters")}</h5>
						<div>
							<button class="btn btn-sm btn-primary fsr-apply">${__("Apply")}</button>
							<button class="btn btn-sm btn-default fsr-reset">${__("Reset")}</button>
						</div>
					</div>
					<div class="row fsr-filter-grid"></div>
				</div>

				<div class="border rounded p-3">
					<div class="d-flex align-items-center justify-content-between mb-2">
						<h5 class="mb-0">${__("Field Visit Reporting")}</h5>
						<div>
							<button class="btn btn-sm btn-success fsr-export-excel">${__("Export Excel")}</button>
							<span class="text-muted fsr-count ml-2"></span>
						</div>
					</div>
					<div class="fsr-table"></div>
				</div>
			</div>
		`);

		$(this.page.body).empty().append(this.body);
	}

	make_filter(df) {
		const col = $('<div class="col-md-3 mb-2"></div>').appendTo(this.body.find(".fsr-filter-grid"));
		const parent = $('<div></div>').appendTo(col);
		const control = frappe.ui.form.make_control({
			parent,
			df: {
				...df,
				change: () => this.on_filter_change()
			},
			render_input: true
		});
		control.refresh();
		if (df.default) control.set_value(df.default);
		return control;
	}

	setup_filters() {
		this.filters = {
			from_date: this.make_filter({
				label: __("From Date"),
				fieldname: "from_date",
				fieldtype: "Date",
				default: this.get_month_start()
			}),
			to_date: this.make_filter({
				label: __("To Date"),
				fieldname: "to_date",
				fieldtype: "Date",
				default: frappe.datetime.get_today()
			}),
			type: this.make_filter({
				label: __("Type"),
				fieldname: "type",
				fieldtype: "Select",
				options: "\nMarketing\nM&E\nTraining"
			}),
			user: this.make_filter({
				label: __("User"),
				fieldname: "user",
				fieldtype: "Link",
				options: "User"
			}),
			province: this.make_filter({
				label: __("Province"),
				fieldname: "province",
				fieldtype: "Select",
				options:
					"\nPunjab\nSindh\nKhyber Pakhtunkhwa\nBalochistan\nAzad Jammu & Kashmir\nGilgit-Baltistan\nIslamabad Capital Territory"
			})
		};
	}

	bind_actions() {
		this.body.find(".fsr-apply").on("click", () => this.load_data());
		this.body.find(".fsr-export-excel").on("click", () => this.export_excel());
		this.body.find(".fsr-reset").on("click", () => {
			this.set_filters({
				from_date: this.get_month_start(),
				to_date: frappe.datetime.get_today(),
				type: "",
				user: "",
				province: ""
			});
			this.load_data();
		});
	}

	on_filter_change() {
		if (this.suspend_filter_change) return;
		this.load_data();
	}

	set_filters(values) {
		this.suspend_filter_change = true;
		Object.entries(values).forEach(([key, value]) => {
			if (this.filters[key]) this.filters[key].set_value(value || "");
		});
		this.suspend_filter_change = false;
	}

	get_filter_values() {
		return {
			from_date: this.filters.from_date.get_value(),
			to_date: this.filters.to_date.get_value(),
			type: this.filters.type.get_value(),
			user: this.filters.user.get_value(),
			province: this.filters.province.get_value()
		};
	}

	load_data() {
		this.body.find(".fsr-table").html(`<div class="text-muted">${__("Loading...")}</div>`);
		frappe.call({
			method: "tif_customization.tif_customization.page.field_staff_report.field_staff_report.get_report_data",
			args: { filters: this.get_filter_values() },
			freeze: false,
			callback: (r) => {
				const data = r.message || { rows: [], columns: [], labels: {}, total_count: 0 };
				this.render_table(data.rows || [], data.columns || [], data.labels || {});
				this.body.find(".fsr-count").text(`${data.total_count || 0} ${__("records")}`);
			}
		});
	}

	export_excel() {
		const filters = encodeURIComponent(JSON.stringify(this.get_filter_values()));
		const url = `/api/method/tif_customization.tif_customization.page.field_staff_report.field_staff_report.download_report_excel?filters=${filters}`;
		window.open(url, "_blank");
	}

	render_table(rows, columns, labels) {
		if (!rows.length) {
			this.body.find(".fsr-table").html(`<div class="text-muted">${__("No data found.")}</div>`);
			return;
		}

		const safeColumns = columns.length ? columns : Object.keys(rows[0] || {});
		const head = safeColumns
			.map((col) => `<th>${frappe.utils.escape_html(labels[col] || col)}</th>`)
			.join("");
		const body = rows
			.map((row) => {
				const tds = safeColumns
					.map((col) => {
						const value = row[col];
						if (col === "name") {
							const id = frappe.utils.escape_html(value || "");
							return `<td><a href="/app/field-visit/${id}">${id}</a></td>`;
						}
						return `<td>${frappe.utils.escape_html(value == null || value === "" ? "-" : String(value))}</td>`;
					})
					.join("");
				return `<tr>${tds}</tr>`;
			})
			.join("");

		this.body.find(".fsr-table").html(`
			<div class="table-responsive">
				<table class="table table-bordered table-hover mb-0">
					<thead><tr>${head}</tr></thead>
					<tbody>${body}</tbody>
				</table>
			</div>
		`);
	}
}
