import frappe
from frappe import _
from frappe.utils import flt, getdate, today, add_days

from tif_customization.tif_customization.utils.supply_chain_books import (
	sql_book_item_filter,
	with_book_item_params,
)

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
		from_date = filters.get('from_date')
		if not from_date or from_date == '':
			filters['from_date'] = add_days(today(), -30)
		else:
			# Ensure date is in proper format
			filters['from_date'] = getdate(from_date)
		
		to_date = filters.get('to_date')
		if not to_date or to_date == '':
			filters['to_date'] = today()
		else:
			# Ensure date is in proper format
			filters['to_date'] = getdate(to_date)
		
		# Get dispatch data
		dispatch_data = get_dispatch_data(filters)
		
		# Get summary/KPI data
		summary_data = get_summary_data(filters, dispatch_data)
		
		return {
			'dispatch_data': dispatch_data,
			'summary_data': summary_data
		}
	except Exception as e:
		frappe.log_error(f"Error in get_dispatch_report_data: {str(e)}", "Dispatch Report Error")
		return {'error': str(e)}

def get_dispatch_data(filters):
	"""Get delivery notes with filters"""
	try:
		from_date = filters.get('from_date')
		to_date = filters.get('to_date')
		
		# Dates should already be date objects from get_dispatch_report_data, but ensure they are
		if from_date:
			from_date = getdate(from_date)
		if to_date:
			to_date = getdate(to_date)
		
		customer = filters.get('customer')
		book = filters.get('book')  # item_code
		city = filters.get('city')
		province = filters.get('province')
		area = filters.get('area')
		country = filters.get('country')
		book_type = filters.get('book_type')  # MQH or Qaida
		
		# Build filters — books only (Certificate / General Items excluded)
		where_conditions = [
			"dn.docstatus = 1",
			"dn.posting_date BETWEEN %(from_date)s AND %(to_date)s",
			sql_book_item_filter("dni.item_code").lstrip("AND ").strip(),
		]
		
		params = with_book_item_params({
			'from_date': from_date,
			'to_date': to_date
		})
		
		# Customer filter
		if customer:
			where_conditions.append("dn.customer = %(customer)s")
			params['customer'] = customer
		
		# City filter (from address)
		if city:
			where_conditions.append("(addr.city = %(city)s OR addr.city IS NULL)")
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
			where_conditions.append("(addr.custom_area = %(area)s OR addr.custom_area IS NULL)")
			params['area'] = area
		
		if country:
			where_conditions.append("(addr.country = %(country)s OR addr.country IS NULL)")
			params['country'] = country
		
		where_clause = " AND ".join(where_conditions)
		
		# Main query - get delivery notes with items
		query = f"""
			SELECT 
				dn.name AS delivery_note_no,
				dn.posting_date,
				dn.customer,
				dn.customer_name,
				COALESCE(addr.city, '') AS city,
				COALESCE(addr.state, '') AS province,
				COALESCE(addr.custom_area, '') AS area,
				COALESCE(addr.country, '') AS country,
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

def get_summary_data(filters, dispatch_data):
	"""Calculate summary/KPI data from dispatch data"""
	try:
		if not dispatch_data:
			return {
				'total_quantity': 0,
				'total_delivery_notes': 0,
				'unique_customers': 0,
				'unique_items': 0,
				'mqh_quantity': 0,
				'qaida_quantity': 0,
				'other_quantity': 0
			}
		
		# Calculate totals
		total_quantity = sum(flt(row.get('qty', 0)) for row in dispatch_data)
		
		# Count unique delivery notes
		unique_delivery_notes = len(set(row.get('delivery_note_no') for row in dispatch_data if row.get('delivery_note_no')))
		
		# Count unique customers
		unique_customers = len(set(row.get('customer') for row in dispatch_data if row.get('customer')))
		
		# Count unique items
		unique_items = len(set(row.get('item_code') for row in dispatch_data if row.get('item_code')))
		
		# Calculate quantities by book type
		mqh_quantity = sum(flt(row.get('qty', 0)) for row in dispatch_data if row.get('book_type') == 'MQH')
		qaida_quantity = sum(flt(row.get('qty', 0)) for row in dispatch_data if row.get('book_type') == 'Qaida')
		other_quantity = sum(flt(row.get('qty', 0)) for row in dispatch_data if row.get('book_type') == 'Other')
		
		return {
			'total_quantity': flt(total_quantity),
			'total_delivery_notes': unique_delivery_notes,
			'unique_customers': unique_customers,
			'unique_items': unique_items,
			'mqh_quantity': flt(mqh_quantity),
			'qaida_quantity': flt(qaida_quantity),
			'other_quantity': flt(other_quantity)
		}
	except Exception as e:
		frappe.log_error(f"Error in get_summary_data: {str(e)}", "Dispatch Report Error")
		return {
			'total_quantity': 0,
			'total_delivery_notes': 0,
			'unique_customers': 0,
			'unique_items': 0,
			'mqh_quantity': 0,
			'qaida_quantity': 0,
			'other_quantity': 0
		}

@frappe.whitelist()
def get_filter_options():
	"""Get options for filters"""
	try:
		# Get unique cities from addresses
		cities = frappe.db.sql("""
			SELECT DISTINCT city
			FROM `tabAddress`
			WHERE city IS NOT NULL AND city != ''
			ORDER BY city ASC
		""", as_dict=True)
		
		# Get unique provinces from addresses
		provinces = frappe.db.sql("""
			SELECT DISTINCT state AS province
			FROM `tabAddress`
			WHERE state IS NOT NULL AND state != ''
			ORDER BY state ASC
		""", as_dict=True)
		
		# Get unique areas (custom_area) from addresses
		areas = frappe.db.sql("""
			SELECT DISTINCT custom_area AS area
			FROM `tabAddress`
			WHERE custom_area IS NOT NULL AND custom_area != ''
			ORDER BY custom_area ASC
		""", as_dict=True)
		
		# Get unique countries from addresses
		countries = frappe.db.sql("""
			SELECT DISTINCT country
			FROM `tabAddress`
			WHERE country IS NOT NULL AND country != ''
			ORDER BY country ASC
		""", as_dict=True)
		
		return {
			'cities': [c['city'] for c in cities],
			'provinces': [p['province'] for p in provinces],
			'areas': [a['area'] for a in areas],
			'countries': [co['country'] for co in countries]
		}
	except Exception as e:
		frappe.log_error(f"Error in get_filter_options: {str(e)}", "Dispatch Report Error")
		return {
			'cities': [],
			'provinces': [],
			'areas': [],
			'countries': []
		}

