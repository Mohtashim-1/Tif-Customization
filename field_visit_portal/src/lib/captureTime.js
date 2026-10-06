const CAMERA_NAME = /(20\d{6})[_-](\d{6})(AM|PM)?/i;
const SCREENSHOT_NAME = /(20\d{2})-(\d{2})-(\d{2})[^\d]{1,16}(\d{1,2})[.\-:](\d{2})[.\-:](\d{2})(?:\s*(AM|PM))?/i;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function validStamp(year, month, day, hour, minute, second, ampm) {
	ampm = (ampm || "").toUpperCase();
	if (ampm === "PM" && hour < 12) hour += 12;
	if (ampm === "AM" && hour === 12) hour = 0;
	if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return "";
	return stamp(year, month, day, hour, minute, second);
}

function fromFilename(name) {
	const fileName = name || "";
	const camera = CAMERA_NAME.exec(fileName);
	if (camera) {
		const rawDate = camera[1];
		const rawTime = camera[2];
		const found = validStamp(
			Number(rawDate.slice(0, 4)),
			Number(rawDate.slice(4, 6)),
			Number(rawDate.slice(6, 8)),
			Number(rawTime.slice(0, 2)),
			Number(rawTime.slice(2, 4)),
			Number(rawTime.slice(4, 6)),
			camera[3]
		);
		if (found) return found;
	}
	const shot = SCREENSHOT_NAME.exec(fileName);
	if (!shot) return "";
	return validStamp(Number(shot[1]), Number(shot[2]), Number(shot[3]), Number(shot[4]), Number(shot[5]), Number(shot[6]), shot[7]);
}

function stamp(year, month, day, hour, minute, second) {
	const p = (n) => String(n).padStart(2, "0");
	return `${year}-${p(month)}-${p(day)} ${p(hour)}:${p(minute)}:${p(second)}`;
}

function ascii(bytes, start, length) {
	let out = "";
	const end = Math.min(bytes.length, start + length);
	for (let i = start; i < end; i++) {
		const code = bytes[i];
		if (!code) break;
		out += String.fromCharCode(code);
	}
	return out;
}

function tiffDate(bytes, tiffStart) {
	if (tiffStart < 0 || tiffStart + 8 > bytes.length) return "";
	const le = bytes[tiffStart] === 0x49 && bytes[tiffStart + 1] === 0x49;
	const be = bytes[tiffStart] === 0x4d && bytes[tiffStart + 1] === 0x4d;
	if (!le && !be) return "";
	const u16 = (offset) => {
		const i = tiffStart + offset;
		if (i < 0 || i + 1 >= bytes.length) return 0;
		return le ? bytes[i] | (bytes[i + 1] << 8) : (bytes[i] << 8) | bytes[i + 1];
	};
	const u32 = (offset) => {
		const i = tiffStart + offset;
		if (i < 0 || i + 3 >= bytes.length) return 0;
		return le
			? (bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16) | (bytes[i + 3] << 24)) >>> 0
			: ((bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]) >>> 0;
	};
	const readAscii = (ifdOffset, tag) => {
		if (ifdOffset <= 0 || tiffStart + ifdOffset + 2 > bytes.length) return "";
		const count = u16(ifdOffset);
		if (!count || count > 500) return "";
		for (let i = 0; i < count; i++) {
			const entry = ifdOffset + 2 + i * 12;
			if (tiffStart + entry + 12 > bytes.length) return "";
			if (u16(entry) !== tag) continue;
			const type = u16(entry + 2);
			const n = u32(entry + 4);
			if (type !== 2 || !n || n > 64) return "";
			const inline = n <= 4;
			const valueAt = inline ? entry + 8 : u32(entry + 8);
			if (!inline && tiffStart + valueAt + n > bytes.length) return "";
			return ascii(bytes, tiffStart + valueAt, n);
		}
		return "";
	};
	const pointer = (ifdOffset, tag) => {
		if (ifdOffset <= 0 || tiffStart + ifdOffset + 2 > bytes.length) return 0;
		const count = u16(ifdOffset);
		if (!count || count > 500) return 0;
		for (let i = 0; i < count; i++) {
			const entry = ifdOffset + 2 + i * 12;
			if (tiffStart + entry + 12 > bytes.length) return 0;
			if (u16(entry) === tag) return u32(entry + 8);
		}
		return 0;
	};
	const normalize = (raw) => {
		const match = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(raw || "");
		if (!match) return "";
		const year = Number(match[1]);
		const month = Number(match[2]);
		const day = Number(match[3]);
		const hour = Number(match[4]);
		const minute = Number(match[5]);
		const second = Number(match[6]);
		if (year < 1990 || month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) {
			return "";
		}
		return stamp(year, month, day, hour, minute, second);
	};
	const ifd0 = u32(4);
	const exifIfd = pointer(ifd0, 0x8769);
	const original = normalize(readAscii(exifIfd, 0x9003)) || normalize(readAscii(ifd0, 0x9003));
	const digitized = normalize(readAscii(exifIfd, 0x9004)) || normalize(readAscii(ifd0, 0x9004));
	return original || digitized;
}

function fromExif(bytes) {
	const sig = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00];
	const limit = Math.min(bytes.length - 14, 20 * 1024 * 1024);
	for (let i = 0; i < limit; i++) {
		if (bytes[i] !== sig[0] || bytes[i + 1] !== sig[1] || bytes[i + 2] !== sig[2] || bytes[i + 3] !== sig[3]) continue;
		if (bytes[i + 4] !== sig[4] || bytes[i + 5] !== sig[5]) continue;
		const found = tiffDate(bytes, i + 6);
		if (found) return found;
	}
	return "";
}

function fromPngTime(bytes) {
	if (bytes.length < 24 || bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) return "";
	let offset = 8;
	while (offset + 12 <= bytes.length) {
		const length = ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
		const type = ascii(bytes, offset + 4, 4);
		if (type === "tIME" && length >= 7 && offset + 15 <= bytes.length) {
			const year = (bytes[offset + 8] << 8) | bytes[offset + 9];
			return validStamp(year, bytes[offset + 10], bytes[offset + 11], bytes[offset + 12], bytes[offset + 13], bytes[offset + 14]);
		}
		if (type === "IEND") break;
		if (!length && type !== "IEND") break;
		offset += 12 + length;
	}
	return "";
}

function fromEmbeddedText(bytes) {
	const limit = Math.min(bytes.length, 512 * 1024);
	let text = "";
	for (let i = 0; i < limit; i++) {
		const code = bytes[i];
		text += code >= 32 && code < 127 ? String.fromCharCode(code) : "\n";
	}
	const match = /(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(text);
	if (!match) return "";
	return validStamp(Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6]));
}

function fromLastModified(file) {
	const ms = Number(file && file.lastModified);
	if (!ms) return "";
	const when = new Date(ms);
	if (Number.isNaN(when.getTime())) return "";
	return stamp(when.getFullYear(), when.getMonth() + 1, when.getDate(), when.getHours(), when.getMinutes(), when.getSeconds());
}

export function formatCapture(value) {
	const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/.exec(value || "");
	if (!match) return value || "";
	let hour = Number(match[4]);
	const ap = hour >= 12 ? "pm" : "am";
	hour = hour % 12 || 12;
	return `${Number(match[3])} ${MONTHS[Number(match[2]) - 1]} ${match[1]}, ${hour}:${match[5]} ${ap}`;
}

export async function readCaptureTime(file) {
	if (!file) return "";
	const named = fromFilename(file.name);
	const looksImage = isImageFile(file);
	if (!looksImage) return named;
	try {
		const bytes = new Uint8Array(await file.arrayBuffer());
		return fromExif(bytes) || fromPngTime(bytes) || fromEmbeddedText(bytes) || named || fromLastModified(file);
	} catch (e) {
		return named || fromLastModified(file);
	}
}

export async function fileWithCaptureTime(file) {
	if (!file || !isImageFile(file) || fromFilename(file.name)) return file;
	const when = await readCaptureTime(file);
	if (!when) return file;
	const pretty = `${when.slice(0, 10)} ${when.slice(11, 19).replace(/:/g, "-")}`;
	if (file.name.includes(pretty)) return file;
	const dot = file.name.lastIndexOf(".");
	const base = dot > 0 ? file.name.slice(0, dot) : file.name;
	const ext = dot > 0 ? file.name.slice(dot) : "";
	return new File([file], `${base} ${pretty}${ext}`, { type: file.type || "image/jpeg", lastModified: file.lastModified });
}

export function isImageFile(file) {
	if (!file) return false;
	return (file.type || "").startsWith("image/") || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name || "");
}
