
const express = require('express');

const router = express.Router();

// Check whether a staff member is logged in.
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({
      message: 'Please log in to access triage assessments.',
    });
  }

  next();
}

// Validate optional numeric observations.
function isValidOptionalNumber(value, min, max) {
  if (value === undefined || value === null || value === '') {
    return true;
  }

  const number = Number(value);

  return Number.isFinite(number) && number >= min && number <= max;
}

// POST /api/triage
// Save a new triage assessment.
router.post('/', requireAuth, async (req, res) => {
  const pool = req.app.locals.pool;

  try {
    const {
      visitId,
      chiefComplaint,
      symptoms,
      temperatureC,
      heartRateBpm,
      systolicBp,
      diastolicBp,
      respiratoryRate,
      oxygenSaturation,
      triagePriority,
      clinicalNotes,
    } = req.body;

    if (
      !visitId ||
      !Number.isInteger(Number(visitId)) ||
      Number(visitId) <= 0
    ) {
      return res.status(400).json({
        message: 'A valid visit ID is required.',
      });
    }

    if (
      typeof chiefComplaint !== 'string' ||
      !chiefComplaint.trim()
    ) {
      return res.status(400).json({
        message: 'Chief complaint is required.',
      });
    }

    const allowedPriorities = [
      'critical',
      'high',
      'medium',
      'low',
    ];

    if (!allowedPriorities.includes(triagePriority)) {
      return res.status(400).json({
        message: 'Please select a valid triage priority.',
      });
    }

    const observations = [
      [temperatureC, 25, 45, 'Temperature'],
      [heartRateBpm, 1, 300, 'Heart rate'],
      [systolicBp, 1, 300, 'Systolic blood pressure'],
      [diastolicBp, 1, 200, 'Diastolic blood pressure'],
      [respiratoryRate, 1, 100, 'Respiratory rate'],
      [oxygenSaturation, 0, 100, 'Oxygen saturation'],
    ];

    for (const [value, min, max, label] of observations) {
      if (!isValidOptionalNumber(value, min, max)) {
        return res.status(400).json({
          message: `${label} must be between ${min} and ${max}.`,
        });
      }
    }

    // Confirm that the visit exists and read its current priority.
    const visitResult = await pool.query(
      `
        SELECT
          pv.id,
          (
            SELECT triage_priority
            FROM triage_assessments
            WHERE visit_id = pv.id
            ORDER BY created_at DESC, id DESC
            LIMIT 1
          ) AS current_priority
        FROM patient_visits pv
        WHERE pv.id = $1
      `,
      [Number(visitId)]
    );

    if (visitResult.rows.length === 0) {
      return res.status(404).json({
        message: 'Patient visit not found.',
      });
    }

    // Save the assessment.
    const result = await pool.query(
      `
        INSERT INTO triage_assessments (
          visit_id,
          assessed_by,
          chief_complaint,
          symptoms,
          temperature_c,
          heart_rate_bpm,
          systolic_bp,
          diastolic_bp,
          respiratory_rate,
          oxygen_saturation,
          triage_priority,
          clinical_notes
        )
        VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11, $12
        )
        RETURNING *
      `,
      [
        Number(visitId),
        req.session.userId,
        chiefComplaint.trim(),
        symptoms || null,
        temperatureC || null,
        heartRateBpm || null,
        systolicBp || null,
        diastolicBp || null,
        respiratoryRate || null,
        oxygenSaturation || null,
        triagePriority,
        clinicalNotes || null,
      ]
    );

    // A manual queue position belongs to the previous priority group.
    // If this assessment changed the priority, the patient joins the end
    // of the new group's manual order (same rule as queue priority edits).
    if (visitResult.rows[0].current_priority !== triagePriority) {
      await pool.query(
        'UPDATE patient_visits SET queue_position = NULL WHERE id = $1',
        [Number(visitId)]
      );
    }

    return res.status(201).json({
      message: 'Triage assessment saved successfully.',
      assessment: result.rows[0],
    });
  } catch (error) {
    console.error('Error saving triage assessment:', error.message);

    return res.status(500).json({
      message: 'Could not save triage assessment.',
    });
  }
});

// GET /api/triage/:visitId
// Retrieve assessment history for a patient visit.
router.get('/:visitId', requireAuth, async (req, res) => {
  const pool = req.app.locals.pool;

  try {
    const visitId = Number(req.params.visitId);

    if (!Number.isInteger(visitId) || visitId <= 0) {
      return res.status(400).json({
        message: 'Invalid visit ID.',
      });
    }

    const result = await pool.query(
      `
        SELECT
          ta.*,
          u.full_name AS assessed_by_name
        FROM triage_assessments ta
        LEFT JOIN users u ON ta.assessed_by = u.id
        WHERE ta.visit_id = $1
        ORDER BY ta.created_at DESC, ta.id DESC
      `,
      [visitId]
    );

    return res.json({
      assessments: result.rows,
    });
  } catch (error) {
    console.error('Error retrieving triage assessments:', error.message);

    return res.status(500).json({
      message: 'Could not retrieve triage assessments.',
    });
  }
});

module.exports = router;
