
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import './PatientDetails.css';

function formatDate(value) {
  if (!value) return '—';

  const dateString = String(value).slice(0, 10);
  const parts = dateString.split('-');

  if (parts.length !== 3) return '—';

  const date = new Date(
    Number(parts[0]),
    Number(parts[1]) - 1,
    Number(parts[2])
  );

  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatDateTime(value) {
  if (!value) return '—';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return '—';

  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const initialForm = {
  chiefComplaint: '',
  symptoms: '',
  temperatureC: '',
  heartRateBpm: '',
  systolicBp: '',
  diastolicBp: '',
  respiratoryRate: '',
  oxygenSaturation: '',
  triagePriority: '',
  clinicalNotes: '',
};

function PatientDetails() {
  const { id } = useParams();

  const [patient, setPatient] = useState(null);
  const [visits, setVisits] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const [selectedVisitId, setSelectedVisitId] = useState('');
  const [assessments, setAssessments] = useState([]);
  const [isLoadingAssessments, setIsLoadingAssessments] = useState(false);
  const [assessmentError, setAssessmentError] = useState('');
  const [assessmentRefresh, setAssessmentRefresh] = useState(0);

  const [form, setForm] = useState(initialForm);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [saveError, setSaveError] = useState('');

  // Load patient information and visits.
  useEffect(() => {
    async function loadPatientDetails() {
      try {
        setIsLoading(true);
        setError('');

        const response = await fetch(
          `http://localhost:5000/api/patients/${encodeURIComponent(id)}`,
          {
            credentials: 'include',
          }
        );

        const data = await response.json();

        if (response.status === 401) {
          window.location.href = '/login';
          return;
        }

        if (!response.ok) {
          throw new Error(data.message || 'Could not load patient details.');
        }

        setPatient(data.patient);
        setVisits(data.visits || []);

        if (data.visits && data.visits.length > 0) {
          setSelectedVisitId(String(data.visits[0].id));
        } else {
          setSelectedVisitId('');
        }
      } catch (err) {
        setError(err.message || 'Something went wrong.');
      } finally {
        setIsLoading(false);
      }
    }

    loadPatientDetails();
  }, [id]);

  // Load assessment history for the selected visit.
  useEffect(() => {
    async function loadAssessments() {
      if (!selectedVisitId) {
        setAssessments([]);
        return;
      }

      try {
        setIsLoadingAssessments(true);
        setAssessmentError('');

        const response = await fetch(
          `http://localhost:5000/api/triage/${encodeURIComponent(selectedVisitId)}`,
          {
            credentials: 'include',
          }
        );

        const data = await response.json();

        if (response.status === 401) {
          window.location.href = '/login';
          return;
        }

        if (!response.ok) {
          throw new Error(
            data.message || 'Could not load assessment history.'
          );
        }

        setAssessments(data.assessments || []);
      } catch (err) {
        setAssessmentError(
          err.message || 'Could not load assessment history.'
        );
      } finally {
        setIsLoadingAssessments(false);
      }
    }

    loadAssessments();
  }, [selectedVisitId, assessmentRefresh]);

  function handleInputChange(event) {
    const { name, value } = event.target;

    setForm((previousForm) => ({
      ...previousForm,
      [name]: value,
    }));
  }

  async function handleAssessmentSubmit(event) {
    event.preventDefault();

    setSaveMessage('');
    setSaveError('');

    if (!selectedVisitId) {
      setSaveError('Please select a patient visit first.');
      return;
    }

    try {
      setIsSaving(true);

      const response = await fetch('http://localhost:5000/api/triage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          visitId: selectedVisitId,
          ...form,
        }),
      });

      const data = await response.json();

      if (response.status === 401) {
        window.location.href = '/login';
        return;
      }

      if (!response.ok) {
        throw new Error(data.message || 'Could not save assessment.');
      }

      setSaveMessage('Assessment saved successfully.');
      setForm(initialForm);
      setAssessmentRefresh((previous) => previous + 1);
    } catch (err) {
      setSaveError(err.message || 'Something went wrong.');
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <main className="patient-details-page">
        <div className="patient-details-message">
          Loading patient details...
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="patient-details-page">
        <div className="patient-details-message error-message">
          <h2>Unable to load patient</h2>
          <p>{error}</p>
          <Link to="/patients" className="details-back-link">
            Back to patient records
          </Link>
        </div>
      </main>
    );
  }

  if (!patient) {
    return null;
  }

  return (
    <main className="patient-details-page">
      <header className="patient-details-header">
        <div>
          <Link to="/patients" className="details-back-link">
            ← Back to patient records
          </Link>

          <span className="details-eyebrow">HOSPITAL WORKSPACE</span>

          <h1>{patient.full_name}</h1>

          <p>
            Patient ID: <strong>{patient.patient_number}</strong>
          </p>
        </div>
      </header>

      {/* Patient profile */}
      <section className="details-card">
        <div className="details-section-heading">
          <div>
            <span className="details-section-label">PATIENT PROFILE</span>
            <h2>Personal information</h2>
          </div>
        </div>

        <div className="details-info-grid">
          <div className="details-info-item">
            <span>Full name</span>
            <strong>{patient.full_name}</strong>
          </div>

          <div className="details-info-item">
            <span>Patient ID</span>
            <strong>{patient.patient_number}</strong>
          </div>

          <div className="details-info-item">
            <span>Date of birth</span>
            <strong>{formatDate(patient.date_of_birth)}</strong>
          </div>

          <div className="details-info-item">
            <span>Gender</span>
            <strong>{patient.gender || '—'}</strong>
          </div>

          <div className="details-info-item">
            <span>Phone number</span>
            <strong>{patient.phone || '—'}</strong>
          </div>

          <div className="details-info-item">
            <span>Registered on</span>
            <strong>{formatDateTime(patient.created_at)}</strong>
          </div>
        </div>
      </section>

      {/* Visit history */}
      <section className="details-card">
        <div className="details-section-heading">
          <div>
            <span className="details-section-label">PATIENT ACTIVITY</span>
            <h2>Visit history</h2>
          </div>

          <span className="visit-count">
            {visits.length} {visits.length === 1 ? 'visit' : 'visits'}
          </span>
        </div>

        {visits.length === 0 ? (
          <div className="details-empty-state">
            No visit records are available for this patient.
          </div>
        ) : (
          <div className="visit-list">
            {visits.map((visit) => (
              <article className="visit-item" key={visit.id}>
                <div className="visit-item-main">
                  <div>
                    <h3>{visit.department}</h3>
                    <p>{formatDateTime(visit.created_at)}</p>
                  </div>

                  <span
                    className={`visit-status ${
                      visit.status === 'waiting' ? 'status-waiting' : ''
                    }`}
                  >
                    {visit.status || 'Unknown'}
                  </span>
                </div>

                <div className="visit-item-meta">
                  <span>
                    Visit type: <strong>{visit.visit_type || '—'}</strong>
                  </span>

                  {visit.status !== 'waiting' && (
                    <span>
                      Waiting time:{' '}
                      <strong>
                        {visit.waiting_time_minutes ?? 'Not recorded'}
                        {visit.waiting_time_minutes !== null &&
                          visit.waiting_time_minutes !== undefined &&
                          ' min'}
                      </strong>
                    </span>
                  )}

                  {visit.consultation_started_at && (
                    <span>
                      Consultation started:{' '}
                      <strong>
                        {formatDateTime(visit.consultation_started_at)}
                      </strong>
                    </span>
                  )}

                  {visit.completed_at && (
                    <span>
                      Completed:{' '}
                      <strong>{formatDateTime(visit.completed_at)}</strong>
                    </span>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Triage assessment form */}
      <section className="details-card">
        <div className="details-section-heading">
          <div>
            <span className="details-section-label">CLINICAL WORKSPACE</span>
            <h2>New triage assessment</h2>
            <p className="triage-section-description">
              Record observations for a specific patient visit.
            </p>
          </div>
        </div>

        {visits.length === 0 ? (
          <div className="details-empty-state">
            This patient has no visits yet. A visit must exist before an
            assessment can be recorded.
          </div>
        ) : (
          <form
            className="triage-form"
            onSubmit={handleAssessmentSubmit}
          >
            <div className="triage-form-group">
              <label htmlFor="selectedVisit">Select patient visit</label>

              <select
                id="selectedVisit"
                value={selectedVisitId}
                onChange={(event) => {
                  setSelectedVisitId(event.target.value);
                  setSaveMessage('');
                  setSaveError('');
                }}
                required
              >
                {visits.map((visit) => (
                  <option key={visit.id} value={visit.id}>
                    {visit.department} — {formatDateTime(visit.created_at)}
                  </option>
                ))}
              </select>
            </div>

            <div className="triage-form-group">
              <label htmlFor="chiefComplaint">Chief complaint *</label>

              <input
                id="chiefComplaint"
                name="chiefComplaint"
                type="text"
                value={form.chiefComplaint}
                onChange={handleInputChange}
                placeholder="Enter the patient's main complaint"
                required
              />
            </div>

            <div className="triage-form-group">
              <label htmlFor="symptoms">Symptoms</label>

              <textarea
                id="symptoms"
                name="symptoms"
                value={form.symptoms}
                onChange={handleInputChange}
                placeholder="Describe the reported symptoms"
                rows="3"
              />
            </div>

            <div className="triage-subheading">
              <h3>Vital signs</h3>
              <p>Enter the observations recorded by clinical staff.</p>
            </div>

            <div className="triage-vitals-grid">
              <div className="triage-form-group">
                <label htmlFor="temperatureC">Temperature (°C)</label>
                <input
                  id="temperatureC"
                  name="temperatureC"
                  type="number"
                  min="25"
                  max="45"
                  step="0.1"
                  value={form.temperatureC}
                  onChange={handleInputChange}
                  placeholder="e.g. 37.0"
                />
              </div>

              <div className="triage-form-group">
                <label htmlFor="heartRateBpm">Heart rate (bpm)</label>
                <input
                  id="heartRateBpm"
                  name="heartRateBpm"
                  type="number"
                  min="1"
                  max="300"
                  value={form.heartRateBpm}
                  onChange={handleInputChange}
                  placeholder="e.g. 80"
                />
              </div>

              <div className="triage-form-group">
                <label htmlFor="systolicBp">Systolic BP (mmHg)</label>
                <input
                  id="systolicBp"
                  name="systolicBp"
                  type="number"
                  min="1"
                  max="300"
                  value={form.systolicBp}
                  onChange={handleInputChange}
                  placeholder="e.g. 120"
                />
              </div>

              <div className="triage-form-group">
                <label htmlFor="diastolicBp">Diastolic BP (mmHg)</label>
                <input
                  id="diastolicBp"
                  name="diastolicBp"
                  type="number"
                  min="1"
                  max="200"
                  value={form.diastolicBp}
                  onChange={handleInputChange}
                  placeholder="e.g. 80"
                />
              </div>

              <div className="triage-form-group">
                <label htmlFor="respiratoryRate">
                  Respiratory rate (/min)
                </label>
                <input
                  id="respiratoryRate"
                  name="respiratoryRate"
                  type="number"
                  min="1"
                  max="100"
                  value={form.respiratoryRate}
                  onChange={handleInputChange}
                  placeholder="e.g. 16"
                />
              </div>

              <div className="triage-form-group">
                <label htmlFor="oxygenSaturation">
                  Oxygen saturation (%)
                </label>
                <input
                  id="oxygenSaturation"
                  name="oxygenSaturation"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={form.oxygenSaturation}
                  onChange={handleInputChange}
                  placeholder="e.g. 98"
                />
              </div>
            </div>

            <div className="triage-form-group">
              <label htmlFor="triagePriority">
                Staff-assigned triage priority *
              </label>

              <select
                id="triagePriority"
                name="triagePriority"
                value={form.triagePriority}
                onChange={handleInputChange}
                required
              >
                <option value="">Select priority</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>

            <div className="triage-form-group">
              <label htmlFor="clinicalNotes">Clinical notes</label>

              <textarea
                id="clinicalNotes"
                name="clinicalNotes"
                value={form.clinicalNotes}
                onChange={handleInputChange}
                placeholder="Additional observations or notes"
                rows="4"
              />
            </div>

            {saveMessage && (
              <div className="triage-feedback success">
                {saveMessage}
              </div>
            )}

            {saveError && (
              <div className="triage-feedback error">
                {saveError}
              </div>
            )}

            <button
              type="submit"
              className="triage-submit-button"
              disabled={isSaving}
            >
              {isSaving ? 'Saving assessment...' : 'Save assessment'}
            </button>
          </form>
        )}
      </section>

      {/* Assessment history */}
      <section className="details-card">
        <div className="details-section-heading">
          <div>
            <span className="details-section-label">CLINICAL RECORDS</span>
            <h2>Assessment history</h2>
            <p className="triage-section-description">
              Previous assessments for the selected visit.
            </p>
          </div>

          <span className="visit-count">
            {assessments.length}{' '}
            {assessments.length === 1 ? 'assessment' : 'assessments'}
          </span>
        </div>

        {visits.length > 0 && (
          <>
            {isLoadingAssessments ? (
              <div className="details-empty-state">
                Loading assessment history...
              </div>
            ) : assessmentError ? (
              <div className="triage-feedback error">
                {assessmentError}
              </div>
            ) : assessments.length === 0 ? (
              <div className="details-empty-state">
                No assessments have been recorded for this visit yet.
              </div>
            ) : (
              <div className="assessment-list">
                {assessments.map((assessment) =>
                  assessment.entry_type === 'priority_update' ? (
                  <article
                    className="assessment-item"
                    key={assessment.id}
                  >
                    <div className="assessment-item-heading">
                      <div>
                        <h3>Priority changed from queue</h3>
                        <p>{formatDateTime(assessment.created_at)}</p>
                      </div>

                      <span
                        className={`priority-badge priority-${assessment.triage_priority}`}
                      >
                        {assessment.triage_priority}
                      </span>
                    </div>

                    <p className="assessment-description">
                      <strong>Change:</strong>{' '}
                      {assessment.previous_priority || 'unknown'} →{' '}
                      {assessment.triage_priority}. No new observations
                      were recorded with this change.
                    </p>

                    <p className="assessment-assessor">
                      Changed by: {assessment.assessed_by_name || 'Staff member'}
                    </p>
                  </article>
                  ) : (
                  <article
                    className="assessment-item"
                    key={assessment.id}
                  >
                    <div className="assessment-item-heading">
                      <div>
                        <h3>{assessment.chief_complaint}</h3>
                        <p>{formatDateTime(assessment.created_at)}</p>
                      </div>

                      <span
                        className={`priority-badge priority-${assessment.triage_priority}`}
                      >
                        {assessment.triage_priority}
                      </span>
                    </div>

                    {assessment.symptoms && (
                      <p className="assessment-description">
                        <strong>Symptoms:</strong> {assessment.symptoms}
                      </p>
                    )}

                    <div className="assessment-vitals">
                      <span>
                        Temperature: <strong>{assessment.temperature_c ?? '—'} °C</strong>
                      </span>
                      <span>
                        Heart rate: <strong>{assessment.heart_rate_bpm ?? '—'} bpm</strong>
                      </span>
                      <span>
                        Blood pressure: <strong>
                          {assessment.systolic_bp ?? '—'}/
                          {assessment.diastolic_bp ?? '—'} mmHg
                        </strong>
                      </span>
                      <span>
                        Respiratory rate: <strong>
                          {assessment.respiratory_rate ?? '—'} /min
                        </strong>
                      </span>
                      <span>
                        Oxygen saturation: <strong>
                          {assessment.oxygen_saturation ?? '—'}%
                        </strong>
                      </span>
                    </div>

                    {assessment.clinical_notes && (
                      <p className="assessment-description">
                        <strong>Clinical notes:</strong>{' '}
                        {assessment.clinical_notes}
                      </p>
                    )}

                    <p className="assessment-assessor">
                      Assessed by: {assessment.assessed_by_name || 'Staff member'}
                    </p>
                  </article>
                  )
                )}
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}

export default PatientDetails;
