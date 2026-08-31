frappe.pages["sme-summary-report"].on_page_load = function (wrapper) {
	frappe.require("/assets/tif_customization/js/field_visit_drilldown.js", () => {
		const page = frappe.ui.make_app_page({
			parent: wrapper,
			title: __("SME Summary Report"),
			single_column: true,
		});
		new frappe.tif_customization.SMESummaryReport(page).make();
	});
};

frappe.tif_customization = frappe.tif_customization || {};

frappe.tif_customization.SMESummaryReport = class SMESummaryReport {
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
		if (frappe.tif_customization && frappe.tif_customization.bind_clickable_numbers) {
			frappe.tif_customization.bind_clickable_numbers($(this.page.body), () => this.get_filters());
		}
		this.load_data();
	}

	make_layout() {
		$(this.page.body).html(`
			<div class="sme-sum" style="padding:16px;">
				<style>
					.sme-sum-note{font-size:12px;color:var(--text-muted,#6b7280);margin:0 0 12px}
					.sme-sum-table-wrap{overflow:auto;border:1px solid var(--border-color,#e5e7eb);border-radius:8px;background:#fff}
					.sme-sum-table{width:100%;border-collapse:collapse;font-size:12px;min-width:1100px}
					.sme-sum-table th,.sme-sum-table td{padding:7px 8px;border:1px solid var(--border-color,#e5e7eb);vertical-align:middle}
					.sme-sum-table thead th{background:#f3f4f6;text-align:center;font-weight:600;white-space:nowrap}
					.sme-sum-table .group{background:#e5e7eb}
					.sme-sum-table .left{text-align:left}
					.sme-sum-table .num{text-align:right;font-variant-numeric:tabular-nums}
					.sme-sum-table .sme-click{cursor:pointer;color:#0f766e;text-decoration:underline}
					.sme-sum-table .sme-click:hover{background:#ecfdf5}
					.sme-sum-break{background:#f8fafc;border:1px dashed #94a3b8;border-radius:8px;padding:10px 12px;margin:0 0 12px;font-size:13px;text-align:left}
					.sme-sum-table tfoot th{background:#f9fafb;font-weight:700}
					.sme-sum-table .score-col{background:#ecfdf5;font-weight:700}
					.sme-sum-title{text-align:center;font-size:18px;font-weight:700;margin:8px 0 14px}
					.sme-sum-meta{text-align:center;font-size:12px;color:#6b7280;margin-bottom:12px}
					@media print{
						.page-head,.layout-side-section,.sme-sum-filters{display:none!important}
						.sme-sum-table{font-size:10px}
					}
				</style>
				<p class="sme-sum-note">
					Period summary for School Marketing Executives.
					Use <strong>Visit From / To Date</strong> to filter by the visit date on each Field Visit
					(Marketing / M&amp;E / Meeting / Training dates — not document creation date).
					<strong>Grand Total</strong> = Followup + New + Meetings + Active + Inactive
					(Marketing + Meetings + M&amp;E). That is not the same as Total visits
					(which also includes Training and Academic / Other).
					Click any visit number to see the Field Visit documents behind it.
					Score % = KPI points ÷ expected points (Target Base). Workshop score uses session count, not participant heads.
				</p>
				<div id="sme-sum-filters" class="sme-sum-filters row" style="margin-bottom:12px;"></div>
				<div id="sme-sum-body"></div>
			</div>
		`);
	}

	make_filters() {
		const today = frappe.datetime.get_today();
		const month_start = frappe.datetime.month_start();

		this.from_date = this.make_filter({
			label: __("Visit From Date"),
			fieldtype: "Date",
			fieldname: "from_date",
			default: month_start,
		});
		this.to_date = this.make_filter({
			label: __("Visit To Date"),
			fieldtype: "Date",
			fieldname: "to_date",
			default: today,
		});
		this.working_days = this.make_filter({
			label: __("Working Days"),
			fieldtype: "Int",
			fieldname: "working_days",
			description: __("Leave blank to use weekdays in range"),
		});
		this.region = this.make_filter({
			label: __("Score Region"),
			fieldtype: "Select",
			fieldname: "region",
			options: [
				"",
				"karachi",
				"punjab",
				"urban",
				"rural",
			].join("\n"),
			default: "karachi",
		});
		// Friendly labels via change after render
		setTimeout(() => {
			const $sel = $(this.region.$input);
			$sel.find('option[value="karachi"]').text(__("Karachi"));
			$sel.find('option[value="punjab"]').text(__("Punjab"));
			$sel.find('option[value="urban"]').text(__("Other Province Urban"));
			$sel.find('option[value="rural"]').text(__("Other Province Rural"));
		}, 0);

		this.employee = this.make_filter({
			label: __("SME"),
			fieldtype: "Link",
			fieldname: "employee",
			options: "Employee",
			get_query: () => ({
				filters: {
					status: "Active",
					designation: "School Marketing Executive",
				},
			}),
		});
	}

	make_filter(df) {
		const wrap = $('<div class="col-md-2" style="margin-bottom:8px;"></div>');
		$("#sme-sum-filters").append(wrap);
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

	get_filters() {
		return {
			from_date: this.from_date.get_value(),
			to_date: this.to_date.get_value(),
			working_days: this.working_days.get_value() || "",
			region: this.region.get_value() || "karachi",
			employee: this.employee.get_value() || "",
			staff: this.employee.get_value() || "",
		};
	}

	load_data() {
		const filters = this.get_filters();
		if (!filters.from_date || !filters.to_date) {
			frappe.msgprint(__("Please select Visit From Date and Visit To Date."));
			return;
		}
		$("#sme-sum-body").html(`<p class="text-muted">${__("Loading...")}</p>`);
		frappe.call({
			method:
				"tif_customization.tif_customization.page.sme_summary_report.sme_summary_report.get_report_data",
			args: { filters },
			callback: (r) => {
				if (!r.message) {
					$("#sme-sum-body").html(`<p class="text-danger">${__("Failed to load.")}</p>`);
					return;
				}
				this.data = r.message;
				this.render(r.message);
			},
			error: () => {
				$("#sme-sum-body").html(`<p class="text-danger">${__("Failed to load.")}</p>`);
			},
		});
	}

	fmt(n) {
		return frappe.format(n || 0, { fieldtype: "Int" });
	}

	fmt_cur(n) {
		return frappe.format(n || 0, { fieldtype: "Currency" });
	}

	fmt_score(n) {
		return frappe.format(flt(n || 0), { fieldtype: "Float", precision: 2 });
	}

	click_td(n, metric, staff) {
		const staffAttr = staff ? ` data-visit-staff="${frappe.utils.escape_html(staff)}"` : "";
		return `<td class="num sme-click" data-visit-metric="${metric}"${staffAttr} title="${__("Click to see Field Visits")}">${this.fmt(n)}</td>`;
	}

	render(data) {
		const fromLabel = frappe.datetime.str_to_user(data.from_date);
		const toLabel = frappe.datetime.str_to_user(data.to_date);
		const rows = data.rows || [];
		const t = data.totals || {};

		const body = rows.length
			? rows
					.map((r) => {
						const staff = r.employee_name || r.user_id || "";
						return `
				<tr>
					<td class="left">${frappe.utils.escape_html(r.label || "")}</td>
					<td>${frappe.utils.escape_html(r.division || r.region_label || "—")}</td>
					${this.click_td(r.followup, "followup", staff)}
					${this.click_td(r.new, "new", staff)}
					${this.click_td(r.meetings, "meeting", staff)}
					${this.click_td(r.active, "me_active", staff)}
					${this.click_td(r.inactive, "me_inactive", staff)}
					${this.click_td(r.schools, "schools", staff)}
					${this.click_td(r.participants, "participants", staff)}
					${this.click_td(r.grand_total, "grand_total", staff)}
					<td class="num">${this.fmt_cur(r.expenses)}</td>
					${this.click_td(r.visited_days, "visits", staff)}
				</tr>`;
					})
					.join("")
			: `<tr><td colspan="12" class="text-center text-muted">${__("No SMEs found")}</td></tr>`;

		$("#sme-sum-body").html(`
			<div class="sme-sum-title">${__("Summary")} (${__("Visit Date")}: ${fromLabel} ${__("to")} ${toLabel})</div>
			<div class="sme-sum-break">
				<strong>${__("Visit numbers are clickable.")}</strong>
				${__("Grand Total")} = ${__("Followup")} + ${__("New")} + ${__("Meetings")} + ${__("Active")} + ${__("Inactive")}
				(${__("Marketing + Meetings + M&E")}).
				${__("Click a number to open the Field Visit documents behind it.")}
			</div>
			<div class="sme-sum-meta">
				${__("Visit Date")}: <strong>${fromLabel} – ${toLabel}</strong>
				&nbsp;|&nbsp;
				${__("Working Days")}: <strong>${data.working_days}</strong>
				&nbsp;|&nbsp;
				${__("Score Region")}: <strong>${frappe.utils.escape_html(data.region_label || "")}</strong>
				&nbsp;|&nbsp;
				${__("Expected Points")}: <strong>${this.fmt_score(data.expected_points)}</strong>
			</div>
			<div class="sme-sum-table-wrap">
				<table class="sme-sum-table">
					<thead>
						<tr>
							<th rowspan="2" class="left">${__("Name")}</th>
							<th rowspan="2">${__("Type / Division")}</th>
							<th colspan="2" class="group">${__("Marketing Visits")}</th>
							<th colspan="1" class="group">${__("Meetings")}</th>
							<th colspan="2" class="group">${__("M&E Visits")}</th>
							<th colspan="2" class="group">${__("Training Sessions")}</th>
							<th colspan="3" class="group">${__("Total")}</th>
						</tr>
						<tr>
							<th>${__("Followup & Other Visits")}</th>
							<th>${__("New")}</th>
							<th>${__("Meetings")}</th>
							<th>${__("Active")}</th>
							<th>${__("Inactive")}</th>
							<th>${__("No. of Schools Attended")}</th>
							<th>${__("No. of participants")}</th>
							<th>${__("Grand Total from ERP")}</th>
							<th>${__("Expenses")}</th>
							<th>${__("Visited Days")}</th>
						</tr>
					</thead>
					<tbody>${body}</tbody>
					<tfoot>
						<tr>
							<th class="left">${__("Grand Total")}</th>
							<th></th>
							${this.click_td(t.followup, "followup", "")}
							${this.click_td(t.new, "new", "")}
							${this.click_td(t.meetings, "meeting", "")}
							${this.click_td(t.active, "me_active", "")}
							${this.click_td(t.inactive, "me_inactive", "")}
							${this.click_td(t.schools, "schools", "")}
							${this.click_td(t.participants, "participants", "")}
							${this.click_td(t.grand_total, "grand_total", "")}
							<th class="num">${this.fmt_cur(t.expenses)}</th>
							${this.click_td(t.visited_days, "visits", "")}
						</tr>
					</tfoot>
				</table>
			</div>
		`);
	}

	export_csv() {
		if (!this.data || !(this.data.rows || []).length) {
			frappe.msgprint(__("No data to export."));
			return;
		}
		const headers = [
			"Name",
			"Type / Division",
			"Followup & Other Visits",
			"New",
			"Meetings",
			"Active",
			"Inactive",
			"Schools Attended",
			"Participants",
			"Grand Total from ERP",
			"Expenses",
			"Visited Days",
		];
		const lines = [headers.join(",")];
		(this.data.rows || []).forEach((r) => {
			lines.push(
				[
					`"${(r.label || "").replace(/"/g, '""')}"`,
					`"${(r.division || r.region_label || "").replace(/"/g, '""')}"`,
					r.followup || 0,
					r.new || 0,
					r.meetings || 0,
					r.active || 0,
					r.inactive || 0,
					r.schools || 0,
					r.participants || 0,
					r.grand_total || 0,
					r.expenses || 0,
					r.visited_days || 0,
				].join(",")
			);
		});
		const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `sme-summary-${this.data.from_date}-${this.data.to_date}.csv`;
		a.click();
		URL.revokeObjectURL(url);
	}
};

function flt(v) {
	const n = parseFloat(v);
	return isNaN(n) ? 0 : n;
}
