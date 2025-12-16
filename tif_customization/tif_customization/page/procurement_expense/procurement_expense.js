frappe.pages['procurement-expense'].on_page_load = function(wrapper) {
	let page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Procurement Expense Report',
		single_column: true
	});
	
	// Load Chart.js library
	frappe.require('https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js', () => {
		// Initialize dashboard after Chart.js is loaded
		let procurement_expense = new window.ProcurementExpense(page);
		procurement_expense.make();
	});
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
									<canvas id="chart-expense-trend" style="height: 300px;"></canvas>
								</div>
							</div>
						</div>
					</div>
					
					<div class="row" style="margin-bottom: 20px;">
						<div class="col-md-6">
							<div class="panel panel-default">
								<div class="panel-heading">
									<h5>Cumulative Expense Trend</h5>
								</div>
								<div class="panel-body">
									<canvas id="chart-cumulative" style="height: 300px;"></canvas>
								</div>
							</div>
						</div>
						<div class="col-md-6">
							<div class="panel panel-default">
								<div class="panel-heading">
									<h5>Top 10 Expense Accounts</h5>
								</div>
								<div class="panel-body">
									<canvas id="chart-top-accounts" style="height: 300px;"></canvas>
								</div>
							</div>
						</div>
					</div>
					
					<div class="row" style="margin-bottom: 20px;">
						<div class="col-md-4">
							<div class="panel panel-default">
								<div class="panel-heading">
									<h5>Expense by Cost Center</h5>
								</div>
								<div class="panel-body">
									<canvas id="chart-cost-center" style="height: 300px;"></canvas>
								</div>
							</div>
						</div>
						<div class="col-md-4">
							<div class="panel panel-default">
								<div class="panel-heading">
									<h5>Expense by Department</h5>
								</div>
								<div class="panel-body">
									<canvas id="chart-department" style="height: 300px;"></canvas>
								</div>
							</div>
						</div>
						<div class="col-md-4">
							<div class="panel panel-default">
								<div class="panel-heading">
									<h5>Expense by Account</h5>
								</div>
								<div class="panel-body">
									<canvas id="chart-item" style="height: 300px;"></canvas>
								</div>
							</div>
						</div>
					</div>
					
					<div class="row" style="margin-bottom: 20px;">
						<div class="col-md-6">
							<div class="panel panel-default">
								<div class="panel-heading">
									<h5>Monthly Comparison</h5>
								</div>
								<div class="panel-body">
									<canvas id="chart-monthly-comparison" style="height: 300px;"></canvas>
								</div>
							</div>
						</div>
						<div class="col-md-6">
							<div class="panel panel-default">
								<div class="panel-heading">
									<h5>Expense Distribution</h5>
								</div>
								<div class="panel-body">
									<canvas id="chart-distribution" style="height: 300px;"></canvas>
								</div>
							</div>
						</div>
					</div>
					
					<div class="row" style="margin-bottom: 20px;">
						<div class="col-md-12">
							<div class="panel panel-default">
								<div class="panel-heading">
									<h5>Expense vs Transaction Count</h5>
								</div>
								<div class="panel-body">
									<canvas id="chart-expense-vs-count" style="height: 300px;"></canvas>
								</div>
							</div>
						</div>
					</div>
					
					<!-- Summary Pie Chart -->
					<div class="row" style="margin-bottom: 20px;">
						<div class="col-md-12">
							<div class="panel panel-default">
								<div class="panel-heading">
									<h5>Summary by Department / Cost Center (Pie Chart)</h5>
								</div>
								<div class="panel-body">
									<canvas id="chart-summary-pie" style="height: 400px;"></canvas>
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
									<th>PO Amount</th>
									<th>PO Count</th>
								</tr>
							</thead>
							<tbody id="summary-tbody">
								<tr>
									<td colspan="3" class="text-center">Loading data...</td>
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
									<th>PO Amount</th>
									<th>PO Count</th>
								</tr>
							</thead>
							<tbody id="detail-tbody">
								<tr>
									<td colspan="4" class="text-center">Loading data...</td>
								</tr>
							</tbody>
						</table>
						</div>
					</div>
					
					<!-- Payment Entry Charts -->
					<div class="row" style="margin-bottom: 20px;">
						<div class="col-md-6">
							<div class="panel panel-default">
								<div class="panel-heading">
									<h5>Mode of Payment Distribution (Pie Chart)</h5>
								</div>
								<div class="panel-body">
									<canvas id="chart-payment-pie" style="height: 350px;"></canvas>
								</div>
							</div>
						</div>
						<div class="col-md-6">
							<div class="panel panel-default">
								<div class="panel-heading">
									<h5>Mode of Payment Comparison (Bar Chart)</h5>
								</div>
								<div class="panel-body">
									<canvas id="chart-payment-bar" style="height: 350px;"></canvas>
								</div>
							</div>
						</div>
					</div>
					
					<div class="row" style="margin-bottom: 20px;">
						<div class="col-md-6">
							<div class="panel panel-default">
								<div class="panel-heading">
									<h5>Cash vs Other Payment Modes (Doughnut Chart)</h5>
								</div>
								<div class="panel-body">
									<canvas id="chart-payment-doughnut" style="height: 350px;"></canvas>
								</div>
							</div>
						</div>
						<div class="col-md-6">
							<div class="panel panel-default">
								<div class="panel-heading">
									<h5>Payment Count by Mode (Horizontal Bar)</h5>
								</div>
								<div class="panel-body">
									<canvas id="chart-payment-count" style="height: 350px;"></canvas>
								</div>
							</div>
						</div>
					</div>
					
					<!-- Item Payment Charts -->
					<div class="row" style="margin-bottom: 20px;">
						<div class="col-md-12">
							<div class="panel panel-default">
								<div class="panel-heading">
									<h5>Items Paid via Cash (Top Items)</h5>
								</div>
								<div class="panel-body">
									<canvas id="chart-items-cash" style="height: 400px;"></canvas>
								</div>
							</div>
						</div>
					</div>
					
					<div class="row" style="margin-bottom: 20px;">
						<div class="col-md-6">
							<div class="panel panel-default">
								<div class="panel-heading">
									<h5>Items Paid via Cash (Pie Chart)</h5>
								</div>
								<div class="panel-body">
									<canvas id="chart-items-cash-pie" style="height: 350px;"></canvas>
								</div>
							</div>
						</div>
						<div class="col-md-6">
							<div class="panel panel-default">
								<div class="panel-heading">
									<h5>Items Paid via Cheque (Pie Chart)</h5>
								</div>
								<div class="panel-body">
									<canvas id="chart-items-cheque-pie" style="height: 350px;"></canvas>
								</div>
							</div>
						</div>
					</div>
					
					<div class="row" style="margin-bottom: 20px;">
						<div class="col-md-12">
							<div class="panel panel-default">
								<div class="panel-heading">
									<h5>Items Paid via Cheque (Top Items)</h5>
								</div>
								<div class="panel-body">
									<canvas id="chart-items-cheque" style="height: 400px;"></canvas>
								</div>
							</div>
						</div>
					</div>
					
					<!-- Payment Entry Details Table -->
					<div class="data-section" style="margin-top: 20px;">
						<h5 style="margin-bottom: 15px;">Payment Entry Details for Purchase Invoices - Mode of Payment Breakdown</h5>
						<div class="table-responsive">
							<table class="table table-bordered table-striped" id="payment-table">
							<thead>
								<tr>
									<th>S.#</th>
									<th>Mode of Payment</th>
									<th>Payment Type</th>
									<th>Cash Amount</th>
									<th>Other Amount</th>
									<th>Total Amount</th>
									<th>Payment Count</th>
									<th>Invoice Count</th>
								</tr>
							</thead>
							<tbody id="payment-tbody">
								<tr>
									<td colspan="8" class="text-center">Loading data...</td>
								</tr>
							</tbody>
							<tfoot id="payment-tfoot">
								<tr>
									<td colspan="3"><strong>Total</strong></td>
									<td class="text-right"><strong id="payment-cash-total">0.00</strong></td>
									<td class="text-right"><strong id="payment-other-total">0.00</strong></td>
									<td class="text-right"><strong id="payment-total-amount">0.00</strong></td>
									<td class="text-right"><strong id="payment-count-total">0</strong></td>
									<td class="text-right"><strong id="payment-invoice-count-total">0</strong></td>
								</tr>
							</tfoot>
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
					me.render_payment_table();
					me.render_charts();
					me.render_payment_charts();
					me.render_item_payment_charts();
					} else {
						let errorMsg = r.message?.error || r.message || 'Unknown error';
						console.error('Procurement expense error:', errorMsg);
						$('#summary-tbody').html(`<tr><td colspan="6" class="text-center text-danger">Error: ${errorMsg}</td></tr>`);
						$('#detail-tbody').html(`<tr><td colspan="7" class="text-center text-danger">Error: ${errorMsg}</td></tr>`);
					}
				},
				error: function(r) {
					console.error('API call failed:', r);
					$('#summary-tbody').html(`<tr><td colspan="3" class="text-center text-danger">Failed to load data. Please refresh and try again.</td></tr>`);
					$('#detail-tbody').html(`<tr><td colspan="4" class="text-center text-danger">Failed to load data. Please refresh and try again.</td></tr>`);
				}
			});
		}
		
		render_kpis() {
			let me = this;
			let summary = me.data.summary_data || [];
			let payment_data = me.data.payment_data || [];
			
			let total_po = summary.reduce((sum, row) => sum + (row.po_amount || 0), 0);
			let total_po_count = summary.reduce((sum, row) => sum + (row.po_count || 0), 0);
			
			// Calculate payment totals
			let total_cash = payment_data.reduce((sum, row) => sum + (row.cash_amount || 0), 0);
			let total_other = payment_data.reduce((sum, row) => sum + (row.other_amount || 0), 0);
			let total_payment = payment_data.reduce((sum, row) => sum + (row.total_amount || 0), 0);
			let total_payment_count = payment_data.reduce((sum, row) => sum + (row.payment_count || 0), 0);
			let total_invoice_count = payment_data.reduce((sum, row) => sum + (row.invoice_count || 0), 0);
			
			let kpi_html = `
				<div class="col-md-3">
					<div class="kpi-card" style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
						<h5 style="margin: 0 0 10px 0; font-size: 14px; opacity: 0.9;">Total PO Expense</h5>
						<h2 style="margin: 0; font-size: 28px; font-weight: bold;">${format_currency_value(total_po)}</h2>
						<p style="margin: 5px 0 0 0; font-size: 12px; opacity: 0.8;">${total_po_count} Purchase Orders</p>
					</div>
				</div>
				<div class="col-md-3">
					<div class="kpi-card" style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); color: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
						<h5 style="margin: 0 0 10px 0; font-size: 14px; opacity: 0.9;">Total Payments</h5>
						<h2 style="margin: 0; font-size: 28px; font-weight: bold;">${format_currency_value(total_payment)}</h2>
						<p style="margin: 5px 0 0 0; font-size: 12px; opacity: 0.8;">${total_payment_count} Payments, ${total_invoice_count} Invoices</p>
					</div>
				</div>
				<div class="col-md-3">
					<div class="kpi-card" style="background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%); color: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
						<h5 style="margin: 0 0 10px 0; font-size: 14px; opacity: 0.9;">Cash Payments</h5>
						<h2 style="margin: 0; font-size: 28px; font-weight: bold;">${format_currency_value(total_cash)}</h2>
						<p style="margin: 5px 0 0 0; font-size: 12px; opacity: 0.8;">${((total_cash / total_payment) * 100).toFixed(1) || 0}% of Total</p>
					</div>
				</div>
				<div class="col-md-3">
					<div class="kpi-card" style="background: linear-gradient(135deg, #fa709a 0%, #fee140 100%); color: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
						<h5 style="margin: 0 0 10px 0; font-size: 14px; opacity: 0.9;">Other Payments</h5>
						<h2 style="margin: 0; font-size: 28px; font-weight: bold;">${format_currency_value(total_other)}</h2>
						<p style="margin: 5px 0 0 0; font-size: 12px; opacity: 0.8;">${((total_other / total_payment) * 100).toFixed(1) || 0}% of Total</p>
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
				tbody.append('<tr><td colspan="3" class="text-center">No data found</td></tr>');
			} else {
				summary.forEach(row => {
					let tr = $(`
						<tr>
							<td>${row.cost_center_name || row.cost_center || '-'}</td>
							<td class="text-right">${format_currency_value(row.po_amount || 0)}</td>
							<td class="text-right">${format_number_value(row.po_count || 0)}</td>
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
				tbody.append('<tr><td colspan="4" class="text-center">No data found</td></tr>');
			} else {
				expense_data.forEach(row => {
					let tr = $(`
						<tr>
							<td>${row.period || '-'}</td>
							<td>${row.cost_center_name || row.cost_center || '-'}</td>
							<td class="text-right">${format_currency_value(row.po_amount || 0)}</td>
							<td class="text-right">${format_number_value(row.po_count || 0)}</td>
						</tr>
					`);
					tbody.append(tr);
				});
			}
		}
		
		render_payment_table() {
			let me = this;
			let payment_data = me.data.payment_data || [];
			let tbody = $('#payment-tbody');
			tbody.empty();
			
			if (payment_data.length === 0) {
				tbody.append('<tr><td colspan="8" class="text-center">No payment entry data found for Purchase Invoices</td></tr>');
				$('#payment-cash-total').text('0.00');
				$('#payment-other-total').text('0.00');
				$('#payment-total-amount').text('0.00');
				$('#payment-count-total').text('0');
				$('#payment-invoice-count-total').text('0');
			} else {
				let s_no = 1;
				let totals = {
					cash: 0,
					other: 0,
					total: 0,
					count: 0,
					invoice_count: 0
				};
				
				payment_data.forEach(row => {
					let cash_amt = flt(row.cash_amount || 0);
					let other_amt = flt(row.other_amount || 0);
					let total_amt = flt(row.total_amount || 0);
					let payment_count = cint(row.payment_count || 0);
					let invoice_count = cint(row.invoice_count || 0);
					
					totals.cash += cash_amt;
					totals.other += other_amt;
					totals.total += total_amt;
					totals.count += payment_count;
					totals.invoice_count += invoice_count;
					
					let tr = $(`
						<tr>
							<td>${s_no}</td>
							<td><strong>${row.mode_of_payment || 'Not Specified'}</strong></td>
							<td>${row.payment_type || '-'}</td>
							<td class="text-right">${format_currency_value(cash_amt)}</td>
							<td class="text-right">${format_currency_value(other_amt)}</td>
							<td class="text-right"><strong>${format_currency_value(total_amt)}</strong></td>
							<td class="text-right">${format_number_value(payment_count)}</td>
							<td class="text-right">${format_number_value(invoice_count)}</td>
						</tr>
					`);
					tbody.append(tr);
					s_no++;
				});
				
				// Update totals
				$('#payment-cash-total').text(format_currency_value(totals.cash));
				$('#payment-other-total').text(format_currency_value(totals.other));
				$('#payment-total-amount').text(format_currency_value(totals.total));
				$('#payment-count-total').text(format_number_value(totals.count));
				$('#payment-invoice-count-total').text(format_number_value(totals.invoice_count));
			}
		}
		
		render_charts() {
			let me = this;
			let expense_data = me.data.expense_data || [];
			let item_data = me.data.item_data || [];
			let summary = me.data.summary_data || [];
			let dept_data = me.data.department_data || [];
			
			// Wait for Chart.js to be available
			if (typeof Chart === 'undefined') {
				setTimeout(() => me.render_charts(), 200);
				return;
			}
			
			// Expense Trend Chart with animations
			if (expense_data.length > 0) {
				// Group by period
				let period_data = {};
				expense_data.forEach(row => {
					if (!period_data[row.period]) {
						period_data[row.period] = {
							period: row.period,
							po_amount: 0
						};
					}
					period_data[row.period].po_amount += row.po_amount || 0;
				});
				
				let periods = Object.keys(period_data).sort();
				let amounts = periods.map(p => period_data[p].po_amount);
				
				if (me.charts.expense_trend) {
					try {
						me.charts.expense_trend.destroy();
					} catch(e) {}
				}
				
				setTimeout(() => {
					try {
						let canvas = document.getElementById('chart-expense-trend');
						if (canvas) {
							let ctx = canvas.getContext('2d');
							me.charts.expense_trend = new Chart(ctx, {
								type: 'line',
								data: {
									labels: periods,
									datasets: [{
										label: 'Expense Amount',
										data: amounts,
										borderColor: '#f5576c',
										backgroundColor: 'rgba(245, 87, 108, 0.1)',
										borderWidth: 3,
										fill: true,
										tension: 0.4,
										pointRadius: 5,
										pointHoverRadius: 8,
										pointBackgroundColor: '#f5576c',
										pointBorderColor: '#fff',
										pointBorderWidth: 2
									}]
								},
								options: {
									responsive: true,
									maintainAspectRatio: false,
									animation: {
										duration: 2000,
										easing: 'easeInOutQuart',
										delay: (context) => {
											let delay = 0;
											if (context.type === 'data' && context.mode === 'default') {
												delay = context.dataIndex * 100;
											}
											return delay;
										}
									},
									plugins: {
										legend: {
											display: true,
											position: 'top',
											labels: {
												font: {
													size: 12,
													weight: 'bold'
												},
												padding: 15
											}
										},
										tooltip: {
											backgroundColor: 'rgba(0, 0, 0, 0.8)',
											padding: 12,
											titleFont: {
												size: 14,
												weight: 'bold'
											},
											bodyFont: {
												size: 13
											},
											callbacks: {
												label: function(context) {
													return format_currency_value(context.parsed.y);
												}
											}
										}
									},
									scales: {
										y: {
											beginAtZero: true,
											grid: {
												color: 'rgba(0, 0, 0, 0.05)',
												lineWidth: 1
											},
											ticks: {
												callback: function(value) {
													return format_currency_value(value);
												},
												font: {
													size: 11
												}
											}
										},
										x: {
											grid: {
												display: false
											},
											ticks: {
												font: {
													size: 11
												}
											}
										}
									}
								}
							});
						}
					} catch(e) {
						console.error('Error creating trend chart:', e);
					}
				}, 100);
			}
			
			// Cost Center Chart with animations
			if (summary.length > 0) {
				let topSummary = summary.slice(0, 10);
				let labels = topSummary.map(s => (s.cost_center_name || s.cost_center).substring(0, 20));
				let values = topSummary.map(s => s.po_amount || 0);
				
				if (me.charts.cost_center) {
					try {
						me.charts.cost_center.destroy();
					} catch(e) {}
				}
				
				setTimeout(() => {
					try {
						let canvas = document.getElementById('chart-cost-center');
						if (canvas) {
							let ctx = canvas.getContext('2d');
							me.charts.cost_center = new Chart(ctx, {
								type: 'bar',
								data: {
									labels: labels,
									datasets: [{
										label: 'Expense Amount',
										data: values,
										backgroundColor: 'rgba(102, 126, 234, 0.8)',
										borderColor: '#667eea',
										borderWidth: 2,
										borderRadius: 8,
										borderSkipped: false
									}]
								},
								options: {
									responsive: true,
									maintainAspectRatio: false,
									indexAxis: 'y',
									animation: {
										duration: 2000,
										easing: 'easeInOutBounce',
										delay: (context) => {
											let delay = 0;
											if (context.type === 'data' && context.mode === 'default') {
												delay = context.dataIndex * 150;
											}
											return delay;
										}
									},
									plugins: {
										legend: {
											display: true,
											position: 'top',
											labels: {
												font: {
													size: 12,
													weight: 'bold'
												},
												padding: 15
											}
										},
										tooltip: {
											backgroundColor: 'rgba(0, 0, 0, 0.8)',
											padding: 12,
											titleFont: {
												size: 14,
												weight: 'bold'
											},
											bodyFont: {
												size: 13
											},
											callbacks: {
												label: function(context) {
													return format_currency_value(context.parsed.x);
												}
											}
										}
									},
									scales: {
										x: {
											beginAtZero: true,
											grid: {
												color: 'rgba(0, 0, 0, 0.05)',
												lineWidth: 1
											},
											ticks: {
												callback: function(value) {
													return format_currency_value(value);
												},
												font: {
													size: 11
												}
											}
										},
										y: {
											grid: {
												display: false
											},
											ticks: {
												font: {
													size: 10
												}
											}
										}
									}
								}
							});
						}
					} catch(e) {
						console.error('Error creating cost center chart:', e);
					}
				}, 300);
			}
			
			// Summary Pie Chart by Department/Cost Center
			if (summary.length > 0) {
				let labels = summary.map(s => (s.cost_center_name || s.cost_center).substring(0, 30));
				let values = summary.map(s => s.po_amount || 0);
				
				if (me.charts.summary_pie) {
					try {
						me.charts.summary_pie.destroy();
					} catch(e) {}
				}
				
				setTimeout(() => {
					try {
						let canvas = document.getElementById('chart-summary-pie');
						if (canvas) {
							let ctx = canvas.getContext('2d');
							me.charts.summary_pie = new Chart(ctx, {
								type: 'pie',
								data: {
									labels: labels,
									datasets: [{
										label: 'PO Amount',
										data: values,
										backgroundColor: [
											'rgba(245, 87, 108, 0.8)', 'rgba(102, 126, 234, 0.8)', 'rgba(67, 233, 123, 0.8)',
											'rgba(255, 193, 7, 0.8)', 'rgba(156, 39, 176, 0.8)', 'rgba(233, 30, 99, 0.8)',
											'rgba(0, 188, 212, 0.8)', 'rgba(255, 152, 0, 0.8)', 'rgba(76, 175, 80, 0.8)',
											'rgba(63, 81, 181, 0.8)', 'rgba(121, 85, 72, 0.8)', 'rgba(158, 158, 158, 0.8)',
											'rgba(255, 87, 34, 0.8)', 'rgba(0, 150, 136, 0.8)', 'rgba(103, 58, 183, 0.8)'
										],
										borderColor: [
											'#f5576c', '#667eea', '#43e97b', '#ffc107', '#9c27b0',
											'#e91e63', '#00bcd4', '#ff9800', '#4caf50', '#3f51b5',
											'#795548', '#9e9e9e', '#ff5722', '#009688', '#673ab7'
										],
										borderWidth: 3,
										hoverOffset: 15
									}]
								},
								options: {
									responsive: true,
									maintainAspectRatio: false,
									animation: {
										animateRotate: true,
										animateScale: true,
										duration: 2000,
										easing: 'easeInOutQuart',
										delay: (context) => {
											let delay = 0;
											if (context.type === 'data' && context.mode === 'default') {
												delay = context.dataIndex * 100;
											}
											return delay;
										}
									},
									plugins: {
										legend: {
											display: true,
											position: 'right',
											labels: {
												font: { size: 11 },
												padding: 10,
												usePointStyle: true,
												boxWidth: 12,
												generateLabels: function(chart) {
													const data = chart.data;
													if (data.labels.length && data.datasets.length) {
														const dataset = data.datasets[0];
														const total = dataset.data.reduce((a, b) => a + b, 0);
														return data.labels.map((label, i) => {
															const value = dataset.data[i];
															const percentage = ((value / total) * 100).toFixed(1);
															return {
																text: `${label} (${percentage}%)`,
																fillStyle: dataset.backgroundColor[i],
																strokeStyle: dataset.borderColor[i],
																lineWidth: dataset.borderWidth,
																hidden: false,
																index: i
															};
														});
													}
													return [];
												}
											}
										},
										tooltip: {
											backgroundColor: 'rgba(0, 0, 0, 0.8)',
											padding: 12,
											titleFont: { size: 14, weight: 'bold' },
											bodyFont: { size: 13 },
											callbacks: {
												label: function(context) {
													let label = context.label || '';
													let value = format_currency_value(context.parsed);
													let total = context.dataset.data.reduce((a, b) => a + b, 0);
													let percentage = ((context.parsed / total) * 100).toFixed(1);
													let poCount = summary[context.dataIndex]?.po_count || 0;
													return [
														`${label}: ${value}`,
														`Percentage: ${percentage}%`,
														`PO Count: ${format_number_value(poCount)}`
													];
												}
											}
										}
									}
								}
							});
						}
					} catch(e) {
						console.error('Error creating summary pie chart:', e);
					}
				}, 400);
			}
			
			// Department Chart with animations
			if (dept_data.length > 0) {
				let topDept = dept_data.slice(0, 10);
				let labels = topDept.map(d => (d.department_name || d.department).substring(0, 20));
				let values = topDept.map(d => d.po_amount || 0);
				
				if (me.charts.department) {
					try {
						me.charts.department.destroy();
					} catch(e) {}
				}
				
				setTimeout(() => {
					try {
						let ctx = document.getElementById('chart-department');
						if (ctx) {
							me.charts.department = new Chart(ctx, {
								type: 'doughnut',
								data: {
									labels: labels,
									datasets: [{
										label: 'Expense Amount',
										data: values,
										backgroundColor: [
											'rgba(245, 87, 108, 0.8)',
											'rgba(102, 126, 234, 0.8)',
											'rgba(67, 233, 123, 0.8)',
											'rgba(255, 193, 7, 0.8)',
											'rgba(156, 39, 176, 0.8)',
											'rgba(233, 30, 99, 0.8)',
											'rgba(0, 188, 212, 0.8)',
											'rgba(255, 152, 0, 0.8)',
											'rgba(76, 175, 80, 0.8)',
											'rgba(63, 81, 181, 0.8)'
										],
										borderColor: [
											'#f5576c',
											'#667eea',
											'#43e97b',
											'#ffc107',
											'#9c27b0',
											'#e91e63',
											'#00bcd4',
											'#ff9800',
											'#4caf50',
											'#3f51b5'
										],
										borderWidth: 3,
										hoverOffset: 10
									}]
								},
								options: {
									responsive: true,
									maintainAspectRatio: false,
									animation: {
										animateRotate: true,
										animateScale: true,
										duration: 2000,
										easing: 'easeInOutQuart',
										delay: (context) => {
											let delay = 0;
											if (context.type === 'data' && context.mode === 'default') {
												delay = context.dataIndex * 100;
											}
											return delay;
										}
									},
									plugins: {
										legend: {
											display: true,
											position: 'right',
											labels: {
												font: {
													size: 11
												},
												padding: 10,
												usePointStyle: true
											}
										},
										tooltip: {
											backgroundColor: 'rgba(0, 0, 0, 0.8)',
											padding: 12,
											titleFont: {
												size: 14,
												weight: 'bold'
											},
											bodyFont: {
												size: 13
											},
											callbacks: {
												label: function(context) {
													let label = context.label || '';
													let value = format_currency_value(context.parsed);
													let total = context.dataset.data.reduce((a, b) => a + b, 0);
													let percentage = ((context.parsed / total) * 100).toFixed(1);
													return `${label}: ${value} (${percentage}%)`;
												}
											}
										}
									}
								}
							});
						}
					} catch(e) {
						console.error('Error creating department chart:', e);
					}
				}, 500);
			}
			
			// Item Chart with animations
			if (item_data.length > 0) {
				let topItems = item_data.slice(0, 10);
				let labels = topItems.map(i => (i.item_name || i.item_code).substring(0, 20));
				let values = topItems.map(i => i.po_amount || 0);
				
				if (me.charts.item) {
					try {
						me.charts.item.destroy();
					} catch(e) {}
				}
				
				setTimeout(() => {
					try {
						let canvas = document.getElementById('chart-item');
						if (canvas) {
							let ctx = canvas.getContext('2d');
							me.charts.item = new Chart(ctx, {
								type: 'bar',
								data: {
									labels: labels,
									datasets: [{
										label: 'Expense Amount',
										data: values,
										backgroundColor: 'rgba(67, 233, 123, 0.8)',
										borderColor: '#43e97b',
										borderWidth: 2,
										borderRadius: 8,
										borderSkipped: false
									}]
								},
								options: {
									responsive: true,
									maintainAspectRatio: false,
									animation: {
										duration: 2000,
										easing: 'easeInOutElastic',
										delay: (context) => {
											let delay = 0;
											if (context.type === 'data' && context.mode === 'default') {
												delay = context.dataIndex * 120;
											}
											return delay;
										}
									},
									plugins: {
										legend: {
											display: true,
											position: 'top',
											labels: {
												font: {
													size: 12,
													weight: 'bold'
												},
												padding: 15
											}
										},
										tooltip: {
											backgroundColor: 'rgba(0, 0, 0, 0.8)',
											padding: 12,
											titleFont: {
												size: 14,
												weight: 'bold'
											},
											bodyFont: {
												size: 13
											},
											callbacks: {
												label: function(context) {
													return format_currency_value(context.parsed.y);
												}
											}
										}
									},
									scales: {
										y: {
											beginAtZero: true,
											grid: {
												color: 'rgba(0, 0, 0, 0.05)',
												lineWidth: 1
											},
											ticks: {
												callback: function(value) {
													return format_currency_value(value);
												},
												font: {
													size: 11
												}
											}
										},
										x: {
											grid: {
												display: false
											},
											ticks: {
												font: {
													size: 10
												},
												maxRotation: 45,
												minRotation: 45
											}
										}
									}
								}
							});
						}
					} catch(e) {
						console.error('Error creating item chart:', e);
					}
				}, 700);
			}
			
			// Cumulative Expense Chart
			if (expense_data.length > 0) {
				let period_data = {};
				expense_data.forEach(row => {
					if (!period_data[row.period]) {
						period_data[row.period] = {
							period: row.period,
							po_amount: 0
						};
					}
					period_data[row.period].po_amount += row.po_amount || 0;
				});
				
				let periods = Object.keys(period_data).sort();
				let cumulative = 0;
				let cumulativeAmounts = periods.map(p => {
					cumulative += period_data[p].po_amount;
					return cumulative;
				});
				
				if (me.charts.cumulative) {
					try {
						me.charts.cumulative.destroy();
					} catch(e) {}
				}
				
				setTimeout(() => {
					try {
						let canvas = document.getElementById('chart-cumulative');
						if (canvas) {
							let ctx = canvas.getContext('2d');
							me.charts.cumulative = new Chart(ctx, {
								type: 'line',
								data: {
									labels: periods,
									datasets: [{
										label: 'Cumulative Expense',
										data: cumulativeAmounts,
										borderColor: '#667eea',
										backgroundColor: 'rgba(102, 126, 234, 0.1)',
										borderWidth: 3,
										fill: true,
										tension: 0.4,
										pointRadius: 6,
										pointHoverRadius: 9,
										pointBackgroundColor: '#667eea',
										pointBorderColor: '#fff',
										pointBorderWidth: 2,
										stepped: 'after'
									}]
								},
								options: {
									responsive: true,
									maintainAspectRatio: false,
									animation: {
										duration: 2500,
										easing: 'easeInOutQuart',
										delay: (context) => context.dataIndex * 80
									},
									plugins: {
										legend: {
											display: true,
											position: 'top',
											labels: {
												font: { size: 12, weight: 'bold' },
												padding: 15
											}
										},
										tooltip: {
											backgroundColor: 'rgba(0, 0, 0, 0.8)',
											padding: 12,
											titleFont: { size: 14, weight: 'bold' },
											bodyFont: { size: 13 },
											callbacks: {
												label: function(context) {
													return format_currency_value(context.parsed.y);
												}
											}
										}
									},
									scales: {
										y: {
											beginAtZero: true,
											grid: { color: 'rgba(0, 0, 0, 0.05)', lineWidth: 1 },
											ticks: {
												callback: function(value) {
													return format_currency_value(value);
												},
												font: { size: 11 }
											}
										},
										x: {
											grid: { display: false },
											ticks: { font: { size: 11 } }
										}
									}
								}
							});
						}
					} catch(e) {
						console.error('Error creating cumulative chart:', e);
					}
				}, 900);
			}
			
			// Top 10 Expense Accounts Pie Chart
			if (item_data.length > 0) {
				let topItems = item_data.slice(0, 10);
				let labels = topItems.map(i => (i.item_name || i.item_code).substring(0, 25));
				let values = topItems.map(i => i.po_amount || 0);
				
				if (me.charts.top_accounts) {
					try {
						me.charts.top_accounts.destroy();
					} catch(e) {}
				}
				
				setTimeout(() => {
					try {
						let canvas = document.getElementById('chart-top-accounts');
						if (canvas) {
							let ctx = canvas.getContext('2d');
							me.charts.top_accounts = new Chart(ctx, {
								type: 'pie',
								data: {
									labels: labels,
									datasets: [{
										label: 'Expense Amount',
										data: values,
										backgroundColor: [
											'rgba(245, 87, 108, 0.8)', 'rgba(102, 126, 234, 0.8)', 'rgba(67, 233, 123, 0.8)',
											'rgba(255, 193, 7, 0.8)', 'rgba(156, 39, 176, 0.8)', 'rgba(233, 30, 99, 0.8)',
											'rgba(0, 188, 212, 0.8)', 'rgba(255, 152, 0, 0.8)', 'rgba(76, 175, 80, 0.8)',
											'rgba(63, 81, 181, 0.8)'
										],
										borderColor: [
											'#f5576c', '#667eea', '#43e97b', '#ffc107', '#9c27b0',
											'#e91e63', '#00bcd4', '#ff9800', '#4caf50', '#3f51b5'
										],
										borderWidth: 3,
										hoverOffset: 15
									}]
								},
								options: {
									responsive: true,
									maintainAspectRatio: false,
									animation: {
										animateRotate: true,
										animateScale: true,
										duration: 2000,
										easing: 'easeInOutQuart',
										delay: (context) => context.dataIndex * 120
									},
									plugins: {
										legend: {
											display: true,
											position: 'right',
											labels: {
												font: { size: 10 },
												padding: 8,
												usePointStyle: true,
												boxWidth: 12
											}
										},
										tooltip: {
											backgroundColor: 'rgba(0, 0, 0, 0.8)',
											padding: 12,
											titleFont: { size: 14, weight: 'bold' },
											bodyFont: { size: 13 },
											callbacks: {
												label: function(context) {
													let label = context.label || '';
													let value = format_currency_value(context.parsed);
													let total = context.dataset.data.reduce((a, b) => a + b, 0);
													let percentage = ((context.parsed / total) * 100).toFixed(1);
													return `${label}: ${value} (${percentage}%)`;
												}
											}
										}
									}
								}
							});
						}
					} catch(e) {
						console.error('Error creating top accounts chart:', e);
					}
				}, 1100);
			}
			
			// Monthly Comparison Chart (Grouped Bar)
			if (expense_data.length > 0) {
				let period_data = {};
				let cost_center_data = {};
				
				expense_data.forEach(row => {
					if (!period_data[row.period]) {
						period_data[row.period] = {};
					}
					let cc = row.cost_center_name || row.cost_center || 'Other';
					if (!period_data[row.period][cc]) {
						period_data[row.period][cc] = 0;
					}
					period_data[row.period][cc] += row.po_amount || 0;
					
					if (!cost_center_data[cc]) {
						cost_center_data[cc] = true;
					}
				});
				
				let periods = Object.keys(period_data).sort();
				let cost_centers = Object.keys(cost_center_data).slice(0, 5); // Top 5 cost centers
				
				let colors = ['rgba(245, 87, 108, 0.8)', 'rgba(102, 126, 234, 0.8)', 'rgba(67, 233, 123, 0.8)', 
							  'rgba(255, 193, 7, 0.8)', 'rgba(156, 39, 176, 0.8)'];
				let borderColors = ['#f5576c', '#667eea', '#43e97b', '#ffc107', '#9c27b0'];
				
				let datasets = cost_centers.map((cc, idx) => ({
					label: cc.substring(0, 20),
					data: periods.map(p => period_data[p][cc] || 0),
					backgroundColor: colors[idx],
					borderColor: borderColors[idx],
					borderWidth: 2,
					borderRadius: 6
				}));
				
				if (me.charts.monthly_comparison) {
					try {
						me.charts.monthly_comparison.destroy();
					} catch(e) {}
				}
				
				setTimeout(() => {
					try {
						let canvas = document.getElementById('chart-monthly-comparison');
						if (canvas) {
							let ctx = canvas.getContext('2d');
							me.charts.monthly_comparison = new Chart(ctx, {
								type: 'bar',
								data: {
									labels: periods,
									datasets: datasets
								},
								options: {
									responsive: true,
									maintainAspectRatio: false,
									animation: {
										duration: 2000,
										easing: 'easeInOutBounce',
										delay: (context) => {
											if (context.type === 'data' && context.mode === 'default') {
												return context.dataIndex * 50 + context.datasetIndex * 100;
											}
											return 0;
										}
									},
									plugins: {
										legend: {
											display: true,
											position: 'top',
											labels: {
												font: { size: 11, weight: 'bold' },
												padding: 12,
												usePointStyle: true
											}
										},
										tooltip: {
											backgroundColor: 'rgba(0, 0, 0, 0.8)',
											padding: 12,
											titleFont: { size: 14, weight: 'bold' },
											bodyFont: { size: 13 },
											callbacks: {
												label: function(context) {
													return `${context.dataset.label}: ${format_currency_value(context.parsed.y)}`;
												}
											}
										}
									},
									scales: {
										y: {
											beginAtZero: true,
											stacked: false,
											grid: { color: 'rgba(0, 0, 0, 0.05)', lineWidth: 1 },
											ticks: {
												callback: function(value) {
													return format_currency_value(value);
												},
												font: { size: 11 }
											}
										},
										x: {
											stacked: false,
											grid: { display: false },
											ticks: { font: { size: 11 } }
										}
									}
								}
							});
						}
					} catch(e) {
						console.error('Error creating monthly comparison chart:', e);
					}
				}, 1300);
			}
			
			// Expense Distribution Chart (Polar Area)
			if (expense_data.length > 0) {
				if (dept_data.length > 0) {
					let topDept = dept_data.slice(0, 8);
					let labels = topDept.map(d => (d.department_name || d.department).substring(0, 15));
					let values = topDept.map(d => d.po_amount || 0);
					
					if (me.charts.distribution) {
						try {
							me.charts.distribution.destroy();
						} catch(e) {}
					}
					
					setTimeout(() => {
						try {
							let canvas = document.getElementById('chart-distribution');
							if (canvas) {
								let ctx = canvas.getContext('2d');
								me.charts.distribution = new Chart(ctx, {
									type: 'polarArea',
									data: {
										labels: labels,
										datasets: [{
											label: 'Expense Amount',
											data: values,
											backgroundColor: [
												'rgba(245, 87, 108, 0.7)', 'rgba(102, 126, 234, 0.7)', 'rgba(67, 233, 123, 0.7)',
												'rgba(255, 193, 7, 0.7)', 'rgba(156, 39, 176, 0.7)', 'rgba(233, 30, 99, 0.7)',
												'rgba(0, 188, 212, 0.7)', 'rgba(255, 152, 0, 0.7)'
											],
											borderColor: [
												'#f5576c', '#667eea', '#43e97b', '#ffc107',
												'#9c27b0', '#e91e63', '#00bcd4', '#ff9800'
											],
											borderWidth: 2
										}]
									},
									options: {
										responsive: true,
										maintainAspectRatio: false,
										animation: {
											animateRotate: true,
											animateScale: true,
											duration: 2000,
											easing: 'easeInOutQuart',
											delay: (context) => context.dataIndex * 100
										},
										plugins: {
											legend: {
												display: true,
												position: 'right',
												labels: {
													font: { size: 10 },
													padding: 8,
													usePointStyle: true
												}
											},
											tooltip: {
												backgroundColor: 'rgba(0, 0, 0, 0.8)',
												padding: 12,
												titleFont: { size: 14, weight: 'bold' },
												bodyFont: { size: 13 },
												callbacks: {
													label: function(context) {
														let label = context.label || '';
														let value = format_currency_value(context.parsed.r);
														let total = context.dataset.data.reduce((a, b) => a + b, 0);
														let percentage = ((context.parsed.r / total) * 100).toFixed(1);
														return `${label}: ${value} (${percentage}%)`;
													}
												}
											}
										},
										scales: {
											r: {
												beginAtZero: true,
												ticks: {
													display: false
												},
												grid: {
													color: 'rgba(0, 0, 0, 0.1)'
												}
											}
										}
									}
								});
							}
						} catch(e) {
							console.error('Error creating distribution chart:', e);
						}
					}, 1500);
				}
			}
			
			// Expense vs Transaction Count Chart (Dual Axis)
			if (expense_data.length > 0) {
				let period_data = {};
				let period_count = {};
				
				expense_data.forEach(row => {
					if (!period_data[row.period]) {
						period_data[row.period] = 0;
						period_count[row.period] = 0;
					}
					period_data[row.period] += row.po_amount || 0;
					period_count[row.period] += row.po_count || 0;
				});
				
				let periods = Object.keys(period_data).sort();
				let amounts = periods.map(p => period_data[p]);
				let counts = periods.map(p => period_count[p]);
				
				if (me.charts.expense_vs_count) {
					try {
						me.charts.expense_vs_count.destroy();
					} catch(e) {}
				}
				
				setTimeout(() => {
					try {
						let canvas = document.getElementById('chart-expense-vs-count');
						if (canvas) {
							let ctx = canvas.getContext('2d');
							me.charts.expense_vs_count = new Chart(ctx, {
								type: 'bar',
								data: {
									labels: periods,
									datasets: [
										{
											label: 'Expense Amount',
											data: amounts,
											yAxisID: 'y',
											backgroundColor: 'rgba(245, 87, 108, 0.7)',
											borderColor: '#f5576c',
											borderWidth: 2,
											borderRadius: 6
										},
										{
											label: 'Transaction Count',
											data: counts,
											yAxisID: 'y1',
											type: 'line',
											borderColor: '#667eea',
											backgroundColor: 'rgba(102, 126, 234, 0.1)',
											borderWidth: 3,
											fill: true,
											tension: 0.4,
											pointRadius: 5,
											pointHoverRadius: 8,
											pointBackgroundColor: '#667eea',
											pointBorderColor: '#fff',
											pointBorderWidth: 2
										}
									]
								},
								options: {
									responsive: true,
									maintainAspectRatio: false,
									animation: {
										duration: 2000,
										easing: 'easeInOutQuart',
										delay: (context) => {
											if (context.type === 'data' && context.mode === 'default') {
												return context.dataIndex * 80;
											}
											return 0;
										}
									},
									interaction: {
										mode: 'index',
										intersect: false
									},
									plugins: {
										legend: {
											display: true,
											position: 'top',
											labels: {
												font: { size: 12, weight: 'bold' },
												padding: 15
											}
										},
										tooltip: {
											backgroundColor: 'rgba(0, 0, 0, 0.8)',
											padding: 12,
											titleFont: { size: 14, weight: 'bold' },
											bodyFont: { size: 13 },
											callbacks: {
												label: function(context) {
													if (context.datasetIndex === 0) {
														return `Expense: ${format_currency_value(context.parsed.y)}`;
													} else {
														return `Transactions: ${format_number_value(context.parsed.y)}`;
													}
												}
											}
										}
									},
									scales: {
										y: {
											type: 'linear',
											display: true,
											position: 'left',
											beginAtZero: true,
											grid: { color: 'rgba(0, 0, 0, 0.05)', lineWidth: 1 },
											ticks: {
												callback: function(value) {
													return format_currency_value(value);
												},
												font: { size: 11 }
											}
										},
										y1: {
											type: 'linear',
											display: true,
											position: 'right',
											beginAtZero: true,
											grid: { drawOnChartArea: false },
											ticks: {
												callback: function(value) {
													return format_number_value(value);
												},
												font: { size: 11 }
											}
										},
										x: {
											grid: { display: false },
											ticks: { font: { size: 11 } }
										}
									}
								}
							});
						}
					} catch(e) {
						console.error('Error creating expense vs count chart:', e);
					}
				}, 1700);
			}
		}
		
		render_payment_charts() {
			let me = this;
			let payment_data = me.data.payment_data || [];
			
			// Wait for Chart.js to be available
			if (typeof Chart === 'undefined') {
				setTimeout(() => me.render_payment_charts(), 200);
				return;
			}
			
			if (payment_data.length === 0) {
				return;
			}
			
			// Prepare data
			let labels = payment_data.map(p => p.mode_of_payment || 'Not Specified');
			let amounts = payment_data.map(p => p.total_amount || 0);
			let cash_amounts = payment_data.map(p => p.cash_amount || 0);
			let other_amounts = payment_data.map(p => p.other_amount || 0);
			let payment_counts = payment_data.map(p => p.payment_count || 0);
			
			// Calculate totals for cash vs other
			let total_cash = payment_data.reduce((sum, p) => sum + (p.cash_amount || 0), 0);
			let total_other = payment_data.reduce((sum, p) => sum + (p.other_amount || 0), 0);
			
			// Colors array
			let colors = [
				'rgba(245, 87, 108, 0.8)', 'rgba(102, 126, 234, 0.8)', 'rgba(67, 233, 123, 0.8)',
				'rgba(255, 193, 7, 0.8)', 'rgba(156, 39, 176, 0.8)', 'rgba(233, 30, 99, 0.8)',
				'rgba(0, 188, 212, 0.8)', 'rgba(255, 152, 0, 0.8)', 'rgba(76, 175, 80, 0.8)',
				'rgba(63, 81, 181, 0.8)'
			];
			let borderColors = [
				'#f5576c', '#667eea', '#43e97b', '#ffc107', '#9c27b0',
				'#e91e63', '#00bcd4', '#ff9800', '#4caf50', '#3f51b5'
			];
			
			// 1. Pie Chart - Mode of Payment Distribution
			if (me.charts.payment_pie) {
				try {
					me.charts.payment_pie.destroy();
				} catch(e) {}
			}
			
			setTimeout(() => {
				try {
					let canvas = document.getElementById('chart-payment-pie');
					if (canvas) {
						let ctx = canvas.getContext('2d');
						me.charts.payment_pie = new Chart(ctx, {
							type: 'pie',
							data: {
								labels: labels,
								datasets: [{
									label: 'Payment Amount',
									data: amounts,
									backgroundColor: colors.slice(0, labels.length),
									borderColor: borderColors.slice(0, labels.length),
									borderWidth: 3,
									hoverOffset: 15
								}]
							},
							options: {
								responsive: true,
								maintainAspectRatio: false,
								animation: {
									animateRotate: true,
									animateScale: true,
									duration: 2000,
									easing: 'easeInOutQuart',
									delay: (context) => context.dataIndex * 100
								},
								plugins: {
									legend: {
										display: true,
										position: 'right',
										labels: {
											font: { size: 11 },
											padding: 10,
											usePointStyle: true,
											generateLabels: function(chart) {
												const data = chart.data;
												if (data.labels.length && data.datasets.length) {
													const dataset = data.datasets[0];
													const total = dataset.data.reduce((a, b) => a + b, 0);
													return data.labels.map((label, i) => {
														const value = dataset.data[i];
														const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
														return {
															text: `${label} (${percentage}%)`,
															fillStyle: dataset.backgroundColor[i],
															strokeStyle: dataset.borderColor[i],
															lineWidth: dataset.borderWidth,
															hidden: false,
															index: i
														};
													});
												}
												return [];
											}
										}
									},
									tooltip: {
										backgroundColor: 'rgba(0, 0, 0, 0.8)',
										padding: 12,
										titleFont: { size: 14, weight: 'bold' },
										bodyFont: { size: 13 },
										callbacks: {
											label: function(context) {
												let label = context.label || '';
												let value = format_currency_value(context.parsed);
												let total = context.dataset.data.reduce((a, b) => a + b, 0);
												let percentage = total > 0 ? ((context.parsed / total) * 100).toFixed(1) : 0;
												let paymentCount = payment_data[context.dataIndex]?.payment_count || 0;
												return [
													`${label}: ${value}`,
													`Percentage: ${percentage}%`,
													`Payment Count: ${format_number_value(paymentCount)}`
												];
											}
										}
									}
								}
							}
						});
					}
				} catch(e) {
					console.error('Error creating payment pie chart:', e);
				}
			}, 100);
			
			// 2. Bar Chart - Mode of Payment Comparison
			if (me.charts.payment_bar) {
				try {
					me.charts.payment_bar.destroy();
				} catch(e) {}
			}
			
			setTimeout(() => {
				try {
					let canvas = document.getElementById('chart-payment-bar');
					if (canvas) {
						let ctx = canvas.getContext('2d');
						me.charts.payment_bar = new Chart(ctx, {
							type: 'bar',
							data: {
								labels: labels,
								datasets: [
									{
										label: 'Cash Amount',
										data: cash_amounts,
										backgroundColor: 'rgba(67, 233, 123, 0.8)',
										borderColor: '#43e97b',
										borderWidth: 2,
										borderRadius: 6
									},
									{
										label: 'Other Amount',
										data: other_amounts,
										backgroundColor: 'rgba(102, 126, 234, 0.8)',
										borderColor: '#667eea',
										borderWidth: 2,
										borderRadius: 6
									}
								]
							},
							options: {
								responsive: true,
								maintainAspectRatio: false,
								animation: {
									duration: 2000,
									easing: 'easeInOutBounce',
									delay: (context) => {
										if (context.type === 'data' && context.mode === 'default') {
											return context.dataIndex * 100 + context.datasetIndex * 50;
										}
										return 0;
									}
								},
								plugins: {
									legend: {
										display: true,
										position: 'top',
										labels: {
											font: { size: 12, weight: 'bold' },
											padding: 15
										}
									},
									tooltip: {
										backgroundColor: 'rgba(0, 0, 0, 0.8)',
										padding: 12,
										titleFont: { size: 14, weight: 'bold' },
										bodyFont: { size: 13 },
										callbacks: {
											label: function(context) {
												return `${context.dataset.label}: ${format_currency_value(context.parsed.y)}`;
											}
										}
									}
								},
								scales: {
									y: {
										beginAtZero: true,
										stacked: false,
										grid: { color: 'rgba(0, 0, 0, 0.05)', lineWidth: 1 },
										ticks: {
											callback: function(value) {
												return format_currency_value(value);
											},
											font: { size: 11 }
										}
									},
									x: {
										stacked: false,
										grid: { display: false },
										ticks: {
											font: { size: 11 },
											maxRotation: 45,
											minRotation: 45
										}
									}
								}
							}
						});
					}
				} catch(e) {
					console.error('Error creating payment bar chart:', e);
				}
			}, 300);
			
			// 3. Doughnut Chart - Cash vs Other
			if (me.charts.payment_doughnut) {
				try {
					me.charts.payment_doughnut.destroy();
				} catch(e) {}
			}
			
			setTimeout(() => {
				try {
					let canvas = document.getElementById('chart-payment-doughnut');
					if (canvas) {
						let ctx = canvas.getContext('2d');
						me.charts.payment_doughnut = new Chart(ctx, {
							type: 'doughnut',
							data: {
								labels: ['Cash Payments', 'Other Payments'],
								datasets: [{
									label: 'Payment Amount',
									data: [total_cash, total_other],
									backgroundColor: ['rgba(67, 233, 123, 0.8)', 'rgba(102, 126, 234, 0.8)'],
									borderColor: ['#43e97b', '#667eea'],
									borderWidth: 3,
									hoverOffset: 15
								}]
							},
							options: {
								responsive: true,
								maintainAspectRatio: false,
								animation: {
									animateRotate: true,
									animateScale: true,
									duration: 2000,
									easing: 'easeInOutQuart'
								},
								plugins: {
									legend: {
										display: true,
										position: 'right',
										labels: {
											font: { size: 12 },
											padding: 15,
											usePointStyle: true
										}
									},
									tooltip: {
										backgroundColor: 'rgba(0, 0, 0, 0.8)',
										padding: 12,
										titleFont: { size: 14, weight: 'bold' },
										bodyFont: { size: 13 },
										callbacks: {
											label: function(context) {
												let label = context.label || '';
												let value = format_currency_value(context.parsed);
												let total = total_cash + total_other;
												let percentage = total > 0 ? ((context.parsed / total) * 100).toFixed(1) : 0;
												return `${label}: ${value} (${percentage}%)`;
											}
										}
									}
								}
							}
						});
					}
				} catch(e) {
					console.error('Error creating payment doughnut chart:', e);
				}
			}, 500);
			
			// 4. Horizontal Bar Chart - Payment Count by Mode
			if (me.charts.payment_count) {
				try {
					me.charts.payment_count.destroy();
				} catch(e) {}
			}
			
			setTimeout(() => {
				try {
					let canvas = document.getElementById('chart-payment-count');
					if (canvas) {
						let ctx = canvas.getContext('2d');
						me.charts.payment_count = new Chart(ctx, {
							type: 'bar',
							data: {
								labels: labels,
								datasets: [{
									label: 'Payment Count',
									data: payment_counts,
									backgroundColor: colors.slice(0, labels.length).map(c => c.replace('0.8', '0.7')),
									borderColor: borderColors.slice(0, labels.length),
									borderWidth: 2,
									borderRadius: 6,
									borderSkipped: false
								}]
							},
							options: {
								responsive: true,
								maintainAspectRatio: false,
								indexAxis: 'y',
								animation: {
									duration: 2000,
									easing: 'easeInOutBounce',
									delay: (context) => {
										if (context.type === 'data' && context.mode === 'default') {
											return context.dataIndex * 120;
										}
										return 0;
									}
								},
								plugins: {
									legend: {
										display: true,
										position: 'top',
										labels: {
											font: { size: 12, weight: 'bold' },
											padding: 15
										}
									},
									tooltip: {
										backgroundColor: 'rgba(0, 0, 0, 0.8)',
										padding: 12,
										titleFont: { size: 14, weight: 'bold' },
										bodyFont: { size: 13 },
										callbacks: {
											label: function(context) {
												let count = context.parsed.x;
												let invoiceCount = payment_data[context.dataIndex]?.invoice_count || 0;
												return [
													`Payment Count: ${format_number_value(count)}`,
													`Invoice Count: ${format_number_value(invoiceCount)}`
												];
											}
										}
									}
								},
								scales: {
									x: {
										beginAtZero: true,
										grid: { color: 'rgba(0, 0, 0, 0.05)', lineWidth: 1 },
										ticks: {
											stepSize: 1,
											font: { size: 11 }
										}
									},
									y: {
										grid: { display: false },
										ticks: {
											font: { size: 11 }
										}
									}
								}
							}
						});
					}
				} catch(e) {
					console.error('Error creating payment count chart:', e);
				}
			}, 700);
		}
		
		render_item_payment_charts() {
			let me = this;
			let item_payment_data = me.data.item_payment_data || {};
			let cash_items = item_payment_data.cash_items || [];
			let cheque_items = item_payment_data.cheque_items || [];
			
			// Wait for Chart.js to be available
			if (typeof Chart === 'undefined') {
				setTimeout(() => me.render_item_payment_charts(), 200);
				return;
			}
			
			// Colors
			let colors = [
				'rgba(67, 233, 123, 0.8)', 'rgba(102, 126, 234, 0.8)', 'rgba(245, 87, 108, 0.8)',
				'rgba(255, 193, 7, 0.8)', 'rgba(156, 39, 176, 0.8)', 'rgba(233, 30, 99, 0.8)',
				'rgba(0, 188, 212, 0.8)', 'rgba(255, 152, 0, 0.8)', 'rgba(76, 175, 80, 0.8)',
				'rgba(63, 81, 181, 0.8)', 'rgba(121, 85, 72, 0.8)', 'rgba(158, 158, 158, 0.8)',
				'rgba(255, 87, 34, 0.8)', 'rgba(0, 150, 136, 0.8)', 'rgba(103, 58, 183, 0.8)',
				'rgba(244, 67, 54, 0.8)', 'rgba(33, 150, 243, 0.8)', 'rgba(139, 195, 74, 0.8)',
				'rgba(255, 235, 59, 0.8)', 'rgba(236, 64, 122, 0.8)'
			];
			let borderColors = [
				'#43e97b', '#667eea', '#f5576c', '#ffc107', '#9c27b0',
				'#e91e63', '#00bcd4', '#ff9800', '#4caf50', '#3f51b5',
				'#795548', '#9e9e9e', '#ff5722', '#009688', '#673ab7',
				'#f44336', '#2196f3', '#8bc34a', '#ffeb3b', '#ec407a'
			];
			
			// 1. Items Paid via Cash - Bar Chart
			if (cash_items.length > 0) {
				let topCashItems = cash_items.slice(0, 15);
				let cashLabels = topCashItems.map(i => (i.item_name || i.item_code).substring(0, 30));
				let cashAmounts = topCashItems.map(i => i.amount || 0);
				
				if (me.charts.items_cash) {
					try {
						me.charts.items_cash.destroy();
					} catch(e) {}
				}
				
				setTimeout(() => {
					try {
						let canvas = document.getElementById('chart-items-cash');
						if (canvas) {
							let ctx = canvas.getContext('2d');
							me.charts.items_cash = new Chart(ctx, {
								type: 'bar',
								data: {
									labels: cashLabels,
									datasets: [{
										label: 'Cash Payment Amount',
										data: cashAmounts,
										backgroundColor: 'rgba(67, 233, 123, 0.8)',
										borderColor: '#43e97b',
										borderWidth: 2,
										borderRadius: 8,
										borderSkipped: false
									}]
								},
								options: {
									responsive: true,
									maintainAspectRatio: false,
									animation: {
										duration: 2000,
										easing: 'easeInOutBounce',
										delay: (context) => {
											if (context.type === 'data' && context.mode === 'default') {
												return context.dataIndex * 80;
											}
											return 0;
										}
									},
									plugins: {
										legend: {
											display: true,
											position: 'top',
											labels: {
												font: { size: 12, weight: 'bold' },
												padding: 15
											}
										},
										tooltip: {
											backgroundColor: 'rgba(0, 0, 0, 0.8)',
											padding: 12,
											titleFont: { size: 14, weight: 'bold' },
											bodyFont: { size: 13 },
											callbacks: {
												label: function(context) {
													let amount = format_currency_value(context.parsed.y);
													let invoiceCount = topCashItems[context.dataIndex]?.invoice_count || 0;
													return [
														`Amount: ${amount}`,
														`Invoice Count: ${format_number_value(invoiceCount)}`
													];
												}
											}
										}
									},
									scales: {
										y: {
											beginAtZero: true,
											grid: { color: 'rgba(0, 0, 0, 0.05)', lineWidth: 1 },
											ticks: {
												callback: function(value) {
													return format_currency_value(value);
												},
												font: { size: 11 }
											}
										},
										x: {
											grid: { display: false },
											ticks: {
												font: { size: 10 },
												maxRotation: 45,
												minRotation: 45
											}
										}
									}
								}
							});
						}
					} catch(e) {
						console.error('Error creating cash items bar chart:', e);
					}
				}, 900);
				
				// Cash Items Pie Chart
				if (me.charts.items_cash_pie) {
					try {
						me.charts.items_cash_pie.destroy();
					} catch(e) {}
				}
				
				setTimeout(() => {
					try {
						let canvas = document.getElementById('chart-items-cash-pie');
						if (canvas) {
							let ctx = canvas.getContext('2d');
							let topCashPie = cash_items.slice(0, 10);
							let pieLabels = topCashPie.map(i => (i.item_name || i.item_code).substring(0, 25));
							let pieAmounts = topCashPie.map(i => i.amount || 0);
							
							me.charts.items_cash_pie = new Chart(ctx, {
								type: 'pie',
								data: {
									labels: pieLabels,
									datasets: [{
										label: 'Cash Payment Amount',
										data: pieAmounts,
										backgroundColor: colors.slice(0, pieLabels.length),
										borderColor: borderColors.slice(0, pieLabels.length),
										borderWidth: 3,
										hoverOffset: 15
									}]
								},
								options: {
									responsive: true,
									maintainAspectRatio: false,
									animation: {
										animateRotate: true,
										animateScale: true,
										duration: 2000,
										easing: 'easeInOutQuart',
										delay: (context) => context.dataIndex * 100
									},
									plugins: {
										legend: {
											display: true,
											position: 'right',
											labels: {
												font: { size: 10 },
												padding: 8,
												usePointStyle: true,
												generateLabels: function(chart) {
													const data = chart.data;
													if (data.labels.length && data.datasets.length) {
														const dataset = data.datasets[0];
														const total = dataset.data.reduce((a, b) => a + b, 0);
														return data.labels.map((label, i) => {
															const value = dataset.data[i];
															const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
															return {
																text: `${label} (${percentage}%)`,
																fillStyle: dataset.backgroundColor[i],
																strokeStyle: dataset.borderColor[i],
																lineWidth: dataset.borderWidth,
																hidden: false,
																index: i
															};
														});
													}
													return [];
												}
											}
										},
										tooltip: {
											backgroundColor: 'rgba(0, 0, 0, 0.8)',
											padding: 12,
											titleFont: { size: 14, weight: 'bold' },
											bodyFont: { size: 13 },
											callbacks: {
												label: function(context) {
													let label = context.label || '';
													let value = format_currency_value(context.parsed);
													let total = context.dataset.data.reduce((a, b) => a + b, 0);
													let percentage = total > 0 ? ((context.parsed / total) * 100).toFixed(1) : 0;
													let invoiceCount = topCashPie[context.dataIndex]?.invoice_count || 0;
													return [
														`${label}: ${value}`,
														`Percentage: ${percentage}%`,
														`Invoice Count: ${format_number_value(invoiceCount)}`
													];
												}
											}
										}
									}
								}
							});
						}
					} catch(e) {
						console.error('Error creating cash items pie chart:', e);
					}
				}, 1100);
			}
			
			// 2. Items Paid via Cheque - Bar Chart
			if (cheque_items.length > 0) {
				let topChequeItems = cheque_items.slice(0, 15);
				let chequeLabels = topChequeItems.map(i => (i.item_name || i.item_code).substring(0, 30));
				let chequeAmounts = topChequeItems.map(i => i.amount || 0);
				
				if (me.charts.items_cheque) {
					try {
						me.charts.items_cheque.destroy();
					} catch(e) {}
				}
				
				setTimeout(() => {
					try {
						let canvas = document.getElementById('chart-items-cheque');
						if (canvas) {
							let ctx = canvas.getContext('2d');
							me.charts.items_cheque = new Chart(ctx, {
								type: 'bar',
								data: {
									labels: chequeLabels,
									datasets: [{
										label: 'Cheque Payment Amount',
										data: chequeAmounts,
										backgroundColor: 'rgba(102, 126, 234, 0.8)',
										borderColor: '#667eea',
										borderWidth: 2,
										borderRadius: 8,
										borderSkipped: false
									}]
								},
								options: {
									responsive: true,
									maintainAspectRatio: false,
									animation: {
										duration: 2000,
										easing: 'easeInOutBounce',
										delay: (context) => {
											if (context.type === 'data' && context.mode === 'default') {
												return context.dataIndex * 80;
											}
											return 0;
										}
									},
									plugins: {
										legend: {
											display: true,
											position: 'top',
											labels: {
												font: { size: 12, weight: 'bold' },
												padding: 15
											}
										},
										tooltip: {
											backgroundColor: 'rgba(0, 0, 0, 0.8)',
											padding: 12,
											titleFont: { size: 14, weight: 'bold' },
											bodyFont: { size: 13 },
											callbacks: {
												label: function(context) {
													let amount = format_currency_value(context.parsed.y);
													let invoiceCount = topChequeItems[context.dataIndex]?.invoice_count || 0;
													return [
														`Amount: ${amount}`,
														`Invoice Count: ${format_number_value(invoiceCount)}`
													];
												}
											}
										}
									},
									scales: {
										y: {
											beginAtZero: true,
											grid: { color: 'rgba(0, 0, 0, 0.05)', lineWidth: 1 },
											ticks: {
												callback: function(value) {
													return format_currency_value(value);
												},
												font: { size: 11 }
											}
										},
										x: {
											grid: { display: false },
											ticks: {
												font: { size: 10 },
												maxRotation: 45,
												minRotation: 45
											}
										}
									}
								}
							});
						}
					} catch(e) {
						console.error('Error creating cheque items bar chart:', e);
					}
				}, 1300);
				
				// Cheque Items Pie Chart
				if (me.charts.items_cheque_pie) {
					try {
						me.charts.items_cheque_pie.destroy();
					} catch(e) {}
				}
				
				setTimeout(() => {
					try {
						let canvas = document.getElementById('chart-items-cheque-pie');
						if (canvas) {
							let ctx = canvas.getContext('2d');
							let topChequePie = cheque_items.slice(0, 10);
							let pieLabels = topChequePie.map(i => (i.item_name || i.item_code).substring(0, 25));
							let pieAmounts = topChequePie.map(i => i.amount || 0);
							
							me.charts.items_cheque_pie = new Chart(ctx, {
								type: 'pie',
								data: {
									labels: pieLabels,
									datasets: [{
										label: 'Cheque Payment Amount',
										data: pieAmounts,
										backgroundColor: colors.slice(0, pieLabels.length),
										borderColor: borderColors.slice(0, pieLabels.length),
										borderWidth: 3,
										hoverOffset: 15
									}]
								},
								options: {
									responsive: true,
									maintainAspectRatio: false,
									animation: {
										animateRotate: true,
										animateScale: true,
										duration: 2000,
										easing: 'easeInOutQuart',
										delay: (context) => context.dataIndex * 100
									},
									plugins: {
										legend: {
											display: true,
											position: 'right',
											labels: {
												font: { size: 10 },
												padding: 8,
												usePointStyle: true,
												generateLabels: function(chart) {
													const data = chart.data;
													if (data.labels.length && data.datasets.length) {
														const dataset = data.datasets[0];
														const total = dataset.data.reduce((a, b) => a + b, 0);
														return data.labels.map((label, i) => {
															const value = dataset.data[i];
															const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
															return {
																text: `${label} (${percentage}%)`,
																fillStyle: dataset.backgroundColor[i],
																strokeStyle: dataset.borderColor[i],
																lineWidth: dataset.borderWidth,
																hidden: false,
																index: i
															};
														});
													}
													return [];
												}
											}
										},
										tooltip: {
											backgroundColor: 'rgba(0, 0, 0, 0.8)',
											padding: 12,
											titleFont: { size: 14, weight: 'bold' },
											bodyFont: { size: 13 },
											callbacks: {
												label: function(context) {
													let label = context.label || '';
													let value = format_currency_value(context.parsed);
													let total = context.dataset.data.reduce((a, b) => a + b, 0);
													let percentage = total > 0 ? ((context.parsed / total) * 100).toFixed(1) : 0;
													let invoiceCount = topChequePie[context.dataIndex]?.invoice_count || 0;
													return [
														`${label}: ${value}`,
														`Percentage: ${percentage}%`,
														`Invoice Count: ${format_number_value(invoiceCount)}`
													];
												}
											}
										}
									}
								}
							});
						}
					} catch(e) {
						console.error('Error creating cheque items pie chart:', e);
					}
				}, 1500);
			}
		}
		
		export_to_excel() {
			let me = this;
			let summary = me.data.summary_data || [];
			let expense_data = me.data.expense_data || [];
			let payment_data = me.data.payment_data || [];
			
			let csv = [];
			csv.push('Procurement Expense Report');
			csv.push(`Period: ${me.filters.from_date} to ${me.filters.to_date}`);
			csv.push(`Period Type: ${me.filters.period_type}`);
			csv.push('');
			csv.push('Summary by Cost Center');
			csv.push('Cost Center,PO Amount,PO Count');
			
			summary.forEach(row => {
				csv.push([
					row.cost_center_name || row.cost_center || '',
					row.po_amount || 0,
					row.po_count || 0
				].join(','));
			});
			
			csv.push('');
			csv.push('Detailed Expense by Period');
			csv.push('Period,Cost Center,PO Amount,PO Count');
			
			expense_data.forEach(row => {
				csv.push([
					row.period || '',
					row.cost_center_name || row.cost_center || '',
					row.po_amount || 0,
					row.po_count || 0
				].join(','));
			});
			
			csv.push('');
			csv.push('Payment Entry Details (Purchase Invoices)');
			csv.push('Mode of Payment,Payment Type,Cash Amount,Other Amount,Total Amount,Payment Count,Invoice Count');
			
			payment_data.forEach(row => {
				csv.push([
					row.mode_of_payment || 'Not Specified',
					row.payment_type || '',
					row.cash_amount || 0,
					row.other_amount || 0,
					row.total_amount || 0,
					row.payment_count || 0,
					row.invoice_count || 0
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
