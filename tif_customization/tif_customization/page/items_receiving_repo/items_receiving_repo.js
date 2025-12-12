frappe.pages['items-receiving-repo'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'MR Items Receiving Acknowledgment',
		single_column: true
	});

	let me = this;
	
	// Initialize page
	me.page = page;
	me.wrapper = wrapper;
	me.filters = {};
	me.data = [];
	
	// Build filters
	me.make_filters();
	
	// Build data table
	me.make_datatable();
	
	// Load initial data
	me.refresh();
}

frappe.pages['items-receiving-repo'].prototype.make_filters = function() {
	let me = this;
	
	me.filter_area = $('<div class="filter-area" style="padding: 15px; background: #f8f9fa; border-radius: 4px; margin-bottom: 20px;"></div>').appendTo(me.page.main);
	
	// Filter row 1
	let filter_row1 = $('<div class="row" style="margin-bottom: 10px;"></div>').appendTo(me.filter_area);
	
	// Material Request filter
	$('<div class="col-md-3" style="padding: 5px;"></div>').html(`
		<label>Material Request</label>
		<input type="text" class="form-control material-request-filter" placeholder="Filter by MR">
	`).appendTo(filter_row1);
	
	// Item Code filter
	$('<div class="col-md-3" style="padding: 5px;"></div>').html(`
		<label>Item Code</label>
		<input type="text" class="form-control item-code-filter" placeholder="Filter by Item Code">
	`).appendTo(filter_row1);
	
	// Acknowledgment Status filter
	$('<div class="col-md-3" style="padding: 5px;"></div>').html(`
		<label>Acknowledgment Status</label>
		<select class="form-control status-filter">
			<option value="">All</option>
			<option value="Pending">Pending</option>
			<option value="Acknowledged">Acknowledged</option>
		</select>
	`).appendTo(filter_row1);
	
	// Filter row 2
	let filter_row2 = $('<div class="row" style="margin-bottom: 10px;"></div>').appendTo(me.filter_area);
	
	// From Date
	$('<div class="col-md-3" style="padding: 5px;"></div>').html(`
		<label>From Date</label>
		<input type="date" class="form-control from-date-filter">
	`).appendTo(filter_row2);
	
	// To Date
	$('<div class="col-md-3" style="padding: 5px;"></div>').html(`
		<label>To Date</label>
		<input type="date" class="form-control to-date-filter">
	`).appendTo(filter_row2);
	
	// Action buttons
	$('<div class="col-md-6" style="padding: 5px; padding-top: 28px;"></div>').html(`
		<button class="btn btn-primary btn-sm apply-filters" style="margin-right: 10px;">
			<i class="fa fa-filter"></i> Apply Filters
		</button>
		<button class="btn btn-secondary btn-sm clear-filters">
			<i class="fa fa-times"></i> Clear
		</button>
	`).appendTo(filter_row2);
	
	// Summary cards
	let summary_row = $('<div class="row" style="margin-top: 15px;"></div>').appendTo(me.filter_area);
	
	me.summary_total = $('<div class="col-md-4" style="padding: 5px;"></div>').html(`
		<div class="card" style="background: #e3f2fd; padding: 15px; border-radius: 4px;">
			<h5 style="margin: 0; color: #1976d2;">Total Items</h5>
			<h3 style="margin: 5px 0 0 0; color: #1976d2;" class="summary-total-count">0</h3>
		</div>
	`).appendTo(summary_row);
	
	me.summary_pending = $('<div class="col-md-4" style="padding: 5px;"></div>').html(`
		<div class="card" style="background: #fff3e0; padding: 15px; border-radius: 4px;">
			<h5 style="margin: 0; color: #f57c00;">Pending</h5>
			<h3 style="margin: 5px 0 0 0; color: #f57c00;" class="summary-pending-count">0</h3>
		</div>
	`).appendTo(summary_row);
	
	me.summary_acknowledged = $('<div class="col-md-4" style="padding: 5px;"></div>').html(`
		<div class="card" style="background: #e8f5e9; padding: 15px; border-radius: 4px;">
			<h5 style="margin: 0; color: #388e3c;">Acknowledged</h5>
			<h3 style="margin: 5px 0 0 0; color: #388e3c;" class="summary-acknowledged-count">0</h3>
		</div>
	`).appendTo(summary_row);
	
	// Bind filter events
	$('.apply-filters').on('click', function() {
		me.apply_filters();
	});
	
	$('.clear-filters').on('click', function() {
		me.clear_filters();
	});
	
	// Enter key on filters
	$('.material-request-filter, .item-code-filter').on('keypress', function(e) {
		if (e.which === 13) {
			me.apply_filters();
		}
	});
}

frappe.pages['items-receiving-repo'].prototype.apply_filters = function() {
	let me = this;
	
	me.filters = {
		material_request: $('.material-request-filter').val() || undefined,
		item_code: $('.item-code-filter').val() || undefined,
		acknowledgment_status: $('.status-filter').val() || undefined,
		from_date: $('.from-date-filter').val() || undefined,
		to_date: $('.to-date-filter').val() || undefined
	};
	
	// Remove undefined values
	Object.keys(me.filters).forEach(key => {
		if (me.filters[key] === undefined) {
			delete me.filters[key];
		}
	});
	
	me.refresh();
}

frappe.pages['items-receiving-repo'].prototype.clear_filters = function() {
	let me = this;
	
	$('.material-request-filter').val('');
	$('.item-code-filter').val('');
	$('.status-filter').val('');
	$('.from-date-filter').val('');
	$('.to-date-filter').val('');
	
	me.filters = {};
	me.refresh();
}

frappe.pages['items-receiving-repo'].prototype.make_datatable = function() {
	let me = this;
	
	me.datatable_area = $('<div class="datatable-area"></div>').appendTo(me.page.main);
	
	me.datatable = new frappe.ui.DataTable(me.datatable_area[0], {
		columns: [
			{
				name: 'material_request',
				label: __('Material Request'),
				width: 150,
				format: (value, row) => {
					return `<a href="/app/material-request/${value}" target="_blank">${value}</a>`;
				}
			},
			{
				name: 'mr_date',
				label: __('MR Date'),
				width: 100,
				format: (value) => {
					return value ? frappe.datetime.str_to_user(value) : '';
				}
			},
			{
				name: 'item_code',
				label: __('Item Code'),
				width: 150
			},
			{
				name: 'item_name',
				label: __('Item Name'),
				width: 200
			},
			{
				name: 'requested_qty',
				label: __('Requested Qty'),
				width: 120,
				format: (value, row) => {
					return `${flt(value).toFixed(2)} ${row.uom || ''}`;
				}
			},
			{
				name: 'received_qty',
				label: __('Received Qty'),
				width: 120,
				format: (value, row) => {
					return `${flt(value).toFixed(2)} ${row.uom || ''}`;
				}
			},
			{
				name: 'pending_qty',
				label: __('Pending Qty'),
				width: 120,
				format: (value, row) => {
					const pending = flt(value);
					const color = pending > 0 ? '#f57c00' : '#388e3c';
					return `<span style="color: ${color}; font-weight: bold;">${pending.toFixed(2)} ${row.uom || ''}</span>`;
				}
			},
			{
				name: 'acknowledgment_status',
				label: __('Status'),
				width: 130,
				format: (value) => {
					if (value === 'Acknowledged') {
						return `<span class="badge badge-success">Acknowledged</span>`;
					} else {
						return `<span class="badge badge-warning">Pending</span>`;
					}
				}
			},
			{
				name: 'acknowledgment_date',
				label: __('Acknowledgment Date'),
				width: 180,
				format: (value) => {
					if (value) {
						return frappe.datetime.str_to_user(value);
					}
					return '<span style="color: #999;">-</span>';
				}
			},
			{
				name: 'acknowledged_by',
				label: __('Acknowledged By'),
				width: 150,
				format: (value) => {
					return value || '<span style="color: #999;">-</span>';
				}
			},
			{
				name: 'action',
				label: __('Action'),
				width: 150,
				format: (value, row) => {
					if (row.acknowledgment_status === 'Pending') {
						return `<button class="btn btn-sm btn-primary acknowledge-btn" data-item="${row.material_request_item}">
							<i class="fa fa-check"></i> Acknowledge
						</button>`;
					} else {
						return `<span class="text-success"><i class="fa fa-check-circle"></i> Done</span>`;
					}
				}
			}
		],
		data: [],
		no_result_message: __('No MR Items found'),
		cell_format: {
			number: (value) => flt(value).toFixed(2)
		}
	});
	
	// Bind acknowledge button click
	$(me.datatable_area).on('click', '.acknowledge-btn', function() {
		const material_request_item = $(this).data('item');
		me.acknowledge_item(material_request_item);
	});
}

frappe.pages['items-receiving-repo'].prototype.refresh = function() {
	let me = this;
	
	// Show loading
	me.page.add_indicator(__('Loading...'), 'blue');
	
	frappe.call({
		method: 'tif_customization.tif_customization.page.items_receiving_repo.items_receiving_repo.get_mr_items_receiving_data',
		args: {
			filters: me.filters
		},
		callback: function(r) {
			me.page.remove_indicator();
			
			if (r.message && r.message.error) {
				frappe.show_alert({
					message: __('Error loading data: {0}', [r.message.error]),
					indicator: 'red'
				}, 5);
				return;
			}
			
			if (r.message && r.message.data) {
				me.data = r.message.data;
				me.datatable.refresh(me.data);
				
				// Update summary
				$('.summary-total-count').text(r.message.total_count || 0);
				$('.summary-pending-count').text(r.message.pending_count || 0);
				$('.summary-acknowledged-count').text(r.message.acknowledged_count || 0);
			}
		}
	});
}

frappe.pages['items-receiving-repo'].prototype.acknowledge_item = function(material_request_item) {
	let me = this;
	
	// Show dialog for remarks
	let d = new frappe.ui.Dialog({
		title: __('Acknowledge Receiving'),
		fields: [
			{
				fieldtype: 'Small Text',
				fieldname: 'remarks',
				label: __('Remarks (Optional)'),
				default: ''
			}
		],
		primary_action_label: __('Acknowledge'),
		primary_action(values) {
			d.hide();
			me.submit_acknowledgment(material_request_item, values.remarks || '');
		}
	});
	
	d.show();
}

frappe.pages['items-receiving-repo'].prototype.submit_acknowledgment = function(material_request_item, remarks) {
	let me = this;
	
	// Show loading
	me.page.add_indicator(__('Acknowledging...'), 'blue');
	
	frappe.call({
		method: 'tif_customization.tif_customization.page.items_receiving_repo.items_receiving_repo.acknowledge_mr_item',
		args: {
			material_request_item: material_request_item,
			remarks: remarks
		},
		callback: function(r) {
			me.page.remove_indicator();
			
			if (r.message && r.message.status === 'success') {
				frappe.show_alert({
					message: __('Item acknowledged successfully'),
					indicator: 'green'
				}, 3);
				
				// Refresh data immediately
				me.refresh();
			} else {
				frappe.show_alert({
					message: __('Error: {0}', [r.message.message || 'Unknown error']),
					indicator: 'red'
				}, 5);
			}
		}
	});
}

// Helper function for number formatting
function flt(value) {
	return parseFloat(value) || 0;
}
