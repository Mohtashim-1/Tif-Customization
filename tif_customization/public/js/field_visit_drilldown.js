frappe.tif_customization = frappe.tif_customization || {};

frappe.tif_customization.format_visit_remarks = function (remarks) {
	const text = (remarks || "").trim();
	if (!text) return "—";
	const labeled = ["Books:", "Workshop:", "Program:", "Remarks:"];
	const parts = text.split(" | ").filter(Boolean);
	const hasHeadings = parts.some((p) => labeled.some((h) => p.startsWith(h)));
	if (!hasHeadings) {
		return frappe.utils.escape_html(text);
	}
	return parts
		.map((part) => {
			const heading = labeled.find((h) => part.startsWith(h));
			if (!heading) {
				return `<div style="margin-bottom:3px;line-height:1.35;">${frappe.utils.escape_html(
					part
				)}</div>`;
			}
			const body = part.slice(heading.length).trim() || "—";
			const muted = body === "—" ? ' style="color:#9ca3af;"' : "";
			return `<div style="margin-bottom:3px;line-height:1.35;"><strong>${frappe.utils.escape_html(
				heading
			)}</strong> <span${muted}>${frappe.utils.escape_html(body)}</span></div>`;
		})
		.join("");
};

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
				province: opts.province || "",
				city: opts.city || "",
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
	const isMonitoring = data.metric === "monitoring" || data.metric === "me";
	if (isMonitoring && !data.staff) {
		frappe.tif_customization.show_monitoring_officer_dialog(data, rows);
		return;
	}
	const breakdown = (data.breakdown || [])
		.map((b) => `${frappe.utils.escape_html(b.type)} <strong>${b.count}</strong>`)
		.join(" &nbsp;·&nbsp; ");
	const categoryHint =
		data.metric === "monitoring" || data.metric === "me"
			? `<p class="text-muted" style="margin-bottom:8px;font-size:12px;">${__(
					"M&E category breakdown (Active vs In-Active):"
				)}</p>`
			: "";
	const showRemarks = true;
	const hideSchool = data.metric === "academic_task";
	const hideType = false;
	const colCount = (hideSchool ? 6 : 7) - (hideType ? 1 : 0) + (showRemarks ? 1 : 0);
	const schoolCell = (row) => {
		const school = frappe.utils.escape_html(row.school || "—");
		let badge = "";
		if (cint(row.school_unapproved)) {
			badge = __("Un Approved");
		} else if (cint(row.school_missing)) {
			badge = __("School Detail Missing");
		}
		badge = badge
			? `<span style="display:inline-block;margin-left:6px;padding:1px 6px;border:1px solid #dc2626;border-radius:999px;background:#fef2f2;color:#b91c1c;font-size:11px;font-weight:700;white-space:nowrap;">${badge}</span>`
			: "";
		return `${school}${badge}`;
	};
	const body = rows.length
		? rows
				.map(
					(row) => `<tr>
				<td><a href="${frappe.utils.escape_html(row.url)}">${frappe.utils.escape_html(row.name)}</a></td>
				<td>${frappe.utils.escape_html(row.visit_date || "")}</td>
				${hideType ? "" : `<td>${frappe.utils.escape_html(row.type || "")}</td>`}
				${hideSchool ? "" : `<td>${schoolCell(row)}</td>`}
				<td>${frappe.utils.escape_html(row.officer || "")}</td>
				<td>${frappe.utils.escape_html(row.status || "")}</td>
				<td>${frappe.utils.escape_html(row.category || "")}</td>
				${
					showRemarks
						? `<td style="max-width:320px;white-space:normal;">${frappe.tif_customization.format_visit_remarks(
								row.remarks
							)}</td>`
						: ""
				}
			</tr>`
				)
				.join("")
		: `<tr><td colspan="${colCount}" class="text-muted text-center">${__("No Field Visits for this number.")}</td></tr>`;

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
		${categoryHint}
		${breakdown ? `<p class="text-muted" style="margin-bottom:10px;">${__("Detail")}: ${breakdown}</p>` : ""}
		<p class="text-muted" style="font-size:12px;">${__("Click a Document No to open that Field Visit.")}</p>
		<div class="table-responsive" style="max-height:420px;overflow:auto;">
			<table class="table table-bordered table-hover" style="font-size:12px;margin:0;">
				<thead>
					<tr>
						<th>${__("Document No")}</th>
						<th>${__("Visit Date")}</th>
						${hideType ? "" : `<th>${__("Type")}</th>`}
						${hideSchool ? "" : `<th>${__("School / Venue")}</th>`}
						<th>${__("Officer")}</th>
						<th>${__("Status")}</th>
						<th>${__("Category")}</th>
						${showRemarks ? `<th>${__("Remarks")}</th>` : ""}
					</tr>
				</thead>
				<tbody>${body}</tbody>
			</table>
		</div>
	`);
	d.show();
};

frappe.tif_customization.show_monitoring_officer_dialog = function (data, rows) {
	const meBucket = (row) => {
		const c = String(row.category || "")
			.toLowerCase()
			.replace(/-/g, " ")
			.replace(/\s+/g, " ")
			.trim();
		return c === "active" ? "active" : "inactive";
	};
	const byOfficer = {};
	(rows || []).forEach((row) => {
		const officer = (row.officer || "").trim() || __("Unknown officer");
		if (!byOfficer[officer]) {
			byOfficer[officer] = { officer, total: 0, active: 0, inactive: 0, rows: [] };
		}
		byOfficer[officer].rows.push(row);
		byOfficer[officer].total += 1;
		if (meBucket(row) === "active") byOfficer[officer].active += 1;
		else byOfficer[officer].inactive += 1;
	});
	const officers = Object.values(byOfficer).sort(
		(a, b) => b.total - a.total || a.officer.localeCompare(b.officer)
	);
	const sum = officers.reduce(
		(a, o) => {
			a.total += o.total;
			a.active += o.active;
			a.inactive += o.inactive;
			return a;
		},
		{ total: 0, active: 0, inactive: 0 }
	);
	const countLink = (officer, kind, count) => {
		if (!count) return "0";
		return `<a href="#" class="me-officer-count" data-officer="${frappe.utils.escape_html(
			officer
		)}" data-kind="${kind}">${cint(count).toLocaleString()}</a>`;
	};
	const body = officers.length
		? officers
				.map(
					(o) => `<tr>
				<td>${frappe.utils.escape_html(o.officer)}</td>
				<td class="text-right">${countLink(o.officer, "total", o.total)}</td>
				<td class="text-right">${countLink(o.officer, "active", o.active)}</td>
				<td class="text-right">${countLink(o.officer, "inactive", o.inactive)}</td>
			</tr>`
				)
				.join("")
		: `<tr><td colspan="4" class="text-muted text-center">${__("No Monitoring visits in this period.")}</td></tr>`;

	const d = new frappe.ui.Dialog({
		title: data.title || __("Monitoring (M&E) Visits"),
		size: "extra-large",
		fields: [{ fieldtype: "HTML", fieldname: "html" }],
		primary_action_label: __("Close"),
		primary_action: () => d.hide(),
	});

	const showOfficers = () => {
		d.set_title(data.title || __("Monitoring (M&E) Visits"));
		d.fields_dict.html.$wrapper.html(`
			<p class="text-muted" style="font-size:12px;margin-bottom:10px;">
				${__("Field officer wise Monitoring visits. Click Total, Active, or In-Active for the visit documents.")}
			</p>
			<div class="table-responsive" style="max-height:420px;overflow:auto;">
				<table class="table table-bordered table-hover" style="font-size:12px;margin:0;">
					<thead>
						<tr>
							<th>${__("Field Officer")}</th>
							<th class="text-right">${__("Total Visit")}</th>
							<th class="text-right">${__("Active")}</th>
							<th class="text-right">${__("In-Active")}</th>
						</tr>
					</thead>
					<tbody>${body}</tbody>
					<tfoot>
						<tr>
							<th>${__("Total")}</th>
							<th class="text-right">${cint(sum.total).toLocaleString()}</th>
							<th class="text-right">${cint(sum.active).toLocaleString()}</th>
							<th class="text-right">${cint(sum.inactive).toLocaleString()}</th>
						</tr>
					</tfoot>
				</table>
			</div>
		`);
	};

	const approvalLabel = (row) => {
		if (cint(row.school_unapproved) || cint(row.school_missing)) return __("Un Approved");
		return __("Approved");
	};

	const showDetail = (officer, kind) => {
		const bucket = byOfficer[officer];
		const filtered = (bucket ? bucket.rows : []).filter((row) => {
			if (kind === "active") return meBucket(row) === "active";
			if (kind === "inactive") return meBucket(row) === "inactive";
			return true;
		});
		const kindLabel =
			kind === "active" ? __("Active") : kind === "inactive" ? __("In-Active") : __("Total Visit");
		d.set_title(__("{0} — {1}", [officer, kindLabel]));
		const detailBody = filtered.length
			? filtered
					.map(
						(row) => `<tr>
					<td><a href="${frappe.utils.escape_html(row.url)}" target="_blank">${frappe.utils.escape_html(
							row.name || ""
						)}</a></td>
					<td>${frappe.utils.escape_html(row.visit_date || "")}</td>
					<td>${frappe.utils.escape_html(row.type || "")}</td>
					<td>${frappe.utils.escape_html(row.school || "—")}</td>
					<td>${frappe.utils.escape_html(approvalLabel(row))}</td>
					<td>${frappe.utils.escape_html(row.officer || "")}</td>
					<td>${frappe.utils.escape_html(row.status || "")}</td>
					<td>${frappe.utils.escape_html(row.category || "")}</td>
					<td style="max-width:320px;white-space:normal;">${frappe.tif_customization.format_visit_remarks(
						row.remarks
					)}</td>
				</tr>`
					)
					.join("")
			: `<tr><td colspan="9" class="text-muted text-center">${__("No Field Visits for this number.")}</td></tr>`;
		d.fields_dict.html.$wrapper.html(`
			<p style="margin-bottom:10px;">
				<a href="#" class="me-officer-back">${__("← Field officers")}</a>
				&nbsp;·&nbsp; ${frappe.utils.escape_html(officer)}
				&nbsp;·&nbsp; ${frappe.utils.escape_html(kindLabel)}: <strong>${filtered.length}</strong>
			</p>
			<p class="text-muted" style="font-size:12px;">${__("Click a Document No to open that Field Visit.")}</p>
			<div class="table-responsive" style="max-height:420px;overflow:auto;">
				<table class="table table-bordered table-hover" style="font-size:12px;margin:0;">
					<thead>
						<tr>
							<th>${__("Document No")}</th>
							<th>${__("Visit Date")}</th>
							<th>${__("Type")}</th>
							<th>${__("School")}</th>
							<th>${__("School Status")}</th>
							<th>${__("Officer")}</th>
							<th>${__("Status")}</th>
							<th>${__("Category")}</th>
							<th>${__("Remarks")}</th>
						</tr>
					</thead>
					<tbody>${detailBody}</tbody>
				</table>
			</div>
		`);
	};

	d.$wrapper.on("click", ".me-officer-count", (e) => {
		e.preventDefault();
		const officer = $(e.currentTarget).attr("data-officer");
		const kind = $(e.currentTarget).attr("data-kind") || "total";
		if (officer) showDetail(officer, kind);
	});
	d.$wrapper.on("click", ".me-officer-back", (e) => {
		e.preventDefault();
		showOfficers();
	});
	showOfficers();
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
