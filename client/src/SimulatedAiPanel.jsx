import { useEffect, useState } from 'react';
import {
  EMPTY_AI_STATE,
  SIMULATED_AI_DISCLAIMER,
  formatPriorityLabel,
  getFinalDecision,
} from './simulatedAi.js';

// Simulated AI triage demonstration (Phase 6).
// Talks ONLY to TRIORA's own backend, which returns predefined fictional
// responses. There is no external AI service and no usage cost.

const API_URL = '/api/ai-triage';

const PRIORITIES = ['critical', 'high', 'medium', 'low'];

// Form fields whose blank/filled state may be reported (names only).
const COMPLETENESS_FIELDS = [
  'chiefComplaint',
  'symptoms',
  'temperatureC',
  'heartRateBpm',
  'systolicBp',
  'diastolicBp',
  'respiratoryRate',
  'oxygenSaturation',
  'clinicalNotes',
];

async function readJson(response, fallbackMessage) {
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await response.json()
    : {};

  if (response.status === 401) {
    window.location.href = '/login';
    throw new Error('Please log in again.');
  }

  if (!response.ok) {
    throw new Error(data.message || `${fallbackMessage} (HTTP ${response.status})`);
  }

  return data;
}

function SimulatedAiPanel({ visitId, form, ai, onAiChange, onPriorityChange, onRecorded }) {
  const [scenarios, setScenarios] = useState([]);
  const [statusError, setStatusError] = useState('');
  const [scenarioKey, setScenarioKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Load the list of demonstration scenarios once.
  useEffect(() => {
    let cancelled = false;

    async function loadStatus() {
      try {
        const response = await fetch(`${API_URL}/status`, {
          credentials: 'include',
        });
        const data = await readJson(response, 'Could not load demonstration scenarios.');

        if (!cancelled) setScenarios(data.scenarios || []);
      } catch (loadError) {
        if (!cancelled) setStatusError(loadError.message);
      }
    }

    loadStatus();

    return () => {
      cancelled = true;
    };
  }, []);

  const suggestion = ai.suggestion;
  const finalDecision = getFinalDecision(ai, form.triagePriority);

  async function requestSuggestion() {
    try {
      setBusy(true);
      setError('');
      setNotice('');

      const blankFields = COMPLETENESS_FIELDS.filter(
        (field) => String(form[field] ?? '').trim() === ''
      );

      const response = await fetch(`${API_URL}/suggestions`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitId, scenarioKey, blankFields }),
      });
      const data = await readJson(response, 'Could not create the simulated suggestion.');

      onAiChange({ ...EMPTY_AI_STATE, suggestion: data.suggestion });
      onRecorded();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  function accept() {
    onPriorityChange(suggestion.suggested_priority);
    onAiChange({ ...ai, decision: 'accepted', overrideReason: '' });
    setNotice('');
  }

  function override() {
    // Staff must pick a different priority themselves.
    if (form.triagePriority === suggestion.suggested_priority) {
      onPriorityChange('');
    }

    onAiChange({ ...ai, decision: 'overridden' });
    setNotice('');
  }

  async function discard() {
    try {
      setBusy(true);
      setError('');

      const response = await fetch(
        `${API_URL}/suggestions/${suggestion.id}/discard`,
        { method: 'POST', credentials: 'include' }
      );

      // A decision already exists (e.g. an earlier discard succeeded but
      // its response was lost, or another tab used this suggestion).
      if (response.status === 409) {
        const data = await response.json().catch(() => ({}));

        onAiChange(EMPTY_AI_STATE);
        onRecorded();

        if (data.decision === 'discarded') {
          setNotice('Simulated suggestion discarded. The decision had already been recorded; the assessment form is unchanged.');
        } else {
          setError(
            `This simulated suggestion was already ${data.decision || 'used'} with a saved assessment, so it cannot be discarded. Check the history below.`
          );
        }

        return;
      }

      await readJson(response, 'Could not discard the simulated suggestion.');

      onAiChange(EMPTY_AI_STATE);
      setNotice('Simulated suggestion discarded. The decision has been recorded; the assessment form is unchanged.');
      onRecorded();
    } catch (discardError) {
      setError(discardError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="simulated-ai">
      <p className="simulated-ai-disclaimer" role="note">
        <strong>{SIMULATED_AI_DISCLAIMER}</strong>
      </p>

      {!suggestion && (
        <div className="simulated-ai-request">
          <div className="triage-form-group">
            <label htmlFor="simulatedScenario">Demonstration scenario</label>
            <select
              id="simulatedScenario"
              value={scenarioKey}
              onChange={(event) => setScenarioKey(event.target.value)}
              disabled={busy || scenarios.length === 0}
            >
              <option value="">Select a fictional demonstration scenario</option>
              {scenarios.map((scenario) => (
                <option key={scenario.key} value={scenario.key}>
                  {scenario.label}
                </option>
              ))}
            </select>
            <small className="simulated-ai-help">
              Staff choose the scenario. The demonstration does not read this
              patient&apos;s clinical information.
            </small>
          </div>

          <button
            type="button"
            className="simulated-ai-button"
            onClick={requestSuggestion}
            disabled={busy || !scenarioKey || !visitId}
          >
            {busy ? 'Preparing…' : 'Get AI Priority Suggestion'}
          </button>
        </div>
      )}

      {statusError && <div className="triage-feedback error">{statusError}</div>}
      {error && <div className="triage-feedback error">{error}</div>}
      {notice && <div className="triage-feedback success">{notice}</div>}

      {suggestion && (
        <section className="simulated-ai-panel" aria-label="Simulated AI suggestion">
          <div className="simulated-ai-panel-heading">
            <span className="simulated-ai-tag">SIMULATED DEMONSTRATION</span>
            <h3>
              Simulated suggested priority:{' '}
              {suggestion.can_suggest ? (
                <span className={`priority-badge priority-${suggestion.suggested_priority}`}>
                  {formatPriorityLabel(suggestion.suggested_priority)}
                </span>
              ) : (
                <span className="simulated-ai-none">No suggestion</span>
              )}
            </h3>
          </div>

          <p className="simulated-ai-text">{suggestion.explanation}</p>

          <div className="simulated-ai-lists">
            <div>
              <h4>Demonstration information considered</h4>
              <ul>
                {suggestion.considered.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>

            <div>
              <h4>Missing information (from the demonstration response)</h4>
              {suggestion.missing_information.length === 0 ? (
                <p className="simulated-ai-muted">None listed by this demonstration response.</p>
              ) : (
                <ul>
                  {suggestion.missing_information.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h4>Field-completeness check</h4>
              <p className="simulated-ai-muted">
                A simple check of which form fields were empty when the
                suggestion was requested — not clinical reasoning.
              </p>
              {suggestion.blank_fields.length === 0 ? (
                <p className="simulated-ai-muted">All listed fields had a value.</p>
              ) : (
                <ul>
                  {suggestion.blank_fields.map((field) => (
                    <li key={field}>{field}: not entered</li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="simulated-ai-actions">
            {suggestion.can_suggest && (
              <>
                <button
                  type="button"
                  className={`simulated-ai-action ${ai.decision === 'accepted' ? 'selected' : ''}`}
                  onClick={accept}
                  disabled={busy}
                >
                  Accept suggestion
                </button>
                <button
                  type="button"
                  className={`simulated-ai-action ${ai.decision === 'overridden' ? 'selected' : ''}`}
                  onClick={override}
                  disabled={busy}
                >
                  Override suggestion
                </button>
              </>
            )}
            <button
              type="button"
              className="simulated-ai-action discard"
              onClick={discard}
              disabled={busy}
            >
              Discard suggestion
            </button>
          </div>

          {ai.decision === 'overridden' && (
            <div className="simulated-ai-override">
              <div className="triage-form-group">
                <label htmlFor="overridePriority">Staff-selected priority *</label>
                <select
                  id="overridePriority"
                  value={form.triagePriority}
                  onChange={(event) => onPriorityChange(event.target.value)}
                >
                  <option value="">Select priority</option>
                  {PRIORITIES.filter(
                    (priority) => priority !== suggestion.suggested_priority
                  ).map((priority) => (
                    <option key={priority} value={priority}>
                      {formatPriorityLabel(priority)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="triage-form-group">
                <label htmlFor="overrideReason">Override reason (optional)</label>
                <textarea
                  id="overrideReason"
                  rows="2"
                  maxLength={500}
                  value={ai.overrideReason}
                  onChange={(event) =>
                    onAiChange({ ...ai, overrideReason: event.target.value })
                  }
                />
              </div>
            </div>
          )}

          <p className="simulated-ai-status">
            {!ai.decision
              ? suggestion.can_suggest
                ? 'Choose Accept, Override or Discard before saving this assessment.'
                : 'This demonstration response has no suggested priority. Discard it before saving.'
              : finalDecision === 'accepted'
                ? `Will be recorded as: Accepted (${formatPriorityLabel(suggestion.suggested_priority)}) when the assessment is saved.`
                : form.triagePriority
                  ? `Will be recorded as: Overridden — staff priority ${formatPriorityLabel(form.triagePriority)} — when the assessment is saved.`
                  : 'Select the staff priority, then save the assessment.'}
          </p>
        </section>
      )}
    </div>
  );
}

export default SimulatedAiPanel;
