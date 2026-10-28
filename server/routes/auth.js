
const express = require('express');
const bcrypt = require('bcryptjs');

const router = express.Router();

const allowedRoles = ['doctor', 'nurse'];

// Register a new staff account.
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

    // Management accounts cannot self-register.
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({
        message: 'Please select an approved staff role.',
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await req.app.locals.pool.query(
      `INSERT INTO users (full_name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, full_name, email, role, created_at`,
      [cleanedName, cleanedEmail, passwordHash, role]
    );

    return res.status(201).json({
      message: 'Account created successfully.',
      user: result.rows[0],
    });
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

    const result = await req.app.locals.pool.query(
      `SELECT id, full_name, email, password_hash, role
       FROM users
       WHERE email = $1`,
      [email.trim().toLowerCase()]
    );

    const user = result.rows[0];

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({
        message: 'Invalid email or password.',
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

// Check whether the current session belongs to a logged-in user.
router.get('/me', async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({
        message: 'You are not logged in.',
      });
    }

    const result = await req.app.locals.pool.query(
      `SELECT id, full_name, email, role
       FROM users
       WHERE id = $1`,
      [req.session.userId]
    );

    if (!result.rows[0]) {
      return req.session.destroy(() => {
        res.status(401).json({
          message: 'Your account could not be found.',
        });
      });
    }

    return res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Session check error:', error.message);

    return res.status(500).json({
      message: 'Could not check your login status.',
    });
  }
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
