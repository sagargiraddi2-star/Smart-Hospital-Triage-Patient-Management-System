
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import './CompletedVisits.css';

function CompletedVisits() {
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchCompletedVisits() {
      try {
        const response = await fetch(
          'http://localhost:5000/api/queues/completed',
          { credentials: 'include' }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || 'Could not load visit history.');
        }

        setVisits(data.visits || []);
      } catch (err) {
        setError(err.message || 'Something went wrong.');
      } finally {
        setLoading(false);
      }
    }

    fetchCompletedVisits();
  }, []);

  function formatDate(date) {
    if (!date) return '—';

    return new Date(date).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function formatPriority(priority) {
    return priority.charAt(0).toUpperCase() + priority.slice(1);
  }

  // Priority recorded when consultation started. Visits completed before
  // this was tracked have no consultation start time.
  function getPriorityAtStart(visit) {
    if (visit.priority_at_consultation) {
      return formatPriority(visit.priority_at_consultation);
    }

    return visit.consultation_started_at ? 'Not triaged' : 'Not recorded';
  }

  function formatWaitingTime(totalMinutes) {
    if (totalMinutes === null || totalMinutes === undefined) {
      return 'Not recorded';
    }

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes} min`;
  }

  function formatRecordedDate(date) {
    return date ? formatDate(date) : 'Not recorded';
  }

  return (
    <div className="completed-visits-page">
      <div className="completed-visits-header">
        <div>
          <p className="completed-visits-eyebrow">PATIENT MANAGEMENT</p>
          <h1>Completed Visits</h1>
          <p className="completed-visits-description">
            View the history of patient visits that have been completed.
          </p>
        </div>

        <Link to="/dashboard" className="completed-visits-back">
          Back to Dashboard
        </Link>
      </div>

      <div className="completed-visits-summary">
        <div>
          <span className="completed-visits-summary-label">
            Total Completed Visits
          </span>
          <strong>{visits.length}</strong>
        </div>
      </div>

      <section className="completed-visits-section">
        <div className="completed-visits-section-header">
          <div>
            <h2>Visit History</h2>
            <p>Previously completed patient visits</p>
          </div>
        </div>

        {loading ? (
          <div className="completed-visits-message">
            Loading completed visits...
          </div>
        ) : error ? (
          <div className="completed-visits-message error">
            {error}
          </div>
        ) : visits.length === 0 ? (
          <div className="completed-visits-message">
            No completed visits found.
          </div>
        ) : (
          <div className="completed-visits-table-wrapper">
            <table className="completed-visits-table">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Patient ID</th>
                  <th>Department</th>
                  <th>Visit Type</th>
                  <th>Chief Complaint</th>
                  <th>Priority at Consultation</th>
                  <th>Waiting Time</th>
                  <th>Arrival Time</th>
                  <th>Consultation Start</th>
                  <th>Completed</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {visits.map((visit) => (
                  <tr key={visit.visit_id}>
                    <td className="completed-visits-patient-name">
                      {visit.full_name}
                    </td>

                    <td>{visit.patient_number}</td>

                    <td>{visit.department}</td>

                    <td>
                      <span className={`visit-type-badge ${visit.visit_type}`}>
                        {visit.visit_type === 'emergency'
                          ? 'Emergency'
                          : 'Normal'}
                      </span>
                    </td>

                    <td>
                      {visit.clinical_restricted
                        ? 'Restricted (clinical information)'
                        : visit.chief_complaint || 'Not recorded'}
                    </td>

                    <td>
                      <span
                        className={`visit-priority-badge ${
                          visit.priority_at_consultation || 'none'
                        }`}
                      >
                        {getPriorityAtStart(visit)}
                      </span>
                    </td>

                    <td className="completed-visits-waiting-time">
                      {formatWaitingTime(visit.waiting_time_minutes)}
                    </td>

                    <td>{formatDate(visit.arrival_time)}</td>

                    <td>{formatRecordedDate(visit.consultation_started_at)}</td>

                    <td>{formatRecordedDate(visit.completed_at)}</td>

                    <td>
                      <Link
                        to={`/patients/${visit.patient_id}`}
                        className="completed-visits-view-link"
                      >
                        View Patient
                      </Link>
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

export default CompletedVisits;
