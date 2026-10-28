
import { Link, Routes, Route } from 'react-router-dom';
import './App.css';
import Login from './Login.jsx';
import Register from './Register.jsx';

const features = [
  {
    number: '01',
    title: 'Smarter patient flow',
    description:
      'Keep patient queues organized and help staff understand who needs attention next.',
    icon: '↗',
  },
  {
    number: '02',
    title: 'Clinical oversight',
    description:
      'Support staff decisions with structured assessments and human-reviewed priority suggestions.',
    icon: '✳',
  },
  {
    number: '03',
    title: 'Hospital-wide visibility',
    description:
      'Bring departments, waiting queues and operational information into one workspace.',
    icon: '▦',
  },
];

const departments = [
  { name: 'Emergency', count: '08', color: 'coral' },
  { name: 'General medicine', count: '12', color: 'blue' },
  { name: 'Cardiology', count: '05', color: 'teal' },
];

function Welcome() {
  return (
    <main className="welcome-page">
      <header className="site-header">
        <Link className="brand" to="/" aria-label="TRIORA home">
          <span className="brand-mark">
            <span />
            <span />
            <span />
          </span>
          <span className="brand-copy">
            <strong>TRIORA</strong>
            <small>HOSPITAL OPERATIONS</small>
          </span>
        </Link>

        <nav className="header-nav" aria-label="Main navigation">
          <a href="#platform">Platform</a>
          <a href="#features">Features</a>
          <a href="#about">About TRIORA</a>
        </nav>

        <div className="header-actions">
          <Link className="login-link" to="/login">
            Staff login
          </Link>
          <Link className="button button-dark button-small" to="/register">
            Get started <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </header>

      <section className="hero" id="platform">
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="status-dot" />
            A smarter way to coordinate hospital care
          </div>

          <h1>
            Better flow.
            <br />
            <span>Better care.</span>
          </h1>

          <p className="hero-description">
            A unified workspace for hospital teams to organize patient
            queues, support triage decisions and coordinate care with
            greater clarity.
          </p>

          <div className="hero-actions">
            <a className="button button-dark" href="#staff-access">
              Explore the platform <span aria-hidden="true">↗</span>
            </a>
            <a className="text-link" href="#features">
              Discover what we do <span aria-hidden="true">↓</span>
            </a>
          </div>

          <div className="hero-note">
            <span className="note-icon" aria-hidden="true">✓</span>
            <span>
              Designed for hospital staff
              <strong>Human-led clinical decisions</strong>
            </span>
          </div>
        </div>

        <div
          className="hero-visual"
          aria-label="Illustration of the TRIORA hospital operations dashboard"
        >
          <div className="visual-orbit orbit-one" />
          <div className="visual-orbit orbit-two" />

          <div className="dashboard-window">
            <div className="dashboard-topbar">
              <div className="mini-brand">
                <span className="mini-brand-mark">T</span>
                <span>TRIORA <small>WORKSPACE</small></span>
              </div>
              <span className="preview-label">PREVIEW</span>
            </div>

            <div className="dashboard-content">
              <div className="dashboard-heading">
                <div>
                  <span className="muted-label">OVERVIEW</span>
                  <h2>Good morning, team</h2>
                  <p>Here's your hospital at a glance.</p>
                </div>
                <div className="date-chip">
                  <span aria-hidden="true">◷</span> Live workspace preview
                </div>
              </div>

              <div className="stat-grid">
                <div className="stat-card">
                  <span>Registered today</span>
                  <strong>128</strong>
                  <small><i className="stat-line line-blue" /> Patient visits</small>
                </div>
                <div className="stat-card">
                  <span>Waiting patients</span>
                  <strong>24</strong>
                  <small><i className="stat-line line-orange" /> Across departments</small>
                </div>
                <div className="stat-card">
                  <span>Departments</span>
                  <strong>06</strong>
                  <small><i className="stat-line line-teal" /> Configured</small>
                </div>
              </div>

              <div className="queue-panel">
                <div className="queue-heading">
                  <div>
                    <span className="muted-label">DEPARTMENT SNAPSHOT</span>
                    <h3>Patient queues</h3>
                  </div>
                  <span className="queue-view">View all ↗</span>
                </div>

                {departments.map((department) => (
                  <div className="department-row" key={department.name}>
                    <span className={`department-icon ${department.color}`}>
                      {department.color === 'coral'
                        ? '✚'
                        : department.color === 'blue'
                          ? '＋'
                          : '♡'}
                    </span>
                    <span className="department-name">{department.name}</span>
                    <span className="department-count">{department.count}</span>
                    <span className="department-arrow">↗</span>
                  </div>
                ))}

                <p className="demo-caption">
                  Illustrative demo data · Not live hospital information
                </p>
              </div>
            </div>
          </div>

          <div className="floating-note floating-note-top">
            <span className="floating-icon teal-icon">✳</span>
            <span>
              <strong>One workspace</strong>
              <small>Connected operations</small>
            </span>
          </div>

          <div className="floating-note floating-note-bottom">
            <span className="floating-icon blue-icon">✓</span>
            <span>
              <strong>Staff in control</strong>
              <small>Human-reviewed decisions</small>
            </span>
          </div>
        </div>
      </section>

      <section className="trust-strip" id="about">
        <span>BUILT AROUND THE PEOPLE WHO DELIVER CARE</span>
        <div className="trust-items">
          <span><i>✳</i> Clinical oversight</span>
          <span><i>⌘</i> Coordinated departments</span>
          <span><i>◷</i> Clearer patient flow</span>
        </div>
      </section>

      <section className="features-section" id="features">
        <div className="section-heading">
          <div>
            <span className="section-kicker">THE TRIORA APPROACH</span>
            <h2>Less confusion.<br />More coordinated care.</h2>
          </div>
          <p>
            The right information, organized in one place, helps hospital
            teams manage their day and focus on the people who need care.
          </p>
        </div>

        <div className="feature-grid">
          {features.map((feature) => (
            <article className="feature-card" key={feature.number}>
              <div className="feature-card-top">
                <span className="feature-icon">{feature.icon}</span>
                <span className="feature-number">{feature.number}</span>
              </div>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
              <Link to="/login" aria-label={`Explore ${feature.title}`}>
                Explore <span aria-hidden="true">↗</span>
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="access-section" id="staff-access">
        <div>
          <span className="section-kicker">YOUR WORKSPACE AWAITS</span>
          <h2>Let's make every handoff clearer.</h2>
          <p>
            Hospital staff can sign in to access the TRIORA workspace.
            Authentication and account registration are the next steps
            in our build.
          </p>
        </div>
        <div className="access-actions">
          <Link className="button button-light" to="/login">
            Staff login <span aria-hidden="true">↗</span>
          </Link>
          <Link className="access-register" to="/register">
            New staff member? Register
          </Link>
        </div>
      </section>

      <footer className="site-footer">
        <Link className="brand footer-brand" to="/">
          <span className="brand-mark">
            <span />
            <span />
            <span />
          </span>
          <span className="brand-copy">
            <strong>TRIORA</strong>
            <small>HOSPITAL OPERATIONS</small>
          </span>
        </Link>
        <span>Designed to support care teams, not replace clinical judgment.</span>
        <span>© 2026 TRIORA · Academic project</span>
      </footer>
    </main>
  );
}

function RegisterPlaceholder() {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-heading">
          <span className="auth-eyebrow">STAFF PORTAL</span>
          <h1>Staff registration</h1>
          <p>We'll build the staff registration form next.</p>
        </div>
        <p className="auth-switch">
          Already registered? <Link to="/login">Sign in</Link>
        </p>
        <p className="auth-switch">
          <Link to="/">← Back to home</Link>
        </p>
      </section>
    </main>
  );
}

function NotFound() {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-heading">
          <h1>Page not found</h1>
          <p>That page isn't available.</p>
        </div>
        <p className="auth-switch">
          <Link to="/">Return to the welcome page</Link>
        </p>
      </section>
    </main>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Welcome />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default App;
