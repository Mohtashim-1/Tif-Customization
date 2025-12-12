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
		
		# Build cost center expressions using helper functions
		mr_cc_expr = _build_mr_cc_expr()
		po_cc_expr = _build_po_cc_expr()
		
		# Build cost center/department filter using parameterized queries
		mr_filter_sql, mr_filter_params = _build_in_filter_sql(mr_cc_expr, cost_centers)
		po_filter_sql, po_filter_params = _build_in_filter_sql(po_cc_expr, cost_centers)
		
		# Get MR amount expression - check if base_amount exists
		mr_amt_expr = _get_mr_amount_expr()
		
		# Get Material Request expenses - use custom_department if available, else cost_center
		# Use transaction_date if available, else use creation date (cast to date)
		mr_query = f"""
			SELECT 
				COALESCE(mr.transaction_date, DATE(mr.creation)) AS transaction_date,
				{mr_cc_expr} AS cost_center,
				SUM({mr_amt_expr}) AS base_amount,
				COUNT(DISTINCT mr.name) AS mr_count
			FROM `tabMaterial Request` mr
			JOIN `tabMaterial Request Item` mri ON mri.parent = mr.name
			WHERE mr.docstatus = 1
			AND COALESCE(mr.transaction_date, DATE(mr.creation)) BETWEEN %(from_date)s AND %(to_date)s
			AND mr.material_request_type = 'Purchase'
			{mr_filter_sql}
			GROUP BY COALESCE(mr.transaction_date, DATE(mr.creation)), {mr_cc_expr}
		"""
		
		mr_results = frappe.db.sql(mr_query, {
			'from_date': from_date,
			'to_date': to_date,
			**mr_filter_params
		}, as_dict=True)
		
		# Debug: Log MR results count and sample data
		frappe.log_error(f"MR Query - From: {from_date}, To: {to_date}\nMR Results Count: {len(mr_results)}\nSample: {mr_results[:2] if mr_results else 'No results'}", "Procurement Expense Debug")
		
		# Get PO amount expression - check if base_amount exists
		po_amt_expr = _get_po_amount_expr()
		
		# Use transaction_date if available, else use creation date (cast to date)
		po_query = f"""
			SELECT 
				COALESCE(po.transaction_date, DATE(po.creation)) AS transaction_date,
				{po_cc_expr} AS cost_center,
				SUM({po_amt_expr}) AS base_amount,
				COUNT(DISTINCT po.name) AS po_count
			FROM `tabPurchase Order` po
			JOIN `tabPurchase Order Item` poi ON poi.parent = po.name
			WHERE po.docstatus = 1
			AND COALESCE(po.transaction_date, DATE(po.creation)) BETWEEN %(from_date)s AND %(to_date)s
			{po_filter_sql}
			GROUP BY COALESCE(po.transaction_date, DATE(po.creation)), {po_cc_expr}
		"""
		
		po_results = frappe.db.sql(po_query, {
			'from_date': from_date,
			'to_date': to_date,
			**po_filter_params
		}, as_dict=True)
		
		# Debug: Log PO results count and sample data
		has_custom_dept = frappe.db.has_column('Purchase Order', 'custom_department')
		frappe.log_error(f"PO Query - From: {from_date}, To: {to_date}\nPO Results Count: {len(po_results)}, Has custom_department: {has_custom_dept}\nSample: {po_results[:2] if po_results else 'No results'}", "Procurement Expense Debug")
		
		# Combine and group by period
		combined_data = {}
		
		# Process MR data
		for row in mr_results:
			period_key = get_period_key(row.get('transaction_date'), period_type)
			cost_center = row.get('cost_center') or 'Not Set'
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
			
			combined_data[key]['mr_amount'] += flt(row.get('base_amount') or 0)
			combined_data[key]['total_amount'] += flt(row.get('base_amount') or 0)
			combined_data[key]['mr_count'] += row.get('mr_count') or 0
		
		# Process PO data
		for row in po_results:
			period_key = get_period_key(row.get('transaction_date'), period_type)
			cost_center = row.get('cost_center') or 'Not Set'
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
			
			combined_data[key]['po_amount'] += flt(row.get('base_amount') or 0)
			combined_data[key]['total_amount'] += flt(row.get('base_amount') or 0)
			combined_data[key]['po_count'] += row.get('po_count') or 0
		
		# Convert to list and sort
		result = list(combined_data.values())
		result.sort(key=lambda x: (x['period'], x['cost_center']))
		
		# Debug: Log final result count
		frappe.log_error(f"Final combined results count: {len(result)}\nSample: {result[:2] if result else 'No results'}", "Procurement Expense Debug")
		
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

import frappe
from frappe.utils import flt

def get_summary_data(filters):
	"""Get summary data by cost center / department"""
	try:
		from_date = filters.get('from_date')
		to_date = filters.get('to_date')
		cost_centers = filters.get('cost_centers', []) or []

		# -----------------------------
		# Helpers (local)
		# -----------------------------
		def _build_mr_cc_expr():
			# MR parent generally does NOT have cost_center; item does.
			parts = ["NULLIF(mr.custom_department, '')", "NULLIF(mri.cost_center, '')"]

			# only include if exists (custom installs)
			try:
				if frappe.db.has_column("Material Request", "cost_center"):
					parts.append("NULLIF(mr.cost_center, '')")
			except Exception:
				pass

			parts.append("'Not Set'")
			return f"COALESCE({', '.join(parts)})"

		def _build_po_cc_expr():
			parts = []

			# custom_department optional
			try:
				if frappe.db.has_column("Purchase Order", "custom_department"):
					parts.append("NULLIF(po.custom_department, '')")
			except Exception:
				pass

			# item cost_center is common
			parts.append("NULLIF(poi.cost_center, '')")

			# parent cost_center may or may not exist
			try:
				if frappe.db.has_column("Purchase Order", "cost_center"):
					parts.append("NULLIF(po.cost_center, '')")
			except Exception:
				pass

			parts.append("'Not Set'")
			return f"COALESCE({', '.join(parts)})"

		def _mr_amount_expr():
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

		def _build_in_filter_sql(expr, values):
			# returns (sql_snippet, params_dict)
			if not values:
				return "", {}

			placeholders = []
			params = {}
			for i, v in enumerate(values):
				k = f"cc_{i}"
				placeholders.append(f"%({k})s")
				params[k] = v

			return f" AND {expr} IN ({', '.join(placeholders)})", params

		# -----------------------------
		# Build expressions & filters
		# -----------------------------
		mr_cc_expr = _build_mr_cc_expr()
		po_cc_expr = _build_po_cc_expr()

		mr_filter_sql, mr_filter_params = _build_in_filter_sql(mr_cc_expr, cost_centers)
		po_filter_sql, po_filter_params = _build_in_filter_sql(po_cc_expr, cost_centers)

		mr_amt = _mr_amount_expr()

		# -----------------------------
		# MR Summary
		# -----------------------------
		mr_summary_query = f"""
			SELECT
				{mr_cc_expr} AS cost_center,
				SUM({mr_amt}) AS total_amount,
				COUNT(DISTINCT mr.name) AS mr_count
			FROM `tabMaterial Request` mr
			JOIN `tabMaterial Request Item` mri ON mri.parent = mr.name
			WHERE mr.docstatus = 1
			  AND mr.transaction_date BETWEEN %(from_date)s AND %(to_date)s
			  AND mr.material_request_type = 'Purchase'
			  {mr_filter_sql}
			GROUP BY {mr_cc_expr}
		"""

		mr_summary = frappe.db.sql(
			mr_summary_query,
			{**{'from_date': from_date, 'to_date': to_date}, **mr_filter_params},
			as_dict=True
		)

		# -----------------------------
		# PO Summary (PO item base_amount usually exists)
		# -----------------------------
		po_amt_expr = "poi.base_amount"
		try:
			if not frappe.db.has_column("Purchase Order Item", "base_amount"):
				po_amt_expr = "poi.amount" if frappe.db.has_column("Purchase Order Item", "amount") else "(COALESCE(poi.qty,0) * COALESCE(poi.rate,0))"
		except Exception:
			pass

		po_summary_query = f"""
			SELECT
				{po_cc_expr} AS cost_center,
				SUM({po_amt_expr}) AS total_amount,
				COUNT(DISTINCT po.name) AS po_count
			FROM `tabPurchase Order` po
			JOIN `tabPurchase Order Item` poi ON poi.parent = po.name
			WHERE po.docstatus = 1
			  AND COALESCE(po.transaction_date, DATE(po.creation)) BETWEEN %(from_date)s AND %(to_date)s
			  {po_filter_sql}
			GROUP BY {po_cc_expr}
		"""

		po_summary = frappe.db.sql(
			po_summary_query,
			{**{'from_date': from_date, 'to_date': to_date}, **po_filter_params},
			as_dict=True
		)

		# -----------------------------
		# Combine summaries
		# -----------------------------
		summary_dict = {}

		for row in mr_summary:
			cc = row.get("cost_center") or "Not Set"
			if cc not in summary_dict:
				summary_dict[cc] = {
					'cost_center': cc,
					'mr_amount': 0,
					'po_amount': 0,
					'total_amount': 0,
					'mr_count': 0,
					'po_count': 0
				}
			summary_dict[cc]['mr_amount'] = flt(row.get('total_amount'))
			summary_dict[cc]['total_amount'] += flt(row.get('total_amount'))
			summary_dict[cc]['mr_count'] = row.get('mr_count') or 0

		for row in po_summary:
			cc = row.get("cost_center") or "Not Set"
			if cc not in summary_dict:
				summary_dict[cc] = {
					'cost_center': cc,
					'mr_amount': 0,
					'po_amount': 0,
					'total_amount': 0,
					'mr_count': 0,
					'po_count': 0
				}
			summary_dict[cc]['po_amount'] = flt(row.get('total_amount'))
			summary_dict[cc]['total_amount'] += flt(row.get('total_amount'))
			summary_dict[cc]['po_count'] = row.get('po_count') or 0

		# Convert to list + attach names
		result = list(summary_dict.values())

		for row in result:
			cc = row.get("cost_center")
			if cc and cc != "Not Set":
				name = None

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

				row["cost_center_name"] = name or cc
			else:
				row["cost_center_name"] = "Not Set"

		result.sort(key=lambda x: x.get('total_amount', 0), reverse=True)
		return result

	except Exception as e:
		frappe.log_error(f"Error in get_summary_data: {str(e)}", "Procurement Expense Error")
		return []

