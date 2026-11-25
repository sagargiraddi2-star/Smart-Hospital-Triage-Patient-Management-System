
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './Dashboard.css';

const demoPatients = [
  {
    id: 'TR-1001',
    name: 'Aarav Sharma',
    department: 'Emergency',
    waiting: '12 min',
    priority: 'High',
  },
  {
    id: 'TR-1002',
    name: 'Ananya Rao',
    department: 'General Medicine',
    waiting: '24 min',
    priority: 'Medium',
  },
  {
    id: 'TR-1003',
    name: 'Rohan Mehta',
    department: 'Cardiology',
    waiting: '08 min',
    priority: 'Normal',
  },
  {
    id: 'TR-1004',
    name: 'Diya Nair',
    department: 'General Medicine',
    waiting: '31 min',
    priority: 'Medium',
  },
];

const demoDepartments = [
  { name: 'Emergency', patients: 8, percentage: 80, color: 'orange' },
  { name: 'General Medicine', patients: 12, percentage: 65, color: '' },
  { name: 'Cardiology', patients: 5, percentage: 40, color: 'blue' },
];

function Dashboard() {
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadUser() {
      try {
        const response = await fetch(
          'http://localhost:5000/api/auth/me',
          { credentials: 'include' }
        );

        if (!response.ok) {
          navigate('/login', { replace: true });
          return;
        }

        const data = await response.json();
        setUser(data.user);
      } catch (error) {
        console.error('Could not load user:', error);
        navigate('/login', { replace: true });
      } finally {
        setIsLoading(false);
      }
    }

    loadUser();
  }, [navigate]);

  async function handleLogout() {
    try {
      const response = await fetch(
        'http://localhost:5000/api/auth/logout',
        {
          method: 'POST',
          credentials: 'include',
        }
      );

      if (!response.ok) {
        throw new Error('Could not sign out. Please try again.');
      }

      navigate('/login', { replace: true });
    } catch (error) {
      console.error('Logout failed:', error);
      alert(error.message || 'Something went wrong while signing out.');
    }
  }

  if (isLoading) {
    return <div style={{ padding: '40px', fontSize: '14px' }}>Loading your dashboard...</div>;
  }

  if (!user) {
    return null;
  }

  const fullName =
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

  const role = user.role || 'Staff';

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
            <span className="sidebar-icon">▦</span>
            <span>Overview</span>
          </Link>

          <Link to="/patients" className="sidebar-link">
            <span className="sidebar-icon">♙</span>
            <span>Patients</span>
          </Link>

          <Link to="/queues" className="sidebar-link">
            <span className="sidebar-icon">☷</span>
            <span>Normal Queue</span>
          </Link>

          <Link to="/queues/emergency" className="sidebar-link">
            <span className="sidebar-icon">✚</span>
            <span>Emergency Queue</span>
          </Link>

          <Link to="/visit-history" className="sidebar-link">
            <span className="sidebar-icon">◷</span>
            <span>Visit History</span>
          </Link>

          <a href="/dashboard#departments" className="sidebar-link">
            <span className="sidebar-icon">▤</span>
            <span>Departments</span>
          </a>

          <a href="/dashboard#alerts" className="sidebar-link">
            <span className="sidebar-icon">♧</span>
            <span>Reassessment alerts</span>
          </a>

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
            <span>↪</span>
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
              TRIORA Staff Workspace
            </div>

          </section>

          {/* STATISTICS */}

          <section className="dashboard-stats">

            <article className="dashboard-stat-card">
              <div className="dashboard-stat-top">
                <span className="dashboard-stat-label">
                  Registered today
                </span>
                <span className="dashboard-stat-icon stat-icon-blue">
                  ♙
                </span>
              </div>

              <strong className="dashboard-stat-value">128</strong>

              <span className="dashboard-stat-note">
                Illustrative patient visits
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

              <strong className="dashboard-stat-value">24</strong>

              <span className="dashboard-stat-note">
                Across all departments
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

              <strong className="dashboard-stat-value">08</strong>

              <span className="dashboard-stat-note">
                Illustrative active cases
              </span>
            </article>

            <article className="dashboard-stat-card">
              <div className="dashboard-stat-top">
                <span className="dashboard-stat-label">
                  Departments
                </span>
                <span className="dashboard-stat-icon stat-icon-purple">
                  ▦
                </span>
              </div>

              <strong className="dashboard-stat-value">06</strong>

              <span className="dashboard-stat-note">
                Illustrative configured departments
              </span>
            </article>

          </section>

          {/* QUEUE AND DEPARTMENTS */}

          <section className="dashboard-lower-grid">

            {/* PATIENT QUEUE */}

            <article className="dashboard-panel" id="patients">

              <div className="dashboard-panel-heading">
                <div>
                  <h2>Recent patient queue</h2>
                  <p>Illustrative patient records</p>
                </div>

                <Link to="/patients" className="dashboard-panel-link">
                  View all →
                </Link>
              </div>

              <div className="dashboard-queue-list" id="queues">

                {demoPatients.map((patient) => (

                  <div className="dashboard-queue-row" key={patient.id}>

                    <div className="queue-patient-avatar">
                      {patient.name
                        .split(' ')
                        .map((part) => part[0])
                        .join('')}
                    </div>

                    <div className="queue-patient-info">
                      <strong>{patient.name}</strong>
                      <small>
                        {patient.id} · {patient.department} · {patient.waiting}
                      </small>
                    </div>

                    <span
                      className={`queue-priority priority-${patient.priority.toLowerCase()}`}
                    >
                      {patient.priority}
                    </span>

                  </div>

                ))}

              </div>

            </article>

            {/* DEPARTMENT WORKLOAD */}

            <article className="dashboard-panel" id="departments">

              <div className="dashboard-panel-heading">
                <div>
                  <h2>Department workload</h2>
                  <p>Illustrative workload distribution</p>
                </div>

                <span className="dashboard-panel-link">
                  Overview
                </span>
              </div>

              <div className="dashboard-department-list">

                {demoDepartments.map((department) => (

                  <div key={department.name}>

                    <div className="department-workload-header">
                      <span>{department.name}</span>
                      <span>{department.patients} patients</span>
                    </div>

                    <div className="workload-track">
                      <div
                        className={`workload-fill ${department.color}`}
                        style={{ width: `${department.percentage}%` }}
                      />
                    </div>

                  </div>

                ))}

              </div>

            </article>

          </section>

          {/* REASSESSMENT ALERTS */}

          <section className="dashboard-panel dashboard-alert-panel" id="alerts">

            <div className="dashboard-panel-heading">
              <div>
                <h2>Reassessment alerts</h2>
                <p>Illustrative alerts for the dashboard preview</p>
              </div>

              <span className="dashboard-panel-link">
                Attention required
              </span>
            </div>

            <div className="dashboard-alert-item">

              <span className="dashboard-alert-icon">◷</span>

              <div>
                <strong>Reassessment due · TR-1005</strong>
                <p>
                  A fictional patient record has reached its example
                  reassessment interval.
                </p>
              </div>

            </div>

            <div className="dashboard-alert-item">

              <span className="dashboard-alert-icon">!</span>

              <div>
                <strong>Extended waiting time · TR-1006</strong>
                <p>
                  A fictional patient record has exceeded its example
                  waiting-time threshold.
                </p>
              </div>

            </div>

          </section>

        </div>

      </main>

    </div>
  );
}

export default Dashboard;
