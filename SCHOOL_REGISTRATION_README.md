# School Registration System

## Overview
The School Registration System is a comprehensive solution for managing school registrations within The ILM Foundation (TIF). It includes both a backend doctype and a public web form for easy registration.

## Features

### 1. School Doctype
- **Auto-naming**: Schools are automatically named with format `SR-{####}`
- **Comprehensive Fields**: All required school information fields
- **Validation**: Built-in validation for contact details and school information
- **Child Table**: Books & Curriculum Information with MQH details
- **Email Integration**: Welcome email functionality

### 2. Web Form
- **Public Access**: Available at `/school-registration`
- **Responsive Design**: Mobile-friendly interface
- **Progress Tracking**: Visual progress indicator
- **Success Page**: Custom success page with next steps
- **Enhanced Styling**: Modern, professional appearance

## Field Structure

### Basic Information
- **School As**: PERSON/SCHOOL VISIT/FUNDRAISING
- **School Name**: Required field
- **Territory**: Link to Territory doctype
- **School Type**: GOVT/PVT
- **Type of School**: School Group
- **Category**: INDIVIDUAL/CHAIN OF SCHOOL
- **No of School**: Required for chain schools
- **No of Students**: Integer field
- **Status**: ACTIVE/INACTIVE
- **Section**: PRIMARY/SECONDARY

### Academic Information
- **Books**: Current books running in school
- **Allowed Program**: Programs allowed
- **Trainings**: TPS/CEE Training allowed
- **Training Type Allowed**: Story telling, etc.
- **Posting Date**: Registration date
- **Type of Institution**: MATRIC/INTERBOARD/CAMBRIDGE
- **School Level**: Custom field
- **Board Affiliation**: Board details
- **Board Codes**: Matric, Inter, Cambridge board codes
- **Registration Code**: Trust/Private registration code

### Contact Details
- **Director/Principal Contact**: Phone number
- **Director/Principal Email**: Email address
- **Director/Principal Name**: Full name
- **Vice President**: VP details
- **Coordinator**: Coordinator information
- **Incharge**: Incharge details
- **School Landline**: School phone
- **School Email**: School email address
- **School Website**: Website URL
- **Complete School Address**: Full address
- **City**: Link to City doctype
- **Country**: Link to Country doctype

### Academic & Staff Details
- **Total No of Quranic Teachers**: Integer field
- **Academic Session Month**: Session details

### Books & Curriculum Information (Child Table)
- **MQH Version**: URDU/ENGLISH/SINDHI
- **MQH**: MQH details
- **Class**: Class information
- **No of Student**: Number of students

## Installation & Setup

### 1. Install the App
```bash
bench --site your-site.com install-app tif_customization
```

### 2. Migrate the Database
```bash
bench --site your-site.com migrate
```

### 3. Access the Web Form
- Public URL: `https://your-site.com/school-registration`
- Success Page: `https://your-site.com/school-registration-success`

### 4. Admin Access
- Navigate to Desk > Tif Customization > School
- Create, edit, and manage school registrations

## Customization

### Adding New Fields
1. Edit the School doctype JSON file
2. Add field definitions
3. Update the web form JSON file
4. Run migrations

### Modifying Validation
1. Edit `school.py` file
2. Add custom validation methods
3. Update client-side validation in `school.js`

### Styling Changes
1. Modify `school_registration.css`
2. Update web form template
3. Clear cache and refresh

## API Endpoints

### Send Welcome Email
```python
@frappe.whitelist()
def send_welcome_email(school):
    # Sends welcome email to school
```

### Web Form Submission
- Automatically creates School document
- Sends confirmation email
- Redirects to success page

## Permissions

### System Manager
- Full CRUD access
- Can send welcome emails
- Can manage all school records

### All Users
- Read access to school records
- Can submit web forms
- Cannot edit existing records

## File Structure

```
tif_customization/
├── tif_customization/
│   ├── doctype/
│   │   ├── school/
│   │   │   ├── school.json
│   │   │   ├── school.py
│   │   │   └── school.js
│   │   └── school_books_curriculum/
│   │       ├── school_books_curriculum.json
│   │       ├── school_books_curriculum.py
│   │       └── school_books_curriculum.js
│   ├── web_form/
│   │   └── school_registration/
│   │       ├── school_registration.json
│   │       ├── school_registration.py
│   │       └── school_registration.js
│   ├── www/
│   │   ├── school-registration-success.py
│   │   └── school-registration-success.html
│   ├── templates/
│   │   ├── web_form_school_registration.html
│   │   └── school_registration_success.html
│   └── public/
│       └── css/
│           └── school_registration.css
```

## Usage Examples

### Creating a School via API
```python
import frappe

school = frappe.get_doc({
    "doctype": "School",
    "school_as": "SCHOOL VISIT",
    "school_name": "Example School",
    "school_type": "PVT",
    "category": "INDIVIDUAL",
    "status": "ACTIVE",
    "director_principal_name": "John Doe",
    "director_principal_email": "john@example.com"
})
school.insert()
```

### Querying Schools
```python
# Get all active schools
active_schools = frappe.get_all("School", filters={"status": "ACTIVE"})

# Get schools by type
govt_schools = frappe.get_all("School", filters={"school_type": "GOVT"})

# Get schools with contact information
schools_with_email = frappe.get_all("School", filters={"director_principal_email": ["!=", ""]})
```

## Troubleshooting

### Common Issues

1. **Web Form Not Loading**
   - Check if the web form is published
   - Verify route configuration
   - Clear browser cache

2. **Email Not Sending**
   - Check email settings in Frappe
   - Verify SMTP configuration
   - Check error logs

3. **Validation Errors**
   - Review field requirements
   - Check data types
   - Verify dependencies

### Debug Mode
Enable debug mode to see detailed error messages:
```python
frappe.local.conf.debug = 1
```

## Support

For technical support or customization requests, please contact the development team.

## Version History

- **v1.0.0**: Initial release with basic school registration
- **v1.1.0**: Added web form and success page
- **v1.2.0**: Enhanced styling and validation
- **v1.3.0**: Added email integration and child table 