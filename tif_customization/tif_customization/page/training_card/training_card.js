frappe.pages["training-card"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Training Card"),
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
		this.editingId = "";
		this.saving = false;
		this.courses = [];
		this.sessions = [];
		this.lessons = [];
		this.trainers = [];
		this.options = { modes: ["In-person", "Online", "Onsite"], types: ["Training", "Workshop"] };
		this.palette = [
			"#6366f1",
			"#8b5cf6",
			"#a78bfa",
			"#0ea5e9",
			"#10b981",
			"#34d399",
			"#f59e0b",
			"#facc15",
			"#f97316",
			"#ef4444",
			"#ec4899",
			"#f9a8d4",
		];
		this.lms = "tif_customization.tif_customization.api.training_lms";
		this.sched = "tif_customization.tif_customization.api.training_schedule";
	}

	make() {
		this.render();
		this.page.set_primary_action(__("Refresh"), () => this.load(), "refresh");
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
				<div class="tc-head">
					<div>
						<p class="tc-kicker">Create cards</p>
						<h3 class="tc-title">Courses, sessions &amp; lessons</h3>
						<p class="tc-sub">Build the colored cards used on the weekly planner and in the LMS. Everything saves to ERP.</p>
					</div>
				</div>
				<div class="tc-kpis">
					<div class="tc-kpi on" data-kind="course" data-tone="purple"><span>Courses</span><strong data-count="course">0</strong></div>
					<div class="tc-kpi" data-kind="session" data-tone="blue"><span>Sessions</span><strong data-count="session">0</strong></div>
					<div class="tc-kpi" data-kind="lesson" data-tone="green"><span>Lessons</span><strong data-count="lesson">0</strong></div>
				</div>
				<div class="tc-tabs">
					<button type="button" class="on" data-kind="course">Courses<small>Program cards (Word Cube, Storytelling…)</small></button>
					<button type="button" data-kind="session">Sessions<small>Scheduled cards on the weekly planner</small></button>
					<button type="button" data-kind="lesson">Lessons<small>Learning material inside a course</small></button>
				</div>
				<div class="tc-err" hidden></div>
				<p class="tc-muted tc-loading" hidden>Loading cards…</p>
				<div class="tc-layout">
					<div class="tc-list">
						<div class="tc-list-bar">
							<input type="search" class="tc-search" placeholder="Search courses…">
							<button type="button" class="tc-btn primary tc-new">+ New course</button>
						</div>
						<div class="tc-empty" hidden>No cards yet. Create one on the right.</div>
						<div class="tc-grid"></div>
					</div>
					<aside class="tc-form-col">
						<div class="tc-preview">
							<div class="tc-preview-tag">Training</div>
							<strong class="tc-preview-title">Course title</strong>
							<div class="tc-preview-meta"><span class="tc-ava">T</span><span class="tc-preview-text">Trainer · Duration</span></div>
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
							<label>Duration<input name="duration" placeholder="2 hours"></label>
							<label>Status
								<select name="status">
									<option>Active</option>
									<option>Inactive</option>
								</select>
							</label>
							<label class="full">Description<textarea name="description" rows="3" placeholder="What this course covers"></textarea></label>
							<div class="full tc-colors"><span>Card color</span>${pal}</div>
							<input type="hidden" name="color" value="#6366f1">
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
							<button type="button" class="tc-btn primary tc-save">Create card</button>
							<button type="button" class="tc-btn danger tc-delete" hidden>Delete</button>
							<button type="button" class="tc-btn ghost tc-clear">Clear</button>
						</div>
					</aside>
				</div>
				<datalist id="tc-trainers"></datalist>
			</div>
		`);
		this.$ = $(this.page.body).find(".tc-studio");
	}

	bind() {
		const $root = this.$;
		$root.on("click", ".tc-kpi, .tc-tabs button", (e) => {
			const kind = $(e.currentTarget).data("kind");
			if (kind) this.set_kind(kind);
		});
		$root.on("input", ".tc-search", (e) => {
			this.search = e.target.value || "";
			this.render_list();
		});
		$root.on("click", ".tc-new, .tc-clear", () => this.reset_forms());
		$root.on("click", ".tc-save", () => this.save());
		$root.on("click", ".tc-delete", () => this.remove_current());
		$root.on("click", ".tc-mini", (e) => {
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

	set_kind(kind) {
		this.kind = kind;
		this.search = "";
		this.$.find(".tc-search").val("");
		this.$.find(".tc-kpi").removeClass("on").filter(`[data-kind="${kind}"]`).addClass("on");
		this.$.find(".tc-tabs button").removeClass("on").filter(`[data-kind="${kind}"]`).addClass("on");
		this.$.find(".tc-form").prop("hidden", true);
		this.form(kind).prop("hidden", false);
		const labels = { course: "course", session: "session", lesson: "lesson" };
		this.$.find(".tc-search").attr("placeholder", `Search ${labels[kind]}s…`);
		this.$.find(".tc-new").text(`+ New ${labels[kind]}`);
		this.reset_forms();
		this.render_list();
	}

	blank_session_date() {
		return frappe.datetime.get_today();
	}

	reset_forms() {
		this.editingId = "";
		const $c = this.form("course")[0];
		if ($c) $c.reset();
		this.form("course").find("[name=id]").val("");
		this.form("course").find("[name=color]").val("#6366f1");
		this.form("course").find("[name=category]").val("Training");
		this.form("course").find("[name=status]").val("Active");
		this.mark_swatch("#6366f1");

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
		this.$.find(".tc-save").text("Create card");
		this.$.find(".tc-mini").removeClass("on");
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
		return String(name || "?")
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((w) => w[0])
			.join("")
			.toUpperCase();
	}

	tint(color) {
		const c = color || "#6366f1";
		return {
			border: c,
			bg: this.mix(c, "#ffffff", 0.14),
		};
	}

	mix(hex, into, amount) {
		const a = this.hex_rgb(hex);
		const b = this.hex_rgb(into);
		if (!a || !b) return into;
		const m = (x, y) => Math.round(x * amount + y * (1 - amount));
		return `rgb(${m(a.r, b.r)}, ${m(a.g, b.g)}, ${m(a.b, b.b)})`;
	}

	hex_rgb(hex) {
		const h = String(hex || "").replace("#", "");
		if (h.length !== 6) return null;
		return {
			r: parseInt(h.slice(0, 2), 16),
			g: parseInt(h.slice(2, 4), 16),
			b: parseInt(h.slice(4, 6), 16),
		};
	}

	filtered() {
		const q = (this.search || "").trim().toLowerCase();
		if (this.kind === "course") {
			return this.courses.filter(
				(c) => !q || `${c.name} ${c.trainer || ""} ${c.category || ""}`.toLowerCase().includes(q)
			);
		}
		if (this.kind === "session") {
			return this.sessions.filter(
				(s) =>
					!q ||
					`${s.title || ""} ${s.trainerName || ""} ${s.program || ""} ${s.room || ""}`.toLowerCase().includes(q)
			);
		}
		return this.lessons.filter(
			(l) => !q || `${l.title || ""} ${l.courseName || ""} ${l.module || ""}`.toLowerCase().includes(q)
		);
	}

	render_counts() {
		this.$.find("[data-count=course]").text(this.courses.length);
		this.$.find("[data-count=session]").text(this.sessions.length);
		this.$.find("[data-count=lesson]").text(this.lessons.length);
	}

	render_list() {
		const items = this.filtered();
		this.$.find(".tc-empty").prop("hidden", !!items.length);
		if (!items.length) {
			this.$.find(".tc-empty").text(`No ${this.kind} cards yet. Create one on the right.`);
		}
		const html = items
			.map((item) => {
				const id = item.id || item.name;
				const title = item.name || item.title || "";
				const color = item.color || item.trainerColor || "#6366f1";
				const t = this.tint(color);
				let meta = "";
				if (this.kind === "course") meta = `${item.trainer || "No trainer"} · ${item.category || "Training"}`;
				else if (this.kind === "session")
					meta = `${item.trainerName || "No trainer"} · ${item.date || ""} · ${item.start_time || ""}`;
				else meta = `${item.courseName || "Course"} · ${item.duration || 0} min`;
				const on = this.editingId && String(this.editingId) === String(id) ? " on" : "";
				return `<button type="button" class="tc-mini${on}" data-id="${this.esc(id)}" style="border-color:${t.border};background:${t.bg}">
					<strong>${this.esc(title)}</strong>
					<div class="tc-mini-meta">${this.esc(meta)}</div>
				</button>`;
			})
			.join("");
		this.$.find(".tc-grid").html(html);
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
			return {
				title: f.name || "Course title",
				meta: [f.trainer || "Trainer", f.duration || "Duration"].filter(Boolean).join(" · "),
				color: f.color || "#6366f1",
				tag: f.category || "Training",
			};
		}
		if (this.kind === "session") {
			const f = this.vals("session");
			const course = this.courses.find((c) => c.name === f.training_type || c.id === f.training_type);
			return {
				title: (course && course.name) || f.training_type || f.program || "Session title",
				meta: [f.trainer_name || "Trainer", `${f.training_time || ""} – ${f.training_end_time || ""}`, f.school_name]
					.filter(Boolean)
					.join(" · "),
				color: (course && course.color) || "#6366f1",
				tag: f.training_date || "Session",
			};
		}
		const f = this.vals("lesson");
		const course = this.courses.find((c) => c.id === f.course || c.name === f.course);
		return {
			title: f.title || "Lesson title",
			meta: [(course && course.name) || "Course", `${f.duration || 0} min`].join(" · "),
			color: (course && course.color) || "#0ea5e9",
			tag: f.module || "Lesson",
		};
	}

	update_preview() {
		const p = this.preview_data();
		const t = this.tint(p.color);
		this.$.find(".tc-preview").css({ background: t.bg, borderColor: p.color });
		this.$.find(".tc-preview-tag").text(p.tag).css("color", p.color);
		this.$.find(".tc-preview-title").text(p.title);
		this.$.find(".tc-preview-text").text(p.meta);
		this.$.find(".tc-ava").text(this.initials(p.meta)).css("background", p.color);
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
			$f.find("[name=code]").val(c.code || "");
			$f.find("[name=category]").val(c.category || "Training");
			$f.find("[name=trainer]").val(c.trainer || "");
			$f.find("[name=duration]").val(c.duration || "");
			$f.find("[name=status]").val(c.status || "Active");
			$f.find("[name=description]").val(c.description || "");
			$f.find("[name=color]").val(c.color || "#6366f1");
			this.mark_swatch(c.color || "#6366f1");
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
			const courseVal = this.course_option_value(s.title || s.program);
			$f.find("[name=training_type]").val(courseVal);
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
		this.$.find(".tc-save").text("Update card");
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
				this.call(`${this.sched}.get_directory`, { view: "sessions" }).catch(() => ({ rows: [] })),
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
						category: "Training",
						trainer: "",
						color: this.palette[this.courses.length % this.palette.length],
						status: "Active",
						description: "From Upcoming Training catalog",
					});
				}
			});
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
		this.$.find(".tc-save").prop("disabled", true).text("Saving…");
		try {
			if (this.kind === "course") {
				const f = this.vals("course");
				if (!String(f.name || "").trim()) throw new Error("Course name is required.");
				await this.call(`${this.lms}.save_course`, { payload: f });
				frappe.show_alert({ message: `Course card saved: ${f.name}`, indicator: "green" });
			} else if (this.kind === "session") {
				const f = this.vals("session");
				if (!f.training_date) throw new Error("Session date is required.");
				const course = this.courses.find((c) => c.id === f.training_type || c.name === f.training_type);
				const courseName = (course && course.name) || f.training_type || f.program;
				if (!courseName) throw new Error("Pick a course for this session card.");
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
				frappe.show_alert({ message: "Session card saved to Upcoming Training.", indicator: "green" });
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
				frappe.show_alert({ message: "Lesson card saved.", indicator: "green" });
			}
			await this.load();
			this.reset_forms();
		} catch (e) {
			this.show_error(e.message || e.exc || String(e));
		} finally {
			this.saving = false;
			this.$.find(".tc-save").prop("disabled", false).text(this.editingId ? "Update card" : "Create card");
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
				if (!id) throw new Error("This catalog course is not a saved LMS card yet.");
				await this.call(`${this.lms}.delete_course`, { name: id });
			} else {
				const id = this.vals("lesson").id;
				if (!id) throw new Error("Lesson is not saved yet.");
				await this.call(`${this.lms}.delete_lesson`, { name: id });
			}
			frappe.show_alert({ message: "Card deleted.", indicator: "green" });
			await this.load();
			this.reset_forms();
		} catch (e) {
			this.show_error(e.message || String(e));
		} finally {
			this.saving = false;
		}
	}
};
