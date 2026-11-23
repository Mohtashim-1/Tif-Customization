frappe.pages["ilm-foundation-portal"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("ILM Foundation Portal"),
		single_column: true,
	});

	page.main.html(`
		<div style="padding:2rem;max-width:640px">
			<h2 style="margin:0 0 .5rem">ILM Foundation Portal</h2>
			<p style="color:#64748b;margin:0 0 1.25rem">
				Open the Vue payroll portal to create, amend, approve and finalize the 26th–25th cycle.
			</p>
			<a class="btn btn-primary btn-sm" href="/payroll-portal" target="_blank" rel="noopener">
				Open Payroll Portal
			</a>
			<a class="btn btn-default btn-sm" href="/app/variable-components" style="margin-left:.5rem">
				Variable Components
			</a>
		</div>
	`);

	// Auto-open portal in same tab for one-click desk access
	window.location.href = "/payroll-portal";
};
