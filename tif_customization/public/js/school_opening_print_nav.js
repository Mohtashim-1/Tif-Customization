(function () {
	const FILTER_KEY = "soa_registry_print_filters";
	const NAV_API =
		"tif_customization.tif_customization.api.school_opening_registry.get_school_opening_neighbors";
	const APPROVE_API =
		"tif_customization.tif_customization.api.school_opening_registry.approve_school_opening";
	const SAVE_API =
		"tif_customization.tif_customization.api.school_opening_registry.update_school_opening";

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

	function checkedValues(name) {
		return Array.from(
			document.querySelectorAll(`#soa-print-form input[name="${name}"]:checked`)
		).map((el) => el.value);
	}

	function radioValue(name) {
		const el = document.querySelector(`#soa-print-form input[name="${name}"]:checked`);
		return el ? el.value : "";
	}

	function fieldValue(name) {
		const el = document.querySelector(`#soa-print-form [name="${name}"]`);
		return el ? (el.value || "").trim() : "";
	}

	function parseDisplayDate(display) {
		const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((display || "").trim());
		if (!m) {
			return fieldValue("form_date") || "";
		}
		return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
	}

	function collectFormData() {
		const contacts = {};
		document.querySelectorAll("#soa-print-form tr[data-contact-role]").forEach((tr) => {
			const role = tr.getAttribute("data-contact-role");
			contacts[role] = {
				name: (tr.querySelector(".soa-contact-name")?.value || "").trim(),
				cell: (tr.querySelector(".soa-contact-cell")?.value || "").trim(),
			};
		});
		return {
			form_date: parseDisplayDate(fieldValue("form_date_display")) || fieldValue("form_date"),
			visit_type: radioValue("visit_type"),
			institution_types: checkedValues("institution_types"),
			school_name: fieldValue("school_name"),
			tif_representative: fieldValue("tif_representative"),
			institution_category: radioValue("institution_category"),
			educational_system: checkedValues("educational_system"),
			type_of_school: fieldValue("type_of_school"),
			no_of_campuses: fieldValue("no_of_campuses"),
			no_of_students: fieldValue("no_of_students"),
			structure: radioValue("structure"),
			academic_shift: radioValue("academic_shift"),
			teacher_training_services: checkedValues("teacher_training_services"),
			tilawat_services: checkedValues("tilawat_services"),
			quran_program_services: checkedValues("quran_program_services"),
			running_tif_services: checkedValues("running_tif_services"),
			curriculum_in_use: checkedValues("curriculum_in_use"),
			curriculum_others: fieldValue("curriculum_others"),
			fee_structure: radioValue("fee_structure"),
			website: fieldValue("website"),
			facebook: fieldValue("facebook"),
			instagram: fieldValue("instagram"),
			linkedin: fieldValue("linkedin"),
			other_links: fieldValue("other_links"),
			address: fieldValue("address"),
			area: fieldValue("area"),
			city: fieldValue("city"),
			province: radioValue("province"),
			country: fieldValue("country") || "Pakistan",
			marketing_sample_provided: radioValue("marketing_sample_provided"),
			school_ptcl: fieldValue("school_ptcl"),
			school_mobile: fieldValue("school_mobile"),
			school_whatsapp: fieldValue("school_whatsapp"),
			school_email: fieldValue("school_email"),
			key_contacts: contacts,
		};
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
		const $save = toolbar.querySelector(".soa-save-btn");

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

		if ($save) {
			$save.addEventListener("click", () => {
				const payload = collectFormData();
				if (!(payload.school_name || "").trim()) {
					toast(
						typeof __ !== "undefined" ? __("Name of School is required.") : "Name of School is required.",
						"red"
					);
					return;
				}
				$save.disabled = true;
				const original = $save.textContent;
				$save.textContent = typeof __ !== "undefined" ? __("Saving…") : "Saving…";
				callMethod(SAVE_API, {
					application,
					customer,
					data: payload,
				})
					.then((result) => {
						toast(
							(result && result.message) ||
								(typeof __ !== "undefined" ? __("Saved") : "Saved"),
							"green"
						);
						const app = (result && result.application) || application;
						const cust = (result && result.customer) || customer;
						setTimeout(() => {
							if (app) {
								window.location.href = `/school-opening-print?application=${encodeURIComponent(
									app
								)}`;
							} else if (cust) {
								window.location.href = `/school-opening-print?customer=${encodeURIComponent(
									cust
								)}`;
							} else {
								window.location.reload();
							}
						}, 500);
					})
					.catch((err) => {
						$save.disabled = false;
						$save.textContent = original;
						toast(err.message || String(err), "red");
					});
			});
		}
	}

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", initToolbar);
	} else {
		initToolbar();
	}
})();
