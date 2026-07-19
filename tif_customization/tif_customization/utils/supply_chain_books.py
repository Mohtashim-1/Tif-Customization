"""Shared book item scope for Supply Chain reports.

Used by Stock Report & Dashboard, Courier Expense Report, Dispatch Report,
and Dispatch Detail Report so book stock / dispatch quantities match.

Certificate and General Items (and Marketing General Items) are excluded.
"""

# Canonical book item codes (Stock Detail allow-list)
SPECIFIC_ITEM_CODES = [
	"MQHWB-01/U/12",
	"MQHWB-02/U/10",
	"MQHWB-03/U/9",
	"MQHWB-04/U/7",
	"MQHWB-05/U/5",
	"MQHWB-06/U/2",
	"MQHWB-07/U/7",
	"MQHTG-01U6",
	"MQHTG-02U6",
	"MQHTG-03U5",
	"MQHTG-04U4",
	"MQHTG-05U1",
	"MQHWB-01S1",
	"MQHWB-02S1",
	"MQHWB-03S1",
	"MQHWB-01E1",
	"MQHWB-02E1",
	"MB-U1",
	"NQ1",
	"NQW",
	"NQTG",
	"TQM6PE",
	"TQM7PE",
	"MQKPUT6",
	"MQKPUT7",
	"MQKPUT8",
	"MQKPUT9",
	"MQKPUT10",
	"MQKPUT11",
	"MQKPUT12",
	"TIFPV24",
	"Panj Para 26-30",
	"Panj Para 1-5",
	"Para",
]

# TPS Department items (Noorani Qaida, workbooks, Panj Para, NQTG)
# Note: 'Para' (TPS Para) is intentionally excluded from TPS department totals
TPS_ITEM_CODES = ["NQ1", "NQW", "NQTG", "Panj Para 26-30", "Panj Para 1-5"]

# Explicit exclusions (not in SPECIFIC_ITEM_CODES; kept for clarity / future filters)
EXCLUDED_ITEM_GROUPS = (
	"Certificate",
	"General Items",
	"Marketing General Items",
)

BOOK_ITEM_CODES_PARAM = "book_item_codes"


def get_supply_chain_book_item_codes():
	"""Return the shared book item code list."""
	return list(SPECIFIC_ITEM_CODES)


def book_item_codes_tuple():
	"""Tuple suitable for SQL IN %(book_item_codes)s."""
	return tuple(SPECIFIC_ITEM_CODES)


def is_supply_chain_book_item(item_code):
	return bool(item_code) and item_code in SPECIFIC_ITEM_CODES


def sql_book_item_filter(item_code_field="dni.item_code", param=BOOK_ITEM_CODES_PARAM):
	"""SQL fragment: AND field IN %(param)s. Caller must pass book_item_codes_tuple() in params."""
	return f"AND {item_code_field} IN %({param})s"


def with_book_item_params(params=None, param=BOOK_ITEM_CODES_PARAM):
	"""Merge book item codes into a SQL params dict."""
	out = dict(params or {})
	out[param] = book_item_codes_tuple()
	return out
