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

    // 7. Phase 2 migration: consultation timing, priority snapshots,
    //    queue-side priority updates and manual queue order.
    //    Every statement is additive and safe to run more than once.
    //    It never drops tables or columns and never deletes records.
    await runPhase2Migration();

    // 8. Phase 4 migration: managed departments linked to patient visits.
    //    Additive and safe to run more than once.
    await runPhase4Migration();

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

async function runPhase2Migration() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // The first three columns already exist in the live database
    // (added outside this script). IF NOT EXISTS keeps them unchanged
    // there and creates them for fresh installations.
    await client.query(`
      ALTER TABLE patient_visits
        ADD COLUMN IF NOT EXISTS consultation_started_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS waiting_time_minutes INTEGER
          CHECK (waiting_time_minutes >= 0),
        ADD COLUMN IF NOT EXISTS priority_at_consultation VARCHAR(20)
          CHECK (
            priority_at_consultation IN ('critical', 'high', 'medium', 'low')
          ),
        ADD COLUMN IF NOT EXISTS consultation_started_by INTEGER
          REFERENCES users(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS completed_by INTEGER
          REFERENCES users(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS queue_position INTEGER
          CHECK (queue_position > 0);
    `);

    // Distinguish full assessments from priority changes made in the
    // queue, so the assessment history is preserved, not overwritten.
    // Existing rows receive the default 'assessment', which is accurate.
    await client.query(`
      ALTER TABLE triage_assessments
        ADD COLUMN IF NOT EXISTS entry_type VARCHAR(30)
          NOT NULL DEFAULT 'assessment'
          CHECK (entry_type IN ('assessment', 'priority_update')),
        ADD COLUMN IF NOT EXISTS previous_priority VARCHAR(20)
          CHECK (
            previous_priority IN ('critical', 'high', 'medium', 'low')
          );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_patient_visits_status
      ON patient_visits (status, visit_type);
    `);

    await client.query('COMMIT');
    console.log('Phase 2 queue migration applied.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// The department options that were previously hardcoded in the
// patient registration form.
const INITIAL_DEPARTMENTS = [
  'Emergency',
  'General Medicine',
  'Cardiology',
  'Orthopedics',
  'Neurology',
  'Pediatrics',
];

async function runPhase4Migration() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS departments (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Department names are unique regardless of letter case.
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS departments_name_unique
      ON departments (LOWER(name));
    `);

    // Seed the six departments from the old registration dropdown.
    await client.query(
      `
        INSERT INTO departments (name)
        SELECT UNNEST($1::TEXT[])
        ON CONFLICT ((LOWER(name))) DO NOTHING;
      `,
      [INITIAL_DEPARTMENTS]
    );

    // Any historical department text that is not one of the six becomes
    // an INACTIVE department, so its visits stay linked and readable but
    // it is never offered for new visits.
    await client.query(`
      INSERT INTO departments (name, is_active)
      SELECT DISTINCT ON (LOWER(TRIM(department)))
        TRIM(department),
        FALSE
      FROM patient_visits
      WHERE NULLIF(TRIM(department), '') IS NOT NULL
      ORDER BY LOWER(TRIM(department)), TRIM(department)
      ON CONFLICT ((LOWER(name))) DO NOTHING;
    `);

    // Link visits to departments. The original text column is kept as the
    // department name recorded at registration time.
    await client.query(`
      ALTER TABLE patient_visits
        ADD COLUMN IF NOT EXISTS department_id INTEGER
          REFERENCES departments(id) ON DELETE RESTRICT;
    `);

    await client.query(`
      UPDATE patient_visits pv
      SET department_id = d.id
      FROM departments d
      WHERE pv.department_id IS NULL
        AND LOWER(TRIM(pv.department)) = LOWER(d.name);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_patient_visits_department
      ON patient_visits (department_id);
    `);

    await client.query('COMMIT');
    console.log('Phase 4 department migration applied.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

setupDatabase();