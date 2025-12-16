frappe.pages['courier-report'].on_page_load = function(wrapper) {
	// Clear any existing content (wrapper is a DOM element, wrap in jQuery)
	var $wrapper = $(wrapper);
	if ($wrapper.find('.courier-dashboard').length) {
		$wrapper.find('.courier-dashboard').remove();
	}
	
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Courier Expense & Operational Dashboard',
		single_column: true
	});
	
	// Initialize the dashboard
	let dashboard = new CourierDashboard(page);
	dashboard.make();
}

// Define CourierDashboard only if it doesn't exist to prevent redeclaration error
if (typeof window.CourierDashboard === 'undefined') {
	window.CourierDashboard = class CourierDashboard {
	constructor(page) {
		this.page = page;
		this.filters = {
			from_date: frappe.datetime.add_days(frappe.datetime.get_today(), -30),
			to_date: frappe.datetime.get_today(),
			cost_centers: ['8121', '8122'], // Default to cost center numbers 8121 and 8122
			customer: '',
			view_type: 'all' // 'all', 'jv', 'dn'
		};
		this.data = {};
		this.charts = {};
	}
	
	make() {
		this.setup_filters();
		this.setup_layout();
		this.load_filter_options();
		this.load_data();
	}
	
	setup_filters() {
		let me = this;
		
		// Create filter section
		let filter_html = `
			<div class="filter-section" style="background: #f8f9fa; padding: 20px; margin-bottom: 20px; border-radius: 5px;">
				<div class="row">
					<div class="col-md-3">
						<label>From Date:</label>
						<input type="date" id="from-date" class="form-control" value="${me.filters.from_date}">
					</div>
					<div class="col-md-3">
						<label>To Date:</label>
						<input type="date" id="to-date" class="form-control" value="${me.filters.to_date}">
					</div>
					<div class="col-md-3">
						<label>Cost Center:</label>
						<select id="cost-center-filter" class="form-control" multiple>
							<option value="">All Cost Centers</option>
						</select>
					</div>
					<div class="col-md-3">
						<label>Customer (Optional):</label>
						<select id="customer-filter" class="form-control">
							<option value="">All Customers</option>
						</select>
					</div>
				</div>
				<div class="row" style="margin-top: 15px;">
					<div class="col-md-12">
						<label>View Type:</label>
						<div class="btn-group" role="group">
							<button type="button" class="btn btn-sm btn-primary active" data-view="all">Show All</button>
							<button type="button" class="btn btn-sm btn-default" data-view="jv">Journal Entries</button>
							<button type="button" class="btn btn-sm btn-default" data-view="dn">Delivery Notes</button>
						</div>
						<button id="apply-filters" class="btn btn-primary" style="margin-left: 15px;">
							<i class="fa fa-filter"></i> Apply Filters
						</button>
						<button id="reset-filters" class="btn btn-secondary">
							<i class="fa fa-refresh"></i> Reset
						</button>
						<button id="export-excel" class="btn btn-success">
							<i class="fa fa-file-excel-o"></i> Export to Excel
						</button>
						<button id="print-report" class="btn btn-info">
							<i class="fa fa-print"></i> Print
						</button>
					</div>
				</div>
			</div>
		`;
		
		this.page.main.append(filter_html);
		
		// Setup event listeners
		$('#apply-filters').on('click', () => me.apply_filters());
		$('#reset-filters').on('click', () => me.reset_filters());
		$('#export-excel').on('click', () => me.export_to_excel());
		$('#print-report').on('click', () => me.print_report());
		
		// View type buttons
		$('.btn-group button[data-view]').on('click', function() {
			$('.btn-group button').removeClass('active btn-primary').addClass('btn-default');
			$(this).removeClass('btn-default').addClass('active btn-primary');
			me.filters.view_type = $(this).data('view');
			me.update_transaction_table();
		});
	}
	
	setup_layout() {
		let me = this;
		
		let layout_html = `
			<div class="courier-dashboard">
				<!-- KPI Cards Section -->
				<div class="kpi-section" style="margin-bottom: 30px;">
					<h4 style="margin-bottom: 15px;">Summary KPIs</h4>
					<div class="row" id="kpi-cards">
						<!-- KPI cards will be populated here -->
					</div>
				</div>
				
				<!-- Cost Center Summary Table -->
				<div class="summary-table-section" style="margin-bottom: 30px;">
					<h4 style="margin-bottom: 15px;">Cost Center Expense Summary</h4>
					<div class="table-responsive">
						<table class="table table-bordered table-striped" id="cost-center-table">
							<thead>
								<tr>
									<th>Cost Center</th>
									<th>Total Courier Expense</th>
									<th>No. of JVs</th>
									<th>No. of Delivery Notes</th>
									<th>Books Sent</th>
									<th>Avg. Cost / Book</th>
								</tr>
							</thead>
							<tbody id="cost-center-tbody">
							</tbody>
						</table>
					</div>
				</div>
				
				<!-- Charts Section -->
				<div class="charts-section" style="margin-bottom: 30px;">
					<h4 style="margin-bottom: 15px;">Charts & Analysis</h4>
					<div class="row">
						<div class="col-md-6" style="margin-bottom: 20px;">
							<div class="chart-container" style="background: white; padding: 15px; border-radius: 5px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
								<h5>Cost Center vs Courier Expense</h5>
								<div id="chart-expense-by-cost-center"></div>
							</div>
						</div>
						<div class="col-md-6" style="margin-bottom: 20px;">
							<div class="chart-container" style="background: white; padding: 15px; border-radius: 5px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
								<h5>Daily Courier Expense Trend</h5>
								<div id="chart-daily-trend"></div>
							</div>
						</div>
						<div class="col-md-6" style="margin-bottom: 20px;">
							<div class="chart-container" style="background: white; padding: 15px; border-radius: 5px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
								<h5>Courier Expense Share by Cost Center</h5>
								<div id="chart-expense-share"></div>
							</div>
						</div>
						<div class="col-md-6" style="margin-bottom: 20px;">
							<div class="chart-container" style="background: white; padding: 15px; border-radius: 5px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
								<h5>Books Sent per Cost Center</h5>
								<div id="chart-books-by-cost-center"></div>
							</div>
						</div>
					</div>
				</div>
				
				<!-- Transaction Log Table -->
				<div class="transaction-section" style="margin-bottom: 30px;">
					<h4 style="margin-bottom: 15px;">Transaction Log</h4>
					<div class="table-responsive">
						<table class="table table-bordered table-striped" id="transaction-table">
							<thead id="transaction-thead">
								<!-- Headers will be populated based on view type -->
							</thead>
							<tbody id="transaction-tbody">
							</tbody>
						</table>
					</div>
				</div>
				
				<!-- Book Movement Analysis -->
				<div class="book-movement-section" style="margin-bottom: 30px;">
					<h4 style="margin-bottom: 15px;">Book Movement Analysis</h4>
					<div class="row">
						<div class="col-md-6">
							<h5>Top 10 Customers by Books Sent</h5>
							<div class="table-responsive">
								<table class="table table-bordered table-striped">
									<thead>
										<tr>
											<th>Customer</th>
											<th>Books Sent</th>
										</tr>
									</thead>
									<tbody id="top-customers-tbody">
									</tbody>
								</table>
							</div>
						</div>
						<div class="col-md-6">
							<h5>Top 10 Items Sent by Quantity</h5>
							<div class="table-responsive">
								<table class="table table-bordered table-striped">
									<thead>
										<tr>
											<th>Item</th>
											<th>Quantity</th>
										</tr>
									</thead>
									<tbody id="top-items-tbody">
									</tbody>
								</table>
							</div>
						</div>
					</div>
				</div>
			</div>
		`;
		
		this.page.main.append(layout_html);
	}
	
	load_filter_options() {
		let me = this;
		
		// Load cost centers
		frappe.call({
			method: 'tif_customization.tif_customization.page.courier_report.courier_report.get_cost_centers',
			callback: function(r) {
				if (r.message) {
					let select = $('#cost-center-filter');
					r.message.forEach(cc => {
						select.append(`<option value="${cc}">${cc}</option>`);
					});
					
					// Find cost centers that match numbers 8121 and 8122
					// First, try to find by cost center number via backend
					let found_ccs = [];
					r.message.forEach(cc => {
						// Check if cost center name contains the numbers 8121 or 8122
						if (cc.includes('8121') || cc.includes('8122')) {
							found_ccs.push(cc);
							select.find(`option[value="${cc}"]`).prop('selected', true);
						}
					});
					
					// Update filters with actual cost center names (backend will handle number conversion)
					// Keep both numbers in filters - backend converts them to names
					// But also add found names to ensure they're selected
					if (found_ccs.length > 0) {
						me.filters.cost_centers = ['8121', '8122']; // Keep numbers, backend converts
					}
					
					// Trigger change to update the select UI
					select.trigger('change');
				}
			}
		});
		
		// Load customers
		frappe.call({
			method: 'tif_customization.tif_customization.page.courier_report.courier_report.get_customers',
			callback: function(r) {
				if (r.message) {
					let select = $('#customer-filter');
					r.message.forEach(customer => {
						select.append(`<option value="${customer.name}">${customer.customer_name || customer.name}</option>`);
					});
				}
			}	
		});
	}
	
	apply_filters() {
		let me = this;
		
		me.filters.from_date = $('#from-date').val();
		me.filters.to_date = $('#to-date').val();
		me.filters.cost_centers = $('#cost-center-filter').val() || [];
		me.filters.customer = $('#customer-filter').val() || '';
		
		me.load_data();
	}
	
	reset_filters() {
		let me = this;
		
		me.filters = {
			from_date: frappe.datetime.add_days(frappe.datetime.get_today(), -30),
			to_date: frappe.datetime.get_today(),
			cost_centers: ['8121', '8122'], // Reset to default cost center numbers
			customer: '',
			view_type: 'all'
		};
		
		$('#from-date').val(me.filters.from_date);
		$('#to-date').val(me.filters.to_date);
		$('#cost-center-filter').val(null).trigger('change');
		$('#customer-filter').val('');
		$('.btn-group button[data-view="all"]').click();
		
		me.load_data();
	}
	
	load_data() {
		let me = this;
		
		frappe.call({
			method: 'tif_customization.tif_customization.page.courier_report.courier_report.get_courier_report_data',
			args: {
				filters: me.filters
			},
			callback: function(r) {
				if (r.message && !r.message.error) {
					me.data = r.message;
					me.render_kpis();
					me.render_cost_center_table();
					me.render_charts();
					me.render_transaction_table();
					me.render_book_movement();
				} else {
					frappe.show_alert({
						message: r.message?.error || 'Error loading data',
						indicator: 'red'
					});
				}
			}
		});
	}
	
	render_kpis() {
		let me = this;
		let kpi_data = me.data.kpi_data || {};
		
		let kpi_html = `
			<div class="col-md-3">
				<div class="kpi-card" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
					<h5 style="margin: 0 0 10px 0; font-size: 14px; opacity: 0.9;">Total Courier Expense</h5>
					<h2 style="margin: 0; font-size: 28px; font-weight: bold;">${format_currency_value(kpi_data.total_courier_expense || 0)}</h2>
				</div>
			</div>
			<div class="col-md-3">
				<div class="kpi-card" style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
					<h5 style="margin: 0 0 10px 0; font-size: 14px; opacity: 0.9;">Total Delivery Notes</h5>
					<h2 style="margin: 0; font-size: 28px; font-weight: bold;">${format_number_value(kpi_data.total_delivery_notes || 0)}</h2>
				</div>
			</div>
			<div class="col-md-3">
				<div class="kpi-card" style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); color: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
					<h5 style="margin: 0 0 10px 0; font-size: 14px; opacity: 0.9;">Total Books Sent</h5>
					<h2 style="margin: 0; font-size: 28px; font-weight: bold;">${format_number_value(kpi_data.total_books_sent || 0)}</h2>
				</div>
			</div>
			<div class="col-md-3">
				<div class="kpi-card" style="background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%); color: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
					<h5 style="margin: 0 0 10px 0; font-size: 14px; opacity: 0.9;">Total JVs Created</h5>
					<h2 style="margin: 0; font-size: 28px; font-weight: bold;">${format_number_value(kpi_data.total_jvs_created || 0)}</h2>
				</div>
			</div>
			<div class="col-md-3" style="margin-top: 15px;">
				<div class="kpi-card" style="background: linear-gradient(135deg, #fa709a 0%, #fee140 100%); color: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
					<h5 style="margin: 0 0 10px 0; font-size: 14px; opacity: 0.9;">Avg. Cost Per Book</h5>
					<h2 style="margin: 0; font-size: 28px; font-weight: bold;">${format_currency_value(kpi_data.avg_cost_per_book || 0)}</h2>
				</div>
			</div>
			<div class="col-md-3" style="margin-top: 15px;">
				<div class="kpi-card" style="background: linear-gradient(135deg, #30cfd0 0%, #330867 100%); color: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
					<h5 style="margin: 0 0 10px 0; font-size: 14px; opacity: 0.9;">Customers Served</h5>
					<h2 style="margin: 0; font-size: 28px; font-weight: bold;">${format_number_value(kpi_data.total_customers_served || 0)}</h2>
				</div>
			</div>
		`;
		
		$('#kpi-cards').html(kpi_html);
	}
	
	render_cost_center_table() {
		let me = this;
		let summary = me.data.cost_center_summary || [];
		
		let tbody = $('#cost-center-tbody');
		tbody.empty();
		
		if (summary.length === 0) {
			tbody.append('<tr><td colspan="6" class="text-center">No data available</td></tr>');
			return;
		}
		
		summary.forEach(row => {
			let tr = $(`
				<tr>
					<td>${row.cost_center || '-'}</td>
					<td class="text-right">${format_currency_value(row.total_expense || 0)}</td>
					<td class="text-right">${format_number_value(row.jv_count || 0)}</td>
					<td class="text-right">${format_number_value(row.dn_count || 0)}</td>
					<td class="text-right">${format_number_value(row.books_sent || 0)}</td>
					<td class="text-right">${format_currency_value(row.avg_cost_per_book || 0)}</td>
				</tr>
			`);
			tbody.append(tr);
		});
	}
	
	render_charts() {
		let me = this;
		
		// Expense by Cost Center - Bar Chart
		let expense_data = me.data.expense_by_cost_center || [];
		if (expense_data.length > 0) {
			// Filter out undefined/null values and ensure numeric values
			let valid_data = expense_data.filter(d => {
				if (!d) return false;
				if (!d.cost_center || d.cost_center === 'undefined' || d.cost_center === 'null') return false;
				let expense = flt(d.expense);
				return !isNaN(expense) && expense !== null && expense !== undefined && expense !== 'undefined' && expense !== 'null';
			});
			
			if (valid_data.length > 0) {
				let chart_data = {
					labels: valid_data.map(d => {
						let ccStr = String(d.cost_center || '');
						return ccStr && ccStr !== 'undefined' && ccStr !== 'null' ? ccStr : '';
					}).filter(label => label !== ''),
					datasets: [{
						name: 'Courier Expense',
						values: valid_data.map(d => {
							let val = flt(d.expense);
							if (isNaN(val) || val === null || val === undefined || val === 'undefined' || val === 'null') {
								return 0;
							}
							return val;
						}).filter(val => val !== undefined && val !== null && !isNaN(val))
					}]
				};
				
				// Ensure labels and values arrays have the same length
				if (chart_data.labels.length !== chart_data.datasets[0].values.length) {
					let minLength = Math.min(chart_data.labels.length, chart_data.datasets[0].values.length);
					chart_data.labels = chart_data.labels.slice(0, minLength);
					chart_data.datasets[0].values = chart_data.datasets[0].values.slice(0, minLength);
				}
			
				// Only create chart if we have valid data
				if (chart_data.labels.length > 0 && chart_data.datasets[0].values.length > 0) {
					// Destroy existing chart if it exists
					if (me.charts.expense_by_cost_center) {
						try {
							me.charts.expense_by_cost_center.destroy();
						} catch(e) {}
					}
					
					try {
						me.charts.expense_by_cost_center = new frappe.Chart('#chart-expense-by-cost-center', {
							title: '',
							data: chart_data,
							type: 'bar',
							colors: ['#667eea'],
							height: 300
						});
					} catch(e) {
						console.error('Error creating expense chart:', e);
						$('#chart-expense-by-cost-center').html('<p class="text-muted">Chart data unavailable</p>');
					}
				} else {
					$('#chart-expense-by-cost-center').html('<p class="text-muted">No valid data available</p>');
				}
			} else {
				$('#chart-expense-by-cost-center').html('<p class="text-muted">No data available</p>');
			}
		} else {
			$('#chart-expense-by-cost-center').html('<p class="text-muted">No data available</p>');
		}
		
		// Daily Trend - Line Chart
		let daily_data = me.data.daily_trend || [];
		if (daily_data.length > 0) {
			// Filter out undefined/null values and ensure numeric values
			let valid_data = daily_data.filter(d => {
				if (!d) return false;
				// Ensure date exists and is a valid string
				if (!d.date || d.date === 'undefined' || d.date === 'null') return false;
				// Ensure expense is a valid number
				let expense = flt(d.expense);
				return !isNaN(expense) && expense !== null && expense !== undefined && expense !== 'undefined' && expense !== 'null';
			});
			
			if (valid_data.length > 0) {
				// Ensure all values are numbers, not strings or undefined
				let chart_data = {
					labels: valid_data.map(d => {
						let dateStr = String(d.date || '');
						return dateStr && dateStr !== 'undefined' && dateStr !== 'null' ? dateStr : '';
					}).filter(label => label !== ''),
					datasets: [{
						name: 'Daily Expense',
						values: valid_data.map(d => {
							let val = flt(d.expense);
							// Ensure we return a valid number, default to 0 if invalid
							if (isNaN(val) || val === null || val === undefined || val === 'undefined' || val === 'null') {
								return 0;
							}
							return val;
						}).filter(val => val !== undefined && val !== null && !isNaN(val))
					}]
				};
				
				// Ensure labels and values arrays have the same length
				if (chart_data.labels.length !== chart_data.datasets[0].values.length) {
					let minLength = Math.min(chart_data.labels.length, chart_data.datasets[0].values.length);
					chart_data.labels = chart_data.labels.slice(0, minLength);
					chart_data.datasets[0].values = chart_data.datasets[0].values.slice(0, minLength);
				}
				
				// Only create chart if we have valid data
				if (chart_data.labels.length > 0 && chart_data.datasets[0].values.length > 0) {
					// Destroy existing chart if it exists to avoid errors
					if (me.charts.daily_trend) {
						try {
							me.charts.daily_trend.destroy();
						} catch(e) {
							// Ignore destroy errors
						}
					}
					
					try {
						me.charts.daily_trend = new frappe.Chart('#chart-daily-trend', {
							title: '',
							data: chart_data,
							type: 'line',
							colors: ['#f5576c'],
							height: 300
						});
					} catch(e) {
						console.error('Error creating daily trend chart:', e);
						$('#chart-daily-trend').html('<p class="text-muted">Chart data unavailable</p>');
					}
				} else {
					$('#chart-daily-trend').html('<p class="text-muted">No valid data available for selected period</p>');
				}
			} else {
				$('#chart-daily-trend').html('<p class="text-muted">No data available for selected period</p>');
			}
		} else {
			$('#chart-daily-trend').html('<p class="text-muted">No data available for selected period</p>');
		}
		
		// Expense Share - Pie Chart
		if (expense_data.length > 0) {
			// Filter out undefined/null values and ensure numeric values
			let valid_data = expense_data.filter(d => {
				if (!d) return false;
				if (!d.cost_center || d.cost_center === 'undefined' || d.cost_center === 'null') return false;
				let expense = flt(d.expense);
				return !isNaN(expense) && expense !== null && expense !== undefined && expense !== 'undefined' && expense !== 'null' && expense > 0;
			});
			
			if (valid_data.length > 0) {
				let chart_data = {
					labels: valid_data.map(d => {
						let ccStr = String(d.cost_center || '');
						return ccStr && ccStr !== 'undefined' && ccStr !== 'null' ? ccStr : '';
					}).filter(label => label !== ''),
					datasets: [{
						name: 'Expense Share',
						values: valid_data.map(d => {
							let val = flt(d.expense);
							if (isNaN(val) || val === null || val === undefined || val === 'undefined' || val === 'null' || val <= 0) {
								return 0;
							}
							return val;
						}).filter(val => val !== undefined && val !== null && !isNaN(val) && val > 0)
					}]
				};
				
				// Ensure labels and values arrays have the same length
				if (chart_data.labels.length !== chart_data.datasets[0].values.length) {
					let minLength = Math.min(chart_data.labels.length, chart_data.datasets[0].values.length);
					chart_data.labels = chart_data.labels.slice(0, minLength);
					chart_data.datasets[0].values = chart_data.datasets[0].values.slice(0, minLength);
				}
			
				// Only create chart if we have valid data
				if (chart_data.labels.length > 0 && chart_data.datasets[0].values.length > 0) {
					// Destroy existing chart if it exists
					if (me.charts.expense_share) {
						try {
							me.charts.expense_share.destroy();
						} catch(e) {}
					}
					
					try {
						me.charts.expense_share = new frappe.Chart('#chart-expense-share', {
							title: '',
							data: chart_data,
							type: 'pie',
							height: 300
						});
					} catch(e) {
						console.error('Error creating pie chart:', e);
						$('#chart-expense-share').html('<p class="text-muted">Chart data unavailable</p>');
					}
				} else {
					$('#chart-expense-share').html('<p class="text-muted">No valid data available</p>');
				}
			} else {
				$('#chart-expense-share').html('<p class="text-muted">No data available</p>');
			}
		} else {
			$('#chart-expense-share').html('<p class="text-muted">No data available</p>');
		}
		
		// Books by Cost Center - Bar Chart
		let books_data = me.data.books_by_cost_center || [];
		if (books_data.length > 0) {
			// Filter out undefined/null values and ensure numeric values
			let valid_data = books_data.filter(d => {
				if (!d || !d.cost_center) return false;
				let books = flt(d.books_sent);
				return !isNaN(books) && books !== null && books !== undefined;
			});
			
			if (valid_data.length > 0) {
				let chart_data = {
					labels: valid_data.map(d => String(d.cost_center || '')),
					datasets: [{
						name: 'Books Sent',
						values: valid_data.map(d => {
							let val = flt(d.books_sent);
							return isNaN(val) ? 0 : val;
						})
					}]
				};
			
				// Destroy existing chart if it exists
				if (me.charts.books_by_cost_center) {
					try {
						me.charts.books_by_cost_center.destroy();
					} catch(e) {}
				}
				
				try {
					me.charts.books_by_cost_center = new frappe.Chart('#chart-books-by-cost-center', {
						title: '',
						data: chart_data,
						type: 'bar',
						colors: ['#4facfe'],
						height: 300
					});
				} catch(e) {
					console.error('Error creating books chart:', e);
					$('#chart-books-by-cost-center').html('<p class="text-muted">Chart data unavailable</p>');
				}
			} else {
				$('#chart-books-by-cost-center').html('<p class="text-muted">No data available</p>');
			}
		} else {
			$('#chart-books-by-cost-center').html('<p class="text-muted">No data available</p>');
		}
	}
	
	render_transaction_table() {
		let me = this;
		me.update_transaction_table();
	}
	
	update_transaction_table() {
		let me = this;
		let view_type = me.filters.view_type;
		
		let thead = $('#transaction-thead');
		let tbody = $('#transaction-tbody');
		
		thead.empty();
		tbody.empty();
		
		if (view_type === 'jv' || view_type === 'all') {
			// Journal Entries
			let jv_data = me.data.journal_entries || [];
			
			if (view_type === 'jv') {
				thead.html(`
					<tr>
						<th>Posting Date</th>
						<th>JV Number</th>
						<th>Cost Center</th>
						<th>Expense Amount</th>
						<th>Remarks</th>
						<th>Created By</th>
					</tr>
				`);
				
				jv_data.forEach(row => {
					let tr = $(`
						<tr>
							<td>${row.posting_date || '-'}</td>
							<td><a href="/app/journal-entry/${row.jv_number}" target="_blank">${row.jv_number || '-'}</a></td>
							<td>${row.cost_center || '-'}</td>
							<td class="text-right">${format_currency_value(row.expense_amount || 0)}</td>
							<td>${row.remarks || '-'}</td>
							<td>${row.created_by_name || row.created_by || '-'}</td>
						</tr>
					`);
					tbody.append(tr);
				});
				
				if (jv_data.length === 0) {
					tbody.append('<tr><td colspan="6" class="text-center">No journal entries found</td></tr>');
				}
			} else {
				// Combined view - show both
				thead.html(`
					<tr>
						<th>Type</th>
						<th>Posting Date</th>
						<th>Document No.</th>
						<th>Customer</th>
						<th>Cost Center</th>
						<th>Amount / Books</th>
						<th>Remarks</th>
						<th>Created By</th>
					</tr>
				`);
				
				// Add JVs
				jv_data.forEach(row => {
					let tr = $(`
						<tr>
							<td><span class="label label-primary">JV</span></td>
							<td>${row.posting_date || '-'}</td>
							<td><a href="/app/journal-entry/${row.jv_number}" target="_blank">${row.jv_number || '-'}</a></td>
							<td>-</td>
							<td>${row.cost_center || '-'}</td>
							<td class="text-right">${format_currency_value(row.expense_amount || 0)}</td>
							<td>${row.remarks || '-'}</td>
							<td>${row.created_by_name || row.created_by || '-'}</td>
						</tr>
					`);
					tbody.append(tr);
				});
				
				// Add DNs
				let dn_data = me.data.delivery_notes || [];
				dn_data.forEach(row => {
					let tr = $(`
						<tr>
							<td><span class="label label-success">DN</span></td>
							<td>${row.posting_date || '-'}</td>
							<td><a href="/app/delivery-note/${row.delivery_note_no}" target="_blank">${row.delivery_note_no || '-'}</a></td>
							<td>${row.customer_name || row.customer || '-'}</td>
							<td>${row.cost_center || '-'}</td>
							<td class="text-right">${format_number_value(row.total_books || 0)} books</td>
							<td>-</td>
							<td>${row.created_by_name || row.created_by || '-'}</td>
						</tr>
					`);
					tbody.append(tr);
				});
				
				if (jv_data.length === 0 && dn_data.length === 0) {
					tbody.append('<tr><td colspan="8" class="text-center">No transactions found</td></tr>');
				}
			}
		} else if (view_type === 'dn') {
			// Delivery Notes
			let dn_data = me.data.delivery_notes || [];
			
			thead.html(`
				<tr>
					<th>Posting Date</th>
					<th>Delivery Note No.</th>
					<th>Customer</th>
					<th>Cost Center</th>
					<th>Total Books</th>
					<th>Created By</th>
				</tr>
			`);
			
			dn_data.forEach(row => {
				let tr = $(`
					<tr>
						<td>${row.posting_date || '-'}</td>
						<td><a href="/app/delivery-note/${row.delivery_note_no}" target="_blank">${row.delivery_note_no || '-'}</a></td>
						<td>${row.customer_name || row.customer || '-'}</td>
						<td>${row.cost_center || '-'}</td>
						<td class="text-right">${format_number_value(row.total_books || 0)}</td>
						<td>${row.created_by_name || row.created_by || '-'}</td>
					</tr>
				`);
				tbody.append(tr);
			});
			
			if (dn_data.length === 0) {
				tbody.append('<tr><td colspan="6" class="text-center">No delivery notes found</td></tr>');
			}
		}
	}
	
	render_book_movement() {
		let me = this;
		
		// Top Customers
		let top_customers = me.data.top_customers || [];
		let customers_tbody = $('#top-customers-tbody');
		customers_tbody.empty();
		
		if (top_customers.length === 0) {
			customers_tbody.append('<tr><td colspan="2" class="text-center">No data available</td></tr>');
		} else {
			top_customers.forEach((row, index) => {
				let tr = $(`
					<tr>
						<td>${row.customer_name || row.customer || '-'}</td>
						<td class="text-right">${format_number_value(row.books_sent || 0)}</td>
					</tr>
				`);
				customers_tbody.append(tr);
			});
		}
		
		// Top Items
		let top_items = me.data.top_items || [];
		let items_tbody = $('#top-items-tbody');
		items_tbody.empty();
		
		if (top_items.length === 0) {
			items_tbody.append('<tr><td colspan="2" class="text-center">No data available</td></tr>');
		} else {
			top_items.forEach((row, index) => {
				let tr = $(`
					<tr>
						<td>${row.item_name || row.item_code || '-'}</td>
						<td class="text-right">${format_number_value(row.qty || 0)}</td>
					</tr>
				`);
				items_tbody.append(tr);
			});
		}
	}
	
	export_to_excel() {
		let me = this;
		// Simple CSV export
		let csv = [];
		
		// Add KPI summary
		csv.push('Summary KPIs');
		csv.push('Total Courier Expense,' + (me.data.kpi_data?.total_courier_expense || 0));
		csv.push('Total Delivery Notes,' + (me.data.kpi_data?.total_delivery_notes || 0));
		csv.push('Total Books Sent,' + (me.data.kpi_data?.total_books_sent || 0));
		csv.push('');
		
		// Add cost center summary
		csv.push('Cost Center Summary');
		csv.push('Cost Center,Total Expense,JVs,DNs,Books Sent,Avg Cost/Book');
		(me.data.cost_center_summary || []).forEach(row => {
			csv.push(`${row.cost_center},${row.total_expense},${row.jv_count},${row.dn_count},${row.books_sent},${row.avg_cost_per_book}`);
		});
		
		// Download
		let blob = new Blob([csv.join('\n')], { type: 'text/csv' });
		let url = window.URL.createObjectURL(blob);
		let a = document.createElement('a');
		a.href = url;
		a.download = `courier_report_${me.filters.from_date}_to_${me.filters.to_date}.csv`;
		a.click();
		window.URL.revokeObjectURL(url);
	}
	
	print_report() {
		window.print();
	}
	};
}

// Create a local reference
var CourierDashboard = window.CourierDashboard;

// Helper functions - use global format_currency to avoid recursion
function format_currency_value(value) {
	if (value === null || value === undefined || value === '') {
		return '0.00';
	}
	// Use the global format_currency function (from frappe.utils.number_format)
	// which is available on window object to avoid recursion
	var currency = frappe.boot.sysdefaults.currency || 'PKR';
	var precision = cint(frappe.boot.sysdefaults.currency_precision || 2);
	value = flt(value);
	
	// Call the global format_currency function directly
	return format_currency(value, currency, precision);
}

function format_number_value(value) {
	if (value === null || value === undefined || value === '') {
		return '0';
	}
	// Format as integer using toLocaleString
	value = cint(value);
	return value.toLocaleString();
}
