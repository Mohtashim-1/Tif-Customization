import frappe
from frappe.model.document import Document

@frappe.whitelist()
def get_rate_from_courier(doc, method):
    if doc.custom_delivery_mode=="Courier":
        # Clear existing child table entries
        doc.custom_courier_charges = []
        
        # Get all Courier Rate documents
        courier_rates = frappe.get_all("Courier Rate", fields=["name", "courier", "courier_service"])
        
        for courier_rate in courier_rates:
            courier_doc = frappe.get_doc("Courier Rate", courier_rate.name)
            # Find matching rate for the weight
            for slab in courier_doc.courier_slab:
                if doc.custom_total_delivery_weightage > slab.from_weight and doc.custom_total_delivery_weightage <= slab.to_weight:
                    # Add entry to child table
                    doc.append("custom_courier_charges", {
                        "courier": courier_rate.courier,
                        "courier_service": courier_rate.courier_service,
                        "rate": slab.rate
                    })
                    break
        
        # Set the selected courier's rate if specified
        if doc.custom_courier and doc.custom_courier_service:
            courier_rate = frappe.get_doc("Courier Rate", {
                "courier": doc.custom_courier,
                "courier_service": doc.custom_courier_service
            })
            if courier_rate:
                for slab in courier_rate.courier_slab:
                    if doc.custom_total_delivery_weightage > slab.from_weight and doc.custom_total_delivery_weightage <= slab.to_weight:
                        doc.custom_delivery_rate = slab.rate
                        break
        else:
            doc.custom_delivery_rate = 0
    else:
        doc.custom_delivery_rate = 0
        doc.custom_courier_charges = []

    