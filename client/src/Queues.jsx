import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import './Queues.css';
import { useAuth } from './authContext.js';

const API_URL = 'http://localhost:5000/api/queues';
const DEPARTMENTS_URL = 'http://localhost:5000/api/departments';
const REASSESSMENTS_URL = 'http://localhost:5000/api/reassessments';

const REASSESSMENT_BADGES = {
  overdue: 'Reassessment overdue',
  due: 'Reassessment due',
  due_soon: 'Reassessment due soon',
};
const PRIORITIES = ['critical', 'high', 'medium', 'low'];

// How often the live waiting timer ticks and the queue reloads.
const CLOCK_INTERVAL_MS = 30 * 1000;
const REFRESH_INTERVAL_MS = 60 * 1000;

function formatMinutes(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes} min`;
}

// Waiting patients: live time since registration.
// In consultation: the waiting time frozen in the database when
// consultation started. Older visits without a recorded value show
// "Not recorded" instead of a guessed figure.
function getWaitingTime(patient, now) {
  if (patient.status === 'waiting') {
    const difference = Math.max(0, now - new Date(patient.arrival_time));

    return {
      value: formatMinutes(Math.floor(difference / 60000)),
      note: null,
    };
  }

  if (patient.waiting_time_minutes !== null && patient.waiting_time_minutes !== undefined) {
    return {
      value: formatMinutes(patient.waiting_time_minutes),
      note: 'Recorded at consultation start',
    };
  }

  return {
    value: 'Not recorded',
    note: 'Started before timing was tracked',
  };
}

function formatPriority(priority) {
  if (!priority) return 'Awaiting Triage';

  return priority.charAt(0).toUpperCase() + priority.slice(1);
}

// Identify a visit's department by its database ID. Visits that are not
// linked to a department fall back to their recorded name.
function getDepartmentKey(patient) {
  return patient.department_id
    ? `id:${patient.department_id}`
    : `name:${patient.department || ''}`;
}

// Waiting patients that share the same queue, department and priority.
// Manual reordering is only possible inside this group.
function getReorderGroup(queueList, patient) {
  return queueList.filter(
    (other) =>
      other.status === 'waiting' &&
      other.visit_type === patient.visit_type &&
      getDepartmentKey(other) === getDepartmentKey(patient) &&
      (other.triage_priority || null) === (patient.triage_priority || null)
  );
}

async function readJson(response, fallbackMessage) {
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await response.json()
    : {};

  if (!response.ok) {
    throw new Error(data.message || fallbackMessage);
  }

  return data;
}

// Load active visits and the configured active departments.
async function requestQueues() {
  const [queueResponse, departmentResponse, reassessmentResponse] = await Promise.all([
    fetch(API_URL, { credentials: 'include' }),
    fetch(`${DEPARTMENTS_URL}?status=active`, { credentials: 'include' }),
    fetch(`${REASSESSMENTS_URL}?view=all`, { credentials: 'include' }).catch(
      () => null
    ),
  ]);

  const queueData = await readJson(
    queueResponse,
    'Could not load patient queues.'
  );
  // The queue must still work if the department list cannot be loaded;
  // the filters then fall back to the departments of patients shown.
  let departmentList = [];

  try {
    const departmentData = await readJson(
      departmentResponse,
      'Could not load departments.'
    );
    departmentList = departmentData.departments || [];
  } catch (error) {
    console.error(error.message);
  }

  // Reassessment alerts are optional for the queue: if they cannot be
  // loaded the queue still works, just without alert badges.
  const reassessmentByVisit = {};

  try {
    if (reassessmentResponse) {
      const reassessmentData = await readJson(
        reassessmentResponse,
        'Could not load reassessment alerts.'
      );

      for (const row of reassessmentData.patients || []) {
        reassessmentByVisit[row.visit_id] = row;
      }
    }
  } catch (error) {
    console.error(error.message);
  }

  return {
    queueList: queueData.queues || [],
    departmentList,
    reassessmentByVisit,
  };
}

function getNeighbor(queueList, patient, direction) {
  const group = getReorderGroup(queueList, patient);
  const index = group.findIndex(
    (other) => other.visit_id === patient.visit_id
  );

  if (index === -1) return null;

  return group[direction === 'up' ? index - 1 : index + 1] || null;
}

function Queues() {
  const location = useLocation();
  const auth = useAuth();
  // Priority changes, reordering and consultation actions are clinical.
  const canManage = auth.can('queues.manage');

  const isEmergencyQueue =
    location.pathname === '/queues/emergency';

  const queueType = isEmergencyQueue ? 'emergency' : 'normal';

  const [queues, setQueues] = useState([]);
  const [configuredDepartments, setConfiguredDepartments] = useState([]);
  const [reassessmentByVisit, setReassessmentByVisit] = useState({});
  // 'All' or a department key from getDepartmentKey().
  const [selectedDepartment, setSelectedDepartment] = useState('All');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatingVisitId, setUpdatingVisitId] = useState(null);
  const [message, setMessage] = useState('');
  const [now, setNow] = useState(() => Date.now());

  // Fetch active patient queues. State is only set after the request
  // finishes, so periodic refreshes do not flash the loading message.
  const fetchQueues = useCallback(
    () =>
      requestQueues()
        .then(
          ({ queueList, departmentList, reassessmentByVisit: alerts }) => {
            setQueues(queueList);
            setConfiguredDepartments(departmentList);
            setReassessmentByVisit(alerts);
            setError('');
            setNow(Date.now());
          },
          (error) => setError(error.message)
        )
        .finally(() => setLoading(false)),
    []
  );

  useEffect(() => {
    fetchQueues();

    // Keep live waiting times current and pick up changes made by
    // other staff members.
    const clockTimer = setInterval(
      () => setNow(Date.now()),
      CLOCK_INTERVAL_MS
    );
    const refreshTimer = setInterval(fetchQueues, REFRESH_INTERVAL_MS);

    return () => {
      clearInterval(clockTimer);
      clearInterval(refreshTimer);
    };
  }, [fetchQueues]);

  // Send a queue update, then reload the queue from the database.
  // On failure the queue is also reloaded, so the screen never shows
  // a stale order after a conflict.
  async function sendQueueUpdate(visitId, path, body, successMessage) {
    try {
      setUpdatingVisitId(visitId);
      setMessage('');
      setError('');

      const response = await fetch(`${API_URL}/${visitId}/${path}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Could not update the queue.');
      }

      await fetchQueues();
      setMessage(successMessage);
    } catch (error) {
      await fetchQueues();
      setError(error.message);
    } finally {
      setUpdatingVisitId(null);
    }
  }

  // Update a patient's visit status.
  function updateVisitStatus(patient) {
    const nextStatus =
      patient.status === 'waiting'
        ? 'in_progress'
        : 'completed';

    if (
      nextStatus === 'in_progress' &&
      !patient.triage_priority &&
      !window.confirm(
        `${patient.full_name} has no triage assessment yet. ` +
          'Start the consultation anyway? Their priority will be ' +
          'recorded as "Not triaged".'
      )
    ) {
      return;
    }

    sendQueueUpdate(
      patient.visit_id,
      'status',
      { status: nextStatus },
      nextStatus === 'in_progress'
        ? 'Consultation started. Waiting time has been recorded.'
        : 'Visit marked as completed and moved to Visit History.'
    );
  }

  // Change a patient's staff-assigned priority.
  function updatePriority(patient, priority) {
    if (!priority || priority === patient.triage_priority) return;

    sendQueueUpdate(
      patient.visit_id,
      'priority',
      { priority },
      `${patient.full_name}'s priority changed to ${formatPriority(priority)}.`
    );
  }

  // Move a waiting patient one place within their priority group.
  function movePatient(patient, direction) {
    const neighbor = getNeighbor(typeQueues, patient, direction);

    if (!neighbor) return;

    sendQueueUpdate(
      patient.visit_id,
      'position',
      { direction, expectedNeighborVisitId: neighbor.visit_id },
      `${patient.full_name} moved ${direction}.`
    );
  }

  // Separate normal and emergency visits.
  const typeQueues = queues.filter(
    (patient) => patient.visit_type === queueType
  );

  // Filter options: every configured active department, plus any inactive
  // or unlinked department that still has patients in this queue.
  const departmentOptions = configuredDepartments.map((department) => ({
    key: `id:${department.id}`,
    label: department.name,
    inactive: false,
  }));

  for (const patient of typeQueues) {
    const key = getDepartmentKey(patient);

    if (!departmentOptions.some((option) => option.key === key)) {
      departmentOptions.push({
        key,
        label: patient.department || 'Unassigned',
        inactive: patient.department_is_active === false,
      });
    }
  }

  const departments = [
    { key: 'All', label: 'All Departments', inactive: false },
    ...departmentOptions,
  ];

  const selectedDepartmentLabel =
    departments.find((option) => option.key === selectedDepartment)?.label ||
    'Department';

  // Apply the selected department filter.
  const filteredQueues =
    selectedDepartment === 'All'
      ? typeQueues
      : typeQueues.filter(
          (patient) =>
            getDepartmentKey(patient) === selectedDepartment
        );

  const waitingCount = filteredQueues.filter(
    (patient) => patient.status === 'waiting'
  ).length;

  const inProgressCount = filteredQueues.filter(
    (patient) => patient.status === 'in_progress'
  ).length;

  const awaitingTriageCount = filteredQueues.filter(
    (patient) => !patient.triage_priority
  ).length;

  return (
    <div className="queues-page">

      {/* Back to dashboard */}
      <Link to="/dashboard" className="queue-back-button">
        ← Back to Dashboard
      </Link>

      {/* Page heading */}
      <header className="queues-header">
        <div>
          <p className="queues-eyebrow">
            HOSPITAL OPERATIONS
          </p>

          <h1>
            {isEmergencyQueue
              ? 'Emergency Queue'
              : 'Normal Queue'}
          </h1>

          <p className="queues-description">
            {isEmergencyQueue
              ? 'Monitor emergency patient visits and their triage priorities.'
              : 'Monitor normal patient visits across hospital departments.'}
          </p>
        </div>

        <Link to="/patients" className="queues-add-button">
          + Register Patient
        </Link>
      </header>

      {/* Queue statistics */}
      <section className="queue-stats">

        <div className="queue-stat-card">
          <span>Total Active Patients</span>
          <strong>{filteredQueues.length}</strong>
        </div>

        <div className="queue-stat-card">
          <span>Waiting</span>
          <strong>{waitingCount}</strong>
        </div>

        <div className="queue-stat-card">
          <span>In Progress</span>
          <strong>{inProgressCount}</strong>
        </div>

        <div className="queue-stat-card">
          <span>Awaiting Triage</span>
          <strong>{awaitingTriageCount}</strong>
        </div>

      </section>

      {/* Department filters */}
      <section className="queue-filter-section">
        <div className="queue-filter-heading">
          <h2>Filter by Department</h2>
          <p>
            Choose a department to view its patient queue. Select a
            department to reorder waiting patients — patients can only be
            moved within their own priority group.
          </p>
        </div>

        <div className="queue-department-filters">
          {departments.map((department) => (
            <button
              key={department.key}
              type="button"
              className={`queue-filter-button ${
                selectedDepartment === department.key
                  ? 'active'
                  : ''
              }`}
              onClick={() => setSelectedDepartment(department.key)}
            >
              {department.label}
              {department.inactive && ' (inactive)'}
            </button>
          ))}
        </div>
      </section>

      {/* Active patient list */}
      <section className="queue-table-section">

        <div className="queue-section-header">
          <div>
            <h2>
              {selectedDepartment === 'All'
                ? 'Active Patient List'
                : `${selectedDepartmentLabel} Queue`}
            </h2>

            <p>
              Patients currently waiting or receiving care
            </p>
          </div>

          <span className="queue-live-label">
            {filteredQueues.length} active
          </span>
        </div>

        {message && (
          <div className="queue-success-message">
            {message}
          </div>
        )}

        {loading && (
          <div className="queue-message">
            Loading patient queues...
          </div>
        )}

        {!loading && error && (
          <div className="queue-error">
            {error}
          </div>
        )}

        {!loading && !error && filteredQueues.length === 0 && (
          <div className="queue-message">
            No active patients in this queue.
          </div>
        )}

        {!loading && filteredQueues.length > 0 && (
          <div className="queue-table-wrapper">

            <table className="queue-table">

              <thead>
                <tr>
                  <th>Order</th>
                  <th>Patient</th>
                  <th>Department</th>
                  <th>Chief Complaint</th>
                  <th>Priority</th>
                  <th>Waiting Time</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {filteredQueues.map((patient) => {
                  const waitingTime = getWaitingTime(patient, now);
                  const isUpdating = updatingVisitId === patient.visit_id;
                  const canReorder =
                    patient.status === 'waiting' &&
                    selectedDepartment !== 'All';
                  const previousNeighbor = canReorder
                    ? getNeighbor(typeQueues, patient, 'up')
                    : null;
                  const nextNeighbor = canReorder
                    ? getNeighbor(typeQueues, patient, 'down')
                    : null;
                  const reorderHint =
                    patient.status !== 'waiting'
                      ? 'Only waiting patients can be reordered'
                      : selectedDepartment === 'All'
                        ? 'Select a department to reorder'
                        : null;

                  return (
                  <tr key={patient.visit_id}>

                    <td>
                      {canManage ? (
                      <div
                        className="queue-reorder-buttons"
                        title={reorderHint || undefined}
                      >
                        <button
                          type="button"
                          className="queue-reorder-button"
                          onClick={() => movePatient(patient, 'up')}
                          disabled={
                            !previousNeighbor || updatingVisitId !== null
                          }
                          aria-label={`Move ${patient.full_name} up`}
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          className="queue-reorder-button"
                          onClick={() => movePatient(patient, 'down')}
                          disabled={
                            !nextNeighbor || updatingVisitId !== null
                          }
                          aria-label={`Move ${patient.full_name} down`}
                        >
                          ▼
                        </button>
                      </div>
                      ) : (
                        <span className="queue-cell-note">—</span>
                      )}
                    </td>

                    <td>
                      <div className="queue-patient-name">
                        {patient.full_name}
                      </div>

                      <span className="queue-patient-number">
                        {patient.patient_number}
                      </span>
                    </td>

                    <td>
                      {patient.department || '—'}
                    </td>

                    <td>
                      {patient.clinical_restricted
                        ? <span className="queue-cell-note">Restricted (clinical information)</span>
                        : patient.chief_complaint || 'Not recorded'}
                    </td>

                    <td>
                      {patient.triage_priority && !canManage ? (
                        <span className={`priority-badge ${patient.triage_priority}`}>
                          {formatPriority(patient.triage_priority)}
                        </span>
                      ) : patient.triage_priority ? (
                        <select
                          className={`priority-badge priority-select ${patient.triage_priority}`}
                          value={patient.triage_priority}
                          onChange={(event) =>
                            updatePriority(patient, event.target.value)
                          }
                          disabled={updatingVisitId !== null}
                          aria-label={`Priority for ${patient.full_name}`}
                        >
                          {PRIORITIES.map((priority) => (
                            <option key={priority} value={priority}>
                              {formatPriority(priority)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <>
                          <span className="priority-badge unassigned">
                            {formatPriority(patient.triage_priority)}
                          </span>
                          {canManage && (
                            <span className="queue-cell-note">
                              Triage via View Patient
                            </span>
                          )}
                        </>
                      )}

                      {patient.status === 'in_progress' &&
                        patient.consultation_started_at && (
                          <span className="queue-cell-note">
                            At start:{' '}
                            {patient.priority_at_consultation
                              ? formatPriority(patient.priority_at_consultation)
                              : 'Not triaged'}
                          </span>
                        )}
                    </td>

                    <td className="queue-waiting-time">
                      {waitingTime.value}
                      {waitingTime.note && (
                        <span className="queue-cell-note">
                          {waitingTime.note}
                        </span>
                      )}
                    </td>

                    <td>
                      <span
                        className={`queue-status-badge ${patient.status}`}
                      >
                        {patient.status === 'in_progress'
                          ? 'In Progress'
                          : 'Waiting'}
                      </span>

                      {patient.status === 'waiting' &&
                        REASSESSMENT_BADGES[reassessmentByVisit[patient.visit_id]?.alert_state] && (
                          <Link
                            to={`/patients/${patient.patient_id}?visit=${patient.visit_id}&reassess=1`}
                            className={`queue-reassessment-badge ${
                              reassessmentByVisit[patient.visit_id].alert_state
                            }`}
                          >
                            {REASSESSMENT_BADGES[reassessmentByVisit[patient.visit_id].alert_state]}
                            {reassessmentByVisit[patient.visit_id].is_snoozed && ' (snoozed)'}
                          </Link>
                        )}
                    </td>

                    <td>
                      <div className="queue-action-buttons">

                        {canManage && patient.status === 'waiting' && (
                          <button
                            type="button"
                            className="queue-status-action start"
                            onClick={() => updateVisitStatus(patient)}
                            disabled={updatingVisitId !== null}
                          >
                            {isUpdating
                              ? 'Updating...'
                              : 'Start Consultation'}
                          </button>
                        )}

                        {canManage && patient.status === 'in_progress' && (
                          <button
                            type="button"
                            className="queue-status-action complete"
                            onClick={() => updateVisitStatus(patient)}
                            disabled={updatingVisitId !== null}
                          >
                            {isUpdating
                              ? 'Updating...'
                              : 'Complete Visit'}
                          </button>
                        )}

                        <Link
                          to={`/patients/${patient.patient_id}`}
                          className="queue-view-link"
                        >
                          View Patient
                        </Link>

                      </div>
                    </td>

                  </tr>
                  );
                })}
              </tbody>

            </table>
          </div>
        )}

      </section>
    </div>
  );
}

export default Queues;