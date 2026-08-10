const SMES_LS_META = "smes_activity_form_meta_v3";
const SMES_LS_DRAFT = "smes_activity_form_draft_v3";
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
		this.data = this.empty_data();
		this.steps = [];
		this._online = navigator.onLine !== false;
		this._bind_offline_events();
		this.load();
	}

	empty_data() {
		return {
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
			// Marketing
			frequency_of_visits: "",
			marketing_material_provided: "",
			status: "",
			reasons_if_not_agreed: "",
			reasons_if_not_agreed_other: "",
			school_remarks_follow_up: "",
			// M&E
			me_mqh_book_status: "",
			me_inactive_reasons: [],
			me_demand_from_school: "",
			me_teachers_training_session: "",
			me_number_of_teachers_mqh: "",
			me_teachers_mqh_other: "",
			me_used_teachers_guide: "",
			me_mqh_book_version: "",
			me_mqh_book_part: "",
			me_classes_per_week: "",
			me_class_duration: "",
			me_took_assessment: "",
			me_student_behavior_changes: "",
			me_assessment_from: [],
			me_changes_made: [],
			me_details_of_changes_made: "",
			me_new_school_address: "",
			me_new_person_name: "",
			me_new_person_designation: "",
			me_new_person_mobile_number: "",
			me_new_person_email: "",
			// Joint
			joint_visit_with_smes: [],
			joint_sme_skill_rating: "",
			// Training
			training_arrange_by: [],
			training_conducted_by: "",
			training_session_category: "",
			training_venue_name: "",
			training_no_of_participants: "",
			training_no_of_schools_attended: "",
			// Meetings
			mt_meeting_type: "",
			mt_meeting_mode: "",
			mt_internal_meeting_with: "",
			mt_external_meeting_with: "",
			mt_person_name: "",
			mt_contact_number: "",
			mt_venue: "",
			mt_meeting_detail: "",
			// Academic / Other
			ot_type_of_task: "",
			ot_academic_task_types: [],
			ot_academic_task_other: "",
			ot_no_of_pages: "",
			ot_no_of_calls: "",
			ot_purpose_of_call: "",
			ot_follow_up_calls_attach: "",
			ot_other_official_task_detail: "",
			ot_visit_meeting_detail: "",
			ot_hours_spent: "",
			// Co-curricular
			cc_activity: "",
			cc_venue: "",
			cc_no_of_schools: "",
			cc_no_of_participants: "",
			cc_participants_category: [],
			// School
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
			// Enrolment / Workshop attendance (multi-row)
			enrolment_participants: [],
			workshop_attendees: [],
			// Travel
			travel_mode: "",
			travel_from: "",
			travel_to: "",
			travel_distance_km: "",
			travel_cost: "",
			travel_remarks: "",
			// Attachments
			meeting_picture: "",
			school_picture: "",
			visiting_card_attach: "",
			attendance_sheet_attach: "",
			training_awareness_pictures: "",
			attendance_sheet_excel: "",
		};
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
		Object.assign(this.data, this.empty_data(), draft.data);
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
			this.rebuild_steps();
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

	activity_kind() {
		const t = this.data.activity_type || "";
		if (t.includes("Enrolment of Participants") || t.includes("Enrolment of participants")) {
			return "enrolment";
		}
		if (t.includes("Attendance / Registration")) return "workshop_attendance";
		if (t.includes("Marketing")) return "marketing";
		if (t.includes("M&E")) return "me";
		if (t.includes("Joint Visit")) return "joint";
		if (t.includes("Training")) return "training";
		if (t.includes("Meetings") || t === "Meeting") return "meeting";
		if (t.includes("Academic")) return "academic";
		if (t.includes("Co-curricular")) return "cocurricular";
		return "";
	}

	is_school_visit() {
		const k = this.activity_kind();
		return ["marketing", "me", "joint", "training"].includes(k);
	}

	is_enrolment_or_workshop() {
		return ["enrolment", "workshop_attendance"].includes(this.activity_kind());
	}

	is_affiliated_yes(value) {
		return cstr(value).startsWith("Yes");
	}

	rebuild_steps() {
		const steps = [{ key: "general", label: __("General") }];
		const kind = this.activity_kind();
		const labels = {
			marketing: __("Marketing Visit"),
			me: __("M&E Visit"),
			joint: __("Joint Visit"),
			training: __("Trainings & Workshops"),
			meeting: __("Meetings"),
			academic: __("Academic / Other"),
			cocurricular: __("Co-curricular"),
			enrolment: __("Enrolment of Participants"),
			workshop_attendance: __("Attendance / Registration"),
		};
		if (kind) {
			steps.push({ key: kind, label: labels[kind] });
		}
		if (this.is_school_visit()) {
			steps.push({ key: "school", label: __("School Detail") });
		}
		steps.push({ key: "attachments", label: __("Attachments") });
		if (this.is_enrolment_or_workshop()) {
			steps.push({ key: "travel", label: __("Travel") });
			steps.push({ key: "preview", label: __("Preview") });
		}
		this.steps = steps;
		if (this.step >= this.steps.length) this.step = Math.max(0, this.steps.length - 1);
	}

	render() {
		this.rebuild_steps();
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
					<p class="smes-template-link">
						<a href="#" class="smes-download-template">
							<i class="fa fa-download"></i> ${__("Download Bulk Import Excel Template")}
						</a>
					</p>
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
		this.$root.find(".smes-download-template").on("click", (e) => {
			e.preventDefault();
			this.download_bulk_template();
		});

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

	as_list(name) {
		const v = this.data[name];
		if (Array.isArray(v)) return v;
		if (!v) return [];
		if (typeof v === "string") {
			return v
				.split(/[\n,]+/)
				.map((s) => s.trim())
				.filter(Boolean);
		}
		return [String(v)];
	}

	has_change(label) {
		return this.as_list("me_changes_made").includes(label);
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
		} else if (type === "link") {
			control = `
				<div class="smes-frappe-ctl"
					data-frappe-field="${frappe.utils.escape_html(name)}"
					data-frappe-type="Link"
					data-frappe-options="${frappe.utils.escape_html(opts.options || "")}"
					data-frappe-reqd="${opts.reqd ? 1 : 0}"></div>`;
		} else if (type === "textarea") {
			control = `<textarea data-field="${name}">${frappe.utils.escape_html(this.val(name))}</textarea>`;
		} else if (type === "radio") {
			control = `<div class="smes-radio-group">${(opts.options || [])
				.map((o) => {
					const checked = this.val(name) === o ? "checked" : "";
					return `<label><input type="radio" name="${name}" data-field="${name}" value="${frappe.utils.escape_html(o)}" ${checked}/><span>${frappe.utils.escape_html(o)}</span></label>`;
				})
				.join("")}</div>`;
		} else if (type === "checkboxes") {
			const selected = this.as_list(name);
			control = `<div class="smes-check-group" data-check-field="${name}">${(opts.options || [])
				.map((o) => {
					const checked = selected.includes(o) ? "checked" : "";
					return `<label><input type="checkbox" data-field="${name}" data-multi="1" value="${frappe.utils.escape_html(o)}" ${checked}/><span>${frappe.utils.escape_html(o)}</span></label>`;
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
			const link_options = $el.data("frappe-options") || "";
			const $fallback = $el.siblings(".smes-native-fallback");
			const is_link = fieldtype === "Link";

			// Date/Time: native inputs on mobile. Link: always use searchable Frappe control.
			if (is_mobile && !is_link) {
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
				const df = {
					fieldtype,
					fieldname,
					label: "",
					reqd: cint($el.data("frappe-reqd")),
				};
				if (is_link) {
					df.options = link_options;
					if (fieldname === "area") {
						df.get_query = () => {
							const filters = {};
							if (this.data.city) {
								filters.city = this.data.city;
							}
							return { filters };
						};
					}
				}
				const control = frappe.ui.form.make_control({
					parent: $el,
					df,
					render_input: true,
				});
				control.refresh();
				let value = this.data[fieldname] || "";
				if (fieldtype === "Time") value = this.normalize_time_for_frappe(value);
				if (value) control.set_value(value);

				const sync = () => {
					let val = control.get_value();
					if (fieldtype === "Time") val = this.normalize_time_for_frappe(val);
					const prev = this.data[fieldname];
					this.data[fieldname] = val || "";
					if (fieldname === "city" && prev !== this.data.city && !this._remounting_links) {
						// City changed → clear area and remount so Area query filters by new city
						this.data.area = "";
						this._remounting_links = true;
						try {
							this.collect();
							this.render_step();
							this.bind_uploads();
						} finally {
							this._remounting_links = false;
						}
					}
				};
				if (control.$input) {
					control.$input.on("change blur", sync);
					control.$input.on("awesomplete-selectcomplete", sync);
				}
				this.controls[fieldname] = control;
			} catch (err) {
				console.warn("SMEs form control fallback", fieldname, err);
				$el.addClass("smes-hidden");
				$fallback.removeClass("smes-hidden");
			}
		});
	}

	yn_matrix(services) {
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
		const html_map = {
			general: () => this.html_general(),
			marketing: () => this.html_marketing(),
			me: () => this.html_me(),
			joint: () => this.html_joint(),
			training: () => this.html_training(),
			meeting: () => this.html_meeting(),
			academic: () => this.html_academic(),
			cocurricular: () => this.html_cocurricular(),
			enrolment: () => this.html_enrolment(),
			workshop_attendance: () => this.html_workshop_attendance(),
			school: () => this.html_school(),
			attachments: () => this.html_attachments(),
			travel: () => this.html_travel(),
			preview: () => this.html_preview(),
		};
		$body.html((html_map[key] || (() => ""))());

		const refresh_fields = new Set([
			"activity_type",
			"city",
			"status",
			"reasons_if_not_agreed",
			"me_mqh_book_status",
			"me_number_of_teachers_mqh",
			"me_took_assessment",
			"me_changes_made",
			"mt_meeting_type",
			"ot_type_of_task",
			"ot_academic_task_types",
			"qps_affiliated",
			"tps_affiliated",
			"cee_affiliated",
		]);

		$body.find("[data-field]").on("change input", (e) => {
			const $el = $(e.target);
			const field = $el.data("field");
			if ($el.attr("type") === "checkbox" && $el.data("multi")) {
				const values = [];
				$body.find(`input[data-field="${field}"][type="checkbox"]:checked`).each((_, cb) => {
					values.push($(cb).val());
				});
				this.data[field] = values;
			} else if ($el.attr("type") === "radio") {
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
			if (refresh_fields.has(field)) {
				this.collect();
				if (field === "activity_type") {
					this.rebuild_steps();
					this.render();
					return;
				}
				this.render_step();
				this.bind_uploads();
			}
		});
		this.mount_frappe_controls();
		this.bind_uploads();
		this.bind_multi_row_actions();
	}

	html_general() {
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
				${this.field("city", __("City"), "link", { reqd: 1, options: "City" })}
				${this.field("area", __("Area"), "link", {
					reqd: 1,
					options: "Area",
					hint: this.data.city
						? __("Type to search areas in {0}", [this.data.city])
						: __("Select City first, then type to search Area"),
				})}
			</div>
			${this.field("province", __("Province"), "radio", { reqd: 1, options: this.meta.provinces || [] })}
		`;
	}

	html_marketing() {
		const status = this.data.status;
		return `
			<h3>${__("Marketing Visit")}</h3>
			${this.field("frequency_of_visits", __("Frequency of Visits"), "radio", { reqd: 1, options: this.meta.frequencies || [] })}
			${this.field("marketing_material_provided", __("Does Marketing Material Provided?"), "radio", { reqd: 1, options: ["Yes", "No"] })}
			${this.field("status", __("Status"), "radio", { reqd: 1, options: this.meta.statuses || [] })}
			${
				status === "Not Agree" || status === "Other"
					? this.field("reasons_if_not_agreed", __("Reasons if not Agreed"), "radio", {
							reqd: 1,
							options: this.meta.not_agree_reasons || [],
						})
					: ""
			}
			${
				this.data.reasons_if_not_agreed === "Other"
					? this.field("reasons_if_not_agreed_other", __("Other reason"), "textarea", { reqd: 1 })
					: ""
			}
			${
				status === "Need follow up visit"
					? this.field("school_remarks_follow_up", __("School Remarks (If Need Follow up visit)"), "textarea")
					: ""
			}
		`;
	}

	html_me() {
		const inactive = this.data.me_mqh_book_status === "In-Active";
		const show_assessment = this.data.me_took_assessment === "Yes";
		const changes = this.as_list("me_changes_made");
		return `
			<h3>${__("M&E Visit")}</h3>
			${this.field("me_mqh_book_status", __("Mutalae Quran Hakeem Book Status (M&E)"), "radio", {
				reqd: 1,
				options: ["Active", "In-Active"],
			})}
			${
				inactive
					? this.field(
							"me_inactive_reasons",
							__("Reason of Above (In Active) (Please tick any reason)"),
							"checkboxes",
							{ reqd: 1, options: this.meta.me_inactive_reasons || [] },
						)
					: ""
			}
			${this.field("me_demand_from_school", __("Did you received demand from School?"), "radio", {
				reqd: 1,
				options: this.meta.me_demand_options || [],
			})}
			${this.field("me_teachers_training_session", __("Has any Teachers Training Session Occurred in School?"), "radio", {
				reqd: 1,
				options: ["Yes", "No"],
			})}
			${this.field("me_number_of_teachers_mqh", __("Number of Teachers designated for MQH"), "radio", {
				reqd: 1,
				options: this.meta.me_teachers_count || [],
			})}
			${
				this.data.me_number_of_teachers_mqh === "Others"
					? this.field("me_teachers_mqh_other", __("Specify number of teachers"), "text", { reqd: 1 })
					: ""
			}
			${this.field("me_used_teachers_guide", __("Did you use the Teacher's Guide of MQH for Teaching?"), "radio", {
				reqd: 1,
				options: ["Yes", "No"],
			})}
			${this.field("me_mqh_book_version", __("Which Version / Language of Mutalae Quran-e-Hakeem Book Taught?"), "radio", {
				reqd: 1,
				options: this.meta.me_mqh_versions || [],
			})}
			${this.field("me_mqh_book_part", __("Which Part of Mutalae Quran-e-Hakeem Book Taught?"), "radio", {
				reqd: 1,
				options: this.meta.me_mqh_parts || [],
			})}
			${this.field("me_classes_per_week", __("How many classes allocated per week for MQH?"), "radio", {
				reqd: 1,
				options: this.meta.me_classes_per_week || [],
			})}
			${this.field("me_class_duration", __("Duration of Class (in Minutes)"), "radio", {
				reqd: 1,
				options: this.meta.me_class_durations || [],
			})}
			${this.field("me_took_assessment", __("Does the teacher conduct assessments for this course?"), "radio", {
				reqd: 1,
				options: ["Yes", "No"],
			})}
			${this.field("me_student_behavior_changes", __("What kind of changes have the teacher or principal noticed in students' behavior?"), "radio", {
				reqd: 1,
				options: this.meta.me_behavior_changes || [],
			})}
			${
				show_assessment
					? this.field("me_assessment_from", __("From whom have you taken assessment?"), "checkboxes", {
							reqd: 1,
							options: this.meta.me_assessment_from || [],
						})
					: ""
			}
			<div class="smes-section-note">
				<strong>${__("Updates for TIF Office (If Any Changes)")}</strong>
				<span>${__("(School Name, Contact Person, Contact Number, Address)")}</span>
			</div>
			${this.field("me_changes_made", __("What changes have been Made?"), "checkboxes", {
				options: this.meta.me_tif_office_changes || [],
			})}
			${
				changes.length
					? this.field("me_details_of_changes_made", __("Details of Changes Made"), "textarea")
					: ""
			}
			${this.has_change("Address") ? this.field("me_new_school_address", __("New School Address"), "text") : ""}
			${
				this.has_change("Contact Person") || this.has_change("Contact Number") || this.has_change("Email")
					? `
				${this.field("me_new_person_name", __("New Person Name"), "text")}
				${this.field("me_new_person_designation", __("New Person Designation"), "text")}
				${this.has_change("Contact Number") ? this.field("me_new_person_mobile_number", __("New Person Mobile Number"), "tel") : ""}
				${this.has_change("Email") ? this.field("me_new_person_email", __("New Person Email"), "email") : ""}
			`
					: ""
			}
		`;
	}

	html_joint() {
		return `
			<h3>${__("Joint Visit with SME (Only for Supervisor)")}</h3>
			${this.field("joint_visit_with_smes", __("Visit with (SME Name)"), "checkboxes", {
				reqd: 1,
				options: this.meta.sme_name_options || [],
			})}
			${this.field("joint_sme_skill_rating", __("SME Skill / Professional Level"), "radio", {
				reqd: 1,
				options: this.meta.joint_skill_ratings || [],
			})}
		`;
	}

	html_training() {
		return `
			<h3>${__("Trainings & Workshops")}</h3>
			${this.field("training_arrange_by", __("Training Arrange By"), "checkboxes", {
				reqd: 1,
				options: this.meta.sme_name_options || [],
			})}
			${this.field("training_conducted_by", __("Training Conducted By"), "radio", {
				reqd: 1,
				options: this.meta.training_conducted_by_options || [],
			})}
			${this.field("training_session_category", __("Training Category"), "radio", {
				reqd: 1,
				options: this.meta.training_categories || [],
			})}
			${this.field("training_venue_name", __("Venue Name"), "text", { reqd: 1 })}
			${this.field("training_no_of_participants", __("No. of participants"), "text", { reqd: 1 })}
			${this.field("training_no_of_schools_attended", __("No. of Schools Attended"), "text", { reqd: 1 })}
		`;
	}

	html_meeting() {
		const t = this.data.mt_meeting_type || "";
		const is_internal = t.includes("Internal Meeting");
		const is_external = t.includes("External Meeting");
		return `
			<h3>${__("Meetings")}</h3>
			${this.field("mt_meeting_type", __("Meeting Type"), "radio", {
				reqd: 1,
				options: this.meta.meeting_types || [],
			})}
			${this.field("mt_meeting_mode", __("Meeting Mode"), "radio", {
				reqd: 1,
				options: this.meta.meeting_modes || [],
			})}
			${
				is_internal
					? this.field("mt_internal_meeting_with", __("Internal Meeting with"), "radio", {
							reqd: 1,
							options: this.meta.internal_meeting_with || [],
						})
					: ""
			}
			${
				is_external
					? this.field("mt_external_meeting_with", __("External Meeting with"), "radio", {
							reqd: 1,
							options: this.meta.external_meeting_with || [],
						})
					: ""
			}
			${this.field("mt_person_name", __("Name of Person"), "text")}
			${this.field("mt_contact_number", __("Contact Number"), "tel")}
			${this.field("mt_venue", __("Venue of Meeting"), "text")}
			${this.field("mt_meeting_detail", __("Meeting Detail / Remarks"), "textarea")}
		`;
	}

	html_academic() {
		const task = this.data.ot_type_of_task || "";
		const is_academic = task === "Academic Tasks";
		const is_calls = task.includes("Follow up Calls");
		const is_other = task === "Other Official Tasks";
		const is_visit =
			task.includes("Head Office") ||
			task.includes("Regional Office") ||
			task.includes("Out of Station") ||
			task.includes("Meeting of Regional Staff");
		return `
			<h3>${__("Academic / Others Official Tasks")}</h3>
			${this.field("ot_type_of_task", __("Type of Task"), "radio", {
				reqd: 1,
				options: this.meta.academic_task_types || [],
			})}
			${
				is_academic
					? `
				${this.field("ot_academic_task_types", __("Type of Academic Tasks"), "checkboxes", {
					reqd: 1,
					options: this.meta.academic_work_types || [],
				})}
				${
					this.as_list("ot_academic_task_types").includes("Other")
						? this.field("ot_academic_task_other", __("Other academic task"), "text", { reqd: 1 })
						: ""
				}
				${this.field("ot_no_of_pages", __("No of Pages (Regarding Above Academic Task)"), "text")}
			`
					: ""
			}
			${
				is_calls
					? `
				${this.field("ot_no_of_calls", __("No of Calls / No Follow up Calls"), "text")}
				${this.field("ot_purpose_of_call", __("Purpose of Call"), "text")}
				${this.attach_field("ot_follow_up_calls_attach", __("Follow up Call Details (Excel / sheet)"), ".xlsx,.xls,.csv,image/*,.pdf")}
			`
					: ""
			}
			${
				is_other
					? this.field("ot_other_official_task_detail", __("Detail of other Official Task"), "textarea")
					: ""
			}
			${
				is_visit
					? this.field(
							"ot_visit_meeting_detail",
							__(
								"Detail of Head Office Visit / Regional Office Visit / Out of Station Visit / Meeting of Regional Staff (Supervisors) and SMEs",
							),
							"textarea",
						)
					: ""
			}
			${this.field(
				"ot_hours_spent",
				__("Hours Spent on Academic / Other Official Tasks / Visits / Meeting / Follow up Calls etc."),
				"radio",
				{ reqd: 1, options: this.meta.hours_spent_options || [] },
			)}
		`;
	}

	html_cocurricular() {
		return `
			<h3>${__("Co-curricular Activities Detail")}</h3>
			${this.field("cc_activity", __("Co-curricular Activities"), "radio", {
				reqd: 1,
				options: this.meta.cocurricular_activities || [],
			})}
			${this.field("cc_venue", __("Venue of Co-curricular Activities"), "text")}
			${this.field("cc_no_of_schools", __("No of Schools regarding Co-curricular Activities"), "text")}
			${this.field("cc_no_of_participants", __("No of Participants regarding Co-curricular Activities"), "text")}
			${this.field(
				"cc_participants_category",
				__("Participants Category who participated in Co-curricular Activities"),
				"checkboxes",
				{ options: this.meta.cocurricular_participant_categories || [] },
			)}
		`;
	}

	html_school() {
		if (!this.is_school_visit()) {
			return `<h3>${__("School Related Detail")}</h3><p class="text-muted">${__("School section is for Marketing / M&E / Joint / Training visits. Click Next.")}</p>`;
		}
		const aff = this.meta.affiliation_options || [
			"Yes - Already Affiliated",
			"Yes - Newly Registered",
			"No - Not Affiliated",
		];
		return `
			<h3>${__("School Related Detail")}</h3>
			${this.field("school_name", __("School Name"), "text", { reqd: 1 })}
			${this.field("contact_person_name", __("Contact Person Name"), "text")}
			${this.field("contact_number", __("Contact Number"), "tel")}
			${this.field("designation", __("Designation"), "radio", {
				reqd: 1,
				options: this.meta.designations || [],
			})}
			${this.field("school_address", __("School Address"), "textarea", { reqd: 1 })}
			${this.field("school_type", __("School Type"), "radio", {
				reqd: 1,
				options: this.meta.school_types || [],
			})}
			${this.field("reference", __("Reference"), "text")}
			${this.field("school_additional_remarks", __("Any Additional Remarks regarding School"), "textarea")}
			${this.field("qps_affiliated", __("Is this school affiliated with QPS?"), "radio", {
				reqd: 1,
				options: aff,
			})}
			${
				this.is_affiliated_yes(this.data.qps_affiliated)
					? `<div class="smes-field"><label>${__("Which QPS services are adopted by the school?")}</label>${this.yn_matrix(this.meta.qps_services)}</div>`
					: ""
			}
			${this.field("tps_affiliated", __("Is this school affiliated with TPS?"), "radio", {
				reqd: 1,
				options: aff,
			})}
			${
				this.is_affiliated_yes(this.data.tps_affiliated)
					? `<div class="smes-field"><label>${__("Which TPS services are adopted by the school?")}</label>${this.yn_matrix(this.meta.tps_services)}</div>`
					: ""
			}
			${this.field(
				"cee_affiliated",
				__("Is this school affiliated with Teachers Training Department (CEE)?"),
				"radio",
				{ reqd: 1, options: aff },
			)}
			${
				this.is_affiliated_yes(this.data.cee_affiliated)
					? `<div class="smes-field"><label>${__("Which CEE services are adopted by the school?")}</label>${this.yn_matrix(this.meta.cee_services)}</div>`
					: ""
			}
			${this.field(
				"participant_names_enrolled",
				__(
					"Name of Participant enrolled in ELP/ TECC/ 90 Days TTC / Online Tajweed Customize Course / Story Telling Session",
				),
				"textarea",
				{ hint: __("Example: Zaid - ELP, Nasir - TECC") },
			)}
			${this.field("participant_contact_numbers", __("Contact Number of Above Participant(s)"), "text")}
			${this.field("model_school", __("Is this a Model School"), "radio", {
				options: this.meta.model_school_options || [],
			})}
			${this.field("registered_volunteer", __("Registered with TIF as a Volunteer"), "radio", {
				reqd: 1,
				options: ["Yes", "No"],
			})}
		`;
	}

	attach_field(field, label, accept = "image/*") {
		return `
			<div class="smes-attach-item" data-attach="${field}">
				<label>${frappe.utils.escape_html(label)}</label>
				<button type="button" class="btn btn-sm btn-default smes-upload" data-field="${field}" data-accept="${accept}">
					<i class="fa fa-upload"></i> ${__("Upload")}
				</button>
				<div class="file-name">${this.val(field) ? frappe.utils.escape_html(this.val(field)) : __("No file selected")}</div>
			</div>
		`;
	}

	html_attachments() {
		return `
			<h3>${__("Attachments")}</h3>
			<p class="text-muted">${__("Attach your relevant pictures")}</p>
			<div class="smes-attach-row">
				${this.attach_field("meeting_picture", __("Meeting Picture"), "image/*")}
				${this.attach_field("school_picture", __("School Picture"), "image/*")}
				${this.attach_field("visiting_card_attach", __("Visiting Card"), "image/*,.pdf")}
				${this.attach_field("attendance_sheet_attach", __("Attendance Sheet (Not any other Pictures)"), "image/*,.pdf")}
				${this.attach_field("training_awareness_pictures", __("Pictures of Training & Awareness Session"), "image/*,.pdf")}
				${this.attach_field("attendance_sheet_excel", __("MS Excel of Attendance Sheet"), ".xlsx,.xls,.csv,image/*,.pdf")}
			</div>
		`;
	}

	ensure_enrolment_rows() {
		if (!Array.isArray(this.data.enrolment_participants) || !this.data.enrolment_participants.length) {
			this.data.enrolment_participants = [this.blank_enrolment_row()];
		}
	}

	ensure_workshop_rows() {
		if (!Array.isArray(this.data.workshop_attendees) || !this.data.workshop_attendees.length) {
			this.data.workshop_attendees = [this.blank_workshop_row()];
		}
	}

	blank_enrolment_row(prev) {
		return {
			participant_name: "",
			contact_number: "",
			city: (prev && prev.city) || this.data.city || "",
			province:
				(prev && prev.province) ||
				this.map_province_label(this.data.province) ||
				"",
			enroll_in_course: (prev && prev.enroll_in_course) || "",
			date_of_enrolment: (prev && prev.date_of_enrolment) || this.data.visit_date || "",
			other_special_session_name: (prev && prev.other_special_session_name) || "",
		};
	}

	blank_workshop_row(prev) {
		return {
			attendee_name: "",
			contact_number: "",
			email: "",
			school_organization: (prev && prev.school_organization) || "",
			training_venue: (prev && prev.training_venue) || "",
			training_date: (prev && prev.training_date) || this.data.visit_date || "",
		};
	}

	map_province_label(portal_province) {
		const map = {
			Sindh: "Sindh",
			Punjab: "Punjab",
			KPK: "Khyber Pakhtunkhwa",
			Balochistan: "Balochistan",
			AJK: "Azad Jammu & Kashmir",
			"Gilgit-Baltistan": "Gilgit-Baltistan",
			ICT: "Islamabad Capital Territory",
		};
		return map[portal_province] || portal_province || "";
	}

	html_enrolment() {
		this.ensure_enrolment_rows();
		const courses = this.meta.enrolment_courses || [];
		const provinces = this.meta.province_options_full || [];
		const rows = this.data.enrolment_participants
			.map((row, idx) => {
				const show_other = row.enroll_in_course === "Other Special Session Offered by TIF";
				return `
				<div class="smes-multi-row" data-multi="enrolment" data-idx="${idx}">
					<div class="smes-multi-row__head">
						<strong>${__("Participant")} ${idx + 1}</strong>
						<button type="button" class="btn btn-xs btn-default smes-remove-row" data-multi="enrolment" data-idx="${idx}">
							${__("Remove")}
						</button>
					</div>
					${this.multi_field(idx, "enrolment", "participant_name", __("Name"), "text", { reqd: 1, value: row.participant_name })}
					<div class="smes-row-2">
						${this.multi_field(idx, "enrolment", "contact_number", __("Contact #"), "text", { value: row.contact_number })}
						${this.multi_field(idx, "enrolment", "city", __("City"), "text", { value: row.city })}
					</div>
					${this.multi_field(idx, "enrolment", "province", __("Province"), "select", {
						value: row.province,
						options: provinces,
					})}
					${this.multi_field(idx, "enrolment", "enroll_in_course", __("Enroll in (Course Name)"), "select", {
						reqd: 1,
						value: row.enroll_in_course,
						options: courses,
					})}
					${this.multi_field(idx, "enrolment", "date_of_enrolment", __("Date of Enrolment"), "date", {
						value: row.date_of_enrolment,
					})}
					${
						show_other
							? this.multi_field(
									idx,
									"enrolment",
									"other_special_session_name",
									__("Name of Other Special Session"),
									"text",
									{ value: row.other_special_session_name },
								)
							: ""
					}
				</div>`;
			})
			.join("");
		return `
			<h3>${__("Enrolment of Participants")}</h3>
			<p class="text-muted">${__("Add one or more teachers / participants. No school or volunteer details on this type.")}</p>
			<div class="smes-multi-list">${rows}</div>
			<div class="smes-multi-actions">
				<button type="button" class="btn btn-default btn-sm smes-add-row" data-multi="enrolment">${__("Add Participant")}</button>
				<button type="button" class="btn btn-primary btn-sm smes-add-multiple" data-multi="enrolment">${__("Add Multiple Participants")}</button>
			</div>
		`;
	}

	html_workshop_attendance() {
		this.ensure_workshop_rows();
		const rows = this.data.workshop_attendees
			.map((row, idx) => {
				return `
				<div class="smes-multi-row" data-multi="workshop" data-idx="${idx}">
					<div class="smes-multi-row__head">
						<strong>${__("Teacher / Attendee")} ${idx + 1}</strong>
						<button type="button" class="btn btn-xs btn-default smes-remove-row" data-multi="workshop" data-idx="${idx}">
							${__("Remove")}
						</button>
					</div>
					${this.multi_field(idx, "workshop", "attendee_name", __("Attendee Name"), "text", { reqd: 1, value: row.attendee_name })}
					<div class="smes-row-2">
						${this.multi_field(idx, "workshop", "contact_number", __("Contact Number"), "text", { value: row.contact_number })}
						${this.multi_field(idx, "workshop", "email", __("Email"), "email", {
							value: row.email,
							hint: __("Optional"),
						})}
					</div>
					${this.multi_field(idx, "workshop", "school_organization", __("School / Organization"), "text", {
						value: row.school_organization,
						hint: __("Repeats from previous row — editable"),
					})}
					${this.multi_field(idx, "workshop", "training_venue", __("Training Venue"), "text", {
						value: row.training_venue,
						hint: __("Repeats from previous row — editable"),
					})}
					${this.multi_field(idx, "workshop", "training_date", __("Training Date"), "date", {
						value: row.training_date,
						hint: __("Repeats from previous row — editable"),
					})}
				</div>`;
			})
			.join("");
		return `
			<h3>${__("Attendance / Registration in One Day / Half day Workshop")}</h3>
			<p class="text-muted">${__("Add multiple teachers. School / Venue / Date repeat on next row and stay editable.")}</p>
			<div class="smes-multi-list">${rows}</div>
			<div class="smes-multi-actions">
				<button type="button" class="btn btn-default btn-sm smes-add-row" data-multi="workshop">${__("Add Teacher")}</button>
				<button type="button" class="btn btn-primary btn-sm smes-add-multiple" data-multi="workshop">${__("Add Multiple Teachers")}</button>
			</div>
		`;
	}

	html_travel() {
		return `
			<h3>${__("Travel")}</h3>
			${this.field("travel_mode", __("Mode of Travel"), "select", {
				options: this.meta.travel_modes || [],
			})}
			<div class="smes-row-2">
				${this.field("travel_from", __("Travel From"), "text")}
				${this.field("travel_to", __("Travel To"), "text")}
			</div>
			<div class="smes-row-2">
				${this.field("travel_distance_km", __("Distance (KM)"), "number")}
				${this.field("travel_cost", __("Travel Cost"), "number")}
			</div>
			${this.field("travel_remarks", __("Travel Remarks"), "textarea")}
		`;
	}

	html_preview() {
		const kind = this.activity_kind();
		const esc = frappe.utils.escape_html;
		let rows_html = "";
		if (kind === "enrolment") {
			rows_html = (this.data.enrolment_participants || [])
				.map(
					(r, i) => `
				<tr>
					<td>${i + 1}</td>
					<td>${esc(r.participant_name || "")}</td>
					<td>${esc(r.contact_number || "")}</td>
					<td>${esc(r.city || "")}</td>
					<td>${esc(r.province || "")}</td>
					<td>${esc(r.enroll_in_course || "")}</td>
					<td>${esc(r.date_of_enrolment || "")}</td>
					<td>${esc(r.other_special_session_name || "")}</td>
				</tr>`,
				)
				.join("");
			rows_html = `
				<table class="table table-bordered table-sm smes-preview-table">
					<thead>
						<tr>
							<th>#</th><th>${__("Name")}</th><th>${__("Contact")}</th><th>${__("City")}</th>
							<th>${__("Province")}</th><th>${__("Course")}</th><th>${__("Date")}</th><th>${__("Other Session")}</th>
						</tr>
					</thead>
					<tbody>${rows_html || `<tr><td colspan="8">${__("No participants")}</td></tr>`}</tbody>
				</table>`;
		} else {
			rows_html = (this.data.workshop_attendees || [])
				.map(
					(r, i) => `
				<tr>
					<td>${i + 1}</td>
					<td>${esc(r.attendee_name || "")}</td>
					<td>${esc(r.contact_number || "")}</td>
					<td>${esc(r.email || "")}</td>
					<td>${esc(r.school_organization || "")}</td>
					<td>${esc(r.training_venue || "")}</td>
					<td>${esc(r.training_date || "")}</td>
				</tr>`,
				)
				.join("");
			rows_html = `
				<table class="table table-bordered table-sm smes-preview-table">
					<thead>
						<tr>
							<th>#</th><th>${__("Attendee")}</th><th>${__("Contact")}</th><th>${__("Email")}</th>
							<th>${__("School / Org")}</th><th>${__("Venue")}</th><th>${__("Date")}</th>
						</tr>
					</thead>
					<tbody>${rows_html || `<tr><td colspan="7">${__("No attendees")}</td></tr>`}</tbody>
				</table>`;
		}
		return `
			<h3>${__("Preview")}</h3>
			<p class="text-muted">${__("Review details, then Submit.")}</p>
			<div class="smes-preview-block">
				<p><strong>${__("Staff")}:</strong> ${esc(this.data.visit_by || "")}</p>
				<p><strong>${__("Date")}:</strong> ${esc(this.data.visit_date || "")}</p>
				<p><strong>${__("Type")}:</strong> ${esc(this.data.activity_type || "")}</p>
				<p><strong>${__("City / Area / Province")}:</strong>
					${esc(this.data.city || "")} / ${esc(this.data.area || "")} / ${esc(this.data.province || "")}
				</p>
			</div>
			${rows_html}
			<div class="smes-preview-block">
				<p><strong>${__("Travel")}:</strong>
					${esc(this.data.travel_mode || "—")}
					${this.data.travel_from || this.data.travel_to ? ` (${esc(this.data.travel_from || "")} → ${esc(this.data.travel_to || "")})` : ""}
				</p>
				<p><strong>${__("Distance / Cost")}:</strong>
					${esc(String(this.data.travel_distance_km || "—"))} km /
					${esc(String(this.data.travel_cost || "—"))}
				</p>
			</div>
		`;
	}

	multi_field(idx, multi, name, label, type = "text", opts = {}) {
		const req = opts.reqd ? `<span class="req">*</span>` : "";
		const hint = opts.hint ? `<div class="hint">${frappe.utils.escape_html(opts.hint)}</div>` : "";
		const val = opts.value == null ? "" : opts.value;
		let control = "";
		if (type === "select") {
			const options = [`<option value="">${__("Select")}</option>`]
				.concat(
					(opts.options || []).map((o) => {
						const selected = val === o ? "selected" : "";
						return `<option value="${frappe.utils.escape_html(o)}" ${selected}>${frappe.utils.escape_html(o)}</option>`;
					}),
				)
				.join("");
			control = `<select data-multi-field="${name}" data-multi="${multi}" data-idx="${idx}">${options}</select>`;
		} else if (type === "date") {
			control = `<input type="date" data-multi-field="${name}" data-multi="${multi}" data-idx="${idx}" value="${frappe.utils.escape_html(val || "")}" />`;
		} else {
			control = `<input type="${type}" data-multi-field="${name}" data-multi="${multi}" data-idx="${idx}" value="${frappe.utils.escape_html(val || "")}" />`;
		}
		return `<div class="smes-field"><label>${frappe.utils.escape_html(label)}${req}</label>${control}${hint}</div>`;
	}

	collect_multi_rows() {
		const collect = (multi, key, fields) => {
			const map = {};
			this.$root.find(`[data-multi="${multi}"][data-multi-field]`).each((_, el) => {
				const $el = $(el);
				const idx = cint($el.data("idx"));
				const field = $el.data("multi-field");
				if (!map[idx]) map[idx] = {};
				map[idx][field] = $el.val();
			});
			const rows = Object.keys(map)
				.sort((a, b) => cint(a) - cint(b))
				.map((k) => map[k]);
			if (rows.length) this.data[key] = rows;
		};
		collect("enrolment", "enrolment_participants");
		collect("workshop", "workshop_attendees");
	}

	bind_multi_row_actions() {
		this.$root.find(".smes-add-row").off("click").on("click", (e) => {
			this.collect();
			const multi = $(e.currentTarget).data("multi");
			if (multi === "enrolment") {
				this.ensure_enrolment_rows();
				const prev = this.data.enrolment_participants[this.data.enrolment_participants.length - 1];
				this.data.enrolment_participants.push(this.blank_enrolment_row(prev));
			} else {
				this.ensure_workshop_rows();
				const prev = this.data.workshop_attendees[this.data.workshop_attendees.length - 1];
				this.data.workshop_attendees.push(this.blank_workshop_row(prev));
			}
			this.render_step();
		});
		this.$root.find(".smes-add-multiple").off("click").on("click", (e) => {
			const multi = $(e.currentTarget).data("multi");
			frappe.prompt(
				[
					{
						fieldname: "count",
						fieldtype: "Int",
						label: multi === "enrolment" ? __("Number of participants") : __("Number of teachers"),
						default: 5,
						reqd: 1,
					},
				],
				(values) => {
					this.collect();
					const n = Math.max(1, cint(values.count) || 1);
					if (multi === "enrolment") {
						this.ensure_enrolment_rows();
						for (let i = 0; i < n; i += 1) {
							const prev =
								this.data.enrolment_participants[this.data.enrolment_participants.length - 1];
							this.data.enrolment_participants.push(this.blank_enrolment_row(prev));
						}
					} else {
						this.ensure_workshop_rows();
						for (let i = 0; i < n; i += 1) {
							const prev = this.data.workshop_attendees[this.data.workshop_attendees.length - 1];
							this.data.workshop_attendees.push(this.blank_workshop_row(prev));
						}
					}
					this.render_step();
				},
				__("Add Multiple"),
				__("Add"),
			);
		});
		this.$root.find(".smes-remove-row").off("click").on("click", (e) => {
			this.collect();
			const multi = $(e.currentTarget).data("multi");
			const idx = cint($(e.currentTarget).data("idx"));
			if (multi === "enrolment") {
				this.data.enrolment_participants.splice(idx, 1);
				this.ensure_enrolment_rows();
			} else {
				this.data.workshop_attendees.splice(idx, 1);
				this.ensure_workshop_rows();
			}
			this.render_step();
		});
		this.$root.find("[data-multi-field='enroll_in_course']").off("change.smesOther").on("change.smesOther", () => {
			this.collect();
			this.render_step();
		});
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
			if ($el.attr("type") === "checkbox" && $el.data("multi")) {
				return;
			}
			if ($el.attr("type") === "radio") {
				if ($el.is(":checked")) this.data[field] = $el.val();
			} else if ($el.attr("type") === "time") {
				this.data[field] = this.normalize_time_for_frappe($el.val());
			} else if (!$el.closest(".smes-frappe-ctl").length) {
				this.data[field] = $el.val();
			}
		});
		this.$root.find(".smes-check-group").each((_, group) => {
			const $g = $(group);
			const field = $g.data("check-field");
			const values = [];
			$g.find('input[type="checkbox"]:checked').each((__, cb) => values.push($(cb).val()));
			this.data[field] = values;
		});
		this.collect_multi_rows();
	}

	need(fields, msg) {
		for (const f of fields) {
			const v = this.data[f];
			const empty = Array.isArray(v) ? !v.length : !cstr(v).trim();
			if (empty) {
				frappe.show_alert({ message: msg || __("Please fill required fields"), indicator: "orange" }, 5);
				return false;
			}
		}
		return true;
	}

	validate_step() {
		const key = this.steps[this.step].key;
		if (key === "general") {
			return this.need(
				["visit_by", "month", "visit_date", "activity_type", "city", "area", "province"],
				__("Fill all required General fields"),
			);
		}
		if (key === "marketing") {
			if (
				!this.need(
					["frequency_of_visits", "marketing_material_provided", "status"],
					__("Fill Marketing Visit required fields"),
				)
			) {
				return false;
			}
			if (
				(this.data.status === "Not Agree" || this.data.status === "Other") &&
				!this.need(["reasons_if_not_agreed"], __("Select reason if not agreed"))
			) {
				return false;
			}
			if (this.data.reasons_if_not_agreed === "Other" && !this.need(["reasons_if_not_agreed_other"])) {
				return false;
			}
			return true;
		}
		if (key === "me") {
			const req = [
				"me_mqh_book_status",
				"me_demand_from_school",
				"me_teachers_training_session",
				"me_number_of_teachers_mqh",
				"me_used_teachers_guide",
				"me_mqh_book_version",
				"me_mqh_book_part",
				"me_classes_per_week",
				"me_class_duration",
				"me_took_assessment",
				"me_student_behavior_changes",
			];
			if (!this.need(req, __("Fill M&E Visit required fields"))) return false;
			if (this.data.me_mqh_book_status === "In-Active" && !this.need(["me_inactive_reasons"])) return false;
			if (this.data.me_number_of_teachers_mqh === "Others" && !this.need(["me_teachers_mqh_other"])) return false;
			if (this.data.me_took_assessment === "Yes" && !this.need(["me_assessment_from"])) return false;
			return true;
		}
		if (key === "joint") {
			return this.need(
				["joint_visit_with_smes", "joint_sme_skill_rating"],
				__("Fill Joint Visit required fields"),
			);
		}
		if (key === "training") {
			return this.need(
				[
					"training_arrange_by",
					"training_conducted_by",
					"training_session_category",
					"training_venue_name",
					"training_no_of_participants",
					"training_no_of_schools_attended",
				],
				__("Fill Trainings & Workshops required fields"),
			);
		}
		if (key === "meeting") {
			if (!this.need(["mt_meeting_type", "mt_meeting_mode"], __("Fill Meetings required fields"))) {
				return false;
			}
			const t = this.data.mt_meeting_type || "";
			if (t.includes("Internal Meeting") && !this.need(["mt_internal_meeting_with"])) return false;
			if (t.includes("External Meeting") && !this.need(["mt_external_meeting_with"])) return false;
			return true;
		}
		if (key === "academic") {
			if (!this.need(["ot_type_of_task", "ot_hours_spent"], __("Fill Academic / Other required fields"))) {
				return false;
			}
			if (this.data.ot_type_of_task === "Academic Tasks") {
				if (!this.need(["ot_academic_task_types"])) return false;
				if (
					this.as_list("ot_academic_task_types").includes("Other") &&
					!this.need(["ot_academic_task_other"])
				) {
					return false;
				}
			}
			return true;
		}
		if (key === "cocurricular") {
			return this.need(["cc_activity"], __("Select Co-curricular Activity"));
		}
		if (key === "school" && this.is_school_visit()) {
			return this.need(
				[
					"school_name",
					"designation",
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
		if (key === "enrolment") {
			const rows = this.data.enrolment_participants || [];
			if (!rows.length) {
				frappe.show_alert({ message: __("Add at least one participant"), indicator: "orange" }, 5);
				return false;
			}
			for (let i = 0; i < rows.length; i += 1) {
				const r = rows[i];
				if (!cstr(r.participant_name).trim() || !cstr(r.enroll_in_course).trim()) {
					frappe.show_alert(
						{
							message: __("Participant {0}: Name and Course are required", [i + 1]),
							indicator: "orange",
						},
						5,
					);
					return false;
				}
			}
			return true;
		}
		if (key === "workshop_attendance") {
			const rows = this.data.workshop_attendees || [];
			if (!rows.length) {
				frappe.show_alert({ message: __("Add at least one teacher / attendee"), indicator: "orange" }, 5);
				return false;
			}
			for (let i = 0; i < rows.length; i += 1) {
				if (!cstr(rows[i].attendee_name).trim()) {
					frappe.show_alert(
						{ message: __("Attendee {0}: Name is required", [i + 1]), indicator: "orange" },
						5,
					);
					return false;
				}
			}
			return true;
		}
		if (key === "travel" || key === "preview" || key === "attachments") {
			return true;
		}
		return true;
	}

	download_bulk_template() {
		const url = frappe.urllib.get_full_url(
			"/api/method/tif_customization.tif_customization.page.smes_activity_form.smes_activity_form.download_bulk_import_template",
		);
		window.open(url, "_blank");
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
			this.data = this.empty_data();
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
