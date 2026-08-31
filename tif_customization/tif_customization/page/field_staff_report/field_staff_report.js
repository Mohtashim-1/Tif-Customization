frappe.pages["field-staff-report"].on_page_load = function (wrapper) {
	frappe.require("/assets/tif_customization/css/field_staff_report.css");
	frappe.require("/assets/tif_customization/js/field_visit_drilldown.js", () => {
		new FieldStaffReportPage(wrapper);
	});
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
		this.apply_route_options();
		this.bind_actions();
		this.offset = 0;
		this.page_size = 100;
		this.load_data();
	}

	apply_route_options() {
		const route = frappe.route_options || {};
		if (route.from_date && this.filters.from_date) this.filters.from_date.set_value(route.from_date);
		if (route.to_date && this.filters.to_date) this.filters.to_date.set_value(route.to_date);
		if (route.user && this.filters.user) this.filters.user.set_value(route.user);
		if (route.type && this.filters.type) this.filters.type.set_value(route.type);
		frappe.route_options = null;
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

				<div class="fsr-kpis mb-2"></div>
				<p class="fsr-breakdown fsr-breakdown-note"></p>

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
					<div class="fsr-pager mb-2 d-flex align-items-center"></div>
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
			df: { ...df },
			render_input: true
		});
		control.refresh();
		if (df.default) control.set_value(df.default);
		return control;
	}

	setup_filters() {
		this.filters = {
			from_date: this.make_filter({
				label: __("Visit From Date"),
				fieldname: "from_date",
				fieldtype: "Date",
				default: this.get_month_start()
			}),
			to_date: this.make_filter({
				label: __("Visit To Date"),
				fieldname: "to_date",
				fieldtype: "Date",
				default: frappe.datetime.get_today()
			}),
			type: this.make_filter({
				label: __("Type"),
				fieldname: "type",
				fieldtype: "Select",
				options: "\nMarketing\nM&E\nTraining\nMeeting\nAcademic / Other Official Tasks"
			}),
			user: this.make_filter({
				label: __("Field Staff"),
				fieldname: "user",
				fieldtype: "Select",
				options: "\n",
			}),
			province: this.make_filter({
				label: __("Province"),
				fieldname: "province",
				fieldtype: "Select",
				options:
					"\nPunjab\nSindh\nKhyber Pakhtunkhwa\nBalochistan\nAzad Jammu & Kashmir\nGilgit-Baltistan\nIslamabad Capital Territory"
			})
		};
		this.load_team_filter_options();
	}

	async load_team_filter_options() {
		try {
			const r = await frappe.call({
				method: "tif_customization.tif_customization.field_visit_permissions.get_my_field_team",
			});
			const team = r.message?.team || [];
			const opts = [""].concat(
				team.map((t) => t.employee_name || t.user_id || t.employee).filter(Boolean)
			);
			const unique = [...new Set(opts)];
			this.filters.user.df.options = unique.join("\n");
			this.filters.user.refresh();
		} catch (e) {
			console.warn("Could not load field team filter", e);
		}
	}

	bind_actions() {
		this.body.find(".fsr-apply").on("click", () => {
			this.offset = 0;
			this.load_data();
		});
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
			this.offset = 0;
			this.load_data();
		});
		this.body.find(".fsr-pager").on("click", ".fsr-prev:not(:disabled)", () => {
			this.offset = Math.max(0, this.offset - this.page_size);
			this.load_data();
		});
		this.body.find(".fsr-pager").on("click", ".fsr-next:not(:disabled)", () => {
			this.offset = this.offset + this.page_size;
			this.load_data();
		});
		this.body.on("click", "[data-visit-metric]", (e) => {
			const metric = $(e.currentTarget).attr("data-visit-metric");
			if (!metric) return;
			const f = this.get_filter_values();
			frappe.tif_customization.open_visit_drilldown({
				from_date: f.from_date,
				to_date: f.to_date,
				staff: f.user,
				metric,
			});
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
		const filters = {
			...this.get_filter_values(),
			limit: this.page_size,
			offset: this.offset,
		};
		frappe.call({
			method: "tif_customization.tif_customization.page.field_staff_report.field_staff_report.get_report_data",
			args: { filters },
			freeze: false,
			callback: (r) => {
				const data = r.message || { rows: [], columns: [], labels: {}, total_count: 0, summary: {} };
				this.render_kpis(data.summary || {});
				this.render_breakdown(data.summary || {});
				this.render_table(data.rows || [], data.columns || [], data.labels || {});
				this.render_pager(data);
				const total = data.total_count || 0;
				const shown = data.shown_count || (data.rows || []).length;
				this.body.find(".fsr-count").text(
					total > shown
						? `${shown} ${__("of")} ${total} ${__("records")}`
						: `${total} ${__("records")}`
				);
			},
			error: () => {
				this.body.find(".fsr-table").html(`<div class="text-danger">${__("Failed to load report.")}</div>`);
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
			[__("Total Visits"), summary.total_visits || 0, "primary", "visits"],
			[__("Marketing Visits"), summary.marketing_visits || 0, "marketing", "marketing"],
			[__("M&E Visits"), summary.me_visits || 0, "me", "me"],
			[__("Training Visits"), summary.training_visits || 0, "training", "training"],
			[__("Meeting Visits"), summary.meeting_visits || 0, "meeting", "meeting"],
			[__("Other Visits"), summary.other_visits || 0, "other", "other"],
			[__("Active Field Staff"), summary.active_staff || 0, "staff", ""],
		];

		this.body.find(".fsr-kpis").html(
			cards
				.map(
					([label, value, style, metric]) => `
				<div class="fsr-kpi fsr-kpi--${style}" ${metric ? `data-visit-metric="${metric}"` : ""}>
					<div class="fsr-kpi__label">${label}</div>
					<div class="fsr-kpi__value">${frappe.utils.escape_html(String(value))}</div>
					${metric ? `<div class="fsr-kpi__hint">${__("Click to see documents")}</div>` : ""}
				</div>`
				)
				.join("")
		);
	}

	render_breakdown(summary) {
		const total = summary.total_visits || 0;
		const parts = [
			["marketing", __("Marketing"), summary.marketing_visits || 0],
			["me", __("M&E"), summary.me_visits || 0],
			["meeting", __("Meetings"), summary.meeting_visits || 0],
			["training", __("Training"), summary.training_visits || 0],
			["other", __("Other / Academic"), summary.other_visits || 0],
		]
			.map(
				([metric, label, n]) =>
					`<span class="fsr-break-part" data-visit-metric="${metric}">${label} ${n}</span>`
			)
			.join(" + ");
		this.body.find(".fsr-breakdown-note").html(
			`<strong class="fsr-break-part" data-visit-metric="visits">${__("Total visits")}: ${total}</strong>
			= ${parts}.
			${__("This is every Field Visit type. Click any number (cards or this line) to open those documents.")}`
		);
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

	render_pager(data) {
		const total = data.total_count || 0;
		const offset = data.offset || 0;
		const shown = data.shown_count || (data.rows || []).length;
		const from = total ? offset + 1 : 0;
		const to = Math.min(offset + shown, total);
		const hasPrev = offset > 0;
		const hasNext = offset + shown < total;
		this.body.find(".fsr-pager").html(`
			<button type="button" class="btn btn-xs btn-default fsr-prev" ${hasPrev ? "" : "disabled"}>${__("Previous")}</button>
			<span class="mx-2 text-muted">
				${__("Showing")} ${from}–${to} ${__("of")} ${total}.
				${__("Click Document No for full details. Use Export for the complete list.")}
			</span>
			<button type="button" class="btn btn-xs btn-default fsr-next" ${hasNext ? "" : "disabled"}>${__("Next")}</button>
		`);
	}
}
