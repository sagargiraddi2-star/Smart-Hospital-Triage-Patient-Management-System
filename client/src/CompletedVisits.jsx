
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
    if (!priority) return 'Awaiting Triage';

    return priority.charAt(0).toUpperCase() + priority.slice(1);
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
                  <th>Priority</th>
                  <th>Arrival Time</th>
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

                    <td>{visit.chief_complaint || 'Not recorded'}</td>

                    <td>
                      <span
                        className={`visit-priority-badge ${
                          visit.triage_priority || 'none'
                        }`}
                      >
                        {formatPriority(visit.triage_priority)}
                      </span>
                    </td>

                    <td>{formatDate(visit.arrival_time)}</td>

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
