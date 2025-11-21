frappe.ui.form.on('Delivery Note', {
    refresh: function(frm) {
        // Always hide custom_courier_charges table
        // frm.set_df_property('custom_courier_charges', 'hidden', 1);
        
        // Set field visibility on form load
        // if (frm.doc.custom_courier == 'Leopard') {
        //     frm.set_df_property('custom_delivery_mode', 'hidden', 0);
        //     frm.set_df_property('custom_transport_charges', 'hidden', 0);
        // } else {
        //     frm.set_df_property('custom_delivery_mode', 'hidden', 1);
        //     frm.set_df_property('custom_transport_charges', 'hidden', 1);
        // }
        
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
        
        // If this row is selected, unselect all other rows and update delivery rate
        if (row.select) {
            // Unselect all other rows first
            frm.doc.custom_courier_charges.forEach(function(charge_row) {
                if (charge_row.name !== row.name) {
                    frappe.model.set_value(charge_row.doctype, charge_row.name, 'select', 0);
                }
            });
            
            // Update the delivery rate with selected row's rate
            frm.set_value('custom_delivery_rate', row.rate);
            
            // Refresh the table to show updated selections
            frm.refresh_field('custom_courier_charges');
        } else {
            // If this row is unselected, check if any other row is selected
            let selected_row = frm.doc.custom_courier_charges.find(function(charge_row) {
                return charge_row.select === 1;
            });
            
            if (selected_row) {
                // If another row is selected, update delivery rate to that row's rate
                frm.set_value('custom_delivery_rate', selected_row.rate);
            } else {
                // If no row is selected, clear the delivery rate
                frm.set_value('custom_delivery_rate', 0);
            }
        }
    }
});

// Handle custom_delivery_mode field changes to show/hide related fields
// frappe.ui.form.on('Delivery Note', {
//     custom_delivery_mode: function(frm) {
//         // Always hide custom_courier_charges table
//         frm.set_df_property('custom_courier_charges', 'hidden', 1);
        
//         // Handle other field visibility
//         if (frm.doc.custom_delivery_mode === 'Courier') {
//             frm.set_df_property('custom_section_break_qpinp', 'hidden', 1);
//         } else {
//             frm.set_df_property('custom_section_break_qpinp', 'hidden', 0);
//         }
//     },
    
//     custom_courier: function(frm) {
//         // Always hide custom_courier_charges table
//         frm.set_df_property('custom_courier_charges', 'hidden', 1);
        
//         // Handle other field visibility
//         if (frm.doc.custom_courier == 'Leopard') {
//             frm.set_df_property('custom_delivery_mode', 'hidden', 0);
//             frm.set_df_property('custom_transport_charges', 'hidden', 0);
//         } else {
//             frm.set_df_property('custom_delivery_mode', 'hidden', 1);
//             frm.set_df_property('custom_transport_charges', 'hidden', 1);
//         }
//     }
// });

// Calculate amount = quantity * rate for Delivery Rate Entry table
frappe.ui.form.on('Delivery Rate Entry', {
    quantity: function(frm, cdt, cdn) {
        calculate_amount(frm, cdt, cdn);
    },
    
    rate: function(frm, cdt, cdn) {
        calculate_amount(frm, cdt, cdn);
    },
    
    amount: function(frm, cdt, cdn) {
        // If amount is manually changed, we can optionally recalculate rate
        // For now, we'll just ensure calculation happens on quantity/rate change
    }
});

function calculate_amount(frm, cdt, cdn) {
    let row = locals[cdt][cdn];
    let quantity = flt(row.quantity) || 0;
    let rate = flt(row.rate) || 0;
    let amount = quantity * rate;
    
    frappe.model.set_value(cdt, cdn, 'amount', amount);
} 