frappe.pages["feedback-studio"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Feedback Studio"),
		single_column: true,
	});
	frappe.tif_customization = frappe.tif_customization || {};
	new frappe.tif_customization.FeedbackStudio(page, wrapper).make();
};

frappe.tif_customization = frappe.tif_customization || {};

frappe.tif_customization.FeedbackStudio = class FeedbackStudio {
	constructor(page, wrapper) {
		this.page = page;
		this.wrapper = wrapper;
		this._id = Date.now();
		this._ready = false;
		this._syncTimer = null;
		this._syncSeq = 0;
		this.audMeta = [
			{ id: "school", label: "School", hint: "Staff & administration", color: "#2f5bd3" },
			{ id: "parent", label: "Parent", hint: "Parents & guardians", color: "#1f8a5b" },
			{ id: "student", label: "Student", hint: "Learners", color: "#c8561f" },
			{ id: "sme", label: "SME", hint: "Subject matter experts", color: "#7a4cc2" },
		];
		this.state = this.load();
	}

	uid() {
		this._id += 1;
		return "q" + this._id.toString(36);
	}

	blankQuestion(type, text, options) {
		return {
			id: this.uid(),
			type: type,
			text: text || "",
			required: true,
			options: options || (type === "choice" ? ["Option 1", "Option 2"] : []),
		};
	}

	defaults() {
		return {
			school: {
				title: "Staff feedback",
				intro: "Help us understand how the school is supporting you this term.",
				questions: [
					this.blankQuestion("rating", "How well does leadership communicate school priorities?"),
					this.blankQuestion("choice", "Which area needs the most support?", [
						"Resources",
						"Training",
						"Workload",
						"Facilities",
					]),
					this.blankQuestion("text", "What one change would make your work easier?"),
				],
			},
			parent: {
				title: "Parent feedback",
				intro: "Your view helps us partner better with families.",
				questions: [
					this.blankQuestion("rating", "How satisfied are you with communication from the school?"),
					this.blankQuestion("yesno", "Do you feel informed about your child’s progress?"),
					this.blankQuestion("text", "Anything else you would like us to know?"),
				],
			},
			student: {
				title: "Student feedback",
				intro: "Tell us honestly how school is going for you.",
				questions: [
					this.blankQuestion("rating", "How much do you enjoy your lessons?"),
					this.blankQuestion("choice", "How do you learn best?", [
						"Group work",
						"On my own",
						"Hands-on activities",
						"Listening to the teacher",
					]),
					this.blankQuestion("yesno", "Do you feel safe at school?"),
				],
			},
			sme: {
				title: "Subject expert review",
				intro: "Review of curriculum content and delivery.",
				questions: [
					this.blankQuestion("rating", "How accurate and current is the curriculum content?"),
					this.blankQuestion("choice", "Overall recommendation", [
						"Keep as is",
						"Minor revisions",
						"Major revisions",
					]),
					this.blankQuestion("text", "Specific content recommendations"),
				],
			},
		};
	}

	storageKey() {
		const user = (frappe.session && frappe.session.user) || "guest";
		return "feedback-studio-v1:" + user;
	}

	load() {
		let saved = null;
		try {
			saved = JSON.parse(localStorage.getItem(this.storageKey()) || "null");
		} catch (e) {
			saved = null;
		}
		const forms = this.defaults();
		const incoming = (saved && saved.forms) || {};
		this.audMeta.forEach((a) => {
			const src = incoming[a.id];
			if (!src) return;
			forms[a.id] = {
				title: src.title != null ? String(src.title) : forms[a.id].title,
				intro: src.intro != null ? String(src.intro) : forms[a.id].intro,
				questions: Array.isArray(src.questions)
					? src.questions.map((q) => ({
							id: q.id || this.uid(),
							type: ["rating", "choice", "yesno", "text"].includes(q.type) ? q.type : "text",
							text: q.text || "",
							required: q.required !== false,
							options: Array.isArray(q.options) ? q.options.map((o) => String(o)) : [],
						}))
					: forms[a.id].questions,
			};
		});
		const responses = {};
		this.audMeta.forEach((a) => {
			const list = saved && saved.responses && saved.responses[a.id];
			responses[a.id] = Array.isArray(list) ? list : [];
		});
		return {
			aud: "school",
			mode: "edit",
			forms,
			responses,
			answers: {},
			errors: {},
			submitted: false,
			ratingScale: String(saved && saved.ratingScale) === "10" ? 10 : 5,
			links: {},
			shareOpen: false,
			copied: false,
			syncError: "",
		};
	}

	readLocalRaw() {
		try {
			return JSON.parse(localStorage.getItem(this.storageKey()) || "null");
		} catch (e) {
			return null;
		}
	}

	call(method, args, silent) {
		return frappe
			.call({
				method: "tif_customization.tif_customization.api.feedback_studio." + method,
				args: args || {},
				silent: !!silent,
			})
			.then((r) => r && r.message);
	}

	persist() {
		try {
			localStorage.setItem(
				this.storageKey(),
				JSON.stringify({
					forms: this.state.forms,
					responses: this.state.responses,
					ratingScale: this.state.ratingScale,
				})
			);
		} catch (e) {
			// Browser storage can be full or blocked; the page still works for this visit.
		}
	}

	save(patch) {
		Object.assign(this.state, patch);
		this.persist();
		this.render();
		this.queueSync();
	}

	queueSync() {
		if (!this._ready) return;
		clearTimeout(this._syncTimer);
		this._syncTimer = setTimeout(() => this.flushSync(), 450);
	}

	flushSync() {
		if (!this._ready) return Promise.resolve();
		clearTimeout(this._syncTimer);
		const seq = (this._syncSeq += 1);
		return this.call(
			"save_studio",
			{
				forms: JSON.stringify(this.state.forms),
				rating_scale: this.state.ratingScale,
			},
			true
		)
			.then((data) => {
				if (seq !== this._syncSeq || !data) return data;
				if (data.links) this.state.links = data.links;
				this.state.syncError = "";
				const note = this.$.find(".fs-sync").get(0);
				if (note) note.textContent = "";
				const input = this.$.find(".fs-share-url").get(0);
				const url = (this.state.links || {})[this.state.aud];
				if (input && url) input.value = url;
				return data;
			})
			.catch(() => {
				this.state.syncError = "Could not save. The share link may be out of date.";
				const note = this.$.find(".fs-sync").get(0);
				if (note) note.textContent = this.state.syncError;
			});
	}

	applyServer(data, shouldRender) {
		const forms = this.defaults();
		const incoming = (data && data.forms) || {};
		this.audMeta.forEach((a) => {
			const src = incoming[a.id];
			if (!src) return;
			forms[a.id] = {
				title: src.title != null ? String(src.title) : forms[a.id].title,
				intro: src.intro != null ? String(src.intro) : forms[a.id].intro,
				questions: Array.isArray(src.questions)
					? src.questions.map((q) => ({
							id: q.id || this.uid(),
							type: ["rating", "choice", "yesno", "text"].includes(q.type) ? q.type : "text",
							text: q.text || "",
							required: q.required !== false,
							options: Array.isArray(q.options) ? q.options.map((o) => String(o)) : [],
						}))
					: forms[a.id].questions,
			};
		});
		const responses = {};
		this.audMeta.forEach((a) => {
			const list = data && data.responses && data.responses[a.id];
			responses[a.id] = Array.isArray(list) ? list : [];
		});
		this.state.forms = forms;
		this.state.responses = responses;
		this.state.ratingScale = Number(data && data.ratingScale) === 10 ? 10 : 5;
		this.state.links = (data && data.links) || {};
		this._ready = true;
		this.persist();
		if (shouldRender !== false) this.render();
	}

	pull() {
		this.call("get_studio", {}, true)
			.then((data) => {
				if (!data) throw new Error("empty");
				if (!data.fresh) return data;
				const local = this.readLocalRaw();
				return this.call(
					"import_local",
					{
						forms: JSON.stringify((local && local.forms) || this.state.forms),
						rating_scale: (local && local.ratingScale) || this.state.ratingScale || 5,
						responses: JSON.stringify((local && local.responses) || {}),
					},
					true
				);
			})
			.then((data) => {
				if (data) this.applyServer(data);
			})
			.catch(() => {
				this._ready = true;
				this.state.syncError = "Could not reach the server. The share link is unavailable until this page can save.";
				this.render();
			});
	}

	refreshResponses() {
		const mode = this.state.mode;
		Promise.resolve(this.flushSync()).then((saved) => {
			return this.call("get_studio", {}, true).then((data) => {
				if (!data || data.fresh) return;
				if (!saved) {
					this.state.links = data.links || this.state.links;
					const responses = {};
					this.audMeta.forEach((a) => {
						const list = data.responses && data.responses[a.id];
						responses[a.id] = Array.isArray(list) ? list : [];
					});
					this.state.responses = responses;
					this.persist();
					if (this.state.mode === mode) this.render();
					return;
				}
				this.applyServer(data, this.state.mode === mode);
			});
		});
	}

	h(value) {
		return frappe.utils.escape_html(value == null ? "" : String(value));
	}

	current() {
		return this.audMeta.find((a) => a.id === this.state.aud) || this.audMeta[0];
	}

	form() {
		return this.state.forms[this.state.aud];
	}

	updForm(fn) {
		const forms = Object.assign({}, this.state.forms);
		const current = forms[this.state.aud];
		const next = {
			title: current.title,
			intro: current.intro,
			questions: current.questions.map((q) => Object.assign({}, q, { options: (q.options || []).slice() })),
		};
		fn(next);
		forms[this.state.aud] = next;
		this.save({ forms });
	}

	make() {
		$(this.wrapper).addClass("page-feedback-studio");
		$(this.page.wrapper).addClass("page-feedback-studio");
		this.page.clear_primary_action();
		$(this.page.wrapper).find(".page-head").hide();
		if (!document.getElementById("fs-fonts")) {
			const link = document.createElement("link");
			link.id = "fs-fonts";
			link.rel = "stylesheet";
			link.href =
				"https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&family=Newsreader:opsz,wght@6..72,500;6..72,600&display=swap";
			document.head.appendChild(link);
		}
		this.$ = $('<div class="fs"></div>').appendTo(this.page.body);
		this.$.on("click", "[data-act]", (e) => this.onClick(e));
		this.$.on("input change", "[data-field]", (e) => this.onField(e));
		this.$.html('<main class="fs-main"><div class="fs-empty">Loading feedback…</div></main>');
		this.pull();
	}

	onField(e) {
		const el = e.currentTarget;
		const tag = el.tagName;
		const isCheck = el.type === "checkbox";
		if (e.type === "change" && (tag === "INPUT" || tag === "TEXTAREA") && !isCheck) return;
		if (e.type === "input" && tag === "SELECT") return;
		const field = el.dataset.field;
		const i = Number(el.dataset.i);
		const j = Number(el.dataset.j);
		if (field === "title") {
			this.updForm((f) => {
				f.title = el.value;
			});
			return;
		}
		if (field === "intro") {
			this.updForm((f) => {
				f.intro = el.value;
			});
			return;
		}
		if (field === "scale") {
			this.save({ ratingScale: el.value === "10" ? 10 : 5 });
			return;
		}
		if (field === "qtext") {
			this.updForm((f) => {
				f.questions[i].text = el.value;
			});
			return;
		}
		if (field === "qtype") {
			const type = el.value;
			this.updForm((f) => {
				const q = f.questions[i];
				q.type = type;
				if (type === "choice" && !q.options.length) q.options = ["Option 1", "Option 2"];
			});
			return;
		}
		if (field === "qreq") {
			this.updForm((f) => {
				f.questions[i].required = el.checked;
			});
			return;
		}
		if (field === "opt") {
			this.updForm((f) => {
				f.questions[i].options[j] = el.value;
			});
			return;
		}
		if (field === "answer") {
			this.setAnswer(el.dataset.id, el.value);
		}
	}

	onClick(e) {
		const el = e.currentTarget;
		if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT") return;
		const act = el.dataset.act;
		const i = Number(el.dataset.i);
		const j = Number(el.dataset.j);
		if (act === "mode") {
			this.state.mode = el.dataset.val;
			this.state.submitted = false;
			this.state.errors = {};
			this.render();
			if (el.dataset.val === "resp") this.refreshResponses();
			return;
		}
		if (act === "share") {
			this.state.shareOpen = !this.state.shareOpen;
			this.state.copied = false;
			this.render();
			if (this.state.shareOpen) this.flushSync();
			return;
		}
		if (act === "copy") {
			this.flushSync().then(() => this.copyLink((this.state.links || {})[this.state.aud] || ""));
			return;
		}
		if (act === "rotate") {
			frappe.confirm(
				__("The current link will stop working. People will need the new link."),
				() => {
					this.call("rotate_link", { audience: this.state.aud }).then((url) => {
						if (!url) return;
						this.state.links[this.state.aud] = url;
						this.state.copied = false;
						this.render();
					});
				}
			);
			return;
		}
		if (act === "aud") {
			this.state.aud = el.dataset.val;
			this.state.answers = {};
			this.state.errors = {};
			this.state.submitted = false;
			this.render();
			return;
		}
		if (act === "up") {
			if (i > 0) {
				this.updForm((f) => {
					const qs = f.questions;
					const prev = qs[i - 1];
					qs[i - 1] = qs[i];
					qs[i] = prev;
				});
			}
			return;
		}
		if (act === "down") {
			this.updForm((f) => {
				if (i < f.questions.length - 1) {
					const qs = f.questions;
					const next = qs[i + 1];
					qs[i + 1] = qs[i];
					qs[i] = next;
				}
			});
			return;
		}
		if (act === "dup") {
			this.updForm((f) => {
				const q = f.questions[i];
				f.questions.splice(i + 1, 0, {
					id: this.uid(),
					type: q.type,
					text: q.text,
					required: q.required,
					options: q.options.slice(),
				});
			});
			return;
		}
		if (act === "del") {
			this.updForm((f) => {
				f.questions.splice(i, 1);
			});
			return;
		}
		if (act === "addopt") {
			this.updForm((f) => {
				const q = f.questions[i];
				q.options.push("Option " + (q.options.length + 1));
			});
			return;
		}
		if (act === "delopt") {
			this.updForm((f) => {
				f.questions[i].options.splice(j, 1);
			});
			return;
		}
		if (act === "add") {
			const type = el.dataset.val;
			this.updForm((f) => {
				f.questions.push(this.blankQuestion(type, ""));
			});
			return;
		}
		if (act === "goto") {
			this.state.mode = el.dataset.val;
			this.state.submitted = false;
			this.state.errors = {};
			this.render();
			return;
		}
		if (act === "again") {
			this.state.answers = {};
			this.state.errors = {};
			this.state.submitted = false;
			this.render();
			return;
		}
		if (act === "rate" || act === "choice" || act === "yn") {
			const q = this.form().questions[i];
			if (!q) return;
			let value = el.dataset.val;
			if (act === "rate") value = Number(value);
			if (act === "choice") value = q.options[j];
			this.setAnswer(q.id, value);
			return;
		}
		if (act === "submit") this.submit();
		if (act === "clear") {
			const aud = this.state.aud;
			this.call("clear_responses", { audience: aud }).then(() => {
				this.state.responses[aud] = [];
				this.persist();
				this.render();
			});
		}
	}

	copyLink(url) {
		if (!url) return;
		const done = () => {
			this.state.copied = true;
			this.render();
			frappe.show_alert({ message: __("Link copied"), indicator: "green" });
			setTimeout(() => {
				this.state.copied = false;
				if (this.state.shareOpen) this.render();
			}, 1600);
		};
		if (navigator.clipboard && navigator.clipboard.writeText) {
			navigator.clipboard.writeText(url).then(done).catch(() => this.copyFallback(done));
			return;
		}
		this.copyFallback(done);
	}

	copyFallback(done) {
		const input = this.$.find(".fs-share-url").get(0);
		if (!input) return;
		input.focus();
		input.select();
		try {
			document.execCommand("copy");
			done();
		} catch (e) {
			// The link stays selected so it can be copied manually.
		}
	}

	setAnswer(id, value) {
		const answers = Object.assign({}, this.state.answers);
		answers[id] = value;
		const errors = Object.assign({}, this.state.errors);
		delete errors[id];
		this.state.answers = answers;
		this.state.errors = errors;
		this.render();
	}

	submit() {
		const form = this.form();
		const answers = this.state.answers;
		const errs = {};
		form.questions.forEach((q) => {
			if (q.required && (answers[q.id] === undefined || answers[q.id] === "")) errs[q.id] = true;
		});
		if (Object.keys(errs).length) {
			this.state.errors = errs;
			this.render();
			const bad = this.$.find(".has-err").get(0);
			if (bad) bad.scrollIntoView({ block: "center", behavior: "smooth" });
			return;
		}
		const aud = this.state.aud;
		this.call("submit_response", { audience: aud, answers: JSON.stringify(answers) }).then((rows) => {
			if (!rows) return;
			this.state.responses[aud] = rows;
			this.state.submitted = true;
			this.state.answers = {};
			this.state.errors = {};
			this.persist();
			this.render();
		});
	}

	scale() {
		return Array.from({ length: this.state.ratingScale }, (_, n) => n + 1);
	}

	render() {
		const active = document.activeElement;
		let field = null;
		let start = null;
		let end = null;
		if (active && this.$.length && this.$[0].contains(active) && active.dataset && active.dataset.field) {
			field = active.getAttribute("data-field-key") || active.dataset.field;
			start = active.selectionStart;
			end = active.selectionEnd;
		}
		const aud = this.current();
		this.$.attr("style", "--accent:" + aud.color);
		this.$.html(this.header() + '<main class="fs-main">' + this.body() + "</main>");
		if (!field) return;
		const el = this.$.find('[data-field-key="' + CSS.escape(field) + '"]').get(0);
		if (!el) return;
		el.focus();
		if (typeof start === "number" && el.setSelectionRange) {
			try {
				el.setSelectionRange(start, end);
			} catch (e) {
				// Some inputs (checkbox, select) have no caret.
			}
		}
	}

	header() {
		const { mode, forms, ratingScale } = this.state;
		const aud = this.current();
		const modes = [
			["edit", "Edit questions"],
			["take", "Answer"],
			["resp", "Responses"],
		];
		const modeBtns = modes
			.map(([id, label]) => {
				return (
					'<button type="button" class="fs-mode' +
					(mode === id ? " is-on" : "") +
					'" data-act="mode" data-val="' +
					id +
					'">' +
					this.h(label) +
					"</button>"
				);
			})
			.join("");
		const tabs = this.audMeta
			.map((a) => {
				const on = a.id === aud.id;
				const count = (forms[a.id].questions || []).length;
				return (
					'<button type="button" class="fs-aud' +
					(on ? " is-on" : "") +
					'" style="--aud:' +
					a.color +
					'" data-act="aud" data-val="' +
					a.id +
					'">' +
					'<span class="fs-dot"></span><span>' +
					this.h(a.label) +
					'</span><span class="fs-count">' +
					count +
					"</span></button>"
				);
			})
			.join("");
		return (
			'<header class="fs-header"><div class="fs-wrap"><div class="fs-top"><div><div class="fs-brand">Feedback Studio</div>' +
			'<div class="fs-tag">Write, change and collect feedback for every group in your school.</div></div>' +
			'<div class="fs-tools"><button type="button" class="fs-share-btn' +
			(this.state.shareOpen ? " is-on" : "") +
			'" data-act="share">Share link</button><label class="fs-scale"><span>Rating scale</span><select data-field="scale" data-field-key="scale">' +
			'<option value="5"' +
			(ratingScale === 5 ? " selected" : "") +
			">1 – 5</option>" +
			'<option value="10"' +
			(ratingScale === 10 ? " selected" : "") +
			">1 – 10</option></select></label>" +
			'<div class="fs-modes">' +
			modeBtns +
			'</div></div></div><nav class="fs-nav">' +
			tabs +
			"</nav></div></header>"
		);
	}

	body() {
		const panel = this.sharePanel();
		if (this.state.mode === "take") return panel + this.takeView();
		if (this.state.mode === "resp") return panel + this.respView();
		return panel + this.editView();
	}

	sharePanel() {
		if (!this.state.shareOpen) return "";
		const aud = this.current();
		const url = (this.state.links || {})[aud.id] || "";
		const field = url
			? '<div class="fs-share-row"><input class="fs-share-url" readonly value="' +
				this.h(url) +
				'"><button type="button" class="fs-primary" data-act="copy">' +
				(this.state.copied ? "Copied" : "Copy link") +
				"</button></div>" +
				'<div class="fs-share-actions"><a href="' +
				this.h(url) +
				'" target="_blank" rel="noopener">Open link</a>' +
				'<button type="button" class="fs-mini" data-act="rotate">Create a new link</button></div>'
			: '<div class="fs-note">Preparing the link…</div>';
		return (
			'<div class="fs-card accent fs-share"><div class="fs-kicker">Share link · ' +
			this.h(aud.label) +
			'</div><p class="fs-share-note">Anyone with this link can fill the ' +
			this.h(aud.label) +
			' form. They do not need an account. The link shows the latest saved questions.</p>' +
			field +
			'<div class="fs-sync">' +
			this.h(this.state.syncError || "") +
			"</div></div>"
		);
	}

	editView() {
		const aud = this.current();
		const form = this.form();
		const scale = this.scale();
		const questions = form.questions
			.map((q, i) => {
				const opts =
					q.type === "choice"
						? '<div class="fs-opts">' +
							q.options
								.map((o, j) => {
									return (
										'<div class="fs-opt"><span class="fs-radio-ghost"></span>' +
										'<input data-field="opt" data-field-key="opt-' +
										i +
										"-" +
										j +
										'" data-i="' +
										i +
										'" data-j="' +
										j +
										'" value="' +
										this.h(o) +
										'" placeholder="Option">' +
										'<button type="button" class="fs-x" data-act="delopt" data-i="' +
										i +
										'" data-j="' +
										j +
										'" title="Remove option">×</button></div>'
									);
								})
								.join("") +
							'<button type="button" class="fs-link" data-act="addopt" data-i="' +
							i +
							'">+ Add option</button></div>'
						: "";
				const rating =
					q.type === "rating"
						? '<div class="fs-scale-preview">' +
							scale.map((n) => '<span class="fs-pip">' + n + "</span>").join("") +
							'<span class="fs-hint">Poor → Excellent</span></div>'
						: "";
				const yesno = q.type === "yesno" ? '<div class="fs-note">Respondent picks Yes or No</div>' : "";
				const text =
					q.type === "text"
						? '<div class="fs-dashed-inline">Respondent writes a free-text answer</div>'
						: "";
				const typeOpt = (value, label) =>
					'<option value="' + value + '"' + (q.type === value ? " selected" : "") + ">" + label + "</option>";
				return (
					'<div class="fs-card"><div class="fs-qhead"><span class="fs-qnum">Q' +
					(i + 1) +
					"</span>" +
					'<select class="fs-select" data-field="qtype" data-field-key="qtype-' +
					i +
					'" data-i="' +
					i +
					'">' +
					typeOpt("rating", "Rating scale") +
					typeOpt("choice", "Multiple choice") +
					typeOpt("yesno", "Yes / No") +
					typeOpt("text", "Written answer") +
					"</select>" +
					'<label class="fs-req"><input type="checkbox" data-field="qreq" data-i="' +
					i +
					'"' +
					(q.required ? " checked" : "") +
					"><span>Required</span></label>" +
					'<div class="fs-spacer"></div><div class="fs-iconrow">' +
					'<button type="button" class="fs-icon" data-act="up" data-i="' +
					i +
					'" title="Move up">↑</button>' +
					'<button type="button" class="fs-icon" data-act="down" data-i="' +
					i +
					'" title="Move down">↓</button>' +
					'<button type="button" class="fs-mini" data-act="dup" data-i="' +
					i +
					'" title="Duplicate">Copy</button>' +
					'<button type="button" class="fs-mini danger" data-act="del" data-i="' +
					i +
					'" title="Delete">Delete</button></div></div>' +
					'<input class="fs-qtext" data-field="qtext" data-field-key="qtext-' +
					i +
					'" data-i="' +
					i +
					'" value="' +
					this.h(q.text) +
					'" placeholder="Type your question here…">' +
					opts +
					rating +
					yesno +
					text +
					"</div>"
				);
			})
			.join("");
		const empty = form.questions.length
			? ""
			: '<div class="fs-empty">No questions yet. Add the first one below.</div>';
		return (
			'<div class="fs-stack"><div class="fs-card accent"><div class="fs-kicker">' +
			this.h(aud.label) +
			" feedback · " +
			this.h(aud.hint) +
			"</div>" +
			'<input class="fs-title-input" data-field="title" data-field-key="title" value="' +
			this.h(form.title) +
			'" placeholder="Form title">' +
			'<textarea class="fs-intro-input" data-field="intro" data-field-key="intro" rows="2" placeholder="Short introduction shown to respondents">' +
			this.h(form.intro) +
			"</textarea></div>" +
			questions +
			empty +
			'<div class="fs-addbar">' +
			'<button type="button" class="fs-add" data-act="add" data-val="rating">+ Rating</button>' +
			'<button type="button" class="fs-add" data-act="add" data-val="choice">+ Multiple choice</button>' +
			'<button type="button" class="fs-add" data-act="add" data-val="yesno">+ Yes / No</button>' +
			'<button type="button" class="fs-add" data-act="add" data-val="text">+ Written answer</button>' +
			'<div class="fs-spacer"></div>' +
			'<button type="button" class="fs-primary" data-act="goto" data-val="take">Preview form →</button></div></div>'
		);
	}

	takeView() {
		if (this.state.submitted) {
			return (
				'<div class="fs-stack"><div class="fs-card accent fs-thanks"><h2>Thank you</h2>' +
				"<p>Your feedback has been recorded. It helps us improve.</p>" +
				'<div class="fs-row"><button type="button" class="fs-ghost" data-act="again">Submit another</button>' +
				'<button type="button" class="fs-primary" data-act="goto" data-val="resp">View responses</button></div></div></div>'
			);
		}
		const aud = this.current();
		const form = this.form();
		const scale = this.scale();
		const answers = this.state.answers;
		const errors = this.state.errors;
		const cards = form.questions
			.map((q, i) => {
				const val = answers[q.id];
				const hasErr = !!errors[q.id];
				let control = "";
				if (q.type === "rating") {
					control =
						'<div><div class="fs-rates">' +
						scale
							.map((n) => {
								return (
									'<button type="button" class="fs-rate' +
									(val === n ? " is-on" : "") +
									'" data-act="rate" data-i="' +
									i +
									'" data-val="' +
									n +
									'">' +
									n +
									"</button>"
								);
							})
							.join("") +
						'</div><div class="fs-scale-caption">1 = Poor · ' +
						this.state.ratingScale +
						" = Excellent</div></div>";
				} else if (q.type === "choice") {
					control =
						'<div class="fs-choices">' +
						(q.options || [])
							.map((o, j) => {
								return (
									'<button type="button" class="fs-choice' +
									(val === o ? " is-on" : "") +
									'" data-act="choice" data-i="' +
									i +
									'" data-j="' +
									j +
									'"><span class="fs-choice-dot"></span><span>' +
									this.h(o) +
									"</span></button>"
								);
							})
							.join("") +
						"</div>";
				} else if (q.type === "yesno") {
					control =
						'<div class="fs-ynrow">' +
						["Yes", "No"]
							.map((o) => {
								return (
									'<button type="button" class="fs-yn' +
									(val === o ? " is-on" : "") +
									'" data-act="yn" data-i="' +
									i +
									'" data-val="' +
									o +
									'">' +
									o +
									"</button>"
								);
							})
							.join("") +
						"</div>";
				} else {
					control =
						'<textarea class="fs-answer-text" data-field="answer" data-field-key="answer-' +
						this.h(q.id) +
						'" data-id="' +
						this.h(q.id) +
						'" rows="3" placeholder="Write your answer…">' +
						this.h(val || "") +
						"</textarea>";
				}
				const err = hasErr ? '<div class="fs-err">This question is required.</div>' : "";
				return (
					'<div class="fs-card' +
					(hasErr ? " has-err" : "") +
					'"><div class="fs-prompt"><span class="fs-prompt-num">' +
					(i + 1) +
					'.</span><span class="fs-prompt-text">' +
					this.h(q.text || "Untitled question") +
					(q.required ? '<span class="fs-star"> *</span>' : "") +
					"</span></div>" +
					control +
					err +
					"</div>"
				);
			})
			.join("");
		const answered = form.questions.filter((q) => answers[q.id] !== undefined && answers[q.id] !== "").length;
		return (
			'<div class="fs-stack"><div class="fs-card accent"><div class="fs-kicker">' +
			this.h(aud.label) +
			' feedback</div><div class="fs-display-title">' +
			this.h(form.title) +
			'</div><div class="fs-display-intro">' +
			this.h(form.intro) +
			"</div></div>" +
			cards +
			'<div class="fs-submitrow"><span class="fs-progress">' +
			answered +
			" of " +
			form.questions.length +
			' answered</span><button type="button" class="fs-primary accent" data-act="submit">Submit feedback</button></div></div>'
		);
	}

	respView() {
		const aud = this.current();
		const form = this.form();
		const resp = this.state.responses[this.state.aud] || [];
		const scale = this.scale();
		const label =
			resp.length + (resp.length === 1 ? " response" : " responses");
		const empty = resp.length
			? ""
			: '<div class="fs-empty">No responses yet. Use <strong>Share link</strong> so people can respond, or open <strong>Answer</strong> to submit a test response.</div>';
		const cards = form.questions
			.map((q, i) => {
				const vals = resp
					.map((r) => (r.answers ? r.answers[q.id] : undefined))
					.filter((v) => v !== undefined && v !== "");
				const countOf = (v) => vals.filter((x) => x === v).length;
				const bar = (name, count) => {
					const pct = vals.length ? Math.round((count / vals.length) * 100) : 0;
					return (
						'<div class="fs-bar"><span class="fs-bar-label">' +
						this.h(name) +
						'</span><div class="fs-track"><div class="fs-fill" style="width:' +
						pct +
						'%"></div></div><span class="fs-bar-count">' +
						count +
						"</span></div>"
					);
				};
				let bars = "";
				if (q.type === "rating") {
					bars = scale
						.slice()
						.reverse()
						.map((n) => bar(String(n), countOf(n)))
						.join("");
				} else if (q.type === "choice") {
					bars = (q.options || []).map((o) => bar(o, countOf(o))).join("");
				} else if (q.type === "yesno") {
					bars = ["Yes", "No"].map((o) => bar(o, countOf(o))).join("");
				}
				const nums = vals.filter((v) => typeof v === "number");
				const avg = nums.length ? (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1) : "";
				const avgHtml =
					q.type === "rating" && nums.length
						? '<div class="fs-avg">' +
							avg +
							"<span> / " +
							this.state.ratingScale +
							" average</span></div>"
						: "";
				const barsHtml = q.type !== "text" && vals.length ? '<div class="fs-bars">' + bars + "</div>" : "";
				const texts =
					q.type === "text" && vals.length
						? '<div class="fs-quotes">' +
							vals
								.slice(-6)
								.reverse()
								.map((t) => '<div class="fs-quote">' + this.h(t) + "</div>")
								.join("") +
							"</div>"
						: "";
				return (
					'<div class="fs-card"><div class="fs-sum-top"><span class="fs-sum-q">' +
					(i + 1) +
					". " +
					this.h(q.text || "Untitled question") +
					'</span><span class="fs-sum-n">' +
					vals.length +
					' answered</span></div>' +
					avgHtml +
					barsHtml +
					texts +
					"</div>"
				);
			})
			.join("");
		return (
			'<div class="fs-stack"><div class="fs-resphead"><div><div class="fs-kicker">' +
			this.h(aud.label) +
			' responses</div><div class="fs-resp-count">' +
			this.h(label) +
			'</div></div><button type="button" class="fs-clear" data-act="clear">Clear responses</button></div>' +
			empty +
			cards +
			"</div>"
		);
	}
};
