const SMES_LS_META = "smes_activity_form_meta_v1";
const SMES_LS_DRAFT = "smes_activity_form_draft_v1";
const SMES_LS_QUEUE = "smes_activity_form_queue_v1";

frappe.pages["smes-activity-form"].on_page_load = function (wrapper) {
	frappe.require("/assets/tif_customization/css/smes_activity_form.css", () => {
		const page = frappe.ui.make_app_page({
			parent: wrapper,
			title: __("SMEs Activity Form"),
			single_column: true,
		});
		$(wrapper).addClass("smes-page-active");
		$("body").addClass("smes-page-active");
		page.main.html(`<div class="smes-form-root"></div>`);
		new SmesActivityForm(page.main.find(".smes-form-root"), page);
	});
};

frappe.pages["smes-activity-form"].on_page_show = function () {
	$("body").addClass("smes-page-active");
	document.documentElement.style.setProperty("--smes-theme", "#673ab7");
	let meta = document.querySelector('meta[name="theme-color"]');
	if (!meta) {
		meta = document.createElement("meta");
		meta.setAttribute("name", "theme-color");
		document.head.appendChild(meta);
	}
	meta.setAttribute("content", "#673ab7");
};

frappe.pages["smes-activity-form"].on_page_hide = function () {
	$("body").removeClass("smes-page-active");
};

class SmesActivityForm {
	constructor($root, page) {
		this.$root = $root;
		this.page = page;
		this.step = 0;
		this.meta = null;
		this.controls = {};
		this.data = {
			visit_by: "",
			staff_employee: "",
			month: "",
			visit_date: "",
			activity_type: "",
			starting_time: "08:00:00",
			ending_time: "09:00:00",
			city: "",
			area: "",
			province: "",
			frequency_of_visits: "",
			marketing_material_provided: "",
			status: "",
			reasons_if_not_agreed: "",
			reasons_if_not_agreed_other: "",
			school_remarks_follow_up: "",
			school_name: "",
			contact_person_name: "",
			contact_number: "",
			designation: "",
			school_address: "",
			school_type: "",
			reference: "",
			school_additional_remarks: "",
			qps_affiliated: "",
			tps_affiliated: "",
			cee_affiliated: "",
			participant_names_enrolled: "",
			participant_contact_numbers: "",
			model_school: "",
			registered_volunteer: "",
			meeting_picture: "",
			school_picture: "",
			visiting_card_attach: "",
			attendance_sheet_attach: "",
			training_awareness_pictures: "",
			attendance_sheet_excel: "",
		};
		this.steps = [
			{ key: "general", label: __("General") },
			{ key: "marketing", label: __("Visit Detail") },
			{ key: "school", label: __("School Detail") },
			{ key: "attachments", label: __("Attachments") },
		];
		this._online = navigator.onLine !== false;
		this._bind_offline_events();
		this.load();
	}

	_bind_offline_events() {
		window.addEventListener("online", () => {
			this._online = true;
			this.update_connectivity_banner();
			this.flush_offline_queue();
			frappe.show_alert({ message: __("Back online — syncing saved visits…"), indicator: "green" }, 4);
		});
		window.addEventListener("offline", () => {
			this._online = false;
			this.update_connectivity_banner();
			frappe.show_alert(
				{
					message: __("You are offline. You can keep filling — submit will sync later."),
					indicator: "orange",
				},
				6,
			);
		});
	}

	storage_get(key, fallback) {
		try {
			const raw = localStorage.getItem(key);
			return raw ? JSON.parse(raw) : fallback;
		} catch (e) {
			return fallback;
		}
	}

	storage_set(key, value) {
		try {
			localStorage.setItem(key, JSON.stringify(value));
		} catch (e) {
			console.warn("SMEs offline storage failed", e);
		}
	}

	save_draft() {
		this.collect();
		this.storage_set(SMES_LS_DRAFT, {
			step: this.step,
			data: this.data,
			saved_at: new Date().toISOString(),
		});
	}

	restore_draft() {
		const draft = this.storage_get(SMES_LS_DRAFT, null);
		if (!draft || !draft.data) return false;
		Object.assign(this.data, draft.data);
		if (typeof draft.step === "number") this.step = draft.step;
		return true;
	}

	clear_draft() {
		try {
			localStorage.removeItem(SMES_LS_DRAFT);
		} catch (e) {
			/* ignore */
		}
	}

	queue_offline_submit(payload) {
		const queue = this.storage_get(SMES_LS_QUEUE, []);
		queue.push({
			id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
			data: payload,
			queued_at: new Date().toISOString(),
		});
		this.storage_set(SMES_LS_QUEUE, queue);
		return queue.length;
	}

	flush_offline_queue() {
		if (!navigator.onLine) return;
		const queue = this.storage_get(SMES_LS_QUEUE, []);
		if (!queue.length) return;

		const remaining = [];
		let synced = 0;
		const next = () => {
			if (!queue.length) {
				this.storage_set(SMES_LS_QUEUE, remaining);
				this.update_connectivity_banner();
				if (synced) {
					frappe.show_alert(
						{
							message: __("Synced {0} offline visit(s) to ERP", [synced]),
							indicator: "green",
						},
						5,
					);
				}
				return;
			}
			const item = queue.shift();
			frappe.call({
				method:
					"tif_customization.tif_customization.page.smes_activity_form.smes_activity_form.submit_smes_activity",
				args: { data: item.data },
				callback: (r) => {
					if (!r.exc) synced += 1;
					else remaining.push(item);
					next();
				},
				error: () => {
					remaining.push(item);
					remaining.push(...queue);
					this.storage_set(SMES_LS_QUEUE, remaining);
					this.update_connectivity_banner();
				},
			});
		};
		next();
	}

	update_connectivity_banner() {
		const $banner = this.$root.find(".smes-offline-banner");
		if (!$banner.length) return;
		const queue = this.storage_get(SMES_LS_QUEUE, []);
		const online = navigator.onLine !== false;
		if (online && !queue.length) {
			$banner.addClass("smes-hidden").html("");
			return;
		}
		$banner.removeClass("smes-hidden");
		if (!online) {
			$banner.html(
				`<i class="fa fa-wifi"></i> ${__("Offline mode")} — ${__("drafts auto-save; submit will sync when online")}${
					queue.length ? ` · ${__("Queued")}: ${queue.length}` : ""
				}`,
			);
		} else {
			$banner.html(
				`<i class="fa fa-cloud-upload"></i> ${__("Online")} — ${__("pending sync")}: ${queue.length}
				<button type="button" class="btn btn-xs btn-default smes-sync-now">${__("Sync now")}</button>`,
			);
			$banner.find(".smes-sync-now").on("click", () => this.flush_offline_queue());
		}
	}

	load() {
		this.$root.html(`
			<div class="smes-form-wrap">
				<div class="smes-card text-center" style="margin-top:24px;">
					<i class="fa fa-spinner fa-spin fa-2x text-muted"></i>
					<p class="text-muted mt-2">${__("Loading form...")}</p>
				</div>
			</div>
		`);

		const apply_meta = (meta, from_cache) => {
			this.meta = meta || {};
			const had_draft = this.restore_draft();
			if (!had_draft) {
				this.data.visit_by = this.meta.staff_name || "";
				this.data.staff_employee = this.meta.staff_employee || "";
				this.data.visit_date = this.meta.today || "";
				const m = new Date().toLocaleString("en-US", { month: "long" });
				if ((this.meta.months || []).includes(m)) this.data.month = m;
			}
			this.render();
			if (from_cache) {
				frappe.show_alert(
					{
						message: __("Loaded cached form (offline / slow network). Lookups may be outdated."),
						indicator: "orange",
					},
					5,
				);
			}
			this.flush_offline_queue();
		};

		frappe.call({
			method:
				"tif_customization.tif_customization.page.smes_activity_form.smes_activity_form.get_form_meta",
			callback: (r) => {
				const meta = r.message || {};
				this.storage_set(SMES_LS_META, { meta, cached_at: new Date().toISOString() });
				apply_meta(meta, false);
			},
			error: () => {
				const cached = this.storage_get(SMES_LS_META, null);
				if (cached && cached.meta) {
					apply_meta(cached.meta, true);
					return;
				}
				this.$root.html(`
					<div class="smes-form-wrap">
						<div class="smes-card">
							<h3>${__("Cannot open form offline yet")}</h3>
							<p>${__("Open this page once while online. After that, drafts and offline submit queue will work.")}</p>
							<button class="btn btn-primary smes-retry">${__("Retry")}</button>
						</div>
					</div>
				`);
				this.$root.find(".smes-retry").on("click", () => this.load());
			},
		});
	}

	is_school_visit() {
		const t = this.data.activity_type || "";
		return (
			t.includes("Marketing") ||
			t.includes("M&E") ||
			t.includes("Joint Visit") ||
			t.includes("Training")
		);
	}

	render() {
		const pills = this.steps
			.map((s, i) => {
				const cls = i === this.step ? "is-active" : i < this.step ? "is-done" : "";
				return `<div class="smes-step-pill ${cls}">${i + 1}. ${frappe.utils.escape_html(s.label)}</div>`;
			})
			.join("");

		this.$root.html(`
			<div class="smes-form-wrap">
				<div class="smes-offline-banner smes-hidden"></div>
				<div class="smes-form-hero">
					<h1>${__("SMEs Activity Form 2026–27")}</h1>
					<p>${__("Works with offline drafts syncs to ERP when you are back online.")}</p>
				</div>
				<div class="smes-step-bar">${pills}</div>
				<div class="smes-card smes-body"></div>
				<div class="smes-actions">
					<button type="button" class="btn btn-default smes-prev" ${this.step === 0 ? "disabled" : ""}>${__("Back")}</button>
					<div class="smes-actions-right">
						<button type="button" class="btn btn-default smes-save-draft">${__("Save draft")}</button>
						<button type="button" class="btn btn-default smes-open-list">${__("Field Visits")}</button>
						<button type="button" class="btn btn-primary smes-next">
							${this.step === this.steps.length - 1 ? __("Submit") : __("Next")}
						</button>
					</div>
				</div>
			</div>
		`);

		this.render_step();
		this.bind();
		this.update_connectivity_banner();
		this.scroll_top();
	}

	scroll_top() {
		try {
			window.scrollTo({ top: 0, behavior: "smooth" });
			this.$root.closest(".page-container, .layout-main").scrollTop?.(0);
		} catch (e) {
			/* ignore */
		}
	}

	bind() {
		this.$root.find(".smes-prev").on("click", () => {
			this.collect();
			this.save_draft();
			if (this.step > 0) {
				this.step -= 1;
				this.render();
			}
		});
		this.$root.find(".smes-next").on("click", () => {
			this.collect();
			this.save_draft();
			if (!this.validate_step()) return;
			if (this.step < this.steps.length - 1) {
				this.step += 1;
				this.render();
			} else {
				this.submit();
			}
		});
		this.$root.find(".smes-save-draft").on("click", () => {
			this.save_draft();
			frappe.show_alert({ message: __("Draft saved on this device"), indicator: "blue" }, 3);
		});
		this.$root.find(".smes-open-list").on("click", () => frappe.set_route("List", "Field Visit"));

		// Auto-save draft as user types (debounced)
		clearTimeout(this._draft_timer);
		this.$root
			.find(".smes-body")
			.off("change.smesdraft input.smesdraft")
			.on("change.smesdraft input.smesdraft", () => {
				clearTimeout(this._draft_timer);
				this._draft_timer = setTimeout(() => this.save_draft(), 600);
			});
	}

	val(name, fallback = "") {
		return this.data[name] != null ? this.data[name] : fallback;
	}

	field(name, label, type = "text", opts = {}) {
		const req = opts.reqd ? `<span class="req">*</span>` : "";
		const hint = opts.hint ? `<div class="hint">${frappe.utils.escape_html(opts.hint)}</div>` : "";
		let control = "";
		if (type === "date" || type === "time") {
			const ftype = type === "date" ? "Date" : "Time";
			control = `
				<div class="smes-frappe-ctl"
					data-frappe-field="${frappe.utils.escape_html(name)}"
					data-frappe-type="${ftype}"></div>
				<div class="smes-native-fallback smes-hidden">
					<input class="form-control" type="${type}" data-field="${frappe.utils.escape_html(name)}"
						value="${frappe.utils.escape_html(this.normalize_input_value(name, type))}" />
				</div>`;
		} else if (type === "select") {
			const options = [`<option value="">${__("Select")}</option>`]
				.concat(
					(opts.options || []).map((o) => {
						const selected = this.val(name) === o ? "selected" : "";
						return `<option value="${frappe.utils.escape_html(o)}" ${selected}>${frappe.utils.escape_html(o)}</option>`;
					}),
				)
				.join("");
			control = `<select data-field="${name}">${options}</select>`;
		} else if (type === "textarea") {
			control = `<textarea data-field="${name}">${frappe.utils.escape_html(this.val(name))}</textarea>`;
		} else if (type === "radio") {
			control = `<div class="smes-radio-group">${(opts.options || [])
				.map((o) => {
					const checked = this.val(name) === o ? "checked" : "";
					return `<label><input type="radio" name="${name}" data-field="${name}" value="${frappe.utils.escape_html(o)}" ${checked}/><span>${frappe.utils.escape_html(o)}</span></label>`;
				})
				.join("")}</div>`;
		} else {
			control = `<input type="${type}" data-field="${name}" value="${frappe.utils.escape_html(this.val(name))}" autocomplete="on" />`;
		}
		return `<div class="smes-field" data-wrap="${name}"><label>${frappe.utils.escape_html(label)}${req}</label>${control}${hint}</div>`;
	}

	normalize_input_value(name, type) {
		let v = this.val(name);
		if (!v) return "";
		if (type === "time") {
			v = String(v);
			if (/^\d{2}:\d{2}$/.test(v)) return v;
			if (/^\d{2}:\d{2}:\d{2}/.test(v)) return v.slice(0, 5);
		}
		return v;
	}

	normalize_time_for_frappe(v) {
		if (!v) return "";
		v = String(v).trim();
		if (/^\d{2}:\d{2}$/.test(v)) return `${v}:00`;
		return v;
	}

	mount_frappe_controls() {
		this.controls = {};
		const is_mobile = window.matchMedia("(max-width: 767px)").matches;

		this.$root.find("[data-frappe-field]").each((_, el) => {
			const $el = $(el);
			const fieldname = $el.data("frappe-field");
			const fieldtype = $el.data("frappe-type");
			const $fallback = $el.siblings(".smes-native-fallback");

			// On mobile use native OS date/time pickers (best UX on phones)
			if (is_mobile) {
				$el.addClass("smes-hidden");
				$fallback.removeClass("smes-hidden");
				const $input = $fallback.find("[data-field]");
				$input.off("change.smesdt input.smesdt").on("change.smesdt input.smesdt", () => {
					let val = $input.val();
					if (fieldtype === "Time") val = this.normalize_time_for_frappe(val);
					this.data[fieldname] = val;
				});
				return;
			}

			$fallback.addClass("smes-hidden");
			$el.removeClass("smes-hidden").empty();

			try {
				const control = frappe.ui.form.make_control({
					parent: $el,
					df: {
						fieldtype,
						fieldname,
						label: "",
						reqd: 0,
					},
					render_input: true,
				});
				let value = this.data[fieldname] || "";
				if (fieldtype === "Time") value = this.normalize_time_for_frappe(value);
				control.set_value(value);

				const sync = () => {
					let val = control.get_value();
					if (fieldtype === "Time") val = this.normalize_time_for_frappe(val);
					this.data[fieldname] = val || "";
				};
				if (control.$input) {
					control.$input.on("change blur", sync);
				}
				this.controls[fieldname] = control;
			} catch (err) {
				console.warn("SMEs form control fallback", fieldname, err);
				$el.addClass("smes-hidden");
				$fallback.removeClass("smes-hidden");
			}
		});
	}

	yn_matrix(services, prefix) {
		const rows = (services || [])
			.map((s) => {
				const v = this.val(s.field);
				return `
					<div class="svc">${frappe.utils.escape_html(s.label)}</div>
					<label><input type="radio" name="${s.field}" data-field="${s.field}" value="Yes" ${v === "Yes" ? "checked" : ""}/> Yes</label>
					<label><input type="radio" name="${s.field}" data-field="${s.field}" value="No" ${v === "No" ? "checked" : ""}/> No</label>
				`;
			})
			.join("");
		return `
			<div class="smes-yn-grid">
				<div></div><div class="hdr">Yes</div><div class="hdr">No</div>
				${rows}
			</div>
		`;
	}

	render_step() {
		const $body = this.$root.find(".smes-body");
		const key = this.steps[this.step].key;
		if (key === "general") $body.html(this.html_general());
		else if (key === "marketing") $body.html(this.html_marketing());
		else if (key === "school") $body.html(this.html_school());
		else $body.html(this.html_attachments());

		$body.find("[data-field]").on("change input", (e) => {
			const $el = $(e.target);
			const field = $el.data("field");
			if ($el.attr("type") === "radio") {
				if ($el.is(":checked")) this.data[field] = $el.val();
			} else if ($el.attr("type") === "time") {
				this.data[field] = this.normalize_time_for_frappe($el.val());
			} else {
				this.data[field] = $el.val();
			}
			if (field === "visit_by") {
				const match = (this.meta.staff_options || []).find((s) => s.employee_name === this.data.visit_by);
				this.data.staff_employee = match ? match.employee : "";
			}
			if (["activity_type", "status", "qps_affiliated", "tps_affiliated", "cee_affiliated"].includes(field)) {
				this.collect();
				this.render_step();
				this.bind_uploads();
			}
		});
		this.mount_frappe_controls();
		this.bind_uploads();
	}

	html_general() {
		const areas = (this.meta.areas || [])
			.filter((a) => !this.data.city || !a.city || a.city === this.data.city)
			.map((a) => a.name);
		const staff_names = this.meta.staff_names || [];
		return `
			<h3>${__("General Information")}</h3>
			${this.field("visit_by", __("Name of Staff"), "select", {
				reqd: 1,
				options: staff_names,
				hint: __("Active employees with Field Officer / Field Staff rights only"),
			})}
			<div class="smes-row-2">
				${this.field("month", __("Month"), "select", { reqd: 1, options: this.meta.months || [] })}
				${this.field("visit_date", __("Date"), "date", { reqd: 1 })}
			</div>
			${this.field("activity_type", __("Type of Activity"), "radio", { reqd: 1, options: this.meta.activity_types || [] })}
			<div class="smes-row-2">
				${this.field("starting_time", __("Starting Time"), "time")}
				${this.field("ending_time", __("Ending Time"), "time")}
			</div>
			<div class="smes-row-2">
				${this.field("city", __("City"), "select", { reqd: 1, options: this.meta.cities || [] })}
				${this.field("area", __("Area"), "select", {
					reqd: 1,
					options: areas.length ? areas : (this.meta.areas || []).map((a) => a.name),
				})}
			</div>
			${this.field("province", __("Province"), "radio", { reqd: 1, options: this.meta.provinces || [] })}
		`;
	}

	html_marketing() {
		const show_mkt =
			(this.data.activity_type || "").includes("Marketing") ||
			(this.data.activity_type || "").includes("Joint Visit");
		const status = this.data.status;
		return `
			<h3>${__("Visit Details")}</h3>
			${
				show_mkt
					? `
				${this.field("frequency_of_visits", __("Frequency of Visits"), "radio", { reqd: 1, options: this.meta.frequencies || [] })}
				${this.field("marketing_material_provided", __("Does Marketing Material Provided?"), "radio", { reqd: 1, options: ["Yes", "No"] })}
				${this.field("status", __("Status"), "radio", { reqd: 1, options: this.meta.statuses || [] })}
				${
					status === "Not Agree" || status === "Other"
						? this.field("reasons_if_not_agreed", __("Reasons if not Agreed"), "radio", {
								options: this.meta.not_agree_reasons || [],
							})
						: ""
				}
				${
					this.data.reasons_if_not_agreed === "Other"
						? this.field("reasons_if_not_agreed_other", __("Other reason"), "textarea")
						: ""
				}
				${
					status === "Need follow up visit"
						? this.field("school_remarks_follow_up", __("School Remarks (If Need Follow up visit)"), "textarea")
						: ""
				}
			`
					: `<p class="text-muted">${__("No marketing-specific questions for this activity type. Click Next to continue.")}</p>`
			}
		`;
	}

	html_school() {
		if (!this.is_school_visit()) {
			return `<h3>${__("School Related Detail")}</h3><p class="text-muted">${__("School section is for Marketing / M&E / Joint / Training visits. Click Next.")}</p>`;
		}
		return `
			<h3>${__("School Related Detail")}</h3>
			${this.field("school_name", __("School Name"), "text", { reqd: 1 })}
			${this.field("contact_person_name", __("Contact Person Name"), "text")}
			${this.field("contact_number", __("Contact Number"), "tel")}
			${this.field("designation", __("Designation"), "text", {
				hint: __("Optional — e.g. Owner, Director, Principal, Admin, Coordinator, Teacher"),
			})}
			${this.field("school_address", __("School Address"), "textarea", { reqd: 1 })}
			${this.field("school_type", __("School Type"), "select", { reqd: 1, options: this.meta.school_types || [] })}
			${this.field("reference", __("Reference"), "text")}
			${this.field("school_additional_remarks", __("Any Additional Remarks regarding School"), "textarea")}
			${this.field("qps_affiliated", __("Is this school affiliated with QPS?"), "radio", { reqd: 1, options: ["Yes", "No"] })}
			${
				this.data.qps_affiliated === "Yes"
					? `<div class="smes-field"><label>${__("Which QPS services are adopted by the school?")}</label>${this.yn_matrix(this.meta.qps_services)}</div>`
					: ""
			}
			${this.field("tps_affiliated", __("Is this school affiliated with TPS?"), "radio", { reqd: 1, options: ["Yes", "No"] })}
			${
				this.data.tps_affiliated === "Yes"
					? `<div class="smes-field"><label>${__("Which TPS services are adopted by the school?")}</label>${this.yn_matrix(this.meta.tps_services)}</div>`
					: ""
			}
			${this.field("cee_affiliated", __("Is this school affiliated with Teachers Training Department (CEE)?"), "radio", { reqd: 1, options: ["Yes", "No"] })}
			${
				this.data.cee_affiliated === "Yes"
					? `<div class="smes-field"><label>${__("Which CEE services are adopted by the school?")}</label>${this.yn_matrix(this.meta.cee_services)}</div>`
					: ""
			}
			${this.field("participant_names_enrolled", __("Name of Participant enrolled in ELP/ TECC/ TTC / Tajweed courses"), "textarea", { hint: __("Example: Zaid - ELP, Nasir - TECC") })}
			${this.field("participant_contact_numbers", __("Contact Number of Above Participant(s)"), "text")}
			${this.field("model_school", __("Is this a Model School"), "radio", { options: this.meta.model_school_options || [] })}
			${this.field("registered_volunteer", __("Registered with TIF as a Volunteer"), "radio", { reqd: 1, options: ["Yes", "No"] })}
		`;
	}

	html_attachments() {
		const attach = (field, label, accept = "image/*") => `
			<div class="smes-attach-item" data-attach="${field}">
				<label>${frappe.utils.escape_html(label)}</label>
				<button type="button" class="btn btn-sm btn-default smes-upload" data-field="${field}" data-accept="${accept}">
					<i class="fa fa-upload"></i> ${__("Upload")}
				</button>
				<div class="file-name">${this.val(field) ? frappe.utils.escape_html(this.val(field)) : __("No file selected")}</div>
			</div>
		`;
		return `
			<h3>${__("Attachments")}</h3>
			<p class="text-muted">${__("Upload relevant pictures (optional). Max size follows ERP attach rules.")}</p>
			<div class="smes-attach-row">
				${attach("meeting_picture", __("Meeting Picture"), "image/*")}
				${attach("school_picture", __("School Picture"), "image/*")}
				${attach("visiting_card_attach", __("Visiting Card"), "image/*,.pdf")}
				${attach("attendance_sheet_attach", __("Attendance Sheet"), "image/*,.pdf")}
				${attach("training_awareness_pictures", __("Pictures of Training & Awareness Session"), "image/*,.pdf")}
				${attach("attendance_sheet_excel", __("MS Excel of Attendance Sheet"), ".xlsx,.xls,.csv,image/*,.pdf")}
			</div>
		`;
	}

	bind_uploads() {
		this.$root.find(".smes-upload").off("click").on("click", (e) => {
			const field = $(e.currentTarget).data("field");
			new frappe.ui.FileUploader({
				doctype: "Field Visit",
				docname: "new",
				folder: "Home/Attachments",
				on_success: (file) => {
					this.data[field] = file.file_url;
					this.render_step();
					this.bind_uploads();
				},
			});
		});
	}

	collect() {
		Object.keys(this.controls || {}).forEach((field) => {
			const control = this.controls[field];
			if (!control) return;
			let val = control.get_value();
			if (control.df && control.df.fieldtype === "Time") {
				val = this.normalize_time_for_frappe(val);
			}
			this.data[field] = val || "";
		});
		this.$root.find("[data-field]").each((_, el) => {
			const $el = $(el);
			const field = $el.data("field");
			if ($el.attr("type") === "radio") {
				if ($el.is(":checked")) this.data[field] = $el.val();
			} else if ($el.attr("type") === "time") {
				this.data[field] = this.normalize_time_for_frappe($el.val());
			} else if (!$el.closest(".smes-frappe-ctl").length) {
				this.data[field] = $el.val();
			}
		});
	}

	validate_step() {
		const key = this.steps[this.step].key;
		const need = (fields, msg) => {
			for (const f of fields) {
				if (!cstr(this.data[f]).trim()) {
					frappe.show_alert({ message: msg || __("Please fill required fields"), indicator: "orange" }, 5);
					return false;
				}
			}
			return true;
		};
		if (key === "general") {
			return need(
				["visit_by", "month", "visit_date", "activity_type", "city", "area", "province"],
				__("Fill all required General fields"),
			);
		}
		if (key === "marketing") {
			const show_mkt =
				(this.data.activity_type || "").includes("Marketing") ||
				(this.data.activity_type || "").includes("Joint Visit");
			if (show_mkt) {
				return need(
					["frequency_of_visits", "marketing_material_provided", "status"],
					__("Fill Marketing Visit required fields"),
				);
			}
		}
		if (key === "school" && this.is_school_visit()) {
			return need(
				[
					"school_name",
					"school_address",
					"school_type",
					"qps_affiliated",
					"tps_affiliated",
					"cee_affiliated",
					"registered_volunteer",
				],
				__("Fill required School Detail fields"),
			);
		}
		return true;
	}

	show_success(m, offline_queued) {
		this.$root.html(`
			<div class="smes-form-wrap">
				<div class="smes-form-hero">
					<h1>${__("SMEs Activity Form 2026–27")}</h1>
					<p>${
						offline_queued
							? __("Saved on this device. Will upload when you are online.")
							: __("Your response has been recorded.")
					}</p>
				</div>
				<div class="smes-card smes-success">
					<h2>${offline_queued ? __("Queued offline") : __("Submitted")}</h2>
					<p>${frappe.utils.escape_html(
						m.message ||
							(offline_queued
								? __("Visit saved locally and will sync to ERP automatically.")
								: __("Saved")),
					)}</p>
					${m.url ? `<p><a href="${m.url}">${frappe.utils.escape_html(m.name || "")}</a></p>` : ""}
					<button class="btn btn-primary smes-another">${__("Submit another response")}</button>
					${m.name ? `<button class="btn btn-default smes-open">${__("Open record")}</button>` : ""}
				</div>
			</div>
		`);
		this.$root.find(".smes-another").on("click", () => {
			this.step = 0;
			this.data.activity_type = "";
			this.data.status = "";
			this.data.school_name = "";
			this.clear_draft();
			this.load();
		});
		this.$root.find(".smes-open").on("click", () => {
			if (m.name) frappe.set_route("Form", "Field Visit", m.name);
		});
	}

	submit() {
		this.collect();
		this.save_draft();

		if (!navigator.onLine) {
			const count = this.queue_offline_submit({ ...this.data });
			this.clear_draft();
			this.show_success(
				{
					message: __("Queued offline ({0} pending). Connect internet to sync.", [count]),
				},
				true,
			);
			return;
		}

		frappe.call({
			method:
				"tif_customization.tif_customization.page.smes_activity_form.smes_activity_form.submit_smes_activity",
			args: { data: this.data },
			freeze: true,
			freeze_message: __("Saving activity..."),
			callback: (r) => {
				const m = r.message || {};
				this.clear_draft();
				this.show_success(m, false);
			},
			error: () => {
				const count = this.queue_offline_submit({ ...this.data });
				this.clear_draft();
				this.show_success(
					{
						message: __(
							"Server unreachable. Saved offline ({0} pending) — will sync automatically.",
							[count],
						),
					},
					true,
				);
			},
		});
	}
}

function cstr(v) {
	return v == null ? "" : String(v);
}
