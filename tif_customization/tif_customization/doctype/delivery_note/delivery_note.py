import frappe
from frappe.model.document import Document

@frappe.whitelist()
def get_rate_from_courier(doc, method):
    if doc.custom_delivery_mode=="Courier":
        if doc.custom_courier:
            # Get the Courier Rate document
            courier_rate = frappe.get_doc("Courier Rate", {"courier": doc.custom_courier,"courier_service":doc.custom_courier_service})
            if courier_rate:
                # Iterate through the courier_slab child table
                for slab in courier_rate.courier_slab:
                    if doc.custom_total_delivery_weightage > slab.from_weight and doc.custom_total_delivery_weightage <= slab.to_weight:
                        doc.custom_delivery_rate = slab.rate
                        break
        else:
            doc.custom_delivery_rate = 0
    else:
        doc.custom_delivery_rate = 0

    