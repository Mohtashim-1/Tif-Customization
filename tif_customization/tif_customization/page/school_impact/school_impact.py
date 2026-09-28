# Copyright (c) 2026, TIF Customization and contributors
# License: MIT
"""School Impact — KPIs from Feedback Studio submissions."""

from __future__ import annotations

import json

import frappe
from frappe.utils import add_days, cint, now_datetime

AUDIENCES = ("sme", "school", "parent", "student")
LABELS = {
	"sme": "SME",
	"school": "School",
	"parent": "Parent",
	"student": "Student",
}
ROLES = (
	"System Manager",
	"HR Manager",
	"HR User",
	"Field Staff Manager",
	"HOD",
	"COO",
	"SME User",
	"Field Staff",
	"Supervisor Field Staff",
	"Staff Reporting Manager",
	"SME Manager",
)
# Fallback labels when a saved form definition is not available.
KNOWN_CHOICES = {
	"Resources",
	"Training",
	"Workload",
	"Facilities",
	"Group work",
	"On my own",
	"Hands-on activities",
	"Listening to the teacher",
	"Keep as is",
	"Minor revisions",
	"Major revisions",
}


def _when(value):
	text = str(value or "").strip()
	return text[:19] if text else ""


def _check():
	if frappe.session.user == "Guest":
		frappe.throw(frappe._("Please log in."), frappe.PermissionError)
	frappe.only_for(ROLES)


def _as_dict(value):
	if isinstance(value, str):
		value = value.strip()
		if not value:
			return {}
		try:
			value = json.loads(value)
		except ValueError:
			return {}
	return value if isinstance(value, dict) else {}


def _filters(filters):
	data = _as_dict(filters)
	return {
		"from_date": data.get("from_date") or "",
		"to_date": data.get("to_date") or "",
		"audience": data.get("audience") if data.get("audience") in AUDIENCES else "",
		"sme_name": (data.get("sme_name") or "").strip(),
		"customer": data.get("customer") or "",
	}


def _scale():
	if frappe.db.table_exists("Feedback Studio Settings"):
		value = frappe.db.get_single_value("Feedback Studio Settings", "rating_scale")
		if str(value) == "10":
			return 10
	return 5


def _question_catalog():
	"""Map audience -> question id -> question definition from Feedback Studio Settings."""
	catalog = {aud: {} for aud in AUDIENCES}
	order = {aud: [] for aud in AUDIENCES}
	if not frappe.db.table_exists("Feedback Studio Settings"):
		return catalog, order
	raw = frappe.db.get_single_value("Feedback Studio Settings", "forms_json")
	forms = raw if isinstance(raw, dict) else _as_dict(raw)
	for aud in AUDIENCES:
		src = forms.get(aud) if isinstance(forms, dict) else None
		if not isinstance(src, dict):
			continue
		for item in (src.get("questions") or [])[:40]:
			if not isinstance(item, dict):
				continue
			qid = str(item.get("id") or "")
			if not qid:
				continue
			qtype = item.get("type") if item.get("type") in ("rating", "choice", "yesno", "text") else "text"
			catalog[aud][qid] = {
				"id": qid,
				"type": qtype,
				"text": str(item.get("text") or "Question")[:500],
				"options": [str(opt) for opt in (item.get("options") or []) if str(opt).strip()],
			}
			order[aud].append(qid)
	return catalog, order


def _response_filters(filters):
	clauses = []
	if filters["from_date"]:
		clauses.append(["submitted_on", ">=", filters["from_date"]])
	if filters["to_date"]:
		clauses.append(["submitted_on", "<", add_days(filters["to_date"], 1)])
	if filters["audience"]:
		clauses.append(["audience", "=", filters["audience"]])
	if filters["sme_name"]:
		clauses.append(["sme_name", "like", f"%{filters['sme_name']}%"])
	if filters["customer"]:
		clauses.append(["customer", "=", filters["customer"]])
	return clauses


def _fields():
	wanted = [
		"name",
		"audience",
		"answers_json",
		"submitted_on",
		"sme_name",
		"customer",
		"school_name",
		"school_opening",
		"session",
	]
	if not frappe.db.table_exists("Feedback Studio Response"):
		return []
	meta = frappe.get_meta("Feedback Studio Response")
	return [field for field in wanted if field == "name" or meta.has_field(field)]


def _infer_type(value):
	if isinstance(value, bool):
		return "text"
	if isinstance(value, (int, float)) and not isinstance(value, bool):
		return "rating"
	text = str(value or "").strip()
	if text in ("Yes", "No"):
		return "yesno"
	if text in KNOWN_CHOICES:
		return "choice"
	return "text"


def _school_key(row):
	if row.get("customer"):
		return "c:" + row.customer
	if row.get("school_opening"):
		return "o:" + row.school_opening
	name = (row.get("school_name") or "").strip()
	if name:
		return "n:" + name.lower()
	return ""


def _customer_names(rows):
	names = sorted({row.get("customer") for row in rows if row.get("customer")})
	if not names or not frappe.db.table_exists("Customer"):
		return {}
	found = frappe.get_all(
		"Customer",
		filters={"name": ["in", names]},
		fields=["name", "customer_name"],
		limit_page_length=0,
		ignore_permissions=True,
	)
	return {row.name: row.customer_name or row.name for row in found}


def _school_label(row, customers):
	if row.get("school_name"):
		return row.school_name
	if row.get("customer"):
		return customers.get(row.customer) or row.customer
	if row.get("school_opening"):
		return row.school_opening
	return "Not linked to a school"


def _session_count(filters):
	if not frappe.db.table_exists("Feedback Studio Session"):
		return 0
	clauses = []
	if filters["from_date"]:
		clauses.append(["creation", ">=", filters["from_date"]])
	if filters["to_date"]:
		clauses.append(["creation", "<", add_days(filters["to_date"], 1)])
	if filters["sme_name"]:
		clauses.append(["sme_name", "like", f"%{filters['sme_name']}%"])
	if filters["customer"]:
		clauses.append(["customer", "=", filters["customer"]])
	return frappe.db.count("Feedback Studio Session", filters=clauses or None)


def _empty(scale):
	return {
		"scale": scale,
		"kpis": [],
		"audiences": [],
		"questions": [],
		"schools": [],
		"comments": [],
		"submissions": [],
		"generated_on": _when(now_datetime()),
	}


@frappe.whitelist()
def get_report_data(filters=None):
	_check()
	filters = _filters(filters)
	scale = _scale()
	if not frappe.db.table_exists("Feedback Studio Response"):
		return _empty(scale)

	catalog, order = _question_catalog()
	rows = frappe.get_all(
		"Feedback Studio Response",
		filters=_response_filters(filters),
		fields=_fields(),
		order_by="submitted_on desc",
		limit_page_length=5000,
		ignore_permissions=True,
	)
	customers = _customer_names(rows)

	audience_counts = {aud: 0 for aud in AUDIENCES}
	rating_sum = 0.0
	rating_count = 0
	positive = 0
	smes = set()
	question_stats = {}
	schools = {}
	comments = []
	submissions = []

	for row in rows:
		aud = row.audience if row.audience in AUDIENCES else ""
		if aud:
			audience_counts[aud] += 1
		if row.get("sme_name"):
			smes.add(row.sme_name.strip())
		answers = _as_dict(row.answers_json)
		key = _school_key(row)
		school = schools.setdefault(
			key,
			{
				"key": key or "__none__",
				"school": _school_label(row, customers),
				"customer": row.get("customer") or "",
				"smes": set(),
				"responses": 0,
				"by_audience": {a: 0 for a in AUDIENCES},
				"rating_sum": 0.0,
				"rating_count": 0,
				"last_on": "",
			},
		)
		school["responses"] += 1
		if aud:
			school["by_audience"][aud] += 1
		if row.get("sme_name"):
			school["smes"].add(row.sme_name.strip())
		submitted = _when(row.submitted_on)
		if submitted > (school["last_on"] or ""):
			school["last_on"] = submitted

		answer_rows = []
		summary_bits = []
		for qid, raw in answers.items():
			meta = (catalog.get(aud) or {}).get(qid) or {}
			qtype = meta.get("type") or _infer_type(raw)
			text = meta.get("text") or ""
			stat = question_stats.setdefault(
				(aud, qid),
				{
					"audience": aud,
					"id": qid,
					"type": qtype,
					"text": text,
					"count": 0,
					"rating_sum": 0.0,
					"buckets": {str(n): 0 for n in range(1, scale + 1)},
					"options": {},
					"yes": 0,
					"no": 0,
				},
			)
			if text and not stat["text"]:
				stat["text"] = text
			stat["type"] = meta.get("type") or stat["type"]
			display = ""
			if qtype == "rating":
				try:
					num = int(raw)
				except (TypeError, ValueError):
					continue
				if num < 1 or num > scale:
					continue
				stat["count"] += 1
				rating_sum += num
				rating_count += 1
				school["rating_sum"] += num
				school["rating_count"] += 1
				if (num / scale) >= 0.8:
					positive += 1
				stat["rating_sum"] += num
				stat["buckets"][str(num)] = stat["buckets"].get(str(num), 0) + 1
				display = f"{num}/{scale}"
			elif qtype == "yesno":
				val = "Yes" if str(raw) == "Yes" else "No"
				stat["count"] += 1
				if val == "Yes":
					stat["yes"] += 1
				else:
					stat["no"] += 1
				display = val
			elif qtype == "choice":
				val = str(raw or "").strip()
				if not val:
					continue
				stat["count"] += 1
				stat["options"][val] = stat["options"].get(val, 0) + 1
				display = val
			else:
				val = str(raw or "").strip()
				if not val:
					continue
				stat["count"] += 1
				display = val
				comments.append(
					{
						"at": submitted,
						"audience": aud,
						"audience_label": LABELS.get(aud, aud or "Other"),
						"school": school["school"],
						"school_key": school["key"],
						"sme_name": row.get("sme_name") or "",
						"question": text or "Comment",
						"text": val[:2000],
					}
				)
			if display:
				answer_rows.append(
					{
						"question": text or _fallback_label(qtype),
						"type": qtype,
						"value": display[:500],
					}
				)
				if qtype != "text":
					summary_bits.append(display)

		submissions.append(
			{
				"name": row.name,
				"at": submitted,
				"audience": aud,
				"audience_label": LABELS.get(aud, aud or "Other"),
				"school": school["school"],
				"school_key": school["key"],
				"sme_name": row.get("sme_name") or "",
				"customer": row.get("customer") or "",
				"summary": " · ".join(summary_bits[:4]),
				"answers": answer_rows,
			}
		)

	school_rows = []
	for school in schools.values():
		avg = (school["rating_sum"] / school["rating_count"]) if school["rating_count"] else None
		impact = round(100.0 * avg / scale) if avg is not None and scale else None
		school_rows.append(
			{
				"key": school["key"],
				"school": school["school"],
				"customer": school["customer"],
				"sme_name": ", ".join(sorted(school["smes"])) or "—",
				"responses": school["responses"],
				"by_audience": school["by_audience"],
				"avg_rating": round(avg, 1) if avg is not None else None,
				"impact": impact,
				"last_on": school["last_on"],
			}
		)
	school_rows.sort(key=lambda item: (-item["responses"], item["school"].lower()))

	questions = _question_rows(question_stats, order, scale)
	avg_rating = round(rating_sum / rating_count, 1) if rating_count else None
	impact = round(100.0 * (rating_sum / rating_count) / scale) if rating_count and scale else None
	positive_pct = round(100.0 * positive / rating_count) if rating_count else None
	community = audience_counts["school"] + audience_counts["parent"] + audience_counts["student"]
	linked_schools = sum(1 for item in school_rows if item["key"] != "__none__")

	return {
		"scale": scale,
		"kpis": [
			{"key": "responses", "label": "Responses", "value": len(rows), "hint": "Feedback submitted"},
			{"key": "schools", "label": "Schools reached", "value": linked_schools, "hint": "Schools with a submission"},
			{"key": "smes", "label": "Field SMEs", "value": len(smes), "hint": "Officers who submitted"},
			{
				"key": "rating",
				"label": "Average rating",
				"value": f"{avg_rating} / {scale}" if avg_rating is not None else "—",
				"hint": f"Across {rating_count} rating answers",
			},
			{
				"key": "impact",
				"label": "Impact score",
				"value": f"{impact}%" if impact is not None else "—",
				"hint": "Average rating as a share of the scale",
			},
			{
				"key": "positive",
				"label": "Positive ratings",
				"value": f"{positive_pct}%" if positive_pct is not None else "—",
				"hint": "Ratings at 80% of the scale or higher",
			},
			{"key": "community", "label": "Community replies", "value": community, "hint": "School, parent, and student"},
			{"key": "visits", "label": "Visits shared", "value": _session_count(filters), "hint": "Feedback sessions opened"},
		],
		"audiences": [
			{"id": aud, "label": LABELS[aud], "count": audience_counts[aud]}
			for aud in AUDIENCES
		],
		"questions": questions,
		"schools": school_rows,
		"comments": comments[:40],
		"submissions": submissions[:500],
		"generated_on": _when(now_datetime()),
	}


def _fallback_label(qtype):
	return {"rating": "Rating", "choice": "Choice", "yesno": "Yes / No", "text": "Comment"}.get(qtype, "Answer")


def _question_rows(stats, order, scale):
	def sort_key(item):
		aud, qid = item
		aud_index = AUDIENCES.index(aud) if aud in AUDIENCES else 9
		try:
			qid_index = order.get(aud, []).index(qid)
		except ValueError:
			qid_index = 999
		return (aud_index, qid_index, qid)

	unknown = {aud: 0 for aud in AUDIENCES}
	rows = []
	for key in sorted(stats, key=sort_key):
		stat = stats[key]
		aud = stat["audience"]
		text = stat["text"]
		if not text:
			if stat["type"] == "rating":
				unknown[aud] = unknown.get(aud, 0) + 1
				text = "Rating" if unknown[aud] == 1 else f"Rating {unknown[aud]}"
			else:
				text = _fallback_label(stat["type"])
		row = {
			"audience": aud,
			"audience_label": LABELS.get(aud, "Other"),
			"text": text,
			"type": stat["type"],
			"count": stat["count"],
		}
		if stat["type"] == "rating" and stat["count"]:
			avg = stat["rating_sum"] / stat["count"]
			row["avg"] = round(avg, 1)
			row["impact"] = round(100.0 * avg / scale) if scale else None
			row["buckets"] = [{"score": n, "count": cint(stat["buckets"].get(str(n)) or 0)} for n in range(1, scale + 1)]
		elif stat["type"] == "choice":
			options = sorted(stat["options"].items(), key=lambda pair: (-pair[1], pair[0]))
			total = sum(count for _, count in options) or 1
			row["options"] = [
				{"label": label, "count": count, "pct": round(100.0 * count / total)} for label, count in options
			]
		elif stat["type"] == "yesno":
			total = (stat["yes"] + stat["no"]) or 1
			row["yes"] = stat["yes"]
			row["no"] = stat["no"]
			row["yes_pct"] = round(100.0 * stat["yes"] / total)
		else:
			continue
		rows.append(row)
	return rows
