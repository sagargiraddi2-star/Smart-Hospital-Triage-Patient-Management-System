# Smart Hospital Triage & Patient Management System
# Screen Plan

## 1. Welcome Page

**Purpose:** Introduce the application and allow hospital staff to get started.

### Elements
- Project name: Smart Hospital Triage & Patient Management System
- Hospital-themed logo
- Short description of the project
- Key features:
  - Hospital specialty management
  - Patient registration and assessment
  - AI-assisted priority suggestions
  - Patient queue management
  - Waiting-time alerts
- Login button
- Clean, professional, hospital-themed design

### Navigation
Login button → Login Page

---

## 2. Login Page

**Purpose:** Allow authorized hospital users to securely access the system.

### Elements
- Email or username
- Password
- Login button
- Error message for invalid login details

### User Roles
- Doctor
- Hospital Management
- System Administrator

### Navigation
Successful login → Dashboard based on the user's role

---

## 3. Hospital Setup Page

**Purpose:** Configure a hospital and identify the specialties it provides.

### Elements
- Hospital name
- Hospital address
- Contact information
- Available specialties
- Save configuration button
- Edit specialties option

### Specialty Examples
- Cardiology
- Neurology
- Orthopedics
- Gynecology
- Pediatrics
- Dermatology
- Ophthalmology
- ENT
- Psychiatry
- Oncology
- Nephrology
- Urology
- Pulmonology
- Gastroenterology
- Endocrinology
- Hematology
- Rheumatology
- General Medicine
- Surgery
- Anesthesiology

### Rules
- Hospital management configures the specialties available at the hospital.
- Only configured specialties should appear during patient registration.
- Authorized users can update the configuration when services change.

### Navigation
Save configuration → Hospital Dashboard

---

## 4. Patient Registration Page

**Purpose:** Register a new patient visit and select the appropriate hospital specialty.

### Elements
- Patient name
- Patient ID or visit ID
- Age or date of birth
- Contact information, when needed
- Visit date and arrival time
- Main complaint or reason for visit
- Available specialty dropdown
- Register patient button

### Rules
- Specialty options must come from the hospital's configured specialties.
- Generate a unique visit or token number.
- Record the arrival time to calculate waiting time.
- Do not allow registration to delay emergency care.

### Navigation
Successful registration → Patient Assessment Page

---

## 5. Patient Assessment Page

**Purpose:** Collect relevant assessment information for the selected specialty and display an AI priority suggestion for clinical review.

### Elements
- Patient and visit details
- Selected specialty
- Reported symptoms
- Duration of symptoms
- Relevant medical history
- Vital signs entered by qualified staff
- Other assessment fields required by the clinical workflow
- Generate AI suggestion button, when appropriate
- AI-suggested priority
- Clinical staff review status
- Confirm or override priority options

### Rules
- Assessment fields depend on the selected specialty and approved clinical workflow.
- Qualified clinical staff enter or review clinical information.
- The AI suggestion must be labelled as unvalidated until appropriately tested and clinically approved.
- Clinical staff retain responsibility for the final priority decision.
- Emergency cases must follow the hospital's emergency procedures.

### Navigation
Save assessment → Patient Queue Page

---

## 6. Patient Queue Page

**Purpose:** Help authorized staff monitor patient visits and waiting times.

### Elements
- Patient visit or token number
- Patient name or authorized identifier
- Department or specialty
- Arrival time
- Waiting time
- Staff-assigned priority
- Assessment and consultation status
- Reassessment due time, when applicable
- Overdue alerts
- Search and filter options

### Rules
- Organize visits by the relevant department.
- Clearly distinguish AI suggestions from staff-assigned priorities.
- Highlight overdue waiting times and reassessments.
- Allow only authorized staff to view patient information.
- Queue order must follow the hospital's approved clinical workflow