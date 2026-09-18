function csrfToken() {
	const boot = window.field_visit_portal_boot || {};
	if (boot.csrf_token) return boot.csrf_token;
	if (window.csrf_token) return window.csrf_token;
	const match = document.cookie.match(/(?:^|; )csrf_token=([^;]+)/);
	return match ? decodeURIComponent(match[1]) : "";
}

function raiseIfFailed(json) {
	if (json.exc || json._server_messages) {
		let msg = json.message;
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
		throw new Error(typeof msg === "string" && msg ? msg : "Request failed");
	}
	return json.message;
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
	const res = await fetch(`/api/method/${method}`, {
		method: "POST",
		credentials: "include",
		headers: {
			Accept: "application/json",
			"Content-Type": "application/json",
			"X-Frappe-CSRF-Token": csrfToken(),
		},
		body: JSON.stringify(args),
	});
	if (res.status === 403 || res.status === 401) {
		window.location.href = `/login?redirect-to=${encodeURIComponent("/field-visit-easy")}`;
		throw new Error("Please log in");
	}
	return raiseIfFailed(await res.json());
}

export async function uploadFile(file, { doctype, docname, fieldname, isPrivate = true } = {}) {
	const fd = new FormData();
	fd.append("file", file, file.name);
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
