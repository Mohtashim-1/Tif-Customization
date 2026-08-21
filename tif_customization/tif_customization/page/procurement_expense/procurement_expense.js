frappe.pages['procurement-expense'].on_page_load = function(wrapper) {
	let page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Expense Report',
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
								<div id="from-date-control"></div>
							</div>
							<div class="col-md-3">
								<div id="to-date-control"></div>
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
								<button class="btn btn-info" id="toggle-voucher-details" style="margin-left: 10px;">
									<i class="fa fa-list"></i> Show Voucher-Wise Details
								</button>
								<button class="btn btn-success" id="export-excel" style="float: right; margin-left: 10px;">
									<i class="fa fa-file-excel-o"></i> Export to Excel
								</button>
								<button class="btn btn-default" id="print-report" style="float: right;">
									<i class="fa fa-print"></i> Print
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
						<div class="col-md-12">
							<div class="panel panel-default">
								<div class="panel-heading">
									<h5>Top 10 Expense</h5>
								</div>
								<div class="panel-body">
									<canvas id="chart-top-accounts" style="height: 300px;"></canvas>
								</div>
							</div>
						</div>
					</div>
					
					
					
					<!-- Summary Pie Chart -->
					<div class="row" style="margin-bottom: 20px;">
						<div class="col-md-12">
							<div class="panel panel-default">
								<div class="panel-heading">
									<h5>Expense by Department</h5>
							</div>
								<div class="panel-body">
									<canvas id="chart-summary-pie" style="height: 400px;"></canvas>
								</div>
							</div>
						</div>
					</div>
					
					<!-- Summary Table -->
					<div class="data-section">
					<h5 style="margin-bottom: 15px;">Summary by Department</h5>
					<div class="table-responsive">
							<table class="table table-bordered table-striped" id="summary-table">
							<thead>
								<tr>
									<th>Department / Cost Center</th>
									<th>Invoice Amount</th>
									<th>Invoice Count</th>
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
						<div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 15px;">
							<h5 style="margin: 0;">Detailed Expense by Period</h5>
							<div>
								<button type="button" class="btn btn-default btn-sm" id="toggle-all-period-details" style="display: none; margin-right: 6px;">
									<i class="fa fa-expand"></i> Expand All
								</button>
								<button type="button" class="btn btn-default btn-sm" id="toggle-detail-report" aria-expanded="false">
									<i class="fa fa-chevron-down"></i> Expand
								</button>
							</div>
						</div>
						<div class="table-responsive" id="detail-table-content" style="display: none;">
							<table class="table table-bordered table-striped" id="detail-table">
							<thead>
								<tr>
									<th>Period</th>
									<th>Department / Cost Center</th>
									<th>Invoice Amount</th>
									<th>Invoice Count</th>
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
									<h5>Total Payments by Mode of Payment</h5>
									<p style="margin: 5px 0 0 0; font-size: 11px; color: #666;">Based on Payment Entry amounts</p>
								</div>
								<div class="panel-body">
									<canvas id="chart-payment-pie" style="height: 350px;"></canvas>
								</div>
							</div>
						</div>
						<div class="col-md-6">
							<div class="panel panel-default">
								<div class="panel-heading">
									<h5>Bank Usage Details</h5>
									<p style="margin: 5px 0 0 0; font-size: 11px; color: #666;">Amount paid from each company bank account</p>
								</div>
								<div class="panel-body" id="bank-usage-panel">
									<div class="text-center text-muted" style="padding: 20px;">Loading bank details...</div>
								</div>
							</div>
						</div>
					</div>
					
					
					
					<div class="row" style="margin-bottom: 20px;">
						<div class="col-md-6">
							<div class="panel panel-default">
								<div class="panel-heading">
									<h5>Items Paid via Cash</h5>
									<p style="margin: 5px 0 0 0; font-size: 11px; color: #666;">Based on Payment Entry amounts</p>
								</div>
								<div class="panel-body">
									<canvas id="chart-items-cash-pie" style="height: 350px;"></canvas>
								</div>
							</div>
						</div>
						<div class="col-md-6">
							<div class="panel panel-default">
								<div class="panel-heading">
									<h5>Items Paid via Cheque</h5>
									<p style="margin: 5px 0 0 0; font-size: 11px; color: #666;">Based on Payment Entry amounts</p>
								</div>
								<div class="panel-body">
									<canvas id="chart-items-cheque-pie" style="height: 350px;"></canvas>
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
						
						<!-- Not Specified Payment Details Table -->
						<div id="not-specified-details-section" style="margin-top: 30px; display: none;">
							<h5 style="margin-bottom: 15px; color: #d9534f;">
								<i class="fa fa-info-circle"></i> Detailed Breakdown: "Not Specified" Payment Entries
							</h5>
							<div class="table-responsive">
								<table class="table table-bordered table-striped" id="not-specified-table">
									<thead>
										<tr>
											<th>S.#</th>
											<th>Payment Entry</th>
											<th>Posting Date</th>
											<th>Purchase Invoice</th>
											<th>Supplier</th>
											<th>Cost Center</th>
											<th>Amount</th>
										</tr>
									</thead>
									<tbody id="not-specified-tbody">
										<tr>
											<td colspan="7" class="text-center">No data available</td>
										</tr>
									</tbody>
								</table>
							</div>
						</div>
					</div>
					
					<!-- Voucher-Wise Details Section -->
					<div id="voucher-wise-section" style="margin-top: 30px; display: none;">
						<!-- Cash Vouchers -->
						<div class="data-section" style="margin-bottom: 30px;">
							<h5 style="margin-bottom: 15px; color: #5cb85c;">
								<i class="fa fa-money"></i> Cash Payment Vouchers
							</h5>
							<div class="table-responsive">
								<table class="table table-bordered table-striped" id="cash-vouchers-table">
									<thead>
										<tr>
											<th>S.#</th>
											<th>Payment Entry</th>
											<th>Posting Date</th>
											<th>Mode of Payment</th>
											<th>Cost Center</th>
											<th>Purchase Invoice</th>
											<th>Supplier</th>
											<th>Amount</th>
										</tr>
									</thead>
									<tbody id="cash-vouchers-tbody">
										<tr>
											<td colspan="8" class="text-center">Loading data...</td>
										</tr>
									</tbody>
									<tfoot id="cash-vouchers-tfoot">
										<tr>
											<td colspan="7"><strong>Total</strong></td>
											<td class="text-right"><strong id="cash-vouchers-total">0.00</strong></td>
										</tr>
									</tfoot>
								</table>
							</div>
						</div>
						
						<!-- Cheque Vouchers -->
						<div class="data-section" style="margin-bottom: 30px;">
							<h5 style="margin-bottom: 15px; color: #337ab7;">
								<i class="fa fa-bank"></i> Cheque Payment Vouchers
							</h5>
							<div class="table-responsive">
								<table class="table table-bordered table-striped" id="cheque-vouchers-table">
									<thead>
										<tr>
											<th>S.#</th>
											<th>Payment Entry</th>
											<th>Posting Date</th>
											<th>Mode of Payment</th>
											<th>Cost Center</th>
											<th>Purchase Invoice</th>
											<th>Supplier</th>
											<th>Amount</th>
										</tr>
									</thead>
									<tbody id="cheque-vouchers-tbody">
										<tr>
											<td colspan="8" class="text-center">Loading data...</td>
										</tr>
									</tbody>
									<tfoot id="cheque-vouchers-tfoot">
										<tr>
											<td colspan="7"><strong>Total</strong></td>
											<td class="text-right"><strong id="cheque-vouchers-total">0.00</strong></td>
										</tr>
									</tfoot>
								</table>
							</div>
						</div>
					</div>
				</div>
			`;
			
			$(me.page.body).html(html);

			$(me.page.body).find('canvas[id^="chart-"]').each(function() {
				let canvas = $(this);
				let chartHeight = parseInt(canvas.css('height'), 10) || 350;
				canvas.wrap(
					`<div class="chart-canvas-wrapper" style="position: relative; width: 100%; height: ${chartHeight}px;"></div>`
				);
				canvas.css({ width: '100%', height: '100%' });
			});

			me.from_date_control = frappe.ui.form.make_control({
				parent: $(me.page.body).find('#from-date-control'),
				df: {
					fieldname: 'from_date',
					fieldtype: 'Date',
					label: 'From Date'
				},
				render_input: true
			});
			me.to_date_control = frappe.ui.form.make_control({
				parent: $(me.page.body).find('#to-date-control'),
				df: {
					fieldname: 'to_date',
					fieldtype: 'Date',
					label: 'To Date'
				},
				render_input: true
			});
			me.from_date_control.set_value(me.filters.from_date);
			me.to_date_control.set_value(me.filters.to_date);
			
			// Add CSS for expandable rows
			if (!$('#expense-head-styles').length) {
				let styles = `
					<style id="expense-head-styles">
						.expense-head-row:hover {
							background-color: #f5f5f5 !important;
						}
						.expense-head-row.expanded {
							background-color: #e8f4f8 !important;
						}
						.expand-icon {
							display: inline-block;
							width: 12px;
						}
						.period-row:hover {
							background-color: #f0f8ff !important;
						}
						.period-row.expanded {
							background-color: #e6f3ff !important;
						}
						.period-expand-icon {
							display: inline-block;
							width: 12px;
						}
						.invoice-details-row {
							background-color: #f8f9fa !important;
						}
						.invoice-details-row.date-group-header {
							background-color: #e9ecef !important;
							font-weight: bold;
						}
						.invoice-details-row.invoice-row:hover {
							background-color: #ffffff !important;
						}
					</style>
				`;
				$('head').append(styles);
			}
			
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
			
			$('#print-report').on('click', function() {
				me.print_report();
			});
			
			$('#toggle-voucher-details').on('click', function() {
				me.toggle_voucher_details();
			});

			$('#toggle-detail-report').on('click', function() {
				let button = $(this);
				let isExpanded = button.attr('aria-expanded') === 'true';
				$('#detail-table-content').stop(true, true).slideToggle(150);
				button.attr('aria-expanded', String(!isExpanded));
				button.html(
					!isExpanded
						? '<i class="fa fa-chevron-up"></i> Collapse'
						: '<i class="fa fa-chevron-down"></i> Expand'
				);
				$('#toggle-all-period-details').toggle(!isExpanded);

				if (isExpanded) {
					$('.period-row.expanded').each(function() {
						let row = $(this);
						row.removeClass('expanded');
						row.find('.period-expand-icon').removeClass('fa-chevron-down').addClass('fa-chevron-right');
						row.nextUntil('.period-row', '.invoice-details-row').remove();
					});
					me.update_period_expand_all_button();
				}
			});

			$('#toggle-all-period-details').on('click', function() {
				let visibleRows = $('.period-row:visible');
				let shouldCollapse = visibleRows.length > 0 && visibleRows.filter('.expanded').length === visibleRows.length;
				visibleRows.filter(shouldCollapse ? '.expanded' : ':not(.expanded)').each(function() {
					$(this).trigger('click', [{ skipScroll: true }]);
				});
				me.update_period_expand_all_button();
			});
			
			// Load initial data
			setTimeout(() => {
				me.load_data();
			}, 500);
		}
		
		apply_filters() {
			let me = this;
			
			me.filters.from_date = me.from_date_control.get_value();
			me.filters.to_date = me.to_date_control.get_value();
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
			
			me.from_date_control.set_value(me.filters.from_date);
			me.to_date_control.set_value(me.filters.to_date);
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
			$(me.page.body).find('.chart-data-report').remove();
			
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
						
					console.log('[Load Data] Full data received:', me.data);
					console.log('[Load Data] Department payment data:', me.data.department_payment_data);
					if (me.data.department_payment_data && me.data.department_payment_data.length > 0) {
						console.log('[Load Data] Department payment data details:', JSON.stringify(me.data.department_payment_data, null, 2));
						console.log('[Load Data] First department item:', me.data.department_payment_data[0]);
					}
						
						me.render_kpis();
						me.render_summary_table();
						me.render_detail_table();
						me.setup_expense_head_handlers();
						me.setup_period_row_handlers();
					me.render_payment_table();
					me.render_charts();
					me.render_payment_charts();
					me.render_bank_usage();
					me.render_item_payment_charts();
					me.render_voucher_wise_details();
					me.schedule_chart_data_tables();
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

		schedule_chart_data_tables(attempt = 0) {
			let me = this;
			clearTimeout(me.chart_data_table_timer);
			me.chart_data_table_timer = setTimeout(() => {
				let missingCharts = me.render_chart_data_tables(attempt >= 8);
				if (missingCharts && attempt < 8) {
					me.schedule_chart_data_tables(attempt + 1);
				}
			}, 250);
		}

		render_chart_data_tables(showEmpty = false) {
			let chartMap = [
				['expense_trend', 'chart-expense-trend'],
				['top_accounts', 'chart-top-accounts'],
				['expense_vs_count', 'chart-expense-vs-count'],
				['payment_pie', 'chart-payment-pie'],
				['items_cash_pie', 'chart-items-cash-pie'],
				['items_cheque_pie', 'chart-items-cheque-pie']
			];
			let missingCharts = 0;

			chartMap.forEach(([chartKey, canvasId]) => {
				let chart = this.charts[chartKey];
				let canvas = $(this.page.body).find(`#${canvasId}`);
				if (!canvas.length) {
					return;
				}

				let report = $(this.page.body).find(`#${canvasId}-data`);
				if (!report.length) {
					report = $(`<div id="${canvasId}-data" class="chart-data-report" style="margin-top: 18px;"></div>`);
					canvas.closest('.chart-canvas-wrapper').after(report);
				}

				if (!chart || !chart.data) {
					missingCharts += 1;
					if (showEmpty) {
						report.html('<div class="text-muted text-center" style="padding: 12px;">No report data available</div>');
					}
					return;
				}
				this.render_chart_data_table(report, chart.data);
			});

			return missingCharts;
		}

		render_chart_data_table(container, chartData) {
			let labels = chartData.labels || [];
			let datasets = chartData.datasets || [];
			if (!labels.length || !datasets.length) {
				container.html('<div class="text-muted text-center" style="padding: 12px;">No report data available</div>');
				return;
			}

			let headers = ['Label', ...datasets.map((dataset, index) => dataset.label || `Value ${index + 1}`)];
			let rows = labels.map((label, rowIndex) => {
				let cells = datasets.map(dataset => {
					let value = Array.isArray(dataset.data) ? dataset.data[rowIndex] : 0;
					return this.format_chart_table_value(value, dataset.label);
				});
				return [label, ...cells];
			});

			container.html(`
				<div style="font-weight: 600; margin-bottom: 8px;">Report Data</div>
				<div class="table-responsive" style="max-height: 320px; overflow-y: auto; border: 1px solid #d1d8dd; border-radius: 6px;">
					<table class="table table-bordered table-striped" style="margin: 0; font-size: 12px;">
						<thead style="position: sticky; top: 0; background: #f8f9fa; z-index: 1;">
							<tr>${headers.map(header => `<th>${frappe.utils.escape_html(String(header))}</th>`).join('')}</tr>
						</thead>
						<tbody>
							${rows.map(row => `<tr>${row.map((cell, index) => `<td${index ? ' class="text-right"' : ''}>${frappe.utils.escape_html(String(cell ?? '-'))}</td>`).join('')}</tr>`).join('')}
						</tbody>
					</table>
				</div>
			`);
		}

		format_chart_table_value(value, datasetLabel) {
			let numericValue = Number(value || 0);
			if (/count|number/i.test(String(datasetLabel || ''))) {
				return format_number_value(numericValue);
			}
			return format_currency_value(numericValue);
		}

		render_bank_usage() {
			let panel = $('#bank-usage-panel');
			panel.html('<div class="text-center text-muted" style="padding: 20px;"><i class="fa fa-spinner fa-spin"></i> Loading bank details...</div>');
			frappe.call({
				method: 'tif_customization.tif_customization.page.procurement_expense.procurement_bank_usage.get_bank_usage',
				args: { filters: this.filters },
				callback: response => this.render_bank_usage_rows(response.message || []),
				error: () => panel.html('<div class="text-center text-danger" style="padding: 20px;">Unable to load bank details</div>')
			});
		}

		render_bank_usage_rows(rows) {
			let panel = $('#bank-usage-panel');
			if (!rows.length) {
				panel.html('<div class="text-center text-muted" style="padding: 20px;">No bank payments found for the selected filters</div>');
				return;
			}

			let totalAmount = rows.reduce((sum, row) => sum + flt(row.amount || 0), 0);
			panel.html(`
				<div class="table-responsive" style="max-height: 390px; overflow-y: auto;">
					<table class="table table-bordered table-striped" style="margin-bottom: 0; font-size: 12px;">
						<thead style="position: sticky; top: 0; background: #f8f9fa; z-index: 1;">
							<tr>
								<th>Bank Details</th>
								<th>Ledger Account</th>
								<th class="text-right">Payments</th>
								<th class="text-right">Amount Used</th>
							</tr>
						</thead>
						<tbody>
							${rows.map(row => {
								let bank = frappe.utils.escape_html(String(row.bank || 'Not Specified'));
								let accountNumber = frappe.utils.escape_html(String(row.bank_account_no || ''));
								let account = frappe.utils.escape_html(String(row.account || 'Not Specified'));
								return `
									<tr>
										<td><strong>${bank}</strong>${accountNumber ? `<br><span class="text-muted">A/C: ${accountNumber}</span>` : ''}</td>
										<td>${account}</td>
										<td class="text-right">${format_number_value(row.payment_count || 0)}</td>
										<td class="text-right"><strong>${format_currency_value(row.amount || 0)}</strong></td>
									</tr>
								`;
							}).join('')}
						</tbody>
						<tfoot>
							<tr>
								<td colspan="3"><strong>Total Bank Usage</strong></td>
								<td class="text-right"><strong>${format_currency_value(totalAmount)}</strong></td>
							</tr>
						</tfoot>
					</table>
				</div>
			`);
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
			
			// Get MR, PO, and Pending Acknowledgement counts
			let mr_count = me.data.mr_count || 0;
			let po_count = me.data.po_count || 0;
			let pending_acknowledgment_count = me.data.pending_acknowledgment_count || 0;
			
			let kpi_html = `
				<div class="col-sm-4" style="margin-bottom: 15px;">
					<div class="kpi-card" style="min-height: 122px; background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); color: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
						<h5 style="margin: 0 0 10px 0; font-size: 14px; opacity: 0.9;">Total Payments</h5>
						<h2 style="margin: 0; font-size: clamp(18px, 2vw, 28px); font-weight: bold; white-space: nowrap;">${format_currency_value(total_payment)}</h2>
						<p style="margin: 5px 0 0 0; font-size: 12px; opacity: 0.8;">${total_payment_count} Payments, ${total_invoice_count} Invoices · same total as Bank Reconciliation Expense</p>
					</div>
				</div>
				<div class="col-sm-4" style="margin-bottom: 15px;">
					<div class="kpi-card" style="min-height: 122px; background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%); color: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
						<h5 style="margin: 0 0 10px 0; font-size: 14px; opacity: 0.9;">Cash Payments</h5>
						<h2 style="margin: 0; font-size: clamp(18px, 2vw, 28px); font-weight: bold; white-space: nowrap;">${format_currency_value(total_cash)}</h2>
						<p style="margin: 5px 0 0 0; font-size: 12px; opacity: 0.8;">${((total_cash / total_payment) * 100).toFixed(1) || 0}% of Total</p>
					</div>
				</div>
				<div class="col-sm-4" style="margin-bottom: 15px;">
					<div class="kpi-card" style="min-height: 122px; background: linear-gradient(135deg, #fa709a 0%, #fee140 100%); color: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
						<h5 style="margin: 0 0 10px 0; font-size: 14px; opacity: 0.9;">Cheque Payments</h5>
						<h2 style="margin: 0; font-size: clamp(18px, 2vw, 28px); font-weight: bold; white-space: nowrap;">${format_currency_value(total_other)}</h2>
						<p style="margin: 5px 0 0 0; font-size: 12px; opacity: 0.8;">${((total_other / total_payment) * 100).toFixed(1) || 0}% of Total</p>
					</div>
				</div>
				<div class="col-sm-6" style="margin-bottom: 15px;">
					<div class="kpi-card" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
						<h5 style="margin: 0 0 10px 0; font-size: 14px; opacity: 0.9;">Total Material Requests</h5>
						<h2 style="margin: 0; font-size: 28px; font-weight: bold;">${format_number_value(mr_count)}</h2>
						<p style="margin: 5px 0 0 0; font-size: 12px; opacity: 0.8;">MRs Created</p>
					</div>
				</div>
				<div class="col-sm-6" style="margin-bottom: 15px;">
					<div class="kpi-card" style="background: linear-gradient(135deg, #f093fb 0%, #4facfe 100%); color: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
						<h5 style="margin: 0 0 10px 0; font-size: 14px; opacity: 0.9;">Total Purchase Invoices</h5>
						<h2 style="margin: 0; font-size: 28px; font-weight: bold;">${format_number_value(po_count)}</h2>
						<p style="margin: 5px 0 0 0; font-size: 12px; opacity: 0.8;">POs Created</p>
					</div>
				</div>
			`;
			
			$('#kpi-section').html(kpi_html);
		}

		build_summary_hierarchy(summary) {
			const nodes = new Map();

			const ensure_node = (id, name) => {
				if (!id) return null;
				if (!nodes.has(id)) {
					nodes.set(id, {
						id: id,
						name: name || id,
						parent_id: null,
						children: [],
						lft: null,
						direct_amount: 0,
						direct_count: 0,
						total_amount: 0,
						total_count: 0,
						has_direct_data: false,
						descendant_cost_centers: [],
					});
				}
				const node = nodes.get(id);
				if (!node.name && name) node.name = name;
				return node;
			};

			(summary || []).forEach((row) => {
				const ancestry = Array.isArray(row.ancestry) ? row.ancestry : [];

				if (ancestry.length) {
					let prevId = null;
					ancestry.forEach((entry) => {
						const id = entry.id;
						const name = entry.name || entry.id;
						const node = ensure_node(id, name);
						node.lft = entry.lft ?? node.lft;

						if (prevId && prevId !== id) {
							node.parent_id = prevId;
						}
						prevId = id;
					});

					const leaf = ensure_node(
						row.cost_center || ancestry[ancestry.length - 1].id,
						row.cost_center_name || ancestry[ancestry.length - 1].name
					);
					leaf.lft = row.lft ?? leaf.lft;
					leaf.direct_amount += flt(row.po_amount || 0);
					leaf.direct_count += cint(row.po_count || 0);
					leaf.has_direct_data = true;
					return;
				}

				const cc_id = row.cost_center || row.cost_center_name || "Not Set";
				const cc_name = row.cost_center_name || row.cost_center || "Not Set";
				const parent_id = row.parent_cost_center;
				const parent_name = row.parent_cost_center_name || row.parent_cost_center;

				const node = ensure_node(cc_id, cc_name);
				node.lft = row.lft ?? node.lft;
				node.direct_amount += flt(row.po_amount || 0);
				node.direct_count += cint(row.po_count || 0);
				node.has_direct_data = true;

				if (parent_id && parent_id !== cc_id) {
					node.parent_id = parent_id;
					ensure_node(parent_id, parent_name || parent_id);
				}
			});

			nodes.forEach((node) => {
				if (node.parent_id && nodes.has(node.parent_id)) {
					nodes.get(node.parent_id).children.push(node);
				}
			});

			const compute_totals = (node, stack = new Set()) => {
				if (stack.has(node.id)) return { amount: 0, count: 0 };
				stack.add(node.id);

				let amount = node.direct_amount;
				let count = node.direct_count;

				node.children.forEach((child) => {
					const child_totals = compute_totals(child, stack);
					amount += child_totals.amount;
					count += child_totals.count;
				});

				node.total_amount = amount;
				node.total_count = count;
				stack.delete(node.id);
				return { amount, count };
			};

			const collect_descendants = (node, stack = new Set()) => {
				if (stack.has(node.id)) return [];
				stack.add(node.id);

				let ids = node.has_direct_data ? [node.id] : [];
				node.children.forEach((child) => {
					ids = ids.concat(collect_descendants(child, stack));
				});

				node.descendant_cost_centers = [...new Set(ids)];
				stack.delete(node.id);
				return node.descendant_cost_centers;
			};

			const roots = [];
			nodes.forEach((node) => {
				if (!node.parent_id || !nodes.has(node.parent_id)) {
					roots.push(node);
				}
			});

			const sort_nodes = (list) => {
				list.sort((a, b) => {
					if (a.lft != null && b.lft != null) return a.lft - b.lft;
					if (a.lft != null) return -1;
					if (b.lft != null) return 1;
					return (a.name || "").localeCompare(b.name || "");
				});
				list.forEach((node) => sort_nodes(node.children));
			};

			roots.forEach((root) => compute_totals(root));
			roots.forEach((root) => collect_descendants(root));
			sort_nodes(roots);

			const flattened = [];
			const flatten = (node, depth) => {
				flattened.push({
					node_id: node.id,
					parent_id: node.parent_id || "",
					name: node.name || node.id,
					depth: depth,
					po_amount: node.total_amount,
					po_count: node.total_count,
					has_children: node.children.length > 0,
					cost_centers: node.descendant_cost_centers || [],
				});
				node.children.forEach((child) => flatten(child, depth + 1));
			};

			roots.forEach((root) => flatten(root, 0));
			return flattened;
		}

		apply_summary_tree_visibility() {
			const openMap = {};
			$('#summary-tbody tr.expense-head-row').each(function() {
				const $row = $(this);
				const nodeId = $row.data('node-id');
				openMap[nodeId] = !!$row.data('open');
			});

			const shouldShow = (nodeId) => {
				let $row = $(`#summary-tbody tr.expense-head-row[data-node-id="${nodeId}"]`);
				if (!$row.length) return true;
				let parentId = $row.data('parent-id');
				while (parentId) {
					if (!openMap[parentId]) return false;
					$row = $(`#summary-tbody tr.expense-head-row[data-node-id="${parentId}"]`);
					parentId = $row.length ? $row.data('parent-id') : null;
				}
				return true;
			};

			$('#summary-tbody tr.expense-head-row').each(function() {
				const $row = $(this);
				const nodeId = $row.data('node-id');
				if (shouldShow(nodeId)) {
					$row.show();
				} else {
					$row.hide();
				}
			});
		}

		filter_detail_rows_by_cost_centers(costCenterList) {
			const selected = new Set((costCenterList || []).filter(Boolean));
			let matchedCount = 0;

			if (!selected.size) {
				$('#detail-tbody tr[data-cost-center]').show();
				return;
			}

			$('#detail-tbody tr[data-cost-center]').each(function() {
				const $detailRow = $(this);
				const detailCostCenter = $detailRow.data('cost-center');
				if (selected.has(detailCostCenter)) {
					$detailRow.css('display', 'table-row');
					matchedCount++;
				} else {
					$detailRow.css('display', 'none');
				}
			});

			const $detailTable = $('#detail-table');
			const $detailContent = $('#detail-table-content');
			if ($detailTable.length && $detailContent.is(':visible') && matchedCount > 0) {
				$('html, body').animate({
					scrollTop: $detailTable.offset().top - 100
				}, 300);
			}
		}
		
		render_summary_table() {
			let me = this;
			let summary = me.data.summary_data || [];
			let tbody = $('#summary-tbody');
			tbody.empty();
			
			console.log('[Render Summary Table] Summary data length:', summary.length);
			
			if (summary.length === 0) {
				console.log('[Render Summary Table] No summary data found');
				tbody.append('<tr><td colspan="3" class="text-center">No data found</td></tr>');
			} else {
				const hierarchy_rows = me.build_summary_hierarchy(summary);
				let totalAmount = 0;
				let totalCount = 0;

				hierarchy_rows.forEach((row) => {
					const indent_px = row.depth * 18;
					const label = frappe.utils.escape_html(row.name || '-');
					const defaultOpen = row.depth === 0;
					const icon_class = row.has_children
						? (defaultOpen ? 'fa-chevron-down' : 'fa-chevron-right')
						: 'fa-circle';
					const icon_style = row.has_children
						? 'margin-right: 8px; transition: transform 0.2s;'
						: 'margin-right: 10px; font-size: 8px; color: #9aa0a6;';

					if (row.depth === 0) {
						totalAmount += flt(row.po_amount || 0);
						totalCount += cint(row.po_count || 0);
					}

					let tr = $(`
						<tr class="expense-head-row ${row.depth === 0 ? 'summary-root-row' : ''}" data-node-id="${row.node_id}" data-parent-id="${row.parent_id}" style="cursor: pointer;">
							<td>
								<span style="padding-left: ${indent_px}px;">
									<i class="fa ${icon_class} expand-icon" style="${icon_style}"></i>
									${label}
								</span>
							</td>
							<td class="text-right">${format_currency_value(row.po_amount || 0)}</td>
							<td class="text-right">${format_number_value(row.po_count || 0)}</td>
						</tr>
					`);
					tr.data('cost-centers-list', row.cost_centers || []);
					tr.data('has-children', row.has_children);
					tr.data('open', defaultOpen);
					tbody.append(tr);
				});

				tbody.append(`
					<tr class="summary-total-row">
						<td><strong>Total</strong></td>
						<td class="text-right"><strong>${format_currency_value(totalAmount)}</strong></td>
						<td class="text-right"><strong>${format_number_value(totalCount)}</strong></td>
					</tr>
				`);

				me.apply_summary_tree_visibility();
				
				console.log('[Render Summary Table] Total rows rendered:', tbody.find('tr').length);
			}
		}
		
		setup_expense_head_handlers() {
			let me = this;
			console.log('[Expense Head Handlers] Setting up hierarchy click handlers...');

			$('.expense-head-row').off('click').on('click', function() {
				const $row = $(this);
				const $icon = $row.find('.expand-icon');
				const hasChildren = !!$row.data('has-children');
				const targetCostCenters = new Set(($row.data('cost-centers-list') || []).filter(Boolean));
				const isOpen = !!$row.data('open');

				if (hasChildren) {
					$row.data('open', !isOpen);
					if (!isOpen) {
						$icon.removeClass('fa-chevron-right').addClass('fa-chevron-down');
					} else {
						$icon.removeClass('fa-chevron-down').addClass('fa-chevron-right');
					}
					me.apply_summary_tree_visibility();
				}

				me.filter_detail_rows_by_cost_centers([...targetCostCenters]);
			});
		}
		
		setup_period_row_handlers() {
			let me = this;
			console.log('[Period Row Handlers] Setting up click handlers...');
			
			// Remove existing handlers to avoid duplicates
			$('.period-row').off('click');
			
			$('.period-row').on('click', function(_event, options = {}) {
				let $row = $(this);
				let period = $row.data('period');
				let costCenter = $row.data('cost-center');
				let $icon = $row.find('.period-expand-icon');
				
				console.log('[Period Row Click] Period:', period, 'Cost Center:', costCenter);
				
				if ($row.hasClass('expanded')) {
					// Collapse
					console.log('[Period Row Click] Collapsing...');
					$row.removeClass('expanded');
					$icon.removeClass('fa-chevron-down').addClass('fa-chevron-right');
					$row.nextUntil('.period-row', '.invoice-details-row').remove();
				} else {
					// Expand - fetch and show invoice details
					console.log('[Period Row Click] Expanding...');
					
					// Expand this row
					$row.addClass('expanded');
					$icon.removeClass('fa-chevron-right').addClass('fa-chevron-down');
					
					// Show loading state
					let loadingRow = $(`
						<tr class="invoice-details-row">
							<td colspan="4" style="background-color: #f8f9fa; padding: 20px;">
								<div class="text-center">
									<i class="fa fa-spinner fa-spin"></i> Loading invoice details...
								</div>
							</td>
						</tr>
					`);
					$row.after(loadingRow);
					
					// Fetch invoice details
					frappe.call({
						method: 'tif_customization.tif_customization.page.procurement_expense.procurement_expense.get_invoice_details_by_period',
						args: {
							filters: {
								period: period,
								cost_center: costCenter,
								period_type: me.filters.period_type || 'monthly'
							}
						},
						callback: function(r) {
							loadingRow.remove();
							if (!$row.hasClass('expanded')) {
								return;
							}
							
							if (r.exc || r.message.error) {
								console.error('[Period Row Click] Error fetching invoice details:', r.exc || r.message.error);
								let errorRow = $(`
									<tr class="invoice-details-row">
										<td colspan="4" style="background-color: #fff3cd; padding: 20px; color: #856404;">
											<div class="text-center">
												<i class="fa fa-exclamation-triangle"></i> Error loading invoice details. Please try again.
											</div>
										</td>
									</tr>
								`);
								$row.after(errorRow);
								return;
							}
							
							let invoiceData = r.message.data || [];
							console.log('[Period Row Click] Received invoice data:', invoiceData.length, 'date groups');
							
							if (invoiceData.length === 0) {
								let noDataRow = $(`
									<tr class="invoice-details-row">
										<td colspan="4" style="background-color: #f8f9fa; padding: 20px;">
											<div class="text-center text-muted">
												No invoice details found for this period.
											</div>
										</td>
									</tr>
								`);
								$row.after(noDataRow);
								return;
							}
							
							// Build invoice details HTML
							let detailsHtml = '';
							
							invoiceData.forEach((dateGroup) => {
								let date = dateGroup.date;
								let invoices = dateGroup.invoices || [];
								
								detailsHtml += `
									<tr class="invoice-details-row date-group-header">
										<td colspan="4" style="background-color: #e9ecef; padding: 10px; font-weight: bold; border-left: 4px solid #007bff;">
											<i class="fa fa-calendar"></i> ${date} (${invoices.length} invoice${invoices.length !== 1 ? 's' : ''})
										</td>
									</tr>
								`;
								
								invoices.forEach((invoice) => {
									let invoiceName = invoice.invoice_name || '-';
									let supplier = invoice.supplier || '-';
									let grandTotal = parseFloat(invoice.grand_total || 0);
									let postingDate = invoice.posting_date || invoice.transaction_date || '-';
									let billNo = invoice.bill_no || '-';
									let billDate = invoice.bill_date || '-';
									let status = invoice.status || '-';
									let payments = invoice.payments || [];
									
									detailsHtml += `
										<tr class="invoice-details-row invoice-row">
											<td style="padding-left: 40px; background-color: #ffffff;">
												<div style="margin-bottom: 5px;">
													<strong>
														<a href="/app/purchase-invoice/${invoiceName}" target="_blank" style="color: #007bff;">
															${invoiceName}
														</a>
													</strong>
												</div>
												<div style="font-size: 11px; color: #666;">
													Posting: ${postingDate} | Bill: ${billNo} ${billDate ? '(' + billDate + ')' : ''} | Status: ${status}
												</div>
											</td>
											<td style="background-color: #ffffff;">
												${supplier}
											</td>
											<td class="text-right" style="background-color: #ffffff;">
												${format_currency_value(grandTotal)}
											</td>
											<td style="background-color: #ffffff;">
												${payments.length > 0 ? `
													<div style="font-size: 11px;">
														${payments.map(p => `
															<div style="margin-bottom: 3px;">
																<a href="/app/payment-entry/${p.payment_entry}" target="_blank" style="color: #28a745;">
																	${p.payment_entry}
																</a>
																(${p.payment_date || '-'}) - ${format_currency_value(parseFloat(p.payment_amount || p.paid_amount || 0))}
																<br>
																<span style="color: #666; font-size: 10px;">${p.mode_of_payment || 'Not Specified'}</span>
															</div>
														`).join('')}
													</div>
												` : '<span class="text-muted">No payments</span>'}
											</td>
										</tr>
									`;
								});
							});
							
							let detailsRow = $(detailsHtml);
							$row.after(detailsRow);
							
							// Scroll to the expanded row
							if (!options.skipScroll) {
								setTimeout(() => {
									$('html, body').animate({
										scrollTop: $row.offset().top - 100
									}, 300);
								}, 100);
							}
						},
						error: function(r) {
							loadingRow.remove();
							if (!$row.hasClass('expanded')) {
								return;
							}
							console.error('[Period Row Click] API call failed:', r);
							let errorRow = $(`
								<tr class="invoice-details-row">
									<td colspan="4" style="background-color: #f8d7da; padding: 20px; color: #721c24;">
										<div class="text-center">
											<i class="fa fa-exclamation-circle"></i> Failed to load invoice details. Please refresh and try again.
										</div>
									</td>
								</tr>
							`);
							$row.after(errorRow);
						}
					});
				}
				me.update_period_expand_all_button();
			});
			
			console.log('[Period Row Handlers] Click handlers setup complete');
		}

		update_period_expand_all_button() {
			let visibleRows = $('.period-row:visible');
			let allExpanded = visibleRows.length > 0 && visibleRows.filter('.expanded').length === visibleRows.length;
			$('#toggle-all-period-details').html(
				allExpanded
					? '<i class="fa fa-compress"></i> Collapse All'
					: '<i class="fa fa-expand"></i> Expand All'
			);
		}
		
		render_detail_table() {
			let me = this;
			let expense_data = me.data.expense_data || [];
			let tbody = $('#detail-tbody');
			tbody.empty();
			
			console.log('[Render Detail Table] Expense data length:', expense_data.length);
			
			if (expense_data.length === 0) {
				console.log('[Render Detail Table] No expense data found');
				tbody.append('<tr><td colspan="4" class="text-center">No data found</td></tr>');
			} else {
				// Remove duplicates by grouping by period and cost_center
				let uniqueData = {};
				expense_data.forEach((row, index) => {
					let period = row.period || '-';
					let cost_center = row.cost_center || (row.cost_center_name || '-');
					let key = `${period}_${cost_center}`;
					
					if (index < 3) {
						console.log('[Render Detail Table] Sample row', index, '- Period:', period, 'Cost Center ID:', row.cost_center, 'Cost Center Name:', row.cost_center_name);
					}
					
					if (!uniqueData[key]) {
						uniqueData[key] = {
							period: period,
							cost_center: cost_center,
							cost_center_name: row.cost_center_name || row.cost_center || '-',
							po_amount: 0,
							po_count: 0
						};
					}
					// Sum amounts and counts for duplicates
					uniqueData[key].po_amount += parseFloat(row.po_amount || 0);
					uniqueData[key].po_count += parseInt(row.po_count || 0);
				});
				
				// Convert to array and sort
				let sortedData = Object.values(uniqueData).sort((a, b) => {
					if (a.period !== b.period) {
						return a.period.localeCompare(b.period);
					}
					return (a.cost_center_name || a.cost_center).localeCompare(b.cost_center_name || b.cost_center);
				});
				
				console.log('[Render Detail Table] Unique rows after deduplication:', sortedData.length);
				console.log('[Render Detail Table] Sample unique data (first 3):', sortedData.slice(0, 3).map(r => ({ period: r.period, cost_center_id: r.cost_center, cost_center_name: r.cost_center_name })));
				
				// Render rows (visible by default, will be filtered when cost center is clicked)
				sortedData.forEach((row, index) => {
					let cost_center_key = row.cost_center || (row.cost_center_name || '-');
					let cost_center_name = row.cost_center_name || row.cost_center || '-';
					let period = row.period || '-';
					
					if (index < 3) {
						console.log('[Render Detail Table] Rendering row', index, '- Cost Center Key:', cost_center_key, 'Cost Center Name:', cost_center_name, 'Period:', period);
					}
					
					let tr = $(`
						<tr class="period-row" data-cost-center="${cost_center_key}" data-cost-center-name="${cost_center_name}" data-period="${period}" style="cursor: pointer;">
							<td>
								<i class="fa fa-chevron-right period-expand-icon" style="margin-right: 8px; transition: transform 0.2s;"></i>
								${period}
							</td>
							<td>${cost_center_name}</td>
							<td class="text-right">${format_currency_value(row.po_amount || 0)}</td>
							<td class="text-right">${format_number_value(row.po_count || 0)}</td>
						</tr>
					`);
					tbody.append(tr);
				});
				
				console.log('[Render Detail Table] Total rows rendered:', tbody.find('tr').length);
				
				// Setup period row click handlers
				me.setup_period_row_handlers();
				me.update_period_expand_all_button();
			}
		}
		
		render_payment_table() {
			let me = this;
			let payment_data = me.data.payment_data || [];
			let not_specified_details = me.data.not_specified_details || [];
			let tbody = $('#payment-tbody');
			tbody.empty();
			
			if (payment_data.length === 0) {
				tbody.append('<tr><td colspan="8" class="text-center">No payment entry data found for Purchase Invoices</td></tr>');
				$('#payment-cash-total').text('0.00');
				$('#payment-other-total').text('0.00');
				$('#payment-total-amount').text('0.00');
				$('#payment-count-total').text('0');
				$('#payment-invoice-count-total').text('0');
				$('#not-specified-details-section').hide();
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
					let mode_of_payment = row.mode_of_payment || 'Not Specified';
					
					totals.cash += cash_amt;
					totals.other += other_amt;
					totals.total += total_amt;
					totals.count += payment_count;
					totals.invoice_count += invoice_count;
					
					let tr = $(`
						<tr>
							<td>${s_no}</td>
							<td><strong>${mode_of_payment}</strong></td>
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
				
				// Render "Not Specified" details table if data exists
				if (not_specified_details && not_specified_details.length > 0) {
					me.render_not_specified_details(not_specified_details);
				} else {
					$('#not-specified-details-section').hide();
				}
			}
		}
		
		render_not_specified_details(details) {
			let me = this;
			let tbody = $('#not-specified-tbody');
			tbody.empty();
			
			if (details.length === 0) {
				tbody.append('<tr><td colspan="7" class="text-center">No "Not Specified" payment entries found</td></tr>');
				$('#not-specified-details-section').hide();
			} else {
				let s_no = 1;
				details.forEach(row => {
					let tr = $(`
						<tr>
							<td>${s_no}</td>
							<td>
								<a href="/app/payment-entry/${row.payment_entry}" target="_blank" style="color: #007bff;">
									${row.payment_entry || '-'}
								</a>
							</td>
							<td>${row.posting_date || '-'}</td>
							<td>
								<a href="/app/purchase-invoice/${row.pi_name}" target="_blank" style="color: #007bff;">
									${row.pi_name || '-'}
								</a>
							</td>
							<td>${row.supplier || '-'}</td>
							<td>${row.cost_center || '-'}</td>
							<td class="text-right">${format_currency_value(row.amount || 0)}</td>
						</tr>
					`);
					tbody.append(tr);
					s_no++;
				});
				$('#not-specified-details-section').show();
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
													return `Purchase Invoice Expense: ${format_currency_value(context.parsed.y)}`;
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
			// Summary Pie Chart by Department/Cost Center
			if (summary.length > 0) {
				// Chart should show department/group nodes only (like profitability group view),
				// not all leaf cost centers.
				const hierarchyRows = me.build_summary_hierarchy(summary);
				let chartSummary = [];

				if (hierarchyRows.length) {
					const roots = hierarchyRows.filter((r) => !r.parent_id);
					if (roots.length === 1) {
						chartSummary = hierarchyRows.filter((r) => r.parent_id === roots[0].node_id);
					}
					if (!chartSummary.length) {
						chartSummary = roots;
					}
				}

				chartSummary = (chartSummary || []).filter((r) => (r.node_id || "").toString() !== "Not Set");

				// Fallback to raw summary if hierarchy group nodes are not available.
				if (!chartSummary.length) {
					chartSummary = summary.map((s) => ({
						name: s.cost_center_name || s.cost_center || "Not Set",
						po_amount: s.po_amount || 0,
						po_count: s.po_count || 0,
					}));
				}

				let labels = chartSummary.map(s => (s.name || s.cost_center_name || s.cost_center).substring(0, 30));
				let values = chartSummary.map(s => s.po_amount || 0);
				
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
										label: 'Invoice Amount',
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
													let poCount = chartSummary[context.dataIndex]?.po_count || 0;
													return [
														`${label}: ${value}`,
														`Percentage: ${percentage}%`,
														`Invoice Count: ${format_number_value(poCount)}`
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
			
			// Monthly Comparison Chart (Department-wise with Cost Centers)
			if (summary.length > 0) {
				// Group cost centers by department
				let department_data = {};
				let cost_center_to_dept = {};
				
				// First pass: map cost centers to departments using parent_cost_center
				// Only include cost centers that have a parent (child cost centers)
				console.log('[Chart] Processing summary data for department chart. Total rows:', summary.length);
				summary.forEach((row, index) => {
					let cc_id = row.cost_center || '';
					let cc_name = row.cost_center_name || row.cost_center || 'Not Set';
					let amount = parseFloat(row.po_amount || 0);
					let parent_cc_id = row.parent_cost_center || null;
					let parent_cc_name = row.parent_cost_center_name || null;
					
					if (index < 5) {
						console.log('[Chart] Row', index, '- CC:', cc_name, 'Parent ID:', parent_cc_id, 'Parent Name:', parent_cc_name);
					}
					
					// Skip cost centers without a parent (they are departments themselves, not child cost centers)
					if (!parent_cc_id || !parent_cc_name) {
						if (index < 5) {
							console.log('[Chart] Skipping row', index, '- no parent');
						}
						return; // Skip this row
					}
					
					// Use parent_cost_center_name as department (this is the parent cost center/department)
					let dept_name = parent_cc_name;
					let dept_id = parent_cc_id;
					
					if (!department_data[dept_name]) {
						department_data[dept_name] = {
							department: dept_name,
							department_id: dept_id,
							cost_centers: {},
							total_amount: 0
						};
					}
					
					// Add this child cost center to its parent department
					department_data[dept_name].cost_centers[cc_name] = {
						name: cc_name,
						amount: amount,
						id: cc_id
					};
					department_data[dept_name].total_amount += amount;
					
					cost_center_to_dept[cc_name] = dept_name;
				});
				
				console.log('[Chart] Department data after processing:', Object.keys(department_data).length, 'departments');
				console.log('[Chart] Sample departments:', Object.keys(department_data).slice(0, 5));
				
				// Sort departments by total amount
				let departments = Object.keys(department_data).sort((a, b) => {
					return department_data[b].total_amount - department_data[a].total_amount;
				}).slice(0, 10); // Top 10 departments
				
				// Get all unique cost centers across departments (for consistent coloring)
				let all_cost_centers = [];
				departments.forEach(dept => {
					Object.keys(department_data[dept].cost_centers).forEach(cc_name => {
						if (!all_cost_centers.includes(cc_name)) {
							all_cost_centers.push(cc_name);
						}
					});
				});
				
				// Limit to top cost centers per department to avoid clutter
				let max_cost_centers_per_dept = 5;
				departments.forEach(dept => {
					let cost_centers = Object.values(department_data[dept].cost_centers);
					cost_centers.sort((a, b) => b.amount - a.amount);
					department_data[dept].cost_centers_array = cost_centers.slice(0, max_cost_centers_per_dept);
				});
				
				// Get all unique cost center names for datasets
				let unique_cost_centers = new Set();
				departments.forEach(dept => {
					department_data[dept].cost_centers_array.forEach(cc => {
						unique_cost_centers.add(cc.name);
					});
				});
				
				unique_cost_centers = Array.from(unique_cost_centers).slice(0, 8); // Max 8 cost centers for readability
				
				// Generate colors
				let colors = [
					'rgba(245, 87, 108, 0.8)', 'rgba(102, 126, 234, 0.8)', 'rgba(67, 233, 123, 0.8)', 
					'rgba(255, 193, 7, 0.8)', 'rgba(156, 39, 176, 0.8)', 'rgba(233, 30, 99, 0.8)',
					'rgba(0, 188, 212, 0.8)', 'rgba(255, 152, 0, 0.8)'
				];
				let borderColors = [
					'#f5576c', '#667eea', '#43e97b', '#ffc107', '#9c27b0', '#e91e63',
					'#00bcd4', '#ff9800'
				];
				
				// Create datasets - one dataset per cost center
				let datasets = unique_cost_centers.map((cc_name, idx) => {
					let data = departments.map(dept => {
						let cc_data = department_data[dept].cost_centers[cc_name];
						return cc_data ? cc_data.amount : 0;
					});
					
					return {
						label: cc_name.length > 25 ? cc_name.substring(0, 22) + '...' : cc_name,
						data: data,
						backgroundColor: colors[idx % colors.length],
						borderColor: borderColors[idx % borderColors.length],
						borderWidth: 2,
						borderRadius: 6
					};
				});
				
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
									labels: departments.map(dept => dept.length > 20 ? dept.substring(0, 17) + '...' : dept),
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
											label: 'Purchase Invoice Expense Amount',
											data: amounts,
											yAxisID: 'y',
											backgroundColor: 'rgba(245, 87, 108, 0.7)',
											borderColor: '#f5576c',
											borderWidth: 2,
											borderRadius: 6
										},
										{
											label: 'Invoice Count',
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
														return `Purchase Invoice Expense: ${format_currency_value(context.parsed.y)}`;
													} else {
														return `Invoice Count: ${format_number_value(context.parsed.y)}`;
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
		
		render_department_expense_chart() {
			let me = this;
			let dept_payment_data = me.data.department_payment_data || [];
			
			console.log('[Department Expense Chart] Starting render...');
			console.log('[Department Expense Chart] Raw data:', dept_payment_data);
			console.log('[Department Expense Chart] Data length:', dept_payment_data.length);
			
			// Wait for Chart.js to be available
			if (typeof Chart === 'undefined') {
				console.log('[Department Expense Chart] Chart.js not available, retrying...');
				setTimeout(() => me.render_department_expense_chart(), 200);
				return;
			}
			
			if (dept_payment_data.length === 0) {
				console.warn('[Department Expense Chart] No department payment data available');
				return;
			}
			
			// Prepare data
			let labels = dept_payment_data.map(d => d.department || 'Not Set');
			let amounts = dept_payment_data.map(d => d.payment_amount || 0);
			let payment_counts = dept_payment_data.map(d => d.payment_count || 0);
			let invoice_counts = dept_payment_data.map(d => d.invoice_count || 0);
			
			console.log('[Department Expense Chart] Labels:', labels);
			console.log('[Department Expense Chart] Amounts:', amounts);
			console.log('[Department Expense Chart] Total amount:', amounts.reduce((a, b) => a + b, 0));
			console.log('[Department Expense Chart] Non-zero amounts:', amounts.filter(a => a > 0).length);
			
			// Colors array
			let colors = [
				'rgba(245, 87, 108, 0.8)', 'rgba(102, 126, 234, 0.8)', 'rgba(67, 233, 123, 0.8)',
				'rgba(255, 193, 7, 0.8)', 'rgba(156, 39, 176, 0.8)', 'rgba(233, 30, 99, 0.8)',
				'rgba(0, 188, 212, 0.8)', 'rgba(255, 152, 0, 0.8)', 'rgba(76, 175, 80, 0.8)',
				'rgba(63, 81, 181, 0.8)', 'rgba(121, 85, 72, 0.8)', 'rgba(158, 158, 158, 0.8)'
			];
			let borderColors = [
				'#f5576c', '#667eea', '#43e97b', '#ffc107', '#9c27b0',
				'#e91e63', '#00bcd4', '#ff9800', '#4caf50', '#3f51b5',
				'#795548', '#9e9e9e'
			];
			
			// Destroy existing chart if it exists
			if (me.charts.department_expense) {
				try {
					me.charts.department_expense.destroy();
				} catch(e) {}
			}
			
			setTimeout(() => {
				try {
					let canvas = document.getElementById('chart-department-expense');
					if (!canvas) {
						console.error('[Department Expense Chart] Canvas element not found!');
						return;
					}
					
					console.log('[Department Expense Chart] Creating chart with', labels.length, 'departments');
					let ctx = canvas.getContext('2d');
					me.charts.department_expense = new Chart(ctx, {
						type: 'bar',
						data: {
							labels: labels,
							datasets: [{
								label: 'Payment Amount',
								data: amounts,
								backgroundColor: colors.slice(0, labels.length),
								borderColor: borderColors.slice(0, labels.length),
								borderWidth: 2,
								borderRadius: 6
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
										return context.dataIndex * 100;
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
											let index = context.dataIndex;
											let amount = format_currency_value(context.parsed.y);
											let paymentCount = payment_counts[index] || 0;
											let invoiceCount = invoice_counts[index] || 0;
											return [
												`Payment Amount: ${amount}`,
												`Payment Count: ${format_number_value(paymentCount)}`,
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
										font: { size: 11 },
										maxRotation: 45,
										minRotation: 45
									}
								}
							}
						}
					});
					
					console.log('[Department Expense Chart] Chart created successfully');
				} catch(e) {
					console.error('[Department Expense Chart] Error creating chart:', e);
					console.error('[Department Expense Chart] Error stack:', e.stack);
				}
			}, 2000);
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
									label: 'Total Payment Amount',
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
			
			// Cash Items Pie Chart
			if (cash_items.length > 0) {
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
										label: 'Total Cash Payment Amount',
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
			
			// Cheque Items Pie Chart
			if (cheque_items.length > 0) {
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
										label: 'Total Cheque Payment Amount',
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
		
		toggle_voucher_details() {
			let me = this;
			let section = $('#voucher-wise-section');
			let button = $('#toggle-voucher-details');
			
			if (section.is(':visible')) {
				section.slideUp();
				button.html('<i class="fa fa-list"></i> Show Voucher-Wise Details');
			} else {
				section.slideDown();
				button.html('<i class="fa fa-times"></i> Hide Voucher-Wise Details');
				// Render if data is available
				if (me.data && me.data.voucher_wise_details) {
					me.render_voucher_wise_details();
				}
			}
		}
		
		render_voucher_wise_details() {
			let me = this;
			let voucher_data = me.data.voucher_wise_details || {};
			let cash_vouchers = voucher_data.cash || [];
			let cheque_vouchers = voucher_data.cheque || [];
			
			// Render Cash Vouchers
			let cash_tbody = $('#cash-vouchers-tbody');
			cash_tbody.empty();
			
			if (cash_vouchers.length === 0) {
				cash_tbody.append('<tr><td colspan="8" class="text-center">No cash payment vouchers found</td></tr>');
			} else {
				let cash_total = 0;
				cash_vouchers.forEach((voucher, index) => {
					cash_total += flt(voucher.amount || 0);
					let tr = $(`
						<tr>
							<td>${index + 1}</td>
							<td><a href="/app/payment-entry/${voucher.payment_entry}" target="_blank">${voucher.payment_entry}</a></td>
							<td>${voucher.posting_date || '-'}</td>
							<td>${voucher.mode_of_payment || 'Not Specified'}</td>
							<td>${voucher.cost_center_name || voucher.cost_center || 'Not Set'}</td>
							<td><a href="/app/purchase-invoice/${voucher.pi_name}" target="_blank">${voucher.pi_name || '-'}</a></td>
							<td>${voucher.supplier || '-'}</td>
							<td class="text-right">${format_currency_value(voucher.amount || 0)}</td>
						</tr>
					`);
					cash_tbody.append(tr);
				});
				$('#cash-vouchers-total').text(format_currency_value(cash_total));
			}
			
			// Render Cheque Vouchers
			let cheque_tbody = $('#cheque-vouchers-tbody');
			cheque_tbody.empty();
			
			if (cheque_vouchers.length === 0) {
				cheque_tbody.append('<tr><td colspan="8" class="text-center">No cheque payment vouchers found</td></tr>');
			} else {
				let cheque_total = 0;
				cheque_vouchers.forEach((voucher, index) => {
					cheque_total += flt(voucher.amount || 0);
					let tr = $(`
						<tr>
							<td>${index + 1}</td>
							<td><a href="/app/payment-entry/${voucher.payment_entry}" target="_blank">${voucher.payment_entry}</a></td>
							<td>${voucher.posting_date || '-'}</td>
							<td>${voucher.mode_of_payment || 'Not Specified'}</td>
							<td>${voucher.cost_center_name || voucher.cost_center || 'Not Set'}</td>
							<td><a href="/app/purchase-invoice/${voucher.pi_name}" target="_blank">${voucher.pi_name || '-'}</a></td>
							<td>${voucher.supplier || '-'}</td>
							<td class="text-right">${format_currency_value(voucher.amount || 0)}</td>
						</tr>
					`);
					cheque_tbody.append(tr);
				});
				$('#cheque-vouchers-total').text(format_currency_value(cheque_total));
			}
		}
		
		print_report() {
			let me = this;
			
			// Add print styles if not already added
			if (!$('#print-styles').length) {
				let printStyles = `
					<style id="print-styles" media="print">
						@page {
							size: A4 landscape;
							margin: 1cm;
						}
						body {
							font-size: 10pt;
						}
						.filter-section,
						.btn,
						#apply-filters,
						#reset-filters,
						#export-excel,
						#print-report,
						#toggle-voucher-details,
						.panel-heading h5 {
							display: none !important;
						}
						.procurement-expense-container {
							padding: 0 !important;
						}
						.panel {
							border: 1px solid #ddd;
							margin-bottom: 15px;
							page-break-inside: avoid;
						}
						.panel-body {
							padding: 10px;
						}
						table {
							font-size: 9pt;
							width: 100%;
							border-collapse: collapse;
						}
						table th,
						table td {
							padding: 5px;
							border: 1px solid #ddd;
						}
						table th {
							background-color: #f5f5f5;
							font-weight: bold;
						}
						.kpi-card {
							page-break-inside: avoid;
							margin-bottom: 10px;
						}
						canvas {
							max-height: 200px !important;
						}
						.data-section {
							page-break-inside: avoid;
							margin-bottom: 20px;
						}
						.data-section h5 {
							font-size: 12pt;
							font-weight: bold;
							margin-bottom: 10px;
							border-bottom: 2px solid #333;
							padding-bottom: 5px;
						}
						.print-header {
							text-align: center;
							margin-bottom: 20px;
							border-bottom: 2px solid #333;
							padding-bottom: 10px;
						}
						.print-header h3 {
							margin: 0;
							font-size: 16pt;
						}
						.print-header p {
							margin: 5px 0;
							font-size: 10pt;
						}
					</style>
				`;
				$('head').append(printStyles);
			}
			
			// Add print header if not exists
			if (!$('.print-header').length) {
				let printHeader = `
					<div class="print-header">
						<h3>Procurement Expense Report</h3>
						<p>Period: ${me.filters.from_date} to ${me.filters.to_date} | Period Type: ${me.filters.period_type}</p>
						<p>Generated on: ${frappe.datetime.str_to_user(frappe.datetime.get_datetime_as_string())}</p>
					</div>
				`;
				$('.procurement-expense-container').prepend(printHeader);
			} else {
				// Update existing header
				$('.print-header h3').text('Procurement Expense Report');
				$('.print-header p').first().text(`Period: ${me.filters.from_date} to ${me.filters.to_date} | Period Type: ${me.filters.period_type}`);
				$('.print-header p').last().text(`Generated on: ${frappe.datetime.str_to_user(frappe.datetime.get_datetime_as_string())}`);
			}
			
			// Trigger print
			window.print();
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
			csv.push('Cost Center,Invoice Amount,Invoice Count');
			
			summary.forEach(row => {
				csv.push([
					row.cost_center_name || row.cost_center || '',
					row.po_amount || 0,
					row.po_count || 0
				].join(','));
			});
			
			csv.push('');
			csv.push('Detailed Expense by Period');
			csv.push('Period,Cost Center,Invoice Amount,Invoice Count');
			
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
