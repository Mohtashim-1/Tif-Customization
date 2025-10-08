frappe.ui.form.on('Delivery Note', {
    refresh: function(frm) {
        // Add custom button for fetching courier rates
        if (frm.doc.custom_delivery_mode === 'Courier' && frm.doc.docstatus === 0) {
            frm.add_custom_button(__('Fetch Courier Rates'), function() {
                // Check if total delivery weightage is entered
                if (!frm.doc.custom_total_delivery_weightage) {
                    frappe.msgprint('Please enter the total delivery weightage first.');
                    return;
                }
                
                // Show loading message
                frappe.show_alert({
                    message: 'Fetching courier rates...',
                    indicator: 'blue'
                });
                
                // Call the server method
                frappe.call({
                    method: 'tif_customization.tif_customization.doctype.delivery_note.delivery_note.fetch_courier_rates',
                    args: {
                        docname: frm.doc.name
                    },
                    callback: function(r) {
                        if (r.message) {
                            // Refresh the form to show the updated courier charges
                            frm.refresh_field('custom_courier_charges');
                            frm.refresh_field('custom_delivery_rate');
                            
                            frappe.show_alert({
                                message: 'Courier rates fetched successfully!',
                                indicator: 'green'
                            });
                        }
                    },
                    error: function(r) {
                        frappe.msgprint('Error fetching courier rates: ' + r.message);
                    }
                });
            }, __('Actions'));
        }
    }
});

// Handle selection changes in Courier Charges table
frappe.ui.form.on('Courier Charges', {
    select: function(frm, cdt, cdn) {
        // Get the selected row
        let row = locals[cdt][cdn];
        
        // If this row is selected, update the delivery rate
        if (row.select) {
            frm.set_value('custom_delivery_rate', row.rate);
        }
    }
});
