frappe.pages["field-staff-report"].on_page_load = function (wrapper) {
	frappe.require("/assets/tif_customization/css/field_staff_report.css");
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

				<div class="fsr-kpis mb-3"></div>

				<div class="border rounded p-3 mb-3 fsr-ratio-panel">
					<div class="d-flex align-items-center justify-content-between mb-2">
						<h5 class="mb-0">${__("Field Staff Wise Ratio")}</h5>
						<span class="text-muted small">${__("Share of total field visits")}</span>
					</div>
					<div class="fsr-staff-ratios"></div>
				</div>

				<div class="border rounded p-3">
					<div class="d-flex align-items-center justify-content-between mb-2">
						<h5 class="mb-0">${__("Field Visit Reporting")}</h5>
						<div>
							<div class="btn-group">
								<button class="btn btn-sm btn-success dropdown-toggle" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
									${__("Export")}
								</button>
								<div class="dropdown-menu dropdown-menu-right">
									<a class="dropdown-item fsr-export-excel" href="#">${__("Export Excel")}</a>
									<a class="dropdown-item fsr-export-csv" href="#">${__("Export CSV")}</a>
								</div>
							</div>
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
		this.body.find(".fsr-export-excel").on("click", (e) => {
			e.preventDefault();
			this.export_excel();
		});
		this.body.find(".fsr-export-csv").on("click", (e) => {
			e.preventDefault();
			this.export_csv();
		});
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
				const calculated = this.build_client_summary(data.rows || []);
				this.render_kpis(data.summary || calculated.summary);
				this.render_staff_ratios(data.staff_wise || calculated.staff_wise);
				this.render_table(data.rows || [], data.columns || [], data.labels || {});
				this.body.find(".fsr-count").text(`${data.total_count || 0} ${__("records")}`);
			}
		});
	}

	build_client_summary(rows) {
		const typeKeys = {
			Marketing: "marketing",
			"M&E": "me",
			Training: "training",
			Meeting: "meeting",
			Other: "other"
		};
		const typeCounts = { marketing: 0, me: 0, training: 0, meeting: 0, other: 0 };
		const staffMap = new Map();

		rows.forEach((row) => {
			const visitType = row.type || "Other";
			const typeKey = typeKeys[visitType] || "other";
			typeCounts[typeKey] += 1;
			const staff = this.get_row_staff(row).trim() || __("Unassigned");
			const staffKey = staff.toLocaleLowerCase();
			if (!staffMap.has(staffKey)) {
				staffMap.set(staffKey, {
					staff,
					total_visits: 0,
					marketing: 0,
					me: 0,
					training: 0,
					meeting: 0,
					other: 0
				});
			}
			const staffRow = staffMap.get(staffKey);
			staffRow.total_visits += 1;
			staffRow[typeKey] += 1;
		});

		const totalVisits = rows.length;
		const staffWise = [...staffMap.values()]
			.map((row) => ({
				...row,
				ratio: totalVisits ? Number((row.total_visits / totalVisits * 100).toFixed(1)) : 0
			}))
			.sort((a, b) => b.total_visits - a.total_visits || a.staff.localeCompare(b.staff));

		return {
			summary: {
				total_visits: totalVisits,
				marketing_visits: typeCounts.marketing,
				me_visits: typeCounts.me,
				training_visits: typeCounts.training,
				meeting_visits: typeCounts.meeting,
				other_visits: typeCounts.other,
				active_staff: staffWise.length,
				visits_per_staff: staffWise.length
					? Number((totalVisits / staffWise.length).toFixed(1))
					: 0
			},
			staff_wise: staffWise
		};
	}

	get_row_staff(row) {
		if (row.type === "Marketing") return row.visit_by || row.owner || "";
		if (row.type === "M&E") return row.me_visit_by || row.owner || "";
		if (row.type === "Training") return row.training_entry_filled_by || row.owner || "";
		if (row.type === "Meeting") return row.mt_visit_by || row.owner || "";
		return row.owner || "";
	}

	render_kpis(summary) {
		const cards = [
			[__("Total Visits"), summary.total_visits || 0, "primary"],
			[__("Marketing Visits"), summary.marketing_visits || 0, "marketing"],
			[__("M&E Visits"), summary.me_visits || 0, "me"],
			[__("Training Visits"), summary.training_visits || 0, "training"],
			[__("Meeting Visits"), summary.meeting_visits || 0, "meeting"],
			[__("Other Visits"), summary.other_visits || 0, "other"],
			[__("Active Field Staff"), summary.active_staff || 0, "staff"],
			[__("Visits / Staff"), summary.visits_per_staff || 0, "ratio"]
		];

		this.body.find(".fsr-kpis").html(
			cards.map(([label, value, style]) => `
				<div class="fsr-kpi fsr-kpi--${style}">
					<div class="fsr-kpi__label">${label}</div>
					<div class="fsr-kpi__value">${frappe.utils.escape_html(String(value))}</div>
				</div>
			`).join("")
		);
	}

	render_staff_ratios(rows) {
		const $target = this.body.find(".fsr-staff-ratios");
		if (!rows.length) {
			$target.html(`<div class="text-muted">${__("No field staff activity found.")}</div>`);
			return;
		}

		const body = rows.map((row) => `
			<tr>
				<td>${frappe.utils.escape_html(row.staff || __("Unassigned"))}</td>
				<td class="text-right font-weight-bold">${row.total_visits || 0}</td>
				<td>
					<div class="fsr-ratio-cell">
						<div class="fsr-ratio-track"><span style="width:${Math.min(Number(row.ratio) || 0, 100)}%"></span></div>
						<strong>${Number(row.ratio || 0).toFixed(1)}%</strong>
					</div>
				</td>
				<td class="text-right">${row.marketing || 0}</td>
				<td class="text-right">${row.me || 0}</td>
				<td class="text-right">${row.training || 0}</td>
				<td class="text-right">${row.meeting || 0}</td>
				<td class="text-right">${row.other || 0}</td>
			</tr>
		`).join("");

		$target.html(`
			<div class="table-responsive">
				<table class="table table-bordered table-hover mb-0 fsr-ratio-table">
					<thead><tr>
						<th>${__("Field Staff")}</th>
						<th class="text-right">${__("Total Visits")}</th>
						<th>${__("Visit Ratio")}</th>
						<th class="text-right">${__("Marketing")}</th>
						<th class="text-right">${__("M&E")}</th>
						<th class="text-right">${__("Training")}</th>
						<th class="text-right">${__("Meeting")}</th>
						<th class="text-right">${__("Other")}</th>
					</tr></thead>
					<tbody>${body}</tbody>
				</table>
			</div>
		`);
	}

	export_excel() {
		const filters = encodeURIComponent(JSON.stringify(this.get_filter_values()));
		const url = `/api/method/tif_customization.tif_customization.page.field_staff_report.field_staff_report.download_report_excel?filters=${filters}`;
		window.open(url, "_blank");
	}

	export_csv() {
		const filters = encodeURIComponent(JSON.stringify(this.get_filter_values()));
		const url = `/api/method/tif_customization.tif_customization.page.field_staff_report.field_staff_report.download_report_csv?filters=${filters}`;
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
