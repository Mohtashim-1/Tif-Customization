import frappe


@frappe.whitelist()
def make_delivery_note(source_name, target_doc=None, kwargs=None):
	from erpnext.selling.doctype.sales_order.sales_order import (
		make_delivery_note as erpnext_make_delivery_note,
	)

	doc = erpnext_make_delivery_note(source_name, target_doc, kwargs)
	_apply_sales_order_cost_centers(doc, source_name)
	return doc


def _apply_sales_order_cost_centers(dn, sales_order_name):
	so = frappe.get_doc("Sales Order", sales_order_name)

	if so.cost_center and not dn.cost_center:
		dn.cost_center = so.cost_center

	so_items = {item.name: item for item in so.items}
	for dn_item in dn.items:
		so_item = so_items.get(dn_item.so_detail)
		cost_center = (so_item and so_item.cost_center) or so.cost_center
		if cost_center:
			dn_item.cost_center = cost_center
