
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import './Login.css';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState(
    location.state?.registeredEmail || ''
  );
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const registrationSuccess = location.state?.registrationSuccess;

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError('');
    setIsLoading(true);

    try {
      const response = await fetch(
        'http://localhost:5000/api/auth/login',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            email,
            password,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Could not sign in.');
      }

      // Save the user's details for this navigation.
      // The server session remains the source of authentication.
      navigate('/dashboard', {
        replace: true,
        state: {
          user: data.user,
        },
      });
    } catch (error) {
      if (error instanceof TypeError) {
        setFormError(
          'Could not connect to the server. Please make sure the TRIORA backend is running.'
        );
      } else {
        setFormError(
          error.message || 'Something went wrong. Please try again.'
        );
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <Link to="/" className="auth-home-button">
        <span aria-hidden="true">←</span> Home
      </Link>

      <Link to="/" className="auth-brand">
        <span className="auth-brand-mark">T</span>
        <span>
          <strong>TRIORA</strong>
          <small>Smart Hospital Triage</small>
        </span>
      </Link>

      <section className="auth-card">
        <div className="auth-heading">
          <span className="auth-eyebrow">STAFF PORTAL</span>
          <h1>Welcome back</h1>
          <p>Sign in to access your hospital workspace.</p>
        </div>

        {registrationSuccess && (
          <p className="form-success" role="status">
            {registrationSuccess} You can now sign in.
          </p>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
          <label htmlFor="email">Work email</label>
          <input
            id="email"
            name="email"
            type="email"
            placeholder="you@hospital.com"
            autoComplete="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setFormError('');
            }}
            required
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            placeholder="Enter your password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setFormError('');
            }}
            required
          />

          {formError && (
            <p className="form-error" role="alert">
              {formError}
            </p>
          )}

          <button
            type="submit"
            className="auth-submit"
            disabled={isLoading}
          >
            {isLoading ? 'Signing in...' : 'Sign in'}
            {!isLoading && <span aria-hidden="true"> →</span>}
          </button>
        </form>

        <p className="auth-switch">
          New staff member? <Link to="/register">Create an account</Link>
        </p>

        <p className="auth-notice">
          Secure staff sign-in · Your session is protected
        </p>
      </section>

      <p className="auth-footer">
        TRIORA · Designed for hospital staff
      </p>
    </main>
  );
}
