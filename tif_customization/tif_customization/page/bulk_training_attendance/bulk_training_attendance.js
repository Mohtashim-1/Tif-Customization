frappe.pages["bulk-training-attendance"].on_page_load = function (wrapper) {
	new BulkTrainingAttendancePage(wrapper);
};

class BulkTrainingAttendancePage {
	constructor(wrapper) {
		this.page = frappe.ui.make_app_page({
			parent: wrapper,
			title: __("Bulk Training Attendance"),
			single_column: true,
		});
		this.selected = null;
		this.rows = [];
		this.attendance = [];
		this.student_filter = "All";
		this.setup_layout();
		this.setup_filters();
		this.bind_actions();
		this.load_sessions();
	}

	setup_layout() {
		this.body = $(`
			<div class="bta-root">
				<style>
					.bta-root{padding:12px 12px 28px;max-width:1280px;margin:0 auto}
					.bta-filters{background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:12px 14px;margin-bottom:14px}
					.bta-note{font-size:12px;color:#64748b;margin:8px 0 0;line-height:1.45}
					.bta-grid{display:grid;grid-template-columns:1.15fr .85fr;gap:14px;margin-bottom:14px}
					@media (max-width:960px){.bta-grid{grid-template-columns:1fr}}
					.bta-card{background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:12px 14px}
					.bta-title{font-size:15px;font-weight:700;margin:0 0 10px;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}
					.bta-table-wrap{overflow:auto;max-height:420px;border:1px solid #e5e7eb;border-radius:8px}
					.bta-table-wrap.tall{max-height:560px}
					.bta-table{width:100%;border-collapse:collapse;font-size:12px}
					.bta-table th,.bta-table td{border-bottom:1px solid #e5e7eb;padding:8px 10px;text-align:left;vertical-align:middle}
					.bta-table thead th{position:sticky;top:0;background:#f1f5f9;font-weight:700;z-index:1;white-space:nowrap}
					.bta-table tr.pick{cursor:pointer}
					.bta-table tr.pick:hover td{background:#f8fafc}
					.bta-table tr.on td{background:#ecfdf5}
					.bta-muted{color:#64748b;font-size:11px}
					.bta-pill{display:inline-block;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:700;background:#e2e8f0;color:#334155}
					.bta-pill.ok{background:#d1fae5;color:#047857}
					.bta-pill.warn{background:#fef3c7;color:#b45309}
					.bta-pill.zoom{background:#dbeafe;color:#1d4ed8}
					.bta-pill.manual{background:#ede9fe;color:#6d28d9}
					.bta-field{margin-bottom:10px}
					.bta-field label{display:block;font-size:11px;font-weight:700;color:#64748b;margin-bottom:4px;text-transform:uppercase;letter-spacing:.04em}
					.bta-field select,.bta-field input[type=file]{width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:7px 10px;background:#fff}
					.bta-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
					.bta-selected{border:1px solid #a7f3d0;background:#f0fdf4;border-radius:8px;padding:10px 12px;margin-bottom:12px}
					.bta-selected strong{display:block;margin-bottom:2px}
					.bta-msg{margin-top:10px;font-size:12px}
					.bta-msg.ok{color:#047857}
					.bta-msg.err{color:#b91c1c}
					.bta-hint{font-size:11px;color:#64748b;line-height:1.4;margin:8px 0 0}
					.bta-chips{display:flex;gap:6px;flex-wrap:wrap}
					.bta-chip{border:1px solid #e2e8f0;background:#fff;border-radius:999px;padding:4px 10px;font-size:11px;font-weight:650;cursor:pointer}
					.bta-chip.on{background:#0f766e;border-color:#0f766e;color:#fff}
					.bta-kpis{display:flex;gap:10px;flex-wrap:wrap;margin:0 0 10px}
					.bta-kpi{border:1px solid #e5e7eb;border-radius:8px;padding:8px 12px;background:#fff;min-width:110px}
					.bta-kpi b{display:block;font-size:18px;font-weight:800}
					.bta-kpi span{font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.04em}
				</style>
				<div class="bta-filters">
					<div class="d-flex justify-content-between align-items-center mb-2">
						<strong>${__("Bulk Training Attendance")}</strong>
						<button class="btn btn-sm btn-primary bta-refresh">${__("Refresh")}</button>
					</div>
					<div class="row">
						<div class="col-md-2 mb-2" data-field="from_date"></div>
						<div class="col-md-2 mb-2" data-field="to_date"></div>
						<div class="col-md-3 mb-2" data-field="search"></div>
					</div>
					<p class="bta-note mb-0">
						${__("Pick a training to view all students, then import Excel/CSV (Manual or Zoom).")}
					</p>
				</div>
				<div class="bta-grid">
					<div class="bta-card">
						<div class="bta-title">${__("Trainings")}</div>
						<div class="bta-list"></div>
					</div>
					<div class="bta-card">
						<div class="bta-title">${__("Upload attendance")}</div>
						<div class="bta-upload"></div>
					</div>
				</div>
				<div class="bta-card bta-students-card">
					<div class="bta-title">
						<span>${__("Students / participants")}</span>
						<span class="bta-chips">
							<span class="bta-chip on" data-student-filter="All">${__("All")}</span>
							<span class="bta-chip" data-student-filter="Manual">${__("Manual")}</span>
							<span class="bta-chip" data-student-filter="Zoom">${__("Zoom")}</span>
						</span>
					</div>
					<div class="bta-students"></div>
				</div>
			</div>
		`);
		$(this.page.body).empty().append(this.body);
		this.render_upload_panel();
		this.render_students();
	}

	make_filter(df) {
		const $slot = this.body.find(`[data-field="${df.fieldname}"]`);
		const control = frappe.ui.form.make_control({
			parent: $slot.get(0),
			df: { ...df },
			render_input: true,
		});
		control.refresh();
		if (df.default !== undefined && df.default !== null) control.set_value(df.default);
		return control;
	}

	setup_filters() {
		const today = frappe.datetime.get_today();
		this.filters = {
			from_date: this.make_filter({
				label: __("From Date"),
				fieldname: "from_date",
				fieldtype: "Date",
				default: frappe.datetime.add_months(today, -2),
				reqd: 1,
			}),
			to_date: this.make_filter({
				label: __("To Date"),
				fieldname: "to_date",
				fieldtype: "Date",
				default: today,
				reqd: 1,
			}),
			search: this.make_filter({
				label: __("Search"),
				fieldname: "search",
				fieldtype: "Data",
				placeholder: __("Topic, school, ID…"),
			}),
		};
	}

	bind_actions() {
		this.body.find(".bta-refresh").on("click", () => this.load_sessions());
		this.body.on("click", "[data-session]", (e) => {
			const name = $(e.currentTarget).attr("data-session");
			this.selected = (this.rows || []).find((r) => r.name === name) || null;
			this.render_list();
			this.render_upload_panel();
			this.load_attendance();
		});
		this.body.on("click", "[data-student-filter]", (e) => {
			this.student_filter = $(e.currentTarget).attr("data-student-filter") || "All";
			this.body.find("[data-student-filter]").removeClass("on");
			$(e.currentTarget).addClass("on");
			this.render_students();
		});
		this.body.on("change", ".bta-file", (e) => this.on_file(e));
		this.body.on("click", ".bta-import", () => this.trigger_file());
		if (this.page && this.page.set_primary_action) {
			this.page.set_primary_action(__("Refresh"), () => this.load_sessions(), "refresh");
		}
	}

	get_filters() {
		const from_date = this.filters.from_date.get_value();
		const to_date = this.filters.to_date.get_value();
		if (!from_date || !to_date) {
			frappe.msgprint(__("Please set From Date and To Date."));
			return null;
		}
		return {
			from_date,
			to_date,
			search: (this.filters.search.get_value() || "").trim(),
		};
	}

	load_sessions() {
		const filters = this.get_filters();
		if (!filters) return;
		this.body.find(".bta-list").html(`<div class="text-muted p-3">${__("Loading…")}</div>`);
		frappe.call({
			method:
				"tif_customization.tif_customization.page.bulk_training_attendance.bulk_training_attendance.list_sessions",
			args: { filters },
			freeze: true,
			callback: (r) => {
				this.rows = (r.message && r.message.rows) || [];
				if (this.selected) {
					this.selected = this.rows.find((x) => x.name === this.selected.name) || null;
				}
				this.render_list();
				this.render_upload_panel();
				if (this.selected) this.load_attendance();
				else {
					this.attendance = [];
					this.render_students();
				}
			},
			error: () => {
				this.body
					.find(".bta-list")
					.html(`<div class="text-danger p-3">${__("Failed to load trainings.")}</div>`);
			},
		});
	}

	load_attendance() {
		if (!this.selected) {
			this.attendance = [];
			this.render_students();
			return;
		}
		this.body.find(".bta-students").html(`<div class="text-muted p-3">${__("Loading students…")}</div>`);
		frappe.call({
			method:
				"tif_customization.tif_customization.page.bulk_training_attendance.bulk_training_attendance.get_attendance",
			args: { name: this.selected.name },
			callback: (r) => {
				const msg = r.message || {};
				this.attendance = msg.attendance || [];
				if (this.selected) {
					this.selected.attendance_total = msg.attendance_total || 0;
					this.selected.attendance_present = msg.attendance_present || 0;
					this.selected.zoom_count = msg.zoom_count || 0;
					this.selected.manual_count = msg.manual_count || 0;
				}
				this.render_list();
				this.render_students();
			},
			error: () => {
				this.body
					.find(".bta-students")
					.html(`<div class="text-danger p-3">${__("Failed to load attendance.")}</div>`);
			},
		});
	}

	esc(v) {
		return frappe.utils.escape_html(v == null ? "" : String(v));
	}

	render_list() {
		if (!this.rows.length) {
			this.body
				.find(".bta-list")
				.html(`<div class="text-muted p-3">${__("No trainings in this date range.")}</div>`);
			return;
		}
		const rows = this.rows
			.map((r) => {
				const on = this.selected && this.selected.name === r.name ? "on" : "";
				const att =
					r.attendance_total > 0
						? `<span class="bta-pill ok">${r.attendance_present}/${r.attendance_total}</span>`
						: `<span class="bta-pill">${__("No attendance")}</span>`;
				return `<tr class="pick ${on}" data-session="${this.esc(r.name)}">
					<td>
						<strong>${this.esc(r.title)}</strong>
						<div class="bta-muted">${this.esc(r.name)}${r.school_name ? " · " + this.esc(r.school_name) : ""}</div>
					</td>
					<td style="white-space:nowrap">${this.esc(frappe.datetime.str_to_user(r.training_date))}</td>
					<td>${this.esc(r.trainer_name || "—")}</td>
					<td>${att}
						<div class="bta-muted">Z ${r.zoom_count || 0} · M ${r.manual_count || 0}</div>
					</td>
				</tr>`;
			})
			.join("");
		this.body.find(".bta-list").html(`
			<div class="bta-table-wrap">
				<table class="bta-table">
					<thead><tr>
						<th>${__("Training")}</th>
						<th>${__("Date")}</th>
						<th>${__("Trainer")}</th>
						<th>${__("Attendance")}</th>
					</tr></thead>
					<tbody>${rows}</tbody>
				</table>
			</div>
		`);
	}

	render_upload_panel() {
		const s = this.selected;
		if (!s) {
			this.body.find(".bta-upload").html(`
				<div class="text-muted">${__("Select a training to upload and view student attendance.")}</div>
				<p class="bta-hint">
					${__("Manual columns")}: Name, School / Institute, Cell No, Email, Signed<br>
					${__("Zoom columns")}: Name, Email, Join time, Leave time, Duration…
				</p>
			`);
			return;
		}
		this.body.find(".bta-upload").html(`
			<div class="bta-selected">
				<strong>${this.esc(s.title)}</strong>
				<span class="bta-muted">${this.esc(s.name)} · ${this.esc(
					frappe.datetime.str_to_user(s.training_date)
				)}${s.school_name ? " · " + this.esc(s.school_name) : ""}</span>
			</div>
			<div class="bta-field">
				<label>${__("Attendance type")}</label>
				<select class="bta-source">
					<option value="Manual">${__("Manual (school sheet / principals)")}</option>
					<option value="Zoom">${__("Zoom report")}</option>
				</select>
			</div>
			<div class="bta-field">
				<label>${__("Import mode")}</label>
				<select class="bta-mode">
					<option value="replace">${__("Replace this type")}</option>
					<option value="append">${__("Append new rows")}</option>
				</select>
			</div>
			<div class="bta-field bta-ignore-wrap" style="display:none">
				<label><input type="checkbox" class="bta-ignore-date" /> ${__(
					"Import all Zoom rows (ignore session date)"
				)}</label>
			</div>
			<input class="bta-file" type="file" accept=".csv,.xlsx,.xlsm,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden />
			<div class="bta-actions">
				<button type="button" class="btn btn-primary bta-import">${__("Import Excel / CSV")}</button>
				<a class="btn btn-default" href="/app/upcoming-training/${encodeURIComponent(s.name)}" target="_blank">${__(
					"Open Training"
				)}</a>
			</div>
			<p class="bta-hint">
				${__("Use .xlsx or .csv. After import, students appear in the table below.")}
			</p>
			<div class="bta-msg"></div>
		`);
		this.body.find(".bta-source").on("change", () => {
			const zoom = this.body.find(".bta-source").val() === "Zoom";
			this.body.find(".bta-ignore-wrap").toggle(zoom);
		});
	}

	filtered_students() {
		const f = this.student_filter || "All";
		return (this.attendance || []).filter((r) => {
			if (f === "All") return true;
			const src = (r.attendance_source || "Manual").trim() || "Manual";
			return src === f;
		});
	}

	render_students() {
		if (!this.selected) {
			this.body.find(".bta-students").html(`
				<div class="text-muted p-3">${__("Select a training above to see student / participant data.")}</div>
			`);
			return;
		}
		const all = this.attendance || [];
		const list = this.filtered_students();
		const present = list.filter((r) => r.attendance_status === "Present").length;
		const zoom = all.filter((r) => r.attendance_source === "Zoom").length;
		const manual = all.length - zoom;

		if (!all.length) {
			this.body.find(".bta-students").html(`
				<div class="bta-kpis">
					<div class="bta-kpi"><b>0</b><span>${__("Total")}</span></div>
				</div>
				<div class="text-muted p-3">${__("No students yet. Import Excel/CSV on the right.")}</div>
			`);
			return;
		}

		const showZoomCols = list.some((r) => r.attendance_source === "Zoom");
		const rows = list
			.map((r, i) => {
				const src = r.attendance_source === "Zoom" ? "Zoom" : "Manual";
				const st = r.attendance_status || "Present";
				const stCls = st === "Present" ? "ok" : st === "Late" ? "warn" : "";
				return `<tr>
					<td class="bta-muted">${i + 1}</td>
					<td><strong>${this.esc(r.participant_name || "")}</strong>
						${r.email ? `<div class="bta-muted">${this.esc(r.email)}</div>` : ""}
					</td>
					<td>${this.esc(r.institute || "—")}</td>
					<td style="white-space:nowrap">${this.esc(r.phone || "—")}</td>
					${
						showZoomCols
							? `<td class="bta-muted">${this.esc(r.join_time || "")}</td>
							   <td class="bta-muted">${this.esc(r.leave_time || "")}</td>
							   <td>${r.duration_minutes != null && r.duration_minutes !== "" ? this.esc(r.duration_minutes) : "—"}</td>`
							: ""
					}
					<td><span class="bta-pill ${src === "Zoom" ? "zoom" : "manual"}">${this.esc(src)}</span></td>
					<td><span class="bta-pill ${stCls}">${this.esc(st)}</span></td>
				</tr>`;
			})
			.join("");

		this.body.find(".bta-students").html(`
			<div class="bta-kpis">
				<div class="bta-kpi"><b>${list.length}</b><span>${__("Shown")}</span></div>
				<div class="bta-kpi"><b>${present}</b><span>${__("Present")}</span></div>
				<div class="bta-kpi"><b>${manual}</b><span>${__("Manual (all)")}</span></div>
				<div class="bta-kpi"><b>${zoom}</b><span>${__("Zoom (all)")}</span></div>
			</div>
			<div class="bta-table-wrap tall">
				<table class="bta-table">
					<thead><tr>
						<th>#</th>
						<th>${__("Name")}</th>
						<th>${__("Institute / School")}</th>
						<th>${__("Cell No")}</th>
						${
							showZoomCols
								? `<th>${__("Join")}</th><th>${__("Leave")}</th><th>${__("Duration")}</th>`
								: ""
						}
						<th>${__("Type")}</th>
						<th>${__("Status")}</th>
					</tr></thead>
					<tbody>${rows}</tbody>
				</table>
			</div>
		`);
	}

	trigger_file() {
		if (!this.selected) {
			frappe.msgprint(__("Select a training first."));
			return;
		}
		this.body.find(".bta-file").trigger("click");
	}

	file_to_payload(file) {
		return new Promise((resolve, reject) => {
			const name = (file.name || "").toLowerCase();
			if (name.endsWith(".ods") || name.endsWith(".xls")) {
				reject(
					new Error(
						__("Save as .xlsx or .csv first (LibreOffice → File → Save As → Excel .xlsx).")
					)
				);
				return;
			}
			if (name.endsWith(".xlsx") || name.endsWith(".xlsm")) {
				const reader = new FileReader();
				reader.onload = () => {
					const buf = new Uint8Array(reader.result);
					let binary = "";
					for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
					resolve({ content_b64: btoa(binary), filename: file.name });
				};
				reader.onerror = () => reject(new Error(__("Could not read Excel file.")));
				reader.readAsArrayBuffer(file);
			} else {
				file
					.text()
					.then((content) => resolve({ content, filename: file.name || "attendance.csv" }))
					.catch(reject);
			}
		});
	}

	async on_file(event) {
		const file = event.target && event.target.files && event.target.files[0];
		if (!file || !this.selected) return;
		const $msg = this.body.find(".bta-msg").removeClass("ok err").text(__("Importing…"));
		const source = this.body.find(".bta-source").val() || "Manual";
		const mode = this.body.find(".bta-mode").val() || "replace";
		const ignore_date = this.body.find(".bta-ignore-date").is(":checked") ? 1 : 0;
		try {
			const payload = await this.file_to_payload(file);
			const result = await new Promise((resolve, reject) => {
				frappe.call({
					method:
						"tif_customization.tif_customization.page.bulk_training_attendance.bulk_training_attendance.import_file",
					args: {
						name: this.selected.name,
						...payload,
						mode,
						source,
						ignore_date,
					},
					freeze: true,
					freeze_message: __("Importing attendance…"),
					callback: (r) => resolve(r.message || {}),
					error: (e) => reject(e),
				});
			});
			if (result.date_mismatch) {
				$msg.addClass("err").text(result.message || __("No rows matched session date."));
			} else {
				$msg.addClass("ok").text(result.message || __("Imported."));
			}
			this.load_sessions();
			this.load_attendance();
		} catch (e) {
			const text =
				(e && e.message) || (typeof e === "string" ? e : "") || __("Import failed.");
			$msg.addClass("err").text(text);
		} finally {
			if (event.target) event.target.value = "";
		}
	}
}
