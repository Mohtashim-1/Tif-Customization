from frappe import _


def get_data():
	return {
		"fieldname": "name",
		"internal_links": {
			"Leave Encashment": ["employees", "leave_encashment"],
			"Payment Entry": ["employees", "payment_entry"],
		},
		"transactions": [
			{
				"label": _("Leave Encashment"),
				"items": ["Leave Encashment"],
			},
			{
				"label": _("Payment"),
				"items": ["Payment Entry"],
			},
		],
	}
