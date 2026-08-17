frappe.pages['dispatch-report'].on_page_load = function(wrapper) {
	let page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'School Wise Dispatch Report',
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
			country: '',
			book_type: ''
		};
		this.data = {};
		this.filter_options = {};
		this.customer_control = null;
		this.book_control = null;
	}
	
	make() {
		let me = this;
		
		// Load filter options first
		me.load_filter_options();
		
		// Create layout
		// me.page.add_inner_message(__('Loading Dispatch Report...'));
		
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
								<div id="from-date-control"></div>
							</div>
						</div>
						<div class="col-md-3">
							<div class="form-group">
								<label>To Date</label>
								<div id="to-date-control"></div>
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
								<label>Country</label>
								<select id="country-filter" class="form-control">
									<option value="">All Countries</option>
								</select>
							</div>
						</div>
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
					</div>
					<div class="row">
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
							<button class="btn btn-success" id="export-excel" style="float: right; margin-left: 10px;">
								<i class="fa fa-file-excel-o"></i> Export to Excel
							</button>
							<button class="btn btn-info" id="print-report" style="float: right;">
								<i class="fa fa-print"></i> Print
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
									<th>Country</th>
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
									<td colspan="12" class="text-center">Loading data...</td>
								</tr>
							</tbody>
							<tfoot id="dispatch-tfoot" style="display: none;">
								<tr style="background-color: #f8f9fa; font-weight: bold;">
									<td colspan="9" class="text-right"><strong>Total</strong></td>
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
		let $body = $(me.page.body);
		
		// Debounced auto-reload used by all filter controls
		me._auto_reload = frappe.utils.debounce(() => {
			if (me._suspend_auto) return;
			me.apply_filters();
		}, 400);
		
		// Proper Frappe Date pickers (replace old native <input type="date">)
		me.from_date_control = frappe.ui.form.make_control({
			parent: $body.find('#from-date-control')[0],
			df: { fieldtype: 'Date', fieldname: 'from_date', label: '', placeholder: 'From Date' },
			render_input: true,
		});
		me.to_date_control = frappe.ui.form.make_control({
			parent: $body.find('#to-date-control')[0],
			df: { fieldtype: 'Date', fieldname: 'to_date', label: '', placeholder: 'To Date' },
			render_input: true,
		});
		me.from_date_control.set_value(me.filters.from_date);
		me.to_date_control.set_value(me.filters.to_date);
		if (me.from_date_control.$input) me.from_date_control.$input.on('change', me._auto_reload);
		if (me.to_date_control.$input) me.to_date_control.$input.on('change', me._auto_reload);
		
		// Auto-reload when the dropdown filters change too
		$body.on('change', '#country-filter, #city-filter, #province-filter, #area-filter, #book-type-filter', me._auto_reload);
		
		// Setup customer autocomplete after a short delay
		setTimeout(() => {
			let customerField = $('#customer-filter');
			if (customerField.length && !customerField.data('setup')) {
				customerField.data('setup', true);
				try {
					// Create a wrapper div for the link field
					let wrapper = $('<div class="link-field-wrapper"></div>');
					customerField.replaceWith(wrapper);
					
					let control = frappe.ui.form.make_control({
						parent: wrapper[0],
						df: {
							fieldtype: 'Link',
							options: 'Customer',
							fieldname: 'customer',
							placeholder: 'Search customer...'
						},
						render_input: true
					});
					if (control && control.$input) {
						me.customer_control = control;
						control.$input.attr('id', 'customer-filter');
						control.$input.on('change awesomplete-selectcomplete', me._auto_reload);
					}
				} catch (e) {
					console.error('Error setting up customer field:', e);
				}
			}
			
			// Setup book/item autocomplete
			let bookField = $('#book-filter');
			if (bookField.length && !bookField.data('setup')) {
				bookField.data('setup', true);
				try {
					// Create a wrapper div for the link field
					let wrapper = $('<div class="link-field-wrapper"></div>');
					bookField.replaceWith(wrapper);
					
					let control = frappe.ui.form.make_control({
						parent: wrapper[0],
						df: {
							fieldtype: 'Link',
							options: 'Item',
							fieldname: 'book',
							placeholder: 'Search book/item...'
						},
						render_input: true
					});
					if (control && control.$input) {
						me.book_control = control;
						control.$input.attr('id', 'book-filter');
						control.$input.on('change awesomplete-selectcomplete', me._auto_reload);
					}
				} catch (e) {
					console.error('Error setting up book/item field:', e);
				}
			}
		}, 300);
		
		// Event handlers (scoped to this page's body)
		$body.find('#apply-filters').on('click', function() {
			me.apply_filters();
		});
		
		$body.find('#reset-filters').on('click', function() {
			me.reset_filters();
		});
		
		$body.find('#export-excel').on('click', function() {
			me.export_to_excel();
		});
		
		$body.find('#print-report').on('click', function() {
			me.print_report();
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
		
		// Populate countries
		let countrySelect = $('#country-filter');
		if (me.filter_options.countries) {
			me.filter_options.countries.forEach(country => {
				countrySelect.append(`<option value="${country}">${country}</option>`);
			});
		}
	}
	
	apply_filters() {
		let me = this;
		
		// Show loader and disable button
		const applyButton = $('#apply-filters');
		const originalButtonText = applyButton.html();
		applyButton.prop('disabled', true).html('<i class="fa fa-spinner fa-spin"></i> Searching...');
		me.showLoader();
		
		// Get filter values from the Frappe Date controls
		let fromDate = me.from_date_control ? me.from_date_control.get_value() : $('#from-date').val();
		let toDate = me.to_date_control ? me.to_date_control.get_value() : $('#to-date').val();
		
		// Set dates, use defaults if empty
		me.filters.from_date = fromDate || frappe.datetime.add_days(frappe.datetime.get_today(), -30);
		me.filters.to_date = toDate || frappe.datetime.get_today();
		
		// Get customer value - use control if available, otherwise fallback to input
		if (me.customer_control && typeof me.customer_control.get_value === 'function') {
			me.filters.customer = me.customer_control.get_value() || '';
		} else {
			let customerField = $('#customer-filter');
			me.filters.customer = customerField.val() || 
				customerField.closest('.link-field').find('input').val() || 
				'';
		}
		
		// Get book value - use control if available, otherwise fallback to input
		if (me.book_control && typeof me.book_control.get_value === 'function') {
			me.filters.book = me.book_control.get_value() || '';
		} else {
			let bookField = $('#book-filter');
			me.filters.book = bookField.val() || 
				bookField.closest('.link-field').find('input').val() || 
				'';
		}
		
		me.filters.city = $('#city-filter').val() || '';
		me.filters.province = $('#province-filter').val() || '';
		me.filters.area = $('#area-filter').val() || '';
		me.filters.country = $('#country-filter').val() || '';
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
		
		// Suspend auto-reload while programmatically resetting controls (debounce window 400ms)
		me._suspend_auto = true;
		setTimeout(() => { me._suspend_auto = false; }, 600);
		
		// Reset date pickers
		if (me.from_date_control) me.from_date_control.set_value(me.filters.from_date);
		else $('#from-date').val(me.filters.from_date);
		if (me.to_date_control) me.to_date_control.set_value(me.filters.to_date);
		else $('#to-date').val(me.filters.to_date);
		
		// Reset link fields - use control if available
		if (me.customer_control && typeof me.customer_control.set_value === 'function') {
			me.customer_control.set_value('');
		} else {
			let customerField = $('#customer-filter');
			if (customerField.closest('.link-field').length) {
				customerField.closest('.link-field').find('input').val('').trigger('input');
			} else {
				customerField.val('').trigger('change');
			}
		}
		
		if (me.book_control && typeof me.book_control.set_value === 'function') {
			me.book_control.set_value('');
		} else {
			let bookField = $('#book-filter');
			if (bookField.closest('.link-field').length) {
				bookField.closest('.link-field').find('input').val('').trigger('input');
			} else {
				bookField.val('').trigger('change');
			}
		}
		
		$('#city-filter').val('');
		$('#province-filter').val('');
		$('#area-filter').val('');
		$('#country-filter').val('');
		$('#book-type-filter').val('');
		
		// Reload data
		me.load_data();
	}
	
	load_data() {
		let me = this;
		
		me.showLoader();
		$('#dispatch-tbody').html('<tr><td colspan="12" class="text-center">Loading data...</td></tr>');
		
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
					
					// Hide loader and re-enable button after data is rendered
					requestAnimationFrame(function() {
						setTimeout(function() {
							me.hideLoader();
							const applyButton = $('#apply-filters');
							if (applyButton.length) {
								applyButton.prop('disabled', false).html('<i class="fa fa-filter"></i> Apply Filters');
							}
						}, 200);
					});
				} else {
					$('#dispatch-tbody').html(`<tr><td colspan="12" class="text-center text-danger">Error loading data: ${r.message?.error || 'Unknown error'}</td></tr>`);
					me.hideLoader();
					const applyButton = $('#apply-filters');
					if (applyButton.length) {
						applyButton.prop('disabled', false).html('<i class="fa fa-filter"></i> Apply Filters');
					}
				}
			},
			error: function(err) {
				me.hideLoader();
				const applyButton = $('#apply-filters');
				if (applyButton.length) {
					applyButton.prop('disabled', false).html('<i class="fa fa-filter"></i> Apply Filters');
				}
				$('#dispatch-tbody').html(`<tr><td colspan="12" class="text-center text-danger">Error loading data. Please try again.</td></tr>`);
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
			<div class="col-md-4">
				<div class="kpi-card" style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
					<h5 style="margin: 0 0 10px 0; font-size: 14px; opacity: 0.9;">Total Quantity</h5>
					<h2 style="margin: 0; font-size: 28px; font-weight: bold;">${format_number_value(total_quantity)}</h2>
					<p style="margin: 5px 0 0 0; font-size: 12px; opacity: 0.8;">${total_delivery_notes} Delivery Notes</p>
				</div>
			</div>
			
			<div class="col-md-4">
				<div class="kpi-card" style="background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%); color: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
					<h5 style="margin: 0 0 10px 0; font-size: 14px; opacity: 0.9;">MQH Quantity</h5>
					<h2 style="margin: 0; font-size: 28px; font-weight: bold;">${format_number_value(mqh_quantity)}</h2>
					<p style="margin: 5px 0 0 0; font-size: 12px; opacity: 0.8;">${total_quantity > 0 ? ((mqh_quantity / total_quantity) * 100).toFixed(1) : 0}% of Total</p>
				</div>
			</div>
			<div class="col-md-4">
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
			tbody.append('<tr><td colspan="12" class="text-center">No data found for the selected filters</td></tr>');
			tfoot.hide();
		} else {
			let total_quantity = 0;
			
			dispatch_data.forEach(row => {
				let qty = parseFloat(row.qty || 0) || 0;
				total_quantity += qty;
				
				let item_display = row.item_name || row.item_code || '-';
				let item_link = row.item_code ? `<a href="/app/item/${encodeURIComponent(row.item_code)}" target="_blank">${item_display}</a>` : item_display;
				
				let tr = $(`
					<tr>
						<td><a href="/app/delivery-note/${row.delivery_note_no}" target="_blank">${row.delivery_note_no || '-'}</a></td>
						<td>${row.posting_date || '-'}</td>
						<td>${row.customer_name || row.customer || '-'}</td>
						<td>${row.country || '-'}</td>
						<td>${row.city || '-'}</td>
						<td>${row.province || '-'}</td>
						<td>${row.area || '-'}</td>
						<td>${item_link}</td>
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
		csv.push('Delivery Note,Posting Date,Customer,Country,City,Province,Area,Book/Item,Book Type,Quantity,UOM,Created By');
		
		dispatch_data.forEach(row => {
			csv.push([
				row.delivery_note_no || '',
				row.posting_date || '',
				row.customer_name || row.customer || '',
				row.country || '',
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
	
	print_report() {
		let me = this;
		
		// Add print styles if not already added
		if (!$('#print-styles-dispatch').length) {
			let printStyles = `
				<style id="print-styles-dispatch" media="print">
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
					.dispatch-report-container {
						padding: 0 !important;
						background: white !important;
					}
					.print-header-dispatch {
						text-align: center;
						margin-bottom: 20px;
						border-bottom: 2px solid #333;
						padding-bottom: 10px;
						page-break-after: avoid;
					}
					.print-header-dispatch h3 {
						margin: 0;
						font-size: 16pt;
						font-weight: bold;
					}
					.print-header-dispatch p {
						margin: 5px 0;
						font-size: 10pt;
					}
					.kpi-section {
						display: none !important;
					}
					.data-section {
						margin-bottom: 20px;
					}
					.data-section h5 {
						font-size: 14pt;
						font-weight: bold;
						margin-bottom: 10px;
						border-bottom: 1px solid #333;
						padding-bottom: 5px;
					}
					table {
						font-size: 9pt;
						width: 100%;
						border-collapse: collapse;
						page-break-inside: auto;
					}
					table thead {
						display: table-header-group;
						page-break-after: avoid;
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
					/* Change tfoot to table-row-group so it doesn't repeat on each page */
					/* table-footer-group repeats on every page, table-row-group only appears once */
					table tfoot {
						display: table-row-group !important;
						page-break-inside: avoid;
						page-break-before: auto;
					}
					table tfoot tr {
						page-break-inside: avoid;
						page-break-before: avoid;
					}
					.label {
						padding: 3px 8px;
						border-radius: 3px;
						font-size: 9pt;
					}
					.label-primary {
						background-color: #337ab7 !important;
						color: white !important;
					}
					.label-success {
						background-color: #5cb85c !important;
						color: white !important;
					}
					.label-default {
						background-color: #777 !important;
						color: white !important;
					}
				</style>
			`;
			$('head').append(printStyles);
		}
		
		// Add print header if not exists
		if (!$('.print-header-dispatch').length) {
			let printHeader = `
				<div class="print-header print-header-dispatch">
					<h3>Dispatch Report</h3>
					<p>Period: ${me.filters.from_date} to ${me.filters.to_date}</p>
					<p>Generated on: ${frappe.datetime.str_to_user(frappe.datetime.get_datetime_as_string())}</p>
				</div>
			`;
			$('.dispatch-report-container').prepend(printHeader);
		} else {
			// Update existing header
			$('.print-header-dispatch h3').text('Dispatch Report');
			$('.print-header-dispatch p').first().text(`Period: ${me.filters.from_date} to ${me.filters.to_date}`);
			$('.print-header-dispatch p').last().text(`Generated on: ${frappe.datetime.str_to_user(frappe.datetime.get_datetime_as_string())}`);
		}
		
		// Trigger print
		window.print();
	}
	
	showLoader() {
		let me = this;
		// Remove existing loader if any
		$('#dispatch-report-loader').remove();
		
		// Create loader overlay
		const loader = $(`
			<div id="dispatch-report-loader" style="
				position: fixed;
				top: 0;
				left: 0;
				width: 100%;
				height: 100%;
				background: rgba(0, 0, 0, 0.5);
				z-index: 9999;
				display: flex;
				align-items: center;
				justify-content: center;
			">
				<div style="
					background: white;
					padding: 30px 50px;
					border-radius: 8px;
					box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
					text-align: center;
				">
					<i class="fa fa-spinner fa-spin" style="font-size: 32px; color: #2d5a27; margin-bottom: 15px;"></i>
					<div style="font-size: 16px; color: #495057; font-weight: 500;">Searching...</div>
					<div style="font-size: 12px; color: #6c757d; margin-top: 5px;">Please wait while we fetch your data</div>
				</div>
			</div>
		`);
		$('body').append(loader);
	}
	
	hideLoader() {
		let me = this;
		$('#dispatch-report-loader').fadeOut(300, function() {
			$(this).remove();
		});
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
