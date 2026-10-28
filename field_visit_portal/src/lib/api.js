function cookieCsrf() {
	const match = document.cookie.match(/(?:^|; )csrf_token=([^;]+)/);
	if (!match) return "";
	let value = decodeURIComponent(match[1].trim());
	// Frappe sometimes stores the cookie with surrounding quotes.
	if (
		(value.startsWith('"') && value.endsWith('"')) ||
		(value.startsWith("'") && value.endsWith("'"))
	) {
		value = value.slice(1, -1);
	}
	return value;
}

function csrfToken() {
	// Prefer the live cookie over the page-boot token. Keeping a form open
	// (or logging in again in another tab) refreshes the cookie while boot stays stale —
	// that mismatch is what Frappe surfaces as "Invalid Request" (CSRFTokenError).
	const fromCookie = cookieCsrf();
	if (fromCookie) {
		const boot = window.field_visit_portal_boot || {};
		if (boot.csrf_token && boot.csrf_token !== fromCookie) {
			boot.csrf_token = fromCookie;
		}
		if (window.csrf_token && window.csrf_token !== fromCookie) {
			window.csrf_token = fromCookie;
		}
		return fromCookie;
	}
	const boot = window.field_visit_portal_boot || {};
	if (boot.csrf_token) return boot.csrf_token;
	if (window.csrf_token) return window.csrf_token;
	return "";
}

function friendlyMessage(msg) {
	const text = typeof msg === "string" ? msg.trim() : "";
	if (!text) return "Request failed";
	if (/^invalid request$/i.test(text) || /csrftokenerror/i.test(text)) {
		return "Session expired on this page. Please refresh and try again.";
	}
	return text;
}

function raiseIfFailed(json) {
	if (!json || typeof json !== "object") {
		throw new Error("Empty response from server");
	}
	if (json.exc || json._server_messages) {
		let msg = json.message;
		if (msg && typeof msg === "object") {
			msg = msg.status_message || msg.message || msg.name || "";
		}
		if (json._server_messages) {
			try {
				const parsed = JSON.parse(json._server_messages);
				msg = parsed
					.map((m) => {
						if (typeof m !== "string") return String(m);
						try {
							const inner = JSON.parse(m);
							return inner.message || inner.title || m;
						} catch {
							return m;
						}
					})
					.filter(Boolean)
					.join(" ");
			} catch {
				msg = json._server_messages;
			}
		}
		if (!msg && json.exc) {
			try {
				const exc = JSON.parse(json.exc);
				msg = Array.isArray(exc) ? exc[exc.length - 1] : String(exc);
			} catch {
				msg = String(json.exc);
			}
		}
		if (typeof msg === "string" && msg.includes("Traceback")) {
			const lines = msg.split("\n").map((l) => l.trim()).filter(Boolean);
			msg = lines[lines.length - 1] || msg;
		}
		throw new Error(friendlyMessage(typeof msg === "string" && msg ? msg : "Request failed"));
	}
	return json.message;
}

function isCsrfFailure(json) {
	if (!json || typeof json !== "object") return false;
	const blob = `${json.exc || ""} ${json._server_messages || ""} ${json.message || ""}`;
	return /Invalid Request/i.test(blob) || /CSRFTokenError/i.test(blob);
}

async function postOnce(method, args) {
	return fetch(`/api/method/${method}`, {
		method: "POST",
		credentials: "include",
		headers: {
			Accept: "application/json",
			"Content-Type": "application/json",
			"X-Frappe-CSRF-Token": csrfToken(),
		},
		body: JSON.stringify(args),
	});
}

export async function apiGet(method, args = {}) {
	const params = new URLSearchParams();
	for (const [k, v] of Object.entries(args)) {
		if (v === undefined || v === null) continue;
		params.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
	}
	const url = `/api/method/${method}${params.toString() ? `?${params}` : ""}`;
	const res = await fetch(url, { credentials: "include", headers: { Accept: "application/json" } });
	if (res.status === 403 || res.status === 401) {
		window.location.href = `/login?redirect-to=${encodeURIComponent("/field-visit-easy")}`;
		throw new Error("Please log in");
	}
	return raiseIfFailed(await res.json());
}

export async function apiPost(method, args = {}) {
	let res = await postOnce(method, args);
	if (res.status === 403 || res.status === 401) {
		window.location.href = `/login?redirect-to=${encodeURIComponent("/field-visit-easy")}`;
		throw new Error("Please log in");
	}
	let json = await res.json();
	// One retry after syncing token from cookie (stale boot token on long-lived mobile tabs).
	if (isCsrfFailure(json) && cookieCsrf()) {
		res = await postOnce(method, args);
		if (res.status === 403 || res.status === 401) {
			window.location.href = `/login?redirect-to=${encodeURIComponent("/field-visit-easy")}`;
			throw new Error("Please log in");
		}
		json = await res.json();
	}
	return raiseIfFailed(json);
}

export async function uploadFile(file, { doctype, docname, fieldname, isPrivate = true } = {}) {
	if (!file) throw new Error("No file selected for upload.");
	const fd = new FormData();
	fd.append("file", file, file.name || "attachment");
	if (doctype) fd.append("doctype", doctype);
	if (docname) fd.append("docname", docname);
	if (fieldname) fd.append("fieldname", fieldname);
	fd.append("is_private", isPrivate ? "1" : "0");
	const res = await fetch("/api/method/upload_file", {
		method: "POST",
		credentials: "include",
		headers: {
			Accept: "application/json",
			"X-Frappe-CSRF-Token": csrfToken(),
		},
		body: fd,
	});
	return raiseIfFailed(await res.json());
}

export const METHOD = "tif_customization.tif_customization.page.smes_activity_form.smes_activity_form";
export const TRAVEL_METHOD = "tif_customization.tif_customization.field_visit_travel_cost";
