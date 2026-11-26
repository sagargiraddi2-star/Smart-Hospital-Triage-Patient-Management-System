
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const session = require('express-session');
const connectPgSimple = require('connect-pg-simple');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 5000;

if (!process.env.DATABASE_URL || !process.env.SESSION_SECRET) {
  console.error('Missing DATABASE_URL or SESSION_SECRET in server/.env');
  process.exit(1);
}

// Connect to Neon PostgreSQL.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Make the database available to our route files.
app.locals.pool = pool;

app.use(
  cors({
    origin: 'http://localhost:5173',
    credentials: true,
  })
);

// Basic security headers (Phase 7), without extra packages.
app.disable('x-powered-by');

app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  });

  // API responses contain patient data: never store them in caches.
  if (req.path.startsWith('/api/')) {
    res.set('Cache-Control', 'no-store');
  }

  next();
});

app.use(express.json());

// Store login sessions in PostgreSQL.
const PgSessionStore = connectPgSimple(session);

const sessionStore = new PgSessionStore({
  pool,
  tableName: 'user_sessions',
  createTableIfMissing: true,
});

app.use(
  session({
    name: 'triora.sid',
    secret: process.env.SESSION_SECRET,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 8 * 60 * 60 * 1000,
    },
  })
);

// Welcome/test route.
app.get('/', (req, res) => {
  res.json({
    message: 'TRIORA backend is running!',
  });
});

// Registration and authentication routes.
app.use('/api/auth', require('./routes/auth'));

// Patient management routes.
app.use('/api/patients', require('./routes/patients'));

// Patient triage routes.
app.use('/api/triage', require('./routes/triage'));

// Patient queue routes.
app.use('/api/queues', require('./routes/queues'));

// Dashboard overview routes.
app.use('/api/dashboard', require('./routes/dashboard'));

// Department management routes.
app.use('/api/departments', require('./routes/departments'));

// Reassessment alert routes.
app.use('/api/reassessments', require('./routes/reassessments'));

// Simulated AI triage demonstration (local only, no external AI).
app.use('/api/ai-triage', require('./routes/aiTriage'));

// User management (administrators only).
app.use('/api/users', require('./routes/users'));

// Unknown API routes return JSON instead of Express's default HTML page,
// so the frontend never tries to parse an HTML error as JSON.
app.use('/api', (req, res) => {
  res.status(404).json({
    message: `API endpoint not found: ${req.method} ${req.originalUrl}`,
  });
});

// Unexpected errors (including malformed JSON request bodies) also
// return JSON. Details are logged on the server, not sent to the client.
app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  const status =
    Number.isInteger(error.status) && error.status >= 400 && error.status < 500
      ? error.status
      : 500;

  if (status === 500) {
    console.error('Unexpected server error:', error.message);
  }

  return res.status(status).json({
    message:
      status === 500
        ? 'An unexpected server error occurred.'
        : 'The request could not be processed.',
  });
});

// Start the server.
const server = app.listen(PORT, () => {
  console.log(`TRIORA backend running at http://localhost:${PORT}`);
});

// Handle unexpected database errors.
pool.on('error', (error) => {
  console.error('Unexpected database pool error:', error.message);
});

// Close connections cleanly when stopped.
function shutdown() {
  server.close(async () => {
    try {
      await pool.end();
      console.log('TRIORA backend stopped safely.');
      process.exit(0);
    } catch (error) {
      console.error('Error closing database connection:', error.message);
      process.exit(1);
    }
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
