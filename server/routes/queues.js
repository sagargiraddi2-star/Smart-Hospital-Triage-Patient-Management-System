const express = require('express');

const router = express.Router();

// Check whether a staff member is logged in.
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({
      message: 'Please log in to access patient queues.',
    });
  }

  next();
}

// GET /api/queues
// Retrieve all active patient visits with their latest triage assessment.
router.get('/', requireAuth, async (req, res) => {
  const pool = req.app.locals.pool;

  try {
    const result = await pool.query(`
      SELECT
        pv.id AS visit_id,
        pv.patient_id,
        p.patient_number,
        p.full_name,
        p.date_of_birth,
        p.gender,
        pv.department,
        pv.visit_type,
        pv.status,
        pv.created_at AS arrival_time,

        ta.id AS assessment_id,
        ta.chief_complaint,
        ta.triage_priority,
        ta.created_at AS assessment_time

      FROM patient_visits pv

      INNER JOIN patients p
        ON pv.patient_id = p.id

      LEFT JOIN LATERAL (
        SELECT
          id,
          chief_complaint,
          triage_priority,
          created_at
        FROM triage_assessments
        WHERE visit_id = pv.id
        ORDER BY created_at DESC
        LIMIT 1
      ) ta ON TRUE

      WHERE pv.status IN ('waiting', 'in_progress')

      ORDER BY
        CASE ta.triage_priority
          WHEN 'critical' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          WHEN 'low' THEN 4
          ELSE 5
        END,
        pv.created_at ASC;
    `);

    res.json({
      queues: result.rows,
    });

  } catch (error) {
    console.error('Could not retrieve patient queues:', error.message);

    res.status(500).json({
      message: 'Could not retrieve patient queues.',
    });
  }
});

// GET /api/queues/completed
// Retrieve all completed patient visits.
router.get('/completed', requireAuth, async (req, res) => {
  const pool = req.app.locals.pool;

  try {
    const result = await pool.query(`
      SELECT
        pv.id AS visit_id,
        pv.patient_id,
        p.patient_number,
        p.full_name,
        p.date_of_birth,
        p.gender,
        pv.department,
        pv.visit_type,
        pv.status,
        pv.created_at AS arrival_time,

        ta.id AS assessment_id,
        ta.chief_complaint,
        ta.triage_priority,
        ta.created_at AS assessment_time

      FROM patient_visits pv

      INNER JOIN patients p
        ON pv.patient_id = p.id

      LEFT JOIN LATERAL (
        SELECT
          id,
          chief_complaint,
          triage_priority,
          created_at
        FROM triage_assessments
        WHERE visit_id = pv.id
        ORDER BY created_at DESC
        LIMIT 1
      ) ta ON TRUE

      WHERE pv.status = 'completed'

      ORDER BY pv.created_at DESC;
    `);

    res.json({
      visits: result.rows,
    });

  } catch (error) {
    console.error('Could not retrieve completed visits:', error.message);

    res.status(500).json({
      message: 'Could not retrieve completed visits.',
    });
  }
});

// PATCH /api/queues/:visitId/status
// Update a patient's visit status.
router.patch('/:visitId/status', requireAuth, async (req, res) => {
  const pool = req.app.locals.pool;

  const visitId = Number(req.params.visitId);
  const { status } = req.body;

  try {
    // Check whether the visit ID is valid.
    if (!Number.isInteger(visitId) || visitId <= 0) {
      return res.status(400).json({
        message: 'Invalid visit ID.',
      });
    }

    // Only allow these status transitions.
    let previousStatus;

    if (status === 'in_progress') {
      previousStatus = 'waiting';
    } else if (status === 'completed') {
      previousStatus = 'in_progress';
    } else {
      return res.status(400).json({
        message: 'Invalid status update.',
      });
    }

    // Update only if the visit is currently in the expected status.
    const result = await pool.query(
      `
        UPDATE patient_visits
        SET status = $1
        WHERE id = $2
          AND status = $3
        RETURNING id, patient_id, status;
      `,
      [status, visitId, previousStatus]
    );

    if (result.rows.length === 0) {
      const existingVisit = await pool.query(
        'SELECT id, status FROM patient_visits WHERE id = $1',
        [visitId]
      );

      if (existingVisit.rows.length === 0) {
        return res.status(404).json({
          message: 'Patient visit not found.',
        });
      }

      return res.status(409).json({
        message: `This visit cannot be changed from ${existingVisit.rows[0].status} to ${status}.`,
      });
    }

    res.json({
      message: 'Patient visit status updated successfully.',
      visit: result.rows[0],
    });

  } catch (error) {
    console.error('Could not update patient visit status:', error.message);

    res.status(500).json({
      message: 'Could not update patient visit status.',
    });
  }
});

module.exports = router;