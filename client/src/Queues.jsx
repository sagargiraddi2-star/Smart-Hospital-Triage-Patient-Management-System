import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import './Queues.css';

function formatWaitingTime(arrivalTime) {
  const arrival = new Date(arrivalTime);
  const now = new Date();

  const difference = Math.max(0, now - arrival);
  const totalMinutes = Math.floor(difference / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes} min`;
}

function formatPriority(priority) {
  if (!priority) return 'Awaiting Triage';

  return priority.charAt(0).toUpperCase() + priority.slice(1);
}

function Queues() {
  const location = useLocation();

  const isEmergencyQueue =
    location.pathname === '/queues/emergency';

  const queueType = isEmergencyQueue ? 'emergency' : 'normal';

  const [queues, setQueues] = useState([]);
  const [selectedDepartment, setSelectedDepartment] = useState('All');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatingVisitId, setUpdatingVisitId] = useState(null);
  const [message, setMessage] = useState('');

  // Fetch active patient queues.
  async function fetchQueues() {
    try {
      setLoading(true);
      setError('');

      const response = await fetch(
        'http://localhost:5000/api/queues',
        {
          credentials: 'include',
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || 'Could not load patient queues.'
        );
      }

      setQueues(data.queues || []);
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchQueues();
  }, []);

  // Update a patient's visit status.
  async function updateVisitStatus(patient) {
    const nextStatus =
      patient.status === 'waiting'
        ? 'in_progress'
        : 'completed';

    const actionMessage =
      nextStatus === 'in_progress'
        ? 'Consultation started successfully.'
        : 'Visit marked as completed successfully.';

    try {
      setUpdatingVisitId(patient.visit_id);
      setMessage('');
      setError('');

      const response = await fetch(
        `http://localhost:5000/api/queues/${patient.visit_id}/status`,
        {
          method: 'PATCH',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            status: nextStatus,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || 'Could not update patient status.'
        );
      }

      setMessage(actionMessage);

      // Refresh the queue using the latest database data.
      await fetchQueues();

    } catch (error) {
      setError(error.message);
    } finally {
      setUpdatingVisitId(null);
    }
  }

  // Separate normal and emergency visits.
  const typeQueues = queues.filter(
    (patient) => patient.visit_type === queueType
  );

  // Get the departments available in this queue.
  const departments = [
    'All',
    ...new Set(
      typeQueues
        .map((patient) => patient.department)
        .filter(Boolean)
    ),
  ];

  // Apply the selected department filter.
  const filteredQueues =
    selectedDepartment === 'All'
      ? typeQueues
      : typeQueues.filter(
          (patient) =>
            patient.department === selectedDepartment
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
            Choose a department to view its patient queue.
          </p>
        </div>

        <div className="queue-department-filters">
          {departments.map((department) => (
            <button
              key={department}
              type="button"
              className={`queue-filter-button ${
                selectedDepartment === department
                  ? 'active'
                  : ''
              }`}
              onClick={() => setSelectedDepartment(department)}
            >
              {department === 'All'
                ? 'All Departments'
                : department}
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
                : `${selectedDepartment} Queue`}
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
                {filteredQueues.map((patient) => (
                  <tr key={patient.visit_id}>

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
                      {patient.chief_complaint || 'Not recorded'}
                    </td>

                    <td>
                      <span
                        className={`priority-badge ${
                          patient.triage_priority || 'unassigned'
                        }`}
                      >
                        {formatPriority(patient.triage_priority)}
                      </span>
                    </td>

                    <td className="queue-waiting-time">
                      {formatWaitingTime(patient.arrival_time)}
                    </td>

                    <td>
                      <span
                        className={`queue-status-badge ${patient.status}`}
                      >
                        {patient.status === 'in_progress'
                          ? 'In Progress'
                          : 'Waiting'}
                      </span>
                    </td>

                    <td>
                      <div className="queue-action-buttons">

                        {patient.status === 'waiting' && (
                          <button
                            type="button"
                            className="queue-status-action start"
                            onClick={() => updateVisitStatus(patient)}
                            disabled={updatingVisitId === patient.visit_id}
                          >
                            {updatingVisitId === patient.visit_id
                              ? 'Updating...'
                              : 'Start Consultation'}
                          </button>
                        )}

                        {patient.status === 'in_progress' && (
                          <button
                            type="button"
                            className="queue-status-action complete"
                            onClick={() => updateVisitStatus(patient)}
                            disabled={updatingVisitId === patient.visit_id}
                          >
                            {updatingVisitId === patient.visit_id
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
                ))}
              </tbody>

            </table>
          </div>
        )}

      </section>
    </div>
  );
}

export default Queues;