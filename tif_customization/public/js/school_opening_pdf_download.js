(function () {
	const API =
		"/api/method/tif_customization.tif_customization.api.school_opening_registry.download_school_opening_pdf";

	function getCsrfToken() {
		if (typeof frappe !== "undefined" && frappe.csrf_token) {
			return frappe.csrf_token;
		}
		const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
		return match ? decodeURIComponent(match[1]) : "";
	}

	function downloadSchoolOpeningPdf(customer) {
		if (!customer) {
			return;
		}
		const headers = { "Content-Type": "application/json" };
		const csrf = getCsrfToken();
		if (csrf) {
			headers["X-Frappe-CSRF-Token"] = csrf;
		}

		return fetch(API, {
			method: "POST",
			credentials: "include",
			headers,
			body: JSON.stringify({ customer }),
		})
			.then((response) => {
				const contentType = (response.headers.get("content-type") || "").toLowerCase();
				if (!response.ok || !contentType.includes("pdf")) {
					return response.text().then((text) => {
						let msg = text;
						try {
							const json = JSON.parse(text);
							msg = json._server_messages || json.message || text;
						} catch (e) {
							/* plain text / html */
						}
						throw new Error(msg || `HTTP ${response.status}`);
					});
				}
				return response.blob();
			})
			.then((blob) => {
				const safeName = String(customer).replace(/[\\/:*?"<>|]+/g, "-");
				const url = URL.createObjectURL(blob);
				const a = document.createElement("a");
				a.href = url;
				a.download = `School_Opening_${safeName}.pdf`;
				document.body.appendChild(a);
				a.click();
				a.remove();
				URL.revokeObjectURL(url);
			})
			.catch((err) => {
				const message =
					(typeof err === "string" ? err : err.message) ||
					"Could not download PDF. Try Print → Save as PDF on the form page.";
				if (typeof frappe !== "undefined" && frappe.msgprint) {
					frappe.msgprint({ title: __("PDF download failed"), message, indicator: "red" });
				} else {
					window.alert(message);
				}
			});
	}

	window.downloadSchoolOpeningPdf = downloadSchoolOpeningPdf;

	document.addEventListener("click", (event) => {
		const link = event.target.closest(".soa-pdf-download");
		if (!link) {
			return;
		}
		event.preventDefault();
		const customer = link.getAttribute("data-customer") || "";
		downloadSchoolOpeningPdf(customer);
	});
})();
