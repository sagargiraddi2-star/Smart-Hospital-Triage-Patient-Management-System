
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Patients.css';
import BackToDashboard from './BackToDashboard.jsx';

function formatDateOnly(value) {
  if (!value) return '—';

  const datePart =
    typeof value === 'string'
      ? value.slice(0, 10)
      : value instanceof Date
        ? value.toISOString().slice(0, 10)
        : '';

  const match = datePart.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) return '—';

  const [, year, month, day] = match;

  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day)
  ).toLocaleDateString();
}

function formatDateTime(value) {
  if (!value) return '—';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return '—';

  return date.toLocaleDateString();
}

function Patients() {
  const navigate = useNavigate();

  const [patients, setPatients] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [success, setSuccess] = useState('');

  const [formData, setFormData] = useState({
    fullName: '',
    dateOfBirth: '',
    gender: '',
    phone: '',
    departmentId: '',
    visitType: 'normal',
  });

  // Active departments for the registration form, loaded from the database
  // each time the form is opened so changes are picked up.
  const [departments, setDepartments] = useState([]);
  const [departmentsStatus, setDepartmentsStatus] = useState('idle');
  const [departmentsError, setDepartmentsError] = useState('');

  async function loadDepartments() {
    try {
      setDepartmentsStatus('loading');
      setDepartmentsError('');

      const response = await fetch(
        '/api/departments?status=active',
        { credentials: 'include' }
      );

      if (response.status === 401) {
        navigate('/login', { replace: true });
        return;
      }

      const contentType = response.headers.get('content-type') || '';
      const data = contentType.includes('application/json')
        ? await response.json()
        : {};

      if (!response.ok) {
        throw new Error(data.message || 'Could not load departments.');
      }

      const activeDepartments = data.departments || [];

      setDepartments(activeDepartments);
      setDepartmentsStatus('ready');

      // Clear a selection that is no longer an active department.
      setFormData((previous) =>
        activeDepartments.some(
          (department) => String(department.id) === previous.departmentId
        )
          ? previous
          : { ...previous, departmentId: '' }
      );
    } catch (error) {
      setDepartmentsError(error.message || 'Could not load departments.');
      setDepartmentsStatus('error');
    }
  }

  useEffect(() => {
    loadPatients();
  }, []);

  async function loadPatients() {
    try {
      setIsLoading(true);
      setError('');

      const response = await fetch(
        '/api/patients',
        { credentials: 'include' }
      );

      if (response.status === 401) {
        navigate('/login', { replace: true });
        return;
      }

      if (!response.ok) {
        throw new Error('Could not load patient records.');
      }

      const data = await response.json();
      setPatients(data.patients || []);
    } catch (error) {
      console.error('Could not load patients:', error);
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  function handleInputChange(event) {
    const { name, value } = event.target;

    setFormData((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    try {
      setIsSaving(true);
      setError('');
      setSuccess('');

      const response = await fetch(
        '/api/patients',
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(formData),
        }
      );

      const data = await response.json();

      if (response.status === 401) {
        navigate('/login', { replace: true });
        return;
      }

      if (!response.ok) {
        throw new Error(data.message || 'Could not register patient.');
      }

      setSuccess(
        `Patient ${data.patient.patient_number} registered successfully.`
      );

      setFormData({
        fullName: '',
        dateOfBirth: '',
        gender: '',
        phone: '',
        departmentId: '',
        visitType: 'normal',
      });

      setShowForm(false);
      await loadPatients();
    } catch (error) {
      console.error('Patient registration failed:', error);
      setError(error.message);
    } finally {
      setIsSaving(false);
    }
  }

  function openPatientDetails(patientId) {
    navigate(`/patients/${patientId}`);
  }

  const filteredPatients = patients.filter((patient) => {
    const searchText = search.toLowerCase();

    return (
      (patient.full_name || '').toLowerCase().includes(searchText) ||
      (patient.patient_number || '').toLowerCase().includes(searchText) ||
      (patient.phone || '').includes(searchText) ||
      (patient.department || '').toLowerCase().includes(searchText) ||
      (patient.visit_type || '').toLowerCase().includes(searchText)
    );
  });

  return (
    <div className="patients-page">
      <header className="patients-page-header">
        <div className="patients-header-content">
          <div className="triora-back-row">
            <BackToDashboard />
          </div>

          <span className="patients-eyebrow">HOSPITAL WORKSPACE</span>

          <h1>Patient management</h1>

          <p>
            Register patients and manage their hospital records.
          </p>
        </div>

        <button
          className="patients-primary-button"
          onClick={() => {
            if (!showForm) {
              loadDepartments();
            }

            setShowForm((previous) => !previous);
            setError('');
            setSuccess('');
          }}
        >
          {showForm ? 'Close form' : '+ Register patient'}
        </button>
      </header>

      {success && (
        <div className="patients-success-message">
          {success}
        </div>
      )}

      {error && (
        <div className="patients-error-message">
          {error}
        </div>
      )}

      {showForm && (
        <section className="patients-form-card">
          <div className="patients-section-heading">
            <div>
              <h2>Register a new patient</h2>
              <p>Enter the patient's details and visit information.</p>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="patients-form-grid">
              <div className="patients-field patients-field-full">
                <label htmlFor="fullName">Full name *</label>
                <input
                  id="fullName"
                  name="fullName"
                  type="text"
                  placeholder="Enter patient's full name"
                  value={formData.fullName}
                  onChange={handleInputChange}
                  required
                  maxLength={100}
                />
              </div>

              <div className="patients-field">
                <label htmlFor="dateOfBirth">Date of birth *</label>
                <input
                  id="dateOfBirth"
                  name="dateOfBirth"
                  type="date"
                  value={formData.dateOfBirth}
                  onChange={handleInputChange}
                  max={new Date().toISOString().split('T')[0]}
                  required
                />
              </div>

              <div className="patients-field">
                <label htmlFor="gender">Gender *</label>
                <select
                  id="gender"
                  name="gender"
                  value={formData.gender}
                  onChange={handleInputChange}
                  required
                >
                  <option value="">Select gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div className="patients-field">
                <label htmlFor="phone">Phone number *</label>
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  placeholder="Enter phone number"
                  value={formData.phone}
                  onChange={handleInputChange}
                  required
                  maxLength={20}
                />
              </div>

              <div className="patients-field">
                <label htmlFor="departmentId">Department *</label>
                <select
                  id="departmentId"
                  name="departmentId"
                  value={formData.departmentId}
                  onChange={handleInputChange}
                  required
                  disabled={departmentsStatus !== 'ready' || departments.length === 0}
                >
                  <option value="">
                    {departmentsStatus === 'loading'
                      ? 'Loading departments…'
                      : 'Select department'}
                  </option>
                  {departments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </select>

                {departmentsStatus === 'error' && (
                  <small className="patients-field-hint error">
                    {departmentsError}{' '}
                    <button type="button" onClick={loadDepartments}>
                      Try again
                    </button>
                  </small>
                )}

                {departmentsStatus === 'ready' && departments.length === 0 && (
                  <small className="patients-field-hint error">
                    No active departments are configured. Add or activate one
                    on the Departments page.
                  </small>
                )}
              </div>

              <div className="patients-field patients-field-full">
                <label htmlFor="visitType">Visit type *</label>
                <select
                  id="visitType"
                  name="visitType"
                  value={formData.visitType}
                  onChange={handleInputChange}
                  required
                >
                  <option value="normal">Normal visit</option>
                  <option value="emergency">Emergency visit</option>
                </select>
              </div>
            </div>

            <div className="patients-form-actions">
              <button
                type="button"
                className="patients-secondary-button"
                onClick={() => setShowForm(false)}
                disabled={isSaving}
              >
                Cancel
              </button>

              <button
                type="submit"
                className="patients-primary-button"
                disabled={isSaving}
              >
                {isSaving ? 'Registering...' : 'Register patient'}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="patients-records-card">
        <div className="patients-records-heading">
          <div>
            <h2>Patient records</h2>
            <p>
              {patients.length} registered patient
              {patients.length === 1 ? '' : 's'}
            </p>
          </div>

          <input
            className="patients-search"
            type="search"
            placeholder="Search by name, ID, phone or department"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search patient records"
          />
        </div>

        {isLoading ? (
          <div className="patients-empty-state">
            Loading patient records...
          </div>
        ) : filteredPatients.length === 0 ? (
          <div className="patients-empty-state">
            <span className="patients-empty-icon">♙</span>

            <h3>
              {patients.length === 0
                ? 'No patients registered yet'
                : 'No matching patients found'}
            </h3>

            <p>
              {patients.length === 0
                ? 'Register a new patient to start building your hospital records.'
                : 'Try searching with a different name, patient ID, phone number or department.'}
            </p>
          </div>
        ) : (
          <div className="patients-table-wrapper">
            <table className="patients-table">
              <thead>
                <tr>
                  <th>Patient ID</th>
                  <th>Patient name</th>
                  <th>Date of birth</th>
                  <th>Gender</th>
                  <th>Phone number</th>
                  <th>Department</th>
                  <th>Visit type</th>
                  <th>Registered</th>
                </tr>
              </thead>

              <tbody>
                {filteredPatients.map((patient) => (
                  <tr
                    key={patient.id}
                    className="patients-clickable-row"
                    onClick={() => openPatientDetails(patient.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        openPatientDetails(patient.id);
                      }
                    }}
                    tabIndex={0}
                    aria-label={`View details for ${patient.full_name}`}
                  >
                    <td>
                      <strong className="patients-id">
                        {patient.patient_number}
                      </strong>
                    </td>

                    <td className="patients-name">
                      {patient.full_name}
                    </td>

                    <td>{formatDateOnly(patient.date_of_birth)}</td>

                    <td>{patient.gender}</td>

                    <td>{patient.phone}</td>

                    <td>{patient.department || '—'}</td>

                    <td>
                      {patient.visit_type
                        ? patient.visit_type === 'emergency'
                          ? 'Emergency'
                          : 'Normal'
                        : '—'}
                    </td>

                    <td>{formatDateTime(patient.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export default Patients;
