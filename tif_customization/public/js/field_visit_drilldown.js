frappe.tif_customization = frappe.tif_customization || {};

frappe.tif_customization.open_visit_drilldown = function (opts) {
	opts = opts || {};
	const from_date = opts.from_date;
	const to_date = opts.to_date;
	const staff = opts.staff || opts.user || "";
	const metric = opts.metric || "visits";
	if (!from_date || !to_date) {
		frappe.msgprint(__("Set From Date and To Date first."));
		return;
	}
	frappe.call({
		method: "tif_customization.tif_customization.api.field_visit_drilldown.get_visit_drilldown",
		args: {
			filters: {
				from_date,
				to_date,
				staff,
				metric,
				submitted_only: opts.submitted_only || opts.submitted || 0,
			},
			metric,
			staff,
		},
		freeze: true,
		freeze_message: __("Loading documents..."),
		callback: (r) => {
			const data = r.message || {};
			frappe.tif_customization.show_visit_drilldown_dialog(data, opts);
		},
	});
};

frappe.tif_customization.show_visit_drilldown_dialog = function (data, opts) {
	const rows = data.rows || [];
	const breakdown = (data.breakdown || [])
		.map((b) => `${frappe.utils.escape_html(b.type)} <strong>${b.count}</strong>`)
		.join(" &nbsp;·&nbsp; ");
	const body = rows.length
		? rows
				.map(
					(row) => `<tr>
				<td><a href="${frappe.utils.escape_html(row.url)}">${frappe.utils.escape_html(row.name)}</a></td>
				<td>${frappe.utils.escape_html(row.visit_date || "")}</td>
				<td>${frappe.utils.escape_html(row.type || "")}</td>
				<td>${frappe.utils.escape_html(row.school || "—")}</td>
				<td>${frappe.utils.escape_html(row.officer || "")}</td>
				<td>${frappe.utils.escape_html(row.status || "")}</td>
				<td>${frappe.utils.escape_html(row.category || "")}</td>
			</tr>`
				)
				.join("")
		: `<tr><td colspan="7" class="text-muted text-center">${__("No Field Visits for this number.")}</td></tr>`;

	const d = new frappe.ui.Dialog({
		title: data.title || __("Visit details"),
		size: "extra-large",
		fields: [{ fieldtype: "HTML", fieldname: "html" }],
		primary_action_label: __("Open Field Staff Report"),
		primary_action: () => {
			d.hide();
			frappe.route_options = {
				from_date: data.from_date,
				to_date: data.to_date,
				user: data.staff || "",
			};
			frappe.set_route("field-staff-report");
		},
	});
	d.fields_dict.html.$wrapper.html(`
		<div class="mb-2">
			${__("This number is")} <strong>${data.count || 0}</strong>
			${data.subtitle ? ` — ${frappe.utils.escape_html(data.subtitle)}` : ""}
		</div>
		${breakdown ? `<p class="text-muted" style="margin-bottom:10px;">${__("Detail")}: ${breakdown}</p>` : ""}
		<p class="text-muted" style="font-size:12px;">${__("Click a Document No to open that Field Visit.")}</p>
		<div class="table-responsive" style="max-height:420px;overflow:auto;">
			<table class="table table-bordered table-hover" style="font-size:12px;margin:0;">
				<thead>
					<tr>
						<th>${__("Document No")}</th>
						<th>${__("Visit Date")}</th>
						<th>${__("Type")}</th>
						<th>${__("School / Venue")}</th>
						<th>${__("Officer")}</th>
						<th>${__("Status")}</th>
						<th>${__("Category")}</th>
					</tr>
				</thead>
				<tbody>${body}</tbody>
			</table>
		</div>
	`);
	d.show();
};

frappe.tif_customization.bind_clickable_numbers = function ($root, get_ctx) {
	$root.off("click.tifVisit").on("click.tifVisit", "[data-visit-metric]", function (e) {
		e.preventDefault();
		const metric = $(this).attr("data-visit-metric");
		if (!metric) return;
		const staff = $(this).attr("data-visit-staff") || "";
		const ctx = (typeof get_ctx === "function" ? get_ctx() : get_ctx) || {};
		frappe.tif_customization.open_visit_drilldown({
			from_date: ctx.from_date,
			to_date: ctx.to_date,
			staff: staff || ctx.staff || ctx.user || ctx.employee || "",
			metric,
			submitted_only: ctx.submitted_only || ctx.submitted || 0,
		});
	});
};
