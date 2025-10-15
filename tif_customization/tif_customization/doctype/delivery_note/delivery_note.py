import frappe
from frappe.model.document import Document
from frappe.utils import getdate, nowdate
from frappe.utils.data import flt

@frappe.whitelist()
def get_rate_from_courier(doc, method):
    """Function to fetch courier rates - can be called manually via button or automatically"""
    if doc.custom_delivery_mode=="Courier":
        # Store existing selections
        existing_selections = {}
        if doc.custom_courier_charges:
            for charge in doc.custom_courier_charges:
                key = f"{charge.courier}-{charge.courier_service}"
                existing_selections[key] = charge.select
        
        # Clear existing child table entries
        doc.custom_courier_charges = []
        
        # Get all Courier Rate documents
        courier_rates = frappe.get_all("Courier Rate", fields=["name", "courier", "courier_service","zone", "rate_type"])
        
        for courier_rate in courier_rates:
            courier_doc = frappe.get_doc("Courier Rate", courier_rate.name)
            # Find matching rate for the weight
            for slab in courier_doc.courier_slab:
                if doc.custom_total_delivery_weightage > slab.from_weight and doc.custom_total_delivery_weightage <= slab.to_weight:
                    # Check if this courier was previously selected
                    key = f"{courier_rate.courier}-{courier_rate.courier_service}"
                    is_selected = existing_selections.get(key, False)
                    
                    # Calculate rate based on rate_type
                    if courier_doc.rate_type == "Flat":
                        calculated_rate = flt(slab.rate)
                    else:  # rate_type == "Kg"
                        calculated_rate = flt(slab.rate) * flt(doc.custom_total_delivery_weightage)
                    
                    # Add entry to child table
                    doc.append("custom_courier_charges", {
                        "courier": courier_rate.courier,
                        "courier_service": courier_rate.courier_service,
                        "rate": calculated_rate,
                        "select": is_selected
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
                        # Calculate rate based on rate_type
                        if courier_rate.rate_type == "Flat":
                            doc.custom_delivery_rate = flt(slab.rate)
                        else:  # rate_type == "Kg"
                            doc.custom_delivery_rate = flt(slab.rate) * flt(doc.custom_total_delivery_weightage)
                        # frappe.msgprint(f"Courier Charges Select Values: {[(c.courier, c.courier_service, c.rate, c.select) for c in doc.custom_courier_charges]}")

                        break
        else:
            doc.custom_delivery_rate = 0
    else:
        doc.custom_delivery_rate = 0
        doc.custom_courier_charges = []

@frappe.whitelist()
def fetch_courier_rates(docname):
    """Custom function to fetch courier rates via button click"""
    doc = frappe.get_doc("Delivery Note", docname)
    
    if not doc.custom_delivery_mode == "Courier":
        frappe.msgprint("Please select 'Courier' as delivery mode first.")
        return
    
    if not doc.custom_total_delivery_weightage:
        frappe.msgprint("Please enter the total delivery weightage first.")
        return
    
    # Call the existing function
    get_rate_from_courier(doc, None)
    
    # Save the document
    doc.save()
    
    frappe.msgprint("Courier rates fetched successfully!")
    return doc

def on_update(doc, method):
    # Debug print: show all select values in child table
    # frappe.msgprint(f"Courier Charges Select Values: {[(c.courier, c.courier_service, c.rate, c.select) for c in doc.custom_courier_charges]}")
    if doc.custom_delivery_mode == "Courier" and doc.custom_courier_charges:
        # Find all selected charges
        selected_charges = []
        for charge in doc.custom_courier_charges:
            # Accepts True, 1, "1", "Yes", etc.
            if str(charge.select) in ("1", "Yes", "true", "True", "on", "checked") or charge.select is True or charge.select == 1:
                selected_charges.append(charge)
        
        # If multiple charges are selected, keep only the last one and unselect others
        if len(selected_charges) > 1:
            frappe.msgprint(f"Multiple charges selected. Keeping only the last selected charge.")
            # Unselect all charges first
            for charge in doc.custom_courier_charges:
                charge.select = 0
            
            # Select only the last selected charge
            selected_charges[-1].select = 1
            selected_charge = selected_charges[-1]
            frappe.msgprint(f"Selected Charge: {selected_charge.courier} - {selected_charge.courier_service} - {selected_charge.rate}")
        elif len(selected_charges) == 1:
            selected_charge = selected_charges[0]
            frappe.msgprint(f"Selected Charge: {selected_charge.courier} - {selected_charge.courier_service} - {selected_charge.rate}")
        else:
            selected_charge = None
            frappe.msgprint("No courier charge selected.")
        
        if selected_charge:
            doc.custom_delivery_rate = selected_charge.rate
            if doc.custom_courier_mode_of_payment:
                frappe.msgprint(f"Creating Journal Entry for mode: {doc.custom_courier_mode_of_payment}")
                create_journal_entry(doc, selected_charge)
            else:
                frappe.msgprint("No mode of payment selected, not creating Journal Entry.")
        else:
            frappe.msgprint("No courier charge selected.")

def on_submit(doc, method):
    """Handle delivery note submission - process courier charges if applicable"""
    if doc.custom_delivery_mode == "Courier" and doc.custom_courier_charges:
        # Find the selected charge
        selected_charge = None
        for charge in doc.custom_courier_charges:
            if str(charge.select) in ("1", "Yes", "true", "True", "on", "checked") or charge.select is True or charge.select == 1:
                selected_charge = charge
                break
        
        if selected_charge and doc.custom_courier_mode_of_payment:
            frappe.msgprint(f"Creating Journal Entry for courier charges on submission")
            create_journal_entry(doc, selected_charge)

def create_journal_entry(doc, selected_charge):
    if doc.custom_courier_mode_of_payment == "Cash":
        # Get company settings for cash account
        company_settings = frappe.get_doc("Company", doc.company)
        cash_account = company_settings.default_cash_account
        
        # Get courier account from Courier doctype
        courier_doc = frappe.get_doc("Courier", selected_charge.courier)
        courier_account = courier_doc.account
        courier_party = courier_doc.supplier
        
        if not (cash_account and courier_account):
            frappe.throw("Please set Cash Account in Company Settings and Account in Courier doctype")
        
        # Create Journal Entry
        je = frappe.new_doc("Journal Entry")
        je.voucher_type = "Journal Entry"
        je.posting_date = getdate(nowdate())
        je.company = doc.company
        je.cheque_no = doc.name
        je.cheque_date = getdate(nowdate())
        je.user_remark = f"Courier charges for   {doc.name}"
        
        # Add debit entry
        je.append("accounts", {
            "account": courier_account,
            "debit_in_account_currency": doc.custom_delivery_rate,
            "credit_in_account_currency": 0,
            "cost_center":doc.custom_supply_chain_cost_center
            # "party_type": "Customer",
            # "party": doc.customer
        })
        
        # Add credit entry
        je.append("accounts", {
            "account": cash_account,
            "debit_in_account_currency": 0,
            "credit_in_account_currency": doc.custom_delivery_rate,
            "cost_center":doc.custom_supply_chain_cost_center
        })
        
        je.insert()
        je.submit()
    else:
        # Get company settings for payable account
        company_settings = frappe.get_doc("Company", doc.company)
        payable_account = company_settings.default_payable_account
        
        # Get courier account from Courier doctype
        courier_doc = frappe.get_doc("Courier", selected_charge.courier)
        courier_account = courier_doc.account
        courier_party = courier_doc.supplier
        
        # Debug print for payable account and party
        frappe.msgprint(f"Payable Account: {payable_account}, Party Type: Supplier, Party: {courier_party}")
        
        if not payable_account:
            frappe.throw("Please set Payable Account in Company Settings.")
        if not courier_account:
            frappe.throw("Please set Account in Courier doctype.")
        if not courier_party:
            frappe.throw("Supplier is not set for the selected Courier. Please set it in the Courier doctype.")
        
        # Create Journal Entry
        je = frappe.new_doc("Journal Entry")
        je.voucher_type = "Journal Entry"
        je.posting_date = getdate(nowdate())
        je.company = doc.company
        je.cheque_no = doc.name
        je.cheque_date = getdate(nowdate())
        je.user_remark = f"Courier charges for {doc.name}"
        
        # Add debit entry
        je.append("accounts", {
            "account": courier_account,
            "debit_in_account_currency": doc.custom_delivery_rate,
            "credit_in_account_currency": 0,
            # "party_type": "Customer",
            # "party": doc.customer
        })
        
        # Add credit entry (with party_type and party)
        je.append("accounts", {
            "account": payable_account,
            "debit_in_account_currency": 0,
            "credit_in_account_currency": doc.custom_delivery_rate,
            "party_type": "Supplier",
            "party": courier_party
        })
        
        je.insert()
        je.submit()

@frappe.whitelist()
def sum_of_cartons(doc, method):
    total_cartons = 0
    for item in doc.items:
        total_cartons += item.custom_cartons
    doc.custom_total_cartons = total_cartons
    # doc.save()