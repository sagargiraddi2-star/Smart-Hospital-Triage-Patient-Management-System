
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './Dashboard.css';
import { ROLE_LABELS, useAuth } from './authContext.js';

const SUMMARY_REFRESH_MS = 60 * 1000;

const STATUS_LABELS = {
  waiting: 'Waiting',
  in_progress: 'In consultation',
  completed: 'Completed',
};

const REASSESSMENT_LABELS = {
  overdue: 'Overdue',
  due: 'Reassessment due',
  due_soon: 'Due soon',
};

const ACTIVITY_LABELS = {
  registered: 'Registered',
  consultation_started: 'Consultation started',
  completed: 'Completed',
};

function formatPriority(priority) {
  if (!priority) return 'Awaiting triage';

  return priority.charAt(0).toUpperCase() + priority.slice(1);
}

// Show only the time for today's events, otherwise date and time.
function formatActivityTime(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return '—';

  const isToday = date.toDateString() === new Date().toDateString();

  return date.toLocaleString(
    'en-IN',
    isToday
      ? { hour: '2-digit', minute: '2-digit' }
      : { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }
  );
}

function getInitials(name) {
  return (name || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

// Never show placeholder numbers: no data yet means "—".
function formatCount(value) {
  return typeof value === 'number' ? String(value).padStart(2, '0') : '—';
}

// Read a JSON API response safely. If the server returned HTML or
// anything else, explain the problem instead of throwing a parse error.
async function readDashboardResponse(response) {
  const contentType = response.headers.get('content-type') || '';

  if (!contentType.includes('application/json')) {
    throw new Error(
      response.status === 404
        ? 'The dashboard API was not found on the backend (HTTP 404). ' +
            'Restart the TRIORA backend so it loads the latest routes.'
        : `The backend returned an unexpected response (HTTP ${response.status}).`
    );
  }

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.message || `Could not load dashboard information (HTTP ${response.status}).`
    );
  }

  return data;
}

function getBrowserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function Dashboard() {
  const navigate = useNavigate();

  // Signed-in user from the shared auth state (RequireAuth guarantees one).
  const auth = useAuth();
  const user = auth.user;

  const [summary, setSummary] = useState(null);
  const [summaryError, setSummaryError] = useState('');

  // Load real dashboard data once the user is confirmed, then refresh
  // it every minute while the dashboard is open.
  useEffect(() => {
    if (!user) return undefined;

    let cancelled = false;

    async function loadSummary() {
      try {
        const timezone = encodeURIComponent(getBrowserTimezone());
        const response = await fetch(
          `/api/dashboard/summary?timezone=${timezone}`,
          { credentials: 'include' }
        );

        if (response.status === 401) {
          navigate('/login', { replace: true });
          return;
        }

        const data = await readDashboardResponse(response);

        if (!cancelled) {
          setSummary(data);
          setSummaryError('');
        }
      } catch (error) {
        if (!cancelled) {
          setSummaryError(
            error instanceof TypeError
              ? 'Could not connect to the TRIORA backend.'
              : error.message
          );
        }
      }
    }

    loadSummary();
    const refreshTimer = setInterval(loadSummary, SUMMARY_REFRESH_MS);

    return () => {
      cancelled = true;
      clearInterval(refreshTimer);
    };
  }, [user, navigate]);

  async function handleLogout() {
    try {
      const response = await fetch(
        '/api/auth/logout',
        {
          method: 'POST',
          credentials: 'include',
        }
      );

      if (!response.ok) {
        throw new Error('Could not sign out. Please try again.');
      }

      auth.signOut();
      navigate('/login', { replace: true });
    } catch (error) {
      console.error('Logout failed:', error);
      alert(error.message || 'Something went wrong while signing out.');
    }
  }

  if (!user) {
    return null;
  }

  // /api/auth/me returns full_name.
  const fullName =
    user.full_name ||
    user.fullName ||
    user.name ||
    user.email?.split('@')[0] ||
    'Staff member';

  const firstName = fullName.split(' ')[0];

  const initials = fullName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');

  const role = ROLE_LABELS[user.role] || user.role || 'Staff';

  const stats = summary?.stats;
  // Before the first successful load: "Loading…" or, after a failure,
  // "Unavailable" — never an endless loading state.
  const pendingNote = summaryError ? 'Unavailable' : 'Loading…';
  const recentActivity = summary?.recentActivity || [];
  const departmentWorkload = summary?.departmentWorkload || [];
  const reassessment = summary?.reassessment;
  const busiestDepartmentTotal = Math.max(
    1,
    ...departmentWorkload.map((department) => department.total)
  );
  const lastUpdated = summary
    ? new Date(summary.generatedAt).toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <div className="dashboard-page">

      {/* SIDEBAR */}

      <aside className="dashboard-sidebar">

        <div className="dashboard-brand">
          <span className="dashboard-brand-mark">
            <span />
            <span />
            <span />
          </span>

          <span className="dashboard-brand-copy">
            <strong>TRIORA</strong>
            <small>HOSPITAL OPERATIONS</small>
          </span>
        </div>

        <span className="sidebar-label">WORKSPACE</span>

        <nav className="sidebar-navigation">

          <Link to="/dashboard" className="sidebar-link active">
            <span className="sidebar-icon" aria-hidden="true">▦</span>
            <span>Overview</span>
          </Link>

          {auth.can('patients.view') && (
            <Link to="/patients" className="sidebar-link">
              <span className="sidebar-icon" aria-hidden="true">♙</span>
              <span>Patients</span>
            </Link>
          )}

          {auth.can('queues.view') && (
            <Link to="/queues" className="sidebar-link">
              <span className="sidebar-icon" aria-hidden="true">☷</span>
              <span>Normal queue</span>
            </Link>
          )}

          {auth.can('queues.view') && (
            <Link to="/queues/emergency" className="sidebar-link">
              <span className="sidebar-icon" aria-hidden="true">✚</span>
              <span>Emergency queue</span>
            </Link>
          )}

          {auth.can('queues.view') && (
            <Link to="/visit-history" className="sidebar-link">
              <span className="sidebar-icon" aria-hidden="true">◷</span>
              <span>Visit history</span>
            </Link>
          )}

          {auth.can('departments.view') && (
            <Link to="/departments" className="sidebar-link">
              <span className="sidebar-icon" aria-hidden="true">▤</span>
              <span>Departments</span>
            </Link>
          )}

          {auth.can('reassessments.view') && (
            <Link to="/reassessments" className="sidebar-link">
              <span className="sidebar-icon" aria-hidden="true">♧</span>
              <span>Reassessment alerts</span>
            </Link>
          )}

          {auth.can('users.manage') && (
            <Link to="/users" className="sidebar-link">
              <span className="sidebar-icon" aria-hidden="true">⚙</span>
              <span>User management</span>
            </Link>
          )}

        </nav>

        <div className="sidebar-bottom">

          <div className="sidebar-help">
            <strong>TRIORA Workspace</strong>
            <p>
              A connected workspace designed to support hospital teams
              and improve patient flow.
            </p>
          </div>

          <button
            className="dashboard-logout"
            onClick={handleLogout}
          >
            <span aria-hidden="true">↪</span>
            Sign out
          </button>

        </div>

      </aside>

      {/* MAIN CONTENT */}

      <main className="dashboard-main">

        {/* TOP BAR */}

        <header className="dashboard-topbar">

          <div className="dashboard-topbar-title">
            Hospital workspace
            <strong>Operations overview</strong>
          </div>

          <div className="dashboard-user">

            <div className="dashboard-avatar">
              {initials || 'S'}
            </div>

            <div className="dashboard-user-info">
              <strong>{fullName}</strong>
              <small>{role}</small>
            </div>

          </div>

        </header>

        {/* DASHBOARD CONTENT */}

        <div className="dashboard-content-area" id="overview">

          {/* WELCOME */}

          <section className="dashboard-welcome">

            <div>
              <span className="dashboard-eyebrow">
                HOSPITAL OVERVIEW
              </span>

              <h1>Welcome back, {firstName}.</h1>

              <p>
                Here's an overview of your hospital operations.
                Let's keep patient care moving smoothly.
              </p>
            </div>

            <div className="dashboard-date">
              {lastUpdated
                ? `Live data · Updated ${lastUpdated}`
                : 'TRIORA Staff Workspace'}
            </div>

          </section>

          {summaryError && (
            <p className="dashboard-error" role="alert">
              {summaryError}
              {summary &&
                ` Showing the figures from ${lastUpdated}; the dashboard will retry automatically.`}
            </p>
          )}

          {/* STATISTICS */}

          <section className="dashboard-stats">

            <article className="dashboard-stat-card">
              <div className="dashboard-stat-top">
                <span className="dashboard-stat-label">
                  Patients registered today
                </span>
                <span className="dashboard-stat-icon stat-icon-blue">
                  ♙
                </span>
              </div>

              <strong className="dashboard-stat-value">
                {formatCount(stats?.patientsToday)}
              </strong>

              <span className="dashboard-stat-note">
                {stats
                  ? `${stats.visitsToday} ${stats.visitsToday === 1 ? 'visit' : 'visits'} since midnight`
                  : pendingNote}
              </span>
            </article>

            <article className="dashboard-stat-card">
              <div className="dashboard-stat-top">
                <span className="dashboard-stat-label">
                  Waiting patients
                </span>
                <span className="dashboard-stat-icon stat-icon-teal">
                  ◷
                </span>
              </div>

              <strong className="dashboard-stat-value">
                {formatCount(stats?.waitingPatients)}
              </strong>

              <span className="dashboard-stat-note">
                {stats
                  ? `${stats.inConsultationPatients} in consultation`
                  : pendingNote}
              </span>
            </article>

            <article className="dashboard-stat-card">
              <div className="dashboard-stat-top">
                <span className="dashboard-stat-label">
                  Emergency cases
                </span>
                <span className="dashboard-stat-icon stat-icon-orange">
                  ✚
                </span>
              </div>

              <strong className="dashboard-stat-value">
                {formatCount(stats?.emergencyActive)}
              </strong>

              <span className="dashboard-stat-note">
                {stats
                  ? `Active · ${stats.emergencyWaiting} still waiting`
                  : pendingNote}
              </span>
            </article>

            <article className="dashboard-stat-card">
              <div className="dashboard-stat-top">
                <span className="dashboard-stat-label">
                  Active departments
                </span>
                <span className="dashboard-stat-icon stat-icon-purple">
                  ▦
                </span>
              </div>

              <strong className="dashboard-stat-value">
                {formatCount(stats?.activeDepartments)}
              </strong>

              <span className="dashboard-stat-note">
                {stats
                  ? `Configured · ${stats.departmentsWithPatients} with patients now`
                  : pendingNote}
              </span>
            </article>

          </section>

          {/* QUEUE AND DEPARTMENTS */}

          <section className="dashboard-lower-grid">

            {/* PATIENT QUEUE */}

            <article className="dashboard-panel" id="patients">

              <div className="dashboard-panel-heading">
                <div>
                  <h2>Recent patient activity</h2>
                  <p>Latest registrations, consultations and completions</p>
                </div>

                <Link to="/patients" className="dashboard-panel-link">
                  View all →
                </Link>
              </div>

              <div className="dashboard-queue-list" id="queues">

                {summary && recentActivity.length === 0 && (
                  <p className="dashboard-empty">
                    No patient visits have been recorded yet.
                  </p>
                )}

                {!summary && (
                  <p className="dashboard-empty">
                    {summaryError
                      ? 'Patient activity could not be loaded.'
                      : 'Loading patient activity…'}
                  </p>
                )}

                {recentActivity.map((visit) => (

                  <Link
                    to={`/patients/${visit.patient_id}`}
                    className="dashboard-queue-row dashboard-activity-row"
                    key={visit.visit_id}
                  >

                    <div className="queue-patient-avatar">
                      {getInitials(visit.full_name)}
                    </div>

                    <div className="queue-patient-info">
                      <strong>{visit.full_name}</strong>
                      <small>
                        {visit.patient_number} · {visit.department || 'No department'} ·{' '}
                        {visit.visit_type === 'emergency' ? 'Emergency' : 'Normal'} visit
                      </small>
                      <small>
                        {ACTIVITY_LABELS[visit.activity_type]}{' '}
                        {formatActivityTime(visit.activity_at)}
                      </small>
                    </div>

                    <div className="dashboard-activity-badges">
                      {!visit.priority_restricted && (
                        <span
                          className={`queue-priority priority-${visit.triage_priority || 'unassigned'}`}
                        >
                          {formatPriority(visit.triage_priority)}
                        </span>
                      )}
                      <span className={`dashboard-status status-${visit.status}`}>
                        {STATUS_LABELS[visit.status] || visit.status}
                      </span>
                    </div>

                  </Link>

                ))}

              </div>

            </article>

            {/* DEPARTMENT WORKLOAD */}

            <article className="dashboard-panel" id="departments">

              <div className="dashboard-panel-heading">
                <div>
                  <h2>Department workload</h2>
                  <p>Active patients by department</p>
                </div>

                <Link to="/departments" className="dashboard-panel-link">
                  Departments →
                </Link>
              </div>

              <div className="dashboard-department-list">

                {summary && departmentWorkload.length === 0 && (
                  <p className="dashboard-empty">
                    No active departments are configured.
                  </p>
                )}

                {!summary && (
                  <p className="dashboard-empty">
                    {summaryError
                      ? 'Department workload could not be loaded.'
                      : 'Loading workload…'}
                  </p>
                )}

                {departmentWorkload.map((department) => (

                  <div key={department.department_id ?? `unlinked-${department.department}`}>

                    <div className="department-workload-header">
                      <span>
                        {department.department}
                        {department.is_active === false && ' (inactive)'}
                      </span>
                      <span>
                        {department.total} active · {department.waiting} waiting ·{' '}
                        {department.in_consultation} in consultation
                      </span>
                    </div>

                    <div className="workload-track">
                      <div
                        className="workload-fill"
                        style={{
                          width: `${Math.round(
                            (department.total / busiestDepartmentTotal) * 100
                          )}%`,
                        }}
                      />
                    </div>

                  </div>

                ))}

                {departmentWorkload.length > 0 && (
                  <p className="dashboard-footnote">
                    Bar length is relative to the busiest department. All
                    active departments are listed, including those with no
                    patients.
                  </p>
                )}

              </div>

            </article>

          </section>

          {/* REASSESSMENT ALERTS */}

          <section className="dashboard-panel dashboard-alert-panel" id="alerts">

            <div className="dashboard-panel-heading">
              <div>
                <h2>Alerts</h2>
                <p>Patients who need staff attention</p>
              </div>

              <Link to="/queues" className="dashboard-panel-link">
                Open queues →
              </Link>
            </div>

            {stats && (
              <div className="dashboard-alert-item">

                <span className="dashboard-alert-icon">!</span>

                <div>
                  <strong>
                    {stats.awaitingTriage === 0
                      ? 'All active patients have been triaged'
                      : `${stats.awaitingTriage} active ${
                          stats.awaitingTriage === 1 ? 'patient is' : 'patients are'
                        } awaiting triage`}
                  </strong>
                  <p>
                    Waiting or in-consultation patients with no recorded
                    triage assessment.
                  </p>
                </div>

              </div>
            )}

            {reassessment && !reassessment.configured && (
              <div className="dashboard-alert-item">

                <span className="dashboard-alert-icon">◷</span>

                <div>
                  <strong>Reassessment intervals have not been configured</strong>
                  <p>
                    No patient is labelled due or overdue until intervals
                    approved by qualified clinical staff are entered on the{' '}
                    <Link to="/reassessments">Reassessment alerts</Link> page.
                  </p>
                </div>

              </div>
            )}

            {reassessment && reassessment.configured && (
              <div className="dashboard-alert-item">

                <span className="dashboard-alert-icon">◷</span>

                <div>
                  <strong>
                    {reassessment.counts.overdue} overdue · {reassessment.counts.due} due ·{' '}
                    {reassessment.counts.due_soon} due soon
                    {reassessment.counts.snoozed > 0 &&
                      ` · ${reassessment.counts.snoozed} snoozed`}
                  </strong>
                  <p>
                    Reassessment status of waiting patients.{' '}
                    {reassessment.counts.not_configured > 0 &&
                      `${reassessment.counts.not_configured} waiting ${
                        reassessment.counts.not_configured === 1 ? 'patient has' : 'patients have'
                      } a priority with no configured interval. `}
                    <Link to="/reassessments">Open reassessment alerts →</Link>
                  </p>
                </div>

              </div>
            )}

            {reassessment?.alerts.map((alert) => (
              <Link
                key={alert.visit_id}
                to={`/patients/${alert.patient_id}?visit=${alert.visit_id}&reassess=1`}
                className="dashboard-alert-item dashboard-reassessment-alert"
              >
                <span className={`dashboard-alert-icon reassessment-${alert.alert_state}`}>
                  {alert.alert_state === 'due_soon' ? '◷' : '!'}
                </span>

                <div>
                  <strong>
                    {REASSESSMENT_LABELS[alert.alert_state]} · {alert.patient_number}{' '}
                    {alert.full_name}
                  </strong>
                  <p>
                    {alert.department || 'No department'} ·{' '}
                    {alert.visit_type === 'emergency' ? 'Emergency' : 'Normal'} ·{' '}
                    {!alert.priority_restricted &&
                      `${formatPriority(alert.current_priority)} priority · `}
                    due{' '}
                    {formatActivityTime(alert.due_at)}
                  </p>
                </div>
              </Link>
            ))}

          </section>

        </div>

      </main>

    </div>
  );
}

export default Dashboard;
