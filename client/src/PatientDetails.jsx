
import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import './PatientDetails.css';
import { useAuth } from './authContext.js';
import SimulatedAiPanel from './SimulatedAiPanel.jsx';
import BackToDashboard from './BackToDashboard.jsx';
import {
  EMPTY_AI_STATE,
  formatPriorityLabel,
  getFinalDecision,
} from './simulatedAi.js';

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
  const auth = useAuth();
  // Clinical information (assessments, AI suggestions, reassessment
  // decisions) is only requested and shown for roles allowed to see it.
  const canViewClinical = auth.can('clinical.view');

  // Opened from a reassessment alert: ?visit=<visitId>&reassess=1
  const [searchParams] = useSearchParams();
  const requestedVisitId = searchParams.get('visit');
  const isReassessmentRequest = searchParams.get('reassess') === '1';

  const [decisions, setDecisions] = useState([]);

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

  // Simulated AI demonstration (Phase 6): the current suggestion and the
  // staff's pending decision, plus the visit's full suggestion log.
  const [ai, setAi] = useState(EMPTY_AI_STATE);
  const [aiLog, setAiLog] = useState([]);

  // Load patient information and visits.
  useEffect(() => {
    async function loadPatientDetails() {
      try {
        setIsLoading(true);
        setError('');

        const response = await fetch(
          `/api/patients/${encodeURIComponent(id)}`,
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

        // A different patient or visit has been loaded: never carry over a
        // simulated suggestion from the previous one.
        setAi(EMPTY_AI_STATE);

        if (data.visits && data.visits.length > 0) {
          const requestedVisit = data.visits.find(
            (visit) => String(visit.id) === requestedVisitId
          );

          setSelectedVisitId(String((requestedVisit || data.visits[0]).id));
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
  }, [id, requestedVisitId]);

  // When opened from a reassessment alert, bring the form into view.
  useEffect(() => {
    if (!isLoading && isReassessmentRequest) {
      document
        .getElementById('assessment-form-section')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [isLoading, isReassessmentRequest]);

  // Load assessment history for the selected visit.
  useEffect(() => {
    async function loadAssessments() {
      if (!selectedVisitId) {
        setAssessments([]);
        return;
      }

      if (!canViewClinical) {
        setAssessments([]);
        setDecisions([]);
        setAiLog([]);
        return;
      }

      try {
        setIsLoadingAssessments(true);
        setAssessmentError('');

        const response = await fetch(
          `/api/triage/${encodeURIComponent(selectedVisitId)}`,
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

        // Reassessment decisions (not required / remind later) are
        // supplementary; failing to load them does not hide assessments.
        try {
          const decisionResponse = await fetch(
            `/api/reassessments/${encodeURIComponent(selectedVisitId)}/history`,
            { credentials: 'include' }
          );
          const decisionData = decisionResponse.ok
            ? await decisionResponse.json()
            : { decisions: [] };
          setDecisions(decisionData.decisions || []);
        } catch {
          setDecisions([]);
        }

        // Simulated AI suggestion log (supplementary, like decisions).
        try {
          const aiResponse = await fetch(
            `/api/ai-triage/visits/${encodeURIComponent(selectedVisitId)}/suggestions`,
            { credentials: 'include' }
          );
          const aiData = aiResponse.ok
            ? await aiResponse.json()
            : { suggestions: [] };
          setAiLog(aiData.suggestions || []);
        } catch {
          setAiLog([]);
        }
      } catch (err) {
        setAssessmentError(
          err.message || 'Could not load assessment history.'
        );
      } finally {
        setIsLoadingAssessments(false);
      }
    }

    loadAssessments();
  }, [selectedVisitId, assessmentRefresh, canViewClinical]);

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

    // A requested simulated suggestion needs an explicit staff decision.
    if (ai.suggestion && !ai.decision) {
      setSaveError(
        'Accept, override or discard the simulated AI suggestion before saving.'
      );
      return;
    }

    const finalDecision = getFinalDecision(ai, form.triagePriority);

    try {
      setIsSaving(true);

      const response = await fetch('/api/triage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          visitId: selectedVisitId,
          ...form,
          ...(finalDecision && {
            aiSuggestion: {
              id: ai.suggestion.id,
              decision: finalDecision,
              overrideReason:
                finalDecision === 'overridden' ? ai.overrideReason : null,
            },
          }),
        }),
      });

      const data = await response.json();

      if (response.status === 401) {
        window.location.href = '/login';
        return;
      }

      // The suggestion already has a decision, so nothing was saved now.
      if (response.status === 409 && data.alreadyDecided) {
        setAi(EMPTY_AI_STATE);
        setAssessmentRefresh((previous) => previous + 1);

        if (
          data.assessmentId &&
          (data.decision === 'accepted' || data.decision === 'overridden')
        ) {
          // An earlier save (e.g. one whose response was lost, or another
          // tab) already saved an assessment with this suggestion. The form
          // is kept so staff can compare it with the saved history.
          setSaveMessage(
            'An assessment using this simulated suggestion had already been saved (shown in the history below). ' +
              'No duplicate was created and this form was NOT saved again. ' +
              'If the saved assessment matches this form, clear the form instead of saving it again.'
          );
        } else {
          setSaveError(
            'This simulated suggestion had already been discarded, so this assessment was NOT saved. ' +
              'Save again without the suggestion, or request a new one.'
          );
        }

        return;
      }

      if (!response.ok) {
        throw new Error(data.message || 'Could not save assessment.');
      }

      setSaveMessage('Assessment saved successfully.');
      setForm(initialForm);
      setAi(EMPTY_AI_STATE);
      setAssessmentRefresh((previous) => previous + 1);
    } catch (err) {
      setSaveError(err.message || 'Something went wrong.');
    } finally {
      setIsSaving(false);
    }
  }

  // A visit that already has a full assessment is being REassessed.
  // Priority changes made from the queue are not full assessments.
  const isReassessment = assessments.some(
    (assessment) => assessment.entry_type === 'assessment'
  );
  const currentPriority = assessments[0]?.triage_priority;

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
          <div className="triora-back-row">
            <BackToDashboard />
            <Link to="/patients" className="triora-back-link">
              <span aria-hidden="true">←</span>
              Back to patient records
            </Link>
          </div>
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
          <div className="triora-back-row">
            <BackToDashboard />
            <Link to="/patients" className="triora-back-link">
              <span aria-hidden="true">←</span>
              Back to patient records
            </Link>
          </div>

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

      {canViewClinical ? (
        <>
          {/* Triage assessment form */}
          <section className="details-card" id="assessment-form-section">
            <div className="details-section-heading">
              <div>
                <span className="details-section-label">CLINICAL WORKSPACE</span>
                <h2>{isReassessment ? 'Reassessment' : 'New triage assessment'}</h2>
                <p className="triage-section-description">
                  {isReassessment
                    ? 'This visit already has an assessment. Saving records a reassessment and restarts the reassessment clock.'
                    : 'Record observations for a specific patient visit.'}
                </p>
              </div>
            </div>

            {isReassessment && currentPriority && (
              <div className="triage-feedback reassessment-banner">
                Current priority: <strong>{currentPriority}</strong>. The priority
                field below is intentionally blank: select the priority that
                reflects this reassessment. Reassessment never changes the
                priority automatically.
              </div>
            )}

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
                      setAi(EMPTY_AI_STATE);
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

                <SimulatedAiPanel
                  key={`${id}-${selectedVisitId}`}
                  visitId={selectedVisitId ? Number(selectedVisitId) : null}
                  form={form}
                  ai={ai}
                  onAiChange={setAi}
                  onPriorityChange={(priority) =>
                    setForm((previousForm) => ({
                      ...previousForm,
                      triagePriority: priority,
                    }))
                  }
                  onRecorded={() => setAssessmentRefresh((previous) => previous + 1)}
                />

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
                            <span className="assessment-kind">
                              {Number(assessment.assessment_number) === 1
                                ? 'Initial assessment'
                                : `Reassessment #${Number(assessment.assessment_number) - 1}`}
                            </span>
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

                        {aiLog
                          .filter((item) => item.assessment_id === assessment.id)
                          .map((item) => (
                            <p className="assessment-ai-link" key={item.id}>
                              <strong>Simulated AI suggestion (demonstration):</strong>{' '}
                              {formatPriorityLabel(item.suggested_priority)} · Staff final:{' '}
                              {formatPriorityLabel(item.final_priority)} ·{' '}
                              {item.decision === 'accepted' ? 'Accepted' : 'Overridden'}
                              {item.override_reason && ` · Reason: ${item.override_reason}`}
                              {' '}· by {item.decided_by_name || 'Staff member'},{' '}
                              {formatDateTime(item.decided_at)}
                            </p>
                          ))}
                      </article>
                      )
                    )}
                  </div>
                )}
              </>
            )}
          </section>

          {/* Simulated AI suggestion log */}
          {visits.length > 0 && (
            <section className="details-card">
              <div className="details-section-heading">
                <div>
                  <span className="details-section-label">SIMULATED AI DEMONSTRATION</span>
                  <h2>Simulated AI suggestion log</h2>
                  <p className="triage-section-description">
                    Every simulated suggestion requested for the selected visit,
                    including discarded and unused ones. Simulated demonstration
                    output only — not genuine AI analysis.
                  </p>
                </div>

                <span className="visit-count">
                  {aiLog.length} {aiLog.length === 1 ? 'suggestion' : 'suggestions'}
                </span>
              </div>

              {aiLog.length === 0 ? (
                <div className="details-empty-state">
                  No simulated suggestions have been requested for this visit.
                </div>
              ) : (
                <div className="assessment-list">
                  {aiLog.map((item) => (
                    <article className="assessment-item" key={item.id}>
                      <div className="assessment-item-heading">
                        <div>
                          <span className="assessment-kind">Simulated suggestion</span>
                          <h3>
                            {item.can_suggest
                              ? `Suggested: ${formatPriorityLabel(item.suggested_priority)}`
                              : 'No suggestion (insufficient information scenario)'}
                          </h3>
                          <p>
                            Requested {formatDateTime(item.requested_at)} by{' '}
                            {item.requested_by_name || 'Staff member'} · scenario{' '}
                            {item.scenario_key}
                          </p>
                        </div>

                        <span className={`ai-decision-badge ${item.decision || 'none'}`}>
                          {item.decision === 'accepted'
                            ? 'Accepted'
                            : item.decision === 'overridden'
                              ? 'Overridden'
                              : item.decision === 'discarded'
                                ? 'Discarded'
                                : 'No decision recorded'}
                        </span>
                      </div>

                      {item.decision && (
                        <p className="assessment-assessor">
                          {item.decision === 'discarded'
                            ? 'Discarded'
                            : `Staff final priority: ${formatPriorityLabel(item.final_priority)}`}
                          {item.override_reason && ` · Reason: ${item.override_reason}`}
                          {' '}· by {item.decided_by_name || 'Staff member'},{' '}
                          {formatDateTime(item.decided_at)}
                          {item.assessment_id && ' · linked to a saved assessment'}
                        </p>
                      )}

                      {!item.decision && (
                        <p className="assessment-assessor">
                          Not used: no assessment was saved with this suggestion.
                        </p>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Reassessment decisions */}
          {visits.length > 0 && (
            <section className="details-card">
              <div className="details-section-heading">
                <div>
                  <span className="details-section-label">CLINICAL RECORDS</span>
                  <h2>Reassessment decisions</h2>
                  <p className="triage-section-description">
                    "Not required" and "Remind later" decisions for the selected visit.
                  </p>
                </div>

                <span className="visit-count">
                  {decisions.length} {decisions.length === 1 ? 'decision' : 'decisions'}
                </span>
              </div>

              {decisions.length === 0 ? (
                <div className="details-empty-state">
                  No reassessment decisions have been recorded for this visit.
                </div>
              ) : (
                <div className="assessment-list">
                  {decisions.map((decision) => (
                    <article className="assessment-item" key={decision.id}>
                      <div className="assessment-item-heading">
                        <div>
                          <h3>
                            {decision.decision === 'not_required'
                              ? 'Reassessment not required'
                              : `Reminder set for ${formatDateTime(decision.defer_until)}`}
                          </h3>
                          <p>{formatDateTime(decision.created_at)}</p>
                        </div>
                      </div>

                      {decision.reason && (
                        <p className="assessment-description">
                          <strong>Reason:</strong> {decision.reason}
                        </p>
                      )}

                      <p className="assessment-assessor">
                        Recorded by: {decision.decided_by_name || 'Staff member'}
                        {decision.priority && ` · priority at the time: ${decision.priority}`}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      ) : (
        <section className="details-card">
          <div className="details-empty-state" role="note">
            Clinical information (assessments, clinical notes, simulated AI
            suggestions and reassessment decisions) is restricted for your
            role. Registration details and visit status are shown above.
          </div>
        </section>
      )}
    </main>
  );
}

export default PatientDetails;
