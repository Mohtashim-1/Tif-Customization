import frappe
from frappe import _
from frappe.utils import flt, cint, getdate, today, add_days, date_diff
from datetime import datetime, timedelta

@frappe.whitelist()
def get_courier_report_data(filters=None):
	"""Main API endpoint to get all courier report data"""
	try:
		if isinstance(filters, str):
			import json
			filters = json.loads(filters)
		elif not filters:
			filters = {}
		
		# Set default date range if not provided
		if not filters.get('from_date'):
			filters['from_date'] = add_days(today(), -30)
		if not filters.get('to_date'):
			filters['to_date'] = today()
		
		# If cost_centers filter contains numbers like "8121" or "8122", 
		# find actual cost center names that match these numbers
		if filters.get('cost_centers'):
			cost_center_numbers = filters.get('cost_centers', [])
			# Check if any filter value is just a number (like "8121" or "8122")
			actual_cost_centers = []
			for cc_filter in cost_center_numbers:
				if cc_filter.isdigit():
					# Find cost centers with this number - try exact match first
					matching_ccs = frappe.db.sql("""
						SELECT name FROM `tabCost Center`
						WHERE cost_center_number = %s
						AND disabled = 0
					""", (cc_filter,), as_dict=True)
					if matching_ccs:
						actual_cost_centers.extend([cc['name'] for cc in matching_ccs])
					else:
						# If not found by number, try to find by name containing the number
						matching_ccs = frappe.db.sql("""
							SELECT name FROM `tabCost Center`
							WHERE (name LIKE %s OR cost_center_name LIKE %s)
							AND disabled = 0
						""", (f'%{cc_filter}%', f'%{cc_filter}%'), as_dict=True)
						actual_cost_centers.extend([cc['name'] for cc in matching_ccs])
				else:
					# Already a cost center name, use as is
					actual_cost_centers.append(cc_filter)
			filters['cost_centers'] = list(set(actual_cost_centers))  # Remove duplicates
		
		# Get all data
		kpi_data = get_kpi_data(filters)
		cost_center_summary = get_cost_center_summary(filters)
		journal_entries = get_journal_entries(filters)
		delivery_notes = get_delivery_notes(filters)
		top_customers = get_top_customers(filters)
		top_items = get_top_items(filters)
		books_by_cost_center = get_books_by_cost_center(filters)
		monthly_trend = get_monthly_trend(filters)
		expense_by_cost_center = get_expense_by_cost_center(filters)
		delivery_mode_data = get_delivery_mode_data(filters)
		courier_data = get_courier_data(filters)
		courier_service_data = get_courier_service_data(filters)
		courier_payment_mode_data = get_courier_payment_mode_data(filters)
		delivery_mode_distribution = get_delivery_mode_distribution(filters)
		
		return {
			'kpi_data': kpi_data,
			'cost_center_summary': cost_center_summary,
			'journal_entries': journal_entries,
			'delivery_notes': delivery_notes,
			'top_customers': top_customers,
			'top_items': top_items,
			'books_by_cost_center': books_by_cost_center,
			'monthly_trend': monthly_trend,
			'expense_by_cost_center': expense_by_cost_center,
			'delivery_mode_data': delivery_mode_data,
			'courier_data': courier_data,
			'courier_service_data': courier_service_data,
			'courier_payment_mode_data': courier_payment_mode_data,
			'delivery_mode_distribution': delivery_mode_distribution
		}
	except Exception as e:
		error_msg = str(e)[:100] if len(str(e)) > 100 else str(e)
		frappe.log_error(f"get_courier_report_data error: {error_msg}", "Courier Report Error")
		return {'error': str(e)}

def get_kpi_data(filters):
	"""Get KPI summary data"""
	try:
		from_date = filters.get('from_date')
		to_date = filters.get('to_date')
		cost_centers = filters.get('cost_centers', [])
		
		# Build cost center filter
		cost_center_filter = ""
		if cost_centers:
			cost_center_list = "', '".join(cost_centers)
			cost_center_filter = f"AND jea.cost_center IN ('{cost_center_list}')"
		
		# Total Courier Expense from JV - Use Delivery Note posting date instead of JV posting date
		courier_expense_query = f"""
			SELECT COALESCE(SUM(jea.debit - jea.credit), 0) AS total_expense
			FROM `tabJournal Entry Account` jea
			JOIN `tabJournal Entry` je ON je.name = jea.parent
			LEFT JOIN `tabDelivery Note` dn ON dn.name = je.cheque_no
			WHERE je.docstatus = 1
			AND COALESCE(dn.posting_date, je.posting_date) BETWEEN %(from_date)s AND %(to_date)s
			AND (jea.account LIKE '%%Courier%%' OR jea.account LIKE '%%Courier Expense%%')
			{cost_center_filter}
		"""
		
		total_expense = frappe.db.sql(courier_expense_query, {
			'from_date': from_date,
			'to_date': to_date
		}, as_dict=True)
		total_courier_expense = flt(total_expense[0].total_expense) if total_expense else 0
		
		# Total No. of JVs Created for Courier - Use Delivery Note posting date instead of JV posting date
		jv_count_query = f"""
			SELECT COUNT(DISTINCT je.name) AS jv_count
			FROM `tabJournal Entry` je
			JOIN `tabJournal Entry Account` jea ON jea.parent = je.name
			LEFT JOIN `tabDelivery Note` dn ON dn.name = je.cheque_no
			WHERE je.docstatus = 1
			AND COALESCE(dn.posting_date, je.posting_date) BETWEEN %(from_date)s AND %(to_date)s
			AND (jea.account LIKE '%%Courier%%' OR jea.account LIKE '%%Courier Expense%%')
			{cost_center_filter}
		"""
		
		jv_count = frappe.db.sql(jv_count_query, {
			'from_date': from_date,
			'to_date': to_date
		}, as_dict=True)
		total_jvs = flt(jv_count[0].jv_count) if jv_count else 0
		
		# Build cost center filter for Delivery Notes
		# Show DNs with specified cost centers OR DNs without cost center
		dn_cost_center_filter = ""
		if cost_centers:
			cost_center_list = "', '".join(cost_centers)
			dn_cost_center_filter = f"AND (dn.cost_center IN ('{cost_center_list}') OR dn.cost_center IS NULL OR dn.cost_center = '')"
		
		# Total No. of Delivery Notes
		# Show all DNs in date range, even if cost center is not set
		# If cost centers are specified, filter by them. Otherwise, get all DNs
		dn_count_query = f"""
			SELECT COUNT(DISTINCT dn.name) AS dn_count
			FROM `tabDelivery Note` dn
			WHERE dn.docstatus = 1
			AND dn.posting_date BETWEEN %(from_date)s AND %(to_date)s
			{dn_cost_center_filter if cost_centers else ''}
		"""
		
		dn_count = frappe.db.sql(dn_count_query, {
			'from_date': from_date,
			'to_date': to_date
		}, as_dict=True)
		total_dns = flt(dn_count[0].dn_count) if dn_count else 0
		
		# Total Books Sent
		# Show all books from DNs in date range, even if cost center is not set
		books_query = f"""
			SELECT COALESCE(SUM(dni.qty), 0) AS total_books
			FROM `tabDelivery Note` dn
			JOIN `tabDelivery Note Item` dni ON dni.parent = dn.name
			WHERE dn.docstatus = 1
			AND dn.posting_date BETWEEN %(from_date)s AND %(to_date)s
			{dn_cost_center_filter if cost_centers else ''}
		"""
		
		books = frappe.db.sql(books_query, {
			'from_date': from_date,
			'to_date': to_date
		}, as_dict=True)
		total_books = flt(books[0].total_books) if books else 0
		
		# Average Cost Per Book
		avg_cost_per_book = total_courier_expense / total_books if total_books > 0 else 0
		
		# No. of Customers Served
		# Count all customers from DNs in date range, even if cost center is not set
		customers_query = f"""
			SELECT COUNT(DISTINCT dn.customer) AS customer_count
			FROM `tabDelivery Note` dn
			WHERE dn.docstatus = 1
			AND dn.posting_date BETWEEN %(from_date)s AND %(to_date)s
			AND dn.customer IS NOT NULL
			AND dn.customer != ''
			{dn_cost_center_filter if cost_centers else ''}
		"""
		
		customers = frappe.db.sql(customers_query, {
			'from_date': from_date,
			'to_date': to_date
		}, as_dict=True)
		total_customers = flt(customers[0].customer_count) if customers else 0
		
		# Cost Center Wise Allocation %
		cost_center_allocation = get_cost_center_allocation(filters, total_courier_expense)
		
		return {
			'total_courier_expense': total_courier_expense,
			'total_delivery_notes': total_dns,
			'total_books_sent': total_books,
			'total_jvs_created': total_jvs,
			'avg_cost_per_book': avg_cost_per_book,
			'total_customers_served': total_customers,
			'cost_center_allocation': cost_center_allocation
		}
	except Exception as e:
		frappe.log_error(f"Error in get_kpi_data: {str(e)}", "Courier Report Error")
		return {}

def get_cost_center_allocation(filters, total_expense):
	"""Get cost center wise allocation percentage"""
	try:
		from_date = filters.get('from_date')
		to_date = filters.get('to_date')
		cost_centers = filters.get('cost_centers', [])
		
		cost_center_filter = ""
		if cost_centers:
			cost_center_list = "', '".join(cost_centers)
			cost_center_filter = f"AND jea.cost_center IN ('{cost_center_list}')"
		
		query = f"""
			SELECT 
				jea.cost_center,
				COALESCE(SUM(jea.debit - jea.credit), 0) AS expense
			FROM `tabJournal Entry Account` jea
			JOIN `tabJournal Entry` je ON je.name = jea.parent
			LEFT JOIN `tabDelivery Note` dn ON dn.name = je.cheque_no
			WHERE je.docstatus = 1
			AND COALESCE(dn.posting_date, je.posting_date) BETWEEN %(from_date)s AND %(to_date)s
			AND (jea.account LIKE '%%Courier%%' OR jea.account LIKE '%%Courier Expense%%')
			AND jea.cost_center IS NOT NULL
			AND jea.cost_center != ''
			{cost_center_filter}
			GROUP BY jea.cost_center
		"""
		
		results = frappe.db.sql(query, {
			'from_date': from_date,
			'to_date': to_date
		}, as_dict=True)
		
		allocation = {}
		for row in results:
			percentage = (flt(row.expense) / total_expense * 100) if total_expense > 0 else 0
			allocation[row.cost_center] = {
				'expense': flt(row.expense),
				'percentage': percentage
			}
		
		return allocation
	except Exception as e:
		frappe.log_error(f"Error in get_cost_center_allocation: {str(e)}", "Courier Report Error")
		return {}

def get_cost_center_summary(filters):
	"""Get cost center wise summary table data"""
	try:
		from_date = filters.get('from_date')
		to_date = filters.get('to_date')
		cost_centers = filters.get('cost_centers', [])
		
		cost_center_filter = ""
		dn_cost_center_filter = ""
		if cost_centers:
			cost_center_list = "', '".join(cost_centers)
			cost_center_filter = f"AND jea.cost_center IN ('{cost_center_list}')"
			# For DNs: show specified cost centers OR DNs without cost center
			dn_cost_center_filter = f"AND (dn.cost_center IN ('{cost_center_list}') OR dn.cost_center IS NULL OR dn.cost_center = '')"
		
		# Get expense by cost center - Use Delivery Note posting date instead of JV posting date
		expense_query = f"""
			SELECT 
				jea.cost_center,
				COALESCE(SUM(jea.debit - jea.credit), 0) AS total_expense,
				COUNT(DISTINCT je.name) AS jv_count
			FROM `tabJournal Entry Account` jea
			JOIN `tabJournal Entry` je ON je.name = jea.parent
			LEFT JOIN `tabDelivery Note` dn ON dn.name = je.cheque_no
			WHERE je.docstatus = 1
			AND COALESCE(dn.posting_date, je.posting_date) BETWEEN %(from_date)s AND %(to_date)s
			AND (jea.account LIKE '%%Courier%%' OR jea.account LIKE '%%Courier Expense%%')
			AND jea.cost_center IS NOT NULL
			AND jea.cost_center != ''
			{cost_center_filter}
			GROUP BY jea.cost_center
		"""
		
		expense_data = frappe.db.sql(expense_query, {
			'from_date': from_date,
			'to_date': to_date
		}, as_dict=True)
		
		# Get delivery note data by cost center
		# Show all DNs, including those without cost center (grouped as 'Not Set')
		dn_query = f"""
			SELECT 
				COALESCE(dn.cost_center, 'Not Set') AS cost_center,
				COUNT(DISTINCT dn.name) AS dn_count,
				COALESCE(SUM(dni.qty), 0) AS books_sent
			FROM `tabDelivery Note` dn
			JOIN `tabDelivery Note Item` dni ON dni.parent = dn.name
			WHERE dn.docstatus = 1
			AND dn.posting_date BETWEEN %(from_date)s AND %(to_date)s
			{dn_cost_center_filter if cost_centers else ''}
			GROUP BY COALESCE(dn.cost_center, 'Not Set')
		"""
		
		dn_data = frappe.db.sql(dn_query, {
			'from_date': from_date,
			'to_date': to_date
		}, as_dict=True)
		
		# Combine data
		summary = {}
		
		# Initialize all filtered cost centers with zero values (so they appear even if no data)
		if cost_centers:
			for cc in cost_centers:
				if cc not in summary:
					summary[cc] = {
						'cost_center': cc,
						'total_expense': 0,
						'jv_count': 0,
						'dn_count': 0,
						'books_sent': 0,
						'avg_cost_per_book': 0
					}
		
		# Add expense data
		for row in expense_data:
			if row.cost_center not in summary:
				summary[row.cost_center] = {
					'cost_center': row.cost_center,
					'total_expense': flt(row.total_expense),
					'jv_count': flt(row.jv_count),
					'dn_count': 0,
					'books_sent': 0,
					'avg_cost_per_book': 0
				}
			else:
				summary[row.cost_center]['total_expense'] = flt(row.total_expense)
				summary[row.cost_center]['jv_count'] = flt(row.jv_count)
		
		# Add DN data
		for row in dn_data:
			# Skip "Not Set" cost centers
			if row.cost_center == 'Not Set':
				continue
			if row.cost_center not in summary:
				summary[row.cost_center] = {
					'cost_center': row.cost_center,
					'total_expense': 0,
					'jv_count': 0,
					'dn_count': flt(row.dn_count),
					'books_sent': flt(row.books_sent),
					'avg_cost_per_book': 0
				}
			else:
				summary[row.cost_center]['dn_count'] = flt(row.dn_count)
				summary[row.cost_center]['books_sent'] = flt(row.books_sent)
		
		# Calculate avg cost per book
		for cost_center in summary:
			if summary[cost_center]['books_sent'] > 0:
				summary[cost_center]['avg_cost_per_book'] = (
					summary[cost_center]['total_expense'] / summary[cost_center]['books_sent']
				)
		
		# Filter out "Not Set" from final results
		result = [row for row in summary.values() if row.get('cost_center') != 'Not Set']
		return result
	except Exception as e:
		frappe.log_error(f"Error in get_cost_center_summary: {str(e)}", "Courier Report Error")
		return []

def get_journal_entries(filters):
	"""Get detailed journal entries for courier expense"""
	try:
		from_date = filters.get('from_date')
		to_date = filters.get('to_date')
		cost_centers = filters.get('cost_centers', [])
		customer = filters.get('customer')
		
		cost_center_filter = ""
		if cost_centers:
			cost_center_list = "', '".join(cost_centers)
			cost_center_filter = f"AND jea.cost_center IN ('{cost_center_list}')"
		
		customer_filter = ""
		if customer:
			customer_filter = "AND jea.party = %(customer)s"
		
		query = f"""
			SELECT 
				COALESCE(dn.posting_date, je.posting_date) AS posting_date,
				je.name AS jv_number,
				jea.cost_center,
				(jea.debit - jea.credit) AS expense_amount,
				je.remark AS remarks,
				je.owner AS created_by
			FROM `tabJournal Entry Account` jea
			JOIN `tabJournal Entry` je ON je.name = jea.parent
			LEFT JOIN `tabDelivery Note` dn ON dn.name = je.cheque_no
			WHERE je.docstatus = 1
			AND COALESCE(dn.posting_date, je.posting_date) BETWEEN %(from_date)s AND %(to_date)s
			AND (jea.account LIKE '%%Courier%%' OR jea.account LIKE '%%Courier Expense%%')
			AND jea.cost_center IS NOT NULL
			AND jea.cost_center != ''
			{cost_center_filter}
			{customer_filter}
			ORDER BY COALESCE(dn.posting_date, je.posting_date) DESC, je.name DESC
		"""
		
		params = {
			'from_date': from_date,
			'to_date': to_date
		}
		if customer:
			params['customer'] = customer
		
		results = frappe.db.sql(query, params, as_dict=True)
		
		# Format created_by to show user name
		for row in results:
			row['expense_amount'] = flt(row['expense_amount'])
			row['created_by_name'] = frappe.db.get_value('User', row['created_by'], 'full_name') or row['created_by']
		
		return results
	except Exception as e:
		frappe.log_error(f"Error in get_journal_entries: {str(e)}", "Courier Report Error")
		return []

def get_delivery_notes(filters):
	"""Get detailed delivery notes"""
	try:
		from_date = filters.get('from_date')
		to_date = filters.get('to_date')
		cost_centers = filters.get('cost_centers', [])
		customer = filters.get('customer')
		
		cost_center_filter = ""
		if cost_centers:
			cost_center_list = "', '".join(cost_centers)
			# Show DNs with specified cost centers OR DNs without cost center (NULL)
			cost_center_filter = f"AND (dn.cost_center IN ('{cost_center_list}') OR dn.cost_center IS NULL OR dn.cost_center = '')"
		
		customer_filter = ""
		if customer:
			customer_filter = "AND dn.customer = %(customer)s"
		
		query = f"""
			SELECT 
				dn.posting_date,
				dn.name AS delivery_note_no,
				dn.customer,
				COALESCE(dn.cost_center, 'Not Set') AS cost_center,
				COALESCE(SUM(dni.qty), 0) AS total_books,
				dn.owner AS created_by,
				dn.custom_delivery_mode,
				COALESCE((
					SELECT SUM(tc.amount)
					FROM `tabTransport Charges` tc
					WHERE tc.parent = dn.name 
					AND tc.parenttype = 'Delivery Note' 
					AND tc.parentfield = 'custom_transport_charges'
				), 0) AS transport_charges
			FROM `tabDelivery Note` dn
			JOIN `tabDelivery Note Item` dni ON dni.parent = dn.name
			WHERE dn.docstatus = 1
			AND dn.posting_date BETWEEN %(from_date)s AND %(to_date)s
			{cost_center_filter}
			{customer_filter}
			GROUP BY dn.name
			ORDER BY dn.posting_date DESC, dn.name DESC
		"""
		
		params = {
			'from_date': from_date,
			'to_date': to_date
		}
		if customer:
			params['customer'] = customer
		
		results = frappe.db.sql(query, params, as_dict=True)
		
		# Format created_by to show user name - show all delivery notes including those without cost center
		filtered_results = []
		for row in results:
			row['total_books'] = flt(row['total_books'])
			row['transport_charges'] = flt(row.get('transport_charges', 0))
			row['created_by_name'] = frappe.db.get_value('User', row['created_by'], 'full_name') or row['created_by']
			row['customer_name'] = frappe.db.get_value('Customer', row['customer'], 'customer_name') or row['customer']
			filtered_results.append(row)
		
		return filtered_results
	except Exception as e:
		frappe.log_error(f"Error in get_delivery_notes: {str(e)}", "Courier Report Error")
		return []

def get_top_customers(filters, limit=10):
	"""Get top 10 customers by books sent"""
	try:
		from_date = filters.get('from_date')
		to_date = filters.get('to_date')
		cost_centers = filters.get('cost_centers', [])
		
		cost_center_filter = ""
		if cost_centers:
			cost_center_list = "', '".join(cost_centers)
			# Show customers from DNs with specified cost centers OR DNs without cost center
			cost_center_filter = f"AND (dn.cost_center IN ('{cost_center_list}') OR dn.cost_center IS NULL OR dn.cost_center = '')"
		
		query = f"""
			SELECT 
				dn.customer,
				COALESCE(SUM(dni.qty), 0) AS books_sent
			FROM `tabDelivery Note` dn
			JOIN `tabDelivery Note Item` dni ON dni.parent = dn.name
			WHERE dn.docstatus = 1
			AND dn.posting_date BETWEEN %(from_date)s AND %(to_date)s
			AND dn.customer IS NOT NULL
			AND dn.customer != ''
			{cost_center_filter}
			GROUP BY dn.customer
			ORDER BY books_sent DESC
			LIMIT {limit}
		"""
		
		results = frappe.db.sql(query, {
			'from_date': from_date,
			'to_date': to_date
		}, as_dict=True)
		
		# Add customer names
		for row in results:
			row['books_sent'] = flt(row['books_sent'])
			row['customer_name'] = frappe.db.get_value('Customer', row['customer'], 'customer_name') or row['customer']
		
		return results
	except Exception as e:
		frappe.log_error(f"Error in get_top_customers: {str(e)}", "Courier Report Error")
		return []

def get_top_items(filters, limit=10):
	"""Get top 10 items sent by quantity"""
	try:
		from_date = filters.get('from_date')
		to_date = filters.get('to_date')
		cost_centers = filters.get('cost_centers', [])
		
		cost_center_filter = ""
		if cost_centers:
			cost_center_list = "', '".join(cost_centers)
			# Show items from DNs with specified cost centers OR DNs without cost center
			cost_center_filter = f"AND (dn.cost_center IN ('{cost_center_list}') OR dn.cost_center IS NULL OR dn.cost_center = '')"
		
		query = f"""
			SELECT 
				dni.item_code,
				COALESCE(SUM(dni.qty), 0) AS qty
			FROM `tabDelivery Note Item` dni
			JOIN `tabDelivery Note` dn ON dn.name = dni.parent
			WHERE dn.docstatus = 1
			AND dn.posting_date BETWEEN %(from_date)s AND %(to_date)s
			AND dni.item_code IS NOT NULL
			AND dni.item_code != ''
			{cost_center_filter}
			GROUP BY dni.item_code
			ORDER BY qty DESC
			LIMIT {limit}
		"""
		
		results = frappe.db.sql(query, {
			'from_date': from_date,
			'to_date': to_date
		}, as_dict=True)
		
		# Add item names
		for row in results:
			row['qty'] = flt(row['qty'])
			row['item_name'] = frappe.db.get_value('Item', row['item_code'], 'item_name') or row['item_code']
		
		return results
	except Exception as e:
		frappe.log_error(f"Error in get_top_items: {str(e)}", "Courier Report Error")
		return []

def get_books_by_cost_center(filters):
	"""Get books sent by cost center for chart"""
	try:
		from_date = filters.get('from_date')
		to_date = filters.get('to_date')
		cost_centers = filters.get('cost_centers', [])
		
		cost_center_filter = ""
		if cost_centers:
			cost_center_list = "', '".join(cost_centers)
			# Show books from DNs with specified cost centers OR DNs without cost center
			cost_center_filter = f"AND (dn.cost_center IN ('{cost_center_list}') OR dn.cost_center IS NULL OR dn.cost_center = '')"
		
		query = f"""
			SELECT 
				COALESCE(dn.cost_center, 'Not Set') AS cost_center,
				COALESCE(SUM(dni.qty), 0) AS books_sent
			FROM `tabDelivery Note` dn
			JOIN `tabDelivery Note Item` dni ON dni.parent = dn.name
			WHERE dn.docstatus = 1
			AND dn.posting_date BETWEEN %(from_date)s AND %(to_date)s
			{cost_center_filter}
			GROUP BY COALESCE(dn.cost_center, 'Not Set')
			ORDER BY books_sent DESC
		"""
		
		results = frappe.db.sql(query, {
			'from_date': from_date,
			'to_date': to_date
		}, as_dict=True)
		
		# Filter out "Not Set" cost centers
		filtered_results = []
		for row in results:
			if row.get('cost_center') == 'Not Set':
				continue
			row['books_sent'] = flt(row['books_sent'])
			filtered_results.append(row)
		
		return filtered_results
	except Exception as e:
		frappe.log_error(f"Error in get_books_by_cost_center: {str(e)}", "Courier Report Error")
		return []

def get_monthly_trend(filters):
	"""Get monthly courier and transport expense trend"""
	try:
		from_date = filters.get('from_date')
		to_date = filters.get('to_date')
		cost_centers = filters.get('cost_centers', [])
		
		cost_center_filter = ""
		if cost_centers:
			cost_center_list = "', '".join(cost_centers)
			cost_center_filter = f"AND jea.cost_center IN ('{cost_center_list}')"
		
		# Get courier expenses from Journal Entries
		query = f"""
			SELECT 
				DATE_FORMAT(COALESCE(dn.posting_date, je.posting_date), '%%Y-%%m') AS date,
				COALESCE(SUM(jea.debit - jea.credit), 0) AS expense
			FROM `tabJournal Entry Account` jea
			JOIN `tabJournal Entry` je ON je.name = jea.parent
			LEFT JOIN `tabDelivery Note` dn ON dn.name = je.cheque_no
			WHERE je.docstatus = 1
			AND COALESCE(dn.posting_date, je.posting_date) BETWEEN %(from_date)s AND %(to_date)s
			AND (jea.account LIKE '%%Courier%%' OR jea.account LIKE '%%Courier Expense%%')
			{cost_center_filter}
			GROUP BY DATE_FORMAT(COALESCE(dn.posting_date, je.posting_date), '%%Y-%%m')
			ORDER BY DATE_FORMAT(COALESCE(dn.posting_date, je.posting_date), '%%Y-%%m') ASC
		"""
		
		courier_results = frappe.db.sql(query, {
			'from_date': from_date,
			'to_date': to_date
		}, as_dict=True)
		
		# Get transport charges from Transport Charges child table
		cost_center_filter_transport = ""
		if cost_centers:
			cost_center_list = "', '".join(cost_centers)
			cost_center_filter_transport = f"AND dn.cost_center IN ('{cost_center_list}')"
		
		transport_query = f"""
			SELECT 
				DATE_FORMAT(dn.posting_date, '%%Y-%%m') AS date,
				COALESCE(SUM(tc.amount), 0) AS expense
			FROM `tabDelivery Note` dn
			JOIN `tabTransport Charges` tc ON tc.parent = dn.name 
				AND tc.parenttype = 'Delivery Note' 
				AND tc.parentfield = 'custom_transport_charges'
			WHERE dn.docstatus = 1
			AND dn.posting_date BETWEEN %(from_date)s AND %(to_date)s
			AND dn.custom_delivery_mode = 'Transport'
			{cost_center_filter_transport}
			GROUP BY DATE_FORMAT(dn.posting_date, '%%Y-%%m')
			ORDER BY DATE_FORMAT(dn.posting_date, '%%Y-%%m') ASC
		"""
		
		transport_results = frappe.db.sql(transport_query, {
			'from_date': from_date,
			'to_date': to_date
		}, as_dict=True)
		
		# Combine courier and transport expenses by date
		expense_dict = {}
		for row in courier_results:
			date = str(row.get('date', ''))
			if date:
				expense_dict[date] = flt(row.get('expense', 0))
		
		for row in transport_results:
			date = str(row.get('date', ''))
			if date:
				if date in expense_dict:
					expense_dict[date] += flt(row.get('expense', 0))
				else:
					expense_dict[date] = flt(row.get('expense', 0))
		
		# Convert back to list format
		results = []
		for date, expense in sorted(expense_dict.items()):
			results.append({
				'date': date,
				'expense': flt(expense) or 0
			})
		
		return results
	except Exception as e:
		frappe.log_error(f"Error in get_monthly_trend: {str(e)}", "Courier Report Error")
		return []

def get_expense_by_cost_center(filters):
	"""Get expense by cost center for bar chart (includes courier and transport)"""
	try:
		from_date = filters.get('from_date')
		to_date = filters.get('to_date')
		cost_centers = filters.get('cost_centers', [])
		
		cost_center_filter = ""
		if cost_centers:
			cost_center_list = "', '".join(cost_centers)
			cost_center_filter = f"AND jea.cost_center IN ('{cost_center_list}')"
		
		# Get courier expenses from Journal Entries
		query = f"""
			SELECT 
				jea.cost_center,
				COALESCE(SUM(jea.debit - jea.credit), 0) AS expense
			FROM `tabJournal Entry Account` jea
			JOIN `tabJournal Entry` je ON je.name = jea.parent
			LEFT JOIN `tabDelivery Note` dn ON dn.name = je.cheque_no
			WHERE je.docstatus = 1
			AND COALESCE(dn.posting_date, je.posting_date) BETWEEN %(from_date)s AND %(to_date)s
			AND (jea.account LIKE '%%Courier%%' OR jea.account LIKE '%%Courier Expense%%')
			AND jea.cost_center IS NOT NULL
			AND jea.cost_center != ''
			{cost_center_filter}
			GROUP BY jea.cost_center
			ORDER BY expense DESC
		"""
		
		courier_results = frappe.db.sql(query, {
			'from_date': from_date,
			'to_date': to_date
		}, as_dict=True)
		
		# Get transport charges from Transport Charges child table
		cost_center_filter_transport = ""
		if cost_centers:
			cost_center_list = "', '".join(cost_centers)
			cost_center_filter_transport = f"AND dn.cost_center IN ('{cost_center_list}')"
		
		transport_query = f"""
			SELECT 
				dn.cost_center,
				COALESCE(SUM(tc.amount), 0) AS expense
			FROM `tabDelivery Note` dn
			JOIN `tabTransport Charges` tc ON tc.parent = dn.name 
				AND tc.parenttype = 'Delivery Note' 
				AND tc.parentfield = 'custom_transport_charges'
			WHERE dn.docstatus = 1
			AND dn.posting_date BETWEEN %(from_date)s AND %(to_date)s
			AND dn.custom_delivery_mode = 'Transport'
			AND dn.cost_center IS NOT NULL
			AND dn.cost_center != ''
			{cost_center_filter_transport}
			GROUP BY dn.cost_center
			ORDER BY expense DESC
		"""
		
		transport_results = frappe.db.sql(transport_query, {
			'from_date': from_date,
			'to_date': to_date
		}, as_dict=True)
		
		# Combine courier and transport expenses by cost center
		expense_dict = {}
		for row in courier_results:
			cost_center = row.get('cost_center')
			if cost_center:
				expense_dict[cost_center] = flt(row.get('expense', 0))
		
		for row in transport_results:
			cost_center = row.get('cost_center')
			if cost_center:
				if cost_center in expense_dict:
					expense_dict[cost_center] += flt(row.get('expense', 0))
				else:
					expense_dict[cost_center] = flt(row.get('expense', 0))
		
		# Convert back to list format
		results = []
		for cost_center, expense in sorted(expense_dict.items(), key=lambda x: x[1], reverse=True):
			results.append({
				'cost_center': cost_center,
				'expense': flt(expense)
			})
		
		return results
	except Exception as e:
		frappe.log_error(f"Error in get_expense_by_cost_center: {str(e)}", "Courier Report Error")
		return []

@frappe.whitelist()
def get_cost_centers():
	"""Get list of cost centers for filter"""
	try:
		# Get cost centers that have courier expenses or delivery notes
		# Include cost center number for matching
		cost_centers = frappe.db.sql("""
			SELECT DISTINCT 
				cc.name AS cost_center,
				cc.cost_center_number,
				cc.cost_center_name
			FROM (
				SELECT DISTINCT cost_center FROM `tabJournal Entry Account`
				WHERE cost_center IS NOT NULL AND cost_center != ''
				UNION
				SELECT DISTINCT cost_center FROM `tabDelivery Note`
				WHERE cost_center IS NOT NULL AND cost_center != ''
			) AS combined
			JOIN `tabCost Center` cc ON cc.name = combined.cost_center
			WHERE cc.name IS NOT NULL
			ORDER BY cc.cost_center_number, cc.name
		""", as_dict=True)
		
		# Return list of cost center names
		return [cc['cost_center'] for cc in cost_centers]
	except Exception as e:
		frappe.log_error(f"Error in get_cost_centers: {str(e)}", "Courier Report Error")
		return []

def get_delivery_mode_data(filters):
	"""Get delivery mode distribution expense amounts (includes courier and transport)"""
	try:
		from_date = filters.get('from_date')
		to_date = filters.get('to_date')
		cost_centers = filters.get('cost_centers', [])
		
		cost_center_filter = ""
		if cost_centers:
			cost_center_list = "', '".join(cost_centers)
			cost_center_filter = f"AND jea.cost_center IN ('{cost_center_list}')"
		
		# Get courier expenses from Journal Entries
		query = f"""
			SELECT 
				COALESCE(dn.custom_delivery_mode, 'Not Set') AS delivery_mode,
				COALESCE(SUM(jea.debit - jea.credit), 0) AS expense_amount
			FROM `tabJournal Entry Account` jea
			JOIN `tabJournal Entry` je ON je.name = jea.parent
			LEFT JOIN `tabDelivery Note` dn ON dn.name = je.cheque_no
			WHERE je.docstatus = 1
			AND COALESCE(dn.posting_date, je.posting_date) BETWEEN %(from_date)s AND %(to_date)s
			AND (jea.account LIKE '%%Courier%%' OR jea.account LIKE '%%Courier Expense%%')
			{cost_center_filter}
			GROUP BY COALESCE(dn.custom_delivery_mode, 'Not Set')
			ORDER BY expense_amount DESC
		"""
		
		courier_results = frappe.db.sql(query, {
			'from_date': from_date,
			'to_date': to_date
		}, as_dict=True)
		
		# Get transport charges from Transport Charges child table
		cost_center_filter_transport = ""
		if cost_centers:
			cost_center_list = "', '".join(cost_centers)
			cost_center_filter_transport = f"AND dn.cost_center IN ('{cost_center_list}')"
		
		transport_query = f"""
			SELECT 
				'Transport' AS delivery_mode,
				COALESCE(SUM(tc.amount), 0) AS expense_amount
			FROM `tabDelivery Note` dn
			JOIN `tabTransport Charges` tc ON tc.parent = dn.name 
				AND tc.parenttype = 'Delivery Note' 
				AND tc.parentfield = 'custom_transport_charges'
			WHERE dn.docstatus = 1
			AND dn.posting_date BETWEEN %(from_date)s AND %(to_date)s
			AND dn.custom_delivery_mode = 'Transport'
			{cost_center_filter_transport}
		"""
		
		transport_result = frappe.db.sql(transport_query, {
			'from_date': from_date,
			'to_date': to_date
		}, as_dict=True)
		
		# Combine courier and transport expenses by delivery mode
		expense_dict = {}
		for row in courier_results:
			mode = row.get('delivery_mode') or 'Not Set'
			expense_dict[mode] = flt(row.get('expense_amount', 0))
		
		# Add transport charges to Transport mode
		if transport_result and transport_result[0].get('expense_amount', 0) > 0:
			transport_amount = flt(transport_result[0].get('expense_amount', 0))
			if 'Transport' in expense_dict:
				expense_dict['Transport'] += transport_amount
			else:
				expense_dict['Transport'] = transport_amount
		
		# Convert to filtered results format
		filtered_results = []
		for mode, expense in sorted(expense_dict.items(), key=lambda x: x[1], reverse=True):
			if mode == 'Not Set' and len(expense_dict) > 1:
				continue
			filtered_results.append({
				'label': mode or 'Not Set',
				'value': flt(expense)
			})
		
		return filtered_results
	except Exception as e:
		frappe.log_error(f"Error in get_delivery_mode_data: {str(e)}", "Courier Report Error")
		return []

def get_delivery_mode_distribution(filters):
	"""Get delivery mode distribution from Delivery Notes (by count and books)"""
	try:
		from_date = filters.get('from_date')
		to_date = filters.get('to_date')
		customer = filters.get('customer')
		
		# First, check if there are any delivery notes in the date range
		check_query = """
			SELECT COUNT(*) as count
			FROM `tabDelivery Note` dn
			WHERE dn.docstatus = 1
			AND dn.posting_date BETWEEN %(from_date)s AND %(to_date)s
		"""
		check_params = {'from_date': from_date, 'to_date': to_date}
		if customer:
			check_query += " AND dn.customer = %(customer)s"
			check_params['customer'] = customer
		
		check_result = frappe.db.sql(check_query, check_params, as_dict=True)
		total_dns = check_result[0].count if check_result else 0
		
		# Debug logging removed - use print() for debugging if needed
		# print(f"Delivery Mode Distribution - Total DNs: {total_dns}")
		
		customer_filter = ""
		if customer:
			customer_filter = "AND dn.customer = %(customer)s"
		
		# Simplified query - remove HAVING clause as it's redundant
		query = f"""
			SELECT 
				COALESCE(NULLIF(dn.custom_delivery_mode, ''), 'Not Set') AS delivery_mode,
				COUNT(DISTINCT dn.name) AS delivery_note_count,
				COALESCE(SUM(COALESCE(dni.qty, 0)), 0) AS total_books,
				COALESCE(SUM(COALESCE((
					SELECT SUM(tc.amount)
					FROM `tabTransport Charges` tc
					WHERE tc.parent = dn.name 
					AND tc.parenttype = 'Delivery Note' 
					AND tc.parentfield = 'custom_transport_charges'
				), 0)), 0) AS total_transport_charges
			FROM `tabDelivery Note` dn
			LEFT JOIN `tabDelivery Note Item` dni ON dni.parent = dn.name
			WHERE dn.docstatus = 1
			AND dn.posting_date BETWEEN %(from_date)s AND %(to_date)s
			{customer_filter}
			GROUP BY COALESCE(NULLIF(dn.custom_delivery_mode, ''), 'Not Set')
			ORDER BY delivery_note_count DESC
		"""
		
		params = {
			'from_date': from_date,
			'to_date': to_date
		}
		if customer:
			params['customer'] = customer
		
		results = frappe.db.sql(query, params, as_dict=True)
		
		# Debug logging removed - use print() for debugging if needed
		# print(f"Query Results: {len(results)} modes found")
		
		# Format results
		formatted_results = []
		for row in results:
			delivery_mode = row.get('delivery_mode')
			if not delivery_mode or delivery_mode == '':
				delivery_mode = 'Not Set'
			
			delivery_note_count = cint(row.get('delivery_note_count', 0))
			# Include all results, even if count is 0 (shouldn't happen but just in case)
			formatted_results.append({
				'label': delivery_mode,
				'delivery_note_count': delivery_note_count,
				'total_books': flt(row.get('total_books', 0)),
				'total_transport_charges': flt(row.get('total_transport_charges', 0))
			})
		
		# Filter out entries with 0 count only if we have other entries
		if len(formatted_results) > 1:
			formatted_results = [r for r in formatted_results if r['delivery_note_count'] > 0]
		
		# If we have delivery notes but no results, it means all have NULL/empty delivery_mode
		# In that case, ensure we return at least one "Not Set" entry
		if total_dns > 0 and len(formatted_results) == 0:
			# Re-run query to get the count for "Not Set"
			not_set_query = f"""
				SELECT 
					COUNT(DISTINCT dn.name) AS delivery_note_count,
					COALESCE(SUM(COALESCE(dni.qty, 0)), 0) AS total_books,
					COALESCE(SUM(COALESCE((
						SELECT SUM(tc.amount)
						FROM `tabTransport Charges` tc
						WHERE tc.parent = dn.name 
						AND tc.parenttype = 'Delivery Note' 
						AND tc.parentfield = 'custom_transport_charges'
					), 0)), 0) AS total_transport_charges
				FROM `tabDelivery Note` dn
				LEFT JOIN `tabDelivery Note Item` dni ON dni.parent = dn.name
				WHERE dn.docstatus = 1
				AND dn.posting_date BETWEEN %(from_date)s AND %(to_date)s
				AND (dn.custom_delivery_mode IS NULL OR dn.custom_delivery_mode = '')
				{customer_filter}
			"""
			not_set_result = frappe.db.sql(not_set_query, params, as_dict=True)
			if not_set_result and not_set_result[0].get('delivery_note_count', 0) > 0:
				formatted_results.append({
					'label': 'Not Set',
					'delivery_note_count': cint(not_set_result[0].get('delivery_note_count', 0)),
					'total_books': flt(not_set_result[0].get('total_books', 0)),
					'total_transport_charges': flt(not_set_result[0].get('total_transport_charges', 0))
				})
		
		# Debug logging removed - use print() for debugging if needed
		# print(f"Formatted Results: {len(formatted_results)} modes")
		
		return formatted_results
	except Exception as e:
		import traceback
		error_msg = str(e)[:100] if len(str(e)) > 100 else str(e)
		frappe.log_error(f"get_delivery_mode_distribution error: {error_msg}", "Courier Report Error")
		# Log full traceback separately if needed
		traceback_str = traceback.format_exc()
		if len(traceback_str) > 500:
			traceback_str = traceback_str[:500] + "... (truncated)"
		frappe.log_error(f"Traceback: {traceback_str}", "Courier Report Error")
		return []

def get_courier_data(filters):
	"""Get courier distribution expense amounts from Journal Entries"""
	try:
		from_date = filters.get('from_date')
		to_date = filters.get('to_date')
		cost_centers = filters.get('cost_centers', [])
		
		cost_center_filter = ""
		if cost_centers:
			cost_center_list = "', '".join(cost_centers)
			cost_center_filter = f"AND jea.cost_center IN ('{cost_center_list}')"
		
		query = f"""
			SELECT 
				COALESCE(dn.custom_courier, 'Not Set') AS courier,
				COALESCE(SUM(jea.debit - jea.credit), 0) AS expense_amount
			FROM `tabJournal Entry Account` jea
			JOIN `tabJournal Entry` je ON je.name = jea.parent
			LEFT JOIN `tabDelivery Note` dn ON dn.name = je.cheque_no
			WHERE je.docstatus = 1
			AND COALESCE(dn.posting_date, je.posting_date) BETWEEN %(from_date)s AND %(to_date)s
			AND (jea.account LIKE '%%Courier%%' OR jea.account LIKE '%%Courier Expense%%')
			{cost_center_filter}
			GROUP BY COALESCE(dn.custom_courier, 'Not Set')
			ORDER BY expense_amount DESC
		"""
		
		results = frappe.db.sql(query, {
			'from_date': from_date,
			'to_date': to_date
		}, as_dict=True)
		
		# Filter out "Not Set" if there are other values
		filtered_results = []
		for row in results:
			if row.get('courier') == 'Not Set' and len(results) > 1:
				continue
			filtered_results.append({
				'label': row.get('courier') or 'Not Set',
				'value': flt(row.get('expense_amount', 0))
			})
		
		return filtered_results
	except Exception as e:
		frappe.log_error(f"Error in get_courier_data: {str(e)}", "Courier Report Error")
		return []

def get_courier_service_data(filters):
	"""Get courier service distribution expense amounts from Journal Entries"""
	try:
		from_date = filters.get('from_date')
		to_date = filters.get('to_date')
		cost_centers = filters.get('cost_centers', [])
		
		cost_center_filter = ""
		if cost_centers:
			cost_center_list = "', '".join(cost_centers)
			cost_center_filter = f"AND jea.cost_center IN ('{cost_center_list}')"
		
		query = f"""
			SELECT 
				COALESCE(dn.custom_courier_service, 'Not Set') AS courier_service,
				COALESCE(SUM(jea.debit - jea.credit), 0) AS expense_amount
			FROM `tabJournal Entry Account` jea
			JOIN `tabJournal Entry` je ON je.name = jea.parent
			LEFT JOIN `tabDelivery Note` dn ON dn.name = je.cheque_no
			WHERE je.docstatus = 1
			AND COALESCE(dn.posting_date, je.posting_date) BETWEEN %(from_date)s AND %(to_date)s
			AND (jea.account LIKE '%%Courier%%' OR jea.account LIKE '%%Courier Expense%%')
			{cost_center_filter}
			GROUP BY COALESCE(dn.custom_courier_service, 'Not Set')
			ORDER BY expense_amount DESC
		"""
		
		results = frappe.db.sql(query, {
			'from_date': from_date,
			'to_date': to_date
		}, as_dict=True)
		
		# Filter out "Not Set" if there are other values
		filtered_results = []
		for row in results:
			if row.get('courier_service') == 'Not Set' and len(results) > 1:
				continue
			filtered_results.append({
				'label': row.get('courier_service') or 'Not Set',
				'value': flt(row.get('expense_amount', 0))
			})
		
		return filtered_results
	except Exception as e:
		frappe.log_error(f"Error in get_courier_service_data: {str(e)}", "Courier Report Error")
		return []

def get_courier_payment_mode_data(filters):
	"""Get courier payment mode distribution expense amounts from Journal Entries"""
	try:
		from_date = filters.get('from_date')
		to_date = filters.get('to_date')
		cost_centers = filters.get('cost_centers', [])
		
		cost_center_filter = ""
		if cost_centers:
			cost_center_list = "', '".join(cost_centers)
			cost_center_filter = f"AND jea.cost_center IN ('{cost_center_list}')"
		
		query = f"""
			SELECT 
				COALESCE(dn.custom_courier_mode_of_payment, 'Not Set') AS payment_mode,
				COALESCE(SUM(jea.debit - jea.credit), 0) AS expense_amount
			FROM `tabJournal Entry Account` jea
			JOIN `tabJournal Entry` je ON je.name = jea.parent
			LEFT JOIN `tabDelivery Note` dn ON dn.name = je.cheque_no
			WHERE je.docstatus = 1
			AND COALESCE(dn.posting_date, je.posting_date) BETWEEN %(from_date)s AND %(to_date)s
			AND (jea.account LIKE '%%Courier%%' OR jea.account LIKE '%%Courier Expense%%')
			{cost_center_filter}
			GROUP BY COALESCE(dn.custom_courier_mode_of_payment, 'Not Set')
			ORDER BY expense_amount DESC
		"""
		
		results = frappe.db.sql(query, {
			'from_date': from_date,
			'to_date': to_date
		}, as_dict=True)
		
		# Filter out "Not Set" if there are other values
		filtered_results = []
		for row in results:
			if row.get('payment_mode') == 'Not Set' and len(results) > 1:
				continue
			filtered_results.append({
				'label': row.get('payment_mode') or 'Not Set',
				'value': flt(row.get('expense_amount', 0))
			})
		
		return filtered_results
	except Exception as e:
		frappe.log_error(f"Error in get_courier_payment_mode_data: {str(e)}", "Courier Report Error")
		return []

@frappe.whitelist()
def get_customers():
	"""Get list of customers for filter"""
	try:
		customers = frappe.db.sql("""
			SELECT DISTINCT name, customer_name
			FROM `tabCustomer`
			WHERE disabled = 0
			ORDER BY customer_name
		""", as_dict=True)
		
		return customers
	except Exception as e:
		frappe.log_error(f"Error in get_customers: {str(e)}", "Courier Report Error")
		return []

