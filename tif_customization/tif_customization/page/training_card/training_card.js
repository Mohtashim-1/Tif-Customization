frappe.pages["training-card"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Courses & lessons"),
		single_column: true,
	});
	frappe.tif_customization = frappe.tif_customization || {};
	new frappe.tif_customization.TrainingCardStudio(page).make();
};

frappe.tif_customization = frappe.tif_customization || {};

frappe.tif_customization.TrainingCardStudio = class TrainingCardStudio {
	constructor(page) {
		this.page = page;
		frappe.tif_customization._training_card = this;
		this.kind = "course";
		this.search = "";
		this.statusFilter = "All";
		this.editingId = "";
		this.saving = false;
		this.courses = [];
		this.sessions = [];
		this.lessons = [];
		this.trainers = [];
		this.options = { modes: ["In-person", "Online", "Onsite"], types: ["Training", "Workshop"] };
		this.palette = ["#4f46e5", "#334155", "#0d9488", "#16a34a", "#ea580c", "#e11d48", "#9333ea"];
		this.lms = "tif_customization.tif_customization.api.training_lms";
		this.sched = "tif_customization.tif_customization.api.training_schedule";
	}

	make() {
		$(this.page.wrapper).addClass("page-training-card");
		this.page.clear_primary_action();
		$(this.page.wrapper).find(".page-head").hide();
		this.render();
		this.bind();
		this.reset_forms();
		this.load();
	}

	render() {
		$(this.page.body).html(`
			<div class="tc-studio">
				<p class="tc-crumb">Learning / <span>Courses &amp; lessons</span></p>
				<div class="tc-head">
					<div>
						<h3 class="tc-title">Courses &amp; lessons</h3>
						<p class="tc-sub">Shown in the weekly planner and in the LMS. View only — nothing is saved from this page.</p>
					</div>
					<button type="button" class="tc-refresh">↻ Refresh</button>
				</div>
				<div class="tc-kpis">
					<button type="button" class="tc-kpi on" data-kind="course">
						<div class="tc-kpi-top"><span class="tc-kpi-label">Courses</span><span class="tc-kpi-badge">Catalogue</span></div>
						<strong data-count="course">0</strong>
						<div class="tc-kpi-hint">Topics offered (Storytelling, Mindset…)</div>
					</button>
					<button type="button" class="tc-kpi" data-kind="session">
						<div class="tc-kpi-top"><span class="tc-kpi-label">Sessions</span><span class="tc-kpi-badge">Planner</span></div>
						<strong data-count="session">0</strong>
						<div class="tc-kpi-hint">Scheduled cards on the weekly planner</div>
					</button>
					<button type="button" class="tc-kpi" data-kind="lesson">
						<div class="tc-kpi-top"><span class="tc-kpi-label">Lessons</span><span class="tc-kpi-badge">LMS</span></div>
						<strong data-count="lesson">0</strong>
						<div class="tc-kpi-hint">Learning material inside a course</div>
					</button>
				</div>
				<div class="tc-err" hidden></div>
				<p class="tc-muted tc-loading" hidden>Loading cards…</p>
				<div class="tc-layout">
					<div class="tc-list">
						<div class="tc-list-head">
							<div>
								<h4 class="tc-list-title">All courses</h4>
								<p class="tc-list-count">0 of 0 courses</p>
							</div>
						</div>
						<div class="tc-list-tools">
							<div class="tc-search-wrap">
								<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3-3"/></svg>
								<input type="search" class="tc-search" placeholder="Search courses…">
							</div>
							<div class="tc-pills"></div>
						</div>
						<div class="tc-cols">
							<span>Course</span><span>Trainer</span><span>Status</span>
						</div>
						<div class="tc-empty" hidden>No records to show.</div>
						<div class="tc-rows"></div>
					</div>
					<aside class="tc-form-col">
						<div class="tc-form-head">
							<div>
								<h4 class="tc-form-title">Course detail</h4>
								<p>Session counts, participants, and reporting</p>
							</div>
						</div>
						<div class="tc-preview">
							<div class="tc-preview-bar"></div>
							<div class="tc-preview-body">
								<span class="tc-ava tc-preview-ava">T</span>
								<div class="tc-preview-copy">
									<div class="tc-preview-tag">Training</div>
									<strong class="tc-preview-title">Course title</strong>
									<span class="tc-preview-text">Trainer · Duration not set</span>
								</div>
								<span class="tc-status preview-status"><i></i> Active</span>
							</div>
						</div>
						<div class="tc-course-report">
							<div class="tc-mini-kpis">
								<div><span>Sessions performed</span><strong data-stat="sessions">0</strong></div>
								<div><span>Participants</span><strong data-stat="participants">0</strong></div>
								<div><span>Completed</span><strong data-stat="completed">0</strong></div>
							</div>
							<div class="tc-report-links">
								<button type="button" class="tc-btn ghost tc-open-report">Open full report</button>
								<button type="button" class="tc-btn ghost tc-open-planner">Weekly planner</button>
							</div>
							<div class="tc-sess-head">Session-wise detail</div>
							<div class="tc-sess-empty">No sessions yet for this course.</div>
							<div class="tc-sess-rows"></div>
						</div>
						<form class="tc-form tc-readonly" data-panel="course">
							<label>Course name<input name="name" readonly></label>
							<label>Code<input name="code" readonly></label>
							<label>Category<input name="category" readonly></label>
							<label>Trainer<input name="trainer" readonly></label>
							<label>Duration<input name="duration" readonly></label>
							<label>Status<input name="status" readonly></label>
							<label class="full">Description<textarea name="description" rows="3" readonly></textarea></label>
							<input type="hidden" name="color" value="#4f46e5">
							<input type="hidden" name="id" value="">
						</form>
						<form class="tc-form tc-readonly" data-panel="session" hidden>
							<label class="full">Course<input name="training_type" readonly></label>
							<label>Type<input name="type" readonly></label>
							<label>Date<input name="training_date" readonly></label>
							<label>Start<input name="training_time" readonly></label>
							<label>End<input name="training_end_time" readonly></label>
							<label>Trainer<input name="trainer_name" readonly></label>
							<label>Mode<input name="mode_of_training" readonly></label>
							<label class="full">Venue / school<input name="school_name" readonly></label>
							<input type="hidden" name="name" value="">
							<input type="hidden" name="program" value="">
						</form>
						<form class="tc-form tc-readonly" data-panel="lesson" hidden>
							<label class="full">Course<input name="course" readonly></label>
							<label class="full">Lesson title<input name="title" readonly></label>
							<label>Module<input name="module" readonly></label>
							<label>Minutes<input name="duration" readonly></label>
							<label>Order<input name="order" readonly></label>
							<label class="full">Summary<textarea name="summary" rows="2" readonly></textarea></label>
							<label class="full">Lesson body<textarea name="content" rows="5" readonly></textarea></label>
							<input type="hidden" name="id" value="">
							<input type="hidden" name="published" value="1">
						</form>
						<div class="tc-actions">
							<button type="button" class="tc-btn primary tc-open-doc" hidden>View details</button>
						</div>
					</aside>
				</div>
			</div>
		`);
		this.$ = $(this.page.body).find(".tc-studio");
		this.render_pills();
	}

	bind() {
		const $root = this.$;
		$root.on("click", ".tc-kpi", (e) => {
			const kind = $(e.currentTarget).data("kind");
			if (kind) this.set_kind(kind);
		});
		$root.on("click", ".tc-refresh", () => this.load());
		$root.on("input", ".tc-search", (e) => {
			this.search = e.target.value || "";
			this.render_list();
		});
		$root.on("click", ".tc-pills button", (e) => {
			this.statusFilter = $(e.currentTarget).data("filter");
			this.render_pills();
			this.render_list();
			const still = this.filtered().some((i) => String(i.id || i.name) === String(this.editingId));
			if (!still) this.select_first();
		});
		$root.on("click", ".tc-row", (e) => {
			const id = $(e.currentTarget).data("id");
			this.pick(String(id));
		});
		$root.on("click", ".tc-open-report", () => this.open_report());
		$root.on("click", ".tc-open-planner", () => {
			window.location.href = "/training-schedule";
		});
		$root.on("click", ".tc-sess-row", (e) => {
			const name = $(e.currentTarget).data("name");
			if (name) this.open_session(name);
		});
		$root.on("click", ".tc-open-doc", (e) => {
			e.preventDefault();
			const name = this.form("session").find("[name=name]").val();
			if (name) this.open_session(name);
		});
	}

	form(kind) {
		return this.$.find(`[data-panel="${kind || this.kind}"]`);
	}

	kind_label() {
		return { course: "course", session: "session", lesson: "lesson" }[this.kind];
	}

	select_first() {
		const items = this.filtered();
		if (!items.length) {
			this.reset_forms();
			return;
		}
		this.pick(String(items[0].id || items[0].name));
	}

	set_kind(kind) {
		this.kind = kind;
		this.search = "";
		this.statusFilter = "All";
		this.$.find(".tc-search").val("");
		this.$.find(".tc-kpi").removeClass("on").filter(`[data-kind="${kind}"]`).addClass("on");
		this.$.find(".tc-form").prop("hidden", true);
		this.form(kind).prop("hidden", false);
		this.$.find(".tc-search").attr("placeholder", `Search ${this.kind_label()}s…`);
		this.$.find(".tc-list-title").text(`All ${this.kind_label()}s`);
		this.$.find(".tc-course-report").prop("hidden", kind !== "course");
		this.$.find(".tc-open-doc").prop("hidden", kind !== "session");
		this.render_pills();
		this.render_list();
		this.select_first();
	}

	render_pills() {
		let filters = ["All", "Active", "Draft"];
		if (this.kind === "session") filters = ["All", "Upcoming", "Completed"];
		if (this.kind === "lesson") filters = ["All", "Published", "Draft"];
		if (!filters.includes(this.statusFilter)) this.statusFilter = "All";
		this.$.find(".tc-pills").html(
			filters
				.map(
					(f) =>
						`<button type="button" data-filter="${f}" class="${f === this.statusFilter ? "on" : ""}">${f}</button>`
				)
				.join("")
		);
	}

	blank_session_date() {
		return frappe.datetime.get_today();
	}

	ui_status(raw) {
		const s = String(raw || "Active");
		if (["Inactive", "Draft", "0"].includes(s)) return "Draft";
		return "Active";
	}

	reset_forms() {
		this.editingId = "";
		const $c = this.form("course")[0];
		if ($c) $c.reset();
		this.form("course").find("[name=id]").val("");
		this.form("course").find("[name=color]").val(this.palette[0]);
		this.form("course").find("[name=category]").val("Training");
		this.form("course").find("[name=status]").val("Active");
		this.mark_swatch(this.palette[0]);

		const $s = this.form("session")[0];
		if ($s) $s.reset();
		this.form("session").find("[name=name]").val("");
		this.form("session").find("[name=program]").val("");
		this.form("session").find("[name=training_date]").val(this.blank_session_date());
		this.form("session").find("[name=training_time]").val("10:00");
		this.form("session").find("[name=training_end_time]").val("12:00");
		this.form("session").find("[name=type]").val(this.options.types[0] || "Training");
		this.form("session").find("[name=mode_of_training]").val(this.options.modes[0] || "In-person");

		const $l = this.form("lesson")[0];
		if ($l) $l.reset();
		this.form("lesson").find("[name=id]").val("");
		this.form("lesson").find("[name=module]").val("Lessons");
		this.form("lesson").find("[name=duration]").val(20);
		this.form("lesson").find("[name=order]").val(0);
		this.form("lesson").find("[name=published]").prop("checked", true);

		this.$.find(".tc-open-doc").prop("hidden", true);
		this.$.find(".tc-form-title").text(`${this.kind_label().replace(/^./, (c) => c.toUpperCase())} detail`);
		this.$.find(".tc-row").removeClass("on");
		this.update_preview();
		this.render_course_report();
	}

	mark_swatch(color) {
		this.$.find(".tc-swatch").removeClass("on");
		this.$.find(`.tc-swatch[data-color="${color}"]`).addClass("on");
	}

	esc(v) {
		return frappe.utils.escape_html(v == null ? "" : String(v));
	}

	initials(name) {
		const parts = String(name || "?")
			.replace(/[^A-Za-z0-9\s]/g, " ")
			.split(/\s+/)
			.filter(Boolean);
		if (!parts.length) return "?";
		if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
		return (parts[0][0] + parts[1][0]).toUpperCase();
	}

	suggest_code(name) {
		const words = String(name || "")
			.replace(/[^A-Za-z0-9]+/g, " ")
			.trim()
			.split(/\s+/)
			.filter(Boolean);
		if (!words.length) return "";
		if (words.length === 1) return words[0].slice(0, 6).toUpperCase();
		return words
			.map((w) => w.slice(0, 2))
			.join("")
			.slice(0, 8)
			.toUpperCase();
	}

	filtered() {
		const q = (this.search || "").trim().toLowerCase();
		const f = this.statusFilter;
		if (this.kind === "course") {
			return this.courses.filter((c) => {
				const status = this.ui_status(c.status);
				if (f === "Active" && status !== "Active") return false;
				if (f === "Draft" && status !== "Draft") return false;
				return !q || `${c.name} ${c.trainer || ""} ${c.category || ""} ${c.code || ""}`.toLowerCase().includes(q);
			});
		}
		if (this.kind === "session") {
			return this.sessions.filter((s) => {
				const st = String(s.status || "").toLowerCase();
				if (f === "Upcoming" && !["upcoming", "in_progress"].includes(st)) return false;
				if (f === "Completed" && st !== "completed") return false;
				return (
					!q ||
					`${s.title || ""} ${s.trainerName || ""} ${s.program || ""} ${s.room || ""}`.toLowerCase().includes(q)
				);
			});
		}
		return this.lessons.filter((l) => {
			if (f === "Published" && !l.published) return false;
			if (f === "Draft" && l.published) return false;
			return !q || `${l.title || ""} ${l.courseName || ""} ${l.module || ""}`.toLowerCase().includes(q);
		});
	}

	render_counts() {
		this.$.find("[data-count=course]").text(this.courses.length);
		this.$.find("[data-count=session]").text(this.sessions.length);
		this.$.find("[data-count=lesson]").text(this.lessons.length);
	}

	render_list() {
		const items = this.filtered();
		const total = this.kind === "course" ? this.courses.length : this.kind === "session" ? this.sessions.length : this.lessons.length;
		this.$.find(".tc-list-count").text(`${items.length} of ${total} ${this.kind_label()}s`);
		this.$.find(".tc-empty").prop("hidden", !!items.length);
		if (!items.length) {
			this.$.find(".tc-empty").text(`No ${this.kind_label()}s to show.`);
		}
		if (this.kind === "course") {
			this.$.find(".tc-cols").html("<span>Course</span><span>Sessions</span><span>Participants</span>");
		} else if (this.kind === "session") {
			this.$.find(".tc-cols").html("<span>Session</span><span>Participants</span><span>Status</span>");
		} else {
			this.$.find(".tc-cols").html("<span>Lesson</span><span>Course</span><span>Status</span>");
		}
		const html = items
			.map((item) => {
				const id = item.id || item.name;
				const on = this.editingId && String(this.editingId) === String(id) ? " on" : "";
				if (this.kind === "course") {
					const title = item.name || "";
					const color = item.color || this.palette[0];
					const code = item.code || this.suggest_code(title);
					const stats = this.course_stats(item);
					return `<button type="button" class="tc-row${on}" data-id="${this.esc(id)}">
						<span class="tc-row-main">
							<span class="tc-ava" style="background:${color}">${this.esc(this.initials(title))}</span>
							<span>
								<span class="tc-row-title">${this.esc(title)}</span>
								<span class="tc-row-meta">${this.esc(code)} · ${this.esc(item.trainer || "Unassigned")}</span>
							</span>
						</span>
						<span class="tc-row-trainer">${stats.sessions}</span>
						<span class="tc-status"><i></i> ${stats.participants}</span>
					</button>`;
				}
				if (this.kind === "session") {
					const title = item.title || item.program || item.name;
					const color = item.trainerColor || this.palette[0];
					const done = String(item.status || "").toLowerCase() === "completed";
					const people = this.cint(item.attendance_present) || this.cint(item.attendance_total);
					return `<button type="button" class="tc-row${on}" data-id="${this.esc(id)}">
						<span class="tc-row-main">
							<span class="tc-ava" style="background:${color}">${this.esc(this.initials(title))}</span>
							<span>
								<span class="tc-row-title">${this.esc(title)}</span>
								<span class="tc-row-meta">${this.esc(item.date || "")} · ${this.esc(item.start_time || "")} · ${this.esc(item.trainerName || "Unassigned")}</span>
							</span>
						</span>
						<span class="tc-row-trainer">${people}</span>
						<span class="tc-status${done ? " draft" : ""}"><i></i> ${this.esc(item.status || "upcoming")}</span>
					</button>`;
				}
				const title = item.title || "";
				const published = !!item.published;
				return `<button type="button" class="tc-row${on}" data-id="${this.esc(id)}">
					<span class="tc-row-main">
						<span class="tc-ava" style="background:#0ea5e9">${this.esc(this.initials(title))}</span>
						<span>
							<span class="tc-row-title">${this.esc(title)}</span>
							<span class="tc-row-meta">${this.esc(item.module || "Lesson")} · ${item.duration || 0} min</span>
						</span>
					</span>
					<span class="tc-row-trainer">${this.esc(item.courseName || "Course")}</span>
					<span class="tc-status${published ? "" : " draft"}"><i></i> ${published ? "Published" : "Draft"}</span>
				</button>`;
			})
			.join("");
		this.$.find(".tc-rows").html(html);
	}

	fill_selects() {}

	preview_data() {
		if (this.kind === "course") {
			const f = this.vals("course");
			const status = this.ui_status(f.status);
			return {
				title: f.name || "Course title",
				meta: [f.trainer || "Unassigned", f.duration || "Duration not set"].join(" · "),
				color: f.color || this.palette[0],
				tag: f.category || "Training",
				status,
				initials: this.initials(f.name || "C"),
			};
		}
		if (this.kind === "session") {
			const f = this.vals("session");
			const course = this.courses.find((c) => c.name === f.training_type || c.id === f.training_type);
			const title = (course && course.name) || f.training_type || f.program || "Session title";
			return {
				title,
				meta: [f.trainer_name || "Unassigned", `${f.training_time || ""} – ${f.training_end_time || ""}`, f.school_name]
					.filter(Boolean)
					.join(" · "),
				color: (course && course.color) || this.palette[0],
				tag: f.training_date || "Session",
				status: "Active",
				initials: this.initials(title),
			};
		}
		const f = this.vals("lesson");
		const course = this.courses.find((c) => c.id === f.course || c.name === f.course);
		const title = f.title || "Lesson title";
		return {
			title,
			meta: [(course && course.name) || "Course", `${f.duration || 0} min`].join(" · "),
			color: (course && course.color) || "#0ea5e9",
			tag: f.module || "Lesson",
			status: f.published ? "Published" : "Draft",
			initials: this.initials(title),
		};
	}

	update_preview() {
		const p = this.preview_data();
		this.$.find(".tc-preview-bar").css("background", p.color);
		this.$.find(".tc-preview-tag").text(p.tag);
		this.$.find(".tc-preview-title").text(p.title);
		this.$.find(".tc-preview-text").text(p.meta);
		this.$.find(".tc-preview-ava").text(p.initials).css("background", p.color);
		const draft = p.status === "Draft";
		this.$.find(".preview-status")
			.toggleClass("draft", draft)
			.html(`<i></i> ${this.esc(p.status)}`);
		if (this.kind === "course") this.render_course_report();
	}

	vals(kind) {
		const out = {};
		this.form(kind)
			.find("input, select, textarea")
			.each((_, el) => {
				if (!el.name) return;
				if (el.type === "checkbox") out[el.name] = el.checked ? 1 : 0;
				else out[el.name] = el.value;
			});
		return out;
	}

	pick(id) {
		this.editingId = id;
		if (this.kind === "course") {
			const c = this.courses.find((x) => String(x.id || x.name) === String(id));
			if (!c) return;
			const $f = this.form("course");
			$f.find("[name=id]").val(c.id || "");
			$f.find("[name=name]").val(c.name || "");
			$f.find("[name=code]").val(c.code || this.suggest_code(c.name));
			$f.find("[name=category]").val(c.category || "Training");
			$f.find("[name=trainer]").val(c.trainer || "");
			$f.find("[name=duration]").val(c.duration || "");
			$f.find("[name=status]").val(this.ui_status(c.status));
			$f.find("[name=description]").val(c.description || "");
			$f.find("[name=color]").val(c.color || this.palette[0]);
			this.mark_swatch(c.color || this.palette[0]);
			this.render_course_report(c);
		} else if (this.kind === "session") {
			const s = this.sessions.find((x) => String(x.id || x.name) === String(id));
			if (!s) return;
			const $f = this.form("session");
			$f.find("[name=name]").val(s.name || "");
			$f.find("[name=type]").val(s.type || "Training");
			$f.find("[name=training_date]").val(s.date || "");
			$f.find("[name=training_time]").val((s.start_time || "10:00").slice(0, 5));
			$f.find("[name=training_end_time]").val((s.end_time || "12:00").slice(0, 5));
			$f.find("[name=trainer_name]").val(s.trainerName || "");
			$f.find("[name=training_type]").val(s.title || s.program || "");
			$f.find("[name=program]").val(s.program || s.title || "");
			$f.find("[name=mode_of_training]").val(s.mode || "In-person");
			$f.find("[name=school_name]").val(s.room || s.school || "");
		} else {
			const l = this.lessons.find((x) => String(x.id) === String(id));
			if (!l) return;
			const $f = this.form("lesson");
			$f.find("[name=id]").val(l.id || "");
			$f.find("[name=title]").val(l.title || "");
			$f.find("[name=course]").val(l.courseName || l.course || "");
			$f.find("[name=module]").val(l.module || "Lessons");
			$f.find("[name=duration]").val(l.duration || 20);
			$f.find("[name=order]").val(l.order || 0);
			$f.find("[name=published]").val(l.published ? "1" : "0");
			$f.find("[name=summary]").val(l.summary || "");
			$f.find("[name=content]").val(l.content || "");
		}
		this.$.find(".tc-form-title").text(`${this.kind_label().replace(/^./, (c) => c.toUpperCase())} detail`);
		this.$.find(".tc-open-doc").prop("hidden", this.kind !== "session" || !id);
		this.render_list();
		this.update_preview();
	}

	course_option_value(name) {
		const c = this.courses.find((x) => x.name === name || x.id === name);
		return c ? c.id || c.name : name || "";
	}

	on_course_select(value, kind) {
		const c = this.courses.find((x) => x.id === value || x.name === value);
		if (!c) return;
		if (kind === "session") {
			this.form("session").find("[name=program]").val(c.name);
			if (c.trainer) this.form("session").find("[name=trainer_name]").val(c.trainer);
		}
		this.update_preview();
	}

	norm(v) {
		return String(v || "")
			.trim()
			.toLowerCase();
	}

	cint(v) {
		const n = parseInt(v, 10);
		return Number.isFinite(n) ? n : 0;
	}

	sessions_for_course(course) {
		const names = new Set(
			[course && (course.name || course.title)]
				.map((n) => this.norm(n))
				.filter(Boolean)
		);
		if (!names.size) return [];
		return this.sessions.filter(
			(s) => names.has(this.norm(s.title)) || names.has(this.norm(s.program)) || names.has(this.norm(s.categoryLabel))
		);
	}

	course_stats(course) {
		const rows = this.sessions_for_course(course);
		let present = 0;
		let total = 0;
		let completed = 0;
		rows.forEach((s) => {
			present += this.cint(s.attendance_present);
			total += this.cint(s.attendance_total);
			if (String(s.status || "").toLowerCase() === "completed") completed += 1;
		});
		return {
			sessions: rows.length,
			completed,
			upcoming: rows.length - completed,
			participants: present || total,
			present,
			total,
			rows: rows.slice().sort((a, b) => String(b.date || "").localeCompare(String(a.date || ""))),
		};
	}

	render_course_report(course) {
		const $box = this.$.find(".tc-course-report");
		if (this.kind !== "course") {
			$box.prop("hidden", true);
			return;
		}
		$box.prop("hidden", false);
		if (!course) {
			const name = this.vals("course").name;
			course = this.courses.find((c) => c.name === name) || { name };
		}
		const stats = this.course_stats(course);
		this.$.find("[data-stat=sessions]").text(stats.sessions);
		this.$.find("[data-stat=participants]").text(stats.participants);
		this.$.find("[data-stat=completed]").text(stats.completed);
		this.$.find(".tc-sess-empty").prop("hidden", !!stats.rows.length);
		const html = stats.rows
			.map((s) => {
				const present = this.cint(s.attendance_present);
				const total = this.cint(s.attendance_total);
				const people = total ? `${present}/${total}` : present || "—";
				const st = String(s.status || "upcoming").replace("_", " ");
				return `<button type="button" class="tc-sess-row" data-name="${this.esc(s.name)}">
					<span>
						<strong>${this.esc(s.date || "No date")} · ${this.esc(s.start_time || "")}</strong>
						<small>${this.esc(s.trainerName || "Unassigned")} · ${this.esc(s.room || s.school || "No venue")}</small>
					</span>
					<span class="tc-sess-people">${this.esc(people)} present</span>
					<span class="tc-sess-status">${this.esc(st)}</span>
				</button>`;
			})
			.join("");
		this.$.find(".tc-sess-rows").html(html);
	}

	open_session(name) {
		if (!name) return;
		frappe.dom.freeze(__("Loading session…"));
		this.call(`${this.sched}.get_session`, { name })
			.then((doc) => this.show_session_dialog(doc || {}))
			.catch((e) => {
				frappe.msgprint({
					title: __("Could not load session"),
					message: e.message || String(e),
					indicator: "red",
				});
			})
			.finally(() => frappe.dom.unfreeze());
	}

	show_session_dialog(d) {
		const v = (x) => this.esc(x || "—");
		const has = (x) => x !== undefined && x !== null && String(x).trim() !== "";
		const topic = d.training_type || d.workshop_topic || d.program || d.name || "Session";
		const status = d.schedule_status || "Upcoming";
		const statusKey = String(status).toLowerCase().replace(/\s+/g, "-");
		const trainer = d.trainer_name || "Unassigned";
		const present = this.cint(d.attendance_present);
		const total = this.cint(d.attendance_total);
		const rate = total ? `${Math.round((present / total) * 100)}%` : "—";
		const dateInfo = this.pretty_date(d.training_date);
		const timeRange = [d.training_time, d.training_end_time].filter(has).join(" – ");
		const duration = this.duration_label(d.training_time, d.training_end_time);
		const daysAgo = this.days_since(d.training_date);
		const showBanner = daysAgo > 0 && String(status).toLowerCase() === "upcoming" && total === 0;

		const kv = (label, value) =>
			`<div class="tc-dlg-kv"><span>${v(label)}</span><strong>${v(value)}</strong></div>`;

		const files = d.attachments || [];
		const attendance = d.attendance || [];

		const filesHtml = files.length
			? `<div class="tc-dlg-files">${files
					.map((f) => {
						const url = typeof f === "string" ? f : f.file_url || f.url || "";
						const label = typeof f === "string" ? f.split("/").pop() : f.file_name || url;
						return url
							? `<a href="${this.esc(url)}" target="_blank" rel="noopener">${v(label)}</a>`
							: `<span>${v(label)}</span>`;
					})
					.join("")}</div>`
			: `<div class="tc-dlg-drop"><strong>No files attached</strong><span>Slides, handouts, or recordings will show here</span></div>`;

		const attHtml = attendance.length
			? `<div class="tc-dlg-table-wrap"><table class="tc-dlg-table">
				<thead><tr><th>Participant</th><th>Email / phone</th><th>Status</th></tr></thead>
				<tbody>${attendance
					.map((a) => {
						const st = a.attendance_status || "Present";
						const tone = String(st).toLowerCase() === "present" ? "ok" : "muted";
						return `<tr>
							<td><strong>${v(a.participant_name)}</strong></td>
							<td>${v(a.email || a.phone)}</td>
							<td><span class="tc-dlg-badge ${tone}">${v(st)}</span></td>
						</tr>`;
					})
					.join("")}</tbody></table></div>`
			: `<div class="tc-dlg-empty">No attendance yet. Names appear after check-in or Zoom import.</div>`;

		const html = `<div class="tc-dlg">
			<div class="tc-dlg-top">
				<div class="tc-dlg-date"><span>${v(dateInfo.month)}</span><strong>${v(dateInfo.day)}</strong></div>
				<div class="tc-dlg-top-copy">
					<div class="tc-dlg-chips">
						<span class="tc-dlg-chip type">${v(d.type || "Training")}</span>
						<span class="tc-dlg-chip ${statusKey}">${v(status)}</span>
						${has(d.mode_of_training) ? `<span class="tc-dlg-chip mode">${v(d.mode_of_training)}</span>` : ""}
					</div>
					<h3>${v(topic)}</h3>
					<p>
						<span>${v(trainer)}</span>
						${has(timeRange) ? `<span class="sep">·</span><span>${v(timeRange)}</span>` : ""}
						${duration ? `<span class="sep">·</span><span>${v(duration)}</span>` : ""}
						${has(d.name) ? `<span class="sep">·</span><code>${v(d.name)}</code>` : ""}
					</p>
				</div>
				<div class="tc-dlg-top-actions">
					${has(d.zoom_link) ? `<a class="tc-dlg-btn primary" href="${this.esc(d.zoom_link)}" target="_blank" rel="noopener">Open meeting link</a>` : ""}
					<button type="button" class="tc-dlg-x" aria-label="Close">×</button>
				</div>
			</div>
			${showBanner ? `<div class="tc-dlg-banner">Scheduled date passed ${daysAgo} day${daysAgo === 1 ? "" : "s"} ago — status is still ${v(status)} and no attendance is recorded.</div>` : ""}
			<div class="tc-dlg-split">
				<div class="tc-dlg-col">
					<div class="tc-dlg-label">Schedule</div>
					<div class="tc-dlg-kvs">
						${kv("Date", dateInfo.pretty || d.training_date)}
						${kv("Time", timeRange)}
						${kv("Trainer", trainer)}
					</div>
					<div class="tc-dlg-label">Program</div>
					<div class="tc-dlg-kvs">
						${kv("Program", d.program)}
						${kv("Course / topic", d.training_type || d.workshop_topic || topic)}
						${kv("Department", d.department_training)}
						${kv("Participants", d.participants_category)}
						${kv("Type", d.type)}
						${kv("Mode", d.mode_of_training)}
					</div>
					<div class="tc-dlg-label">Venue</div>
					<div class="tc-dlg-kvs">
						${kv("School", d.school_name)}
						${kv("School type", d.school_type)}
						${kv("City", d.city || d.area)}
					</div>
				</div>
				<div class="tc-dlg-col">
					<div class="tc-dlg-label">Attendance</div>
					<div class="tc-dlg-stats">
						<div><span>Present</span><strong>${present}</strong></div>
						<div><span>Marked</span><strong>${total}</strong></div>
						<div><span>Rate</span><strong>${v(rate)}</strong></div>
					</div>
					${attHtml}
					<div class="tc-dlg-label">Attachments <em>${files.length} file${files.length === 1 ? "" : "s"}</em></div>
					${filesHtml}
				</div>
			</div>
			<div class="tc-dlg-foot"><button type="button" class="tc-dlg-close">Close</button></div>
		</div>`;

		const dialog = new frappe.ui.Dialog({
			title: topic,
			size: "extra-large",
			fields: [{ fieldtype: "HTML", fieldname: "body", label: " " }],
		});
		dialog.$wrapper.addClass("tc-session-dialog");
		dialog.fields_dict.body.$wrapper.html(html);
		dialog.$wrapper.find(".modal-header, .modal-footer").hide();
		dialog.$wrapper.on("click", ".tc-dlg-x, .tc-dlg-close", () => dialog.hide());
		dialog.show();
	}

	pretty_date(iso) {
		if (!iso) return { month: "—", day: "–", pretty: "" };
		const dt = frappe.datetime.str_to_obj(iso) || new Date(iso);
		if (!dt || isNaN(dt.getTime())) return { month: "—", day: "–", pretty: iso };
		const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
		const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
		return {
			month: months[dt.getMonth()].toUpperCase(),
			day: String(dt.getDate()),
			pretty: `${days[dt.getDay()]}, ${dt.getDate()} ${months[dt.getMonth()]} ${dt.getFullYear()}`,
		};
	}

	days_since(iso) {
		if (!iso) return 0;
		const dt = frappe.datetime.str_to_obj(iso) || new Date(iso);
		const today = frappe.datetime.str_to_obj(frappe.datetime.get_today()) || new Date();
		if (!dt || isNaN(dt.getTime())) return 0;
		const a = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime();
		const b = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
		return Math.floor((b - a) / 86400000);
	}

	duration_label(start, end) {
		const toMin = (t) => {
			const p = String(t || "").split(":");
			const h = parseInt(p[0], 10);
			const m = parseInt(p[1] || "0", 10);
			if (!Number.isFinite(h)) return null;
			return h * 60 + (Number.isFinite(m) ? m : 0);
		};
		const a = toMin(start);
		const b = toMin(end);
		if (a == null || b == null || b <= a) return "";
		const d = b - a;
		const h = Math.floor(d / 60);
		const m = d % 60;
		if (h && m) return `${h} hr ${m} min`;
		if (h) return h === 1 ? "1 hr" : `${h} hr`;
		return `${m} min`;
	}

	open_report() {
		const topic = (this.vals("course").name || "").trim();
		frappe.route_options = { topic };
		frappe.set_route("upcoming-training-report");
	}

	show_error(msg) {
		const $e = this.$.find(".tc-err");
		if (!msg) {
			$e.prop("hidden", true).text("");
			return;
		}
		$e.prop("hidden", false).text(msg);
	}

	async call(method, args) {
		const r = await frappe.call({ method, args: args || {}, freeze: false });
		return r.message;
	}

	async load() {
		this.show_error("");
		this.$.find(".tc-loading").prop("hidden", false);
		try {
			const [courseRows, lessonRows, sessionDir, formOpts] = await Promise.all([
				this.call(`${this.lms}.list_courses`).catch(() => []),
				this.call(`${this.lms}.list_lessons`).catch(() => []),
				this.call(`${this.sched}.get_directory`, {
					view: "sessions",
					from_date: "2020-01-01",
					to_date: "2028-12-31",
				}).catch(() => ({ rows: [] })),
				this.call(`${this.sched}.get_form_options`).catch(() => ({})),
			]);
			this.courses = Array.isArray(courseRows) ? courseRows : [];
			this.lessons = Array.isArray(lessonRows) ? lessonRows : [];
			this.sessions = (sessionDir && sessionDir.rows) || [];
			this.trainers = (formOpts && formOpts.trainers) || [];
			this.options = {
				modes: (formOpts && formOpts.modes) || this.options.modes,
				types: (formOpts && formOpts.types) || this.options.types,
			};
			const fromPrograms = (formOpts && (formOpts.training_types || formOpts.programs)) || [];
			fromPrograms.forEach((name) => {
				if (name && !this.courses.some((c) => c.name === name)) {
					this.courses.push({
						id: "",
						name,
						code: this.suggest_code(name),
						category: "Training",
						trainer: "",
						color: this.palette[this.courses.length % this.palette.length],
						status: "Active",
						description: "",
					});
				}
			});
			this.courses.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
			this.fill_selects();
			this.render_counts();
			this.render_list();
			this.select_first();
		} catch (e) {
			this.show_error(e.message || String(e));
		} finally {
			this.$.find(".tc-loading").prop("hidden", true);
		}
	}
};
