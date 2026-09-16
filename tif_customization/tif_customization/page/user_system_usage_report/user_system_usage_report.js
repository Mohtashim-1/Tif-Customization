frappe.pages["user-system-usage-report"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("User System Usage Report"),
		single_column: true,
	});
	new frappe.tif_customization.UserSystemUsageReport(page).make();
};

frappe.tif_customization = frappe.tif_customization || {};

frappe.tif_customization.UserSystemUsageReport = class UserSystemUsageReport {
	constructor(page) {
		this.page = page;
		this.data = null;
	}

	make() {
		this.make_layout();
		this.make_filters();
		this.page.set_primary_action(__("Refresh"), () => this.load_data(), "refresh");
		this.page.add_action_item(__("Export CSV"), () => this.export_csv());
		this.page.add_action_item(__("Print"), () => window.print());
		this.bind_events();
		this.load_data();
	}

	make_layout() {
		$(this.page.body).html(`
			<div class="usu-root">
				<style>
					.usu-root{padding:16px 16px 28px;max-width:100%;margin:0 auto}
					.usu-note{font-size:12px;color:#64748b;margin:0 0 12px;line-height:1.45}
					.usu-filters{margin-bottom:14px}
					.usu-kpis{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;margin:0 0 16px}
					.usu-kpi{border:1px solid #e5e7eb;border-top:4px solid #1b5e3b;border-radius:10px;padding:12px 14px;background:#fff}
					.usu-kpi .lbl{font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase}
					.usu-kpi .val{font-size:20px;font-weight:800;color:#123524;margin-top:4px;font-variant-numeric:tabular-nums}
					.usu-card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden}
					.usu-head{padding:14px 18px;border-bottom:3px solid #1b5e3b;background:linear-gradient(180deg,#f8faf8,#fff)}
					.usu-head h2{margin:0;font-size:15px;font-weight:800;color:#1b5e3b;text-transform:uppercase;letter-spacing:.5px}
					.usu-meta{font-size:11px;color:#64748b;margin-top:4px}
					.usu-table-wrap{overflow:auto;max-height:min(70vh,calc(100vh - 320px))}
					.usu-table{width:100%;border-collapse:collapse;font-size:11px;min-width:1680px}
					.usu-table th,.usu-table td{padding:7px 8px;border:1px solid #e5e7eb;vertical-align:middle}
					.usu-table thead th{
						position:sticky;top:0;z-index:2;background:#1b5e3b;color:#fff;
						font-size:10px;text-transform:uppercase;white-space:nowrap
					}
					.usu-table thead th.grp-erp{background:#14532d}
					.usu-table thead th.grp-field{background:#334155}
					.usu-table .num{text-align:right;font-variant-numeric:tabular-nums}
					.usu-table .left{text-align:left}
					.usu-table .mono{font-family:ui-monospace,monospace;font-size:10px}
					.usu-table tbody tr:nth-child(even){background:#fafcfa}
					.usu-table tbody tr.usu-click{cursor:pointer}
					.usu-table tbody tr.usu-click:hover{background:#eef6f0}
					.usu-band{display:inline-block;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:700}
					.usu-band--High{background:#dcfce7;color:#166534}
					.usu-band--Medium{background:#dbeafe;color:#1e40af}
					.usu-band--Low{background:#fef3c7;color:#92400e}
					.usu-band--Inactive,.usu-band--Dormant{background:#fee2e2;color:#991b1b}
					.usu-band--Disabled{background:#f1f5f9;color:#64748b}
					.usu-row-warn{background:#fff7ed!important}
					@media print{.page-head,.navbar,.usu-filters,.usu-note,.no-print{display:none!important}}
				</style>
				<p class="usu-note no-print" id="usu-data-notes"></p>
				<div id="usu-filters" class="usu-filters row no-print"></div>
				<div id="usu-body"><p class="text-muted">${__("Loading...")}</p></div>
			</div>
		`);
	}

	make_filter(df) {
		const wrap = $('<div class="col-md-2" style="margin-bottom:8px;"></div>');
		$("#usu-filters").append(wrap);
		const field = frappe.ui.form.make_control({
			parent: wrap,
			df: Object.assign({ input_class: "input-xs", change: () => this.schedule_load() }, df),
			render_input: true,
		});
		field.refresh();
		if (df.default !== undefined && df.default !== null && df.default !== "") {
			field.set_value(df.default);
		}
		return field;
	}

	schedule_load() {
		clearTimeout(this._loadTimer);
		this._loadTimer = setTimeout(() => this.load_data(), 300);
	}

	make_filters() {
		const month = frappe.datetime.month_start();
		const today = frappe.datetime.get_today();
		this.from_date = this.make_filter({
			label: __("From Date"),
			fieldtype: "Date",
			fieldname: "from_date",
			default: month,
			reqd: 1,
		});
		this.to_date = this.make_filter({
			label: __("To Date"),
			fieldtype: "Date",
			fieldname: "to_date",
			default: today,
			reqd: 1,
		});
		this.user_type = this.make_filter({
			label: __("User type"),
			fieldtype: "Select",
			fieldname: "user_type",
			options: "All ERP users\nSystem User\nWebsite User",
			default: "All ERP users",
		});
		this.status = this.make_filter({
			label: __("User Status"),
			fieldtype: "Select",
			fieldname: "status",
			options: "Enabled\nDisabled\nAll",
			default: "Enabled",
		});
		this.department = this.make_filter({
			label: __("Department"),
			fieldtype: "Link",
			fieldname: "department",
			options: "Department",
		});
		this.role = this.make_filter({
			label: __("Role"),
			fieldtype: "Link",
			fieldname: "role",
			options: "Role",
		});
		this.user = this.make_filter({
			label: __("User"),
			fieldtype: "Link",
			fieldname: "user",
			options: "User",
		});
		this.usage_band = this.make_filter({
			label: __("Usage Band"),
			fieldtype: "Select",
			fieldname: "usage_band",
			options: "\nHigh\nMedium\nLow\nInactive\nDormant\nDisabled",
		});
		this.activity_only = this.make_filter({
			label: __("Only users with activity in period"),
			fieldtype: "Check",
			fieldname: "activity_only",
			default: 0,
		});
		this.field_staff_only = this.make_filter({
			label: __("Field staff roles only"),
			fieldtype: "Check",
			fieldname: "field_staff_only",
			default: 0,
		});
	}

	get_filters() {
		return {
			from_date: this.from_date.get_value(),
			to_date: this.to_date.get_value(),
			user_type: this.user_type.get_value() || "All ERP users",
			status: this.status.get_value() || "Enabled",
			department: this.department.get_value() || "",
			role: this.role.get_value() || "",
			user: this.user.get_value() || "",
			usage_band: this.usage_band.get_value() || "",
			activity_only: this.activity_only.get_value() ? 1 : 0,
			field_staff_only: this.field_staff_only.get_value() ? 1 : 0,
		};
	}

	load_data() {
		const filters = this.get_filters();
		if (!filters.from_date || !filters.to_date) {
			frappe.msgprint(__("Please select From Date and To Date."));
			return;
		}
		$("#usu-body").html(`<p class="text-muted">${__("Loading...")}</p>`);
		frappe.call({
			method:
				"tif_customization.tif_customization.page.user_system_usage_report.user_system_usage_report.get_report_data",
			args: { filters },
			callback: (r) => {
				if (!r.message) {
					$("#usu-body").html(`<p class="text-danger">${__("Failed to load.")}</p>`);
					return;
				}
				this.data = r.message;
				this.render(r.message);
			},
		});
	}

	fmt(n) {
		return frappe.format(n || 0, { fieldtype: "Int" });
	}

	fmt_score(n) {
		return frappe.format(flt(n || 0), { fieldtype: "Float", precision: 1 });
	}

	fmt_dt(v) {
		if (!v) return "—";
		return frappe.datetime.str_to_user(v);
	}

	format_minutes(m) {
		const mins = cint(m || 0);
		if (!mins) return "0m";
		const h = Math.floor(mins / 60);
		const rem = mins % 60;
		return h ? `${h}h ${rem}m` : `${mins}m`;
	}

	band_class(band) {
		return `usu-band usu-band--${frappe.utils.escape_html(band || "Inactive")}`;
	}

	render(data) {
		const k = data.kpis || {};
		const period = `${frappe.datetime.str_to_user(data.from_date)} — ${frappe.datetime.str_to_user(data.to_date)}`;
		const notes = data.data_notes || {};
		$("#usu-data-notes").html(
			[
				notes.login_ip,
				notes.erp_time,
				notes.documents_created,
				notes.prints_pdf,
			]
				.filter(Boolean)
				.map((t) => `<span>${frappe.utils.escape_html(t)}</span>`)
				.join(" ")
		);

		const kpis = [
			{ lbl: __("Users listed"), val: this.fmt(k.users) },
			{ lbl: __("Active in period"), val: this.fmt(k.active_users) },
			{ lbl: __("Est. ERP time"), val: this.format_minutes(k.total_erp_minutes) },
			{ lbl: __("Docs created"), val: this.fmt(k.total_documents_created) },
			{ lbl: __("Document changes"), val: this.fmt(k.total_doc_changes) },
			{ lbl: __("PDF / print"), val: this.fmt(k.total_prints_pdf) },
			{ lbl: __("Logins (Activity Log)"), val: this.fmt(k.total_logins) },
			{ lbl: __("Avg engagement"), val: this.fmt_score(k.avg_engagement) },
		];

		const rows = (data.rows || [])
			.map((r) => {
				const warn =
					r.usage_band === "Inactive" || r.usage_band === "Dormant" || r.usage_band === "Low"
						? " usu-row-warn"
						: "";
				const ip = r.last_login_ip || "—";
				let ipTitle = __("IP is stored only in Activity Log login rows.");
				if (r.last_login_ip) {
					ipTitle = r.last_login_ip_period || r.last_login_ip;
				} else if (r.login_on_user_record) {
					ipTitle = __(
						"User.last_login is in this period but Activity Log has no Login rows (cleared or not logged)."
					);
				}
				const loginCell =
					cint(r.login_count) > 0
						? this.fmt(r.login_count)
						: r.login_on_user_record
							? `<span title="${frappe.utils.escape_html(
									__("Last login on User profile; Activity Log count is 0")
							  )}">0*</span>`
							: "0";
				const timeTitle =
					r.erp_minutes_source === "activity_log"
						? __("From Login → Logout in Activity Log")
						: __("Estimated from document activity times per day");
				return `<tr class="usu-click${warn}" data-user="${frappe.utils.escape_html(r.user)}">
					<td class="left">${frappe.utils.escape_html(r.full_name || r.user)}</td>
					<td class="left">${frappe.utils.escape_html(r.email || "")}</td>
					<td class="left">${frappe.utils.escape_html(r.user_type || "")}</td>
					<td class="left">${frappe.utils.escape_html(r.department || "—")}</td>
					<td class="left"><span class="${this.band_class(r.usage_band)}">${frappe.utils.escape_html(
					r.usage_band || ""
				)}</span></td>
					<td class="num">${this.fmt_score(r.engagement_score)}</td>
					<td class="num" title="${frappe.utils.escape_html(timeTitle)}">${frappe.utils.escape_html(
					r.erp_time_label || "0m"
				)}</td>
					<td class="num">${this.fmt(r.active_days)}</td>
					<td class="num">${loginCell}</td>
					<td class="left mono" title="${frappe.utils.escape_html(ipTitle)}">${frappe.utils.escape_html(ip)}</td>
					<td class="num">${this.fmt(r.distinct_ips)}</td>
					<td class="left">${this.fmt_dt(r.last_login)}</td>
					<td class="num">${this.fmt(r.documents_created)}</td>
					<td class="num">${this.fmt(r.unique_documents)}</td>
					<td class="num">${this.fmt(r.doctypes_touched)}</td>
					<td class="num">${this.fmt(r.doc_changes)}</td>
					<td class="num">${this.fmt(r.prints_pdf)}</td>
					<td class="num">${this.fmt(r.files_uploaded)}</td>
					<td class="num">${this.fmt(r.comments)}</td>
					<td class="num">${this.fmt(r.reports_run)}</td>
					<td class="num">${this.fmt(r.exports)}</td>
					<td class="num">${this.fmt(r.communications)}</td>
					<td class="num">${this.fmt(r.expense_claims)}</td>
					<td class="num">${this.fmt(r.todos_completed)}</td>
					<td class="num">${this.fmt(r.field_visits_submitted)}</td>
					<td class="num">${r.days_since_active != null ? this.fmt(r.days_since_active) : "—"}</td>
					<td class="left" title="${frappe.utils.escape_html(r.roles || "")}">${frappe.utils.escape_html(
					(r.roles || "").slice(0, 40)
				)}${(r.roles || "").length > 40 ? "…" : ""}</td>
				</tr>`;
			})
			.join("");

		$("#usu-body").html(`
			<div class="usu-kpis">${kpis
				.map(
					(c) => `<div class="usu-kpi"><div class="lbl">${c.lbl}</div><div class="val">${c.val}</div></div>`
				)
				.join("")}</div>
			<div class="usu-card">
				<div class="usu-head">
					<h2>${__("ERP usage by user")}</h2>
					<div class="usu-meta">${__("Period")}: ${period} · ${__(
			"All modules · Click a row for DocType breakdown and login IPs"
		)}</div>
				</div>
				<div class="usu-table-wrap">
					<table class="usu-table">
						<thead><tr>
							<th>${__("Name")}</th>
							<th>${__("Email")}</th>
							<th>${__("Type")}</th>
							<th>${__("Department")}</th>
							<th>${__("Band")}</th>
							<th>${__("Score")}</th>
							<th class="grp-erp">${__("Est. time")}</th>
							<th class="grp-erp">${__("Active days")}</th>
							<th class="grp-erp">${__("Logins (log)")}</th>
							<th class="grp-erp">${__("Last login IP")}</th>
							<th class="grp-erp">${__("# IPs")}</th>
							<th class="grp-erp">${__("Last login")}</th>
							<th class="grp-erp">${__("Created")}</th>
							<th class="grp-erp">${__("Unique docs")}</th>
							<th class="grp-erp">${__("DocTypes")}</th>
							<th class="grp-erp">${__("Changes")}</th>
							<th class="grp-erp">${__("PDF")}</th>
							<th class="grp-erp">${__("Files")}</th>
							<th class="grp-erp">${__("Comments")}</th>
							<th class="grp-erp">${__("Reports")}</th>
							<th class="grp-erp">${__("Exports")}</th>
							<th class="grp-erp">${__("Comms")}</th>
							<th class="grp-erp">${__("Exp claims")}</th>
							<th class="grp-erp">${__("ToDos")}</th>
							<th class="grp-field">${__("FV sub.")}</th>
							<th>${__("Days idle")}</th>
							<th>${__("Roles")}</th>
						</tr></thead>
						<tbody>${rows || `<tr><td colspan="27">${__("No users match filters.")}</td></tr>`}</tbody>
					</table>
				</div>
			</div>
		`);
	}

	bind_events() {
		this.page.body.on("click", ".usu-click", (e) => {
			const user = $(e.currentTarget).data("user");
			if (user) this.show_user_detail(user);
		});
	}

	show_user_detail(user) {
		const filters = this.get_filters();
		frappe.call({
			method:
				"tif_customization.tif_customization.page.user_system_usage_report.user_system_usage_report.get_user_detail",
			args: {
				user,
				from_date: filters.from_date,
				to_date: filters.to_date,
			},
			callback: (r) => {
				const d = r.message || {};
				const s = d.summary || {};
				const summaryHtml = `
					<div class="alert alert-secondary">
						<strong>${__("Summary")}</strong><br>
						${__("Est. ERP time")}: ${frappe.utils.escape_html(s.erp_time_label || "0m")}
						(${s.erp_minutes_source === "activity_log" ? __("Activity Log") : __("estimate")}) ·
						${__("Documents created")}: ${this.fmt(s.documents_created)} ·
						${__("Changes")}: ${this.fmt(s.doc_changes)} ·
						${__("Unique documents")}: ${this.fmt(s.unique_documents)} ·
						${__("PDF / print")}: ${this.fmt(s.prints_pdf)} ·
						${__("Logins (Activity Log)")}: ${this.fmt(s.login_count_activity_log)}
						${s.login_on_user_record ? __(" · User profile shows login in period (0*)") : ""}<br>
						${__("Last login (profile)")}: ${this.fmt_dt((d.user_profile || {}).last_login)} ·
						${__("IP")}: ${frappe.utils.escape_html(s.last_login_ip || "—")}
						${(d.notes || {}).login_ip ? `<br><small>${frappe.utils.escape_html(d.notes.login_ip)}</small>` : ""}
					</div>`;
				const dt_rows = (d.doctypes || [])
					.map(
						(row) =>
							`<tr><td>${frappe.utils.escape_html(row.doctype)}</td><td class="num">${this.fmt(
								row.changes
							)}</td></tr>`
					)
					.join("");
				const login_rows = (d.logins || [])
					.map(
						(row) =>
							`<tr><td>${this.fmt_dt(row.creation)}</td><td>${frappe.utils.escape_html(
								row.status || ""
							)}</td><td class="mono">${frappe.utils.escape_html(row.ip_address || "—")}</td></tr>`
					)
					.join("");
				const dialog = new frappe.ui.Dialog({
					title: __("Usage detail — {0}", [user]),
					size: "large",
					fields: [{ fieldtype: "HTML", fieldname: "html" }],
				});
				dialog.fields_dict.html.$wrapper.html(`
					<p class="text-muted">${__("Period")}: ${frappe.datetime.str_to_user(d.from_date)} — ${frappe.datetime.str_to_user(
					d.to_date
				)}</p>
					${summaryHtml}
					<h6>${__("Top DocTypes changed (all ERP modules)")}</h6>
					<table class="table table-bordered table-sm">
						<thead><tr><th>${__("DocType")}</th><th>${__("Changes")}</th></tr></thead>
						<tbody>${dt_rows || `<tr><td colspan="2">${__("No document changes.")}</td></tr>`}</tbody>
					</table>
					<h6>${__("Logins in period (with IP address)")}</h6>
					<table class="table table-bordered table-sm">
						<thead><tr><th>${__("When")}</th><th>${__("Status")}</th><th>${__("IP address")}</th></tr></thead>
						<tbody>${login_rows || `<tr><td colspan="3">${__("No login records in Activity Log for this period.")}</td></tr>`}</tbody>
					</table>
				`);
				dialog.show();
			},
		});
	}

	export_csv() {
		const data = this.data;
		if (!data || !(data.rows || []).length) {
			frappe.msgprint(__("Nothing to export."));
			return;
		}
		const headers = [
			"User",
			"Full Name",
			"Email",
			"User Type",
			"Department",
			"Usage Band",
			"Engagement Score",
			"Est ERP Minutes",
			"Active Days",
			"Logins Activity Log",
			"Login On User Record",
			"Last Login IP",
			"Distinct IPs",
			"Last Login",
			"Documents Created",
			"Unique Documents",
			"DocTypes Touched",
			"Doc Changes",
			"PDF Prints",
			"Files Uploaded",
			"Comments",
			"Reports Run",
			"Exports",
			"Communications",
			"Expense Claims",
			"ToDos Completed",
			"Field Visits Submitted",
			"Days Since Active",
			"Roles",
		];
		const lines = [headers.join(",")];
		for (const r of data.rows) {
			const esc = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
			lines.push(
				[
					r.user,
					r.full_name,
					r.email,
					r.user_type,
					r.department,
					r.usage_band,
					r.engagement_score,
					r.erp_minutes_est,
					r.active_days,
					r.login_count,
					r.login_on_user_record,
					r.last_login_ip,
					r.distinct_ips,
					r.last_login,
					r.documents_created,
					r.unique_documents,
					r.doctypes_touched,
					r.doc_changes,
					r.prints_pdf,
					r.files_uploaded,
					r.comments,
					r.reports_run,
					r.exports,
					r.communications,
					r.expense_claims,
					r.todos_completed,
					r.field_visits_submitted,
					r.days_since_active,
					r.roles,
				]
					.map(esc)
					.join(",")
			);
		}
		const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
		const a = document.createElement("a");
		a.href = URL.createObjectURL(blob);
		a.download = `user-system-usage-${data.from_date}-${data.to_date}.csv`;
		a.click();
	}
};
