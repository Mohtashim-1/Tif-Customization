frappe.ui.form.on("Leave Application", {
	refresh(frm) {
		frm.set_query("custom_substitute_name", () => {
			const filters = { is_active: 1 };
			if (frm.doc.employee) {
				filters.name = ["!=", frm.doc.employee];
			}
			return { filters };
		});

		if (frm.doc.docstatus === 0 && frm.doc.employee) {
			// Run after HRMS make_dashboard so our accrual table is not overwritten.
			setTimeout(() => build_allocated_leaves_dashboard(frm), 0);
		}
	},
	employee(frm) {
		if (frm.doc.docstatus === 0 && frm.doc.employee) {
			setTimeout(() => build_allocated_leaves_dashboard(frm), 0);
		}
	},
	from_date(frm) {
		if (frm.doc.docstatus === 0 && frm.doc.employee) {
			setTimeout(() => build_allocated_leaves_dashboard(frm), 0);
		}
	},
	posting_date(frm) {
		if (frm.doc.docstatus === 0 && frm.doc.employee) {
			setTimeout(() => build_allocated_leaves_dashboard(frm), 0);
		}
	},
});

function snap_leave_display(value) {
	const v = flt(value || 0);
	const sign = v < 0 ? -1 : 1;
	const abs = Math.abs(v);
	const integer = Math.floor(abs + 1e-9);
	const first_decimal = Math.floor((abs - integer) * 10 + 1e-9);

	let snapped = integer;
	if (first_decimal > 5 || first_decimal === 5) {
		snapped = integer + 0.5;
	}

	return sign * snapped;
}

function fmt_leave(value) {
	const number = snap_leave_display(value);
	const rounded = Math.round(number * 10) / 10;
	if (Math.abs(rounded % 1) < 1e-9) {
		return String(Math.round(rounded));
	}
	const text = rounded.toFixed(1);
	return text.endsWith(".0") ? text.slice(0, -2) : text;
}

function build_allocated_leaves_dashboard(frm) {
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
}

function render_allocated_leaves_with_accrual(data) {
	if (!data || jQuery.isEmptyObject(data)) {
		return `<p style="margin-top: 30px;">${__("No leaves have been allocated.")}</p>`;
	}

	const rows = Object.entries(data)
		.map(([leave_type, value]) => {
			const remaining = snap_leave_display(value.remaining_leaves);
			const color = remaining > 0 ? "green" : "red";
			const accrual_allowed = value.leave_allowed_as_per_accrual ?? 0;
			const accrualAvail = value.available_leaves_as_per_accrual ?? 0;
			const accrualAvailColor = snap_leave_display(accrualAvail) > 0 ? "green" : "red";
			return `
				<tr>
					<td>${leave_type}</td>
					<td class="text-right">${fmt_leave(value.total_leaves)}</td>
					<td class="text-right">${fmt_leave(value.expired_leaves)}</td>
					<td class="text-right">${fmt_leave(value.leaves_pending_approval)}</td>
					<td class="text-right">${fmt_leave(accrual_allowed)}</td>
					<td class="text-right">${fmt_leave(value.leaves_taken)}</td>
					<td class="text-right" style="color: ${accrualAvailColor}">${fmt_leave(accrualAvail)}</td>
					<td class="text-right" style="color: ${color}">${fmt_leave(value.remaining_leaves)}</td>
				</tr>
			`;
		})
		.join("");

	const accrualGrossTitle = __(
		"Leave earned under the accrual rule up to the selected date, before subtracting used or pending leave.",
	);
	const accrualNetTitle = __(
		"Accrued To Date minus Used Leaves minus Pending. This is the accrual-limited balance; it can be lower than Available Leaves when the full-year allocation is on the ledger but accrual is earned over time.",
	);

	return `
		<table class="table table-bordered small">
			<thead>
				<tr>
					<th style="width: 12%">${__("Leave Type")}</th>
					<th style="width: 11%" class="text-right">${__("Total Allocated Leaves")}</th>
					<th style="width: 11%" class="text-right">${__("Expired Leaves")}</th>
					<th style="width: 11%" class="text-right">${__("Leaves Pending Approval")}</th>
					<th style="width: 13%" class="text-right" title="${frappe.utils.escape_html(accrualGrossTitle)}">${__(
						"Accrued To Date",
					)}</th>
					<th style="width: 11%" class="text-right">${__("Used Leaves")}</th>
					<th style="width: 13%" class="text-right" title="${frappe.utils.escape_html(accrualNetTitle)}">${__(
						"Remaining (Accrual)",
					)}</th>
					<th style="width: 12%" class="text-right" title="${__("Balance from Leave Ledger (allocation minus used), not limited by accrual schedule.")}">${__(
						"Available (Ledger)",
					)}</th>
				</tr>
			</thead>
			<tbody>${rows}</tbody>
		</table>
		<p class="text-muted small" style="margin-top:10px;margin-bottom:0;">
			${__(
				"Example: Accrued To Date 16.5 with Used 1.5 gives Remaining (Accrual) 15. Available Leaves can still show 16.5 because it follows the leave ledger (e.g. full allocation minus use), not the accrual schedule.",
			)}
		</p>
	`;
}
