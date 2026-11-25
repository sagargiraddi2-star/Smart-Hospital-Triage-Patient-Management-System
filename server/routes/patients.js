
const express = require('express');

const router = express.Router();

// Check whether a staff member is logged in.
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({
      message: 'Please log in to access patient records.',
    });
  }

  next();
}

// GET /api/patients
// Retrieve patient records along with each patient's latest visit.
router.get('/', requireAuth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;

    const result = await pool.query(`
      SELECT
        p.id,
        p.patient_number,
        p.full_name,
        p.date_of_birth,
        p.gender,
        p.phone,
        p.created_at,
        latest_visit.department,
        latest_visit.visit_type,
        latest_visit.status
      FROM patients p
      LEFT JOIN LATERAL (
        SELECT
          department,
          visit_type,
          status
        FROM patient_visits
        WHERE patient_id = p.id
        ORDER BY created_at DESC
        LIMIT 1
      ) latest_visit ON TRUE
      ORDER BY p.created_at DESC;
    `);

    res.json({
      patients: result.rows,
    });
  } catch (error) {
    console.error('Could not retrieve patients:', error.message);

    res.status(500).json({
      message: 'Could not retrieve patient records.',
    });
  }
});

// GET /api/patients/:id
// Retrieve one patient's details and visit history.
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const patientId = req.params.id;

    const patientResult = await pool.query(
      `
        SELECT
          id,
          patient_number,
          full_name,
          date_of_birth,
          gender,
          phone,
          created_at
        FROM patients
        WHERE id = $1;
      `,
      [patientId]
    );

    if (patientResult.rows.length === 0) {
      return res.status(404).json({
        message: 'Patient not found.',
      });
    }

    const visitsResult = await pool.query(
      `
        SELECT
          id,
          department,
          visit_type,
          status,
          created_at
        FROM patient_visits
        WHERE patient_id = $1
        ORDER BY created_at DESC;
      `,
      [patientId]
    );

    res.json({
      patient: patientResult.rows[0],
      visits: visitsResult.rows,
    });
  } catch (error) {
    console.error('Could not retrieve patient details:', error.message);

    res.status(500).json({
      message: 'Could not retrieve patient details.',
    });
  }
});

// POST /api/patients
// Register a patient and create their first hospital visit.
router.post('/', requireAuth, async (req, res) => {
  let client;
  let transactionStarted = false;

  try {
    const {
      fullName,
      dateOfBirth,
      gender,
      phone,
      department,
      visitType,
    } = req.body;

    // Validate required fields.
    if (
      !fullName?.trim() ||
      !dateOfBirth ||
      !gender ||
      !phone?.trim() ||
      !department?.trim() ||
      !visitType
    ) {
      return res.status(400).json({
        message: 'Please provide all required patient details.',
      });
    }

    // Validate gender.
    if (!['Male', 'Female', 'Other'].includes(gender)) {
      return res.status(400).json({
        message: 'Please select a valid gender.',
      });
    }

    // Validate visit type.
    if (!['normal', 'emergency'].includes(visitType)) {
      return res.status(400).json({
        message: 'Please select a valid visit type.',
      });
    }

    const pool = req.app.locals.pool;

    // Get a database connection.
    client = await pool.connect();

    // Start a transaction so both records are saved together.
    await client.query('BEGIN');
    transactionStarted = true;

    // 1. Create the patient record.
    const patientResult = await client.query(
      `
        INSERT INTO patients (
          patient_number,
          full_name,
          date_of_birth,
          gender,
          phone
        )
        VALUES (
          'TR-' || LPAD(
            nextval('patient_number_sequence')::TEXT,
            6,
            '0'
          ),
          $1,
          $2,
          $3,
          $4
        )
        RETURNING *;
      `,
      [
        fullName.trim(),
        dateOfBirth,
        gender,
        phone.trim(),
      ]
    );

    const patient = patientResult.rows[0];

    // 2. Create the patient's first hospital visit.
    const visitResult = await client.query(
      `
        INSERT INTO patient_visits (
          patient_id,
          department,
          visit_type,
          status
        )
        VALUES ($1, $2, $3, 'waiting')
        RETURNING *;
      `,
      [
        patient.id,
        department.trim(),
        visitType,
      ]
    );

    // Save both records together.
    await client.query('COMMIT');
    transactionStarted = false;

    res.status(201).json({
      message: 'Patient registered successfully.',
      patient,
      visit: visitResult.rows[0],
    });

  } catch (error) {
    // Undo changes if either database operation fails.
    if (client && transactionStarted) {
      await client.query('ROLLBACK');
    }

    console.error('Could not register patient:', error.message);

    res.status(500).json({
      message: 'Could not register patient.',
    });

  } finally {
    // Release the database connection.
    if (client) {
      client.release();
    }
  }
});

module.exports = router;
