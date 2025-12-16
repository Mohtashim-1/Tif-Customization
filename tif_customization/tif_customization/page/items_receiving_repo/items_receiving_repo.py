import frappe
from frappe import _
from frappe.utils import flt, getdate


@frappe.whitelist()
def get_mr_items_receiving_data(filters=None):
	"""Get MR Items with acknowledgment status"""
	try:
		if isinstance(filters, str):
			import json
			filters = json.loads(filters)
		elif not filters:
			filters = {}
		
		# Build filters
		conditions = ["mr.docstatus = 1"]  # Only submitted MRs
		params = {}
		
		# Material Request filter
		if filters.get('material_request'):
			conditions.append("mr.name = %(material_request)s")
			params['material_request'] = filters['material_request']
		
		# Item Code filter
		if filters.get('item_code'):
			conditions.append("mri.item_code = %(item_code)s")
			params['item_code'] = filters['item_code']
		
		# Date Range filter
		if filters.get('from_date'):
			conditions.append("mr.transaction_date >= %(from_date)s")
			params['from_date'] = filters['from_date']
		
		if filters.get('to_date'):
			conditions.append("mr.transaction_date <= %(to_date)s")
			params['to_date'] = filters['to_date']
		
		# Query to get MR Items with acknowledgment status
		# Use subquery to properly filter by acknowledgment status
		ack_status_condition = ""
		if filters.get('acknowledgment_status'):
			if filters['acknowledgment_status'] == 'Pending':
				ack_status_condition = "AND ack.name IS NULL"
			elif filters['acknowledgment_status'] == 'Acknowledged':
				ack_status_condition = "AND ack.name IS NOT NULL"
		
		query = f"""
			SELECT 
				mr.name AS material_request,
				mr.transaction_date AS mr_date,
				mri.name AS material_request_item,
				mri.item_code,
				mri.item_name,
				mri.qty AS requested_qty,
				mri.stock_qty AS requested_stock_qty,
				mri.uom,
				mri.stock_uom,
				COALESCE(SUM(pr_item.qty), 0) AS received_qty,
				COALESCE(SUM(pr_item.stock_qty), 0) AS received_stock_qty,
				poi.parent AS purchase_order,
				CASE 
					WHEN ack.status = 'Acknowledged' THEN 'Acknowledged'
					ELSE 'Pending'
				END AS acknowledgment_status,
				ack.acknowledged_date AS acknowledgment_date,
				ack.acknowledged_by AS acknowledged_by,
				ack.name AS acknowledgment_name
			FROM `tabMaterial Request` mr
			INNER JOIN `tabMaterial Request Item` mri ON mri.parent = mr.name
			INNER JOIN `tabAcknowledgment` ack ON ack.material_request = mr.name 
				AND ack.docstatus != 2
			LEFT JOIN `tabPurchase Order Item` poi ON poi.material_request_item = mri.name
			LEFT JOIN `tabPurchase Receipt Item` pr_item ON pr_item.purchase_order_item = poi.name 
				AND pr_item.docstatus = 1
			LEFT JOIN `tabPurchase Receipt` pr ON pr.name = pr_item.parent AND pr.docstatus = 1
			WHERE {' AND '.join(conditions)} {ack_status_condition}
			GROUP BY mr.name, mri.name, mri.item_code, mri.item_name, mri.qty, mri.stock_qty, 
				mri.uom, mri.stock_uom, mr.transaction_date, poi.parent, ack.status, 
				ack.acknowledged_date, ack.acknowledged_by, ack.name
			ORDER BY mr.transaction_date DESC, mr.name DESC, mri.item_code
		"""
		
		results = frappe.db.sql(query, params, as_dict=True)
		
		# Calculate pending qty and format data
		for row in results:
			# Use stock_qty for calculations if available, else use qty
			requested = flt(row.get('requested_stock_qty') or row.get('requested_qty'))
			received = flt(row.get('received_stock_qty') or row.get('received_qty'))
			row['pending_qty'] = requested - received
			row['pending_qty'] = max(0, row['pending_qty'])  # Don't show negative
			
			# Format dates
			if row.get('acknowledgment_date'):
				row['acknowledgment_date'] = str(row['acknowledgment_date'])
			if row.get('mr_date'):
				row['mr_date'] = str(row['mr_date'])
		
		# Get unique MR and PO counts
		unique_mrs = set()
		unique_pos = set()
		
		for row in results:
			if row.get('material_request'):
				unique_mrs.add(row['material_request'])
			if row.get('purchase_order'):
				unique_pos.add(row['purchase_order'])
		
		return {
			'data': results,
			'total_count': len(results),
			'pending_count': len([r for r in results if r['acknowledgment_status'] == 'Pending']),
			'acknowledged_count': len([r for r in results if r['acknowledgment_status'] == 'Acknowledged']),
			'mr_count': len(unique_mrs),
			'po_count': len(unique_pos),
			'total_documents': len(unique_mrs) + len(unique_pos)
		}
	
	except Exception as e:
		frappe.log_error(f"Error in get_mr_items_receiving_data: {str(e)}", "MR Items Receiving Error")
		return {'error': str(e), 'data': []}


@frappe.whitelist()
def acknowledge_mr_item(material_request_item, remarks=""):
	"""Acknowledge receiving of MR Item"""
	try:
		# Get MR Item details
		mr_item = frappe.get_doc("Material Request Item", material_request_item)
		mr_doc = frappe.get_doc("Material Request", mr_item.parent)
		
		# Check if acknowledgment already exists
		existing_ack = frappe.db.exists(
			"Acknowledgment",
			{
				"material_request": mr_doc.name,
				"status": "Acknowledged",
				"docstatus": 1
			}
		)
		
		if existing_ack:
			# Update existing acknowledgment
			ack_doc = frappe.get_doc("Acknowledgment", existing_ack)
		else:
			# Get Purchase Receipt for this MR
			pr_list = frappe.db.sql("""
				SELECT DISTINCT pr.name
				FROM `tabPurchase Receipt` pr
				INNER JOIN `tabPurchase Receipt Item` pr_item ON pr_item.parent = pr.name
				INNER JOIN `tabPurchase Order Item` poi ON poi.name = pr_item.purchase_order_item
				WHERE poi.material_request_item = %s
				AND pr.docstatus = 1
				ORDER BY pr.creation DESC
				LIMIT 1
			""", (material_request_item,), as_dict=True)
			
			pr_name = pr_list[0].name if pr_list else None
			
			# Get Purchase Order
			po_list = frappe.db.sql("""
				SELECT DISTINCT po.name
				FROM `tabPurchase Order` po
				INNER JOIN `tabPurchase Order Item` poi ON poi.parent = po.name
				WHERE poi.material_request_item = %s
				AND po.docstatus = 1
				ORDER BY po.creation DESC
				LIMIT 1
			""", (material_request_item,), as_dict=True)
			
			po_name = po_list[0].name if po_list else None
			
			# Create new acknowledgment
			ack_doc = frappe.get_doc({
				"doctype": "Acknowledgment",
				"purchase_receipt": pr_name,
				"purchase_order": po_name,
				"material_request": mr_doc.name,
				"requested_by": mr_doc.owner,
				"status": "Pending",
				"items": []
			})
			
			# Add items from Purchase Receipt if available
			if pr_name:
				pr_doc = frappe.get_doc("Purchase Receipt", pr_name)
				for pr_item in pr_doc.items:
					if pr_item.material_request_item == material_request_item:
						ack_doc.append("items", {
							"item_code": pr_item.item_code,
							"item_name": pr_item.item_name,
							"qty": pr_item.qty,
							"warehouse": pr_item.warehouse,
							"uom": pr_item.uom
						})
			
			ack_doc.insert(ignore_permissions=True)
		
		# Update acknowledgment
		ack_doc.status = "Acknowledged"
		ack_doc.acknowledged_by = frappe.session.user
		ack_doc.acknowledged_date = frappe.utils.now_datetime()
		ack_doc.acknowledgment_remarks = remarks
		ack_doc.save(ignore_permissions=True)
		ack_doc.submit()
		
		return {
			"status": "success",
			"message": _("MR Item acknowledged successfully"),
			"acknowledgment": ack_doc.name
		}
	
	except Exception as e:
		frappe.log_error(f"Error acknowledging MR Item {material_request_item}: {str(e)}", "MR Item Acknowledgment Error")
		return {
			"status": "error",
			"message": str(e)
		}
