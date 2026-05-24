if (!window.SalaryRegisterPage) {
	window.SalaryRegisterPage = class SalaryRegisterPage {
	constructor(page) {
		this.page = page;
		this.periods = [];
		this.data = null;
	}

	make() {
		this.render_layout();
		this.load_periods();
	}

	render_layout() {
		this.page.main.html(`
			<div class="salary-register-root">
				<div class="salary-register-toolbar">
					<div class="filter-field">
						<label>${__("Payroll Period")}</label>
						<select class="form-control period-select"></select>
					</div>
					<div class="filter-field">
						<label>${__("Company")}</label>
						<select class="form-control company-select"></select>
					</div>
					<div class="filter-field" style="min-width:auto;padding-top:18px;">
						<label class="checkbox-label">
							<input type="checkbox" class="include-draft" checked />
							${__("Include draft salary slips")}
						</label>
					</div>
					<div class="salary-register-actions">
						<button class="btn btn-primary btn-sm btn-refresh">
							<i class="fa fa-refresh"></i> ${__("Load")}
						</button>
						<button class="btn btn-default btn-sm btn-export-excel">
							<i class="fa fa-file-excel-o"></i> ${__("Export Excel")}
						</button>
						<button class="btn btn-default btn-sm btn-print">
							<i class="fa fa-print"></i> ${__("Print")}
						</button>
					</div>
				</div>
				<div id="salary-register-report"></div>
			</div>
		`);

		this.$period = this.page.main.find(".period-select");
		this.$company = this.page.main.find(".company-select");
		this.$include_draft = this.page.main.find(".include-draft");
		this.$report = this.page.main.find("#salary-register-report");

		this.page.main.find(".btn-refresh").on("click", () => this.load_data());
		this.page.main.find(".btn-print").on("click", () => window.print());
		this.page.main.find(".btn-export-excel").on("click", () => this.export_excel());
		this.$period.on("change", () => this.load_data());
		this.$company.on("change", () => this.load_data());
	}

	load_periods() {
		frappe.call({
			method:
				"tif_customization.tif_customization.page.salary_register.salary_register.get_period_options",
			callback: (r) => {
				this.periods = r.message || [];
				this.$period.empty();
				if (!this.periods.length) {
					this.$period.append(`<option value="">${__("No salary slips found")}</option>`);
					this.render_empty(__("No salary slips in the system yet."));
					return;
				}
				this.periods.forEach((p, i) => {
					this.$period.append(
						`<option value="${i}" ${i === 0 ? "selected" : ""}>${frappe.utils.escape_html(p.label)}</option>`,
					);
				});
				this.load_companies();
				this.load_data();
			},
		});
	}

	load_companies() {
		frappe.call({
			method: "frappe.client.get_list",
			args: { doctype: "Company", fields: ["name"], order_by: "name", limit_page_length: 0 },
			callback: (r) => {
				this.$company.empty().append(`<option value="">${__("All Companies")}</option>`);
				(r.message || []).forEach((c) => {
					this.$company.append(
						`<option value="${frappe.utils.escape_html(c.name)}">${frappe.utils.escape_html(c.name)}</option>`,
					);
				});
			},
		});
	}

	get_filters() {
		const idx = parseInt(this.$period.val(), 10);
		const period = this.periods[idx] || {};
		return {
			month: period.month,
			year: period.year,
			start_date: period.start_date,
			end_date: period.end_date,
			company: this.$company.val() || "",
			include_draft: this.$include_draft.is(":checked") ? 1 : 0,
		};
	}

	load_data() {
		if (!this.periods.length) return;

		frappe.call({
			method:
				"tif_customization.tif_customization.page.salary_register.salary_register.get_register_data",
			args: this.get_filters(),
			freeze: true,
			freeze_message: __("Loading salary register..."),
			callback: (r) => {
				this.data = r.message || {};
				this.render_report();
			},
			error: () => frappe.msgprint(__("Could not load salary register.")),
		});
	}

	fmt_money(val) {
		const n = flt(val);
		if (!n) return "";
		return frappe.format(n, { fieldtype: "Currency" });
	}

	fmt_num(val) {
		const n = flt(val);
		if (!n) return "";
		return frappe.format(n, { fieldtype: "Float", precision: 1 });
	}

	fmt_date(val) {
		if (!val) return "";
		return frappe.datetime.str_to_user(val);
	}

	render_empty(msg) {
		this.$report.html(`<div class="salary-register-empty">${frappe.utils.escape_html(msg)}</div>`);
	}

	render_report() {
		const d = this.data;
		if (!d || !d.sections || !d.sections.length) {
			this.render_empty(d?.subtitle || __("No data for this period."));
			return;
		}

		const thead = this.build_thead();
		let tbody = "";

		d.sections.forEach((section) => {
			tbody += `<tr class="section-row"><td colspan="27">${frappe.utils.escape_html(section.label)}</td></tr>`;
			if (section.header_only) return;
			(section.rows || []).forEach((row) => {
				tbody += this.build_data_row(row);
			});
			if ((section.rows || []).length) {
				tbody += this.build_total_row(section.totals, `${section.label} — ${__("Total")}`);
			}
		});

		if (d.grand_totals) {
			tbody += this.build_total_row(d.grand_totals, __("Grand Total"), "grand-total");
		}

		this.$report.html(`
			<div class="salary-register-sheet-wrap">
				<div class="salary-register-head">
					<div class="org-name">${frappe.utils.escape_html(d.title || "")}</div>
					<div class="sheet-title">${frappe.utils.escape_html(d.subtitle || "")}</div>
					<div class="sheet-sub">${frappe.utils.escape_html(d.company || "")} · ${frappe.utils.escape_html(d.period_label || "")} · ${d.employee_count || 0} ${__("employees")}</div>
				</div>
				<table class="salary-register-table">
					${thead}
					<tbody>${tbody}</tbody>
				</table>
			</div>
		`);
	}

	build_thead() {
		return `
			<thead>
				<tr>
					<th rowspan="2">S.#</th>
					<th rowspan="2">Section</th>
					<th rowspan="2">Employee Name</th>
					<th rowspan="2">Head Desig</th>
					<th rowspan="2">Office/Branch</th>
					<th rowspan="2">D.O.B</th>
					<th rowspan="2">Grades</th>
					<th rowspan="2">Bank Account Num</th>
					<th rowspan="2">Status</th>
					<th rowspan="2">Dept.</th>
					<th colspan="3" class="hdr-group-1">Permanent / Probation / Freelancer</th>
					<th colspan="3" class="hdr-group-1">Contractual</th>
					<th colspan="4" class="hdr-group-2">Allowances — All Staff</th>
					<th rowspan="2">No. of Days Worked</th>
					<th colspan="4" class="hdr-group-2">Deductions *3</th>
					<th rowspan="2">Tax</th>
					<th rowspan="2">Net Salary Payment</th>
					<th rowspan="2">Joining Date</th>
					<th rowspan="2">Payment mode</th>
				</tr>
				<tr>
					<th class="hdr-group-1">Gross Salary</th>
					<th class="hdr-group-1">Arrears*2</th>
					<th class="hdr-group-1">Total</th>
					<th class="hdr-group-1">Gross Salary</th>
					<th class="hdr-group-1">Arrears*2</th>
					<th class="hdr-group-1">Total</th>
					<th class="hdr-group-2">Fuel</th>
					<th class="hdr-group-2">Mobile/Internet</th>
					<th class="hdr-group-2">Overtime</th>
					<th class="hdr-group-2">Allowance *1</th>
					<th class="hdr-group-2">Leave/Joining</th>
					<th class="hdr-group-2">PF</th>
					<th class="hdr-group-2">Fuel Deduction</th>
					<th class="hdr-group-2">Total</th>
				</tr>
			</thead>
		`;
	}

	build_data_row(row) {
		return `
			<tr>
				<td class="text-center">${row.serial || ""}</td>
				<td class="text-center">${row.section_no || ""}</td>
				<td class="text-left col-name">${frappe.utils.escape_html(row.employee_name || "")}</td>
				<td class="text-left col-desig">${frappe.utils.escape_html(row.designation || "")}</td>
				<td class="text-left">${frappe.utils.escape_html(row.branch || "")}</td>
				<td class="text-center">${this.fmt_date(row.date_of_birth)}</td>
				<td class="text-center">${frappe.utils.escape_html(row.grades || "")}</td>
				<td class="text-left">${frappe.utils.escape_html(row.bank_ac_no || "")}</td>
				<td class="text-center">${frappe.utils.escape_html(row.status || "")}</td>
				<td class="text-center">${frappe.utils.escape_html(row.dept_code || "")}</td>
				<td class="text-right">${this.fmt_money(row.perm_gross)}</td>
				<td class="text-right">${this.fmt_money(row.perm_arrears)}</td>
				<td class="text-right">${this.fmt_money(row.perm_total)}</td>
				<td class="text-right">${this.fmt_money(row.contract_gross)}</td>
				<td class="text-right">${this.fmt_money(row.contract_arrears)}</td>
				<td class="text-right">${this.fmt_money(row.contract_total)}</td>
				<td class="text-right">${this.fmt_money(row.fuel)}</td>
				<td class="text-right">${this.fmt_money(row.mobile)}</td>
				<td class="text-right">${this.fmt_money(row.overtime)}</td>
				<td class="text-right">${this.fmt_money(row.other_allowance)}</td>
				<td class="text-right">${this.fmt_num(row.days_worked)}</td>
				<td class="text-right">${this.fmt_money(row.leave_ded)}</td>
				<td class="text-right">${this.fmt_money(row.pf)}</td>
				<td class="text-right">${this.fmt_money(row.fuel_ded)}</td>
				<td class="text-right">${this.fmt_money(row.ded_total)}</td>
				<td class="text-right">${this.fmt_money(row.tax)}</td>
				<td class="text-right">${this.fmt_money(row.net_pay)}</td>
				<td class="text-center">${this.fmt_date(row.joining_date)}</td>
				<td class="text-center">${frappe.utils.escape_html(row.payment_mode || "")}</td>
			</tr>
		`;
	}

	build_total_row(totals, label, row_class = "section-total") {
		const t = totals || {};
		return `
			<tr class="${row_class}">
				<td colspan="10" class="text-left">${frappe.utils.escape_html(label)}</td>
				<td class="text-right">${this.fmt_money(t.perm_gross)}</td>
				<td class="text-right">${this.fmt_money(t.perm_arrears)}</td>
				<td class="text-right">${this.fmt_money(t.perm_total)}</td>
				<td class="text-right">${this.fmt_money(t.contract_gross)}</td>
				<td class="text-right">${this.fmt_money(t.contract_arrears)}</td>
				<td class="text-right">${this.fmt_money(t.contract_total)}</td>
				<td class="text-right">${this.fmt_money(t.fuel)}</td>
				<td class="text-right">${this.fmt_money(t.mobile)}</td>
				<td class="text-right">${this.fmt_money(t.overtime)}</td>
				<td class="text-right">${this.fmt_money(t.other_allowance)}</td>
				<td class="text-right">${this.fmt_num(t.days_worked)}</td>
				<td class="text-right">${this.fmt_money(t.leave_ded)}</td>
				<td class="text-right">${this.fmt_money(t.pf)}</td>
				<td class="text-right">${this.fmt_money(t.fuel_ded)}</td>
				<td class="text-right">${this.fmt_money(t.ded_total)}</td>
				<td class="text-right">${this.fmt_money(t.tax)}</td>
				<td class="text-right">${this.fmt_money(t.net_pay)}</td>
				<td colspan="2"></td>
			</tr>
		`;
	}

	export_excel() {
		const table = this.$report.find(".salary-register-table")[0];
		if (!table) {
			frappe.msgprint(__("Load the report first."));
			return;
		}
		const html = `
			<html xmlns:o="urn:schemas-microsoft-com:office:office"
				xmlns:x="urn:schemas-microsoft-com:office:excel">
			<head><meta charset="utf-8"></head>
			<body>${table.outerHTML}</body></html>`;
		const blob = new Blob([html], { type: "application/vnd.ms-excel" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		const period = this.periods[parseInt(this.$period.val(), 10)] || {};
		a.href = url;
		a.download = `Salary_Register_${period.month || ""}_${period.year || ""}.xls`;
		a.click();
		URL.revokeObjectURL(url);
		frappe.show_alert({ message: __("Excel downloaded"), indicator: "green" }, 3);
	}
	};
}

function flt(v) {
	return parseFloat(v) || 0;
}

frappe.pages["salary-register"].on_page_load = function (wrapper) {
	frappe.require("/assets/tif_customization/css/salary_register.css");

	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Salary Register"),
		single_column: true,
	});

	page.salary_register = new window.SalaryRegisterPage(page);
	page.salary_register.make();
};
