# Copyright (c) 2025, mohtashim and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class School(Document):
	def validate(self):
		self.validate_contact_details()
		self.validate_school_details()
	
	def validate_contact_details(self):
		"""Validate contact details"""
		if self.director_principal_email and not frappe.utils.validate_email_address(self.director_principal_email):
			frappe.throw("Please enter a valid email address for Director/Principal")
		
		if self.school_email and not frappe.utils.validate_email_address(self.school_email):
			frappe.throw("Please enter a valid email address for School")
	
	def validate_school_details(self):
		"""Validate school details"""
		if self.category == "CHAIN OF SCHOOL" and not self.no_of_school:
			frappe.throw("Please specify the number of schools for chain of schools")
		
		if self.no_of_students and self.no_of_students < 0:
			frappe.throw("Number of students cannot be negative")
		
		if self.total_no_of_quranic_teachers and self.total_no_of_quranic_teachers < 0:
			frappe.throw("Number of Quranic teachers cannot be negative")
	
	def on_submit(self):
		"""Actions to perform when document is submitted"""
		frappe.msgprint("School registration submitted successfully!")
	
	def on_cancel(self):
		"""Actions to perform when document is cancelled"""
		frappe.msgprint("School registration has been cancelled.")

@frappe.whitelist()
def send_welcome_email(school):
	"""Send welcome email to the school"""
	try:
		school_doc = frappe.get_doc("School", school)
		
		# Create email template or send direct email
		if school_doc.director_principal_email:
			subject = f"Welcome to TIF - School Registration Confirmation"
			message = f"""
			Dear {school_doc.director_principal_name or 'School Administrator'},
			
			Thank you for registering your school with The ILM Foundation (TIF).
			
			School Details:
			- School Name: {school_doc.school_name}
			- Registration ID: {school_doc.name}
			- Status: {school_doc.status}
			
			We will review your registration and contact you soon with further details.
			
			Best regards,
			TIF Team
			"""
			
			frappe.sendmail(
				recipients=[school_doc.director_principal_email],
				subject=subject,
				message=message,
				now=True
			)
			
			return True
		else:
			frappe.throw("No email address found for the school")
			
	except Exception as e:
		frappe.log_error(f"Error sending welcome email: {str(e)}")
		frappe.throw("Error sending welcome email")
