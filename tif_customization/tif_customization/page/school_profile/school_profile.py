import frappe
from frappe import _
from frappe.utils import cint, cstr, flt, getdate

from tif_customization.tif_customization.api.school_dataset import STAFF_SQL, clean_label, fetch_schools
from tif_customization.tif_customization.page.school_visit_dashboard.school_visit_dashboard import _check_access

# Book signals reported on Field Visits: (field, label, department)
BOOK_FIELDS = (
	("qps_mqh_books", "MQH Books", "QPS"),
	("qps_mqh_teachers_guides", "MQH Teachers Guides", "QPS"),
	("mt_mqh_sample_provided", "MQH Sample Provided", "QPS"),
	("tps_noorani_qaida", "Noorani Qaida", "TPS"),
	("tps_noorani_qaida_guide", "Noorani Qaida Teacher's Guide", "TPS"),
	("tps_noorani_qaida_workbook_khi", "Noorani Qaida Workbook", "TPS"),
)

SESSION_VISIT_TYPES = ("Training", "Workshop", "Workshop Arranged", "Workshop Conducted", "Teachers Training Meeting")


def _yes(value):
	return cstr(value).strip().lower() in ("1", "yes", "true", "y")


def _clean(value):
	return clean_label(value)


@frappe.whitelist()
def get_school_profile(school, from_date=None, to_date=None):
	from tif_customization.tif_customization.api.field_visit_drilldown import (
		_normalize_school_sql,
		_owner_display_names,
		_school_key_sql,
		_visit_remarks,
	)
	from tif_customization.tif_customization.doctype.school.school import (
		_books_line_from_row,
		_program_line_from_row,
		_resolve_school_doc,
		_resolve_school_opening,
		overall_status_from_programs,
		_normalize_program_status,
	)
	from tif_customization.tif_customization.field_visit_permissions import (
		apply_team_scope_to_conditions,
		visit_day_sql,
	)

	_check_access()
	key = cstr(school).strip().lower()
	if not key:
		frappe.throw(_("School is required."))

	summary_rows = fetch_schools(from_date=from_date, to_date=to_date, schools=[key])
	in_period = bool(summary_rows)
	if not summary_rows:
		summary_rows = fetch_schools(schools=[key])
	summary = summary_rows[0] if summary_rows else None

	visit_day = visit_day_sql("fv")
	conds = ["fv.docstatus = 1", f"{_school_key_sql('fv')} = %(key)s"]
	values = {"key": key}
	apply_team_scope_to_conditions(conds, values, alias="fv")
	visits = frappe.db.sql(
		f"""
		select fv.*, {visit_day} as visit_day, {STAFF_SQL} as staff
		from `tabField Visit` fv
		where {" and ".join(conds)}
		order by {visit_day} desc, fv.creation desc
		""",
		values,
		as_dict=True,
	)
	if not visits and not summary:
		frappe.throw(_("No Field Visit records found for this school."), frappe.DoesNotExistError)

	label = (summary or {}).get("school_label") or _clean(
		visits[0].get("school_name") or visits[0].get("pending_school_name") or visits[0].get("me_school_name") or key
	)
	owner_names = _owner_display_names([v.owner for v in visits if v.owner])

	def staff_name(v):
		raw = cstr(v.staff).strip()
		return owner_names.get(raw) or raw

	# ERP customers this school is linked to (for Delivery Notes / Trainings)
	customers = {cstr(v.get(f)).strip() for v in visits for f in ("school_name", "me_school_name") if cstr(v.get(f)).strip()}
	customers = set(frappe.get_all("Customer", filters={"name": ("in", list(customers) or [""])}, pluck="name"))
	customers.update(
		frappe.db.sql_list(
			f"select name from `tabCustomer` where {_normalize_school_sql('customer_name')} = %(key)s",
			{"key": key},
		)
	)
	customers = sorted(customers)

	school_doc = _resolve_school_doc(label)
	soa = _resolve_school_opening(label)

	# ---- Overall status ----
	program_master = []
	master_status = None
	if school_doc:
		for code, fieldname in (("QPS", "qps"), ("TPS", "tps"), ("CEE", "cee")):
			norm = _normalize_program_status(school_doc.get(fieldname))
			program_master.append({"code": code, "label": norm["label"], "tone": norm["tone"]})
		master_status = overall_status_from_programs(school_doc.qps, school_doc.tps, school_doc.cee)

	affiliation = []
	for code, field in (("QPS", "qps_affiliated"), ("TPS", "tps_affiliated"), ("CEE", "cee_affiliated")):
		latest = next((v for v in visits if cstr(v.get(field)).strip()), None)
		affiliation.append(
			{
				"code": code,
				"value": _clean(latest.get(field)) if latest else "",
				"date": str(latest.visit_day) if latest else "",
			}
		)

	# ---- Books running (from visits) ----
	books = []
	for field, book_label, dept in BOOK_FIELDS:
		hits = [v for v in visits if _yes(v.get(field))]
		if hits:
			books.append(
				{
					"label": book_label,
					"dept": dept,
					"detail": "",
					"times": len(hits),
					"last": str(hits[0].visit_day),
					"first": str(hits[-1].visit_day),
					"by": staff_name(hits[0]),
					"visit": hits[0].name,
				}
			)
	me_hits = [v for v in visits if _clean(v.get("me_mqh_book_status"))]
	if me_hits:
		v = me_hits[0]
		bits = [_clean(v.get(f)) for f in ("me_mqh_book_status", "me_mqh_book_version", "me_mqh_book_part")]
		books.insert(
			0,
			{
				"label": _("MQH Books (M&E)"),
				"dept": "QPS",
				"detail": " · ".join(b for b in bits if b),
				"times": len(me_hits),
				"last": str(v.visit_day),
				"first": str(me_hits[-1].visit_day),
				"by": staff_name(v),
				"visit": v.name,
			},
		)
	nazra = [v for v in visits if _clean(v.get("me_nazra_book_taught"))]
	if nazra:
		v = nazra[0]
		books.append(
			{
				"label": _("Nazra Book Taught (M&E)"),
				"dept": "TPS",
				"detail": _clean(v.get("me_nazra_book_taught")),
				"times": len(nazra),
				"last": str(v.visit_day),
				"first": str(nazra[-1].visit_day),
				"by": staff_name(v),
				"visit": v.name,
			}
		)

	# ---- Delivery Notes ----
	deliveries = []
	delivered_items = {}
	if customers:
		dns = frappe.db.sql(
			"""
			select name, customer, customer_name, posting_date, status, workflow_state, total_qty, grand_total,
				custom_delivery_mode, custom_courier, custom_shipment_tracking_no, custom_received_name,
				custom_received_date, custom_total_cartons, is_return
			from `tabDelivery Note`
			where docstatus = 1 and customer in %(customers)s
			order by posting_date desc, creation desc
			""",
			{"customers": tuple(customers)},
			as_dict=True,
		)
		items_by_dn = {}
		if dns:
			for it in frappe.db.sql(
				"""
				select parent, item_code, item_name, qty, uom, amount
				from `tabDelivery Note Item`
				where parent in %(names)s
				order by idx
				""",
				{"names": tuple(d.name for d in dns)},
				as_dict=True,
			):
				items_by_dn.setdefault(it.parent, []).append(
					{"item_code": it.item_code, "item_name": it.item_name, "qty": flt(it.qty), "uom": it.uom}
				)
				agg = delivered_items.setdefault(it.item_code, {"item_name": it.item_name, "qty": 0, "uom": it.uom, "notes": 0})
				agg["qty"] += flt(it.qty)
		for d in dns:
			for it in items_by_dn.get(d.name, []):
				delivered_items[it["item_code"]]["notes"] += 1
			deliveries.append(
				{
					"name": d.name,
					"posting_date": str(d.posting_date),
					"status": d.workflow_state or d.status,
					"is_return": cint(d.is_return),
					"total_qty": flt(d.total_qty),
					"grand_total": flt(d.grand_total),
					"mode": d.custom_delivery_mode or "",
					"courier": d.custom_courier or "",
					"tracking": d.custom_shipment_tracking_no or "",
					"received_by": d.custom_received_name or "",
					"received_date": str(d.custom_received_date) if d.custom_received_date else "",
					"cartons": flt(d.custom_total_cartons),
					"items": items_by_dn.get(d.name, []),
				}
			)

	# ---- Sessions / Trainings / Workshops ----
	sessions = []
	for v in visits:
		is_session = v.type in SESSION_VISIT_TYPES or _clean(v.get("training_session_category"))
		if is_session:
			sessions.append(
				{
					"source": "Field Visit",
					"name": v.name,
					"date": str(v.get("training_date") or v.visit_day),
					"type": _clean(v.get("training_session_category")) or v.type,
					"topic": _clean(v.get("training_workshop_topic")),
					"mode": _clean(v.get("training_mode")),
					"trainer": _clean(v.get("training_trainer_name") or v.get("training_conducted_by_other") or v.get("training_conducted_by")),
					"participants": cint(v.get("training_no_of_participants")),
					"status": "Conducted",
				}
			)
		if _yes(v.get("me_teachers_training_session")):
			sessions.append(
				{
					"source": "M&E Visit",
					"name": v.name,
					"date": str(v.visit_day),
					"type": _("Teachers Training Session"),
					"topic": "",
					"mode": "",
					"trainer": staff_name(v),
					"participants": 0,
					"status": "Reported",
				}
			)
	trainings = frappe.db.sql(
		f"""
		select name, type, training_date, schedule_status, training_type, workshop_topic, mode_of_training,
			participants_category, department_training, trainer_name, attendance_count
		from `tabUpcoming Training`
		where docstatus < 2 and (
			(%(has_customers)s and tag_school in %(customers)s)
			or {_normalize_school_sql('school_name')} = %(key)s
		)
		order by training_date desc
		""",
		{"key": key, "has_customers": 1 if customers else 0, "customers": tuple(customers) or ("",)},
		as_dict=True,
	)
	for t in trainings:
		sessions.append(
			{
				"source": "Upcoming Training",
				"name": t.name,
				"date": str(t.training_date) if t.training_date else "",
				"type": " · ".join(b for b in (t.type, t.training_type, t.department_training) if b),
				"topic": _clean(t.workshop_topic),
				"mode": _clean(t.mode_of_training),
				"trainer": _clean(t.trainer_name),
				"participants": cint(t.attendance_count),
				"status": t.schedule_status or "",
			}
		)
	sessions.sort(key=lambda s: s["date"] or "", reverse=True)

	# ---- Contacts ----
	contacts = []
	seen = set()

	def add_contact(name, phone, designation, source, date=""):
		name = _clean(name)
		if not name:
			return
		k = (name.lower(), cstr(phone).strip())
		if k in seen:
			return
		seen.add(k)
		contacts.append({"name": name, "phone": cstr(phone).strip(), "designation": _clean(designation), "source": source, "date": date})

	visit_names = [v.name for v in visits]
	child_contacts = {}
	if visit_names:
		for c in frappe.db.sql(
			"""select parent, person_name, contact_number, designation, designation_other
			from `tabField Visit School Contact` where parent in %(p)s order by idx""",
			{"p": tuple(visit_names)},
			as_dict=True,
		):
			child_contacts.setdefault(c.parent, []).append(c)
	for v in visits:
		add_contact(v.meeting_with, v.contact_number, v.designation_other or v.designation, "Field Visit", str(v.visit_day))
		for c in child_contacts.get(v.name, []):
			add_contact(c.person_name, c.contact_number, c.designation_other or c.designation, "Field Visit", str(v.visit_day))
	if school_doc:
		add_contact(school_doc.director_principal_name, school_doc.director_principal_contact, "Director / Principal", "School")
		add_contact(school_doc.contact_person, school_doc.contact_number, "Contact Person", "School")

	# ---- Visit timeline ----
	visit_rows = []
	for v in visits:
		visit_rows.append(
			{
				"name": v.name,
				"date": str(v.visit_day),
				"type": v.type or "",
				"staff": staff_name(v),
				"meeting_with": _clean(v.meeting_with),
				"designation": _clean(v.designation_other or v.designation),
				"books": _books_line_from_row(v),
				"programs": _program_line_from_row(v),
				"remarks": _visit_remarks(v),
			}
		)
	type_counts = {}
	for v in visits:
		type_counts[v.type or "Other"] = type_counts.get(v.type or "Other", 0) + 1

	first = visits[-1] if visits else {}
	latest = visits[0] if visits else {}
	return {
		"school": key,
		"label": label,
		"summary": summary,
		"in_period": in_period,
		"overall": {
			"bucket": (summary or {}).get("bucket") or "",
			"model": (summary or {}).get("model") or "",
			"master_status": master_status or "",
			"school_status": cstr(school_doc.status) if school_doc else "",
			"program_master": program_master,
			"affiliation": affiliation,
			"running": (summary or {}).get("running") or [],
		},
		"info": {
			"city": (summary or {}).get("city") or _clean(latest.get("city")),
			"province": (summary or {}).get("province") or _clean(latest.get("province")),
			"address": (summary or {}).get("address") or "",
			"first_visit": str(first.get("visit_day") or ""),
			"last_visit": str(latest.get("visit_day") or ""),
			"last_by": staff_name(latest) if latest else "",
			"school_doc": school_doc.name if school_doc else "",
			"soa": soa.name if soa else "",
		},
		"stats": {
			"visits": len(visits),
			"type_counts": type_counts,
			"deliveries": len([d for d in deliveries if not d["is_return"]]),
			"delivered_qty": sum(d["total_qty"] for d in deliveries if not d["is_return"]),
			"sessions": len(sessions),
			"books": len(books),
		},
		"books": books,
		"deliveries": deliveries,
		"delivered_items": sorted(delivered_items.values(), key=lambda i: -i["qty"]),
		"sessions": sessions,
		"contacts": contacts,
		"visits": visit_rows,
	}
