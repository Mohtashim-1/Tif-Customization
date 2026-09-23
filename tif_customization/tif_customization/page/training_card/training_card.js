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
		const pal = this.palette
			.map((c) => `<button type="button" class="tc-swatch" data-color="${c}" style="background:${c}"></button>`)
			.join("");
		$(this.page.body).html(`
			<div class="tc-studio">
				<p class="tc-crumb">Learning / <span>Courses &amp; lessons</span></p>
				<div class="tc-head">
					<div>
						<h3 class="tc-title">Courses &amp; lessons</h3>
						<p class="tc-sub">Shown in the weekly planner and in the LMS. Everything saves to ERP.</p>
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
							<button type="button" class="tc-btn primary tc-new">+ New course</button>
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
						<div class="tc-empty" hidden>No cards yet. Create one on the right.</div>
						<div class="tc-rows"></div>
					</div>
					<aside class="tc-form-col">
						<div class="tc-form-head">
							<div>
								<h4 class="tc-form-title">New course</h4>
								<p>Card preview updates as you type</p>
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
						<form class="tc-form" data-panel="course">
							<label>Course name<input name="name" required placeholder="Storytelling"></label>
							<label>Code<input name="code" placeholder="STORY"></label>
							<label>Category
								<select name="category">
									<option>Training</option>
									<option>Workshop</option>
									<option>Leadership</option>
									<option>Communication</option>
									<option>Technical</option>
									<option>Management</option>
									<option>Other</option>
								</select>
							</label>
							<label>Trainer<input name="trainer" list="tc-trainers" placeholder="Muhammad Ajmal"></label>
							<label>Duration<input name="duration" placeholder="e.g. 2 hours"></label>
							<label>Status
								<select name="status">
									<option>Active</option>
									<option>Draft</option>
								</select>
							</label>
							<label class="full">Description<textarea name="description" rows="3" placeholder="What this course covers"></textarea></label>
							<div class="full"><span style="display:block;font-size:12px;font-weight:600;color:#334155;margin-bottom:8px">Card color</span>
								<div class="tc-colors">${pal}</div>
							</div>
							<input type="hidden" name="color" value="#4f46e5">
							<input type="hidden" name="id" value="">
						</form>
						<form class="tc-form" data-panel="session" hidden>
							<label class="full">Course
								<select name="training_type" class="tc-course-select"><option value="">Select course</option></select>
							</label>
							<label>Type<select name="type" class="tc-type-select"></select></label>
							<label>Date<input name="training_date" type="date" required></label>
							<label>Start<input name="training_time" type="time" value="10:00"></label>
							<label>End<input name="training_end_time" type="time" value="12:00"></label>
							<label>Trainer<input name="trainer_name" list="tc-trainers"></label>
							<label>Mode<select name="mode_of_training" class="tc-mode-select"></select></label>
							<label class="full">Venue / school<input name="school_name" placeholder="Room or school"></label>
							<input type="hidden" name="name" value="">
							<input type="hidden" name="program" value="">
						</form>
						<form class="tc-form" data-panel="lesson" hidden>
							<label class="full">Course
								<select name="course" class="tc-course-select"><option value="">Select course</option></select>
							</label>
							<label class="full">Lesson title<input name="title" required placeholder="What is storytelling?"></label>
							<label>Module<input name="module" placeholder="Module 1" value="Lessons"></label>
							<label>Minutes<input name="duration" type="number" min="1" value="20"></label>
							<label>Order<input name="order" type="number" min="0" value="0"></label>
							<label class="tc-check"><input name="published" type="checkbox" checked> Published</label>
							<label class="full">Summary<textarea name="summary" rows="2"></textarea></label>
							<label class="full">Lesson body<textarea name="content" rows="5" placeholder="Students will see this in the LMS."></textarea></label>
							<input type="hidden" name="id" value="">
						</form>
						<div class="tc-actions">
							<button type="button" class="tc-btn danger tc-delete" hidden>Delete</button>
							<button type="button" class="tc-btn ghost tc-clear">Clear</button>
							<button type="button" class="tc-btn primary tc-save">Create course</button>
						</div>
					</aside>
				</div>
				<datalist id="tc-trainers"></datalist>
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
		});
		$root.on("click", ".tc-new, .tc-clear", () => this.reset_forms());
		$root.on("click", ".tc-save", () => this.save());
		$root.on("click", ".tc-delete", () => this.remove_current());
		$root.on("click", ".tc-row", (e) => {
			const id = $(e.currentTarget).data("id");
			this.pick(String(id));
		});
		$root.on("click", ".tc-swatch", (e) => {
			const color = $(e.currentTarget).data("color");
			this.form("course").find("[name=color]").val(color);
			this.mark_swatch(color);
			this.update_preview();
		});
		$root.on("input change", "[data-panel=course] input, [data-panel=course] select, [data-panel=course] textarea", () =>
			this.update_preview()
		);
		$root.on("input change", "[data-panel=session] input, [data-panel=session] select", () => this.update_preview());
		$root.on("input change", "[data-panel=lesson] input, [data-panel=lesson] select, [data-panel=lesson] textarea", () =>
			this.update_preview()
		);
		$root.on("change", "[data-panel=session] .tc-course-select", (e) => this.on_course_select(e.target.value, "session"));
		$root.on("change", "[data-panel=lesson] .tc-course-select", (e) => this.on_course_select(e.target.value, "lesson"));
	}

	form(kind) {
		return this.$.find(`[data-panel="${kind || this.kind}"]`);
	}

	kind_label() {
		return { course: "course", session: "session", lesson: "lesson" }[this.kind];
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
		this.$.find(".tc-new").text(`+ New ${this.kind_label()}`);
		this.$.find(".tc-list-title").text(`All ${this.kind_label()}s`);
		this.render_pills();
		this.reset_forms();
		this.render_list();
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

		this.$.find(".tc-delete").prop("hidden", true);
		this.$.find(".tc-save").text(`Create ${this.kind_label()}`);
		this.$.find(".tc-form-title").text(`New ${this.kind_label()}`);
		this.$.find(".tc-row").removeClass("on");
		this.update_preview();
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
			this.$.find(".tc-empty").text(`No ${this.kind_label()}s yet. Create one on the right.`);
		}
		if (this.kind === "course") {
			this.$.find(".tc-cols").html("<span>Course</span><span>Trainer</span><span>Status</span>");
		} else if (this.kind === "session") {
			this.$.find(".tc-cols").html("<span>Session</span><span>Trainer</span><span>When</span>");
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
					const status = this.ui_status(item.status);
					return `<button type="button" class="tc-row${on}" data-id="${this.esc(id)}">
						<span class="tc-row-main">
							<span class="tc-ava" style="background:${color}">${this.esc(this.initials(title))}</span>
							<span>
								<span class="tc-row-title">${this.esc(title)}</span>
								<span class="tc-row-meta">${this.esc(code)} · ${this.esc(item.category || "Training")}</span>
							</span>
						</span>
						<span class="tc-row-trainer">${this.esc(item.trainer || "Unassigned")}</span>
						<span class="tc-status${status === "Draft" ? " draft" : ""}"><i></i> ${status}</span>
					</button>`;
				}
				if (this.kind === "session") {
					const title = item.title || item.program || item.name;
					const color = item.trainerColor || this.palette[0];
					const done = String(item.status || "").toLowerCase() === "completed";
					return `<button type="button" class="tc-row${on}" data-id="${this.esc(id)}">
						<span class="tc-row-main">
							<span class="tc-ava" style="background:${color}">${this.esc(this.initials(title))}</span>
							<span>
								<span class="tc-row-title">${this.esc(title)}</span>
								<span class="tc-row-meta">${this.esc(item.room || item.school || "No venue")} · ${this.esc(item.type || "")}</span>
							</span>
						</span>
						<span class="tc-row-trainer">${this.esc(item.trainerName || "Unassigned")}</span>
						<span class="tc-status${done ? " draft" : ""}"><i></i> ${this.esc(item.date || "")} ${this.esc(item.start_time || "")}</span>
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

	fill_selects() {
		const courseOpts = ['<option value="">Select course</option>']
			.concat(this.courses.map((c) => `<option value="${this.esc(c.id || c.name)}">${this.esc(c.name)}</option>`))
			.join("");
		this.$.find(".tc-course-select").each((_, el) => {
			const $el = $(el);
			const prev = $el.val();
			$el.html(courseOpts);
			if (prev) $el.val(prev);
		});
		const types = (this.options.types || []).map((t) => `<option value="${this.esc(t)}">${this.esc(t)}</option>`).join("");
		this.$.find(".tc-type-select").html(types);
		const modes = (this.options.modes || []).map((t) => `<option value="${this.esc(t)}">${this.esc(t)}</option>`).join("");
		this.$.find(".tc-mode-select").html(modes);
		const trainers = this.trainers
			.map((t) => {
				const name = typeof t === "string" ? t : t.name || t.label || "";
				return name ? `<option value="${this.esc(name)}">` : "";
			})
			.join("");
		this.$.find("#tc-trainers").html(trainers);
	}

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
			$f.find("[name=training_type]").val(this.course_option_value(s.title || s.program));
			$f.find("[name=program]").val(s.program || s.title || "");
			$f.find("[name=mode_of_training]").val(s.mode || "In-person");
			$f.find("[name=school_name]").val(s.room || s.school || "");
		} else {
			const l = this.lessons.find((x) => String(x.id) === String(id));
			if (!l) return;
			const $f = this.form("lesson");
			$f.find("[name=id]").val(l.id || "");
			$f.find("[name=title]").val(l.title || "");
			$f.find("[name=course]").val(l.course || l.courseId || l.courseName || "");
			$f.find("[name=module]").val(l.module || "Lessons");
			$f.find("[name=duration]").val(l.duration || 20);
			$f.find("[name=order]").val(l.order || 0);
			$f.find("[name=published]").prop("checked", l.published !== 0);
			$f.find("[name=summary]").val(l.summary || "");
			$f.find("[name=content]").val(l.content || "");
		}
		this.$.find(".tc-save").text("Save changes");
		this.$.find(".tc-form-title").text(`Edit ${this.kind_label()}`);
		this.$.find(".tc-delete").prop("hidden", this.kind === "session");
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
			this.update_preview();
		} catch (e) {
			this.show_error(e.message || String(e));
		} finally {
			this.$.find(".tc-loading").prop("hidden", true);
		}
	}

	async save() {
		if (this.saving) return;
		this.saving = true;
		this.show_error("");
		const keepId = this.editingId;
		this.$.find(".tc-save").prop("disabled", true).text("Saving…");
		try {
			if (this.kind === "course") {
				const f = this.vals("course");
				if (!String(f.name || "").trim()) throw new Error("Course name is required.");
				f.status = this.ui_status(f.status) === "Draft" ? "Inactive" : "Active";
				if (!f.code) f.code = this.suggest_code(f.name);
				await this.call(`${this.lms}.save_course`, { payload: f });
				frappe.show_alert({ message: `Course saved: ${f.name}`, indicator: "green" });
			} else if (this.kind === "session") {
				const f = this.vals("session");
				if (!f.training_date) throw new Error("Session date is required.");
				const course = this.courses.find((c) => c.id === f.training_type || c.name === f.training_type);
				const courseName = (course && course.name) || f.training_type || f.program;
				if (!courseName) throw new Error("Pick a course for this session.");
				await this.call(`${this.sched}.save_session`, {
					values: {
						name: f.name || undefined,
						type: f.type,
						training_date: f.training_date,
						training_time: f.training_time,
						training_end_time: f.training_end_time,
						trainer_name: f.trainer_name,
						training_type: courseName,
						program: f.program || courseName,
						mode_of_training: f.mode_of_training,
						school_name: f.school_name,
						schedule_status: "Upcoming",
					},
				});
				frappe.show_alert({ message: "Session saved to Upcoming Training.", indicator: "green" });
			} else {
				const f = this.vals("lesson");
				if (!String(f.title || "").trim()) throw new Error("Lesson title is required.");
				const course = this.courses.find((c) => c.id === f.course || c.name === f.course);
				if (!course && !f.course) throw new Error("Pick a course for this lesson.");
				await this.call(`${this.lms}.save_lesson`, {
					payload: {
						id: f.id,
						title: f.title,
						course: (course && course.id) || "",
						courseName: (course && course.name) || f.course,
						module: f.module,
						duration: f.duration,
						order: f.order,
						published: f.published,
						summary: f.summary,
						content: f.content,
					},
				});
				frappe.show_alert({ message: "Lesson saved.", indicator: "green" });
			}
			await this.load();
			if (keepId) this.pick(keepId);
			else this.reset_forms();
		} catch (e) {
			this.show_error(e.message || e.exc || String(e));
		} finally {
			this.saving = false;
			this.$.find(".tc-save")
				.prop("disabled", false)
				.text(this.editingId ? "Save changes" : `Create ${this.kind_label()}`);
		}
	}

	async remove_current() {
		if (!this.editingId) return;
		if (this.kind === "session") {
			frappe.msgprint("Sessions are deleted from Upcoming Training in ERP.");
			return;
		}
		if (!confirm("Delete this card?")) return;
		this.saving = true;
		try {
			if (this.kind === "course") {
				const id = this.vals("course").id;
				if (!id) throw new Error("This catalogue topic is not a saved LMS course yet. Save it first, or just edit the fields and save.");
				await this.call(`${this.lms}.delete_course`, { name: id });
			} else {
				const id = this.vals("lesson").id;
				if (!id) throw new Error("Lesson is not saved yet.");
				await this.call(`${this.lms}.delete_lesson`, { name: id });
			}
			frappe.show_alert({ message: "Deleted.", indicator: "green" });
			await this.load();
			this.reset_forms();
		} catch (e) {
			this.show_error(e.message || String(e));
		} finally {
			this.saving = false;
		}
	}
};
