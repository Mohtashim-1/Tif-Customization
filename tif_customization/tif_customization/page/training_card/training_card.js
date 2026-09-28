frappe.pages["training-card"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Training Report and Dashboard (UAT)"),
		single_column: true,
	});
	frappe.tif_customization = frappe.tif_customization || {};
	new frappe.tif_customization.TrainingDashboard(page).make();
};

frappe.tif_customization = frappe.tif_customization || {};

frappe.tif_customization.TrainingDashboard = class TrainingDashboard {
	constructor(page) {
		this.page = page;
		this.data = null;
		this.settings = this.load_settings();
		this.view = this.settings.view || "all";
		this.sort = "run";
		this.query = "";
		this.programFilter = "";
		this.selected = "";
		this.settingsOpen = false;
	}

	make() {
		$(this.page.wrapper).addClass("page-training-card");
		this.page.clear_primary_action();
		this.page.set_primary_action(__("Refresh"), () => this.load(), "refresh");
		this.render_shell();
		this.bind();
		this.load();
	}

	load_settings() {
		try {
			const saved = JSON.parse(localStorage.getItem("training-dashboard-settings") || "{}");
			return {
				view: ["all", "course", "workshop"].includes(saved.view) ? saved.view : "all",
				strong: Number(saved.strong) >= 50 && Number(saved.strong) <= 95 ? Number(saved.strong) : 80,
			};
		} catch (e) {
			return { view: "all", strong: 80 };
		}
	}

	save_settings() {
		localStorage.setItem("training-dashboard-settings", JSON.stringify(this.settings));
	}

	render_shell() {
		$(this.page.body).html(`
			<div class="td">
				<p class="td-crumb">Learning / <b>${__("Training overview")}</b></p>
				<div class="td-head">
					<div>
						<h1>${__("Training overview")}</h1>
						<p class="td-sub"></p>
					</div>
					<div class="td-tools">
						<div class="td-seg">
							<button type="button" data-view="all">${__("All")}</button>
							<button type="button" data-view="course">${__("Courses")}</button>
							<button type="button" data-view="workshop">${__("Workshops")}</button>
						</div>
						<button type="button" class="td-icon" data-settings title="${__("Settings")}">⚙</button>
					</div>
				</div>
				<div class="td-filters">
					<label>${__("From")}<input type="date" data-filter="from_date"></label>
					<label>${__("To")}<input type="date" data-filter="to_date"></label>
					<div class="td-ranges">
						<button type="button" data-range="year">${__("This year")}</button>
						<button type="button" data-range="month">${__("This month")}</button>
						<button type="button" data-range="90">${__("Last 90 days")}</button>
					</div>
					<label>${__("Program")}<select data-filter="program"><option value="">${__("All programs")}</option></select></label>
					<label>${__("Trainer")}<select data-filter="trainer"><option value="">${__("All trainers")}</option></select></label>
					<label>${__("Mode")}<select data-filter="mode"><option value="">${__("All modes")}</option></select></label>
					<label>${__("Status")}<select data-filter="status">
						<option value="">${__("All statuses")}</option>
						<option value="completed">${__("Completed")}</option>
						<option value="upcoming">${__("Upcoming")}</option>
						<option value="in_progress">${__("In progress")}</option>
					</select></label>
					<button type="button" class="td-clear">${__("Clear")}</button>
				</div>
				<div class="td-pop" hidden>
					<label>${__("Opens on")}</label>
					<select data-set="view">
						<option value="all">${__("All")}</option>
						<option value="course">${__("Courses")}</option>
						<option value="workshop">${__("Workshops")}</option>
					</select>
					<label>${__("Strong at")} <b data-strong-label></b></label>
					<input data-set="strong" type="range" min="50" max="95" step="1">
					<p class="td-empty">${__("Result is the attendance rate: people marked present out of people marked. Strong uses the percentage above.")}</p>
				</div>
				<div class="td-kpis"></div>
				<div class="td-grid">
					<div class="td-card"><div class="td-card-h"><div><h2>${__("Courses vs workshops")}</h2><div class="sub">${__("What we offered and who it reached")}</div></div></div><div class="td-compare body"></div></div>
					<div class="td-card"><div class="td-card-h"><div><h2>${__("Sessions conducted by month")}</h2><div class="sub td-month-sub"></div></div><div class="td-legend"><span><i class="course"></i>${__("Courses")}</span><span><i class="workshop"></i>${__("Workshops")}</span></div></div><div class="td-months body"></div></div>
				</div>
				<div class="td-split">
					<div class="td-card">
						<div class="td-card-h"><div><h2>${__("Summary report")}</h2><div class="sub td-sum-sub"></div></div></div>
						<div class="td-tools-row">
							<input class="td-search" type="search" placeholder="${__("Search trainings…")}">
							<div class="td-sort">
								<button type="button" data-sort="run">${__("Most run")}</button>
								<button type="button" data-sort="reach">${__("Most reach")}</button>
								<button type="button" data-sort="score">${__("Best result")}</button>
							</div>
						</div>
						<div class="td-table-wrap"><table class="td-table"><thead><tr>
							<th>${__("Training")}</th><th class="num">${__("Conducted")}</th><th class="num">${__("Teachers")}</th><th class="num">${__("Students")}</th><th class="num">${__("Score")}</th><th>${__("Result")}</th>
						</tr></thead><tbody class="td-rows"></tbody></table></div>
					</div>
					<div class="td-card td-detail"></div>
				</div>
			</div>
		`);
		this.$ = $(this.page.body).find(".td");
		this.$.find('[data-set="view"]').val(this.settings.view);
		this.$.find('[data-set="strong"]').val(this.settings.strong);
		this.$.find("[data-strong-label]").text(this.settings.strong + "%");
		const year = frappe.datetime.get_today().slice(0, 4);
		this.$.find('[data-filter="from_date"]').val(`${year}-01-01`);
		this.$.find('[data-filter="to_date"]').val(`${year}-12-31`);
		this.mark_view();
	}

	bind() {
		this.$.on("click", "[data-view]", (event) => {
			this.view = $(event.currentTarget).attr("data-view");
			this.mark_view();
			this.paint();
		});
		this.$.on("click", "[data-settings]", () => {
			this.settingsOpen = !this.settingsOpen;
			this.$.find(".td-pop").prop("hidden", !this.settingsOpen);
		});
		this.$.on("change input", "[data-set]", (event) => {
			const key = $(event.currentTarget).attr("data-set");
			if (key === "strong") this.settings.strong = Number(event.target.value) || 80;
			if (key === "view") {
				this.settings.view = event.target.value;
				this.view = this.settings.view;
				this.mark_view();
			}
			this.$.find("[data-strong-label]").text(this.settings.strong + "%");
			this.save_settings();
			this.paint();
		});
		this.$.on("click", "[data-sort]", (event) => {
			this.sort = $(event.currentTarget).attr("data-sort");
			this.paint();
		});
		this.$.on("change", "[data-filter]", () => this.load());
		this.$.on("click", "[data-range]", (event) => this.apply_range($(event.currentTarget).attr("data-range")));
		this.$.on("click", ".td-clear", () => this.clear_filters());
		this.$.on("click", ".td-prog", (event) => {
			const name = $(event.currentTarget).attr("data-program") || "";
			const current = this.$.find('[data-filter="program"]').val() || "";
			const next = current === name ? "" : name;
			this.view = "course";
			this.programFilter = next;
			this.$.find('[data-filter="program"]').val(next);
			this.mark_view();
			this.load();
		});
		this.$.on("input", ".td-search", (event) => {
			this.query = event.target.value || "";
			this.programFilter = "";
			this.paint_table();
			this.paint_detail();
		});
		this.$.on("click", ".td-pick", (event) => {
			this.selected = $(event.currentTarget).attr("data-id");
			this.paint_table();
			this.paint_detail();
		});
		this.$.on("click", ".td-open", (event) => {
			const name = $(event.currentTarget).attr("data-name");
			if (name) frappe.set_route("Form", "Upcoming Training", name);
		});
	}

	mark_view() {
		this.$.find("[data-view]").removeClass("on");
		this.$.find(`[data-view="${this.view}"]`).addClass("on");
		this.$.find("[data-sort]").removeClass("on");
		this.$.find(`[data-sort="${this.sort}"]`).addClass("on");
	}

	filter_values() {
		const read = (name) => this.$.find(`[data-filter="${name}"]`).val() || "";
		return {
			from_date: read("from_date"),
			to_date: read("to_date"),
			program: read("program"),
			trainer: read("trainer"),
			mode: read("mode"),
			status: read("status"),
		};
	}

	apply_range(range) {
		const today = frappe.datetime.get_today();
		let from = today;
		let to = today;
		if (range === "year") {
			from = today.slice(0, 4) + "-01-01";
			to = today.slice(0, 4) + "-12-31";
		} else if (range === "month") {
			from = today.slice(0, 7) + "-01";
			to = today;
		} else if (range === "90") {
			from = frappe.datetime.add_days(today, -89);
			to = today;
		}
		this.$.find('[data-filter="from_date"]').val(from);
		this.$.find('[data-filter="to_date"]').val(to);
		this.load();
	}

	clear_filters() {
		const year = frappe.datetime.get_today().slice(0, 4);
		this.$.find('[data-filter="from_date"]').val(`${year}-01-01`);
		this.$.find('[data-filter="to_date"]').val(`${year}-12-31`);
		this.$.find('[data-filter="program"], [data-filter="trainer"], [data-filter="mode"], [data-filter="status"]').val("");
		this.programFilter = "";
		this.view = "all";
		this.mark_view();
		this.load();
	}

	fill_select(name, values, placeholder) {
		const select = this.$.find(`[data-filter="${name}"]`);
		const current = select.val() || "";
		const items = (values || []).map((value) =>
			typeof value === "string" ? { value, label: value } : value
		);
		select.html(`<option value="">${this.esc(placeholder)}</option>`);
		items.forEach((item) => {
			select.append(`<option value="${this.esc(item.value)}">${this.esc(item.label)}</option>`);
		});
		if (current && items.some((item) => item.value === current)) select.val(current);
	}

	load() {
		this.programFilter = (this.filter_values().program || "");
		frappe.call({
			method: "tif_customization.tif_customization.page.training_card.training_card.get_dashboard",
			args: { filters: this.filter_values() },
			callback: (r) => {
				this.data = (r && r.message) || { trainings: [], months: [], year: "", options: {} };
				const options = this.data.options || {};
				const programs = (options.programs || []).map((value) => ({ value, label: value }));
				programs.push({ value: "__none__", label: __("No program") });
				this.fill_select("program", programs, __("All programs"));
				this.fill_select("trainer", options.trainers, __("All trainers"));
				this.fill_select("mode", options.modes, __("All modes"));
				if (!this.selected || !(this.data.trainings || []).some((row) => row.id === this.selected)) {
					this.selected = (this.filtered()[0] && this.filtered()[0].id) || "";
				}
				this.paint();
			},
		});
	}

	esc(value) {
		return frappe.utils.escape_html(value == null ? "" : String(value));
	}

	fmt(value) {
		const num = Number(value) || 0;
		return num.toLocaleString("en-US");
	}

	filtered() {
		const rows = (this.data && this.data.trainings) || [];
		if (this.view === "course") return rows.filter((row) => row.kind === "course");
		if (this.view === "workshop") return rows.filter((row) => row.kind === "workshop");
		return rows.slice();
	}

	listed() {
		const q = (this.query || "").trim().toLowerCase();
		let rows = this.filtered();
		if (this.programFilter) {
			rows = rows.filter((row) => ((row.program || "").trim() || "__none__") === this.programFilter);
		}
		if (q) {
			rows = rows.filter((row) => `${row.title || ""} ${row.program || ""}`.toLowerCase().includes(q));
		}
		const strong = this.settings.strong;
		rows.sort((a, b) => {
			if (this.sort === "reach") return b.teachers + b.students - (a.teachers + a.students);
			if (this.sort === "score") return (b.score == null ? -1 : b.score) - (a.score == null ? -1 : a.score);
			return b.conducted - a.conducted || (a.title || "").localeCompare(b.title || "");
		});
		return rows;
	}

	band(score) {
		if (score == null) return null;
		const strong = this.settings.strong;
		if (score >= strong) return "strong";
		if (score >= Math.max(50, strong - 15)) return "track";
		return "low";
	}

	band_label(score) {
		const band = this.band(score);
		if (band === "strong") return __("Strong");
		if (band === "track") return __("On track");
		if (band === "low") return __("Needs attention");
		return "";
	}

	initials(title) {
		const parts = String(title || "")
			.split(/\s+/)
			.filter(Boolean);
		if (!parts.length) return "TR";
		if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
		return (parts[0][0] + parts[1][0]).toUpperCase();
	}

	color(kind, title) {
		if (kind === "workshop") return "#0f9f6e";
		const palette = ["#5b4bdb", "#7c3aed", "#4f46e5", "#6d28d9", "#4338ca"];
		const n = String(title || "")
			.split("")
			.reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
		return palette[n % palette.length];
	}

	stats(rows) {
		const conducted = rows.reduce((sum, row) => sum + row.conducted, 0);
		const upcoming = rows.reduce((sum, row) => sum + row.upcoming, 0);
		const teachers = rows.reduce((sum, row) => sum + row.teachers, 0);
		const students = rows.reduce((sum, row) => sum + row.students, 0);
		const scored = rows.filter((row) => row.score != null);
		const weight = scored.reduce((sum, row) => sum + row.conducted, 0) || scored.length;
		const score = weight
			? Math.round(scored.reduce((sum, row) => sum + row.score * (row.conducted || 1), 0) / weight)
			: null;
		return { offered: rows.length, conducted, upcoming, teachers, students, score };
	}

	paint() {
		const all = (this.data && this.data.trainings) || [];
		const courses = all.filter((row) => row.kind === "course");
		const workshops = all.filter((row) => row.kind === "workshop");
		const viewRows = this.filtered();
		const viewStats = this.stats(viewRows);
		const year = (this.data && this.data.year) || "";
		const months = (this.data && this.data.months) || [];
		const span = months.length
			? `${this.month_name(months[0].key)} – ${this.month_name(months[months.length - 1].key)} ${year}`
			: String(year);
		this.$.find(".td-sub").text(
			`${__("Courses and workshops delivered, who they reached, and how they went.")} ${span}. ${__("Result is attendance rate.")}`
		);
		const shownCourses = this.view === "workshop" ? 0 : courses.length;
		const shownWorkshops = this.view === "course" ? 0 : workshops.length;
		this.paint_kpis(viewStats, shownCourses, shownWorkshops);
		this.paint_compare(this.stats(courses), this.stats(workshops));
		this.paint_months(months);
		this.$.find(".td-month-sub").text(`${__("Completed sessions")}, ${span}`);
		this.$.find(".td-sum-sub").text(
			`${this.listed().length} ${__("of")} ${viewRows.length} ${__("trainings · select a training to see every session")}`
		);
		if (!viewRows.some((row) => row.id === this.selected)) {
			this.selected = (this.listed()[0] && this.listed()[0].id) || "";
		}
		this.mark_view();
		this.paint_table();
		this.paint_detail();
	}

	month_name(key) {
		const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
		const month = Number(String(key || "").slice(5, 7));
		return names[month - 1] || key;
	}

	paint_kpis(stats, courseCount, workshopCount) {
		const score = stats.score == null ? "—" : stats.score + "%";
		const cards = [
			[__("Trainings offered"), __("CATALOGUE"), this.fmt(stats.offered), `${courseCount} ${__("courses")} · ${workshopCount} ${__("workshops")}`],
			[__("Times conducted"), __("SESSIONS"), this.fmt(stats.conducted), stats.upcoming ? `${this.fmt(stats.upcoming)} ${__("more scheduled")}` : __("None still scheduled")],
			[__("Teachers trained"), __("REACH"), this.fmt(stats.teachers), __("Attendance on teacher sessions")],
			[__("Students reached"), __("REACH"), this.fmt(stats.students), __("Attendance on student sessions")],
			[__("Average result"), __("OUTCOME"), score, __("Attendance rate where attendance was marked")],
		];
		this.$.find(".td-kpis").html(
			cards
				.map(
					([label, tag, value, hint]) =>
						`<div class="td-kpi"><div class="tag">${this.esc(tag)}</div><div class="label">${this.esc(label)}</div><strong>${this.esc(value)}</strong><span class="hint">${this.esc(hint)}</span></div>`
				)
				.join("")
		);
	}

	program_rows() {
		const buckets = {};
		((this.data && this.data.trainings) || [])
			.filter((row) => row.kind === "course")
			.forEach((row) => {
				const key = (row.program || "").trim() || "__none__";
				const name = key === "__none__" ? __("No program") : key;
				const bucket = buckets[key] || { key, name, courses: 0, conducted: 0, teachers: 0, students: 0 };
				bucket.courses += 1;
				bucket.conducted += row.conducted;
				bucket.teachers += row.teachers;
				bucket.students += row.students;
				buckets[key] = bucket;
			});
		return Object.values(buckets).sort((a, b) => b.conducted - a.conducted || a.name.localeCompare(b.name));
	}

	paint_compare(courses, workshops) {
		const total = courses.conducted + workshops.conducted || 1;
		const courseShare = Math.round((100 * courses.conducted) / total);
		const workshopShare = 100 - courseShare;
		const metrics = [
			[__("Offered"), courses.offered, workshops.offered],
			[__("Conducted"), courses.conducted, workshops.conducted],
			[__("Teachers"), courses.teachers, workshops.teachers],
			[__("Students"), courses.students, workshops.students],
		];
		const peak = Math.max(1, ...metrics.flatMap((row) => [row[1], row[2]]));
		const bars = metrics
			.map(([label, course, workshop]) => {
				const cw = Math.round((100 * course) / peak);
				const ww = Math.round((100 * workshop) / peak);
				return `<div class="td-crow">
					<span>${this.esc(label)}</span>
					<div class="td-ctrack"><i class="course" style="width:${cw}%"></i></div>
					<b>${this.fmt(course)}</b>
					<div class="td-ctrack"><i class="workshop" style="width:${ww}%"></i></div>
					<b>${this.fmt(workshop)}</b>
				</div>`;
			})
			.join("");
		const maxProgram = Math.max(1, ...this.program_rows().map((row) => row.conducted));
		const programs = this.program_rows()
			.map((row) => {
				const width = Math.max(4, Math.round((100 * row.conducted) / maxProgram));
				return `<button type="button" class="td-prog ${this.programFilter === row.key ? "on" : ""}" data-program="${this.esc(row.key)}">
					<span>${this.esc(row.name)}</span>
					<span class="td-prog-track"><i style="width:${width}%"></i></span>
					<b>${this.fmt(row.conducted)}</b>
					<small>${this.fmt(row.courses)} ${__("courses")}</small>
				</button>`;
			})
			.join("");
		const courseScore = courses.score == null ? "—" : courses.score + "%";
		const workshopScore = workshops.score == null ? "—" : workshops.score + "%";
		this.$.find(".td-compare").html(`
			<div class="td-donut-wrap">
				<div class="td-donut" style="background:conic-gradient(#5b4bdb 0 ${courseShare}%, #0f9f6e ${courseShare}% 100%)">
					<div class="td-donut-hole"><strong>${courseShare}%</strong><span>${__("courses")}</span></div>
				</div>
				<div class="td-share-key">
					<div><i class="course"></i><span>${__("Courses")}</span><b>${this.fmt(courses.conducted)}</b><small>${courseShare}% · ${this.esc(courseScore)}</small></div>
					<div><i class="workshop"></i><span>${__("Workshops")}</span><b>${this.fmt(workshops.conducted)}</b><small>${workshopShare}% · ${this.esc(workshopScore)}</small></div>
				</div>
			</div>
			<div class="td-cchart">
				<div class="td-cchart-h"><span></span><span>${__("Courses")}</span><span></span><span>${__("Workshops")}</span><span></span></div>
				${bars}
			</div>
			<div class="td-progs">
				<div class="td-prog-label">${__("Courses by program")}</div>
				${programs || `<div class="td-empty">${__("No course programs.")}</div>`}
			</div>
		`);
	}

	paint_months(months) {
		if (!months.length) {
			this.$.find(".td-months").html(`<div class="td-empty">${__("No conducted sessions this year.")}</div>`);
			return;
		}
		const max = Math.max(1, ...months.map((month) => (this.view === "workshop" ? 0 : month.course) + (this.view === "course" ? 0 : month.workshop)));
		this.$.find(".td-months").html(
			months
				.map((month) => {
					const course = this.view === "workshop" ? 0 : month.course;
					const workshop = this.view === "course" ? 0 : month.workshop;
					const ch = Math.round((120 * course) / max);
					const wh = Math.round((120 * workshop) / max);
					return `<div class="td-month"><div class="td-stack" title="${this.esc(this.month_name(month.key))}: ${course + workshop}">
						<i class="course" style="height:${ch}px"></i><i class="workshop" style="height:${wh}px"></i>
					</div><em>${this.esc(this.month_name(month.key))}</em></div>`;
				})
				.join("")
		);
	}

	paint_table() {
		const rows = this.listed();
		this.$.find(".td-sum-sub").text(
			`${rows.length} ${__("of")} ${this.filtered().length} ${__("trainings · select a training to see every session")}`
		);
		if (!rows.length) {
			this.$.find(".td-rows").html(`<tr><td colspan="6" class="td-empty">${__("No trainings in this view.")}</td></tr>`);
			return;
		}
		this.$.find(".td-rows").html(
			rows
				.map((row) => {
					const band = this.band(row.score);
					const badge = band ? `<span class="td-badge ${band}">${this.esc(this.band_label(row.score))}</span>` : "—";
					const plus = row.upcoming ? ` <span class="td-plus">+${this.esc(row.upcoming)}</span>` : "";
					const kind = row.kind === "workshop" ? __("Workshop") : row.program || __("No program");
					return `<tr class="td-pick ${row.id === this.selected ? "on" : ""}" data-id="${this.esc(row.id)}">
						<td><div class="td-name"><span class="td-ava" style="background:${this.color(row.kind, row.title)}">${this.esc(this.initials(row.title))}</span><span><b>${this.esc(row.title)}</b><small>${this.esc(kind)}</small></span></div></td>
						<td class="num">${this.fmt(row.conducted)}${plus}</td>
						<td class="num">${this.fmt(row.teachers)}</td>
						<td class="num">${this.fmt(row.students)}</td>
						<td class="num">${row.score == null ? "—" : this.esc(row.score + "%")}</td>
						<td>${badge}</td>
					</tr>`;
				})
				.join("")
		);
	}

	paint_detail() {
		const row = ((this.data && this.data.trainings) || []).find((item) => item.id === this.selected);
		const host = this.$.find(".td-detail");
		if (!row) {
			host.html(`<div class="body"><h2>${__("Training detail")}</h2><p class="td-empty">${__("Select a training to see every time it ran.")}</p></div>`);
			return;
		}
		const band = this.band(row.score);
		const done = row.conducted + row.upcoming;
		const completion = done ? Math.round((100 * row.conducted) / done) : 0;
		const bars = (row.sessions || [])
			.filter((session) => session.status !== "upcoming" && session.score != null)
			.slice()
			.reverse();
		const barHtml = bars.length
			? `<div class="td-bars">${bars
					.map((session) => {
						const height = Math.max(6, Math.round((64 * session.score) / 100));
						const color = this.band(session.score) === "strong" ? "#12b76a" : this.band(session.score) === "track" ? "#f79009" : "#f04438";
						return `<i style="height:${height}px;background:${color}" title="${this.esc(session.date)} ${session.score}%"></i>`;
					})
					.join("")}</div>`
			: `<p class="td-empty">${__("No attendance rate yet. Sessions appear here after people are marked present.")}</p>`;
		const sessions = (row.sessions || [])
			.map((session) => {
				const upcoming = session.status === "upcoming";
				const badge = upcoming
					? `<span class="td-badge up">${__("Upcoming")}</span>`
					: this.band(session.score)
						? `<span class="td-badge ${this.band(session.score)}">${session.score}%</span>`
						: "";
				const people = session.present
					? `${this.fmt(session.present)} ${session.audience === "students" ? __("students") : __("teachers")}`
					: __("Attendance not marked");
				return `<div class="td-sess">
					<div class="td-sess-top"><div class="when">${this.esc(this.pretty(session))}</div>${badge}</div>
					<div class="meta">${this.esc(session.trainer || __("Trainer not set"))} · ${this.esc(session.mode || __("Mode not set"))}${session.school ? " · " + this.esc(session.school) : ""}</div>
					<div class="meta">${this.esc(people)}${upcoming ? " · " + __("Scheduled") : ""} · <button type="button" class="td-open" data-name="${this.esc(session.name)}">${__("Open")}</button></div>
				</div>`;
			})
			.join("");
		host.html(`
			<div class="body">
				<div class="td-detail-h">
					<div class="td-name">
						<span class="td-ava" style="background:${this.color(row.kind, row.title)}">${this.esc(this.initials(row.title))}</span>
						<span><b>${this.esc(row.title)}</b><small>${this.esc(row.kind === "workshop" ? __("Workshop") : row.program || __("No program"))}</small></span>
					</div>
					${band ? `<span class="td-badge ${band}">${this.esc(this.band_label(row.score))}</span>` : ""}
				</div>
				<p class="sub">${__("Every time it ran, and how it went")}</p>
				<div class="td-mini">
					<div><span>${__("Times conducted")}</span><b>${this.fmt(row.conducted)}</b></div>
					<div><span>${__("Upcoming")}</span><b>${this.fmt(row.upcoming)}</b></div>
					<div><span>${__("Avg result")}</span><b>${row.score == null ? "—" : this.esc(row.score + "%")}</b></div>
					<div><span>${__("Teachers")}</span><b>${this.fmt(row.teachers)}</b></div>
					<div><span>${__("Students")}</span><b>${this.fmt(row.students)}</b></div>
					<div><span>${__("Completion")}</span><b>${completion}%</b></div>
				</div>
				<div class="sub">${__("Score by session")}</div>
				${barHtml}
				<div class="sub">${__("Session-wise detail")}</div>
				<div class="td-sess-list">${sessions || `<p class="td-empty">${__("No sessions.")}</p>`}</div>
			</div>
		`);
	}

	pretty(session) {
		if (!session.date) return session.time || "";
		const dt = frappe.datetime.str_to_obj(session.date);
		if (!dt) return session.date;
		const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
		return `${dt.getDate()} ${months[dt.getMonth()]} ${dt.getFullYear()}${session.time ? " · " + session.time : ""}`;
	}
};
