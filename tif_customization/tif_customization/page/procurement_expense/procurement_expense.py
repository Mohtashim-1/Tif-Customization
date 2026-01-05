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
		item_data = get_item_wise_data(filters)
		department_data = get_department_wise_data(filters)
		payment_result = get_payment_entry_details(filters)
		item_payment_data = get_item_payment_details(filters)
		department_payment_data = get_department_payment_data(filters)
		
		# Handle payment_data structure (can be dict with summary/details or list)
		if isinstance(payment_result, dict) and 'summary' in payment_result:
			payment_data = payment_result['summary']
			not_specified_details = payment_result.get('not_specified_details', [])
		else:
			payment_data = payment_result if isinstance(payment_result, list) else []
			not_specified_details = []
		
		voucher_wise_details = get_voucher_wise_details(filters)
		
		# Get MR, PO, and Pending Acknowledgement counts
		mr_po_counts = get_mr_po_acknowledgment_counts(filters)
		
		return {
			'expense_data': expense_data,
			'summary_data': summary_data,
			'item_data': item_data,
			'department_data': department_data,
			'payment_data': payment_data,
			'not_specified_details': not_specified_details,
			'item_payment_data': item_payment_data,
			'department_payment_data': department_payment_data,
			'voucher_wise_details': voucher_wise_details,
			'period_type': period_type,
			'mr_count': mr_po_counts.get('mr_count', 0),
			'po_count': mr_po_counts.get('po_count', 0),
			'pending_acknowledgment_count': mr_po_counts.get('pending_acknowledgment_count', 0)
		}
	except Exception as e:
		frappe.log_error(f"Error in get_procurement_expense_data: {str(e)}", "Procurement Expense Error")
		return {'error': str(e)}

def get_expense_by_period(filters, period_type='monthly'):
	"""Get Purchase Invoice expense data grouped by period and department/cost center"""
	try:
		from_date = filters.get('from_date')
		to_date = filters.get('to_date')
		cost_centers = filters.get('cost_centers', [])
		
		# Build cost center expressions
		pi_cc_expr = _build_pi_cc_expr()
		
		# Build cost center filter
		pi_filter_sql, pi_filter_params = _build_in_filter_sql(pi_cc_expr, cost_centers)
		
		# Get PI amount expression
		pi_amt_expr = _get_pi_amount_expr()
		
		# Query Purchase Invoices
		pi_query = f"""
			SELECT 
				COALESCE(pi.posting_date, DATE(pi.creation)) AS transaction_date,
				{pi_cc_expr} AS cost_center,
				SUM({pi_amt_expr}) AS base_amount,
				COUNT(DISTINCT pi.name) AS pi_count
			FROM `tabPurchase Invoice` pi
			JOIN `tabPurchase Invoice Item` pii ON pii.parent = pi.name
			WHERE pi.docstatus = 1
			AND COALESCE(pi.posting_date, DATE(pi.creation)) BETWEEN %(from_date)s AND %(to_date)s
			{pi_filter_sql}
			GROUP BY COALESCE(pi.posting_date, DATE(pi.creation)), {pi_cc_expr}
		"""
		
		params = {
			'from_date': from_date,
			'to_date': to_date,
			**pi_filter_params
		}
		
		pi_results = frappe.db.sql(pi_query, params, as_dict=True)
		
		# Group by period
		combined_data = {}
		
		# Process PI data
		for row in pi_results:
			period_key = get_period_key(row.get('transaction_date'), period_type)
			cost_center = row.get('cost_center') or 'Not Set'
			key = f"{period_key}_{cost_center}"
			
			if key not in combined_data:
				combined_data[key] = {
					'period': period_key,
					'cost_center': cost_center,
					'po_amount': 0,
					'po_count': 0
				}
			
			combined_data[key]['po_amount'] += flt(row.get('base_amount') or 0)
			combined_data[key]['po_count'] += row.get('pi_count') or 0
		
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
def _build_mr_cc_expr():
	# Material Request: cost_center is usually NOT on parent, only on items
	parts = ["NULLIF(mr.custom_department, '')", "NULLIF(mri.cost_center, '')"]

	# only add mr.cost_center if column exists (some custom implementations may add it)
	try:
		if frappe.db.has_column("Material Request", "cost_center"):
			parts.append("NULLIF(mr.cost_center, '')")
	except Exception:
		pass

	parts.append("'Not Set'")
	return f"COALESCE({', '.join(parts)})"


def _build_po_cc_expr():
	# Purchase Order: cost_center may exist on parent; custom_department is optional
	parts = []

	try:
		if frappe.db.has_column("Purchase Order", "custom_department"):
			parts.append("NULLIF(po.custom_department, '')")
	except Exception:
		pass

	parts.append("NULLIF(poi.cost_center, '')")

	try:
		if frappe.db.has_column("Purchase Order", "cost_center"):
			parts.append("NULLIF(po.cost_center, '')")
	except Exception:
		pass

	parts.append("'Not Set'")
	return f"COALESCE({', '.join(parts)})"


def _build_in_filter_sql(expr, values):
	# values is list of strings
	if not values:
		return "", {}

	# parameterized placeholders to avoid injection
	placeholders = []
	params = {}
	for i, v in enumerate(values):
		k = f"cc_{i}"
		placeholders.append(f"%({k})s")
		params[k] = v

	return f" AND {expr} IN ({', '.join(placeholders)})", params


def _get_mr_amount_expr():
	"""Get Material Request Item amount expression, checking for column existence"""
	# Different ERPNext versions: base_amount may not exist on MR Item
	try:
		if frappe.db.has_column("Material Request Item", "base_amount"):
			return "mri.base_amount"
	except Exception:
		pass

	try:
		if frappe.db.has_column("Material Request Item", "amount"):
			return "mri.amount"
	except Exception:
		pass

	# fallback: qty * rate
	return "(COALESCE(mri.qty,0) * COALESCE(mri.rate,0))"


def _get_po_amount_expr():
	"""Get Purchase Order Item amount expression, checking for column existence"""
	# PO item base_amount usually exists, but check to be safe
	try:
		if frappe.db.has_column("Purchase Order Item", "base_amount"):
			return "poi.base_amount"
	except Exception:
		pass

	try:
		if frappe.db.has_column("Purchase Order Item", "amount"):
			return "poi.amount"
	except Exception:
		pass

	# fallback: qty * rate
	return "(COALESCE(poi.qty,0) * COALESCE(poi.rate,0))"

def _build_pi_cc_expr():
	"""Build cost center expression for Purchase Invoice"""
	# Purchase Invoice: cost_center may exist on parent; custom_department is optional
	parts = []

	try:
		if frappe.db.has_column("Purchase Invoice", "custom_department"):
			parts.append("NULLIF(pi.custom_department, '')")
	except Exception:
		pass

	parts.append("NULLIF(pii.cost_center, '')")

	try:
		if frappe.db.has_column("Purchase Invoice", "cost_center"):
			parts.append("NULLIF(pi.cost_center, '')")
	except Exception:
		pass

	parts.append("'Not Set'")
	return f"COALESCE({', '.join(parts)})"

def _get_pi_amount_expr():
	"""Get Purchase Invoice Item amount expression, checking for column existence"""
	# PI item base_amount usually exists, but check to be safe
	try:
		if frappe.db.has_column("Purchase Invoice Item", "base_amount"):
			return "pii.base_amount"
	except Exception:
		pass

	try:
		if frappe.db.has_column("Purchase Invoice Item", "amount"):
			return "pii.amount"
	except Exception:
		pass

	# fallback: qty * rate
	return "(COALESCE(pii.qty,0) * COALESCE(pii.rate,0))"

import frappe
from frappe.utils import flt

def get_summary_data(filters):
	"""Get summary data by cost center / department from Purchase Invoices"""
	try:
		from_date = filters.get('from_date')
		to_date = filters.get('to_date')
		cost_centers = filters.get('cost_centers', []) or []

		# Build cost center expressions
		pi_cc_expr = _build_pi_cc_expr()
		pi_filter_sql, pi_filter_params = _build_in_filter_sql(pi_cc_expr, cost_centers)

		# Get PI amount expression
		pi_amt_expr = _get_pi_amount_expr()

		# Query Purchase Invoices
		pi_summary_query = f"""
			SELECT
				{pi_cc_expr} AS cost_center,
				SUM({pi_amt_expr}) AS po_amount,
				COUNT(DISTINCT pi.name) AS po_count
			FROM `tabPurchase Invoice` pi
			JOIN `tabPurchase Invoice Item` pii ON pii.parent = pi.name
			WHERE pi.docstatus = 1
			AND COALESCE(pi.posting_date, DATE(pi.creation)) BETWEEN %(from_date)s AND %(to_date)s
			{pi_filter_sql}
			GROUP BY {pi_cc_expr}
		"""

		params = {
			'from_date': from_date,
			'to_date': to_date,
			**pi_filter_params
		}

		po_summary = frappe.db.sql(pi_summary_query, params, as_dict=True)

		# Build summary dict
		summary_dict = {}

		for row in po_summary:
			cc = row.get("cost_center") or "Not Set"
			if cc not in summary_dict:
				summary_dict[cc] = {
					'cost_center': cc,
					'po_amount': 0,
					'po_count': 0
				}
			summary_dict[cc]['po_amount'] = flt(row.get('po_amount'))
			summary_dict[cc]['po_count'] = row.get('po_count') or 0

		# Convert to list + attach names
		result = list(summary_dict.values())

		for row in result:
			cc = row.get("cost_center")
			if cc and cc != "Not Set":
				name = None
				parent_cost_center = None
				parent_cost_center_name = None

				# try Department (name is usually docname)
				try:
					name = frappe.db.get_value("Department", cc, "department_name")
				except Exception:
					pass

				# try Cost Center
				if not name:
					try:
						name = frappe.db.get_value("Cost Center", cc, "cost_center_name")
					except Exception:
						pass
				
				# Get parent cost center (department)
				try:
					parent_cost_center = frappe.db.get_value("Cost Center", cc, "parent_cost_center")
					if parent_cost_center:
						parent_cost_center_name = frappe.db.get_value("Cost Center", parent_cost_center, "cost_center_name")
				except Exception:
					pass

				row["cost_center_name"] = name or cc
				row["parent_cost_center"] = parent_cost_center or None
				row["parent_cost_center_name"] = parent_cost_center_name or None
			else:
				row["cost_center_name"] = "Not Set"
				row["parent_cost_center"] = None
				row["parent_cost_center_name"] = None

		result.sort(key=lambda x: x.get('po_amount', 0), reverse=True)
		return result

	except Exception as e:
		frappe.log_error(f"Error in get_summary_data: {str(e)}", "Procurement Expense Error")
		return []


@frappe.whitelist()
def get_item_wise_data(filters=None):
	"""Get expense data grouped by item from Purchase Invoices"""
	try:
		if isinstance(filters, str):
			import json
			filters = json.loads(filters)
		elif not filters:
			filters = {}
		
		from_date = filters.get('from_date')
		to_date = filters.get('to_date')
		cost_centers = filters.get('cost_centers', []) or []
		
		# Build cost center filter
		pi_cc_expr = _build_pi_cc_expr()
		pi_filter_sql, pi_filter_params = _build_in_filter_sql(pi_cc_expr, cost_centers)
		
		# Get PI amount expression
		pi_amt_expr = _get_pi_amount_expr()
		
		query = f"""
			SELECT
				pii.item_code,
				pii.item_name,
				SUM({pi_amt_expr}) AS po_amount,
				COUNT(DISTINCT pi.name) AS po_count
			FROM `tabPurchase Invoice` pi
			JOIN `tabPurchase Invoice Item` pii ON pii.parent = pi.name
			WHERE pi.docstatus = 1
			AND COALESCE(pi.posting_date, DATE(pi.creation)) BETWEEN %(from_date)s AND %(to_date)s
			{pi_filter_sql}
			GROUP BY pii.item_code, pii.item_name
			ORDER BY SUM({pi_amt_expr}) DESC
			LIMIT 50
		"""
		
		params = {
			'from_date': from_date,
			'to_date': to_date,
			**pi_filter_params
		}
		
		results = frappe.db.sql(query, params, as_dict=True)
		
		return results
	
	except Exception as e:
		frappe.log_error(f"Error in get_item_wise_data: {str(e)}", "Procurement Expense Error")
		return []


@frappe.whitelist()
def get_department_wise_data(filters=None):
	"""Get expense data grouped by department from Purchase Invoices"""
	try:
		if isinstance(filters, str):
			import json
			filters = json.loads(filters)
		elif not filters:
			filters = {}
		
		from_date = filters.get('from_date')
		to_date = filters.get('to_date')
		cost_centers = filters.get('cost_centers', []) or []
		
		# Build department filter - get from custom_department or cost center
		has_custom_dept = frappe.db.has_column('Purchase Invoice', 'custom_department')
		
		dept_filter_sql = ""
		dept_filter_params = {}
		if cost_centers:
			# Filter by cost centers but group by department
			pi_cc_expr = _build_pi_cc_expr()
			dept_filter_sql, dept_filter_params = _build_in_filter_sql(pi_cc_expr, cost_centers)
		
		# Get PI amount expression
		pi_amt_expr = _get_pi_amount_expr()
		
		# Build department expression - use JOIN instead of subquery to avoid alias issues
		if has_custom_dept:
			pi_dept_expr = "COALESCE(NULLIF(pi.custom_department, ''), NULLIF(cc.parent_cost_center, ''), 'Not Set')"
			join_clause = "LEFT JOIN `tabCost Center` cc ON cc.name = COALESCE(NULLIF(pii.cost_center, ''), NULLIF(pi.cost_center, ''))"
		else:
			pi_dept_expr = "COALESCE(NULLIF(cc.parent_cost_center, ''), 'Not Set')"
			join_clause = "LEFT JOIN `tabCost Center` cc ON cc.name = COALESCE(NULLIF(pii.cost_center, ''), NULLIF(pi.cost_center, ''))"
		
		query = f"""
			SELECT
				{pi_dept_expr} AS department,
				SUM({pi_amt_expr}) AS po_amount,
				COUNT(DISTINCT pi.name) AS po_count
			FROM `tabPurchase Invoice` pi
			JOIN `tabPurchase Invoice Item` pii ON pii.parent = pi.name
			{join_clause}
			WHERE pi.docstatus = 1
			AND COALESCE(pi.posting_date, DATE(pi.creation)) BETWEEN %(from_date)s AND %(to_date)s
			{dept_filter_sql}
			GROUP BY {pi_dept_expr}
			HAVING {pi_dept_expr} != 'Not Set'
			ORDER BY SUM({pi_amt_expr}) DESC
		"""
		
		params = {
			'from_date': from_date,
			'to_date': to_date,
			**dept_filter_params
		}
		
		results = frappe.db.sql(query, params, as_dict=True)
		
		# Get department names
		for row in results:
			if row.get('department') and row['department'] != 'Not Set':
				try:
					dept_name = frappe.db.get_value('Department', row['department'], 'department_name')
					row['department_name'] = dept_name or row['department']
				except:
					row['department_name'] = row['department']
			else:
				row['department_name'] = 'Not Set'
		
		return results
	
	except Exception as e:
		frappe.log_error(f"Error in get_department_wise_data: {str(e)}", "Procurement Expense Error")
		return []

@frappe.whitelist()
def get_payment_entry_details(filters=None):
	"""Get Payment Entry details for Purchase Invoices - Mode of Payment breakdown"""
	try:
		if isinstance(filters, str):
			import json
			filters = json.loads(filters)
		elif not filters:
			filters = {}
		
		from_date = filters.get('from_date')
		to_date = filters.get('to_date')
		cost_centers = filters.get('cost_centers', []) or []
		
		# Build cost center filter for Payment Entries
		cost_center_filter = ""
		cost_center_params = {}
		if cost_centers:
			placeholders = []
			for i, cc in enumerate(cost_centers):
				key = f"cc_{i}"
				placeholders.append(f"%({key})s")
				cost_center_params[key] = cc
			cost_center_filter = f"AND pe.cost_center IN ({', '.join(placeholders)})"
		
		# Query Payment Entries linked to Purchase Invoices only
		query = f"""
			SELECT 
				pe.name AS payment_entry,
				pe.posting_date,
				pe.mode_of_payment,
				COALESCE(mop.type, 'Other') AS payment_type,
				per.allocated_amount,
				pe.paid_amount,
				pe.cost_center,
				per.reference_name AS pi_name,
				pi.supplier,
				pi.posting_date AS pi_posting_date
			FROM `tabPayment Entry` pe
			INNER JOIN `tabPayment Entry Reference` per ON per.parent = pe.name
			INNER JOIN `tabPurchase Invoice` pi ON pi.name = per.reference_name
			LEFT JOIN `tabMode of Payment` mop ON mop.name = pe.mode_of_payment
			WHERE pe.docstatus = 1
			AND pe.payment_type = 'Pay'
			AND per.reference_doctype = 'Purchase Invoice'
			AND pe.posting_date BETWEEN %(from_date)s AND %(to_date)s
			{cost_center_filter}
			ORDER BY pe.posting_date DESC, pe.name DESC
		"""
		
		params = {
			'from_date': from_date,
			'to_date': to_date,
			**cost_center_params
		}
		
		payment_entries = frappe.db.sql(query, params, as_dict=True)
		
		# Process and group by mode of payment
		payment_summary = {}
		
		for pe in payment_entries:
			# Get mode of payment name
			mode_of_payment = pe.mode_of_payment or 'Not Specified'
			
			# Determine payment type (Cash or Other)
			payment_type = pe.payment_type or 'Other'
			is_cash = payment_type == 'Cash'
			
			# Use allocated_amount from reference, fallback to paid_amount
			amount = flt(pe.allocated_amount or pe.paid_amount or 0)
			
			# Group by mode of payment
			if mode_of_payment not in payment_summary:
				payment_summary[mode_of_payment] = {
					'mode_of_payment': mode_of_payment,
					'payment_type': payment_type,
					'cash_amount': 0,
					'other_amount': 0,
					'total_amount': 0,
					'payment_count': 0,
					'invoice_count': 0
				}
			
			payment_summary[mode_of_payment]['total_amount'] += amount
			payment_summary[mode_of_payment]['payment_count'] += 1
			
			# Track unique invoices
			if pe.pi_name:
				if 'invoices' not in payment_summary[mode_of_payment]:
					payment_summary[mode_of_payment]['invoices'] = set()
				payment_summary[mode_of_payment]['invoices'].add(pe.pi_name)
			
			if is_cash:
				payment_summary[mode_of_payment]['cash_amount'] += amount
			else:
				payment_summary[mode_of_payment]['other_amount'] += amount
		
		# Collect detailed entries for "Not Specified" before processing summary
		detailed_entries = []
		for pe in payment_entries:
			if not pe.mode_of_payment or pe.mode_of_payment == '':
				posting_date_str = ''
				if pe.posting_date:
					if isinstance(pe.posting_date, str):
						posting_date_str = pe.posting_date
					else:
						posting_date_str = pe.posting_date.strftime('%Y-%m-%d')
				
				detailed_entries.append({
					'payment_entry': pe.payment_entry,
					'posting_date': posting_date_str,
					'pi_name': pe.pi_name,
					'supplier': pe.supplier,
					'amount': flt(pe.allocated_amount or pe.paid_amount or 0),
					'cost_center': pe.cost_center,
					'payment_type': pe.payment_type
				})
		
		# Convert to list, calculate invoice count, and sort
		result = []
		for mode, data in payment_summary.items():
			data['invoice_count'] = len(data.get('invoices', set()))
			del data['invoices']  # Remove set before returning
			result.append(data)
		
		result.sort(key=lambda x: x['total_amount'], reverse=True)
		
		# Return both summary and detailed entries
		return {
			'summary': result,
			'not_specified_details': detailed_entries
		}
		
	except Exception as e:
		frappe.log_error(f"Error in get_payment_entry_details: {str(e)}", "Procurement Expense Error")
		return []

@frappe.whitelist()
def get_item_payment_details(filters=None):
	"""Get item-wise payment details - which items paid via Cash vs Cheque"""
	try:
		if isinstance(filters, str):
			import json
			filters = json.loads(filters)
		elif not filters:
			filters = {}
		
		from_date = filters.get('from_date')
		to_date = filters.get('to_date')
		cost_centers = filters.get('cost_centers', []) or []
		
		# Build cost center filter
		cost_center_filter = ""
		cost_center_params = {}
		if cost_centers:
			placeholders = []
			for i, cc in enumerate(cost_centers):
				key = f"cc_{i}"
				placeholders.append(f"%({key})s")
				cost_center_params[key] = cc
			cost_center_filter = f"AND pe.cost_center IN ({', '.join(placeholders)})"
		
		# Query Payment Entries with Purchase Invoice Items
		query = f"""
			SELECT 
				pe.mode_of_payment,
				COALESCE(mop.type, 'Other') AS payment_type,
				per.reference_name AS pi_name,
				per.allocated_amount AS payment_amount,
				pii.item_code,
				pii.item_name,
				pii.base_amount AS item_amount,
				pi.grand_total AS invoice_total
			FROM `tabPayment Entry` pe
			INNER JOIN `tabPayment Entry Reference` per ON per.parent = pe.name
			INNER JOIN `tabPurchase Invoice` pi ON pi.name = per.reference_name
			INNER JOIN `tabPurchase Invoice Item` pii ON pii.parent = pi.name
			LEFT JOIN `tabMode of Payment` mop ON mop.name = pe.mode_of_payment
			WHERE pe.docstatus = 1
			AND pe.payment_type = 'Pay'
			AND per.reference_doctype = 'Purchase Invoice'
			AND pe.posting_date BETWEEN %(from_date)s AND %(to_date)s
			AND pi.grand_total > 0
			{cost_center_filter}
		"""
		
		params = {
			'from_date': from_date,
			'to_date': to_date,
			**cost_center_params
		}
		
		results = frappe.db.sql(query, params, as_dict=True)
		
		# Process and group by item and mode of payment
		item_payment_summary = {}
		
		for row in results:
			item_code = row.item_code or 'Unknown'
			item_name = row.item_name or item_code
			mode_of_payment = row.mode_of_payment or 'Not Specified'
			payment_type = row.payment_type or 'Other'
			
			# Calculate proportional payment amount for this item
			invoice_total = flt(row.invoice_total or 0)
			item_amount = flt(row.item_amount or 0)
			payment_amount = flt(row.payment_amount or 0)
			
			# Calculate proportion of payment allocated to this item
			if invoice_total > 0:
				item_proportion = item_amount / invoice_total
				allocated_payment = payment_amount * item_proportion
			else:
				allocated_payment = 0
			
			# Group by item and mode of payment
			key = f"{item_code}_{mode_of_payment}"
			
			if key not in item_payment_summary:
				item_payment_summary[key] = {
					'item_code': item_code,
					'item_name': item_name,
					'mode_of_payment': mode_of_payment,
					'payment_type': payment_type,
					'amount': 0,
					'invoice_count': set()
				}
			
			item_payment_summary[key]['amount'] += allocated_payment
			if row.pi_name:
				item_payment_summary[key]['invoice_count'].add(row.pi_name)
		
		# Separate cash and cheque items
		cash_items = {}
		cheque_items = {}
		
		for key, data in item_payment_summary.items():
			item_code = data['item_code']
			item_name = data['item_name']
			mode = data['mode_of_payment'].lower()
			
			# Check if cash payment
			if 'cash' in mode or data['payment_type'] == 'Cash':
				if item_code not in cash_items:
					cash_items[item_code] = {
						'item_code': item_code,
						'item_name': item_name,
						'amount': 0,
						'invoice_count': set()
					}
				cash_items[item_code]['amount'] += data['amount']
				cash_items[item_code]['invoice_count'].update(data['invoice_count'])
			
			# Check if cheque payment
			if 'cheque' in mode or 'check' in mode:
				if item_code not in cheque_items:
					cheque_items[item_code] = {
						'item_code': item_code,
						'item_name': item_name,
						'amount': 0,
						'invoice_count': set()
					}
				cheque_items[item_code]['amount'] += data['amount']
				cheque_items[item_code]['invoice_count'].update(data['invoice_count'])
		
		# Convert to lists and calculate invoice counts
		cash_list = []
		for item_code, data in cash_items.items():
			cash_list.append({
				'item_code': item_code,
				'item_name': data['item_name'],
				'amount': flt(data['amount']),
				'invoice_count': len(data['invoice_count'])
			})
		cash_list.sort(key=lambda x: x['amount'], reverse=True)
		
		cheque_list = []
		for item_code, data in cheque_items.items():
			cheque_list.append({
				'item_code': item_code,
				'item_name': data['item_name'],
				'amount': flt(data['amount']),
				'invoice_count': len(data['invoice_count'])
			})
		cheque_list.sort(key=lambda x: x['amount'], reverse=True)
		
		return {
			'cash_items': cash_list[:20],  # Top 20 items
			'cheque_items': cheque_list[:20]  # Top 20 items
		}
		
	except Exception as e:
		frappe.log_error(f"Error in get_item_payment_details: {str(e)}", "Procurement Expense Error")
		return {'cash_items': [], 'cheque_items': []}

@frappe.whitelist()
def get_courier_details(filters=None):
	"""Get courier expense details with courier name, type, cash, invoice, paid, pending amounts"""
	try:
		if isinstance(filters, str):
			import json
			filters = json.loads(filters)
		elif not filters:
			filters = {}
		
		from_date = filters.get('from_date')
		to_date = filters.get('to_date')
		cost_centers = filters.get('cost_centers', []) or []
		
		# Build cost center filter
		cost_center_filter = ""
		cost_center_params = {}
		if cost_centers:
			# Check if custom_supply_chain_cost_center column exists
			has_supply_chain_cc = frappe.db.has_column('Delivery Note', 'custom_supply_chain_cost_center')
			if has_supply_chain_cc:
				placeholders = []
				for i, cc in enumerate(cost_centers):
					key = f"cc_{i}"
					placeholders.append(f"%({key})s")
					cost_center_params[key] = cc
				cost_center_filter = f"AND (dn.custom_supply_chain_cost_center IN ({', '.join(placeholders)}) OR dn.cost_center IN ({', '.join(placeholders)}))"
			else:
				placeholders = []
				for i, cc in enumerate(cost_centers):
					key = f"cc_{i}"
					placeholders.append(f"%({key})s")
					cost_center_params[key] = cc
				cost_center_filter = f"AND dn.cost_center IN ({', '.join(placeholders)})"
		
		# Check if courier-related columns exist
		has_courier = frappe.db.has_column('Delivery Note', 'custom_courier')
		has_courier_service = frappe.db.has_column('Delivery Note', 'custom_courier_service')
		has_delivery_mode = frappe.db.has_column('Delivery Note', 'custom_delivery_mode')
		has_delivery_rate = frappe.db.has_column('Delivery Note', 'custom_delivery_rate')
		has_mode_of_payment = frappe.db.has_column('Delivery Note', 'custom_courier_mode_of_payment')
		
		if not (has_courier and has_delivery_rate):
			return []
		
		# Query Delivery Notes with courier expenses
		query = f"""
			SELECT 
				dn.name AS delivery_note,
				dn.posting_date,
				dn.custom_courier AS courier_name,
				COALESCE(dn.custom_courier_service, 'N/A') AS courier_type,
				dn.custom_delivery_rate AS amount,
				COALESCE(dn.custom_courier_mode_of_payment, 'Cash') AS payment_mode,
				COALESCE(dn.custom_supply_chain_cost_center, dn.cost_center, 'Not Set') AS cost_center
			FROM `tabDelivery Note` dn
			WHERE dn.docstatus = 1
			AND dn.posting_date BETWEEN %(from_date)s AND %(to_date)s
			AND dn.custom_delivery_mode = 'Courier'
			AND dn.custom_delivery_rate > 0
			AND dn.custom_courier IS NOT NULL
			AND dn.custom_courier != ''
			{cost_center_filter}
			ORDER BY dn.posting_date DESC, dn.name DESC
		"""
		
		params = {
			'from_date': from_date,
			'to_date': to_date,
			**cost_center_params
		}
		
		delivery_notes = frappe.db.sql(query, params, as_dict=True)
		
		# Get supplier for each courier to track invoices
		courier_suppliers = {}
		for dn in delivery_notes:
			if dn.courier_name and dn.courier_name not in courier_suppliers:
				supplier = frappe.db.get_value('Courier', dn.courier_name, 'supplier')
				courier_suppliers[dn.courier_name] = supplier
		
		# Process delivery notes and calculate amounts
		courier_summary = {}
		
		# Track invoice amounts by supplier for paid/pending calculation
		supplier_invoice_totals = {}
		supplier_paid_totals = {}
		
		for dn in delivery_notes:
			courier_name = dn.courier_name or 'Unknown'
			courier_type = dn.courier_type or 'N/A'
			amount = flt(dn.amount or 0)
			payment_mode = dn.payment_mode or 'Cash'
			
			key = f"{courier_name}_{courier_type}"
			
			if key not in courier_summary:
				courier_summary[key] = {
					'courier_name': courier_name,
					'courier_type': courier_type,
					'cash_amount': 0,
					'invoice_amount': 0,
					'paid_amount': 0,
					'pending_amount': 0,
					'total_amount': 0
				}
			
			courier_summary[key]['total_amount'] += amount
			
			if payment_mode == 'Cash':
				courier_summary[key]['cash_amount'] += amount
			else:
				# Invoice payment - track invoice amount
				courier_summary[key]['invoice_amount'] += amount
				supplier = courier_suppliers.get(courier_name)
				if supplier:
					if supplier not in supplier_invoice_totals:
						supplier_invoice_totals[supplier] = 0
					supplier_invoice_totals[supplier] += amount
		
		# Calculate paid amounts from Purchase Invoices
		for supplier, total_invoice in supplier_invoice_totals.items():
			# Get all Purchase Invoices for this supplier in date range
			pi_query = """
				SELECT 
					name,
					grand_total,
					outstanding_amount
				FROM `tabPurchase Invoice`
				WHERE docstatus = 1
				AND supplier = %(supplier)s
				AND posting_date BETWEEN %(from_date)s AND %(to_date)s
			"""
			
			pis = frappe.db.sql(pi_query, {
				'supplier': supplier,
				'from_date': from_date,
				'to_date': to_date
			}, as_dict=True)
			
			total_pi_amount = sum(flt(pi.grand_total) for pi in pis)
			total_pi_outstanding = sum(flt(pi.outstanding_amount) for pi in pis)
			total_pi_paid = total_pi_amount - total_pi_outstanding
			
			supplier_paid_totals[supplier] = {
				'total': total_pi_amount,
				'paid': total_pi_paid,
				'outstanding': total_pi_outstanding
			}
		
		# Allocate paid/pending amounts to courier summaries
		for key, summary in courier_summary.items():
			if summary['invoice_amount'] > 0:
				# Find supplier for this courier
				courier_name = summary['courier_name']
				supplier = courier_suppliers.get(courier_name)
				
				if supplier and supplier in supplier_invoice_totals:
					# Calculate proportion of paid/pending
					supplier_total_invoice = supplier_invoice_totals[supplier]
					supplier_paid_info = supplier_paid_totals.get(supplier, {'paid': 0, 'outstanding': 0})
					
					if supplier_total_invoice > 0:
						# Proportion of this courier's invoice amount
						proportion = summary['invoice_amount'] / supplier_total_invoice
						
						# Allocate paid/pending proportionally
						summary['paid_amount'] = flt(supplier_paid_info['paid'] * proportion)
						summary['pending_amount'] = flt(supplier_paid_info['outstanding'] * proportion)
					else:
						summary['pending_amount'] = summary['invoice_amount']
				else:
					# No supplier or no PI found - assume all pending
					summary['pending_amount'] = summary['invoice_amount']
		
		# Convert to list and sort
		result = list(courier_summary.values())
		result.sort(key=lambda x: x['total_amount'], reverse=True)
		
		return result
		
	except Exception as e:
		frappe.log_error(f"Error in get_courier_details: {str(e)}", "Procurement Expense Error")
		return []

@frappe.whitelist()
def get_voucher_wise_details(filters=None):
	"""Get voucher-wise (Payment Entry) details separated by Cash and Cheque"""
	try:
		if isinstance(filters, str):
			import json
			filters = json.loads(filters)
		elif not filters:
			filters = {}
		
		from_date = filters.get('from_date')
		to_date = filters.get('to_date')
		cost_centers = filters.get('cost_centers', []) or []
		
		# Build cost center filter
		cost_center_filter = ""
		cost_center_params = {}
		if cost_centers:
			placeholders = []
			for i, cc in enumerate(cost_centers):
				key = f"cc_{i}"
				placeholders.append(f"%({key})s")
				cost_center_params[key] = cc
			cost_center_filter = f"AND pe.cost_center IN ({', '.join(placeholders)})"
		
		# Query Payment Entries linked to Purchase Invoices
		query = f"""
			SELECT 
				pe.name AS payment_entry,
				pe.posting_date,
				pe.mode_of_payment,
				COALESCE(mop.type, 'Other') AS payment_type,
				per.allocated_amount,
				pe.paid_amount,
				pe.cost_center,
				per.reference_name AS pi_name,
				pi.supplier,
				pi.posting_date AS pi_posting_date,
				pi.grand_total AS invoice_total
			FROM `tabPayment Entry` pe
			INNER JOIN `tabPayment Entry Reference` per ON per.parent = pe.name
			INNER JOIN `tabPurchase Invoice` pi ON pi.name = per.reference_name
			LEFT JOIN `tabMode of Payment` mop ON mop.name = pe.mode_of_payment
			WHERE pe.docstatus = 1
			AND pe.payment_type = 'Pay'
			AND per.reference_doctype = 'Purchase Invoice'
			AND pe.posting_date BETWEEN %(from_date)s AND %(to_date)s
			{cost_center_filter}
			ORDER BY pe.posting_date DESC, pe.name DESC
		"""
		
		params = {
			'from_date': from_date,
			'to_date': to_date,
			**cost_center_params
		}
		
		payment_entries = frappe.db.sql(query, params, as_dict=True)
		
		# Separate into cash and cheque
		cash_vouchers = []
		cheque_vouchers = []
		
		for pe in payment_entries:
			mode_of_payment = (pe.mode_of_payment or '').lower()
			payment_type = (pe.payment_type or 'Other').lower()
			
			# Determine if cash or cheque
			is_cash = False
			is_cheque = False
			
			if 'cash' in mode_of_payment or payment_type == 'cash':
				is_cash = True
			elif 'cheque' in mode_of_payment or 'check' in mode_of_payment or payment_type == 'bank':
				is_cheque = True
			
			# Get cost center name
			cost_center_name = pe.cost_center or 'Not Set'
			if cost_center_name != 'Not Set':
				try:
					# Try to get department name first
					dept_name = frappe.db.get_value('Department', cost_center_name, 'department_name')
					if dept_name:
						cost_center_name = dept_name
					else:
						# Try cost center name
						cc_name = frappe.db.get_value('Cost Center', cost_center_name, 'cost_center_name')
						if cc_name:
							cost_center_name = cc_name
				except:
					pass
			
			# Format posting date
			posting_date_str = ''
			if pe.posting_date:
				if isinstance(pe.posting_date, str):
					posting_date_str = pe.posting_date
				else:
					posting_date_str = pe.posting_date.strftime('%Y-%m-%d')
			
			voucher_data = {
				'payment_entry': pe.payment_entry,
				'posting_date': posting_date_str,
				'mode_of_payment': pe.mode_of_payment or 'Not Specified',
				'payment_type': pe.payment_type or 'Other',
				'amount': flt(pe.allocated_amount or pe.paid_amount or 0),
				'cost_center': pe.cost_center or 'Not Set',
				'cost_center_name': cost_center_name,
				'pi_name': pe.pi_name,
				'supplier': pe.supplier,
				'invoice_total': flt(pe.invoice_total or 0)
			}
			
			if is_cash:
				cash_vouchers.append(voucher_data)
			elif is_cheque:
				cheque_vouchers.append(voucher_data)
			else:
				# If not clearly cash or cheque, check payment type
				# Default to cheque if it's bank type, otherwise cash
				if payment_type == 'bank':
					cheque_vouchers.append(voucher_data)
				else:
					cash_vouchers.append(voucher_data)
		
		# Sort by posting date descending
		cash_vouchers.sort(key=lambda x: x['posting_date'], reverse=True)
		cheque_vouchers.sort(key=lambda x: x['posting_date'], reverse=True)
		
		return {
			'cash': cash_vouchers,
			'cheque': cheque_vouchers
		}
		
	except Exception as e:
		frappe.log_error(f"Error in get_voucher_wise_details: {str(e)}", "Procurement Expense Error")
		return {'cash': [], 'cheque': []}

@frappe.whitelist()
def get_mr_po_acknowledgment_counts(filters=None):
	"""Get counts of MR, PO, and Pending Acknowledgments"""
	try:
		if isinstance(filters, str):
			import json
			filters = json.loads(filters)
		elif not filters:
			filters = {}
		
		from_date = filters.get('from_date')
		to_date = filters.get('to_date')
		cost_centers = filters.get('cost_centers', []) or []
		
		# Build cost center filter for MR using the same logic as other functions
		mr_cc_expr = _build_mr_cc_expr()
		mr_cc_filter_sql, mr_cc_filter_params = _build_in_filter_sql(mr_cc_expr, cost_centers)
		
		# Build cost center filter for PO using the same logic as other functions
		po_cc_expr = _build_po_cc_expr()
		po_cc_filter_sql, po_cc_filter_params = _build_in_filter_sql(po_cc_expr, cost_centers)
		
		# Get MR count
		mr_query = f"""
			SELECT COUNT(DISTINCT mr.name) AS mr_count
			FROM `tabMaterial Request` mr
			INNER JOIN `tabMaterial Request Item` mri ON mri.parent = mr.name
			WHERE mr.docstatus = 1
			AND COALESCE(mr.transaction_date, DATE(mr.creation)) BETWEEN %(from_date)s AND %(to_date)s
			{mr_cc_filter_sql}
		"""
		
		mr_params = {
			'from_date': from_date,
			'to_date': to_date,
			**mr_cc_filter_params
		}
		
		mr_result = frappe.db.sql(mr_query, mr_params, as_dict=True)
		mr_count = mr_result[0].get('mr_count', 0) if mr_result else 0
		
		# Get PO count
		po_query = f"""
			SELECT COUNT(DISTINCT po.name) AS po_count
			FROM `tabPurchase Order` po
			JOIN `tabPurchase Order Item` poi ON poi.parent = po.name
			WHERE po.docstatus = 1
			AND COALESCE(po.transaction_date, DATE(po.creation)) BETWEEN %(from_date)s AND %(to_date)s
			{po_cc_filter_sql}
		"""
		
		po_params = {
			'from_date': from_date,
			'to_date': to_date,
			**po_cc_filter_params
		}
		
		po_result = frappe.db.sql(po_query, po_params, as_dict=True)
		po_count = po_result[0].get('po_count', 0) if po_result else 0
		
		# Get Pending Acknowledgment count
		# Count acknowledgments that are pending and within date range
		ack_query = """
			SELECT COUNT(DISTINCT ack.name) AS pending_count
			FROM `tabAcknowledgment` ack
			WHERE ack.status = 'Pending'
			AND ack.docstatus != 2
			AND COALESCE(DATE(ack.creation), DATE(ack.modified)) BETWEEN %(from_date)s AND %(to_date)s
		"""
		
		ack_params = {
			'from_date': from_date,
			'to_date': to_date
		}
		
		ack_result = frappe.db.sql(ack_query, ack_params, as_dict=True)
		pending_acknowledgment_count = ack_result[0].get('pending_count', 0) if ack_result else 0
		
		return {
			'mr_count': mr_count,
			'po_count': po_count,
			'pending_acknowledgment_count': pending_acknowledgment_count
		}
		
	except Exception as e:
		frappe.log_error(f"Error in get_mr_po_acknowledgment_counts: {str(e)}", "Procurement Expense Error")
		return {
			'mr_count': 0,
			'po_count': 0,
			'pending_acknowledgment_count': 0
		}

@frappe.whitelist()
def get_invoice_details_by_period(filters=None):
	"""Get invoice/payment entry details for a specific period and cost center, grouped by date"""
	try:
		if isinstance(filters, str):
			import json
			filters = json.loads(filters)
		elif not filters:
			filters = {}
		
		period = filters.get('period')
		cost_center = filters.get('cost_center')
		period_type = filters.get('period_type', 'monthly')
		
		if not period or not cost_center:
			return {'error': 'Period and cost center are required'}
		
		# Calculate date range from period
		from_date, to_date = get_period_date_range(period, period_type)
		
		# Build cost center expressions
		pi_cc_expr = _build_pi_cc_expr()
		
		# Build cost center filter - exact match
		pi_filter_params = {}
		if cost_center == 'Not Set':
			pi_filter_sql = f"AND ({pi_cc_expr} = 'Not Set' OR {pi_cc_expr} IS NULL)"
		else:
			pi_filter_sql = f"AND {pi_cc_expr} = %(cost_center)s"
			pi_filter_params = {'cost_center': cost_center}
		
		# Query Purchase Invoices with date grouping
		pi_query = f"""
			SELECT DISTINCT
				pi.name AS invoice_name,
				pi.posting_date,
				COALESCE(pi.posting_date, DATE(pi.creation)) AS transaction_date,
				pi.supplier,
				pi.grand_total,
				pi.status,
				pi.bill_no,
				pi.bill_date
			FROM `tabPurchase Invoice` pi
			JOIN `tabPurchase Invoice Item` pii ON pii.parent = pi.name
			WHERE pi.docstatus = 1
			{pi_filter_sql}
			AND COALESCE(pi.posting_date, DATE(pi.creation)) BETWEEN %(from_date)s AND %(to_date)s
			ORDER BY COALESCE(pi.posting_date, DATE(pi.creation)) DESC, pi.name DESC
		"""
		
		params = {
			'from_date': from_date,
			'to_date': to_date,
			**pi_filter_params
		}
		
		invoices = frappe.db.sql(pi_query, params, as_dict=True)
		
		# Also get payment entries for these invoices
		if invoices:
			invoice_names = [inv['invoice_name'] for inv in invoices]
			
			payment_query = """
				SELECT 
					per.reference_name AS invoice_name,
					pe.name AS payment_entry,
					pe.posting_date AS payment_date,
					pe.mode_of_payment,
					per.allocated_amount AS payment_amount,
					pe.paid_amount
				FROM `tabPayment Entry` pe
				INNER JOIN `tabPayment Entry Reference` per ON per.parent = pe.name
				WHERE pe.docstatus = 1
				AND per.reference_doctype = 'Purchase Invoice'
				AND per.reference_name IN %(invoice_names)s
				ORDER BY pe.posting_date DESC, pe.name DESC
			"""
			
			payment_params = {'invoice_names': invoice_names}
			payments = frappe.db.sql(payment_query, payment_params, as_dict=True)
			
			# Group payments by invoice
			payments_by_invoice = {}
			for payment in payments:
				inv_name = payment['invoice_name']
				if inv_name not in payments_by_invoice:
					payments_by_invoice[inv_name] = []
				payments_by_invoice[inv_name].append(payment)
			
			# Attach payments to invoices
			for invoice in invoices:
				invoice['payments'] = payments_by_invoice.get(invoice['invoice_name'], [])
		else:
			for invoice in invoices:
				invoice['payments'] = []
		
		# Group by date
		date_groups = {}
		for invoice in invoices:
			date_key = invoice['transaction_date'].strftime('%Y-%m-%d') if isinstance(invoice['transaction_date'], (datetime, type(getdate('2000-01-01')))) else str(invoice['transaction_date'])
			
			if date_key not in date_groups:
				date_groups[date_key] = []
			
			# Format dates for JSON serialization
			if invoice.get('posting_date'):
				if hasattr(invoice['posting_date'], 'strftime'):
					invoice['posting_date'] = invoice['posting_date'].strftime('%Y-%m-%d')
			if invoice.get('transaction_date'):
				if hasattr(invoice['transaction_date'], 'strftime'):
					invoice['transaction_date'] = invoice['transaction_date'].strftime('%Y-%m-%d')
			if invoice.get('bill_date'):
				if hasattr(invoice['bill_date'], 'strftime'):
					invoice['bill_date'] = invoice['bill_date'].strftime('%Y-%m-%d')
			
			for payment in invoice.get('payments', []):
				if payment.get('payment_date'):
					if hasattr(payment['payment_date'], 'strftime'):
						payment['payment_date'] = payment['payment_date'].strftime('%Y-%m-%d')
			
			date_groups[date_key].append(invoice)
		
		# Convert to list and sort by date (descending)
		result = []
		for date_key in sorted(date_groups.keys(), reverse=True):
			result.append({
				'date': date_key,
				'invoices': date_groups[date_key]
			})
		
		return {'data': result}
		
	except Exception as e:
		frappe.log_error(f"Error in get_invoice_details_by_period: {str(e)}", "Procurement Expense Error")
		return {'error': str(e)}

def get_period_date_range(period, period_type='monthly'):
	"""Get from_date and to_date for a given period"""
	try:
		if period_type == 'monthly':
			# period format: YYYY-MM
			year, month = period.split('-')
			from_date = get_first_day(f"{year}-{month}-01")
			to_date = get_last_day(f"{year}-{month}-01")
		elif period_type == 'quarterly':
			# period format: YYYY-Q1, YYYY-Q2, etc.
			year, quarter = period.split('-Q')
			quarter = int(quarter)
			month = (quarter - 1) * 3 + 1
			from_date = get_first_day(f"{year}-{month:02d}-01")
			# Last month of quarter
			last_month = quarter * 3
			to_date = get_last_day(f"{year}-{last_month:02d}-01")
		elif period_type == 'yearly':
			# period format: YYYY
			year = period
			from_date = get_first_day(f"{year}-01-01")
			to_date = get_last_day(f"{year}-12-01")
		else:
			# Default to monthly
			year, month = period.split('-')
			from_date = get_first_day(f"{year}-{month}-01")
			to_date = get_last_day(f"{year}-{month}-01")
		
		return from_date, to_date
	except Exception as e:
		frappe.log_error(f"Error in get_period_date_range: {str(e)}", "Procurement Expense Error")
		# Fallback to current month
		today_date = today()
		return get_first_day(today_date), get_last_day(today_date)

@frappe.whitelist()
def get_department_payment_data(filters=None):
	"""Get payment data grouped by department cost centers (parent cost centers)"""
	try:
		if isinstance(filters, str):
			import json
			filters = json.loads(filters)
		elif not filters:
			filters = {}
		
		from_date = filters.get('from_date')
		to_date = filters.get('to_date')
		
		# Define the department cost centers (parent cost centers)
		# These are the actual cost center names in the database
		department_cost_centers = [
			'CEE',                    # ID: 1 - CEE - TIF
			'QPS',                    # ID: 2 - QPS - TIF
			'TPS',                    # ID: 3 - TPS - TIF
			'FINANCE',                # ID: 5 - FINANCE - TIF
			'ADMIN',                  # ID: 8 - ADMIN - TIF
			'MARKETING',              # ID: 9 - MARKETING - TIF
			'HEAD OFFICE',            # ID: 10 - HEAD OFFICE - TIF
			'HR',                     # ID: 011 - HR - TIF
			# Note: The following may need to be added if they exist:
			# 'MEHMOODABAD CENTER',
			# 'Regional Office',
			# 'INFORMATION TECHNOLOGY'
		]
		
		# Get all cost center IDs for these department names
		dept_cost_center_map = {}  # Maps dept_name -> cc_id
		dept_cost_center_ids = []
		all_dept_cc_ids = set()  # All department CC IDs including children
		
		print(f"[Department Payment Debug] Looking for {len(department_cost_centers)} department cost centers")
		
		# First, let's see what cost centers exist that might match
		all_ccs = frappe.db.sql("""
			SELECT name, cost_center_name, parent_cost_center
			FROM `tabCost Center`
			WHERE cost_center_name LIKE '%TIF%'
			ORDER BY cost_center_name
		""", as_dict=True)
		print(f"[Department Payment Debug] Found {len(all_ccs)} cost centers with 'TIF' in name")
		if len(all_ccs) > 0 and len(all_ccs) <= 50:
			print(f"[Department Payment Debug] Sample cost centers:")
			for cc in all_ccs[:10]:
				print(f"  - {cc.cost_center_name} (ID: {cc.name}, Parent: {cc.parent_cost_center})")
		
		for dept_name in department_cost_centers:
			try:
				# Try exact match first
				cc_id = frappe.db.get_value('Cost Center', {'cost_center_name': dept_name}, 'name')
				if not cc_id:
					# Try case-insensitive match
					cc_id = frappe.db.sql("""
						SELECT name FROM `tabCost Center`
						WHERE LOWER(cost_center_name) = LOWER(%s)
						LIMIT 1
					""", dept_name, as_dict=True)
					if cc_id:
						cc_id = cc_id[0].name
				
				if cc_id:
					dept_cost_center_map[dept_name] = cc_id
					dept_cost_center_ids.append(cc_id)
					all_dept_cc_ids.add(cc_id)
					print(f"[Department Payment Debug] Found: {dept_name} -> {cc_id}")
					
					# Get all child cost centers recursively
					child_ccs = frappe.db.sql("""
						SELECT name FROM `tabCost Center`
						WHERE lft >= (SELECT lft FROM `tabCost Center` WHERE name = %s)
						AND rgt <= (SELECT rgt FROM `tabCost Center` WHERE name = %s)
					""", (cc_id, cc_id), as_dict=True)
					
					for child in child_ccs:
						all_dept_cc_ids.add(child.name)
					print(f"[Department Payment Debug]   - Found {len(child_ccs)} child cost centers")
				else:
					print(f"[Department Payment Debug] NOT FOUND: {dept_name}")
					# Try to find similar names
					similar = frappe.db.sql("""
						SELECT name, cost_center_name FROM `tabCost Center`
						WHERE cost_center_name LIKE %s
						LIMIT 5
					""", f"%{dept_name.replace(' - TIF', '')}%", as_dict=True)
					if similar:
						print(f"[Department Payment Debug]   Similar cost centers found:")
						for s in similar:
							print(f"     - {s.cost_center_name} (ID: {s.name})")
			except Exception as e:
				print(f"[Department Payment Debug] Error getting cost center for {dept_name}: {str(e)}")
				pass
		
		print(f"[Department Payment Debug] Total department IDs found: {len(dept_cost_center_ids)}")
		print(f"[Department Payment Debug] Department map: {dept_cost_center_map}")
		
		if not dept_cost_center_ids:
			print(f"[Department Payment Debug] WARNING: No department cost centers found! Returning empty data.")
			# Return empty data for all departments
			return [{
				'department': dept_name,
				'department_id': None,
				'payment_amount': 0,
				'payment_count': 0,
				'invoice_count': 0
			} for dept_name in department_cost_centers]
		
		# Check if custom_department column exists
		has_custom_dept = frappe.db.has_column('Purchase Invoice', 'custom_department')
		
		# Build cost center expression
		if has_custom_dept:
			cc_expr = "COALESCE(NULLIF(pii.cost_center, ''), NULLIF(pi.cost_center, ''), NULLIF(pi.custom_department, ''))"
		else:
			cc_expr = "COALESCE(NULLIF(pii.cost_center, ''), NULLIF(pi.cost_center, ''))"
		
		# Query Payment Entries linked to Purchase Invoices
		# Get individual payment entries and match to departments in Python (more reliable)
		query = f"""
			SELECT 
				pe.name AS payment_entry,
				per.allocated_amount AS payment_amount,
				per.reference_name AS invoice_name,
				{cc_expr} AS invoice_cost_center,
				pe.cost_center AS payment_cost_center
			FROM `tabPayment Entry` pe
			INNER JOIN `tabPayment Entry Reference` per ON per.parent = pe.name
			INNER JOIN `tabPurchase Invoice` pi ON pi.name = per.reference_name
			INNER JOIN `tabPurchase Invoice Item` pii ON pii.parent = pi.name
			WHERE pe.docstatus = 1
			AND pi.docstatus = 1
			AND pe.payment_type = 'Pay'
			AND per.reference_doctype = 'Purchase Invoice'
			AND pe.posting_date BETWEEN %(from_date)s AND %(to_date)s
			AND (COALESCE({cc_expr}, NULLIF(pe.cost_center, '')) IS NOT NULL
				AND COALESCE({cc_expr}, NULLIF(pe.cost_center, '')) != ''
				AND COALESCE({cc_expr}, NULLIF(pe.cost_center, '')) != 'Not Set')
		"""
		
		params = {
			'from_date': from_date,
			'to_date': to_date
		}
		
		payment_entries = frappe.db.sql(query, params, as_dict=True)
		
		# Debug: Check if we're getting payment entries
		print(f"[Department Payment Debug] Total payment entries found: {len(payment_entries)}")
		if payment_entries:
			print(f"[Department Payment Debug] Sample payment entry: {payment_entries[0]}")
		else:
			print(f"[Department Payment Debug] WARNING: No payment entries found!")
			print(f"[Department Payment Debug] Query: {query}")
			print(f"[Department Payment Debug] Params: {params}")
		
		# Group by cost center in Python
		cost_center_payments = {}
		for pe in payment_entries:
			# Use invoice cost center first, fallback to payment entry cost center
			cc = pe.get('invoice_cost_center') or pe.get('payment_cost_center')
			if not cc or cc == 'Not Set':
				continue
			
			if cc not in cost_center_payments:
				cost_center_payments[cc] = {
					'cost_center': cc,
					'payment_amount': 0,
					'payment_count': 0,
					'invoice_count': set()
				}
			
			cost_center_payments[cc]['payment_amount'] += flt(pe.get('payment_amount', 0))
			cost_center_payments[cc]['payment_count'] += 1
			if pe.get('invoice_name'):
				cost_center_payments[cc]['invoice_count'].add(pe.get('invoice_name'))
		
		# Convert to list format for processing
		results = []
		for cc, data in cost_center_payments.items():
			results.append({
				'invoice_cost_center': cc,
				'payment_amount': data['payment_amount'],
				'payment_count': data['payment_count'],
				'invoice_count': len(data['invoice_count'])
			})
		
		# Debug logging
		print(f"[Department Payment Debug] Found {len(results)} unique cost centers with payments")
		print(f"[Department Payment Debug] Total payment amount across all cost centers: {sum(r.get('payment_amount', 0) for r in results)}")
		if results:
			print(f"[Department Payment Debug] Top 5 cost centers by amount:")
			sorted_results = sorted(results, key=lambda x: x.get('payment_amount', 0), reverse=True)
			for r in sorted_results[:5]:
				print(f"  - {r.get('invoice_cost_center')}: {r.get('payment_amount', 0)}")
		print(f"[Department Payment Debug] Department map: {dept_cost_center_map}")
		print(f"[Department Payment Debug] Department IDs: {dept_cost_center_ids}")
		if results:
			print(f"[Department Payment Debug] Sample row: {results[0]}")
		print(f"[Department Payment Debug] Query: {query}")
		print(f"[Department Payment Debug] Params: {params}")
		
		# Map each payment to its department
		department_data = {}
		
		for row in results:
			invoice_cc_id = row.get('invoice_cost_center')
			if not invoice_cc_id:
				continue
			
			print(f"[Department Payment Debug] Processing row - CC: {invoice_cc_id}, Amount: {row.get('payment_amount', 0)}")
			
			# First, try quick check if invoice_cc_id is directly a department
			department_name = None
			department_id = None
			cc_doc = None
			cc_name = None
			parent_cc_id = None
			
			# Quick check: is this cost center ID directly a department?
			if invoice_cc_id in dept_cost_center_ids:
				for dept_name, dept_id in dept_cost_center_map.items():
					if dept_id == invoice_cc_id:
						department_name = dept_name
						department_id = dept_id
						break
			
			# Quick check: is this cost center a child of any department?
			if not department_name and invoice_cc_id in all_dept_cc_ids:
				# Find which department this cost center belongs to using SQL
				try:
					dept_ancestor = frappe.db.sql("""
						SELECT dept.name, dept.cost_center_name
						FROM `tabCost Center` dept
						INNER JOIN `tabCost Center` child ON 
							child.lft >= dept.lft AND child.rgt <= dept.rgt
						WHERE child.name = %s
						AND dept.name IN %s
						ORDER BY dept.lft
						LIMIT 1
					""", (invoice_cc_id, tuple(dept_cost_center_ids)), as_dict=True)
					
					if dept_ancestor:
						dept_cc_id = dept_ancestor[0].name
						for dept_name, dept_id in dept_cost_center_map.items():
							if dept_id == dept_cc_id:
								department_name = dept_name
								department_id = dept_id
								break
				except Exception as e:
					print(f"[Department Payment Debug] Error finding department ancestor for {invoice_cc_id}: {str(e)}")
			
			# Quick check: is this cost center name directly a department?
			if not department_name and invoice_cc_id in department_cost_centers:
				department_name = invoice_cc_id
				department_id = dept_cost_center_map.get(invoice_cc_id)
			
			# If not found, get cost center details and traverse
			if not department_name:
				# Get cost center details - try by ID first, then by name
				try:
					if frappe.db.exists('Cost Center', invoice_cc_id):
						cc_doc = frappe.get_doc('Cost Center', invoice_cc_id)
						cc_name = cc_doc.cost_center_name
						parent_cc_id = cc_doc.parent_cost_center
					else:
						# Try to get by name
						cc_id_by_name = frappe.db.get_value('Cost Center', {'cost_center_name': invoice_cc_id}, ['name', 'cost_center_name', 'parent_cost_center'], as_dict=True)
						if cc_id_by_name:
							cc_doc = frappe.get_doc('Cost Center', cc_id_by_name.name)
							cc_name = cc_id_by_name.cost_center_name
							parent_cc_id = cc_id_by_name.parent_cost_center
							invoice_cc_id = cc_id_by_name.name  # Update to use the actual ID
				except Exception as e:
					print(f"[Department Payment Debug] Error getting cost center {invoice_cc_id}: {str(e)}")
					cc_doc = None
			
			# Determine which department this payment belongs to (if not already found)
			if cc_doc and not department_name:
				cost_center_name = cc_doc.cost_center_name
				parent_cc_id = cc_doc.parent_cost_center
				
				# Priority 1: Check if the cost center itself is a department
				if invoice_cc_id in dept_cost_center_ids:
					for dept_name, dept_id in dept_cost_center_map.items():
						if dept_id == invoice_cc_id:
							department_name = dept_name
							department_id = dept_id
							break
				# Priority 2: Check if cost center name matches any department name (exact or contains)
				elif cost_center_name:
					# Try exact match first
					if cost_center_name in department_cost_centers:
						department_name = cost_center_name
						department_id = dept_cost_center_map.get(cost_center_name)
					else:
						# Try partial match - check if department name is in cost center name or vice versa
						for dept_name in department_cost_centers:
							# Remove " - TIF" suffix for comparison
							dept_base = dept_name.replace(' - TIF', '').strip()
							cc_base = cost_center_name.replace(' - TIF', '').strip()
							if dept_base in cc_base or cc_base in dept_base or dept_base == cc_base:
								department_name = dept_name
								department_id = dept_cost_center_map.get(dept_name)
								break
				# Priority 3: Check if the parent cost center is a department
				elif parent_cc_id and parent_cc_id in dept_cost_center_ids:
					for dept_name, dept_id in dept_cost_center_map.items():
						if dept_id == parent_cc_id:
							department_name = dept_name
							department_id = dept_id
							break
				# Priority 4: Traverse up the tree to find department
				else:
					try:
						current_cc_id = invoice_cc_id
						max_depth = 15  # Increased depth
						depth = 0
						
						while current_cc_id and depth < max_depth:
							# Check if current is a department (by ID) - direct match
							if current_cc_id in dept_cost_center_ids:
								for dept_name, dept_id in dept_cost_center_map.items():
									if dept_id == current_cc_id:
										department_name = dept_name
										department_id = dept_id
										break
								if department_name:
									break
							
							# Check if current is a child of any department (using all_dept_cc_ids)
							if not department_name and current_cc_id in all_dept_cc_ids:
								# Find which department this cost center belongs to
								# Use SQL to find the department ancestor efficiently
								dept_ancestor = frappe.db.sql("""
									SELECT dept.name, dept.cost_center_name
									FROM `tabCost Center` dept
									INNER JOIN `tabCost Center` child ON 
										child.lft >= dept.lft AND child.rgt <= dept.rgt
									WHERE child.name = %s
									AND dept.name IN %s
									ORDER BY dept.lft
									LIMIT 1
								""", (current_cc_id, tuple(dept_cost_center_ids)), as_dict=True)
								
								if dept_ancestor:
									dept_cc_id = dept_ancestor[0].name
									for dept_name, dept_id in dept_cost_center_map.items():
										if dept_id == dept_cc_id:
											department_name = dept_name
											department_id = dept_id
											break
								if department_name:
									break
							
							# Also check if current cost center name matches a department
							if not department_name:
								try:
									current_cc_name = frappe.db.get_value('Cost Center', current_cc_id, 'cost_center_name')
									if current_cc_name:
										# Try exact match
										if current_cc_name in department_cost_centers:
											department_name = current_cc_name
											department_id = dept_cost_center_map.get(current_cc_name)
											if department_name:
												break
										# Try partial match (remove " - TIF" suffix)
										else:
											cc_base = current_cc_name.replace(' - TIF', '').strip()
											for dept_name in department_cost_centers:
												dept_base = dept_name.replace(' - TIF', '').strip()
												if dept_base == cc_base or dept_base in cc_base or cc_base in dept_base:
													department_name = dept_name
													department_id = dept_cost_center_map.get(dept_name)
													break
											if department_name:
												break
								except:
									pass
							
							# Get parent
							try:
								parent = frappe.db.get_value('Cost Center', current_cc_id, 'parent_cost_center')
								if not parent or parent == current_cc_id:
									break
								current_cc_id = parent
								depth += 1
							except:
								break
					except Exception as e:
						print(f"[Department Payment Debug] Error in traversal for {invoice_cc_id}: {str(e)}")
						pass
			elif not department_name:
				# If cost center doc not found and not already matched, try direct name match
				if invoice_cc_id in department_cost_centers:
					department_name = invoice_cc_id
					department_id = dept_cost_center_map.get(invoice_cc_id)
				# Also try matching the original value as a name
				elif invoice_cc_id in dept_cost_center_map.values():
					# invoice_cc_id is actually a department ID
					for dept_name, dept_id in dept_cost_center_map.items():
						if dept_id == invoice_cc_id:
							department_name = dept_name
							department_id = dept_id
							break
			
			# Only process if we found a matching department
			if department_name:
				print(f"[Department Payment Debug] Matched to department: {department_name}, Amount: {row.get('payment_amount', 0)}")
				if department_name not in department_data:
					department_data[department_name] = {
						'department': department_name,
						'department_id': department_id,
						'payment_amount': 0,
						'payment_count': 0,
						'invoice_count': 0
					}
				
				department_data[department_name]['payment_amount'] += flt(row.get('payment_amount', 0))
				department_data[department_name]['payment_count'] += row.get('payment_count', 0)
				department_data[department_name]['invoice_count'] += row.get('invoice_count', 0)
			else:
				# Debug: log unmatched rows
				print(f"[Department Payment Debug] Unmatched row - CC ID: {invoice_cc_id}, CC Name: {cc_name if cc_doc else 'N/A'}, Parent: {parent_cc_id}, Payment Amount: {row.get('payment_amount', 0)}")
		
		# Convert to list and ensure all departments are included (even with 0 amounts)
		result = []
		for dept_name in department_cost_centers:
			if dept_name in department_data:
				result.append(department_data[dept_name])
			else:
				# Include department even if no payments
				result.append({
					'department': dept_name,
					'department_id': dept_cost_center_map.get(dept_name),
					'payment_amount': 0,
					'payment_count': 0,
					'invoice_count': 0
				})
		
		# Sort by payment amount descending
		result.sort(key=lambda x: x.get('payment_amount', 0), reverse=True)
		
		# Debug logging
		print(f"[Department Payment Debug] Final result: {len(result)} departments, Total amount: {sum(r.get('payment_amount', 0) for r in result)}")
		print(f"[Department Payment Debug] Department data keys: {list(department_data.keys())}")
		print(f"[Department Payment Debug] Final result data:")
		for r in result:
			print(f"  - {r.get('department')}: {r.get('payment_amount', 0)}")
		
		return result
		
	except Exception as e:
		print(f"[Department Payment Debug] ERROR in get_department_payment_data: {str(e)}")
		import traceback
		print(f"[Department Payment Debug] Traceback: {traceback.format_exc()}")
		frappe.log_error(f"Error in get_department_payment_data: {str(e)}", "Procurement Expense Error")
		return []

