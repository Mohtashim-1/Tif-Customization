frappe.pages['field-staff-visit-mo'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'SME Visits Summary',
		single_column: true
	});

	function month_start() {
		const dt = new Date();
		dt.setDate(1);
		return dt.toISOString().slice(0, 10);
	}

	const container = $(`
		<div class="field-staff-visit-report">
			<div class="filter-section" style="background: #f8f9fa; padding: 15px; border-radius: 6px; margin-bottom: 20px;">
				<div class="row">
					<div class="col-md-2">
						<label>${__('Visit From Date')}</label>
						<input type="date" id="fs-from-date" class="form-control" />
					</div>
					<div class="col-md-2">
						<label>${__('Visit To Date')}</label>
						<input type="date" id="fs-to-date" class="form-control" />
					</div>
					<div class="col-md-3">
						<label>${__('Section')}</label>
						<select id="fs-section" class="form-control">
							<option value="">${__('All Sections')}</option>
						</select>
					</div>
					<div class="col-md-3">
						<label>${__('User')}</label>
						<select id="fs-user" class="form-control">
							<option value="">${__('All Users')}</option>
						</select>
					</div>
					<div class="col-md-2" style="margin-top: 24px;">
						<button class="btn btn-primary" id="fs-apply">${__('Apply')}</button>
						<button class="btn btn-secondary" id="fs-reset">${__('Reset')}</button>
						<button class="btn btn-info" id="fs-print"><i class="fa fa-print"></i> ${__('Print')}</button>
					</div>
				</div>
			</div>
			<div id="fs-report"></div>
		</div>
	`);

	page.main.append(container);

	function build_section_select(selectedSection) {
		frappe.call({
			method: 'frappe.client.get_list',
			args: {
				doctype: 'Department',
				fields: ['name'],
				limit_page_length: 500,
				order_by: 'name asc'
			},
			callback: function(r) {
				const sections = r.message || [];
				const $section = $('#fs-section');
				$section.empty();
				$section.append(`<option value="">${__('All Sections')}</option>`);
				sections.forEach((s) => {
					const option = $(`<option value="${frappe.utils.escape_html(s.name)}">${frappe.utils.escape_html(s.name)}</option>`);
					if (s.name === selectedSection) {
						option.attr('selected', 'selected');
					}
					$section.append(option);
				});
			}
		});
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
				$user.append(`<option value="">${__('All Users')}</option>`);
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

	function get_filters() {
		return {
			from_date: $('#fs-from-date').val(),
			to_date: $('#fs-to-date').val(),
			section: $('#fs-section').val() || '',
			user: $('#fs-user').val() || ''
		};
	}

	function load_report() {
		const filters = get_filters();
		if (!filters.from_date || !filters.to_date) {
			frappe.msgprint(__('Please select Visit From Date and Visit To Date.'));
			return;
		}

		$('#fs-report').html(`<p class="text-muted">${__('Loading report...')}</p>`);
		frappe.call({
			method: 'tif_customization.tif_customization.page.field_staff_visit_mo.field_staff_visit_mo.get_report_data',
			args: { filters },
			callback: function(r) {
				if (!r.message || r.message.error) {
					$('#fs-report').html(`<p class="text-danger">${__('Failed to load report.')}</p>`);
					return;
				}
				render_report(r.message);
			},
			error: function() {
				$('#fs-report').html(`<p class="text-danger">${__('Failed to load report.')}</p>`);
			}
		});
	}

	/*
	function add_submission_ratio(data, filters, callback) {
		const submittedUsers = get_submitted_users(data);

		frappe.call({
			method: 'frappe.client.get_list',
			args: {
				doctype: 'Has Role',
				fields: ['parent'],
				filters: {
					role: 'Field Staff',
					parenttype: 'User'
				},
				limit_page_length: 1000
			},
			callback: function(r) {
				const roleUsers = [...new Set((r.message || []).map(row => row.parent).filter(Boolean))];
				filter_enabled_field_staff_users(roleUsers, filters, function(eligibleUsers) {
					const eligibleCount = eligibleUsers.size;
					const submittedCount = submittedUsers.size;
					data.submission_ratio = {
						submitted_users: submittedCount,
						eligible_users: eligibleCount,
						ratio: eligibleCount ? Number((submittedCount / eligibleCount * 100).toFixed(1)) : 0
					};
					callback(data);
				});
			},
			error: function() {
				const submittedCount = submittedUsers.size;
				data.submission_ratio = {
					submitted_users: submittedCount,
					eligible_users: submittedCount,
					ratio: submittedCount ? 100 : 0
				};
				callback(data);
			}
		});
	}
	*/

	function filter_enabled_field_staff_users(roleUsers, filters, callback) {
		if (!roleUsers.length) {
			callback(new Set());
			return;
		}

		frappe.call({
			method: 'frappe.client.get_list',
			args: {
				doctype: 'User',
				fields: ['name'],
				filters: {
					name: ['in', roleUsers],
					enabled: 1,
					...(filters.user ? { name: filters.user } : {})
				},
				limit_page_length: 1000
			},
			callback: function(r) {
				const enabledUsers = new Set((r.message || []).map(row => row.name).filter(Boolean));
				if (!filters.section || !enabledUsers.size) {
					callback(enabledUsers);
					return;
				}

				frappe.call({
					method: 'frappe.client.get_list',
					args: {
						doctype: 'Employee',
						fields: ['user_id'],
						filters: {
							status: 'Active',
							department: filters.section,
							user_id: ['in', [...enabledUsers]]
						},
						limit_page_length: 1000
					},
					callback: function(employeeResponse) {
						callback(new Set((employeeResponse.message || []).map(row => row.user_id).filter(Boolean)));
					},
					error: function() {
						callback(enabledUsers);
					}
				});
			},
			error: function() {
				callback(new Set(roleUsers));
			}
		});
	}

	function get_submitted_users(data) {
		const submittedUsers = new Set();
		[data.marketing, data.me, data.training].forEach((group) => {
			(group?.rows || []).forEach((row) => {
				const user = String(row.user_name || row.user || '').trim();
				if (user && user !== 'Unassigned') {
					submittedUsers.add(user.toLowerCase());
				}
			});
		});
		return submittedUsers;
	}

	function rollup_marketing_by_section(rows) {
		const buckets = {};
		rows.forEach((row) => {
			const section = row.section || __('Unassigned');
			const bucket = buckets[section] || { section, new: 0, followup: 0, tps: 0, total: 0 };
			bucket.new += row.new || 0;
			bucket.followup += row.followup || 0;
			bucket.tps += row.tps || 0;
			bucket.total += row.total || 0;
			buckets[section] = bucket;
		});
		return Object.values(buckets).sort((a, b) => a.section.localeCompare(b.section));
	}

	function rollup_me_by_section(rows) {
		const buckets = {};
		rows.forEach((row) => {
			const section = row.section || __('Unassigned');
			const bucket = buckets[section] || { section, active: 0, inactive: 0, total: 0 };
			bucket.active += row.active || 0;
			bucket.inactive += row.inactive || 0;
			bucket.total += row.total || 0;
			buckets[section] = bucket;
		});
		return Object.values(buckets).sort((a, b) => a.section.localeCompare(b.section));
	}

	function rollup_training_by_section(rows) {
		const buckets = {};
		rows.forEach((row) => {
			const section = row.section || __('Unassigned');
			const bucket = buckets[section] || { section, schools: 0, participants: 0 };
			bucket.schools += row.schools || 0;
			bucket.participants += row.participants || 0;
			buckets[section] = bucket;
		});
		return Object.values(buckets).sort((a, b) => a.section.localeCompare(b.section));
	}

	function render_report(data) {
		const fromLabel = frappe.datetime.str_to_user(data.from_date || '');
		const toLabel = frappe.datetime.str_to_user(data.to_date || '');
		const header = `
			<div style="text-align: center; font-weight: bold; font-size: 20px; margin-bottom: 15px;">
				${__('SME Visits Summary')} (${fromLabel} ${__('to')} ${toLabel})
			</div>
		`;
		const submissionRatio = render_submission_ratio(data.submission_ratio);

		const marketingSection = render_marketing_section_table(data.marketing);
		const meSection = render_me_section_table(data.me);
		const trainingSection = render_training_section_table(data.training);

		const marketingUsers = render_marketing_user_table(data.marketing);
		// const meUsers = render_me_user_table(data.me);
		// const trainingUsers = render_training_user_table(data.training);

		$('#fs-report').html(`
			${header}
			${submissionRatio}
			<div class="row">
				<div class="col-md-4">${marketingSection}</div>
				<div class="col-md-4">${meSection}</div>
				<div class="col-md-4">${trainingSection}</div>
			</div>
			<div style="margin-top: 25px; margin-bottom: 10px; font-weight: bold; font-size: 16px;">
				${__('User Wise Detail')}
			</div>
			<div class="row">
				<div class="col-md-12 mb-3">${marketingUsers}</div>
				<!-- M&E Visits — User Wise table intentionally hidden -->
				<!-- Training Sessions — User Wise table intentionally hidden -->
			</div>
		`);
	}

	function render_submission_ratio(summary) {
		const submitted = summary?.submitted_users || 0;
		const eligible = summary?.eligible_users || 0;
		const ratio = Number(summary?.ratio || 0).toFixed(1);

		return `
			<div class="row" style="margin-bottom: 18px;">
				<div class="col-md-4">
					<div class="border rounded p-3 text-center">
						<div class="text-muted">${__('Submitted Users')}</div>
						<div style="font-size: 24px; font-weight: 700;">${submitted}</div>
					</div>
				</div>
				<div class="col-md-4">
					<div class="border rounded p-3 text-center">
						<div class="text-muted">${__('Eligible Users')}</div>
						<div style="font-size: 24px; font-weight: 700;">${eligible}</div>
					</div>
				</div>
				<div class="col-md-4">
					<div class="border rounded p-3 text-center">
						<div class="text-muted">${__('Submission Ratio')}</div>
						<div style="font-size: 24px; font-weight: 700;">${ratio}%</div>
					</div>
				</div>
			</div>
		`;
	}

	function render_marketing_section_table(marketing) {
		const rows = rollup_marketing_by_section(marketing?.rows || []);
		const totals = marketing?.totals || { new: 0, followup: 0, tps: 0, total: 0 };
		const body = rows.length ? rows.map(row => `
			<tr>
				<td>${frappe.utils.escape_html(row.section || '-')}</td>
				<td class="text-right">${row.new || 0}</td>
				<td class="text-right">${row.followup || 0}</td>
				<td class="text-right">${row.tps || 0}</td>
				<td class="text-right">${row.total || 0}</td>
			</tr>
		`).join('') : `<tr><td colspan="5" class="text-center">${__('No data')}</td></tr>`;

		return `
			<div class="table-responsive">
				<table class="table table-bordered table-striped" style="font-size: 12px;">
					<thead>
						<tr><th colspan="5" class="text-center">${__('Marketing Visits')}</th></tr>
						<tr>
							<th>${__('Section')}</th>
							<th>${__('New')}</th>
							<th>${__('Followup & Other Visits')}</th>
							<th>${__('TPS Visits')}</th>
							<th>${__('Grand Total')}</th>
						</tr>
					</thead>
					<tbody>${body}</tbody>
					<tfoot>
						<tr>
							<th>${__('Grand Total')}</th>
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

	function render_me_section_table(me) {
		const rows = rollup_me_by_section(me?.rows || []);
		const totals = me?.totals || { active: 0, inactive: 0, total: 0 };
		const body = rows.length ? rows.map(row => `
			<tr>
				<td>${frappe.utils.escape_html(row.section || '-')}</td>
				<td class="text-right">${row.active || 0}</td>
				<td class="text-right">${row.inactive || 0}</td>
				<td class="text-right">${row.total || 0}</td>
			</tr>
		`).join('') : `<tr><td colspan="4" class="text-center">${__('No data')}</td></tr>`;

		return `
			<div class="table-responsive">
				<table class="table table-bordered table-striped" style="font-size: 12px;">
					<thead>
						<tr><th colspan="4" class="text-center">${__('M&E Visits')}</th></tr>
						<tr>
							<th>${__('Section')}</th>
							<th>${__('Active')}</th>
							<th>${__('Inactive')}</th>
							<th>${__('Grand Total')}</th>
						</tr>
					</thead>
					<tbody>${body}</tbody>
					<tfoot>
						<tr>
							<th>${__('Grand Total')}</th>
							<th class="text-right">${totals.active || 0}</th>
							<th class="text-right">${totals.inactive || 0}</th>
							<th class="text-right">${totals.total || 0}</th>
						</tr>
					</tfoot>
				</table>
			</div>
		`;
	}

	function render_training_section_table(training) {
		const rows = rollup_training_by_section(training?.rows || []);
		const totals = training?.totals || { schools: 0, participants: 0 };
		const body = rows.length ? rows.map(row => `
			<tr>
				<td>${frappe.utils.escape_html(row.section || '-')}</td>
				<td class="text-right">${row.schools || 0}</td>
				<td class="text-right">${row.participants || 0}</td>
			</tr>
		`).join('') : `<tr><td colspan="3" class="text-center">${__('No data')}</td></tr>`;

		return `
			<div class="table-responsive">
				<table class="table table-bordered table-striped" style="font-size: 12px;">
					<thead>
						<tr><th colspan="3" class="text-center">${__('Training Sessions')}</th></tr>
						<tr>
							<th>${__('Section')}</th>
							<th>${__('No. of Schools')}</th>
							<th>${__('No. of participants')}</th>
						</tr>
					</thead>
					<tbody>${body}</tbody>
					<tfoot>
						<tr>
							<th>${__('Grand Total')}</th>
							<th class="text-right">${totals.schools || 0}</th>
							<th class="text-right">${totals.participants || 0}</th>
						</tr>
					</tfoot>
				</table>
			</div>
		`;
	}

	function render_row_label(row) {
		const section = frappe.utils.escape_html(row.section || '-');
		const user = frappe.utils.escape_html(row.user_name || row.user || '-');
		return `<td>${section}</td><td>${user}</td>`;
	}

	function render_marketing_user_table(marketing) {
		const rows = marketing?.rows || [];
		const totals = marketing?.totals || { new: 0, followup: 0, tps: 0, total: 0 };
		const body = rows.length ? rows.map(row => `
			<tr>
				${render_row_label(row)}
				<td class="text-right">${row.new || 0}</td>
				<td class="text-right">${row.followup || 0}</td>
				<td class="text-right">${row.tps || 0}</td>
				<td class="text-right">${row.total || 0}</td>
			</tr>
		`).join('') : `<tr><td colspan="6" class="text-center">${__('No data')}</td></tr>`;

		return `
			<div class="table-responsive">
				<table class="table table-bordered table-striped" style="font-size: 12px;">
					<thead>
						<tr><th colspan="6" class="text-center">${__('Marketing Visits — User Wise')}</th></tr>
						<tr>
							<th>${__('Section')}</th>
							<th>${__('User')}</th>
							<th>${__('New')}</th>
							<th>${__('Followup & Other Visits')}</th>
							<th>${__('TPS Visits')}</th>
							<th>${__('Grand Total')}</th>
						</tr>
					</thead>
					<tbody>${body}</tbody>
					<tfoot>
						<tr>
							<th colspan="2">${__('Grand Total')}</th>
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

	function render_me_user_table(me) {
		const rows = me?.rows || [];
		const totals = me?.totals || { active: 0, inactive: 0, total: 0 };
		const body = rows.length ? rows.map(row => `
			<tr>
				${render_row_label(row)}
				<td class="text-right">${row.active || 0}</td>
				<td class="text-right">${row.inactive || 0}</td>
				<td class="text-right">${row.total || 0}</td>
			</tr>
		`).join('') : `<tr><td colspan="5" class="text-center">${__('No data')}</td></tr>`;

		return `
			<div class="table-responsive">
				<table class="table table-bordered table-striped" style="font-size: 12px;">
					<thead>
						<tr><th colspan="5" class="text-center">${__('M&E Visits — User Wise')}</th></tr>
						<tr>
							<th>${__('Section')}</th>
							<th>${__('User')}</th>
							<th>${__('Active')}</th>
							<th>${__('Inactive')}</th>
							<th>${__('Grand Total')}</th>
						</tr>
					</thead>
					<tbody>${body}</tbody>
					<tfoot>
						<tr>
							<th colspan="2">${__('Grand Total')}</th>
							<th class="text-right">${totals.active || 0}</th>
							<th class="text-right">${totals.inactive || 0}</th>
							<th class="text-right">${totals.total || 0}</th>
						</tr>
					</tfoot>
				</table>
			</div>
		`;
	}

	function render_training_user_table(training) {
		const rows = training?.rows || [];
		const totals = training?.totals || { schools: 0, participants: 0 };
		const body = rows.length ? rows.map(row => `
			<tr>
				${render_row_label(row)}
				<td class="text-right">${row.schools || 0}</td>
				<td class="text-right">${row.participants || 0}</td>
			</tr>
		`).join('') : `<tr><td colspan="4" class="text-center">${__('No data')}</td></tr>`;

		return `
			<div class="table-responsive">
				<table class="table table-bordered table-striped" style="font-size: 12px;">
					<thead>
						<tr><th colspan="4" class="text-center">${__('Training Sessions — User Wise')}</th></tr>
						<tr>
							<th>${__('Section')}</th>
							<th>${__('User')}</th>
							<th>${__('No. of Schools')}</th>
							<th>${__('No. of participants')}</th>
						</tr>
					</thead>
					<tbody>${body}</tbody>
					<tfoot>
						<tr>
							<th colspan="2">${__('Grand Total')}</th>
							<th class="text-right">${totals.schools || 0}</th>
							<th class="text-right">${totals.participants || 0}</th>
						</tr>
					</tfoot>
				</table>
			</div>
		`;
	}

	function reset_filters() {
		$('#fs-from-date').val(month_start());
		$('#fs-to-date').val(frappe.datetime.get_today());
		$('#fs-section').val('');
		$('#fs-user').val('');
		load_report();
	}

	$('#fs-apply').on('click', load_report);
	$('#fs-reset').on('click', reset_filters);
	$('#fs-print').on('click', function() {
		window.print();
	});

	build_section_select('');
	build_user_select('');
	reset_filters();
};
