(function () {
	const INCLUDE = "Include in In/Out";
	const IGNORE = "Ignore in In/Out";
	const DEFAULTS = {
		"Stock Ledger": IGNORE,
		"Stock Balance": INCLUDE,
	};

	function recon_filter(report_name) {
		return {
			fieldname: "stock_reconciliation_in_out",
			label: __("Stock Reconciliation"),
			fieldtype: "Select",
			options: INCLUDE + "\n" + IGNORE,
			default: DEFAULTS[report_name],
			description: __(
				"Include: recon qty changes count as In/Out (Stock Balance default). Ignore: only Delivery Note / Stock Entry qty (Stock Ledger default)."
			),
		};
	}

	function inject_recon_filter(report_name, report_settings) {
		if (!DEFAULTS[report_name] || !report_settings || !Array.isArray(report_settings.filters)) {
			return;
		}
		if (report_settings.filters.some((f) => f.fieldname === "stock_reconciliation_in_out")) {
			return;
		}
		report_settings.filters.push(recon_filter(report_name));
	}

	function patch_query_report() {
		const QueryReport = frappe.views && frappe.views.QueryReport;
		if (!QueryReport || QueryReport.prototype._tif_recon_filter_patched) {
			return !!QueryReport;
		}

		const proto = QueryReport.prototype;
		const original = proto.setup_filters;
		proto.setup_filters = function () {
			inject_recon_filter(this.report_name, this.report_settings);
			return original.apply(this, arguments);
		};
		proto._tif_recon_filter_patched = true;
		return true;
	}

	if (!patch_query_report()) {
		$(document).on("app_ready", patch_query_report);
	}
})();
