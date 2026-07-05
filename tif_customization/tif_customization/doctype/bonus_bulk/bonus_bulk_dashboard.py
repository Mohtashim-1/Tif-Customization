from frappe import _


def get_data():
	return {
		"fieldname": "name",
		"internal_links": {
			"Journal Entry": ["employees", "journal_entry"],
			"Payment Entry": ["employees", "payment_entry"],
			"Additional Salary": ["employees", "additional_salary"],
		},
		"transactions": [
			{
				"label": _("Journal Entry"),
				"items": ["Journal Entry"],
			},
			{
				"label": _("Payment"),
				"items": ["Payment Entry"],
			},
			{
				"label": _("Salary Slip"),
				"items": ["Additional Salary"],
			},
		],
	}
