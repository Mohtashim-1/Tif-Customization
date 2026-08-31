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
		$(this.page.body)
			.off("click.tifPoints")
			.on("click.tifPoints", "[data-points-kind]", (e) => {
				e.preventDefault();
				e.stopPropagation();
				const $el = $(e.currentTarget);
				this.show_points_detail($el.attr("data-points-kind"), $el.attr("data-employee") || "");
			});
		this.load_data();
	}

	make_layout() {
		$(this.page.body).html(`
			<div class="sme-sum" style="padding:16px;">
				<style>
					.sme-sum-note{font-size:12px;color:var(--text-muted,#6b7280);margin:0 0 12px}
					.sme-sum-table-wrap{overflow:auto;border:1px solid var(--border-color,#e5e7eb);border-radius:8px;background:#fff}
					.sme-sum-table{width:100%;border-collapse:collapse;font-size:12px;min-width:1880px}
					.sme-sum-table th,.sme-sum-table td{padding:7px 8px;border:1px solid var(--border-color,#e5e7eb);vertical-align:middle}
					.sme-sum-table thead th{background:#f3f4f6;text-align:center;font-weight:600;white-space:nowrap}
					.sme-sum-table .group{background:#e5e7eb}
					.sme-sum-table .kpi-group{background:#dbeafe}
					.sme-sum-table .left{text-align:left}
					.sme-sum-table .num{text-align:right;font-variant-numeric:tabular-nums}
					.sme-sum-table .sme-click{cursor:pointer;color:#0f766e;text-decoration:underline}
					.sme-sum-table .sme-click:hover{background:#ecfdf5}
					.sme-sum-break{background:#f8fafc;border:1px dashed #94a3b8;border-radius:8px;padding:10px 12px;margin:0 0 12px;font-size:13px;text-align:left}
					.sme-sum-table tfoot th{background:#f9fafb;font-weight:700}
					.sme-sum-table .score-col{background:#ecfdf5;font-weight:700}
					.sme-sum-table .pts-col{background:#eff6ff}
					.sme-sum-table .kpi-col{background:#f8fafc}
					.sme-sum-title{text-align:center;font-size:18px;font-weight:700;margin:8px 0 14px}
					.sme-sum-meta{text-align:center;font-size:12px;color:#6b7280;margin-bottom:12px}
					.sme-sum-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin:0 0 14px}
					.sme-sum-kpi{border:1px solid var(--border-color,#e5e7eb);border-top:4px solid #64748b;border-radius:10px;background:#fff;padding:12px 14px;box-shadow:0 2px 8px rgba(15,23,42,.05)}
					.sme-sum-kpi[data-visit-metric]{cursor:pointer}
					.sme-sum-kpi[data-visit-metric]:hover{box-shadow:0 4px 14px rgba(15,23,42,.12)}
					.sme-sum-kpi__label{color:#64748b;font-size:11px;margin-bottom:6px}
					.sme-sum-kpi__value{color:#0f172a;font-size:22px;font-weight:700;line-height:1.1;font-variant-numeric:tabular-nums}
					.sme-sum-kpi__hint{margin-top:6px;font-size:10px;color:#94a3b8}
					.sme-sum-kpi--visits{border-top-color:#2563eb}
					.sme-sum-kpi--marketing{border-top-color:#0d9488}
					.sme-sum-kpi--meeting{border-top-color:#ca8a04}
					.sme-sum-kpi--me{border-top-color:#7c3aed}
					.sme-sum-kpi--training{border-top-color:#ea580c}
					.sme-sum-kpi--academic{border-top-color:#64748b}
					.sme-sum-kpi--ulama{border-top-color:#0891b2}
					.sme-sum-kpi--points{border-top-color:#2563eb}
					.sme-sum-kpi--pct{border-top-color:#059669}
					@media print{
						.page-head,.layout-side-section,.sme-sum-filters{display:none!important}
						.sme-sum-table{font-size:10px}
					}
				</style>
				<p class="sme-sum-note">
					Period summary for School Marketing Executives.
					Use <strong>Visit From / To Date</strong> to filter by the visit date on each Field Visit
					(Marketing / M&amp;E / Meeting / Training dates — not document creation date).
					<strong>Total Visits</strong> counts every <strong>Submitted</strong> Field Visit
					(Marketing, Meetings, M&amp;E, Training, Academic / Other).
					Draft and Cancelled documents are not included.
					Click any visit number to see the Field Visit documents behind it.
					<strong>Total Points</strong> = working days × daily target for that SME’s Type / Division
					(Karachi 6, Urban / Punjab 5, Rural 4).
					<strong>Total Earned Points</strong> = KPI points from Target Base.
					<strong>Percentage</strong> = earned ÷ total points.
					<strong>KPI Activities</strong> are the Target Base counts that make up earned points
					(Total Visits, workshops, Ulama meetings, academic, etc.).
					Workshop score uses session count, not participant heads.
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
			label: __("Fallback Region"),
			fieldtype: "Select",
			fieldname: "region",
			description: __("Used only if the SME has no Field Officer Type / Division"),
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
			submitted_only: 1,
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

	fmt_pct(n) {
		return `${this.fmt_score(n)}%`;
	}

	click_td(n, metric, staff) {
		const staffAttr = staff ? ` data-visit-staff="${frappe.utils.escape_html(staff)}"` : "";
		return `<td class="num sme-click" data-visit-metric="${metric}"${staffAttr} title="${__("Click to see Field Visits")}">${this.fmt(n)}</td>`;
	}

	points_td(value, kind, row, html) {
		const emp = (row && (row.employee || row.employee_name || row.user_id)) || "";
		const extra = kind === "pct" ? "score-col" : "pts-col";
		return `<td class="num sme-click ${extra}" data-points-kind="${kind}" data-employee="${frappe.utils.escape_html(
			emp
		)}" title="${__("Click to see how this is calculated")}">${html}</td>`;
	}

	kpi_columns(data) {
		return (
			(data && data.kpi_columns) || [
				{ key: "visits", label: __("Total Visits"), metric: "visits" },
				{ key: "half_day_workshop", label: __("Half Day WS"), metric: "half_day_workshop" },
				{ key: "full_day_session", label: __("Full Day Session"), metric: "full_day_session" },
				{ key: "meeting_ulama", label: __("Ulama / Educationist"), metric: "meeting_ulama" },
				{ key: "teachers_training_meeting", label: __("Teachers Training"), metric: "teachers_training_meeting" },
				{ key: "headoffice_visit", label: __("Head / Regional Office"), metric: "headoffice_visit" },
				{ key: "academic_task", label: __("Academic"), metric: "academic_task" },
				{ key: "co_curricular", label: __("Co-curricular"), metric: "co_curricular" },
			]
		);
	}

	render_kpi_cards(data) {
		const k = data.kpis || {};
		const cards = [
			[__("Total Visits"), this.fmt(k.visits), "visits", "visits"],
			[__("Marketing"), this.fmt(k.marketing), "marketing", "marketing"],
			[__("Meetings"), this.fmt(k.meetings), "meeting", "meeting"],
			[__("M&E"), this.fmt(k.me), "me", "me"],
			[__("Training"), this.fmt(k.training), "training", "training"],
			[__("Academic"), this.fmt(k.academic), "academic", "academic_task"],
			[__("Ulama / Educationist"), this.fmt(k.ulama), "ulama", "meeting_ulama"],
			[__("Total Earned Points"), this.fmt_score(k.earned_points), "points", "", "earned"],
			[__("Achievement"), this.fmt_pct(k.percentage), "pct", "", "pct"],
		];
		return `<div class="sme-sum-kpis">${cards
			.map(
				([label, value, style, metric, pointsKind]) => `
			<div class="sme-sum-kpi sme-sum-kpi--${style}" ${
				metric ? `data-visit-metric="${metric}"` : pointsKind ? `data-points-kind="${pointsKind}"` : ""
			}>
				<div class="sme-sum-kpi__label">${label}</div>
				<div class="sme-sum-kpi__value">${value}</div>
				<div class="sme-sum-kpi__hint">${__("Click to see details")}</div>
			</div>`
			)
			.join("")}</div>`;
	}

	render(data) {
		const fromLabel = frappe.datetime.str_to_user(data.from_date);
		const toLabel = frappe.datetime.str_to_user(data.to_date);
		const rows = data.rows || [];
		const t = data.totals || {};
		const kpiCols = this.kpi_columns(data);
		const colCount = 14 + kpiCols.length;

		const kpi_tds = (src, staff) =>
			kpiCols
				.map((c) => this.click_td(src[c.key], c.metric || c.key, staff))
				.join("");

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
					<td class="num">${this.fmt_cur(r.expenses)}</td>
					${this.click_td(r.visited_days, "visits", staff)}
					${kpi_tds(r, staff)}
					${this.points_td(r.total_points, "total", r, this.fmt_score(r.total_points))}
					${this.points_td(r.earned_points, "earned", r, this.fmt_score(r.earned_points))}
					${this.points_td(r.percentage, "pct", r, this.fmt_pct(r.percentage))}
				</tr>`;
					})
					.join("")
			: `<tr><td colspan="${colCount}" class="text-center text-muted">${__("No SMEs found")}</td></tr>`;

		$("#sme-sum-body").html(`
			<div class="sme-sum-title">${__("Summary")} (${__("Visit Date")}: ${fromLabel} ${__("to")} ${toLabel})</div>
			${this.render_kpi_cards(data)}
			<div class="sme-sum-break">
				<strong>${__("Visit numbers are clickable.")}</strong>
				${__("Total Visits")} = ${__("every Submitted Field Visit")} (${__("Marketing, Meetings, M&E, Training, Academic / Other")}).
				${__("Draft and Cancelled are excluded.")}.
				${__("KPI Activities")} = ${__("Target Base counts that earn points")}.
				${__("Click a visit number to open Field Visits. Click Total Points / Earned Points / Percentage to see the Target Base breakdown.")}
			</div>
			<div class="sme-sum-meta">
				${__("Visit Date")}: <strong>${fromLabel} – ${toLabel}</strong>
				&nbsp;|&nbsp;
				${__("Working Days")}: <strong>${data.working_days}</strong>
				&nbsp;|&nbsp;
				${__("Daily points by Type / Division")}:
				<strong>${__("Karachi")} 6</strong>,
				<strong>${__("Urban / Punjab")} 5</strong>,
				<strong>${__("Rural")} 4</strong>
				${__("× working days")}
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
							<th colspan="2" class="group">${__("Total")}</th>
							<th colspan="${kpiCols.length}" class="kpi-group">${__("KPI Activities")}</th>
							<th colspan="3" class="group">${__("KPI Points")}</th>
						</tr>
						<tr>
							<th>${__("Followup & Other Visits")}</th>
							<th>${__("New")}</th>
							<th>${__("Meetings")}</th>
							<th>${__("Active")}</th>
							<th>${__("Inactive")}</th>
							<th>${__("No. of Schools Attended")}</th>
							<th>${__("No. of participants")}</th>
							<th>${__("Expenses")}</th>
							<th>${__("Visited Days")}</th>
							${kpiCols.map((c) => `<th>${__(c.label)}</th>`).join("")}
							<th>${__("Total Points")}</th>
							<th>${__("Total Earned Points")}</th>
							<th>${__("Percentage")}</th>
						</tr>
					</thead>
					<tbody>${body}</tbody>
					<tfoot>
						<tr>
							<th class="left">${__("Total")}</th>
							<th></th>
							${this.click_td(t.followup, "followup", "")}
							${this.click_td(t.new, "new", "")}
							${this.click_td(t.meetings, "meeting", "")}
							${this.click_td(t.active, "me_active", "")}
							${this.click_td(t.inactive, "me_inactive", "")}
							${this.click_td(t.schools, "schools", "")}
							${this.click_td(t.participants, "participants", "")}
							<th class="num">${this.fmt_cur(t.expenses)}</th>
							${this.click_td(t.visited_days, "visits", "")}
							${kpi_tds(t, "")}
							${this.points_td(t.total_points, "total", t, this.fmt_score(t.total_points))}
							${this.points_td(t.earned_points, "earned", t, this.fmt_score(t.earned_points))}
							${this.points_td(t.percentage, "pct", t, this.fmt_pct(t.percentage))}
						</tr>
					</tfoot>
				</table>
			</div>
		`);
	}

	fmt_plain(n, digits = 2) {
		const x = flt(n || 0);
		return x.toLocaleString(undefined, {
			minimumFractionDigits: digits,
			maximumFractionDigits: digits,
		});
	}

	show_points_detail(kind, employee) {
		const data = this.data || {};
		const emp = (employee || "").trim();
		const row = emp
			? (data.rows || []).find(
					(r) => r.employee === emp || r.employee_name === emp || r.user_id === emp
			  )
			: null;
		const src = row || data.totals || {};
		const breakdown = src.points_breakdown || (data.totals || {}).points_breakdown || [];
		const staff = row ? row.employee_name || row.user_id || "" : "";
		const workingDays = row ? row.working_days : data.working_days;
		const perDay = row ? row.per_day_points : null;
		const regionName = row
			? row.division || row.region_label || ""
			: __("all Type / Division sheets");
		const totalPts = flt(src.total_points);
		const earned = flt(src.earned_points);
		const pct = flt(src.percentage);
		const title = row
			? `${__("KPI Points")} — ${row.label || row.employee_name}`
			: __("KPI Points — Grand Total");

		const sorted = [...breakdown].sort((a, b) => flt(b.earned) - flt(a.earned));
		const lines = sorted.length
			? sorted
					.map((line) => {
						const has = flt(line.earned) > 0;
						const actualHtml = `<a href="#" class="sme-pts-link" data-visit-metric="${frappe.utils.escape_html(
							line.metric || line.key
						)}" data-visit-staff="${frappe.utils.escape_html(staff)}">${this.fmt_plain(
							line.actual,
							flt(line.actual) % 1 ? 2 : 0
						)}</a>`;
						const ptsEach = line.points == null ? "—" : this.fmt_plain(line.points, 0);
						const actualN = this.fmt_plain(line.actual, flt(line.actual) % 1 ? 2 : 0);
						const calc = line.points == null ? "—" : `${actualN} × ${ptsEach}`;
						return `<tr class="${has ? "sme-pts-row--hit" : "sme-pts-row--zero"}">
					<td>${frappe.utils.escape_html(line.label || line.key)}</td>
					<td class="sme-pts-num">${actualHtml}</td>
					<td class="sme-pts-num">${calc}</td>
					<td class="sme-pts-num sme-pts-earned">${this.fmt_plain(line.earned)}</td>
				</tr>`;
					})
					.join("")
			: `<tr><td colspan="4" class="text-muted text-center">${__("No KPI breakdown")}</td></tr>`;

		const totalHint = row
			? `${workingDays} ${__("working days")} × ${perDay} ${__("pts/day")} · ${frappe.utils.escape_html(
					regionName
			  )}`
			: `${__("Sum of each SME’s working days × their daily target")}`;

		const d = new frappe.ui.Dialog({
			title,
			size: "extra-large",
			fields: [{ fieldtype: "HTML", fieldname: "html" }],
			primary_action_label: __("Close"),
			primary_action: () => d.hide(),
		});
		d.$wrapper.addClass("sme-pts-dialog");
		d.fields_dict.html.$wrapper.html(`
			<style>
				.sme-pts-dialog .modal-body{padding-top:12px}
				.sme-pts-wrap{font-family:inherit;color:#0f172a}
				.sme-pts-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:0 0 14px}
				.sme-pts-card{border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;background:#fff}
				.sme-pts-card--target{border-top:3px solid #2563eb;background:#eff6ff}
				.sme-pts-card--earned{border-top:3px solid #0f766e;background:#ecfdf5}
				.sme-pts-card--pct{border-top:3px solid #059669;background:#f0fdf4}
				.sme-pts-card__label{font-size:11px;font-weight:600;letter-spacing:.02em;text-transform:uppercase;color:#64748b;margin-bottom:4px}
				.sme-pts-card__value{font-size:26px;font-weight:700;line-height:1.15;font-variant-numeric:tabular-nums}
				.sme-pts-card__hint{margin-top:6px;font-size:12px;color:#475569;line-height:1.35}
				.sme-pts-note{font-size:12px;color:#64748b;margin:0 0 8px}
				.sme-pts-table-wrap{border:1px solid #e2e8f0;border-radius:10px;overflow:auto;max-height:420px;background:#fff}
				.sme-pts-table{width:100%;border-collapse:separate;border-spacing:0;font-size:13px;margin:0}
				.sme-pts-table th,.sme-pts-table td{padding:8px 12px;border-bottom:1px solid #e2e8f0;vertical-align:middle}
				.sme-pts-table thead th{position:sticky;top:0;background:#f1f5f9;z-index:1;font-size:11px;text-transform:uppercase;letter-spacing:.03em;color:#334155;font-weight:700}
				.sme-pts-table tbody td:first-child{max-width:420px}
				.sme-pts-num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;width:1%}
				.sme-pts-earned{font-weight:700}
				.sme-pts-row--hit td{background:#f0fdf4}
				.sme-pts-row--zero td{color:#94a3b8}
				.sme-pts-table tfoot th{background:#f8fafc;font-weight:700;border-bottom:0}
				.sme-pts-link{color:#0f766e;text-decoration:underline;font-weight:600}
				.sme-pts-link:hover{color:#115e59}
				@media (max-width:800px){.sme-pts-cards{grid-template-columns:1fr}}
			</style>
			<div class="sme-pts-wrap">
				<div class="sme-pts-cards">
					<div class="sme-pts-card sme-pts-card--target">
						<div class="sme-pts-card__label">${__("Total Points")}</div>
						<div class="sme-pts-card__value">${this.fmt_plain(totalPts, 0)}</div>
						<div class="sme-pts-card__hint">${totalHint}</div>
					</div>
					<div class="sme-pts-card sme-pts-card--earned">
						<div class="sme-pts-card__label">${__("Total Earned Points")}</div>
						<div class="sme-pts-card__value">${this.fmt_plain(earned, 0)}</div>
						<div class="sme-pts-card__hint">${__("Sum of actual × points for each Target Base KPI")}</div>
					</div>
					<div class="sme-pts-card sme-pts-card--pct">
						<div class="sme-pts-card__label">${__("Percentage")}</div>
						<div class="sme-pts-card__value">${this.fmt_plain(pct)}%</div>
						<div class="sme-pts-card__hint">${this.fmt_plain(earned, 0)} ÷ ${this.fmt_plain(totalPts, 0)}</div>
					</div>
				</div>
				<p class="sme-pts-note">${__("Green rows earned points. Click an Actual number to open those Field Visits.")}</p>
				<div class="sme-pts-table-wrap">
					<table class="sme-pts-table">
						<thead>
							<tr>
								<th>${__("KPI Activity")}</th>
								<th class="sme-pts-num">${__("Actual")}</th>
								<th class="sme-pts-num">${__("Calculation")}</th>
								<th class="sme-pts-num">${__("Earned")}</th>
							</tr>
						</thead>
						<tbody>${lines}</tbody>
						<tfoot>
							<tr>
								<th>${__("Total Earned Points")}</th>
								<th></th>
								<th></th>
								<th class="sme-pts-num">${this.fmt_plain(earned)}</th>
							</tr>
						</tfoot>
					</table>
				</div>
			</div>
		`);
		if (frappe.tif_customization && frappe.tif_customization.bind_clickable_numbers) {
			frappe.tif_customization.bind_clickable_numbers(d.$wrapper, () => this.get_filters());
		}
		d.show();
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
			"Expenses",
			"Visited Days",
			...this.kpi_columns(this.data).map((c) => c.label),
			"Total Points",
			"Total Earned Points",
			"Percentage",
		];
		const lines = [headers.join(",")];
		const kpiCols = this.kpi_columns(this.data);
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
					r.expenses || 0,
					r.visited_days || 0,
					...kpiCols.map((c) => r[c.key] || 0),
					r.total_points || 0,
					r.earned_points || 0,
					r.percentage || 0,
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
