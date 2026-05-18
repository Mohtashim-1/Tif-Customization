frappe.listview_settings["Leave Application"] = {
	get_indicator(doc) {
		// Show workflow/status even when doc is not submitted.
		// Default indicator often shows Draft when docstatus=0, which hides approved/rejected state.
		const status = doc.status || "";

		if (status === "Approved") return [__("Approved"), "green", "status,=,Approved"];
		if (status === "Rejected") return [__("Rejected"), "red", "status,=,Rejected"];
		if (status === "Open") return [__("Open"), "orange", "status,=,Open"];
		if (status === "Cancelled") return [__("Cancelled"), "gray", "status,=,Cancelled"];

		if (cint(doc.docstatus) === 0) return [__("Draft"), "red", "docstatus,=,0"];
		if (cint(doc.docstatus) === 1) return [__("Submitted"), "blue", "docstatus,=,1"];
		if (cint(doc.docstatus) === 2) return [__("Cancelled"), "gray", "docstatus,=,2"];

		return [status || __("Unknown"), "gray", ""];
	},
};

