frappe.pages["school-dashboard"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: "School Dashboard",
		single_column: true,
	});

	new SchoolDashboard(page).make();
};

class SchoolDashboard {
	constructor(page) {
		this.page = page;
		this.school_filter = null;
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
								<th>Active</th>
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
							<tr><td colspan="9" class="text-center text-muted">Loading...</td></tr>
						</tbody>
					</table>
				</div>
			</div>
		`;

		$(this.page.body).html(html);
	}

	bind_events() {
		const me = this;
		$(this.page.body).on("click", ".school-open-link", function () {
			const school = $(this).data("school");
			if (school) {
				frappe.set_route("Form", "School", school);
			}
		});
	}

	load_data() {
		const school = this.school_filter ? this.school_filter.get_value() : "";

		frappe.call({
			method: "tif_customization.tif_customization.page.school_dashboard.school_dashboard.get_dashboard_data",
			args: { school },
			callback: (r) => {
				const data = r.message || {};
				if (data.error) {
					frappe.msgprint(__("Unable to load dashboard: {0}", [data.error]));
					return;
				}
				this.render_kpis(data.kpis || {});
				this.render_rows(data.rows || []);
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
			{ label: "TPS Schools", value: kpis.tps_schools || 0 },
			{ label: "QPS Schools", value: kpis.qps_schools || 0 },
			{ label: "CEE Schools", value: kpis.cee_schools || 0 },
			{ label: "Qaida/Guide Dispatch", value: this.format_number(kpis.qaida_guide_dispatch || 0) },
			{ label: "MQH Dispatch", value: this.format_number(kpis.mqh_dispatch || 0) },
			{ label: "Workshop In Process", value: kpis.workshop_in_process || 0 },
			{ label: "Workshop Not Interested", value: kpis.workshop_not_interested || 0 },
		];

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
				`<tr><td colspan="9" class="text-center text-muted">No data found.</td></tr>`
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
				const active = (row.status || "") === "ACTIVE" ? "Yes" : "No";

				return `
					<tr>
						<td>
							<a href="javascript:void(0)" class="school-open-link" data-school="${frappe.utils.escape_html(row.school || "")}">
								${school_name || "-"}
							</a>
						</td>
						<td>${active}</td>
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

	as_yes_no(value, expected) {
		return value === expected ? "Yes" : "No";
	}

	format_number(value) {
		return format_number(value, null, 0);
	}
}
