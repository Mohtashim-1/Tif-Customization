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
			smeName: "",
			customer: "",
			customerLabel: "",
			customerQuery: "",
			schoolHits: [],
			schoolOpen: false,
			schoolSearching: false,
			schoolTimer: null,
			createSchool: false,
			schoolOpening: {
				school_name: "",
				city: "",
				area: "",
				province: "",
				address: "",
				school_mobile: "",
				school_email: "",
				principal_name: "",
				principal_cell: "",
				visit_type: "Visit with enrollment",
			},
			smeContext: null,
			shareResult: null,
			shareCopied: false,
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
		this.loadSmeContext();
	}

	loadSmeContext() {
		this.call("get_sme_context", {}, true)
			.then((data) => {
				if (!data) return;
				this.state.smeContext = data;
				if (!this.state.smeName && data.default_sme) this.state.smeName = data.default_sme;
				if (this.state.mode === "take" && this.state.aud === "sme") this.render();
			})
			.catch(() => {});
	}

	clientMeta() {
		const nav = window.navigator || {};
		const scr = window.screen || {};
		const conn = nav.connection || nav.mozConnection || nav.webkitConnection || {};
		return {
			platform: nav.platform || "",
			language: nav.language || "",
			languages: Array.isArray(nav.languages) ? nav.languages.slice(0, 8) : [],
			timezone: (Intl.DateTimeFormat().resolvedOptions().timeZone) || "",
			timezoneOffset: new Date().getTimezoneOffset(),
			screenWidth: scr.width || 0,
			screenHeight: scr.height || 0,
			availWidth: scr.availWidth || 0,
			availHeight: scr.availHeight || 0,
			colorDepth: scr.colorDepth || 0,
			pixelRatio: window.devicePixelRatio || 1,
			viewportWidth: window.innerWidth || 0,
			viewportHeight: window.innerHeight || 0,
			touchPoints: nav.maxTouchPoints || 0,
			cookieEnabled: !!nav.cookieEnabled,
			doNotTrack: nav.doNotTrack || "",
			hardwareConcurrency: nav.hardwareConcurrency || 0,
			deviceMemory: nav.deviceMemory || 0,
			connectionType: conn.effectiveType || "",
			connectionDownlink: conn.downlink || 0,
			referrer: document.referrer || "",
			pageUrl: location.href || "",
			online: !!nav.onLine,
			macAddress: "",
		};
	}

	qrImg(url) {
		return (
			"https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=" +
			encodeURIComponent(url || "")
		);
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
			return;
		}
		if (field === "smeName") {
			this.state.smeName = el.value;
			return;
		}
		if (field === "customerQuery") {
			this.state.customerQuery = el.value;
			if (this.state.customer && el.value !== this.state.customerLabel) {
				this.state.customer = "";
				this.state.customerLabel = "";
				const picked = this.$.find(".fs-picked").get(0);
				if (picked) picked.style.display = "none";
			}
			this.state.schoolOpen = true;
			this.queueSchoolSearch(el.value);
			// Do not full-render — remounting reverses typed characters.
			this.updateSchoolDropdown();
			return;
		}
		if (field === "customer") {
			this.state.customer = el.value;
			const opt = (el.options && el.selectedIndex >= 0 && el.options[el.selectedIndex]) || null;
			this.state.customerLabel = opt ? opt.textContent : el.value;
			this.state.createSchool = false;
			this.render();
			return;
		}
		if (field === "soa") {
			const key = el.dataset.key;
			if (!key) return;
			this.state.schoolOpening[key] = el.value;
			return;
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
			this.state.shareResult = null;
			this.render();
			return;
		}
		if (act === "toggle-create-school") {
			this.state.createSchool = !this.state.createSchool;
			if (this.state.createSchool) {
				this.state.customer = "";
				this.state.customerLabel = "";
				this.state.schoolOpen = false;
				if (!this.state.schoolOpening.school_name && this.state.customerQuery) {
					this.state.schoolOpening.school_name = this.state.customerQuery;
				}
			}
			this.render();
			return;
		}
		if (act === "pick-school") {
			const hit = (this.state.schoolHits || [])[Number(el.dataset.i)];
			if (!hit) return;
			this.state.customer = hit.value || "";
			this.state.customerLabel = hit.label || hit.value || "";
			this.state.customerQuery = this.state.customerLabel;
			this.state.schoolHits = [];
			this.state.schoolOpen = false;
			this.state.createSchool = false;
			this.render();
			return;
		}
		if (act === "copy-share") {
			const url = (this.state.shareResult && this.state.shareResult.share_url) || "";
			if (!url) return;
			const done = () => {
				this.state.shareCopied = true;
				this.render();
				frappe.show_alert({ message: __("Link copied"), indicator: "green" });
				setTimeout(() => {
					this.state.shareCopied = false;
					if (this.state.shareResult) this.render();
				}, 1600);
			};
			if (navigator.clipboard && navigator.clipboard.writeText) {
				navigator.clipboard.writeText(url).then(done).catch(() => {
					const input = this.$.find(".fs-share-result-url").get(0);
					if (!input) return;
					input.focus();
					input.select();
					try {
						document.execCommand("copy");
						done();
					} catch (err) {}
				});
			} else {
				const input = this.$.find(".fs-share-result-url").get(0);
				if (!input) return;
				input.focus();
				input.select();
				try {
					document.execCommand("copy");
					done();
				} catch (err) {}
			}
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
			this.state.shareResult = null;
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
		const meta = this.clientMeta();
		if (aud === "sme") {
			if (this._smeLinkControl) this.state.smeName = this._smeLinkControl.get_value() || this.state.smeName;
			if (this._customerLinkControl && !this.state.createSchool) {
				this.state.customer = this._customerLinkControl.get_value() || this.state.customer;
			}
			if (!(this.state.smeName || "").trim()) {
				frappe.msgprint(__("Please select your SME name (Field Officer)."));
				return;
			}
			if (!this.state.createSchool && !(this.state.customer || "").trim()) {
				frappe.msgprint(__("Select a Customer / school, or create one with the School Opening form."));
				return;
			}
			if (this.state.createSchool) {
				const soa = this.state.schoolOpening || {};
				if (!(soa.school_name || "").trim()) {
					frappe.msgprint(__("Name of School is required to create a School Opening."));
					return;
				}
			}
			const args = {
				answers: JSON.stringify(answers),
				sme_name: this.state.smeName,
				client_meta: JSON.stringify(meta),
			};
			if (this.state.createSchool) {
				const soa = Object.assign({}, this.state.schoolOpening);
				soa.tif_representative = this.state.smeName;
				soa.key_contacts = {
					Principal: {
						name: soa.principal_name || "",
						cell: soa.principal_cell || "",
					},
				};
				args.school_opening = JSON.stringify(soa);
			} else {
				args.customer = this.state.customer;
			}
			this.call("submit_sme_response", args).then((data) => {
				if (!data) return;
				this.state.responses.sme = data.responses || this.state.responses.sme;
				this.state.submitted = true;
				this.state.shareResult = data;
				this.state.answers = {};
				this.state.errors = {};
				this.persist();
				this.render();
			});
			return;
		}
		this.call("submit_response", {
			audience: aud,
			answers: JSON.stringify(answers),
			client_meta: JSON.stringify(meta),
		}).then((rows) => {
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
		this.mountSmeLinkControls();
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
			if (this.state.aud === "sme" && this.state.shareResult && this.state.shareResult.share_url) {
				const share = this.state.shareResult;
				const url = share.share_url;
				const school = share.school_name || share.customer || "";
				return (
					'<div class="fs-stack"><div class="fs-card accent fs-thanks"><h2>Thank you</h2>' +
					"<p>Your SME feedback is saved. Share this QR or link with parents, the school, or students so they can submit their feedback.</p>" +
					(school
						? '<div class="fs-share-school">School: <strong>' + this.h(school) + "</strong></div>"
						: "") +
					(share.school_opening
						? '<div class="fs-note">School Opening created: ' +
							this.h(share.school_opening) +
							" (pending approval into Customer).</div>"
						: "") +
					'<div class="fs-qr-wrap"><img class="fs-qr" src="' +
					this.h(this.qrImg(url)) +
					'" alt="Feedback QR code" width="220" height="220">' +
					'<div class="fs-share-row"><input class="fs-share-url fs-share-result-url" readonly value="' +
					this.h(url) +
					'"><button type="button" class="fs-primary" data-act="copy-share">' +
					(this.state.shareCopied ? "Copied" : "Copy link") +
					"</button></div>" +
					'<div class="fs-share-actions"><a href="' +
					this.h(url) +
					'" target="_blank" rel="noopener">Open link</a></div>' +
					'<p class="fs-share-note">Anyone who opens the link chooses Parent, School, or Student, then fills that form. Each response records IP and device details.</p></div>' +
					'<div class="fs-row"><button type="button" class="fs-ghost" data-act="again">Submit another</button>' +
					'<button type="button" class="fs-primary" data-act="goto" data-val="resp">View responses</button></div></div></div>'
				);
			}
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
		const smeMeta = this.state.aud === "sme" ? this.smeMetaPanel() : "";
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
			smeMeta +
			cards +
			'<div class="fs-submitrow"><span class="fs-progress">' +
			answered +
			" of " +
			form.questions.length +
			' answered</span><button type="button" class="fs-primary accent" data-act="submit">Submit feedback</button></div></div>'
		);
	}

	queueSchoolSearch(txt) {
		const q = (txt || "").trim();
		clearTimeout(this.state.schoolTimer);
		if (q.length < 2) {
			this.state.schoolHits = [];
			this.state.schoolSearching = false;
			this.updateSchoolDropdown();
			return;
		}
		this.state.schoolSearching = true;
		this.updateSchoolDropdown();
		const seq = (this.state.schoolSeq = (this.state.schoolSeq || 0) + 1);
		this.state.schoolTimer = setTimeout(() => {
			this.call("search_customers", { txt: q, limit: 40 }, true)
				.then((rows) => {
					if (seq !== this.state.schoolSeq) return;
					this.state.schoolHits = Array.isArray(rows) ? rows : [];
					this.state.schoolSearching = false;
					this.state.schoolOpen = true;
					this.updateSchoolDropdown();
				})
				.catch(() => {
					if (seq !== this.state.schoolSeq) return;
					this.state.schoolHits = [];
					this.state.schoolSearching = false;
					this.updateSchoolDropdown();
				});
		}, 250);
	}

	updateSchoolDropdown() {
		const list = this.$.find(".fs-ac-list").get(0);
		if (!list) return;
		const hits = this.state.schoolHits || [];
		const q = (this.state.customerQuery || "").trim();
		let html = "";
		if (this.state.schoolSearching) {
			html = '<div class="fs-ac-empty">Searching Customer…</div>';
		} else if (hits.length) {
			html = hits
				.map((c, i) => {
					const label = c.label || c.value || "";
					const desc = c.description || c.city || "";
					return (
						'<button type="button" class="fs-ac-item" data-act="pick-school" data-i="' +
						i +
						'"><div class="fs-ac-label">' +
						this.h(label) +
						"</div>" +
						(desc ? '<div class="fs-ac-desc">' + this.h(desc) + "</div>" : "") +
						"</button>"
					);
				})
				.join("");
		} else {
			html =
				'<div class="fs-ac-empty">' +
				(q.length < 2
					? "Type at least 2 letters to search Customer."
					: "No Customer found. Create with School Opening.") +
				"</div>";
		}
		list.innerHTML = html;
		list.style.display = this.state.schoolOpen && !this.state.createSchool ? "block" : "none";
		const picked = this.$.find(".fs-picked").get(0);
		if (picked) {
			picked.style.display = this.state.customer && !this.state.createSchool ? "flex" : "none";
			const label = picked.querySelector(".fs-picked-label");
			if (label) label.textContent = "Selected: " + (this.state.customerLabel || this.state.customer || "");
		}
	}

	smeMetaPanel() {
		const ctx = this.state.smeContext || {};
		const provinces = (ctx.provinces || [])
			.map((p) => {
				return (
					'<option value="' +
					this.h(p) +
					'"' +
					(this.state.schoolOpening.province === p ? " selected" : "") +
					">" +
					this.h(p) +
					"</option>"
				);
			})
			.join("");
		const soa = this.state.schoolOpening;
		const createPanel = this.state.createSchool
			? '<div class="fs-soa">' +
				'<div class="fs-soa-title">School Opening — create school</div>' +
				'<p class="fs-share-note">School is not in Customer yet. Save a School Opening request (same as Easy Form). After approval it becomes a Customer.</p>' +
				'<div class="fs-soa-grid">' +
				'<label class="fs-field"><span>Name of School *</span><input data-field="soa" data-key="school_name" data-field-key="soa-school_name" dir="ltr" value="' +
				this.h(soa.school_name || "") +
				'"></label>' +
				'<label class="fs-field"><span>City</span><input data-field="soa" data-key="city" data-field-key="soa-city" dir="ltr" value="' +
				this.h(soa.city || "") +
				'"></label>' +
				'<label class="fs-field"><span>Area</span><input data-field="soa" data-key="area" data-field-key="soa-area" dir="ltr" value="' +
				this.h(soa.area || "") +
				'"></label>' +
				'<label class="fs-field"><span>Province</span><select data-field="soa" data-key="province" data-field-key="soa-province"><option value="">Select…</option>' +
				provinces +
				"</select></label>" +
				'<label class="fs-field fs-span2"><span>Address</span><input data-field="soa" data-key="address" data-field-key="soa-address" dir="ltr" value="' +
				this.h(soa.address || "") +
				'"></label>' +
				'<label class="fs-field"><span>School mobile</span><input data-field="soa" data-key="school_mobile" data-field-key="soa-mobile" dir="ltr" value="' +
				this.h(soa.school_mobile || "") +
				'"></label>' +
				'<label class="fs-field"><span>School email</span><input data-field="soa" data-key="school_email" data-field-key="soa-email" dir="ltr" value="' +
				this.h(soa.school_email || "") +
				'"></label>' +
				'<label class="fs-field"><span>Principal name</span><input data-field="soa" data-key="principal_name" data-field-key="soa-pname" dir="ltr" value="' +
				this.h(soa.principal_name || "") +
				'"></label>' +
				'<label class="fs-field"><span>Principal cell</span><input data-field="soa" data-key="principal_cell" data-field-key="soa-pcell" dir="ltr" value="' +
				this.h(soa.principal_cell || "") +
				'"></label>' +
				"</div></div>"
			: "";
		return (
			'<div class="fs-card fs-sme-meta"><div class="fs-kicker">SME visit details</div>' +
			'<p class="fs-share-note">Uses Frappe <strong>Link</strong> fields: SME → <strong>Field Officer</strong>, School → <strong>Customer</strong>.</p>' +
			'<div class="fs-soa-grid">' +
			'<label class="fs-field"><span>SME name (Field Officer) *</span><div class="fs-link-mount" data-link="sme"></div></label>' +
			'<label class="fs-field fs-span2"><span>Customer / school *</span><div class="fs-link-mount" data-link="customer"></div></label></div>' +
			'<div class="fs-share-actions" style="margin-top:12px">' +
			'<button type="button" class="fs-mini' +
			(this.state.createSchool ? " is-on" : "") +
			'" data-act="toggle-create-school">' +
			(this.state.createSchool ? "Cancel new school" : "School not listed? Create with School Opening") +
			"</button>" +
			(this.state.createSchool
				? ""
				: ' · <a href="/school-opening" target="_blank" rel="noopener">Open full School Opening form</a>') +
			"</div>" +
			createPanel +
			"</div>"
		);
	}

	mountSmeLinkControls() {
		if (this.state.mode !== "take" || this.state.aud !== "sme" || this.state.submitted) return;
		const smeMount = this.$.find('[data-link="sme"]').get(0);
		const custMount = this.$.find('[data-link="customer"]').get(0);
		if (!smeMount || !custMount || !frappe.ui.form.make_control) return;

		if (this._smeLinkControl) {
			try {
				this._smeLinkControl.$wrapper.remove();
			} catch (e) {}
			this._smeLinkControl = null;
		}
		if (this._customerLinkControl) {
			try {
				this._customerLinkControl.$wrapper.remove();
			} catch (e) {}
			this._customerLinkControl = null;
		}

		this._smeLinkControl = frappe.ui.form.make_control({
			df: {
				fieldtype: "Link",
				options: "Field Officer",
				fieldname: "sme_field_officer",
				label: "Field Officer",
				reqd: 1,
				get_query: () => ({ filters: { status: "Active" } }),
			},
			parent: smeMount,
			render_input: true,
		});
		this._smeLinkControl.refresh();
		if (this.state.smeName) this._smeLinkControl.set_value(this.state.smeName);
		const syncSme = () => {
			this.state.smeName = this._smeLinkControl.get_value() || "";
		};
		this._smeLinkControl.$input.on("awesomplete-selectcomplete change blur", syncSme);

		this._customerLinkControl = frappe.ui.form.make_control({
			df: {
				fieldtype: "Link",
				options: "Customer",
				fieldname: "sme_customer",
				label: "Customer",
				reqd: 1,
				get_query: () => {
					const filters = {};
					try {
						if (frappe.get_meta("Customer").has_field("disabled")) filters.disabled = 0;
					} catch (e) {}
					return { filters };
				},
			},
			parent: custMount,
			render_input: true,
		});
		this._customerLinkControl.refresh();
		if (this.state.customer && !this.state.createSchool) {
			this._customerLinkControl.set_value(this.state.customer);
		}
		if (this.state.createSchool) {
			this._customerLinkControl.$input.prop("disabled", true);
		}
		const syncCust = () => {
			const val = this._customerLinkControl.get_value() || "";
			this.state.customer = val;
			this.state.customerLabel = val;
			this.state.customerQuery = val;
			if (val) this.state.createSchool = false;
		};
		this._customerLinkControl.$input.on("awesomplete-selectcomplete change blur", syncCust);
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
