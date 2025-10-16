import frappe
from frappe import _
from frappe.utils import flt, cint

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
            
        # Build item group filter
        item_group_filter = ""
        if filters.get('item_group'):
            item_group_filter = f"AND item_group = '{filters['item_group']}'"
        else:
            item_group_filter = "AND item_group IN ('MQH Books (Urdu Version)', 'MQH Books (English Version)', 'MQH Books (Sindhi Version)', 'MQH Teacher Guides (Urdu Version)', 'Noorani Qaida Teacher Guide', 'Noorani Qaida Workbook', 'Books')"
        
        # Get all items in MQH Books item groups
        items = frappe.db.sql(f"""
            SELECT DISTINCT item_code, item_name, item_group
            FROM `tabItem`
            WHERE 1=1 {item_group_filter}
            ORDER BY item_name
        """, as_dict=True)
        
        frappe.log_error(f"Found {len(items)} items in MQH Books groups")
        
        if not items:
            # If no items found, let's get any items to test
            items = frappe.db.sql("""
                SELECT DISTINCT item_code, item_name, item_group
                FROM `tabItem`
                LIMIT 5
            """, as_dict=True)
            frappe.log_error(f"Using first 5 items for testing: {[i.item_name for i in items]}")
        
        mqh_data = []
        s_no = 1
        
        for item in items:
            # Get stock data for this item
            stock_data = get_item_stock_data(item.item_code, filters)
            
            mqh_data.append({
                "s_no": s_no,
                "particulars": item.item_name,
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
            
        return mqh_data
        
    except Exception as e:
        frappe.log_error(f"Error getting MQH books data: {str(e)}")
        return []

def get_mqh_urdu_books_data(filters=None):
    """Get MQH Urdu Books data from Stock Ledger Entry"""
    try:
        if not filters:
            filters = {}
            
        # Build item group filter
        item_group_filter = ""
        if filters.get('item_group'):
            if 'Urdu' in filters['item_group']:
                item_group_filter = f"AND item_group = '{filters['item_group']}'"
            else:
                return []  # If specific item group selected and it's not Urdu, return empty
        else:
            item_group_filter = "AND item_group IN ('MQH Books (Urdu Version)', 'MQH Teacher Guides (Urdu Version)')"
        
        # Get all items in Urdu-related item groups
        items = frappe.db.sql(f"""
            SELECT DISTINCT item_code, item_name, item_group
            FROM `tabItem`
            WHERE 1=1 {item_group_filter}
            ORDER BY item_name
        """, as_dict=True)
        
        frappe.log_error(f"Found {len(items)} Urdu books items")
        
        if not items:
            # If no Urdu items found, get some sample items
            items = frappe.db.sql("""
                SELECT DISTINCT item_code, item_name, item_group
                FROM `tabItem`
                WHERE item_name LIKE '%Book%'
                LIMIT 3
            """, as_dict=True)
            frappe.log_error(f"Using sample book items for Urdu section: {[i.item_name for i in items]}")
        
        mqh_urdu_data = []
        s_no = 1
        
        for item in items:
            # Get stock data for this item
            stock_data = get_item_stock_data(item.item_code, filters)
            
            mqh_urdu_data.append({
                "s_no": s_no,
                "particulars": item.item_name,
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
        frappe.log_error(f"Error getting MQH Urdu books data: {str(e)}")
        return []

def get_item_stock_data(item_code, filters=None):
    """Get stock data for a specific item"""
    try:
        if not filters:
            filters = {}
            
        # Use filter dates or default to current month
        from datetime import datetime, timedelta
        if filters.get('from_date') and filters.get('to_date'):
            from_date = datetime.strptime(filters['from_date'], '%Y-%m-%d')
            to_date = datetime.strptime(filters['to_date'], '%Y-%m-%d')
            # For opening stock, use the day before from_date
            opening_date = from_date - timedelta(days=1)
        else:
            today = datetime.now()
            month_start = today.replace(day=1)
            last_month = month_start - timedelta(days=1)
            from_date = last_month.replace(day=1)
            to_date = last_month
            opening_date = from_date - timedelta(days=1)
        
        # Get opening stock (as of opening_date)
        opening_stock = frappe.db.sql("""
            SELECT SUM(actual_qty) as qty
            FROM `tabStock Ledger Entry`
            WHERE item_code = %s
            AND posting_date <= %s
        """, (item_code, opening_date.strftime('%Y-%m-%d')), as_dict=True)
        
        # Get received from vendor (date range)
        received_vendor = frappe.db.sql("""
            SELECT SUM(actual_qty) as qty
            FROM `tabStock Ledger Entry`
            WHERE item_code = %s
            AND posting_date BETWEEN %s AND %s
            AND voucher_type = 'Purchase Receipt'
            AND actual_qty > 0
        """, (item_code, from_date.strftime('%Y-%m-%d'), to_date.strftime('%Y-%m-%d')), as_dict=True)
        
        # Get book returns (date range)
        book_return = frappe.db.sql("""
            SELECT SUM(sle.actual_qty) as qty
            FROM `tabStock Ledger Entry` sle
            JOIN `tabStock Entry` se ON se.name = sle.voucher_no
            WHERE sle.item_code = %s
            AND sle.posting_date BETWEEN %s AND %s
            AND sle.voucher_type = 'Stock Entry'
            AND sle.actual_qty > 0
            AND se.purpose = 'Material Receipt'
        """, (item_code, from_date.strftime('%Y-%m-%d'), to_date.strftime('%Y-%m-%d')), as_dict=True)
        
        # Get delivered (date range)
        delivered = frappe.db.sql("""
            SELECT SUM(ABS(actual_qty)) as qty
            FROM `tabStock Ledger Entry`
            WHERE item_code = %s
            AND posting_date BETWEEN %s AND %s
            AND voucher_type = 'Delivery Note'
            AND actual_qty < 0
        """, (item_code, from_date.strftime('%Y-%m-%d'), to_date.strftime('%Y-%m-%d')), as_dict=True)
        
        # Get current available stock (as of to_date)
        available_stock = frappe.db.sql("""
            SELECT SUM(actual_qty) as qty
            FROM `tabStock Ledger Entry`
            WHERE item_code = %s
            AND posting_date <= %s
        """, (item_code, to_date.strftime('%Y-%m-%d')), as_dict=True)
        
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
        books_sale = frappe.db.sql("""
            SELECT COUNT(*) as count, SUM(si_item.amount) as amount
            FROM `tabSales Invoice Item` si_item
            JOIN `tabSales Invoice` si ON si.name = si_item.parent
            WHERE si_item.item_code = %s
            AND si.posting_date BETWEEN %s AND %s
            AND si.docstatus = 1
        """, (item_code, from_date.strftime('%Y-%m-%d'), to_date.strftime('%Y-%m-%d')), as_dict=True)
        
        result = {
            "opening_stock": flt(opening_stock[0].qty) if opening_stock else 0,
            "received_vendor": flt(received_vendor[0].qty) if received_vendor else 0,
            "book_return": flt(book_return[0].qty) if book_return else 0,
            "delivered": flt(delivered[0].qty) if delivered else 0,
            "available_stock": flt(available_stock[0].qty) if available_stock else 0,
            "demand_received": flt(demand_received[0].qty) if demand_received else 0,
            "books_sale": cint(books_sale[0].count) if books_sale else 0,
            "total_amount": flt(books_sale[0].amount) if books_sale else 0
        }
        
        return result
        
    except Exception as e:
        frappe.log_error(f"Error getting stock data for item {item_code}: {str(e)}")
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
        frappe.log_error(f"Error getting head office data: {str(e)}")
        return []

def get_old_office_data(filters=None):
    """Get TIF Old Office stock data"""
    try:
        if not filters:
            filters = {}
            
        # Try to find old office warehouse
        possible_names = ["TIF Old Office", "Old Office", "TIF Old", "Old Warehouse"]
        old_office_warehouse = None
        
        for name in possible_names:
            old_office_warehouse = frappe.db.get_value("Warehouse", {"warehouse_name": name}, "name")
            if old_office_warehouse:
                break
        
        if not old_office_warehouse:
            # Use second warehouse if available
            warehouses = frappe.db.sql("""
                SELECT name FROM `tabWarehouse` ORDER BY name LIMIT 2
            """, as_dict=True)
            if len(warehouses) > 1:
                old_office_warehouse = warehouses[1].name
            else:
                return []
            
        return get_warehouse_stock_data(old_office_warehouse, "Old Office", filters)
        
    except Exception as e:
        frappe.log_error(f"Error getting old office data: {str(e)}")
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
        frappe.log_error(f"Error getting nazimabad warehouse data: {str(e)}")
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
            
        return get_warehouse_stock_data(warehouse, warehouse_name, filters)
        
    except Exception as e:
        frappe.log_error(f"Error getting specific warehouse data: {str(e)}")
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
            
        # Build item group filter
        item_group_filter = ""
        if filters.get('item_group'):
            item_group_filter = f"AND i.item_group = '{filters['item_group']}'"
            
        # Get all items that have stock in this warehouse
        items = frappe.db.sql(f"""
            SELECT DISTINCT sle.item_code, i.item_name, i.item_group
            FROM `tabStock Ledger Entry` sle
            JOIN `tabItem` i ON i.item_code = sle.item_code
            WHERE sle.warehouse = %s
            {date_filter}
            {item_group_filter}
            ORDER BY i.item_name
        """, (warehouse,), as_dict=True)
        
        pass
        
        warehouse_data = []
        s_no = 1
        
        for item in items:
            stock_data = get_warehouse_item_data(item.item_code, warehouse, filters)
            
            warehouse_data.append({
                "s_no": s_no,
                "particulars": item.item_name,
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
        frappe.log_error(f"Error getting warehouse data for {warehouse_name}: {str(e)}")
        return []

def get_warehouse_item_data(item_code, warehouse, filters=None):
    """Get item data for a specific warehouse"""
    try:
        if not filters:
            filters = {}
            
        # Use filter dates or default dates
        if filters.get('from_date') and filters.get('to_date'):
            from_date = filters['from_date']
            to_date = filters['to_date']
        else:
            from_date = '2025-09-01'
            to_date = '2025-09-30'
            
        # Opening balance (as of from_date)
        opening_balance = frappe.db.sql("""
            SELECT SUM(actual_qty) as qty
            FROM `tabStock Ledger Entry`
            WHERE item_code = %s AND warehouse = %s
            AND posting_date < %s
        """, (item_code, warehouse, from_date), as_dict=True)
        
        # Received from vendor
        received_vendor = frappe.db.sql("""
            SELECT SUM(actual_qty) as qty
            FROM `tabStock Ledger Entry`
            WHERE item_code = %s AND warehouse = %s
            AND posting_date BETWEEN %s AND %s
            AND voucher_type = 'Purchase Receipt'
            AND actual_qty > 0
        """, (item_code, warehouse, from_date, to_date), as_dict=True)
        
        # Courier returned
        courier_returned = frappe.db.sql("""
            SELECT SUM(sle.actual_qty) as qty
            FROM `tabStock Ledger Entry` sle
            JOIN `tabStock Entry` se ON se.name = sle.voucher_no
            WHERE sle.item_code = %s AND sle.warehouse = %s
            AND sle.posting_date BETWEEN %s AND %s
            AND sle.voucher_type = 'Stock Entry'
            AND sle.actual_qty > 0
            AND se.purpose = 'Material Receipt'
        """, (item_code, warehouse, from_date, to_date), as_dict=True)
        
        # Transferred in
        transferred_in = frappe.db.sql("""
            SELECT SUM(sle.actual_qty) as qty
            FROM `tabStock Ledger Entry` sle
            JOIN `tabStock Entry` se ON se.name = sle.voucher_no
            WHERE sle.item_code = %s AND sle.warehouse = %s
            AND sle.posting_date BETWEEN %s AND %s
            AND sle.voucher_type = 'Stock Entry'
            AND sle.actual_qty > 0
            AND se.purpose = 'Material Transfer'
        """, (item_code, warehouse, from_date, to_date), as_dict=True)
        
        # Transferred out
        transferred_out = frappe.db.sql("""
            SELECT SUM(ABS(sle.actual_qty)) as qty
            FROM `tabStock Ledger Entry` sle
            JOIN `tabStock Entry` se ON se.name = sle.voucher_no
            WHERE sle.item_code = %s AND sle.warehouse = %s
            AND sle.posting_date BETWEEN %s AND %s
            AND sle.voucher_type = 'Stock Entry'
            AND sle.actual_qty < 0
            AND se.purpose = 'Material Transfer'
        """, (item_code, warehouse, from_date, to_date), as_dict=True)
        
        # Delivered
        delivered = frappe.db.sql("""
            SELECT SUM(ABS(actual_qty)) as qty
            FROM `tabStock Ledger Entry`
            WHERE item_code = %s AND warehouse = %s
            AND posting_date BETWEEN %s AND %s
            AND voucher_type = 'Delivery Note'
            AND actual_qty < 0
        """, (item_code, warehouse, from_date, to_date), as_dict=True)
        
        # Ending balance (as of to_date)
        ending_balance = frappe.db.sql("""
            SELECT SUM(actual_qty) as qty
            FROM `tabStock Ledger Entry`
            WHERE item_code = %s AND warehouse = %s
            AND posting_date <= %s
        """, (item_code, warehouse, to_date), as_dict=True)
        
        return {
            "opening_balance": flt(opening_balance[0].qty) if opening_balance else 0,
            "received_vendor": flt(received_vendor[0].qty) if received_vendor else 0,
            "courier_returned": flt(courier_returned[0].qty) if courier_returned else 0,
            "transferred_in": flt(transferred_in[0].qty) if transferred_in else 0,
            "transferred_out": flt(transferred_out[0].qty) if transferred_out else 0,
            "delivered": flt(delivered[0].qty) if delivered else 0,
            "ending_balance": flt(ending_balance[0].qty) if ending_balance else 0
        }
        
    except Exception as e:
        frappe.log_error(f"Error getting warehouse item data: {str(e)}")
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

@frappe.whitelist()
def get_stock_data(filters=None):
    """API endpoint to get stock data with filters"""
    try:
        # Parse filters
        if isinstance(filters, str):
            import json
            filters = json.loads(filters)
        elif not filters:
            filters = {}
            
        frappe.log_error(f"get_stock_data called with filters: {filters}")
        
        # Log the date range being used
        if filters.get('from_date') and filters.get('to_date'):
            frappe.log_error(f"Using date range: {filters['from_date']} to {filters['to_date']}")
        else:
            frappe.log_error("Using default date range")
            
        # Get dynamic data from database with filters
        mqh_books_data = get_mqh_books_data(filters)
        mqh_urdu_books_data = get_mqh_urdu_books_data(filters)
        
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
        
        # Calculate totals
        mqh_totals = calculate_mqh_totals(mqh_books_data)
        mqh_urdu_totals = calculate_mqh_totals(mqh_urdu_books_data)
        head_office_totals = calculate_head_office_totals(head_office_data)
        old_office_totals = calculate_old_office_totals(old_office_data)
        nazimabad_totals = calculate_nazimabad_totals(nazimabad_warehouse_data)
        
        return {
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
            "nazimabad_totals": nazimabad_totals
        }
        
    except Exception as e:
        frappe.log_error(f"Error getting stock data: {str(e)}")
        return {"error": str(e)}

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
        frappe.log_error(f"Error getting warehouses: {str(e)}")
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
        frappe.log_error(f"Error getting item groups: {str(e)}")
        return []