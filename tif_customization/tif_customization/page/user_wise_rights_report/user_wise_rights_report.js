frappe.pages["user-wise-rights-report"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("User Wise Rights Report"),
		single_column: true,
	});
	new frappe.tif_customization.UserWiseRightsReport(page).make();
};

frappe.tif_customization = frappe.tif_customization || {};

frappe.tif_customization.UserWiseRightsReport = class UserWiseRightsReport {
	constructor(page) {
		this.page = page;
		this.data = null;
	}

	make() {
		this.make_layout();
		this.make_filters();
		this.page.set_primary_action(__("Refresh"), () => this.load_data(), "refresh");
		this.page.add_inner_button(__("Print / PDF"), () => this.print_report());
		this.page.add_action_item(__("Export CSV"), () => this.export_csv());
		this.load_data();
	}

	make_layout() {
		$(this.page.body).html(`
			<div class="uwr-root">
				<style>
					.uwr-root{padding:16px 16px 28px;max-width:1280px;margin:0 auto}
					.uwr-note{font-size:12px;color:#6b7280;margin:0 0 12px;line-height:1.45}
					.uwr-filters{margin-bottom:14px}
					.uwr-card{
						background:#fff;border:1px solid #e5e7eb;border-radius:12px;
						box-shadow:0 1px 2px rgba(15,23,42,.04);overflow:hidden
					}
					.uwr-brand{
						display:flex;justify-content:space-between;gap:16px;align-items:flex-start;
						padding:18px 20px;border-bottom:3px solid #1b5e3b;
						background:linear-gradient(180deg,#f8faf8,#fff)
					}
					.uwr-brand h2{margin:0;font-size:16px;font-weight:800;color:#1b5e3b;
						text-transform:uppercase;letter-spacing:.6px}
					.uwr-brand .sub{margin-top:4px;font-size:11px;color:#64748b}
					.uwr-kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;padding:14px 20px}
					.uwr-kpi{border:1px solid #e5e7eb;border-radius:10px;padding:12px 14px;background:#fff}
					.uwr-kpi .lbl{font-size:10px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.4px}
					.uwr-kpi .val{font-size:16px;font-weight:800;margin-top:4px;color:#123524;font-variant-numeric:tabular-nums}
					.uwr-table-wrap{padding:0 12px 16px;overflow:auto}
					.uwr-table{width:100%;border-collapse:collapse;font-size:12px;min-width:860px}
					.uwr-table th,.uwr-table td{padding:8px;border:1px solid #e5e7eb;vertical-align:top}
					.uwr-table thead th{
						background:#1b5e3b;color:#fff;font-weight:700;white-space:nowrap;
						text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.3px;border-color:#145230
					}
					.uwr-table thead th.cen,.uwr-table td.cen{text-align:center}
					.uwr-table thead th.num,.uwr-table td.num{text-align:right;font-variant-numeric:tabular-nums}
					.uwr-table tbody tr:nth-child(even){background:#fafcfa}
					.uwr-table tbody tr.uwr-click{cursor:pointer}
					.uwr-table tbody tr.uwr-click:hover{background:#eef6f0}
					.uwr-badge{
						display:inline-block;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:700;
						background:#eef2ff;color:#3730a3;margin:1px 3px 1px 0;max-width:100%;
					}
					.uwr-badge.off{background:#f1f5f9;color:#64748b}
					.uwr-badge.ok{background:#dcfce7;color:#166534}
					.uwr-badge.no{background:#fee2e2;color:#991b1b}
					.uwr-tick{color:#15803d;font-weight:800}
					.uwr-cross{color:#cbd5e1}
					.uwr-meta{padding:10px 20px;background:#f8fafc;border-bottom:1px solid #e5e7eb;font-size:12px}
					.uwr-meta strong{color:#123524}
					.uwr-section-title{
						margin:8px 8px 6px;font-size:12px;font-weight:800;color:#1b5e3b;
						text-transform:uppercase;letter-spacing:.4px
					}
					.uwr-footer{padding:12px 20px 16px;border-top:1px solid #e5e7eb;font-size:11px;color:#6b7280}
					@media (max-width:980px){
						.uwr-kpis{grid-template-columns:1fr 1fr}
						.uwr-table{min-width:720px}
					}
					@media print{
						.page-head,.navbar,.uwr-filters,.uwr-note{display:none!important}
						.uwr-root{padding:0;max-width:none}
						.uwr-card{box-shadow:none;border:0;border-radius:0}
						body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
					}
				</style>
				<p class="uwr-note no-print">
					User-wise ERP access: assigned <strong>Roles</strong>, effective <strong>DocType rights</strong>
					(from Role Permissions / Custom DocPerm), and record-level <strong>User Permissions</strong>.
					Select a user and switch view to DocType Rights for the full permission matrix.
				</p>
				<div id="uwr-filters" class="uwr-filters row no-print"></div>
				<div id="uwr-body"></div>
			</div>
		`);
	}

	make_filters() {
		this.view = this.make_filter({
			label: __("View"),
			fieldtype: "Select",
			fieldname: "view",
			options: "Summary\nDocType Rights\nUser Permissions",
			default: "Summary",
			reqd: 1,
		});
		this.user = this.make_filter({
			label: __("User"),
			fieldtype: "Link",
			fieldname: "user",
			options: "User",
			get_query: () => ({
				filters: { user_type: "System User" },
			}),
		});
		this.role = this.make_filter({
			label: __("Role"),
			fieldtype: "Link",
			fieldname: "role",
			options: "Role",
		});
		this.status = this.make_filter({
			label: __("Status"),
			fieldtype: "Select",
			fieldname: "status",
			options: "Enabled\nDisabled\nAll",
			default: "Enabled",
		});
		this.doctype = this.make_filter({
			label: __("DocType"),
			fieldtype: "Link",
			fieldname: "doctype",
			options: "DocType",
			description: __("Optional filter for DocType Rights / User Permissions"),
		});
	}

	make_filter(df) {
		const wrap = $('<div class="col-md-2" style="margin-bottom:8px;"></div>');
		$("#uwr-filters").append(wrap);
		return frappe.ui.form.make_control({
			parent: wrap,
			df: Object.assign({ change: () => this.schedule_load() }, df),
			render_input: true,
		});
	}

	schedule_load() {
		clearTimeout(this._timer);
		this._timer = setTimeout(() => this.load_data(), 350);
	}

	map_view(label) {
		const v = (label || "Summary").trim();
		if (v === "DocType Rights") return "doctype_rights";
		if (v === "User Permissions") return "user_permissions";
		return "summary";
	}

	get_filters() {
		return {
			view: this.map_view(this.view.get_value()),
			user: this.user.get_value() || "",
			role: this.role.get_value() || "",
			status: this.status.get_value() || "Enabled",
			doctype: this.doctype.get_value() || "",
		};
	}

	load_data() {
		const filters = this.get_filters();
		if (filters.view === "doctype_rights" && !filters.user) {
			$("#uwr-body").html(
				`<div class="uwr-card"><div class="uwr-meta">${__(
					"Select a User, then choose DocType Rights to see the permission matrix."
				)}</div></div>`
			);
			return;
		}
		$("#uwr-body").html(`<p class="text-muted">${__("Loading...")}</p>`);
		frappe.call({
			method:
				"tif_customization.tif_customization.page.user_wise_rights_report.user_wise_rights_report.get_report_data",
			args: { filters },
			callback: (r) => {
				if (!r.message) {
					$("#uwr-body").html(`<p class="text-danger">${__("Failed to load.")}</p>`);
					return;
				}
				this.data = r.message;
				this.render(r.message);
			},
			error: () => {
				$("#uwr-body").html(`<p class="text-danger">${__("Failed to load.")}</p>`);
			},
		});
	}

	esc(v) {
		return frappe.utils.escape_html(v == null ? "" : String(v));
	}

	tick(v) {
		return cint(v) ? `<span class="uwr-tick">✓</span>` : `<span class="uwr-cross">·</span>`;
	}

	render(data) {
		if (data.view === "doctype_rights") {
			this.render_doctype_rights(data);
		} else if (data.view === "user_permissions") {
			this.render_user_permissions(data);
		} else {
			this.render_summary(data);
		}
	}

	render_summary(data) {
		const s = data.summary || {};
		const rows = data.rows || [];
		let body = "";
		if (!rows.length) {
			body = `<tr><td colspan="8" class="text-center text-muted">${__("No users found.")}</td></tr>`;
		} else {
			body = rows
				.map((r) => {
					const roles = (r.roles || [])
						.map((x) => `<span class="uwr-badge">${this.esc(x)}</span>`)
						.join("");
					const status = r.enabled
						? `<span class="uwr-badge ok">${__("Enabled")}</span>`
						: `<span class="uwr-badge no">${__("Disabled")}</span>`;
					return `<tr class="uwr-click" data-user="${this.esc(r.user)}" title="${__(
						"Open DocType Rights"
					)}">
						<td>${this.esc(r.full_name)}<div style="color:#64748b;font-size:11px">${this.esc(
							r.user
						)}</div></td>
						<td>${status}</td>
						<td>${this.esc(r.user_type)}</td>
						<td class="num">${r.role_count}</td>
						<td>${roles || `<span class="uwr-badge off">${__("None")}</span>`}</td>
						<td class="num">${r.user_permission_count}</td>
						<td class="num">${r.blocked_module_count}</td>
						<td style="font-size:11px;color:#64748b">${this.esc(r.last_active || "—")}</td>
					</tr>`;
				})
				.join("");
		}

		$("#uwr-body").html(`
			<div class="uwr-card">
				<div class="uwr-brand">
					<div>
						<h2>${__("User Wise Rights Report")}</h2>
						<div class="sub">${__("Roles assigned to each system user")}</div>
					</div>
					<div class="sub">${frappe.datetime.str_to_user(frappe.datetime.get_today())}</div>
				</div>
				<div class="uwr-kpis">
					<div class="uwr-kpi"><div class="lbl">${__("Users")}</div><div class="val">${s.users || 0}</div></div>
					<div class="uwr-kpi"><div class="lbl">${__("Enabled")}</div><div class="val">${s.enabled || 0}</div></div>
					<div class="uwr-kpi"><div class="lbl">${__("Disabled")}</div><div class="val">${s.disabled || 0}</div></div>
					<div class="uwr-kpi"><div class="lbl">${__("Role Links")}</div><div class="val">${s.roles_assigned || 0}</div></div>
					<div class="uwr-kpi"><div class="lbl">${__("User Permissions")}</div><div class="val">${
						s.user_permissions || 0
					}</div></div>
				</div>
				<div class="uwr-table-wrap">
					<table class="uwr-table">
						<thead>
							<tr>
								<th>${__("User")}</th>
								<th>${__("Status")}</th>
								<th>${__("Type")}</th>
								<th class="num">${__("Roles")}</th>
								<th>${__("Assigned Roles")}</th>
								<th class="num">${__("User Perms")}</th>
								<th class="num">${__("Blocked Modules")}</th>
								<th>${__("Last Active")}</th>
							</tr>
						</thead>
						<tbody>${body}</tbody>
					</table>
				</div>
				<div class="uwr-footer">${__(
					"Click a user row to open DocType Rights for that user."
				)}</div>
			</div>
		`);

		$("#uwr-body")
			.find("tr.uwr-click")
			.on("click", (e) => {
				const user = $(e.currentTarget).data("user");
				if (!user) return;
				this.user.set_value(user);
				this.view.set_value("DocType Rights");
				this.load_data();
			});
	}

	render_doctype_rights(data) {
		const u = data.user || {};
		const s = data.summary || {};
		const fields = data.perm_fields || [];
		const rows = data.rows || [];
		const role_badges = (u.roles || [])
			.map((x) => `<span class="uwr-badge">${this.esc(x)}</span>`)
			.join(" ");

		const head = fields.map((f) => `<th class="cen">${this.esc(f)}</th>`).join("");
		let body = "";
		if (!rows.length) {
			body = `<tr><td colspan="${
				3 + fields.length
			}" class="text-center text-muted">${__("No DocType permissions found.")}</td></tr>`;
		} else {
			body = rows
				.map((r) => {
					const ticks = fields.map((f) => `<td class="cen">${this.tick(r[f])}</td>`).join("");
					const owner = r.if_owner
						? ` <span class="uwr-badge off">${__("If Owner")}</span>`
						: "";
					return `<tr>
						<td>${this.esc(r.doctype)}${owner}
							<div style="color:#64748b;font-size:10px;margin-top:2px">${this.esc(
								(r.roles || []).join(", ")
							)}</div>
						</td>
						<td class="cen">${r.permlevel}</td>
						<td class="num">${r.role_count}</td>
						${ticks}
					</tr>`;
				})
				.join("");
		}

		const up = data.user_permissions || [];
		let up_html = "";
		if (up.length) {
			up_html = `
				<div class="uwr-section-title">${__("User Permissions (record-level)")}</div>
				<div class="uwr-table-wrap">
					<table class="uwr-table" style="min-width:640px">
						<thead>
							<tr>
								<th>${__("Allow")}</th>
								<th>${__("For Value")}</th>
								<th class="cen">${__("Default")}</th>
								<th class="cen">${__("All DocTypes")}</th>
								<th>${__("Applicable For")}</th>
							</tr>
						</thead>
						<tbody>
							${up
								.map(
									(p) => `<tr>
								<td>${this.esc(p.allow)}</td>
								<td>${this.esc(p.for_value)}</td>
								<td class="cen">${this.tick(p.is_default)}</td>
								<td class="cen">${this.tick(p.apply_to_all_doctypes)}</td>
								<td>${this.esc(p.applicable_for || "—")}</td>
							</tr>`
								)
								.join("")}
						</tbody>
					</table>
				</div>`;
		}

		$("#uwr-body").html(`
			<div class="uwr-card">
				<div class="uwr-brand">
					<div>
						<h2>${__("DocType Rights")}</h2>
						<div class="sub">${this.esc(u.full_name)} · ${this.esc(u.user)}</div>
					</div>
					<div class="sub">${u.enabled ? __("Enabled") : __("Disabled")} · ${this.esc(u.user_type)}</div>
				</div>
				<div class="uwr-meta">
					<strong>${__("Roles")}:</strong> ${role_badges || "—"}
					${
						(u.blocked_modules || []).length
							? `<div style="margin-top:6px"><strong>${__("Blocked Modules")}:</strong> ${this.esc(
									u.blocked_modules.join(", ")
							  )}</div>`
							: ""
					}
				</div>
				<div class="uwr-kpis" style="grid-template-columns:repeat(4,1fr)">
					<div class="uwr-kpi"><div class="lbl">${__("Roles")}</div><div class="val">${s.roles || 0}</div></div>
					<div class="uwr-kpi"><div class="lbl">${__("DocTypes")}</div><div class="val">${s.doctypes || 0}</div></div>
					<div class="uwr-kpi"><div class="lbl">${__("User Permissions")}</div><div class="val">${
						s.user_permissions || 0
					}</div></div>
					<div class="uwr-kpi"><div class="lbl">${__("Blocked Modules")}</div><div class="val">${
						s.blocked_modules || 0
					}</div></div>
				</div>
				<div class="uwr-section-title">${__("Effective DocType Permissions")}</div>
				<div class="uwr-table-wrap">
					<table class="uwr-table" style="min-width:1100px">
						<thead>
							<tr>
								<th>${__("DocType")}</th>
								<th class="cen">${__("Level")}</th>
								<th class="num">${__("Via Roles")}</th>
								${head}
							</tr>
						</thead>
						<tbody>${body}</tbody>
					</table>
				</div>
				${up_html}
				<div class="uwr-footer">${__(
					"Permissions are OR-merged across the user's roles. Custom DocPerm overrides standard Role Permission."
				)}</div>
			</div>
		`);
	}

	render_user_permissions(data) {
		const s = data.summary || {};
		const rows = data.rows || [];
		let body = "";
		if (!rows.length) {
			body = `<tr><td colspan="7" class="text-center text-muted">${__("No User Permissions found.")}</td></tr>`;
		} else {
			body = rows
				.map(
					(r) => `<tr>
					<td>${this.esc(r.full_name)}<div style="color:#64748b;font-size:11px">${this.esc(
						r.user
					)}</div></td>
					<td>${this.esc(r.allow)}</td>
					<td>${this.esc(r.for_value)}</td>
					<td class="cen">${this.tick(r.is_default)}</td>
					<td class="cen">${this.tick(r.apply_to_all_doctypes)}</td>
					<td>${this.esc(r.applicable_for || "—")}</td>
					<td class="cen">${this.tick(r.hide_descendants)}</td>
				</tr>`
				)
				.join("");
		}

		$("#uwr-body").html(`
			<div class="uwr-card">
				<div class="uwr-brand">
					<div>
						<h2>${__("User Permissions")}</h2>
						<div class="sub">${__("Record-level access restrictions")}</div>
					</div>
				</div>
				<div class="uwr-kpis" style="grid-template-columns:repeat(3,1fr)">
					<div class="uwr-kpi"><div class="lbl">${__("Rows")}</div><div class="val">${s.rows || 0}</div></div>
					<div class="uwr-kpi"><div class="lbl">${__("Users")}</div><div class="val">${s.users || 0}</div></div>
					<div class="uwr-kpi"><div class="lbl">${__("Allow DocTypes")}</div><div class="val">${
						s.doctypes || 0
					}</div></div>
				</div>
				<div class="uwr-table-wrap">
					<table class="uwr-table">
						<thead>
							<tr>
								<th>${__("User")}</th>
								<th>${__("Allow")}</th>
								<th>${__("For Value")}</th>
								<th class="cen">${__("Default")}</th>
								<th class="cen">${__("All DocTypes")}</th>
								<th>${__("Applicable For")}</th>
								<th class="cen">${__("Hide Descendants")}</th>
							</tr>
						</thead>
						<tbody>${body}</tbody>
					</table>
				</div>
			</div>
		`);
	}

	print_report() {
		if (!this.data) {
			frappe.msgprint(__("Nothing to print."));
			return;
		}
		const html = $("#uwr-body").html();
		const w = window.open("", "_blank");
		if (!w) {
			frappe.msgprint(__("Please allow pop-ups to print."));
			return;
		}
		w.document.write(`<!DOCTYPE html><html><head>
			<title>${__("User Wise Rights Report")}</title>
			<style>
				body{font-family:Arial,Helvetica,sans-serif;margin:16px;color:#0f172a}
				.uwr-badge{display:inline-block;padding:1px 6px;border-radius:8px;font-size:9px;
					background:#eef2ff;color:#3730a3;margin:1px}
				.uwr-table{width:100%;border-collapse:collapse;font-size:10px}
				.uwr-table th,.uwr-table td{border:1px solid #ccc;padding:4px 6px}
				.uwr-table thead th{background:#1b5e3b;color:#fff}
				.uwr-kpis{display:flex;gap:8px;margin:10px 0;flex-wrap:wrap}
				.uwr-kpi{border:1px solid #ddd;padding:8px 10px;border-radius:6px;min-width:100px}
				.uwr-brand{border-bottom:3px solid #1b5e3b;padding-bottom:8px;margin-bottom:8px}
				.uwr-brand h2{margin:0;color:#1b5e3b;font-size:14px}
				@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
			</style>
		</head><body>
			${html}
			<script>window.onload=function(){setTimeout(function(){window.print()},250)}</script>
		</body></html>`);
		w.document.close();
	}

	export_csv() {
		if (!this.data) {
			frappe.msgprint(__("Nothing to export."));
			return;
		}
		const data = this.data;
		let lines = [];
		if (data.view === "summary") {
			lines.push(["User", "Full Name", "Enabled", "Type", "Role Count", "Roles", "User Permissions", "Blocked Modules", "Last Active"]);
			(data.rows || []).forEach((r) => {
				lines.push([
					r.user,
					r.full_name,
					r.enabled ? "1" : "0",
					r.user_type,
					r.role_count,
					(r.roles || []).join("; "),
					r.user_permission_count,
					(r.blocked_modules || []).join("; "),
					r.last_active || "",
				]);
			});
		} else if (data.view === "doctype_rights") {
			const fields = data.perm_fields || [];
			lines.push(["DocType", "Perm Level", "If Owner", "Roles", ...fields]);
			(data.rows || []).forEach((r) => {
				lines.push([
					r.doctype,
					r.permlevel,
					r.if_owner ? "1" : "0",
					(r.roles || []).join("; "),
					...fields.map((f) => (r[f] ? "1" : "0")),
				]);
			});
		} else {
			lines.push(["User", "Full Name", "Allow", "For Value", "Default", "All DocTypes", "Applicable For", "Hide Descendants"]);
			(data.rows || []).forEach((r) => {
				lines.push([
					r.user,
					r.full_name,
					r.allow,
					r.for_value,
					r.is_default ? "1" : "0",
					r.apply_to_all_doctypes ? "1" : "0",
					r.applicable_for || "",
					r.hide_descendants ? "1" : "0",
				]);
			});
		}

		const csv = lines
			.map((row) =>
				row
					.map((cell) => {
						const v = cell == null ? "" : String(cell);
						return `"${v.replace(/"/g, '""')}"`;
					})
					.join(",")
			)
			.join("\n");

		const a = document.createElement("a");
		a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
		a.download = `user-wise-rights-${data.view || "summary"}.csv`;
		a.click();
	}
};

function cint(v) {
	return v === true || v === 1 || v === "1";
}
