frappe.pages['items-receiving-repo'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'MR and PO',
		single_column: true
	});

	// Create page instance
	let page_instance = new ItemsReceivingRepoPage(page, wrapper);
	page_instance.init();
}

// Page class
function ItemsReceivingRepoPage(page, wrapper) {
	this.page = page;
	this.wrapper = wrapper;
	this.filters = {};
	this.data = [];
}

ItemsReceivingRepoPage.prototype.init = function() {
	this.make_filters();
	this.make_datatable();
	this.refresh();
}

ItemsReceivingRepoPage.prototype.make_filters = function() {
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
	
	// Total Documents card
	me.summary_total_docs = $('<div class="col-md-4" style="padding: 5px;"></div>').html(`
		<div class="card" style="background: #e3f2fd; padding: 15px; border-radius: 4px;">
			<h5 style="margin: 0; color: #1976d2;">Total Documents</h5>
			<h3 style="margin: 5px 0 0 0; color: #1976d2;" class="summary-total-documents">0</h3>
		</div>
	`).appendTo(summary_row);
	
	// MR Count card
	me.summary_mr_count = $('<div class="col-md-4" style="padding: 5px;"></div>').html(`
		<div class="card" style="background: #fff3e0; padding: 15px; border-radius: 4px;">
			<h5 style="margin: 0; color: #f57c00;">MR Count</h5>
			<h3 style="margin: 5px 0 0 0; color: #f57c00;" class="summary-mr-count">0</h3>
		</div>
	`).appendTo(summary_row);
	
	// PO Count card
	me.summary_po_count = $('<div class="col-md-4" style="padding: 5px;"></div>').html(`
		<div class="card" style="background: #e8f5e9; padding: 15px; border-radius: 4px;">
			<h5 style="margin: 0; color: #388e3c;">PO Count</h5>
			<h3 style="margin: 5px 0 0 0; color: #388e3c;" class="summary-po-count">0</h3>
		</div>
	`).appendTo(summary_row);
	
	// Bind filter events - use me.filter_area to scope events
	me.filter_area.on('click', '.apply-filters', function() {
		me.apply_filters();
	});
	
	me.filter_area.on('click', '.clear-filters', function() {
		me.clear_filters();
	});
	
	// Enter key on filters
	me.filter_area.on('keypress', '.material-request-filter, .item-code-filter', function(e) {
		if (e.which === 13) {
			me.apply_filters();
		}
	});
}

ItemsReceivingRepoPage.prototype.apply_filters = function() {
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

ItemsReceivingRepoPage.prototype.clear_filters = function() {
	let me = this;
	
	$('.material-request-filter').val('');
	$('.item-code-filter').val('');
	$('.status-filter').val('');
	$('.from-date-filter').val('');
	$('.to-date-filter').val('');
	
	me.filters = {};
	me.refresh();
}

ItemsReceivingRepoPage.prototype.make_datatable = function() {
	let me = this;
	
	me.datatable_area = $('<div class="datatable-area" style="overflow-x: auto; margin-top: 20px;"></div>').appendTo(me.page.main);
	
	// Create table structure
	me.table = $(`
		<table class="table table-bordered table-hover" style="width: 100%; min-width: 900px;">
			<thead style="background-color: #f8f9fa;">
				<tr>
					<th style="min-width: 120px;">Material Request</th>
					<th style="min-width: 100px;">MR Date</th>
					<th style="min-width: 120px;">Item Code</th>
					<th style="min-width: 150px;">Item Name</th>
					<th style="min-width: 110px;">Requested Qty</th>
					<th style="min-width: 110px;">Received Qty</th>
					<th style="min-width: 110px;">Pending Qty</th>
				</tr>
			</thead>
			<tbody class="table-body">
			</tbody>
		</table>
	`).appendTo(me.datatable_area);
	
	me.table_body = me.table.find('.table-body');
	
	// Bind acknowledge button click
	me.datatable_area.on('click', '.acknowledge-btn', function() {
		const material_request_item = $(this).data('item');
		me.acknowledge_item(material_request_item);
	});
}

ItemsReceivingRepoPage.prototype.render_table = function(data) {
	let me = this;
	
	me.table_body.empty();
	
	if (!data || data.length === 0) {
		me.table_body.append(`
			<tr>
				<td colspan="7" class="text-center" style="padding: 40px; color: #999;">
					${__('No MR Items found')}
				</td>
			</tr>
		`);
		return;
	}
	
	data.forEach(function(row) {
		const mr_link = `<a href="/app/material-request/${row.material_request}" target="_blank">${row.material_request}</a>`;
		const mr_date = row.mr_date ? frappe.datetime.str_to_user(row.mr_date) : '-';
		const requested_qty = `${flt(row.requested_qty).toFixed(2)} ${row.uom || ''}`;
		const received_qty = `${flt(row.received_qty).toFixed(2)} ${row.uom || ''}`;
		const pending_qty = flt(row.pending_qty);
		const pending_qty_html = `<span style="color: ${pending_qty > 0 ? '#f57c00' : '#388e3c'}; font-weight: bold;">${pending_qty.toFixed(2)} ${row.uom || ''}</span>`;
		
		const tr = $(`
			<tr>
				<td>${mr_link}</td>
				<td>${mr_date}</td>
				<td>${row.item_code || ''}</td>
				<td>${row.item_name || ''}</td>
				<td>${requested_qty}</td>
				<td>${received_qty}</td>
				<td>${pending_qty_html}</td>
			</tr>
		`);
		
		me.table_body.append(tr);
	});
}

ItemsReceivingRepoPage.prototype.refresh = function() {
	let me = this;
	
	// Show loading in table
		me.table_body.html(`
			<tr>
				<td colspan="7" class="text-center" style="padding: 40px; color: #999;">
					<i class="fa fa-spinner fa-spin"></i> ${__('Loading...')}
				</td>
			</tr>
		`);
	
	frappe.call({
		method: 'tif_customization.tif_customization.page.items_receiving_repo.items_receiving_repo.get_mr_items_receiving_data',
		args: {
			filters: me.filters
		},
		callback: function(r) {
			if (r.message && r.message.error) {
				me.table_body.html(`
					<tr>
						<td colspan="7" class="text-center text-danger" style="padding: 40px;">
							${__('Error loading data: {0}', [r.message.error])}
						</td>
					</tr>
				`);
				frappe.show_alert({
					message: __('Error loading data: {0}', [r.message.error]),
					indicator: 'red'
				}, 5);
				return;
			}
			
			if (r.message && r.message.data) {
				me.data = r.message.data;
				me.render_table(me.data);
				
				// Update summary cards
				$('.summary-total-documents').text(r.message.total_documents || 0);
				$('.summary-mr-count').text(r.message.mr_count || 0);
				$('.summary-po-count').text(r.message.po_count || 0);
			}
		}
	});
}

ItemsReceivingRepoPage.prototype.acknowledge_item = function(material_request_item) {
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

ItemsReceivingRepoPage.prototype.submit_acknowledgment = function(material_request_item, remarks) {
	let me = this;
	
	// Show loading alert
	frappe.show_alert({
		message: __('Acknowledging...'),
		indicator: 'blue'
	}, 2);
	
	frappe.call({
		method: 'tif_customization.tif_customization.page.items_receiving_repo.items_receiving_repo.acknowledge_mr_item',
		args: {
			material_request_item: material_request_item,
			remarks: remarks
		},
		callback: function(r) {
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
