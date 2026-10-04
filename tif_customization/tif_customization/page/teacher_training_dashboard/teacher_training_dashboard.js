frappe.pages["teacher-training-dashboard"].on_page_load = function (wrapper) {
	frappe.tif_customization = frappe.tif_customization || {};
	new frappe.tif_customization.TeacherTrainingDashboard(wrapper);
};

frappe.tif_customization = frappe.tif_customization || {};

frappe.tif_customization.TeacherTrainingDashboard = class TeacherTrainingDashboard {
	constructor(wrapper) {
		this.page = frappe.ui.make_app_page({
			parent: wrapper,
			title: __("Teacher Training Dashboard"),
			single_column: true,
		});
		this.data = null;
		this.drill = null;
		this.filters = {};
		this.make();
	}

	make() {
		this.make_layout();
		this.make_filters();
		this.page.set_primary_action(__("Refresh"), () => this.load(), "refresh");
		this.page.add_action_item(__("Open Training Schedule"), () => {
			window.open("/training-schedule", "_blank");
		});
		this.page.add_action_item(__("Upcoming Training List"), () => {
			frappe.set_route("List", "Upcoming Training");
		});
		this.bind();
		this.load();
	}

	fy_start() {
		const d = frappe.datetime.str_to_obj(frappe.datetime.get_today());
		const y = d.getMonth() + 1 >= 7 ? d.getFullYear() : d.getFullYear() - 1;
		return `${y}-07-01`;
	}

	make_layout() {
		$(this.page.body).html(`
			<div class="ttd-root">
				<style>
					.ttd-root{padding:4px 12px 32px;color:#0f172a}
					.ttd-note{font-size:12px;color:#64748b;margin:0 0 12px;line-height:1.45}
					.ttd-filters{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin-bottom:12px;align-items:end}
					.ttd-filters .frappe-control{margin-bottom:0}
					.ttd-actions{display:flex;gap:8px;align-items:end;flex-wrap:wrap}
					.ttd-kpis{display:grid;grid-template-columns:repeat(auto-fill,minmax(132px,1fr));gap:10px;margin:0 0 16px}
					.ttd-kpi{background:#fff;border:1px solid #e5e7eb;border-top:4px solid #0f766e;border-radius:10px;padding:12px 14px;cursor:pointer;transition:box-shadow .15s,transform .15s}
					.ttd-kpi:hover{box-shadow:0 6px 18px rgba(15,23,42,.08);transform:translateY(-1px)}
					.ttd-kpi.active{outline:2px solid #0f766e;outline-offset:1px}
					.ttd-kpi--prog{border-top-color:#2563eb;background:#eff6ff}
					.ttd-kpi--school{border-top-color:#d97706;background:#fffbeb}
					.ttd-kpi--part{border-top-color:#059669;background:#ecfdf5}
					.ttd-kpi--fb{border-top-color:#7c3aed;background:#f5f3ff}
					.ttd-kpi .lbl{font-size:11px;font-weight:700;color:#64748b}
					.ttd-kpi .val{font-size:24px;font-weight:750;margin-top:4px;font-variant-numeric:tabular-nums}
					.ttd-kpi .hint{font-size:10px;color:#94a3b8;margin-top:4px}
					.ttd-sec{margin:0 0 16px}
					.ttd-sec-h{display:flex;justify-content:space-between;align-items:baseline;margin:0 0 10px}
					.ttd-sec-h h2{margin:0;font-size:15px;font-weight:750}
					.ttd-sec-h small{color:#94a3b8;font-size:12px}
					.ttd-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px}
					.ttd-card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:14px;cursor:pointer;transition:box-shadow .15s,border-color .15s}
					.ttd-card:hover{box-shadow:0 8px 22px rgba(15,23,42,.08);border-color:#cbd5e1}
					.ttd-card.active{border-color:#0f766e;box-shadow:0 0 0 2px rgba(15,118,110,.2)}
					.ttd-card--program{border-left:4px solid #2563eb}
					.ttd-card--school{border-left:4px solid #d97706}
					.ttd-card .title{font-size:13px;font-weight:700;line-height:1.3;margin:0 0 8px;word-break:break-word}
					.ttd-card .meta{display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:11px;color:#64748b}
					.ttd-card .meta b{display:block;font-size:16px;color:#0f172a;font-variant-numeric:tabular-nums}
					.ttd-panel{background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin-top:8px}
					.ttd-panel-h{padding:12px 14px;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap}
					.ttd-panel-h h3{margin:0;font-size:14px;font-weight:750}
					.ttd-panel-h .sub{font-size:12px;color:#64748b}
					.ttd-tabs{display:flex;gap:6px;flex-wrap:wrap}
					.ttd-tabs button{border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:5px 10px;font-size:12px;font-weight:600;cursor:pointer}
					.ttd-tabs button.active{background:#0f766e;color:#fff;border-color:#0f766e}
					.ttd-panel .body{padding:0;max-height:480px;overflow:auto}
					.ttd-table{width:100%;border-collapse:collapse;font-size:12px}
					.ttd-table th,.ttd-table td{padding:8px 10px;border-bottom:1px solid #f1f5f9;text-align:left;vertical-align:top}
					.ttd-table th{background:#f8fafc;position:sticky;top:0;z-index:1;font-size:10px;text-transform:uppercase;letter-spacing:.03em;color:#475569;white-space:nowrap}
					.ttd-table .num{text-align:right;font-variant-numeric:tabular-nums}
					.ttd-pill{display:inline-block;padding:1px 7px;border-radius:999px;font-size:10px;font-weight:700}
					.ttd-pill.completed{background:#dcfce7;color:#166534}
					.ttd-pill.upcoming{background:#dbeafe;color:#1d4ed8}
					.ttd-pill.in_progress{background:#fef3c7;color:#b45309}
					.ttd-pill.yes{background:#dcfce7;color:#166534}
					.ttd-pill.no{background:#f1f5f9;color:#64748b}
					.ttd-empty{padding:22px;color:#94a3b8;font-size:13px;text-align:center}
					.ttd-muted{color:#94a3b8;font-size:11px}
				</style>
				<p class="ttd-note">${__(
					"Teacher Training from Upcoming Training schedules (Training Schedule portal). Default department is T. Training. Click KPIs or program/school cards for drill-down details — sessions, participants, and feedback."
				)}</p>
				<div class="ttd-filters no-print"></div>
				<div class="ttd-kpis"></div>
				<div class="ttd-sec">
					<div class="ttd-sec-h"><h2>${__("Programs")}</h2><small class="ttd-prog-count"></small></div>
					<div class="ttd-cards ttd-by-program"></div>
				</div>
				<div class="ttd-sec">
					<div class="ttd-sec-h"><h2>${__("Schools")}</h2><small class="ttd-school-count"></small></div>
					<div class="ttd-cards ttd-by-school"></div>
				</div>
				<div class="ttd-panel ttd-drill">
					<div class="ttd-panel-h">
						<div>
							<h3 class="ttd-drill-title">${__("Details")}</h3>
							<div class="sub ttd-drill-sub">${__("Select a KPI or card to drill down")}</div>
						</div>
						<div class="ttd-tabs">
							<button type="button" data-tab="sessions" class="active">${__("Sessions")}</button>
							<button type="button" data-tab="participants">${__("Participants")}</button>
							<button type="button" data-tab="fv">${__("Field Visit Attendees")}</button>
							<button type="button" data-tab="feedback">${__("Feedback")}</button>
						</div>
					</div>
					<div class="body ttd-drill-body"><div class="ttd-empty">${__("Loading…")}</div></div>
				</div>
			</div>
		`);
		this.$root = $(this.page.body).find(".ttd-root");
		this.activeTab = "sessions";
		this.activeKind = "sessions";
		this.activeValue = "";
	}

	make_control(df) {
		const wrap = $('<div class="ttd-field"></div>').appendTo(this.$root.find(".ttd-filters"));
		const control = frappe.ui.form.make_control({
			parent: wrap,
			df: { ...df },
			render_input: true,
		});
		control.refresh();
		if (df.default != null) control.set_value(df.default);
		return control;
	}

	make_filters() {
		const today = frappe.datetime.get_today();
		this.filters = {
			from_date: this.make_control({
				fieldtype: "Date",
				fieldname: "from_date",
				label: __("From Date"),
				default: this.fy_start(),
			}),
			to_date: this.make_control({
				fieldtype: "Date",
				fieldname: "to_date",
				label: __("To Date"),
				default: today,
			}),
			department: this.make_control({
				fieldtype: "Select",
				fieldname: "department",
				label: __("Department"),
				options: ["T. Training", "TPS", "CEE", "QPS", "TIF", "All"].join("\n"),
				default: "T. Training",
			}),
			program: this.make_control({
				fieldtype: "Select",
				fieldname: "program",
				label: __("Program"),
				options: "",
			}),
			school: this.make_control({
				fieldtype: "Select",
				fieldname: "school",
				label: __("School"),
				options: "",
			}),
			status: this.make_control({
				fieldtype: "Select",
				fieldname: "status",
				label: __("Status"),
				options: ["", "completed", "upcoming", "in_progress"].join("\n"),
			}),
			trainer: this.make_control({
				fieldtype: "Select",
				fieldname: "trainer",
				label: __("Trainer"),
				options: "",
			}),
		};
		const actions = $('<div class="ttd-actions"></div>').appendTo(this.$root.find(".ttd-filters"));
		$(`<button class="btn btn-sm btn-primary">${__("Apply")}</button>`)
			.appendTo(actions)
			.on("click", () => this.load());
		$(`<button class="btn btn-sm btn-default">${__("Reset")}</button>`)
			.appendTo(actions)
			.on("click", () => {
				this.filters.from_date.set_value(this.fy_start());
				this.filters.to_date.set_value(frappe.datetime.get_today());
				this.filters.department.set_value("T. Training");
				this.filters.program.set_value("");
				this.filters.school.set_value("");
				this.filters.status.set_value("");
				this.filters.trainer.set_value("");
				this.load();
			});
	}

	bind() {
		this.$root.on("click", ".ttd-kpi", (e) => {
			const $k = $(e.currentTarget);
			const kind = $k.attr("data-kind");
			const value = $k.attr("data-value") || "";
			this.$root.find(".ttd-kpi").removeClass("active");
			$k.addClass("active");
			this.open_drill(kind, value);
		});
		this.$root.on("click", ".ttd-card", (e) => {
			const $c = $(e.currentTarget);
			this.$root.find(".ttd-card").removeClass("active");
			$c.addClass("active");
			this.open_drill($c.attr("data-kind"), $c.attr("data-value"));
		});
		this.$root.on("click", "[data-tab]", (e) => {
			this.activeTab = $(e.currentTarget).attr("data-tab");
			this.$root.find("[data-tab]").removeClass("active");
			$(e.currentTarget).addClass("active");
			this.render_drill_body();
		});
	}

	filter_values() {
		return {
			from_date: this.filters.from_date.get_value(),
			to_date: this.filters.to_date.get_value(),
			department: this.filters.department.get_value(),
			program: this.filters.program.get_value(),
			school: this.filters.school.get_value(),
			status: this.filters.status.get_value(),
			trainer: this.filters.trainer.get_value(),
		};
	}

	load() {
		frappe.call({
			method:
				"tif_customization.tif_customization.page.teacher_training_dashboard.teacher_training_dashboard.get_dashboard_data",
			args: { filters: this.filter_values() },
			freeze: true,
			freeze_message: __("Loading teacher training…"),
			callback: (r) => {
				this.data = r.message || {};
				this.fill_option_selects();
				this.render();
				this.open_drill(this.activeKind || "sessions", this.activeValue || "", true);
			},
		});
	}

	fill_option_selects() {
		const o = (this.data && this.data.options) || {};
		const setOpts = (ctrl, list, blankLabel) => {
			const cur = ctrl.get_value();
			const opts = [""].concat(list || []);
			ctrl.df.options = opts.join("\n");
			ctrl.refresh();
			if (opts.includes(cur)) ctrl.set_value(cur);
			else ctrl.set_value("");
		};
		setOpts(this.filters.program, o.programs);
		setOpts(this.filters.school, o.schools);
		setOpts(this.filters.trainer, o.trainers);
	}

	esc(v) {
		return frappe.utils.escape_html(v == null || v === "" ? "—" : String(v));
	}

	render() {
		const d = this.data || {};
		const k = d.kpis || {};
		this.$root.find(".ttd-kpis").html(
			[
				{
					label: __("Sessions"),
					value: k.sessions,
					kind: "sessions",
					style: "",
					hint: __("{0} online · {1} onsite", [cint(k.online), cint(k.onsite)]),
				},
				{
					label: __("Completed"),
					value: k.completed,
					kind: "status",
					valueKey: "completed",
					style: "",
					hint: __("{0} upcoming · {1} in progress", [cint(k.upcoming), cint(k.in_progress)]),
				},
				{
					label: __("Upcoming"),
					value: k.upcoming,
					kind: "status",
					valueKey: "upcoming",
					style: "",
					hint: __("Future sessions"),
				},
				{
					label: __("Programs"),
					value: k.programs,
					kind: "program",
					style: "prog",
					hint: __("Named programs (excl. blank)"),
				},
				{
					label: __("Schools"),
					value: k.schools,
					kind: "school",
					style: "school",
					hint: __("{0} sessions untagged", [cint(k.schools_unspecified)]),
				},
				{
					label: __("Trainers"),
					value: k.trainers,
					kind: "trainer",
					style: "",
					hint: __("Distinct trainers"),
				},
				{
					label: __("Participants"),
					value: k.participants,
					kind: "participants",
					style: "part",
					hint: __("{0} sessions with attendance", [cint(k.with_attendance)]),
				},
				{
					label: __("Feedback"),
					value: k.feedback,
					kind: "feedback",
					style: "fb",
					hint:
						k.avg_rating != null
							? __("Avg {0} · {1} FV attendees", [k.avg_rating, cint(k.fv_participants)])
							: __("{0} FV attendees · pending forms", [cint(k.fv_participants)]),
				},
			]
				.map(
					(c) => `<div class="ttd-kpi ${c.style ? "ttd-kpi--" + c.style : ""}" data-kind="${c.kind}" data-value="${c.valueKey || ""}">
						<div class="lbl">${this.esc(c.label)}</div>
						<div class="val">${cint(c.value)}</div>
						<div class="hint">${this.esc(c.hint)}</div>
					</div>`
				)
				.join("")
		);

		this.render_cards(".ttd-by-program", d.by_program || [], "program");
		this.render_cards(".ttd-by-school", d.by_school || [], "school");
		const namedProg = (d.by_program || []).filter((r) => r.label !== "(No Program)").length;
		const taggedSchools = cint(k.schools);
		this.$root
			.find(".ttd-prog-count")
			.text(__("{0} named · {1} cards", [namedProg, (d.by_program || []).length]));
		this.$root
			.find(".ttd-school-count")
			.text(
				__("{0} tagged schools · {1} sessions without school", [
					taggedSchools,
					cint(k.schools_unspecified),
				])
			);
	}

	render_cards(sel, rows, kind) {
		if (!rows.length) {
			this.$root.find(sel).html(`<div class="ttd-empty">${__("No data")}</div>`);
			return;
		}
		const untagged = new Set(["Not tagged", "Online"]);
		this.$root.find(sel).html(
			rows
				.map((r) => {
					const isLoc = kind === "school" && untagged.has(r.label);
					const titleHint = isLoc
						? `<div class="ttd-muted" style="margin:-4px 0 8px">${__("No school tagged — showing location")}</div>`
						: kind === "school" && r.label.includes(" · ")
							? `<div class="ttd-muted" style="margin:-4px 0 8px">${__("City / area (school not tagged)")}</div>`
							: "";
					// city·area style cards also mean untagged
					const locStyle =
						kind === "school" && (isLoc || (r.label.includes(" · ") && !r.label.includes("School")))
							? ' style="opacity:.92;border-left-color:#94a3b8"'
							: "";
					return `<div class="ttd-card ttd-card--${kind}" data-kind="${kind}" data-value="${frappe.utils.escape_html(r.label)}"${locStyle}>
						<div class="title">${this.esc(r.label)}</div>
						${titleHint}
						<div class="meta">
							<div><b>${cint(r.sessions)}</b>${__("Sessions")}</div>
							<div><b>${cint(r.present || r.participants)}</b>${__("Participants")}</div>
							<div><b>${cint(r.completed)}</b>${__("Done")}</div>
							<div><b>${cint(r.upcoming)}</b>${__("Upcoming")}</div>
						</div>
					</div>`;
				})
				.join("")
		);
	}

	open_drill(kind, value, silent) {
		this.activeKind = kind || "sessions";
		this.activeValue = value || "";
		if (kind === "feedback") this.activeTab = "feedback";
		else if (kind === "participants") this.activeTab = "participants";
		else this.activeTab = "sessions";
		this.$root.find("[data-tab]").removeClass("active");
		this.$root.find(`[data-tab="${this.activeTab}"]`).addClass("active");

		const titleMap = {
			sessions: __("All Sessions"),
			program: __("Program: {0}", [value || __("All")]),
			school: __("School: {0}", [value || __("All")]),
			participants: __("Participants"),
			feedback: __("Feedback"),
			status: __("Status: {0}", [value || __("All")]),
			trainer: __("Trainer: {0}", [value || __("All")]),
		};
		this.$root.find(".ttd-drill-title").text(titleMap[kind] || __("Details"));

		frappe.call({
			method:
				"tif_customization.tif_customization.page.teacher_training_dashboard.teacher_training_dashboard.get_drilldown",
			args: {
				filters: this.filter_values(),
				kind: this.activeKind,
				value: this.activeValue,
			},
			freeze: !silent,
			freeze_message: __("Loading details…"),
			callback: (r) => {
				this.drill = r.message || {};
				const s = this.drill.summary || {};
				this.$root
					.find(".ttd-drill-sub")
					.text(
						__(
							"{0} sessions · {1} schedule participants · {2} FV attendees · {3} feedback",
							[cint(s.sessions), cint(s.participants), cint(s.fv_participants), cint(s.feedback)]
						)
					);
				this.render_drill_body();
			},
		});
	}

	render_drill_body() {
		const d = this.drill || {};
		const tab = this.activeTab;
		if (tab === "sessions") this.render_sessions(d.sessions || []);
		else if (tab === "participants") this.render_participants(d.participants || []);
		else if (tab === "fv") this.render_fv(d.fv_participants || []);
		else if (tab === "feedback") this.render_feedback(d.feedback || []);
	}

	render_sessions(rows) {
		if (!rows.length) {
			this.$root.find(".ttd-drill-body").html(`<div class="ttd-empty">${__("No sessions")}</div>`);
			return;
		}
		const body = rows
			.map(
				(r) => `<tr>
					<td>
						<a href="${frappe.utils.escape_html(r.url)}" target="_blank">${this.esc(r.name)}</a>
						<div class="ttd-muted">${this.esc(r.title)}</div>
					</td>
					<td>${this.esc(r.date)}<div class="ttd-muted">${this.esc(r.time)}</div></td>
					<td>${this.esc(r.program)}</td>
					<td>
						${r.school_tagged
							? this.esc(r.school)
							: `<span class="ttd-muted">${this.esc(r.school || r.location || "Not tagged")}</span>`}
						${r.city && r.school_tagged ? `<div class="ttd-muted">${this.esc(r.city)}${r.area ? " · " + this.esc(r.area) : ""}</div>` : ""}
						${!r.school_tagged && r.area && !(r.school || "").includes(r.area) ? `<div class="ttd-muted">${this.esc(r.area)}</div>` : ""}
					</td>
					<td>${this.esc(r.trainer)}</td>
					<td>${this.esc(r.mode)}</td>
					<td><span class="ttd-pill ${r.status}">${this.esc(r.status)}</span></td>
					<td class="num">${cint(r.present)}${r.total ? " / " + cint(r.total) : ""}</td>
				</tr>`
			)
			.join("");
		this.$root.find(".ttd-drill-body").html(`
			<table class="ttd-table">
				<thead><tr>
					<th>${__("Session")}</th><th>${__("Date")}</th><th>${__("Program")}</th>
					<th>${__("School")}</th><th>${__("Trainer")}</th><th>${__("Mode")}</th>
					<th>${__("Status")}</th><th class="num">${__("Present")}</th>
				</tr></thead>
				<tbody>${body}</tbody>
			</table>
		`);
	}

	render_participants(rows) {
		if (!rows.length) {
			this.$root
				.find(".ttd-drill-body")
				.html(`<div class="ttd-empty">${__("No schedule participants (upload Zoom attendance on the session)")}</div>`);
			return;
		}
		const body = rows
			.map(
				(r) => `<tr>
					<td>
						<div style="font-weight:650">${this.esc(r.name)}</div>
						<div class="ttd-muted">${this.esc(r.email)}${r.phone ? " · " + this.esc(r.phone) : ""}</div>
					</td>
					<td>${this.esc(r.date)}</td>
					<td><a href="${frappe.utils.escape_html(r.url)}" target="_blank">${this.esc(r.session)}</a></td>
					<td>${this.esc(r.program)}</td>
					<td>${this.esc(r.school)}</td>
					<td>${this.esc(r.trainer)}</td>
					<td>${this.esc(r.status)}</td>
					<td class="num">${cint(r.duration)}</td>
				</tr>`
			)
			.join("");
		this.$root.find(".ttd-drill-body").html(`
			<table class="ttd-table">
				<thead><tr>
					<th>${__("Participant")}</th><th>${__("Date")}</th><th>${__("Session")}</th>
					<th>${__("Program")}</th><th>${__("School")}</th><th>${__("Trainer")}</th>
					<th>${__("Status")}</th><th class="num">${__("Mins")}</th>
				</tr></thead>
				<tbody>${body}</tbody>
			</table>
		`);
	}

	render_fv(rows) {
		if (!rows.length) {
			this.$root
				.find(".ttd-drill-body")
				.html(`<div class="ttd-empty">${__("No Field Visit training attendees in this period")}</div>`);
			return;
		}
		const body = rows
			.map(
				(r) => `<tr>
					<td>
						<div style="font-weight:650">${this.esc(r.name)}</div>
						<div class="ttd-muted">${this.esc(r.contact)}${r.email ? " · " + this.esc(r.email) : ""}</div>
					</td>
					<td>${this.esc(r.school)}</td>
					<td>${this.esc(r.designation)}</td>
					<td>${this.esc(r.date)}</td>
					<td>${this.esc(r.trainer)}</td>
					<td>${this.esc(r.venue)}</td>
					<td><span class="ttd-pill ${r.feedback_submitted ? "yes" : "no"}">${
						r.feedback_submitted ? __("Yes") : __("No")
					}</span></td>
					<td><a href="${frappe.utils.escape_html(r.url)}" target="_blank">${this.esc(r.visit)}</a></td>
				</tr>`
			)
			.join("");
		this.$root.find(".ttd-drill-body").html(`
			<table class="ttd-table">
				<thead><tr>
					<th>${__("Attendee")}</th><th>${__("School")}</th><th>${__("Designation")}</th>
					<th>${__("Date")}</th><th>${__("Trainer")}</th><th>${__("Venue")}</th>
					<th>${__("Feedback")}</th><th>${__("Visit")}</th>
				</tr></thead>
				<tbody>${body}</tbody>
			</table>
		`);
	}

	render_feedback(rows) {
		if (!rows.length) {
			this.$root
				.find(".ttd-drill-body")
				.html(`<div class="ttd-empty">${__("No feedback submitted yet")}</div>`);
			return;
		}
		const body = rows
			.map(
				(r) => `<tr>
					<td>
						<a href="${frappe.utils.escape_html(r.url)}" target="_blank">${this.esc(r.attendee)}</a>
						<div class="ttd-muted">${this.esc(r.email)}</div>
					</td>
					<td>${this.esc(r.date)}</td>
					<td>${this.esc(r.trainer)}</td>
					<td>${this.esc(r.venue)}</td>
					<td class="num"><strong>${cint(r.overall)}</strong></td>
					<td class="num">${cint(r.content)}</td>
					<td class="num">${cint(r.trainer_rating)}</td>
					<td style="max-width:200px">${this.esc(r.went_well)}</td>
					<td style="max-width:200px">${this.esc(r.improvements)}</td>
				</tr>`
			)
			.join("");
		this.$root.find(".ttd-drill-body").html(`
			<table class="ttd-table">
				<thead><tr>
					<th>${__("Attendee")}</th><th>${__("Date")}</th><th>${__("Trainer")}</th>
					<th>${__("Venue")}</th><th class="num">${__("Overall")}</th>
					<th class="num">${__("Content")}</th><th class="num">${__("Trainer")}</th>
					<th>${__("Went well")}</th><th>${__("Improvements")}</th>
				</tr></thead>
				<tbody>${body}</tbody>
			</table>
		`);
	}
};
