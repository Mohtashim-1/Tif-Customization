frappe.listview_settings["Reporting"] = {
	onload(listview) {
		listview.page.add_inner_button(__("Reporting Report"), () => {
			frappe.set_route("reporting-report");
		});

		const from_date = frappe.datetime.month_start();
		const to_date = frappe.datetime.get_today();
		listview.filter_area.add([
			["Reporting", "posting_date", "Between", [from_date, to_date]],
		]);

		const $summary = $(`
			<div class="reporting-list-summary border rounded p-3 mb-3" style="display:none;">
				<div class="d-flex align-items-center justify-content-between mb-2">
					<h5 class="mb-0">${__("Section Users Summary")}</h5>
					<button type="button" class="btn btn-xs btn-default reporting-list-refresh-summary">${__("Refresh")}</button>
				</div>
				<div class="reporting-list-section-users text-muted">${__("Loading...")}</div>
			</div>
		`);
		listview.$result.before($summary);

		const load_summary = () => {
			const filters = listview.get_filters_for_args() || [];
			let from = from_date;
			let to = to_date;
			let section = "";

			filters.forEach((f) => {
				if (f[1] === "posting_date") {
					if (f[2] === "Between" && Array.isArray(f[3])) {
						from = f[3][0];
						to = f[3][1];
					} else if (f[2] === ">=") {
						from = f[3];
					} else if (f[2] === "<=") {
						to = f[3];
					}
				}
			});

			$summary.show();
			$summary.find(".reporting-list-section-users").html(`<div class="text-muted">${__("Loading...")}</div>`);

			frappe.call({
				method: "tif_customization.tif_customization.doctype.reporting.reporting.get_reporting_dashboard_data",
				args: { from_date: from, to_date: to, section },
				callback(r) {
					const sections = (r.message && r.message.section_users_wise) || [];
					render_section_users_summary($summary.find(".reporting-list-section-users"), sections);
				},
			});
		};

		$summary.find(".reporting-list-refresh-summary").on("click", load_summary);
		listview.page.fields_dict && load_summary();
		setTimeout(load_summary, 500);
	},
};

function render_section_users_summary($container, sections) {
	if (!sections.length) {
		$container.html(`<div class="text-muted">${__("No section user activity found for selected date range.")}</div>`);
		return;
	}

	const html = sections
		.map((section) => {
			const userRows = (section.users || [])
				.map(
					(user) => `
				<tr>
					<td>${frappe.utils.escape_html(user.user_name || user.user || "-")}</td>
					<td class="text-right">${user.total_reports || 0}</td>
					<td class="text-right">${user.total_tasks || 0}</td>
					<td class="text-right">${user.completed_tasks || 0}</td>
				</tr>
			`
				)
				.join("");

			return `
			<div class="mb-3">
				<strong>${frappe.utils.escape_html(section.section || __("Unassigned"))}</strong>
				<span class="text-muted small"> (${section.active_users || 0} ${__("users")})</span>
				<div class="table-responsive mt-1">
					<table class="table table-bordered table-sm mb-0">
						<thead>
							<tr>
								<th>${__("User")}</th>
								<th class="text-right">${__("Reports")}</th>
								<th class="text-right">${__("Tasks")}</th>
								<th class="text-right">${__("Completed")}</th>
							</tr>
						</thead>
						<tbody>${userRows}</tbody>
					</table>
				</div>
			</div>
		`;
		})
		.join("");

	$container.html(html);
}
