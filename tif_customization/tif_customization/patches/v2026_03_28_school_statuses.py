import frappe


def execute():
    # Align older values with the updated School.status options
    frappe.db.sql(
        """
        UPDATE `tabSchool`
        SET status = 'In Process'
        WHERE status = 'Pending'
        """
    )

