(function () {
	const FILTER_KEY = "soa_registry_print_filters";
	const NAV_API =
		"tif_customization.tif_customization.api.school_opening_registry.get_school_opening_neighbors";
	const APPROVE_API =
		"tif_customization.tif_customization.api.school_opening_registry.approve_school_opening";

	function getFilters() {
		try {
			const raw = sessionStorage.getItem(FILTER_KEY);
			return raw ? JSON.parse(raw) : {};
		} catch (e) {
			return {};
		}
	}

	function callMethod(method, args) {
		const headers = {
			"Content-Type": "application/json",
			Accept: "application/json",
		};
		const csrf =
			(typeof frappe !== "undefined" && frappe.csrf_token) ||
			(document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/) || [])[1];
		if (csrf) {
			headers["X-Frappe-CSRF-Token"] = decodeURIComponent(csrf);
		}
		return fetch(`/api/method/${method}`, {
			method: "POST",
			credentials: "include",
			headers,
			body: JSON.stringify(args || {}),
		}).then(async (res) => {
			const data = await res.json().catch(() => ({}));
			if (!res.ok || data.exc) {
				const msg =
					(data._server_messages && (() => {
						try {
							const parsed = JSON.parse(data._server_messages);
							return parsed.map((m) => {
								try {
									return JSON.parse(m).message;
								} catch (e) {
									return m;
								}
							}).join(" ");
						} catch (e) {
							return data._server_messages;
						}
					})()) ||
					data.message ||
					data.exc ||
					`HTTP ${res.status}`;
				throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
			}
			return data.message;
		});
	}

	function printUrl(nav, key) {
		if (!key) {
			return null;
		}
		if (nav.mode === "application") {
			return `/school-opening-print?application=${encodeURIComponent(key)}`;
		}
		return `/school-opening-print?customer=${encodeURIComponent(key)}`;
	}

	function toast(message, indicator) {
		if (typeof frappe !== "undefined" && frappe.show_alert) {
			frappe.show_alert({ message, indicator: indicator || "green" });
		} else if (typeof frappe !== "undefined" && frappe.msgprint) {
			frappe.msgprint({ message, indicator: indicator || "green" });
		} else {
			window.alert(message);
		}
	}

	function initToolbar() {
		const toolbar = document.querySelector(".soa-print-toolbar");
		if (!toolbar || toolbar.dataset.navReady) {
			return;
		}
		toolbar.dataset.navReady = "1";

		const customer = toolbar.getAttribute("data-customer") || "";
		const application = toolbar.getAttribute("data-application") || "";
		const $prev = toolbar.querySelector(".soa-prev-doc");
		const $next = toolbar.querySelector(".soa-next-doc");
		const $label = toolbar.querySelector(".soa-nav-label");
		const $approve = toolbar.querySelector(".soa-approve-btn");

		const filters = getFilters();
		const args = {
			customer,
			application,
			search: filters.search || "",
			govt_private: filters.govt_private || "",
			status: filters.status || "",
			territory: filters.territory || "",
			form_data: filters.form_data || (application ? "pending" : ""),
			city: filters.city || "",
			address_search: filters.address_search || "",
		};

		let navState = null;

		callMethod(NAV_API, args)
			.then((nav) => {
				navState = nav || {};
				if ($label) {
					$label.textContent = navState.label || "";
				}
				if ($prev) {
					$prev.disabled = !navState.prev;
					$prev.onclick = () => {
						const url = printUrl(navState, navState.prev);
						if (url) {
							window.location.href = url;
						}
					};
				}
				if ($next) {
					$next.disabled = !navState.next;
					$next.onclick = () => {
						const url = printUrl(navState, navState.next);
						if (url) {
							window.location.href = url;
						}
					};
				}
			})
			.catch(() => {
				if ($label) {
					$label.textContent = "";
				}
			});

		if ($approve && !$approve.disabled) {
			$approve.addEventListener("click", () => {
				if ($approve.disabled) {
					return;
				}
				const confirmMsg =
					typeof __ !== "undefined"
						? __("Approve this School Opening and create the ERP Customer?")
						: "Approve this School Opening and create the ERP Customer?";
				const go = () => {
					$approve.disabled = true;
					const original = $approve.textContent;
					$approve.textContent =
						typeof __ !== "undefined" ? __("Approving…") : "Approving…";
					callMethod(APPROVE_API, { application, customer })
						.then((result) => {
							toast(
								(result && result.message) ||
									(typeof __ !== "undefined" ? __("Approved") : "Approved"),
								"green"
							);
							$approve.textContent =
								typeof __ !== "undefined" ? __("Approved") : "Approved";
							// Prefer next pending document after approve
							const nextUrl =
								navState && navState.next
									? printUrl(navState, navState.next)
									: null;
							if (nextUrl && (!result || !result.already_approved)) {
								setTimeout(() => {
									window.location.href = nextUrl;
								}, 600);
							} else if (result && result.customer) {
								setTimeout(() => {
									window.location.href = `/school-opening-print?customer=${encodeURIComponent(
										result.customer
									)}`;
								}, 600);
							}
						})
						.catch((err) => {
							$approve.disabled = false;
							$approve.textContent = original;
							toast(err.message || String(err), "red");
						});
				};
				if (typeof frappe !== "undefined" && frappe.confirm) {
					frappe.confirm(confirmMsg, go);
				} else if (window.confirm(confirmMsg)) {
					go();
				}
			});
		}
	}

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", initToolbar);
	} else {
		initToolbar();
	}
})();
