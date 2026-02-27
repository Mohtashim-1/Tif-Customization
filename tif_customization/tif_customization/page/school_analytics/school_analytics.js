frappe.pages["school-analytics"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: "School Analytics",
		single_column: true,
	});

	new SchoolAnalyticsPage(page).make();
};

class SchoolAnalyticsPage {
	constructor(page) {
		this.page = page;
		this.school_filter = null;
		this.charts = {};
	}

	make() {
		this.make_filters();
		this.make_layout();
		this.load_chartjs(() => this.load_data());
	}

	make_filters() {
		this.school_filter = this.page.add_field({
			label: __("School"),
			fieldtype: "Link",
			fieldname: "school",
			options: "School",
			reqd: 1,
			change: () => this.load_data(),
		});

		this.page.set_primary_action(__("Refresh"), () => this.load_data(), "refresh");
	}

	make_layout() {
		const html = `
			<div class="school-analytics-wrap" style="padding:16px;">
				<div id="sa-empty" class="text-muted" style="padding:16px; border:1px solid #d1d8dd; border-radius:8px; margin-bottom:16px;">
					Select a school to view analytics.
				</div>

				<div id="sa-content" style="display:none;">
					<div id="sa-kpis" class="row" style="margin-bottom:16px;"></div>

					<div class="row" style="margin-bottom:16px;">
						<div class="col-md-6">
							<div style="border:1px solid #d1d8dd; border-radius:8px; padding:12px; background:#fff;">
								<div style="font-weight:600; margin-bottom:8px;">Book Issue: Issued vs Remaining</div>
								<canvas id="sa-books-chart" height="210"></canvas>
							</div>
						</div>
						<div class="col-md-6">
							<div style="border:1px solid #d1d8dd; border-radius:8px; padding:12px; background:#fff;">
								<div style="font-weight:600; margin-bottom:8px;">School Profile Completion</div>
								<canvas id="sa-completion-chart" height="210"></canvas>
							</div>
						</div>
					</div>

					<div style="border:1px solid #d1d8dd; border-radius:8px; padding:12px; background:#fff; margin-bottom:16px;">
						<div style="font-weight:600; margin-bottom:8px;">Monthly Dispatch Trend</div>
						<canvas id="sa-monthly-chart" height="100"></canvas>
					</div>

					<div class="row">
						<div class="col-md-6">
							<div style="border:1px solid #d1d8dd; border-radius:8px; background:#fff; padding:12px; margin-bottom:16px;">
								<div style="font-weight:600; margin-bottom:8px;">School Details</div>
								<div id="sa-details"></div>
							</div>
						</div>
						<div class="col-md-6">
							<div style="border:1px solid #d1d8dd; border-radius:8px; background:#fff; padding:12px; margin-bottom:16px;">
								<div style="font-weight:600; margin-bottom:8px;">Remaining Profile Fields</div>
								<div id="sa-remaining-fields"></div>
							</div>
						</div>
					</div>

					<div style="border:1px solid #d1d8dd; border-radius:8px; background:#fff; padding:12px;">
						<div style="font-weight:600; margin-bottom:8px;">Book Issue Status</div>
						<div class="table-responsive">
							<table class="table table-bordered" style="margin-bottom:0;">
								<thead>
									<tr>
										<th>Book Type</th>
										<th class="text-right">Required</th>
										<th class="text-right">Issued</th>
										<th class="text-right">Remaining</th>
										<th>Status</th>
									</tr>
								</thead>
								<tbody id="sa-book-status-tbody"></tbody>
							</table>
						</div>
					</div>
				</div>
			</div>
		`;

		$(this.page.body).find(".school-analytics-wrap").remove();
		$(this.page.body).append(html);
	}

	load_chartjs(callback) {
		if (window.Chart) {
			callback();
			return;
		}

		frappe.require("https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js", () => {
			callback();
		});
	}

	load_data() {
		const school = this.school_filter ? this.school_filter.get_value() : "";
		if (!school) {
			$("#sa-content").hide();
			$("#sa-empty").show();
			return;
		}

		frappe.call({
			method: "tif_customization.tif_customization.page.school_analytics.school_analytics.get_school_analytics",
			args: { school },
			callback: (r) => {
				const data = r.message || {};
				if (data.error) {
					frappe.msgprint(__("Unable to load analytics: {0}", [data.error]));
					return;
				}
				$("#sa-empty").hide();
				$("#sa-content").show();
				this.render_all(data);
			},
			error: () => frappe.msgprint(__("Failed to load School Analytics.")),
		});
	}

	render_all(data) {
		this.render_kpis(data.kpis || {});
		this.render_details(data.school_details || {});
		this.render_remaining_fields(data.completion?.remaining_fields || []);
		this.render_book_table(data.book_status || []);
		this.render_charts(data.charts || {});
	}

	render_kpis(kpis) {
		const cards = [
			{ label: "Students", value: kpis.students || 0 },
			{ label: "Quranic Teachers", value: kpis.quranic_teachers || 0 },
			{ label: "Books Required", value: kpis.total_required_books || 0 },
			{ label: "Books Issued", value: kpis.total_issued_books || 0 },
			{ label: "Books Remaining", value: kpis.total_remaining_books || 0 },
			{ label: "Profile Completion", value: `${kpis.profile_completion || 0}%` },
		];

		const html = cards
			.map(
				(card) => `
				<div class="col-md-4 col-sm-6" style="margin-bottom:12px;">
					<div style="padding:12px; border:1px solid #d1d8dd; border-radius:8px; background:#f8f9fa;">
						<div class="text-muted small">${frappe.utils.escape_html(card.label)}</div>
						<div style="font-size:22px; font-weight:600;">${frappe.utils.escape_html(String(card.value))}</div>
					</div>
				</div>
			`
			)
			.join("");

		$("#sa-kpis").html(html);
	}

	render_details(details) {
		const rows = [
			["School", details.school_name || "-"],
			["Status", details.status || "-"],
			["Territory", details.territory || "-"],
			["City", details.city || "-"],
			["Type", details.school_type || "-"],
			["TPS", details.tps || "-"],
			["QPS", details.qps || "-"],
			["CEE", details.cee || "-"],
			["Trainings", details.trainings || "-"],
			["Books", details.books || "-"],
		];

		const html = `
			<table class="table table-sm table-bordered" style="margin-bottom:0;">
				<tbody>
					${rows
						.map(
							(row) =>
								`<tr><th style="width:35%;">${frappe.utils.escape_html(row[0])}</th><td>${frappe.utils.escape_html(
									String(row[1])
								)}</td></tr>`
						)
						.join("")}
				</tbody>
			</table>
		`;

		$("#sa-details").html(html);
	}

	render_remaining_fields(fields) {
		if (!fields.length) {
			$("#sa-remaining-fields").html('<div class="text-success">All required profile fields are complete.</div>');
			return;
		}

		const html = `<ul style="margin-bottom:0; padding-left:18px;">${fields
			.map((f) => `<li>${frappe.utils.escape_html(f)}</li>`)
			.join("")}</ul>`;
		$("#sa-remaining-fields").html(html);
	}

	render_book_table(rows) {
		if (!rows.length) {
			$("#sa-book-status-tbody").html('<tr><td colspan="5" class="text-muted text-center">No data</td></tr>');
			return;
		}

		const html = rows
			.map((row) => {
				const status_class = row.status === "Complete" ? "text-success" : "text-danger";
				return `
					<tr>
						<td>${frappe.utils.escape_html(row.book_type || "-")}</td>
						<td class="text-right">${this.fnum(row.required)}</td>
						<td class="text-right">${this.fnum(row.issued)}</td>
						<td class="text-right">${this.fnum(row.remaining)}</td>
						<td class="${status_class}">${frappe.utils.escape_html(row.status || "-")}</td>
					</tr>
				`;
			})
			.join("");

		$("#sa-book-status-tbody").html(html);
	}

	render_charts(charts) {
		if (!window.Chart) return;

		this.destroy_chart("books");
		this.destroy_chart("completion");
		this.destroy_chart("monthly");

		const booksCtx = document.getElementById("sa-books-chart");
		const completionCtx = document.getElementById("sa-completion-chart");
		const monthlyCtx = document.getElementById("sa-monthly-chart");

		if (booksCtx && charts.books) {
			this.charts.books = new Chart(booksCtx, {
				type: "bar",
				data: charts.books,
				options: {
					responsive: true,
					plugins: { legend: { position: "top" } },
				},
			});
		}

		if (completionCtx && charts.completion) {
			this.charts.completion = new Chart(completionCtx, {
				type: "doughnut",
				data: charts.completion,
				options: {
					responsive: true,
					plugins: { legend: { position: "bottom" } },
				},
			});
		}

		if (monthlyCtx && charts.monthly) {
			this.charts.monthly = new Chart(monthlyCtx, {
				type: "line",
				data: charts.monthly,
				options: {
					responsive: true,
					plugins: { legend: { position: "top" } },
					elements: { line: { tension: 0.3 } },
				},
			});
		}
	}

	destroy_chart(key) {
		if (this.charts[key]) {
			this.charts[key].destroy();
			this.charts[key] = null;
		}
	}

	fnum(v) {
		return format_number(v || 0, null, 0);
	}
}
