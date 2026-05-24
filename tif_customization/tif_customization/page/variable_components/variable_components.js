frappe.pages["variable-components"].on_page_load = function (wrapper) {
	frappe.require("/assets/tif_customization/css/variable_components.css");

	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Variable Components"),
		single_column: true,
	});

	if (!window.VariableComponentsPage) {
		window.VariableComponentsPage = class VariableComponentsPage {
			constructor(page) {
				this.page = page;
				this._data = null;
				this._dirty = new Set();
				this._values = {};
			}

			make() {
				this.render_shell();
				this.bind_events();
				this.load_periods();
			}

			render_shell() {
				this.page.main.html(`
					<div class="vc-root">
						<div class="vc-toolbar">
							<div class="filter-field">
								<label>${__("Payroll Period")}</label>
								<select class="form-control period-select"></select>
							</div>
							<div class="filter-field">
								<label>${__("Company")}</label>
								<select class="form-control company-filter"></select>
							</div>
							<div class="vc-toolbar__actions">
								<span class="vc-dirty-hint">${__("Unsaved changes")}</span>
								<button class="btn btn-default btn-sm btn-reload">
									<i class="fa fa-refresh"></i> ${__("Reload")}
								</button>
								<button class="btn btn-primary btn-sm btn-save" disabled>
									<i class="fa fa-save"></i> ${__("Save & Create Additional Salary")}
								</button>
								<a class="btn btn-default btn-sm" href="/app/additional-salary">${__("Additional Salary List")}</a>
							</div>
						</div>
						<div class="vc-legend">
							<span><i class="swatch-salary"></i> ${__("Salary from slip (read-only)")}</span>
							<span><i class="swatch-earn"></i> ${__("Variable earnings (editable → Additional Salary)")}</span>
							<span><i class="swatch-ded"></i> ${__("Variable deductions (editable)")}</span>
							<span><i class="swatch-dirty"></i> ${__("Edited (not saved)")}</span>
						</div>
						<div class="vc-sheet-wrap">
							<div class="vc-sheet-content"></div>
						</div>
					</div>
				`);

				this.$period = this.page.main.find(".period-select");
				this.$company = this.page.main.find(".company-filter");
				this.$sheet = this.page.main.find(".vc-sheet-content");
				this.$save = this.page.main.find(".btn-save");
				this.$dirty_hint = this.page.main.find(".vc-dirty-hint");
			}

			bind_events() {
				this.page.main.find(".btn-reload").on("click", () => this.confirm_reload(() => this.load_sheet()));
				this.$save.on("click", () => this.save());
				this.$period.on("change", () => this.confirm_reload(() => this.load_sheet()));
				this.$company.on("change", () => this.confirm_reload(() => this.load_sheet()));
			}

			confirm_reload(fn) {
				if (this._dirty.size) {
					frappe.confirm(__("Discard unsaved changes?"), () => {
						this._dirty.clear();
						fn();
					});
				} else {
					fn();
				}
			}

			load_periods() {
				frappe.call({
					method: "tif_customization.tif_customization.page.variable_components.variable_components.get_period_options_for_variable",
					callback: (r) => {
						const opts = r.message || [];
						this.$period.empty();
						if (!opts.length) {
							const t = frappe.datetime.get_today();
							opts.push({
								label: t.substring(0, 7),
								month: parseInt(t.substring(5, 7), 10),
								year: parseInt(t.substring(0, 4), 10),
								start_date: frappe.datetime.month_start(t),
								end_date: frappe.datetime.month_end(t),
							});
						}
						opts.forEach((o) => {
							this.$period.append(
								`<option value="${o.year}-${String(o.month).padStart(2, "0")}" data-start="${o.start_date}" data-end="${o.end_date}">${frappe.utils.escape_html(o.label)}</option>`,
							);
						});
						this.load_companies();
					},
				});
			}

			load_companies() {
				frappe.call({
					method: "frappe.client.get_list",
					args: { doctype: "Company", fields: ["name"], order_by: "name" },
					callback: (r) => {
						this.$company.empty();
						(r.message || []).forEach((c) => {
							this.$company.append(
								`<option value="${frappe.utils.escape_html(c.name)}">${frappe.utils.escape_html(c.name)}</option>`,
							);
						});
						const def = frappe.defaults.get_user_default("Company");
						if (def) this.$company.val(def);
						this.load_sheet();
					},
				});
			}

			get_period_args() {
				const val = this.$period.val() || "";
				const opt = this.$period.find(":selected");
				const [year, month] = val.split("-").map((x) => parseInt(x, 10));
				return {
					month,
					year,
					company: this.$company.val(),
					start_date: opt.data("start"),
					end_date: opt.data("end"),
				};
			}

			load_sheet() {
				frappe.call({
					method: "tif_customization.tif_customization.page.variable_components.variable_components.get_variable_sheet_data",
					args: this.get_period_args(),
					freeze: true,
					freeze_message: __("Loading variable components sheet..."),
					callback: (r) => {
						this._data = r.message || {};
						this._dirty.clear();
						this._values = {};
						this.render_sheet();
						this.update_save_state();
					},
				});
			}

			cell_id(employee, key) {
				return `${employee}::${key}`;
			}

			set_value(employee, key, val, $input) {
				const id = this.cell_id(employee, key);
				const orig = this._values[id];
				const num = flt(val);
				if (!this._values[id] && this._values[id] !== 0) {
					this._values[id] = orig;
				}
				if (flt(orig) !== num) {
					this._dirty.add(id);
					$input.addClass("is-dirty");
				} else {
					this._dirty.delete(id);
					$input.removeClass("is-dirty");
				}
				$input.toggleClass("has-value", num > 0);
				this.update_save_state();
			}

			update_save_state() {
				const has = this._dirty.size > 0;
				this.$save.prop("disabled", !has);
				this.$dirty_hint.toggleClass("is-visible", has);
			}

			fmt(v) {
				return frappe.format(flt(v), { fieldtype: "Currency" });
			}

			render_sheet() {
				const d = this._data;
				const earnings = d.earnings || [];
				const deductions = d.deductions || [];
				const salary_cols = d.salary_columns || [];
				const sections = d.sections || [];

				if (!earnings.length && !deductions.length) {
					this.$sheet.html(`<div class="vc-empty">${__("No variable components configured.")}</div>`);
					return;
				}

				const salary_col_count = salary_cols.length;
				const earn_cols = earnings.length;
				const ded_cols = deductions.length;
				const info_cols = 5;

				let thead = `<thead>
					<tr class="hdr-row-1">
						<th colspan="${info_cols}" class="hdr-info">${__("Employee")}</th>
						<th colspan="${salary_col_count}" class="hdr-salary hdr-group-main">${__("Salary (from Salary Slip)")}</th>
						<th colspan="${earn_cols}" class="hdr-earning hdr-group-main">${__("Variable Earnings")}</th>
						<th colspan="${ded_cols}" class="hdr-deduction hdr-group-main">${__("Variable Deductions")}</th>
					</tr>
					<tr class="hdr-row-2">
						<th class="hdr-info text-center">S.#</th>
						<th class="hdr-info text-center">${__("Sec")}</th>
						<th class="hdr-info col-name">${__("Employee Name")}</th>
						<th class="hdr-info col-desig">${__("Designation")}</th>
						<th class="hdr-info text-center">${__("Dept")}</th>`;

				salary_cols.forEach((c) => {
					thead += `<th class="hdr-salary">${frappe.utils.escape_html(c.label)}</th>`;
				});

				earnings.forEach((c) => {
					thead += `<th class="hdr-earning" title="${frappe.utils.escape_html(c.component)}">${frappe.utils.escape_html(c.label)}</th>`;
				});
				deductions.forEach((c) => {
					thead += `<th class="hdr-deduction" title="${frappe.utils.escape_html(c.component)}">${frappe.utils.escape_html(c.label)}</th>`;
				});
				thead += `</tr></thead>`;

				let tbody = "<tbody>";
				const total_cols = info_cols + salary_col_count + earn_cols + ded_cols;

				if (!sections.length) {
					tbody += `<tr><td colspan="${total_cols}" class="vc-empty">${__("No active employees for this period.")}</td></tr>`;
				}

				const all_cols = [...earnings, ...deductions];

				sections.forEach((sec) => {
					const col_span = total_cols;
					tbody += `<tr class="section-row"><td colspan="${col_span}">${frappe.utils.escape_html(sec.label)}</td></tr>`;

					if (sec.header_only && !(sec.rows || []).length) {
						return;
					}

					(sec.rows || []).forEach((row) => {
						tbody += `<tr data-employee="${frappe.utils.escape_html(row.employee)}">
							<td class="text-center col-sticky">${row.serial || ""}</td>
							<td class="text-center">${row.section_no || ""}</td>
							<td class="col-name col-sticky-2"><strong>${frappe.utils.escape_html(row.employee_name)}</strong><br><span class="text-muted" style="font-size:9px">${frappe.utils.escape_html(row.employee)}</span></td>
							<td class="col-desig">${frappe.utils.escape_html(row.designation)}</td>
							<td class="text-center">${frappe.utils.escape_html((row.department || "").substring(0, 12))}</td>`;

						const sal = row.salary || {};
						salary_cols.forEach((col) => {
							const key = col.key;
							let display = "";
							if (key === "payment_days") {
								const days = flt(sal.payment_days);
								const total = flt(sal.total_working_days);
								display = total ? `${days}/${total}` : days ? String(days) : "—";
							} else {
								const v = flt(sal[key]);
								display = v ? this.fmt(v) : "—";
							}
							const slip = sal.salary_slip;
							const slip_link = slip
								? ` <a href="/app/salary-slip/${encodeURIComponent(slip)}" title="${__("Open Salary Slip")}" style="font-size:9px">↗</a>`
								: "";
							tbody += `<td class="text-right vc-salary-cell" title="${sal.has_slip ? __("From Salary Slip") : __("No salary slip for this period")}">${display}${key === "net_pay" && slip_link ? slip_link : ""}</td>`;
						});

						all_cols.forEach((col) => {
							const key = col.key;
							const val = flt((row.amounts || {})[key]);
							const id = this.cell_id(row.employee, key);
							this._values[id] = val;
							const ads = (row.additional_salary || {})[key] || "";
							const readonly = col.readonly ? "readonly" : "";
							const ro_class = col.readonly ? "is-readonly" : "";
							const val_class = val > 0 ? "has-value" : "";
							tbody += `<td class="text-right">
								<input type="number" min="0" step="0.01" class="vc-input ${ro_class} ${val_class}"
									data-employee="${frappe.utils.escape_html(row.employee)}"
									data-key="${key}"
									data-component="${frappe.utils.escape_html(col.component)}"
									data-ads="${frappe.utils.escape_html(ads)}"
									value="${val || ""}" ${readonly} />
							</td>`;
						});
						tbody += `</tr>`;
					});

					if ((sec.rows || []).length && sec.totals) {
						tbody += `<tr class="section-total">
							<td colspan="${info_cols}" class="text-right"><strong>${__("Section Total")}</strong></td>`;
						salary_cols.forEach((col) => {
							const v = (sec.totals || {})[col.key];
							const disp =
								col.key === "payment_days"
									? flt(v) ? String(flt(v)) : ""
									: this.fmt(v);
							tbody += `<td class="text-right"><strong>${disp}</strong></td>`;
						});
						all_cols.forEach((col) => {
							tbody += `<td class="text-right"><strong>${this.fmt((sec.totals || {})[col.key])}</strong></td>`;
						});
						tbody += `</tr>`;
					}
				});

				if (d.grand_totals && sections.some((s) => (s.rows || []).length)) {
					tbody += `<tr class="section-total" style="background:#fff2cc!important">
						<td colspan="${info_cols}" class="text-right"><strong>${__("Grand Total")}</strong></td>`;
					salary_cols.forEach((col) => {
						const v = (d.grand_totals || {})[col.key];
						const disp =
							col.key === "payment_days"
								? flt(v) ? String(flt(v)) : ""
								: this.fmt(v);
						tbody += `<td class="text-right"><strong>${disp}</strong></td>`;
					});
					all_cols.forEach((col) => {
						tbody += `<td class="text-right"><strong>${this.fmt((d.grand_totals || {})[col.key])}</strong></td>`;
					});
					tbody += `</tr>`;
				}

				tbody += "</tbody>";

				this.$sheet.html(`
					<div class="vc-head">
						<div class="org-name">${frappe.utils.escape_html(d.title || "")}</div>
						<div class="sheet-title">${frappe.utils.escape_html(d.subtitle || "")}</div>
						<div class="sheet-sub">${frappe.utils.escape_html(d.company || "")} · ${frappe.utils.escape_html(d.period_label || "")} · ${d.employee_count || 0} ${__("employees")} · ${__("Blue columns = salary slip; green/red = enter variable amounts")}</div>
					</div>
					<table class="vc-table">${thead}${tbody}</table>
				`);

				const self = this;
				this.$sheet.find("input.vc-input:not([readonly])").on("input change", function () {
					const $el = $(this);
					self.set_value($el.data("employee"), $el.data("key"), $el.val(), $el);
				});

				// Recalc section totals on input (optional lightweight)
				this.$sheet.find("input.vc-input:not([readonly])").on("input", () => this.recalc_totals());
			}

			recalc_totals() {
				const d = this._data;
				if (!d) return;
				const all_cols = [...(d.earnings || []), ...(d.deductions || [])];
				this.$sheet.find("tbody tr[data-employee]").each(function () {
					const $tr = $(this);
					const emp = $tr.data("employee");
					all_cols.forEach((col) => {
						const $in = $tr.find(`input[data-key="${col.key}"]`);
						if ($in.length) {
							const id = `${emp}::${col.key}`;
							const v = flt($in.val());
							$in.toggleClass("has-value", v > 0);
						}
					});
				});
			}

			collect_entries() {
				const entries = [];
				const self = this;
				this._dirty.forEach((id) => {
					const [employee, key] = id.split("::");
					const $in = this.$sheet.find(`input[data-employee="${employee}"][data-key="${key}"]`);
					if (!$in.length || $in.prop("readonly")) return;
					entries.push({
						employee,
						component_key: key,
						amount: flt($in.val()),
						additional_salary: $in.data("ads") || null,
					});
				});
				return entries;
			}

			save() {
				const entries = this.collect_entries();
				if (!entries.length) {
					frappe.show_alert({ message: __("No changes to save"), indicator: "orange" });
					return;
				}

				frappe.confirm(
					__(
						"Create/update {0} Additional Salary record(s) for payroll date {1}?",
						[entries.length, frappe.datetime.str_to_user(this._data.payroll_date)],
					),
					() => {
						frappe.call({
							method: "tif_customization.tif_customization.page.variable_components.variable_components.save_variable_components",
							args: {
								company: this.$company.val(),
								payroll_date: this._data.payroll_date,
								entries: JSON.stringify(entries),
							},
							freeze: true,
							freeze_message: __("Saving Additional Salary..."),
							callback: (r) => {
								const m = r.message || {};
								if (m.errors && m.errors.length) {
									frappe.msgprint({
										title: __("Partial save"),
										message: m.message + "<br><br>" + m.errors.join("<br>"),
										indicator: "orange",
									});
								} else {
									frappe.show_alert({ message: m.message, indicator: "green" }, 6);
								}
								this._dirty.clear();
								this.load_sheet();
							},
						});
					},
				);
			}
		};
	}

	page.variable_components = new window.VariableComponentsPage(page);
	page.variable_components.make();
};

function flt(v) {
	return parseFloat(v) || 0;
}
