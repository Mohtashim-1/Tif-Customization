frappe.pages["sme-summary-report-copy"].on_page_load = function (wrapper) {
	frappe.require("/assets/tif_customization/js/field_visit_drilldown.js", () => {
		const page = frappe.ui.make_app_page({
			parent: wrapper,
			title: __("SME Summary Report (Copy)"),
			single_column: true,
		});
		new frappe.tif_customization.SMESummaryReportCopy(page).make();
	});
};

frappe.tif_customization = frappe.tif_customization || {};

frappe.tif_customization.SMESummaryReportCopy = class SMESummaryReportCopy {
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
			<div class="sme-sum" style="padding:16px;">
				<style>
					.sme-sum-note{font-size:12px;color:var(--text-muted,#6b7280);margin:0 0 12px}
					.sme-sum-table-wrap{
						overflow:auto;
						overflow-anchor:none;
						max-height:min(72vh,calc(100vh - 240px));
						border:1px solid var(--border-color,#e5e7eb);
						border-radius:8px;
						background:#fff;
						position:relative;
					}
					/* collapse breaks position:sticky on th in Chrome — scroll inside .sme-sum-table-wrap */
					.sme-sum-table{width:100%;border-collapse:separate;border-spacing:0;font-size:12px;min-width:2800px}
					.sme-sum-table thead tr:nth-child(2) th.activity-col,
					.sme-sum-table thead tr:nth-child(3) th.activity-col{font-size:10px;line-height:1.2;max-width:120px;white-space:normal}
					.sme-sum-table thead tr:first-child th.outcome-group{background:#fef3c7}
					.sme-sum-table thead tr:nth-child(2) th.outcome-col{background:#fffbeb;font-size:10px;line-height:1.2;max-width:100px;white-space:normal}
					.sme-sum-table th,.sme-sum-table td{padding:7px 8px;border:1px solid var(--border-color,#e5e7eb);vertical-align:middle}
					.sme-sum-table thead th{
						position:sticky;
						background:#f3f4f6;
						text-align:center;
						font-weight:600;
						white-space:nowrap;
						box-shadow:0 1px 0 #e5e7eb;
					}
					.sme-sum-table thead tr:first-child th{top:0;z-index:5}
					.sme-sum-table thead tr:nth-child(2) th{top:var(--sme-sum-thead-row1,38px);z-index:4}
					.sme-sum-table thead tr:nth-child(3) th{top:var(--sme-sum-thead-row2,76px);z-index:3}
					.sme-sum-table thead tr:first-child th[rowspan="3"],
					.sme-sum-table thead tr:nth-child(2) th[rowspan="2"]{z-index:6}
					.sme-sum-table thead tr:first-child th.group,
					.sme-sum-table thead tr:first-child th.kpi-group{background:#e5e7eb}
					.sme-sum-table thead tr:nth-child(2) th.me-col{background:#f5f3ff}
					.sme-sum-table .group{background:#e5e7eb}
					.sme-sum-table .kpi-group{background:#dbeafe}
					.sme-sum-table .left{text-align:left}
					.sme-sum-table .num{text-align:right;font-variant-numeric:tabular-nums}
					.sme-sum-table .sme-click{cursor:pointer;color:#0f766e;text-decoration:underline}
					.sme-sum-table .sme-click:hover{background:#ecfdf5}
					.sme-sum-break{background:#f8fafc;border:1px dashed #94a3b8;border-radius:8px;padding:10px 12px;margin:0 0 12px;font-size:13px;text-align:left}
					.sme-sum-table tfoot th{background:#f9fafb;font-weight:700}
					.sme-sum-table .sme-low{background:#fef2f2}
					.sme-sum-table .sme-low td,
					.sme-sum-table .sme-low .kpi-col{background:#fef2f2}
					.sme-sum-table .sme-low .sme-click:hover{background:#fecaca}
					.sme-sum-table .sme-low .score-col,
					.sme-sum-table .sme-low .pts-col{background:#fee2e2;font-weight:700;color:#991b1b}
					.sme-sum-table .kpi-col{background:#f8fafc}
					.sme-sum-table .me-col,.sme-sum-table .visit-mon-col{background:#f5f3ff;font-weight:600;color:#5b21b6}
					.sme-sum-table .me-col.sme-click,.sme-sum-table .visit-mon-col.sme-click{color:#6d28d9}
					.sme-sum-table .me-col.sme-click:hover,.sme-sum-table .visit-mon-col.sme-click:hover{background:#ede9fe}
					.sme-sum-table thead tr:first-child th.activity-group{background:#ccfbf1}
					.sme-sum-table thead tr:nth-child(2) th.visit-group{background:#99f6e4}
					.sme-sum-table thead tr:nth-child(3) th.visit-col,.sme-sum-table thead tr:nth-child(3) th.activity-col{background:#f0fdfa}
					.sme-sum-title{text-align:center;font-size:18px;font-weight:700;margin:8px 0 14px}
					.sme-sum-meta{text-align:center;font-size:12px;color:#6b7280;margin-bottom:12px}
					.sme-sum-kpi-groups{display:flex;flex-direction:column;gap:12px;margin:0 0 14px}
					.sme-sum-kpi-group__title{font-size:12px;font-weight:700;color:#475569;margin:0 0 8px;text-transform:uppercase;letter-spacing:.04em}
					.sme-sum-kpis{display:grid;grid-template-columns:repeat(auto-fill,minmax(132px,150px));gap:10px;justify-content:start}
					.sme-sum-kpi{border:1px solid var(--border-color,#e5e7eb);border-top:4px solid #64748b;border-radius:10px;background:#fff;padding:12px 14px;box-shadow:0 2px 8px rgba(15,23,42,.05);max-width:150px;min-width:132px}
					.sme-sum-kpi[data-visit-metric],.sme-sum-kpi[data-points-kind],.sme-sum-kpi[data-card-kind]{cursor:pointer}
					.sme-sum-kpi[data-visit-metric]:hover,.sme-sum-kpi[data-points-kind]:hover,.sme-sum-kpi[data-card-kind]:hover{box-shadow:0 4px 14px rgba(15,23,42,.12)}
					.sme-sum-kpi__label{color:#64748b;font-size:11px;margin-bottom:6px;line-height:1.25}
					.sme-sum-kpi__value{color:#0f172a;font-size:22px;font-weight:700;line-height:1.1;font-variant-numeric:tabular-nums}
					.sme-sum-kpi__hint{margin-top:6px;font-size:10px;color:#94a3b8}
					.sme-sum-kpi--followup,.sme-sum-kpi--new,.sme-sum-kpi--marketing{border-top-color:#0d9488}
					.sme-sum-kpi--meeting{border-top-color:#ca8a04}
					.sme-sum-kpi--active,.sme-sum-kpi--inactive,.sme-sum-kpi--me{border-top-color:#7c3aed}
					.sme-sum-kpi--schools,.sme-sum-kpi--participants,.sme-sum-kpi--training{border-top-color:#ea580c}
					.sme-sum-kpi--expenses{border-top-color:#b45309}
					.sme-sum-kpi--visited{border-top-color:#2563eb}
					.sme-sum-kpi--visits,.sme-sum-kpi--half_day,.sme-sum-kpi--full_day{border-top-color:#1d4ed8}
					.sme-sum-kpi--ulama{border-top-color:#0891b2}
					.sme-sum-kpi--teachers{border-top-color:#0284c7}
					.sme-sum-kpi--headoffice{border-top-color:#6366f1}
					.sme-sum-kpi--academic{border-top-color:#64748b}
					.sme-sum-kpi--co_curricular{border-top-color:#9333ea}
					.sme-sum-kpi--grand{border-top-color:#334155}
					.sme-sum-kpi--school{border-top-color:#0f766e}
					.sme-sum-kpi--points{border-top-color:#2563eb}
					.sme-sum-kpi--earned{border-top-color:#0f766e}
					.sme-sum-kpi--pct{border-top-color:#059669}
					.sme-sum-kpi--sme{border-top-color:#475569}
					.sme-sum-kpi--supervisor{border-top-color:#7c2d12}
					.sme-sum-kpi--outcome{border-top-color:#ca8a04}
					.sme-sum-kpi--model-a{border-top-color:#b45309}
					.sme-sum-kpi--model-b{border-top-color:#c2410c}
					@media print{
						@page{size:A4 landscape;margin:8mm}
						html,body{width:100%!important;height:auto!important;overflow:visible!important;background:#fff!important}
						.navbar,.page-head,.layout-side-section,.layout-side-section,.desk-sidebar,.page-actions,.page-form-actions,.sme-sum-filters,.sme-sum-note,.sme-sum-break,.no-print{display:none!important}
						.layout-main,.layout-main-section-wrapper,.layout-main-section,.page-content,.page-container,.container,.sme-sum{padding:0!important;margin:0!important;max-width:none!important;width:100%!important;overflow:visible!important}
						.sme-sum-kpi__hint{display:none}
						.sme-sum-kpi{box-shadow:none;break-inside:avoid}
						.sme-sum-table-wrap{overflow:visible!important;border:none;border-radius:0}
						.sme-sum-table{width:100%!important;min-width:0!important;font-size:8px;table-layout:fixed}
						.sme-sum-table th,.sme-sum-table td{padding:4px 5px;word-wrap:break-word;overflow-wrap:anywhere}
						.sme-sum-table .sme-click{color:#0f172a!important;text-decoration:none!important}
						.sme-sum-title{font-size:14px;margin:0 0 6px}
						.sme-sum-meta{font-size:9px;margin-bottom:6px}
						.sme-sum-table .sme-low td{background:#fef2f2!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
						.sme-sum-kpi-groups,.sme-sum-table-wrap{break-inside:avoid-page}
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
					<strong>Expenses</strong> are recorded Field Visit travel cost plus submitted Expense Claims only.
					If KM / travel cost was not entered, that visit adds Rs 0 — nothing is estimated.
					Click an Expenses amount in the table to see the recorded KM, rate, and formula.
				</p>
				<div id="sme-sum-filters" class="sme-sum-filters row" style="margin-bottom:12px;"></div>
				<div id="sme-sum-body"></div>
			</div>
		`);
	}

	get_current_month_range() {
		const today = frappe.datetime.get_today();
		return {
			from_date: frappe.datetime.month_start(today),
			to_date: today,
		};
	}

	make_filters() {
		const { from_date, to_date } = this.get_current_month_range();

		this.from_date = this.make_filter({
			label: __("Visit From Date"),
			fieldtype: "Date",
			fieldname: "from_date",
			reqd: 1,
			default: from_date,
		});
		this.to_date = this.make_filter({
			label: __("Visit To Date"),
			fieldtype: "Date",
			fieldname: "to_date",
			reqd: 1,
			default: to_date,
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

		this.supervisor = this.make_filter({
			label: __("Supervisor"),
			fieldtype: "Autocomplete",
			fieldname: "supervisor",
			options: [],
			description: __("Filter by Field Supervisor on Field Officer (line manager, not HR Reports To)"),
			change: () => {
				this.employee.set_value("");
				this.schedule_load();
			},
		});
		this.setup_supervisor_autocomplete();

		this.employee = this.make_filter({
			label: __("SME"),
			fieldtype: "Link",
			fieldname: "employee",
			options: "Employee",
			get_query: () => {
				const supervisor = (this.supervisor.get_value() || "").trim();
				if (supervisor) {
					return {
						query:
							"tif_customization.tif_customization.page.sme_summary_report_copy.sme_summary_report_copy.get_sme_employee_query",
						filters: { supervisor },
					};
				}
				return {
					filters: {
						status: "Active",
						designation: "School Marketing Executive",
					},
				};
			},
		});
	}

	setup_supervisor_autocomplete() {
		this.supervisor.df.get_query = () => ({
			query:
				"tif_customization.tif_customization.page.supervisor_target_ba.supervisor_target_ba.get_supervisor_options",
		});
		this.supervisor.refresh();
	}

	update_supervisor_hint(data) {
		const stats = (data && data.supervisor_stats) || {};
		const total = stats.total || 0;
		const smeSup = stats.sme_supervisors || 0;
		const officers = stats.total_field_officers || 0;
		const desc =
			total > 0
				? __("Field supervisors: {0} · {1} field officers report to them ({2} with SMEs)", [
						total,
						officers,
						smeSup,
					])
				: __("No field supervisors found. Set Field Supervisor on each Field Officer record.");
		this.supervisor.df.description = desc;
		this.supervisor.refresh();
	}

	make_filter(df) {
		const wrap = $('<div class="col-md-2" style="margin-bottom:8px;"></div>');
		$("#sme-sum-filters").append(wrap);
		const control = frappe.ui.form.make_control({
			parent: wrap,
			df: Object.assign({ change: () => this.schedule_load() }, df),
			render_input: true,
		});
		control.refresh();
		if (df.default !== undefined && df.default !== null && df.default !== "") {
			control.set_value(df.default);
		}
		return control;
	}

	schedule_load() {
		clearTimeout(this._timer);
		this._timer = setTimeout(() => this.load_data(), 350);
	}

	get_drilldown_staff() {
		const empId = this.employee.get_value() || "";
		if (!empId) return "";
		const rows = (this.data && this.data.rows) || [];
		const row = rows.find((r) => r.employee === empId);
		if (row) return row.employee_name || row.user_id || empId;
		return empId;
	}

	get_filters() {
		const month = this.get_current_month_range();
		const employee = this.employee.get_value() || "";
		return {
			from_date: this.from_date.get_value() || month.from_date,
			to_date: this.to_date.get_value() || month.to_date,
			working_days: this.working_days.get_value() || "",
			region: this.region.get_value() || "karachi",
			supervisor: (this.supervisor.get_value() || "").trim(),
			employee,
			staff: this.get_drilldown_staff() || employee,
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
				"tif_customization.tif_customization.page.sme_summary_report_copy.sme_summary_report_copy.get_report_data",
			args: { filters },
			callback: (r) => {
				if (!r.message) {
					$("#sme-sum-body").html(`<p class="text-danger">${__("Failed to load.")}</p>`);
					return;
				}
				this.data = r.message;
				this.update_supervisor_hint(r.message);
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

	me_visits(row) {
		if (!row) return 0;
		if (row.me != null && row.me !== "") return row.me;
		return cint(row.active) + cint(row.inactive);
	}

	/** Visits block: Marketing (New), Monitoring (M&E), Follow up, Other (Meetings). */
	visit_columns() {
		return [
			{ label: __("Marketing"), metric: "new", value: (r) => r.new },
			{ label: __("Monitoring"), metric: "monitoring", value: (r) => this.me_visits(r), cellClass: "visit-mon-col" },
			{ label: __("Follow up"), metric: "followup", value: (r) => r.followup },
			{ label: __("Meetings"), metric: "meeting", value: (r) => r.meetings },
		];
	}

	click_td(n, metric, staff, extraClass = "", opts = {}) {
		const staffAttr = staff ? ` data-visit-staff="${frappe.utils.escape_html(staff)}"` : "";
		const cls = extraClass ? ` ${extraClass}` : "";
		const ytdAttr = opts.useYtd ? ` data-use-ytd="1"` : "";
		return `<td class="num sme-click${cls}" data-visit-metric="${metric}"${staffAttr}${ytdAttr} title="${__("Click to see Field Visits")}">${this.fmt(n)}</td>`;
	}

	expense_td(src, staff) {
		const staffAttr = staff ? ` data-expense-staff="${frappe.utils.escape_html(staff)}"` : "";
		return `<td class="num sme-click" data-expense-detail="1"${staffAttr} title="${__(
			"Click to see KM, rate, and how this expense is computed"
		)}">${this.fmt_cur(src.expenses)}</td>`;
	}

	outcome_columns(data) {
		return (
			(data && data.outcome_columns) || [
				{ key: "outcome_enrolment", label: __("Enrolment of participants"), metric: "enrolment" },
				{ key: "outcome_co_curricular", label: __("Quiz / co-curricular activities"), metric: "co_curricular" },
				{
					key: "outcome_new_schools",
					label: __("New schools (distinct, from school / field visits)"),
					metric: "new_schools",
				},
				{ key: "outcome_workshop_registration", label: __("Workshop participants"), metric: "workshop_registration" },
				{ key: "outcome_volunteers", label: __("Volunteers enrolled"), metric: "volunteers" },
				{ key: "outcome_model_school_a", label: __("Model School A"), metric: "model_school_a" },
				{ key: "outcome_model_school_b", label: __("Model School B"), metric: "model_school_b" },
			]
		);
	}

	outcome_subcolumns(data) {
		return this.outcome_columns(data).map((col) => {
			const short = (col.label || "").split("(")[0].trim().slice(0, 22);
			return {
				...col,
				header: `${col.label} (${__("YTD")})`,
				shortHeader: `${short} ${__("YTD")}`,
			};
		});
	}

	outcome_tds(src, staff, data) {
		return this.outcome_subcolumns(data)
			.map((col) =>
				this.click_td(src[col.key], col.metric, staff, "outcome-col", { useYtd: true })
			)
			.join("");
	}

	points_td(value, kind, row, html) {
		const emp = (row && (row.employee || row.employee_name || row.user_id)) || "";
		const extra = kind === "pct" ? "score-col" : "pts-col";
		return `<td class="num sme-click ${extra}" data-points-kind="${kind}" data-employee="${frappe.utils.escape_html(
			emp
		)}" title="${__("Click to see how this is calculated")}">${html}</td>`;
	}

	max_visited_days(data) {
		let max = 0;
		for (const r of (data && data.rows) || []) {
			max = Math.max(max, cint(r.visited_days) || 0);
		}
		return max;
	}

	kpi_columns(data) {
		return (
			(data && data.kpi_columns) || [
				{
					key: "workshop",
					label: __("Workshop"),
					metric: "training",
					value: (r) =>
						cint(r.workshop) ||
						cint(r.half_day_workshop) + cint(r.full_day_session),
				},
				{
					key: "meeting_ulama",
					label: __("Meeting with Ulama and Educationist"),
					metric: "meeting_ulama",
				},
				{
					key: "teachers_training_meeting",
					label: __("Teachers Training Meeting"),
					metric: "teachers_training_meeting",
				},
				{
					key: "headoffice_visit",
					label: __("Headoffice / Regional Office / Out of Station Visit"),
					metric: "headoffice_visit",
				},
				{ key: "academic_task", label: __("Academic Task"), metric: "academic_task" },
				{ key: "other_official", label: __("Other Official Tasks"), metric: "other_official" },
			]
		);
	}

	activity_table_columns(data) {
		return [...this.visit_columns(), ...this.kpi_columns(data)];
	}

	activity_tds(src, staff, data) {
		return this.activity_table_columns(data || this.data)
			.map((col) => {
				const val = col.value ? col.value(src) : src[col.key];
				return this.click_td(val, col.metric || col.key, staff, col.cellClass || "activity-col");
			})
			.join("");
	}

	kpi_card_groups(data) {
		const k = data.kpis || {};
		const expenseTotal = flt((data.totals || {}).expenses ?? k.expenses ?? 0);
		const visitedDaysMax = this.max_visited_days(data);
		const t = data.totals || {};
		const activityCards = [
			{ label: __("Marketing"), value: this.fmt(k.new), style: "new", metric: "new" },
			{ label: __("Monitoring"), value: this.fmt(k.me), style: "me", metric: "monitoring" },
			{ label: __("Follow up"), value: this.fmt(k.followup), style: "followup", metric: "followup" },
			{ label: __("Meetings"), value: this.fmt(k.meetings), style: "meeting", metric: "meeting" },
			...this.kpi_columns(data).map((col) => ({
				label: col.label,
				value: this.fmt(k[col.key]),
				style: (col.key || "activity").replace(/_/g, "-"),
				metric: col.metric || col.key,
			})),
		];
		return [
			{
				title: __("Overview"),
				cards: [
					{
						label: __("Total SMEs"),
						value: this.fmt(k.sme_count),
						style: "sme",
						cardKind: "sme_count",
						hint: __("SMEs in this report"),
					},
					{
						label: __("Total School Visits"),
						value: this.fmt(k.school_visits),
						style: "school",
						metric: "school_visits",
						hint: __("Marketing + Monitoring in the visit period"),
					},
					{
						label: __("SME School New"),
						value: this.fmt(k.new),
						style: "new",
						metric: "new",
						hint: __("Marketing visits marked New"),
					},
					{
						label: __("SME School Visit"),
						value: this.fmt(k.followup),
						style: "followup",
						metric: "followup",
						hint: __("Marketing follow-up / existing school visits"),
					},
					{
						label: __("New School Model A"),
						value: this.fmt(k.model_school_a ?? t.outcome_model_school_a),
						style: "model-a",
						metric: "model_school_a",
						useYtd: true,
						hint: __("YTD distinct Model A schools"),
					},
					{
						label: __("New School Model B"),
						value: this.fmt(k.model_school_b ?? t.outcome_model_school_b),
						style: "model-b",
						metric: "model_school_b",
						useYtd: true,
						hint: __("YTD distinct Model B schools"),
					},
				],
			},
			{
				title: __("Activity (period)"),
				cards: activityCards,
			},
			{
				title: __("Outcomes (YTD vs yearly mins)"),
				cards: this.outcome_columns(data).map((col) => ({
					label: col.label,
					value: this.fmt((data.totals || {})[col.key]),
					style: "outcome",
					metric: col.metric,
					useYtd: true,
				})),
			},
			{
				title: __("Summary"),
				cards: [
					{
						label: __("Expenses"),
						value: this.fmt_cur(expenseTotal),
						style: "expenses",
						cardKind: "expenses",
						hint: __("Recorded Field Visit travel cost plus Expense Claims. Blank KM is not estimated."),
					},
					{
						label: __("Visited Days"),
						value: this.fmt(visitedDaysMax),
						style: "visited",
						metric: "visited_days",
						hint: __("Highest value in the table Visited Days column"),
					},
					{
						label: __("Field Supervisors"),
						value: this.fmt(k.supervisor_count),
						style: "supervisor",
						cardKind: "supervisor_list",
						hint: __("Field Officers who manage other Field Officers"),
					},
				],
			},
		];
	}

	render_kpi_card(card) {
		const attrs = [];
		if (card.metric) attrs.push(`data-visit-metric="${frappe.utils.escape_html(card.metric)}"`);
		if (card.useYtd) attrs.push(`data-use-ytd="1"`);
		if (card.pointsKind) attrs.push(`data-points-kind="${frappe.utils.escape_html(card.pointsKind)}"`);
		if (card.cardKind) attrs.push(`data-card-kind="${frappe.utils.escape_html(card.cardKind)}"`);
		const clickable = card.metric || card.pointsKind || card.cardKind;
		const hint = card.hint || (clickable ? __("Click to see details") : __("Period total"));
		return `
			<div class="sme-sum-kpi sme-sum-kpi--${card.style}" ${attrs.join(" ")} title="${clickable ? __("Click to see details") : ""}">
				<div class="sme-sum-kpi__label">${card.label}</div>
				<div class="sme-sum-kpi__value">${card.value}</div>
				<div class="sme-sum-kpi__hint">${hint}</div>
			</div>`;
	}

	render_kpi_cards(data) {
		const groups = this.kpi_card_groups(data);
		return `<div class="sme-sum-kpi-groups">${groups
			.map(
				(group) => `
			<div class="sme-sum-kpi-group">
				<div class="sme-sum-kpi-group__title">${group.title}</div>
				<div class="sme-sum-kpis">${group.cards.map((c) => this.render_kpi_card(c)).join("")}</div>
			</div>`
			)
			.join("")}</div>`;
	}

	render(data) {
		const fromLabel = frappe.datetime.str_to_user(data.from_date);
		const toLabel = frappe.datetime.str_to_user(data.to_date);
		const rows = [...(data.rows || [])].sort(
			(a, b) => flt(b.percentage) - flt(a.percentage) || String(a.employee_name || "").localeCompare(String(b.employee_name || "")),
		);
		const t = data.totals || {};
		const visitCols = this.visit_columns();
		const kpiCols = this.kpi_columns(data);
		const activityCols = [...visitCols, ...kpiCols];
		const outcomeCols = this.outcome_subcolumns(data);
		const colCount = 2 + activityCols.length + outcomeCols.length + 2 + 3;

		const tail_tds = (src, visitStaff, expenseStaff) => `
					${this.expense_td(src, expenseStaff)}
					${this.click_td(src.visited_days, "visited_days", visitStaff)}`;

		const body = rows.length
			? rows
					.map((r) => {
						const staff = r.employee_name || r.user_id || "";
						const expenseStaff = r.employee || r.employee_name || r.user_id || "";
						const low = flt(r.percentage) < 50;
						return `
				<tr class="${low ? "sme-low" : ""}">
					<td class="left">${frappe.utils.escape_html(r.label || "")}</td>
					<td>${frappe.utils.escape_html(r.division || r.region_label || "—")}</td>
					${this.activity_tds(r, staff, data)}
					${this.outcome_tds(r, staff, data)}
					${tail_tds(r, staff, expenseStaff)}
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
				<strong>${__("Activity counts are clickable.")}</strong>
				${__("Same activities as SME KPI Details — Visits (Marketing, Monitoring, Follow up, Meetings) plus Target Base KPI rows.")}
				${__("Click a number to open Field Visits. Click Expenses to see recorded KM, rate, and how the amount is computed. Blank KM is not estimated. Click Total Points / Earned Points / Percentage for the points breakdown.")}
			</div>
			<div class="sme-sum-meta">
				${__("Visit Date")}: <strong>${fromLabel} – ${toLabel}</strong>
				&nbsp;|&nbsp;
				${__("Working Days")}: <strong>${data.working_days}</strong>
				${
					data.supervisor_label
						? `&nbsp;|&nbsp; ${__("Supervisor")}: <strong>${frappe.utils.escape_html(data.supervisor_label)}</strong>`
						: ""
				}
				&nbsp;|&nbsp;
				${__("Daily points by Type / Division")}:
				<strong>${__("Karachi")} 6</strong>,
				<strong>${__("Urban / Punjab")} 5</strong>,
				<strong>${__("Rural")} 4</strong>
				${__("× working days")}
				&nbsp;|&nbsp;
				${__("Outcomes YTD")}: <strong>${frappe.utils.escape_html(
					frappe.datetime.str_to_user(data.ytd_from || data.from_date)
				)} – ${toLabel}</strong>
				${data.fiscal_year_label ? `&nbsp;|&nbsp; ${__("FY")}: <strong>${frappe.utils.escape_html(data.fiscal_year_label)}</strong>` : ""}
			</div>
			<p class="text-muted small" style="margin:0 0 6px;">${__(
				"Scroll inside the table box below — column headers stay fixed while you move through rows."
			)}</p>
			<div class="sme-sum-table-wrap">
				<table class="sme-sum-table">
					<thead>
						<tr>
							<th rowspan="3" class="left">${__("Name")}</th>
							<th rowspan="3">${__("Type / Division")}</th>
							<th colspan="${activityCols.length}" class="group activity-group">${__("Activity (period)")}</th>
							<th colspan="${outcomeCols.length}" class="group outcome-group">${__("Outcomes (YTD vs yearly mins)")}</th>
							<th colspan="2" class="group">${__("Totals")}</th>
							<th colspan="3" class="group">${__("KPI Points")}</th>
						</tr>
						<tr>
							<th colspan="${visitCols.length}" class="group visit-group">${__("Visit")}</th>
							${kpiCols
								.map(
									(c) =>
										`<th rowspan="2" class="activity-col" title="${frappe.utils.escape_html(c.label)}">${frappe.utils.escape_html(
											c.label
										)}</th>`
								)
								.join("")}
							${outcomeCols
								.map(
									(c) =>
										`<th rowspan="2" class="outcome-col" title="${frappe.utils.escape_html(
											c.header || c.shortHeader
										)}">${frappe.utils.escape_html(c.shortHeader)}</th>`
								)
								.join("")}
							<th rowspan="2" title="${frappe.utils.escape_html(
								__("Click an amount to see KM, rate, and how travel expense is computed")
							)}">${__("Expenses")}</th>
							<th rowspan="2">${__("Visited Days")}</th>
							<th rowspan="2">${__("Total Points")}</th>
							<th rowspan="2">${__("Total Earned Points")}</th>
							<th rowspan="2">${__("Percentage")}</th>
						</tr>
						<tr>
							${visitCols
								.map(
									(c) =>
										`<th class="activity-col visit-col${c.cellClass ? ` ${c.cellClass}` : ""}" title="${frappe.utils.escape_html(
											c.label
										)}">${frappe.utils.escape_html(c.label)}</th>`
								)
								.join("")}
						</tr>
					</thead>
					<tbody>${body}</tbody>
					<tfoot>
						<tr>
							<th class="left">${__("Total")}</th>
							<th></th>
							${this.activity_tds(t, "", data)}
							${this.outcome_tds(t, "", data)}
							${tail_tds(t, "", "")}
							${this.points_td(t.total_points, "total", t, this.fmt_score(t.total_points))}
							${this.points_td(t.earned_points, "earned", t, this.fmt_score(t.earned_points))}
							${this.points_td(t.percentage, "pct", t, this.fmt_pct(t.percentage))}
						</tr>
					</tfoot>
				</table>
			</div>
		`);
		this.bind_interactions();
		this.sync_sticky_table_header();
	}

	sync_sticky_table_header() {
		const wrap = document.querySelector(".sme-sum-table-wrap");
		if (!wrap) return;
		const row1 = wrap.querySelector("thead tr:first-child");
		const row2 = wrap.querySelector("thead tr:nth-child(2)");
		if (!row1) return;
		const h1 = Math.ceil(row1.getBoundingClientRect().height);
		const h2 = row2 ? Math.ceil(row2.getBoundingClientRect().height) : 0;
		if (h1 > 0) {
			wrap.style.setProperty("--sme-sum-thead-row1", `${h1}px`);
		}
		if (h1 > 0 && h2 > 0) {
			wrap.style.setProperty("--sme-sum-thead-row2", `${h1 + h2}px`);
		}
		const resize = () => this.sync_sticky_table_header();
		if (!this._stickyHeaderResizeBound) {
			this._stickyHeaderResizeBound = true;
			$(window).on("resize.smeSumSticky", resize);
		}
	}

	bind_interactions() {
		const $root = $(".sme-sum");
		const me = this;

		$root.off("click.smeSumVisit click.smeSumPoints click.smeSumCard click.smeSumExpense");

		$root.on("click.smeSumVisit", "[data-visit-metric]", function (e) {
			e.preventDefault();
			e.stopPropagation();
			const metric = $(this).attr("data-visit-metric");
			if (!metric) return;
			const staff = $(this).attr("data-visit-staff") || "";
			const ctx = me.get_filters();
			if (!ctx.from_date || !ctx.to_date) {
				frappe.msgprint(__("Please select Visit From Date and Visit To Date."));
				return;
			}
			if (!frappe.tif_customization || !frappe.tif_customization.open_visit_drilldown) {
				frappe.msgprint(__("Drill-down module is still loading. Please refresh the page."));
				return;
			}
			const useYtd = $(this).attr("data-use-ytd");
			const from_date =
				useYtd && me.data && me.data.ytd_from ? me.data.ytd_from : ctx.from_date;
			frappe.tif_customization.open_visit_drilldown({
				from_date,
				to_date: ctx.to_date,
				staff: staff || ctx.staff || ctx.employee || "",
				metric,
				submitted_only: ctx.submitted_only || 1,
			});
		});

		$root.on("click.smeSumPoints", "[data-points-kind]", function (e) {
			e.preventDefault();
			e.stopPropagation();
			me.show_points_detail($(this).attr("data-points-kind") || "", $(this).attr("data-employee") || "");
		});

		$root.on("click.smeSumCard", "[data-card-kind]", function (e) {
			e.preventDefault();
			e.stopPropagation();
			const kind = $(this).attr("data-card-kind");
			if (kind === "expenses") me.show_expense_detail();
			else if (kind === "sme_count") me.show_sme_list();
			else if (kind === "supervisor_list") me.show_supervisor_list();
		});

		$root.on("click.smeSumExpense", "[data-expense-detail]", function (e) {
			e.preventDefault();
			e.stopPropagation();
			me.show_expense_detail($(this).attr("data-expense-staff") || "");
		});
	}

	show_supervisor_list() {
		const data = this.data || {};
		const stats = data.supervisor_stats || {};
		const rows = [...(data.supervisors || [])];
		const body = rows.length
			? rows
					.map(
						(r) => `<tr>
				<td>${frappe.utils.escape_html(r.label || r.employee_name || "")}</td>
				<td>${frappe.utils.escape_html(r.division || "—")}</td>
				<td>${frappe.utils.escape_html(r.designation || "—")}</td>
				<td class="num">${this.fmt(r.field_officer_count)}</td>
				<td class="num">${this.fmt(r.sme_count)}</td>
			</tr>`,
					)
					.join("")
			: `<tr><td colspan="5" class="text-muted text-center">${__("No field supervisors found")}</td></tr>`;

		const d = new frappe.ui.Dialog({
			title: __("Field Supervisors"),
			size: "large",
			fields: [{ fieldtype: "HTML", fieldname: "html" }],
			primary_action_label: __("Close"),
			primary_action: () => d.hide(),
		});
		d.fields_dict.html.$wrapper.html(`
			<p class="text-muted" style="font-size:12px;margin-bottom:10px;">
				${__(
					"Field supervisors are Field Officers who manage other Field Officers (Field Supervisor link on Field Officer). Example: Hammad Saleem → Field Supervisor: M. Adnan Munir."
				)}
				<br>
				${__("Supervisors")}: <strong>${this.fmt(stats.total || rows.length)}</strong>
				&nbsp;·&nbsp;
				${__("Field officers under them")}: <strong>${this.fmt(stats.total_field_officers || 0)}</strong>
				&nbsp;·&nbsp;
				${__("SMEs under them")}: <strong>${this.fmt(stats.total_smes || 0)}</strong>
			</p>
			<div class="table-responsive" style="max-height:420px;overflow:auto;">
				<table class="table table-bordered table-hover" style="font-size:12px;margin:0;">
					<thead>
						<tr>
							<th>${__("Supervisor")}</th>
							<th>${__("Type / Division")}</th>
							<th>${__("Designation")}</th>
							<th class="text-right">${__("Field Officers")}</th>
							<th class="text-right">${__("SMEs")}</th>
						</tr>
					</thead>
					<tbody>${body}</tbody>
					<tfoot>
						<tr>
							<th>${__("Total")}</th>
							<th></th>
							<th></th>
							<th class="text-right">${this.fmt(stats.total_field_officers || 0)}</th>
							<th class="text-right">${this.fmt(stats.total_smes || 0)}</th>
						</tr>
					</tfoot>
				</table>
			</div>
		`);
		d.show();
	}

	show_sme_list() {
		const data = this.data || {};
		const rows = [...(data.rows || [])].sort(
			(a, b) => flt(b.percentage) - flt(a.percentage) || String(a.employee_name || "").localeCompare(String(b.employee_name || "")),
		);
		const body = rows.length
			? rows
					.map(
						(r) => `<tr>
				<td>${frappe.utils.escape_html(r.label || r.employee_name || "")}</td>
				<td>${frappe.utils.escape_html(r.division || r.region_label || "—")}</td>
				<td class="num">${this.fmt(r.grand_total)}</td>
				<td class="num">${this.fmt_score(r.earned_points)}</td>
				<td class="num">${this.fmt_pct(r.percentage)}</td>
			</tr>`,
					)
					.join("")
			: `<tr><td colspan="5" class="text-muted text-center">${__("No SMEs found")}</td></tr>`;

		const d = new frappe.ui.Dialog({
			title: __("SMEs in Report"),
			size: "large",
			fields: [{ fieldtype: "HTML", fieldname: "html" }],
			primary_action_label: __("Close"),
			primary_action: () => d.hide(),
		});
		d.fields_dict.html.$wrapper.html(`
			<p class="text-muted" style="font-size:12px;margin-bottom:10px;">
				${__("Visit Date")}: ${frappe.utils.escape_html(frappe.datetime.str_to_user(data.from_date || ""))}
				– ${frappe.utils.escape_html(frappe.datetime.str_to_user(data.to_date || ""))}
				&nbsp;·&nbsp; ${__("Total")}: <strong>${rows.length}</strong>
			</p>
			<div class="table-responsive" style="max-height:420px;overflow:auto;">
				<table class="table table-bordered table-hover" style="font-size:12px;margin:0;">
					<thead>
						<tr>
							<th>${__("Name")}</th>
							<th>${__("Type / Division")}</th>
							<th class="text-right">${__("Grand Total")}</th>
							<th class="text-right">${__("Earned Points")}</th>
							<th class="text-right">${__("Percentage")}</th>
						</tr>
					</thead>
					<tbody>${body}</tbody>
				</table>
			</div>
		`);
		d.show();
	}

	show_expense_detail(staff) {
		const filters = this.get_filters();
		if (!filters.from_date || !filters.to_date) {
			frappe.msgprint(__("Please select Visit From Date and Visit To Date."));
			return;
		}
		if (staff) {
			filters.staff = staff;
			const isEmpId = ((this.data && this.data.rows) || []).some((r) => r.employee === staff);
			filters.employee = isEmpId ? staff : "";
		}
		const d = new frappe.ui.Dialog({
			title: staff ? __("Expenses — {0}", [staff]) : __("Expenses"),
			size: "extra-large",
			fields: [{ fieldtype: "HTML", fieldname: "html" }],
			primary_action_label: __("Close"),
			primary_action: () => d.hide(),
		});
		d.fields_dict.html.$wrapper.html(
			`<div class="text-muted" style="padding:20px;text-align:center">${__("Loading…")}</div>`,
		);
		d.show();

		frappe.call({
			method:
				"tif_customization.tif_customization.page.sme_summary_report_copy.sme_summary_report_copy.get_expense_drilldown",
			args: { filters },
			callback: (r) => {
				const payload = r.message || {};
				const rows = payload.rows || [];
				const colCount = 10;
				const fmtKm = (v) => (v == null || v === "" ? "—" : `${this.fmt_plain(v, 1)} km`);
				const fmtRate = (v) =>
					v == null || v === ""
						? "—"
						: frappe.format(v, { fieldtype: "Currency" }) + __("/km");
				const refLinks = (row) => {
					const names = (row.names && row.names.length ? row.names : row.name ? [row.name] : []).filter(
						Boolean,
					);
					if (!names.length) return "—";
					return names
						.map((n, i) => {
							const href =
								i === 0 && row.url
									? row.url
									: String(row.source || "").indexOf("Expense Claim") >= 0
										? `/app/expense-claim/${encodeURIComponent(n)}`
										: `/app/field-visit/${encodeURIComponent(n)}`;
							return `<a href="${frappe.utils.escape_html(href)}">${frappe.utils.escape_html(n)}</a>`;
						})
						.join(", ");
				};
				const body = rows.length
					? rows
							.map(
								(row) => `<tr>
						<td>${frappe.utils.escape_html(row.source || "")}</td>
						<td>${refLinks(row)}</td>
						<td>${frappe.utils.escape_html(row.posting_date || "")}</td>
						<td>${frappe.utils.escape_html(row.employee_name || "")}</td>
						<td class="text-right">${fmtKm(row.km_on_docs)}</td>
						<td class="text-right">${fmtKm(row.km)}</td>
						<td>${frappe.utils.escape_html(row.km_source || "—")}</td>
						<td class="text-right">${fmtRate(row.rate)}</td>
						<td class="text-right">${frappe.format(row.amount || 0, { fieldtype: "Currency" })}</td>
						<td>${frappe.utils.escape_html(row.computation || row.status || "")}</td>
					</tr>`,
							)
							.join("")
					: `<tr><td colspan="${colCount}" class="text-muted text-center">${__("No recorded travel cost or expense claims in this period.")}</td></tr>`;

				d.fields_dict.html.$wrapper.html(`
					<div class="sme-sum-break" style="margin-bottom:10px;">
						<strong>${__("How this amount is computed")}</strong>
						<ul style="margin:6px 0 0;padding-left:18px;">
							<li>${__(
								"If Distance (KM) is entered on the Field Visit (Own Vehicle / Bike or Company Vehicle), amount = KM × Per Km for Fuel."
							)}</li>
							<li>${__(
								"If KM and Travel Cost are blank, that visit is not included in Expenses. Nothing is estimated."
							)}</li>
							<li>${__("Submitted Expense Claims in the same period are included at claimed amount.")}</li>
						</ul>
					</div>
					<div class="mb-2">
						${__("Lines")}: <strong>${payload.count || 0}</strong>
						&nbsp;·&nbsp;
						${__("Amount")}: <strong>${frappe.format(payload.total || 0, { fieldtype: "Currency" })}</strong>
					</div>
					<div class="table-responsive" style="max-height:420px;overflow:auto;">
						<table class="table table-bordered table-hover" style="font-size:12px;margin:0;">
							<thead>
								<tr>
									<th>${__("Source")}</th>
									<th>${__("Reference")}</th>
									<th>${__("Date")}</th>
									<th>${__("Employee")}</th>
									<th class="text-right">${__("KM on document")}</th>
									<th class="text-right">${__("KM used")}</th>
									<th>${__("KM source")}</th>
									<th class="text-right">${__("Rate")}</th>
									<th class="text-right">${__("Amount")}</th>
									<th>${__("How computed")}</th>
								</tr>
							</thead>
							<tbody>${body}</tbody>
						</table>
					</div>
				`);
			},
			error: () => {
				d.fields_dict.html.$wrapper.html(
					`<p class="text-danger text-center">${__("Failed to load expenses.")}</p>`,
				);
			},
		});
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
			...this.activity_table_columns(this.data).map((c) => c.label),
			...this.outcome_subcolumns(this.data).map((c) => c.header || c.shortHeader),
			"Expenses",
			"Visited Days",
			"Total Points",
			"Total Earned Points",
			"Percentage",
		];
		const lines = [headers.join(",")];
		const csvRows = [...(this.data.rows || [])].sort(
			(a, b) => flt(b.percentage) - flt(a.percentage) || String(a.employee_name || "").localeCompare(String(b.employee_name || "")),
		);
		csvRows.forEach((r) => {
			lines.push(
				[
					`"${(r.label || "").replace(/"/g, '""')}"`,
					`"${(r.division || r.region_label || "").replace(/"/g, '""')}"`,
					...this.activity_table_columns(this.data).map((c) =>
						c.value ? c.value(r) : r[c.key] || 0
					),
					...this.outcome_subcolumns(this.data).map((c) => r[c.key] || 0),
					r.expenses || 0,
					r.visited_days || 0,
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
		a.download = `sme-summary-copy-${this.data.from_date}-${this.data.to_date}.csv`;
		a.click();
		URL.revokeObjectURL(url);
	}
};

function flt(v) {
	const n = parseFloat(v);
	return isNaN(n) ? 0 : n;
}

function cint(v) {
	const n = parseInt(v, 10);
	return isNaN(n) ? 0 : n;
}
