frappe.pages['courier-report'].on_page_load = function(wrapper) {
	// Clear any existing content (wrapper is a DOM element, wrap in jQuery)
	var $wrapper = $(wrapper);
	if ($wrapper.find('.courier-dashboard').length) {
		$wrapper.find('.courier-dashboard').remove();
	}
	
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Courier Expense Report & Dashboard',
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
			customer: '',
			view_type: 'all' // 'all', 'jv', 'dn'
		};
		this.data = {};
		this.charts = {};
	}
	
	make() {
		this.setup_filters();
		this.setup_layout();
		this.bind_transaction_log_toggle();
		this.bind_detail_toggles();
		this.bind_cost_center_details();
		this.load_filter_options();
		this.load_data();
	}
	
	setup_filters() {
		let me = this;
		
		// Create filter section
		let filter_html = `
			<div class="filter-section" style="background: #f8f9fa; padding: 20px; margin-bottom: 20px; border-radius: 5px;">
				<div class="row">
					<div class="col-md-4">
						<label>From Date:</label>
						<input type="date" id="from-date" class="form-control" value="${me.filters.from_date}">
					</div>
					<div class="col-md-4">
						<label>To Date:</label>
						<input type="date" id="to-date" class="form-control" value="${me.filters.to_date}">
					</div>
					<div class="col-md-4">
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

	bind_detail_toggles() {
		// Use event delegation to handle dynamically rendered rows
		this.page.main.off('click', '.toggle-details').on('click', '.toggle-details', function() {
			let targetId = $(this).data('target');
			let $detailsRow = $('#' + targetId);
			if ($detailsRow.length) {
				$detailsRow.toggle();
				let isVisible = $detailsRow.is(':visible');
				$(this).text(isVisible ? 'Hide' : 'Details');
			}
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
									<th>Details</th>
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
								<h5>Monthly Courier & Transport Expense Trend</h5>
								<div id="chart-monthly-trend"></div>
							</div>
						</div>
						<div class="col-md-6" style="margin-bottom: 20px;">
							<div class="chart-container" style="background: white; padding: 15px; border-radius: 5px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
								<h5>Courier & Transport Expense Share by Cost Center</h5>
								<div id="chart-expense-share"></div>
							</div>
						</div>
						<div class="col-md-6" style="margin-bottom: 20px;">
							<div class="chart-container" style="background: white; padding: 15px; border-radius: 5px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
								<h5>Delivery Mode Distribution (Courier & Transport Expense)</h5>
								<div id="chart-delivery-mode"></div>
							</div>
						</div>
						<div class="col-md-6" style="margin-bottom: 20px;">
							<div class="chart-container" style="background: white; padding: 15px; border-radius: 5px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
								<h5>Courier Distribution (Expense Amount)</h5>
								<div id="chart-courier"></div>
							</div>
						</div>
						<div class="col-md-6" style="margin-bottom: 20px;">
							<div class="chart-container" style="background: white; padding: 15px; border-radius: 5px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
								<h5>Courier Service Distribution (Expense Amount)</h5>
								<div id="chart-courier-service"></div>
							</div>
						</div>
						<div class="col-md-6" style="margin-bottom: 20px;">
							<div class="chart-container" style="background: white; padding: 15px; border-radius: 5px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
								<h5>Courier Payment Mode Distribution (Expense Amount)</h5>
								<div id="chart-courier-payment-mode"></div>
							</div>
						</div>
						<div class="col-md-6" style="margin-bottom: 20px;">
							<div class="chart-container" style="background: white; padding: 15px; border-radius: 5px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
								<h5>Delivery Mode Distribution (By Delivery Notes)</h5>
								<div id="chart-delivery-mode-distribution"></div>
							</div>
						</div>
						<div class="col-md-6" style="margin-bottom: 20px;">
							<div class="chart-container" style="background: white; padding: 15px; border-radius: 5px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
								<h5>Item Category Expense (Count & Amount)</h5>
								<div id="chart-item-category-expense"></div>
								<div id="item-category-drilldown-links" style="margin-top: 10px;"></div>
								<div class="table-responsive" style="margin-top: 15px;">
									<table class="table table-bordered table-striped" style="font-size: 12px;">
										<thead>
											<tr>
												<th>Category</th>
												<th class="text-right">Delivery Notes</th>
												<th class="text-right">Expense Amount</th>
											</tr>
										</thead>
										<tbody id="item-category-expense-tbody">
										</tbody>
									</table>
								</div>
								<div id="item-category-drilldown-section" style="display:none; margin-top: 15px;">
									<h6 style="margin-bottom: 10px;">Category Drilldown: <span id="item-category-drilldown-title"></span></h6>
									<div class="table-responsive">
										<table class="table table-bordered table-condensed" style="font-size: 12px;">
											<thead>
												<tr>
													<th>Posting Date</th>
													<th>Delivery Note</th>
													<th>Customer</th>
													<th>Cost Center</th>
													<th class="text-right">Qty</th>
													<th>Books</th>
													<th class="text-right">Courier Expense</th>
													<th class="text-right">Transport Charges</th>
													<th class="text-right">Total Expense</th>
												</tr>
											</thead>
											<tbody id="item-category-drilldown-tbody"></tbody>
										</table>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
				
				<!-- Transaction Log Table -->
				<div class="transaction-section" style="margin-bottom: 30px;">
					<div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 15px;">
						<h4 style="margin: 0;">Transaction Log</h4>
						<button type="button" class="btn btn-default btn-sm toggle-transaction-log" aria-expanded="false">
							<i class="fa fa-chevron-down"></i> Expand
						</button>
					</div>
					<div id="transaction-log-content" style="display: none;">
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
				</div>
				
				<!-- Book Movement Analysis -->
				<div class="book-movement-section" style="margin-bottom: 30px;">
					<h4 style="margin-bottom: 15px;">Book Movement Analysis</h4>
					<div class="row">
						<div class="col-md-6">
							<h5>Top 10 Customers by Books Sent</h5>
							<div class="chart-container" style="background: white; padding: 15px; border-radius: 5px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 15px;">
								<div id="chart-top-customers"></div>
							</div>
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
							<div class="chart-container" style="background: white; padding: 15px; border-radius: 5px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 15px;">
								<div id="chart-top-items"></div>
							</div>
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

	bind_transaction_log_toggle() {
		this.page.main.off('click', '.toggle-transaction-log').on('click', '.toggle-transaction-log', function() {
			let button = $(this);
			let content = button.closest('.transaction-section').find('#transaction-log-content');
			let isExpanded = button.attr('aria-expanded') === 'true';

			content.stop(true, true).slideToggle(150);
			button.attr('aria-expanded', String(!isExpanded));
			button.html(
				!isExpanded
					? '<i class="fa fa-chevron-up"></i> Collapse'
					: '<i class="fa fa-chevron-down"></i> Expand'
			);
		});
	}
	
	load_filter_options() {
		let me = this;
		
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
		me.filters.customer = $('#customer-filter').val() || '';
		
		me.load_data();
	}
	
	reset_filters() {
		let me = this;
		
		me.filters = {
			from_date: frappe.datetime.add_days(frappe.datetime.get_today(), -30),
			to_date: frappe.datetime.get_today(),
			customer: '',
			view_type: 'all'
		};
		
		$('#from-date').val(me.filters.from_date);
		$('#to-date').val(me.filters.to_date);
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
		let item_category_data = me.data.item_category_expense || [];
		let books_expense = item_category_data.find(row => row.category === 'Books') || {};
		let general_courier_expense = item_category_data.find(row => row.category === 'General Courier Expense') || {};
		
		let cards = [
			{ label: 'Total Courier Expense', value: format_currency_value(kpi_data.total_courier_expense || 0), gradient: '#667eea, #764ba2' },
			{ label: 'Books Courier Expense', value: format_currency_value(books_expense.expense_amount || 0), subtitle: `${format_number_value(books_expense.delivery_note_count || 0)} Delivery Notes`, gradient: '#ec77ab, #7873f5' },
			{ label: 'General Courier Expense', value: format_currency_value(general_courier_expense.expense_amount || 0), subtitle: `${format_number_value(general_courier_expense.delivery_note_count || 0)} Delivery Notes`, gradient: '#2193b0, #6dd5ed' },
			{ label: 'Total Books Dispatch', value: format_number_value(kpi_data.total_books_sent || 0), gradient: '#4facfe, #00f2fe' },
			{ label: 'Total Books Disptch by Courier', value: format_number_value(kpi_data.books_sent_by_courier || 0), gradient: '#5ee7df, #b490ca' },
			{ label: 'Total Books Dispatch by Hand', value: format_number_value(kpi_data.books_sent_by_hand || 0), gradient: '#fa709a, #fee140' },

			{ label: 'Total JVs Created', value: format_number_value(kpi_data.total_jvs_created || 0), gradient: '#43e97b, #38f9d7' },
			{ label: 'Customers Served', value: format_number_value(kpi_data.total_customers_served || 0), gradient: '#30cfd0, #330867' },
			{ label: 'Total Delivery Notes', value: format_number_value(kpi_data.total_delivery_notes || 0), gradient: '#f093fb, #f5576c' },
		];

		let kpi_html = cards.map(card => `
			<div class="col-md-4" style="margin-bottom: 15px;">
				<div class="kpi-card" style="min-height: 118px; background: linear-gradient(135deg, ${card.gradient}); color: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
					<h5 style="margin: 0 0 10px 0; font-size: 14px; opacity: 0.9;">${card.label}</h5>
					<h2 style="margin: 0; font-size: 28px; font-weight: bold;">${card.value}</h2>
					${card.subtitle ? `<div style="margin-top: 6px; font-size: 12px; opacity: 0.9;">${card.subtitle}</div>` : ''}
				</div>
			</div>
		`).join('');
		
		$('#kpi-cards').html(kpi_html);
	}

	bind_cost_center_details() {
		let me = this;
		this.page.main.off('click', '.toggle-cc-details').on('click', '.toggle-cc-details', function() {
			let targetId = $(this).data('target');
			let costCenter = $(this).data('cost-center');
			let $detailsRow = $('#' + targetId);
			
			if (!$detailsRow.length) {
				return;
			}
			
			let isVisible = $detailsRow.is(':visible');
			if (isVisible) {
				$detailsRow.hide();
				$(this).text('Details');
				return;
			}
			
			$detailsRow.show();
			$(this).text('Hide');
			
			// Load details only once
			if ($detailsRow.data('loaded')) {
				return;
			}
			
			let $content = $detailsRow.find('.cc-details-content');
			$content.html('<p class="text-muted">Loading delivery notes...</p>');
			
			frappe.call({
				method: 'tif_customization.tif_customization.page.courier_report.courier_report.get_delivery_notes_for_cost_center',
				args: {
					filters: me.filters,
					cost_center: costCenter
				},
				callback: function(r) {
					let rows = r.message || [];
					$content.html(me.render_cost_center_details_table(rows));
					$detailsRow.data('loaded', true);
				},
				error: function() {
					$content.html('<p class="text-danger">Failed to load delivery note details.</p>');
				}
			});
		});
	}

	render_cost_center_table() {
		let me = this;
		let summary = me.data.cost_center_summary || [];
		
		let tbody = $('#cost-center-tbody');
		tbody.empty();
		
		if (summary.length === 0) {
			tbody.append('<tr><td colspan="7" class="text-center">No data available</td></tr>');
			return;
		}
		
		summary.forEach((row, index) => {
			let detailId = `cc-details-${me.make_safe_id(row.cost_center || index)}`;
			let tr = $(`
				<tr>
					<td>${row.cost_center || '-'}</td>
					<td class="text-right">${format_currency_value(row.total_expense || 0)}</td>
					<td class="text-right">${format_number_value(row.jv_count || 0)}</td>
					<td class="text-right">${format_number_value(row.dn_count || 0)}</td>
					<td class="text-right">${format_number_value(row.books_sent || 0)}</td>
					<td class="text-right">${format_currency_value(row.avg_cost_per_book || 0)}</td>
					<td><button type="button" class="btn btn-xs btn-default toggle-cc-details" data-target="${detailId}" data-cost-center="${row.cost_center || ''}">Details</button></td>
				</tr>
			`);
			tbody.append(tr);
			tbody.append(`
				<tr class="details-row" id="${detailId}" style="display: none;">
					<td colspan="7">
						<div class="cc-details-content" style="background: #f8f9fa; padding: 10px; border-radius: 4px;"></div>
					</td>
				</tr>
			`);
		});
	}

	render_cost_center_details_table(rows) {
		if (!rows || rows.length === 0) {
			return '<p class="text-muted" style="margin: 0;">No delivery notes found for this cost center.</p>';
		}
		
		let totalBooks = rows.reduce((acc, r) => acc + flt(r.total_books || 0), 0);
		let totalAmount = rows.reduce((acc, r) => acc + flt(r.total_amount || 0), 0);
		
		let bodyRows = rows.map(row => {
			let transportCharges = row.custom_delivery_mode === 'Transport' ? format_currency_value(row.transport_charges || 0) : '-';
			let totalAmountValue = format_currency_value(row.total_amount || 0);
			return `
				<tr>
					<td>${row.posting_date || '-'}</td>
					<td><a href="/app/delivery-note/${row.delivery_note_no}" target="_blank">${row.delivery_note_no || '-'}</a></td>
					<td>${row.customer_name || row.customer || '-'}</td>
					<td class="text-right">${format_number_value(row.total_books || 0)}</td>
					<td class="text-right">${totalAmountValue}</td>
					<td>${row.custom_delivery_mode || '-'}</td>
					<td class="text-right">${transportCharges}</td>
					<td>${row.created_by_name || row.created_by || '-'}</td>
				</tr>
			`;
		}).join('');
		
		return `
			<div style="margin-bottom: 10px;">
				<strong>Delivery Notes:</strong> ${format_number_value(rows.length)} |
				<strong>Total Books:</strong> ${format_number_value(totalBooks)} |
				<strong>Total Amount:</strong> ${format_currency_value(totalAmount)}
			</div>
			<div class="table-responsive">
				<table class="table table-bordered table-condensed" style="margin: 0; font-size: 12px;">
					<thead>
						<tr>
							<th>Posting Date</th>
							<th>Delivery Note</th>
							<th>Customer</th>
							<th class="text-right">Books</th>
							<th class="text-right">Total Amount</th>
							<th>Mode</th>
							<th class="text-right">Transport</th>
							<th>Created By</th>
						</tr>
					</thead>
					<tbody>
						${bodyRows}
					</tbody>
				</table>
			</div>
		`;
	}
	
	render_charts() {
		let me = this;
		
		// Get expense data for pie chart
		let expense_data = me.data.expense_by_cost_center || [];
		
		// Monthly Trend - Line Chart
		let monthly_data = me.data.monthly_trend || [];
		if (monthly_data.length > 0) {
			// Filter out undefined/null values and ensure numeric values
			let valid_data = monthly_data.filter(d => {
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
						// Format YYYY-MM to "Month YYYY" for better readability
						if (dateStr && dateStr !== 'undefined' && dateStr !== 'null' && dateStr.match(/^\d{4}-\d{2}$/)) {
							let [year, month] = dateStr.split('-');
							let monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
							return `${monthNames[parseInt(month) - 1]} ${year}`;
						}
						return dateStr && dateStr !== 'undefined' && dateStr !== 'null' ? dateStr : '';
					}).filter(label => label !== ''),
					datasets: [{
						name: 'Monthly Courier & Transport Expense',
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
					if (me.charts.monthly_trend) {
						try {
							me.charts.monthly_trend.destroy();
						} catch(e) {
							// Ignore destroy errors
						}
					}
					
					try {
						me.charts.monthly_trend = new frappe.Chart('#chart-monthly-trend', {
							title: '',
							data: chart_data,
							type: 'line',
							colors: ['#f5576c'],
							height: 300
						});
					} catch(e) {
						console.error('Error creating monthly trend chart:', e);
						$('#chart-monthly-trend').html('<p class="text-muted">Chart data unavailable</p>');
					}
				} else {
					$('#chart-monthly-trend').html('<p class="text-muted">No valid data available for selected period</p>');
				}
			} else {
				$('#chart-monthly-trend').html('<p class="text-muted">No data available for selected period</p>');
			}
		} else {
			$('#chart-monthly-trend').html('<p class="text-muted">No data available for selected period</p>');
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
		
		// Delivery Mode Chart
		let delivery_mode_data = me.data.delivery_mode_data || [];
		if (delivery_mode_data.length > 0) {
			let chart_data = {
				labels: delivery_mode_data.map(d => String(d.label || 'Not Set')),
				datasets: [{
					name: 'Expense Amount',
					values: delivery_mode_data.map(d => flt(d.value || 0))
				}]
			};
			
			if (me.charts.delivery_mode) {
				try {
					me.charts.delivery_mode.destroy();
				} catch(e) {}
			}
			
			try {
				me.charts.delivery_mode = new frappe.Chart('#chart-delivery-mode', {
					title: '',
					data: chart_data,
					type: 'pie',
					height: 300
				});
			} catch(e) {
				console.error('Error creating delivery mode chart:', e);
				$('#chart-delivery-mode').html('<p class="text-muted">Chart data unavailable</p>');
			}
		} else {
			$('#chart-delivery-mode').html('<p class="text-muted">No data available</p>');
		}
		
		// Courier Chart
		let courier_data = me.data.courier_data || [];
		if (courier_data.length > 0) {
			let chart_data = {
				labels: courier_data.map(d => String(d.label || 'Not Set')),
				datasets: [{
					name: 'Expense Amount',
					values: courier_data.map(d => flt(d.value || 0))
				}]
			};
			
			if (me.charts.courier) {
				try {
					me.charts.courier.destroy();
				} catch(e) {}
			}
			
			try {
				me.charts.courier = new frappe.Chart('#chart-courier', {
					title: '',
					data: chart_data,
					type: 'pie',
					height: 300
				});
			} catch(e) {
				console.error('Error creating courier chart:', e);
				$('#chart-courier').html('<p class="text-muted">Chart data unavailable</p>');
			}
		} else {
			$('#chart-courier').html('<p class="text-muted">No data available</p>');
		}
		
		// Courier Service Chart
		let courier_service_data = me.data.courier_service_data || [];
		if (courier_service_data.length > 0) {
			let chart_data = {
				labels: courier_service_data.map(d => String(d.label || 'Not Set')),
				datasets: [{
					name: 'Expense Amount',
					values: courier_service_data.map(d => flt(d.value || 0))
				}]
			};
			
			if (me.charts.courier_service) {
				try {
					me.charts.courier_service.destroy();
				} catch(e) {}
			}
			
			try {
				me.charts.courier_service = new frappe.Chart('#chart-courier-service', {
					title: '',
					data: chart_data,
					type: 'pie',
					height: 300
				});
			} catch(e) {
				console.error('Error creating courier service chart:', e);
				$('#chart-courier-service').html('<p class="text-muted">Chart data unavailable</p>');
			}
		} else {
			$('#chart-courier-service').html('<p class="text-muted">No data available</p>');
		}
		
		// Courier Payment Mode Chart
		let courier_payment_mode_data = me.data.courier_payment_mode_data || [];
		if (courier_payment_mode_data.length > 0) {
			let chart_data = {
				labels: courier_payment_mode_data.map(d => String(d.label || 'Not Set')),
				datasets: [{
					name: 'Expense Amount',
					values: courier_payment_mode_data.map(d => flt(d.value || 0))
				}]
			};
			
			if (me.charts.courier_payment_mode) {
				try {
					me.charts.courier_payment_mode.destroy();
				} catch(e) {}
			}
			
			try {
				me.charts.courier_payment_mode = new frappe.Chart('#chart-courier-payment-mode', {
					title: '',
					data: chart_data,
					type: 'pie',
					height: 300
				});
			} catch(e) {
				console.error('Error creating courier payment mode chart:', e);
				$('#chart-courier-payment-mode').html('<p class="text-muted">Chart data unavailable</p>');
			}
		} else {
			$('#chart-courier-payment-mode').html('<p class="text-muted">No data available</p>');
		}
		
		// Delivery Mode Distribution Chart (from Delivery Notes)
		let delivery_mode_distribution = me.data.delivery_mode_distribution || [];
		console.log('Delivery Mode Distribution Data:', delivery_mode_distribution);
		console.log('Data length:', delivery_mode_distribution.length);
		console.log('Full data object:', JSON.stringify(delivery_mode_distribution));
		
		if (delivery_mode_distribution && delivery_mode_distribution.length > 0) {
			// Get all valid data with count > 0
			let valid_data = delivery_mode_distribution.filter(d => {
				if (!d || !d.hasOwnProperty('delivery_note_count')) {
					console.log('Filtered out invalid entry:', d);
					return false;
				}
				let count = parseFloat(d.delivery_note_count) || 0;
				if (count > 0) {
					console.log('Valid entry:', d.label, 'count:', count);
					return true;
				}
				return false;
			});
			
			console.log('Valid data after filtering:', valid_data);
			console.log('Valid data length:', valid_data.length);
			
			if (valid_data.length > 0) {
				let chart_data = {
					labels: valid_data.map(d => String(d.label || 'Not Set')),
					datasets: [{
						name: 'Delivery Notes',
						values: valid_data.map(d => {
							let val = parseFloat(d.delivery_note_count) || 0;
							return isNaN(val) ? 0 : val;
						})
					}]
				};
				
				console.log('Chart data:', chart_data);
				
				// Destroy existing chart if it exists
				let chartContainer = $('#chart-delivery-mode-distribution');
				if (me.charts.delivery_mode_distribution) {
					try {
						me.charts.delivery_mode_distribution.destroy();
					} catch(e) {
						// Ignore destroy errors - chart might already be destroyed or container removed
						console.log('Chart destroy warning (non-critical):', e.message || e);
					}
					me.charts.delivery_mode_distribution = null;
					// Clear container to remove any leftover DOM nodes
					chartContainer.empty();
				}
				
				// Create new chart
				try {
					me.charts.delivery_mode_distribution = new frappe.Chart('#chart-delivery-mode-distribution', {
						title: '',
						data: chart_data,
						type: 'pie',
						height: 300
					});
					console.log('Chart created successfully');
				} catch(e) {
					console.error('Error creating delivery mode distribution chart:', e);
					chartContainer.html('<p class="text-muted">Chart data unavailable</p>');
				}
			} else {
				console.log('No valid data for delivery mode distribution chart - all entries filtered out');
				console.log('Original data:', delivery_mode_distribution);
				$('#chart-delivery-mode-distribution').html('<p class="text-muted">No data available (all entries have 0 count)</p>');
			}
		} else {
			console.log('No delivery mode distribution data received from backend');
			console.log('me.data:', me.data);
			$('#chart-delivery-mode-distribution').html('<p class="text-muted">No data available</p>');
		}
		
		// Item Category Expense Chart (Books, General Courier Expense)
		let item_category_data = me.data.item_category_expense || [];
		if (item_category_data.length > 0) {
			// Filter out categories with zero expense
			let valid_data = item_category_data.filter(d => {
				return d && (flt(d.expense_amount) > 0 || cint(d.delivery_note_count) > 0);
			});
			
			if (valid_data.length > 0) {
				// Create chart data with both count and amount
				let chart_data = {
					labels: valid_data.map(d => {
						let label = String(d.category || 'Unknown');
						let count = cint(d.delivery_note_count || 0);
						return `${label} (${count} DNs)`;
					}),
					datasets: [{
						name: 'Expense Amount',
						values: valid_data.map(d => flt(d.expense_amount || 0))
					}]
				};
				
				if (me.charts.item_category_expense) {
					try {
						me.charts.item_category_expense.destroy();
					} catch(e) {}
				}
				
				try {
					me.charts.item_category_expense = new frappe.Chart('#chart-item-category-expense', {
						title: '',
						data: chart_data,
						type: 'pie',
						height: 300
					});
				} catch(e) {
					console.error('Error creating item category expense chart:', e);
					$('#chart-item-category-expense').html('<p class="text-muted">Chart data unavailable</p>');
				}
				
				// Populate table with detailed data
				let tbody = $('#item-category-expense-tbody');
				tbody.empty();
				valid_data.forEach(row => {
					let category = row.category || '-';
					let safeCategory = frappe.utils.escape_html(category);
					let tr = $(`
						<tr>
							<td><a href="#" class="item-category-drilldown" data-category="${safeCategory}"><strong>${safeCategory}</strong></a></td>
							<td class="text-right">${format_number_value(row.delivery_note_count || 0)}</td>
							<td class="text-right">${format_currency_value(row.expense_amount || 0)}</td>
						</tr>
					`);
					tbody.append(tr);
				});
				
				// Build clickable drilldown links like "Books (28 DNs): 98.8%"
				let totalExpenseAmount = valid_data.reduce((acc, d) => acc + flt(d.expense_amount || 0), 0);
				let linksHtml = valid_data.map(row => {
					let category = row.category || '-';
					let dnCount = cint(row.delivery_note_count || 0);
					let expense = flt(row.expense_amount || 0);
					let percentage = totalExpenseAmount > 0 ? ((expense / totalExpenseAmount) * 100) : 0;
					return `
						<div style="margin-bottom: 4px;">
							<a href="#" class="item-category-drilldown" data-category="${frappe.utils.escape_html(category)}">
								${frappe.utils.escape_html(category)} (${format_number_value(dnCount)} DNs): ${percentage.toFixed(1)}%
							</a>
						</div>
					`;
				}).join('');
				$('#item-category-drilldown-links').html(linksHtml || '');
			} else {
				$('#chart-item-category-expense').html('<p class="text-muted">No data available</p>');
				$('#item-category-expense-tbody').html('<tr><td colspan="3" class="text-center">No data available</td></tr>');
				$('#item-category-drilldown-links').html('');
				$('#item-category-drilldown-section').hide();
			}
		} else {
			$('#chart-item-category-expense').html('<p class="text-muted">No data available</p>');
			$('#item-category-expense-tbody').html('<tr><td colspan="3" class="text-center">No data available</td></tr>');
			$('#item-category-drilldown-links').html('');
			$('#item-category-drilldown-section').hide();
		}
		
		me.bind_item_category_drilldown();
	}

	bind_item_category_drilldown() {
		let me = this;
		this.page.main.off('click', '.item-category-drilldown').on('click', '.item-category-drilldown', function(e) {
			e.preventDefault();
			let category = $(this).data('category');
			if (!category) return;
			me.load_item_category_drilldown(category);
		});
	}

	load_item_category_drilldown(category) {
		let me = this;
		$('#item-category-drilldown-title').text(category);
		$('#item-category-drilldown-section').show();
		$('#item-category-drilldown-tbody').html('<tr><td colspan="9" class="text-center text-muted">Loading...</td></tr>');

		frappe.call({
			method: 'tif_customization.tif_customization.page.courier_report.courier_report.get_item_category_drilldown',
			args: {
				filters: me.filters,
				category: category
			},
			callback: function(r) {
				let rows = r.message || [];
				let tbody = $('#item-category-drilldown-tbody');
				tbody.empty();

				if (!rows.length) {
					tbody.html('<tr><td colspan="9" class="text-center text-muted">No delivery notes found.</td></tr>');
					return;
				}

				rows.forEach(row => {
					tbody.append(`
						<tr>
							<td>${row.posting_date || '-'}</td>
							<td><a href="/app/delivery-note/${row.delivery_note_no}" target="_blank">${row.delivery_note_no || '-'}</a></td>
							<td>${row.customer_name || row.customer || '-'}</td>
							<td>${row.cost_center || '-'}</td>
							<td class="text-right">${format_number_value(row.total_books || 0)}</td>
							<td style="font-size: 11px; max-width: 300px;">${row.books_details || '-'}</td>
							<td class="text-right">${format_currency_value(row.courier_expense || 0)}</td>
							<td class="text-right">${format_currency_value(row.transport_expense || 0)}</td>
							<td class="text-right"><strong>${format_currency_value(row.total_expense || 0)}</strong></td>
						</tr>
					`);
				});
			},
			error: function() {
				$('#item-category-drilldown-tbody').html('<tr><td colspan="9" class="text-center text-danger">Failed to load drilldown data.</td></tr>');
			}
		});
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
						<th>Details</th>
					</tr>
				`);
				
				jv_data.forEach((row, index) => {
					let detailId = `jv-details-${me.make_safe_id(row.jv_number || index)}`;
					let tr = $(`
						<tr>
							<td>${row.posting_date || '-'}</td>
							<td><a href="/app/journal-entry/${row.jv_number}" target="_blank">${row.jv_number || '-'}</a></td>
							<td>${row.cost_center || '-'}</td>
							<td class="text-right">${format_currency_value(row.expense_amount || 0)}</td>
							<td>${row.remarks || '-'}</td>
							<td>${row.created_by_name || row.created_by || '-'}</td>
							<td><button type="button" class="btn btn-xs btn-default toggle-details" data-target="${detailId}">Details</button></td>
						</tr>
					`);
					tbody.append(tr);
					tbody.append(me.render_details_row(detailId, me.build_jv_details(row), 7));
				});
				
				if (jv_data.length === 0) {
					tbody.append('<tr><td colspan="7" class="text-center">No journal entries found</td></tr>');
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
						<th>Transport Charges</th>
						<th>Remarks</th>
						<th>Created By</th>
						<th>Details</th>
					</tr>
				`);
				
				// Add JVs
				jv_data.forEach((row, index) => {
					let detailId = `jv-details-${me.make_safe_id(row.jv_number || index)}`;
					let tr = $(`
						<tr>
							<td><span class="label label-primary">JV</span></td>
							<td>${row.posting_date || '-'}</td>
							<td><a href="/app/journal-entry/${row.jv_number}" target="_blank">${row.jv_number || '-'}</a></td>
							<td>-</td>
							<td>${row.cost_center || '-'}</td>
							<td class="text-right">${format_currency_value(row.expense_amount || 0)}</td>
							<td>-</td>
							<td>${row.remarks || '-'}</td>
							<td>${row.created_by_name || row.created_by || '-'}</td>
							<td><button type="button" class="btn btn-xs btn-default toggle-details" data-target="${detailId}">Details</button></td>
						</tr>
					`);
					tbody.append(tr);
					tbody.append(me.render_details_row(detailId, me.build_jv_details(row), 10));
				});
				
				// Add DNs
				let dn_data = me.data.delivery_notes || [];
				dn_data.forEach((row, index) => {
					let detailId = `dn-details-${me.make_safe_id(row.delivery_note_no || index)}`;
					let transportCharges = '';
					if (row.custom_delivery_mode === 'Transport' && row.transport_charges) {
						transportCharges = format_currency_value(row.transport_charges || 0);
					} else {
						transportCharges = '-';
					}
					
					let tr = $(`
						<tr>
							<td><span class="label label-success">DN</span></td>
							<td>${row.posting_date || '-'}</td>
							<td><a href="/app/delivery-note/${row.delivery_note_no}" target="_blank">${row.delivery_note_no || '-'}</a></td>
							<td>${row.customer_name || row.customer || '-'}</td>
							<td>${row.cost_center || '-'}</td>
							<td class="text-right">${format_number_value(row.total_books || 0)} books</td>
							<td class="text-right">${transportCharges}</td>
							<td>-</td>
							<td>${row.created_by_name || row.created_by || '-'}</td>
							<td><button type="button" class="btn btn-xs btn-default toggle-details" data-target="${detailId}">Details</button></td>
						</tr>
					`);
					tbody.append(tr);
					tbody.append(me.render_details_row(detailId, me.build_dn_details(row), 10));
				});
				
				if (jv_data.length === 0 && dn_data.length === 0) {
					tbody.append('<tr><td colspan="10" class="text-center">No transactions found</td></tr>');
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
					<th>Delivery Mode</th>
					<th>Total Books</th>
					<th>Transport Charges</th>
					<th>Created By</th>
					<th>Details</th>
				</tr>
			`);
			
			dn_data.forEach((row, index) => {
				let detailId = `dn-details-${me.make_safe_id(row.delivery_note_no || index)}`;
				let deliveryMode = row.custom_delivery_mode || '-';
				let transportCharges = '';
				if (row.custom_delivery_mode === 'Transport' && row.transport_charges) {
					transportCharges = format_currency_value(row.transport_charges || 0);
				} else {
					transportCharges = '-';
				}
				
				let tr = $(`
					<tr>
						<td>${row.posting_date || '-'}</td>
						<td><a href="/app/delivery-note/${row.delivery_note_no}" target="_blank">${row.delivery_note_no || '-'}</a></td>
						<td>${row.customer_name || row.customer || '-'}</td>
						<td>${row.cost_center || '-'}</td>
						<td>${deliveryMode}</td>
						<td class="text-right">${format_number_value(row.total_books || 0)}</td>
						<td class="text-right">${transportCharges}</td>
						<td>${row.created_by_name || row.created_by || '-'}</td>
						<td><button type="button" class="btn btn-xs btn-default toggle-details" data-target="${detailId}">Details</button></td>
					</tr>
				`);
				tbody.append(tr);
				tbody.append(me.render_details_row(detailId, me.build_dn_details(row), 9));
			});
			
			if (dn_data.length === 0) {
				tbody.append('<tr><td colspan="9" class="text-center">No delivery notes found</td></tr>');
			}
		}
	}

	make_safe_id(value) {
		return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '-');
	}

	render_details_row(detailId, html, colSpan) {
		return $(`
			<tr class="details-row" id="${detailId}" style="display: none;">
				<td colspan="${colSpan}">
					<div style="background: #f8f9fa; padding: 10px; border-radius: 4px;">
						${html}
					</div>
				</td>
			</tr>
		`);
	}

	build_jv_details(row) {
		let deliveryNote = row.delivery_note_no ? `<a href="/app/delivery-note/${row.delivery_note_no}" target="_blank">${row.delivery_note_no}</a>` : '-';
		let party = row.party ? `${row.party_type || ''} ${row.party}`.trim() : '-';
		return `
			<table class="table table-bordered table-condensed" style="margin: 0; font-size: 12px;">
				<tbody>
					<tr>
						<td><strong>JV Number</strong></td>
						<td>${row.jv_number || '-'}</td>
						<td><strong>Posting Date</strong></td>
						<td>${row.posting_date || '-'}</td>
					</tr>
					<tr>
						<td><strong>Account</strong></td>
						<td>${row.account || '-'}</td>
						<td><strong>Cost Center</strong></td>
						<td>${row.cost_center || '-'}</td>
					</tr>
					<tr>
						<td><strong>Party</strong></td>
						<td>${party}</td>
						<td><strong>Linked Delivery Note</strong></td>
						<td>${deliveryNote}</td>
					</tr>
					<tr>
						<td><strong>Debit</strong></td>
						<td>${format_currency_value(row.debit_amount || 0)}</td>
						<td><strong>Credit</strong></td>
						<td>${format_currency_value(row.credit_amount || 0)}</td>
					</tr>
					<tr>
						<td><strong>Remarks</strong></td>
						<td colspan="3">${row.remarks || '-'}</td>
					</tr>
				</tbody>
			</table>
		`;
	}

	build_dn_details(row) {
		let items = row.items || [];
		let items_html = '<em>No items</em>';
		if (items.length > 0) {
			let item_rows = items.map(item => {
				return `
					<tr>
						<td>${item.item_code || '-'}</td>
						<td>${item.item_name || '-'}</td>
						<td class="text-right">${format_number_value(item.qty || 0)}</td>
						<td class="text-right">${format_currency_value(item.rate || 0)}</td>
						<td class="text-right">${format_currency_value(item.amount || 0)}</td>
					</tr>
				`;
			}).join('');
			items_html = `
				<table class="table table-bordered table-condensed" style="margin: 0; font-size: 12px;">
					<thead>
						<tr>
							<th>Item Code</th>
							<th>Item Name</th>
							<th class="text-right">Qty</th>
							<th class="text-right">Rate</th>
							<th class="text-right">Amount</th>
						</tr>
					</thead>
					<tbody>
						${item_rows}
					</tbody>
				</table>
			`;
		}
		
		let totalAmount = row.total_amount || 0;
		let transportCharges = row.custom_delivery_mode === 'Transport' ? format_currency_value(row.transport_charges || 0) : '-';
		
		return `
			<table class="table table-bordered table-condensed" style="margin-bottom: 10px; font-size: 12px;">
				<tbody>
					<tr>
						<td><strong>Delivery Note</strong></td>
						<td>${row.delivery_note_no || '-'}</td>
						<td><strong>Posting Date</strong></td>
						<td>${row.posting_date || '-'}</td>
					</tr>
					<tr>
						<td><strong>Customer</strong></td>
						<td>${row.customer_name || row.customer || '-'}</td>
						<td><strong>Cost Center</strong></td>
						<td>${row.cost_center || '-'}</td>
					</tr>
					<tr>
						<td><strong>Delivery Mode</strong></td>
						<td>${row.custom_delivery_mode || '-'}</td>
						<td><strong>Courier</strong></td>
						<td>${row.custom_courier || '-'}</td>
					</tr>
					<tr>
						<td><strong>Courier Service</strong></td>
						<td>${row.custom_courier_service || '-'}</td>
						<td><strong>Payment Mode</strong></td>
						<td>${row.custom_courier_mode_of_payment || '-'}</td>
					</tr>
					<tr>
						<td><strong>Delivery Rate</strong></td>
						<td>${format_currency_value(row.custom_delivery_rate || 0)}</td>
						<td><strong>Total Weight</strong></td>
						<td>${format_number_value(row.custom_total_delivery_weightage || 0)}</td>
					</tr>
					<tr>
						<td><strong>Total Books</strong></td>
						<td>${format_number_value(row.total_books || 0)}</td>
						<td><strong>Transport Charges</strong></td>
						<td>${transportCharges}</td>
					</tr>
					<tr>
						<td><strong>Total Amount</strong></td>
						<td>${format_currency_value(totalAmount || 0)}</td>
						<td><strong>Created By</strong></td>
						<td>${row.created_by_name || row.created_by || '-'}</td>
					</tr>
				</tbody>
			</table>
			<div><strong>Items</strong></div>
			${items_html}
		`;
	}
	
	render_book_movement() {
		let me = this;
		
		// Top Customers
		let top_customers = me.data.top_customers || [];
		let customers_tbody = $('#top-customers-tbody');
		customers_tbody.empty();
		
		if (top_customers.length === 0) {
			customers_tbody.append('<tr><td colspan="2" class="text-center">No data available</td></tr>');
			$('#chart-top-customers').html('<p class="text-muted">No data available</p>');
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
			
			// Render Top Customers Chart
			let valid_customers = top_customers.filter(d => {
				if (!d) return false;
				let books = flt(d.books_sent);
				return !isNaN(books) && books !== null && books !== undefined && books > 0;
			});
			
			if (valid_customers.length > 0) {
				let chart_data = {
					labels: valid_customers.map(d => {
						let name = String(d.customer_name || d.customer || '');
						// Truncate long names for better display
						return name.length > 20 ? name.substring(0, 17) + '...' : name;
					}),
					datasets: [{
						name: 'Books Sent',
						values: valid_customers.map(d => {
							let val = flt(d.books_sent);
							return isNaN(val) ? 0 : val;
						})
					}]
				};
				
				// Destroy existing chart if it exists
				if (me.charts.top_customers) {
					try {
						me.charts.top_customers.destroy();
					} catch(e) {}
				}
				
				try {
					me.charts.top_customers = new frappe.Chart('#chart-top-customers', {
						title: '',
						data: chart_data,
						type: 'pie',
						height: 250
					});
				} catch(e) {
					console.error('Error creating top customers chart:', e);
					$('#chart-top-customers').html('<p class="text-muted">Chart data unavailable</p>');
				}
			} else {
				$('#chart-top-customers').html('<p class="text-muted">No data available</p>');
			}
		}
		
		// Top Items
		let top_items = me.data.top_items || [];
		let items_tbody = $('#top-items-tbody');
		items_tbody.empty();
		
		if (top_items.length === 0) {
			items_tbody.append('<tr><td colspan="2" class="text-center">No data available</td></tr>');
			$('#chart-top-items').html('<p class="text-muted">No data available</p>');
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
			
			// Render Top Items Chart
			let valid_items = top_items.filter(d => {
				if (!d) return false;
				let qty = flt(d.qty);
				return !isNaN(qty) && qty !== null && qty !== undefined && qty > 0;
			});
			
			if (valid_items.length > 0) {
				let chart_data = {
					labels: valid_items.map(d => {
						let name = String(d.item_name || d.item_code || '');
						// Truncate long names for better display
						return name.length > 20 ? name.substring(0, 17) + '...' : name;
					}),
					datasets: [{
						name: 'Quantity',
						values: valid_items.map(d => {
							let val = flt(d.qty);
							return isNaN(val) ? 0 : val;
						})
					}]
				};
				
				// Destroy existing chart if it exists
				if (me.charts.top_items) {
					try {
						me.charts.top_items.destroy();
					} catch(e) {}
				}
				
				try {
					me.charts.top_items = new frappe.Chart('#chart-top-items', {
						title: '',
						data: chart_data,
						type: 'pie',
						height: 250
					});
				} catch(e) {
					console.error('Error creating top items chart:', e);
					$('#chart-top-items').html('<p class="text-muted">Chart data unavailable</p>');
				}
			} else {
				$('#chart-top-items').html('<p class="text-muted">No data available</p>');
			}
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
		csv.push('Total Books Sent by Hand,' + (me.data.kpi_data?.books_sent_by_hand || 0));
		csv.push('Total Books Sent by Courier,' + (me.data.kpi_data?.books_sent_by_courier || 0));
		(me.data.item_category_expense || []).forEach(row => {
			csv.push(`${row.category} Expense,${row.expense_amount || 0}`);
			csv.push(`${row.category} Delivery Notes,${row.delivery_note_count || 0}`);
		});
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
		let me = this;
		
		// Add print styles if not already added
		if (!$('#print-styles-courier').length) {
			let printStyles = `
				<style id="print-styles-courier" media="print">
					@page {
						size: A4 landscape;
						margin: 1cm;
					}
					* {
						-webkit-print-color-adjust: exact !important;
						print-color-adjust: exact !important;
					}
					body {
						font-size: 10pt;
						background: white !important;
					}
					.filter-section,
					.btn,
					#apply-filters,
					#reset-filters,
					#export-excel,
					#print-report,
					.btn-group,
					.page-head,
					.sidebar,
					.navbar,
					.footer {
						display: none !important;
					}
					.page-content {
						margin: 0 !important;
						padding: 0 !important;
					}
					.courier-dashboard {
						padding: 0 !important;
						background: white !important;
					}
					.print-header-courier {
						text-align: center;
						margin-bottom: 20px;
						border-bottom: 2px solid #333;
						padding-bottom: 10px;
						page-break-after: avoid;
					}
					.print-header-courier h3 {
						margin: 0;
						font-size: 16pt;
						font-weight: bold;
					}
					.print-header-courier p {
						margin: 5px 0;
						font-size: 10pt;
					}
					.kpi-section {
						margin-bottom: 20px;
						page-break-inside: avoid;
					}
					.kpi-card {
						page-break-inside: avoid;
						margin-bottom: 10px;
					}
					.summary-table-section {
						margin-bottom: 20px;
						page-break-inside: avoid;
					}
					.summary-table-section h4 {
						font-size: 14pt;
						font-weight: bold;
						margin-bottom: 10px;
						border-bottom: 1px solid #333;
						padding-bottom: 5px;
					}
					.charts-section {
						margin-bottom: 20px;
					}
					.charts-section h4 {
						font-size: 14pt;
						font-weight: bold;
						margin-bottom: 10px;
						border-bottom: 1px solid #333;
						padding-bottom: 5px;
					}
					.chart-container {
						page-break-inside: avoid;
						margin-bottom: 15px;
					}
					.chart-container h5 {
						font-size: 12pt;
						font-weight: bold;
						margin-bottom: 10px;
						border-bottom: 2px solid #333;
						padding-bottom: 5px;
					}
					.transaction-section {
						margin-bottom: 20px;
					}
					.transaction-section h4 {
						font-size: 14pt;
						font-weight: bold;
						margin-bottom: 10px;
						border-bottom: 1px solid #333;
						padding-bottom: 5px;
					}
					.book-movement-section {
						margin-bottom: 20px;
					}
					.book-movement-section h4 {
						font-size: 14pt;
						font-weight: bold;
						margin-bottom: 10px;
						border-bottom: 1px solid #333;
						padding-bottom: 5px;
					}
					.book-movement-section h5 {
						font-size: 12pt;
						font-weight: bold;
						margin-bottom: 10px;
					}
					table {
						font-size: 9pt;
						width: 100%;
						border-collapse: collapse;
						page-break-inside: auto;
					}
					table thead {
						display: table-header-group;
					}
					table tbody {
						display: table-row-group;
					}
					table tr {
						page-break-inside: avoid;
						page-break-after: auto;
					}
					table th,
					table td {
						padding: 5px;
						border: 1px solid #ddd;
					}
					table th {
						background-color: #f5f5f5 !important;
						font-weight: bold;
					}
					.row {
						margin-left: 0;
						margin-right: 0;
					}
					.col-md-3,
					.col-md-4,
					.col-md-6,
					.col-md-12 {
						padding-left: 5px;
						padding-right: 5px;
					}
				</style>
			`;
			$('head').append(printStyles);
		}
		
		// Add print header if not exists
		if (!$('.print-header-courier').length) {
			let printHeader = `
				<div class="print-header print-header-courier">
					<h3>Courier Expense & Operational Dashboard</h3>
					<p>Period: ${me.filters.from_date} to ${me.filters.to_date}</p>
					<p>Generated on: ${frappe.datetime.str_to_user(frappe.datetime.get_datetime_as_string())}</p>
				</div>
			`;
			$('.courier-dashboard').prepend(printHeader);
		} else {
			// Update existing header
			$('.print-header-courier h3').text('Courier Expense & Operational Dashboard');
			$('.print-header-courier p').first().text(`Period: ${me.filters.from_date} to ${me.filters.to_date}`);
			$('.print-header-courier p').last().text(`Generated on: ${frappe.datetime.str_to_user(frappe.datetime.get_datetime_as_string())}`);
		}
		
		// Trigger print
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
