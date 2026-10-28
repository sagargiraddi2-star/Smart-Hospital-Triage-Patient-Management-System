
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './Login.css';

const roles = [
  {
    value: 'doctor',
    icon: '✚',
    title: 'Doctor',
    description: 'Clinical assessment and patient care',
  },
  {
    value: 'nurse',
    icon: '♡',
    title: 'Nurse / Clinical staff',
    description: 'Patient support and queue coordination',
  },
  {
    value: 'management',
    icon: '▦',
    title: 'Hospital management',
    description: 'Departments and hospital operations',
  },
];

export default function Register() {
  const navigate = useNavigate();

  const [selectedRole, setSelectedRole] = useState('doctor');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [formError, setFormError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError('');

    if (password !== confirmPassword) {
      setFormError('Your passwords do not match. Please try again.');
      return;
    }

    if (selectedRole === 'management') {
      setFormError(
        'Hospital management accounts must be created or approved by an administrator.'
      );
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(
        'http://localhost:5000/api/auth/register',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            fullName,
            email,
            password,
            role: selectedRole,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Could not create your account.');
      }

      navigate('/login', {
        state: {
          registrationSuccess: data.message,
          registeredEmail: email.trim().toLowerCase(),
        },
      });
    } catch (error) {
      if (error instanceof TypeError) {
        setFormError(
          'Could not connect to the server. Please make sure the TRIORA backend is running.'
        );
      } else {
        setFormError(error.message || 'Something went wrong. Please try again.');
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

      <section className="auth-card register-card">
        <div className="auth-heading">
          <span className="auth-eyebrow">STAFF PORTAL</span>
          <h1>Create your account</h1>
          <p>Register your staff details to get started with TRIORA.</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label htmlFor="fullName">Full name</label>
          <input
            id="fullName"
            name="fullName"
            type="text"
            placeholder="Enter your full name"
            autoComplete="name"
            minLength={2}
            maxLength={100}
            value={fullName}
            onChange={(event) => {
              setFullName(event.target.value);
              setFormError('');
            }}
            required
          />

          <label htmlFor="registerEmail">Work email</label>
          <input
            id="registerEmail"
            name="email"
            type="email"
            placeholder="you@hospital.com"
            autoComplete="email"
            maxLength={255}
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setFormError('');
            }}
            required
          />

          <fieldset className="role-fieldset">
            <legend>Staff role</legend>

            <div className="role-options">
              {roles.map((role) => (
                <button
                  key={role.value}
                  type="button"
                  className={`role-option ${
                    selectedRole === role.value ? 'selected' : ''
                  }`}
                  onClick={() => {
                    setSelectedRole(role.value);
                    setFormError('');
                  }}
                  aria-pressed={selectedRole === role.value}
                >
                  <span className="role-option-icon" aria-hidden="true">
                    {role.icon}
                  </span>

                  <span className="role-option-copy">
                    <strong>{role.title}</strong>
                    <small>{role.description}</small>
                  </span>

                  <span className="role-radio" aria-hidden="true">
                    {selectedRole === role.value ? '✓' : ''}
                  </span>
                </button>
              ))}
            </div>

            <input type="hidden" name="role" value={selectedRole} />
          </fieldset>

          <label htmlFor="registerPassword">Create password</label>
          <input
            id="registerPassword"
            name="password"
            type="password"
            placeholder="At least 8 characters"
            autoComplete="new-password"
            minLength={8}
            maxLength={72}
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setFormError('');
            }}
            required
          />

          <label htmlFor="confirmPassword">Confirm password</label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            placeholder="Enter your password again"
            autoComplete="new-password"
            minLength={8}
            maxLength={72}
            value={confirmPassword}
            onChange={(event) => {
              setConfirmPassword(event.target.value);
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
            {isLoading ? 'Creating account...' : 'Create account'}
            {!isLoading && <span aria-hidden="true"> →</span>}
          </button>
        </form>

        <p className="auth-switch">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>

        <p className="auth-notice">
          Staff registration · Your password is securely hashed
        </p>
      </section>

      <p className="auth-footer">
        TRIORA · Designed for hospital staff
      </p>
    </main>
  );
}
