frappe.pages["individual-attendance-sheet-range"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: "Individual Attendance Sheet (Date Range)",
		single_column: true,
	});

	page.main.html(`
		<div class="ias-filters" style="display:flex; gap:16px; flex-wrap:wrap; align-items:flex-end; margin-bottom: 12px;">
			<div style="min-width:260px;">
				<label class="control-label">Employee</label>
				<div id="ias-employee"></div>
			</div>
			<div style="min-width:220px;">
				<label class="control-label">From Date</label>
				<div id="ias-from"></div>
			</div>
			<div style="min-width:220px;">
				<label class="control-label">To Date</label>
				<div id="ias-to"></div>
			</div>
			<div style="display:flex; gap:8px;">
				<button class="btn btn-primary" id="ias-preview">Preview</button>
				<button class="btn btn-default" id="ias-print" disabled>Print</button>
			</div>
		</div>
		<div id="ias-preview-area" style="background:#fff; padding: 10px; border: 1px solid #eee; border-radius: 6px;"></div>
	`);

	const previewArea = page.main.find("#ias-preview-area");
	const previewBtn = page.main.find("#ias-preview");
	const printBtn = page.main.find("#ias-print");

	const employeeField = frappe.ui.form.make_control({
		parent: page.main.find("#ias-employee")[0],
		df: {
			fieldname: "employee",
			fieldtype: "Link",
			options: "Employee",
			reqd: 1,
			get_query() {
				return { filters: { status: "Active" } };
			},
		},
		render_input: true,
	});
	employeeField.refresh();

	const fromField = frappe.ui.form.make_control({
		parent: page.main.find("#ias-from")[0],
		df: { fieldname: "from_date", fieldtype: "Date", reqd: 1 },
		render_input: true,
	});
	fromField.refresh();
	fromField.set_value(frappe.datetime.month_start());

	const toField = frappe.ui.form.make_control({
		parent: page.main.find("#ias-to")[0],
		df: { fieldname: "to_date", fieldtype: "Date", reqd: 1 },
		render_input: true,
	});
	toField.refresh();
	toField.set_value(frappe.datetime.get_today());

	let last_html = "";

	async function fetch_html() {
		const employee = employeeField.get_value();
		const from_date = fromField.get_value();
		const to_date = toField.get_value();

		if (!employee) {
			frappe.msgprint("Select Employee");
			return null;
		}
		if (!from_date || !to_date) {
			frappe.msgprint("Select From Date and To Date");
			return null;
		}

		printBtn.prop("disabled", true);
		previewBtn.prop("disabled", true);
		previewArea.html(`<p class="text-muted">Loading…</p>`);

		try {
			const r = await frappe.call({
				method: "tif_customization.tif_customization.api.attendance_sheet.get_individual_attendance_sheet_html",
				args: { employee, from_date, to_date },
			});
			const html = r?.message?.html || "";
			last_html = html;
			previewArea.html(html || `<p class="text-muted">No data found for this range.</p>`);
			printBtn.prop("disabled", !html);
			return html;
		} finally {
			previewBtn.prop("disabled", false);
		}
	}

	function print_html() {
		if (!last_html) return;
		const w = window.open("", "_blank");
		w.document.write(last_html);
		w.document.close();
		w.focus();
		w.print();
	}

	previewBtn.on("click", () => fetch_html());
	printBtn.on("click", () => print_html());
};
