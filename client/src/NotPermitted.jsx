import { Link } from 'react-router-dom';
import { ROLE_LABELS, useAuth } from './authContext.js';
import './Login.css';

// Shown when a signed-in user opens a page their role may not use.
function NotPermitted() {
  const { user } = useAuth();

  return (
    <main className="auth-page">
      <section className="auth-card" role="alert">
        <div className="auth-heading">
          <span className="auth-eyebrow">ACCESS RESTRICTED</span>
          <h1>Not permitted</h1>
          <p>
            Your role{user ? ` (${ROLE_LABELS[user.role] || user.role})` : ''} does
            not have permission to view this page. If you need access, please
            contact a system administrator.
          </p>
        </div>

        <p className="auth-switch">
          <Link to="/dashboard">Return to the dashboard</Link>
        </p>
      </section>
    </main>
  );
}

export default NotPermitted;
