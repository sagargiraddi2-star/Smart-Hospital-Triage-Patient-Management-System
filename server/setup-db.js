require('dotenv').config();

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function setupDatabase() {
  try {
    // 1. Create the staff users table.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        full_name VARCHAR(100) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(30) NOT NULL DEFAULT 'doctor'
          CHECK (role IN ('doctor', 'nurse', 'management')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 2. Create a sequence for generating patient numbers.
    await pool.query(`
      CREATE SEQUENCE IF NOT EXISTS patient_number_sequence
      START WITH 1001
      INCREMENT BY 1;
    `);

    // 3. Create the patients table.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS patients (
        id SERIAL PRIMARY KEY,
        patient_number VARCHAR(20) NOT NULL UNIQUE,
        full_name VARCHAR(100) NOT NULL,
        date_of_birth DATE NOT NULL,
        gender VARCHAR(20) NOT NULL
          CHECK (gender IN ('Male', 'Female', 'Other')),
        phone VARCHAR(20) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 4. Create the patient visits table.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS patient_visits (
        id SERIAL PRIMARY KEY,
        patient_id INTEGER NOT NULL
          REFERENCES patients(id) ON DELETE CASCADE,
        department VARCHAR(100),
        visit_type VARCHAR(30) NOT NULL DEFAULT 'normal'
          CHECK (visit_type IN ('normal', 'emergency')),
        status VARCHAR(30) NOT NULL DEFAULT 'waiting'
          CHECK (status IN ('waiting', 'in_progress', 'completed')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 5. Create the triage assessments table.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS triage_assessments (
        id SERIAL PRIMARY KEY,

        visit_id INTEGER NOT NULL
          REFERENCES patient_visits(id) ON DELETE CASCADE,

        assessed_by INTEGER
          REFERENCES users(id) ON DELETE SET NULL,

        chief_complaint TEXT NOT NULL,
        symptoms TEXT,

        temperature_c NUMERIC(4, 1),
        heart_rate_bpm INTEGER,
        systolic_bp INTEGER,
        diastolic_bp INTEGER,
        respiratory_rate INTEGER,
        oxygen_saturation NUMERIC(4, 1),

        triage_priority VARCHAR(20) NOT NULL
          CHECK (
            triage_priority IN ('critical', 'high', 'medium', 'low')
          ),

        clinical_notes TEXT,

        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 6. Create an index for faster assessment history retrieval.
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_triage_assessments_visit
      ON triage_assessments (visit_id, created_at DESC);
    `);

    console.log('Database setup completed successfully!');
    console.log(
      'Users, patients, patient_visits and triage_assessments tables are ready.'
    );

  } catch (error) {
    console.error('Could not set up database:', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

setupDatabase();