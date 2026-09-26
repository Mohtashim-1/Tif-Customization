frappe.pages["sme-erp-summary"].on_page_load = function (wrapper) {
	frappe.require("/assets/tif_customization/js/field_visit_drilldown.js", () => {
		const page = frappe.ui.make_app_page({
			parent: wrapper,
			title: __("SME ERP Summary"),
			single_column: true,
		});
		new frappe.tif_customization.SMEErpSummary(page).make();
	});
};

frappe.tif_customization = frappe.tif_customization || {};

frappe.tif_customization.SMEErpSummary = class SMEErpSummary {
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
		this.bind_interactions();
		this.load_data();
	}

	make_layout() {
		$(this.page.body).html(`
			<div class="sme-erp" style="padding:16px;">
				<style>
					.sme-erp-note{font-size:12px;color:#64748b;margin:0 0 12px;line-height:1.45}
					.sme-erp-title{text-align:center;font-size:18px;font-weight:700;margin:8px 0 6px}
					.sme-erp-meta{text-align:center;font-size:12px;color:#64748b;margin:0 0 14px}
					.sme-erp-wrap{
						overflow:auto;max-height:min(75vh,calc(100vh - 220px));
						border:1px solid #cbd5e1;border-radius:6px;background:#fff;
					}
					.sme-erp-table{
						width:100%;border-collapse:separate;border-spacing:0;
						font-size:12px;min-width:1100px;
					}
					.sme-erp-table th,.sme-erp-table td{
						padding:6px 8px;border:1px solid #94a3b8;vertical-align:middle;
					}
					.sme-erp-table thead th{
						position:sticky;background:#e2e8f0;text-align:center;font-weight:700;
						line-height:1.25;box-shadow:0 1px 0 #94a3b8;
					}
					.sme-erp-table thead tr:first-child th{top:0;z-index:4}
					.sme-erp-table thead tr:nth-child(2) th{top:var(--sme-erp-h1,36px);z-index:3}
					.sme-erp-table thead tr:first-child th[rowspan="2"]{z-index:5}
					.sme-erp-table .group{background:#cbd5e1}
					.sme-erp-table .mkt{background:#ccfbf1}
					.sme-erp-table .me{background:#ede9fe}
					.sme-erp-table .trn{background:#ffedd5}
					.sme-erp-table .tot{background:#e0f2fe}
					.sme-erp-table .left{text-align:left}
					.sme-erp-table .num{text-align:right;font-variant-numeric:tabular-nums}
					.sme-erp-table .sme-click{cursor:pointer;color:#0f766e;text-decoration:underline}
					.sme-erp-table .sme-click:hover{background:#ecfdf5}
					.sme-erp-table tfoot th{background:#f1f5f9;font-weight:700}
					.sme-erp-table .diff-neg{color:#b91c1c;font-weight:600}
					@media print{
						@page{size:A4 landscape;margin:8mm}
						.navbar,.page-head,.page-actions,.sme-erp-filters,.no-print{display:none!important}
						.sme-erp-wrap{overflow:visible!important;max-height:none!important;border:none}
						.sme-erp-table{font-size:8px;min-width:0!important}
						.sme-erp-table th,.sme-erp-table td{padding:3px 4px}
						.sme-click{color:#000!important;text-decoration:none!important}
					}
				</style>
				<div class="sme-erp-filters" style="margin-bottom:12px;"></div>
				<p class="sme-erp-note no-print">
					${__(
						"Paper-style Summary sheet: Marketing (Followup & Other / New), Meetings, M&E Active / Inactive, Training schools & participants, Grand Total from ERP, Expenses, Visited Days, Difference (Visited Days − Working Days). Click a number to open Field Visits."
					)}
				</p>
				<div id="sme-erp-body"></div>
			</div>
		`);
	}

	make_filters() {
		const $host = $(this.page.body).find(".sme-erp-filters");
		const today = frappe.datetime.get_today();
		const fromDefault = frappe.datetime.add_days(today, -30);
		this.filters = {};
		const add = (df) => {
			const control = frappe.ui.form.make_control({
				parent: $host,
				df: { ...df, change: () => this.load_data() },
				render_input: true,
			});
			control.refresh();
			this.filters[df.fieldname] = control;
			return control;
		};
		$host.css({
			display: "grid",
			gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))",
			gap: "10px",
		});
		add({
			fieldtype: "Date",
			fieldname: "from_date",
			label: __("Visit From Date"),
			default: fromDefault,
			reqd: 1,
		});
		add({
			fieldtype: "Date",
			fieldname: "to_date",
			label: __("Visit To Date"),
			default: today,
			reqd: 1,
		});
		add({
			fieldtype: "Int",
			fieldname: "working_days",
			label: __("Working Days"),
			description: __("Leave blank to use weekdays in range"),
		});
		add({
			fieldtype: "Link",
			fieldname: "supervisor",
			label: __("Supervisor"),
			options: "Employee",
		});
		add({
			fieldtype: "Link",
			fieldname: "employee",
			label: __("SME"),
			options: "Employee",
			get_query: () => ({
				query:
					"tif_customization.tif_customization.page.sme_summary_report_copy.sme_summary_report_copy.get_sme_employee_query",
				filters: { supervisor: this.filters.supervisor.get_value() || "" },
			}),
		});
		add({
			fieldtype: "Check",
			fieldname: "submitted_only",
			label: __("Submitted only"),
			default: 1,
		});
	}

	get_filters() {
		const f = {};
		Object.keys(this.filters).forEach((k) => {
			f[k] = this.filters[k].get_value();
		});
		f.submitted_only = cint(f.submitted_only);
		return f;
	}

	load_data() {
		const filters = this.get_filters();
		if (!filters.from_date || !filters.to_date) {
			frappe.msgprint(__("Please select Visit From Date and Visit To Date."));
			return;
		}
		frappe.call({
			method:
				"tif_customization.tif_customization.page.sme_erp_summary.sme_erp_summary.get_report_data",
			args: { filters },
			freeze: true,
			freeze_message: __("Loading summary…"),
			callback: (r) => {
				this.data = r.message || {};
				this.render(this.data);
			},
		});
	}

	fmt(n) {
		return format_number(cint(n) || 0, null, 0);
	}

	fmt_cur(n) {
		return format_number(flt(n) || 0, null, 0);
	}

	click_td(n, metric, staff, extraClass = "") {
		const staffAttr = staff ? ` data-visit-staff="${frappe.utils.escape_html(staff)}"` : "";
		const cls = extraClass ? ` ${extraClass}` : "";
		return `<td class="num sme-click${cls}" data-visit-metric="${metric}"${staffAttr} title="${__(
			"Click to see Field Visits"
		)}">${this.fmt(n)}</td>`;
	}

	render(data) {
		const fromLabel = frappe.datetime.str_to_user(data.from_date);
		const toLabel = frappe.datetime.str_to_user(data.to_date);
		const rows = data.rows || [];
		const t = data.totals || {};

		const body = rows.length
			? rows
					.map((r, idx) => {
						const staff = r.employee_name || r.user_id || "";
						const diffCls = cint(r.difference) < 0 ? "diff-neg" : "";
						return `<tr>
					<td class="num">${idx + 1}</td>
					<td class="left">${frappe.utils.escape_html(r.label || "")}</td>
					${this.click_td(r.followup_other, "followup_other", staff)}
					${this.click_td(r.new, "new", staff)}
					${this.click_td(r.meetings, "meeting", staff)}
					${this.click_td(r.active, "me_active", staff)}
					${this.click_td(r.inactive, "me_inactive", staff)}
					${this.click_td(r.schools, "schools", staff)}
					${this.click_td(r.participants, "participants", staff)}
					<td class="num">${this.fmt(r.grand_total)}</td>
					<td class="num">${this.fmt_cur(r.expenses)}</td>
					${this.click_td(r.visited_days, "visited_days", staff)}
					<td class="num ${diffCls}">${this.fmt(r.difference)}</td>
				</tr>`;
					})
					.join("")
			: `<tr><td colspan="13" class="text-center text-muted">${__("No SMEs found")}</td></tr>`;

		$("#sme-erp-body").html(`
			<div class="sme-erp-title">${__("Summary")} (${fromLabel} ${__("to")} ${toLabel})</div>
			<div class="sme-erp-meta">
				${__("SMEs")}: <strong>${rows.length}</strong>
				&nbsp;|&nbsp; ${__("Working Days")}: <strong>${data.working_days || 0}</strong>
				${
					data.supervisor_label
						? `&nbsp;|&nbsp; ${__("Supervisor")}: <strong>${frappe.utils.escape_html(
								data.supervisor_label
						  )}</strong>`
						: ""
				}
			</div>
			<div class="sme-erp-wrap">
				<table class="sme-erp-table">
					<thead>
						<tr>
							<th rowspan="2">${__("S.NO")}</th>
							<th rowspan="2" class="left">${__("Name")}</th>
							<th colspan="2" class="group mkt">${__("Marketing Visits")}</th>
							<th rowspan="2" class="group">${__("Meetings")}</th>
							<th colspan="2" class="group me">${__("M&E Visits")}</th>
							<th colspan="2" class="group trn">${__("Training Sessions")}</th>
							<th colspan="4" class="group tot">${__("Total")}</th>
						</tr>
						<tr>
							<th class="mkt">${__("Followup & Other Visits")}</th>
							<th class="mkt">${__("New")}</th>
							<th class="me">${__("Active")}</th>
							<th class="me">${__("Inactive")}</th>
							<th class="trn">${__("No. of Schools Attended")}</th>
							<th class="trn">${__("No. of participants")}</th>
							<th class="tot">${__("Grand Total from ERP")}</th>
							<th class="tot">${__("Expenses")}</th>
							<th class="tot">${__("visited Days")}</th>
							<th class="tot">${__("Difference")}</th>
						</tr>
					</thead>
					<tbody>${body}</tbody>
					<tfoot>
						<tr>
							<th></th>
							<th class="left">${__("Grand Total")}</th>
							${this.click_td(t.followup_other, "followup_other", "")}
							${this.click_td(t.new, "new", "")}
							${this.click_td(t.meetings, "meeting", "")}
							${this.click_td(t.active, "me_active", "")}
							${this.click_td(t.inactive, "me_inactive", "")}
							${this.click_td(t.schools, "schools", "")}
							${this.click_td(t.participants, "participants", "")}
							<th class="num">${this.fmt(t.grand_total)}</th>
							<th class="num">${this.fmt_cur(t.expenses)}</th>
							${this.click_td(t.visited_days, "visited_days", "")}
							<th class="num ${cint(t.difference) < 0 ? "diff-neg" : ""}">${this.fmt(t.difference)}</th>
						</tr>
					</tfoot>
				</table>
			</div>
		`);

		const $wrap = $(".sme-erp-wrap");
		const h1 = $wrap.find("thead tr:first-child th").first().outerHeight() || 36;
		$wrap.find(".sme-erp-table").css("--sme-erp-h1", `${h1}px`);
	}

	bind_interactions() {
		const $root = $(this.page.body);
		const me = this;
		$root.off("click.smeErp").on("click.smeErp", "[data-visit-metric]", function (e) {
			e.preventDefault();
			const metric = $(this).attr("data-visit-metric");
			const staff = $(this).attr("data-visit-staff") || "";
			const ctx = me.get_filters();
			if (!frappe.tif_customization || !frappe.tif_customization.open_visit_drilldown) {
				frappe.msgprint(__("Drill-down module is still loading. Please refresh the page."));
				return;
			}
			frappe.tif_customization.open_visit_drilldown({
				from_date: ctx.from_date,
				to_date: ctx.to_date,
				staff: staff || "",
				metric,
				submitted_only: ctx.submitted_only || 1,
			});
		});
	}

	export_csv() {
		const data = this.data || {};
		const rows = data.rows || [];
		if (!rows.length) {
			frappe.msgprint(__("Nothing to export."));
			return;
		}
		const headers = [
			"S.NO",
			"Name",
			"Followup & Other Visits",
			"New",
			"Meetings",
			"M&E Active",
			"M&E Inactive",
			"No. of Schools Attended",
			"No. of participants",
			"Grand Total from ERP",
			"Expenses",
			"visited Days",
			"Difference",
		];
		const lines = [headers.join(",")];
		rows.forEach((r, i) => {
			lines.push(
				[
					i + 1,
					`"${(r.label || "").replace(/"/g, '""')}"`,
					r.followup_other || 0,
					r.new || 0,
					r.meetings || 0,
					r.active || 0,
					r.inactive || 0,
					r.schools || 0,
					r.participants || 0,
					r.grand_total || 0,
					r.expenses || 0,
					r.visited_days || 0,
					r.difference || 0,
				].join(",")
			);
		});
		const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `sme-erp-summary-${data.from_date || ""}-${data.to_date || ""}.csv`;
		a.click();
		URL.revokeObjectURL(url);
	}
};
