import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './authContext.js';
import NotPermitted from './NotPermitted.jsx';

// Route guard: signed-in users with the required permission see the page;
// signed-out users go to the login page; others see "Not permitted".
// The backend enforces the same permission on every API request.
function RequireAuth({ permission, children }) {
  const auth = useAuth();
  const location = useLocation();

  if (auth.status === 'loading') {
    return (
      <div style={{ padding: '40px', fontSize: '15px', color: '#334155' }}>
        Checking your sign-in…
      </div>
    );
  }

  if (auth.status === 'error') {
    return (
      <div style={{ padding: '40px', fontSize: '15px', color: '#b91c1c' }}>
        Could not connect to the TRIORA backend. Please make sure it is running
        and reload the page.
      </div>
    );
  }

  if (auth.status !== 'signed-in') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (permission && !auth.can(permission)) {
    return <NotPermitted />;
  }

  return children;
}

export default RequireAuth;
