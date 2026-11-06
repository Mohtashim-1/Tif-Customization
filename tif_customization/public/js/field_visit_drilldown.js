frappe.tif_customization = frappe.tif_customization || {};

/** Download rows as CSV (opens cleanly in Excel). */
frappe.tif_customization.export_rows_excel = function (filename, headers, rows) {
	const esc = (v) => {
		const s = v == null ? "" : String(v);
		if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
		return s;
	};
	const lines = [headers.map(esc).join(",")];
	(rows || []).forEach((row) => {
		lines.push(headers.map((_, i) => esc(Array.isArray(row) ? row[i] : row[headers[i]])).join(","));
	});
	const bom = "\ufeff";
	const blob = new Blob([bom + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
	const a = document.createElement("a");
	const safe = String(filename || "export")
		.replace(/[^\w\-]+/g, "_")
		.replace(/_+/g, "_")
		.slice(0, 80);
	a.href = URL.createObjectURL(blob);
	a.download = `${safe}.csv`;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(a.href);
	frappe.show_alert({ message: __("Excel file downloaded"), indicator: "green" });
};

/** Standard drill-down header: "Card Name: 401" */
frappe.tif_customization.drilldown_title = function (label, count) {
	const name = String(label || __("Details")).trim() || __("Details");
	const n = count == null || count === "" ? 0 : cint(count);
	return __("{0}: {1}", [name, n.toLocaleString()]);
};

/** Clickable school name → open School form (activity dashboard). */
frappe.tif_customization.school_link_html = function (school, extraHtml) {
	const raw = String(school || "").trim();
	const label = frappe.utils.escape_html(raw || "—");
	const extra = extraHtml || "";
	if (!raw || raw === "—" || raw === "-") return `${label}${extra}`;
	return `<a href="#" class="tif-open-school" data-school="${frappe.utils.escape_html(
		raw
	)}" style="font-weight:600;color:#0f766e;text-decoration:underline;">${label}</a>${extra}`;
};

/**
 * Route to School → Customer → School Opening Application (never the visits popup).
 * Accepts School name, Customer id/name, SOA, or free-text school title.
 */
frappe.tif_customization.open_school_document = function (school) {
	const key = String(school || "").trim();
	if (!key || key === "—" || key === "-") return;
	frappe.call({
		method: "tif_customization.tif_customization.doctype.school.school.resolve_school_route",
		args: { school: key },
		freeze: true,
		freeze_message: __("Opening school…"),
		callback: (r) => {
			const data = r.message || {};
			if (data.found && data.doctype && data.name) {
				const link =
					(frappe.utils.get_form_link &&
						frappe.utils.get_form_link(data.doctype, data.name)) ||
					`/app/${frappe.router.slug(data.doctype)}/${encodeURIComponent(data.name)}`;
				window.open(link, "_blank");
				return;
			}
			// Last resort: full activity dialog (not the visits-only popup).
			frappe.tif_customization.open_school_activity_dialog(key);
		},
		error: () => frappe.tif_customization.open_school_activity_dialog(key),
	});
};

/** Full activity dashboard dialog when no School/Customer/SOA master exists. */
frappe.tif_customization.open_school_activity_dialog = function (school) {
	const key = String(school || "").trim();
	if (!key) return;
	const dialog = new frappe.ui.Dialog({
		title: key,
		size: "extra-large",
		fields: [{ fieldtype: "HTML", fieldname: "html" }],
		primary_action_label: __("Close"),
		primary_action: () => dialog.hide(),
	});
	dialog.fields_dict.html.$wrapper.html(
		`<div class="text-muted" style="padding:12px;">${__("Loading activity…")}</div>`
	);
	dialog.show();
	frappe.call({
		method: "tif_customization.tif_customization.doctype.school.school.get_school_activity_dashboard",
		args: { school: key },
		callback: (r) => {
			const html = frappe.tif_customization.render_school_activity_html(r.message || { school_name: key });
			dialog.fields_dict.html.$wrapper.html(html);
			dialog.fields_dict.html.$wrapper.find(".school-act-open-visit").on("click", function (e) {
				e.preventDefault();
				const name = this.getAttribute("data-name");
				if (!name) return;
				if (frappe.tif_customization.open_field_visit_easy) {
					frappe.tif_customization.open_field_visit_easy(name);
				} else {
					frappe.set_route("Form", "Field Visit", name);
				}
			});
		},
		error: () => {
			dialog.fields_dict.html.$wrapper.html(
				`<div class="text-danger" style="padding:12px;">${__("Could not load school activity.")}</div>`
			);
		},
	});
};

/**
 * School Location Report–style visits popup (Document Name / Date / Field Officer / Remarks).
 * Accepts School name, Customer id/name, or free-text school title.
 * Pass skipRoute=true when already falling back from open_school_document.
 */
frappe.tif_customization.open_school_visits_dialog = function (school, skipRoute) {
	const key = String(school || "").trim();
	if (!key || key === "—" || key === "-") return;
	if (!skipRoute) {
		frappe.tif_customization.open_school_document(key);
		return;
	}
	const showDialog = (data) => {
		data = data || {};
		const visits = data.visits || [];
		const body = visits.length
			? visits
					.map((row) => {
						const date = row.visit_date
							? frappe.datetime.str_to_user(row.visit_date)
							: "—";
						const doctype = row.doctype || "Field Visit";
						return `<tr>
							<td><a href="#" class="tif-school-visit-doc" data-doctype="${frappe.utils.escape_html(
								doctype
							)}" data-name="${frappe.utils.escape_html(row.name || "")}">${frappe.utils.escape_html(
							row.name || "—"
						)}</a></td>
							<td>${frappe.utils.escape_html(date)}</td>
							<td>${frappe.utils.escape_html(row.field_officer || "—")}</td>
							<td style="min-width:220px;max-width:420px;white-space:pre-wrap;line-height:1.4;">${frappe.utils.escape_html(
								row.remarks || "—"
							)}</td>
						</tr>`;
					})
					.join("")
			: `<tr><td colspan="4" class="text-muted text-center">${__(
					"No field visits for this school"
			  )}</td></tr>`;
		const dialog = new frappe.ui.Dialog({
			title: data.school_name || key,
			size: "extra-large",
			fields: [{ fieldtype: "HTML", fieldname: "html" }],
			primary_action_label: __("Close"),
			primary_action: () => dialog.hide(),
		});
		dialog.fields_dict.html.$wrapper.html(`
			<p class="text-muted" style="font-size:12px;margin-bottom:10px;">
				${__("Visits")}: <strong>${visits.length}</strong>
			</p>
			<div class="table-responsive" style="max-height:460px;overflow:auto;">
				<table class="table table-bordered" style="font-size:12px;margin:0;">
					<thead>
						<tr>
							<th>${__("Document Name")}</th>
							<th>${__("Date")}</th>
							<th>${__("SME")}</th>
							<th>${__("Remarks")}</th>
						</tr>
					</thead>
					<tbody>${body}</tbody>
				</table>
			</div>
		`);
		dialog.$wrapper.on("click", ".tif-school-visit-doc", function (e) {
			e.preventDefault();
			const doctype = this.getAttribute("data-doctype") || "Field Visit";
			const name = this.getAttribute("data-name");
			if (!name) return;
			if (doctype === "Field Visit" && frappe.tif_customization.open_field_visit_easy) {
				frappe.tif_customization.open_field_visit_easy(name);
			} else {
				frappe.set_route("Form", doctype, name);
			}
		});
		dialog.show();
	};
	frappe.call({
		method:
			"tif_customization.tif_customization.page.school_location_report.school_location_report.get_school_visits",
		args: { school: key },
		freeze: true,
		freeze_message: __("Loading school visits…"),
		callback: (response) => showDialog(response.message || { school_name: key, visits: [] }),
		error: () => showDialog({ school_name: key, visits: [] }),
	});
};

/** Prefer API title, else build Label: Count from label/count/rows. */
frappe.tif_customization.resolve_drilldown_title = function (data, fallbackLabel) {
	data = data || {};
	if (data.title && String(data.title).includes(":")) {
		return data.title;
	}
	const label = data.label || fallbackLabel || __("Details");
	const count =
		data.count != null
			? data.count
			: Array.isArray(data.rows)
				? data.rows.length
				: Array.isArray(data.participants)
					? data.participants.length
					: 0;
	return frappe.tif_customization.drilldown_title(label, count);
};

frappe.tif_customization.field_visit_easy_url = function (name) {
	const n = String(name || "").trim();
	if (!n) return "";
	return `/field-visit-easy?name=${encodeURIComponent(n)}`;
};

frappe.tif_customization.open_field_visit_easy = function (name) {
	const url = frappe.tif_customization.field_visit_easy_url(name);
	if (!url) return;
	window.open(url, "_blank");
};

frappe.tif_customization.should_hide_school_unapproved = function (opts) {
	return !!(opts && opts.hideUnapproved) || !!frappe.tif_customization.hide_school_unapproved;
};

frappe.tif_customization.format_visit_remarks = function (remarks) {
	const text = (remarks || "").trim();
	if (!text) return "—";
	const labeled = [
		"School Status:",
		"Books:",
		"Workshop:",
		"Program:",
		"Visit Summary:",
		"Remarks:",
		"Inactive reason:",
	];
	// Preferred display order: Inactive reason before Visit Summary.
	const order = [
		"School Status:",
		"Books:",
		"Workshop:",
		"Program:",
		"Inactive reason:",
		"Visit Summary:",
		"Remarks:",
	];
	let parts = text.split(" | ").filter(Boolean);
	const hasHeadings = parts.some((p) => labeled.some((h) => p.startsWith(h)));
	if (!hasHeadings) {
		return frappe.utils.escape_html(text);
	}
	const ranked = parts
		.map((part, idx) => {
			const heading = labeled.find((h) => part.startsWith(h));
			const rank = heading ? order.indexOf(heading) : order.length + idx;
			return { part, heading, rank: rank < 0 ? order.length + idx : rank, idx };
		})
		.sort((a, b) => a.rank - b.rank || a.idx - b.idx);
	return ranked
		.map(({ part, heading }) => {
			if (!heading) {
				return `<div style="margin-bottom:3px;line-height:1.35;">${frappe.utils.escape_html(
					part
				)}</div>`;
			}
			const body = part.slice(heading.length).trim() || "—";
			const muted = body === "—" ? ' style="color:#9ca3af;"' : "";
			const shown = heading === "Remarks:" ? "Visit Summary:" : heading;
			return `<div style="margin-bottom:3px;line-height:1.35;"><strong>${frappe.utils.escape_html(
				shown
			)}</strong> <span${muted}>${frappe.utils.escape_html(body)}</span></div>`;
		})
		.join("");
};

frappe.tif_customization.open_visit_drilldown = function (opts) {
	opts = opts || {};
	const from_date = opts.from_date;
	const to_date = opts.to_date;
	const staff = opts.staff || opts.user || "";
	const supervisor = opts.supervisor || "";
	const metric = opts.metric || "visits";
	if (!from_date || !to_date) {
		frappe.msgprint(__("Set From Date and To Date first."));
		return;
	}
	frappe.call({
		method: "tif_customization.tif_customization.api.visit_drilldown_report.get_visit_drilldown",
		args: {
			filters: {
				from_date,
				to_date,
				staff,
				supervisor,
				metric,
				province: opts.province || "",
				city: opts.city || "",
				submitted_only: opts.submitted_only || opts.submitted || 0,
				sme_roster: opts.sme_roster || 0,
			},
			metric,
			staff,
		},
		freeze: true,
		freeze_message: __("Loading documents..."),
		callback: (r) => {
			const data = r.message || {};
			// Prefer the KPI card label so header matches what the user clicked.
			// For school metrics, prefer API distinct-school count over the card attribute
			// so title and the Schools chip inside the dialog stay in sync.
			if (opts.cardLabel) {
				data.label = opts.cardLabel;
				const schoolMetrics = new Set([
					"model_school_a",
					"model_school_b",
					"model_school_c",
					"model_school_0",
					"model_0",
					"inactive_schools",
					"new_schools",
					"active_schools",
					"total_schools",
				]);
				// Prefer live API count after import (and for headcount / distinct-visit metrics).
				// Visit-document cards can briefly disagree with the row list when the card
				// was summed per-SME; API count is the same distinct set as the table.
				const distinctVisitMetrics = new Set([
					"teachers_training_meeting",
					"meeting_ulama",
					"headoffice_visit",
					"academic_task",
					"other_official",
				]);
				const preferApiCount =
					schoolMetrics.has(metric) ||
					distinctVisitMetrics.has(metric) ||
					metric === "online_participants" ||
					metric === "workshop_registration" ||
					opts.preferApiCount;
				const count =
					preferApiCount && data.count != null && data.count !== ""
						? data.count
						: opts.cardCount != null && opts.cardCount !== ""
							? opts.cardCount
							: data.count;
				data.title = frappe.tif_customization.drilldown_title(opts.cardLabel, count);
			} else if (!data.title || !String(data.title).includes(":")) {
				data.title = frappe.tif_customization.resolve_drilldown_title(data);
			}
			frappe.tif_customization.show_visit_drilldown_dialog(data, opts);
		},
	});
};

frappe.tif_customization.show_school_metric_drilldown_dialog = function (data, opts) {
	opts = opts || {};
	const rows = (data.rows || []).filter((r) => (r.school || "").trim());
	// Same key as KPI SQL: lowercase + collapse all whitespace (spaces/tabs).
	const schoolKey = (name) =>
		String(name || "")
			.replace(/[\t\n\r]+/g, " ")
			.trim()
			.toLowerCase()
			.replace(/\s+/g, " ");
	// Report cards count distinct school names. Old UI keyed school||province||area
	// (e.g. 463) which was higher than the card (449). Match the card: one row per school name.
	const schoolMap = {};
	rows.forEach((row) => {
		const school = String(row.school || "")
			.replace(/[\t\n\r]+/g, " ")
			.trim()
			.replace(/\s+/g, " ");
		const province = (row.province || "").trim();
		const area = (row.area || "").trim();
		const nameKey = schoolKey(school);
		if (!nameKey) return;
		if (!schoolMap[nameKey]) {
			schoolMap[nameKey] = {
				key: nameKey,
				school,
				province,
				area,
				visits: 0,
				docs: [],
			};
		}
		schoolMap[nameKey].visits += 1;
		schoolMap[nameKey].docs.push(row);
		// Keep latest visit's province/area on the row.
		const latest = schoolMap[nameKey].docs[0] || row;
		schoolMap[nameKey].province = (latest.province || "").trim() || province;
		schoolMap[nameKey].area = (latest.area || "").trim() || area;
	});
	const schoolRows = Object.values(schoolMap).sort(
		(a, b) => b.visits - a.visits || String(a.school).localeCompare(String(b.school))
	);
	const distinctSchools = schoolRows.length;
	// Prefer API distinct-school count, then card, then local regroup.
	const cardTotal =
		data.count != null && data.count !== ""
			? cint(data.count)
			: opts.cardCount != null && opts.cardCount !== ""
				? cint(opts.cardCount)
				: distinctSchools;
	const label = data.label || __("Schools");
	const exportSchoolList = () => {
		const headers = [
			__("School Name"),
			__("Province"),
			__("Area"),
			__("Visits"),
			__("Latest Document"),
			__("Visit Date"),
			__("SME"),
		];
		const exportRows = schoolRows.map((s) => {
			const latest = s.docs[0] || {};
			return [
				s.school || "",
				s.province || "",
				s.area || "",
				s.visits || 0,
				latest.name || "",
				latest.visit_date || "",
				latest.officer || "",
			];
		});
		const fname = `${label}-${data.from_date || ""}-${data.to_date || ""}`.replace(/\s+/g, "-");
		frappe.tif_customization.export_rows_excel(fname, headers, exportRows);
	};
	const d = new frappe.ui.Dialog({
		title: frappe.tif_customization.drilldown_title(label, cardTotal),
		size: "extra-large",
		fields: [{ fieldtype: "HTML", fieldname: "html" }],
		primary_action_label: __("Close"),
		primary_action: () => d.hide(),
		secondary_action_label: __("Export Excel"),
		secondary_action: () => exportSchoolList(),
	});

	const renderSchools = () => {
		d.get_secondary_btn().show().text(__("Export Excel")).off("click").on("click", () => exportSchoolList());
		const body = schoolRows.length
			? schoolRows
					.map((s) => {
						const latest = s.docs[0] || {};
						return `<tr class="tif-school-row" data-school-key="${frappe.utils.escape_html(
							s.key
						)}" style="cursor:pointer;">
					<td style="font-weight:600;color:#0f766e;">${frappe.utils.escape_html(s.school)}</td>
					<td>${frappe.utils.escape_html(s.province || "—")}</td>
					<td>${frappe.utils.escape_html(s.area || "—")}</td>
					<td class="text-right">${cint(s.visits).toLocaleString()}</td>
					<td><a href="#" class="tif-open-visit" data-visit="${frappe.utils.escape_html(
						latest.name || ""
					)}">${frappe.utils.escape_html(latest.name || "—")}</a></td>
					<td>${frappe.utils.escape_html(latest.visit_date || "")}</td>
					<td>${frappe.utils.escape_html(latest.officer || "")}</td>
				</tr>`;
					})
					.join("")
			: `<tr><td colspan="7" class="text-muted text-center">${__("No schools found")}</td></tr>`;
		d.set_title(frappe.tif_customization.drilldown_title(label, cardTotal));
		d.fields_dict.html.$wrapper.html(`
			<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:12px;">
				<div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;padding:8px 12px;" title="${__(
					"Same as the report card: each school name counted once"
				)}">
					<span class="text-muted" style="font-size:11px;">${__("Schools")}</span>
					<div style="font-size:20px;font-weight:700;">${cint(cardTotal).toLocaleString()}</div>
				</div>
				<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px;">
					<span class="text-muted" style="font-size:11px;">${__("Field Visits")}</span>
					<div style="font-size:20px;font-weight:700;">${cint(rows.length).toLocaleString()}</div>
				</div>
				<p class="text-muted" style="font-size:12px;margin:0;flex:1;min-width:200px;">
					${__("Click a school name to open the School record. Click Document No to open the Field Visit.")}
				</p>
			</div>
			<div class="table-responsive" style="max-height:480px;overflow:auto;">
				<table class="table table-bordered table-hover" style="font-size:12px;margin:0;">
					<thead>
						<tr>
							<th>${__("School Name")}</th>
							<th>${__("Province")}</th>
							<th>${__("Area")}</th>
							<th class="text-right">${__("Visits")}</th>
							<th>${__("Latest Document")}</th>
							<th>${__("Visit Date")}</th>
							<th>${__("SME")}</th>
						</tr>
					</thead>
					<tbody>${body}</tbody>
				</table>
			</div>
		`);
	};

	d.$wrapper.on("click", ".tif-open-visit", (e) => {
		e.preventDefault();
		e.stopPropagation();
		const name = $(e.currentTarget).attr("data-visit");
		if (!name) return;
		frappe.tif_customization.open_field_visit_easy(name);
	});
	d.$wrapper.on("click", ".tif-school-row", (e) => {
		if ($(e.target).closest(".tif-open-visit").length) return;
		e.preventDefault();
		const key = $(e.currentTarget).attr("data-school-key");
		const bucket = key ? schoolMap[key] : null;
		if (bucket && bucket.school) {
			frappe.tif_customization.open_school_visits_dialog(bucket.school);
		}
	});

	renderSchools();
	d.show();
};

frappe.tif_customization.show_visit_drilldown_dialog = function (data, opts) {
	opts = opts || {};
	const hideUnapproved = frappe.tif_customization.should_hide_school_unapproved(opts);
	const rows = data.rows || [];
	const isMonitoring = data.metric === "monitoring" || data.metric === "me";
	if (isMonitoring && !data.staff) {
		frappe.tif_customization.show_monitoring_officer_dialog(data, rows, opts);
		return;
	}
	if (data.metric === "enrolment") {
		frappe.tif_customization.show_enrolment_officer_dialog(data);
		return;
	}
	if (data.metric === "volunteers") {
		frappe.tif_customization.show_volunteer_enrolment_dialog(data, opts);
		return;
	}
	if (data.metric === "workshop_registration") {
		frappe.tif_customization.show_workshop_participant_dialog(data, opts);
		return;
	}
	if (data.metric === "online_participants") {
		frappe.tif_customization.show_online_workshop_officer_dialog(data, opts);
		return;
	}
	const schoolListMetrics = new Set([
		"model_school_a",
		"model_school_b",
		"model_school_c",
		"model_school_0",
		"model_0",
		"inactive_schools",
		"new_schools",
		"active_schools",
	]);
	if (schoolListMetrics.has(data.metric)) {
		frappe.tif_customization.show_school_metric_drilldown_dialog(data, opts);
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
	const colCount = frappe.tif_customization.visit_detail_headers().length;
	const rowOpts = { hideUnapproved, metric: data.metric };
	const body = rows.length
		? rows
				.map((row) => frappe.tif_customization.render_visit_detail_row(row, rowOpts))
				.join("")
		: `<tr><td colspan="${colCount}" class="text-muted text-center">${__("No Field Visits for this number.")}</td></tr>`;

	const visitTitle = frappe.tif_customization.resolve_drilldown_title(
		data,
		__("Visit details")
	);
	const exportVisitList = () => {
		const headers = frappe.tif_customization.visit_detail_headers();
		const exportRows = rows.map((row) => {
			const imgs = row.images || [];
			const check = frappe.tif_customization.photo_click_check(row);
			return [
				row.name || "",
				row.visit_date || "",
				row.type_label || row.type || "",
				row.school || "",
				frappe.tif_customization.visit_approval_label(row, rowOpts),
				row.officer || "",
				row.status || "",
				row.category || "",
				imgs.length
					? imgs.map((img) => img.url || "").filter(Boolean).join(" | ")
					: "",
				check.label || "",
				(row.remarks || "").replace(/\s+/g, " ").trim(),
			];
		});
		const fname = `${data.label || data.metric || "visits"}-${data.from_date || ""}-${
			data.to_date || ""
		}`.replace(/\s+/g, "-");
		frappe.tif_customization.export_rows_excel(fname, headers, exportRows);
	};
	const allowImport = data.metric === "online_participants";
	const d = new frappe.ui.Dialog({
		title: visitTitle,
		size: "extra-large",
		fields: [{ fieldtype: "HTML", fieldname: "html" }],
		primary_action_label: __("Close"),
		primary_action: () => d.hide(),
		secondary_action_label: __("Export Excel"),
		secondary_action: () => exportVisitList(),
	});
	const importBar = allowImport
		? `<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 10px;">
			<button type="button" class="btn btn-default btn-sm tif-ow-import">${__("Import")}</button>
			<button type="button" class="btn btn-link btn-sm tif-ow-template" style="padding-left:0;">${__(
				"Download template"
			)}</button>
			<span class="text-muted" style="font-size:12px;">${__(
				"Upload CSV/Excel to add Online Workshop Participants for this card."
			)}</span>
		</div>`
		: "";
	d.fields_dict.html.$wrapper.html(`
		${
			breakdown
				? `<p class="text-muted" style="margin-bottom:10px;font-size:12px;">${breakdown}</p>`
				: ""
		}
		${categoryHint}
		${importBar}
		<p class="text-muted" style="font-size:12px;">${__(
			"Click a Document No to open that Field Visit. Click a school name to open the School record. Click an image to enlarge."
		)}</p>
		<div class="table-responsive" style="max-height:420px;overflow:auto;">
			<table class="table table-bordered table-hover" style="font-size:12px;margin:0;">
				<thead>${frappe.tif_customization.render_visit_detail_thead()}</thead>
				<tbody>${body}</tbody>
			</table>
		</div>
	`);
	d.$wrapper.on("click", ".tif-open-visit", (e) => {
		e.preventDefault();
		const name = $(e.currentTarget).attr("data-visit");
		if (!name) return;
		frappe.tif_customization.open_field_visit_easy(name);
	});
	d.$wrapper.on("click", ".tif-open-school", (e) => {
		e.preventDefault();
		e.stopPropagation();
		const school = $(e.currentTarget).attr("data-school");
		if (school && frappe.tif_customization.open_school_document) {
			frappe.tif_customization.open_school_document(school);
		} else if (school) {
			frappe.tif_customization.open_school_visits_dialog(school);
		}
	});
	d.$wrapper.on("click", ".tif-visit-photo-card, .visit-photo", (e) => {
		e.preventDefault();
		const name = $(e.currentTarget).attr("data-visit");
		const row = (rows || []).find((r) => r.name === name);
		if (row) frappe.tif_customization.show_visit_photo_dialog(row);
	});
	if (allowImport) {
		d.$wrapper.on("click", ".tif-ow-import", (e) => {
			e.preventDefault();
			frappe.tif_customization.open_online_workshop_import({
				onDone: () => {
					d.hide();
					frappe.tif_customization.open_visit_drilldown(opts);
					if (typeof opts.onImported === "function") opts.onImported();
				},
			});
		});
		d.$wrapper.on("click", ".tif-ow-template", (e) => {
			e.preventDefault();
			frappe.tif_customization.download_online_workshop_template();
		});
	}
	d.show();
};

frappe.tif_customization.show_online_workshop_officer_dialog = function (data, opts) {
	opts = opts || {};
	const rows = data.rows || [];
	const programOf = (row) =>
		(row.type || row.training_program || "").trim() || __("Unknown program");
	const byOfficer = {};
	rows.forEach((row) => {
		const officer = (row.officer || "").trim() || __("Unknown officer");
		if (!byOfficer[officer]) {
			byOfficer[officer] = { officer, rows: [], participants: 0, programs: {} };
		}
		byOfficer[officer].rows.push(row);
		byOfficer[officer].participants += cint(row.participants) || 1;
		const program = programOf(row);
		if (!byOfficer[officer].programs[program]) {
			byOfficer[officer].programs[program] = {
				program,
				rows: [],
				participants: 0,
			};
		}
		byOfficer[officer].programs[program].rows.push(row);
		byOfficer[officer].programs[program].participants += cint(row.participants) || 1;
	});
	const officers = Object.values(byOfficer).sort(
		(a, b) =>
			b.participants - a.participants ||
			b.rows.length - a.rows.length ||
			a.officer.localeCompare(b.officer)
	);
	const totalHeads = rows.reduce((sum, row) => sum + (cint(row.participants) || 1), 0);
	const totalCount = data.count != null ? cint(data.count) : totalHeads;
	const owTitle = frappe.tif_customization.drilldown_title(
		data.label || __("Online Workshop Participants SME"),
		totalCount
	);

	const exportOfficerList = () => {
		const headers = [__("SME"), __("Participants"), __("Entries"), __("Programs")];
		const exportRows = officers.map((o) => [
			o.officer,
			o.participants,
			o.rows.length,
			Object.keys(o.programs).length,
		]);
		const fname = `${data.label || "online-workshop"}-by-officer-${data.from_date || ""}-${
			data.to_date || ""
		}`.replace(/\s+/g, "-");
		frappe.tif_customization.export_rows_excel(fname, headers, exportRows);
	};
	const exportProgramList = (officer) => {
		const bucket = byOfficer[officer];
		const programs = Object.values((bucket && bucket.programs) || {}).sort(
			(a, b) =>
				b.participants - a.participants ||
				b.rows.length - a.rows.length ||
				a.program.localeCompare(b.program)
		);
		const headers = [__("SME"), __("Program"), __("Participants"), __("Entries")];
		const exportRows = programs.map((p) => [
			officer,
			p.program,
			p.participants,
			p.rows.length,
		]);
		const fname = `${officer || "officer"}-programs-${data.from_date || ""}`.replace(/\s+/g, "-");
		frappe.tif_customization.export_rows_excel(fname, headers, exportRows);
	};
	const exportProgramDetail = (officer, program) => {
		const bucket = byOfficer[officer];
		const prog = bucket && bucket.programs && bucket.programs[program];
		const detail = (prog && prog.rows) || [];
		const headers = [
			__("Document No"),
			__("Visit Date"),
			__("Program"),
			__("School / Venue"),
			__("Participant"),
			__("Contact"),
			__("Category"),
			__("Visit Summary"),
			__("Participants"),
		];
		const exportRows = detail.map((row) => [
			row.name || "",
			row.visit_date || "",
			programOf(row),
			row.school || "",
			row.full_name || "",
			row.whatsapp_contact || row.email || "",
			row.category || "",
			(row.remarks || "").replace(/\s+/g, " ").trim(),
			cint(row.participants) || 1,
		]);
		const fname = `${officer || "officer"}-${program || "program"}-${data.from_date || ""}`.replace(
			/\s+/g,
			"-"
		);
		frappe.tif_customization.export_rows_excel(fname, headers, exportRows);
	};

	const d = new frappe.ui.Dialog({
		title: owTitle,
		size: "extra-large",
		fields: [{ fieldtype: "HTML", fieldname: "html" }],
		primary_action_label: __("Close"),
		primary_action: () => d.hide(),
		secondary_action_label: __("Export Excel"),
		secondary_action: () => exportOfficerList(),
	});

	const importBar = `<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 10px;">
		<button type="button" class="btn btn-default btn-sm tif-ow-import">${__("Import")}</button>
		<button type="button" class="btn btn-link btn-sm tif-ow-template" style="padding-left:0;">${__(
			"Download template"
		)}</button>
		<span class="text-muted" style="font-size:12px;">${__(
			"Upload CSV/Excel to add Online Workshop Participants for this card."
		)}</span>
	</div>`;

	const detailTable = (detailRows) => {
		if (!detailRows.length) {
			return `<tr><td colspan="7" class="text-muted text-center">${__(
				"No participants for this program."
			)}</td></tr>`;
		}
		return detailRows
			.map((row) => {
				const docLabel = frappe.utils.escape_html(row.name || "—");
				const docCell = cint(row.imported)
					? `<span title="${__("Imported entry")}">${docLabel}</span>`
					: `<a href="#" class="tif-open-visit" data-visit="${docLabel}">${docLabel}</a>`;
				const summary = row.remarks
					? frappe.tif_customization.format_visit_remarks(row.remarks)
					: "—";
				return `<tr>
					<td>${docCell}</td>
					<td>${frappe.utils.escape_html(row.visit_date || "")}</td>
					<td>${frappe.tif_customization.school_link_html(row.school)}</td>
					<td>${frappe.utils.escape_html(row.full_name || "—")}</td>
					<td>${frappe.utils.escape_html(row.whatsapp_contact || row.email || "—")}</td>
					<td class="text-right">${cint(row.participants || 1).toLocaleString()}</td>
					<td style="max-width:280px;white-space:normal;">${summary}</td>
				</tr>`;
			})
			.join("");
	};

	const showOfficers = () => {
		d.set_title(owTitle);
		d.get_secondary_btn().show().text(__("Export Excel")).off("click").on("click", () => exportOfficerList());
		const body = officers.length
			? officers
					.map(
						(o) => `<tr class="ow-officer-row" data-officer="${frappe.utils.escape_html(
							o.officer
						)}" style="cursor:pointer;">
					<td style="font-weight:600;color:#0f766e;">${frappe.utils.escape_html(o.officer)}</td>
					<td class="text-right"><a href="#" class="ow-officer-count" data-officer="${frappe.utils.escape_html(
						o.officer
					)}">${cint(o.participants).toLocaleString()}</a></td>
					<td class="text-right">${cint(o.rows.length).toLocaleString()}</td>
					<td class="text-right">${cint(Object.keys(o.programs).length).toLocaleString()}</td>
				</tr>`
					)
					.join("")
			: `<tr><td colspan="4" class="text-muted text-center">${__(
					"No Online Workshop Participants in this period."
				)}</td></tr>`;
		d.fields_dict.html.$wrapper.html(`
			${importBar}
			<p class="text-muted" style="font-size:12px;margin-bottom:10px;">
				${__("Level 1 — SME. Click an SME to see programs.")}
				&nbsp;·&nbsp; ${__("Total")}: <strong>${cint(totalCount).toLocaleString()}</strong>
			</p>
			<div class="table-responsive" style="max-height:420px;overflow:auto;">
				<table class="table table-bordered table-hover" style="font-size:12px;margin:0;">
					<thead>
						<tr>
							<th>${__("SME")}</th>
							<th class="text-right">${__("Participants")}</th>
							<th class="text-right">${__("Entries")}</th>
							<th class="text-right">${__("Programs")}</th>
						</tr>
					</thead>
					<tbody>${body}</tbody>
					<tfoot>
						<tr>
							<th>${__("Total")}</th>
							<th class="text-right">${cint(totalCount).toLocaleString()}</th>
							<th class="text-right">${cint(rows.length).toLocaleString()}</th>
							<th></th>
						</tr>
					</tfoot>
				</table>
			</div>
		`);
	};

	const showPrograms = (officer) => {
		const bucket = byOfficer[officer];
		if (!bucket) return;
		const programs = Object.values(bucket.programs || {}).sort(
			(a, b) =>
				b.participants - a.participants ||
				b.rows.length - a.rows.length ||
				a.program.localeCompare(b.program)
		);
		d.set_title(
			frappe.tif_customization.drilldown_title(officer || __("Programs"), bucket.participants)
		);
		d.get_secondary_btn()
			.show()
			.text(__("Export Excel"))
			.off("click")
			.on("click", () => exportProgramList(officer));
		const body = programs.length
			? programs
					.map(
						(p) => `<tr class="ow-program-row" data-officer="${frappe.utils.escape_html(
							officer
						)}" data-program="${frappe.utils.escape_html(p.program)}" style="cursor:pointer;">
					<td style="font-weight:600;color:#0f766e;">${frappe.utils.escape_html(p.program)}</td>
					<td class="text-right"><a href="#" class="ow-program-count" data-officer="${frappe.utils.escape_html(
						officer
					)}" data-program="${frappe.utils.escape_html(p.program)}">${cint(
							p.participants
						).toLocaleString()}</a></td>
					<td class="text-right">${cint(p.rows.length).toLocaleString()}</td>
				</tr>`
					)
					.join("")
			: `<tr><td colspan="3" class="text-muted text-center">${__(
					"No programs for this officer."
				)}</td></tr>`;
		d.fields_dict.html.$wrapper.html(`
			<p style="margin-bottom:10px;">
				<a href="#" class="ow-officer-back">${__("← SMEs")}</a>
				&nbsp;·&nbsp; ${frappe.utils.escape_html(officer || "")}
				&nbsp;·&nbsp; ${__("Participants")}: <strong>${cint(bucket.participants).toLocaleString()}</strong>
				&nbsp;·&nbsp; ${__("Programs")}: <strong>${programs.length}</strong>
			</p>
			<p class="text-muted" style="font-size:12px;margin-bottom:10px;">
				${__("Level 2 — Programs. Click a program to see participant documents.")}
			</p>
			<div class="table-responsive" style="max-height:420px;overflow:auto;">
				<table class="table table-bordered table-hover" style="font-size:12px;margin:0;">
					<thead>
						<tr>
							<th>${__("Program")}</th>
							<th class="text-right">${__("Participants")}</th>
							<th class="text-right">${__("Entries")}</th>
						</tr>
					</thead>
					<tbody>${body}</tbody>
				</table>
			</div>
		`);
	};

	const showPeople = (officer, program) => {
		const bucket = byOfficer[officer];
		const prog = bucket && bucket.programs && bucket.programs[program];
		const detail = (prog && prog.rows) || [];
		const heads = prog ? prog.participants : detail.length;
		d.set_title(
			frappe.tif_customization.drilldown_title(
				`${officer || ""} · ${program || __("Participants")}`,
				heads
			)
		);
		d.get_secondary_btn()
			.show()
			.text(__("Export Excel"))
			.off("click")
			.on("click", () => exportProgramDetail(officer, program));
		d.fields_dict.html.$wrapper.html(`
			<p style="margin-bottom:10px;">
				<a href="#" class="ow-officer-back">${__("← SMEs")}</a>
				&nbsp;·&nbsp;
				<a href="#" class="ow-program-back" data-officer="${frappe.utils.escape_html(
					officer || ""
				)}">${__("← Programs")}</a>
				&nbsp;·&nbsp; ${frappe.utils.escape_html(officer || "")}
				&nbsp;·&nbsp; ${frappe.utils.escape_html(program || "")}
				&nbsp;·&nbsp; ${__("Participants")}: <strong>${cint(heads).toLocaleString()}</strong>
				&nbsp;·&nbsp; ${__("Entries")}: <strong>${detail.length}</strong>
			</p>
			<p class="text-muted" style="font-size:12px;margin-bottom:10px;">
				${__("Level 3 — Document details.")}
			</p>
			<div class="table-responsive" style="max-height:420px;overflow:auto;">
				<table class="table table-bordered table-hover" style="font-size:12px;margin:0;">
					<thead>
						<tr>
							<th>${__("Document No")}</th>
							<th>${__("Visit Date")}</th>
							<th>${__("School / Venue")}</th>
							<th>${__("Participant")}</th>
							<th>${__("Contact")}</th>
							<th class="text-right">${__("Participants")}</th>
							<th>${__("Visit Summary")}</th>
						</tr>
					</thead>
					<tbody>${detailTable(detail)}</tbody>
				</table>
			</div>
		`);
	};

	if (data.staff && officers.length === 1) {
		showPrograms(officers[0].officer);
	} else {
		showOfficers();
	}

	d.$wrapper.on("click", ".ow-officer-count, .ow-officer-row", (e) => {
		e.preventDefault();
		const officer =
			$(e.currentTarget).attr("data-officer") ||
			$(e.target).closest("[data-officer]").attr("data-officer");
		if (officer) showPrograms(officer);
	});
	d.$wrapper.on("click", ".ow-program-count, .ow-program-row", (e) => {
		e.preventDefault();
		const $el = $(e.currentTarget).closest("[data-program]");
		const officer = $el.attr("data-officer") || $(e.currentTarget).attr("data-officer");
		const program = $el.attr("data-program") || $(e.currentTarget).attr("data-program");
		if (officer && program) showPeople(officer, program);
	});
	d.$wrapper.on("click", ".ow-officer-back", (e) => {
		e.preventDefault();
		showOfficers();
	});
	d.$wrapper.on("click", ".ow-program-back", (e) => {
		e.preventDefault();
		const officer = $(e.currentTarget).attr("data-officer");
		if (officer) showPrograms(officer);
		else showOfficers();
	});
	d.$wrapper.on("click", ".tif-open-visit", (e) => {
		e.preventDefault();
		const name = $(e.currentTarget).attr("data-visit");
		if (!name) return;
		frappe.tif_customization.open_field_visit_easy(name);
	});
	d.$wrapper.on("click", ".tif-open-school", (e) => {
		e.preventDefault();
		e.stopPropagation();
		const school = $(e.currentTarget).attr("data-school");
		if (school) frappe.tif_customization.open_school_visits_dialog(school);
	});
	d.$wrapper.on("click", ".tif-ow-import", (e) => {
		e.preventDefault();
		frappe.tif_customization.open_online_workshop_import({
			onDone: () => {
				d.hide();
				frappe.tif_customization.open_visit_drilldown(opts);
				if (typeof opts.onImported === "function") opts.onImported();
			},
		});
	});
	d.$wrapper.on("click", ".tif-ow-template", (e) => {
		e.preventDefault();
		frappe.tif_customization.download_online_workshop_template();
	});
	d.show();
};

frappe.tif_customization.download_online_workshop_template = function () {
	frappe.call({
		method: "tif_customization.tif_customization.api.online_workshop_import.download_online_workshop_template",
		freeze: true,
		callback: (r) => {
			const msg = r.message || {};
			const content = msg.content || "";
			const filename = msg.filename || "online_workshop_participants_template.csv";
			const blob = new Blob(["\ufeff" + content], { type: "text/csv;charset=utf-8;" });
			const a = document.createElement("a");
			a.href = URL.createObjectURL(blob);
			a.download = filename;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(a.href);
			frappe.show_alert({ message: __("Template downloaded"), indicator: "green" });
		},
	});
};

frappe.tif_customization.open_online_workshop_import = function (opts) {
	opts = opts || {};
	const dlg = new frappe.ui.Dialog({
		title: __("Import Online Workshop Participants"),
		fields: [
			{
				fieldtype: "HTML",
				fieldname: "help",
				options: `<p class="text-muted" style="margin:0 0 8px;">
					${__(
						"Upload the registration sheet (CSV/Excel): S.No., Training Program, Full Name, Father/Husband Name, WhatsApp / Contact Number, Father/Husband Phone / WhatsApp, Email, Home Address, City, Province, Subject, Qualification / Education, Job Title / Teaching Role, Marital Status, Qur'anic Core Values, School / Institute / Organization, School Contact Number, How Did You Hear About Us?, TIF Representative. Optional: Visit Date."
					)}
				</p>
				<p><a href="#" class="tif-ow-template-link">${__("Download template")}</a></p>`,
			},
			{
				fieldname: "default_visit_date",
				fieldtype: "Date",
				label: __("Workshop / Visit Date (if missing in file)"),
				default: frappe.datetime.get_today(),
				reqd: 1,
				description: __(
					"Used for rows that do not have a Visit Date column. Required so the card can filter by period."
				),
			},
			{
				fieldname: "import_file",
				fieldtype: "Attach",
				label: __("CSV / Excel file"),
				reqd: 1,
			},
		],
		primary_action_label: __("Import"),
		primary_action: (values) => {
			const file_url = values.import_file;
			if (!file_url) {
				frappe.msgprint(__("Please attach a file."));
				return;
			}
			frappe.call({
				method: "tif_customization.tif_customization.api.online_workshop_import.import_online_workshop_participants",
				args: {
					file_url,
					default_visit_date: values.default_visit_date,
				},
				freeze: true,
				freeze_message: __("Importing..."),
				callback: (r) => {
					const msg = r.message || {};
					frappe.msgprint({
						title: __("Import complete"),
						indicator: "green",
						message: msg.message || __("Import finished."),
					});
					dlg.hide();
					if (typeof opts.onDone === "function") opts.onDone(msg);
				},
			});
		},
	});
	dlg.$wrapper.on("click", ".tif-ow-template-link", (e) => {
		e.preventDefault();
		frappe.tif_customization.download_online_workshop_template();
	});
	dlg.show();
};

frappe.tif_customization.show_workshop_participant_dialog = function (data, opts) {
	opts = opts || {};
	const hideUnapproved = frappe.tif_customization.should_hide_school_unapproved(opts);
	const visits = data.rows || [];
	const people = data.participants || [];
	const byVisit = {};
	people.forEach((row) => {
		const key = row.visit || "";
		if (!byVisit[key]) byVisit[key] = [];
		byVisit[key].push(row);
	});
	const visitByName = {};
	visits.forEach((row) => {
		visitByName[row.name] = row;
	});
	const headcount = visits.reduce((sum, row) => sum + cint(row.participants), 0);
	const wsTitle = frappe.tif_customization.drilldown_title(
		data.label || __("Workshop Participants"),
		data.count != null ? data.count : headcount
	);
	const d = new frappe.ui.Dialog({
		title: wsTitle,
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
	const schoolCell = (row) => {
		let badge = "";
		if (!hideUnapproved && cint(row.school_unapproved)) badge = __("Un Approved");
		else if (cint(row.school_missing)) badge = __("School Detail Missing");
		badge = badge
			? `<span style="display:inline-block;margin-left:6px;padding:1px 6px;border:1px solid #dc2626;border-radius:999px;background:#fef2f2;color:#b91c1c;font-size:11px;font-weight:700;white-space:nowrap;">${badge}</span>`
			: "";
		return frappe.tif_customization.school_link_html(row.school, badge);
	};
	const showVisits = () => {
		d.set_title(wsTitle);
		const body = visits.length
			? visits
					.map((row) => {
						const n = cint(row.participants);
						const link = n
							? `<a href="#" class="ws-participant-count" data-visit="${frappe.utils.escape_html(
									row.name
								)}">${n.toLocaleString()}</a>`
							: "0";
						return `<tr>
					<td><a href="${frappe.utils.escape_html(row.url)}">${frappe.utils.escape_html(row.name)}</a></td>
					<td>${frappe.utils.escape_html(row.visit_date || "")}</td>
					<td>${frappe.utils.escape_html(row.type_label || row.type || "")}</td>
					<td>${schoolCell(row)}</td>
					<td>${frappe.utils.escape_html(row.officer || "")}</td>
					<td class="text-right">${link}</td>
					<td style="max-width:320px;white-space:normal;">${frappe.tif_customization.format_visit_remarks(
						row.remarks
					)}</td>
				</tr>`;
					})
					.join("")
			: `<tr><td colspan="7" class="text-muted text-center">${__("No workshops in this period.")}</td></tr>`;
		d.fields_dict.html.$wrapper.html(`
			<p class="text-muted" style="font-size:12px;margin-bottom:10px;">
				${__("Workshop Participants")}: <strong>${cint(headcount).toLocaleString()}</strong>
				&nbsp;·&nbsp; ${__("Workshops")}: <strong>${visits.length}</strong>
				&nbsp;·&nbsp; ${__("Click a participant number to see name, contact, school, and designation.")}
			</p>
			<div class="table-responsive" style="max-height:420px;overflow:auto;">
				<table class="table table-bordered table-hover" style="font-size:12px;margin:0;">
					<thead>
						<tr>
							<th>${__("Document No")}</th>
							<th>${__("Visit Date")}</th>
							<th>${__("Type / Task")}</th>
							<th>${__("School / Venue")}</th>
							<th>${__("SME")}</th>
							<th class="text-right">${__("Participants")}</th>
							<th>${__("Visit Summary")}</th>
						</tr>
					</thead>
					<tbody>${body}</tbody>
				</table>
			</div>
		`);
	};
	const showPeople = (visitName) => {
		const visit = visitByName[visitName] || {};
		const rows = byVisit[visitName] || [];
		const recorded = cint(visit.participants);
		d.set_title(
			frappe.tif_customization.drilldown_title(
				visit.school || visitName || __("Participants"),
				rows.length || recorded
			)
		);
		const table = rows.length
			? rows
					.map(
						(row) => `<tr>
					<td>${frappe.utils.escape_html(row.name || "—")}</td>
					<td>${frappe.utils.escape_html(row.contact || "—")}</td>
					<td>${frappe.tif_customization.school_link_html(row.school)}</td>
					<td>${frappe.utils.escape_html(row.designation || "—")}</td>
					<td>${frappe.utils.escape_html(row.date || visit.visit_date || "—")}</td>
					<td><a href="${frappe.utils.escape_html(row.url || visit.url || "#")}" target="_blank">${frappe.utils.escape_html(
							row.visit || visitName || ""
						)}</a></td>
				</tr>`
					)
					.join("")
			: `<tr><td colspan="6" class="text-muted text-center">${__(
					"This workshop records {0} participants, but the attendance names were not entered on the Field Visit.",
					[recorded.toLocaleString()]
				)}</td></tr>`;
		const namedNote =
			rows.length && recorded && rows.length !== recorded
				? `<span class="text-muted">&nbsp;·&nbsp; ${__("Recorded on the visit")}: ${recorded.toLocaleString()}</span>`
				: "";
		d.fields_dict.html.$wrapper.html(`
			<p style="margin-bottom:10px;">
				<a href="#" class="ws-participant-back">${__("← Workshops")}</a>
				&nbsp;·&nbsp; ${frappe.utils.escape_html(visit.school || "")}
				&nbsp;·&nbsp; ${__("Participants")}: <strong>${rows.length ? rows.length : recorded}</strong>
				${namedNote}
			</p>
			<div class="table-responsive" style="max-height:420px;overflow:auto;">
				<table class="table table-bordered table-hover" style="font-size:12px;margin:0;">
					<thead>
						<tr>
							<th>${__("Participant")}</th>
							<th>${__("Contact")}</th>
							<th>${__("School")}</th>
							<th>${__("Designation")}</th>
							<th>${__("Date")}</th>
							<th>${__("Visit")}</th>
						</tr>
					</thead>
					<tbody>${table}</tbody>
				</table>
			</div>
		`);
	};
	showVisits();
	d.$wrapper.on("click", ".ws-participant-count", (e) => {
		e.preventDefault();
		const visit = $(e.currentTarget).attr("data-visit");
		if (visit) showPeople(visit);
	});
	d.$wrapper.on("click", ".ws-participant-back", (e) => {
		e.preventDefault();
		showVisits();
	});
	d.$wrapper.on("click", ".tif-open-school", (e) => {
		e.preventDefault();
		e.stopPropagation();
		const school = $(e.currentTarget).attr("data-school");
		if (school) frappe.tif_customization.open_school_visits_dialog(school);
	});
	d.show();
};

frappe.tif_customization.show_volunteer_enrolment_dialog = function (data, opts) {
	opts = opts || {};
	const people = data.participants || [];
	const byOfficer = {};
	people.forEach((row) => {
		const officer = (row.officer || "").trim() || __("Unknown officer");
		if (!byOfficer[officer]) byOfficer[officer] = { officer, rows: [] };
		byOfficer[officer].rows.push(row);
	});
	const officers = Object.values(byOfficer).sort(
		(a, b) => b.rows.length - a.rows.length || a.officer.localeCompare(b.officer)
	);
	const total = people.length;
	const volTitle = frappe.tif_customization.drilldown_title(
		data.label || __("Volunteers enrolled through SME"),
		data.count != null ? data.count : total
	);
	const d = new frappe.ui.Dialog({
		title: volTitle,
		size: "extra-large",
		fields: [{ fieldtype: "HTML", fieldname: "html" }],
		primary_action_label: __("Close"),
		primary_action: () => d.hide(),
	});
	const importBar = `<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 10px;">
		<button type="button" class="btn btn-default btn-sm tif-vol-import">${__("Import Volunteers")}</button>
		<button type="button" class="btn btn-default btn-sm tif-vol-template">${__("Download Template")}</button>
		<span class="text-muted" style="font-size:11px;">${__(
			"CSV/Excel → creates Enrolment of Volunteers visits"
		)}</span>
	</div>`;
	const volunteerTable = (rows) => {
		if (!rows.length) {
			return `<tr><td colspan="7" class="text-muted text-center">${__("No volunteers")}</td></tr>`;
		}
		return rows
			.map(
				(row) => `<tr>
				<td>${frappe.utils.escape_html(row.name || "—")}</td>
				<td>${frappe.utils.escape_html(row.contact || "—")}</td>
				<td>${frappe.utils.escape_html(row.profession || "—")}</td>
				<td>${frappe.tif_customization.school_link_html(row.school)}</td>
				<td>${frappe.utils.escape_html(row.city || "—")}${
					row.province ? " · " + frappe.utils.escape_html(row.province) : ""
				}</td>
				<td>${frappe.utils.escape_html(row.form_submitted || "—")}</td>
				<td><a href="#" class="tif-open-visit" data-visit="${frappe.utils.escape_html(
					row.visit || ""
				)}">${frappe.utils.escape_html(row.visit || "")}</a></td>
			</tr>`
			)
			.join("");
	};
	const showOfficers = () => {
		d.set_title(volTitle);
		const body = officers.length
			? officers
					.map(
						(o) => `<tr>
					<td>${frappe.utils.escape_html(o.officer)}</td>
					<td class="text-right"><a href="#" class="vol-officer-count" data-officer="${frappe.utils.escape_html(
						o.officer
					)}">${cint(o.rows.length).toLocaleString()}</a></td>
				</tr>`
					)
					.join("")
			: `<tr><td colspan="2" class="text-muted text-center">${__("No volunteers in this period.")}</td></tr>`;
		d.fields_dict.html.$wrapper.html(`
			${importBar}
			<p class="text-muted" style="font-size:12px;margin-bottom:10px;">
				${__("Field officer and how many volunteers they enrolled. Click the number for volunteer details.")}
				&nbsp;·&nbsp; ${__("Total")}: <strong>${cint(total).toLocaleString()}</strong>
			</p>
			<div class="table-responsive" style="max-height:420px;overflow:auto;">
				<table class="table table-bordered table-hover" style="font-size:12px;margin:0;">
					<thead>
						<tr>
							<th>${__("SME")}</th>
							<th class="text-right">${__("Volunteers")}</th>
						</tr>
					</thead>
					<tbody>${body}</tbody>
					<tfoot>
						<tr>
							<th>${__("Total")}</th>
							<th class="text-right">${cint(total).toLocaleString()}</th>
						</tr>
					</tfoot>
				</table>
			</div>
		`);
	};
	const showPeople = (officer) => {
		const bucket = byOfficer[officer];
		const rows = bucket ? bucket.rows : people;
		d.set_title(
			frappe.tif_customization.drilldown_title(officer || __("Volunteers"), (bucket && bucket.rows) ? bucket.rows.length : 0)
		);
		d.fields_dict.html.$wrapper.html(`
			<p style="margin-bottom:10px;">
				${data.staff ? "" : `<a href="#" class="vol-officer-back">${__("← SMEs")}</a> &nbsp;·&nbsp;`}
				${frappe.utils.escape_html(officer || "")}
				&nbsp;·&nbsp; ${__("Volunteers")}: <strong>${rows.length}</strong>
			</p>
			<div class="table-responsive" style="max-height:420px;overflow:auto;">
				<table class="table table-bordered table-hover" style="font-size:12px;margin:0;">
					<thead>
						<tr>
							<th>${__("Volunteer")}</th>
							<th>${__("Contact")}</th>
							<th>${__("Profession")}</th>
							<th>${__("School")}</th>
							<th>${__("City")}</th>
							<th>${__("Form Submitted")}</th>
							<th>${__("Visit")}</th>
						</tr>
					</thead>
					<tbody>${volunteerTable(rows)}</tbody>
				</table>
			</div>
		`);
	};
	if (data.staff) showPeople((people[0] && people[0].officer) || data.staff);
	else showOfficers();
	d.$wrapper.on("click", ".vol-officer-count", (e) => {
		e.preventDefault();
		const officer = $(e.currentTarget).attr("data-officer");
		if (officer) showPeople(officer);
	});
	d.$wrapper.on("click", ".vol-officer-back", (e) => {
		e.preventDefault();
		showOfficers();
	});
	d.$wrapper.on("click", ".tif-open-visit", (e) => {
		e.preventDefault();
		const name = $(e.currentTarget).attr("data-visit");
		if (!name) return;
		frappe.tif_customization.open_field_visit_easy(name);
	});
	d.$wrapper.on("click", ".tif-open-school", (e) => {
		e.preventDefault();
		e.stopPropagation();
		const school = $(e.currentTarget).attr("data-school");
		if (school) frappe.tif_customization.open_school_visits_dialog(school);
	});
	d.$wrapper.on("click", ".tif-vol-import", (e) => {
		e.preventDefault();
		frappe.tif_customization.open_volunteer_import({
			onDone: () => {
				d.hide();
				if (typeof opts.onImported === "function") opts.onImported();
			},
		});
	});
	d.$wrapper.on("click", ".tif-vol-template", (e) => {
		e.preventDefault();
		frappe.tif_customization.download_volunteer_template();
	});
	d.show();
};

frappe.tif_customization.download_volunteer_template = function () {
	frappe.call({
		method: "tif_customization.tif_customization.api.volunteer_import.download_volunteer_template",
		freeze: true,
		callback: (r) => {
			const msg = r.message || {};
			const content = msg.content || "";
			const filename = msg.filename || "volunteer_registration_template.csv";
			const blob = new Blob(["\ufeff" + content], { type: "text/csv;charset=utf-8;" });
			const a = document.createElement("a");
			a.href = URL.createObjectURL(blob);
			a.download = filename;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(a.href);
			frappe.show_alert({ message: __("Template downloaded"), indicator: "green" });
		},
	});
};

frappe.tif_customization.open_volunteer_import = function (opts) {
	opts = opts || {};
	const dlg = new frappe.ui.Dialog({
		title: __("Import Volunteer Registration"),
		fields: [
			{
				fieldtype: "HTML",
				fieldname: "help",
				options: `<p class="text-muted" style="margin:0 0 8px;">
					${__(
						"Upload CSV/Excel with: Volunteer Name, Contact Number, Email, Profession, Contribution / Role, Province, City, Area, Address, School, Volunteer Form Submitted, Remarks, TIF Representative, Visit Date."
					)}
				</p>
				<p><a href="#" class="tif-vol-template-link">${__("Download template")}</a></p>`,
			},
			{
				fieldname: "import_file",
				fieldtype: "Attach",
				label: __("CSV / Excel file"),
				reqd: 1,
			},
		],
		primary_action_label: __("Import"),
		primary_action: (values) => {
			const file_url = values.import_file;
			if (!file_url) {
				frappe.msgprint(__("Please attach a file."));
				return;
			}
			frappe.call({
				method: "tif_customization.tif_customization.api.volunteer_import.import_volunteers",
				args: { file_url },
				freeze: true,
				freeze_message: __("Importing volunteers…"),
				callback: (r) => {
					const msg = r.message || {};
					const errs = (msg.errors || []).slice(0, 8);
					frappe.msgprint({
						title: __("Import complete"),
						indicator: "green",
						message:
							(msg.message || __("Import finished.")) +
							(errs.length
								? "<br><br><small>" +
								  errs.map((e) => frappe.utils.escape_html(e)).join("<br>") +
								  "</small>"
								: ""),
					});
					dlg.hide();
					if (typeof opts.onDone === "function") opts.onDone(msg);
				},
			});
		},
	});
	dlg.$wrapper.on("click", ".tif-vol-template-link", (e) => {
		e.preventDefault();
		frappe.tif_customization.download_volunteer_template();
	});
	dlg.show();
};

frappe.tif_customization.show_enrolment_officer_dialog = function (data) {
	const people = data.participants || [];
	const byOfficer = {};
	people.forEach((row) => {
		const officer = (row.officer || "").trim() || __("Unknown officer");
		if (!byOfficer[officer]) byOfficer[officer] = { officer, rows: [] };
		byOfficer[officer].rows.push(row);
	});
	const officers = Object.values(byOfficer).sort(
		(a, b) => b.rows.length - a.rows.length || a.officer.localeCompare(b.officer)
	);
	const total = people.length;
	const enrolTitle = frappe.tif_customization.drilldown_title(
		data.label || __("Enrollment of Participants in Online Course through SME"),
		data.count != null ? data.count : total
	);
	const d = new frappe.ui.Dialog({
		title: enrolTitle,
		size: "extra-large",
		fields: [{ fieldtype: "HTML", fieldname: "html" }],
		primary_action_label: __("Close"),
		primary_action: () => d.hide(),
	});
	const participantTable = (rows) => {
		if (!rows.length) {
			return `<tr><td colspan="7" class="text-muted text-center">${__("No participants")}</td></tr>`;
		}
		return rows
			.map(
				(row) => `<tr>
				<td>${frappe.utils.escape_html(row.name || "—")}</td>
				<td>${frappe.utils.escape_html(row.contact || "—")}</td>
				<td>${frappe.utils.escape_html(row.course || "—")}</td>
				<td>${frappe.utils.escape_html(row.date || "—")}</td>
				<td>${frappe.tif_customization.school_link_html(row.school)}</td>
				<td>${frappe.utils.escape_html(row.city || "—")}${row.province ? " · " + frappe.utils.escape_html(row.province) : ""}</td>
				<td><a href="${frappe.utils.escape_html(row.url || "#")}" target="_blank">${frappe.utils.escape_html(row.visit || "")}</a></td>
			</tr>`
			)
			.join("");
	};
	const showOfficers = () => {
		d.set_title(enrolTitle);
		const body = officers.length
			? officers
					.map(
						(o) => `<tr>
					<td>${frappe.utils.escape_html(o.officer)}</td>
					<td class="text-right"><a href="#" class="enrol-officer-count" data-officer="${frappe.utils.escape_html(
						o.officer
					)}">${cint(o.rows.length).toLocaleString()}</a></td>
				</tr>`
					)
					.join("")
			: `<tr><td colspan="2" class="text-muted text-center">${__("No enrollments in this period.")}</td></tr>`;
		d.fields_dict.html.$wrapper.html(`
			<p class="text-muted" style="font-size:12px;margin-bottom:10px;">
				${__("Field officer and how many participants they enrolled. Click the number for participant details.")}
				&nbsp;·&nbsp; ${__("Total")}: <strong>${cint(total).toLocaleString()}</strong>
			</p>
			<div class="table-responsive" style="max-height:420px;overflow:auto;">
				<table class="table table-bordered table-hover" style="font-size:12px;margin:0;">
					<thead>
						<tr>
							<th>${__("SME")}</th>
							<th class="text-right">${__("Enrollment")}</th>
						</tr>
					</thead>
					<tbody>${body}</tbody>
					<tfoot>
						<tr>
							<th>${__("Total")}</th>
							<th class="text-right">${cint(total).toLocaleString()}</th>
						</tr>
					</tfoot>
				</table>
			</div>
		`);
	};
	const showPeople = (officer) => {
		const bucket = byOfficer[officer];
		const rows = bucket ? bucket.rows : people;
		d.set_title(
			frappe.tif_customization.drilldown_title(officer || __("Participants"), rows.length)
		);
		d.fields_dict.html.$wrapper.html(`
			<p style="margin-bottom:10px;">
				${data.staff ? "" : `<a href="#" class="enrol-officer-back">${__("← SMEs")}</a> &nbsp;·&nbsp;`}
				${frappe.utils.escape_html(officer || "")}
				&nbsp;·&nbsp; ${__("Participants")}: <strong>${rows.length}</strong>
			</p>
			<div class="table-responsive" style="max-height:420px;overflow:auto;">
				<table class="table table-bordered table-hover" style="font-size:12px;margin:0;">
					<thead>
						<tr>
							<th>${__("Participant")}</th>
							<th>${__("Contact")}</th>
							<th>${__("Course")}</th>
							<th>${__("Date")}</th>
							<th>${__("School")}</th>
							<th>${__("City")}</th>
							<th>${__("Visit")}</th>
						</tr>
					</thead>
					<tbody>${participantTable(rows)}</tbody>
				</table>
			</div>
		`);
	};
	if (data.staff) showPeople((people[0] && people[0].officer) || data.staff);
	else showOfficers();
	d.$wrapper.on("click", ".enrol-officer-count", (e) => {
		e.preventDefault();
		const officer = $(e.currentTarget).attr("data-officer");
		if (officer) showPeople(officer);
	});
	d.$wrapper.on("click", ".enrol-officer-back", (e) => {
		e.preventDefault();
		showOfficers();
	});
	d.$wrapper.on("click", ".tif-open-school", (e) => {
		e.preventDefault();
		e.stopPropagation();
		const school = $(e.currentTarget).attr("data-school");
		if (school) frappe.tif_customization.open_school_visits_dialog(school);
	});
	d.show();
};

frappe.tif_customization.photo_day_gap = function (clickValue, docCreated) {
	const click = String(clickValue || "").slice(0, 10);
	const doc = String(docCreated || "").slice(0, 10);
	if (!/^\d{4}-\d{2}-\d{2}$/.test(click) || !/^\d{4}-\d{2}-\d{2}$/.test(doc)) return null;
	const ms = new Date(click + "T00:00:00") - new Date(doc + "T00:00:00");
	return Math.round(ms / 86400000);
};

frappe.tif_customization.photo_click_check = function (row) {
	const images = (row && row.images) || [];
	if (!images.length) return { label: __("No photo"), tone: "muted" };
	if (images.some((img) => !img.captured)) return { label: __("No proof — copy image"), tone: "bad" };
	let worst = 0;
	let known = false;
	images.forEach((img) => {
		const gap = frappe.tif_customization.photo_day_gap(img.captured, row.doc_created);
		if (gap === null) return;
		known = true;
		if (Math.abs(gap) > Math.abs(worst)) worst = gap;
	});
	if (!known) return { label: __("Click time found"), tone: "ok" };
	if (worst === 0) return { label: __("Same day as document"), tone: "ok" };
	const n = Math.abs(worst);
	if (worst < 0) {
		return {
			label: n === 1 ? __("1 day before document") : __("{0} days before document", [n]),
			tone: "warn",
		};
	}
	return {
		label: n === 1 ? __("1 day after document") : __("{0} days after document", [n]),
		tone: "warn",
	};
};

/** Same column set for every Field Visit card drilldown. */
frappe.tif_customization.visit_detail_headers = function () {
	return [
		__("Document No"),
		__("Visit Date"),
		__("Type / Task"),
		__("School"),
		__("Approval"),
		__("SME"),
		__("Status"),
		__("School Status"),
		__("Image"),
		__("Photo check"),
		__("Visit Summary"),
	];
};

frappe.tif_customization.visit_approval_label = function (row, opts) {
	opts = opts || {};
	const hideUnapproved = !!(
		opts.hideUnapproved || frappe.tif_customization.hide_school_unapproved
	);
	if (hideUnapproved) {
		if (cint(row && row.school_missing)) return __("School Detail Missing");
		return __("Approved");
	}
	if (cint(row && row.school_unapproved) || cint(row && row.school_missing)) {
		return __("Un Approved");
	}
	return __("Approved");
};

frappe.tif_customization.render_visit_detail_thead = function () {
	return `<tr>${frappe.tif_customization
		.visit_detail_headers()
		.map((h) => `<th>${h}</th>`)
		.join("")}</tr>`;
};

frappe.tif_customization.render_visit_detail_row = function (row, opts) {
	opts = opts || {};
	row = row || {};
	const esc = frappe.utils.escape_html;
	const hideUnapproved = !!(
		opts.hideUnapproved || frappe.tif_customization.hide_school_unapproved
	);
	const name = esc(row.name || "");
	const docCell = cint(row.imported)
		? `<span title="${__("Imported entry")}">${name}</span>`
		: row.url
			? `<a href="${esc(row.url)}" target="_blank">${name}</a>`
			: `<a href="#" class="tif-open-visit" data-visit="${name}">${name}</a>`;

	let schoolBadge = "";
	if (!hideUnapproved && cint(row.school_unapproved)) schoolBadge = __("Un Approved");
	else if (cint(row.school_missing)) schoolBadge = __("School Detail Missing");
	schoolBadge = schoolBadge
		? `<span style="display:inline-block;margin-left:6px;padding:1px 6px;border:1px solid #dc2626;border-radius:999px;background:#fef2f2;color:#b91c1c;font-size:11px;font-weight:700;white-space:nowrap;">${schoolBadge}</span>`
		: "";
	const schoolCell = row.school
		? frappe.tif_customization.school_link_html(row.school, schoolBadge)
		: `<span class="text-muted">—</span>`;

	const images = row.images || [];
	const photoWhen = (value) => {
		if (!value) return "";
		const user = frappe.datetime.str_to_user(value);
		return user && user !== "Invalid date" ? user : value;
	};
	let imageCell = `<span class="text-muted">—</span>`;
	if (images.length) {
		const first = images[0] || {};
		const extra =
			images.length > 1
				? ` <span class="text-muted">+${images.length - 1}</span>`
				: "";
		imageCell = `<a href="#" class="visit-photo tif-visit-photo-card" data-visit="${name}" title="${__(
			"Open school photo"
		)}"><img src="${esc(first.url || "")}" alt="" style="width:56px;height:42px;object-fit:cover;border-radius:6px;border:1px solid #d1d5db;vertical-align:middle;background:#f3f4f6;"></a>${extra}`;
	}

	const check = frappe.tif_customization.photo_click_check(row);
	const color =
		check.tone === "ok"
			? "#047857"
			: check.tone === "bad"
				? "#b91c1c"
				: check.tone === "warn"
					? "#b45309"
					: "#6b7280";
	const times = images.map((img) => photoWhen(img.captured)).filter(Boolean);
	const timeLine = times.length
		? `<div style="color:#047857;font-weight:600;margin-bottom:2px;">${times
				.map((t) => esc(t))
				.join("<br>")}</div>`
		: "";
	const photoCheck = `${timeLine}<span style="color:${color};font-weight:600;">${esc(
		check.label
	)}</span>`;

	let remarks = row.remarks || "";
	if (opts.metric === "online_participants" && cint(row.participants)) {
		const head = `${__("Participants")}: ${cint(row.participants)}`;
		remarks = remarks ? `${head} | ${remarks}` : head;
	}
	const remarksHtml = frappe.tif_customization.format_visit_remarks
		? frappe.tif_customization.format_visit_remarks(remarks)
		: esc(remarks || "—");

	return `<tr>
		<td>${docCell}</td>
		<td>${esc(row.visit_date || "")}</td>
		<td>${esc(row.type_label || row.type || "")}</td>
		<td>${schoolCell}</td>
		<td>${esc(frappe.tif_customization.visit_approval_label(row, opts))}</td>
		<td>${esc(row.officer || "")}</td>
		<td>${esc(row.status || "")}</td>
		<td>${esc(row.category || "")}</td>
		<td>${imageCell}</td>
		<td style="white-space:normal;">${photoCheck}</td>
		<td style="max-width:320px;white-space:normal;">${remarksHtml}</td>
	</tr>`;
};

frappe.tif_customization.show_visit_photo_dialog = function (row) {
	const images = (row && row.images) || [];
	const when = (value) => {
		if (!value) return "—";
		const user = frappe.datetime.str_to_user(value);
		return user && user !== "Invalid date" ? user : value;
	};
	const controlLine = (img) => {
		const docWhen = frappe.utils.escape_html(row.doc_created ? when(row.doc_created) : "—");
		if (!img.captured) {
			return `<div style="margin-top:4px;font-size:13px;color:#b45309;">
				<strong>${__("Control")}:</strong>
				${__(
					"No proof of click time. This is a copy image, so it cannot be checked against the document created on {0}.",
					[docWhen]
				)}
			</div>`;
		}
		const gap = frappe.tif_customization.photo_day_gap(img.captured, row.doc_created);
		let verdict = __("Click time is on the file. Document creation time was not found, so the day gap cannot be calculated.");
		let color = "#6b7280";
		if (gap === 0) {
			verdict = __("Photo click date is the same day the document was created ({0}).", [docWhen]);
			color = "#047857";
		} else if (gap < 0) {
			const n = Math.abs(gap);
			verdict =
				n === 1
					? __("Photo was clicked 1 day before the document was created ({0}).", [docWhen])
					: __("Photo was clicked {0} days before the document was created ({1}).", [n, docWhen]);
			color = "#b45309";
		} else if (gap > 0) {
			verdict =
				gap === 1
					? __("Photo was clicked 1 day after the document was created ({0}).", [docWhen])
					: __("Photo was clicked {0} days after the document was created ({1}).", [gap, docWhen]);
			color = "#b45309";
		}
		return `<div style="margin-top:4px;font-size:13px;color:${color};"><strong>${__("Control")}:</strong> ${verdict}</div>`;
	};
	const body = images.length
		? images
				.map((img) => {
					const captured = img.captured
						? `${__("Captured on phone")}: <strong>${frappe.utils.escape_html(when(img.captured))}</strong>`
						: __("Not the original photo. This is a copy image, so the phone capture time is not in the file.");
					const uploaded = img.uploaded
						? `${__("Uploaded in ERP")}: ${frappe.utils.escape_html(when(img.uploaded))}`
						: "";
					return `<div style="margin-bottom:16px;">
						<img src="${encodeURI(img.url || "")}" alt="" style="max-width:100%;max-height:420px;border-radius:8px;border:1px solid #e5e7eb;">
						<div style="margin-top:6px;font-size:13px;">${captured}</div>
						<div class="text-muted" style="font-size:12px;">${uploaded}</div>
						${controlLine(img)}
					</div>`;
				})
				.join("")
		: `<p class="text-muted">${__("No photo on this visit.")}</p>`;
	const d = new frappe.ui.Dialog({
		title: __("{0} — Photo", [row.school || row.name || __("School")]),
		size: "large",
		fields: [{ fieldtype: "HTML", fieldname: "html" }],
		primary_action_label: __("Close"),
		primary_action: () => d.hide(),
	});
	d.fields_dict.html.$wrapper.html(body);
	d.show();
};

frappe.tif_customization.show_monitoring_officer_dialog = function (data, rows, opts) {
	opts = opts || {};
	const hideUnapproved = frappe.tif_customization.should_hide_school_unapproved(opts);
	const meBucket = (row) => {
		const c = String(row.category || "")
			.toLowerCase()
			.replace(/-/g, " ")
			.replace(/\s+/g, " ")
			.trim();
		if (c === "active" || c.startsWith("active ")) return "active";
		if (c.startsWith("in active") || c.startsWith("inactive")) return "inactive";
		return "other";
	};
	const byOfficer = {};
	(rows || []).forEach((row) => {
		const officer = (row.officer || "").trim() || __("Unknown officer");
		if (!byOfficer[officer]) {
			byOfficer[officer] = { officer, total: 0, active: 0, inactive: 0, rows: [] };
		}
		byOfficer[officer].rows.push(row);
		byOfficer[officer].total += 1;
		const bucket = meBucket(row);
		if (bucket === "active") byOfficer[officer].active += 1;
		else if (bucket === "inactive") byOfficer[officer].inactive += 1;
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

	const meTitle = frappe.tif_customization.resolve_drilldown_title(
		data,
		__("Monitoring (M&E) Visits")
	);
	const d = new frappe.ui.Dialog({
		title: meTitle,
		size: "extra-large",
		fields: [{ fieldtype: "HTML", fieldname: "html" }],
		primary_action_label: __("Close"),
		primary_action: () => d.hide(),
	});

	const showOfficers = () => {
		d.set_title(meTitle);
		d.fields_dict.html.$wrapper.html(`
			<p class="text-muted" style="font-size:12px;margin-bottom:10px;">
				${__("Field officer wise Monitoring visits. Click Total, Active, or In-Active for the visit documents.")}
			</p>
			<div class="table-responsive" style="max-height:420px;overflow:auto;">
				<table class="table table-bordered table-hover" style="font-size:12px;margin:0;">
					<thead>
						<tr>
							<th>${__("SME")}</th>
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

	const showDetail = (officer, kind) => {
		const bucket = byOfficer[officer];
		const filtered = (bucket ? bucket.rows : []).filter((row) => {
			if (kind === "active") return meBucket(row) === "active";
			if (kind === "inactive") return meBucket(row) === "inactive";
			return true;
		});
		const kindLabel =
			kind === "active" ? __("Active") : kind === "inactive" ? __("In-Active") : __("Total Visit");
		d.set_title(
			frappe.tif_customization.drilldown_title(
				`${officer} · ${kindLabel}`,
				filtered.length
			)
		);
		const colCount = frappe.tif_customization.visit_detail_headers().length;
		const detailBody = filtered.length
			? filtered
					.map((row) =>
						frappe.tif_customization.render_visit_detail_row(row, {
							hideUnapproved,
							metric: data.metric,
						})
					)
					.join("")
			: `<tr><td colspan="${colCount}" class="text-muted text-center">${__("No Field Visits for this number.")}</td></tr>`;
		d.fields_dict.html.$wrapper.html(`
			<p style="margin-bottom:10px;">
				<a href="#" class="me-officer-back">${__("← SMEs")}</a>
				&nbsp;·&nbsp; ${frappe.utils.escape_html(officer)}
				&nbsp;·&nbsp; ${frappe.utils.escape_html(kindLabel)}: <strong>${filtered.length}</strong>
			</p>
			<p class="text-muted" style="font-size:12px;">${__("Click a Document No to open that Field Visit.")}</p>
			<div class="table-responsive" style="max-height:420px;overflow:auto;">
				<table class="table table-bordered table-hover" style="font-size:12px;margin:0;">
					<thead>${frappe.tif_customization.render_visit_detail_thead()}</thead>
					<tbody>${detailBody}</tbody>
				</table>
			</div>
		`);
	};

	d.$wrapper.on("click", ".visit-photo", (e) => {
		e.preventDefault();
		const visit = $(e.currentTarget).attr("data-visit");
		const row = (rows || []).find((r) => r.name === visit);
		if (row) frappe.tif_customization.show_visit_photo_dialog(row);
	});
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
	d.$wrapper.on("click", ".tif-open-school", (e) => {
		e.preventDefault();
		e.stopPropagation();
		const school = $(e.currentTarget).attr("data-school");
		if (school) frappe.tif_customization.open_school_visits_dialog(school);
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
		// KPI totals: staff attr empty → do not fall back to a stale employee filter when
		// a supervisor is selected (otherwise officer list shows the whole org).
		const supervisor = (ctx.supervisor || "").trim();
		const resolvedStaff = staff || (!supervisor ? ctx.staff || ctx.user || ctx.employee || "" : "");
		frappe.tif_customization.open_visit_drilldown({
			from_date: ctx.from_date,
			to_date: ctx.to_date,
			staff: resolvedStaff,
			supervisor,
			province: ctx.province || "",
			city: ctx.city || "",
			metric,
			submitted_only: ctx.submitted_only || ctx.submitted || 0,
			hideUnapproved: !!(ctx.hideUnapproved || frappe.tif_customization.hide_school_unapproved),
		});
	});
};

/** Shared School / Customer / SOA activity dashboard HTML. */
frappe.tif_customization.render_school_activity_html = function (data) {
	data = data || {};
	const esc = frappe.utils.escape_html;
	const visits = data.visits || [];
	const reps = data.representatives || [];
	const programs = data.programs || [];
	const books = data.books || [];
	const remarksFn =
		frappe.tif_customization.format_visit_remarks ||
		((text) => esc(text || "—"));

	const visitRows = visits.length
		? visits
				.map((v) => {
					const remarks = remarksFn(v.remarks);
					return `<tr>
						<td><a href="#" class="school-act-open-visit" data-name="${esc(v.name || "")}">${esc(
						v.name || "—"
					)}</a></td>
						<td>${esc(v.visit_date || "—")}</td>
						<td>${esc(v.type_label || v.type || "—")}</td>
						<td>${esc(v.field_officer || v.officer || "—")}</td>
						<td class="school-act-remarks"><div class="school-act-remarks-clip">${remarks}</div></td>
					</tr>`;
				})
				.join("")
		: `<tr><td colspan="5" class="text-muted text-center">${__("No field visits found for this school")}</td></tr>`;

	const repRows = reps.length
		? reps
				.map(
					(r) => `<tr>
				<td>${esc(r.person_name || "—")}</td>
				<td>${esc(r.designation || "—")}</td>
				<td>${esc(r.contact_number || "—")}</td>
				<td>${esc(r.source || "—")}</td>
			</tr>`
				)
				.join("")
		: `<tr><td colspan="4" class="text-muted text-center">${__("No school representatives found")}</td></tr>`;

	const programTone = (tone) => {
		const t = (tone || "").toLowerCase();
		if (t === "active") return "is-active";
		if (t === "inactive") return "is-inactive";
		if (t === "none") return "is-none";
		return "is-neutral";
	};

	const programCards = programs.length
		? programs
				.map(
					(p) => `<div class="school-act-chip ${programTone(p.tone)}">
				<strong>${esc(p.name || "")}</strong>
				<span>${esc(p.status || "—")}</span>
			</div>`
				)
				.join("")
		: `<div class="text-muted">${__("No program data")}</div>`;

	const bookRows = books.length
		? books
				.map(
					(b) => `<tr>
				<td>${esc(b.label || "—")}</td>
				<td style="white-space:normal;">${esc(b.detail || "—")}</td>
				<td>${esc(b.source || "—")}</td>
			</tr>`
				)
				.join("")
		: `<tr><td colspan="3" class="text-muted text-center">${__("No books data")}</td></tr>`;

	const flags = data.program_flags || [];
	const programKpis = flags.length
		? flags
				.map(
					(f) => `<div class="school-act-kpi school-act-kpi--prog ${programTone(f.tone)}" title="${esc(
						__("Program status for {0}", [f.code || ""])
					)}">
				<span>${esc(f.code || "")}</span>
				<strong>${esc(f.label || "—")}</strong>
			</div>`
				)
				.join("")
		: "";

	const schoolStatusLabel = data.status_label || __("Overall Status");
	const schoolStatusHint =
		data.status_hint ||
		__(
			"Overall Status = Active only if QPS, TPS or CEE is Active. Otherwise Inactive."
		);
	const overallTone = (() => {
		const s = String(data.status || "")
			.toLowerCase()
			.replace(/-/g, " ")
			.trim();
		if (s === "active") return "is-active";
		if (s === "inactive" || s === "in active") return "is-inactive";
		return "is-neutral";
	})();

	return `
		<style>
			.school-act { font-size: 12px; color: var(--text-color); }
			.school-act-hero {
				display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap;
				padding:14px 16px; margin-bottom:12px; border-radius:12px;
				background: linear-gradient(135deg, #0f766e 0%, #1d4ed8 100%); color:#fff;
			}
			.school-act-hero h3 { margin:0 0 4px; font-size:16px; color:#fff; }
			.school-act-hero p { margin:0; opacity:.9; }
			.school-act-kpis { display:flex; gap:10px; flex-wrap:wrap; align-items:stretch; }
			.school-act-kpi {
				min-width:88px; padding:8px 10px; border-radius:10px;
				background:rgba(255,255,255,.14); border:1px solid rgba(255,255,255,.22);
			}
			.school-act-kpi span { display:block; font-size:10px; text-transform:uppercase; letter-spacing:.04em; opacity:.8; }
			.school-act-kpi strong { font-size:15px; line-height:1.2; }
			.school-act-kpi--prog.is-active { background:rgba(22,163,74,.35); border-color:rgba(187,247,208,.7); }
			.school-act-kpi--prog.is-inactive { background:rgba(220,38,38,.35); border-color:rgba(254,202,202,.75); }
			.school-act-kpi--prog.is-none { background:rgba(100,116,139,.28); border-color:rgba(226,232,240,.35); }
			.school-act-hint {
				margin:0 0 12px; padding:8px 12px; border-radius:8px; font-size:11px; line-height:1.4;
				background:#fff7ed; border:1px solid #fed7aa; color:#9a3412;
			}
			.school-act-grid {
				display:grid; grid-template-columns:minmax(0,1.1fr) minmax(0,.9fr); gap:12px; margin-bottom:12px;
			}
			.school-act-panel {
				border:1px solid var(--border-color,#e5e7eb); border-radius:12px; background:var(--card-bg,#fff);
				overflow:hidden;
			}
			.school-act-panel h4 {
				margin:0; padding:10px 12px; font-size:13px; border-bottom:1px solid var(--border-color,#e5e7eb);
				background:var(--control-bg,#f8fafc);
			}
			.school-act-panel.wide > h4.school-act-visits-title {
				font-size:22px !important; font-weight:800 !important; line-height:1.3 !important;
				padding:14px 16px !important; letter-spacing:.02em; color:#0f172a !important;
			}
			.school-act-panel .body { max-height:280px; overflow:auto; }
			.school-act-panel.wide .body { max-height:560px; overflow:auto; }
			.school-act table { width:100%; border-collapse:collapse; margin:0; }
			.school-act-panel.wide table.school-act-visits {
				table-layout:fixed; width:100%;
			}
			.school-act th, .school-act td {
				padding:6px 10px; border-bottom:1px solid var(--border-color,#e5e7eb);
				text-align:left; vertical-align:top;
			}
			.school-act th { font-size:11px; text-transform:uppercase; color:var(--text-muted,#6b7280); background:var(--control-bg,#f8fafc); position:sticky; top:0; }
			.school-act-panel.wide table.school-act-visits th:nth-child(1),
			.school-act-panel.wide table.school-act-visits td:nth-child(1) { width:12%; }
			.school-act-panel.wide table.school-act-visits th:nth-child(2),
			.school-act-panel.wide table.school-act-visits td:nth-child(2) { width:9%; white-space:nowrap; }
			.school-act-panel.wide table.school-act-visits th:nth-child(3),
			.school-act-panel.wide table.school-act-visits td:nth-child(3) { width:7%; white-space:nowrap; }
			.school-act-panel.wide table.school-act-visits th:nth-child(4),
			.school-act-panel.wide table.school-act-visits td:nth-child(4) { width:10%; }
			.school-act-panel.wide table.school-act-visits th:nth-child(5),
			.school-act-panel.wide table.school-act-visits td:nth-child(5) { width:62%; }
			.school-act-remarks {
				min-width:0; max-width:none; width:62%;
				white-space:normal; word-break:break-word;
			}
			.school-act-remarks-clip {
				max-height:9.5em; overflow:auto; line-height:1.4; font-size:12px;
				padding-right:6px;
			}
			.school-act-remarks .blk { margin:0 0 3px; }
			.school-act-remarks .blk strong { color:#0f766e; }
			.school-act-chips { display:flex; flex-wrap:wrap; gap:8px; padding:12px; }
			.school-act-chip {
				display:flex; flex-direction:column; gap:2px; min-width:140px; padding:10px 12px;
				border-radius:10px; border:1px solid var(--border-color,#e5e7eb); background:#f0fdfa;
			}
			.school-act-chip.is-active { background:#ecfdf5; border-color:#86efac; }
			.school-act-chip.is-active span { color:#166534; font-weight:700; }
			.school-act-chip.is-inactive { background:#fef2f2; border-color:#fca5a5; }
			.school-act-chip.is-inactive span { color:#991b1b; font-weight:700; }
			.school-act-chip.is-none { background:#f8fafc; border-color:#cbd5e1; }
			.school-act-chip.is-none span { color:#64748b; }
			.school-act-chip small { color:var(--text-muted,#6b7280); }
			@media (max-width: 900px) { .school-act-grid { grid-template-columns:1fr; } }
		</style>
		<div class="school-act">
			<div class="school-act-hero">
				<div>
					<h3>${esc(data.school_name || data.school || __("School"))}</h3>
					<p>${__("Field visits, representatives, books and programs running at this school")}</p>
				</div>
				<div class="school-act-kpis">
					<div class="school-act-kpi"><span>${__("Visits")}</span><strong>${cint(data.visit_count)}</strong></div>
					<div class="school-act-kpi"><span>${__("Representatives")}</span><strong>${reps.length}</strong></div>
					<div class="school-act-kpi school-act-kpi--prog ${overallTone}" title="${esc(schoolStatusHint)}">
						<span>${esc(schoolStatusLabel)}</span>
						<strong>${esc(data.status || "—")}</strong>
					</div>
					${programKpis}
				</div>
			</div>
			<div class="school-act-hint">${esc(schoolStatusHint)}</div>
			<div class="school-act-grid">
				<div class="school-act-panel">
					<h4>${__("School Representatives")}</h4>
					<div class="body">
						<table>
							<thead><tr>
								<th>${__("Name")}</th><th>${__("Designation")}</th>
								<th>${__("Phone")}</th><th>${__("Source")}</th>
							</tr></thead>
							<tbody>${repRows}</tbody>
						</table>
					</div>
				</div>
				<div class="school-act-panel">
					<h4>${__("Programs Running")} <small style="font-weight:500;color:#64748b;">(${__(
						"QPS / TPS / CEE"
					)})</small></h4>
					<div class="school-act-chips">${programCards}</div>
				</div>
			</div>
			<div class="school-act-panel" style="margin-bottom:12px;">
				<h4>${__("Books Running")}</h4>
				<div class="body">
					<table>
						<thead><tr>
							<th>${__("Item")}</th><th>${__("Detail")}</th><th>${__("Source")}</th>
						</tr></thead>
						<tbody>${bookRows}</tbody>
					</table>
				</div>
			</div>
			<div class="school-act-panel wide">
				<h4 class="school-act-visits-title" style="font-size:22px !important;font-weight:800 !important;line-height:1.3;padding:14px 16px;color:#0f172a;">${__("Field Visits & Remarks")} (${visits.length})</h4>
				<div class="body">
					<table class="school-act-visits">
						<thead><tr>
							<th>${__("Document No")}</th>
							<th>${__("Visit Date")}</th>
							<th>${__("Type")}</th>
							<th>${__("SME")}</th>
							<th>${__("Visit Summary / Remarks")}</th>
						</tr></thead>
						<tbody>${visitRows}</tbody>
					</table>
				</div>
			</div>
		</div>
	`;
};

frappe.tif_customization.mount_school_activity = function ($wrap, schoolKey, customer) {
	if (!$wrap || !$wrap.length) return;
	$wrap.html(`<div class="text-muted" style="padding:12px;">${__("Loading activity…")}</div>`);
	frappe.call({
		method: "tif_customization.tif_customization.doctype.school.school.get_school_activity_dashboard",
		args: { school: schoolKey || "", customer: customer || "" },
		callback: (r) => {
			$wrap.html(frappe.tif_customization.render_school_activity_html(r.message || {}));
			$wrap.find(".school-act-open-visit").on("click", function (e) {
				e.preventDefault();
				const name = this.getAttribute("data-name");
				if (!name) return;
				if (frappe.tif_customization.open_field_visit_easy) {
					frappe.tif_customization.open_field_visit_easy(name);
				} else {
					frappe.set_route("Form", "Field Visit", name);
				}
			});
		},
		error: () => {
			$wrap.html(
				`<div class="text-danger" style="padding:12px;">${__("Could not load school activity.")}</div>`
			);
		},
	});
};
