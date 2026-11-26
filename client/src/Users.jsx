import { useCallback, useEffect, useState } from 'react';
import { ROLE_LABELS, useAuth } from './authContext.js';
import BackToDashboard from './BackToDashboard.jsx';
import './Queues.css';
import './Departments.css';

// Administrator user management (Phase 7). Every change is enforced and
// audit-logged by the backend (/api/users).

const API_URL = 'http://localhost:5000/api/users';
const ROLES = ['doctor', 'nurse', 'management', 'admin'];

const STATUS_LABELS = {
  pending: 'Pending approval',
  active: 'Active',
  disabled: 'Disabled',
};

const ACTION_LABELS = {
  registered: 'Registered (pending approval)',
  approved: 'Approved',
  role_changed: 'Role changed',
  enabled: 'Enabled',
  disabled: 'Disabled',
  bootstrap_created_admin: 'Administrator created (setup script)',
  bootstrap_promoted_admin: 'Promoted to administrator (setup script)',
};

function formatDateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

async function readJson(response, fallbackMessage) {
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : {};

  if (!response.ok) {
    throw new Error(data.message || `${fallbackMessage} (HTTP ${response.status})`);
  }

  return data;
}

async function requestUsers() {
  const [usersResponse, auditResponse] = await Promise.all([
    fetch(API_URL, { credentials: 'include' }),
    fetch(`${API_URL}/audit`, { credentials: 'include' }),
  ]);

  const usersData = await readJson(usersResponse, 'Could not load users.');
  const auditData = await readJson(auditResponse, 'Could not load the audit log.');

  return { users: usersData.users || [], changes: auditData.changes || [] };
}

function Users() {
  const { user: currentUser } = useAuth();

  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [roleDrafts, setRoleDrafts] = useState({});

  const loadData = useCallback(
    () =>
      requestUsers().then(
        (result) => {
          setData(result);
          setLoadError('');
        },
        (requestError) => setLoadError(requestError.message)
      ),
    []
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function updateUser(target, changes, confirmText) {
    if (confirmText && !window.confirm(confirmText)) return;

    try {
      setBusyId(target.id);
      setMessage('');
      setError('');

      const response = await fetch(`${API_URL}/${target.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changes),
      });

      await readJson(response, 'Could not update the account.');
      setMessage(`Account for ${target.full_name} updated.`);
      setRoleDrafts((previous) => ({ ...previous, [target.id]: undefined }));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      await loadData();
      setBusyId(null);
    }
  }

  const users = data?.users || [];
  const pendingCount = users.filter((user) => user.status === 'pending').length;

  return (
    <div className="queues-page">
      <div className="triora-back-row">
        <BackToDashboard />
      </div>

      <header className="queues-header">
        <div>
          <p className="queues-eyebrow">SYSTEM ADMINISTRATION</p>
          <h1>User management</h1>
          <p className="queues-description">
            Approve new registrations, change roles and enable or disable
            accounts. Every change is recorded in the audit log below. You
            cannot change your own account, and the last active administrator
            cannot be disabled or demoted.
          </p>
        </div>
      </header>

      <section className="queue-stats">
        <div className="queue-stat-card">
          <span>Pending approval</span>
          <strong>{data ? pendingCount : '—'}</strong>
        </div>
        <div className="queue-stat-card">
          <span>Active accounts</span>
          <strong>{data ? users.filter((user) => user.is_active).length : '—'}</strong>
        </div>
        <div className="queue-stat-card">
          <span>Disabled accounts</span>
          <strong>{data ? users.filter((user) => user.status === 'disabled').length : '—'}</strong>
        </div>
        <div className="queue-stat-card">
          <span>Administrators</span>
          <strong>
            {data ? users.filter((user) => user.role === 'admin' && user.is_active).length : '—'}
          </strong>
        </div>
      </section>

      <section className="queue-table-section">
        <div className="queue-section-header">
          <div>
            <h2>Staff accounts</h2>
            <p>Pending registrations are listed first</p>
          </div>
        </div>

        {message && <div className="queue-success-message">{message}</div>}
        {error && <div className="queue-error">{error}</div>}
        {!data && !loadError && <div className="queue-message">Loading accounts...</div>}
        {loadError && <div className="queue-error">{loadError}</div>}

        {data && (
          <div className="queue-table-wrapper">
            <table className="queue-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Registered</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {users.map((user) => {
                  const isSelf = user.id === currentUser?.id;
                  const busy = busyId === user.id;
                  const draftRole = roleDrafts[user.id] ?? user.role;

                  return (
                    <tr key={user.id} className={user.is_active ? '' : 'department-row-inactive'}>
                      <td>
                        <span className="queue-patient-name">{user.full_name}</span>
                        {isSelf && <span className="queue-cell-note">This is you</span>}
                      </td>
                      <td>{user.email}</td>
                      <td>
                        {isSelf ? (
                          ROLE_LABELS[user.role] || user.role
                        ) : (
                          <select
                            className="department-input"
                            value={draftRole}
                            aria-label={`Role for ${user.full_name}`}
                            onChange={(event) =>
                              setRoleDrafts((previous) => ({
                                ...previous,
                                [user.id]: event.target.value,
                              }))
                            }
                            disabled={busy}
                          >
                            {ROLES.map((role) => (
                              <option key={role} value={role}>
                                {ROLE_LABELS[role]}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td>
                        <span
                          className={`department-status-badge ${
                            user.status === 'active' ? 'active' : 'inactive'
                          }`}
                        >
                          {STATUS_LABELS[user.status]}
                        </span>
                      </td>
                      <td>{formatDateTime(user.created_at)}</td>
                      <td>
                        {isSelf ? (
                          <span className="queue-cell-note">
                            Another administrator must change your account
                          </span>
                        ) : (
                          <div className="department-actions">
                            {draftRole !== user.role && (
                              <button
                                type="button"
                                className="queue-status-action start"
                                onClick={() =>
                                  updateUser(
                                    user,
                                    { role: draftRole },
                                    `Change ${user.full_name}'s role from ${ROLE_LABELS[user.role]} to ${ROLE_LABELS[draftRole]}?`
                                  )
                                }
                                disabled={busy}
                              >
                                Save role
                              </button>
                            )}

                            {user.status === 'pending' && (
                              <button
                                type="button"
                                className="queue-status-action complete"
                                onClick={() =>
                                  updateUser(
                                    user,
                                    { isActive: true, role: draftRole },
                                    `Approve ${user.full_name} as ${ROLE_LABELS[draftRole]}?`
                                  )
                                }
                                disabled={busy}
                              >
                                Approve
                              </button>
                            )}

                            {user.status === 'disabled' && (
                              <button
                                type="button"
                                className="queue-status-action complete"
                                onClick={() => updateUser(user, { isActive: true })}
                                disabled={busy}
                              >
                                Enable
                              </button>
                            )}

                            {user.status === 'active' && (
                              <button
                                type="button"
                                className="queue-status-action deactivate"
                                onClick={() =>
                                  updateUser(
                                    user,
                                    { isActive: false },
                                    `Disable ${user.full_name}'s account? They will be signed out immediately and cannot sign in until re-enabled.`
                                  )
                                }
                                disabled={busy}
                              >
                                Disable
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="queue-table-section reassessment-settings">
        <div className="queue-section-header">
          <div>
            <h2>Account audit log</h2>
            <p>The 100 most recent account changes</p>
          </div>
        </div>

        {data && data.changes.length === 0 && (
          <div className="queue-message">No account changes have been recorded yet.</div>
        )}

        {data && data.changes.length > 0 && (
          <div className="queue-table-wrapper">
            <table className="queue-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Account</th>
                  <th>Change</th>
                  <th>Details</th>
                  <th>Changed by</th>
                </tr>
              </thead>
              <tbody>
                {data.changes.map((change) => (
                  <tr key={change.id}>
                    <td>{formatDateTime(change.created_at)}</td>
                    <td>{change.user_name || '—'}</td>
                    <td>
                      {change.action === 'registered' && change.new_active
                        ? 'Registered (active)'
                        : ACTION_LABELS[change.action] || change.action}
                    </td>
                    <td>
                      {change.action === 'role_changed'
                        ? `${ROLE_LABELS[change.old_role] || change.old_role} → ${ROLE_LABELS[change.new_role] || change.new_role}`
                        : change.new_role
                          ? ROLE_LABELS[change.new_role] || change.new_role
                          : '—'}
                    </td>
                    <td>{change.changed_by_name || 'System / setup script'}</td>
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

export default Users;
