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
				this._payroll_selected = new Set();
				this._payment_dirty = false;
				this._bank_options = [];
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
							<div class="filter-field filter-field--period">
								<label>${__("Payroll Period")}</label>
								<div class="vc-period-row">
									<select class="form-control period-select"></select>
									<button type="button" class="btn btn-default btn-sm btn-new-period" title="${__("Create 26th–25th payroll period")}">
										<i class="fa fa-calendar-plus-o"></i>
									</button>
								</div>
							</div>
							<div class="filter-field">
								<label>${__("Company")}</label>
								<select class="form-control company-filter"></select>
							</div>
							<div class="vc-toolbar__actions">
								<span class="vc-dirty-hint">${__("Unsaved changes")}</span>
								<span class="vc-period-status-badge text-muted"></span>
								<button class="btn btn-default btn-sm btn-reload">
									<i class="fa fa-refresh"></i> ${__("Reload")}
								</button>
								<button class="btn btn-primary btn-sm btn-save-draft" title="${__("Save variables, bank/mode, and payable amounts (no salary slips)")}">
									<i class="fa fa-save"></i> ${__("Save draft")}
								</button>
								<button class="btn btn-success btn-sm btn-finalize" title="${__("Save everything and create Payroll Entry + Salary Slips")}">
									<i class="fa fa-check-circle"></i> ${__("Finalize & create salary slips")}
								</button>
								<a class="btn btn-default btn-sm" href="/app/additional-salary">${__("Additional Salary List")}</a>
								<a class="btn btn-default btn-sm vc-link-payroll-entry" href="/app/payroll-entry" style="display:none">${__("Open Payroll Entry")}</a>
							</div>
						</div>
						<div class="vc-roster-panel">
							<div class="vc-roster-panel__steps">
								<strong>${__("How to run payroll for a period")}</strong>
								<ol>
									<li>${__("Select payroll period and company")}</li>
									<li>${__("Click Load active employees — all active staff are added from attendance")}</li>
									<li>${__("Review days worked / leave deductions (from Employee Attendance)")}</li>
									<li>${__("Uncheck or Remove employees who should not be paid this month")}</li>
									<li>${__("Save draft (keeps your work) → Finalize when ready")}</li>
								</ol>
							</div>
							<div class="vc-roster-panel__actions">
								<span class="vc-roster-status text-muted"></span>
								<button type="button" class="btn btn-primary btn-xs btn-load-period">
									<i class="fa fa-users"></i> ${__("Load active employees")}
								</button>
								<button type="button" class="btn btn-default btn-xs btn-add-employee">
									<i class="fa fa-plus"></i> ${__("Add employee")}
								</button>
								<button type="button" class="btn btn-default btn-xs btn-remove-selected">
									<i class="fa fa-trash"></i> ${__("Remove selected from sheet")}
								</button>
							</div>
						</div>
						<div class="vc-payroll-panel">
							<div class="vc-payroll-panel__status text-muted">${__("Payroll status loading…")}</div>
							<div class="vc-payroll-panel__selection">
								<span class="vc-payroll-count"></span>
								<button type="button" class="btn btn-xs btn-default btn-payroll-all">${__("Select all")}</button>
								<button type="button" class="btn btn-xs btn-default btn-payroll-none">${__("Select none")}</button>
							</div>
						</div>
						<div class="vc-legend">
							<span><i class="swatch-salary"></i> ${__("Salary from slip (read-only)")}</span>
							<span><i class="swatch-earn"></i> ${__("Variable earnings (editable → Additional Salary)")}</span>
							<span><i class="swatch-ded"></i> ${__("Variable deductions (editable)")}</span>
							<span><i class="swatch-pf"></i> ${__("PF (auto-calculated → Additional Salary on save)")}</span>
							<span><i class="swatch-tax"></i> ${__("Tax (defaults from Employee Income Tax, editable)")}</span>
							<span><i class="swatch-dirty"></i> ${__("Edited (not saved)")}</span>
							<span><i class="swatch-payroll"></i> ${__("Included in payroll run")}</span>
						</div>
						<div class="vc-sheet-wrap">
							<div class="vc-sheet-content"></div>
						</div>
						<div class="vc-payment-summary-wrap">
							<div class="vc-payment-summary"></div>
						</div>
					</div>
				`);

				this.$period = this.page.main.find(".period-select");
				this.$company = this.page.main.find(".company-filter");
				this.$sheet = this.page.main.find(".vc-sheet-content");
				this.$save_draft = this.page.main.find(".btn-save-draft");
				this.$finalize = this.page.main.find(".btn-finalize");
				this.$dirty_hint = this.page.main.find(".vc-dirty-hint");
				this.$period_status_badge = this.page.main.find(".vc-period-status-badge");
				this.$payroll_panel = this.page.main.find(".vc-payroll-panel");
				this.$payroll_status = this.page.main.find(".vc-payroll-panel__status");
				this.$payroll_count = this.page.main.find(".vc-payroll-count");
				this.$link_pe = this.page.main.find(".vc-link-payroll-entry");
				this.$payment_summary = this.page.main.find(".vc-payment-summary");
				this.$roster_status = this.page.main.find(".vc-roster-status");
			}

			bind_events() {
				this.page.main.find(".btn-reload").on("click", () => this.confirm_reload(() => this.load_sheet()));
				this.page.main.find(".btn-load-period").on("click", () => this.load_active_employees(true));
				this.page.main.find(".btn-add-employee").on("click", () => this.add_employee_dialog());
				this.page.main.find(".btn-remove-selected").on("click", () => this.remove_selected_employees());
				this.page.main.find(".btn-new-period").on("click", () => this.new_period_dialog());
				this.$save_draft.on("click", () => this.save_draft());
				this.$finalize.on("click", () => this.finalize_period());
				this.page.main.find(".btn-payroll-all").on("click", () => this.set_all_payroll_checkboxes(true));
				this.page.main.find(".btn-payroll-none").on("click", () => this.set_all_payroll_checkboxes(false));
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

			load_periods(select_dates) {
				const company = this.$company.val() || frappe.defaults.get_user_default("Company");
				frappe.call({
					method: "tif_customization.tif_customization.page.variable_components.variable_components.get_period_options_for_variable",
					args: { company },
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
						this._period_opts = opts;
						opts.forEach((o) => {
							const val = `${o.year}-${String(o.month).padStart(2, "0")}-${o.start_date}`;
							this.$period.append(
								`<option value="${val}" data-start="${o.start_date}" data-end="${o.end_date}">${frappe.utils.escape_html(o.label)}</option>`,
							);
						});
						if (select_dates) {
							const key = `${select_dates.start_date}`;
							const $match = this.$period.find(`option[data-start="${key}"]`);
							if ($match.length) $match.prop("selected", true);
						}
						this.load_companies();
					},
				});
			}

			new_period_dialog() {
				const self = this;
				const today = frappe.datetime.get_today();
				const y = parseInt(today.substring(0, 4), 10);
				const m = parseInt(today.substring(5, 7), 10);

				const d = new frappe.ui.Dialog({
					title: __("Create payroll period (26th cycle)"),
					fields: [
						{
							fieldtype: "Select",
							fieldname: "cycle_type",
							label: __("Cycle type"),
							options: [
								{ value: "tif_payroll_month", label: __("June payroll = 26 May – 25 Jun (TIF standard)") },
								{ value: "starts_on_26th", label: __("Period starts 26th of month (26 Jun – 25 Jul)") },
							],
							default: "tif_payroll_month",
							onchange: () => self._update_period_preview(d),
						},
						{
							fieldtype: "Int",
							fieldname: "year",
							label: __("Year"),
							default: y,
							reqd: 1,
							onchange: () => self._update_period_preview(d),
						},
						{
							fieldtype: "Select",
							fieldname: "month",
							label: __("Month"),
							options: [
								"1:January",
								"2:February",
								"3:March",
								"4:April",
								"5:May",
								"6:June",
								"7:July",
								"8:August",
								"9:September",
								"10:October",
								"11:November",
								"12:December",
							].map((x) => {
								const [v, l] = x.split(":");
								return { value: v, label: l };
							}),
							default: String(m),
							reqd: 1,
							onchange: () => self._update_period_preview(d),
						},
						{
							fieldtype: "HTML",
							fieldname: "preview",
						},
						{
							fieldtype: "Section Break",
							label: __("Or enter custom dates"),
						},
						{
							fieldtype: "Date",
							fieldname: "start_date",
							label: __("Start Date"),
						},
						{
							fieldtype: "Date",
							fieldname: "end_date",
							label: __("End Date"),
						},
					],
					primary_action_label: __("Create period"),
					primary_action(values) {
						const company = self.$company.val() || frappe.defaults.get_user_default("Company");
						const args = { company };
						if (values.start_date && values.end_date) {
							args.start_date = values.start_date;
							args.end_date = values.end_date;
						} else {
							args.year = values.year;
							args.month = values.month;
							args.cycle_type = values.cycle_type;
						}
						frappe.call({
							method: "tif_customization.tif_customization.page.variable_components.variable_components.create_variable_period",
							args,
							freeze: true,
							callback: (r) => {
								const msg = r.message || {};
								d.hide();
								frappe.show_alert({ message: msg.message || __("Created"), indicator: "green" }, 6);
								self.load_periods({
									start_date: msg.start_date,
									end_date: msg.end_date,
								});
							},
						});
					},
				});
				d.show();
				this._update_period_preview(d);
			}

			_update_period_preview(d) {
				const values = d.get_values();
				if (!values.year || !values.month) return;
				frappe.call({
					method: "tif_customization.tif_customization.page.variable_components.variable_components.get_tif_cycle_dates",
					args: {
						year: values.year,
						month: values.month,
						cycle_type: values.cycle_type || "tif_payroll_month",
					},
					callback: (r) => {
						const m = r.message || {};
						d.fields_dict.preview.$wrapper.html(
							`<p class="text-muted" style="margin:8px 0 0;font-size:12px">
								<strong>${__("Dates")}:</strong> ${frappe.utils.escape_html(m.label || "")}
							</p>`,
						);
						if (m.start_date) d.set_value("start_date", m.start_date);
						if (m.end_date) d.set_value("end_date", m.end_date);
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
				const opt = this.$period.find(":selected");
				const start_date = opt.data("start");
				const end_date = opt.data("end");
				let month = 0;
				let year = 0;
				if (end_date) {
					const p = String(end_date).split("-");
					year = parseInt(p[0], 10);
					month = parseInt(p[1], 10);
				}
				return {
					month,
					year,
					company: this.$company.val(),
					start_date,
					end_date,
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
						this._init_payroll_selection();
						this._bank_options = (r.message && r.message.bank_options) || [];
						this.render_sheet();
						this.update_save_state();
						this._payment_dirty = false;
						this.update_payroll_panel();
						this.update_roster_panel();
						this.update_period_status_badge();
						this.update_save_state();
					},
				});
			}

			update_roster_panel() {
				const roster = (this._data && this._data.roster) || {};
				const on_sheet = roster.on_sheet || this._data?.employee_count || 0;
				let msg = __("Period roster: {0} employee(s) on sheet", [on_sheet]);
				if (roster.auto_initialized) {
					msg += ` · ${__("auto-loaded on first open")}`;
				}
				this.$roster_status.text(msg);
			}

			load_active_employees(force) {
				frappe.call({
					method: "tif_customization.tif_customization.page.variable_components.variable_components.initialize_variable_period",
					args: { ...this.get_period_args(), force: force ? 1 : 0 },
					freeze: true,
					freeze_message: __("Loading active employees for this period…"),
					callback: (r) => {
						const m = r.message || {};
						frappe.show_alert({ message: m.message || __("Done"), indicator: "green" }, 6);
						this.load_sheet();
					},
				});
			}

			get_checked_employee_ids() {
				const ids = [];
				this.$sheet.find(".vc-payroll-cb:checked").each(function () {
					const emp = $(this).data("employee");
					if (emp) ids.push(emp);
				});
				return ids;
			}

			remove_selected_employees() {
				const employees = this.get_checked_employee_ids();
				if (!employees.length) {
					frappe.show_alert({
						message: __("Select employees using the checkboxes, then click Remove"),
						indicator: "orange",
					});
					return;
				}
				frappe.confirm(
					__("Remove {0} employee(s) from this period sheet? You can add them back later.", [
						employees.length,
					]),
					() => {
						frappe.call({
							method: "tif_customization.tif_customization.page.variable_components.variable_components.remove_employees_from_period",
							args: {
								...this.get_period_args(),
								employees: JSON.stringify(employees),
							},
							freeze: true,
							callback: (r) => {
								frappe.show_alert({
									message: (r.message && r.message.message) || __("Removed"),
									indicator: "green",
								});
								this.load_sheet();
							},
						});
					},
				);
			}

			add_employee_dialog() {
				const self = this;
				const period = this.get_period_args();
				const d = new frappe.ui.Dialog({
					title: __("Add employee to period"),
					fields: [
						{
							fieldtype: "Link",
							fieldname: "employee",
							label: __("Employee"),
							options: "Employee",
							reqd: 1,
							get_query: () => ({
								filters: {
									status: "Active",
									company: period.company,
								},
							}),
						},
					],
					primary_action_label: __("Add"),
					primary_action(values) {
						if (!values.employee) return;
						frappe.call({
							method: "tif_customization.tif_customization.page.variable_components.variable_components.add_employees_to_period",
							args: {
								...period,
								employees: JSON.stringify([values.employee]),
							},
							freeze: true,
							callback: (r) => {
								d.hide();
								frappe.show_alert({
									message: (r.message && r.message.message) || __("Added"),
									indicator: "green",
								});
								self.load_sheet();
							},
						});
					},
				});
				d.show();
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
				const has = this._dirty.size > 0 || this._payment_dirty;
				const finalized = this._data && this._data.is_finalized;
				this.$save_draft.prop("disabled", finalized || !this._data);
				this.$finalize.prop("disabled", finalized || !this.get_selected_payroll_employees().length);
				this.$dirty_hint.toggleClass("is-visible", has && !finalized);
			}

			update_period_status_badge() {
				const ps = (this._data && this._data.period_status) || {};
				const finalized = this._data && this._data.is_finalized;
				let text = "";
				if (finalized) {
					text = __("Finalized");
					if (ps.finalized_on) {
						text += ` · ${frappe.datetime.str_to_user(ps.finalized_on)}`;
					}
					this.$period_status_badge
						.html(`<span class="label label-success">${frappe.utils.escape_html(text)}</span>`)
						.show();
				} else if (ps.draft_saved_on) {
					text = __("Draft saved") + ` · ${frappe.datetime.str_to_user(ps.draft_saved_on)}`;
					this.$period_status_badge
						.html(`<span class="label label-warning">${frappe.utils.escape_html(text)}</span>`)
						.show();
				} else {
					this.$period_status_badge.html(`<span class="label label-default">${__("Not saved")}</span>`).show();
				}
			}

			fmt(v) {
				return this.fmt_plain(v);
			}

			fmt_plain(v) {
				const n = flt(v);
				if (!n) return "—";
				const currency =
					(this._data && this._data.currency) ||
					frappe.defaults.get_global_default("currency") ||
					(frappe.boot.sysdefaults && frappe.boot.sysdefaults.currency);
				if (typeof format_currency === "function") {
					return format_currency(n, currency);
				}
				return frappe.utils.format_number(n, null, { fieldtype: "Float", precision: 2 });
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
				const payment_cols = (d.payment_columns || []).length || 4;
				const info_cols = 6;
				const eligible = new Set((d.payroll_eligible || []).map((e) => e));
				const pe_submitted = cint((d.payroll_info || {}).payroll_entry_docstatus) === 1;
				const bank_opts = d.bank_options || this._bank_options || [];

				let thead = `<thead>
					<tr class="hdr-row-1">
						<th colspan="${info_cols}" class="hdr-info">${__("Employee")}</th>
						<th colspan="${salary_col_count}" class="hdr-salary hdr-group-main">${__("Salary (from Salary Slip)")}</th>
						<th colspan="${earn_cols}" class="hdr-earning hdr-group-main">${__("Variable Earnings")}</th>
						<th colspan="${ded_cols}" class="hdr-deduction hdr-group-main">${__("Variable Deductions")}</th>
						<th colspan="${payment_cols}" class="hdr-payment hdr-group-main">${__("Payment")}</th>
					</tr>
					<tr class="hdr-row-2">
						<th class="hdr-info text-center col-payroll" title="${__("Include in Payroll Entry / Salary Slips")}">
							<input type="checkbox" class="vc-payroll-select-all" ${pe_submitted ? "disabled" : ""} />
						</th>
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
				(d.payment_columns || [
					{ key: "net_pay", label: __("Net Pay") },
					{ key: "payable_amount", label: __("Payable Amount") },
					{ key: "payment_mode", label: __("Mode") },
					{ key: "bank_name", label: __("Bank") },
				]).forEach((c) => {
					thead += `<th class="hdr-payment">${frappe.utils.escape_html(c.label)}</th>`;
				});
				thead += `</tr></thead>`;

				let tbody = "<tbody>";
				const total_cols = info_cols + salary_col_count + earn_cols + ded_cols + payment_cols;

				if (!sections.length) {
					tbody += `<tr><td colspan="${total_cols}" class="vc-empty">${__("No active employees for this period.")}</td></tr>`;
				}

				const all_cols = [...earnings, ...deductions];
				this._employee_salary = {};

				sections.forEach((sec) => {
					const col_span = total_cols;
					tbody += `<tr class="section-row"><td colspan="${col_span}">${frappe.utils.escape_html(sec.label)}</td></tr>`;

					if (sec.header_only && !(sec.rows || []).length) {
						return;
					}

					(sec.rows || []).forEach((row) => {
						const sal = row.salary || {};
						this._employee_salary[row.employee] = sal;
						const pay = row.payment || {};
						const sec_id = frappe.utils.escape_html(sec.label);
						const can_payroll = eligible.has(row.employee);
						const checked = this._payroll_selected.has(row.employee);
						const payroll_title = can_payroll
							? __("Include in payroll")
							: __("Not eligible (missing assignment or already payrolled)");
						const row_class = can_payroll ? "" : " vc-emp-row-ineligible";
						const pay_mode = pay.payment_mode || (row.default_bank_name ? "Bank" : "Cheque");
						const pay_bank = pay.bank_name || row.default_bank_name || "";
						const bank_field = this.build_bank_field(row.employee, pay_bank, pay_mode);
						const slip = sal.salary_slip;
						const slip_link = slip
							? ` <a href="/app/salary-slip/${encodeURIComponent(slip)}" title="${__("Open Salary Slip")}" class="vc-slip-link">↗</a>`
							: "";
						tbody += `<tr class="vc-emp-row${row_class}" data-employee="${frappe.utils.escape_html(row.employee)}"
							data-section="${sec_id}"
							data-payroll-eligible="${can_payroll ? 1 : 0}"
							data-default-bank="${frappe.utils.escape_html(row.default_bank_name || "")}"
							data-slip-net="${flt(sal.net_pay)}"
							data-assignment-gross="${flt(sal.assignment_gross || sal.gross_pay)}"
							data-base-gross="${flt(sal.gross_pay)}"
							data-slip-deduction="${flt(sal.total_deduction)}"
							data-gross-prorated="${sal.gross_prorated ? 1 : 0}"
							data-pf-applicable="${row.pf_applicable ? 1 : 0}"
							data-pf-rate="${flt(row.pf_rate)}"
							data-pf-formula-base="${frappe.utils.escape_html(row.pf_formula_base || "Gross")}"
							data-income-tax="${flt(row.income_tax)}">
							<td class="text-center col-payroll col-sticky-payroll">
								<input type="checkbox" class="vc-payroll-cb" data-employee="${frappe.utils.escape_html(row.employee)}"
									${checked ? "checked" : ""} ${!can_payroll || pe_submitted ? "disabled" : ""}
									title="${frappe.utils.escape_html(payroll_title)}" />
							</td>
							<td class="text-center col-sticky">${row.serial || ""}</td>
							<td class="text-center">${row.section_no || ""}</td>
							<td class="col-name col-sticky-2"><strong>${frappe.utils.escape_html(row.employee_name)}</strong><br><span class="text-muted" style="font-size:9px">${frappe.utils.escape_html(row.employee)}</span></td>
							<td class="col-desig">${frappe.utils.escape_html(row.designation)}</td>
							<td class="text-center">${frappe.utils.escape_html((row.department || "").substring(0, 12))}</td>`;

						salary_cols.forEach((col) => {
							const key = col.key;
							if (key === "payment_days") {
								const att = row.attendance || {};
								const days = flt(sal.payment_days);
								const total = flt(sal.total_working_days);
								let display = total ? `${days}/${total}` : days ? String(days) : "—";
								let days_title = "";
								if (att.has_attendance && flt(att.month_days)) {
									display = `${flt(att.payable_days)}/${flt(att.month_days)}`;
									days_title = __("Payable {0} / month {1} (absents+late: {2})", [
										flt(att.payable_days),
										flt(att.month_days),
										flt(att.deduction_days),
									]);
								}
								const ea = att.employee_attendance;
								const ea_link = ea
									? ` <a href="/app/employee-attendance/${encodeURIComponent(ea)}" title="${__("Employee Attendance")}" class="vc-slip-link">↗</a>`
									: sal.has_attendance === 0 && !sal.has_slip
										? ` <span class="text-danger" title="${__("No Employee Attendance for this month")}">!</span>`
										: "";
								tbody += `<td class="text-right vc-salary-cell" data-salary-col="${key}"${days_title ? ` title="${frappe.utils.escape_html(days_title)}"` : ""}>${display}${ea_link}</td>`;
								return;
							}
							if (key === "arrear_2") {
								const val = flt((row.amounts || {}).arrear_2);
								const id = this.cell_id(row.employee, key);
								this._values[id] = val;
								const ads = (row.additional_salary || {}).arrear_2 || "";
								const val_class = val > 0 ? "has-value" : "";
								const component = col.component || "Arrear 2";
								tbody += `<td class="text-right vc-salary-cell" data-salary-col="arrear_2">
									<input type="number" min="0" step="0.01" class="vc-input vc-arrear-2-input ${val_class}"
										data-type="earning" data-employee="${frappe.utils.escape_html(row.employee)}"
										data-key="arrear_2" data-component="${frappe.utils.escape_html(component)}"
										data-ads="${ads ? frappe.utils.escape_html(ads) : ""}" value="${val || ""}"
										${d.is_finalized ? "readonly" : ""} />
								</td>`;
								return;
							}
							if (key === "gross_pay") {
								const base_gross =
									flt(sal.assignment_gross) || flt(sal.perm_gross) || flt(sal.gross_pay);
								const init_gross = base_gross + flt((row.amounts || {}).arrear_2);
								tbody += `<td class="text-right vc-salary-cell" data-salary-col="gross_pay"><span class="vc-gross-preview">${init_gross ? this.fmt(init_gross) : "—"}</span></td>`;
								return;
							}
							if (key === "total_deduction") {
								tbody += `<td class="text-right vc-salary-cell" data-salary-col="total_deduction"><span class="vc-ded-preview">${flt(sal.total_deduction) ? this.fmt(sal.total_deduction) : "—"}</span></td>`;
								return;
							}
							const v = flt(sal[key]);
							tbody += `<td class="text-right vc-salary-cell" data-salary-col="${key}">${v ? this.fmt(v) : "—"}</td>`;
						});

						earnings.forEach((col) => {
							const key = col.key;
							const val = flt((row.amounts || {})[key]);
							const id = this.cell_id(row.employee, key);
							this._values[id] = val;
							const ads = (row.additional_salary || {})[key] || "";
							const val_class = val > 0 ? "has-value" : "";
							tbody += `<td class="text-right">
								<input type="number" min="0" step="0.01" class="vc-input ${val_class}"
									data-type="earning" data-employee="${frappe.utils.escape_html(row.employee)}"
									data-key="${key}" data-component="${frappe.utils.escape_html(col.component)}"
									data-ads="${ads ? frappe.utils.escape_html(ads) : ""}" value="${val || ""}" />
							</td>`;
						});

						deductions.forEach((col) => {
							const key = col.key;
							const val = flt((row.amounts || {})[key]);
							const id = this.cell_id(row.employee, key);
							this._values[id] = val;
							const ads = (row.additional_salary || {})[key] || "";
							const readonly = col.readonly ? "readonly" : "";
							const ro_class = col.readonly ? "is-readonly is-computed" : "";
							const val_class = val > 0 ? "has-value" : "";
							let field_title = "";
							if (key === "pf") {
								field_title = __("Auto: PF rate × {0} (from assignment + earnings)", [
									row.pf_formula_base || "Gross",
								]);
							} else if (key === "tax") {
								field_title = __("Default from Employee Income Tax ({0}); edit if incorrect", [
									row.income_tax ? this.fmt_plain(row.income_tax) : "0",
								]);
							}
							tbody += `<td class="text-right">
								<input type="number" min="0" step="0.01" class="vc-input ${ro_class} ${val_class}"
									data-type="deduction" data-employee="${frappe.utils.escape_html(row.employee)}"
									data-key="${key}" data-component="${frappe.utils.escape_html(col.component)}"
									data-ads="${ads ? frappe.utils.escape_html(ads) : ""}" value="${val || ""}" ${readonly}
									${field_title ? `title="${frappe.utils.escape_html(field_title)}"` : ""} />
							</td>`;
						});

						tbody += `<td class="text-right vc-payment-cell vc-net-final">${slip_link ? `<span class="vc-net-final-amt">—</span>${slip_link}` : `<span class="vc-net-final-amt">—</span>`}</td>
							<td class="text-right vc-payment-cell vc-payable-cell">
								<input type="number" min="0" step="0.01" class="vc-payable-input vc-payable-auto"
									data-employee="${frappe.utils.escape_html(row.employee)}"
									value=""
									readonly tabindex="-1"
									title="${__("Auto-calculated: Gross Pay minus deductions (same as Net Pay)")}"
									${d.is_finalized ? "readonly" : ""} />
							</td>
							<td class="text-center vc-payment-cell">
								<select class="vc-payment-mode form-control input-xs" data-employee="${frappe.utils.escape_html(row.employee)}"
									${d.is_finalized ? "disabled" : ""}>
									<option value="Cheque" ${pay_mode === "Cheque" ? "selected" : ""}>${__("Cheque")}</option>
									<option value="Bank" ${pay_mode === "Bank" ? "selected" : ""}>${__("Bank")}</option>
								</select>
							</td>
							<td class="vc-payment-cell vc-bank-cell">${bank_field}</td>`;
						tbody += `</tr>`;
					});

					if ((sec.rows || []).length) {
						tbody += `<tr class="section-total vc-sec-total" data-section="${frappe.utils.escape_html(sec.label)}">
							<td colspan="${info_cols}" class="text-right"><strong>${__("Section Total")}</strong></td>`;
						salary_cols.forEach((col) => {
							tbody += `<td class="text-right vc-total-cell" data-total-group="salary" data-total-key="${col.key}"><strong>—</strong></td>`;
						});
						earnings.forEach((col) => {
							tbody += `<td class="text-right vc-total-cell" data-total-group="earning" data-total-key="${col.key}"><strong>${this.fmt(0)}</strong></td>`;
						});
						deductions.forEach((col) => {
							tbody += `<td class="text-right vc-total-cell" data-total-group="deduction" data-total-key="${col.key}"><strong>${this.fmt(0)}</strong></td>`;
						});
						tbody += `<td class="text-right vc-total-cell" data-total-group="payment" data-total-key="net_pay"><strong>—</strong></td>
							<td class="text-right vc-total-cell" data-total-group="payment" data-total-key="payable_amount"><strong>—</strong></td>
							<td colspan="2" class="vc-payment-cell"></td>`;
						tbody += `</tr>`;
					}
				});

				if (sections.some((s) => (s.rows || []).length)) {
					tbody += `<tr class="section-total vc-grand-total" style="background:#fff2cc!important">
						<td colspan="${info_cols}" class="text-right"><strong>${__("Grand Total")}</strong></td>`;
					salary_cols.forEach((col) => {
						tbody += `<td class="text-right vc-total-cell" data-total-group="salary" data-total-key="${col.key}"><strong>—</strong></td>`;
					});
					earnings.forEach((col) => {
						tbody += `<td class="text-right vc-total-cell" data-total-group="earning" data-total-key="${col.key}"><strong>${this.fmt(0)}</strong></td>`;
					});
					deductions.forEach((col) => {
						tbody += `<td class="text-right vc-total-cell" data-total-group="deduction" data-total-key="${col.key}"><strong>${this.fmt(0)}</strong></td>`;
					});
					tbody += `<td class="text-right vc-total-cell" data-total-group="payment" data-total-key="net_pay"><strong>—</strong></td>
						<td class="text-right vc-total-cell" data-total-group="payment" data-total-key="payable_amount"><strong>—</strong></td>
						<td colspan="2"></td>`;
					tbody += `</tr>`;
				}

				tbody += "</tbody>";

				const bank_datalist = this.build_bank_datalist(bank_opts);
				const sheet_locked = d.is_finalized ? " vc-sheet-locked vc-sheet-fully-locked" : "";

				this.$sheet.html(`
					<div class="vc-head">
						<div class="org-name">${frappe.utils.escape_html(d.title || "")}</div>
						<div class="sheet-title">${frappe.utils.escape_html(d.subtitle || "")}</div>
						<div class="sheet-sub">${frappe.utils.escape_html(d.company || "")} · ${frappe.utils.escape_html(d.period_label || "")} · ${d.employee_count || 0} ${__("employees")} · ${__("Gross from Salary Structure Assignment + variable entries (live preview)")}</div>
					</div>
					${bank_datalist}
					<table class="vc-table${sheet_locked}">${thead}${tbody}</table>
				`);

				const self = this;
				this.$sheet.find("input.vc-input:not([readonly])").on("input change", function () {
					const $el = $(this);
					self.set_value($el.data("employee"), $el.data("key"), $el.val(), $el);
					self.recalc_totals();
				});

				this.$sheet.find(".vc-payroll-cb:not(:disabled)").on("change", function () {
					const emp = $(this).data("employee");
					if (this.checked) {
						self._payroll_selected.add(emp);
					} else {
						self._payroll_selected.delete(emp);
					}
					self.update_payroll_panel();
					self.sync_payroll_select_all();
					self.recalc_totals();
				});

				this.$sheet.find(".vc-payroll-select-all").on("change", function () {
					self.set_all_payroll_checkboxes(this.checked);
				});

				this.$sheet.find(".vc-payment-mode").on("change", function () {
					const $tr = $(this).closest("tr.vc-emp-row");
					const mode = $(this).val();
					const emp = $tr.data("employee");
					const pay_bank = ($tr.data("default-bank") || "").toString();
					const $cell = $tr.find(".vc-bank-cell");
					$cell.html(self.build_bank_field(emp, pay_bank, mode));
					self._payment_dirty = true;
					self.recalc_totals();
					self.update_save_state();
				});

				this.$sheet.on("change input", ".vc-payment-bank:not(.is-bank-off)", function () {
					self._payment_dirty = true;
					self.update_save_state();
				});

				this.sync_payroll_select_all();
				this.recalc_totals();
			}

			build_bank_datalist(bank_opts) {
				const opts = [...new Set(bank_opts || [])];
				let html = `<datalist id="vc-bank-datalist">`;
				opts.forEach((b) => {
					html += `<option value="${frappe.utils.escape_html(b)}">`;
				});
				html += `</datalist>`;
				return html;
			}

			build_bank_field(employee, selected_bank, payment_mode) {
				const finalized = this._data && this._data.is_finalized;
				const is_bank = payment_mode === "Bank";
				const val = frappe.utils.escape_html(selected_bank || "");
				if (!is_bank) {
					return `<input type="text" class="vc-payment-bank form-control input-xs is-bank-off"
						readonly tabindex="-1" placeholder="${__("Set Mode to Bank")}" value="" />`;
				}
				return `<input type="text" class="vc-payment-bank form-control input-xs"
					list="vc-bank-datalist" data-employee="${frappe.utils.escape_html(employee)}"
					value="${val}" placeholder="${__("Type or pick bank")}"
					${finalized ? "readonly" : ""} autocomplete="off" />`;
			}

			_row_arrear_2($tr) {
				const $in = $tr.find('input[data-key="arrear_2"]');
				return $in.length ? flt($in.val()) : 0;
			}

			_row_projected_totals($tr) {
				const baseGross = this._row_base_gross($tr);
				const arrear2 = this._row_arrear_2($tr);
				const { earn } = this._row_variable_sums($tr);
				const grossPay = baseGross + arrear2;
				const projectedGross = grossPay + earn;

				const pfApplicable = flt($tr.attr("data-pf-applicable")) > 0;
				const pfRate = flt($tr.attr("data-pf-rate"));
				const pfUseGross = ($tr.attr("data-pf-formula-base") || "Gross") === "Gross";
				const pfBase = pfUseGross ? grossPay : baseGross;
				const pfAmt = pfApplicable && pfRate ? (pfBase * pfRate) / 100 : 0;
				const $pf = $tr.find('input[data-key="pf"]');
				if ($pf.length) {
					$pf.val(pfAmt ? pfAmt : "");
					$pf.toggleClass("has-value", pfAmt > 0);
				}

				const $tax = $tr.find('input[data-key="tax"]');
				if ($tax.length && !$tax.prop("readonly") && $tax.val() === "") {
					const empTax = flt($tr.data("income-tax"));
					if (empTax > 0) $tax.val(empTax);
				}
				if ($tax.length) {
					$tax.toggleClass("has-value", flt($tax.val()) > 0);
				}

				const projectedDed = this._row_total_deduction($tr);
				const projectedNet = Math.max(0, projectedGross - projectedDed);
				return { baseGross, arrear2, earn, grossPay, projectedGross, projectedDed, projectedNet };
			}

			row_payable_amount($tr, projectedNet, for_payroll_summary) {
				const amount = Math.max(0, projectedNet);
				if (for_payroll_summary) {
					const included = $tr.find(".vc-payroll-cb").is(":checked");
					return included ? amount : 0;
				}
				return amount;
			}

			update_payable_input($tr, projectedNet) {
				const $payIn = $tr.find(".vc-payable-input");
				if (!$payIn.length) return;
				const amt = this.row_payable_amount($tr, projectedNet, false);
				$payIn.val(amt > 0 ? amt : "");
				$payIn.toggleClass("has-value", amt > 0);
			}

			collect_all_payment_entries() {
				const entries = [];
				const self = this;
				this.$sheet.find("tbody tr.vc-emp-row").each(function () {
					const row = self.collect_payment_row($(this));
					if (row) entries.push(row);
				});
				return entries;
			}

			collect_payment_row($tr) {
				const employee = $tr.data("employee");
				if (!employee) return null;
				const mode = $tr.find(".vc-payment-mode").val() || "Cheque";
				let bank = $tr.find(".vc-payment-bank").val() || "";
				if (mode !== "Bank") bank = "";
				const { projectedNet } = this._row_projected_totals($tr);
				return {
					employee,
					payment_mode: mode,
					bank_name: bank,
					payable_amount: projectedNet > 0 ? projectedNet : null,
				};
			}

			collect_all_variable_entries_for_save() {
				const manual = this.collect_all_variable_entries();
				const pf = this.collect_pf_entries();
				const seen = new Set();
				const out = [];
				[...manual, ...pf].forEach((e) => {
					const id = `${e.employee}::${e.component_key}`;
					if (seen.has(id)) return;
					seen.add(id);
					out.push(e);
				});
				return out;
			}

			save_draft() {
				if (this._data && this._data.is_finalized) {
					frappe.show_alert({ message: __("Period is finalized"), indicator: "orange" });
					return;
				}
				const period = this.get_period_args();
				const payment_entries = this.collect_all_payment_entries();
				const variable_entries = this.collect_all_variable_entries_for_save();

				frappe.call({
					method: "tif_customization.tif_customization.page.variable_components.variable_components.save_period_draft",
					args: {
						...period,
						save_additional_salary: 1,
						payment_entries: JSON.stringify(payment_entries),
						variable_entries: JSON.stringify(variable_entries),
					},
					freeze: true,
					freeze_message: __("Saving draft…"),
					timeout: 300,
					callback: (r) => {
						const m = r.message || {};
						frappe.show_alert({ message: m.message || __("Draft saved"), indicator: "green" }, 8);
						this._dirty.clear();
						this._payment_dirty = false;
						this.load_sheet();
					},
					error: (r) => {
						frappe.msgprint({
							title: __("Save failed"),
							message: (r && r.message) || __("Could not save draft"),
							indicator: "red",
						});
					},
				});
			}

			finalize_period() {
				if (this._data && this._data.is_finalized) {
					frappe.show_alert({ message: __("Already finalized"), indicator: "orange" });
					return;
				}
				const employees = this.get_selected_payroll_employees();
				if (!employees.length) {
					frappe.show_alert({ message: __("Select employees for payroll"), indicator: "orange" });
					return;
				}
				const period = this.get_period_args();
				const payment_entries = this.collect_all_payment_entries();
				const variable_entries = this.collect_all_variable_entries_for_save();

				frappe.confirm(
					__(
						"Finalize this period and create Payroll Entry + Salary Slips for {0} employee(s)? This cannot be undone from this page.",
						[employees.length],
					),
					() => {
						frappe.call({
							method: "tif_customization.tif_customization.page.variable_components.variable_components.finalize_variable_period",
							args: {
								...period,
								employees: JSON.stringify(employees),
								payment_entries: JSON.stringify(payment_entries),
								variable_entries: JSON.stringify(variable_entries),
							},
							freeze: true,
							freeze_message: __("Finalizing payroll…"),
							timeout: 600,
							callback: (r) => {
								const m = r.message || {};
								let html = frappe.utils.escape_html(m.message || __("Finalized"));
								if (m.payroll_entry) {
									html += `<br><a href="/app/payroll-entry/${encodeURIComponent(m.payroll_entry)}">${__("Open Payroll Entry")}</a>`;
								}
								frappe.msgprint({ title: __("Payroll finalized"), message: html, indicator: "green" });
								this._dirty.clear();
								this._payment_dirty = false;
								this.load_sheet();
							},
							error: (r) => {
								frappe.msgprint({
									title: __("Finalize failed"),
									message: (r && r.message) || __("Could not finalize"),
									indicator: "red",
								});
							},
						});
					},
				);
			}

			render_payment_summary(summary) {
				if (!this.$payment_summary || !this.$payment_summary.length) return;
				const s = summary || {};
				if (!s.total_headcount && !s.total_amount) {
					this.$payment_summary.html(
						`<div class="vc-payment-summary__empty text-muted">${__("Select employees and enter amounts to see payment summary.")}</div>`,
					);
					return;
				}

				let by_bank_rows = "";
				(s.by_bank || []).forEach((row) => {
					by_bank_rows += `<tr>
						<td>${frappe.utils.escape_html(row.label)}</td>
						<td class="text-right">${row.headcount}</td>
						<td class="text-right">${this.fmt_plain(row.amount)}</td>
					</tr>`;
				});

				let by_mode_rows = "";
				(s.by_mode || []).forEach((row) => {
					by_mode_rows += `<tr>
						<td>${frappe.utils.escape_html(row.label)}</td>
						<td class="text-right">${row.headcount}</td>
						<td class="text-right">${this.fmt_plain(row.amount)}</td>
					</tr>`;
				});

				this.$payment_summary.html(`
					<h4>${__("Salary Payment Summary")} <span class="text-muted">(${__("included in payroll only")})</span></h4>
					<div class="vc-payment-summary__cards">
						<div class="vc-summary-card">
							<div class="vc-summary-card__label">${__("Total paid headcount")}</div>
							<div class="vc-summary-card__value">${s.total_headcount || 0}</div>
						</div>
						<div class="vc-summary-card vc-summary-card--amount">
							<div class="vc-summary-card__label">${__("Total payable amount")}</div>
							<div class="vc-summary-card__value">${this.fmt_plain(s.total_amount)}</div>
						</div>
					</div>
					<div class="vc-payment-summary__tables">
						<div class="vc-summary-table-wrap">
							<h5>${__("By payment mode")}</h5>
							<table class="table table-bordered table-sm vc-summary-table">
								<thead><tr><th>${__("Mode")}</th><th class="text-right">${__("Headcount")}</th><th class="text-right">${__("Amount")}</th></tr></thead>
								<tbody>${by_mode_rows || `<tr><td colspan="3" class="text-muted">${__("No data")}</td></tr>`}</tbody>
							</table>
						</div>
						<div class="vc-summary-table-wrap">
							<h5>${__("By bank")}</h5>
							<table class="table table-bordered table-sm vc-summary-table">
								<thead><tr><th>${__("Bank / Cheque")}</th><th class="text-right">${__("Headcount")}</th><th class="text-right">${__("Amount")}</th></tr></thead>
								<tbody>${by_bank_rows || `<tr><td colspan="3" class="text-muted">${__("No data")}</td></tr>`}</tbody>
							</table>
						</div>
					</div>
				`);
			}

			_init_payroll_selection() {
				this._payroll_selected = new Set(this._data.payroll_eligible || []);
			}

			get_selected_payroll_employees() {
				return [...this._payroll_selected];
			}

			set_all_payroll_checkboxes(checked) {
				const self = this;
				this.$sheet.find("tbody tr.vc-emp-row[data-payroll-eligible='1']").each(function () {
					const emp = $(this).data("employee");
					const $cb = $(this).find(".vc-payroll-cb");
					if ($cb.prop("disabled")) return;
					$cb.prop("checked", checked);
					if (checked) {
						self._payroll_selected.add(emp);
					} else {
						self._payroll_selected.delete(emp);
					}
				});
				this.$sheet.find(".vc-payroll-select-all").prop("checked", checked);
				this.update_payroll_panel();
			}

			sync_payroll_select_all() {
				const $eligible = this.$sheet.find(".vc-payroll-cb:not(:disabled)");
				if (!$eligible.length) {
					this.$sheet.find(".vc-payroll-select-all").prop("checked", false);
					return;
				}
				const all = $eligible.length === $eligible.filter(":checked").length;
				this.$sheet.find(".vc-payroll-select-all").prop("checked", all);
			}

			update_payroll_panel() {
				const info = (this._data && this._data.payroll_info) || {};
				const selected = this.get_selected_payroll_employees().length;
				const eligible = ((this._data && this._data.payroll_eligible) || []).length;
				let status = "";

				if (info.payroll_entry) {
					const pe_link = `<a href="/app/payroll-entry/${encodeURIComponent(info.payroll_entry)}">${frappe.utils.escape_html(info.payroll_entry)}</a>`;
					status = __("Payroll Entry: {0} ({1})", [pe_link, info.payroll_entry_status || ""]);
					if (info.salary_slips_count) {
						status += ` · ${info.salary_slips_count} ${__("salary slip(s)")}`;
						if (info.salary_slips_submitted) {
							status += ` (${info.salary_slips_submitted} ${__("submitted")})`;
						}
					}
					this.$link_pe.attr("href", `/app/payroll-entry/${encodeURIComponent(info.payroll_entry)}`).show();
				} else {
					status = __("No Payroll Entry for this period yet.");
					if (info.salary_slips_count) {
						status += ` ${info.salary_slips_count} ${__("salary slip(s) exist without a linked Payroll Entry.")}`;
					}
					this.$link_pe.hide();
				}

				this.$payroll_status.html(status);
				this.$payroll_count.text(
					__("{0} of {1} eligible employees selected for payroll", [selected, eligible]),
				);

				const finalized = this._data && this._data.is_finalized;
				const pe_submitted = cint(info.payroll_entry_docstatus) === 1;
				this.$finalize.prop("disabled", finalized || pe_submitted || selected === 0);
			}

			collect_all_variable_entries() {
				const entries = [];
				const earnings = (this._data && this._data.earnings) || [];
				const deductions = (this._data && this._data.deductions) || [];
				const cols = [...earnings, ...deductions];
				const has_arrear_2 = (this._data?.salary_columns || []).some((c) => c.key === "arrear_2");

				this.$sheet.find("tbody tr.vc-emp-row").each(function () {
					const employee = $(this).data("employee");
					if (!employee) return;
					cols.forEach((col) => {
						const $in = $(this).find(`input[data-key="${col.key}"]`);
						if (!$in.length || $in.prop("readonly")) return;
						entries.push({
							employee,
							component_key: col.key,
							amount: flt($in.val()),
							additional_salary: $in.data("ads") || null,
						});
					});
					if (has_arrear_2) {
						const $arrear = $(this).find('input[data-key="arrear_2"]');
						if ($arrear.length && !$arrear.prop("readonly")) {
							entries.push({
								employee,
								component_key: "arrear_2",
								amount: flt($arrear.val()),
								additional_salary: $arrear.data("ads") || null,
							});
						}
					}
				});
				return entries;
			}

			_row_base_gross($tr) {
				const emp = $tr.attr("data-employee");
				const sal = (emp && this._employee_salary && this._employee_salary[emp]) || {};
				const assignment = flt(sal.assignment_gross);
				const perm = flt(sal.perm_gross);
				const gross = flt(sal.gross_pay);
				if (assignment > 0) return assignment;
				if (perm > 0) return perm;
				if (gross > 0) return gross;
				return (
					flt($tr.attr("data-assignment-gross")) ||
					flt($tr.attr("data-base-gross")) ||
					0
				);
			}

			_row_variable_sums($tr) {
				let earn = 0;
				$tr.find("input.vc-input[data-type='earning']").each(function () {
					earn += flt($(this).val());
				});
				return { earn };
			}

			_row_total_deduction($tr) {
				let ded = 0;
				$tr.find("input.vc-input[data-type='deduction']").each(function () {
					ded += flt($(this).val());
				});
				return ded;
			}

			recalc_totals() {
				const d = this._data;
				if (!d) return;

				const salary_cols = d.salary_columns || [];
				const earnings = d.earnings || [];
				const deductions = d.deductions || [];

				const empty_salary = {};
				salary_cols.forEach((c) => {
					empty_salary[c.key] = 0;
				});
				const empty_var = {};
				[...earnings, ...deductions].forEach((c) => {
					empty_var[c.key] = 0;
				});

				const empty_payment = { net_pay: 0, payable_amount: 0 };
				const section_acc = {};
				const grand_salary = { ...empty_salary };
				const grand_var = { ...empty_var };
				const grand_payment = { ...empty_payment };
				const summary = {
					total_headcount: 0,
					total_amount: 0,
					by_mode: {},
					by_bank: {},
				};

				const self = this;
				this.$sheet.find("tbody tr.vc-emp-row").each(function () {
					const $tr = $(this);
					const section = $tr.data("section");
					if (!section_acc[section]) {
						section_acc[section] = {
							salary: { ...empty_salary },
							var: { ...empty_var },
							payment: { ...empty_payment },
						};
					}
					const acc = section_acc[section];

					const slipNet = flt($tr.attr("data-slip-net"));
					const { baseGross, arrear2, earn, grossPay, projectedGross, projectedDed, projectedNet } =
						self._row_projected_totals($tr);
					const included = $tr.find(".vc-payroll-cb").is(":checked");
					const payable = self.row_payable_amount($tr, projectedNet, true);

					$tr.find(".vc-gross-preview").text(self.fmt_plain(grossPay));
					$tr.find(".vc-ded-preview").text(self.fmt_plain(projectedDed));
					const net_title = __("Gross {0} + Arrear 2 {1} + earnings {2} − deductions {3} = net {4}", [
						self.fmt_plain(baseGross),
						self.fmt_plain(arrear2),
						self.fmt_plain(earn),
						self.fmt_plain(projectedDed),
						self.fmt_plain(projectedNet),
					]);
					$tr.find(".vc-net-final-amt")
						.text(projectedNet ? self.fmt_plain(projectedNet) : "—")
						.toggleClass("vc-net-changed", Math.abs(projectedNet - slipNet) > 0.01)
						.attr("title", net_title);

					$tr.toggleClass("vc-row-included", included);
					$tr.find(".vc-payable-input").toggleClass("is-active", included);
					self.update_payable_input($tr, projectedNet);

					acc.salary.gross_pay += grossPay;
					if (acc.salary.arrear_2 != null) {
						acc.salary.arrear_2 += arrear2;
					}
					acc.salary.total_deduction += projectedDed;
					grand_salary.gross_pay += grossPay;
					if (grand_salary.arrear_2 != null) {
						grand_salary.arrear_2 += arrear2;
					}
					grand_salary.total_deduction += projectedDed;

					if (included) {
						acc.payment.net_pay += projectedNet;
						acc.payment.payable_amount += payable;
						grand_payment.net_pay += projectedNet;
						grand_payment.payable_amount += payable;

						if (payable > 0) {
							summary.total_headcount += 1;
							summary.total_amount += payable;
							const mode = $tr.find(".vc-payment-mode").val() || "Cheque";
							if (!summary.by_mode[mode]) {
								summary.by_mode[mode] = { label: mode, headcount: 0, amount: 0 };
							}
							summary.by_mode[mode].headcount += 1;
							summary.by_mode[mode].amount += payable;

							let bankKey =
								mode === "Bank"
									? ($tr.find(".vc-payment-bank").val() || __("Not set"))
									: __("Cheque");
							if (!summary.by_bank[bankKey]) {
								summary.by_bank[bankKey] = { label: bankKey, headcount: 0, amount: 0 };
							}
							summary.by_bank[bankKey].headcount += 1;
							summary.by_bank[bankKey].amount += payable;
						}
					}

					earnings.forEach((col) => {
						const v = flt($tr.find(`input[data-key="${col.key}"]`).val());
						acc.var[col.key] += v;
						grand_var[col.key] += v;
					});
					deductions.forEach((col) => {
						const v = flt($tr.find(`input[data-key="${col.key}"]`).val());
						acc.var[col.key] += v;
						grand_var[col.key] += v;
					});

					$tr.find("input.vc-input").each(function () {
						$(this).toggleClass("has-value", flt($(this).val()) > 0);
					});
				});

				summary.by_mode = Object.values(summary.by_mode).sort((a, b) =>
					a.label.localeCompare(b.label),
				);
				summary.by_bank = Object.values(summary.by_bank).sort((a, b) =>
					a.label.localeCompare(b.label),
				);
				this.render_payment_summary(summary);

				const fmt_salary = (key, val) => {
					if (key === "payment_days") return "—";
					if (key === "perm_gross" || key === "contract_gross") return "—";
					if (key === "arrear_2") return self.fmt_plain(val);
					return self.fmt_plain(val);
				};

				this.$sheet.find("tbody tr.vc-sec-total").each(function () {
					const $row = $(this);
					const section = $row.data("section");
					const acc = section_acc[section] || {
						salary: empty_salary,
						var: empty_var,
						payment: empty_payment,
					};
					$row.find('[data-total-group="salary"]').each(function () {
						const key = $(this).data("total-key");
						$(this).html(`<strong>${fmt_salary(key, acc.salary[key])}</strong>`);
					});
					$row.find('[data-total-group="earning"], [data-total-group="deduction"]').each(function () {
						const key = $(this).data("total-key");
						$(this).html(`<strong>${self.fmt_plain(acc.var[key] || 0)}</strong>`);
					});
					$row.find('[data-total-group="payment"]').each(function () {
						const key = $(this).data("total-key");
						$(this).html(`<strong>${self.fmt_plain((acc.payment || {})[key] || 0)}</strong>`);
					});
				});

				this.$sheet.find("tbody tr.vc-grand-total").each(function () {
					const $row = $(this);
					$row.find('[data-total-group="salary"]').each(function () {
						const key = $(this).data("total-key");
						$(this).html(`<strong>${fmt_salary(key, grand_salary[key])}</strong>`);
					});
					$row.find('[data-total-group="earning"], [data-total-group="deduction"]').each(function () {
						const key = $(this).data("total-key");
						$(this).html(`<strong>${self.fmt_plain(grand_var[key] || 0)}</strong>`);
					});
					$row.find('[data-total-group="payment"]').each(function () {
						const key = $(this).data("total-key");
						$(this).html(`<strong>${self.fmt_plain(grand_payment[key] || 0)}</strong>`);
					});
				});
			}

			collect_entries() {
				const entries = [];
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

			collect_pf_entries() {
				const entries = [];
				const seen = new Set();
				this.$sheet.find("tbody tr.vc-emp-row").each(function () {
					const $tr = $(this);
					const employee = $tr.data("employee");
					if (!employee || seen.has(employee)) return;
					seen.add(employee);
					const $pf = $tr.find('input[data-key="pf"]');
					if (!$pf.length) return;
					entries.push({
						employee,
						component_key: "pf",
						amount: flt($pf.val()),
						additional_salary: $pf.data("ads") || null,
					});
				});
				return entries;
			}

			save_batches(entries, batch_size = 15) {
				const batches = [];
				for (let i = 0; i < entries.length; i += batch_size) {
					batches.push(entries.slice(i, i + batch_size));
				}

				const totals = { created: 0, updated: 0, cancelled: 0, skipped: 0, errors: [] };
				let batch_index = 0;
				const self = this;

				const run_next = () => {
					if (batch_index >= batches.length) {
						frappe.hide_progress();
						const msg = __("Saved: {0} created, {1} updated, {2} removed, {3} skipped", [
							totals.created,
							totals.updated,
							totals.cancelled,
							totals.skipped,
						]);
						if (totals.errors.length) {
							frappe.msgprint({
								title: __("Save completed with errors"),
								message: msg + "<br><br>" + totals.errors.slice(0, 20).join("<br>"),
								indicator: "orange",
							});
						} else {
							frappe.show_alert({ message: msg, indicator: "green" }, 8);
						}
						self._dirty.clear();
						self.load_sheet();
						return;
					}

					frappe.show_progress(
						__("Saving Additional Salary"),
						batch_index,
						batches.length,
						__("Batch {0} of {1}", [batch_index + 1, batches.length]),
					);

					frappe.call({
						method: "tif_customization.tif_customization.page.variable_components.variable_components.save_variable_components",
						args: {
							company: self.$company.val(),
							payroll_date: self._data.payroll_date,
							entries: JSON.stringify(batches[batch_index]),
						},
						timeout: 120,
						callback: (r) => {
							const m = r.message || {};
							totals.created += m.created || 0;
							totals.updated += m.updated || 0;
							totals.cancelled += m.cancelled || 0;
							totals.skipped += m.skipped || 0;
							if (m.errors && m.errors.length) {
								totals.errors = totals.errors.concat(m.errors);
							}
							batch_index += 1;
							run_next();
						},
						error: (r) => {
							frappe.hide_progress();
							let msg = __("Save failed (network timeout or server error). Try fewer rows or reload and save again.");
							if (r && r.message) msg += "<br><br>" + r.message;
							frappe.msgprint({ title: __("Save failed"), message: msg, indicator: "red" });
						},
					});
				};

				run_next();
			}
		};
	}

	page.variable_components = new window.VariableComponentsPage(page);
	page.variable_components.make();
};

function flt(v) {
	return parseFloat(v) || 0;
}

function cint(v) {
	return parseInt(v, 10) || 0;
}
