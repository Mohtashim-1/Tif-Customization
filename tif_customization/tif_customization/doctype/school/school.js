// Copyright (c) 2024, TIF Customization and contributors
// For license information, please see license.txt

frappe.ui.form.on('School', {
	refresh: function(frm) {
		if (frm.doc.docstatus === 1 && frm.doc.customer) {
			frm.add_custom_button(__('Open Customer'), () => {
				frappe.set_route('Form', 'Customer', frm.doc.customer);
			});
		}

		if (frm.doc.docstatus === 0 && frm.doc.status === 'In Process') {
			frm.dashboard.set_headline_alert(
				__('Guest submissions stay in Process until a School Approval user submits this record to create the Customer.'),
				'blue'
			);
		}

		// Add custom buttons
		frm.add_custom_button(__('Send Welcome Email'), function() {
			frm.call({
				method: 'tif_customization.tif_customization.doctype.school.school.send_welcome_email',
				args: {
					school: frm.doc.name
				},
				callback: function(r) {
					if (r.message) {
						frappe.msgprint(__('Welcome email sent successfully!'));
					}
				}
			});
		}, __('Actions'));
	},
	
	category: function(frm) {
		// Show/hide number of schools field based on category
		if (frm.doc.category === 'CHAIN OF SCHOOL') {
			frm.set_df_property('no_of_school', 'reqd', 1);
		} else {
			frm.set_df_property('no_of_school', 'reqd', 0);
			frm.set_value('no_of_school', '');
		}
	},
	
	school_type: function(frm) {
		// Add validation or logic based on school type
		if (frm.doc.school_type === 'GOVT') {
			frm.set_df_property('trust_private_registration_code', 'reqd', 0);
		} else {
			frm.set_df_property('trust_private_registration_code', 'reqd', 1);
		}
	}
});
