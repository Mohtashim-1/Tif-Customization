frappe.ui.form.on("Leave Application", {
	make_dashboard(frm) {
		let leave_details;
		let lwps;

		if (!frm.doc.employee) return;

		frappe.call({
			method: "hrms.hr.doctype.leave_application.leave_application.get_leave_details",
			async: false,
			args: {
				employee: frm.doc.employee,
				date: frm.doc.from_date || frm.doc.posting_date,
			},
			callback(r) {
				if (!r.exc && r.message && r.message.leave_allocation) {
					leave_details = r.message.leave_allocation;
				}
				lwps = (r.message && r.message.lwps) || [];
			},
		});

		$("div").remove(".form-dashboard-section.custom");

		frm.dashboard.add_section(
			render_allocated_leaves_with_accrual(leave_details || {}),
			__("Allocated Leaves"),
		);
		frm.dashboard.show();

		let allowed_leave_types = Object.keys(leave_details || {});
		allowed_leave_types = allowed_leave_types.concat(lwps);

		frm.set_query("leave_type", () => {
			return {
				filters: [["leave_type_name", "in", allowed_leave_types]],
			};
		});
	},
});

function render_allocated_leaves_with_accrual(data) {
	if (!data || jQuery.isEmptyObject(data)) {
		return `<p style="margin-top: 30px;">${__("No leaves have been allocated.")}</p>`;
	}

	const rows = Object.entries(data)
		.map(([leave_type, value]) => {
			const color = cint(value.remaining_leaves) > 0 ? "green" : "red";
			const accrual_allowed = value.leave_allowed_as_per_accrual ?? 0;
			return `
				<tr>
					<td>${leave_type}</td>
					<td class="text-right">${value.total_leaves}</td>
					<td class="text-right">${value.expired_leaves}</td>
					<td class="text-right">${value.leaves_taken}</td>
					<td class="text-right">${value.leaves_pending_approval}</td>
					<td class="text-right">${accrual_allowed}</td>
					<td class="text-right" style="color: ${color}">${value.remaining_leaves}</td>
				</tr>
			`;
		})
		.join("");

	return `
		<table class="table table-bordered small">
			<thead>
				<tr>
					<th style="width: 14%">${__("Leave Type")}</th>
					<th style="width: 14%" class="text-right">${__("Total Allocated Leaves")}</th>
					<th style="width: 14%" class="text-right">${__("Expired Leaves")}</th>
					<th style="width: 14%" class="text-right">${__("Used Leaves")}</th>
					<th style="width: 14%" class="text-right">${__("Leaves Pending Approval")}</th>
					<th style="width: 16%" class="text-right">${__("Leave Allowed As Per Accrual")}</th>
					<th style="width: 14%" class="text-right">${__("Available Leaves")}</th>
				</tr>
			</thead>
			<tbody>${rows}</tbody>
		</table>
	`;
}
