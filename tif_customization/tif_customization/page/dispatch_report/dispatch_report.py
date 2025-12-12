import frappe
from frappe import _
from frappe.utils import flt, getdate, today, add_days

@frappe.whitelist()
def get_dispatch_report_data(filters=None):
	"""Main API endpoint to get dispatch report data"""
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
		
		# Get dispatch data
		dispatch_data = get_dispatch_data(filters)
		
		return {
			'dispatch_data': dispatch_data
		}
	except Exception as e:
		frappe.log_error(f"Error in get_dispatch_report_data: {str(e)}", "Dispatch Report Error")
		return {'error': str(e)}

def get_dispatch_data(filters):
	"""Get delivery notes with filters"""
	try:
		from_date = filters.get('from_date')
		to_date = filters.get('to_date')
		customer = filters.get('customer')
		book = filters.get('book')  # item_code
		city = filters.get('city')
		province = filters.get('province')
		area = filters.get('area')
		book_type = filters.get('book_type')  # MQH or Qaida
		
		# Build filters
		where_conditions = [
			"dn.docstatus = 1",
			"dn.posting_date BETWEEN %(from_date)s AND %(to_date)s"
		]
		
		params = {
			'from_date': from_date,
			'to_date': to_date
		}
		
		# Customer filter
		if customer:
			where_conditions.append("dn.customer = %(customer)s")
			params['customer'] = customer
		
		# City filter
		if city:
			where_conditions.append("dn.custom_city = %(city)s")
			params['city'] = city
		
		# Book/Item filter
		if book:
			where_conditions.append("dni.item_code = %(book)s")
			params['book'] = book
		
		# Book type filter (MQH/Qaida) - check item name or item_group
		if book_type:
			if book_type == 'MQH':
				where_conditions.append("(dni.item_name LIKE %(mqh_pattern)s OR dni.item_code LIKE %(mqh_pattern)s)")
				params['mqh_pattern'] = '%MQH%'
			elif book_type == 'Qaida':
				where_conditions.append("(dni.item_name LIKE %(qaida_pattern)s OR dni.item_code LIKE %(qaida_pattern)s)")
				params['qaida_pattern'] = '%Qaida%'
		
		# Province and Area filters (need address join, so add to conditions)
		if province:
			where_conditions.append("(addr.state = %(province)s OR addr.state IS NULL)")
			params['province'] = province
		
		if area:
			where_conditions.append("(addr.county = %(area)s OR addr.county IS NULL)")
			params['area'] = area
		
		where_clause = " AND ".join(where_conditions)
		
		# Main query - get delivery notes with items
		query = f"""
			SELECT 
				dn.name AS delivery_note_no,
				dn.posting_date,
				dn.customer,
				dn.customer_name,
				dn.custom_city AS city,
				COALESCE(addr.state, '') AS province,
				COALESCE(addr.county, '') AS area,
				dni.item_code,
				dni.item_name,
				dni.qty,
				dni.stock_uom,
				dn.owner AS created_by,
				dn.creation
			FROM `tabDelivery Note` dn
			JOIN `tabDelivery Note Item` dni ON dni.parent = dn.name
			LEFT JOIN `tabAddress` addr ON (
				addr.name = dn.shipping_address_name 
				OR addr.name = dn.customer_address
			)
			WHERE {where_clause}
		"""
		
		query += " ORDER BY dn.posting_date DESC, dn.name DESC, dni.idx ASC"
		
		results = frappe.db.sql(query, params, as_dict=True)
		
		# Format and enrich data
		for row in results:
			# Format numeric values
			row['qty'] = flt(row['qty'])
			
			# Get created by name
			row['created_by_name'] = frappe.db.get_value('User', row['created_by'], 'full_name') or row['created_by']
			
			# Determine book type from item name/code
			item_name = (row.get('item_name') or '').upper()
			item_code = (row.get('item_code') or '').upper()
			if 'MQH' in item_name or 'MQH' in item_code:
				row['book_type'] = 'MQH'
			elif 'QAIDA' in item_name or 'QAIDA' in item_code:
				row['book_type'] = 'Qaida'
			else:
				row['book_type'] = 'Other'
		
		return results
	except Exception as e:
		frappe.log_error(f"Error in get_dispatch_data: {str(e)}", "Dispatch Report Error")
		return []

@frappe.whitelist()
def get_filter_options():
	"""Get options for filters"""
	try:
		# Get unique cities
		cities = frappe.db.sql("""
			SELECT DISTINCT custom_city AS city
			FROM `tabDelivery Note`
			WHERE custom_city IS NOT NULL AND custom_city != ''
			ORDER BY custom_city ASC
		""", as_dict=True)
		
		# Get unique provinces from addresses
		provinces = frappe.db.sql("""
			SELECT DISTINCT state AS province
			FROM `tabAddress`
			WHERE state IS NOT NULL AND state != ''
			ORDER BY state ASC
		""", as_dict=True)
		
		# Get unique areas (county) from addresses
		areas = frappe.db.sql("""
			SELECT DISTINCT county AS area
			FROM `tabAddress`
			WHERE county IS NOT NULL AND county != ''
			ORDER BY county ASC
		""", as_dict=True)
		
		return {
			'cities': [c['city'] for c in cities],
			'provinces': [p['province'] for p in provinces],
			'areas': [a['area'] for a in areas]
		}
	except Exception as e:
		frappe.log_error(f"Error in get_filter_options: {str(e)}", "Dispatch Report Error")
		return {
			'cities': [],
			'provinces': [],
			'areas': []
		}

