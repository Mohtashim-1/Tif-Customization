import frappe
from frappe import _
from frappe.utils import flt, cint

# Specific items to filter for (from user requirements) - All 23 items are item codes
SPECIFIC_ITEM_CODES = [
    'MQHWB-01/U/12', 'MQHWB-02/U/10', 'MQHWB-03/U/9', 'MQHWB-04/U/7', 'MQHWB-05/U/5',
    'MQHWB-06/U/2', 'MQHWB-07/U/7', 'MQHTG-01U6', 'MQHTG-02U6', 'MQHTG-03U5',
    'MQHTG-04U4', 'MQHTG-05U1', 'MQHWB-01S1', 'MQHWB-02S1', 'MQHWB-03S1',
    'MQHWB-01E1', 'MQHWB-02E1', 'MB-U1', 'Noorani Qaida', 'Noorani Qaida Workbook',
    'Noorani Qaida Teacher Guide', 'Tarjamat ul Quran-e-Majeed-6 Class-Punjab Edition',
    'Tarjamat ul Quran-e-Majeed-7 Class-Punjab Edition'
]

def get_context(context):
    context.title = "Stock Detail Report"
    context.no_cache = 1
    
    # Get dynamic data from database
    mqh_books_data = get_mqh_books_data()
    mqh_urdu_books_data = get_mqh_urdu_books_data()
    head_office_data = get_head_office_data()
    old_office_data = get_old_office_data()
    nazimabad_warehouse_data = get_nazimabad_warehouse_data()
    
    # Calculate totals for MQH Books
    mqh_totals = calculate_mqh_totals(mqh_books_data)
    mqh_urdu_totals = calculate_mqh_totals(mqh_urdu_books_data)
    
    # Calculate totals for Head Office
    head_office_totals = calculate_head_office_totals(head_office_data)
    
    # Calculate totals for Old Office
    old_office_totals = calculate_old_office_totals(old_office_data)
    
    # Calculate totals for Nazimabad Warehouse
    nazimabad_totals = calculate_nazimabad_totals(nazimabad_warehouse_data)
    
    # Pass data to template
    context.mqh_books_data = mqh_books_data
    context.mqh_totals = mqh_totals
    context.mqh_urdu_books_data = mqh_urdu_books_data
    context.mqh_urdu_totals = mqh_urdu_totals
    context.head_office_data = head_office_data
    context.head_office_totals = head_office_totals
    context.old_office_data = old_office_data
    context.old_office_totals = old_office_totals
    context.nazimabad_warehouse_data = nazimabad_warehouse_data
    context.nazimabad_totals = nazimabad_totals

def get_mqh_books_data(filters=None):
    """Get MQH Books data from Stock Ledger Entry"""
    try:
        if not filters:
            filters = {}
        
        print(f"[get_mqh_books_data] Filters received: {filters}")
        print(f"[get_mqh_books_data] filters.get('item'): {filters.get('item')}")
            
        # Build item code filter
        item_code_filter = ""
        sql_params = []
        item_filter_value = filters.get('item')
        print(f"[get_mqh_books_data] item_filter_value (before processing): {item_filter_value}, type: {type(item_filter_value)}")
        # Handle empty string as None
        if item_filter_value == '':
            item_filter_value = None
        
        print(f"[get_mqh_books_data] item_filter_value (after processing): {item_filter_value}")
        
        # Build item group filter
        item_group_filter = ""
        item_group_value = filters.get('item_group')
        # Handle empty string as None for item_group
        if item_group_value == '':
            item_group_value = None
        
        # ALWAYS filter for specific items only (all are item codes)
        specific_items_filter = ""
        
        # If a specific item is selected, verify it's in our list and filter by it only
        if item_filter_value:
            # Verify the selected item is in our specific items list
            if item_filter_value in SPECIFIC_ITEM_CODES:
                item_code_filter = "AND item_code = %s"
                sql_params.append(item_filter_value)
                # Don't add specific_items_filter when filtering by specific item
            else:
                # If selected item is not in our list, return empty
                print(f"[get_mqh_books_data] Selected item {item_filter_value} is not in specific items list")
                return []
        else:
            # Build filter for all specific item codes
            item_code_placeholders = ','.join(['%s'] * len(SPECIFIC_ITEM_CODES))
            specific_items_filter = f"AND item_code IN ({item_code_placeholders})"
            sql_params.extend(SPECIFIC_ITEM_CODES)
        
        # Build item group filter (only if NOT filtering by specific items)
        # When filtering by specific items, don't apply item_group filter - show all items from the list
        # Check if specific_items_filter is set (not empty string)
        if specific_items_filter == "":
            if item_group_value:
                item_group_filter = f"AND item_group = '{item_group_value}'"
            elif not item_filter_value:
                # When "All Items" is selected and no item_group filter, use default item groups
                item_group_filter = "AND item_group IN ('MQH Books (Urdu Version)', 'MQH Books (English Version)', 'MQH Books (Sindhi Version)', 'MQH Teacher Guides (Urdu Version)', 'Noorani Qaida Teacher Guide', 'Noorani Qaida Workbook', 'Books')"
        # If specific_items_filter is set, item_group_filter remains empty (already initialized)
        
        # Use the SAME query structure for ALL cases (whether item is selected or not)
        # The item_group_filter is already set above (line 79) when "All Items" is selected
        # This ensures consistency - same query structure whether item is selected or not
        # When item is selected: item_code_filter is set, item_group_filter is empty
        # When "All Items" is selected: item_code_filter is empty, item_group_filter is set (line 79)
        sql_query = "SELECT DISTINCT item_code, item_name, item_group FROM `tabItem` WHERE disabled = 0 " + item_code_filter + " " + item_group_filter + " " + specific_items_filter + " ORDER BY item_name"
        # Use empty tuple instead of None when no parameters
        query_params = tuple(sql_params) if sql_params else ()
        
        # Print SQL details for debugging
        print("[MQH Books] SQL Query:", sql_query)
        print(f"[MQH Books] SQL Params: {query_params}")
        print(f"[MQH Books] Item Filter: {item_filter_value}")
        print(f"[MQH Books] Specific Items Filter: {specific_items_filter}")
        print(f"[MQH Books] Item Group Filter: {item_group_filter}")
        
        # Get all items in MQH Books item groups
        items = frappe.db.sql(sql_query, query_params, as_dict=True)
        
        print(f"[MQH Books] Found {len(items)} items. Items: {[i.item_code for i in items]}")
        print(f"[MQH Books] Expected {len(SPECIFIC_ITEM_CODES)} items from SPECIFIC_ITEM_CODES")
        
        # Check which items from SPECIFIC_ITEM_CODES are missing
        found_codes = {i.item_code for i in items}
        missing_codes = set(SPECIFIC_ITEM_CODES) - found_codes
        if missing_codes:
            print(f"[MQH Books] Missing items: {missing_codes}")
        
        if not items and item_filter_value:
            print(f"[MQH Books] No items found for item filter: {item_filter_value}")
            return []
        
        mqh_data = []
        s_no = 1
        
        print(f"[MQH Books] Processing {len(items)} items...")
        for item in items:
            try:
                # Get stock data for this item
                stock_data = get_item_stock_data(item.item_code, filters)
                
                # Ensure stock_data is a dict
                if not isinstance(stock_data, dict):
                    print(f"[MQH Books] Warning: stock_data for {item.item_code} is not a dict: {type(stock_data)}")
                    stock_data = {}
                
                item_code = item.item_code or ""
                item_name = item.item_name or ""
                particulars = f"{item_code} - {item_name}" if item_code and item_name else (item_code or item_name)
                
                item_data = {
                    "s_no": s_no,
                    "item_code": item_code,
                    "item_name": item_name,
                    "particulars": particulars,
                    "opening_stock": flt(stock_data.get("opening_stock", 0)),
                    "received_vendor": flt(stock_data.get("received_vendor", 0)),
                    "book_return": flt(stock_data.get("book_return", 0)),
                    "delivered": flt(stock_data.get("delivered", 0)),
                    "available_stock": flt(stock_data.get("available_stock", 0)),
                    "demand_received": flt(stock_data.get("demand_received", 0)),
                    "books_sale": cint(stock_data.get("books_sale", 0)),
                    "total_amount": flt(stock_data.get("total_amount", 0))
                }
                mqh_data.append(item_data)
                
                # Debug first few items
                if s_no <= 3:
                    print(f"[MQH Books] Item {s_no}: {item.item_name} - Opening: {item_data['opening_stock']}, Available: {item_data['available_stock']}")
                
                s_no += 1
            except Exception as e:
                print(f"[MQH Books] Error processing item {item.item_code}: {str(e)}")
                import traceback
                traceback.print_exc()
                # Still add the item with zero values if there's an error
                item_code = item.item_code or ""
                item_name = item.item_name or ""
                particulars = f"{item_code} - {item_name}" if item_code and item_name else (item_code or item_name)
                
                item_data = {
                    "s_no": s_no,
                    "item_code": item_code,
                    "item_name": item_name,
                    "particulars": particulars,
                    "opening_stock": 0,
                    "received_vendor": 0,
                    "book_return": 0,
                    "delivered": 0,
                    "available_stock": 0,
                    "demand_received": 0,
                    "books_sale": 0,
                    "total_amount": 0
                }
                mqh_data.append(item_data)
                s_no += 1
        
        print(f"[MQH Books] Returning {len(mqh_data)} items")
        if len(mqh_data) == 0 and len(items) > 0:
            print(f"[MQH Books] WARNING: Found {len(items)} items but returning 0 items! This should not happen.")
        return mqh_data
        
    except Exception as e:
        print(f"Error getting MQH books data: {str(e)}")
        return []

def get_mqh_urdu_books_data(filters=None):
    """Get MQH Urdu Books data from Stock Ledger Entry"""
    try:
        if not filters:
            filters = {}
            
        # Build item code filter
        item_code_filter = ""
        sql_params = []
        item_filter_value = filters.get('item')
        # Handle empty string as None
        if item_filter_value == '':
            item_filter_value = None
        
        # Build item group filter
        item_group_filter = ""
        item_group_value = filters.get('item_group')
        # Handle empty string as None for item_group
        if item_group_value == '':
            item_group_value = None
        
        # ALWAYS filter for specific items only (all are item codes)
        specific_items_filter = ""
        
        # If a specific item is selected, verify it's in our list and filter by it only
        if item_filter_value:
            # Verify the selected item is in our specific items list
            if item_filter_value in SPECIFIC_ITEM_CODES:
                item_code_filter = "AND item_code = %s"
                sql_params.append(item_filter_value)
                # Don't add specific_items_filter when filtering by specific item
            else:
                # If selected item is not in our list, return empty
                print(f"[get_mqh_urdu_books_data] Selected item {item_filter_value} is not in specific items list")
                return []
        else:
            # Build filter for all specific item codes
            item_code_placeholders = ','.join(['%s'] * len(SPECIFIC_ITEM_CODES))
            specific_items_filter = f"AND item_code IN ({item_code_placeholders})"
            sql_params.extend(SPECIFIC_ITEM_CODES)
        
        # Build item group filter (only if NOT filtering by specific items)
        # When filtering by specific items, don't apply item_group filter - show all items from the list
        # Check if specific_items_filter is set (not empty string)
        if specific_items_filter == "":
            if item_group_value:
                if 'Urdu' in item_group_value:
                    item_group_filter = f"AND item_group = '{item_group_value}'"
                else:
                    return []  # If specific item group selected and it's not Urdu, return empty
            elif not item_filter_value:
                item_group_filter = "AND item_group IN ('MQH Books (Urdu Version)', 'MQH Teacher Guides (Urdu Version)')"
        # If specific_items_filter is set, item_group_filter remains empty (already initialized)
        
        # Use the SAME query structure for ALL cases (whether item is selected or not)
        # The item_group_filter is already set above (line 200) when "All Items" is selected
        # This ensures consistency - same query structure whether item is selected or not
        # When item is selected: item_code_filter is set, item_group_filter is empty
        # When "All Items" is selected: item_code_filter is empty, item_group_filter is set (line 200)
        sql_query = "SELECT DISTINCT item_code, item_name, item_group FROM `tabItem` WHERE disabled = 0 " + item_code_filter + " " + item_group_filter + " " + specific_items_filter + " ORDER BY item_name"
        # Use empty tuple instead of None when no parameters
        query_params = tuple(sql_params) if sql_params else ()
        
        # Print SQL details for debugging
        print("[Urdu Books] SQL Query:", sql_query)
        print(f"[Urdu Books] SQL Params: {query_params}")
        print(f"[Urdu Books] Item Filter: {item_filter_value}")
        print(f"[Urdu Books] Specific Items Filter: {specific_items_filter}")
        print(f"[Urdu Books] Item Group Filter: {item_group_filter}")
        
        # Get all items in Urdu-related item groups
        items = frappe.db.sql(sql_query, query_params, as_dict=True)
        
        print(f"[Urdu Books] Found {len(items)} items. Items: {[i.item_code for i in items]}")
        print(f"[Urdu Books] Expected {len(SPECIFIC_ITEM_CODES)} items from SPECIFIC_ITEM_CODES")
        
        # Check which items from SPECIFIC_ITEM_CODES are missing
        found_codes = {i.item_code for i in items}
        missing_codes = set(SPECIFIC_ITEM_CODES) - found_codes
        if missing_codes:
            print(f"[Urdu Books] Missing items: {missing_codes}")
        
        if not items and item_filter_value:
            print(f"[Urdu Books] No items found for item filter: {item_filter_value}")
            return []
        
        mqh_urdu_data = []
        s_no = 1
        
        for item in items:
            # Get stock data for this item
            stock_data = get_item_stock_data(item.item_code, filters)
            
            item_code = item.item_code or ""
            item_name = item.item_name or ""
            particulars = f"{item_code} - {item_name}" if item_code and item_name else (item_code or item_name)
            
            mqh_urdu_data.append({
                "s_no": s_no,
                "item_code": item_code,
                "item_name": item_name,
                "particulars": particulars,
                "opening_stock": stock_data.get("opening_stock", 0),
                "received_vendor": stock_data.get("received_vendor", 0),
                "book_return": stock_data.get("book_return", 0),
                "delivered": stock_data.get("delivered", 0),
                "available_stock": stock_data.get("available_stock", 0),
                "demand_received": stock_data.get("demand_received", 0),
                "books_sale": stock_data.get("books_sale", 0),
                "total_amount": stock_data.get("total_amount", 0)
            })
            s_no += 1
            
        return mqh_urdu_data
        
    except Exception as e:
        print(f"Error getting MQH Urdu books data: {str(e)}")
        return []

def get_item_stock_data(item_code, filters=None):
    """Get stock data for a specific item - sums across ALL warehouses"""
    try:
        if not filters:
            filters = {}
            
        # Use filter dates or default to current month
        from frappe.utils import get_datetime, getdate
        from datetime import datetime, timedelta
        if filters.get('from_date') and filters.get('to_date'):
            from_date_str = filters['from_date']
            to_date_str = filters['to_date']
            # Convert to date objects using getdate (like Stock Balance report)
            from_date = getdate(from_date_str)
            to_date = getdate(to_date_str)
        else:
            today = datetime.now()
            month_start = today.replace(day=1)
            last_month = month_start - timedelta(days=1)
            from_date = getdate(last_month.replace(day=1).strftime('%Y-%m-%d'))
            to_date = getdate(last_month.strftime('%Y-%m-%d'))
            from_date_str = from_date.strftime('%Y-%m-%d')
            to_date_str = to_date.strftime('%Y-%m-%d')
        
        # Match Stock Balance report logic exactly:
        # 1. Use posting_date (not posting_datetime) for date comparisons
        # 2. Opening balance = SUM of all entries where posting_date < from_date
        # 3. Get all entries ordered by posting_datetime, then accumulate based on posting_date
        # Note: from_date and to_date are now date objects (not strings)
        
        # Get ALL stock ledger entries for this item (across all warehouses)
        # Match Stock Balance report: get qty_after_transaction, batch_no, serial_no for Stock Reconciliation
        all_entries = frappe.db.sql("""
            SELECT 
                posting_date,
                posting_datetime,
                actual_qty,
                qty_after_transaction,
                voucher_type,
                voucher_no,
                warehouse,
                is_cancelled,
                batch_no,
                serial_no
            FROM `tabStock Ledger Entry`
            WHERE item_code = %s
            AND is_cancelled = 0
            ORDER BY posting_datetime, creation
        """, (item_code,), as_dict=True)
        
        # Get opening vouchers (like Stock Balance report line 570-599)
        # Note: Stock Balance uses posting_date <= self.to_date (not from_date)
        opening_vouchers = {'Stock Entry': [], 'Stock Reconciliation': []}
        opening_se = frappe.db.sql("""
            SELECT name FROM `tabStock Entry`
            WHERE docstatus = 1 AND is_opening = 'Yes' AND posting_date <= %s
        """, (to_date_str,), as_dict=True)
        opening_vouchers['Stock Entry'] = [se.name for se in opening_se]
        
        opening_sr = frappe.db.sql("""
            SELECT name FROM `tabStock Reconciliation`
            WHERE docstatus = 1 AND purpose = 'Opening Stock' AND posting_date <= %s
        """, (to_date_str,), as_dict=True)
        opening_vouchers['Stock Reconciliation'] = [sr.name for sr in opening_sr]
        
        # Track running balance per warehouse (like Stock Balance report)
        warehouse_balances = {}
        
        # Calculate opening balance: SUM entries where posting_date < from_date
        opening_stock_qty = 0
        received_vendor_qty = 0
        book_return_qty = 0
        delivered_qty = 0
        available_stock_qty = 0
        
        # Debug for specific items
        debug_items = ['MQHWB-02/U/10', 'MQHWB-01/U/12', 'MQHWB-03/U/9', 'MQHTG-01U6']
        if item_code and item_code in debug_items:
            print(f"[DEBUG get_item_stock_data] Item: {item_code}")
            print(f"[DEBUG get_item_stock_data] From Date: {from_date} ({from_date_str}), To Date: {to_date} ({to_date_str})")
            print(f"[DEBUG get_item_stock_data] Total entries found: {len(all_entries)}")
            print(f"[DEBUG get_item_stock_data] Opening vouchers - SE: {len(opening_vouchers['Stock Entry'])}, SR: {len(opening_vouchers['Stock Reconciliation'])}")
            if all_entries:
                print(f"[DEBUG get_item_stock_data] First 10 entries: {[(str(e.posting_date), e.voucher_type, e.actual_qty, e.warehouse) for e in all_entries[:10]]}")
        
        for entry in all_entries:
            # Convert entry posting_date to date object for proper comparison
            entry_posting_date = getdate(entry.posting_date)
            
            warehouse = entry.warehouse
            
            # Initialize warehouse balance if not exists
            if warehouse not in warehouse_balances:
                warehouse_balances[warehouse] = 0
            
            # Calculate qty_diff like Stock Balance report (line 201-204)
            # Stock Balance condition: (not entry.batch_no or entry.serial_no)
            # This means: if batch_no is missing OR serial_no exists
            if entry.voucher_type == "Stock Reconciliation" and (not entry.batch_no or entry.serial_no):
                # For Stock Reconciliation: use qty_after_transaction - current balance
                # Note: Stock Balance uses qty_dict.bal_qty (current balance before this entry)
                qty_diff = flt(entry.qty_after_transaction) - warehouse_balances[warehouse]
            else:
                qty_diff = flt(entry.actual_qty)
            
            # Update warehouse balance FIRST (like Stock Balance does)
            warehouse_balances[warehouse] += qty_diff
            
            # Opening balance: entries before from_date OR opening vouchers (line 208-212)
            # Use date comparison - match Stock Balance exactly
            is_opening_entry = (
                entry_posting_date < from_date or 
                entry.voucher_no in opening_vouchers.get(entry.voucher_type, [])
            )
            
            if is_opening_entry:
                opening_stock_qty += qty_diff
                available_stock_qty += qty_diff
            
            # Period transactions: entries between from_date and to_date (not opening vouchers)
            elif entry_posting_date >= from_date and entry_posting_date <= to_date:
                available_stock_qty += qty_diff
                
                # Received from vendor
                if entry.voucher_type == 'Purchase Receipt' and qty_diff > 0:
                    received_vendor_qty += qty_diff
                
                # Book returns - check Delivery Note returns first
                elif entry.voucher_type == 'Delivery Note':
                    # Check if this Delivery Note is a return entry
                    dn_check = frappe.db.sql("""
                        SELECT is_return
                        FROM `tabDelivery Note`
                        WHERE name = %s AND docstatus = 1
                    """, (entry.voucher_no,), as_dict=True)
                    
                    if dn_check and dn_check[0].is_return == 1:
                        # Return Delivery Note: stock comes back in (qty_diff > 0)
                        # This should be counted as Book Return AND reduce Delivered
                        if qty_diff > 0:
                            book_return_qty += qty_diff
                            # Subtract the return from delivered (reduce delivered amount)
                            delivered_qty_before = delivered_qty
                            delivered_qty -= qty_diff
                            # Ensure delivered_qty doesn't go negative
                            if delivered_qty < 0:
                                delivered_qty = 0
                            # Debug logging for returns
                            if item_code and ('Textbook' in item_code or 'MQHWB' in item_code):
                                print(f"[DEBUG Return DN] {entry.voucher_no}: qty_diff={qty_diff}, book_return={book_return_qty}, delivered_before={delivered_qty_before}, delivered_after={delivered_qty}")
                    else:
                        # Regular Delivery Note: stock goes out (qty_diff < 0)
                        if qty_diff < 0:
                            delivered_qty += abs(qty_diff)
                
                # Book returns (Stock Entry with Material Receipt purpose, not linked to Delivery Note)
                elif entry.voucher_type == 'Stock Entry' and qty_diff > 0:
                    # Check if it's a Material Receipt Stock Entry
                    se_check = frappe.db.sql("""
                        SELECT purpose, delivery_note_no
                        FROM `tabStock Entry`
                        WHERE name = %s AND docstatus = 1
                    """, (entry.voucher_no,), as_dict=True)
                    if se_check and se_check[0].purpose == 'Material Receipt':
                        if not se_check[0].delivery_note_no:
                            book_return_qty += qty_diff
            
            # Entries after to_date don't count for period calculations
        
        # Calculate Available Stock using formula: Opening + Received + Book Return - Delivered
        calculated_available_stock = opening_stock_qty + received_vendor_qty + book_return_qty - delivered_qty
        
        # Debug output for specific items
        debug_items = ['MQHWB-02/U', 'MQHWB-01/U', 'MQHWB-03/U', 'MQHTG-01U']
        if item_code and item_code in debug_items:
            print(f"[DEBUG get_item_stock_data] Item: {item_code}")
            print(f"[DEBUG get_item_stock_data] Opening Balance (all warehouses): {opening_stock_qty}")
            print(f"[DEBUG get_item_stock_data] Received Vendor: {received_vendor_qty}")
            print(f"[DEBUG get_item_stock_data] Book Return: {book_return_qty}")
            print(f"[DEBUG get_item_stock_data] Delivered: {delivered_qty}")
            print(f"[DEBUG get_item_stock_data] Available Stock (calculated): {calculated_available_stock}")
            print(f"[DEBUG get_item_stock_data] Available Stock (accumulated): {available_stock_qty}")
            print(f"[DEBUG get_item_stock_data] Warehouse balances: {warehouse_balances}")
            
            # Count entries by date range (using date objects)
            opening_entries = [e for e in all_entries if getdate(e.posting_date) < from_date]
            period_entries = [e for e in all_entries if from_date <= getdate(e.posting_date) <= to_date]
            print(f"[DEBUG get_item_stock_data] Opening entries (< {from_date}): {len(opening_entries)}")
            print(f"[DEBUG get_item_stock_data] Period entries ({from_date} to {to_date}): {len(period_entries)}")
            if opening_entries:
                print(f"[DEBUG get_item_stock_data] Sample opening entries: {[(str(e.posting_date), e.voucher_type, e.actual_qty, e.warehouse) for e in opening_entries[:5]]}")
                # Calculate opening from these entries
                opening_sum = sum(flt(e.actual_qty) for e in opening_entries)
                print(f"[DEBUG get_item_stock_data] Sum of opening entries actual_qty: {opening_sum}")
        
        # Get demand received (Material Requests) - date range
        demand_received = frappe.db.sql("""
            SELECT SUM(mr_item.qty) as qty
            FROM `tabMaterial Request Item` mr_item
            JOIN `tabMaterial Request` mr ON mr.name = mr_item.parent
            WHERE mr_item.item_code = %s
            AND mr.transaction_date BETWEEN %s AND %s
            AND mr.docstatus = 1
        """, (item_code, from_date.strftime('%Y-%m-%d'), to_date.strftime('%Y-%m-%d')), as_dict=True)
        
        # Get books sale details - date range
        # Sum quantity sold (not count of invoices)
        books_sale = frappe.db.sql("""
            SELECT SUM(si_item.qty) as qty, SUM(si_item.amount) as amount
            FROM `tabSales Invoice Item` si_item
            JOIN `tabSales Invoice` si ON si.name = si_item.parent
            WHERE si_item.item_code = %s
            AND si.posting_date BETWEEN %s AND %s
            AND si.docstatus = 1
        """, (item_code, from_date.strftime('%Y-%m-%d'), to_date.strftime('%Y-%m-%d')), as_dict=True)
        
        # Get actual stock balance across all warehouses
        # Use a reliable approach: get max posting_datetime per warehouse, then get entry with max creation
        actual_balance = 0
        warehouse_final_balances = {}
        
        # First, get the max posting_datetime for each warehouse
        max_entries = frappe.db.sql("""
            SELECT 
                warehouse,
                MAX(posting_datetime) as max_datetime
            FROM `tabStock Ledger Entry`
            WHERE item_code = %s
            AND posting_date <= %s
            AND is_cancelled = 0
            GROUP BY warehouse
        """, (item_code, to_date_str), as_dict=True)
        
        # Debug: Check if we found any warehouses
        if item_code == 'MQHWB-01/U/12':
            print(f"[DEBUG get_item_stock_data] Found {len(max_entries)} warehouses with max_datetime query")
        
        # For each warehouse, get the entry with max_datetime and max creation for that datetime
        for max_entry in max_entries:
            warehouse = max_entry.warehouse
            max_datetime = max_entry.max_datetime
            
            # Get the entry with max_datetime and max creation for that datetime
            last_entry = frappe.db.sql("""
                SELECT qty_after_transaction, posting_datetime, creation
                FROM `tabStock Ledger Entry`
                WHERE item_code = %s
                AND warehouse = %s
                AND posting_datetime = %s
                AND posting_date <= %s
                AND is_cancelled = 0
                ORDER BY creation DESC
                LIMIT 1
            """, (item_code, warehouse, max_datetime, to_date_str), as_dict=True)
            
            if last_entry and len(last_entry) > 0:
                balance = flt(last_entry[0].qty_after_transaction)
                warehouse_final_balances[warehouse] = balance
                actual_balance += balance
            else:
                warehouse_final_balances[warehouse] = 0
        
        # Use actual balance from Stock Ledger Entry (matches Stock Balance report)
        final_available_stock = actual_balance
        
        # Debug: Always log for MQHWB-01/U/12
        if item_code == 'MQHWB-01/U/12':
            print(f"[DEBUG get_item_stock_data] After balance calculation:")
            print(f"  - actual_balance: {actual_balance}")
            print(f"  - final_available_stock: {final_available_stock}")
            print(f"  - warehouse_final_balances: {warehouse_final_balances}")
        
        # Debug output for specific items - ALWAYS log for MQHWB-01/U/12
        debug_items = ['MQHWB-01/U/12', 'Noorani Qaida Teacher Guide']
        if item_code and item_code in debug_items:
            print(f"\n{'='*80}")
            print(f"[DEBUG get_item_stock_data] Item: {item_code}")
            print(f"[DEBUG get_item_stock_data] From Date: {from_date_str}, To Date: {to_date_str}")
            print(f"[DEBUG get_item_stock_data] Number of warehouses found: {len(warehouse_final_balances)}")
            print(f"[DEBUG get_item_stock_data] Warehouse final balances (from SLE qty_after_transaction): {warehouse_final_balances}")
            print(f"[DEBUG get_item_stock_data] Actual Balance (sum of all warehouses): {actual_balance}")
            print(f"[DEBUG get_item_stock_data] Opening: {opening_stock_qty}, Received: {received_vendor_qty}, Return: {book_return_qty}, Delivered: {delivered_qty}")
            print(f"[DEBUG get_item_stock_data] Calculated Available Stock (formula): {opening_stock_qty + received_vendor_qty + book_return_qty - delivered_qty}")
            print(f"[DEBUG get_item_stock_data] final_available_stock value: {final_available_stock}")
            print(f"{'='*80}\n")
            
            # Log to error log so it's visible
            frappe.log_error(
                f"Balance Debug for {item_code}:\n"
                f"From Date: {from_date_str}, To Date: {to_date_str}\n"
                f"Number of Warehouses: {len(warehouse_final_balances)}\n"
                f"Warehouse Balances: {warehouse_final_balances}\n"
                f"Total Balance (Sum): {actual_balance}\n"
                f"Opening Stock: {opening_stock_qty}\n"
                f"Received Vendor: {received_vendor_qty}\n"
                f"Book Return: {book_return_qty}\n"
                f"Delivered: {delivered_qty}\n"
                f"Calculated (Formula): {opening_stock_qty + received_vendor_qty + book_return_qty - delivered_qty}\n"
                f"Final Available Stock: {final_available_stock}",
                f"Balance Debug - {item_code}"
            )
            
            # Verify by direct SQL query - sum of last qty_after_transaction per warehouse
            verify_query = frappe.db.sql("""
                SELECT 
                    warehouse,
                    SUM(CASE WHEN rn = 1 THEN qty_after_transaction ELSE 0 END) as warehouse_balance
                FROM (
                    SELECT 
                        warehouse,
                        qty_after_transaction,
                        ROW_NUMBER() OVER (PARTITION BY warehouse ORDER BY posting_datetime DESC, creation DESC) as rn
                    FROM `tabStock Ledger Entry`
                    WHERE item_code = %s
                    AND posting_date <= %s
                    AND is_cancelled = 0
                ) ranked
                GROUP BY warehouse
            """, (item_code, to_date_str), as_dict=True)
            
            if verify_query:
                verify_total = sum(flt(row.warehouse_balance) for row in verify_query)
                print(f"[DEBUG get_item_stock_data] Verification - Warehouse balances from ROW_NUMBER query: {[(r.warehouse, r.warehouse_balance) for r in verify_query]}")
                print(f"[DEBUG get_item_stock_data] Verification - Total from ROW_NUMBER query: {verify_total}")
            
            # Also try a simpler verification - just sum all last entries
            simple_verify = frappe.db.sql("""
                SELECT SUM(qty) as total
                FROM (
                    SELECT 
                        warehouse,
                        qty_after_transaction as qty,
                        ROW_NUMBER() OVER (PARTITION BY warehouse ORDER BY posting_datetime DESC, creation DESC) as rn
                    FROM `tabStock Ledger Entry`
                    WHERE item_code = %s
                    AND posting_date <= %s
                    AND is_cancelled = 0
                ) ranked
                WHERE rn = 1
            """, (item_code, to_date_str), as_dict=True)
            if simple_verify:
                print(f"[DEBUG get_item_stock_data] Simple verification total: {simple_verify[0].get('total', 0)}")
        
        # Ensure final_available_stock is not None
        if final_available_stock is None:
            final_available_stock = 0
        
        # Create result dict - use actual balance from Stock Ledger Entry
        result = {
            "opening_stock": flt(opening_stock_qty),
            "received_vendor": flt(received_vendor_qty),
            "book_return": flt(book_return_qty),
            "delivered": flt(delivered_qty),
            "available_stock": flt(final_available_stock) if final_available_stock is not None else 0,  # Use actual balance from SLE
            "demand_received": flt(demand_received[0].get('qty', 0)) if demand_received and len(demand_received) > 0 else 0,
            "books_sale": flt(books_sale[0].get('qty', 0)) if books_sale and len(books_sale) > 0 else 0,
            "total_amount": flt(books_sale[0].get('amount', 0)) if books_sale and len(books_sale) > 0 else 0
        }
        
        # Debug: Always log for MQHWB-01/U/12 to see what's being returned
        if item_code == 'MQHWB-01/U/12':
            print(f"[DEBUG get_item_stock_data RETURN] Item: {item_code}")
            print(f"[DEBUG get_item_stock_data RETURN] result['available_stock']: {result['available_stock']}")
            print(f"[DEBUG get_item_stock_data RETURN] final_available_stock: {final_available_stock}")
            print(f"[DEBUG get_item_stock_data RETURN] actual_balance: {actual_balance}")
            print(f"[DEBUG get_item_stock_data RETURN] Full result: {result}")
        
        return result
        
    except Exception as e:
        print(f"Error getting stock data for item {item_code}: {str(e)}")
        return {}

def get_head_office_data(filters=None):
    """Get TIF Head Office stock data"""
    try:
        if not filters:
            filters = {}
            
        # Get all warehouses to see what's available
        warehouses = frappe.db.sql("""
            SELECT name, warehouse_name
            FROM `tabWarehouse`
            ORDER BY warehouse_name
        """, as_dict=True)
        
        # Try to find head office warehouse with different possible names
        head_office_warehouse = None
        possible_names = ["TIF Head Office", "Head Office", "TIF Head", "Main Warehouse", "Stores - TIF"]
        
        for name in possible_names:
            head_office_warehouse = frappe.db.get_value("Warehouse", {"warehouse_name": name}, "name")
            if head_office_warehouse:
                break
        
        if not head_office_warehouse:
            # Use the first warehouse if no specific one found
            if warehouses:
                head_office_warehouse = warehouses[0].name
                pass
            else:
                return []
            
        return get_warehouse_stock_data(head_office_warehouse, "Head Office", filters)
        
    except Exception as e:
        print(f"Error getting head office data: {str(e)}")
        return []

def get_old_office_data(filters=None):
    """Get TIF Old Office stock data"""
    try:
        if not filters:
            filters = {}
            
        # Try to find old office warehouse - actual warehouse name is "Old TIF Office - TIF"
        old_office_warehouse = None
        
        # First, try exact matches in priority order - prioritize "Old TIF Office - TIF" first
        priority_names = ["Old TIF Office - TIF", "Old TIF Office", "TIF Old Office", "Old Office", "TIF Old"]
        for name in priority_names:
            old_office_warehouse = frappe.db.get_value("Warehouse", {"warehouse_name": name}, "name")
            if old_office_warehouse:
                print(f"[get_old_office_data] Found exact match: {name} -> {old_office_warehouse}")
                break
        
        # If not found, try case-insensitive exact match for "Old TIF Office - TIF"
        if not old_office_warehouse:
            warehouses = frappe.db.sql("""
                SELECT name, warehouse_name
                FROM `tabWarehouse`
                WHERE LOWER(warehouse_name) = LOWER('Old TIF Office - TIF')
                LIMIT 1
            """, as_dict=True)
            
            if warehouses:
                old_office_warehouse = warehouses[0].name
                print(f"[get_old_office_data] Found case-insensitive exact match: {warehouses[0].warehouse_name} ({old_office_warehouse})")
        
        # If still not found, try case-insensitive LIKE search
        if not old_office_warehouse:
            warehouses = frappe.db.sql("""
                SELECT name, warehouse_name
                FROM `tabWarehouse`
                WHERE (
                    LOWER(warehouse_name) LIKE LOWER(%s)
                    OR LOWER(warehouse_name) LIKE LOWER(%s)
                    OR LOWER(warehouse_name) LIKE LOWER(%s)
                )
                ORDER BY 
                    CASE 
                        WHEN LOWER(warehouse_name) LIKE LOWER('%%old tif office - tif%%') THEN 1
                        WHEN LOWER(warehouse_name) LIKE LOWER('%%old tif office%%') THEN 2
                        WHEN LOWER(warehouse_name) LIKE LOWER('%%tif old office%%') THEN 3
                        WHEN LOWER(warehouse_name) LIKE LOWER('%%old office%%') THEN 4
                        ELSE 5
                    END,
                    warehouse_name
                LIMIT 1
            """, ("%old tif office - tif%", "%old tif office%", "%old office%"), as_dict=True)
            
            if warehouses:
                old_office_warehouse = warehouses[0].name
                print(f"[get_old_office_data] Found via LIKE search: {warehouses[0].warehouse_name} ({old_office_warehouse})")
        
        # If still not found, use fallback logic
        if not old_office_warehouse:
            # Use second warehouse if available
            warehouses = frappe.db.sql("""
                SELECT name FROM `tabWarehouse` ORDER BY name LIMIT 2
            """, as_dict=True)
            if len(warehouses) > 1:
                old_office_warehouse = warehouses[1].name
            else:
                return []
        
        # Get the actual warehouse name for verification and display
        actual_warehouse_name = frappe.db.get_value("Warehouse", old_office_warehouse, "warehouse_name")
        
        # Use the actual warehouse name found, or fallback to "TIF Old Office"
        display_name = actual_warehouse_name if actual_warehouse_name else "TIF Old Office"
        
        # Debug logging
        print(f"[get_old_office_data] Found warehouse code: {old_office_warehouse}, Actual warehouse name: {actual_warehouse_name}, Display name: {display_name}")
        
        if not old_office_warehouse:
            print(f"[get_old_office_data] ERROR: Could not find Old Office warehouse!")
            return []
            
        return get_warehouse_stock_data(old_office_warehouse, display_name, filters)
        
    except Exception as e:
        print(f"Error getting old office data: {str(e)}")
        return []

def get_nazimabad_warehouse_data(filters=None):
    """Get Nazimabad Warehouse stock data"""
    try:
        if not filters:
            filters = {}
            
        # Try to find nazimabad warehouse
        possible_names = ["Nazimabad Warehouse", "Nazimabad", "Warehouse - Nazimabad"]
        nazimabad_warehouse = None
        
        for name in possible_names:
            nazimabad_warehouse = frappe.db.get_value("Warehouse", {"warehouse_name": name}, "name")
            if nazimabad_warehouse:
                break
        
        if not nazimabad_warehouse:
            # Use third warehouse if available
            warehouses = frappe.db.sql("""
                SELECT name FROM `tabWarehouse` ORDER BY name LIMIT 3
            """, as_dict=True)
            if len(warehouses) > 2:
                nazimabad_warehouse = warehouses[2].name
            else:
                return []
            
        return get_warehouse_stock_data(nazimabad_warehouse, "Nazimabad Warehouse", filters)
        
    except Exception as e:
        print(f"Error getting nazimabad warehouse data: {str(e)}")
        return []

def get_specific_warehouse_data(filters):
    """Get data for a specific warehouse when selected in filters"""
    try:
        warehouse = filters.get('warehouse')
        if not warehouse:
            return []
            
        # Get warehouse name for display
        warehouse_name = frappe.db.get_value("Warehouse", warehouse, "warehouse_name")
        if not warehouse_name:
            warehouse_name = warehouse
        
        result = get_warehouse_stock_data(warehouse, warehouse_name, filters)
        return result
        
    except Exception as e:
        print(f"Error getting specific warehouse data: {str(e)}")
        return []

def get_warehouse_stock_data(warehouse, warehouse_name, filters=None):
    """Get stock data for a specific warehouse"""
    try:
        if not filters:
            filters = {}
            
        # Build date filter
        date_filter = ""
        if filters.get('from_date') and filters.get('to_date'):
            date_filter = f"AND sle.posting_date <= '{filters['to_date']}'"
        else:
            date_filter = "AND sle.posting_date <= '2025-09-30'"
            
        # Build item code filter first
        item_code_filter = ""
        item_code_param = None
        item_filter_value = filters.get('item')
        # Handle empty string as None
        if item_filter_value == '':
            item_filter_value = None
        
        # ALWAYS filter for specific items only (all are item codes)
        specific_items_filter = ""
        
        if item_filter_value:
            # Verify the selected item is in our specific items list
            if item_filter_value in SPECIFIC_ITEM_CODES:
                item_code_filter = "AND sle.item_code = %s"
                item_code_param = item_filter_value
            else:
                # If selected item is not in our list, return empty
                print(f"[get_warehouse_stock_data] Selected item {item_filter_value} is not in specific items list")
                return []
        else:
            # Build filter for all specific item codes
            item_code_placeholders = ','.join(['%s'] * len(SPECIFIC_ITEM_CODES))
            specific_items_filter = f"AND sle.item_code IN ({item_code_placeholders})"
        
        # Build item group filter (skip if item filter is set)
        item_group_filter = ""
        if item_filter_value:
            # When item is selected, skip item_group filter
            item_group_filter = ""
        elif filters.get('item_group'):
            item_group_filter = f"AND i.item_group = '{filters['item_group']}'"
            
        # Get all items that have stock in this warehouse
        # Exclude cancelled entries
        sql_params = [warehouse]
        if item_code_param:
            sql_params.append(item_code_param)
        elif specific_items_filter:
            sql_params.extend(SPECIFIC_ITEM_CODES)
        
        # Build query using string concatenation
        # Note: %s for warehouse parameter must remain for parameterized query
        sql_query_warehouse = "SELECT DISTINCT sle.item_code, i.item_name, i.item_group FROM `tabStock Ledger Entry` sle JOIN `tabItem` i ON i.item_code = sle.item_code WHERE sle.warehouse = %s AND sle.is_cancelled = 0 " + date_filter + " " + item_group_filter + " " + (item_code_filter if item_code_filter else '') + " " + (specific_items_filter if specific_items_filter else '') + " ORDER BY i.item_name"
        
        print(f"[Warehouse {warehouse}] SQL Query:", sql_query_warehouse)
        print(f"[Warehouse {warehouse}] SQL Params: {sql_params}")
        print(f"[Warehouse {warehouse}] Item Filter: {item_filter_value}")
        
        items = frappe.db.sql(sql_query_warehouse, tuple(sql_params), as_dict=True)
        
        print(f"[Warehouse {warehouse}] Found {len(items)} items. Items: {[i.item_code for i in items[:10]]}")
        
        warehouse_data = []
        s_no = 1
        
        for item in items:
            stock_data = get_warehouse_item_data(item.item_code, warehouse, filters)
            
            item_code = item.item_code or ""
            item_name = item.item_name or ""
            particulars = f"{item_code} - {item_name}" if item_code and item_name else (item_code or item_name)
            
            warehouse_data.append({
                "s_no": s_no,
                "item_code": item_code,
                "item_name": item_name,
                "particulars": particulars,
                "opening_balance": stock_data.get("opening_balance", 0),
                "received_vendor": stock_data.get("received_vendor", 0),
                "courier_returned": stock_data.get("courier_returned", 0),
                "transferred_in": stock_data.get("transferred_in", 0),
                "transferred_out": stock_data.get("transferred_out", 0),
                "delivered": stock_data.get("delivered", 0),
                "ending_balance": stock_data.get("ending_balance", 0)
            })
            s_no += 1
            
        return warehouse_data
        
    except Exception as e:
        print(f"Error getting warehouse data for {warehouse_name}: {str(e)}")
        return []

def get_warehouse_item_data(item_code, warehouse, filters=None):
    """Get item data for a specific warehouse - using Stock Balance report logic"""
    try:
        if not filters:
            filters = {}
            
        # Use filter dates or default dates
        if filters.get('from_date') and filters.get('to_date'):
            from_date_str = filters['from_date']
            to_date_str = filters['to_date']
        else:
            from_date_str = '2025-09-01'
            to_date_str = '2025-09-30'
        
        # Match Stock Balance report logic exactly:
        # 1. Get ALL entries ordered by posting_datetime
        # 2. Use posting_date (not posting_datetime) for date comparisons
        # 3. Handle Stock Reconciliation properly
        
        all_entries = frappe.db.sql("""
            SELECT 
                posting_date,
                posting_datetime,
                actual_qty,
                qty_after_transaction,
                voucher_type,
                voucher_no,
                is_cancelled,
                batch_no,
                serial_no
            FROM `tabStock Ledger Entry`
            WHERE item_code = %s AND warehouse = %s
            AND is_cancelled = 0
            ORDER BY posting_datetime, creation
        """, (item_code, warehouse), as_dict=True)
        
        # Get opening vouchers
        opening_vouchers = {'Stock Entry': [], 'Stock Reconciliation': []}
        opening_se = frappe.db.sql("""
            SELECT name FROM `tabStock Entry`
            WHERE docstatus = 1 AND is_opening = 'Yes' AND posting_date <= %s
        """, (to_date_str,), as_dict=True)
        opening_vouchers['Stock Entry'] = [se.name for se in opening_se]
        
        opening_sr = frappe.db.sql("""
            SELECT name FROM `tabStock Reconciliation`
            WHERE docstatus = 1 AND purpose = 'Opening Stock' AND posting_date <= %s
        """, (to_date_str,), as_dict=True)
        opening_vouchers['Stock Reconciliation'] = [sr.name for sr in opening_sr]
        
        # Track running balance (like Stock Balance report)
        running_balance = 0
        
        # Initialize counters
        opening_bal = 0
        received_vend = 0
        courier_ret = 0
        trans_in = 0
        trans_out = 0
        deliv = 0
        ending_bal = 0
        
        # Debug for Textbook-3
        if item_code and ('Textbook-3' in item_code or 'MQHWB-03' in item_code):
            print(f"[DEBUG get_warehouse_item_data] Item: {item_code}, Warehouse: {warehouse}")
            print(f"[DEBUG get_warehouse_item_data] From Date: {from_date_str}, To Date: {to_date_str}")
            print(f"[DEBUG get_warehouse_item_data] Total entries: {len(all_entries)}")
            print(f"[DEBUG get_warehouse_item_data] Opening vouchers - SE: {len(opening_vouchers['Stock Entry'])}, SR: {len(opening_vouchers['Stock Reconciliation'])}")
        
        for entry in all_entries:
            entry_date = str(entry.posting_date)
            
            # Calculate qty_diff like Stock Balance report
            if entry.voucher_type == "Stock Reconciliation" and (not entry.batch_no or not entry.serial_no):
                qty_diff = flt(entry.qty_after_transaction) - running_balance
            else:
                qty_diff = flt(entry.actual_qty)
            
            # Update running balance
            running_balance += qty_diff
            
            # Opening balance: entries before from_date OR opening vouchers
            is_opening_entry = (
                entry_date < from_date_str or 
                entry.voucher_no in opening_vouchers.get(entry.voucher_type, [])
            )
            
            if is_opening_entry:
                opening_bal += qty_diff
                ending_bal += qty_diff
            
            # Period transactions: entries between from_date and to_date (not opening vouchers)
            elif entry_date >= from_date_str and entry_date <= to_date_str:
                ending_bal += qty_diff
                
                # Received from vendor
                if entry.voucher_type == 'Purchase Receipt' and qty_diff > 0:
                    received_vend += qty_diff
                
                # Stock Entry - check purpose first
                elif entry.voucher_type == 'Stock Entry':
                    se_check = frappe.db.sql("""
                        SELECT purpose, delivery_note_no
                        FROM `tabStock Entry`
                        WHERE name = %s AND docstatus = 1
                    """, (entry.voucher_no,), as_dict=True)
                    if se_check:
                        purpose = se_check[0].purpose
                        delivery_note_no = se_check[0].delivery_note_no
                        
                        # Courier returned (Material Receipt, not linked to Delivery Note)
                        if purpose == 'Material Receipt' and qty_diff > 0:
                            if not delivery_note_no:
                                courier_ret += qty_diff
                        
                        # Transferred in (Material Transfer, positive qty)
                        elif purpose == 'Material Transfer' and qty_diff > 0:
                            trans_in += qty_diff
                        
                        # Transferred out (Material Transfer, negative qty)
                        elif purpose == 'Material Transfer' and qty_diff < 0:
                            trans_out += abs(qty_diff)
                
                # Delivered - exclude return Delivery Notes
                elif entry.voucher_type == 'Delivery Note':
                    # Check if this Delivery Note is a return entry
                    dn_check = frappe.db.sql("""
                        SELECT is_return
                        FROM `tabDelivery Note`
                        WHERE name = %s AND docstatus = 1
                    """, (entry.voucher_no,), as_dict=True)
                    
                    # Only count regular Delivery Notes (not returns) as delivered
                    if dn_check and dn_check[0].is_return != 1:
                        if qty_diff < 0:
                            deliv += abs(qty_diff)
            
            # Entries after to_date don't count for period calculations
        
        # Debug output
        if item_code and ('Textbook-3' in item_code or 'MQHWB-03' in item_code):
            print(f"[DEBUG get_warehouse_item_data] Opening Balance: {opening_bal}")
            print(f"[DEBUG get_warehouse_item_data] Received Vendor: {received_vend}")
            print(f"[DEBUG get_warehouse_item_data] Courier Returned: {courier_ret}")
            print(f"[DEBUG get_warehouse_item_data] Transferred In: {trans_in}")
            print(f"[DEBUG get_warehouse_item_data] Transferred Out: {trans_out}")
            print(f"[DEBUG get_warehouse_item_data] Delivered: {deliv}")
            print(f"[DEBUG get_warehouse_item_data] Ending Balance: {ending_bal}")
        
        # Convert to float
        opening_bal = flt(opening_bal)
        received_vend = flt(received_vend)
        courier_ret = flt(courier_ret)
        trans_in = flt(trans_in)
        trans_out = flt(trans_out)
        deliv = flt(deliv)
        ending_bal = flt(ending_bal)
        
        # Log if opening balance is significantly negative (might indicate data issues)
        if opening_bal < -100:
            print(
                f"Large negative opening balance detected for {item_code} in {warehouse}: {opening_bal}. "
                f"Please check Stock Ledger Entries for this item/warehouse combination.",
                "Stock Detail - Negative Balance Warning"
            )
        
        # Verify ending balance calculation:
        # Ending Balance = Opening Balance + Received (Vendor) + Courier Returned + Transferred In - Transferred Out - Delivered
        calculated_ending = opening_bal + received_vend + courier_ret + trans_in - trans_out - deliv
        
        # Use the calculated ending balance if it differs significantly from the query result
        # (allowing for small rounding differences)
        if abs(calculated_ending - ending_bal) > 0.01:
            # Log discrepancy for debugging
            print(f"[WARNING] Ending balance mismatch for {item_code} in {warehouse}: Query={ending_bal}, Calculated={calculated_ending}")
            print(f"[WARNING] Opening={opening_bal}, Received={received_vend}, Courier={courier_ret}, TransIn={trans_in}, TransOut={trans_out}, Delivered={deliv}")
            # Use calculated value as it's more reliable
            ending_bal = calculated_ending
        
        return {
            "opening_balance": opening_bal,
            "received_vendor": received_vend,
            "courier_returned": courier_ret,
            "transferred_in": trans_in,
            "transferred_out": trans_out,
            "delivered": deliv,
            "ending_balance": ending_bal
        }
        
    except Exception as e:
        print(f"Error getting warehouse item data: {str(e)}")
        return {}

def calculate_mqh_totals(data):
    """Calculate totals for MQH Books data"""
    return {
        "opening_stock": sum(item.get("opening_stock", 0) for item in data),
        "received_vendor": sum(item.get("received_vendor", 0) for item in data),
        "book_return": sum(item.get("book_return", 0) for item in data),
        "delivered": sum(item.get("delivered", 0) for item in data),
        "available_stock": sum(item.get("available_stock", 0) for item in data),
        "demand_received": sum(item.get("demand_received", 0) for item in data),
        "books_sale": sum(item.get("books_sale", 0) for item in data),
        "total_amount": sum(item.get("total_amount", 0) for item in data)
    }

def calculate_head_office_totals(data):
    """Calculate totals for Head Office data"""
    return {
        "opening_balance": sum(item.get("opening_balance", 0) for item in data),
        "received_vendor": sum(item.get("received_vendor", 0) for item in data),
        "courier_returned": sum(item.get("courier_returned", 0) for item in data),
        "transferred_in": sum(item.get("transferred_in", 0) for item in data),
        "transferred_out": sum(item.get("transferred_out", 0) for item in data),
        "delivered": sum(item.get("delivered", 0) for item in data),
        "ending_balance": sum(item.get("ending_balance", 0) for item in data)
    }

def calculate_old_office_totals(data):
    """Calculate totals for Old Office data"""
    return calculate_head_office_totals(data)  # Same structure

def calculate_nazimabad_totals(data):
    """Calculate totals for Nazimabad Warehouse data"""
    return calculate_head_office_totals(data)  # Same structure

def calculate_kpis_for_specific_items(data, filters=None):
    """Calculate KPIs for specific items - returns both totals and individual item KPIs
    Ensures all items from SPECIFIC_ITEM_CODES are included"""
    try:
        if filters is None:
            filters = {}
        
        # Calculate individual item KPIs (deduplicate by item_code to avoid duplicates)
        items_kpi_dict = {}
        
        # Process data items
        for item in data:
            item_code = item.get("item_code", "")
            if not item_code:
                continue
            
            # If item already exists, sum the values (deduplicate)
            if item_code in items_kpi_dict:
                existing = items_kpi_dict[item_code]
                items_kpi_dict[item_code] = {
                    "item_code": item_code,
                    "item_name": existing.get("item_name") or item.get("item_name", ""),
                    "opening_stock": flt(existing.get("opening_stock", 0)) + flt(item.get("opening_stock", 0)),
                    "available_stock": flt(existing.get("available_stock", 0)) + flt(item.get("available_stock", 0)),
                    "delivered": flt(existing.get("delivered", 0)) + flt(item.get("delivered", 0)),
                    "received_vendor": flt(existing.get("received_vendor", 0)) + flt(item.get("received_vendor", 0)),
                    "book_return": flt(existing.get("book_return", 0)) + flt(item.get("book_return", 0)),
                    "demand_received": flt(existing.get("demand_received", 0)) + flt(item.get("demand_received", 0)),
                    "books_sale": cint(existing.get("books_sale", 0)) + cint(item.get("books_sale", 0)),
                    "total_amount": flt(existing.get("total_amount", 0)) + flt(item.get("total_amount", 0))
                }
            else:
                items_kpi_dict[item_code] = {
                    "item_code": item_code,
                    "item_name": item.get("item_name", ""),
                    "opening_stock": flt(item.get("opening_stock", 0)),
                    "available_stock": flt(item.get("available_stock", 0)),
                    "delivered": flt(item.get("delivered", 0)),
                    "received_vendor": flt(item.get("received_vendor", 0)),
                    "book_return": flt(item.get("book_return", 0)),
                    "demand_received": flt(item.get("demand_received", 0)),
                    "books_sale": cint(item.get("books_sale", 0)),
                    "total_amount": flt(item.get("total_amount", 0))
                }
        
        # Ensure ALL items from SPECIFIC_ITEM_CODES are included (even if zero balance)
        # Only when not filtering by a specific item
        if not filters.get('item'):
            for item_code in SPECIFIC_ITEM_CODES:
                if item_code not in items_kpi_dict:
                    # Get item name
                    try:
                        item_name = frappe.db.get_value('Item', item_code, 'item_name')
                        if not item_name:
                            item_name = item_code
                    except:
                        item_name = item_code
                    
                    # Get stock data for this item
                    try:
                        stock_data = get_item_stock_data(item_code, filters)
                        if not isinstance(stock_data, dict):
                            stock_data = {}
                    except Exception as e:
                        print(f"[calculate_kpis_for_specific_items] Error getting stock data for {item_code}: {str(e)}")
                        stock_data = {}
                    
                    items_kpi_dict[item_code] = {
                        "item_code": item_code,
                        "item_name": item_name,
                        "opening_stock": flt(stock_data.get('opening_stock', 0)),
                        "available_stock": flt(stock_data.get('available_stock', 0)),
                        "delivered": flt(stock_data.get('delivered', 0)),
                        "received_vendor": flt(stock_data.get('received_vendor', 0)),
                        "book_return": flt(stock_data.get('book_return', 0)),
                        "demand_received": flt(stock_data.get('demand_received', 0)),
                        "books_sale": cint(stock_data.get('books_sale', 0)),
                        "total_amount": flt(stock_data.get('total_amount', 0))
                    }
        
        # Convert dictionary to list, maintaining order from SPECIFIC_ITEM_CODES
        items_kpi = []
        if filters.get('item'):
            # If filtering by specific item, just return that item
            if filters.get('item') in items_kpi_dict:
                items_kpi = [items_kpi_dict[filters.get('item')]]
        else:
            # Return all items in SPECIFIC_ITEM_CODES order
            for item_code in SPECIFIC_ITEM_CODES:
                if item_code in items_kpi_dict:
                    items_kpi.append(items_kpi_dict[item_code])
        
        # Calculate totals from all items
        totals = {
            "total_items": len(items_kpi),
            "total_opening_stock": sum(flt(item.get("opening_stock", 0)) for item in items_kpi),
            "total_available_stock": sum(flt(item.get("available_stock", 0)) for item in items_kpi),
            "total_delivered": sum(flt(item.get("delivered", 0)) for item in items_kpi),
            "total_received_vendor": sum(flt(item.get("received_vendor", 0)) for item in items_kpi),
            "total_book_return": sum(flt(item.get("book_return", 0)) for item in items_kpi),
            "total_demand_received": sum(flt(item.get("demand_received", 0)) for item in items_kpi),
            "total_books_sale": sum(cint(item.get("books_sale", 0)) for item in items_kpi),
            "total_amount": sum(flt(item.get("total_amount", 0)) for item in items_kpi)
        }
        
        # Combine totals and individual items
        kpi_data = {
            **totals,
            "items": items_kpi
        }
        
        return kpi_data
    except Exception as e:
        frappe.log_error(f"Error calculating KPIs: {str(e)}", "Stock Detail KPI Error")
        return {
            "total_items": 0,
            "total_opening_stock": 0,
            "total_available_stock": 0,
            "total_delivered": 0,
            "total_received_vendor": 0,
            "total_book_return": 0,
            "total_demand_received": 0,
            "total_books_sale": 0,
            "total_amount": 0,
            "items": []
        }

@frappe.whitelist()
def get_stock_data(filters=None):
    """API endpoint to get stock data with filters"""
    try:
        # Parse filters - Frappe may pass as dict or string
        print(f"[get_stock_data] Raw filters received: {filters}, type: {type(filters)}")
        
        # Try to get from form_dict if filters is empty
        if not filters or (isinstance(filters, dict) and len(filters) == 0):
            try:
                import frappe
                form_dict = frappe.form_dict
                if form_dict and 'item' in form_dict:
                    filters = dict(form_dict)
                    print(f"[get_stock_data] Got filters from form_dict: {filters}")
            except:
                pass
        
        if isinstance(filters, str):
            import json
            filters = json.loads(filters)
        elif filters is None:
            filters = {}
        elif isinstance(filters, dict):
            # Already a dict, use as is
            pass
        else:
            # Try to convert to dict
            filters = dict(filters) if filters else {}
            
        # Print filters for debugging
        print(f"[get_stock_data] Parsed filters: {filters}")
        print(f"[get_stock_data] Item Filter: {filters.get('item')} (type: {type(filters.get('item'))})")
        print(f"[get_stock_data] Date Range: {filters.get('from_date')} to {filters.get('to_date')}")
            
        # Get dynamic data from database with filters
        mqh_books_data = get_mqh_books_data(filters)
        mqh_urdu_books_data = get_mqh_urdu_books_data(filters)
        
        print(f"[get_stock_data] MQH Books: {len(mqh_books_data)} items, Urdu Books: {len(mqh_urdu_books_data)} items")
        
        # Combine and deduplicate items by item_code
        # Create a combined dictionary to avoid duplicates
        combined_items_dict = {}
        
        # Add items from mqh_books_data
        for item in mqh_books_data:
            item_code = item.get('item_code', '')
            if item_code:
                combined_items_dict[item_code] = item
        
        # Add items from mqh_urdu_books_data (will overwrite if duplicate, or add if new)
        for item in mqh_urdu_books_data:
            item_code = item.get('item_code', '')
            if item_code:
                if item_code in combined_items_dict:
                    # Item exists in both, merge the data (sum values)
                    existing = combined_items_dict[item_code]
                    combined_items_dict[item_code] = {
                        'item_code': item_code,
                        'item_name': existing.get('item_name') or item.get('item_name', ''),
                        'particulars': existing.get('particulars') or item.get('particulars', ''),
                        'opening_stock': flt(existing.get('opening_stock', 0)) + flt(item.get('opening_stock', 0)),
                        'received_vendor': flt(existing.get('received_vendor', 0)) + flt(item.get('received_vendor', 0)),
                        'book_return': flt(existing.get('book_return', 0)) + flt(item.get('book_return', 0)),
                        'delivered': flt(existing.get('delivered', 0)) + flt(item.get('delivered', 0)),
                        'available_stock': flt(existing.get('available_stock', 0)) + flt(item.get('available_stock', 0)),
                        'demand_received': flt(existing.get('demand_received', 0)) + flt(item.get('demand_received', 0)),
                        'books_sale': cint(existing.get('books_sale', 0)) + cint(item.get('books_sale', 0)),
                        'total_amount': flt(existing.get('total_amount', 0)) + flt(item.get('total_amount', 0))
                    }
                else:
                    combined_items_dict[item_code] = item
        
        # Ensure ALL items from SPECIFIC_ITEM_CODES are included (even if they don't exist in DB)
        # Only do this when not filtering by a specific item
        if not filters.get('item'):
            for item_code in SPECIFIC_ITEM_CODES:
                if item_code not in combined_items_dict:
                    # Item not found, try to get from database and create entry with zero stock
                    try:
                        item_name = frappe.db.get_value('Item', item_code, 'item_name')
                        if not item_name:
                            item_name = item_code
                    except:
                        item_name = item_code
                    
                    # Get stock data even if item doesn't exist in query results
                    try:
                        stock_data = get_item_stock_data(item_code, filters)
                        if not isinstance(stock_data, dict):
                            stock_data = {}
                    except Exception as e:
                        print(f"[get_stock_data] Error getting stock data for {item_code}: {str(e)}")
                        stock_data = {}
                    
                    particulars = f"{item_code} - {item_name}" if item_code and item_name else (item_code or item_name)
                    
                    combined_items_dict[item_code] = {
                        'item_code': item_code,
                        'item_name': item_name,
                        'particulars': particulars,
                        'opening_stock': flt(stock_data.get('opening_stock', 0)),
                        'received_vendor': flt(stock_data.get('received_vendor', 0)),
                        'book_return': flt(stock_data.get('book_return', 0)),
                        'delivered': flt(stock_data.get('delivered', 0)),
                        'available_stock': flt(stock_data.get('available_stock', 0)),
                        'demand_received': flt(stock_data.get('demand_received', 0)),
                        'books_sale': cint(stock_data.get('books_sale', 0)),
                        'total_amount': flt(stock_data.get('total_amount', 0))
                    }
        
        # Convert back to lists, maintaining order from SPECIFIC_ITEM_CODES
        mqh_books_final = []
        mqh_urdu_books_final = []
        seen_codes = set()
        
        # Add items in the order they appear in SPECIFIC_ITEM_CODES
        # Assign s_no for proper ordering
        s_no = 1
        for item_code in SPECIFIC_ITEM_CODES:
            if item_code in combined_items_dict and item_code not in seen_codes:
                item = combined_items_dict[item_code]
                item['s_no'] = s_no
                s_no += 1
                # Put all items in mqh_books_data for now (we can split later if needed)
                mqh_books_final.append(item)
                seen_codes.add(item_code)
        
        # Update the data
        mqh_books_data = mqh_books_final
        mqh_urdu_books_data = []  # Clear Urdu books since we're combining everything
        
        print(f"[get_stock_data] After combining: MQH Books: {len(mqh_books_data)} items, Urdu Books: {len(mqh_urdu_books_data)} items")
        print(f"[get_stock_data] Expected {len(SPECIFIC_ITEM_CODES)} items, got {len(mqh_books_data)} items")
        if len(mqh_books_data) < len(SPECIFIC_ITEM_CODES):
            missing = set(SPECIFIC_ITEM_CODES) - seen_codes
            print(f"[get_stock_data] Missing items after combining: {missing}")
            # Note: Missing items should have been handled earlier (lines 1234-1268)
            # This is just for logging purposes
        
        # If specific warehouse is selected, get only that warehouse data
        if filters.get('warehouse'):
            warehouse_data = get_specific_warehouse_data(filters)
            head_office_data = []
            old_office_data = []
            nazimabad_warehouse_data = []
        else:
            warehouse_data = []
            head_office_data = get_head_office_data(filters)
            old_office_data = get_old_office_data(filters)
            nazimabad_warehouse_data = get_nazimabad_warehouse_data(filters)
        
        print(f"[get_stock_data] Warehouse Data: {len(warehouse_data)}, Head Office: {len(head_office_data)}, Old Office: {len(old_office_data)}, Nazimabad: {len(nazimabad_warehouse_data)}")
        
        # Calculate totals
        mqh_totals = calculate_mqh_totals(mqh_books_data)
        mqh_urdu_totals = calculate_mqh_totals(mqh_urdu_books_data)
        head_office_totals = calculate_head_office_totals(head_office_data)
        old_office_totals = calculate_old_office_totals(old_office_data)
        nazimabad_totals = calculate_nazimabad_totals(nazimabad_warehouse_data)
        
        # Calculate KPIs for specific items - ensure all items from SPECIFIC_ITEM_CODES are included
        kpi_data = calculate_kpis_for_specific_items(mqh_books_data + mqh_urdu_books_data, filters)
        
        result = {
            "mqh_books_data": mqh_books_data,
            "mqh_totals": mqh_totals,
            "mqh_urdu_books_data": mqh_urdu_books_data,
            "mqh_urdu_totals": mqh_urdu_totals,
            "warehouse_data": warehouse_data,
            "head_office_data": head_office_data,
            "head_office_totals": head_office_totals,
            "old_office_data": old_office_data,
            "old_office_totals": old_office_totals,
            "nazimabad_warehouse_data": nazimabad_warehouse_data,
            "nazimabad_totals": nazimabad_totals,
            "kpi_data": kpi_data
        }
        
        print(f"[get_stock_data] Returning: MQH Books: {len(mqh_books_data)}, Urdu Books: {len(mqh_urdu_books_data)}, Warehouse: {len(warehouse_data)}, Head Office: {len(head_office_data)}")
        
        # Ensure we always return at least empty arrays, not None
        if not mqh_books_data:
            mqh_books_data = []
        if not mqh_urdu_books_data:
            mqh_urdu_books_data = []
        if not warehouse_data:
            warehouse_data = []
        if not head_office_data:
            head_office_data = []
        if not old_office_data:
            old_office_data = []
        if not nazimabad_warehouse_data:
            nazimabad_warehouse_data = []
        
        result = {
            "mqh_books_data": mqh_books_data,
            "mqh_totals": mqh_totals,
            "mqh_urdu_books_data": mqh_urdu_books_data,
            "mqh_urdu_totals": mqh_urdu_totals,
            "warehouse_data": warehouse_data,
            "head_office_data": head_office_data,
            "head_office_totals": head_office_totals,
            "old_office_data": old_office_data,
            "old_office_totals": old_office_totals,
            "nazimabad_warehouse_data": nazimabad_warehouse_data,
            "nazimabad_totals": nazimabad_totals,
            "kpi_data": kpi_data
        }
        
        return result
        
    except Exception as e:
        import traceback
        error_msg = f"Error getting stock data: {str(e)}\n{traceback.format_exc()}"
        print(error_msg)
        frappe.log_error(error_msg, "Stock Detail Error")
        return {
            "error": str(e),
            "mqh_books_data": [],
            "mqh_urdu_books_data": [],
            "warehouse_data": [],
            "head_office_data": [],
            "old_office_data": [],
            "nazimabad_warehouse_data": [],
            "kpi_data": {}
        }

@frappe.whitelist()
def get_warehouses():
    """Get list of warehouses for filter dropdown"""
    try:
        warehouses = frappe.db.sql("""
            SELECT name, warehouse_name
            FROM `tabWarehouse`
            WHERE disabled = 0
            ORDER BY warehouse_name
        """, as_dict=True)
        return warehouses
    except Exception as e:
        print(f"Error getting warehouses: {str(e)}")
        return []

@frappe.whitelist()
def get_item_groups():
    """Get list of item groups for filter dropdown"""
    try:
        item_groups = frappe.db.sql("""
            SELECT DISTINCT item_group
            FROM `tabItem`
            WHERE item_group IS NOT NULL
            AND item_group != ''
            ORDER BY item_group
        """, as_dict=True)
        return item_groups
    except Exception as e:
        print(f"Error getting item groups: {str(e)}")
        return []

@frappe.whitelist()
def get_items():
    """Get list of items for filter dropdown (only specific items - all are item codes)"""
    try:
        # Build filter for specific item codes only
        item_code_placeholders = ','.join(['%s'] * len(SPECIFIC_ITEM_CODES))
        
        items = frappe.db.sql(f"""
            SELECT DISTINCT i.item_code, i.item_name
            FROM `tabItem` i
            WHERE i.item_code IN ({item_code_placeholders})
            AND i.disabled = 0
            ORDER BY i.item_name, i.item_code
        """, tuple(SPECIFIC_ITEM_CODES), as_dict=True)
        print(f"[get_items] Found {len(items)} items")
        print(f"[get_items] Sample items: {[i.item_code for i in items[:5]]}")
        return items
    except Exception as e:
        print(f"[ERROR] Error getting items: {str(e)}")
        import traceback
        traceback.print_exc()
        return []