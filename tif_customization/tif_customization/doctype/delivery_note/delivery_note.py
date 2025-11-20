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
        
        # Get all submitted Courier Rate documents
        courier_rates = frappe.get_all("Courier Rate", 
            filters={"docstatus": 1}, 
            fields=["name", "courier", "courier_service","zone", "rate_type"])
        
        for courier_rate in courier_rates:
            courier_doc = frappe.get_doc("Courier Rate", courier_rate.name)
            # Find matching rate for the weight
            for slab in courier_doc.courier_slab:
                if doc.custom_total_delivery_weightage >= slab.from_weight and doc.custom_total_delivery_weightage <= slab.to_weight:
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
            # Find the submitted Courier Rate document by courier and courier_service
            courier_rate_name = frappe.db.get_value("Courier Rate", 
                {"courier": doc.custom_courier, "courier_service": doc.custom_courier_service, "docstatus": 1}, 
                "name")
            
            if courier_rate_name:
                courier_rate = frappe.get_doc("Courier Rate", courier_rate_name)
                for slab in courier_rate.courier_slab:
                    if doc.custom_total_delivery_weightage >= slab.from_weight and doc.custom_total_delivery_weightage <= slab.to_weight:
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
    elif doc.custom_delivery_mode == "Courier" and doc.custom_delivery_rate and doc.custom_delivery_rate > 0 and doc.custom_courier_mode_of_payment:
        # Handle custom_delivery_rate when set directly (without courier_charges table)
        frappe.msgprint(f"Creating Journal Entry for delivery rate on submission")
        create_journal_entry(doc)
    
    # Handle transport charges if delivery mode is Transport
    elif doc.custom_delivery_mode == "Transport" and doc.custom_transport_charges:
        frappe.msgprint(f"Creating Journal Entry for transport charges on submission")
        create_transport_journal_entry(doc)
    
    # Handle delivery rate entry table
    if doc.custom_delivery_rate_entry and len(doc.custom_delivery_rate_entry) > 0:
        frappe.msgprint(f"Creating Journal Entry for delivery rate entry on submission")
        create_delivery_rate_entry_journal_entry(doc)
    
    # Send delivery confirmation email to school
    send_delivery_confirmation_email(doc)

def create_journal_entry(doc, selected_charge=None):
    """Create Journal Entry for custom_delivery_rate based on payment mode"""
    
    # Check if delivery rate is set
    if not doc.custom_delivery_rate or doc.custom_delivery_rate <= 0:
        frappe.msgprint("No delivery rate found or amount is zero.")
        return
    
    # Check if courier is set
    if not doc.custom_courier:
        frappe.throw("Please select a Courier first.")
    
    # Get courier account from Courier doctype
    courier_doc = frappe.get_doc("Courier", doc.custom_courier)
    courier_account = courier_doc.account
    courier_party = courier_doc.supplier
    
    if not courier_account:
        frappe.throw("Please set Account in Courier doctype.")
    
    # Get company settings
    company_settings = frappe.get_doc("Company", doc.company)
    
    # Create Journal Entry
    je = frappe.new_doc("Journal Entry")
    je.voucher_type = "Journal Entry"
    je.posting_date = getdate(nowdate())
    je.company = doc.company
    je.cheque_no = doc.name
    je.cheque_date = getdate(nowdate())
    je.user_remark = f"Courier charges for {doc.name}"
    
    # Check payment mode
    if doc.custom_courier_mode_of_payment == "Cash":
        # Cash payment: Credit Cash, Debit Courier Account
        cash_account = company_settings.default_cash_account
        
        if not cash_account:
            frappe.throw("Please set Cash Account in Company Settings.")
        
        # Add debit entry (Courier Account)
        je.append("accounts", {
            "account": courier_account,
            "debit_in_account_currency": doc.custom_delivery_rate,
            "credit_in_account_currency": 0,
            "cost_center": doc.custom_supply_chain_cost_center if hasattr(doc, 'custom_supply_chain_cost_center') and doc.custom_supply_chain_cost_center else None
        })
        
        # Add credit entry (Cash Account)
        je.append("accounts", {
            "account": cash_account,
            "debit_in_account_currency": 0,
            "credit_in_account_currency": doc.custom_delivery_rate,
            "cost_center": doc.custom_supply_chain_cost_center if hasattr(doc, 'custom_supply_chain_cost_center') and doc.custom_supply_chain_cost_center else None
        })
    else:
        # Non-cash payment: Debit Courier Account (expense), Credit Payable Account (liability)
        payable_account = company_settings.default_payable_account
        
        if not payable_account:
            frappe.throw("Please set Payable Account in Company Settings.")
        if not courier_party:
            frappe.throw("Supplier is not set for the selected Courier. Please set it in the Courier doctype.")
        
        # Add debit entry (Courier Account - Expense)
        je.append("accounts", {
            "account": courier_account,
            "debit_in_account_currency": doc.custom_delivery_rate,
            "credit_in_account_currency": 0,
            "cost_center": doc.custom_supply_chain_cost_center if hasattr(doc, 'custom_supply_chain_cost_center') and doc.custom_supply_chain_cost_center else None
        })
        
        # Add credit entry (Payable Account - Liability with party)
        je.append("accounts", {
            "account": payable_account,
            "debit_in_account_currency": 0,
            "credit_in_account_currency": doc.custom_delivery_rate,
            "party_type": "Supplier",
            "party": courier_party,
            "cost_center": doc.custom_supply_chain_cost_center if hasattr(doc, 'custom_supply_chain_cost_center') and doc.custom_supply_chain_cost_center else None
        })
    
    je.insert()
    je.submit()
    
    # Store Journal Entry name in custom field (if field exists)
    try:
        frappe.db.set_value("Delivery Note", doc.name, "custom_courier_journal_entry", je.name, update_modified=False)
    except Exception:
        # Field doesn't exist yet, will be created manually
        pass
    
    # Add connection from Delivery Note to Journal Entry
    delivery_note_doc = frappe.get_doc("Delivery Note", doc.name)
    delivery_note_doc.add_comment("Info", f"Journal Entry <a href='/app/journal-entry/{je.name}'>{je.name}</a> created for courier charges")
    
    frappe.msgprint(f"Journal Entry {je.name} created successfully for delivery rate of {doc.custom_delivery_rate}")

def create_transport_journal_entry(doc):
    """Create Journal Entry for transport charges - cash payment to transport expense account"""
    
    # Calculate total amount from custom_transport_charges table
    total_amount = 0
    for charge in doc.custom_transport_charges:
        if charge.amount:
            total_amount += flt(charge.amount)
    
    if total_amount <= 0:
        frappe.msgprint("No transport charges found or total amount is zero.")
        return
    
    # Get company settings for cash account
    company_settings = frappe.get_doc("Company", doc.company)
    cash_account = company_settings.default_cash_account
    
    # Get transport account from Transport doctype
    if not doc.custom_transport:
        frappe.throw("Please select a Transport first.")
    
    transport_doc = frappe.get_doc("Transport", doc.custom_transport)
    transport_account = transport_doc.account
    
    if not cash_account:
        frappe.throw("Please set Cash Account in Company Settings.")
    if not transport_account:
        frappe.throw("Please set Account in Transport doctype.")
    
    # Create Journal Entry
    je = frappe.new_doc("Journal Entry")
    je.voucher_type = "Journal Entry"
    je.posting_date = getdate(nowdate())
    je.company = doc.company
    je.cheque_no = doc.name
    je.cheque_date = getdate(nowdate())
    je.user_remark = f"Transport charges for {doc.name}"
    
    # Add debit entry (Transport Expense Account)
    je.append("accounts", {
        "account": transport_account,
        "debit_in_account_currency": total_amount,
        "credit_in_account_currency": 0,
        "cost_center": doc.custom_supply_chain_cost_center if hasattr(doc, 'custom_supply_chain_cost_center') else None
    })
    
    # Add credit entry (Cash Account)
    je.append("accounts", {
        "account": cash_account,
        "debit_in_account_currency": 0,
        "credit_in_account_currency": total_amount,
        "cost_center": doc.custom_supply_chain_cost_center if hasattr(doc, 'custom_supply_chain_cost_center') else None
    })
    
    je.insert()
    je.submit()
    
    # Add connection from Delivery Note to Journal Entry
    delivery_note_doc = frappe.get_doc("Delivery Note", doc.name)
    delivery_note_doc.add_comment("Info", f"Journal Entry <a href='/app/journal-entry/{je.name}'>{je.name}</a> created for transport charges")
    
    frappe.msgprint(f"Journal Entry {je.name} created successfully for transport charges of {total_amount}")

def create_delivery_rate_entry_journal_entry(doc):
    """Create Journal Entry for delivery rate entry table based on payment mode"""
    
    # Calculate total amount from custom_delivery_rate_entry table
    total_amount = 0
    for entry in doc.custom_delivery_rate_entry:
        if entry.amount:
            total_amount += flt(entry.amount)
    
    if total_amount <= 0:
        frappe.msgprint("No delivery rate entry found or total amount is zero.")
        return
    
    # Check if courier is set
    if not doc.custom_courier:
        frappe.throw("Please select a Courier first.")
    
    # Get courier account from Courier doctype
    courier_doc = frappe.get_doc("Courier", doc.custom_courier)
    courier_account = courier_doc.account
    courier_party = courier_doc.supplier
    
    if not courier_account:
        frappe.throw("Please set Account in Courier doctype.")
    
    # Get company settings
    company_settings = frappe.get_doc("Company", doc.company)
    
    # Create Journal Entry
    je = frappe.new_doc("Journal Entry")
    je.voucher_type = "Journal Entry"
    je.posting_date = getdate(nowdate())
    je.company = doc.company
    je.cheque_no = doc.name
    je.cheque_date = getdate(nowdate())
    je.user_remark = f"Delivery rate entry charges for {doc.name}"
    
    # Check payment mode
    if doc.custom_courier_mode_of_payment == "Cash":
        # Cash payment: Credit Cash, Debit Courier Account
        cash_account = company_settings.default_cash_account
        
        if not cash_account:
            frappe.throw("Please set Cash Account in Company Settings.")
        
        # Add debit entry (Courier Account)
        je.append("accounts", {
            "account": courier_account,
            "debit_in_account_currency": total_amount,
            "credit_in_account_currency": 0,
            "cost_center": doc.custom_supply_chain_cost_center if hasattr(doc, 'custom_supply_chain_cost_center') and doc.custom_supply_chain_cost_center else None
        })
        
        # Add credit entry (Cash Account)
        je.append("accounts", {
            "account": cash_account,
            "debit_in_account_currency": 0,
            "credit_in_account_currency": total_amount,
            "cost_center": doc.custom_supply_chain_cost_center if hasattr(doc, 'custom_supply_chain_cost_center') and doc.custom_supply_chain_cost_center else None
        })
    else:
        # Non-cash payment: Debit Courier Account (expense), Credit Payable Account (liability)
        payable_account = company_settings.default_payable_account
        
        if not payable_account:
            frappe.throw("Please set Payable Account in Company Settings.")
        if not courier_party:
            frappe.throw("Supplier is not set for the selected Courier. Please set it in the Courier doctype.")
        
        # Add debit entry (Courier Account - Expense)
        je.append("accounts", {
            "account": courier_account,
            "debit_in_account_currency": total_amount,
            "credit_in_account_currency": 0,
            "cost_center": doc.custom_supply_chain_cost_center if hasattr(doc, 'custom_supply_chain_cost_center') and doc.custom_supply_chain_cost_center else None
        })
        
        # Add credit entry (Payable Account - Liability with party)
        je.append("accounts", {
            "account": payable_account,
            "debit_in_account_currency": 0,
            "credit_in_account_currency": total_amount,
            "party_type": "Supplier",
            "party": courier_party,
            "cost_center": doc.custom_supply_chain_cost_center if hasattr(doc, 'custom_supply_chain_cost_center') and doc.custom_supply_chain_cost_center else None
        })
    
    je.insert()
    je.submit()
    
    # Add connection from Delivery Note to Journal Entry
    delivery_note_doc = frappe.get_doc("Delivery Note", doc.name)
    delivery_note_doc.add_comment("Info", f"Journal Entry <a href='/app/journal-entry/{je.name}'>{je.name}</a> created for delivery rate entry charges")
    
    frappe.msgprint(f"Journal Entry {je.name} created successfully for delivery rate entry charges of {total_amount}")

def send_delivery_confirmation_email(doc):
    """Send delivery confirmation email to school (customer)"""
    try:
        if not doc.customer:
            return
        
        # Get customer details
        customer_name = doc.customer_name or doc.customer
        
        # Get contacts linked to this customer
        contacts = frappe.get_all(
            "Dynamic Link",
            filters={
                "link_doctype": "Customer",
                "link_name": doc.customer,
                "parenttype": "Contact"
            },
            fields=["parent"]
        )
        
        if not contacts:
            frappe.log_error(f"No contacts found for customer {doc.customer}", "Delivery Confirmation Email")
            return
        
        # Collect all email addresses from contacts
        email_list = []
        for contact_link in contacts:
            contact_name = contact_link.parent
            contact_doc = frappe.get_doc("Contact", contact_name)
            
            # Get emails from email_ids child table
            if contact_doc.email_ids:
                for email_row in contact_doc.email_ids:
                    if email_row.email_id and email_row.email_id not in email_list:
                        email_list.append(email_row.email_id)
        
        if not email_list:
            frappe.log_error(f"No email addresses found for customer {doc.customer}", "Delivery Confirmation Email")
            return
        
        # Prepare email content
        subject = f"Delivery Confirmation - Delivery Note {doc.name}"
        
        # Get delivery details
        delivery_date = doc.posting_date.strftime("%d-%m-%Y") if doc.posting_date else "N/A"
        delivery_mode = doc.custom_delivery_mode or "N/A"
        courier = doc.custom_courier or "N/A"
        tracking_no = doc.custom_shipment_tracking_no or "N/A"
        city = doc.custom_city or "N/A"
        
        # Build items list
        items_html = ""
        if doc.items:
            items_html = "<table style='width: 100%; border-collapse: collapse; margin: 15px 0;'>"
            items_html += "<thead><tr style='background-color: #f0f0f0;'>"
            items_html += "<th style='padding: 10px; text-align: left; border: 1px solid #ddd;'>Item Code</th>"
            items_html += "<th style='padding: 10px; text-align: left; border: 1px solid #ddd;'>Item Name</th>"
            items_html += "<th style='padding: 10px; text-align: right; border: 1px solid #ddd;'>Quantity</th>"
            items_html += "</tr></thead><tbody>"
            
            for item in doc.items:
                items_html += "<tr>"
                items_html += f"<td style='padding: 8px; border: 1px solid #ddd;'>{item.item_code or ''}</td>"
                items_html += f"<td style='padding: 8px; border: 1px solid #ddd;'>{item.item_name or ''}</td>"
                items_html += f"<td style='padding: 8px; text-align: right; border: 1px solid #ddd;'>{item.qty or 0}</td>"
                items_html += "</tr>"
            
            items_html += "</tbody></table>"
        
        # Build message
        message = f"""
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <h2 style="color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px;">
                Delivery Confirmation
            </h2>
            
            <p>Dear {customer_name},</p>
            
            <p>We are pleased to inform you that your delivery has been successfully completed.</p>
            
            <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <h3 style="color: #2c3e50; margin-top: 0;">Delivery Details:</h3>
                <table style="width: 100%;">
                    <tr>
                        <td style="padding: 5px 0; font-weight: bold; width: 200px;">Delivery Note Number:</td>
                        <td style="padding: 5px 0;">{doc.name}</td>
                    </tr>
                    <tr>
                        <td style="padding: 5px 0; font-weight: bold;">Delivery Date:</td>
                        <td style="padding: 5px 0;">{delivery_date}</td>
                    </tr>
                    <tr>
                        <td style="padding: 5px 0; font-weight: bold;">Delivery Mode:</td>
                        <td style="padding: 5px 0;">{delivery_mode}</td>
                    </tr>"""
        
        if courier != 'N/A':
            message += f"""                    <tr>
                        <td style="padding: 5px 0; font-weight: bold;">Courier:</td>
                        <td style="padding: 5px 0;">{courier}</td>
                    </tr>"""
        
        if tracking_no != 'N/A':
            message += f"""                    <tr>
                        <td style="padding: 5px 0; font-weight: bold;">Tracking Number:</td>
                        <td style="padding: 5px 0;">{tracking_no}</td>
                    </tr>"""
        
        message += f"""                    <tr>
                        <td style="padding: 5px 0; font-weight: bold;">City:</td>
                        <td style="padding: 5px 0;">{city}</td>
                    </tr>
                </table>
            </div>"""
        
        if items_html:
            message += f"""
            <h3 style="color: #2c3e50;">Items Delivered:</h3>
            {items_html}"""
        
        message += """
            <p style="margin-top: 30px;">If you have any questions or concerns regarding this delivery, please do not hesitate to contact us.</p>
            
            <p style="margin-top: 20px;">
                Best regards,<br>
                <strong>ILM Foundation</strong><br>
                Supply Chain Team
            </p>
            
            <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
            <p style="font-size: 12px; color: #666;">
                This is an automated confirmation email. Please do not reply to this email.
            </p>
        </div>
        """
        
        # Send email
        frappe.sendmail(
            recipients=email_list,
            subject=subject,
            message=message,
            reference_doctype="Delivery Note",
            reference_name=doc.name,
            now=True
        )
        
        frappe.msgprint(f"Delivery confirmation email sent to {customer_name}")
        
    except Exception as e:
        frappe.log_error(f"Error sending delivery confirmation email: {str(e)}\n{frappe.get_traceback()}", "Delivery Confirmation Email")
        # Don't throw error, just log it so delivery note submission doesn't fail

@frappe.whitelist()
def sum_of_cartons(doc, method):
    total_cartons = 0
    for item in doc.items:
        total_cartons += item.custom_cartons
    doc.custom_total_cartons = total_cartons
    # doc.save()


# want to create jv for table custom_transport_charges if there is a row there with total of amount cash se payment hogi aur transport expense mai payment hojaye gi if custom_delivery_mode = Transport
