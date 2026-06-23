def sanitize_card_break_links(doc, method=None):
	"""Card Break rows are section headers only — never require Link Type / Link To."""
	for link in doc.get("links") or []:
		if link.type == "Card Break":
			link.link_type = None
			link.link_to = None
			link.is_query_report = 0
