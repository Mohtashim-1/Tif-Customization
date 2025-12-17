frappe.pages['dispatch-report'].on_page_load = function(wrapper) {
	let page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Dispatch Report',
		single_column: true
	});
	
	// Initialize dashboard
	let dispatch_report = new window.DispatchReport(page);
	dispatch_report.make();
};

// Only declare class if it doesn't exist
if (typeof window.DispatchReport === 'undefined') {
	window.DispatchReport = class DispatchReport {
	constructor(page) {
		this.page = page;
		this.filters = {
			from_date: frappe.datetime.add_days(frappe.datetime.get_today(), -30),
			to_date: frappe.datetime.get_today(),
			customer: '',
			book: '',
			city: '',
			province: '',
			area: '',
			book_type: ''
		};
		this.data = {};
		this.filter_options = {};
	}
	
	make() {
		let me = this;
		
		// Load filter options first
		me.load_filter_options();
		
		// Create layout
		me.page.add_inner_message(__('Loading Dispatch Report...'));
		
		// Build HTML structure
		let html = `
			<div class="dispatch-report-container" style="padding: 20px;">
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
								<label>Customer</label>
								<input type="text" id="customer-filter" class="form-control" placeholder="Search customer...">
							</div>
						</div>
						<div class="col-md-3">
							<div class="form-group">
								<label>Book/Item</label>
								<input type="text" id="book-filter" class="form-control" placeholder="Search book...">
							</div>
						</div>
					</div>
					<div class="row">
						<div class="col-md-3">
							<div class="form-group">
								<label>City</label>
								<select id="city-filter" class="form-control">
									<option value="">All Cities</option>
								</select>
							</div>
						</div>
						<div class="col-md-3">
							<div class="form-group">
								<label>Province</label>
								<select id="province-filter" class="form-control">
									<option value="">All Provinces</option>
								</select>
							</div>
						</div>
						<div class="col-md-3">
							<div class="form-group">
								<label>Area</label>
								<select id="area-filter" class="form-control">
									<option value="">All Areas</option>
								</select>
							</div>
						</div>
						<div class="col-md-3">
							<div class="form-group">
								<label>Book Type</label>
								<select id="book-type-filter" class="form-control">
									<option value="">All Types</option>
									<option value="MQH">MQH</option>
									<option value="Qaida">Qaida</option>
								</select>
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
				
				<!-- KPI Section -->
				<div class="kpi-section" id="kpi-section" style="margin-bottom: 20px;">
					<div class="row">
						<!-- KPIs will be rendered here -->
					</div>
				</div>
				
				<!-- Data Table Section -->
				<div class="data-section">
					<h5 style="margin-bottom: 15px;">Dispatch Data</h5>
					<div class="table-responsive">
						<table class="table table-bordered table-striped" id="dispatch-table">
							<thead>
								<tr>
									<th>Delivery Note</th>
									<th>Posting Date</th>
									<th>Customer</th>
									<th>City</th>
									<th>Province</th>
									<th>Area</th>
									<th>Book/Item</th>
									<th>Book Type</th>
									<th>Quantity</th>
									<th>UOM</th>
									<th>Created By</th>
								</tr>
							</thead>
							<tbody id="dispatch-tbody">
								<tr>
									<td colspan="11" class="text-center">Loading data...</td>
								</tr>
							</tbody>
							<tfoot id="dispatch-tfoot" style="display: none;">
								<tr style="background-color: #f8f9fa; font-weight: bold;">
									<td colspan="8" class="text-right"><strong>Total</strong></td>
									<td class="text-right"><strong id="total-quantity">0</strong></td>
									<td colspan="2"></td>
								</tr>
							</tfoot>
						</table>
					</div>
				</div>
			</div>
		`;
		
		$(me.page.body).html(html);
		
		// Setup customer autocomplete after a short delay
		setTimeout(() => {
			let customerField = $('#customer-filter');
			if (customerField.length && !customerField.data('setup')) {
				customerField.data('setup', true);
				frappe.ui.form.make_control({
					parent: customerField.parent(),
					df: {
						fieldtype: 'Link',
						options: 'Customer',
						fieldname: 'customer',
						placeholder: 'Search customer...'
					},
					render_input: true
				}).then(control => {
					customerField.replaceWith(control.$input);
					control.$input.attr('id', 'customer-filter');
				});
			}
			
			// Setup book/item autocomplete
			let bookField = $('#book-filter');
			if (bookField.length && !bookField.data('setup')) {
				bookField.data('setup', true);
				frappe.ui.form.make_control({
					parent: bookField.parent(),
					df: {
						fieldtype: 'Link',
						options: 'Item',
						fieldname: 'book',
						placeholder: 'Search book/item...'
					},
					render_input: true
				}).then(control => {
					bookField.replaceWith(control.$input);
					control.$input.attr('id', 'book-filter');
				});
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
	
	load_filter_options() {
		let me = this;
		
		frappe.call({
			method: 'tif_customization.tif_customization.page.dispatch_report.dispatch_report.get_filter_options',
			callback: function(r) {
				if (r.message && !r.message.error) {
					me.filter_options = r.message;
					me.populate_filter_dropdowns();
				}
			}
		});
	}
	
	populate_filter_dropdowns() {
		let me = this;
		
		// Populate cities
		let citySelect = $('#city-filter');
		me.filter_options.cities.forEach(city => {
			citySelect.append(`<option value="${city}">${city}</option>`);
		});
		
		// Populate provinces
		let provinceSelect = $('#province-filter');
		me.filter_options.provinces.forEach(province => {
			provinceSelect.append(`<option value="${province}">${province}</option>`);
		});
		
		// Populate areas
		let areaSelect = $('#area-filter');
		me.filter_options.areas.forEach(area => {
			areaSelect.append(`<option value="${area}">${area}</option>`);
		});
	}
	
	apply_filters() {
		let me = this;
		
		// Get filter values
		let fromDate = $('#from-date').val();
		let toDate = $('#to-date').val();
		
		// Set dates, use defaults if empty
		me.filters.from_date = fromDate || frappe.datetime.add_days(frappe.datetime.get_today(), -30);
		me.filters.to_date = toDate || frappe.datetime.get_today();
		
		// Get customer value - handle both regular input and frappe link field
		let customerField = $('#customer-filter');
		me.filters.customer = customerField.val() || customerField.attr('data-value') || '';
		
		// Get book value - handle both regular input and frappe link field
		let bookField = $('#book-filter');
		me.filters.book = bookField.val() || bookField.attr('data-value') || '';
		
		me.filters.city = $('#city-filter').val() || '';
		me.filters.province = $('#province-filter').val() || '';
		me.filters.area = $('#area-filter').val() || '';
		me.filters.book_type = $('#book-type-filter').val() || '';
		
		// Load data with filters
		me.load_data();
	}
	
	reset_filters() {
		let me = this;
		
		// Reset to defaults
		me.filters = {
			from_date: frappe.datetime.add_days(frappe.datetime.get_today(), -30),
			to_date: frappe.datetime.get_today(),
			customer: '',
			book: '',
			city: '',
			province: '',
			area: '',
			book_type: ''
		};
		
		// Reset form fields
		$('#from-date').val(me.filters.from_date);
		$('#to-date').val(me.filters.to_date);
		$('#customer-filter').val('').trigger('change');
		$('#book-filter').val('').trigger('change');
		$('#city-filter').val('');
		$('#province-filter').val('');
		$('#area-filter').val('');
		$('#book-type-filter').val('');
		
		// Reload data
		me.load_data();
	}
	
	load_data() {
		let me = this;
		
		$('#dispatch-tbody').html('<tr><td colspan="11" class="text-center">Loading data...</td></tr>');
		
		frappe.call({
			method: 'tif_customization.tif_customization.page.dispatch_report.dispatch_report.get_dispatch_report_data',
			args: {
				filters: me.filters
			},
			callback: function(r) {
				if (r.message && !r.message.error) {
					me.data = r.message;
					me.render_kpis();
					me.render_table();
				} else {
					$('#dispatch-tbody').html(`<tr><td colspan="11" class="text-center text-danger">Error loading data: ${r.message?.error || 'Unknown error'}</td></tr>`);
				}
			}
		});
	}
	
	render_kpis() {
		let me = this;
		let summary = me.data.summary_data || {};
		
		let total_quantity = summary.total_quantity || 0;
		let total_delivery_notes = summary.total_delivery_notes || 0;
		let unique_customers = summary.unique_customers || 0;
		let unique_items = summary.unique_items || 0;
		let mqh_quantity = summary.mqh_quantity || 0;
		let qaida_quantity = summary.qaida_quantity || 0;
		let other_quantity = summary.other_quantity || 0;
		
		let kpi_html = `
			<div class="col-md-3">
				<div class="kpi-card" style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
					<h5 style="margin: 0 0 10px 0; font-size: 14px; opacity: 0.9;">Total Quantity</h5>
					<h2 style="margin: 0; font-size: 28px; font-weight: bold;">${format_number_value(total_quantity)}</h2>
					<p style="margin: 5px 0 0 0; font-size: 12px; opacity: 0.8;">${total_delivery_notes} Delivery Notes</p>
				</div>
			</div>
			<div class="col-md-3">
				<div class="kpi-card" style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); color: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
					<h5 style="margin: 0 0 10px 0; font-size: 14px; opacity: 0.9;">Unique Customers</h5>
					<h2 style="margin: 0; font-size: 28px; font-weight: bold;">${format_number_value(unique_customers)}</h2>
					<p style="margin: 5px 0 0 0; font-size: 12px; opacity: 0.8;">${unique_items} Unique Items</p>
				</div>
			</div>
			<div class="col-md-3">
				<div class="kpi-card" style="background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%); color: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
					<h5 style="margin: 0 0 10px 0; font-size: 14px; opacity: 0.9;">MQH Quantity</h5>
					<h2 style="margin: 0; font-size: 28px; font-weight: bold;">${format_number_value(mqh_quantity)}</h2>
					<p style="margin: 5px 0 0 0; font-size: 12px; opacity: 0.8;">${total_quantity > 0 ? ((mqh_quantity / total_quantity) * 100).toFixed(1) : 0}% of Total</p>
				</div>
			</div>
			<div class="col-md-3">
				<div class="kpi-card" style="background: linear-gradient(135deg, #fa709a 0%, #fee140 100%); color: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
					<h5 style="margin: 0 0 10px 0; font-size: 14px; opacity: 0.9;">Qaida Quantity</h5>
					<h2 style="margin: 0; font-size: 28px; font-weight: bold;">${format_number_value(qaida_quantity)}</h2>
					<p style="margin: 5px 0 0 0; font-size: 12px; opacity: 0.8;">${total_quantity > 0 ? ((qaida_quantity / total_quantity) * 100).toFixed(1) : 0}% of Total</p>
				</div>
			</div>
		`;
		
		$('#kpi-section .row').html(kpi_html);
	}
	
	render_table() {
		let me = this;
		let dispatch_data = me.data.dispatch_data || [];
		let tbody = $('#dispatch-tbody');
		let tfoot = $('#dispatch-tfoot');
		tbody.empty();
		
		if (dispatch_data.length === 0) {
			tbody.append('<tr><td colspan="11" class="text-center">No data found for the selected filters</td></tr>');
			tfoot.hide();
		} else {
			let total_quantity = 0;
			
			dispatch_data.forEach(row => {
				let qty = parseFloat(row.qty || 0) || 0;
				total_quantity += qty;
				
				let tr = $(`
					<tr>
						<td><a href="/app/delivery-note/${row.delivery_note_no}" target="_blank">${row.delivery_note_no || '-'}</a></td>
						<td>${row.posting_date || '-'}</td>
						<td>${row.customer_name || row.customer || '-'}</td>
						<td>${row.city || '-'}</td>
						<td>${row.province || '-'}</td>
						<td>${row.area || '-'}</td>
						<td>${row.item_name || row.item_code || '-'}</td>
						<td><span class="label ${row.book_type === 'MQH' ? 'label-primary' : row.book_type === 'Qaida' ? 'label-success' : 'label-default'}">${row.book_type || '-'}</span></td>
						<td class="text-right">${format_number_value(row.qty || 0)}</td>
						<td>${row.stock_uom || '-'}</td>
						<td>${row.created_by_name || row.created_by || '-'}</td>
					</tr>
				`);
				tbody.append(tr);
			});
			
			// Update totals row
			$('#total-quantity').text(format_number_value(total_quantity));
			tfoot.show();
		}
	}
	
	export_to_excel() {
		let me = this;
		let dispatch_data = me.data.dispatch_data || [];
		
		// Create CSV
		let csv = [];
		csv.push('Delivery Note,Posting Date,Customer,City,Province,Area,Book/Item,Book Type,Quantity,UOM,Created By');
		
		dispatch_data.forEach(row => {
			csv.push([
				row.delivery_note_no || '',
				row.posting_date || '',
				row.customer_name || row.customer || '',
				row.city || '',
				row.province || '',
				row.area || '',
				row.item_name || row.item_code || '',
				row.book_type || '',
				row.qty || 0,
				row.stock_uom || '',
				row.created_by_name || row.created_by || ''
			].join(','));
		});
		
		// Download
		let blob = new Blob([csv.join('\n')], { type: 'text/csv' });
		let url = window.URL.createObjectURL(blob);
		let a = document.createElement('a');
		a.href = url;
		a.download = `dispatch_report_${me.filters.from_date}_to_${me.filters.to_date}.csv`;
		a.click();
		window.URL.revokeObjectURL(url);
	}
	};
}

// Helper function
function format_number_value(value) {
	if (value === null || value === undefined || value === '') {
		return '0';
	}
	let numValue = parseFloat(value) || 0;
	return numValue.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
