import frappe
from frappe import _


def on_submit(doc, method):
	"""Auto-create Acknowledgment when Purchase Receipt is submitted"""
	try:
		# Debug: Log that hook is being called
		frappe.log_error(f"Purchase Receipt on_submit hook called for {doc.name}", "Acknowledgment Debug")
		
		# Get unique Material Requests from Purchase Receipt items
		material_requests = {}
		
		for item in doc.items:
			material_request = None
			
			# Try to get material_request from PR item first
			if item.material_request:
				material_request = item.material_request
			# If not found, try to get from Purchase Order Item
			elif item.purchase_order_item:
				material_request = frappe.db.get_value(
					"Purchase Order Item",
					item.purchase_order_item,
					"material_request"
				)
			# If still not found, try to get from Purchase Order
			elif item.purchase_order:
				# Get all MRs from PO items
				mr_list = frappe.db.get_all(
					"Purchase Order Item",
					filters={"parent": item.purchase_order},
					fields=["material_request"],
					distinct=True
				)
				if mr_list and mr_list[0].material_request:
					material_request = mr_list[0].material_request
			
			# Debug: Log material request found
			if material_request:
				frappe.log_error(f"Found Material Request {material_request} for item {item.item_code}", "Acknowledgment Debug")
			else:
				frappe.log_error(f"No Material Request found for item {item.item_code} in PR {doc.name}", "Acknowledgment Debug")
			
			if material_request:
				# Get Material Request details (only once per MR)
				if material_request not in material_requests:
					try:
						mr_doc = frappe.get_doc("Material Request", material_request)
						
						# Get Purchase Order from item
						po = item.purchase_order
						
						# Initialize Material Request data
						material_requests[material_request] = {
							'material_request': material_request,
							'purchase_order': po,
							'purchase_receipt': doc.name,
							'requested_by': mr_doc.owner,  # User who created the MR
							'items': []
						}
					except Exception as e:
						frappe.log_error(f"Error getting MR {material_request}: {str(e)}", "Acknowledgment Debug")
						continue
				
				# Add item to the list for this Material Request
				material_requests[material_request]['items'].append({
					'item_code': item.item_code,
					'item_name': item.item_name,
					'qty': item.qty,
					'warehouse': item.warehouse,
					'uom': item.uom
				})
		
		# Debug: Log how many MRs found
		frappe.log_error(f"Found {len(material_requests)} Material Request(s) in PR {doc.name}", "Acknowledgment Debug")
		
		if not material_requests:
			frappe.log_error(f"No Material Requests found in Purchase Receipt {doc.name}. Items may not be linked to Material Requests.", "Acknowledgment Debug")
			frappe.msgprint(
				_("No Material Requests found in Purchase Receipt items. Acknowledgment will not be created."),
				indicator="orange",
				alert=True
			)
			return
		
		# Create Acknowledgment for each Material Request
		for mr_name, mr_data in material_requests.items():
			# Check if acknowledgment already exists for this Purchase Receipt and Material Request
			existing_ack = frappe.db.exists(
				"Acknowledgment",
				{
					"purchase_receipt": doc.name,
					"material_request": mr_name,
					"docstatus": ["!=", 2]  # Not cancelled
				}
			)
			
			if existing_ack:
				frappe.log_error(f"Acknowledgment already exists: {existing_ack} for MR {mr_name}", "Acknowledgment Debug")
				continue
			
			try:
				# Create new Acknowledgment
				ack_doc = frappe.get_doc({
					"doctype": "Acknowledgment",
					"purchase_receipt": mr_data['purchase_receipt'],
					"purchase_order": mr_data['purchase_order'],
					"material_request": mr_data['material_request'],
					"requested_by": mr_data['requested_by'],
					"status": "Pending",
					"items": []
				})
				
				# Add items
				for item_data in mr_data['items']:
					ack_doc.append("items", {
						"item_code": item_data['item_code'],
						"item_name": item_data['item_name'],
						"qty": item_data['qty'],
						"warehouse": item_data['warehouse'],
						"uom": item_data['uom']
					})
				
				# Save the acknowledgment
				ack_doc.insert(ignore_permissions=True)
				
				frappe.log_error(f"Successfully created Acknowledgment {ack_doc.name} for MR {mr_name}", "Acknowledgment Debug")
				
				frappe.msgprint(
					_("Acknowledgment {0} created for Material Request {1}").format(
						frappe.bold(ack_doc.name),
						frappe.bold(mr_name)
					),
					indicator="green",
					alert=True
				)
			except Exception as e:
				frappe.log_error(f"Error creating Acknowledgment for MR {mr_name}: {str(e)}", "Acknowledgment Creation Error")
				frappe.msgprint(
					_("Error creating Acknowledgment for Material Request {0}: {1}").format(mr_name, str(e)),
					indicator="red",
					alert=True
				)
	
	except Exception as e:
		frappe.log_error(f"Error creating Acknowledgment from Purchase Receipt {doc.name}: {str(e)}", "Acknowledgment Creation Error")
		# Don't block Purchase Receipt submission if acknowledgment creation fails
		frappe.msgprint(
			_("Warning: Could not create Acknowledgment. Please create manually. Error: {0}").format(str(e)),
			indicator="orange",
			alert=True
		)
