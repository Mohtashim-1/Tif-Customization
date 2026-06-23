frappe.pages['field-staff-visit-mo'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'SME Visits Summary',
		single_column: true
	});

	const container = $(`
		<div class="field-staff-visit-report">
			<div class="filter-section" style="background: #f8f9fa; padding: 15px; border-radius: 6px; margin-bottom: 20px;">
				<div class="row">
					<div class="col-md-3">
						<label>Month</label>
						<select id="fs-month" class="form-control"></select>
					</div>
					<div class="col-md-3">
						<label>Year</label>
						<select id="fs-year" class="form-control"></select>
					</div>
					<div class="col-md-3">
						<label>User</label>
						<select id="fs-user" class="form-control">
							<option value="">All Users</option>
						</select>
					</div>
					<div class="col-md-3" style="margin-top: 24px;">
						<button class="btn btn-primary" id="fs-apply">Apply</button>
						<button class="btn btn-secondary" id="fs-reset">Reset</button>
						<button class="btn btn-info" id="fs-print"><i class="fa fa-print"></i> Print</button>
					</div>
				</div>
			</div>
			<div id="fs-report"></div>
		</div>
	`);

	page.main.append(container);

	const months = [
		{ value: 1, label: 'January' },
		{ value: 2, label: 'February' },
		{ value: 3, label: 'March' },
		{ value: 4, label: 'April' },
		{ value: 5, label: 'May' },
		{ value: 6, label: 'June' },
		{ value: 7, label: 'July' },
		{ value: 8, label: 'August' },
		{ value: 9, label: 'September' },
		{ value: 10, label: 'October' },
		{ value: 11, label: 'November' },
		{ value: 12, label: 'December' }
	];

	function build_select($select, items, selected) {
		$select.empty();
		items.forEach(item => {
			const option = $(`<option value="${item.value}">${item.label}</option>`);
			if (item.value === selected) {
				option.attr('selected', 'selected');
			}
			$select.append(option);
		});
	}

	function build_years(selectedYear) {
		const currentYear = new Date().getFullYear();
		const years = [];
		for (let y = currentYear - 5; y <= currentYear + 1; y++) {
			years.push({ value: y, label: String(y) });
		}
		build_select($('#fs-year'), years, selectedYear);
	}

	function build_user_select(selectedUser) {
		frappe.call({
			method: 'frappe.client.get_list',
			args: {
				doctype: 'User',
				fields: ['name', 'full_name'],
				filters: { enabled: 1 },
				limit_page_length: 500,
				order_by: 'full_name asc'
			},
			callback: function(r) {
				const users = r.message || [];
				const $user = $('#fs-user');
				$user.empty();
				$user.append('<option value="">All Users</option>');
				users.forEach(u => {
					const label = u.full_name ? `${u.full_name} (${u.name})` : u.name;
					const option = $(`<option value="${frappe.utils.escape_html(u.name)}">${frappe.utils.escape_html(label)}</option>`);
					if (u.name === selectedUser) {
						option.attr('selected', 'selected');
					}
					$user.append(option);
				});
			}
		});
	}

	function load_report(month, year, user) {
		$('#fs-report').html('<p class="text-muted">Loading report...</p>');
		frappe.call({
			method: 'tif_customization.tif_customization.page.field_staff_visit_mo.field_staff_visit_mo.get_report_data',
			args: {
				filters: {
					month: month,
					year: year,
					user: user || ''
				}
			},
			callback: function(r) {
				if (!r.message || r.message.error) {
					$('#fs-report').html('<p class="text-danger">Failed to load report.</p>');
					return;
				}
				render_report(r.message);
			},
			error: function() {
				$('#fs-report').html('<p class="text-danger">Failed to load report.</p>');
			}
		});
	}

	function render_report(data) {
		const monthLabel = months.find(m => m.value === data.month)?.label || data.month;
		const header = `
			<div style="text-align: center; font-weight: bold; font-size: 20px; margin-bottom: 15px;">
				SME Visits Summary Month of ${monthLabel}-${data.year}
			</div>
		`;

		const marketing = render_marketing_table(data.marketing);
		const me = render_me_table(data.me);
		const training = render_training_table(data.training);

		$('#fs-report').html(`
			${header}
			<div class="row">
				<div class="col-md-4">${marketing}</div>
				<div class="col-md-4">${me}</div>
				<div class="col-md-4">${training}</div>
			</div>
		`);
	}

	function render_marketing_table(marketing) {
		const rows = marketing?.rows || [];
		const totals = marketing?.totals || { new: 0, followup: 0, tps: 0, total: 0 };
		const body = rows.length ? rows.map(row => `
			<tr>
				<td>${row.province || '-'}</td>
				<td class="text-right">${row.new || 0}</td>
				<td class="text-right">${row.followup || 0}</td>
				<td class="text-right">${row.tps || 0}</td>
				<td class="text-right">${row.total || 0}</td>
			</tr>
		`).join('') : '<tr><td colspan="5" class="text-center">No data</td></tr>';

		return `
			<div class="table-responsive">
				<table class="table table-bordered table-striped" style="font-size: 12px;">
					<thead>
						<tr><th colspan="5" class="text-center">Marketing Visits</th></tr>
						<tr>
							<th>Province</th>
							<th>New</th>
							<th>Followup & Other Visits</th>
							<th>TPS Visits</th>
							<th>Grand Total</th>
						</tr>
					</thead>
					<tbody>${body}</tbody>
					<tfoot>
						<tr>
							<th>Grand Total</th>
							<th class="text-right">${totals.new || 0}</th>
							<th class="text-right">${totals.followup || 0}</th>
							<th class="text-right">${totals.tps || 0}</th>
							<th class="text-right">${totals.total || 0}</th>
						</tr>
					</tfoot>
				</table>
			</div>
		`;
	}

	function render_me_table(me) {
		const rows = me?.rows || [];
		const totals = me?.totals || { active: 0, inactive: 0, total: 0 };
		const body = rows.length ? rows.map(row => `
			<tr>
				<td>${row.province || '-'}</td>
				<td class="text-right">${row.active || 0}</td>
				<td class="text-right">${row.inactive || 0}</td>
				<td class="text-right">${row.total || 0}</td>
			</tr>
		`).join('') : '<tr><td colspan="4" class="text-center">No data</td></tr>';

		return `
			<div class="table-responsive">
				<table class="table table-bordered table-striped" style="font-size: 12px;">
					<thead>
						<tr><th colspan="4" class="text-center">M&E Visits</th></tr>
						<tr>
							<th>Province</th>
							<th>Active</th>
							<th>Inactive</th>
							<th>Grand Total</th>
						</tr>
					</thead>
					<tbody>${body}</tbody>
					<tfoot>
						<tr>
							<th>Grand Total</th>
							<th class="text-right">${totals.active || 0}</th>
							<th class="text-right">${totals.inactive || 0}</th>
							<th class="text-right">${totals.total || 0}</th>
						</tr>
					</tfoot>
				</table>
			</div>
		`;
	}

	function render_training_table(training) {
		const rows = training?.rows || [];
		const totals = training?.totals || { schools: 0, participants: 0 };
		const body = rows.length ? rows.map(row => `
			<tr>
				<td>${row.province || '-'}</td>
				<td class="text-right">${row.schools || 0}</td>
				<td class="text-right">${row.participants || 0}</td>
			</tr>
		`).join('') : '<tr><td colspan="3" class="text-center">No data</td></tr>';

		return `
			<div class="table-responsive">
				<table class="table table-bordered table-striped" style="font-size: 12px;">
					<thead>
						<tr><th colspan="3" class="text-center">Training Sessions</th></tr>
						<tr>
							<th>Province</th>
							<th>No. of Schools</th>
							<th>No. of participants</th>
						</tr>
					</thead>
					<tbody>${body}</tbody>
					<tfoot>
						<tr>
							<th>Grand Total</th>
							<th class="text-right">${totals.schools || 0}</th>
							<th class="text-right">${totals.participants || 0}</th>
						</tr>
					</tfoot>
				</table>
			</div>
		`;
	}

	function reset_filters() {
		const now = new Date();
		const month = now.getMonth() + 1;
		const year = now.getFullYear();
		build_select($('#fs-month'), months, month);
		build_years(year);
		$('#fs-user').val('');
		load_report(month, year, '');
	}

	$('#fs-apply').on('click', function() {
		const month = parseInt($('#fs-month').val(), 10);
		const year = parseInt($('#fs-year').val(), 10);
		const user = $('#fs-user').val() || '';
		load_report(month, year, user);
	});

	$('#fs-reset').on('click', function() {
		reset_filters();
	});

	$('#fs-print').on('click', function() {
		window.print();
	});

	build_user_select('');
	reset_filters();
}
