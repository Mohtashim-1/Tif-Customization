def get_data():
	return {
		"fieldname": "school_opening_application",
		"non_standard_fieldnames": {
			"Address": "school_opening_application",
			"Contact": "school_opening_application",
		},
		"internal_links": {
			"Customer": "customer",
		},
		"transactions": [
			{"label": "School", "items": ["Customer", "Address", "Contact"]},
		],
	}
