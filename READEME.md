# Smart Hospital Triage & Patient Management System

## 1. Problem Statement

Hospitals may experience overcrowding, long waiting times, and difficulty identifying patients who need urgent medical attention.

This project aims to develop a web-based system that helps hospital management and doctors organize patient queues using patient assessment and diagnosis information.

The system first identifies the specialties available at each hospital. Based on those specialties, patients are assigned to the appropriate department, and relevant diagnosis and assessment information is collected. An AI model then suggests a patient priority for qualified clinical staff to review.

The system also manages patient queues and alerts staff when waiting times or reassessments become overdue.

## 2. Target Users

The system is designed for hospital staff, not directly for patients.

### 2.1 Hospital Management
- Register and configure the hospital.
- Select the specialties available at the hospital.
- Monitor patient queues and waiting times.
- View alerts and department workload.

### 2.2 Doctors
- View patients assigned to their departments.
- Review patient diagnosis and assessment information.
- Review AI-generated priority suggestions.
- Confirm or override the suggested priority according to clinical judgment.

### 2.3 System Administrator
- Manage hospital accounts.
- Manage user accounts and access permissions.
- Maintain system settings.

## 3. Main Feature Requirements

### 3.1 Hospital Login and Setup

- Allow authorized hospital staff to log in.
- Allow hospital management to configure the hospital profile.
- Store the specialties available at that hospital.
- Allow authorized management staff to update the available specialties.
- Ensure each hospital can access only its own authorized patient records.

### 3.2 Hospital Specialty Configuration

During hospital setup, management selects all specialties provided by the hospital.

Examples include:

| Specialty | Main area of care |
|---|---|
| Cardiology | Heart and blood vessels |
| Neurology | Brain and nervous system |
| Orthopedics | Bones, joints, and muscles |
| Gynecology | Women's reproductive health |
| Pediatrics | Children and infants |
| Dermatology | Skin, hair, and nails |
| Ophthalmology | Eyes and vision |
| ENT | Ear, nose, and throat |
| Psychiatry | Mental health |
| Oncology | Cancer care |
| Nephrology | Kidney diseases |
| Urology | Urinary system and male reproductive health |
| Pulmonology | Lungs and respiratory diseases |
| Gastroenterology | Digestive system |
| Endocrinology | Hormones and related disorders |
| Hematology | Blood disorders |
| Rheumatology | Arthritis and autoimmune conditions |
| General Medicine | Common illnesses and general health |
| Surgery | Surgical treatment |
| Anesthesiology | Anesthesia and related perioperative care |

The list above provides examples. Each hospital should only enable specialties that it actually provides.

### 3.3 Patient Registration

- Allow authorized staff to register a patient visit.
- Record basic patient and visit information.
- Generate a unique visit or token number.
- Display only the specialties configured for that hospital.
- Allow staff to select the appropriate specialty for the patient.
- Record the patient's arrival time for waiting-time tracking.

Emergency care must not be delayed by registration or specialty selection.

### 3.4 Patient Diagnosis and Assessment Information

After selecting the appropriate specialty, the system presents the relevant assessment fields.

The information may include:

- Patient's reported symptoms.
- Duration of symptoms.
- Relevant medical history.
- Vital signs recorded by qualified staff.
- Initial clinical assessment.
- Other specialty-relevant information required by the approved clinical workflow.

The fields should depend on the patient's assessment needs and selected specialty. Qualified clinical staff are responsible for collecting and reviewing the information.

The system must not assume that selecting a specialty alone is enough to determine a patient's urgency.

### 3.5 AI-Based Priority Suggestion

- Use the permitted patient assessment information as model input.
- Generate an AI-based priority suggestion.
- Display the suggestion to authorized clinical staff.
- Allow qualified staff to review, confirm, or override the suggestion.
- Record the final staff-assigned priority and relevant changes.

The AI is a decision-support feature, not an independent medical decision-maker. Its suggestions must be clearly labelled as unvalidated until the model has been appropriately tested and clinically approved.

### 3.6 Patient Queue Management

- Maintain a separate queue for each relevant department.
- Display patient visit number, department, arrival time, waiting time, and reviewed priority.
- Update the queue when staff change the patient's priority or status.
- Help staff identify patients who need reassessment.
- Allow authorized doctors and management to view the information relevant to their roles.

### 3.7 Alerts and Notifications

The system should alert authorized staff when:

- A patient's waiting time exceeds a configured limit.
- A required reassessment becomes overdue.
- A case requires staff attention under the hospital's approved workflow.

Alerts must support clinical staff and emergency procedures. They must not replace clinical judgment.

### 3.8 Hospital Management Dashboard

Display:

- Total registered patient visits.
- Patient counts by specialty.
- Current queues and waiting times.
- Patients awaiting assessment or consultation.
- Overdue waiting-time and reassessment alerts.
- General department workload.

### 3.9 Doctor Dashboard

Display:

- Patients assigned to the doctor's department.
- Relevant diagnosis and assessment information.
- AI priority suggestions and their review status.
- Staff-assigned patient priority.
- Waiting times and cases requiring attention.

### 3.10 System Administrator Dashboard

Provide tools to:

- Create and manage hospital accounts.
- Manage authorized users and roles.
- Configure system-wide settings.
- Monitor basic system status.

## 4. Complete Patient Workflow

1. **Hospital login:** Authorized hospital staff log in.
2. **Hospital setup:** Management configures the hospital profile.
3. **Specialty configuration:** Management selects the specialties the hospital provides.
4. **Patient arrival:** Staff register the patient's visit and record the arrival time.
5. **Specialty selection:** Staff select the appropriate specialty from the hospital's available options.
6. **Clinical assessment:** Qualified staff collect relevant diagnosis and assessment information.
7. **AI processing:** The model uses permitted information to generate a priority suggestion.
8. **Clinical review:** Qualified staff review the suggestion and determine the appropriate clinical priority.
9. **Queue management:** The patient is managed in the relevant department queue.
10. **Alerts:** The system notifies authorized staff about overdue waiting times or reassessments.
11. **Doctor consultation:** The patient receives care according to clinical judgment and hospital procedures.

**Emergency rule:** Patients with possible emergencies must receive prompt attention according to the hospital's emergency protocol. They must not wait for the complete AI workflow.

## 5. Relationship Between Hospital, Specialty, and Patient

The system follows this structure:

**Hospital → Available Specialties → Patient Visit → Selected Specialty → Diagnosis and Assessment Information → AI Priority Suggestion → Clinical Review → Patient Queue**

For example, if Hospital A provides Cardiology, Neurology, and Orthopedics, the patient-registration screen should offer those specialties.

If a patient is assigned to Cardiology, the system displays the assessment fields configured for that workflow. The AI may then suggest a priority based on suitable assessment information.

A different patient assigned to Orthopedics may follow a different assessment workflow.

## 6. Technology and Machine Learning Plan

The project will be developed step by step.

### Frontend
- HTML for page structure.
- CSS for styling and layout.
- JavaScript for interactions and validation.
- React for a component-based interface in a later stage.

### Backend
- A backend framework to manage login, hospital setup, patient visits, assessments, queues, and alerts.
- A database to store hospitals, specialties, users, visits, assessments, and priority reviews.
- Secure access controls to protect patient information.

### Machine Learning
- Begin with understanding the required input features and output labels.
- Evaluate whether an appropriate, representative, and properly labelled dataset is available.
- Test a model using suitable evaluation methods before considering clinical use.
- Treat predictions as experimental suggestions until appropriately validated.

The project may later explore waiting-time prediction and department-workload analysis if suitable data is available.

## 7. Safety, Privacy, and Testing

- Use simulated data during initial development.
- Protect patient information with appropriate authentication and role-based permissions.
- Do not use AI suggestions as final medical decisions.
- Test the model for errors and performance across relevant patient groups.
- Follow applicable privacy requirements and hospital clinical procedures.
- Ensure emergency care is not delayed by the system.

## 8. Expected Outcomes

The project aims to:

- Make hospital specialties clear and configurable.
- Collect assessment information relevant to each selected specialty.
- Help doctors review patient information and AI suggestions.
- Improve visibility of patient queues and waiting times.
- Alert staff when reassessments or waiting-time limits are overdue.
- Help hospital management understand department workload.

## 9. Initial Development Scope

The first working version will include:

1. Hospital login.
2. Hospital profile and specialty configuration.
3. Patient registration.
4. Specialty selection based on the hospital's configuration.
5. Specialty-relevant assessment forms.
6. AI priority suggestion interface.
7. Clinical review and priority confirmation.
8. Patient queue management.
9. Waiting-time and reassessment alerts.
10. Doctor and hospital management dashboards.

Advanced machine learning and additional features can be introduced after the core system works correctly.

## 10. Final Project Goal

To build a web-based Smart Hospital Triage & Patient Management System that connects each hospital with its available specialties, collects relevant patient assessment information, provides AI-based priority suggestions for clinical review, manages patient queues, and alerts staff when patients require attention.
