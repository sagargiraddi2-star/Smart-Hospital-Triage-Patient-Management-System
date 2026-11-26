
const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const { requireAuth } = require('../lib/auth');
const { createLoginLimiter } = require('../lib/loginLimiter');

const router = express.Router();

// Roles that may self-register (clinical staff and hospital management).
// Administrator accounts can NEVER be self-registered: they are created only
// by the bootstrap script (scripts/create-admin.js) or by an existing
// administrator changing a user's role on the User management page.
const allowedRoles = ['doctor', 'nurse', 'management'];

const BCRYPT_ROUNDS = 12;

// Used when an email address is not registered, so a failed login takes
// about as long as one with a wrong password (no account enumeration by
// timing). The hashed value is random and never stored.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(
  crypto.randomBytes(32).toString('hex'),
  BCRYPT_ROUNDS
);

const loginLimiter = createLoginLimiter();

// Register a new staff account. Doctor, nurse and management accounts are
// active immediately; approved_at is set so that if an administrator later
// disables the account it is reported as "disabled", not "pending".
router.post('/register', async (req, res) => {
  try {
    const { fullName, email, password, role } = req.body;

    if (
      typeof fullName !== 'string' ||
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      typeof role !== 'string'
    ) {
      return res.status(400).json({
        message: 'Please provide all required registration details.',
      });
    }

    const cleanedName = fullName.trim();
    const cleanedEmail = email.trim().toLowerCase();

    if (cleanedName.length < 2 || cleanedName.length > 100) {
      return res.status(400).json({
        message: 'Name must be between 2 and 100 characters.',
      });
    }

    if (
      cleanedEmail.length > 255 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanedEmail)
    ) {
      return res.status(400).json({
        message: 'Please enter a valid email address.',
      });
    }

    if (password.length < 8 || password.length > 72) {
      return res.status(400).json({
        message: 'Password must be between 8 and 72 characters.',
      });
    }

    // Only the self-registerable roles are accepted; 'admin' (or anything
    // else) is rejected here, so public registration cannot escalate.
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({
        message: 'Please select an approved staff role.',
      });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const client = await req.app.locals.pool.connect();

    try {
      await client.query('BEGIN');

      const result = await client.query(
        `INSERT INTO users (full_name, email, password_hash, role, is_active, approved_at)
         VALUES ($1, $2, $3, $4, TRUE, NOW())
         RETURNING id, full_name, email, role, is_active, created_at`,
        [cleanedName, cleanedEmail, passwordHash, role]
      );

      await client.query(
        `INSERT INTO user_account_changes
           (user_id, changed_by, action, new_role, new_active)
         VALUES ($1, NULL, 'registered', $2, TRUE)`,
        [result.rows[0].id, role]
      );

      await client.query('COMMIT');

      return res.status(201).json({
        message: 'Account created. You can now sign in.',
        user: result.rows[0],
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({
        message: 'An account with this email already exists.',
      });
    }

    console.error('Registration error:', error.message);

    return res.status(500).json({
      message: 'Could not create the account. Please try again.',
    });
  }
});

// Log in using an existing account.
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({
        message: 'Please enter your email and password.',
      });
    }

    const cleanedEmail = email.trim().toLowerCase();
    const ip = req.ip || 'unknown';
    const waitSeconds = loginLimiter.retryAfterSeconds(ip, cleanedEmail);

    if (waitSeconds > 0) {
      res.set('Retry-After', String(waitSeconds));

      return res.status(429).json({
        message: `Too many failed sign-in attempts. Please try again in ${Math.ceil(waitSeconds / 60)} minute(s).`,
      });
    }

    // Many failures from this address (across any emails): slow every
    // attempt down instead of blocking, so staff sharing the address can
    // still sign in with the correct password.
    const slowdown = loginLimiter.delayMs(ip);

    if (slowdown > 0) {
      await new Promise((resolve) => setTimeout(resolve, slowdown));
    }

    const result = await req.app.locals.pool.query(
      `SELECT id, full_name, email, password_hash, role, is_active, approved_at
       FROM users
       WHERE email = $1`,
      [cleanedEmail]
    );

    const user = result.rows[0];

    // Always run one bcrypt comparison, even for unknown emails.
    const passwordMatches = await bcrypt.compare(
      password,
      user ? user.password_hash : DUMMY_PASSWORD_HASH
    );

    if (!user || !passwordMatches) {
      loginLimiter.recordFailure(ip, cleanedEmail);

      return res.status(401).json({
        message: 'Invalid email or password.',
      });
    }

    loginLimiter.recordSuccess(ip, cleanedEmail);

    // Correct password, but the account cannot be used yet / any more.
    if (!user.is_active) {
      return res.status(403).json({
        message: user.approved_at
          ? 'Your account has been disabled. Please contact an administrator.'
          : 'Your account is awaiting administrator approval.',
      });
    }

    // Create a fresh session after successful authentication.
    req.session.regenerate((error) => {
      if (error) {
        console.error('Session error:', error.message);
        return res.status(500).json({
          message: 'Could not start your session. Please try again.',
        });
      }

      req.session.userId = user.id;

      req.session.save((saveError) => {
        if (saveError) {
          console.error('Session save error:', saveError.message);
          return res.status(500).json({
            message: 'Could not save your session. Please try again.',
          });
        }

        return res.json({
          message: 'Login successful.',
          user: {
            id: user.id,
            full_name: user.full_name,
            email: user.email,
            role: user.role,
          },
        });
      });
    });
  } catch (error) {
    console.error('Login error:', error.message);

    return res.status(500).json({
      message: 'Could not log in. Please try again.',
    });
  }
});

// The current user and their permissions (from lib/permissions.js).
// requireAuth re-checks the account on every call.
router.get('/me', requireAuth, (req, res) => {
  const { id, full_name: fullName, email, role } = req.user;

  return res.json({
    user: { id, full_name: fullName, email, role },
    permissions: req.permissions,
  });
});

// Log out and destroy the session.
router.post('/logout', (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      console.error('Logout error:', error.message);

      return res.status(500).json({
        message: 'Could not log out. Please try again.',
      });
    }

    res.clearCookie('triora.sid', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });

    return res.json({ message: 'Logged out successfully.' });
  });
});

module.exports = router;
