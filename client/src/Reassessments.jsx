import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './Queues.css';
import './Departments.css';
import './Reassessments.css';

const API_URL = 'http://localhost:5000/api/reassessments';
const REFRESH_INTERVAL_MS = 60 * 1000;
const ACTIVE_STATES = ['due_soon', 'due', 'overdue'];

const STATE_LABELS = {
  overdue: 'Overdue',
  due: 'Due',
  due_soon: 'Due soon',
  not_due: 'Not due yet',
  not_configured: 'Interval not configured',
  not_triaged: 'Not triaged',
};

const VIEWS = [
  { key: 'active', label: 'Active alerts' },
  { key: 'snoozed', label: 'Snoozed' },
  { key: 'all', label: 'All waiting patients' },
];

class UnauthorizedError extends Error {}

async function readJson(response, fallbackMessage) {
  if (response.status === 401) {
    throw new UnauthorizedError('Please log in again.');
  }

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await response.json()
    : {};

  if (!response.ok) {
    throw new Error(data.message || `${fallbackMessage} (HTTP ${response.status})`);
  }

  return data;
}

async function requestReassessments() {
  const response = await fetch(`${API_URL}?view=all`, {
    credentials: 'include',
  });

  return readJson(response, 'Could not load reassessments.');
}

function formatPriority(priority) {
  if (!priority) return '—';
  return priority.charAt(0).toUpperCase() + priority.slice(1);
}

function formatDateTime(value) {
  if (!value) return '—';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Value for a datetime-local input, in the browser's local time.
function toLocalInputValue(date) {
  const pad = (number) => String(number).padStart(2, '0');

  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

function isActive(patient) {
  return ACTIVE_STATES.includes(patient.alert_state);
}

function matchesView(patient, view) {
  if (view === 'all') return true;
  if (view === 'snoozed') return isActive(patient) && patient.is_snoozed;
  return isActive(patient) && !patient.is_snoozed;
}

function formatMinutes(value) {
  return value === null || value === undefined ? 'Not set' : `${value} min`;
}

function emptyToNull(value) {
  return value === '' ? null : Number(value);
}

function Reassessments() {
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [view, setView] = useState('active');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Inline action form: { visitId, type: 'not_required' | 'defer' }.
  const [action, setAction] = useState(null);
  const [reason, setReason] = useState('');
  const [deferUntil, setDeferUntil] = useState('');

  // Settings editor: one priority at a time.
  const [editingPriority, setEditingPriority] = useState(null);
  const [draft, setDraft] = useState(null);

  const handleUnauthorized = useCallback(
    (requestError) => {
      if (requestError instanceof UnauthorizedError) {
        navigate('/login', { replace: true });
        return true;
      }

      return false;
    },
    [navigate]
  );

  const loadData = useCallback(
    () =>
      requestReassessments().then(
        (result) => {
          setData(result);
          setLoadError('');
        },
        (requestError) => {
          if (!handleUnauthorized(requestError)) {
            setLoadError(requestError.message);
          }
        }
      ),
    [handleUnauthorized]
  );

  useEffect(() => {
    loadData();
    const timer = setInterval(loadData, REFRESH_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [loadData]);

  async function send(url, method, body) {
    try {
      setBusy(true);
      setMessage('');
      setError('');

      const response = await fetch(url, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const result = await readJson(response, 'Could not save.');

      setMessage(result.message);
      await loadData();
      return true;
    } catch (requestError) {
      if (!handleUnauthorized(requestError)) {
        setError(requestError.message);
        await loadData();
      }

      return false;
    } finally {
      setBusy(false);
    }
  }

  function openAction(patient, type) {
    setAction({ visitId: patient.visit_id, type });
    setReason('');
    setDeferUntil('');
    setMessage('');
    setError('');
  }

  async function submitAction(patient) {
    const ok =
      action.type === 'not_required'
        ? await send(`${API_URL}/${patient.visit_id}/not-required`, 'POST', {
            reason,
          })
        : await send(`${API_URL}/${patient.visit_id}/defer`, 'POST', {
            until: deferUntil ? new Date(deferUntil).toISOString() : '',
            reason,
          });

    if (ok) setAction(null);
  }

  function startEditing(setting) {
    setEditingPriority(setting.priority);
    setDraft({
      intervalMinutes: setting.interval_minutes ?? '',
      dueSoonMinutes: setting.due_soon_minutes ?? '',
      graceMinutes: setting.grace_minutes ?? '',
      isEnabled: setting.is_enabled,
      approvalNote: setting.approval_note ?? '',
    });
    setMessage('');
    setError('');
  }

  async function saveSetting(priority) {
    const ok = await send(`${API_URL}/settings/${priority}`, 'PUT', {
      intervalMinutes: emptyToNull(draft.intervalMinutes),
      dueSoonMinutes: emptyToNull(draft.dueSoonMinutes),
      graceMinutes: emptyToNull(draft.graceMinutes),
      isEnabled: draft.isEnabled,
      approvalNote: draft.approvalNote,
    });

    if (ok) setEditingPriority(null);
  }

  const counts = data?.counts;
  const patients = (data?.patients || []).filter((patient) =>
    matchesView(patient, view)
  );
  const viewCounts = {
    active: counts ? counts.overdue + counts.due + counts.due_soon : 0,
    snoozed: counts ? counts.snoozed : 0,
    all: data ? data.patients.length : 0,
  };

  return (
    <div className="queues-page">
      <Link to="/dashboard" className="queue-back-button">
        ← Back to Dashboard
      </Link>

      <header className="queues-header">
        <div>
          <p className="queues-eyebrow">CLINICAL WORKSPACE</p>
          <h1>Reassessment Alerts</h1>
          <p className="queues-description">
            Waiting patients whose reassessment is approaching, due or
            overdue, based on the hospital&apos;s configured intervals.
            Alerts never change a patient&apos;s priority.
          </p>
        </div>
      </header>

      {data && !data.configured && (
        <div className="reassessment-notice" role="status">
          <strong>Reassessment intervals have not been configured.</strong>
          <p>
            No patient is labelled due or overdue until qualified clinical
            staff approve intervals and they are entered and enabled in the
            settings below.
          </p>
        </div>
      )}

      <section className="queue-stats">
        {[
          ['Overdue', counts?.overdue],
          ['Due', counts?.due],
          ['Due Soon', counts?.due_soon],
          ['Snoozed', counts?.snoozed],
        ].map(([label, value]) => (
          <div className="queue-stat-card" key={label}>
            <span>{label}</span>
            <strong>{typeof value === 'number' ? value : '—'}</strong>
          </div>
        ))}
      </section>

      <section className="queue-filter-section">
        <div className="queue-filter-heading">
          <h2>Show</h2>
          <p>Only waiting patients are included. Starting a consultation removes the alert.</p>
        </div>

        <div className="queue-department-filters">
          {VIEWS.map((option) => (
            <button
              key={option.key}
              type="button"
              className={`queue-filter-button ${view === option.key ? 'active' : ''}`}
              onClick={() => setView(option.key)}
            >
              {option.label} ({viewCounts[option.key]})
            </button>
          ))}
        </div>
      </section>

      <section className="queue-table-section">
        <div className="queue-section-header">
          <div>
            <h2>{VIEWS.find((option) => option.key === view).label}</h2>
            <p>Most urgent first</p>
          </div>
        </div>

        {message && <div className="queue-success-message">{message}</div>}
        {error && <div className="queue-error">{error}</div>}
        {!data && !loadError && <div className="queue-message">Loading reassessments...</div>}
        {loadError && <div className="queue-error">{loadError}</div>}

        {data && patients.length === 0 && (
          <div className="queue-message">
            {view === 'all'
              ? 'No patients are currently waiting.'
              : view === 'snoozed'
                ? 'No alerts are snoozed.'
                : 'No reassessment alerts right now.'}
          </div>
        )}

        {data && patients.length > 0 && (
          <div className="queue-table-wrapper">
            <table className="queue-table">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Department</th>
                  <th>Visit Type</th>
                  <th>Priority</th>
                  <th>Last Assessment</th>
                  <th>Next Due</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {patients.map((patient) => (
                  <ReassessmentRow
                    key={patient.visit_id}
                    patient={patient}
                    action={action?.visitId === patient.visit_id ? action : null}
                    busy={busy}
                    reason={reason}
                    deferUntil={deferUntil}
                    onReason={setReason}
                    onDeferUntil={setDeferUntil}
                    onOpenAction={openAction}
                    onCancel={() => setAction(null)}
                    onSubmit={submitAction}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="queue-table-section reassessment-settings">
        <div className="queue-section-header">
          <div>
            <h2>Reassessment interval settings</h2>
            <p>
              Enter only values approved by qualified clinical staff. TRIORA
              does not provide default intervals.
            </p>
          </div>
        </div>

        {data && (
          <div className="queue-table-wrapper">
            <table className="queue-table">
              <thead>
                <tr>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Interval</th>
                  <th>Due-soon Warning</th>
                  <th>Grace Period</th>
                  <th>Approval Note</th>
                  <th>Last Changed</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {data.settings.map((setting) =>
                  editingPriority === setting.priority ? (
                    <tr key={setting.priority}>
                      <td>
                        <span className={`priority-badge ${setting.priority}`}>
                          {formatPriority(setting.priority)}
                        </span>
                      </td>
                      <td>
                        <label className="reassessment-checkbox">
                          <input
                            type="checkbox"
                            checked={draft.isEnabled}
                            onChange={(event) =>
                              setDraft({ ...draft, isEnabled: event.target.checked })
                            }
                          />
                          Enabled
                        </label>
                      </td>
                      {[
                        ['intervalMinutes', 1, 'Interval'],
                        ['dueSoonMinutes', 1, 'Due-soon warning'],
                        ['graceMinutes', 0, 'Grace period'],
                      ].map(([field, min, label]) => (
                        <td key={field}>
                          <input
                            type="number"
                            min={min}
                            step="1"
                            className="department-input reassessment-number"
                            value={draft[field]}
                            placeholder="Not set"
                            aria-label={`${label} in minutes for ${setting.priority}`}
                            onChange={(event) =>
                              setDraft({ ...draft, [field]: event.target.value })
                            }
                          />
                        </td>
                      ))}
                      <td>
                        <textarea
                          className="department-input reassessment-note"
                          rows={2}
                          maxLength={500}
                          value={draft.approvalNote}
                          placeholder="Approved by … (name, role, reference, date)"
                          aria-label={`Approval note for ${setting.priority}`}
                          onChange={(event) =>
                            setDraft({ ...draft, approvalNote: event.target.value })
                          }
                        />
                      </td>
                      <td>{formatDateTime(setting.updated_at)}</td>
                      <td>
                        <div className="department-actions">
                          <button
                            type="button"
                            className="queue-status-action start"
                            onClick={() => saveSetting(setting.priority)}
                            disabled={busy}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            className="department-secondary-action"
                            onClick={() => setEditingPriority(null)}
                            disabled={busy}
                          >
                            Cancel
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={setting.priority}>
                      <td>
                        <span className={`priority-badge ${setting.priority}`}>
                          {formatPriority(setting.priority)}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`department-status-badge ${
                            setting.is_enabled ? 'active' : 'inactive'
                          }`}
                        >
                          {setting.is_enabled ? 'Enabled' : 'Not configured'}
                        </span>
                      </td>
                      <td>{formatMinutes(setting.interval_minutes)}</td>
                      <td>{formatMinutes(setting.due_soon_minutes)}</td>
                      <td>{formatMinutes(setting.grace_minutes)}</td>
                      <td className="reassessment-note-cell">
                        {setting.approval_note || '—'}
                      </td>
                      <td>
                        {setting.updated_at
                          ? `${formatDateTime(setting.updated_at)} · ${
                              setting.updated_by_name || 'Staff member'
                            }`
                          : 'Never'}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="department-secondary-action"
                          onClick={() => startEditing(setting)}
                          disabled={busy || editingPriority !== null}
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function ReassessmentRow({
  patient,
  action,
  busy,
  reason,
  deferUntil,
  onReason,
  onDeferUntil,
  onOpenAction,
  onCancel,
  onSubmit,
}) {
  const active = isActive(patient);
  const now = new Date();
  const maxDefer = patient.interval_minutes
    ? new Date(now.getTime() + patient.interval_minutes * 60000)
    : now;

  return (
    <>
      <tr>
        <td>
          <div className="queue-patient-name">{patient.full_name}</div>
          <span className="queue-patient-number">{patient.patient_number}</span>
        </td>
        <td>{patient.department || '—'}</td>
        <td>{patient.visit_type === 'emergency' ? 'Emergency' : 'Normal'}</td>
        <td>
          <span className={`priority-badge ${patient.current_priority || 'unassigned'}`}>
            {formatPriority(patient.current_priority)}
          </span>
        </td>
        <td>{formatDateTime(patient.last_assessment_at)}</td>
        <td className="queue-waiting-time">
          {patient.due_at ? formatDateTime(patient.due_at) : '—'}
          {patient.last_not_required_at &&
            patient.last_not_required_at === patient.cycle_start_at && (
              <span className="queue-cell-note">Clock restarted by “Not required”</span>
            )}
        </td>
        <td>
          <span className={`reassessment-state ${patient.alert_state}`}>
            {STATE_LABELS[patient.alert_state]}
          </span>
          {patient.is_snoozed && (
            <span className="queue-cell-note">
              Snoozed until {formatDateTime(patient.defer_until)}
              {patient.deferred_by_name ? ` by ${patient.deferred_by_name}` : ''}
            </span>
          )}
        </td>
        <td>
          <div className="queue-action-buttons">
            <Link
              to={`/patients/${patient.patient_id}?visit=${patient.visit_id}&reassess=1`}
              className="queue-status-action start reassessment-link"
            >
              {active ? 'Reassess' : 'View patient'}
            </Link>

            {active && (
              <div className="department-actions">
                <button
                  type="button"
                  className="department-secondary-action"
                  onClick={() => onOpenAction(patient, 'not_required')}
                  disabled={busy}
                >
                  Not required
                </button>
                <button
                  type="button"
                  className="department-secondary-action"
                  onClick={() => onOpenAction(patient, 'defer')}
                  disabled={busy || patient.deferral_used}
                  title={
                    patient.deferral_used
                      ? 'Already deferred once in this reassessment cycle'
                      : undefined
                  }
                >
                  Remind later
                </button>
              </div>
            )}
          </div>
        </td>
      </tr>

      {action && (
        <tr className="reassessment-action-row">
          <td colSpan={8}>
            <div className="reassessment-action-form">
              <strong>
                {action.type === 'not_required'
                  ? `Record that reassessment is not currently required for ${patient.full_name}`
                  : `Remind me later about ${patient.full_name}`}
              </strong>
              <p>
                {action.type === 'not_required'
                  ? 'The patient stays in the queue. The reassessment clock restarts from now, so they will become due again after one interval.'
                  : `The alert is hidden until the chosen time (at most one interval, ${patient.interval_minutes} min, from now). Only one deferral is allowed per reassessment cycle.`}
              </p>

              {action.type === 'defer' && (
                <label>
                  Remind at
                  <input
                    type="datetime-local"
                    className="department-input"
                    value={deferUntil}
                    min={toLocalInputValue(now)}
                    max={toLocalInputValue(maxDefer)}
                    onChange={(event) => onDeferUntil(event.target.value)}
                    required
                  />
                </label>
              )}

              <label>
                Reason (optional)
                <textarea
                  className="department-input reassessment-note"
                  rows={2}
                  maxLength={500}
                  value={reason}
                  onChange={(event) => onReason(event.target.value)}
                />
              </label>

              <div className="department-actions">
                <button
                  type="button"
                  className="queue-status-action start"
                  onClick={() => onSubmit(patient)}
                  disabled={busy || (action.type === 'defer' && !deferUntil)}
                >
                  {action.type === 'not_required' ? 'Record decision' : 'Set reminder'}
                </button>
                <button
                  type="button"
                  className="department-secondary-action"
                  onClick={onCancel}
                  disabled={busy}
                >
                  Cancel
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default Reassessments;
