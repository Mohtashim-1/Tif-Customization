import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint, getdate, nowdate
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
	# Keep selection sync only — do not create Journal Entry on save.
	# Courier JV is posted via post_courier_amount after partner bill is received.
	if doc.custom_delivery_mode == "Courier" and doc.custom_courier_charges:
		selected_charges = []
		for charge in doc.custom_courier_charges:
			if str(charge.select) in ("1", "Yes", "true", "True", "on", "checked") or charge.select is True or charge.select == 1:
				selected_charges.append(charge)

		if len(selected_charges) > 1:
			for charge in doc.custom_courier_charges:
				charge.select = 0
			selected_charges[-1].select = 1
			selected_charge = selected_charges[-1]
		elif len(selected_charges) == 1:
			selected_charge = selected_charges[0]
		else:
			selected_charge = None

		if selected_charge:
			doc.custom_delivery_rate = selected_charge.rate

def on_submit(doc, method):
	"""On submit: stock moves out.

	Courier amount is NOT booked here — post it later via
	\"Post Courier Amount\" once the courier partner bill is received.

	Sales return Delivery Notes reverse the original courier Journal Entry.
	"""
	if cint(doc.is_return):
		reverse_courier_amount_on_return(doc)
	else:
		# Transport charges are known at dispatch — keep existing submit booking.
		if doc.custom_delivery_mode == "Transport" and doc.custom_transport_charges:
			create_transport_journal_entry(doc)

	# Send delivery confirmation email to school (outbound only)
	if not cint(doc.is_return):
		send_delivery_confirmation_email(doc)


def on_cancel(doc, method):
	"""Cancel linked courier JV when Delivery Note is cancelled."""
	je_name = getattr(doc, "custom_courier_journal_entry", None)
	if not je_name:
		return
	try:
		je = frappe.get_doc("Journal Entry", je_name)
		if je.docstatus == 1:
			je.cancel()
			doc.add_comment("Info", f"Courier Journal Entry {je_name} cancelled with Delivery Note")
	except Exception:
		frappe.log_error(frappe.get_traceback(), "Delivery Note Courier JV Cancel")


@frappe.whitelist()
def post_courier_amount(docname):
	"""Book courier expense after partner bill is received (submitted DN only)."""
	doc = frappe.get_doc("Delivery Note", docname)

	if doc.docstatus != 1:
		frappe.throw(_("Submit the Delivery Note first. Stock must go out before posting courier amount."))

	if cint(doc.is_return):
		frappe.throw(_("Courier amount on a return is reversed automatically from the original Delivery Note."))

	if doc.custom_delivery_mode != "Courier":
		frappe.throw(_("Delivery Mode must be Courier to post courier amount."))

	if getattr(doc, "custom_courier_journal_entry", None):
		frappe.throw(_("Courier Journal Entry {0} is already linked to this Delivery Note.").format(doc.custom_courier_journal_entry))

	if not flt(doc.custom_delivery_rate):
		frappe.throw(_("Enter Delivery Rate (courier amount received from partner) before posting."))

	if not doc.custom_courier_mode_of_payment:
		frappe.throw(_("Select Courier Mode of Payment before posting."))

	selected_charge = _get_selected_courier_charge(doc)
	create_journal_entry(doc, selected_charge)
	return {"journal_entry": frappe.db.get_value("Delivery Note", doc.name, "custom_courier_journal_entry")}


def _get_selected_courier_charge(doc):
	if not doc.custom_courier_charges:
		return None
	for charge in doc.custom_courier_charges:
		if str(charge.select) in ("1", "Yes", "true", "True", "on", "checked") or charge.select is True or charge.select == 1:
			return charge
	return None


def reverse_courier_amount_on_return(doc):
	"""On sales return DN: reverse courier amount booked against the original DN."""
	if getattr(doc, "custom_courier_journal_entry", None):
		return

	original_dn = doc.return_against
	if not original_dn:
		frappe.msgprint(_("No Return Against Delivery Note — cannot reverse courier amount."))
		return

	original_je = frappe.db.get_value("Delivery Note", original_dn, "custom_courier_journal_entry")
	original_rate = flt(frappe.db.get_value("Delivery Note", original_dn, "custom_delivery_rate"))

	if not original_je:
		if original_rate:
			frappe.msgprint(
				_("Original Delivery Note {0} has courier rate {1} but no Journal Entry yet — nothing to reverse.").format(
					original_dn, original_rate
				)
			)
		return

	if frappe.db.get_value("Journal Entry", original_je, "docstatus") != 1:
		frappe.msgprint(_("Original courier Journal Entry {0} is not submitted — skipping reverse.").format(original_je))
		return

	reverse_je = create_reverse_journal_entry(doc, original_je, original_dn)
	if reverse_je:
		frappe.db.set_value("Delivery Note", doc.name, "custom_courier_journal_entry", reverse_je, update_modified=False)
		if original_rate and not flt(doc.custom_delivery_rate):
			frappe.db.set_value("Delivery Note", doc.name, "custom_delivery_rate", original_rate, update_modified=False)
		doc.add_comment(
			"Info",
			_("Courier amount returned via Journal Entry <a href='/app/journal-entry/{0}'>{0}</a> (reverses {1} from {2})").format(
				reverse_je, original_je, original_dn
			),
		)
		frappe.msgprint(_("Courier amount returned. Reverse Journal Entry {0} created.").format(reverse_je))


def create_reverse_journal_entry(return_doc, original_je_name, original_dn):
	"""Create a reversing Journal Entry for the original courier JV."""
	original_je = frappe.get_doc("Journal Entry", original_je_name)

	je = frappe.new_doc("Journal Entry")
	je.voucher_type = "Journal Entry"
	je.posting_date = getdate(return_doc.posting_date or nowdate())
	je.company = return_doc.company
	je.cheque_no = return_doc.name
	je.cheque_date = getdate(return_doc.posting_date or nowdate())
	je.user_remark = f"Courier return for {return_doc.name} (reverses {original_je_name} / {original_dn})"

	for row in original_je.accounts:
		je.append(
			"accounts",
			{
				"account": row.account,
				"debit_in_account_currency": flt(row.credit_in_account_currency),
				"credit_in_account_currency": flt(row.debit_in_account_currency),
				"party_type": row.party_type,
				"party": row.party,
				"cost_center": row.cost_center,
				"against_account": row.against_account,
			},
		)

	if not je.accounts:
		return None

	je.insert()
	je.submit()
	return je.name

def create_journal_entry(doc, selected_charge=None):
	"""Create Journal Entry for custom_delivery_rate based on payment mode"""

	if getattr(doc, "custom_courier_journal_entry", None):
		frappe.throw(_("Courier Journal Entry {0} already exists for this Delivery Note.").format(doc.custom_courier_journal_entry))

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
