frappe.pages['stock-detail'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Stock Detail Report',
		single_column: true
	});

	// Avoid duplicate content if page is re-initialized
	page.main.find('.stock-detail-container').remove();
	
	// Create the main container
	let container = $(`<div class="stock-detail-container">
		<div class="report-header">
			<h2>The ILM Foundation</h2>
			<!-- <h3>MQH Books Stock Details - 2025-26</h3> -->
		</div>
		
		<!-- Filter Section (Frappe MultiSelectList like Stock Balance) -->
		<div class="filter-section stock-detail-filters">
			<div id="stock-detail-filter-fields"></div>
			<div class="row" style="margin-top: 10px;">
				<div class="col-md-12">
					<button id="apply-filters" class="btn btn-primary">Apply Filters</button>
					<button id="reset-filters" class="btn btn-secondary">Reset</button>
					<button id="export-excel" class="btn btn-success" style="float: right; margin-left: 10px;">Export to Excel</button>
					<button id="print-report" class="btn btn-info" style="float: right;">
						<i class="fa fa-print"></i> Print
					</button>
				</div>
			</div>
		</div>
		
		<!-- KPI Section -->
		<div class="kpi-section" id="kpi-section" style="margin: 20px 0; padding: 20px; background: #f8f9fa; border-radius: 8px;">
			<!-- KPIs will be rendered here -->
		</div>
		
		<div class="report-content">
			<div class="report-section mqh-books-section">
				<h4>MQH Books Stock Details</h4>
				<div class="table-container">
					<table class="table table-bordered table-striped" id="mqh-books-table">
						<thead>
							<tr>
								<th>S.#</th>
								<th>Item Code</th>
								<th>Item Name</th>
								<th>Opening Stock</th>
								<th>Received Vendor</th>
								<th>Book Return</th>
								<th>Delivered</th>
								<th>Available Stock</th>
								<th>Books Sale Details</th>
								<th>Total Amount of Books Sale</th>
							</tr>
						</thead>
						<tbody id="mqh-books-tbody">
						</tbody>
						<tfoot id="mqh-books-tfoot">
						</tfoot>
					</table>
				</div>
			</div>
			
			<!-- Single Warehouse Section (shown when specific warehouse is selected) -->
			<div class="report-section single-warehouse-section" style="display: none;">
				<h4 id="single-warehouse-title">Selected Warehouse - Stock Details</h4>
				<div class="table-container">
					<table class="table table-bordered table-striped" id="single-warehouse-table">
						<thead>
							<tr>
								<th>S.#</th>
								<th>Particulars</th>
								<th>Opening Balance</th>
								<th>Received (Vendor)</th>
								<th>Courier Returned</th>
								<th>Transferred In Warehouse</th>
								<th>Transferred Out Warehouse</th>
								<th>Delivered</th>
								<th>Ending Balance</th>
							</tr>
						</thead>
						<tbody id="single-warehouse-tbody">
						</tbody>
						<tfoot id="single-warehouse-tfoot">
						</tfoot>
					</table>
				</div>
			</div>
			
			<!-- Dynamically rendered warehouse stock sections (based on MultiSelectList) -->
			<div id="dynamic-warehouse-sections"></div>
		</div>
	</div>`);
	
	// Add CSS styles
	container.append(`
		<style>
			.stock-detail-container {
				padding: 20px;
				background: #fff;
				font-family: Arial, sans-serif;
			}
			.report-header {
				text-align: center;
				margin-bottom: 30px;
				padding-bottom: 20px;
			}
			.report-header h2 {
				color: #000;
				margin-bottom: 10px;
				font-size: 18px;
				font-weight: bold;
			}
			.report-header h3 {
				color: #000;
				font-weight: bold;
				font-size: 16px;
			}
			.filter-section {
				background: #f8f9fa;
				padding: 20px;
				margin-bottom: 30px;
				border-radius: 5px;
				border: 1px solid #dee2e6;
			}
			.filter-section label {
				font-weight: bold;
				color: #495057;
				margin-bottom: 5px;
				display: block;
			}
			.filter-section .form-control {
				width: 100%;
				padding: 8px 12px;
				border: 1px solid #ced4da;
				border-radius: 4px;
				font-size: 14px;
				min-height: 45px;
				height: auto;
				line-height: 1.5;
			}
			.filter-section .btn {
				margin-right: 10px;
				padding: 8px 16px;
				font-size: 14px;
			}
			.stock-detail-filters .form-group {
				margin-bottom: 12px;
			}
			.stock-detail-filters .multiselect-list .form-control {
				min-height: 32px;
				height: auto;
			}
			.stock-detail-filters .frappe-control[data-fieldtype="MultiSelectList"] {
				min-width: 220px;
			}
			.kpi-summary-row {
				display: flex;
				flex-wrap: nowrap;
				align-items: stretch;
				margin-bottom: 30px;
				gap: 0;
			}
			.kpi-summary-row > .kpi-col {
				flex: 1 1 0;
				min-width: 0;
				padding: 0 6px;
				display: flex;
			}
			.kpi-card.summary-kpi {
				width: 100%;
				min-height: 130px;
				height: 100%;
				display: flex;
				flex-direction: column;
				justify-content: space-between;
				padding: 14px 12px !important;
				box-sizing: border-box;
			}
			.kpi-card.summary-kpi .kpi-title {
				margin: 0;
				font-size: 12px;
				line-height: 1.25;
				min-height: 30px;
				opacity: 0.9;
				display: -webkit-box;
				-webkit-line-clamp: 2;
				-webkit-box-orient: vertical;
				overflow: hidden;
			}
			.kpi-card.summary-kpi .kpi-value {
				margin: 8px 0;
				font-size: 24px;
				font-weight: bold;
				line-height: 1.1;
			}
			.kpi-card.summary-kpi .kpi-sub {
				margin: 0;
				font-size: 11px;
				line-height: 1.3;
				min-height: 28px;
				opacity: 0.85;
				color: black;
			}
			.stock-item-card .stock-item-name {
				margin: 0 0 8px 0;
				font-size: 12px;
				color: black;
				opacity: 0.9;
				line-height: 1.35;
				min-height: 1.35em;
				overflow: visible;
				white-space: normal;
				word-break: break-word;
			}
			.kpi-dept-row {
				display: flex;
				flex-wrap: wrap;
				align-items: stretch;
				margin-bottom: 30px;
			}
			.kpi-dept-row > .kpi-col {
				flex: 1;
				min-width: 300px;
				padding: 0 8px;
				display: flex;
			}
			.kpi-dept-row .kpi-card {
				width: 100%;
				height: 100%;
			}
			.report-section {
				margin-bottom: 40px;
			}
			.report-section h4 {
				background: #f8f9fa;
				padding: 10px 15px;
				margin-bottom: 15px;
				border-left: 4px solid #2d5a27;
				color: #495057;
				font-weight: bold;
			}
			.table-container {
				overflow-x: auto;
			}
			.table {
				font-size: 11px;
				margin-bottom: 0;
				border-collapse: collapse;
				width: 100%;
			}
			.table th {
				background: #ffffff;
				color: black;
				text-align: center;
				vertical-align: middle;
				font-weight: bold;
				white-space: nowrap;
				padding: 8px 4px;
				border: 1px solid #000;
				font-size: 10px;
			}
			.table td {
				text-align: center;
				vertical-align: middle;
				padding: 6px 4px;
				border: 1px solid #000;
				font-size: 10px;
			}
			.table tbody tr:nth-child(even) {
				background-color: #fff2cc;
			}
			.table tbody tr:nth-child(odd) {
				background-color: #ffffff;
			}
			.table tfoot td {
				background: #e9ecef;
				font-weight: bold;
				border-top: 2px solid #2d5a27;
				background-color: #f0f0f0;
			}
			.number-cell {
				text-align: right;
				font-family: Arial, sans-serif;
			}
			.particulars-cell {
				text-align: left;
				font-weight: normal;
			}
			.table th:first-child,
			.table td:first-child {
				width: 40px;
			}
			.table th:nth-child(2),
			.table td:nth-child(2) {
				text-align: left;
				min-width: 200px;
			}
			.table th:nth-child(n+3),
			.table td:nth-child(n+3) {
				text-align: right;
				min-width: 80px;
			}
		</style>
	`);
	
	page.main.append(container);
	
	// Helper function to get first and last day of current month
	function getCurrentMonthDates() {
		const now = new Date();
		const year = now.getFullYear();
		const month = now.getMonth(); // 0-11
		
		// Format date as YYYY-MM-DD using local time
		function formatDate(date) {
			const y = date.getFullYear();
			const m = String(date.getMonth() + 1).padStart(2, '0');
			const d = String(date.getDate()).padStart(2, '0');
			return `${y}-${m}-${d}`;
		}
		
		// First day of current month
		const firstDay = new Date(year, month, 1);
		const fromDate = formatDate(firstDay);
		
		// Last day of current month
		const lastDay = new Date(year, month + 1, 0);
		const toDate = formatDate(lastDay);
		
		return { fromDate, toDate };
	}
	
	// Set default dates to current month
	const { fromDate: defaultFromDate, toDate: defaultToDate } = getCurrentMonthDates();

	// Frappe-style filters (same MultiSelectList UX as Stock Balance report)
	let stock_detail_filters = null;

	function setupStockDetailFilters() {
		const $filterParent = container.find('#stock-detail-filter-fields');
		if (!$filterParent.length) {
			console.error('Stock Detail: filter container not found');
			return;
		}

		stock_detail_filters = new frappe.ui.FieldGroup({
			parent: $filterParent,
			fields: [
				{
					fieldtype: 'Date',
					fieldname: 'from_date',
					label: __('From Date'),
					default: defaultFromDate,
					reqd: 1
				},
				{ fieldtype: 'Column Break' },
				{
					fieldtype: 'Date',
					fieldname: 'to_date',
					label: __('To Date'),
					default: defaultToDate,
					reqd: 1
				},
				{ fieldtype: 'Column Break' },
				{
					fieldtype: 'MultiSelectList',
					fieldname: 'item_group',
					label: __('Item Groups'),
					options: 'Item Group',
					get_data: function(txt) {
						return frappe.call({
							method: 'tif_customization.tif_customization.page.stock_detail.stock_detail.get_report_item_groups',
							args: { txt: txt || '' }
						}).then(r => r.message || []);
					},
					onchange: function() {
						const item_field = stock_detail_filters.fields_dict.item;
						if (item_field) {
							item_field.set_value([]);
						}
					}
				},
				{ fieldtype: 'Section Break' },
				{
					fieldtype: 'MultiSelectList',
					fieldname: 'item',
					label: __('Items'),
					options: 'Item',
					get_data: function(txt) {
						const item_groups = stock_detail_filters.get_value('item_group') || [];
						return frappe.call({
							method: 'tif_customization.tif_customization.page.stock_detail.stock_detail.get_items',
							args: {
								item_group: JSON.stringify(item_groups || []),
								txt: txt || ''
							}
						}).then(r => {
							return (r.message || []).map(item => ({
								value: item.item_code,
								description: item.item_name || ''
							}));
						});
					}
				},
				{ fieldtype: 'Column Break' },
				{
					fieldtype: 'MultiSelectList',
					fieldname: 'warehouses',
					label: __('Warehouses'),
					options: 'Warehouse',
					get_data: function(txt) {
						return frappe.call({
							method: 'tif_customization.tif_customization.page.stock_detail.stock_detail.get_warehouses',
							args: { txt: txt || '' }
						}).then(r => r.message || []);
					}
				}
			]
		});
		stock_detail_filters.make();

		// Ensure date defaults are applied (can be empty on first soft navigation)
		stock_detail_filters.set_value('from_date', defaultFromDate);
		stock_detail_filters.set_value('to_date', defaultToDate);
		stock_detail_filters.set_value('warehouses', ['TIF Head Office - TIF']);
	}

	function getFilterValues() {
		if (!stock_detail_filters) {
			return {
				from_date: defaultFromDate,
				to_date: defaultToDate,
				item: null,
				item_group: null,
				warehouses: ['TIF Head Office - TIF'],
				warehouse: null,
				warehouse_sections: []
			};
		}
		const selectedItems = stock_detail_filters.get_value('item') || [];
		const selectedGroups = stock_detail_filters.get_value('item_group') || [];
		const selectedWarehouses = stock_detail_filters.get_value('warehouses') || [];
		const items = Array.isArray(selectedItems) ? selectedItems.filter(Boolean) : [];
		const groups = Array.isArray(selectedGroups) ? selectedGroups.filter(Boolean) : [];
		const warehouses = Array.isArray(selectedWarehouses) ? selectedWarehouses.filter(Boolean) : [];
		return {
			from_date: stock_detail_filters.get_value('from_date') || defaultFromDate,
			to_date: stock_detail_filters.get_value('to_date') || defaultToDate,
			item: items.length ? items : null,
			item_group: groups.length ? groups : null,
			warehouses: warehouses,
			warehouse: null,
			warehouse_sections: []
		};
	}

	function renderSelectedWarehouseSections(warehouseList) {
		const $wrap = container.find('#dynamic-warehouse-sections');
		$wrap.empty();
		(warehouseList || []).forEach((wh, idx) => {
			const safeId = `wh-dyn-${idx}`;
			const title = frappe.utils.escape_html(wh.warehouse_name || wh.warehouse || 'Warehouse');
			const section = $(`
				<div class="report-section dynamic-warehouse-section" data-warehouse="${frappe.utils.escape_html(wh.warehouse || '')}">
					<h4>${title}</h4>
					<div class="table-container">
						<table class="table table-bordered table-striped" id="${safeId}-table">
							<thead>
								<tr>
									<th>S.#</th>
									<th>Particulars</th>
									<th>Opening Balance</th>
									<th>Received (Vendor)</th>
									<th>Courier Returned</th>
									<th>Transferred In Warehouse</th>
									<th>Transferred Out Warehouse</th>
									<th>Delivered</th>
									<th>Ending Balance</th>
								</tr>
							</thead>
							<tbody></tbody>
							<tfoot></tfoot>
						</table>
					</div>
				</div>
			`);
			$wrap.append(section);
			populateDynamicWarehouseTable(section.find('tbody'), section.find('tfoot'), wh.data || []);
		});
	}

	function populateDynamicWarehouseTable(tbody, tfoot, data) {
		tbody.empty();
		tfoot.empty();
		data = data || [];

		if (!data.length) {
			tbody.append(`
				<tr>
					<td colspan="9" style="text-align:center; color:#888;">
						No stock ledger entries found for this warehouse with the selected filters.
					</td>
				</tr>
			`);
			return;
		}

		data.forEach(item => {
			tbody.append(`
				<tr>
					<td style="text-align: center;">${item.s_no}</td>
					<td class="particulars-cell">${frappe.utils.escape_html(item.particulars || '')}</td>
					<td class="number-cell">${formatNumber(item.opening_balance)}</td>
					<td class="number-cell">${formatNumber(item.received_vendor)}</td>
					<td class="number-cell">${formatNumber(item.courier_returned)}</td>
					<td class="number-cell">${formatNumber(item.transferred_in)}</td>
					<td class="number-cell">${formatNumber(item.transferred_out)}</td>
					<td class="number-cell">${formatNumber(item.delivered)}</td>
					<td class="number-cell">${formatNumber(item.ending_balance)}</td>
				</tr>
			`);
		});

		const totals = {
			opening_balance: data.reduce((sum, item) => sum + (item.opening_balance || 0), 0),
			received_vendor: data.reduce((sum, item) => sum + (item.received_vendor || 0), 0),
			courier_returned: data.reduce((sum, item) => sum + (item.courier_returned || 0), 0),
			transferred_in: data.reduce((sum, item) => sum + (item.transferred_in || 0), 0),
			transferred_out: data.reduce((sum, item) => sum + (item.transferred_out || 0), 0),
			delivered: data.reduce((sum, item) => sum + (item.delivered || 0), 0),
			ending_balance: data.reduce((sum, item) => sum + (item.ending_balance || 0), 0)
		};

		tfoot.append(`
			<tr>
				<td colspan="2"><strong>Total Stock</strong></td>
				<td class="number-cell"><strong>${formatNumber(totals.opening_balance)}</strong></td>
				<td class="number-cell"><strong>${formatNumber(totals.received_vendor)}</strong></td>
				<td class="number-cell"><strong>${formatNumber(totals.courier_returned)}</strong></td>
				<td class="number-cell"><strong>${formatNumber(totals.transferred_in)}</strong></td>
				<td class="number-cell"><strong>${formatNumber(totals.transferred_out)}</strong></td>
				<td class="number-cell"><strong>${formatNumber(totals.delivered)}</strong></td>
				<td class="number-cell"><strong>${formatNumber(totals.ending_balance)}</strong></td>
			</tr>
		`);
	}

	function loadStockData() {
		$('#dynamic-warehouse-sections').empty();
		
		const filters = getFilterValues();
		updateTableHeaders(filters.from_date, filters.to_date);

		frappe.call({
			method: 'tif_customization.tif_customization.page.stock_detail.stock_detail.get_stock_data',
			args: { filters: JSON.stringify(filters) },
			callback: function(r) {
				console.log('Initial load response:', r);
				console.log('Response message:', r.message);
				console.log('Has error?', r.message?.error);
				console.log('MQH Books Data:', r.message?.mqh_books_data);
				console.log('MQH Books Data Length:', r.message?.mqh_books_data?.length || 0);
				
				if (r.message) {
					if (r.message.error) {
						console.error('Error in response:', r.message.error);
						frappe.msgprint({
							title: 'Error Loading Data',
							message: `Error: ${r.message.error}`,
							indicator: 'red'
						});
					}
					
					if (r.message.kpi_data) {
						renderKPIs(r.message.kpi_data);
					}
					
					populateMQHBooksTable(r.message.mqh_books_data || []);
					populateMQHUrduBooksTable(r.message.mqh_urdu_books_data || []);
					renderSelectedWarehouseSections(r.message.selected_warehouses_data || []);
				} else {
					console.log('No message in response, using fallback');
					loadStockDataFallback();
				}
			},
			error: function(err) {
				console.error('Error calling get_stock_data:', err);
				loadStockDataFallback();
			}
		});
	}

	function loadFilterOptions() {
		// MultiSelectList loads warehouses/items on demand
	}

	function loadItems(itemGroup = null) {
		// no-op: Item MultiSelectList refreshes options on open/search
	}

	// Show custom loader overlay
	function showLoader() {
		// Remove existing loader if any
		$('#stock-detail-loader').remove();
		
		// Create loader overlay
		const loader = $(`
			<div id="stock-detail-loader" style="
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
					<div style="font-size: 16px; color: #495057; font-weight: 500;">Loading data...</div>
					<div style="font-size: 12px; color: #6c757d; margin-top: 5px;">Please wait while we fetch your data</div>
				</div>
			</div>
		`);
		$('body').append(loader);
	}
	
	// Hide custom loader overlay
	function hideLoader() {
		$('#stock-detail-loader').remove();
	}

	function resetApplyButton() {
		container.find('#apply-filters')
			.prop('disabled', false)
			.html('Apply Filters');
	}

	// Guard against overlapping loads (init + on_page_show race)
	let stockDetailLoadSeq = 0;
	
	// Apply filters
	function applyFilters() {
		const loadSeq = ++stockDetailLoadSeq;
		console.log('Apply filters clicked', loadSeq);
		
		const applyButton = container.find('#apply-filters');
		applyButton.prop('disabled', true).html('<i class="fa fa-spinner fa-spin"></i> Loading...');
		showLoader();
		
		const filters = getFilterValues();
		
		console.log('Filters object:', filters);
		console.log('Filters JSON:', JSON.stringify(filters));
		
		// Update table headers with selected date range
		updateTableHeaders(filters.from_date, filters.to_date);
		
		frappe.call({
			method: 'tif_customization.tif_customization.page.stock_detail.stock_detail.get_stock_data',
			args: { filters: JSON.stringify(filters) },
			callback: function(r) {
				// Ignore stale responses from an older overlapping request
				if (loadSeq !== stockDetailLoadSeq) {
					return;
				}
				try {
					console.log('Filter response:', r);
					console.log('MQH Books Data Count:', r.message?.mqh_books_data?.length || 0);
					
					if (r.message && !r.message.error) {
						if (r.message.kpi_data) {
							renderKPIs(r.message.kpi_data);
						}
						
						populateMQHBooksTable(r.message.mqh_books_data || []);
						populateMQHUrduBooksTable(r.message.mqh_urdu_books_data || []);
						renderSelectedWarehouseSections(r.message.selected_warehouses_data || []);
					} else {
						console.log('Error in filter response:', r.message);
						loadStockDataFallback();
					}
				} catch (err) {
					console.error('Error rendering stock detail:', err);
					frappe.msgprint({
						title: __('Error'),
						message: __('Data loaded but display failed. Check browser console.'),
						indicator: 'red'
					});
				} finally {
					hideLoader();
					resetApplyButton();
				}
			},
			error: function(err) {
				if (loadSeq !== stockDetailLoadSeq) {
					return;
				}
				hideLoader();
				resetApplyButton();
				console.log('Filter error:', err);
				loadStockDataFallback();
			}
		});
	}
	
	// Update table headers with selected date range
	function updateTableHeaders(fromDate, toDate) {
		if (fromDate && toDate) {
			// Format dates for display
			const fromDateFormatted = new Date(fromDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
			const toDateFormatted = new Date(toDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
			
			// Update MQH Books table headers
			$('#mqh-books-table thead tr th').each(function(index) {
				const $th = $(this);
				if (index === 3) $th.text(`Opening Stock ${fromDateFormatted}`);
				if (index === 4) $th.text(`Received Vendor till ${toDateFormatted}`);
				if (index === 5) $th.text(`Book Return till ${toDateFormatted}`);
				if (index === 6) $th.text(`Delivered till ${toDateFormatted}`);
				if (index === 7) $th.text(`Available Stock till ${toDateFormatted}`);
				if (index === 8) $th.text(`Books Sale <br/> Details till ${toDateFormatted}`);
				if (index === 9) $th.text(`Total Amount of Books Sale till ${toDateFormatted}`);
			});
			
			// Update MQH Urdu Books table headers
			$('#mqh-urdu-books-table thead tr th').each(function(index) {
				const $th = $(this);
				if (index === 3) $th.text(`Opening Stock ${fromDateFormatted}`);
				if (index === 4) $th.text(`Received Vendor till ${toDateFormatted}`);
				if (index === 5) $th.text(`Book Return till ${toDateFormatted}`);
				if (index === 6) $th.text(`Delivered till ${toDateFormatted}`);
				if (index === 7) $th.text(`Available Stock till ${toDateFormatted}`);
				if (index === 8) $th.text(`Books Sale Details till ${toDateFormatted}`);
				if (index === 9) $th.text(`Total Amount of Books Sale till ${toDateFormatted}`);
			});
		}
	}
	
	// Update warehouse sections visibility
	function updateWarehouseSections(selectedWarehouse) {
		if (selectedWarehouse) {
			// Hide individual warehouse sections
			$('.head-office-section').hide();
			$('.old-office-section').hide();
			$('.nazimabad-section').hide();
			// Show single warehouse section
			$('.single-warehouse-section').show();
		} else {
			// Don't show individual warehouse sections by default - controlled by warehouse-stock-filter
			// Hide single warehouse section
			$('.single-warehouse-section').hide();
		}
	}
	
	// Update warehouse stock visibility based on multi-select filter
	function updateWarehouseStockVisibility(selectedValues) {
		const selected = Array.isArray(selectedValues)
			? selectedValues.filter(Boolean)
			: (selectedValues ? [selectedValues] : []);

		// Hide all warehouse sections first
		$('.head-office-section').hide();
		$('.old-office-section').hide();
		$('.nazimabad-section').hide();
		$('.millat-section').hide();

		if (!selected.length) {
			return;
		}

		if (selected.includes('all')) {
			$('.head-office-section').show();
			$('.old-office-section').show();
			$('.nazimabad-section').show();
			$('.millat-section').show();
			return;
		}

		if (selected.includes('head-office')) $('.head-office-section').show();
		if (selected.includes('old-office')) $('.old-office-section').show();
		if (selected.includes('nazimabad')) $('.nazimabad-section').show();
		if (selected.includes('millat')) $('.millat-section').show();
	}
	
	// Populate single warehouse table
	function populateWarehouseTable(data, warehouseName) {
		const tbody = $('#single-warehouse-tbody');
		const tfoot = $('#single-warehouse-tfoot');
		
		// Clear existing content
		tbody.empty();
		tfoot.empty();
		
		// Update warehouse name in header
		$('#single-warehouse-title').text(`${warehouseName} - Stock Details`);
		
		// Add data rows
		data.forEach(item => {
			const row = $(`
				<tr>
					<td style="text-align: center;">${item.s_no}</td>
					<td class="particulars-cell">${item.particulars}</td>
					<td class="number-cell">${formatNumber(item.opening_balance)}</td>
					<td class="number-cell">${formatNumber(item.received_vendor)}</td>
					<td class="number-cell">${formatNumber(item.courier_returned)}</td>
					<td class="number-cell">${formatNumber(item.transferred_in)}</td>
					<td class="number-cell">${formatNumber(item.transferred_out)}</td>
					<td class="number-cell">${formatNumber(item.delivered)}</td>
					<td class="number-cell">${formatNumber(item.ending_balance)}</td>
				</tr>
			`);
			tbody.append(row);
		});
		
		// Calculate and add totals
		const totals = {
			opening_balance: data.reduce((sum, item) => sum + item.opening_balance, 0),
			received_vendor: data.reduce((sum, item) => sum + item.received_vendor, 0),
			courier_returned: data.reduce((sum, item) => sum + item.courier_returned, 0),
			transferred_in: data.reduce((sum, item) => sum + item.transferred_in, 0),
			transferred_out: data.reduce((sum, item) => sum + item.transferred_out, 0),
			delivered: data.reduce((sum, item) => sum + item.delivered, 0),
			ending_balance: data.reduce((sum, item) => sum + item.ending_balance, 0)
		};
		
		const totalRow = $(`
			<tr>
				<td colspan="2" style="text-align: left; font-weight: bold;">Total Stock</td>
				<td class="number-cell"><strong>${formatNumber(totals.opening_balance)}</strong></td>
				<td class="number-cell"><strong>${formatNumber(totals.received_vendor)}</strong></td>
				<td class="number-cell"><strong>${formatNumber(totals.courier_returned)}</strong></td>
				<td class="number-cell"><strong>${formatNumber(totals.transferred_in)}</strong></td>
				<td class="number-cell"><strong>${formatNumber(totals.transferred_out)}</strong></td>
				<td class="number-cell"><strong>${formatNumber(totals.delivered)}</strong></td>
				<td class="number-cell"><strong>${formatNumber(totals.ending_balance)}</strong></td>
			</tr>
		`);
		tfoot.append(totalRow);
	}
	
	// Reset filters
	function resetFilters() {
		const { fromDate, toDate } = getCurrentMonthDates();
		if (stock_detail_filters) {
			stock_detail_filters.set_values({
				from_date: fromDate,
				to_date: toDate,
				item_group: [],
				item: [],
				warehouses: ['TIF Head Office - TIF']
			});
		}
		
		updateTableHeaders(fromDate, toDate);
		$('#dynamic-warehouse-sections').empty();
		loadStockData();
	}
	
	// Export to Excel
	function exportToExcel() {
		let csvContent = '';
		const main = document.getElementById('mqh-books-table');
		if (main) csvContent += main.outerHTML + '\n\n';
		$('#dynamic-warehouse-sections table').each(function() {
			csvContent += this.outerHTML + '\n\n';
		});
		
		const blob = new Blob([csvContent], { type: 'text/csv' });
		const url = window.URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'stock_detail_report.csv';
		a.click();
		window.URL.revokeObjectURL(url);
	}
	
	// Print Report
	function printReport() {
		const filters = getFilterValues();
		const fromDate = filters.from_date || defaultFromDate;
		const toDate = filters.to_date || defaultToDate;
		$('.dynamic-warehouse-section').attr('data-print-visible', 'true');

		// Add print styles if not already added
		if (!$('#print-styles-stock-detail').length) {
			let printStyles = `
				<style id="print-styles-stock-detail" media="print">
					@page {
						size: A4 landscape;
						margin: 0.30cm 0cm 0.5cm 0cm;
					}
					@page:first {
						size: A4 landscape;
						margin: 0.30cm 0cm 0.5cm 0cm;
					}
					* {
						background: white !important;
						color: black !important;
						-webkit-print-color-adjust: exact !important;
						print-color-adjust: exact !important;
						box-sizing: border-box !important;
					}
					html, body {
						font-size: 10pt;
						background: white !important;
						color: black !important;
						margin: 0 !important;
						padding: 0 !important;
						width: 100% !important;
						max-width: 100% !important;
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
					.page-content,
					.page-content-wrapper,
					.layout-main,
					.main-section,
					.container {
						margin: 0 !important;
						padding: 0 !important;
						background: white !important;
						width: 100% !important;
						max-width: 100% !important;
					}
					.stock-detail-container {
						padding: 0 !important;
						margin: 0 !important;
						background: white !important;
						color: black !important;
						width: 100% !important;
						max-width: 100% !important;
						box-sizing: border-box !important;
						position: relative !important;
						left: 0 !important;
						right: 0 !important;
					}
					.print-header-stock-detail {
						text-align: center;
						margin-bottom: 30px;
						margin-top: 0;
						border-bottom: 2px solid black !important;
						padding-bottom: 15px;
						page-break-after: avoid;
						background: white !important;
						color: black !important;
					}
					.print-header-stock-detail h2 {
						margin: 0 0 15px 0;
						font-size: 18pt;
						font-weight: bold;
						color: black !important;
					}
					.print-header-stock-detail h3 {
						margin: 10px 0 5px 0;
						font-size: 16pt;
						font-weight: bold;
						color: black !important;
					}
					.print-header-stock-detail p {
						margin: 5px 0;
						font-size: 10pt;
						color: black !important;
					}
					.kpi-section {
						display: block !important;
						background: white !important;
					}
					.kpi-section h4:first-child,
					.kpi-section .kpi-card {
						display: none !important;
					}
					.kpi-section h5:first-of-type {
						display: none !important;
					}
					.kpi-section h5:first-of-type + .row {
						display: none !important;
					}
					.kpi-section h5:last-of-type {
						display: block !important;
						margin-top: 20px !important;
						margin-bottom: 15px !important;
						color: black !important;
						font-weight: bold !important;
					}
					.kpi-section .table-responsive {
						display: block !important;
						overflow: visible !important;
						width: 100% !important;
						background: white !important;
					}
					.kpi-section table {
						display: table !important;
						width: 100% !important;
						border-collapse: collapse !important;
						margin-bottom: 20px !important;
						background: white !important;
						border: 1px solid black !important;
					}
					.kpi-section table thead {
						display: table-header-group !important;
					}
					.kpi-section table tbody {
						display: table-row-group !important;
					}
					.kpi-section table tr {
						display: table-row !important;
						background: white !important;
					}
					.kpi-section table th,
					.kpi-section table td {
						display: table-cell !important;
						padding: 8px !important;
						border: 1px solid black !important;
						background: white !important;
						color: black !important;
					}
					.kpi-section table th {
						background: white !important;
						font-weight: bold !important;
						color: black !important;
					}
					.kpi-section table tbody tr:nth-child(even) {
						background: white !important;
					}
					.kpi-section table tbody tr:nth-child(odd) {
						background: white !important;
					}
					.report-content {
						display: block !important;
						background: white !important;
					}
					.report-section {
						display: block !important;
						margin-bottom: 20px;
						margin-top: 15px;
						page-break-inside: avoid;
						background: white !important;
					}
					.report-section:first-of-type {
						margin-top: 0;
					}
					.report-section[style*="display: none"],
					.head-office-section[style*="display: none"],
					.old-office-section[style*="display: none"],
					.nazimabad-section[style*="display: none"] {
						display: none !important;
					}
					/* Hide warehouse sections that are marked as not visible for print */
					.head-office-section[data-print-visible="false"],
					.old-office-section[data-print-visible="false"],
					.nazimabad-section[data-print-visible="false"],
					.millat-section[data-print-visible="false"] {
						display: none !important;
					}
					.report-section h4 {
						font-size: 14pt;
						font-weight: bold;
						margin-bottom: 10px;
						margin-top: 10px;
						border-bottom: 1px solid black !important;
						padding-bottom: 5px;
						color: black !important;
						background: white !important;
					}
					.report-section:first-child h4 {
						margin-top: 0 !important;
					}
					.report-section h5 {
						font-size: 12pt;
						font-weight: bold;
						margin-bottom: 10px;
						border-bottom: 1px solid black !important;
						padding-bottom: 5px;
						color: black !important;
						background: white !important;
					}
					.table-container {
						display: block !important;
						overflow: visible !important;
						background: white !important;
					}
					table {
						display: table !important;
						font-size: 6.5pt !important;
						width: 100% !important;
						max-width: 100% !important;
						border-collapse: collapse !important;
						page-break-inside: auto;
						background: white !important;
						border: 1px solid black !important;
						table-layout: fixed !important;
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
						background: white !important;
					}
					table tbody tr:last-child {
						page-break-after: auto;
					}
					table tfoot {
						page-break-inside: avoid;
					}
					table th,
					table td {
						padding: 2px 2px !important;
						border: 1px solid black !important;
						background: white !important;
						color: black !important;
						word-wrap: break-word !important;
						overflow: hidden !important;
						text-overflow: ellipsis !important;
						font-size: 6.5pt !important;
					}
					table th:first-child,
					table td:first-child {
						width: 4% !important;
						padding: 2px 1px !important;
					}
					table th:nth-child(2),
					table td:nth-child(2) {
						width: 18% !important;
						white-space: normal !important;
						text-align: left !important;
						padding: 2px 3px !important;
					}
					table th:nth-child(n+3),
					table td:nth-child(n+3) {
						width: 7.8% !important;
						text-align: right !important;
						padding: 2px 2px !important;
					}
					table th {
						background: white !important;
						font-weight: bold;
						color: black !important;
					}
					table tbody tr:nth-child(even) {
						background: white !important;
					}
					table tbody tr:nth-child(odd) {
						background: white !important;
					}
					table tfoot {
						display: table-footer-group;
					}
					table tfoot td {
						background: white !important;
						font-weight: bold;
						border-top: 2px solid black !important;
						color: black !important;
					}
					.table-responsive {
						overflow: visible !important;
						background: white !important;
					}
					.table-bordered {
						border: 1px solid black !important;
					}
					.table-striped tbody tr:nth-child(even) {
						background: white !important;
					}
					.table-striped tbody tr:nth-child(odd) {
						background: white !important;
					}
					strong {
						color: black !important;
						font-weight: bold !important;
					}
					.text-right {
						text-align: right !important;
					}
					.number-cell {
						text-align: right !important;
					}
					/* Prevent content from being cut off */
					.stock-detail-container {
						max-width: 100% !important;
						overflow: visible !important;
						width: 100% !important;
					}
					.page-content-wrapper,
					.page-content {
						margin: 0 !important;
						padding: 0 !important;
						width: 100% !important;
						max-width: 100% !important;
					}
					.table-container {
						width: 100% !important;
						max-width: 100% !important;
						overflow: visible !important;
						margin: 0 !important;
						padding: 0 !important;
					}
					.report-content {
						width: 100% !important;
						max-width: 100% !important;
						margin: 0 !important;
						padding: 0 !important;
					}
					/* Better page break handling */
					.report-section:not(:last-child) {
						page-break-after: auto;
					}
					/* Ensure tables don't get cut */
					.table-container {
						page-break-inside: auto;
					}
					/* Keep table headers on each page */
					table {
						page-break-after: auto;
					}
					table thead tr {
						page-break-inside: avoid;
						page-break-after: avoid;
					}
				</style>
			`;
			$('head').append(printStyles);
		}
		
		// Add print header if not exists
		if (!$('.print-header-stock-detail').length) {
			let printHeader = `
				<div class="print-header print-header-stock-detail">
					<h2>The ILM Foundation</h2>
					<h3>Stock Detail Report</h3>
					<p>Period: ${fromDate} to ${toDate}</p>
					<p>Generated on: ${frappe.datetime.str_to_user(frappe.datetime.get_datetime_as_string())}</p>
				</div>
			`;
			$('.stock-detail-container').prepend(printHeader);
		} else {
			// Update existing header
			$('.print-header-stock-detail h3').text('Stock Detail Report');
			$('.print-header-stock-detail p').first().text(`Period: ${fromDate} to ${toDate}`);
			$('.print-header-stock-detail p').last().text(`Generated on: ${frappe.datetime.str_to_user(frappe.datetime.get_datetime_as_string())}`);
		}
		
		// Trigger print
		window.print();
		
		// Restore warehouse sections visibility after print (in case user cancels)
		// Dynamic sections remain as-is after print
	}
	
	// Event listeners + initial load (scoped to this page container)
	function bindStockDetailEvents() {
		container.find('#apply-filters').off('click.stockdetail').on('click.stockdetail', function(e) {
			e.preventDefault();
			applyFilters();
		});
		container.find('#reset-filters').off('click.stockdetail').on('click.stockdetail', function(e) {
			e.preventDefault();
			resetFilters();
		});
		container.find('#export-excel').off('click.stockdetail').on('click.stockdetail', function(e) {
			e.preventDefault();
			exportToExcel();
		});
		container.find('#print-report').off('click.stockdetail').on('click.stockdetail', function(e) {
			e.preventDefault();
			printReport();
		});
	}

	function initStockDetailPage() {
		setupStockDetailFilters();
		bindStockDetailEvents();
		// Mark so on_page_show does not double-load on first open
		wrapper._stock_detail_initial_load_pending = true;
		setTimeout(function() {
			if (!container.find('#mqh-books-tbody').length) {
				console.error('Stock Detail: main table missing on init');
				hideLoader();
				resetApplyButton();
				return;
			}
			applyFilters();
			wrapper._stock_detail_initial_load_pending = false;
		}, 100);
	}

	initStockDetailPage();

	// Expose for on_page_show (soft navigation back to this page)
	wrapper.stock_detail_page = {
		reload: function() {
			if (container.closest('body').length) {
				applyFilters();
			}
		}
	};
	
	function loadStockDataFallback() {
		$('#dynamic-warehouse-sections').empty();
		const mqhBooksData = [
			{ s_no: 1, particulars: "No Data Found - Check Error Logs", opening_stock: 0, received_vendor: 0, book_return: 0, delivered: 0, available_stock: 0, demand_received: 0, books_sale: 0, total_amount: 0 }
		];
		populateMQHBooksTable(mqhBooksData);
		populateMQHUrduBooksTable([]);
		frappe.msgprint({
			title: 'No Data Found',
			message: 'No stock data found. Please check:<br>1. Items exist in your system<br>2. Warehouses are configured<br>3. Stock transactions exist<br>4. Check Error Log for details',
			indicator: 'orange'
		});
	}
	
	function loadStockDataOld() {
		// MQH Books Data (fallback hardcoded data)
		const mqhBooksData = [
			{ s_no: 1, particulars: "Mutalae Quran (Urdu) Book-1", opening_stock: 27764, received_vendor: 0, book_return: 150, delivered: 2364, available_stock: 25550, demand_received: 3732, books_sale: 1, total_amount: 2500 },
			{ s_no: 2, particulars: "Mutalae Quran (Urdu) Book-2", opening_stock: 31695, received_vendor: 0, book_return: 0, delivered: 2449, available_stock: 29246, demand_received: 1406, books_sale: 1, total_amount: 0 },
			{ s_no: 3, particulars: "Mutalae Quran (Urdu) Book-3", opening_stock: 17101, received_vendor: 0, book_return: 0, delivered: 1175, available_stock: 15926, demand_received: 958, books_sale: 1, total_amount: 0 },
			{ s_no: 4, particulars: "Mutalae Quran (Urdu) Book-4", opening_stock: 14249, received_vendor: 0, book_return: 0, delivered: 533, available_stock: 13716, demand_received: 394, books_sale: 1, total_amount: 0 },
			{ s_no: 5, particulars: "Mutalae Quran (Urdu) Book-5", opening_stock: 16905, received_vendor: 0, book_return: 0, delivered: 363, available_stock: 16542, demand_received: 274, books_sale: 1, total_amount: 0 },
			{ s_no: 6, particulars: "Mutalae Quran (Urdu) Book-6", opening_stock: 2721, received_vendor: 0, book_return: 0, delivered: 35, available_stock: 2686, demand_received: 78, books_sale: 1, total_amount: 0 },
			{ s_no: 7, particulars: "Mutalae Quran (Urdu) Book-7", opening_stock: 12342, received_vendor: 0, book_return: 0, delivered: 37, available_stock: 12305, demand_received: 43, books_sale: 1, total_amount: 0 },
			{ s_no: 8, particulars: "Teacher's Guide (Urdu) Book-1", opening_stock: 4754, received_vendor: 0, book_return: 1, delivered: 53, available_stock: 4702, demand_received: 37, books_sale: 0, total_amount: 0 },
			{ s_no: 9, particulars: "Teacher's Guide (Urdu) Book-2", opening_stock: 1891, received_vendor: 0, book_return: 0, delivered: 35, available_stock: 1856, demand_received: 24, books_sale: 0, total_amount: 0 },
			{ s_no: 10, particulars: "Teacher's Guide (Urdu) Book-3", opening_stock: 1752, received_vendor: 0, book_return: 0, delivered: 29, available_stock: 1723, demand_received: 5, books_sale: 0, total_amount: 0 },
			{ s_no: 11, particulars: "Teacher's Guide (Urdu) Book-4", opening_stock: 1730, received_vendor: 0, book_return: 0, delivered: 17, available_stock: 1713, demand_received: 0, books_sale: 0, total_amount: 0 },
			{ s_no: 12, particulars: "Teacher's Guide (Urdu) Book-5", opening_stock: 1114, received_vendor: 0, book_return: 0, delivered: 9, available_stock: 1105, demand_received: 0, books_sale: 0, total_amount: 0 },
			{ s_no: 13, particulars: "Mutalae Quran (Sindhi) Book-1", opening_stock: 7879, received_vendor: 0, book_return: 0, delivered: 0, available_stock: 7879, demand_received: 0, books_sale: 0, total_amount: 0 },
			{ s_no: 14, particulars: "Mutalae Quran (Sindhi) Book-2", opening_stock: 1874, received_vendor: 0, book_return: 0, delivered: 0, available_stock: 1874, demand_received: 0, books_sale: 0, total_amount: 0 },
			{ s_no: 15, particulars: "Mutalae Quran (Sindhi) Book-3", opening_stock: 1084, received_vendor: 0, book_return: 0, delivered: 0, available_stock: 1084, demand_received: 0, books_sale: 0, total_amount: 0 },
			{ s_no: 16, particulars: "Mutalae Quran (English) Book-1", opening_stock: 478, received_vendor: 0, book_return: 0, delivered: 293, available_stock: 185, demand_received: 142, books_sale: 0, total_amount: 0 },
			{ s_no: 17, particulars: "Mutalae Quran (English) Book-2", opening_stock: 1094, received_vendor: 0, book_return: 0, delivered: 0, available_stock: 1094, demand_received: 0, books_sale: 0, total_amount: 0 },
			{ s_no: 18, particulars: "Marketing Sample", opening_stock: 66, received_vendor: 0, book_return: 0, delivered: 2, available_stock: 64, demand_received: 0, books_sale: 0, total_amount: 0 },
			{ s_no: 19, particulars: "Noorani Quaida", opening_stock: 23464, received_vendor: 0, book_return: 0, delivered: 1317, available_stock: 22147, demand_received: 0, books_sale: 0, total_amount: 0 },
			{ s_no: 20, particulars: "Noorani Quaida Workbook", opening_stock: 7000, received_vendor: 0, book_return: 0, delivered: 0, available_stock: 7000, demand_received: 0, books_sale: 0, total_amount: 0 },
			{ s_no: 21, particulars: "Noorani Quaida Teacher Guide", opening_stock: 2000, received_vendor: 0, book_return: 0, delivered: 0, available_stock: 2000, demand_received: 0, books_sale: 0, total_amount: 0 },
			{ s_no: 22, particulars: "Tarjama Tul Quran Majeed - Class-6", opening_stock: 3073, received_vendor: 0, book_return: 0, delivered: 0, available_stock: 3073, demand_received: 0, books_sale: 0, total_amount: 0 },
			{ s_no: 23, particulars: "Tarjama Tul Quran Majeed - Class-7", opening_stock: 2921, received_vendor: 0, book_return: 0, delivered: 0, available_stock: 2921, demand_received: 0, books_sale: 0, total_amount: 0 }
		];
		
		// Head Office Data
		const headOfficeData = [
			{ s_no: 1, particulars: "Mutalae Quran (Urdu) Book-1", opening_balance: 388, received_vendor: 0, courier_returned: 150, transferred_in: 920, transferred_out: 0, delivered: 1029, ending_balance: 429 },
			{ s_no: 2, particulars: "Mutalae Quran (Urdu) Book-2", opening_balance: 443, received_vendor: 0, courier_returned: 0, transferred_in: 510, transferred_out: 0, delivered: 502, ending_balance: 451 },
			{ s_no: 3, particulars: "Mutalae Quran (Urdu) Book-3", opening_balance: 224, received_vendor: 0, courier_returned: 0, transferred_in: 390, transferred_out: 0, delivered: 398, ending_balance: 216 },
			{ s_no: 4, particulars: "Mutalae Quran (Urdu) Book-4", opening_balance: 342, received_vendor: 0, courier_returned: 0, transferred_in: 315, transferred_out: 0, delivered: 276, ending_balance: 381 },
			{ s_no: 5, particulars: "Mutalae Quran (Urdu) Book-5", opening_balance: 198, received_vendor: 0, courier_returned: 0, transferred_in: 200, transferred_out: 0, delivered: 168, ending_balance: 230 },
			{ s_no: 6, particulars: "Mutalae Quran (Urdu) Book-6", opening_balance: 74, received_vendor: 0, courier_returned: 0, transferred_in: 0, transferred_out: 0, delivered: 35, ending_balance: 39 },
			{ s_no: 7, particulars: "Mutalae Quran (Urdu) Book-7", opening_balance: 50, received_vendor: 0, courier_returned: 0, transferred_in: 0, transferred_out: 0, delivered: 37, ending_balance: 13 },
			{ s_no: 8, particulars: "Teacher's Guide (Urdu) Book-1", opening_balance: 98, received_vendor: 0, courier_returned: 1, transferred_in: 60, transferred_out: 0, delivered: 37, ending_balance: 122 },
			{ s_no: 9, particulars: "Teacher's Guide (Urdu) Book-2", opening_balance: 56, received_vendor: 0, courier_returned: 0, transferred_in: 0, transferred_out: 0, delivered: 17, ending_balance: 39 },
			{ s_no: 10, particulars: "Teacher's Guide (Urdu) Book-3", opening_balance: 76, received_vendor: 0, courier_returned: 0, transferred_in: 30, transferred_out: 0, delivered: 18, ending_balance: 88 },
			{ s_no: 11, particulars: "Teacher's Guide (Urdu) Book-4", opening_balance: 60, received_vendor: 0, courier_returned: 0, transferred_in: 0, transferred_out: 0, delivered: 13, ending_balance: 47 },
			{ s_no: 12, particulars: "Teacher's Guide (Urdu) Book-5", opening_balance: 27, received_vendor: 0, courier_returned: 0, transferred_in: 0, transferred_out: 0, delivered: 3, ending_balance: 24 },
			{ s_no: 13, particulars: "Mutalae Quran (Sindhi) Book-1", opening_balance: 4, received_vendor: 0, courier_returned: 0, transferred_in: 0, transferred_out: 0, delivered: 0, ending_balance: 4 },
			{ s_no: 14, particulars: "Mutalae Quran (Sindhi) Book-2", opening_balance: 66, received_vendor: 0, courier_returned: 0, transferred_in: 0, transferred_out: 0, delivered: 0, ending_balance: 66 },
			{ s_no: 15, particulars: "Mutalae Quran (Sindhi) Book-3", opening_balance: 30, received_vendor: 0, courier_returned: 0, transferred_in: 0, transferred_out: 0, delivered: 0, ending_balance: 30 },
			{ s_no: 16, particulars: "Mutalae Quran (English) Book-1", opening_balance: 96, received_vendor: 0, courier_returned: 0, transferred_in: 300, transferred_out: 0, delivered: 238, ending_balance: 158 },
			{ s_no: 17, particulars: "Mutalae Quran (English) Book-2", opening_balance: 44, received_vendor: 0, courier_returned: 0, transferred_in: 0, transferred_out: 0, delivered: 0, ending_balance: 44 },
			{ s_no: 18, particulars: "Marketing Sample", opening_balance: 66, received_vendor: 0, courier_returned: 0, transferred_in: 0, transferred_out: 0, delivered: 2, ending_balance: 64 },
			{ s_no: 19, particulars: "Noorani Quaida", opening_balance: 584, received_vendor: 0, courier_returned: 0, transferred_in: 2200, transferred_out: 0, delivered: 1317, ending_balance: 1467 },
			{ s_no: 20, particulars: "Noorani Quaida Workbook", opening_balance: 70, received_vendor: 0, courier_returned: 0, transferred_in: 0, transferred_out: 0, delivered: 0, ending_balance: 70 },
			{ s_no: 21, particulars: "Noorani Quaida Teacher Guide", opening_balance: 40, received_vendor: 0, courier_returned: 0, transferred_in: 0, transferred_out: 0, delivered: 0, ending_balance: 40 },
			{ s_no: 22, particulars: "Tarjama Tul Quran Majeed - Class-6", opening_balance: 0, received_vendor: 0, courier_returned: 0, transferred_in: 0, transferred_out: 0, delivered: 0, ending_balance: 0 },
			{ s_no: 23, particulars: "Tarjama Tul Quran Majeed - Class-7", opening_balance: 0, received_vendor: 0, courier_returned: 0, transferred_in: 0, transferred_out: 0, delivered: 0, ending_balance: 0 }
		];
		
		// Old Office Data
		const oldOfficeData = [
			{ s_no: 1, particulars: "Mutalae Quran (Urdu) Book-1", opening_balance: 14, received_vendor: 0, courier_returned: 0, transferred_in: 0, transferred_out: 0, delivered: 0, ending_balance: 14 },
			{ s_no: 2, particulars: "Mutalae Quran (Urdu) Book-2", opening_balance: 110, received_vendor: 0, courier_returned: 0, transferred_in: 0, transferred_out: 0, delivered: 0, ending_balance: 110 },
			{ s_no: 3, particulars: "Mutalae Quran (Urdu) Book-3", opening_balance: 200, received_vendor: 0, courier_returned: 0, transferred_in: 0, transferred_out: 0, delivered: 0, ending_balance: 200 },
			{ s_no: 4, particulars: "Mutalae Quran (Urdu) Book-4", opening_balance: 116, received_vendor: 0, courier_returned: 0, transferred_in: 0, transferred_out: 0, delivered: 0, ending_balance: 116 },
			{ s_no: 5, particulars: "Mutalae Quran (Urdu) Book-5", opening_balance: 133, received_vendor: 0, courier_returned: 0, transferred_in: 0, transferred_out: 0, delivered: 0, ending_balance: 133 },
			{ s_no: 6, particulars: "Mutalae Quran (Urdu) Book-6", opening_balance: 84, received_vendor: 0, courier_returned: 0, transferred_in: 0, transferred_out: 0, delivered: 0, ending_balance: 84 },
			{ s_no: 7, particulars: "Mutalae Quran (Urdu) Book-7", opening_balance: 7457, received_vendor: 0, courier_returned: 0, transferred_in: 0, transferred_out: 0, delivered: 0, ending_balance: 7457 },
			{ s_no: 8, particulars: "Teacher's Guide (Urdu) Book-1", opening_balance: 5, received_vendor: 0, courier_returned: 0, transferred_in: 0, transferred_out: 0, delivered: 0, ending_balance: 5 },
			{ s_no: 9, particulars: "Teacher's Guide (Urdu) Book-2", opening_balance: 5, received_vendor: 0, courier_returned: 0, transferred_in: 0, transferred_out: 0, delivered: 0, ending_balance: 5 },
			{ s_no: 10, particulars: "Teacher's Guide (Urdu) Book-3", opening_balance: 3, received_vendor: 0, courier_returned: 0, transferred_in: 0, transferred_out: 0, delivered: 0, ending_balance: 3 },
			{ s_no: 11, particulars: "Teacher's Guide (Urdu) Book-4", opening_balance: 5, received_vendor: 0, courier_returned: 0, transferred_in: 0, transferred_out: 0, delivered: 0, ending_balance: 5 },
			{ s_no: 12, particulars: "Teacher's Guide (Urdu) Book-5", opening_balance: 1, received_vendor: 0, courier_returned: 0, transferred_in: 0, transferred_out: 0, delivered: 0, ending_balance: 1 },
			{ s_no: 13, particulars: "Mutalae Quran (Sindhi) Book-1", opening_balance: 1270, received_vendor: 0, courier_returned: 0, transferred_in: 0, transferred_out: 0, delivered: 0, ending_balance: 1270 },
			{ s_no: 14, particulars: "Mutalae Quran (Sindhi) Book-2", opening_balance: 0, received_vendor: 0, courier_returned: 0, transferred_in: 0, transferred_out: 0, delivered: 0, ending_balance: 0 },
			{ s_no: 15, particulars: "Mutalae Quran (Sindhi) Book-3", opening_balance: 0, received_vendor: 0, courier_returned: 0, transferred_in: 0, transferred_out: 0, delivered: 0, ending_balance: 0 },
			{ s_no: 16, particulars: "Mutalae Quran (English) Book-1", opening_balance: 3, received_vendor: 0, courier_returned: 0, transferred_in: 0, transferred_out: 0, delivered: 0, ending_balance: 3 },
			{ s_no: 17, particulars: "Mutalae Quran (English) Book-2", opening_balance: 27, received_vendor: 0, courier_returned: 0, transferred_in: 0, transferred_out: 0, delivered: 0, ending_balance: 27 },
			{ s_no: 18, particulars: "Marketing Sample", opening_balance: 0, received_vendor: 0, courier_returned: 0, transferred_in: 0, transferred_out: 0, delivered: 0, ending_balance: 0 },
			{ s_no: 19, particulars: "Noorani Quaida", opening_balance: 22880, received_vendor: 0, courier_returned: 0, transferred_in: 0, transferred_out: 2200, delivered: 0, ending_balance: 20680 },
			{ s_no: 20, particulars: "Noorani Quaida Workbook", opening_balance: 6930, received_vendor: 0, courier_returned: 0, transferred_in: 0, transferred_out: 0, delivered: 0, ending_balance: 6930 },
			{ s_no: 21, particulars: "Noorani Quaida Teacher Guide", opening_balance: 1960, received_vendor: 0, courier_returned: 0, transferred_in: 0, transferred_out: 0, delivered: 0, ending_balance: 1960 },
			{ s_no: 22, particulars: "Tarjama Tul Quran Majeed - Class-6", opening_balance: 3073, received_vendor: 0, courier_returned: 0, transferred_in: 0, transferred_out: 0, delivered: 0, ending_balance: 3073 },
			{ s_no: 23, particulars: "Tarjama Tul Quran Majeed - Class-7", opening_balance: 2921, received_vendor: 0, courier_returned: 0, transferred_in: 0, transferred_out: 0, delivered: 0, ending_balance: 2921 }
		];
		
		// Nazimabad Warehouse Data
		const nazimabadData = [
			{ s_no: 1, particulars: "Mutalae Quran (Urdu) Book-1", opening_balance: 27362, received_vendor: 0, courier_returned: 0, transferred_in: 0, transferred_out: 920, delivered: 1335, ending_balance: 25107 },
			{ s_no: 2, particulars: "Mutalae Quran (Urdu) Book-2", opening_balance: 31142, received_vendor: 0, courier_returned: 0, transferred_in: 0, transferred_out: 510, delivered: 1947, ending_balance: 28685 },
			{ s_no: 3, particulars: "Mutalae Quran (Urdu) Book-3", opening_balance: 16677, received_vendor: 0, courier_returned: 0, transferred_in: 0, transferred_out: 390, delivered: 777, ending_balance: 15510 },
			{ s_no: 4, particulars: "Mutalae Quran (Urdu) Book-4", opening_balance: 13791, received_vendor: 0, courier_returned: 0, transferred_in: 0, transferred_out: 315, delivered: 257, ending_balance: 13219 },
			{ s_no: 5, particulars: "Mutalae Quran (Urdu) Book-5", opening_balance: 16574, received_vendor: 0, courier_returned: 0, transferred_in: 0, transferred_out: 200, delivered: 195, ending_balance: 16179 },
			{ s_no: 6, particulars: "Mutalae Quran (Urdu) Book-6", opening_balance: 2563, received_vendor: 0, courier_returned: 0, transferred_in: 0, transferred_out: 0, delivered: 0, ending_balance: 2563 },
			{ s_no: 7, particulars: "Mutalae Quran (Urdu) Book-7", opening_balance: 4835, received_vendor: 0, courier_returned: 0, transferred_in: 0, transferred_out: 0, delivered: 0, ending_balance: 4835 },
			{ s_no: 8, particulars: "Teacher's Guide (Urdu) Book-1", opening_balance: 4651, received_vendor: 0, courier_returned: 0, transferred_in: 0, transferred_out: 60, delivered: 16, ending_balance: 4575 },
			{ s_no: 9, particulars: "Teacher's Guide (Urdu) Book-2", opening_balance: 1830, received_vendor: 0, courier_returned: 0, transferred_in: 0, transferred_out: 0, delivered: 18, ending_balance: 1812 },
			{ s_no: 10, particulars: "Teacher's Guide (Urdu) Book-3", opening_balance: 1673, received_vendor: 0, courier_returned: 0, transferred_in: 0, transferred_out: 30, delivered: 11, ending_balance: 1632 },
			{ s_no: 11, particulars: "Teacher's Guide (Urdu) Book-4", opening_balance: 1665, received_vendor: 0, courier_returned: 0, transferred_in: 0, transferred_out: 0, delivered: 4, ending_balance: 1661 },
			{ s_no: 12, particulars: "Teacher's Guide (Urdu) Book-5", opening_balance: 1086, received_vendor: 0, courier_returned: 0, transferred_in: 0, transferred_out: 0, delivered: 6, ending_balance: 1080 },
			{ s_no: 13, particulars: "Mutalae Quran (Sindhi) Book-1", opening_balance: 6605, received_vendor: 0, courier_returned: 0, transferred_in: 0, transferred_out: 0, delivered: 0, ending_balance: 6605 },
			{ s_no: 14, particulars: "Mutalae Quran (Sindhi) Book-2", opening_balance: 1808, received_vendor: 0, courier_returned: 0, transferred_in: 0, transferred_out: 0, delivered: 0, ending_balance: 1808 },
			{ s_no: 15, particulars: "Mutalae Quran (Sindhi) Book-3", opening_balance: 1054, received_vendor: 0, courier_returned: 0, transferred_in: 0, transferred_out: 0, delivered: 0, ending_balance: 1054 },
			{ s_no: 16, particulars: "Mutalae Quran (English) Book-1", opening_balance: 379, received_vendor: 0, courier_returned: 0, transferred_in: 0, transferred_out: 300, delivered: 55, ending_balance: 24 },
			{ s_no: 17, particulars: "Mutalae Quran (English) Book-2", opening_balance: 1023, received_vendor: 0, courier_returned: 0, transferred_in: 0, transferred_out: 0, delivered: 0, ending_balance: 1023 },
			{ s_no: 18, particulars: "Marketing Sample", opening_balance: 0, received_vendor: 0, courier_returned: 0, transferred_in: 0, transferred_out: 0, delivered: 0, ending_balance: 0 },
			{ s_no: 19, particulars: "Noorani Quaida", opening_balance: 0, received_vendor: 0, courier_returned: 0, transferred_in: 0, transferred_out: 0, delivered: 0, ending_balance: 0 }
		];
		
		// Populate MQH Books table
		populateMQHBooksTable(mqhBooksData);
		
		// Populate Head Office table
		populateHeadOfficeTable(headOfficeData);
		
		// Populate Old Office table
		populateOldOfficeTable(oldOfficeData);
		
		// Populate Nazimabad Warehouse table
		populateNazimabadTable(nazimabadData);
	}
	
	function populateMQHBooksTable(data) {
		console.log('populateMQHBooksTable called with data:', data);
		console.log('populateMQHBooksTable - Data length:', data ? data.length : 0);
		
		const tbody = container.find('#mqh-books-tbody');
		const tfoot = container.find('#mqh-books-tfoot');
		
		// Check if elements exist
		if (tbody.length === 0) {
			console.error('populateMQHBooksTable - tbody element not found!');
			return;
		}
		if (tfoot.length === 0) {
			console.error('populateMQHBooksTable - tfoot element not found!');
			return;
		}
		
		console.log('populateMQHBooksTable - tbody found:', tbody.length, 'tfoot found:', tfoot.length);
		
		// Clear existing content
		tbody.empty();
		tfoot.empty();
		
		if (!data || data.length === 0) {
			console.warn('populateMQHBooksTable - No data provided, showing empty table');
			return;
		}
		
		// Add data rows
		let rowsAdded = 0;
		data.forEach((item, index) => {
			try {
				const row = $(`
					<tr>
						<td style="text-align: center;">${item.s_no || ''}</td>
						<td>${item.item_code || ''}</td>
						<td>${item.item_name || ''}</td>
						<td class="number-cell">${formatNumber(item.opening_stock || 0)}</td>
						<td class="number-cell">${formatNumber(item.received_vendor || 0)}</td>
						<td class="number-cell">${formatNumber(item.book_return || 0)}</td>
						<td class="number-cell">${formatNumber(item.delivered || 0)}</td>
						<td class="number-cell">${formatNumber(item.available_stock || 0)}</td>
						<td class="number-cell">${formatNumber(item.books_sale || 0)}</td>
						<td class="number-cell">${formatNumber(item.total_amount || 0)}</td>
					</tr>
				`);
				tbody.append(row);
				rowsAdded++;
				if (index < 3) {
					console.log('populateMQHBooksTable - Added row:', index, item.particulars);
				}
			} catch (error) {
				console.error('populateMQHBooksTable - Error adding row:', index, error);
			}
		});
		
		console.log('populateMQHBooksTable - Total rows added:', rowsAdded);
		
		// Calculate and add totals
		const totals = {
			opening_stock: data.reduce((sum, item) => sum + item.opening_stock, 0),
			received_vendor: data.reduce((sum, item) => sum + item.received_vendor, 0),
			book_return: data.reduce((sum, item) => sum + item.book_return, 0),
			delivered: data.reduce((sum, item) => sum + item.delivered, 0),
			available_stock: data.reduce((sum, item) => sum + item.available_stock, 0),
			books_sale: data.reduce((sum, item) => sum + item.books_sale, 0),
			total_amount: data.reduce((sum, item) => sum + item.total_amount, 0)
		};
		
		const totalRow = $(`
			<tr>
				<td colspan="3" style="text-align: left;"><strong>Total Stock</strong></td>
				<td class="number-cell"><strong>${formatNumber(totals.opening_stock)}</strong></td>
				<td class="number-cell"><strong>${formatNumber(totals.received_vendor)}</strong></td>
				<td class="number-cell"><strong>${formatNumber(totals.book_return)}</strong></td>
				<td class="number-cell"><strong>${formatNumber(totals.delivered)}</strong></td>
				<td class="number-cell"><strong>${formatNumber(totals.available_stock)}</strong></td>
				<td class="number-cell"><strong>${formatNumber(totals.books_sale)}</strong></td>
				<td class="number-cell"><strong>${formatNumber(totals.total_amount)}</strong></td>
			</tr>
		`);
		tfoot.append(totalRow);
	}
	
	function populateMQHUrduBooksTable(data) {
		const tbody = $('#mqh-urdu-books-tbody');
		const tfoot = $('#mqh-urdu-books-tfoot');
		if (!tbody.length) return;
		
		// Clear existing content
		tbody.empty();
		tfoot.empty();
		
		// Add data rows
		data.forEach(item => {
			const row = $(`
				<tr>
					<td style="text-align: center;">${item.s_no}</td>
					<td>${item.item_code || ''}</td>
					<td>${item.item_name || ''}</td>
					<td class="number-cell">${formatNumber(item.opening_stock)}</td>
					<td class="number-cell">${formatNumber(item.received_vendor)}</td>
					<td class="number-cell">${formatNumber(item.book_return)}</td>
					<td class="number-cell">${formatNumber(item.delivered)}</td>
					<td class="number-cell">${formatNumber(item.available_stock)}</td>
					<td class="number-cell">${formatNumber(item.books_sale)}</td>
					<td class="number-cell">${formatNumber(item.total_amount)}</td>
				</tr>
			`);
			tbody.append(row);
		});
		
		// Calculate and add totals
		const totals = {
			opening_stock: data.reduce((sum, item) => sum + item.opening_stock, 0),
			received_vendor: data.reduce((sum, item) => sum + item.received_vendor, 0),
			book_return: data.reduce((sum, item) => sum + item.book_return, 0),
			delivered: data.reduce((sum, item) => sum + item.delivered, 0),
			available_stock: data.reduce((sum, item) => sum + item.available_stock, 0),
			books_sale: data.reduce((sum, item) => sum + item.books_sale, 0),
			total_amount: data.reduce((sum, item) => sum + item.total_amount, 0)
		};
		
		const totalRow = $(`
			<tr>
				<td colspan="3" style="text-align: left;"><strong>Total Stock</strong></td>
				<td class="number-cell"><strong>${formatNumber(totals.opening_stock)}</strong></td>
				<td class="number-cell"><strong>${formatNumber(totals.received_vendor)}</strong></td>
				<td class="number-cell"><strong>${formatNumber(totals.book_return)}</strong></td>
				<td class="number-cell"><strong>${formatNumber(totals.delivered)}</strong></td>
				<td class="number-cell"><strong>${formatNumber(totals.available_stock)}</strong></td>
				<td class="number-cell"><strong>${formatNumber(totals.books_sale)}</strong></td>
				<td class="number-cell"><strong>${formatNumber(totals.total_amount)}</strong></td>
			</tr>
		`);
		tfoot.append(totalRow);
	}
	
	function renderKPIs(kpiData) {
		if (!kpiData) {
			return;
		}
		
		const kpiSection = container.find('#kpi-section');
		kpiSection.empty();
		
		// Summary KPIs at the top
		const summaryHtml = `
			<h4 style="margin-bottom: 15px;">Overall Stock Summary</h4>
			<div class="kpi-summary-row">
				<div class="kpi-col">
					<div class="kpi-card summary-kpi" style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: black; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
						<h5 class="kpi-title">Total Items</h5>
						<div class="kpi-value">${kpiData.total_items || 0}</div>
						<p class="kpi-sub">Items Tracked</p>
					</div>
				</div>
				<div class="kpi-col">
					<div class="kpi-card summary-kpi" style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); color: black; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
						<h5 class="kpi-title">Total Opening Stock</h5>
						<div class="kpi-value">${formatNumber(kpiData.total_opening_stock || 0)}</div>
						<p class="kpi-sub">Units</p>
					</div>
				</div>
				<div class="kpi-col">
					<div class="kpi-card summary-kpi" style="background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%); color: black; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
						<h5 class="kpi-title">Total Available Stock</h5>
						<div class="kpi-value">${formatNumber(kpiData.total_available_stock || 0)}</div>
						<p class="kpi-sub">Units</p>
					</div>
				</div>
				<div class="kpi-col">
					<div class="kpi-card summary-kpi" style="background: linear-gradient(135deg, #fa709a 0%, #fee140 100%); color: black; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
						<h5 class="kpi-title">Total Delivered</h5>
						<div class="kpi-value">${formatNumber(kpiData.total_delivered || 0)}</div>
						<p class="kpi-sub">Units</p>
					</div>
				</div>
				<div class="kpi-col">
					<div class="kpi-card summary-kpi pending-dispatches-kpi" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: black; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); cursor: pointer;" title="Click to view pending dispatches">
						<h5 class="kpi-title">Pending Dispatches</h5>
						<div class="kpi-value">${formatNumber(kpiData.pending_dispatches_count || 0)}</div>
						<p class="kpi-sub">Sales Orders · Click for details</p>
					</div>
				</div>
				<div class="kpi-col">
					<div class="kpi-card summary-kpi sales-invoices-kpi" style="background: linear-gradient(135deg, #30cfd0 0%, #330867 100%); color: black; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); cursor: pointer;" title="Click to view sales invoices">
						<h5 class="kpi-title">Sales Invoices</h5>
						<div class="kpi-value">${formatNumber(kpiData.sales_invoice_count || 0)}</div>
						<p class="kpi-sub">${formatNumber(kpiData.sales_invoice_total_qty || 0)} Qty | ${formatCurrency(kpiData.sales_invoice_total_amount || 0)}</p>
					</div>
				</div>
				<div class="kpi-col">
					<div class="kpi-card summary-kpi return-books-kpi" style="background: linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%); color: black; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); cursor: pointer;" title="Click for return books details">
						<h5 class="kpi-title">Return Books</h5>
						<div class="kpi-value">${formatNumber(kpiData.total_book_return || 0)}</div>
						<p class="kpi-sub">Total Books Returned</p>
					</div>
				</div>
				<div class="kpi-col">
					<div class="kpi-card summary-kpi millat-purchase-kpi" style="background: linear-gradient(135deg, #f7971e 0%, #ffd200 100%); color: black; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); cursor: pointer;" title="Millat Publishers Purchase Details">
						<h5 class="kpi-title">Millat Purchase</h5>
						<div class="kpi-value">${formatNumber(kpiData.millat_po_total_qty || 0)}</div>
						<p class="kpi-sub">${formatNumber(kpiData.millat_po_count || 0)} POs | ${formatCurrency(kpiData.millat_po_total_amount || 0)}</p>
					</div>
				</div>
			</div>
			
			<!-- Department-wise Item Count and Totals KPIs -->
			<h4 style="margin-bottom: 15px; margin-top: 30px;">Department-wise Summary</h4>
			<div class="kpi-dept-row">
				<div class="kpi-col">
					<div class="kpi-card" style="background: linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%); color: black; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 15px;">
						<h5 style="margin: 0 0 15px 0; font-size: 16px; font-weight: bold; opacity: 0.95;">TPS Department</h5>
						<div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
							<span style="font-size: 13px; opacity: 0.9;">Item Count:</span>
							<strong style="font-size: 13px;">${formatNumber(kpiData.tps_item_count || 0)}</strong>
						</div>
						<div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
							<span style="font-size: 13px; opacity: 0.9;">Opening Stock:</span>
							<strong style="font-size: 13px;">${formatNumber(kpiData.tps_opening_stock || 0)}</strong>
						</div>
						<div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
							<span style="font-size: 13px; opacity: 0.9;">Available Stock:</span>
							<strong style="font-size: 13px;">${formatNumber(kpiData.tps_available_stock || 0)}</strong>
						</div>
						<div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
							<span style="font-size: 13px; opacity: 0.9;">Delivered:</span>
							<strong style="font-size: 13px;">${formatNumber(kpiData.tps_delivered || 0)}</strong>
						</div>
						<div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
							<span style="font-size: 13px; opacity: 0.9;">Received Vendor:</span>
							<strong style="font-size: 13px;">${formatNumber(kpiData.tps_received_vendor || 0)}</strong>
						</div>
						<div style="display: flex; justify-content: space-between;">
							<span style="font-size: 13px; opacity: 0.9;">Book Return:</span>
							<strong style="font-size: 13px;">${formatNumber(kpiData.tps_book_return || 0)}</strong>
						</div>
						<p style="margin: 10px 0 0 0; font-size: 11px;color: black; opacity: 0.8; border-top: 1px solid rgba(0,0,0,0.1); padding-top: 8px;">Includes: Noorani Qaida, Noorani Qaida Workbook, Panj Para 26-30, Panj Para 1-5, NQTG</p>
					</div>
				</div>
				<div class="kpi-col">
					<div class="kpi-card" style="background: linear-gradient(135deg, #4ecdc4 0%, #44a08d 100%); color: black; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 15px;">
						<h5 style="margin: 0 0 15px 0; font-size: 16px; font-weight: bold; opacity: 0.95;">QPS Department</h5>
						<div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
							<span style="font-size: 13px; opacity: 0.9;">Item Count:</span>
							<strong style="font-size: 13px;">${formatNumber(kpiData.qps_item_count || 0)}</strong>
						</div>
						<div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
							<span style="font-size: 13px; opacity: 0.9;">Opening Stock:</span>
							<strong style="font-size: 13px;">${formatNumber(kpiData.qps_opening_stock || 0)}</strong>
						</div>
						<div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
							<span style="font-size: 13px; opacity: 0.9;">Available Stock:</span>
							<strong style="font-size: 13px;">${formatNumber(kpiData.qps_available_stock || 0)}</strong>
						</div>
						<div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
							<span style="font-size: 13px; opacity: 0.9;">Delivered:</span>
							<strong style="font-size: 13px;">${formatNumber(kpiData.qps_delivered || 0)}</strong>
						</div>
						<div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
							<span style="font-size: 13px; opacity: 0.9;">Received Vendor:</span>
							<strong style="font-size: 13px;">${formatNumber(kpiData.qps_received_vendor || 0)}</strong>
						</div>
						<div style="display: flex; justify-content: space-between;">
							<span style="font-size: 13px; opacity: 0.9;">Book Return:</span>
							<strong style="font-size: 13px;">${formatNumber(kpiData.qps_book_return || 0)}</strong>
						</div>
						<p style="margin: 10px 0 0 0; font-size: 11px;color: black; opacity: 0.8; border-top: 1px solid rgba(0,0,0,0.1); padding-top: 8px;">Includes: All Other Items</p>
					</div>
				</div>
			</div>
		`;
		
		// Individual Item Balance KPIs - Separate KPI cards for each item
		let itemsHtml = '';
		if (kpiData.items && kpiData.items.length > 0) {
			// Generate color gradients for each item (cycling through colors)
			const colorGradients = [
				'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
				'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
				'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
				'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
				'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
				'linear-gradient(135deg, #30cfd0 0%, #330867 100%)',
				'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
				'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)',
				'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)',
				'linear-gradient(135deg, #ff8a80 0%, #ea6100 100%)',
				'linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%)',
				'linear-gradient(135deg, #a1c4fd 0%, #c2e9fb 100%)',
				'linear-gradient(135deg, #ff6e7f 0%, #bfe9ff 100%)',
				'linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)',
				'linear-gradient(135deg, #fad961 0%, #f76b1c 100%)',
				'linear-gradient(135deg, #fa8bff 0%, #2bd2ff 100%)',
				'linear-gradient(135deg, #fbc2eb 0%, #a6c1ee 100%)',
				'linear-gradient(135deg, #fdcbf1 0%, #e6dee9 100%)',
				'linear-gradient(135deg, #a8caba 0%, #5d4e75 100%)',
				'linear-gradient(135deg, #d299c2 0%, #fef9d7 100%)',
				'linear-gradient(135deg, #89f7fe 0%, #66a6ff 100%)',
				'linear-gradient(135deg, #fdbb2d 0%, #22c1c3 100%)',
				'linear-gradient(135deg, #ee0979 0%, #ff6a00 100%)'
			];
			
			// Debug: Check for MQHWB-01/U/12 duplicates
			const mqhwb01Items = kpiData.items.filter(item => item.item_code === 'MQHWB-01/U/12');
			if (mqhwb01Items.length > 1) {
				console.error('[DEBUG] MQHWB-01/U/12 appears', mqhwb01Items.length, 'times in KPI items!', mqhwb01Items);
			} else if (mqhwb01Items.length === 1) {
				console.log('[DEBUG] MQHWB-01/U/12 KPI data:', mqhwb01Items[0]);
			}
			
			// Filter out "Para" and Panj Para items from the main Book Wise Count list
			// (Panj Para items are rendered separately to keep them grouped at the bottom)
			const filteredItems = kpiData.items.filter(item => {
				const itemCode = item.item_code || '';
				const itemName = item.item_name || '';
				
				if (itemCode === 'Para') return false;
				if (itemCode.includes('Panj Para 26-30') || itemName.includes('Panj Para 26-30')) return false;
				if (itemCode.includes('Panj Para 1-5') || itemName.includes('Panj Para 1-5')) return false;
				
				return true;
			});
			
			// Find Panj Para items
			const panjPara2630 = kpiData.items.find(item => 
				item.item_code && (
					item.item_code.includes('Panj Para 26-30') || 
					item.item_code.includes('Panj Para 26') ||
					item.item_code.includes('PP26-30') ||
					item.item_name && item.item_name.includes('Panj Para 26-30')
				)
			);
			const panjPara15 = kpiData.items.find(item => 
				item.item_code && (
					item.item_code.includes('Panj Para 1-5') || 
					item.item_code.includes('Panj Para 1') ||
					item.item_code.includes('PP1-5') ||
					item.item_name && item.item_name.includes('Panj Para 1-5')
				)
			);
			
			itemsHtml = `
				<h5 style="margin-bottom: 15px; margin-top: 30px; font-weight: bold; color: #495057;">Book Wise Count</h5>
				<div class="row" style="margin-bottom: 20px;">
					${filteredItems.map((item, index) => {
						const balance = item.available_stock || 0;
						
						// Debug for MQHWB-01/U/12
						if (item.item_code === 'MQHWB-01/U/12') {
							console.log('[DEBUG Frontend] Rendering MQHWB-01/U/12:', {
								item_code: item.item_code,
								available_stock: item.available_stock,
								balance: balance,
								index: index
							});
						}
						
						const colorGradient = colorGradients[index % colorGradients.length];
						const itemCode = frappe.utils.escape_html(item.item_code || '-');
						const rawItemName = item.item_name || '';
						const itemName = frappe.utils.escape_html(
							rawItemName && rawItemName !== item.item_code ? rawItemName : ''
						);
						const nameTitle = itemName
							? ` title="${frappe.utils.escape_html(rawItemName)}"`
							: '';

						return `
							<div class="col-md-2" style="margin-bottom: 10px;">
								<div class="kpi-card stock-item-card" style="background: ${colorGradient}; color: black; padding: 12px; border-radius: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); min-height: 118px;">
									<h6 style="margin: 0 0 5px 0; font-size: 12px; color: black; opacity: 0.95; font-weight: bold; line-height: 1.2; word-break: break-word;">${itemCode}</h6>
									<p class="stock-item-name"${nameTitle}>${itemName || '&nbsp;'}</p>
									<h2 style="margin: 0; font-size: 22px; font-weight: bold; text-align: center;">${formatNumber(balance)}</h2>
									<p style="margin: 5px 0 0 0; font-size: 12px;color: black; opacity: 0.85; text-align: center;">Available Stock</p>
								</div>
							</div>
						`;
					}).join('')}
					${panjPara2630 ? `
						<div class="col-md-2" style="margin-bottom: 10px;">
							<div class="kpi-card stock-item-card" style="background: linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%); color: black; padding: 12px; border-radius: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); min-height: 118px;">
								<h6 style="margin: 0 0 5px 0; font-size: 12px; color: black; opacity: 0.95; font-weight: bold; line-height: 1.2; word-break: break-word;">${frappe.utils.escape_html(panjPara2630.item_code || 'Panj Para 26-30')}</h6>
								<p class="stock-item-name">Panj Para 26-30</p>
								<h2 style="margin: 0; font-size: 22px; font-weight: bold; text-align: center;">${formatNumber(panjPara2630.available_stock || 0)}</h2>
								<p style="margin: 5px 0 0 0; font-size: 12px;color: black; opacity: 0.85; text-align: center;">Available Stock</p>
							</div>
						</div>
					` : `
						<div class="col-md-2" style="margin-bottom: 10px;">
							<div class="kpi-card stock-item-card" style="background: linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%); color: black; padding: 12px; border-radius: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); min-height: 118px;">
								<h6 style="margin: 0 0 5px 0; font-size: 12px; color: black; opacity: 0.95; font-weight: bold; line-height: 1.2;">Panj Para 26-30</h6>
								<p class="stock-item-name">&nbsp;</p>
								<h2 style="margin: 0; font-size: 22px; font-weight: bold; text-align: center;">${formatNumber(0)}</h2>
								<p style="margin: 5px 0 0 0; font-size: 12px;color: black; opacity: 0.85; text-align: center;">Available Stock</p>
							</div>
						</div>
					`}
					${panjPara15 ? `
						<div class="col-md-2" style="margin-bottom: 10px;">
							<div class="kpi-card stock-item-card" style="background: linear-gradient(135deg, #4ecdc4 0%, #44a08d 100%); color: black; padding: 12px; border-radius: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); min-height: 118px;">
								<h6 style="margin: 0 0 5px 0; font-size: 12px; color: black; opacity: 0.95; font-weight: bold; line-height: 1.2; word-break: break-word;">${frappe.utils.escape_html(panjPara15.item_code || 'Panj Para 1-5')}</h6>
								<p class="stock-item-name">Panj Para 1-5</p>
								<h2 style="margin: 0; font-size: 22px; font-weight: bold; text-align: center;">${formatNumber(panjPara15.available_stock || 0)}</h2>
								<p style="margin: 5px 0 0 0; font-size: 12px;color: black; opacity: 0.85; text-align: center;">Available Stock</p>
							</div>
						</div>
					` : `
						<div class="col-md-2" style="margin-bottom: 10px;">
							<div class="kpi-card stock-item-card" style="background: linear-gradient(135deg, #4ecdc4 0%, #44a08d 100%); color: black; padding: 12px; border-radius: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); min-height: 118px;">
								<h6 style="margin: 0 0 5px 0; font-size: 12px; color: black; opacity: 0.95; font-weight: bold; line-height: 1.2;">Panj Para 1-5</h6>
								<p class="stock-item-name">&nbsp;</p>
								<h2 style="margin: 0; font-size: 22px; font-weight: bold; text-align: center;">${formatNumber(0)}</h2>
								<p style="margin: 5px 0 0 0; font-size: 12px;color: black; opacity: 0.85; text-align: center;">Available Stock</p>
							</div>
						</div>
					`}
				</div>
				
				<!-- Detailed Table for Individual Items -->
				<h5 style="margin-bottom: 15px; margin-top: 30px; font-weight: bold; color: #495057;">Detailed Item Information</h5>
				<div class="table-responsive">
					<table class="table table-bordered table-striped" style="background: white;">
						<thead>
							<tr style="background-color: #ffffff;">
								<th style="background: #ffffff; color: #000;">Item Code</th>
								<th style="background: #ffffff; color: #000;">Item Name</th>
								<th class="text-right" style="background: #ffffff; color: #000;">Opening Stock</th>
								<th class="text-right" style="background: #ffffff; color: #000;">Available Stock</th>
								<th class="text-right" style="background: #ffffff; color: #000;">Delivered</th>
								<th class="text-right" style="background: #ffffff; color: #000;">Received Vendor</th>
								<th class="text-right" style="background: #ffffff; color: #000;">Book Return</th>
								<th class="text-right" style="background: #ffffff; color: #000;">Books Sale</th>
								<th class="text-right" style="background: #ffffff; color: #000;">Total Amount</th>
							</tr>
						</thead>
						<tbody>
							${filteredItems.map(item => `
								<tr>
									<td><strong>${item.item_code || '-'}</strong></td>
									<td>${item.item_name || '-'}</td>
									<td class="text-right">${formatNumber(item.opening_stock || 0)}</td>
									<td class="text-right"><strong style="color: #28a745;">${formatNumber(item.available_stock || 0)}</strong></td>
									<td class="text-right">${formatNumber(item.delivered || 0)}</td>
									<td class="text-right">${formatNumber(item.received_vendor || 0)}</td>
									<td class="text-right">${formatNumber(item.book_return || 0)}</td>
									<td class="text-right">${formatNumber(item.books_sale || 0)}</td>
									<td class="text-right">${formatNumber(item.total_amount || 0)}</td>
								</tr>
							`).join('')}
							${panjPara2630 ? `
								<tr>
									<td><strong>${panjPara2630.item_code || 'Panj Para 26-30'}</strong></td>
									<td>${panjPara2630.item_name || 'Panj Para 26-30'}</td>
									<td class="text-right">${formatNumber(panjPara2630.opening_stock || 0)}</td>
									<td class="text-right"><strong style="color: #28a745;">${formatNumber(panjPara2630.available_stock || 0)}</strong></td>
									<td class="text-right">${formatNumber(panjPara2630.delivered || 0)}</td>
									<td class="text-right">${formatNumber(panjPara2630.received_vendor || 0)}</td>
									<td class="text-right">${formatNumber(panjPara2630.book_return || 0)}</td>
									<td class="text-right">${formatNumber(panjPara2630.books_sale || 0)}</td>
									<td class="text-right">${formatNumber(panjPara2630.total_amount || 0)}</td>
								</tr>
							` : ''}
							${panjPara15 ? `
								<tr>
									<td><strong>${panjPara15.item_code || 'Panj Para 1-5'}</strong></td>
									<td>${panjPara15.item_name || 'Panj Para 1-5'}</td>
									<td class="text-right">${formatNumber(panjPara15.opening_stock || 0)}</td>
									<td class="text-right"><strong style="color: #28a745;">${formatNumber(panjPara15.available_stock || 0)}</strong></td>
									<td class="text-right">${formatNumber(panjPara15.delivered || 0)}</td>
									<td class="text-right">${formatNumber(panjPara15.received_vendor || 0)}</td>
									<td class="text-right">${formatNumber(panjPara15.book_return || 0)}</td>
									<td class="text-right">${formatNumber(panjPara15.books_sale || 0)}</td>
									<td class="text-right">${formatNumber(panjPara15.total_amount || 0)}</td>
								</tr>
							` : ''}
						</tbody>
						<tfoot>
							<tr style="background-color: #e9ecef; font-weight: bold;">
								<td colspan="2"><strong>Total</strong></td>
								<td class="text-right"><strong>${formatNumber(filteredItems.reduce((sum, item) => sum + (parseFloat(item.opening_stock) || 0), 0) + (panjPara2630 ? (parseFloat(panjPara2630.opening_stock) || 0) : 0) + (panjPara15 ? (parseFloat(panjPara15.opening_stock) || 0) : 0))}</strong></td>
								<td class="text-right"><strong>${formatNumber(filteredItems.reduce((sum, item) => sum + (parseFloat(item.available_stock) || 0), 0) + (panjPara2630 ? (parseFloat(panjPara2630.available_stock) || 0) : 0) + (panjPara15 ? (parseFloat(panjPara15.available_stock) || 0) : 0))}</strong></td>
								<td class="text-right"><strong>${formatNumber(filteredItems.reduce((sum, item) => sum + (parseFloat(item.delivered) || 0), 0) + (panjPara2630 ? (parseFloat(panjPara2630.delivered) || 0) : 0) + (panjPara15 ? (parseFloat(panjPara15.delivered) || 0) : 0))}</strong></td>
								<td class="text-right"><strong>${formatNumber(filteredItems.reduce((sum, item) => sum + (parseFloat(item.received_vendor) || 0), 0) + (panjPara2630 ? (parseFloat(panjPara2630.received_vendor) || 0) : 0) + (panjPara15 ? (parseFloat(panjPara15.received_vendor) || 0) : 0))}</strong></td>
								<td class="text-right"><strong>${formatNumber(filteredItems.reduce((sum, item) => sum + (parseFloat(item.book_return) || 0), 0) + (panjPara2630 ? (parseFloat(panjPara2630.book_return) || 0) : 0) + (panjPara15 ? (parseFloat(panjPara15.book_return) || 0) : 0))}</strong></td>
								<td class="text-right"><strong>${formatNumber(filteredItems.reduce((sum, item) => sum + (parseFloat(item.books_sale) || 0), 0) + (panjPara2630 ? (parseFloat(panjPara2630.books_sale) || 0) : 0) + (panjPara15 ? (parseFloat(panjPara15.books_sale) || 0) : 0))}</strong></td>
								<td class="text-right"><strong>${formatNumber(filteredItems.reduce((sum, item) => sum + (parseFloat(item.total_amount) || 0), 0) + (panjPara2630 ? (parseFloat(panjPara2630.total_amount) || 0) : 0) + (panjPara15 ? (parseFloat(panjPara15.total_amount) || 0) : 0))}</strong></td>
							</tr>
						</tfoot>
					</table>
				</div>
			`;
		}
		
		kpiSection.html(summaryHtml + itemsHtml);
		
		$('.millat-purchase-kpi').on('click', function() {
			const fromDate = (stock_detail_filters && stock_detail_filters.get_value('from_date')) || frappe.datetime.month_start();
			const toDate = (stock_detail_filters && stock_detail_filters.get_value('to_date')) || frappe.datetime.get_today();
			let listUrl =
				'/app/purchase-order?supplier=' +
				encodeURIComponent('Millat Printers & Publishers Peshawar');
			if (fromDate && toDate) {
				listUrl += `&transaction_date=["between",["${fromDate}","${toDate}"]]`;
			}
			window.open(listUrl, '_blank');
		});

		// Add click handler for Return Books KPI
		$('.return-books-kpi').on('click', function() {
			const fromDate = (stock_detail_filters && stock_detail_filters.get_value('from_date')) || frappe.datetime.month_start();
			const toDate = (stock_detail_filters && stock_detail_filters.get_value('to_date')) || frappe.datetime.get_today();
			const company = frappe.defaults.get_user_default("Company") || '';
			let reportUrl = `/app/query-report/School Return Report?from_date=${encodeURIComponent(fromDate)}&to_date=${encodeURIComponent(toDate)}`;
			if (company) {
				reportUrl += `&company=${encodeURIComponent(company)}`;
			}
			window.open(reportUrl, '_blank');
		});

		$('.pending-dispatches-kpi').on('click', function() {
			showPendingDispatchesDialog();
		});

		$('.sales-invoices-kpi').on('click', function() {
			showSalesInvoicesDialog();
		});
	}

	function showPendingDispatchesDialog() {
		const filters = getFilterValues();
		frappe.call({
			method: 'tif_customization.tif_customization.page.stock_detail.stock_detail.get_pending_dispatches_details',
			args: { filters: JSON.stringify(filters) },
			freeze: true,
			freeze_message: __('Loading pending dispatches...'),
			callback: function(r) {
				const rows = r.message || [];
				let body = '';
				if (!rows.length) {
					body = `<p class="text-muted">${__('No pending dispatches found.')}</p>`;
				} else {
					body = `
						<div style="max-height: 420px; overflow: auto;">
							<table class="table table-bordered table-striped" style="font-size: 12px; margin: 0;">
								<thead>
									<tr>
										<th>${__('Sales Order')}</th>
										<th>${__('Customer')}</th>
										<th>${__('Date')}</th>
										<th>${__('Status')}</th>
										<th class="text-right">${__('% Delivered')}</th>
										<th class="text-right">${__('Pending Qty')}</th>
										<th class="text-right">${__('Grand Total')}</th>
									</tr>
								</thead>
								<tbody>
									${rows.map(row => `
										<tr>
											<td><a href="/app/sales-order/${encodeURIComponent(row.name)}" target="_blank">${frappe.utils.escape_html(row.name)}</a></td>
											<td>${frappe.utils.escape_html(row.customer_name || row.customer || '')}</td>
											<td>${frappe.datetime.str_to_user(row.transaction_date) || ''}</td>
											<td>${frappe.utils.escape_html(row.status || '')}</td>
											<td class="text-right">${flt(row.per_delivered || 0).toFixed(1)}%</td>
											<td class="text-right">${formatNumber(row.pending_qty || 0)}</td>
											<td class="text-right">${formatCurrency(row.grand_total || 0)}</td>
										</tr>
									`).join('')}
								</tbody>
							</table>
						</div>
						<p class="text-muted" style="margin-top: 8px;">${rows.length} ${__('record(s)')}</p>
					`;
				}
				const d = new frappe.ui.Dialog({
					title: __('Pending Dispatches'),
					size: 'extra-large',
					fields: [{ fieldtype: 'HTML', fieldname: 'details', options: body }],
					primary_action_label: __('Open Sales Order List'),
					primary_action: function() {
						// Exclude cancelled / closed / completed SOs from the list opened by dashboard
						const statusFilter = encodeURIComponent(JSON.stringify(["not in", ["Cancelled", "Closed", "Completed"]]));
						window.open(`/app/sales-order?docstatus=1&status=${statusFilter}`, '_blank');
						d.hide();
					}
				});
				d.show();
			}
		});
	}

	function showSalesInvoicesDialog() {
		const filters = getFilterValues();
		frappe.call({
			method: 'tif_customization.tif_customization.page.stock_detail.stock_detail.get_sales_invoice_details',
			args: { filters: JSON.stringify(filters) },
			freeze: true,
			freeze_message: __('Loading sales invoices...'),
			callback: function(r) {
				const rows = r.message || [];
				let body = '';
				if (!rows.length) {
					body = `<p class="text-muted">${__('No sales invoices found for the selected filters.')}</p>`;
				} else {
					const totalQty = rows.reduce((s, row) => s + (flt(row.qty) || 0), 0);
					const totalAmount = rows.reduce((s, row) => s + (flt(row.amount) || 0), 0);
					body = `
						<div style="max-height: 420px; overflow: auto;">
							<table class="table table-bordered table-striped" style="font-size: 12px; margin: 0;">
								<thead>
									<tr>
										<th>${__('Sales Invoice')}</th>
										<th>${__('Customer')}</th>
										<th>${__('Date')}</th>
										<th>${__('Status')}</th>
										<th class="text-right">${__('Qty')}</th>
										<th class="text-right">${__('Amount')}</th>
									</tr>
								</thead>
								<tbody>
									${rows.map(row => `
										<tr>
											<td><a href="/app/sales-invoice/${encodeURIComponent(row.name)}" target="_blank">${frappe.utils.escape_html(row.name)}</a></td>
											<td>${frappe.utils.escape_html(row.customer_name || row.customer || '')}</td>
											<td>${frappe.datetime.str_to_user(row.posting_date) || ''}</td>
											<td>${frappe.utils.escape_html(row.status || '')}</td>
											<td class="text-right">${formatNumber(row.qty || 0)}</td>
											<td class="text-right">${formatCurrency(row.amount || 0)}</td>
										</tr>
									`).join('')}
								</tbody>
								<tfoot>
									<tr>
										<td colspan="4"><strong>${__('Total')}</strong></td>
										<td class="text-right"><strong>${formatNumber(totalQty)}</strong></td>
										<td class="text-right"><strong>${formatCurrency(totalAmount)}</strong></td>
									</tr>
								</tfoot>
							</table>
						</div>
						<p class="text-muted" style="margin-top: 8px;">${rows.length} ${__('invoice(s)')}</p>
					`;
				}
				const d = new frappe.ui.Dialog({
					title: __('Sales Invoices'),
					size: 'extra-large',
					fields: [{ fieldtype: 'HTML', fieldname: 'details', options: body }],
					primary_action_label: __('Open Sales Invoice List'),
					primary_action: function() {
						window.open('/app/sales-invoice', '_blank');
						d.hide();
					}
				});
				d.show();
			}
		});
	}
	
	function populateHeadOfficeTable(data) {
		console.log('populateHeadOfficeTable called with data:', data);
		console.log('populateHeadOfficeTable - Data length:', data.length);
		
		// Don't show the section automatically - it's controlled by warehouse-stock-filter
		// $('.head-office-section').show();
		
		const tbody = $('#head-office-tbody');
		const tfoot = $('#head-office-tfoot');
		
		// Check if elements exist
		if (tbody.length === 0) {
			console.error('populateHeadOfficeTable - tbody element not found!');
			return;
		}
		if (tfoot.length === 0) {
			console.error('populateHeadOfficeTable - tfoot element not found!');
			return;
		}
		
		console.log('populateHeadOfficeTable - tbody found:', tbody.length, 'tfoot found:', tfoot.length);
		
		// Clear existing content
		tbody.empty();
		tfoot.empty();
		
		// Add data rows
		let rowsAdded = 0;
		data.forEach((item, index) => {
			try {
				console.log('populateHeadOfficeTable - Adding item:', index, item);
				const row = $(`
					<tr>
						<td style="text-align: center;">${item.s_no || ''}</td>
						<td class="particulars-cell">${item.particulars || ''}</td>
						<td class="number-cell">${formatNumber(item.opening_balance || 0)}</td>
						<td class="number-cell">${formatNumber(item.received_vendor || 0)}</td>
						<td class="number-cell">${formatNumber(item.courier_returned || 0)}</td>
						<td class="number-cell">${formatNumber(item.transferred_in || 0)}</td>
						<td class="number-cell">${formatNumber(item.transferred_out || 0)}</td>
						<td class="number-cell">${formatNumber(item.delivered || 0)}</td>
						<td class="number-cell">${formatNumber(item.ending_balance || 0)}</td>
					</tr>
				`);
				tbody.append(row);
				rowsAdded++;
				console.log('populateHeadOfficeTable - Row appended:', index, 'Total rows:', rowsAdded);
			} catch (error) {
				console.error('populateHeadOfficeTable - Error adding row:', index, error);
			}
		});
		
		console.log('populateHeadOfficeTable - Total rows added:', rowsAdded, 'tbody children:', tbody.children().length);
		
		// Calculate and add totals
		const totals = {
			opening_balance: data.reduce((sum, item) => sum + (item.opening_balance || 0), 0),
			received_vendor: data.reduce((sum, item) => sum + (item.received_vendor || 0), 0),
			courier_returned: data.reduce((sum, item) => sum + (item.courier_returned || 0), 0),
			transferred_in: data.reduce((sum, item) => sum + (item.transferred_in || 0), 0),
			transferred_out: data.reduce((sum, item) => sum + (item.transferred_out || 0), 0),
			delivered: data.reduce((sum, item) => sum + (item.delivered || 0), 0),
			ending_balance: data.reduce((sum, item) => sum + (item.ending_balance || 0), 0)
		};
		
		const totalRow = $(`
			<tr>
				<td colspan="2" style="text-align: left; font-weight: bold;">Total Stock</td>
				<td class="number-cell"><strong>${formatNumber(totals.opening_balance)}</strong></td>
				<td class="number-cell"><strong>${formatNumber(totals.received_vendor)}</strong></td>
				<td class="number-cell"><strong>${formatNumber(totals.courier_returned)}</strong></td>
				<td class="number-cell"><strong>${formatNumber(totals.transferred_in)}</strong></td>
				<td class="number-cell"><strong>${formatNumber(totals.transferred_out)}</strong></td>
				<td class="number-cell"><strong>${formatNumber(totals.delivered)}</strong></td>
				<td class="number-cell"><strong>${formatNumber(totals.ending_balance)}</strong></td>
			</tr>
		`);
		tfoot.append(totalRow);
		console.log('populateHeadOfficeTable - Totals row added. Final tbody rows:', tbody.children().length, 'tfoot rows:', tfoot.children().length);
		console.log('populateHeadOfficeTable - Table HTML length:', tbody.html() ? tbody.html().length : 0);
	}
	
	function populateOldOfficeTable(data) {
		const tbody = $('#old-office-tbody');
		const tfoot = $('#old-office-tfoot');
		
		// Clear existing content
		tbody.empty();
		tfoot.empty();
		
		// Add data rows
		data.forEach(item => {
			const row = $(`
				<tr>
					<td>${item.s_no}</td>
					<td class="particulars-cell">${item.particulars}</td>
					<td class="number-cell">${formatNumber(item.opening_balance)}</td>
					<td class="number-cell">${formatNumber(item.received_vendor)}</td>
					<td class="number-cell">${formatNumber(item.courier_returned)}</td>
					<td class="number-cell">${formatNumber(item.transferred_in)}</td>
					<td class="number-cell">${formatNumber(item.transferred_out)}</td>
					<td class="number-cell">${formatNumber(item.delivered)}</td>
					<td class="number-cell">${formatNumber(item.ending_balance)}</td>
				</tr>
			`);
			tbody.append(row);
		});
		
		// Calculate and add totals
		const totals = {
			opening_balance: data.reduce((sum, item) => sum + item.opening_balance, 0),
			received_vendor: data.reduce((sum, item) => sum + item.received_vendor, 0),
			courier_returned: data.reduce((sum, item) => sum + item.courier_returned, 0),
			transferred_in: data.reduce((sum, item) => sum + item.transferred_in, 0),
			transferred_out: data.reduce((sum, item) => sum + item.transferred_out, 0),
			delivered: data.reduce((sum, item) => sum + item.delivered, 0),
			ending_balance: data.reduce((sum, item) => sum + item.ending_balance, 0)
		};
		
		const totalRow = $(`
			<tr>
				<td colspan="2" style="text-align: left; font-weight: bold;">Total Stock</td>
				<td class="number-cell"><strong>${formatNumber(totals.opening_balance)}</strong></td>
				<td class="number-cell"><strong>${formatNumber(totals.received_vendor)}</strong></td>
				<td class="number-cell"><strong>${formatNumber(totals.courier_returned)}</strong></td>
				<td class="number-cell"><strong>${formatNumber(totals.transferred_in)}</strong></td>
				<td class="number-cell"><strong>${formatNumber(totals.transferred_out)}</strong></td>
				<td class="number-cell"><strong>${formatNumber(totals.delivered)}</strong></td>
				<td class="number-cell"><strong>${formatNumber(totals.ending_balance)}</strong></td>
			</tr>
		`);
		tfoot.append(totalRow);
	}
	
	function populateNazimabadTable(data) {
		const tbody = $('#nazimabad-tbody');
		const tfoot = $('#nazimabad-tfoot');
		
		// Clear existing content
		tbody.empty();
		tfoot.empty();
		
		// Add data rows
		data.forEach(item => {
			const row = $(`
				<tr>
					<td style="text-align: center;">${item.s_no}</td>
					<td class="particulars-cell">${item.particulars}</td>
					<td class="number-cell">${formatNumber(item.opening_balance)}</td>
					<td class="number-cell">${formatNumber(item.received_vendor)}</td>
					<td class="number-cell">${formatNumber(item.courier_returned)}</td>
					<td class="number-cell">${formatNumber(item.transferred_in)}</td>
					<td class="number-cell">${formatNumber(item.transferred_out)}</td>
					<td class="number-cell">${formatNumber(item.delivered)}</td>
					<td class="number-cell">${formatNumber(item.ending_balance)}</td>
				</tr>
			`);
			tbody.append(row);
		});
		
		// Calculate and add totals
		const totals = {
			opening_balance: data.reduce((sum, item) => sum + item.opening_balance, 0),
			received_vendor: data.reduce((sum, item) => sum + item.received_vendor, 0),
			courier_returned: data.reduce((sum, item) => sum + item.courier_returned, 0),
			transferred_in: data.reduce((sum, item) => sum + item.transferred_in, 0),
			transferred_out: data.reduce((sum, item) => sum + item.transferred_out, 0),
			delivered: data.reduce((sum, item) => sum + item.delivered, 0),
			ending_balance: data.reduce((sum, item) => sum + item.ending_balance, 0)
		};
		
		const totalRow = $(`
			<tr>
				<td colspan="2"><strong>Total Stock</strong></td>
				<td class="number-cell"><strong>${formatNumber(totals.opening_balance)}</strong></td>
				<td class="number-cell"><strong>${formatNumber(totals.received_vendor)}</strong></td>
				<td class="number-cell"><strong>${formatNumber(totals.courier_returned)}</strong></td>
				<td class="number-cell"><strong>${formatNumber(totals.transferred_in)}</strong></td>
				<td class="number-cell"><strong>${formatNumber(totals.transferred_out)}</strong></td>
				<td class="number-cell"><strong>${formatNumber(totals.delivered)}</strong></td>
				<td class="number-cell"><strong>${formatNumber(totals.ending_balance)}</strong></td>
			</tr>
		`);
		tfoot.append(totalRow);
	}

	function populateMillatTable(data) {
		const tbody = $('#millat-tbody');
		const tfoot = $('#millat-tfoot');
		if (!tbody.length) return;

		tbody.empty();
		tfoot.empty();
		data = data || [];

		if (!data.length) {
			tbody.append(`
				<tr>
					<td colspan="9" style="text-align:center; color:#888;">
						No stock ledger entries found in Millat Warehouse for the selected filters.
					</td>
				</tr>
			`);
			return;
		}

		data.forEach(item => {
			const row = $(`
				<tr>
					<td style="text-align: center;">${item.s_no}</td>
					<td class="particulars-cell">${item.particulars}</td>
					<td class="number-cell">${formatNumber(item.opening_balance)}</td>
					<td class="number-cell">${formatNumber(item.received_vendor)}</td>
					<td class="number-cell">${formatNumber(item.courier_returned)}</td>
					<td class="number-cell">${formatNumber(item.transferred_in)}</td>
					<td class="number-cell">${formatNumber(item.transferred_out)}</td>
					<td class="number-cell">${formatNumber(item.delivered)}</td>
					<td class="number-cell">${formatNumber(item.ending_balance)}</td>
				</tr>
			`);
			tbody.append(row);
		});

		const totals = {
			opening_balance: data.reduce((sum, item) => sum + (item.opening_balance || 0), 0),
			received_vendor: data.reduce((sum, item) => sum + (item.received_vendor || 0), 0),
			courier_returned: data.reduce((sum, item) => sum + (item.courier_returned || 0), 0),
			transferred_in: data.reduce((sum, item) => sum + (item.transferred_in || 0), 0),
			transferred_out: data.reduce((sum, item) => sum + (item.transferred_out || 0), 0),
			delivered: data.reduce((sum, item) => sum + (item.delivered || 0), 0),
			ending_balance: data.reduce((sum, item) => sum + (item.ending_balance || 0), 0)
		};

		const totalRow = $(`
			<tr>
				<td colspan="2"><strong>Total Stock</strong></td>
				<td class="number-cell"><strong>${formatNumber(totals.opening_balance)}</strong></td>
				<td class="number-cell"><strong>${formatNumber(totals.received_vendor)}</strong></td>
				<td class="number-cell"><strong>${formatNumber(totals.courier_returned)}</strong></td>
				<td class="number-cell"><strong>${formatNumber(totals.transferred_in)}</strong></td>
				<td class="number-cell"><strong>${formatNumber(totals.transferred_out)}</strong></td>
				<td class="number-cell"><strong>${formatNumber(totals.delivered)}</strong></td>
				<td class="number-cell"><strong>${formatNumber(totals.ending_balance)}</strong></td>
			</tr>
		`);
		tfoot.append(totalRow);
	}
	
	function formatNumber(num) {
		if (num === 0) return '-';
		return num.toLocaleString();
	}
	
	function formatCurrency(value) {
		if (value === null || value === undefined || value === '') {
			return '0.00';
		}
		var currency = frappe.boot.sysdefaults.currency || 'PKR';
		var precision = cint(frappe.boot.sysdefaults.currency_precision || 2);
		value = flt(value);
		return format_currency(value, currency, precision);
	}
}

// Soft navigation: reload when returning to this page (skip duplicate first-open load)
frappe.pages['stock-detail'].on_page_show = function(wrapper) {
	if (wrapper._stock_detail_initial_load_pending) {
		return;
	}
	if (wrapper.stock_detail_page && typeof wrapper.stock_detail_page.reload === 'function') {
		wrapper.stock_detail_page.reload();
	}
};
