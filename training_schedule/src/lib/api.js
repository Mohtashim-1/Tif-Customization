function csrfToken() {
	const boot = window.training_schedule_boot || {};
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
				msg = parsed.map((m) => (typeof m === "string" ? JSON.parse(m).message || m : m)).join(" ");
			} catch {
				msg = json._server_messages;
			}
		}
		throw new Error(typeof msg === "string" && msg ? msg : "Request failed");
	}
	return json.message;
}

export async function apiGet(method, args = {}) {
	const params = new URLSearchParams();
	for (const [k, v] of Object.entries(args)) {
		if (v != null && v !== "") params.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
	}
	const url = `/api/method/${method}${params.toString() ? `?${params}` : ""}`;
	const res = await fetch(url, { credentials: "include", headers: { Accept: "application/json" } });
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
	return raiseIfFailed(await res.json());
}

export const METHOD = "tif_customization.tif_customization.api.training_schedule";
