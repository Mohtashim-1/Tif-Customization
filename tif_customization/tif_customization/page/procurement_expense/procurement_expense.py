import frappe
from frappe import _
from frappe.utils import flt, getdate, today, add_days, get_first_day, get_last_day
from datetime import datetime, timedelta
from calendar import monthrange

@frappe.whitelist()
def get_procurement_expense_data(filters=None):
	"""Main API endpoint to get procurement expense data"""
	try:
		if isinstance(filters, str):
			import json
			filters = json.loads(filters)
		elif not filters:
			filters = {}
		
		# Set default date range if not provided
		period_type = filters.get('period_type', 'monthly')  # monthly, quarterly, yearly
		
		if not filters.get('from_date'):
			filters['from_date'] = get_first_day(today())
		if not filters.get('to_date'):
			filters['to_date'] = get_last_day(today())
		
		# Get expense data
		expense_data = get_expense_by_period(filters, period_type)
		summary_data = get_summary_data(filters)
		
		return {
			'expense_data': expense_data,
			'summary_data': summary_data,
			'period_type': period_type
		}
	except Exception as e:
		frappe.log_error(f"Error in get_procurement_expense_data: {str(e)}", "Procurement Expense Error")
		return {'error': str(e)}

def get_expense_by_period(filters, period_type='monthly'):
	"""Get expense data grouped by period and department/cost center"""
	try:
		from_date = filters.get('from_date')
		to_date = filters.get('to_date')
		cost_centers = filters.get('cost_centers', [])
		
		# Debug: Log the date range being used
		frappe.log_error(f"Procurement Expense Query - From: {from_date}, To: {to_date}, Period: {period_type}", "Procurement Expense Debug")
		
		# Build cost center/department filter
		mr_cost_center_filter = ""
		po_cost_center_filter = ""
		if cost_centers and len(cost_centers) > 0:
			# Escape single quotes in cost center names
			escaped_centers = [cc.replace("'", "''") for cc in cost_centers]
			cost_center_list = "', '".join(escaped_centers)
			mr_cost_center_filter = f"AND COALESCE(NULLIF(mr.custom_department, ''), NULLIF(mri.cost_center, ''), NULLIF(mr.cost_center, ''), 'Not Set') IN ('{cost_center_list}')"
			
			# Check if PO has custom_department field
			has_custom_dept = frappe.db.has_column('Purchase Order', 'custom_department')
			if has_custom_dept:
				po_cost_center_filter = f"AND COALESCE(NULLIF(po.custom_department, ''), NULLIF(poi.cost_center, ''), NULLIF(po.cost_center, ''), 'Not Set') IN ('{cost_center_list}')"
			else:
				po_cost_center_filter = f"AND COALESCE(NULLIF(poi.cost_center, ''), NULLIF(po.cost_center, ''), 'Not Set') IN ('{cost_center_list}')"
		
		# Get Material Request expenses - use custom_department if available, else cost_center
		mr_query = f"""
			SELECT 
				mr.transaction_date,
				COALESCE(
					NULLIF(mr.custom_department, ''),
					NULLIF(mri.cost_center, ''),
					NULLIF(mr.cost_center, ''),
					'Not Set'
				) AS cost_center,
				SUM(mri.amount) AS amount,
				SUM(mri.base_amount) AS base_amount,
				COUNT(DISTINCT mr.name) AS mr_count
			FROM `tabMaterial Request` mr
			JOIN `tabMaterial Request Item` mri ON mri.parent = mr.name
			WHERE mr.docstatus = 1
			AND mr.transaction_date BETWEEN %(from_date)s AND %(to_date)s
			AND mr.material_request_type = 'Purchase'
			{mr_cost_center_filter}
			GROUP BY mr.transaction_date, COALESCE(
				NULLIF(mr.custom_department, ''),
				NULLIF(mri.cost_center, ''),
				NULLIF(mr.cost_center, ''),
				'Not Set'
			)
		"""
		
		mr_results = frappe.db.sql(mr_query, {
			'from_date': from_date,
			'to_date': to_date
		}, as_dict=True)
		
		# Debug: Log MR results count
		frappe.log_error(f"MR Results Count: {len(mr_results)}", "Procurement Expense Debug")
		
		# Get Purchase Order expenses - use custom_department if available, else cost_center
		# Check if custom_department column exists in PO
		has_custom_dept = False
		try:
			has_custom_dept = frappe.db.has_column('Purchase Order', 'custom_department')
		except:
			pass
		
		if has_custom_dept:
			po_dept_field = "COALESCE(NULLIF(po.custom_department, ''), NULLIF(poi.cost_center, ''), NULLIF(po.cost_center, ''), 'Not Set')"
		else:
			po_dept_field = "COALESCE(NULLIF(poi.cost_center, ''), NULLIF(po.cost_center, ''), 'Not Set')"
		
		# Use transaction_date if available, else use creation date
		po_query = f"""
			SELECT 
				COALESCE(po.transaction_date, po.creation) AS transaction_date,
				{po_dept_field} AS cost_center,
				SUM(poi.amount) AS amount,
				SUM(poi.base_amount) AS base_amount,
				COUNT(DISTINCT po.name) AS po_count
			FROM `tabPurchase Order` po
			JOIN `tabPurchase Order Item` poi ON poi.parent = po.name
			WHERE po.docstatus = 1
			AND COALESCE(po.transaction_date, po.creation) BETWEEN %(from_date)s AND %(to_date)s
			{po_cost_center_filter}
			GROUP BY COALESCE(po.transaction_date, po.creation), {po_dept_field}
		"""
		
		po_results = frappe.db.sql(po_query, {
			'from_date': from_date,
			'to_date': to_date
		}, as_dict=True)
		
		# Debug: Log PO results count
		frappe.log_error(f"PO Results Count: {len(po_results)}, Has custom_department: {has_custom_dept}", "Procurement Expense Debug")
		
		# Combine and group by period
		combined_data = {}
		
		# Process MR data
		for row in mr_results:
			period_key = get_period_key(row['transaction_date'], period_type)
			cost_center = row['cost_center']
			key = f"{period_key}_{cost_center}"
			
			if key not in combined_data:
				combined_data[key] = {
					'period': period_key,
					'cost_center': cost_center,
					'mr_amount': 0,
					'po_amount': 0,
					'total_amount': 0,
					'mr_count': 0,
					'po_count': 0
				}
			
			combined_data[key]['mr_amount'] += flt(row['base_amount'])
			combined_data[key]['total_amount'] += flt(row['base_amount'])
			combined_data[key]['mr_count'] += row['mr_count']
		
		# Process PO data
		for row in po_results:
			period_key = get_period_key(row['transaction_date'], period_type)
			cost_center = row['cost_center']
			key = f"{period_key}_{cost_center}"
			
			if key not in combined_data:
				combined_data[key] = {
					'period': period_key,
					'cost_center': cost_center,
					'mr_amount': 0,
					'po_amount': 0,
					'total_amount': 0,
					'mr_count': 0,
					'po_count': 0
				}
			
			combined_data[key]['po_amount'] += flt(row['base_amount'])
			combined_data[key]['total_amount'] += flt(row['base_amount'])
			combined_data[key]['po_count'] += row['po_count']
		
		# Convert to list and sort
		result = list(combined_data.values())
		result.sort(key=lambda x: (x['period'], x['cost_center']))
		
		# Get department/cost center names
		for row in result:
			if row['cost_center'] != 'Not Set':
				# Try to get department name first, then cost center name
				dept_name = None
				try:
					dept_name = frappe.db.get_value('Department', row['cost_center'], 'department_name') or row['cost_center']
				except:
					pass
				
				if not dept_name:
					try:
						dept_name = frappe.db.get_value('Cost Center', row['cost_center'], 'cost_center_name') or row['cost_center']
					except:
						dept_name = row['cost_center']
				
				row['cost_center_name'] = dept_name
			else:
				row['cost_center_name'] = 'Not Set'
		
		return result
	except Exception as e:
		frappe.log_error(f"Error in get_expense_by_period: {str(e)}", "Procurement Expense Error")
		return []

def get_period_key(date, period_type):
	"""Get period key based on period type"""
	if isinstance(date, str):
		date = getdate(date)
	
	if period_type == 'monthly':
		return date.strftime('%Y-%m')
	elif period_type == 'quarterly':
		quarter = (date.month - 1) // 3 + 1
		return f"{date.year}-Q{quarter}"
	elif period_type == 'yearly':
		return str(date.year)
	else:
		return date.strftime('%Y-%m')

def get_summary_data(filters):
	"""Get summary data by cost center"""
	try:
		from_date = filters.get('from_date')
		to_date = filters.get('to_date')
		cost_centers = filters.get('cost_centers', [])
		
		# Build cost center/department filter for summary
		mr_summary_filter = ""
		po_summary_filter = ""
		if cost_centers and len(cost_centers) > 0:
			# Escape single quotes in cost center names
			escaped_centers = [cc.replace("'", "''") for cc in cost_centers]
			cost_center_list = "', '".join(escaped_centers)
			mr_summary_filter = f"AND COALESCE(NULLIF(mr.custom_department, ''), NULLIF(mri.cost_center, ''), NULLIF(mr.cost_center, ''), 'Not Set') IN ('{cost_center_list}')"
			
			# Check if PO has custom_department field
			has_custom_dept = frappe.db.has_column('Purchase Order', 'custom_department')
			if has_custom_dept:
				po_summary_filter = f"AND COALESCE(NULLIF(po.custom_department, ''), NULLIF(poi.cost_center, ''), NULLIF(po.cost_center, ''), 'Not Set') IN ('{cost_center_list}')"
			else:
				po_summary_filter = f"AND COALESCE(NULLIF(poi.cost_center, ''), NULLIF(po.cost_center, ''), 'Not Set') IN ('{cost_center_list}')"
		
		# Get MR summary - use custom_department if available
		mr_summary_query = f"""
			SELECT 
				COALESCE(
					NULLIF(mr.custom_department, ''),
					NULLIF(mri.cost_center, ''),
					NULLIF(mr.cost_center, ''),
					'Not Set'
				) AS cost_center,
				SUM(mri.base_amount) AS total_amount,
				COUNT(DISTINCT mr.name) AS mr_count
			FROM `tabMaterial Request` mr
			JOIN `tabMaterial Request Item` mri ON mri.parent = mr.name
			WHERE mr.docstatus = 1
			AND mr.transaction_date BETWEEN %(from_date)s AND %(to_date)s
			AND mr.material_request_type = 'Purchase'
			{mr_summary_filter}
			GROUP BY COALESCE(
				NULLIF(mr.custom_department, ''),
				NULLIF(mri.cost_center, ''),
				NULLIF(mr.cost_center, ''),
				'Not Set'
			)
		"""
		
		mr_summary = frappe.db.sql(mr_summary_query, {
			'from_date': from_date,
			'to_date': to_date
		}, as_dict=True)
		
		# Get PO summary - use custom_department if available
		has_custom_dept = frappe.db.has_column('Purchase Order', 'custom_department')
		
		if has_custom_dept:
			po_summary_dept_field = "COALESCE(NULLIF(po.custom_department, ''), NULLIF(poi.cost_center, ''), NULLIF(po.cost_center, ''), 'Not Set')"
		else:
			po_summary_dept_field = "COALESCE(NULLIF(poi.cost_center, ''), NULLIF(po.cost_center, ''), 'Not Set')"
		
		po_summary_query = f"""
			SELECT 
				{po_summary_dept_field} AS cost_center,
				SUM(poi.base_amount) AS total_amount,
				COUNT(DISTINCT po.name) AS po_count
			FROM `tabPurchase Order` po
			JOIN `tabPurchase Order Item` poi ON poi.parent = po.name
			WHERE po.docstatus = 1
			AND COALESCE(po.transaction_date, po.creation) BETWEEN %(from_date)s AND %(to_date)s
			{po_summary_filter}
			GROUP BY {po_summary_dept_field}
		"""
		
		po_summary = frappe.db.sql(po_summary_query, {
			'from_date': from_date,
			'to_date': to_date
		}, as_dict=True)
		
		# Combine summaries
		summary_dict = {}
		
		for row in mr_summary:
			cc = row['cost_center']
			if cc not in summary_dict:
				summary_dict[cc] = {
					'cost_center': cc,
					'mr_amount': 0,
					'po_amount': 0,
					'total_amount': 0,
					'mr_count': 0,
					'po_count': 0
				}
			summary_dict[cc]['mr_amount'] = flt(row['total_amount'])
			summary_dict[cc]['total_amount'] += flt(row['total_amount'])
			summary_dict[cc]['mr_count'] = row['mr_count']
		
		for row in po_summary:
			cc = row['cost_center']
			if cc not in summary_dict:
				summary_dict[cc] = {
					'cost_center': cc,
					'mr_amount': 0,
					'po_amount': 0,
					'total_amount': 0,
					'mr_count': 0,
					'po_count': 0
				}
			summary_dict[cc]['po_amount'] = flt(row['total_amount'])
			summary_dict[cc]['total_amount'] += flt(row['total_amount'])
			summary_dict[cc]['po_count'] = row['po_count']
		
		# Convert to list and get department/cost center names
		result = list(summary_dict.values())
		for row in result:
			if row['cost_center'] != 'Not Set':
				# Try to get department name first, then cost center name
				dept_name = None
				try:
					dept_name = frappe.db.get_value('Department', row['cost_center'], 'department_name') or row['cost_center']
				except:
					pass
				
				if not dept_name:
					try:
						dept_name = frappe.db.get_value('Cost Center', row['cost_center'], 'cost_center_name') or row['cost_center']
					except:
						dept_name = row['cost_center']
				
				row['cost_center_name'] = dept_name
			else:
				row['cost_center_name'] = 'Not Set'
		
		result.sort(key=lambda x: x['total_amount'], reverse=True)
		
		return result
	except Exception as e:
		frappe.log_error(f"Error in get_summary_data: {str(e)}", "Procurement Expense Error")
		return []

