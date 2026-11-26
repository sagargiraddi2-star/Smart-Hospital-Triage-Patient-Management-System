import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Queues.css';
import './Departments.css';
import { useAuth } from './authContext.js';
import BackToDashboard from './BackToDashboard.jsx';

const API_URL = 'http://localhost:5000/api/departments';

class UnauthorizedError extends Error {}

// Read a JSON API response, turning failures into readable errors.
async function readJson(response, fallbackMessage) {
  if (response.status === 401) {
    throw new UnauthorizedError('Please log in again.');
  }

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await response.json()
    : {};

  if (!response.ok) {
    throw new Error(
      data.message || `${fallbackMessage} (HTTP ${response.status})`
    );
  }

  return data;
}

async function requestDepartments() {
  const response = await fetch(`${API_URL}?status=all`, {
    credentials: 'include',
  });

  const data = await readJson(response, 'Could not load departments.');

  return data.departments || [];
}

function Departments() {
  const navigate = useNavigate();
  const auth = useAuth();
  // Adding, renaming and (de)activating departments: management and admin.
  const canManage = auth.can('departments.manage');

  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [busy, setBusy] = useState(false);

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

  const loadDepartments = useCallback(
    () =>
      requestDepartments()
        .then(
          (list) => {
            setDepartments(list);
            setLoadError('');
          },
          (requestError) => {
            if (!handleUnauthorized(requestError)) {
              setLoadError(requestError.message);
            }
          }
        )
        .finally(() => setLoading(false)),
    [handleUnauthorized]
  );

  useEffect(() => {
    loadDepartments();
  }, [loadDepartments]);

  // Send a create/update request, then reload the list from the database.
  async function saveDepartment(url, method, body) {
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

      const data = await readJson(response, 'Could not save the department.');

      setMessage(data.message);
      await loadDepartments();
      return true;
    } catch (requestError) {
      if (!handleUnauthorized(requestError)) {
        setError(requestError.message);
      }

      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate(event) {
    event.preventDefault();

    if (await saveDepartment(API_URL, 'POST', { name: newName })) {
      setNewName('');
    }
  }

  function startEditing(department) {
    setEditingId(department.id);
    setEditName(department.name);
    setMessage('');
    setError('');
  }

  async function handleRename(department) {
    if (editName.trim() === department.name) {
      setEditingId(null);
      return;
    }

    if (
      await saveDepartment(`${API_URL}/${department.id}`, 'PATCH', {
        name: editName,
      })
    ) {
      setEditingId(null);
    }
  }

  function toggleActive(department) {
    if (
      department.is_active &&
      !window.confirm(
        department.total_active > 0
          ? `Deactivate ${department.name}? It has ${department.total_active} active ` +
              `patient(s). They stay in the queues, but no new visits can be ` +
              'registered to this department.'
          : `Deactivate ${department.name}? No new visits can be registered to ` +
              'it. Its visit history is kept and it can be reactivated later.'
      )
    ) {
      return;
    }

    saveDepartment(`${API_URL}/${department.id}`, 'PATCH', {
      isActive: !department.is_active,
    });
  }

  const activeDepartments = departments.filter((d) => d.is_active);
  const totalWaiting = departments.reduce((sum, d) => sum + d.waiting, 0);
  const totalInConsultation = departments.reduce(
    (sum, d) => sum + d.in_consultation,
    0
  );

  return (
    <div className="queues-page">
      <div className="triora-back-row">
        <BackToDashboard />
      </div>

      <header className="queues-header">
        <div>
          <p className="queues-eyebrow">HOSPITAL OPERATIONS</p>
          <h1>Departments</h1>
          <p className="queues-description">
            Manage the hospital's departments and monitor their current
            workload. Departments are never deleted, so visit history is
            always kept.
          </p>
        </div>
      </header>

      <section className="queue-stats">
        <div className="queue-stat-card">
          <span>Active Departments</span>
          <strong>{loading ? '—' : activeDepartments.length}</strong>
        </div>

        <div className="queue-stat-card">
          <span>Inactive Departments</span>
          <strong>
            {loading ? '—' : departments.length - activeDepartments.length}
          </strong>
        </div>

        <div className="queue-stat-card">
          <span>Patients Waiting</span>
          <strong>{loading ? '—' : totalWaiting}</strong>
        </div>

        <div className="queue-stat-card">
          <span>In Consultation</span>
          <strong>{loading ? '—' : totalInConsultation}</strong>
        </div>
      </section>

      {canManage && (
      <section className="queue-filter-section">
        <div className="queue-filter-heading">
          <h2>Add a department</h2>
          <p>New departments are active immediately and appear in patient registration.</p>
        </div>

        <form className="department-add-form" onSubmit={handleCreate}>
          <label htmlFor="newDepartmentName" className="department-visually-hidden">
            Department name
          </label>
          <input
            id="newDepartmentName"
            type="text"
            className="department-input"
            placeholder="e.g. Dermatology"
            value={newName}
            minLength={2}
            maxLength={100}
            onChange={(event) => setNewName(event.target.value)}
            required
          />
          <button type="submit" className="queues-add-button" disabled={busy}>
            + Add department
          </button>
        </form>
      </section>
      )}

      <section className="queue-table-section">
        <div className="queue-section-header">
          <div>
            <h2>All departments</h2>
            <p>Workload counts patients who are waiting or in consultation</p>
          </div>

          <span className="queue-live-label">
            {departments.length} total
          </span>
        </div>

        {message && <div className="queue-success-message">{message}</div>}
        {error && <div className="queue-error">{error}</div>}

        {loading && <div className="queue-message">Loading departments...</div>}

        {!loading && loadError && <div className="queue-error">{loadError}</div>}

        {!loading && !loadError && departments.length === 0 && (
          <div className="queue-message">
            No departments are configured yet. Add the first one above.
          </div>
        )}

        {!loading && departments.length > 0 && (
          <div className="queue-table-wrapper">
            <table className="queue-table">
              <thead>
                <tr>
                  <th>Department</th>
                  <th>Status</th>
                  <th>Waiting</th>
                  <th>In Consultation</th>
                  <th>Total Active</th>
                  <th>All-time Visits</th>
                  {canManage && <th>Actions</th>}
                </tr>
              </thead>

              <tbody>
                {departments.map((department) => (
                  <tr
                    key={department.id}
                    className={department.is_active ? '' : 'department-row-inactive'}
                  >
                    <td>
                      {editingId === department.id ? (
                        <input
                          type="text"
                          className="department-input"
                          value={editName}
                          minLength={2}
                          maxLength={100}
                          aria-label={`New name for ${department.name}`}
                          onChange={(event) => setEditName(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') handleRename(department);
                            if (event.key === 'Escape') setEditingId(null);
                          }}
                          autoFocus
                        />
                      ) : (
                        <span className="queue-patient-name">
                          {department.name}
                        </span>
                      )}
                    </td>

                    <td>
                      <span
                        className={`department-status-badge ${
                          department.is_active ? 'active' : 'inactive'
                        }`}
                      >
                        {department.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>

                    <td>{department.waiting}</td>
                    <td>{department.in_consultation}</td>
                    <td className="queue-waiting-time">{department.total_active}</td>
                    <td>{department.total_visits}</td>

                    {canManage && (
                    <td>
                      <div className="department-actions">
                        {editingId === department.id ? (
                          <>
                            <button
                              type="button"
                              className="queue-status-action start"
                              onClick={() => handleRename(department)}
                              disabled={busy}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              className="department-secondary-action"
                              onClick={() => setEditingId(null)}
                              disabled={busy}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="department-secondary-action"
                              onClick={() => startEditing(department)}
                              disabled={busy}
                            >
                              Rename
                            </button>
                            <button
                              type="button"
                              className={`queue-status-action ${
                                department.is_active ? 'deactivate' : 'complete'
                              }`}
                              onClick={() => toggleActive(department)}
                              disabled={busy}
                            >
                              {department.is_active ? 'Deactivate' : 'Activate'}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                    )}
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

export default Departments;
