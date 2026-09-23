export function formatClock(value) {
	if (value == null || value === "") return "—";
	const raw = String(value).trim();
	if (/\b(AM|PM)\b/i.test(raw) && !/\d+[.:]\d+[.:]\d+\.\d+/.test(raw)) return raw;
	if (/^\d{4}-\d{2}-\d{2}/.test(raw) && /[ T]\d{1,2}:\d{2}/.test(raw)) {
		const d = new Date(raw.replace(" ", "T"));
		if (!Number.isNaN(d.getTime())) {
			return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
		}
	}
	const parts = raw
		.split(/[.:]/)
		.map((p) => p.replace(/[^\d]/g, ""))
		.filter((p) => p !== "");
	if (parts.length >= 2) {
		let h = Number(parts[0]) || 0;
		const m = Math.min(59, Number(parts[1]) || 0);
		h = ((h % 24) + 24) % 24;
		const ampm = h < 12 ? "AM" : "PM";
		const h12 = h % 12 || 12;
		return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
	}
	return raw;
}

export function downloadCsv(rows, headers, filename) {
	const lines = [headers.join(",")].concat(
		rows.map((r) => headers.map((h) => `"${String(r[h] ?? "").replace(/"/g, '""')}"`).join(","))
	);
	const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
	const a = document.createElement("a");
	a.href = URL.createObjectURL(blob);
	a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
	a.click();
	URL.revokeObjectURL(a.href);
}

export function exportTable(rows, headers, kind, filename) {
	if (kind === "print" || kind === "pdf") {
		window.print();
		return;
	}
	downloadCsv(rows, headers, filename);
}
