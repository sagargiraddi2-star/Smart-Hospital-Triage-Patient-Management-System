
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const connectPgSimple = require('connect-pg-simple');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 5000;
const isProduction = process.env.NODE_ENV === 'production';

// Built frontend (client/dist), served by this backend in production so the
// website and the API share one address. Local development keeps using
// `npm run dev` (Vite) for the frontend.
const CLIENT_DIST = path.join(__dirname, '..', 'client', 'dist');
const CLIENT_INDEX = path.join(CLIENT_DIST, 'index.html');

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

// In production the app runs behind the host's HTTPS proxy (Render). Trusting
// that one proxy lets Express see the real HTTPS connection (needed for
// secure session cookies) and the visitor's real IP address (used by the
// login limiter). Not enabled locally, where there is no proxy.
if (isProduction) {
  app.set('trust proxy', 1);
}

// Basic security headers (Phase 7), without extra packages.
app.disable('x-powered-by');

// Web pages may load only this site's own files plus Google Fonts (used by
// the existing styles). API responses keep the strictest policy.
const PAGE_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

app.use((req, res, next) => {
  const isApi = req.path === '/api' || req.path.startsWith('/api/');

  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': isApi
      ? "default-src 'none'; frame-ancestors 'none'"
      : PAGE_CSP,
  });

  // API responses contain patient data: never store them in caches.
  if (isApi) {
    res.set('Cache-Control', 'no-store');
  }

  next();
});

// Health check for the hosting platform. It does not use the database, so
// frequent checks do not wake the (auto-pausing) Neon database.
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Production: serve the built frontend before the session middleware, so
// loading pages and static files never touches the database.
if (isProduction) {
  if (!fs.existsSync(CLIENT_INDEX)) {
    console.error('client/dist is missing. Run "npm run build" in client/ first.');
    process.exit(1);
  }

  app.use(
    express.static(CLIENT_DIST, {
      index: false,
      setHeaders(res, filePath) {
        // Vite gives built assets unique (hashed) names, so they can be
        // cached for a long time; index.html must always be re-checked.
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.set('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    })
  );

  // Page routes such as /dashboard or /patients/5 are handled by React, so
  // any non-API GET request receives index.html (also on page refresh).
  // Missing files (paths with an extension, e.g. an old /assets/x.js) get a
  // plain 404 instead of the page.
  app.use((req, res, next) => {
    const isApi = req.path === '/api' || req.path.startsWith('/api/');

    if ((req.method !== 'GET' && req.method !== 'HEAD') || isApi) {
      return next();
    }

    if (path.extname(req.path)) {
      return res.status(404).type('text/plain').send('Not found');
    }

    res.set('Cache-Control', 'no-cache');
    return res.sendFile(CLIENT_INDEX);
  });
}

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

// Welcome/test route (local development only; in production "/" is the
// website itself).
if (!isProduction) {
  app.get('/', (req, res) => {
    res.json({
      message: 'TRIORA backend is running!',
    });
  });
}

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
