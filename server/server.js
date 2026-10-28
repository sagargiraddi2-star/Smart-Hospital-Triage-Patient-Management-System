
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
