frappe.pages['stock-detail'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Stock Detail Report',
		single_column: true
	});
	
	// Create the main container
	let container = $(`<div class="stock-detail-container">
		<div class="report-header">
			<h2>The ILM Foundation</h2>
			<h3>MQH Books Stock Details - 2025-26</h3>
		</div>
		
		<!-- Filter Section -->
		<div class="filter-section">
			<div class="row">
				<div class="col-md-2">
					<label>From Date:</label>
					<input type="date" id="from-date" class="form-control" value="2025-09-01">
				</div>
				<div class="col-md-2">
					<label>To Date:</label>
					<input type="date" id="to-date" class="form-control" value="2025-09-30">
				</div>
				<div class="col-md-2">
					<label>Item:</label>
					<select id="item-filter" class="form-control">
						<option value="">All Items</option>
					</select>
				</div>
				<div class="col-md-2">
					<label>Warehouse:</label>
					<select id="warehouse-filter" class="form-control">
						<option value="">All Warehouses</option>
					</select>
				</div>
				<div class="col-md-2">
					<label>Item Group:</label>
					<select id="item-group-filter" class="form-control">
						<option value="">All Item Groups</option>
					</select>
				</div>
			</div>
			<div class="row" style="margin-top: 10px;">
				<div class="col-md-12">
					<button id="apply-filters" class="btn btn-primary">Apply Filters</button>
					<button id="reset-filters" class="btn btn-secondary">Reset</button>
					<button id="export-excel" class="btn btn-success">Export to Excel</button>
					<button id="test-button" class="btn btn-warning">Test</button>
				</div>
			</div>
		</div>
		
		<!-- KPI Section -->
		<div class="kpi-section" id="kpi-section" style="margin: 20px 0; padding: 20px; background: #f8f9fa; border-radius: 8px;">
			<!-- KPIs will be rendered here -->
		</div>
		
		<div class="report-content">
			<div class="report-section">
				<h4>MQH Books Stock Details - 2025-26</h4>
				<div class="table-container">
					<table class="table table-bordered table-striped" id="mqh-books-table">
						<thead>
							<tr>
								<th>S.#</th>
								<th>Item Code</th>
								<th>Item Name</th>
								<th>Opening Stock Sep-2025</th>
								<th>Received Vendor till 30-Sep-2025</th>
								<th>Book Return till 30-Sep-2025</th>
								<th>Delivered till 30-Sep-2025</th>
								<th>Available Stock till 30-Sep-2025</th>
								<th>Demand Received till 30-Sep-2025</th>
								<th>Books Sale Details till 30-Sep-2025</th>
								<th>Total Amount of Books Sale till 30-Sep-2025</th>
							</tr>
						</thead>
						<tbody id="mqh-books-tbody">
						</tbody>
						<tfoot id="mqh-books-tfoot">
						</tfoot>
					</table>
				</div>
			</div>
			
			<div class="report-section">
				<h4>MQH Books (Urdu Version) - 2025-26</h4>
				<div class="table-container">
					<table class="table table-bordered table-striped" id="mqh-urdu-books-table">
						<thead>
							<tr>
								<th>S.#</th>
								<th>Item Code</th>
								<th>Item Name</th>
								<th>Opening Stock Sep-2025</th>
								<th>Received Vendor till 30-Sep-2025</th>
								<th>Book Return till 30-Sep-2025</th>
								<th>Delivered till 30-Sep-2025</th>
								<th>Available Stock till 30-Sep-2025</th>
								<th>Demand Received till 30-Sep-2025</th>
								<th>Books Sale Details till 30-Sep-2025</th>
								<th>Total Amount of Books Sale till 30-Sep-2025</th>
							</tr>
						</thead>
						<tbody id="mqh-urdu-books-tbody">
						</tbody>
						<tfoot id="mqh-urdu-books-tfoot">
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
			
			<div class="report-section head-office-section">
				<h4>TIF Head Office Stock 30-Sep-2025</h4>
				<div class="table-container">
					<table class="table table-bordered table-striped" id="head-office-table">
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
						<tbody id="head-office-tbody">
						</tbody>
						<tfoot id="head-office-tfoot">
						</tfoot>
					</table>
				</div>
			</div>
			
			<div class="report-section old-office-section">
				<h4>TIF Old Office 30-Sep-2025</h4>
				<div class="table-container">
					<table class="table table-bordered table-striped" id="old-office-table">
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
						<tbody id="old-office-tbody">
						</tbody>
						<tfoot id="old-office-tfoot">
						</tfoot>
					</table>
				</div>
			</div>
			
			<div class="report-section nazimabad-section">
				<h4>Nazimabad Warehouse 30-Sep-2025</h4>
				<div class="table-container">
					<table class="table table-bordered table-striped" id="nazimabad-table">
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
						<tbody id="nazimabad-tbody">
						</tbody>
						<tfoot id="nazimabad-tfoot">
						</tfoot>
					</table>
				</div>
			</div>
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
			}
			.filter-section .btn {
				margin-right: 10px;
				padding: 8px 16px;
				font-size: 14px;
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
				background: #2d5a27;
				color: white;
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
	
	// Load data and populate tables
	loadStockData();
	
	function loadStockData() {
		// Show all warehouse sections by default
		updateWarehouseSections('');
		
		// Get data from Python controller via AJAX
		frappe.call({
			method: 'tif_customization.tif_customization.page.stock_detail.stock_detail.get_stock_data',
			args: {},
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
					
					// Render KPIs even if data is empty
					if (r.message.kpi_data) {
						renderKPIs(r.message.kpi_data);
					}
					
					// Populate tables with dynamic data (even if empty arrays)
					const mqhData = r.message.mqh_books_data || [];
					const urduData = r.message.mqh_urdu_books_data || [];
					const headOfficeData = r.message.head_office_data || [];
					const oldOfficeData = r.message.old_office_data || [];
					const nazimabadData = r.message.nazimabad_warehouse_data || [];
					
					console.log('Populating tables with:', {
						mqh: mqhData.length,
						urdu: urduData.length,
						headOffice: headOfficeData.length,
						oldOffice: oldOfficeData.length,
						nazimabad: nazimabadData.length
					});
					
					populateMQHBooksTable(mqhData);
					populateMQHUrduBooksTable(urduData);
					populateHeadOfficeTable(headOfficeData);
					populateOldOfficeTable(oldOfficeData);
					populateNazimabadTable(nazimabadData);
					
					// Show message if no data
					if (mqhData.length === 0 && urduData.length === 0 && !r.message.error) {
						frappe.msgprint({
							title: 'No Data Found',
							message: 'No stock data found for the specified items. Please check:<br>1. Items exist in your system<br>2. Stock transactions exist<br>3. Check server logs for details',
							indicator: 'orange'
						});
					}
				} else {
					console.error('No message in response');
					loadStockDataFallback();
				}
			},
			error: function(err) {
				console.error('Error calling get_stock_data:', err);
				loadStockDataFallback();
			}
		});
	}
	
	// Load filter options
	function loadFilterOptions() {
		console.log('Loading filter options...');
		console.log('Filter section HTML:', $('.filter-section').html());
		
		// Load warehouses
		frappe.call({
			method: 'tif_customization.tif_customization.page.stock_detail.stock_detail.get_warehouses',
			args: {},
			callback: function(r) {
				console.log('Warehouses response:', r);
				if (r.message) {
					const warehouseSelect = $('#warehouse-filter');
					if (warehouseSelect.length) {
						warehouseSelect.empty().append('<option value="">All Warehouses</option>');
						r.message.forEach(warehouse => {
							warehouseSelect.append(`<option value="${warehouse.name}">${warehouse.warehouse_name}</option>`);
						});
						console.log('Warehouses loaded:', r.message.length);
					} else {
						console.log('Warehouse select not found');
					}
				}
			},
			error: function(err) {
				console.log('Error loading warehouses:', err);
			}
		});
		
		// Load item groups
		frappe.call({
			method: 'tif_customization.tif_customization.page.stock_detail.stock_detail.get_item_groups',
			args: {},
			callback: function(r) {
				console.log('Item groups response:', r);
				if (r.message) {
					const itemGroupSelect = $('#item-group-filter');
					if (itemGroupSelect.length) {
						itemGroupSelect.empty().append('<option value="">All Item Groups</option>');
						r.message.forEach(group => {
							itemGroupSelect.append(`<option value="${group.item_group}">${group.item_group}</option>`);
						});
						console.log('Item groups loaded:', r.message.length);
					} else {
						console.log('Item group select not found');
					}
				}
			},
			error: function(err) {
				console.log('Error loading item groups:', err);
			}
		});
		
		// Load items
		frappe.call({
			method: 'tif_customization.tif_customization.page.stock_detail.stock_detail.get_items',
			args: {},
			callback: function(r) {
				console.log('Items response:', r);
				console.log('Items response message:', r.message);
				console.log('Items count:', r.message ? r.message.length : 0);
				if (r.message && r.message.length > 0) {
					const itemSelect = $('#item-filter');
					console.log('Item select element found:', itemSelect.length > 0);
					if (itemSelect.length) {
						itemSelect.empty().append('<option value="">All Items</option>');
						r.message.forEach(function(item, index) {
							const optionValue = item.item_code || '';
							const optionText = `${item.item_code || ''} - ${item.item_name || ''}`;
							console.log(`Adding item ${index + 1}: value="${optionValue}", text="${optionText}"`);
							itemSelect.append(`<option value="${optionValue}">${optionText}</option>`);
						});
						console.log('Items loaded:', r.message.length);
						console.log('Total options in dropdown:', itemSelect.find('option').length);
						console.log('First few options:', itemSelect.find('option').slice(0, 5).map(function() { return $(this).val() + ':' + $(this).text(); }).get());
					} else {
						console.log('Item select not found');
					}
				} else {
					console.log('No items returned from backend');
				}
			},
			error: function(err) {
				console.log('Error loading items:', err);
				console.error('Error details:', err);
			}
		});
	}
	
	// Apply filters
	function applyFilters() {
		console.log('Apply filters clicked');
		const itemSelect = $('#item-filter');
		const itemFilterValue = itemSelect.val();
		const selectedOption = itemSelect.find('option:selected');
		console.log('Item filter element:', itemSelect);
		console.log('Item filter value:', itemFilterValue);
		console.log('Item filter value type:', typeof itemFilterValue);
		console.log('Item filter is empty string?', itemFilterValue === '');
		console.log('Item filter selected option text:', selectedOption.text());
		console.log('Item filter selected option value:', selectedOption.val());
		console.log('All options in dropdown:', itemSelect.find('option').map(function() { return $(this).val() + ':' + $(this).text(); }).get());
		
		const filters = {
			from_date: $('#from-date').val(),
			to_date: $('#to-date').val(),
			item: itemFilterValue && itemFilterValue !== '' ? itemFilterValue : null, // Convert empty string to null
			warehouse: $('#warehouse-filter').val(),
			item_group: $('#item-group-filter').val()
		};
		
		console.log('Filters object:', filters);
		console.log('Filters JSON:', JSON.stringify(filters));
		console.log('Item filter in filters object:', filters.item);
		
		// Update table headers with selected date range
		updateTableHeaders(filters.from_date, filters.to_date);
		
		// Show/hide warehouse sections based on filter
		updateWarehouseSections(filters.warehouse);
		
		frappe.call({
			method: 'tif_customization.tif_customization.page.stock_detail.stock_detail.get_stock_data',
			args: filters,
			callback: function(r) {
				console.log('Filter response:', r);
				console.log('MQH Books Data Count:', r.message?.mqh_books_data?.length || 0);
				console.log('MQH Books Data:', r.message?.mqh_books_data);
				console.log('Head Office Data Count:', r.message?.head_office_data?.length || 0);
				console.log('Head Office Data:', r.message?.head_office_data);
				
				if (r.message && !r.message.error) {
					// Render KPIs
					if (r.message.kpi_data) {
						renderKPIs(r.message.kpi_data);
					}
					
					// Populate tables with filtered data
					populateMQHBooksTable(r.message.mqh_books_data || []);
					populateMQHUrduBooksTable(r.message.mqh_urdu_books_data || []);
					
					// Show warehouse data based on filter
					if (filters.warehouse) {
						// Show only selected warehouse data
						populateWarehouseTable(r.message.warehouse_data || [], filters.warehouse);
					} else {
						// Show all warehouse data
						populateHeadOfficeTable(r.message.head_office_data || []);
						populateOldOfficeTable(r.message.old_office_data || []);
						populateNazimabadTable(r.message.nazimabad_warehouse_data || []);
					}
				} else {
					console.log('Error in filter response:', r.message);
					loadStockDataFallback();
				}
			},
			error: function(err) {
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
				if (index === 8) $th.text(`Demand Received till ${toDateFormatted}`);
				if (index === 9) $th.text(`Books Sale Details till ${toDateFormatted}`);
				if (index === 10) $th.text(`Total Amount of Books Sale till ${toDateFormatted}`);
			});
			
			// Update MQH Urdu Books table headers
			$('#mqh-urdu-books-table thead tr th').each(function(index) {
				const $th = $(this);
				if (index === 3) $th.text(`Opening Stock ${fromDateFormatted}`);
				if (index === 4) $th.text(`Received Vendor till ${toDateFormatted}`);
				if (index === 5) $th.text(`Book Return till ${toDateFormatted}`);
				if (index === 6) $th.text(`Delivered till ${toDateFormatted}`);
				if (index === 7) $th.text(`Available Stock till ${toDateFormatted}`);
				if (index === 8) $th.text(`Demand Received till ${toDateFormatted}`);
				if (index === 9) $th.text(`Books Sale Details till ${toDateFormatted}`);
				if (index === 10) $th.text(`Total Amount of Books Sale till ${toDateFormatted}`);
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
			// Show individual warehouse sections
			$('.head-office-section').show();
			$('.old-office-section').show();
			$('.nazimabad-section').show();
			// Hide single warehouse section
			$('.single-warehouse-section').hide();
		}
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
		$('#from-date').val('2025-09-01');
		$('#to-date').val('2025-09-30');
		$('#item-filter').val('');
		$('#warehouse-filter').val('');
		$('#item-group-filter').val('');
		
		// Reset table headers to default
		updateTableHeaders('2025-09-01', '2025-09-30');
		
		// Show all warehouse sections
		updateWarehouseSections('');
		
		loadStockData(); // Load with default filters
	}
	
	// Export to Excel
	function exportToExcel() {
		// Simple table export functionality
		const tables = ['mqh-books-table', 'mqh-urdu-books-table', 'head-office-table', 'old-office-table', 'nazimabad-table'];
		let csvContent = '';
		
		tables.forEach(tableId => {
			const table = document.getElementById(tableId);
			if (table) {
				csvContent += table.outerHTML + '\n\n';
			}
		});
		
		// Create and download file
		const blob = new Blob([csvContent], { type: 'text/csv' });
		const url = window.URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'stock_detail_report.csv';
		a.click();
		window.URL.revokeObjectURL(url);
	}
	
	// Event listeners - set up after container is added to DOM
	setTimeout(function() {
		console.log('Setting up event listeners...');
		console.log('Apply button found:', $('#apply-filters').length);
		console.log('Reset button found:', $('#reset-filters').length);
		console.log('Export button found:', $('#export-excel').length);
		console.log('Item filter found:', $('#item-filter').length);
		
		// Add change event listener for item filter to debug selection
		$('#item-filter').on('change', function() {
			const selectedValue = $(this).val();
			const selectedText = $(this).find('option:selected').text();
			console.log('=== Item filter changed ===');
			console.log('Selected value:', selectedValue);
			console.log('Selected text:', selectedText);
			console.log('All options:', $(this).find('option').map(function() { return $(this).val() + ':' + $(this).text(); }).get());
		});
		
		$('#apply-filters').click(function(e) {
			e.preventDefault();
			console.log('Apply button clicked');
			applyFilters();
		});
		$('#reset-filters').click(function(e) {
			e.preventDefault();
			console.log('Reset button clicked');
			resetFilters();
		});
		$('#export-excel').click(function(e) {
			e.preventDefault();
			console.log('Export button clicked');
			exportToExcel();
		});
		
		$('#test-button').click(function(e) {
			e.preventDefault();
			alert('Test button works!');
			console.log('Test button clicked');
		});
		
		// Load filter options
		loadFilterOptions();
	}, 500);
	
	function loadStockDataFallback() {
		// Show all warehouse sections by default
		updateWarehouseSections('');
		
		// Fallback hardcoded data
		const mqhBooksData = [
			{ s_no: 1, particulars: "No Data Found - Check Error Logs", opening_stock: 0, received_vendor: 0, book_return: 0, delivered: 0, available_stock: 0, demand_received: 0, books_sale: 0, total_amount: 0 }
		];
		
		populateMQHBooksTable(mqhBooksData);
		populateMQHUrduBooksTable([]);
		populateHeadOfficeTable([]);
		populateOldOfficeTable([]);
		populateNazimabadTable([]);
		
		// Show error message
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
		
		const tbody = $('#mqh-books-tbody');
		const tfoot = $('#mqh-books-tfoot');
		
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
						<td class="number-cell">${formatNumber(item.demand_received || 0)}</td>
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
			demand_received: data.reduce((sum, item) => sum + item.demand_received, 0),
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
				<td class="number-cell"><strong>${formatNumber(totals.demand_received)}</strong></td>
				<td class="number-cell"><strong>${formatNumber(totals.books_sale)}</strong></td>
				<td class="number-cell"><strong>${formatNumber(totals.total_amount)}</strong></td>
			</tr>
		`);
		tfoot.append(totalRow);
	}
	
	function populateMQHUrduBooksTable(data) {
		const tbody = $('#mqh-urdu-books-tbody');
		const tfoot = $('#mqh-urdu-books-tfoot');
		
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
					<td class="number-cell">${formatNumber(item.demand_received)}</td>
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
			demand_received: data.reduce((sum, item) => sum + item.demand_received, 0),
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
				<td class="number-cell"><strong>${formatNumber(totals.demand_received)}</strong></td>
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
		
		const kpiSection = $('#kpi-section');
		kpiSection.empty();
		
		// Summary KPIs at the top
		const summaryHtml = `
			<h4 style="margin-bottom: 15px;">Key Performance Indicators (KPIs)</h4>
			<div class="row" style="margin-bottom: 30px;">
				<div class="col-md-3">
					<div class="kpi-card" style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
						<h5 style="margin: 0 0 10px 0; font-size: 14px; opacity: 0.9;">Total Items</h5>
						<h2 style="margin: 0; font-size: 28px; font-weight: bold;">${kpiData.total_items || 0}</h2>
						<p style="margin: 5px 0 0 0; font-size: 12px; opacity: 0.8;">Items Tracked</p>
					</div>
				</div>
				<div class="col-md-3">
					<div class="kpi-card" style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); color: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
						<h5 style="margin: 0 0 10px 0; font-size: 14px; opacity: 0.9;">Total Opening Stock</h5>
						<h2 style="margin: 0; font-size: 28px; font-weight: bold;">${formatNumber(kpiData.total_opening_stock || 0)}</h2>
						<p style="margin: 5px 0 0 0; font-size: 12px; opacity: 0.8;">Units</p>
					</div>
				</div>
				<div class="col-md-3">
					<div class="kpi-card" style="background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%); color: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
						<h5 style="margin: 0 0 10px 0; font-size: 14px; opacity: 0.9;">Total Available Stock</h5>
						<h2 style="margin: 0; font-size: 28px; font-weight: bold;">${formatNumber(kpiData.total_available_stock || 0)}</h2>
						<p style="margin: 5px 0 0 0; font-size: 12px; opacity: 0.8;">Units</p>
					</div>
				</div>
				<div class="col-md-3">
					<div class="kpi-card" style="background: linear-gradient(135deg, #fa709a 0%, #fee140 100%); color: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
						<h5 style="margin: 0 0 10px 0; font-size: 14px; opacity: 0.9;">Total Delivered</h5>
						<h2 style="margin: 0; font-size: 28px; font-weight: bold;">${formatNumber(kpiData.total_delivered || 0)}</h2>
						<p style="margin: 5px 0 0 0; font-size: 12px; opacity: 0.8;">Units</p>
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
			
			itemsHtml = `
				<h5 style="margin-bottom: 20px; margin-top: 30px; font-weight: bold; color: #495057;">Individual Item Balance KPIs</h5>
				<div class="row" style="margin-bottom: 20px;">
					${kpiData.items.map((item, index) => {
						const balance = item.available_stock || 0;
						const colorGradient = colorGradients[index % colorGradients.length];
						const itemName = (item.item_name || item.item_code || 'Unknown').substring(0, 30);
						const itemCode = item.item_code || '-';
						
						return `
							<div class="col-md-3" style="margin-bottom: 15px;">
								<div class="kpi-card" style="background: ${colorGradient}; color: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); min-height: 140px;">
									<h6 style="margin: 0 0 8px 0; font-size: 12px; opacity: 0.95; font-weight: bold; line-height: 1.3;">${itemCode}</h6>
									<p style="margin: 0 0 12px 0; font-size: 11px; opacity: 0.9; line-height: 1.2; height: 28px; overflow: hidden;">${itemName}</p>
									<h2 style="margin: 0; font-size: 32px; font-weight: bold; text-align: center;">${formatNumber(balance)}</h2>
									<p style="margin: 8px 0 0 0; font-size: 11px; opacity: 0.85; text-align: center;">Available Stock</p>
								</div>
							</div>
						`;
					}).join('')}
				</div>
				
				<!-- Detailed Table for Individual Items -->
				<h5 style="margin-bottom: 15px; margin-top: 30px; font-weight: bold; color: #495057;">Detailed Item Information</h5>
				<div class="table-responsive">
					<table class="table table-bordered table-striped" style="background: white;">
						<thead>
							<tr style="background-color: #f8f9fa;">
								<th>Item Code</th>
								<th>Item Name</th>
								<th class="text-right">Opening Stock</th>
								<th class="text-right">Available Stock</th>
								<th class="text-right">Delivered</th>
								<th class="text-right">Received Vendor</th>
								<th class="text-right">Book Return</th>
								<th class="text-right">Demand Received</th>
								<th class="text-right">Books Sale</th>
								<th class="text-right">Total Amount</th>
							</tr>
						</thead>
						<tbody>
							${kpiData.items.map(item => `
								<tr>
									<td><strong>${item.item_code || '-'}</strong></td>
									<td>${item.item_name || '-'}</td>
									<td class="text-right">${formatNumber(item.opening_stock || 0)}</td>
									<td class="text-right"><strong style="color: #28a745;">${formatNumber(item.available_stock || 0)}</strong></td>
									<td class="text-right">${formatNumber(item.delivered || 0)}</td>
									<td class="text-right">${formatNumber(item.received_vendor || 0)}</td>
									<td class="text-right">${formatNumber(item.book_return || 0)}</td>
									<td class="text-right">${formatNumber(item.demand_received || 0)}</td>
									<td class="text-right">${formatNumber(item.books_sale || 0)}</td>
									<td class="text-right">${formatNumber(item.total_amount || 0)}</td>
								</tr>
							`).join('')}
						</tbody>
					</table>
				</div>
			`;
		}
		
		kpiSection.html(summaryHtml + itemsHtml);
	}
	
	function populateHeadOfficeTable(data) {
		console.log('populateHeadOfficeTable called with data:', data);
		console.log('populateHeadOfficeTable - Data length:', data.length);
		
		// Ensure the section is visible
		$('.head-office-section').show();
		
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
	
	function formatNumber(num) {
		if (num === 0) return '-';
		return num.toLocaleString();
	}
}