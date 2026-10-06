frappe.tif_customization = frappe.tif_customization || {};

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
	if (data.metric === "enrolment") {
		frappe.tif_customization.show_enrolment_officer_dialog(data);
		return;
	}
	if (data.metric === "workshop_registration") {
		frappe.tif_customization.show_workshop_participant_dialog(data);
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
						${showRemarks ? `<th>${__("Visit Summary")}</th>` : ""}
					</tr>
				</thead>
				<tbody>${body}</tbody>
			</table>
		</div>
	`);
	d.show();
};

frappe.tif_customization.show_workshop_participant_dialog = function (data) {
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
	const d = new frappe.ui.Dialog({
		title: data.title || __("Workshop Participants"),
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
		const school = frappe.utils.escape_html(row.school || "—");
		let badge = "";
		if (cint(row.school_unapproved)) badge = __("Un Approved");
		else if (cint(row.school_missing)) badge = __("School Detail Missing");
		badge = badge
			? `<span style="display:inline-block;margin-left:6px;padding:1px 6px;border:1px solid #dc2626;border-radius:999px;background:#fef2f2;color:#b91c1c;font-size:11px;font-weight:700;white-space:nowrap;">${badge}</span>`
			: "";
		return `${school}${badge}`;
	};
	const showVisits = () => {
		d.set_title(data.title || __("Workshop Participants: {0}", [headcount]));
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
					<td>${frappe.utils.escape_html(row.type || "")}</td>
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
							<th>${__("Type")}</th>
							<th>${__("School / Venue")}</th>
							<th>${__("Officer")}</th>
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
		d.set_title(__("{0} — Participants", [visit.school || visitName || __("Participants")]));
		const table = rows.length
			? rows
					.map(
						(row) => `<tr>
					<td>${frappe.utils.escape_html(row.name || "—")}</td>
					<td>${frappe.utils.escape_html(row.contact || "—")}</td>
					<td>${frappe.utils.escape_html(row.school || "—")}</td>
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
	d.show();
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
	const d = new frappe.ui.Dialog({
		title: data.title || __("Enrollment of Participants"),
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
				<td>${frappe.utils.escape_html(row.school || "—")}</td>
				<td>${frappe.utils.escape_html(row.city || "—")}${row.province ? " · " + frappe.utils.escape_html(row.province) : ""}</td>
				<td><a href="${frappe.utils.escape_html(row.url || "#")}" target="_blank">${frappe.utils.escape_html(row.visit || "")}</a></td>
			</tr>`
			)
			.join("");
	};
	const showOfficers = () => {
		d.set_title(data.title || __("Enrollment of Participants"));
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
							<th>${__("Field Officer")}</th>
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
		d.set_title(__("{0} — Participants", [officer || __("Participants")]));
		d.fields_dict.html.$wrapper.html(`
			<p style="margin-bottom:10px;">
				${data.staff ? "" : `<a href="#" class="enrol-officer-back">${__("← Field officers")}</a> &nbsp;·&nbsp;`}
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

frappe.tif_customization.show_monitoring_officer_dialog = function (data, rows) {
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
	const photoCell = (row) => {
		const images = row.images || [];
		if (!images.length) return `<span class="text-muted">—</span>`;
		const first = images[0];
		const extra = images.length > 1 ? ` <span class="text-muted">+${images.length - 1}</span>` : "";
		return `<a href="#" class="visit-photo" data-visit="${frappe.utils.escape_html(
			row.name || ""
		)}" title="${__("Open school photo")}"><img src="${encodeURI(
			first.url || ""
		)}" alt="" style="width:56px;height:42px;object-fit:cover;border-radius:6px;border:1px solid #d1d5db;vertical-align:middle;background:#f3f4f6;"></a>${extra}`;
	};
	const photoWhen = (value) => {
		if (!value) return "";
		const user = frappe.datetime.str_to_user(value);
		return user && user !== "Invalid date" ? user : value;
	};
	const photoCheckCell = (row) => {
		const check = frappe.tif_customization.photo_click_check(row);
		const color = check.tone === "ok" ? "#047857" : check.tone === "bad" ? "#b91c1c" : check.tone === "warn" ? "#b45309" : "#6b7280";
		const times = (row.images || []).map((img) => photoWhen(img.captured)).filter(Boolean);
		const timeLine = times.length
			? `<div style="color:#047857;font-weight:600;margin-bottom:2px;">${times
					.map((t) => frappe.utils.escape_html(t))
					.join("<br>")}</div>`
			: "";
		return `${timeLine}<span style="color:${color};font-weight:600;">${frappe.utils.escape_html(check.label)}</span>`;
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
					<td>${photoCell(row)}</td>
					<td style="white-space:normal;">${photoCheckCell(row)}</td>
					<td style="max-width:320px;white-space:normal;">${frappe.tif_customization.format_visit_remarks(
						row.remarks
					)}</td>
				</tr>`
					)
					.join("")
			: `<tr><td colspan="11" class="text-muted text-center">${__("No Field Visits for this number.")}</td></tr>`;
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
							<th>${__("Approval")}</th>
							<th>${__("Officer")}</th>
							<th>${__("Status")}</th>
							<th>${__("School Status")}</th>
							<th>${__("Image")}</th>
							<th>${__("Photo check")}</th>
							<th>${__("Visit Summary")}</th>
						</tr>
					</thead>
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
