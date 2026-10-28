# Copyright (c) 2026, TIF Customization and contributors
# License: MIT
"""Phase 1: OCR Workshop Evaluation Form PDFs/images → Workshop Feedback OCR linked to Upcoming Training."""

from __future__ import annotations

import io
import json
import os
import re
from datetime import datetime

import frappe
from frappe import _
from frappe.utils import cint, get_files_path, getdate, now_datetime

# Safety cap for very large scans (each page ≈ one evaluation form).
MAX_OCR_PAGES = 40


RATING_FIELDS = (
	"rating_overall_quality",
	"rating_objectives_clear",
	"rating_trainer_knowledge",
	"rating_trainer_communication",
	"rating_participation",
	"rating_activities",
	"rating_content_structure",
	"rating_learning_environment",
	"rating_time_management",
	"rating_met_objectives",
	"rating_classroom_application",
	"rating_professional_development",
)

# Printed statement snippets used to locate each rating row in OCR text.
RATING_HINTS = (
	("overall quality", "rating_overall_quality"),
	("objectives were clear", "rating_objectives_clear"),
	("good knowledge of the topic", "rating_trainer_knowledge"),
	("communicated the content clearly", "rating_trainer_communication"),
	("encouraged participation", "rating_participation"),
	("activities and teaching strategies", "rating_activities"),
	("well-structured", "rating_content_structure"),
	("positive and encouraging learning", "rating_learning_environment"),
	("time was managed", "rating_time_management"),
	("met its stated learning", "rating_met_objectives"),
	("applied in my classroom", "rating_classroom_application"),
	("professional development", "rating_professional_development"),
)

FEEDBACK_MIME_HINTS = (".pdf", ".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff")


def _is_feedback_candidate(filename: str) -> bool:
	name = (filename or "").lower()
	return any(name.endswith(ext) for ext in FEEDBACK_MIME_HINTS)


def _file_path_from_url(file_url: str) -> str | None:
	if not file_url:
		return None
	# /files/x.pdf or /private/files/x.pdf
	rel = file_url
	if rel.startswith("/private/files/"):
		rel = rel[len("/private/files/") :]
		base = get_files_path(is_private=True)
	elif rel.startswith("/files/"):
		rel = rel[len("/files/") :]
		base = get_files_path(is_private=False)
	else:
		return None
	path = os.path.join(base, rel)
	return path if os.path.isfile(path) else None


def _render_pages_to_images(path: str, max_pages: int = MAX_OCR_PAGES) -> list:
	"""Render PDF pages (or load image) as PIL Images via PyMuPDF."""
	import fitz
	from PIL import Image

	images = []
	lower = path.lower()
	if lower.endswith((".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff")):
		images.append(Image.open(path).convert("RGB"))
		return images

	doc = fitz.open(path)
	try:
		for i, page in enumerate(doc):
			if i >= max_pages:
				break
			pix = page.get_pixmap(matrix=fitz.Matrix(2.0, 2.0), alpha=False)
			img = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")
			images.append(img)
	finally:
		doc.close()
	return images


def _ocr_one_image(engine, img) -> str:
	import numpy as np

	arr = np.array(img)
	result, _ = engine(arr)
	lines = []
	if result:
		for item in result:
			if len(item) >= 2 and item[1]:
				lines.append(str(item[1]).strip())
	return "\n".join(lines).strip()


def _run_rapidocr_pages(images: list) -> tuple[list[dict], str]:
	"""OCR every page. Return ([{page, text}, ...], engine_name)."""
	from rapidocr_onnxruntime import RapidOCR

	engine = RapidOCR()
	pages = []
	for idx, img in enumerate(images):
		text = _ocr_one_image(engine, img)
		pages.append({"page": idx + 1, "text": text})
	return pages, "rapidocr-onnxruntime"


def _page_looks_like_form(text: str) -> bool:
	"""True if this page is likely a Workshop Evaluation Form (not a blank/cover)."""
	t = (text or "").lower()
	if len(t) < 40:
		return False
	keys = (
		"workshop",
		"evaluation",
		"participant",
		"rating",
		"trainer",
		"school",
		"objectives",
		"ilm foundation",
	)
	hits = sum(1 for k in keys if k in t)
	return hits >= 2


def _build_extracted_json(page_no: int, page_count: int, parsed: dict, raw_text: str) -> dict:
	ratings = {f: parsed.get(f) for f in RATING_FIELDS if parsed.get(f)}
	header = {
		k: parsed.get(k)
		for k in (
			"participant_name",
			"school",
			"mobile_no",
			"email",
			"participant_role",
			"feedback_date",
			"trainer_name",
			"topic",
			"duration",
		)
		if parsed.get(k)
	}
	# Dates must be JSON-serializable
	if header.get("feedback_date"):
		header["feedback_date"] = str(header["feedback_date"])
	return {
		"page": page_no,
		"page_count": page_count,
		"header": header,
		"ratings": ratings,
		"raw_text": (raw_text or "")[:8000],
	}


def _label_value(text: str, labels: list[str]) -> str:
	"""Pull value after a label on the same or next line."""
	norm = text.replace("\r", "")
	for label in labels:
		# Same line: Label: value / Label value
		pat = re.compile(
			rf"(?im)^\s*{re.escape(label)}\s*[:\-–]?\s*(.+?)\s*$"
		)
		m = pat.search(norm)
		if m:
			val = m.group(1).strip()
			# Drop trailing label fragments
			val = re.split(r"\s{2,}|\t", val)[0].strip()
			if val and len(val) > 1 and not re.fullmatch(r"[:\-–]+", val):
				return val[:140]
		# Label on one line, value on next
		pat2 = re.compile(
			rf"(?im)^\s*{re.escape(label)}\s*[:\-–]?\s*$\n\s*(.+?)\s*$"
		)
		m2 = pat2.search(norm)
		if m2:
			val = m2.group(1).strip()
			if val and len(val) > 1:
				return val[:140]
	return ""


def _parse_mobile(text: str) -> str:
	m = re.search(r"(?<!\d)(0\d{3}[-\s]?\d{7}|\+?92\d{10}|03\d{2}[-\s]?\d{7})(?!\d)", text)
	return m.group(1).replace(" ", "") if m else ""


def _parse_date(text: str):
	patterns = (
		(r"(\d{1,2}[./\-]\d{1,2}[./\-]\d{2,4})", "%d/%m/%Y"),
		(r"(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})", "%d %B %Y"),
		(r"(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})", "%d %b %Y"),
		(r"(\d{4}-\d{2}-\d{2})", "%Y-%m-%d"),
	)
	# Prefer line near Date label
	near = _label_value(text, ["Date", "Dated"])
	candidates = [near] if near else []
	candidates += re.findall(r"\d{1,2}[./\-]\d{1,2}[./\-]\d{2,4}", text)
	candidates += re.findall(r"\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}", text)
	for raw in candidates:
		raw = (raw or "").strip()
		if not raw:
			continue
		cleaned = raw.replace(".", "/").replace("-", "/")
		for fmt in ("%d/%m/%Y", "%d/%m/%y", "%m/%d/%Y", "%Y/%m/%d"):
			try:
				return getdate(datetime.strptime(cleaned, fmt).date())
			except ValueError:
				continue
		for fmt in ("%d %B %Y", "%d %b %Y"):
			try:
				return getdate(datetime.strptime(raw, fmt).date())
			except ValueError:
				continue
	return None


def _guess_rating_near_hint(text: str, hint: str) -> int | None:
	"""Very rough Phase-1: look for a lone 1-5 near the statement hint."""
	lower = text.lower()
	idx = lower.find(hint.lower())
	if idx < 0:
		return None
	window = text[idx : idx + 180]
	# Prefer check-like markers then digits
	m = re.search(r"(?:✓|✔|√|x|X|\[\s*[xX✓]\s*\])\s*([1-5])|([1-5])\s*(?:✓|✔|√)", window)
	if m:
		return cint(m.group(1) or m.group(2))
	nums = re.findall(r"(?<!\d)([1-5])(?!\d)", window)
	# If multiple, take the first after the hint text block
	if nums:
		return cint(nums[0])
	return None


def _fuzzy_find_after(text: str, needles: list[str], max_len: int = 80) -> str:
	"""Find first needle (case-insensitive) and return following token(s) on that line."""
	for needle in needles:
		m = re.search(rf"(?i){re.escape(needle)}\s*[:\-–]?\s*(.+)", text)
		if not m:
			continue
		val = m.group(1).strip()
		# Cut at next known label-ish word
		val = re.split(
			r"(?i)\b(school|date|e-?mail|mobile|topic|duration|your role|trainer)\b",
			val,
			maxsplit=1,
		)[0].strip(" :-–\t")
		if val and len(val) > 1:
			return val[:max_len]
	return ""


def parse_workshop_evaluation_text(ocr_text: str) -> dict:
	"""Map OCR text from ILM Workshop Evaluation Form into structured fields."""
	text = ocr_text or ""
	out = {
		"participant_name": _label_value(
			text, ["Participant's Name", "Participant’s Name", "Participant Name", "Name of Participant"]
		)
		or _fuzzy_find_after(text, ["Participant's Name", "Participant’s Name", "Participant Name"]),
		"school": _label_value(text, ["School", "School Name", "Institute"])
		or _fuzzy_find_after(text, ["School"]),
		"email": _label_value(text, ["E-mail", "Email", "E mail"]),
		"participant_role": _label_value(text, ["Your Role", "Role", "Designation"]),
		"trainer_name": _label_value(text, ["Trainer's Name", "Trainer’s Name", "Trainer Name", "Trainers Name"])
		or _fuzzy_find_after(text, ["Trainer"]),
		"topic": _label_value(text, ["Topic", "Workshop Topic"]) or _fuzzy_find_after(text, ["Topic"]),
		"duration": _label_value(text, ["Duration"]) or _fuzzy_find_after(text, ["Duration"]),
		"mobile_no": _parse_mobile(text) or _label_value(text, ["Mobile No", "Mobile", "Contact No", "Phone"]),
		"feedback_date": _parse_date(text),
	}

	# Prefer "X Schooling System" / "X School" style school names from raw text
	if not out["school"] or len(out["school"]) < 4:
		sm = re.search(r"(?i)\b([A-Za-z][A-Za-z0-9 .,&'-]{2,40}\s+School(?:ing)?(?:\s+System)?)\b", text)
		if sm:
			out["school"] = sm.group(1).strip()[:140]

	# Duration like "2 Hours"
	if not out["duration"]:
		dm = re.search(r"(?i)\b(\d+\s*(?:Hours?|hrs?|Minutes?|mins?))\b", text)
		if dm:
			out["duration"] = dm.group(1)

	# Clean email if OCR glued extra words
	if out["email"] and "@" not in out["email"]:
		em = re.search(r"[\w.+-]+@[\w.-]+\.\w+", text)
		out["email"] = em.group(0) if em else ""
	elif out["email"]:
		em = re.search(r"[\w.+-]+@[\w.-]+\.\w+", out["email"])
		out["email"] = em.group(0) if em else out["email"][:140]

	# Drop garbage participant names that are clearly UI chrome
	junk = {"firefox", "whatsapp", "pdf", "activities", "writer"}
	if (out.get("participant_name") or "").strip().lower() in junk:
		out["participant_name"] = ""
	# Two-token person name fallback near "Participant"
	if not out["participant_name"]:
		pm = re.search(
			r"(?i)participant[^\n]{0,40}\n\s*([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,3})\s*$",
			text,
			re.M,
		)
		if pm:
			out["participant_name"] = pm.group(1).strip()

	for hint, field in RATING_HINTS:
		val = _guess_rating_near_hint(text, hint)
		if val and 1 <= val <= 5:
			out[field] = val
	return out


def extract_pages_from_file(path: str) -> tuple[list[dict], str, int]:
	"""Return ([{page, text}, ...], engine, total_pages_rendered)."""
	images = _render_pages_to_images(path, max_pages=MAX_OCR_PAGES)
	if not images:
		frappe.throw(_("Could not render pages from the uploaded file."))
	pages, engine = _run_rapidocr_pages(images)
	return pages, engine, len(images)


def extract_text_from_file(path: str) -> tuple[str, str]:
	"""Legacy helper: joined OCR text for all pages."""
	pages, engine, _ = extract_pages_from_file(path)
	chunks = [f"--- page {p['page']} ---\n{p['text']}" for p in pages if p.get("text")]
	return "\n".join(chunks).strip(), engine


def _apply_parsed_to_doc(doc, parsed: dict, raw: str, engine: str, page_no: int, page_count: int):
	doc.raw_ocr_text = raw
	doc.ocr_engine = engine
	doc.processed_on = now_datetime()
	doc.page_number = page_no
	doc.page_count = page_count
	doc.error_message = ""
	for key, val in parsed.items():
		if val is not None and val != "":
			doc.set(key, val)
	payload = _build_extracted_json(page_no, page_count, parsed, raw)
	doc.extracted_json = json.dumps(payload, ensure_ascii=False, indent=2)
	doc.status = "Processed" if raw else "Failed"
	if not raw:
		doc.error_message = _("OCR returned no text on this page.")


def process_feedback_file(upcoming_training: str, file_url: str, filename: str | None = None) -> dict:
	"""OCR all PDF pages; create one Workshop Feedback OCR per evaluation form page."""
	if not upcoming_training or not frappe.db.exists("Upcoming Training", upcoming_training):
		frappe.throw(_("Upcoming Training {0} not found.").format(upcoming_training))

	path = _file_path_from_url(file_url)
	if not path:
		frappe.throw(_("Could not locate uploaded file on disk."))

	source_name = filename or os.path.basename(path)
	created_rows = []

	try:
		pages, engine, page_count = extract_pages_from_file(path)
		form_pages = [p for p in pages if _page_looks_like_form(p.get("text") or "")]
		# If heuristics miss, still keep every non-empty page so multi-page scans are not dropped.
		if not form_pages:
			form_pages = [p for p in pages if (p.get("text") or "").strip()]
		if not form_pages:
			doc = frappe.get_doc(
				{
					"doctype": "Workshop Feedback OCR",
					"upcoming_training": upcoming_training,
					"source_file": file_url,
					"source_file_name": source_name,
					"status": "Failed",
					"page_number": 1,
					"page_count": page_count,
					"ocr_engine": engine,
					"processed_on": now_datetime(),
					"error_message": _("OCR found no readable form pages."),
					"extracted_json": json.dumps(
						{"page_count": page_count, "pages": [], "error": "no readable text"},
						ensure_ascii=False,
					),
				}
			)
			doc.insert(ignore_permissions=True)
			frappe.db.commit()
			created_rows.append(_feedback_row(doc))
		else:
			for page in form_pages:
				raw = page.get("text") or ""
				parsed = parse_workshop_evaluation_text(raw)
				doc = frappe.get_doc(
					{
						"doctype": "Workshop Feedback OCR",
						"upcoming_training": upcoming_training,
						"source_file": file_url,
						"source_file_name": f"{source_name} (page {page['page']})",
						"status": "Pending",
						"page_number": page["page"],
						"page_count": page_count,
					}
				)
				doc.insert(ignore_permissions=True)
				_apply_parsed_to_doc(doc, parsed, raw, engine, page["page"], page_count)
				doc.save(ignore_permissions=True)
				created_rows.append(_feedback_row(doc))
			frappe.db.commit()
	except Exception:
		frappe.db.rollback()
		frappe.log_error(frappe.get_traceback(), "Workshop Feedback OCR")
		raise

	processed = sum(1 for r in created_rows if r.get("status") == "Processed")
	return {
		"status": "Processed" if processed else "Failed",
		"count": len(created_rows),
		"processed": processed,
		"page_count": created_rows[0].get("page_count") if created_rows else 0,
		"rows": created_rows,
		"name": created_rows[0]["name"] if created_rows else "",
		"participant_name": created_rows[0].get("participant_name") if created_rows else "",
		"error_message": "" if processed else _("OCR could not read form pages."),
	}


def _feedback_row(doc) -> dict:
	row = {
		"name": doc.name,
		"upcoming_training": doc.upcoming_training,
		"source_file": doc.source_file,
		"source_file_name": doc.source_file_name,
		"status": doc.status,
		"ocr_engine": doc.ocr_engine,
		"processed_on": str(doc.processed_on) if doc.processed_on else "",
		"error_message": doc.error_message or "",
		"page_number": cint(doc.page_number) or None,
		"page_count": cint(doc.page_count) or None,
		"participant_name": doc.participant_name or "",
		"school": doc.school or "",
		"mobile_no": doc.mobile_no or "",
		"email": doc.email or "",
		"participant_role": doc.participant_role or "",
		"feedback_date": str(doc.feedback_date) if doc.feedback_date else "",
		"trainer_name": doc.trainer_name or "",
		"topic": doc.topic or "",
		"duration": doc.duration or "",
		"extracted_json": doc.extracted_json or "",
		"raw_ocr_text": (doc.raw_ocr_text or "")[:4000],
	}
	for f in RATING_FIELDS:
		row[f] = cint(doc.get(f)) or None
	return row


def list_feedback_for_training(name: str) -> list[dict]:
	rows = frappe.get_all(
		"Workshop Feedback OCR",
		filters={"upcoming_training": name},
		fields=[
			"name",
			"source_file",
			"source_file_name",
			"status",
			"page_number",
			"page_count",
			"participant_name",
			"school",
			"mobile_no",
			"feedback_date",
			"topic",
			"trainer_name",
			"processed_on",
			"error_message",
			"extracted_json",
			*RATING_FIELDS,
		],
		order_by="page_number asc, creation asc",
		limit_page_length=200,
	)
	out = []
	for r in rows:
		d = dict(r)
		d["processed_on"] = str(d.get("processed_on") or "")
		d["feedback_date"] = str(d.get("feedback_date") or "")
		out.append(d)
	return out


@frappe.whitelist()
def list_session_feedback(name=None):
	"""List OCR feedback forms tagged to an Upcoming Training."""
	if frappe.session.user == "Guest":
		frappe.throw(_("Please log in"), frappe.AuthenticationError)
	name = (name or "").strip()
	if not name:
		return {"rows": []}
	if not frappe.has_permission("Upcoming Training", "read"):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	return {"ok": 1, "rows": list_feedback_for_training(name)}


@frappe.whitelist()
def process_uploaded_feedback(name=None, file_url=None, filename=None):
	"""Run OCR on an already-attached file and tag results to the session."""
	if frappe.session.user == "Guest":
		frappe.throw(_("Please log in"), frappe.AuthenticationError)
	name = (name or "").strip()
	file_url = (file_url or "").strip()
	if not name:
		frappe.throw(_("Upcoming Training name is required."))
	if not file_url:
		frappe.throw(_("File URL is required."))
	if not frappe.has_permission("Upcoming Training", "write"):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	result = process_feedback_file(name, file_url, filename or "")
	count = cint(result.get("count"))
	processed = cint(result.get("processed"))
	page_count = cint(result.get("page_count"))
	if processed:
		msg = _("OCR tagged {0} feedback form(s) from {1} page(s).").format(processed, page_count or processed)
	else:
		msg = _("OCR finished but no form pages could be read.")
	return {
		"ok": 1,
		"ocr": result,
		"feedback_forms": list_feedback_for_training(name),
		"message": msg,
	}


@frappe.whitelist()
def reprocess_feedback(name=None):
	"""Re-run OCR for the source file of this record (all pages → new/updated set)."""
	if frappe.session.user == "Guest":
		frappe.throw(_("Please log in"), frappe.AuthenticationError)
	name = (name or "").strip()
	doc = frappe.get_doc("Workshop Feedback OCR", name)
	if not frappe.has_permission("Upcoming Training", "write"):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	# Re-OCR the whole PDF and create page records for this session.
	result = process_feedback_file(doc.upcoming_training, doc.source_file, doc.source_file_name)
	return {
		"ok": 1,
		"result": result,
		"feedback_forms": list_feedback_for_training(doc.upcoming_training),
		"message": _("Reprocessed {0} page form(s).").format(cint(result.get("processed"))),
	}
