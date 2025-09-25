import frappe
import json
from frappe import _

@frappe.whitelist()
def get_employee(doc, method):
    employee = frappe.db.get_value("Employee", {"user_id": doc.owner})
    if employee:
        department = frappe.db.get_value("Employee", employee, "department")
        if department:
            doc.custom_department = department

            # Only attempt to read custom_department_head if the column exists
            if frappe.db.has_column("Department", "custom_department_head"):
                department_head = frappe.db.get_value("Department", department, "custom_department_head")
                
                if department_head:
                    doc.custom_departments_head = department_head
                    department_head_employee = frappe.db.get_value("Employee", department_head, "user_id")
                    
                    if department_head_employee:
                        existing = frappe.db.exists(
                            "ToDo",
                            {
                                "reference_type": "Material Request",
                                "reference_name": doc.name,
                                "allocated_to": department_head_employee,
                                "status": "Open"
                            }
                        )
                        if not existing:
                            frappe.get_doc({
                                "doctype": "ToDo",
                                "reference_type": "Material Request",
                                "description": f"Title: {doc.title} \n Material Request {doc.name} is created by {doc.owner}",
                                "allocated_to": department_head_employee,
                                "assigned_by": doc.owner,
                                "status": "Open",
                                "priority": "Medium",
                                "expiry_date": doc.transaction_date,
                                "reference_name": doc.name
                            }).insert()
            # else: silently skip if the custom field is not present
