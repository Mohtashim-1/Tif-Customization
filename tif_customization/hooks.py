app_name = "tif_customization"
app_title = "Tif Customization"
app_publisher = "mohtashim"
app_description = "app for tif customization"
app_email = "shoaibmohtashim973@gmail.com"
app_license = "mit"

# Fixtures
# ------------------
fixtures = [
	{"dt": "Custom HTML Block", "filters": [["name", "in", ["Trustee Easy Menu"]]]},
]

# Apps
# ------------------

# required_apps = []

# Each item in the list will be shown as an app in the apps page
# add_to_apps_screen = [
# 	{
# 		"name": "tif_customization",
# 		"logo": "/assets/tif_customization/logo.png",
# 		"title": "Tif Customization",
# 		"route": "/tif_customization",
# 		"has_permission": "tif_customization.api.permission.has_app_permission"
# 	}
# ]

# Includes in <head>
# ------------------

# include js, css files in header of desk.html
# app_include_css = "/assets/tif_customization/css/tif_customization.css"
# app_include_js = "/assets/tif_customization/js/tif_customization.js"

# include js, css files in header of web template
# web_include_css = "/assets/tif_customization/css/tif_customization.css"
# web_include_js = "/assets/tif_customization/js/tif_customization.js"

# include custom scss in every website theme (without file extension ".scss")
# website_theme_scss = "tif_customization/public/scss/website"

# include js, css files in header of web form
# webform_include_js = {"doctype": "public/js/doctype.js"}
# webform_include_css = {"doctype": "public/css/doctype.css"}

# include js in page
# page_js = {"page" : "public/js/file.js"}

# include js in doctype views
doctype_js = {
	"Delivery Note": "public/js/delivery_note.js",
	"Leave Application": "public/js/leave_application.js",
	"Loan Application": "tif_customization/doctype/loan_application/loan_application.js",
}

# include js in page
page_js = {
	"stock-detail" : "tif_customization/page/stock_detail/stock_detail.js",
	"courier-report" : "tif_customization/page/courier_report/courier_report.js",
	"dispatch-report" : "tif_customization/page/dispatch_report/dispatch_report.js",
	"procurement-expense" : "tif_customization/page/procurement_expense/procurement_expense.js"
}
# doctype_list_js = {"doctype" : "public/js/doctype_list.js"}
# doctype_tree_js = {"doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# Svg Icons
# ------------------
# include app icons in desk
# app_include_icons = "tif_customization/public/icons.svg"

# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "login"

# website user home page (by Role)
# role_home_page = {
# 	"Role": "home_page"
# }

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# Jinja
# ----------

# add methods and filters to jinja environment
jinja = {
	"methods": [
		"tif_customization.tif_customization.doctype.leave_application.leave_application.get_leave_allocation_for_print"
	]
}

# Installation
# ------------

# before_install = "tif_customization.install.before_install"
# after_install = "tif_customization.install.after_install"

# Uninstallation
# ------------

# before_uninstall = "tif_customization.uninstall.before_uninstall"
# after_uninstall = "tif_customization.uninstall.after_uninstall"

# Integration Setup
# ------------------
# To set up dependencies/integrations with other apps
# Name of the app being installed is passed as an argument

# before_app_install = "tif_customization.utils.before_app_install"
# after_app_install = "tif_customization.utils.after_app_install"

# Integration Cleanup
# -------------------
# To clean up dependencies/integrations with other apps
# Name of the app being uninstalled is passed as an argument

# before_app_uninstall = "tif_customization.utils.before_app_uninstall"
# after_app_uninstall = "tif_customization.utils.after_app_uninstall"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "tif_customization.notifications.get_notification_config"

# Permissions
# -----------
# Permissions evaluated in scripted ways

# permission_query_conditions = {
# 	"Event": "frappe.desk.doctype.event.event.get_permission_query_conditions",
# }
#
# has_permission = {
# 	"Event": "frappe.desk.doctype.event.event.has_permission",
# }

# DocType Class
# ---------------
# Override standard doctype classes

# override_doctype_class = {
# 	"ToDo": "custom_app.overrides.CustomToDo"
# }

# Document Events
# ---------------   
# Hook on document methods and events

doc_events = {
	"Delivery Note": {
        "on_submit": "tif_customization.tif_customization.doctype.delivery_note.delivery_note.on_submit",
        "validate": "tif_customization.tif_customization.doctype.delivery_note.delivery_note.sum_of_cartons"
	},
    "Material Request": {
        "validate": "tif_customization.tif_customization.doctype.material_request.material_request.get_employee"
    },
    "Leave Application": {
        "validate": "tif_customization.tif_customization.doctype.leave_application.leave_application.leave_apply_on_probabe_base"
    },
    "Employee Attendance": {
        "validate": "tif_customization.tif_customization.doctype.employee_attendance.employee_attendance.validate_sat_attendance"
    },
    "Purchase Receipt": {
        "on_submit": "tif_customization.tif_customization.doctype.purchase_receipt.purchase_receipt.on_submit"
    },
    "Loan Application": {
        "validate": "tif_customization.tif_customization.doctype.loan_application.loan_application.populate_previous_loan_and_leave_details"
    }
}

# Scheduled Tasks
# ---------------

# scheduler_events = {
# 	"all": [
# 		"tif_customization.tasks.all"
# 	],
# 	"daily": [
# 		"tif_customization.tasks.daily"
# 	],
# 	"hourly": [
# 		"tif_customization.tasks.hourly"
# 	],
# 	"weekly": [
# 		"tif_customization.tasks.weekly"
# 	],
# 	"monthly": [
# 		"tif_customization.tasks.monthly"
# 	],
# }

# Testing
# -------

# before_tests = "tif_customization.install.before_tests"

# Overriding Methods
# ------------------------------
override_whitelisted_methods = {
	"hrms.hr.doctype.leave_application.leave_application.get_leave_details": "tif_customization.tif_customization.doctype.leave_application.leave_application.get_leave_details"
}
#
# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
# 	"Task": "tif_customization.task.get_dashboard_data"
# }

# exempt linked doctypes from being automatically cancelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]

# Ignore links to specified DocTypes when deleting documents
# -----------------------------------------------------------

# ignore_links_on_delete = ["Communication", "ToDo"]

# Request Events
# ----------------
# before_request = ["tif_customization.utils.before_request"]
# after_request = ["tif_customization.utils.after_request"]

# Job Events
# ----------
# before_job = ["tif_customization.utils.before_job"]
# after_job = ["tif_customization.utils.after_job"]

# User Data Protection
# --------------------

# user_data_fields = [
# 	{
# 		"doctype": "{doctype_1}",
# 		"filter_by": "{filter_by}",
# 		"redact_fields": ["{field_1}", "{field_2}"],
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_2}",
# 		"filter_by": "{filter_by}",
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_3}",
# 		"strict": False,
# 	},
# 	{
# 		"doctype": "{doctype_4}"
# 	}
# ]

# Authentication and authorization
# --------------------------------

# auth_hooks = [
# 	"tif_customization.auth.validate"
# ]

# Automatically update python controller files with type annotations for this app.
# export_python_type_annotations = True

# default_log_clearing_doctypes = {
# 	"Logging DocType Name": 30  # days to retain logs
# }
