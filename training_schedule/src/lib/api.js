function cookieCsrf() {
	const match = document.cookie.match(/(?:^|; )csrf_token=([^;]+)/);
	if (!match) return "";
	let value = decodeURIComponent(match[1].trim());
	if (
		(value.startsWith('"') && value.endsWith('"')) ||
		(value.startsWith("'") && value.endsWith("'"))
	) {
		value = value.slice(1, -1);
	}
	return value;
}

function csrfToken() {
	// Prefer live cookie over stale page-boot token (avoids silent "Invalid Request").
	const fromCookie = cookieCsrf();
	if (fromCookie) {
		const boot = window.training_schedule_boot || {};
		if (boot.csrf_token && boot.csrf_token !== fromCookie) boot.csrf_token = fromCookie;
		if (window.csrf_token && window.csrf_token !== fromCookie) window.csrf_token = fromCookie;
		return fromCookie;
	}
	const boot = window.training_schedule_boot || {};
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

export async function apiGet(method, args = {}) {
	const params = new URLSearchParams();
	for (const [k, v] of Object.entries(args)) {
		if (v != null && v !== "") params.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
	}
	const url = `/api/method/${method}${params.toString() ? `?${params}` : ""}`;
	const res = await fetch(url, { credentials: "include", headers: { Accept: "application/json" } });
	if (res.status === 401 || res.status === 403) {
		throw new Error("Please log in again, then retry.");
	}
	const text = await res.text();
	let json;
	try {
		json = text ? JSON.parse(text) : null;
	} catch {
		throw new Error(`Server returned non-JSON (${res.status}). Try refresh.`);
	}
	return raiseIfFailed(json);
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

export async function apiPost(method, args = {}) {
	let res = await postOnce(method, args);
	if (res.status === 401 || res.status === 403) {
		throw new Error("Please log in again, then retry.");
	}
	let text = await res.text();
	let json;
	try {
		json = text ? JSON.parse(text) : null;
	} catch {
		throw new Error(`Server returned non-JSON (${res.status}). Try refresh.`);
	}
	if (isCsrfFailure(json) && cookieCsrf()) {
		res = await postOnce(method, args);
		text = await res.text();
		try {
			json = text ? JSON.parse(text) : null;
		} catch {
			throw new Error(`Server returned non-JSON (${res.status}). Try refresh.`);
		}
	}
	return raiseIfFailed(json);
}

export async function apiUpload(method, args = {}, file) {
	const fd = new FormData();
	for (const [key, value] of Object.entries(args)) {
		if (value != null && value !== "") fd.append(key, String(value));
	}
	fd.append("file", file, file.name || "upload.bin");
	const doFetch = () =>
		fetch(`/api/method/${method}`, {
			method: "POST",
			credentials: "include",
			headers: {
				Accept: "application/json",
				"X-Frappe-CSRF-Token": csrfToken(),
			},
			body: fd,
		});
	let res = await doFetch();
	if (res.status === 401 || res.status === 403) {
		throw new Error("Please log in again, then retry.");
	}
	let text = await res.text();
	let json;
	try {
		json = text ? JSON.parse(text) : null;
	} catch {
		if (res.status === 413 || /Request Entity Too Large/i.test(text || "")) {
			throw new Error(
				"Upload failed: file is too large (server limit). Compress the PDF under ~50 MB (or fewer CamScanner pages) and try again."
			);
		}
		throw new Error(
			`Upload failed (${res.status}). ${text ? text.slice(0, 120) : "Empty response — try a smaller PDF or refresh."}`
		);
	}
	if (isCsrfFailure(json) && cookieCsrf()) {
		res = await doFetch();
		text = await res.text();
		try {
			json = text ? JSON.parse(text) : null;
		} catch {
			throw new Error(`Upload failed after retry (${res.status}).`);
		}
	}
	return raiseIfFailed(json);
}

export const METHOD = "tif_customization.tif_customization.api.training_schedule";
export const LMS_METHOD = "tif_customization.tif_customization.api.training_lms";
