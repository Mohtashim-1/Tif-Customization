"""Stock Ledger / Stock Balance: optional Include or Ignore of Stock Reconciliation in In/Out."""

from frappe import _
from frappe.utils import flt

INCLUDE = "Include in In/Out"
IGNORE = "Ignore in In/Out"


def recon_in_out_ignored(filters, default_ignore=False):
	val = (filters or {}).get("stock_reconciliation_in_out")
	if val in (None, ""):
		return default_ignore
	return str(val).startswith("Ignore")


def _opening_recon_names(voucher_nos):
	import frappe

	names = [v for v in voucher_nos if v]
	if not names:
		return set()
	return set(
		frappe.get_all(
			"Stock Reconciliation",
			filters={"name": ["in", names], "purpose": "Opening Stock"},
			pluck="name",
		)
	)


def apply_ledger_recon_in_out(data, filters):
	"""When Include: fill In/Out on recon rows from balance change (not actual_qty=0)."""
	if recon_in_out_ignored(filters, default_ignore=True):
		return data

	opening_label = _("'Opening'")
	recon_vouchers = [
		row.get("voucher_no")
		for row in data or []
		if row.get("voucher_type") == "Stock Reconciliation"
	]
	opening_recons = _opening_recon_names(recon_vouchers)
	prev = 0.0

	for row in data or []:
		if row.get("item_code") == opening_label:
			prev = flt(row.get("qty_after_transaction"))
			continue

		qty_after = flt(row.get("qty_after_transaction"))
		if (
			row.get("voucher_type") == "Stock Reconciliation"
			and not flt(row.get("actual_qty"))
			and row.get("voucher_no") not in opening_recons
		):
			qty_diff = qty_after - prev
			row["in_qty"] = max(qty_diff, 0)
			row["out_qty"] = min(qty_diff, 0)
		prev = qty_after

	return data


def _patch_stock_ledger():
	from erpnext.stock.report.stock_ledger import stock_ledger as sl

	if getattr(sl.execute, "_tif_recon_patched", False):
		return

	original = sl.execute

	def execute(filters=None):
		columns, data = original(filters)
		return columns, apply_ledger_recon_in_out(data, filters)

	execute._tif_recon_patched = True
	sl.execute = execute


def _patch_stock_balance():
	from erpnext.stock.report.stock_balance.stock_balance import StockBalanceReport

	if getattr(StockBalanceReport.prepare_item_warehouse_map, "_tif_recon_patched", False):
		return

	original = StockBalanceReport.prepare_item_warehouse_map

	def prepare_item_warehouse_map(self, item_warehouse_map, entry, group_by_key):
		if not recon_in_out_ignored(self.filters, default_ignore=False):
			return original(self, item_warehouse_map, entry, group_by_key)

		qty_dict = item_warehouse_map[group_by_key]
		for field in self.inventory_dimensions:
			qty_dict[field] = entry.get(field)

		is_recon = entry.voucher_type == "Stock Reconciliation" and (
			not entry.batch_no and not entry.serial_no and not entry.serial_and_batch_bundle
		)
		if is_recon:
			qty_diff = flt(entry.qty_after_transaction) - flt(qty_dict.bal_qty)
		else:
			qty_diff = flt(entry.actual_qty)

		value_diff = flt(entry.stock_value_difference)
		is_opening = entry.posting_date < self.from_date or entry.voucher_no in self.opening_vouchers.get(
			entry.voucher_type, []
		)

		if is_opening:
			qty_dict.opening_qty += qty_diff
			qty_dict.opening_val += value_diff
		elif entry.posting_date >= self.from_date and entry.posting_date <= self.to_date:
			if not is_recon:
				if flt(qty_diff, self.float_precision) >= 0:
					qty_dict.in_qty += qty_diff
				else:
					qty_dict.out_qty += abs(qty_diff)

				if flt(value_diff, self.float_precision) >= 0:
					qty_dict.in_val += value_diff
				else:
					qty_dict.out_val += abs(value_diff)

		qty_dict.val_rate = entry.valuation_rate
		qty_dict.bal_qty += qty_diff
		qty_dict.bal_val += value_diff

	prepare_item_warehouse_map._tif_recon_patched = True
	StockBalanceReport.prepare_item_warehouse_map = prepare_item_warehouse_map


def apply():
	_patch_stock_ledger()
	_patch_stock_balance()
