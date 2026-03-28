frappe.pages["school-dashboard"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: "School Dashboard",
		single_column: true,
	});

	new frappe.tif_customization.SchoolDashboard(page).make();
};

frappe.tif_customization = frappe.tif_customization || {};

frappe.tif_customization.SchoolDashboard = class SchoolDashboard {
	constructor(page) {
		this.page = page;
		this.school_filter = null;
		this.school_name_filter = null;
		this.field_officer_name_filter = null;
		this.status_filter = null;
		this.tps_filter = null;
		this.qps_filter = null;
		this.cee_filter = null;
		this.workshop_status_filter = null;
		this.include_upcoming_trainings_filter = null;

		this.debounced_load = frappe.utils.debounce(() => this.load_data(), 300);
	}

	make() {
		this.make_filters();
		this.make_layout();
		this.bind_events();
		this.load_data();
	}

	make_filters() {
		this.school_filter = this.page.add_field({
			label: __("School"),
			fieldtype: "Link",
			fieldname: "school",
			options: "School",
			change: () => this.load_data(),
		});

		this.school_name_filter = this.page.add_field({
			label: __("School Name"),
			fieldtype: "Data",
			fieldname: "school_name",
			change: () => this.load_data(),
		});

		this.field_officer_name_filter = this.page.add_field({
			label: __("Field Officer Name"),
			fieldtype: "Data",
			fieldname: "field_officer_name",
			change: () => this.load_data(),
		});

		this.status_filter = this.page.add_field({
			label: __("Status"),
			fieldtype: "Select",
			fieldname: "status",
			options:
				"\nActive\nInactive\nClosed\nIn Process\nNot Interested\nDirect Requirement Received",
			change: () => this.load_data(),
		});

		this.tps_filter = this.page.add_field({
			label: __("TPS"),
			fieldtype: "Select",
			fieldname: "tps",
			options: "\nYes\nNo",
			change: () => this.load_data(),
		});

		this.qps_filter = this.page.add_field({
			label: __("QPS"),
			fieldtype: "Select",
			fieldname: "qps",
			options: "\nYes\nNo",
			change: () => this.load_data(),
		});

		this.cee_filter = this.page.add_field({
			label: __("CEE"),
			fieldtype: "Select",
			fieldname: "cee",
			options: "\nYes\nNo",
			change: () => this.load_data(),
		});

		this.workshop_status_filter = this.page.add_field({
			label: __("Workshop Status"),
			fieldtype: "Select",
			fieldname: "workshop_status",
			options: "\nIn Process\nNot Interested\nAgreed\nUnknown",
			change: () => this.load_data(),
		});

		this.include_upcoming_trainings_filter = this.page.add_field({
			label: __("Upcoming Trainings"),
			fieldtype: "Check",
			fieldname: "include_upcoming_trainings",
			change: () => this.load_data(),
		});

		this.page.set_primary_action(__("Refresh"), () => this.load_data(), "refresh");
	}

	make_layout() {
		const html = `
			<div class="school-dashboard-wrap" style="padding: 16px;">
				<div id="school-kpi-grid" class="row" style="margin-bottom: 16px;"></div>
				<div class="table-responsive" style="background: #fff; border: 1px solid #d1d8dd; border-radius: 8px;">
					<table class="table table-bordered" style="margin-bottom: 0;">
						<thead>
							<tr>
								<th>School Name</th>
								<th>Field Officer</th>
								<th>Status</th>
								<th>Services</th>
								<th>Remarks</th>
								<th>TPS</th>
								<th>QPS</th>
								<th>CEE</th>
								<th>Qaida/Guide Dispatch</th>
								<th>MQH Dispatch</th>
								<th>Workshop / Training</th>
								<th>Workshop Status</th>
							</tr>
						</thead>
						<tbody id="school-dashboard-tbody">
							<tr><td colspan="12" class="text-center text-muted">Loading...</td></tr>
						</tbody>
					</table>
				</div>
				<div id="upcoming-trainings-section" style="margin-top: 16px; display: none;"></div>
			</div>
		`;

		$(this.page.body).find(".school-dashboard-wrap").remove();
		$(this.page.body).append(html);
	}

	bind_events() {
		$(this.page.body).on("click", ".school-open-link", function () {
			const school = $(this).data("school");
			if (school) {
				frappe.set_route("Form", "School", school);
			}
		});

		$(this.page.body).on("click", ".school-remarks-link", (e) => {
			const school = $(e.currentTarget).data("school");
			const school_name = $(e.currentTarget).data("schoolName");
			if (school) this.open_remarks_dialog(school, school_name);
		});

		// Make text search feel like "search", not "filter-on-blur"
		if (this.school_name_filter && this.school_name_filter.$input) {
			this.school_name_filter.$input.on("input", () => this.debounced_load());
		}
		if (this.field_officer_name_filter && this.field_officer_name_filter.$input) {
			this.field_officer_name_filter.$input.on("input", () => this.debounced_load());
		}
	}

	load_data() {
		const school = this.school_filter ? this.school_filter.get_value() : "";
		const school_name = this.school_name_filter ? this.school_name_filter.get_value() : "";
		const field_officer_name = this.field_officer_name_filter
			? this.field_officer_name_filter.get_value()
			: "";
		const status = this.status_filter ? this.status_filter.get_value() : "";
		const tps = this.tps_filter ? this.tps_filter.get_value() : "";
		const qps = this.qps_filter ? this.qps_filter.get_value() : "";
		const cee = this.cee_filter ? this.cee_filter.get_value() : "";
		const workshop_status = this.workshop_status_filter
			? this.workshop_status_filter.get_value()
			: "";
		const include_upcoming_trainings = this.include_upcoming_trainings_filter
			? this.include_upcoming_trainings_filter.get_value()
			: 0;

		frappe.call({
			method: "tif_customization.tif_customization.page.school_dashboard.school_dashboard.get_dashboard_data",
			args: {
				school,
				school_name,
				field_officer_name,
				status,
				tps,
				qps,
				cee,
				workshop_status,
				include_upcoming_trainings,
			},
			callback: (r) => {
				const data = r.message || {};
				if (data.error) {
					frappe.msgprint(__("Unable to load dashboard: {0}", [data.error]));
					return;
				}
				this.render_kpis(data.kpis || {});
				this.render_rows(data.rows || []);
				this.render_upcoming_trainings(data.upcoming_trainings || [], include_upcoming_trainings);
			},
			error: () => {
				frappe.msgprint(__("Failed to load school dashboard data."));
			},
		});
	}

	render_kpis(kpis) {
		const card_data = [
			{ label: "Total Schools", value: kpis.total_schools || 0 },
			{ label: "Active Schools", value: kpis.active_schools || 0 },
			{ label: "Inactive Schools", value: kpis.inactive_schools || 0 },
			{ label: "Closed Schools", value: kpis.closed_schools || 0 },
			{ label: "In Process Schools", value: kpis.in_process_schools || 0 },
			{ label: "Not Interested", value: kpis.not_interested_schools || 0 },
			{
				label: "Direct Requirement Received",
				value: kpis.direct_requirement_received_schools || 0,
			},
			{ label: "TPS Schools", value: kpis.tps_schools || 0 },
			{ label: "QPS Schools", value: kpis.qps_schools || 0 },
			{ label: "CEE Schools", value: kpis.cee_schools || 0 },
			{ label: "Qaida/Guide Dispatch", value: this.format_number(kpis.qaida_guide_dispatch || 0) },
			{ label: "MQH Dispatch", value: this.format_number(kpis.mqh_dispatch || 0) },
			{ label: "Workshop In Process", value: kpis.workshop_in_process || 0 },
			{ label: "Workshop Not Interested", value: kpis.workshop_not_interested || 0 },
		];

		if (typeof kpis.upcoming_trainings !== "undefined") {
			card_data.unshift({ label: "Upcoming Trainings", value: kpis.upcoming_trainings || 0 });
		}

		const html = card_data
			.map(
				(card) => `
				<div class="col-md-4 col-sm-6" style="margin-bottom: 12px;">
					<div style="padding: 12px; border: 1px solid #d1d8dd; border-radius: 8px; background: #f8f9fa;">
						<div class="text-muted small">${frappe.utils.escape_html(card.label)}</div>
						<div style="font-size: 22px; font-weight: 600;">${frappe.utils.escape_html(String(card.value))}</div>
					</div>
				</div>
			`
			)
			.join("");

		$("#school-kpi-grid").html(html);
	}

	render_rows(rows) {
		if (!rows.length) {
			$("#school-dashboard-tbody").html(
				`<tr><td colspan="12" class="text-center text-muted">No data found.</td></tr>`
			);
			return;
		}

		const html = rows
			.map((row) => {
				const school_name = frappe.utils.escape_html(row.school_name || "");
				const workshop_training = frappe.utils.escape_html(row.workshop_training || "Not Set");
				const workshop_status = frappe.utils.escape_html(row.workshop_status || "Unknown");
				const qaida = this.format_number(row.qaida_guide_dispatch || 0);
				const mqh = this.format_number(row.mqh_dispatch || 0);
				const tps = this.as_yes_no(row.tps, "TPS is associated with this school");
				const qps = this.as_yes_no(row.qps, "QPS is associated with this school");
				const cee = this.as_yes_no(row.cee, "CEE is associated with this school");
				const status = frappe.utils.escape_html(row.status_display || row.status || "-");
				const services = frappe.utils.escape_html(row.services || "-");
				const field_officer =
					frappe.utils.escape_html(row.field_officer_name || "") ||
					frappe.utils.escape_html(row.field_officer || "-");
				const latest_remark = (row.latest_remark || "").trim();
				const remark_short = latest_remark
					? frappe.utils.escape_html(frappe.utils.ellipsis(latest_remark, 80))
					: "-";

				return `
					<tr>
						<td>
							<a href="javascript:void(0)" class="school-open-link" data-school="${frappe.utils.escape_html(row.school || "")}">
								${school_name || "-"}
							</a>
						</td>
						<td>${field_officer || "-"}</td>
						<td>${status}</td>
						<td>${services}</td>
						<td>
							<a href="javascript:void(0)" class="school-remarks-link" data-school="${frappe.utils.escape_html(row.school || "")}" data-school-name="${school_name}">
								${remark_short}
							</a>
						</td>
						<td>${tps}</td>
						<td>${qps}</td>
						<td>${cee}</td>
						<td class="text-right">${qaida}</td>
						<td class="text-right">${mqh}</td>
						<td>${workshop_training}</td>
						<td>${workshop_status}</td>
					</tr>
				`;
			})
			.join("");

		$("#school-dashboard-tbody").html(html);
	}

	render_upcoming_trainings(rows, include_upcoming_trainings) {
		const show = !!cint(include_upcoming_trainings);
		if (!show) {
			$("#upcoming-trainings-section").hide().empty();
			return;
		}

		const body = rows.length
			? `
				<div class="table-responsive" style="background: #fff; border: 1px solid #d1d8dd; border-radius: 8px;">
					<table class="table table-bordered" style="margin-bottom: 0;">
						<thead>
							<tr>
								<th>Date</th>
								<th>Session Category</th>
								<th>Trainer</th>
								<th>City</th>
								<th>Province</th>
								<th>Venue</th>
								<th class="text-right">Participants</th>
								<th class="text-right">Schools</th>
							</tr>
						</thead>
						<tbody>
							${rows
								.map((r) => {
									const date = frappe.utils.escape_html(r.training_date || "-");
									const category = frappe.utils.escape_html(r.training_session_category || "-");
									const trainer = frappe.utils.escape_html(r.training_trainer_name || "-");
									const city = frappe.utils.escape_html(r.training_city || "-");
									const province = frappe.utils.escape_html(r.training_province || "-");
									const venue = frappe.utils.escape_html(r.training_venue_name || "-");
									const participants = this.format_number(r.training_no_of_participants || 0);
									const schools = this.format_number(r.training_no_of_schools_attended || 0);
									return `
										<tr>
											<td>${date}</td>
											<td>${category}</td>
											<td>${trainer}</td>
											<td>${city}</td>
											<td>${province}</td>
											<td>${venue}</td>
											<td class="text-right">${participants}</td>
											<td class="text-right">${schools}</td>
										</tr>
									`;
								})
								.join("")}
						</tbody>
					</table>
				</div>
			`
			: `<div class="text-muted">No upcoming trainings found.</div>`;

		const html = `
			<div style="padding: 12px; border: 1px solid #d1d8dd; border-radius: 8px; background: #f8f9fa;">
				<div style="font-size: 16px; font-weight: 600; margin-bottom: 8px;">Upcoming Trainings</div>
				${body}
			</div>
		`;

		$("#upcoming-trainings-section").html(html).show();
	}

	open_remarks_dialog(school, school_name) {
		const dialog = new frappe.ui.Dialog({
			title: __("Remarks: {0}", [school_name || school]),
			fields: [
				{
					fieldname: "history_html",
					fieldtype: "HTML",
				},
				{
					fieldname: "new_remark",
					label: __("Add Remark"),
					fieldtype: "Small Text",
					reqd: 1,
				},
			],
			primary_action_label: __("Add"),
			primary_action: () => {
				const values = dialog.get_values();
				if (!values || !values.new_remark) return;
				frappe.call({
					method: "tif_customization.tif_customization.page.school_dashboard.school_dashboard.add_school_remark",
					args: { school, remark: values.new_remark },
					callback: () => {
						dialog.set_value("new_remark", "");
						this.refresh_remarks_history(dialog, school);
						this.load_data();
					},
				});
			},
		});

		dialog.show();
		this.refresh_remarks_history(dialog, school);
	}

	refresh_remarks_history(dialog, school) {
		const $wrapper = $(dialog.fields_dict.history_html.wrapper);
		$wrapper.html(`<div class="text-muted">Loading...</div>`);

		frappe.call({
			method: "tif_customization.tif_customization.page.school_dashboard.school_dashboard.get_school_remarks",
			args: { school },
			callback: (r) => {
				const rows = r.message || [];
				if (!rows.length) {
					$wrapper.html(`<div class="text-muted">No remarks yet.</div>`);
					return;
				}
				const html = rows
					.map((row) => {
						const by = frappe.utils.escape_html(row.owner || "");
						const when = row.creation ? frappe.datetime.str_to_user(row.creation) : "";
						const content = frappe.utils.escape_html(row.content || "");
						return `
							<div style="padding: 8px 0; border-bottom: 1px solid #eee;">
								<div class="text-muted small">${by} • ${frappe.utils.escape_html(when)}</div>
								<div>${content || "-"}</div>
							</div>
						`;
					})
					.join("");
				$wrapper.html(`<div style="max-height: 320px; overflow: auto;">${html}</div>`);
			},
			error: () => {
				$wrapper.html(`<div class="text-danger">Failed to load remarks.</div>`);
			},
		});
	}

	as_yes_no(value, expected) {
		return value === expected ? "Yes" : "No";
	}

	format_number(value) {
		return format_number(value, null, 0);
	}
}
