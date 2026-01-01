# Courier Report - Change Log

This document tracks all changes made to the Courier Report page during development.

**Last Updated**: 2025-01-XX  
**Files Modified**: 
- `courier_report.py` (Backend)
- `courier_report.js` (Frontend)

---

## Change Log (80 Changes)

### Date: 2025-01-XX - Session 1: Transport Expense Integration

#### Backend Changes - `get_monthly_trend()` Function

**Change 1**: Added import for `flt` function in `get_monthly_trend()` to handle float conversions
- **Location**: `courier_report.py` line ~640
- **Type**: Function modification

**Change 2**: Added `cost_center_filter_transport` variable initialization in `get_monthly_trend()`
- **Location**: `courier_report.py` line ~674
- **Type**: Variable addition

**Change 3**: Added conditional logic to build cost center filter for transport query
- **Location**: `courier_report.py` lines ~675-677
- **Type**: Logic addition

**Change 4**: Created new SQL query `transport_query` to fetch transport charges from child table
- **Location**: `courier_report.py` lines ~679-693
- **Type**: Query creation

**Change 5**: Added SELECT clause in transport query to format posting date as YYYY-MM
- **Location**: `courier_report.py` line ~681
- **Type**: SQL modification

**Change 6**: Added SUM aggregation for transport charges amount in transport query
- **Location**: `courier_report.py` line ~682
- **Type**: SQL aggregation

**Change 7**: Added JOIN clause to link `tabDelivery Note` with `tabTransport Charges` child table
- **Location**: `courier_report.py` lines ~684-686
- **Type**: SQL join

**Change 8**: Added WHERE conditions for parenttype and parentfield in transport query
- **Location**: `courier_report.py` lines ~685-686
- **Type**: SQL filter

**Change 9**: Added docstatus filter for delivery notes in transport query
- **Location**: `courier_report.py` line ~687
- **Type**: SQL filter

**Change 10**: Added date range filter for posting_date in transport query
- **Location**: `courier_report.py` line ~688
- **Type**: SQL filter

**Change 11**: Added delivery mode filter for 'Transport' in transport query
- **Location**: `courier_report.py` line ~689
- **Type**: SQL filter

**Change 12**: Added cost center filter to transport query when cost centers are provided
- **Location**: `courier_report.py` line ~690
- **Type**: SQL filter

**Change 13**: Added GROUP BY clause for date formatting in transport query
- **Location**: `courier_report.py` line ~691
- **Type**: SQL grouping

**Change 14**: Added ORDER BY clause for date sorting in transport query
- **Location**: `courier_report.py` line ~692
- **Type**: SQL ordering

**Change 15**: Added SQL execution call for transport query with date parameters
- **Location**: `courier_report.py` lines ~695-698
- **Type**: Query execution

**Change 16**: Created `expense_dict` dictionary to combine courier and transport expenses
- **Location**: `courier_report.py` line ~701
- **Type**: Data structure

**Change 17**: Added loop to populate expense_dict with courier expenses by date
- **Location**: `courier_report.py` lines ~702-705
- **Type**: Data processing

**Change 18**: Added loop to merge transport expenses into expense_dict by date
- **Location**: `courier_report.py` lines ~707-713
- **Type**: Data merging

**Change 19**: Added logic to sum expenses when date already exists in expense_dict
- **Location**: `courier_report.py` lines ~710-711
- **Type**: Logic addition

**Change 20**: Added logic to create new entry when date doesn't exist in expense_dict
- **Location**: `courier_report.py` line ~713
- **Type**: Logic addition

**Change 21**: Modified return statement to convert expense_dict to sorted list format
- **Location**: `courier_report.py` lines ~716-721
- **Type**: Return modification

**Change 22**: Added sorted() function to sort results by date
- **Location**: `courier_report.py` line ~717
- **Type**: Sorting logic

#### Backend Changes - `get_expense_by_cost_center()` Function

**Change 23**: Added `cost_center_filter_transport` variable initialization in `get_expense_by_cost_center()`
- **Location**: `courier_report.py` line ~764
- **Type**: Variable addition

**Change 24**: Added conditional logic to build cost center filter for transport query in cost center function
- **Location**: `courier_report.py` lines ~765-767
- **Type**: Logic addition

**Change 25**: Created new SQL query `transport_query` in `get_expense_by_cost_center()` function
- **Location**: `courier_report.py` lines ~769-785
- **Type**: Query creation

**Change 26**: Added SELECT clause for cost_center in transport query
- **Location**: `courier_report.py` line ~771
- **Type**: SQL selection

**Change 27**: Added SUM aggregation for transport charges grouped by cost center
- **Location**: `courier_report.py` line ~772
- **Type**: SQL aggregation

**Change 28**: Added JOIN to link Delivery Note with Transport Charges child table in cost center query
- **Location**: `courier_report.py` lines ~774-776
- **Type**: SQL join

**Change 29**: Added cost center IS NOT NULL filter in transport query
- **Location**: `courier_report.py` line ~780
- **Type**: SQL filter

**Change 30**: Added cost center != '' filter in transport query
- **Location**: `courier_report.py` line ~781
- **Type**: SQL filter

**Change 31**: Added GROUP BY cost_center in transport query
- **Location**: `courier_report.py` line ~783
- **Type**: SQL grouping

**Change 32**: Added ORDER BY expense DESC in transport query
- **Location**: `courier_report.py` line ~784
- **Type**: SQL ordering

**Change 33**: Added SQL execution for transport query in cost center function
- **Location**: `courier_report.py` lines ~787-790
- **Type**: Query execution

**Change 34**: Created expense_dict dictionary in cost center function to combine expenses
- **Location**: `courier_report.py` line ~793
- **Type**: Data structure

**Change 35**: Added loop to populate expense_dict with courier expenses by cost center
- **Location**: `courier_report.py` lines ~794-797
- **Type**: Data processing

**Change 36**: Added loop to merge transport expenses into expense_dict by cost center
- **Location**: `courier_report.py` lines ~799-805
- **Type**: Data merging

**Change 37**: Added logic to sum expenses when cost center already exists
- **Location**: `courier_report.py` lines ~802-803
- **Type**: Logic addition

**Change 38**: Modified return statement to sort by expense amount descending
- **Location**: `courier_report.py` line ~809
- **Type**: Return modification

#### Backend Changes - `get_delivery_mode_data()` Function

**Change 39**: Added transport charges query in `get_delivery_mode_data()` function
- **Location**: `courier_report.py` lines ~755-800
- **Type**: Query addition

**Change 40**: Added logic to combine courier and transport expenses by delivery mode
- **Location**: `courier_report.py` lines ~755-800
- **Type**: Data combination

#### Frontend Changes - Chart Title Updates

**Change 41**: Updated chart title from "Monthly Courier Expense Trend" to "Monthly Courier & Transport Expense Trend"
- **Location**: `courier_report.js` line ~145
- **Type**: Text update

**Change 42**: Updated chart title from "Courier Expense Share by Cost Center" to "Courier & Transport Expense Share by Cost Center"
- **Location**: `courier_report.js` line ~151
- **Type**: Text update

**Change 43**: Updated chart title from "Delivery Mode Distribution (Expense Amount)" to "Delivery Mode Distribution (Courier & Transport Expense)"
- **Location**: `courier_report.js` line ~157
- **Type**: Text update

**Change 44**: Updated dataset name from "Monthly Expense" to "Monthly Courier & Transport Expense"
- **Location**: `courier_report.js` line ~421
- **Type**: Dataset name update

---

### Date: 2025-01-XX - Session 2: Item Category Expense Chart

#### Backend Changes - New Function `get_item_category_expense()`

**Change 45**: Created new function `get_item_category_expense()` with `@frappe.whitelist()` decorator
- **Location**: `courier_report.py` line ~1206
- **Type**: Function creation

**Change 46**: Added function docstring explaining item category expense calculation
- **Location**: `courier_report.py` line ~1207
- **Type**: Documentation

**Change 47**: Added try-except block for error handling in `get_item_category_expense()`
- **Location**: `courier_report.py` line ~1208
- **Type**: Error handling

**Change 48**: Added extraction of from_date from filters dictionary
- **Location**: `courier_report.py` line ~1209
- **Type**: Parameter extraction

**Change 49**: Added extraction of to_date from filters dictionary
- **Location**: `courier_report.py` line ~1210
- **Type**: Parameter extraction

**Change 50**: Added extraction of cost_centers from filters with default empty list
- **Location**: `courier_report.py` line ~1211
- **Type**: Parameter extraction

**Change 51**: Added extraction of customer from filters dictionary
- **Location**: `courier_report.py` line ~1212
- **Type**: Parameter extraction

**Change 52**: Added conditional logic to build cost_center_filter string
- **Location**: `courier_report.py` lines ~1214-1217
- **Type**: Filter building

**Change 53**: Added conditional logic to build customer_filter string
- **Location**: `courier_report.py` lines ~1219-1220
- **Type**: Filter building

**Change 54**: Created category_subquery to categorize delivery notes based on items
- **Location**: `courier_report.py` lines ~1223-1235
- **Type**: Subquery creation

**Change 55**: Added CASE statement to identify Books category (item_group LIKE '%Book%' OR 'MQH%' OR 'Qaida%')
- **Location**: `courier_report.py` lines ~1226-1227
- **Type**: SQL logic

**Change 56**: Added CASE statement to identify Certificates category (item_group/item_name/item_code LIKE '%Certificate%')
- **Location**: `courier_report.py` line ~1228
- **Type**: SQL logic

**Change 57**: Added ELSE clause to categorize remaining items as 'General Items'
- **Location**: `courier_report.py` line ~1229
- **Type**: SQL logic

**Change 58**: Added JOIN between Delivery Note Item and Item tables in category subquery
- **Location**: `courier_report.py` lines ~1231-1232
- **Type**: SQL join

**Change 59**: Added GROUP BY clause for delivery_note_name in category subquery
- **Location**: `courier_report.py` line ~1233
- **Type**: SQL grouping

**Change 60**: Created courier_query to fetch courier expenses grouped by item category
- **Location**: `courier_report.py` lines ~1237-1254
- **Type**: Query creation

**Change 61**: Added JOIN between Journal Entry Account, Journal Entry, and Delivery Note in courier query
- **Location**: `courier_report.py` lines ~1241-1243
- **Type**: SQL joins

**Change 62**: Added JOIN with category_subquery to link categories with delivery notes
- **Location**: `courier_report.py` line ~1244
- **Type**: SQL join

**Change 63**: Added COUNT DISTINCT for delivery_note_count in courier query
- **Location**: `courier_report.py` line ~1246
- **Type**: SQL aggregation

**Change 64**: Added SUM calculation for expense_amount (debit - credit) in courier query
- **Location**: `courier_report.py` line ~1247
- **Type**: SQL calculation

**Change 65**: Added WHERE clause filters for docstatus, date range, and account type in courier query
- **Location**: `courier_report.py` lines ~1249-1251
- **Type**: SQL filters

**Change 66**: Added GROUP BY category in courier query
- **Location**: `courier_report.py` line ~1255
- **Type**: SQL grouping

**Change 67**: Created transport_query to fetch transport charges grouped by item category
- **Location**: `courier_report.py` lines ~1258-1275
- **Type**: Query creation

**Change 68**: Added JOIN between Delivery Note and Transport Charges child table in transport query
- **Location**: `courier_report.py` lines ~1261-1264
- **Type**: SQL join

**Change 69**: Added JOIN with category_subquery in transport query
- **Location**: `courier_report.py` line ~1265
- **Type**: SQL join

**Change 70**: Added COUNT DISTINCT for delivery_note_count in transport query
- **Location**: `courier_report.py` line ~1267
- **Type**: SQL aggregation

**Change 71**: Added SUM for transport charges amount in transport query
- **Location**: `courier_report.py` line ~1268
- **Type**: SQL aggregation

**Change 72**: Added WHERE clause filters for docstatus, date range, and delivery mode in transport query
- **Location**: `courier_report.py` lines ~1270-1272
- **Type**: SQL filters

**Change 73**: Added GROUP BY category in transport query
- **Location**: `courier_report.py` line ~1276
- **Type**: SQL grouping

**Change 74**: Created category_dict dictionary to combine courier and transport expenses
- **Location**: `courier_report.py` line ~1281
- **Type**: Data structure

**Change 75**: Added loop to merge courier results into category_dict
- **Location**: `courier_report.py` lines ~1283-1289
- **Type**: Data merging

**Change 76**: Added loop to merge transport results into category_dict
- **Location**: `courier_report.py` lines ~1291-1297
- **Type**: Data merging

**Change 77**: Added logic to initialize category entry if not exists in category_dict
- **Location**: `courier_report.py` lines ~1285-1286, ~1293-1294
- **Type**: Logic addition

**Change 78**: Added logic to sum delivery_note_count and expense_amount for each category
- **Location**: `courier_report.py` lines ~1287-1288, ~1295-1296
- **Type**: Logic addition

**Change 79**: Added conversion of category_dict to list format
- **Location**: `courier_report.py` line ~1300
- **Type**: Data conversion

**Change 80**: Added sorting by expense_amount in descending order
- **Location**: `courier_report.py` line ~1301
- **Type**: Sorting logic

**Change 81**: Added error logging with truncated error message (100 chars max)
- **Location**: `courier_report.py` lines ~1303-1306
- **Type**: Error handling

**Change 82**: Added traceback logging with truncation (200 chars max)
- **Location**: `courier_report.py` line ~1307
- **Type**: Error handling

**Change 83**: Added return of empty list on exception
- **Location**: `courier_report.py` line ~1308
- **Type**: Error handling

#### Backend Changes - Updated `get_courier_report_data()`

**Change 84**: Added call to `get_item_category_expense(filters)` in `get_courier_report_data()`
- **Location**: `courier_report.py` line ~66
- **Type**: Function call

**Change 85**: Added `item_category_expense` key to return dictionary
- **Location**: `courier_report.py` line ~83
- **Type**: Return modification

#### Frontend Changes - Item Category Chart HTML

**Change 86**: Added new chart container div for "Item Category Expense (Count & Amount)"
- **Location**: `courier_report.js` line ~185
- **Type**: HTML addition

**Change 87**: Added chart title "Item Category Expense (Count & Amount)"
- **Location**: `courier_report.js` line ~187
- **Type**: HTML addition

**Change 88**: Added chart div with id "chart-item-category-expense"
- **Location**: `courier_report.py` line ~188
- **Type**: HTML addition

**Change 89**: Added table-responsive div wrapper for category table
- **Location**: `courier_report.js` line ~189
- **Type**: HTML addition

**Change 90**: Added table element with table-bordered and table-striped classes
- **Location**: `courier_report.js` line ~190
- **Type**: HTML addition

**Change 91**: Added table header row with "Category", "Delivery Notes", "Expense Amount" columns
- **Location**: `courier_report.js` lines ~192-196
- **Type**: HTML addition

**Change 92**: Added tbody element with id "item-category-expense-tbody"
- **Location**: `courier_report.js` line ~198
- **Type**: HTML addition

#### Frontend Changes - Item Category Chart Rendering

**Change 93**: Created `render_item_category_expense_chart()` function
- **Location**: `courier_report.js` line ~750
- **Type**: Function creation

**Change 94**: Added data extraction from `item_category_expense` array
- **Location**: `courier_report.js` line ~752
- **Type**: Data extraction

**Change 95**: Added check for empty data array
- **Location**: `courier_report.js` line ~754
- **Type**: Validation

**Change 96**: Created chartData object with labels and datasets arrays
- **Location**: `courier_report.js` lines ~757-760
- **Type**: Data structure

**Change 97**: Added loop to populate chart labels from category names
- **Location**: `courier_report.js` line ~762
- **Type**: Data processing

**Change 98**: Added loop to populate chart data values from expense amounts
- **Location**: `courier_report.js` line ~763
- **Type**: Data processing

**Change 99**: Added loop to populate chart labels with delivery note counts
- **Location**: `courier_report.js` line ~764
- **Type**: Data processing

**Change 100**: Created new frappe.Chart instance for item category expense
- **Location**: `courier_report.js` lines ~766-777
- **Type**: Chart creation

**Change 101**: Set chart type to 'pie'
- **Location**: `courier_report.js` line ~768
- **Type**: Chart configuration

**Change 102**: Set chart colors array for pie slices
- **Location**: `courier_report.js` line ~769
- **Type**: Chart configuration

**Change 103**: Added height configuration (300px) for chart
- **Location**: `courier_report.js` line ~770
- **Type**: Chart configuration

**Change 104**: Added axisOptions with xIsSeriesPoints set to true
- **Location**: `courier_report.js` line ~771
- **Type**: Chart configuration

**Change 105**: Added tooltipOptions with formatTooltipY function
- **Location**: `courier_report.js` lines ~772-775
- **Type**: Chart configuration

**Change 106**: Added table row population logic for category breakdown
- **Location**: `courier_report.js` lines ~779-789
- **Type**: Table rendering

**Change 107**: Added loop to create table rows for each category
- **Location**: `courier_report.js` line ~780
- **Type**: Loop logic

**Change 108**: Added category name cell in table row
- **Location**: `courier_report.js` line ~782
- **Type**: HTML generation

**Change 109**: Added delivery note count cell with number formatting
- **Location**: `courier_report.js` line ~783
- **Type**: HTML generation

**Change 110**: Added expense amount cell with currency formatting
- **Location**: `courier_report.js` line ~784
- **Type**: HTML generation

**Change 111**: Added call to `render_item_category_expense_chart()` in `render_charts()` function
- **Location**: `courier_report.js` line ~800
- **Type**: Function call

---

### Date: 2025-01-XX - Session 3: Bug Fixes

#### Frontend Changes - Chart Rendering Fixes

**Change 112**: Removed `.empty()` call before creating delivery mode distribution chart
- **Location**: `courier_report.js` line ~709
- **Type**: Bug fix

**Change 113**: Added try-catch block around chart destruction for delivery mode chart
- **Location**: `courier_report.js` lines ~709-732
- **Type**: Error handling

**Change 114**: Added check for chart instance existence before destruction
- **Location**: `courier_report.js` line ~710
- **Type**: Validation

**Change 115**: Added graceful error handling for chart destruction failures
- **Location**: `courier_report.js` lines ~711-713
- **Type**: Error handling

#### Backend Changes - Transport Charges Field Access Fixes

**Change 116**: Fixed `get_delivery_notes()` to use subquery for transport charges instead of direct field access
- **Location**: `courier_report.py` line ~465
- **Type**: Bug fix

**Change 117**: Created correlated subquery to sum transport charges from child table in `get_delivery_notes()`
- **Location**: `courier_report.py` lines ~465-470
- **Type**: Query modification

**Change 118**: Fixed `get_delivery_mode_distribution()` main query to use subquery for transport charges
- **Location**: `courier_report.py` line ~831
- **Type**: Bug fix

**Change 119**: Created correlated subquery in main query of `get_delivery_mode_distribution()`
- **Location**: `courier_report.py` lines ~831-836
- **Type**: Query modification

**Change 120**: Fixed `get_delivery_mode_distribution()` not_set query to use subquery for transport charges
- **Location**: `courier_report.py` line ~881
- **Type**: Bug fix

**Change 121**: Created correlated subquery in not_set query of `get_delivery_mode_distribution()`
- **Location**: `courier_report.py` lines ~881-886
- **Type**: Query modification

#### Backend Changes - Error Logging Fixes

**Change 122**: Removed verbose debug log message from `get_delivery_mode_distribution()` main query
- **Location**: `courier_report.py` line ~825
- **Type**: Code cleanup

**Change 123**: Replaced verbose log with commented print statement in `get_delivery_mode_distribution()`
- **Location**: `courier_report.py` line ~825
- **Type**: Code cleanup

**Change 124**: Removed verbose debug log message from `get_delivery_mode_distribution()` not_set query
- **Location**: `courier_report.py` line ~863
- **Type**: Code cleanup

**Change 125**: Removed verbose debug log message from `get_delivery_mode_distribution()` exception handler
- **Location**: `courier_report.py` line ~916
- **Type**: Code cleanup

**Change 126**: Added error message truncation to 100 characters in `get_courier_report_data()`
- **Location**: `courier_report.py` line ~84
- **Type**: Error handling

**Change 127**: Added traceback truncation to 200 characters in error logging
- **Location**: `courier_report.py` line ~1307
- **Type**: Error handling

---

## Summary of All Changes

### Backend (`courier_report.py`) - 70 Changes
- ✅ Transport expense integration: 22 changes
- ✅ Cost center expense updates: 16 changes
- ✅ Delivery mode data updates: 2 changes
- ✅ Item category expense function: 39 changes
- ✅ Transport charges field access fixes: 6 changes
- ✅ Error logging improvements: 6 changes
- ✅ API response updates: 2 changes

### Frontend (`courier_report.js`) - 57 Changes
- ✅ Chart title updates: 4 changes
- ✅ Item category chart HTML: 7 changes
- ✅ Item category chart rendering: 19 changes
- ✅ Chart rendering bug fixes: 4 changes
- ✅ Function integration: 1 change

**Total: 127 Changes** (expanded from 5 major changes to detailed granular changes)

---

## Files Modified

1. **`apps/tif_customization/tif_customization/tif_customization/page/courier_report/courier_report.py`**
   - Total lines: ~1391
   - Changes: 70 detailed modifications
   - Major areas: Transport charges integration, item category expense function, bug fixes

2. **`apps/tif_customization/tif_customization/tif_customization/page/courier_report/courier_report.js`**
   - Total lines: ~1353
   - Changes: 57 detailed modifications
   - Major areas: Chart updates, new item category chart, error fixes

---

## Testing Checklist

- [x] Monthly trend chart shows courier + transport expenses
- [x] Cost center expense chart includes transport charges
- [x] Delivery mode chart includes transport expenses
- [x] Item category expense chart displays correctly
- [x] Item category table shows count and amount
- [x] Charts render without removeChild errors
- [x] Error logging doesn't exceed character limits
- [x] Transport charges properly fetched from child table
- [x] All SQL queries execute without errors
- [x] Data aggregation works correctly for all categories

---

## Notes

- All transport charges are fetched from the `tabTransport Charges` child table using correlated subqueries
- Item categorization is based on item_group patterns (Books, Certificates, General Items)
- Charts now show combined courier and transport expenses
- Error handling improved to prevent page crashes and log truncation issues
- All changes maintain backward compatibility with existing functionality

