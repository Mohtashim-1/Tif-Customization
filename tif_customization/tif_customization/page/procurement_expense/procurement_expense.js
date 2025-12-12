frappe.pages['procurement-expense'].on_page_load = function(wrapper) {
	let page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Procurement Expense Report',
		single_column: true
	});
	
	// Initialize dashboard
	let procurement_expense = new window.ProcurementExpense(page);
	procurement_expense.make();
};

// Only declare class if it doesn't exist
if (typeof window.ProcurementExpense === 'undefined') {
	window.ProcurementExpense = class ProcurementExpense {
		constructor(page) {
			this.page = page;
			
			// Get first and last day of current month
			let today = frappe.datetime.get_today();
			let today_moment = moment(today);
			let first_day = today_moment.startOf('month').format('YYYY-MM-DD');
			let last_day = today_moment.endOf('month').format('YYYY-MM-DD');
			
			this.filters = {
				from_date: first_day,
				to_date: last_day,
				period_type: 'monthly', // monthly, quarterly, yearly
				cost_centers: []
			};
			this.data = {};
			this.charts = {};
		}
		
		make() {
			let me = this;
			
			// Build HTML structure
			let html = `
				<div class="procurement-expense-container" style="padding: 20px;">
					<!-- Filters Section -->
					<div class="filter-section" style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
						<h5 style="margin-bottom: 15px;">Filters</h5>
						<div class="row">
							<div class="col-md-3">
								<div class="form-group">
									<label>From Date</label>
									<input type="date" id="from-date" class="form-control" value="${me.filters.from_date}">
								</div>
							</div>
							<div class="col-md-3">
								<div class="form-group">
									<label>To Date</label>
									<input type="date" id="to-date" class="form-control" value="${me.filters.to_date}">
								</div>
							</div>
							<div class="col-md-3">
								<div class="form-group">
									<label>Period Type</label>
									<select id="period-type" class="form-control">
										<option value="monthly" selected>Monthly</option>
										<option value="quarterly">Quarterly</option>
										<option value="yearly">Yearly</option>
									</select>
								</div>
							</div>
							<div class="col-md-3">
								<div class="form-group">
									<label>Department / Cost Center</label>
									<input type="text" id="cost-center-filter" class="form-control" placeholder="All Departments">
								</div>
							</div>
						</div>
						<div class="row">
							<div class="col-md-12">
								<button class="btn btn-primary" id="apply-filters" style="margin-right: 10px;">
									<i class="fa fa-filter"></i> Apply Filters
								</button>
								<button class="btn btn-secondary" id="reset-filters">
									<i class="fa fa-refresh"></i> Reset
								</button>
								<button class="btn btn-success" id="export-excel" style="float: right;">
									<i class="fa fa-file-excel-o"></i> Export to Excel
								</button>
							</div>
						</div>
					</div>
					
					<!-- Summary KPIs -->
					<div class="row" id="kpi-section" style="margin-bottom: 20px;">
						<!-- Will be populated dynamically -->
					</div>
					
					<!-- Charts Section -->
					<div class="row" style="margin-bottom: 20px;">
						<div class="col-md-12">
							<div class="panel panel-default">
								<div class="panel-heading">
									<h5>Expense Trend by Period</h5>
								</div>
								<div class="panel-body">
									<div id="chart-expense-trend" style="height: 300px;"></div>
								</div>
							</div>
						</div>
					</div>
					
					<div class="row" style="margin-bottom: 20px;">
						<div class="col-md-6">
							<div class="panel panel-default">
								<div class="panel-heading">
									<h5>Expense by Department / Cost Center</h5>
								</div>
								<div class="panel-body">
									<div id="chart-cost-center" style="height: 300px;"></div>
								</div>
							</div>
						</div>
						<div class="col-md-6">
							<div class="panel panel-default">
								<div class="panel-heading">
									<h5>MR vs PO Expense</h5>
								</div>
								<div class="panel-body">
									<div id="chart-mr-vs-po" style="height: 300px;"></div>
								</div>
							</div>
						</div>
					</div>
					
					<!-- Summary Table -->
					<div class="data-section">
					<h5 style="margin-bottom: 15px;">Summary by Department / Cost Center</h5>
					<div class="table-responsive">
						<table class="table table-bordered table-striped" id="summary-table">
							<thead>
								<tr>
									<th>Department / Cost Center</th>
										<th>MR Amount</th>
										<th>MR Count</th>
										<th>PO Amount</th>
										<th>PO Count</th>
										<th>Total Amount</th>
									</tr>
								</thead>
								<tbody id="summary-tbody">
									<tr>
										<td colspan="6" class="text-center">Loading data...</td>
									</tr>
								</tbody>
							</table>
						</div>
					</div>
					
					<!-- Detailed Table -->
					<div class="data-section" style="margin-top: 20px;">
						<h5 style="margin-bottom: 15px;">Detailed Expense by Period</h5>
						<div class="table-responsive">
							<table class="table table-bordered table-striped" id="detail-table">
							<thead>
								<tr>
									<th>Period</th>
									<th>Department / Cost Center</th>
										<th>MR Amount</th>
										<th>MR Count</th>
										<th>PO Amount</th>
										<th>PO Count</th>
										<th>Total Amount</th>
									</tr>
								</thead>
								<tbody id="detail-tbody">
									<tr>
										<td colspan="7" class="text-center">Loading data...</td>
									</tr>
								</tbody>
							</table>
						</div>
					</div>
				</div>
			`;
			
			$(me.page.body).html(html);
			
			// Setup cost center multi-select
			setTimeout(() => {
				let costCenterField = $('#cost-center-filter');
				if (costCenterField.length && !costCenterField.data('setup')) {
					costCenterField.data('setup', true);
					try {
						let control = frappe.ui.form.make_control({
							parent: costCenterField.parent(),
							df: {
								fieldtype: 'MultiSelect',
								options: 'Cost Center',
								fieldname: 'cost_centers',
								placeholder: 'Select Cost Centers...'
							},
							render_input: true
						});
						
						if (control) {
							// MultiSelect control creates a wrapper
							if (control.$wrapper) {
								costCenterField.replaceWith(control.$wrapper);
								control.$wrapper.attr('id', 'cost-center-filter-wrapper');
							} else if (control.$input) {
								costCenterField.replaceWith(control.$input);
								control.$input.attr('id', 'cost-center-filter');
							}
							// Store control reference for later use
							costCenterField.closest('.form-group').data('frappe-control', control);
						}
					} catch(e) {
						console.error('Error setting up cost center filter:', e);
					}
				}
			}, 300);
			
			// Event handlers
			$('#apply-filters').on('click', function() {
				me.apply_filters();
			});
			
			$('#reset-filters').on('click', function() {
				me.reset_filters();
			});
			
			$('#export-excel').on('click', function() {
				me.export_to_excel();
			});
			
			// Load initial data
			setTimeout(() => {
				me.load_data();
			}, 500);
		}
		
		apply_filters() {
			let me = this;
			
			me.filters.from_date = $('#from-date').val();
			me.filters.to_date = $('#to-date').val();
			me.filters.period_type = $('#period-type').val();
			
			// Get cost centers
			let costCenterField = $('#cost-center-filter-wrapper, #cost-center-filter');
			if (costCenterField.length) {
				let control = costCenterField.closest('.form-group').data('frappe-control');
				if (control && typeof control.get_value === 'function') {
					me.filters.cost_centers = control.get_value() || [];
				} else {
					// Fallback: try to get value from input
					let value = costCenterField.val();
					me.filters.cost_centers = value ? (Array.isArray(value) ? value : [value]) : [];
				}
			} else {
				me.filters.cost_centers = [];
			}
			
			me.load_data();
		}
		
		reset_filters() {
			let me = this;
			
			// Get first and last day of current month
			let today = frappe.datetime.get_today();
			let today_moment = moment(today);
			let first_day = today_moment.startOf('month').format('YYYY-MM-DD');
			let last_day = today_moment.endOf('month').format('YYYY-MM-DD');
			
			me.filters = {
				from_date: first_day,
				to_date: last_day,
				period_type: 'monthly',
				cost_centers: []
			};
			
			$('#from-date').val(me.filters.from_date);
			$('#to-date').val(me.filters.to_date);
			$('#period-type').val(me.filters.period_type);
			
			// Reset cost center filter
			let costCenterField = $('#cost-center-filter-wrapper, #cost-center-filter');
			let control = costCenterField.closest('.form-group').data('frappe-control');
			if (control && typeof control.set_value === 'function') {
				control.set_value([]);
			} else if (costCenterField.length) {
				costCenterField.val('').trigger('change');
			}
			
			me.load_data();
		}
		
		load_data() {
			let me = this;
			
			$('#summary-tbody').html('<tr><td colspan="6" class="text-center">Loading data...</td></tr>');
			$('#detail-tbody').html('<tr><td colspan="7" class="text-center">Loading data...</td></tr>');
			
			frappe.call({
				method: 'tif_customization.tif_customization.page.procurement_expense.procurement_expense.get_procurement_expense_data',
				args: {
					filters: me.filters
				},
				callback: function(r) {
					if (r.exc) {
						console.error('Error loading procurement expense data:', r.exc);
						$('#summary-tbody').html(`<tr><td colspan="6" class="text-center text-danger">Error loading data. Please check console for details.</td></tr>`);
						$('#detail-tbody').html(`<tr><td colspan="7" class="text-center text-danger">Error loading data. Please check console for details.</td></tr>`);
						return;
					}
					
					if (r.message && !r.message.error) {
						me.data = r.message;
						me.render_kpis();
						me.render_summary_table();
						me.render_detail_table();
						me.render_charts();
					} else {
						let errorMsg = r.message?.error || r.message || 'Unknown error';
						console.error('Procurement expense error:', errorMsg);
						$('#summary-tbody').html(`<tr><td colspan="6" class="text-center text-danger">Error: ${errorMsg}</td></tr>`);
						$('#detail-tbody').html(`<tr><td colspan="7" class="text-center text-danger">Error: ${errorMsg}</td></tr>`);
					}
				},
				error: function(r) {
					console.error('API call failed:', r);
					$('#summary-tbody').html(`<tr><td colspan="6" class="text-center text-danger">Failed to load data. Please refresh and try again.</td></tr>`);
					$('#detail-tbody').html(`<tr><td colspan="7" class="text-center text-danger">Failed to load data. Please refresh and try again.</td></tr>`);
				}
			});
		}
		
		render_kpis() {
			let me = this;
			let summary = me.data.summary_data || [];
			
			let total_mr = summary.reduce((sum, row) => sum + (row.mr_amount || 0), 0);
			let total_po = summary.reduce((sum, row) => sum + (row.po_amount || 0), 0);
			let total_amount = summary.reduce((sum, row) => sum + (row.total_amount || 0), 0);
			let total_mr_count = summary.reduce((sum, row) => sum + (row.mr_count || 0), 0);
			let total_po_count = summary.reduce((sum, row) => sum + (row.po_count || 0), 0);
			
			let kpi_html = `
				<div class="col-md-3">
					<div class="kpi-card" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
						<h5 style="margin: 0 0 10px 0; font-size: 14px; opacity: 0.9;">Total MR Expense</h5>
						<h2 style="margin: 0; font-size: 28px; font-weight: bold;">${format_currency_value(total_mr)}</h2>
						<p style="margin: 5px 0 0 0; font-size: 12px; opacity: 0.8;">${total_mr_count} Material Requests</p>
					</div>
				</div>
				<div class="col-md-3">
					<div class="kpi-card" style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
						<h5 style="margin: 0 0 10px 0; font-size: 14px; opacity: 0.9;">Total PO Expense</h5>
						<h2 style="margin: 0; font-size: 28px; font-weight: bold;">${format_currency_value(total_po)}</h2>
						<p style="margin: 5px 0 0 0; font-size: 12px; opacity: 0.8;">${total_po_count} Purchase Orders</p>
					</div>
				</div>
				<div class="col-md-3">
					<div class="kpi-card" style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); color: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
						<h5 style="margin: 0 0 10px 0; font-size: 14px; opacity: 0.9;">Total Procurement Expense</h5>
						<h2 style="margin: 0; font-size: 28px; font-weight: bold;">${format_currency_value(total_amount)}</h2>
						<p style="margin: 5px 0 0 0; font-size: 12px; opacity: 0.8;">Combined Total</p>
					</div>
				</div>
				<div class="col-md-3">
					<div class="kpi-card" style="background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%); color: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
						<h5 style="margin: 0 0 10px 0; font-size: 14px; opacity: 0.9;">Total Documents</h5>
						<h2 style="margin: 0; font-size: 28px; font-weight: bold;">${total_mr_count + total_po_count}</h2>
						<p style="margin: 5px 0 0 0; font-size: 12px; opacity: 0.8;">MR + PO Count</p>
					</div>
				</div>
			`;
			
			$('#kpi-section').html(kpi_html);
		}
		
		render_summary_table() {
			let me = this;
			let summary = me.data.summary_data || [];
			let tbody = $('#summary-tbody');
			tbody.empty();
			
			if (summary.length === 0) {
				tbody.append('<tr><td colspan="6" class="text-center">No data found</td></tr>');
			} else {
				summary.forEach(row => {
					let tr = $(`
						<tr>
							<td>${row.cost_center_name || row.cost_center || '-'}</td>
							<td class="text-right">${format_currency_value(row.mr_amount || 0)}</td>
							<td class="text-right">${format_number_value(row.mr_count || 0)}</td>
							<td class="text-right">${format_currency_value(row.po_amount || 0)}</td>
							<td class="text-right">${format_number_value(row.po_count || 0)}</td>
							<td class="text-right"><strong>${format_currency_value(row.total_amount || 0)}</strong></td>
						</tr>
					`);
					tbody.append(tr);
				});
			}
		}
		
		render_detail_table() {
			let me = this;
			let expense_data = me.data.expense_data || [];
			let tbody = $('#detail-tbody');
			tbody.empty();
			
			if (expense_data.length === 0) {
				tbody.append('<tr><td colspan="7" class="text-center">No data found</td></tr>');
			} else {
				expense_data.forEach(row => {
					let tr = $(`
						<tr>
							<td>${row.period || '-'}</td>
							<td>${row.cost_center_name || row.cost_center || '-'}</td>
							<td class="text-right">${format_currency_value(row.mr_amount || 0)}</td>
							<td class="text-right">${format_number_value(row.mr_count || 0)}</td>
							<td class="text-right">${format_currency_value(row.po_amount || 0)}</td>
							<td class="text-right">${format_number_value(row.po_count || 0)}</td>
							<td class="text-right"><strong>${format_currency_value(row.total_amount || 0)}</strong></td>
						</tr>
					`);
					tbody.append(tr);
				});
			}
		}
		
		render_charts() {
			let me = this;
			let expense_data = me.data.expense_data || [];
			
			// Expense Trend Chart
			if (expense_data.length > 0) {
				// Group by period
				let period_data = {};
				expense_data.forEach(row => {
					if (!period_data[row.period]) {
						period_data[row.period] = {
							period: row.period,
							mr_amount: 0,
							po_amount: 0,
							total_amount: 0
						};
					}
					period_data[row.period].mr_amount += row.mr_amount || 0;
					period_data[row.period].po_amount += row.po_amount || 0;
					period_data[row.period].total_amount += row.total_amount || 0;
				});
				
				let periods = Object.keys(period_data).sort();
				let chart_data = {
					labels: periods,
					datasets: [
						{
							name: 'MR Amount',
							values: periods.map(p => period_data[p].mr_amount)
						},
						{
							name: 'PO Amount',
							values: periods.map(p => period_data[p].po_amount)
						},
						{
							name: 'Total',
							values: periods.map(p => period_data[p].total_amount)
						}
					]
				};
				
				if (me.charts.expense_trend) {
					try {
						me.charts.expense_trend.destroy();
					} catch(e) {}
				}
				
				try {
					me.charts.expense_trend = new frappe.Chart('#chart-expense-trend', {
						title: '',
						data: chart_data,
						type: 'line',
						colors: ['#667eea', '#f5576c', '#43e97b'],
						height: 300
					});
				} catch(e) {
					console.error('Error creating trend chart:', e);
				}
			}
			
			// Cost Center Chart
			let summary = me.data.summary_data || [];
			if (summary.length > 0) {
				let chart_data = {
					labels: summary.slice(0, 10).map(s => s.cost_center_name || s.cost_center),
					datasets: [{
						name: 'Total Expense',
						values: summary.slice(0, 10).map(s => s.total_amount || 0)
					}]
				};
				
				if (me.charts.cost_center) {
					try {
						me.charts.cost_center.destroy();
					} catch(e) {}
				}
				
				try {
					me.charts.cost_center = new frappe.Chart('#chart-cost-center', {
						title: '',
						data: chart_data,
						type: 'bar',
						colors: ['#667eea'],
						height: 300
					});
				} catch(e) {
					console.error('Error creating cost center chart:', e);
				}
			}
			
			// MR vs PO Chart
			let total_mr = summary.reduce((sum, row) => sum + (row.mr_amount || 0), 0);
			let total_po = summary.reduce((sum, row) => sum + (row.po_amount || 0), 0);
			
			if (total_mr > 0 || total_po > 0) {
				let chart_data = {
					labels: ['MR Expense', 'PO Expense'],
					datasets: [{
						name: 'Expense',
						values: [total_mr, total_po]
					}]
				};
				
				if (me.charts.mr_vs_po) {
					try {
						me.charts.mr_vs_po.destroy();
					} catch(e) {}
				}
				
				try {
					me.charts.mr_vs_po = new frappe.Chart('#chart-mr-vs-po', {
						title: '',
						data: chart_data,
						type: 'pie',
						height: 300
					});
				} catch(e) {
					console.error('Error creating MR vs PO chart:', e);
				}
			}
		}
		
		export_to_excel() {
			let me = this;
			let summary = me.data.summary_data || [];
			let expense_data = me.data.expense_data || [];
			
			let csv = [];
			csv.push('Procurement Expense Report');
			csv.push(`Period: ${me.filters.from_date} to ${me.filters.to_date}`);
			csv.push(`Period Type: ${me.filters.period_type}`);
			csv.push('');
			csv.push('Summary by Cost Center');
			csv.push('Cost Center,MR Amount,MR Count,PO Amount,PO Count,Total Amount');
			
			summary.forEach(row => {
				csv.push([
					row.cost_center_name || row.cost_center || '',
					row.mr_amount || 0,
					row.mr_count || 0,
					row.po_amount || 0,
					row.po_count || 0,
					row.total_amount || 0
				].join(','));
			});
			
			csv.push('');
			csv.push('Detailed Expense by Period');
			csv.push('Period,Cost Center,MR Amount,MR Count,PO Amount,PO Count,Total Amount');
			
			expense_data.forEach(row => {
				csv.push([
					row.period || '',
					row.cost_center_name || row.cost_center || '',
					row.mr_amount || 0,
					row.mr_count || 0,
					row.po_amount || 0,
					row.po_count || 0,
					row.total_amount || 0
				].join(','));
			});
			
			let blob = new Blob([csv.join('\n')], { type: 'text/csv' });
			let url = window.URL.createObjectURL(blob);
			let a = document.createElement('a');
			a.href = url;
			a.download = `procurement_expense_${me.filters.from_date}_to_${me.filters.to_date}.csv`;
			a.click();
			window.URL.revokeObjectURL(url);
		}
	};
}

// Helper functions
function format_currency_value(value) {
	if (value === null || value === undefined || value === '') {
		return '0.00';
	}
	var currency = frappe.boot.sysdefaults.currency || 'PKR';
	var precision = cint(frappe.boot.sysdefaults.currency_precision || 2);
	value = flt(value);
	return format_currency(value, currency, precision);
}

function format_number_value(value) {
	if (value === null || value === undefined || value === '') {
		return '0';
	}
	return cint(value).toLocaleString();
}
