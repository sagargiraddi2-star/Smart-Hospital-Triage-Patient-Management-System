
const express = require('express');
const { requirePermission, restrictPriority } = require('../lib/auth');

const router = express.Router();

// GET /api/patients
// Retrieve patient records along with each patient's latest visit.
router.get('/', requirePermission('patients.view'), async (req, res) => {
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
        latest_visit.department_id,
        latest_visit.visit_type,
        latest_visit.status
      FROM patients p
      LEFT JOIN LATERAL (
        SELECT
          -- Current department name; falls back to the name recorded at
          -- registration for any visit not linked to a department.
          COALESCE(d.name, pv.department) AS department,
          pv.department_id,
          pv.visit_type,
          pv.status
        FROM patient_visits pv
        LEFT JOIN departments d ON d.id = pv.department_id
        WHERE pv.patient_id = p.id
        ORDER BY pv.created_at DESC
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
router.get('/:id', requirePermission('patients.view'), async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const patientId = Number(req.params.id);

    // Phase 7: reject malformed IDs with 400 instead of a database error.
    if (!Number.isInteger(patientId) || patientId <= 0) {
      return res.status(400).json({ message: 'Invalid patient ID.' });
    }

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
          pv.id,
          COALESCE(d.name, pv.department) AS department,
          pv.department_id,
          d.is_active AS department_is_active,
          pv.visit_type,
          pv.status,
          pv.created_at,
          pv.consultation_started_at,
          pv.completed_at,
          pv.waiting_time_minutes,
          pv.priority_at_consultation
        FROM patient_visits pv
        LEFT JOIN departments d ON d.id = pv.department_id
        WHERE pv.patient_id = $1
        ORDER BY pv.created_at DESC;
      `,
      [patientId]
    );

    res.json({
      patient: patientResult.rows[0],
      visits: restrictPriority(req, visitsResult.rows, ['priority_at_consultation']),
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
router.post('/', requirePermission('patients.register'), async (req, res) => {
  let client;
  let transactionStarted = false;

  try {
    const {
      fullName,
      dateOfBirth,
      gender,
      phone,
      departmentId,
      visitType,
    } = req.body;

    const parsedDepartmentId = Number(departmentId);

    // Validate required fields.
    if (
      !fullName?.trim() ||
      !dateOfBirth ||
      !gender ||
      !phone?.trim() ||
      !departmentId ||
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

    if (!Number.isInteger(parsedDepartmentId) || parsedDepartmentId <= 0) {
      return res.status(400).json({
        message: 'Please select a valid department.',
      });
    }

    const pool = req.app.locals.pool;

    // Get a database connection.
    client = await pool.connect();

    // Start a transaction so both records are saved together.
    await client.query('BEGIN');
    transactionStarted = true;

    // The department must exist and be active. FOR SHARE stops it from
    // being renamed or deactivated until this registration is saved.
    const departmentResult = await client.query(
      `
        SELECT id, name
        FROM departments
        WHERE id = $1 AND is_active
        FOR SHARE;
      `,
      [parsedDepartmentId]
    );

    const department = departmentResult.rows[0];

    if (!department) {
      await client.query('ROLLBACK');
      transactionStarted = false;

      return res.status(400).json({
        message:
          'The selected department is not available. Please choose an active department.',
      });
    }

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
          department_id,
          department,
          visit_type,
          status
        )
        VALUES ($1, $2, $3, $4, 'waiting')
        RETURNING *;
      `,
      [
        patient.id,
        department.id,
        // Name recorded at registration time (kept for compatibility).
        department.name,
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
