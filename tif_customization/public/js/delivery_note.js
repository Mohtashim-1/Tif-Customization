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

		// After submit: add delivery details (city, courier, rate, …)
		if (
			frm.doc.docstatus === 1
			&& !frm.doc.is_return
			&& !frm.doc.custom_courier_journal_entry
			&& !cint(frm.doc.custom_delivery_details_saved)
		) {
			frm.add_custom_button(__('Add Delivery Details'), function() {
				show_delivery_details_dialog(frm);
			});
		}

		// After stock-out submit: post courier amount when partner bill is received
		if (
			frm.doc.docstatus === 1
			&& !frm.doc.is_return
			&& frm.doc.custom_delivery_mode === 'Courier'
			&& !frm.doc.custom_courier_journal_entry
		) {
			frm.add_custom_button(__('Post Courier Amount'), function() {
				if (!flt(frm.doc.custom_delivery_rate)) {
					frappe.msgprint(__('Enter Delivery Rate (amount from courier partner) first, then save.'));
					return;
				}
				if (!frm.doc.custom_courier_mode_of_payment) {
					frappe.msgprint(__('Select Courier Mode of Payment first, then save.'));
					return;
				}
				frappe.confirm(
					__('Post courier amount {0} to accounts for this Delivery Note?', [format_currency(frm.doc.custom_delivery_rate)]),
					function() {
						frappe.call({
							method: 'tif_customization.tif_customization.doctype.delivery_note.delivery_note.post_courier_amount',
							args: { docname: frm.doc.name },
							freeze: true,
							freeze_message: __('Posting courier amount...'),
							callback: function(r) {
								if (r.message && r.message.journal_entry) {
									frappe.show_alert({
										message: __('Courier Journal Entry {0} created', [r.message.journal_entry]),
										indicator: 'green'
									});
									frm.reload_doc();
								}
							}
						});
					}
				);
			}, __('Actions'));
        }
    }
});

function show_delivery_details_dialog(frm) {
	const d = new frappe.ui.Dialog({
		title: __('Add Delivery Details'),
		size: 'large',
		fields: [
			{
				fieldname: 'custom_city',
				label: __('City'),
				fieldtype: 'Data',
				default: frm.doc.custom_city,
			},
			{
				fieldname: 'custom_total_delivery_weightage',
				label: __('Total Delivery Weightage (in Kgs)'),
				fieldtype: 'Float',
				non_negative: 1,
				default: frm.doc.custom_total_delivery_weightage,
			},
			{
				fieldname: 'custom_shipment_tracking_no',
				label: __('Shipment Tracking No'),
				fieldtype: 'Data',
				default: frm.doc.custom_shipment_tracking_no,
			},
			{
				fieldname: 'custom_courier_mode_of_payment',
				label: __('Courier Mode of Payment'),
				fieldtype: 'Select',
				options: 'Cash\nAccount\nNon-Cost',
				default: frm.doc.custom_courier_mode_of_payment,
			},
			{
				fieldname: 'custom_supply_chain_cost_center',
				label: __('Supply Chain Cost Center'),
				fieldtype: 'Link',
				options: 'Cost Center',
				default: frm.doc.custom_supply_chain_cost_center,
			},

            {
                fieldtype: 'Column Break',
            },
			{
				fieldname: 'custom_book_purchase_supplier',
				label: __('Book Purchase Supplier'),
				fieldtype: 'Link',
				options: 'Supplier',
				default: frm.doc.custom_book_purchase_supplier,
				description: __(
					'Include this delivery note on the Book Purchase & Printing dashboard for the selected supplier.'
				),
			},

			{
				fieldname: 'custom_delivery_rate',
				label: __('Delivery Rate'),
				fieldtype: 'Float',
				default: frm.doc.custom_delivery_rate,
				description: __('Enter after courier partner bill is received. A Journal Entry is created on save when rate is set.'),
			},
			{
				fieldname: 'custom_delivery_mode',
				label: __('Delivery Mode'),
				fieldtype: 'Select',
				options: 'Courier\nTransport\nBy Hand',
				default: frm.doc.custom_delivery_mode,
				reqd: 1,
			},
			{
				fieldname: 'custom_courier',
				label: __('Courier'),
				fieldtype: 'Link',
				options: 'Courier',
				default: frm.doc.custom_courier,
				depends_on: 'eval:doc.custom_delivery_mode=="Courier"',
				mandatory_depends_on: 'eval:doc.custom_delivery_mode=="Courier" && doc.custom_delivery_rate > 0',
			},

            {

                fieldtype: 'Column Break',
            },
			{
				fieldname: 'custom_courier_service',
				label: __('Courier Service'),
				fieldtype: 'Link',
				options: 'Courier Service',
				default: frm.doc.custom_courier_service,
				depends_on: 'eval:doc.custom_delivery_mode=="Courier"',
			},
			{
				fieldname: 'custom_return_remarks',
				label: __('Return Remarks'),
				fieldtype: 'Small Text',
				default: frm.doc.custom_return_remarks,
			},
			{
				fieldname: 'custom_by_hand',
				label: __('By Hand'),
				fieldtype: 'Link',
				options: 'By Hand',
				default: frm.doc.custom_by_hand,
				depends_on: 'eval:doc.custom_delivery_mode=="By Hand"',
				get_query: function() {
					return { filters: { active: 1 } };
				},
			},

			{
				fieldname: 'custom_area',
				label: __('Area'),
				fieldtype: 'Data',
				default: frm.doc.custom_area,
			},
		],
		primary_action_label: __('Save'),
		primary_action: function(values) {
			frappe.call({
				method: 'tif_customization.tif_customization.doctype.delivery_note.delivery_note.save_delivery_details',
				args: {
					docname: frm.doc.name,
					values: values,
				},
				freeze: true,
				freeze_message: __('Saving delivery details...'),
				callback: function(r) {
					d.hide();
					if (r.message && r.message.journal_entry) {
						frappe.show_alert({
							message: __('Courier Journal Entry {0} created', [r.message.journal_entry]),
							indicator: 'green',
						});
					} else {
						frappe.show_alert({
							message: __('Delivery details saved'),
							indicator: 'green',
						});
					}
					frm.reload_doc();
				},
			});
		},
	});
	d.show();
}

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