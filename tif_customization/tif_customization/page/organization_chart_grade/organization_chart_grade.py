import re
from collections import defaultdict

import frappe
from frappe import _


def _employee_filters(employment_type=None, department=None):
	filters = {"status": "Active"}
	if employment_type and employment_type not in ("", "All Employment Types"):
		filters["employment_type"] = employment_type
	if department and department not in ("", "All Departments"):
		filters["department"] = department
	return filters


def _format_employee_node(row, chart_role=None):
	grade_label = (row.get("grades") or row.get("grade") or "").strip()
	node = {
		"id": row.name,
		"name": row.employee_name,
		"title": row.designation,
		"image": row.image,
		"department": row.department,
		"employment_type": row.employment_type,
		"grades": grade_label,
		"grade": row.grade,
		"reports_to": row.reports_to,
	}
	if chart_role:
		node["chart_role"] = chart_role
	return node


def _designation_matches(designation, patterns):
	designation = (designation or "").lower()
	return any(re.search(pattern, designation) for pattern in patterns)


def _direct_reports_count(employee_id):
	return frappe.db.count("Employee", {"reports_to": employee_id, "status": "Active"})


def _grade_sort_key(grade):
	grade = (grade or "").strip().lower()
	if not grade:
		return (999, "")
	parts = re.split(r"([0-9]+)", grade)
	return tuple(int(p) if p.isdigit() else p for p in parts if p)


def _find_executive(rows, patterns, preferred_reports_to=None):
	candidates = [row for row in rows if _designation_matches(row.designation, patterns)]
	if not candidates:
		return None
	if preferred_reports_to:
		for row in candidates:
			if row.reports_to == preferred_reports_to:
				return row
	return sorted(candidates, key=lambda row: (row.reports_to not in (None, ""), row.employee_name))[0]


def _find_executive_in_db(patterns, preferred_reports_to=None):
	filters = {"status": ["!=", "Left"]}
	rows = frappe.get_all(
		"Employee",
		fields=[
			"name",
			"employee_name",
			"image",
			"designation",
			"department",
			"employment_type",
			"grades",
			"grade",
			"reports_to",
		],
		filters=filters,
		order_by="status asc, employee_name asc",
	)
	return _find_executive(rows, patterns, preferred_reports_to=preferred_reports_to)


def _find_ceo(rows):
	ceo = _find_executive(rows, [r"chief\s+executive", r"\bceo\b"])
	if ceo:
		return ceo
	ceo = _find_executive_in_db([r"chief\s+executive", r"\bceo\b"])
	if ceo:
		return ceo
	for row in rows:
		if row.reports_to in (None, ""):
			return row
	return None


def _find_coo(rows, ceo):
	if not ceo:
		return None
	coo = _find_executive(rows, [r"chief\s+operating", r"\bcoo\b"], preferred_reports_to=ceo.name)
	if coo:
		return coo
	return _find_executive_in_db(
		[r"chief\s+operating", r"\bcoo\b"],
		preferred_reports_to=ceo.name,
	)


def _pick_department_heads(dept_employees, coo_id):
	"""Pick one department head shown under COO for a department."""
	if not dept_employees:
		return []

	heads = [emp for emp in dept_employees if emp.reports_to == coo_id]
	if heads:
		heads.sort(key=lambda emp: (_grade_sort_key(emp.grades or emp.grade), emp.employee_name))
		return [heads[0]]

	managers = [
		emp
		for emp in dept_employees
		if _designation_matches(
			emp.designation,
			[r"\bhead\b", r"\bmanager\b", r"\bdirector\b", r"\blead\b", r"\bincharge\b"],
		)
	]
	if managers:
		managers.sort(key=lambda emp: (_grade_sort_key(emp.grades or emp.grade), emp.employee_name))
		return [managers[0]]

	with_reports = []
	for emp in dept_employees:
		count = _direct_reports_count(emp.name)
		if count:
			with_reports.append((emp, count))
	if with_reports:
		max_reports = max(count for _, count in with_reports)
		heads = [emp for emp, count in with_reports if count == max_reports]
		heads.sort(key=lambda emp: (_grade_sort_key(emp.grades or emp.grade), emp.employee_name))
		return [heads[0]]

	dept_employees = sorted(
		dept_employees,
		key=lambda emp: (_grade_sort_key(emp.grades or emp.grade), emp.employee_name),
	)
	return [dept_employees[0]]


def _department_team(dept_employees, head_ids):
	head_ids = set(head_ids or [])
	return [emp for emp in dept_employees if emp.name not in head_ids]


@frappe.whitelist()
def get_grade_wise_org_chart(employment_type=None, department=None):
	"""CEO → COO → department heads → employees grouped by grade (client-side)."""
	rows = frappe.get_all(
		"Employee",
		fields=[
			"name",
			"employee_name",
			"image",
			"designation",
			"department",
			"employment_type",
			"grades",
			"grade",
			"reports_to",
		],
		filters=_employee_filters(employment_type, department),
		order_by="employee_name",
	)

	if not rows:
		return {"roots": [], "children_by_parent": {}, "total_employees": 0}

	ceo = _find_ceo(rows)
	if not ceo:
		return {"roots": [], "children_by_parent": {}, "total_employees": len(rows)}

	coo = _find_coo(rows, ceo)
	if coo and coo.name not in {row.name for row in rows}:
		rows.append(coo)
	nodes = [_format_employee_node(ceo, "ceo")]
	children_by_parent = {ceo.name: []}

	if coo:
		coo_node = _format_employee_node(coo, "coo")
		nodes.append(coo_node)
		children_by_parent[ceo.name] = [coo_node]
		children_by_parent[coo.name] = []
		parent_for_departments = coo.name
	else:
		parent_for_departments = ceo.name
		children_by_parent.setdefault(ceo.name, [])

	skip_ids = {ceo.name}
	if coo:
		skip_ids.add(coo.name)

	by_department = defaultdict(list)
	for row in rows:
		if row.name in skip_ids:
			continue
		by_department[row.department or _("No Department")].append(row)

	dept_heads = []
	for dept_name in sorted(by_department.keys()):
		dept_employees = by_department[dept_name]
		heads = _pick_department_heads(dept_employees, coo.name if coo else None)
		if not heads:
			continue

		head = heads[0]
		head_node = _format_employee_node(head, "dept_head")
		head_node["department_label"] = dept_name
		nodes.append(head_node)
		children_by_parent[head.name] = [
			_format_employee_node(emp, "employee")
			for emp in _department_team(dept_employees, [head.name])
		]
		dept_heads.append(head_node)

	children_by_parent[parent_for_departments] = dept_heads

	for node in nodes:
		direct_reports = children_by_parent.get(node["id"], [])
		node["connections"] = len(direct_reports)
		node["expandable"] = bool(direct_reports)

	return {
		"roots": [nodes[0]],
		"children_by_parent": children_by_parent,
		"total_employees": len(rows),
		"ceo_id": ceo.name,
		"coo_id": coo.name if coo else None,
	}


@frappe.whitelist()
def get_employee_details(employee_id):
	"""Employee popup details for grade-wise org chart."""
	employee = frappe.get_doc("Employee", employee_id)
	return {
		"name": employee.employee_name,
		"id": employee.name,
		"designation": employee.designation,
		"department": employee.department,
		"company": employee.company,
		"employment_type": employee.employment_type,
		"employee_number": employee.employee_number,
		"cell_number": employee.cell_number,
		"company_email": employee.company_email,
		"image": employee.image,
		"reports_to": employee.reports_to,
		"status": employee.status,
		"date_of_joining": employee.date_of_joining,
		"branch": employee.branch,
		"grade": employee.grade,
		"grades": employee.grades,
	}
