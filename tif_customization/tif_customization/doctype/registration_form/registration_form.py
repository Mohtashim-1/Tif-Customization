# Copyright (c) 2025, mohtashim and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class RegistrationForm(Document):
    def after_insert(self):
        self.send_registration_email()
    
    def on_submit(self):
        self.send_congratulations_email()

    def send_registration_email(self):
        subject = f"Thank you for registering for {self.course}"
        message = f"""
        Dear {self.name1}, <br><br>
        Thank you for registering for the <strong>{self.course}</strong> course.<br><br>
        Here are the details you submitted:<br><br>
        - <strong>Father's/Husband's Name</strong>: {self.fathershusband_name or ""}<br>
        - <strong>Date of Birth</strong>: {self.date_of_birth or ""}<br>
        - <strong>Qualification</strong>: {self.qualification or ""}<br>
        - <strong>Email</strong>: {self.email or ""}<br>
        - <strong>WhatsApp Number</strong>: {self.whatsapp_number or ""}<br>
        - <strong>Address:</strong> {self.address or ""}<br>
        - <strong>City</strong>: {self.city or ""}<br>
        - <strong>School/Organization Name:</strong> {self.school_organization_name or ""}<br>
        - <strong>Position/Title:</strong> {self.positiontitle or ""}<br>
        - <strong>Posting Date and Time:</strong> {self.posting_date_and_time or ""}<br><br>
        We will contact you shortly with the next steps.<br><br>
        Best regards,<br>
        <strong>The Ilm Foundation</strong>
        """
        frappe.sendmail(recipients=[self.email], subject=subject, message=message)

    def send_congratulations_email(self):
        subject = f"Congratulations! Registered for {self.course}"
        message = f"""
        Dear {self.name1}, <br><br>
        🎉 <strong>Congratulations!</strong> You have successfully registered for the <strong>{self.course}</strong> course.<br><br>
        We are excited to have you on board and look forward to your active participation.<br><br>
        Here are your registration details:<br><br>
        - <strong>Father's/Husband's Name</strong>: {self.fathershusband_name or ""}<br>
        - <strong>Date of Birth</strong>: {self.date_of_birth or ""}<br>
        - <strong>Qualification</strong>: {self.qualification or ""}<br>
        - <strong>Email</strong>: {self.email or ""}<br>
        - <strong>WhatsApp Number</strong>: {self.whatsapp_number or ""}<br>
        - <strong>Address</strong>: {self.address or ""}<br>
        - <strong>City</strong>: {self.city or ""}<br>
        - <strong>School/Organization Name</strong>: {self.school_organization_name or ""}<br>
        - <strong>Position/Title</strong>: {self.positiontitle or ""}<br>
        - <strong>Posting Date and Time</strong>: {self.posting_date_and_time or ""}<br><br>
        Our team will be reaching out to you soon with further instructions and course materials.<br><br>
        If you have any questions in the meantime, feel free to reply to this email.<br><br>
        Warm regards,<br>
        <strong>The Ilm Foundation Team</strong>
        """
        frappe.sendmail(recipients=[self.email], subject=subject, message=message)

