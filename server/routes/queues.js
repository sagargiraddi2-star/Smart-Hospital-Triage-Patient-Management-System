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

const ALLOWED_PRIORITIES = ['critical', 'high', 'medium', 'low'];

// One transaction-scoped lock serialises queue-order and priority changes,
// so two staff members cannot interleave a reorder with a priority change.
const QUEUE_LOCK_SQL = "SELECT pg_advisory_xact_lock(hashtext('triora_queue_order'))";

// The latest entry in triage_assessments is the patient's current priority.
const LATEST_ASSESSMENT_SQL = `
  SELECT
    id,
    chief_complaint,
    triage_priority,
    created_at
  FROM triage_assessments
  WHERE visit_id = pv.id
  ORDER BY created_at DESC, id DESC
  LIMIT 1
`;

function parseVisitId(value) {
  const visitId = Number(value);

  return Number.isInteger(visitId) && visitId > 0 ? visitId : null;
}

// Run a callback inside a transaction on a dedicated connection.
async function withTransaction(pool, callback) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Errors that should reach the client with a specific status code.
class QueueRequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
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
        pv.consultation_started_at,
        pv.waiting_time_minutes,
        pv.priority_at_consultation,
        pv.queue_position,

        ta.id AS assessment_id,
        ta.chief_complaint,
        ta.triage_priority,
        ta.created_at AS assessment_time

      FROM patient_visits pv

      INNER JOIN patients p
        ON pv.patient_id = p.id

      LEFT JOIN LATERAL (${LATEST_ASSESSMENT_SQL}) ta ON TRUE

      WHERE pv.status IN ('waiting', 'in_progress')

      -- Queue order: clinical priority first. Within a priority group,
      -- patients already in consultation come first, then waiting
      -- patients in their manually set order, then by arrival time.
      ORDER BY
        CASE ta.triage_priority
          WHEN 'critical' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          WHEN 'low' THEN 4
          ELSE 5
        END,
        CASE WHEN pv.status = 'in_progress' THEN 0 ELSE 1 END,
        pv.queue_position ASC NULLS LAST,
        pv.created_at ASC,
        pv.id ASC;
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
        pv.consultation_started_at,
        pv.completed_at,
        pv.waiting_time_minutes,
        pv.priority_at_consultation,

        ta.id AS assessment_id,
        ta.chief_complaint,
        ta.triage_priority,
        ta.created_at AS assessment_time

      FROM patient_visits pv

      INNER JOIN patients p
        ON pv.patient_id = p.id

      LEFT JOIN LATERAL (${LATEST_ASSESSMENT_SQL}) ta ON TRUE

      WHERE pv.status = 'completed'

      -- Most recently completed first. Older visits completed before
      -- completion times were recorded fall back to arrival time.
      ORDER BY
        pv.completed_at DESC NULLS LAST,
        pv.created_at DESC;
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
    // The status check in WHERE makes duplicate clicks and concurrent
    // updates safe: only the first one matches, the rest get a 409.
    //
    // Starting a consultation freezes the waiting time (arrival until now)
    // and records the latest staff-assigned priority. If the visit has no
    // triage assessment, the priority is stored as NULL (never invented).
    const result =
      status === 'in_progress'
        ? await pool.query(
            `
              UPDATE patient_visits pv
              SET
                status = 'in_progress',
                consultation_started_at = NOW(),
                consultation_started_by = $2,
                waiting_time_minutes = GREATEST(
                  0,
                  FLOOR(EXTRACT(EPOCH FROM (NOW() - pv.created_at)) / 60)
                )::INTEGER,
                priority_at_consultation = (
                  SELECT triage_priority
                  FROM triage_assessments
                  WHERE visit_id = pv.id
                  ORDER BY created_at DESC, id DESC
                  LIMIT 1
                )
              WHERE pv.id = $1
                AND pv.status = $3
              RETURNING
                pv.id,
                pv.patient_id,
                pv.status,
                pv.consultation_started_at,
                pv.waiting_time_minutes,
                pv.priority_at_consultation;
            `,
            [visitId, req.session.userId, previousStatus]
          )
        : await pool.query(
            `
              UPDATE patient_visits
              SET
                status = 'completed',
                completed_at = NOW(),
                completed_by = $2
              WHERE id = $1
                AND status = $3
              RETURNING
                id,
                patient_id,
                status,
                consultation_started_at,
                completed_at,
                waiting_time_minutes,
                priority_at_consultation;
            `,
            [visitId, req.session.userId, previousStatus]
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

// PATCH /api/queues/:visitId/priority
// Change a patient's staff-assigned priority from the queue.
// Body: { priority: 'critical' | 'high' | 'medium' | 'low' }
//
// The change is stored as a new 'priority_update' entry in
// triage_assessments, so earlier assessments are never overwritten.
// Vital signs are not copied, because none were measured for this entry.
router.patch('/:visitId/priority', requireAuth, async (req, res) => {
  const pool = req.app.locals.pool;
  const visitId = parseVisitId(req.params.visitId);
  const { priority } = req.body || {};

  if (!visitId) {
    return res.status(400).json({ message: 'Invalid visit ID.' });
  }

  if (!ALLOWED_PRIORITIES.includes(priority)) {
    return res.status(400).json({
      message: 'Please select a valid triage priority.',
    });
  }

  try {
    const assessment = await withTransaction(pool, async (client) => {
      await client.query(QUEUE_LOCK_SQL);

      const visitResult = await client.query(
        'SELECT id, status FROM patient_visits WHERE id = $1 FOR UPDATE',
        [visitId]
      );

      const visit = visitResult.rows[0];

      if (!visit) {
        throw new QueueRequestError(404, 'Patient visit not found.');
      }

      if (visit.status === 'completed') {
        throw new QueueRequestError(
          409,
          'The priority of a completed visit cannot be changed.'
        );
      }

      const latestResult = await client.query(
        `
          SELECT chief_complaint, triage_priority
          FROM triage_assessments
          WHERE visit_id = $1
          ORDER BY created_at DESC, id DESC
          LIMIT 1
        `,
        [visitId]
      );

      const latest = latestResult.rows[0];

      if (!latest) {
        throw new QueueRequestError(
          409,
          'This patient has not been triaged yet. Record a triage assessment first.'
        );
      }

      if (latest.triage_priority === priority) {
        throw new QueueRequestError(
          409,
          'The patient already has this priority.'
        );
      }

      const insertResult = await client.query(
        `
          INSERT INTO triage_assessments (
            visit_id,
            assessed_by,
            chief_complaint,
            triage_priority,
            entry_type,
            previous_priority
          )
          VALUES ($1, $2, $3, $4, 'priority_update', $5)
          RETURNING *;
        `,
        [
          visitId,
          req.session.userId,
          latest.chief_complaint,
          priority,
          latest.triage_priority,
        ]
      );

      // A manual position belongs to the old priority group. Clear it so
      // the patient joins the end of the new group's manual order.
      await client.query(
        'UPDATE patient_visits SET queue_position = NULL WHERE id = $1',
        [visitId]
      );

      return insertResult.rows[0];
    });

    return res.json({
      message: 'Priority updated successfully.',
      assessment,
    });
  } catch (error) {
    if (error instanceof QueueRequestError) {
      return res.status(error.status).json({ message: error.message });
    }

    console.error('Could not update patient priority:', error.message);

    return res.status(500).json({
      message: 'Could not update patient priority.',
    });
  }
});

// PATCH /api/queues/:visitId/position
// Move a waiting patient one place up or down in the queue.
// Body: { direction: 'up' | 'down', expectedNeighborVisitId?: number }
//
// A patient can only swap places with the neighbouring waiting patient in
// the same queue (normal/emergency), the same department and the same
// priority. Clinical priority grouping is therefore never overridden.
// If expectedNeighborVisitId does not match the neighbour the server sees,
// someone else changed the queue first and the request is rejected (409).
router.patch('/:visitId/position', requireAuth, async (req, res) => {
  const pool = req.app.locals.pool;
  const visitId = parseVisitId(req.params.visitId);
  const { direction, expectedNeighborVisitId } = req.body || {};

  if (!visitId) {
    return res.status(400).json({ message: 'Invalid visit ID.' });
  }

  if (direction !== 'up' && direction !== 'down') {
    return res.status(400).json({
      message: 'Direction must be "up" or "down".',
    });
  }

  if (
    expectedNeighborVisitId !== undefined &&
    expectedNeighborVisitId !== null &&
    !parseVisitId(expectedNeighborVisitId)
  ) {
    return res.status(400).json({
      message: 'Invalid neighbouring visit ID.',
    });
  }

  try {
    const order = await withTransaction(pool, async (client) => {
      await client.query(QUEUE_LOCK_SQL);

      const targetResult = await client.query(
        `
          SELECT
            pv.id,
            pv.status,
            pv.visit_type,
            pv.department,
            ta.triage_priority
          FROM patient_visits pv
          LEFT JOIN LATERAL (${LATEST_ASSESSMENT_SQL}) ta ON TRUE
          WHERE pv.id = $1;
        `,
        [visitId]
      );

      const target = targetResult.rows[0];

      if (!target) {
        throw new QueueRequestError(404, 'Patient visit not found.');
      }

      if (target.status !== 'waiting') {
        throw new QueueRequestError(
          409,
          'Only waiting patients can be moved in the queue.'
        );
      }

      // Every waiting patient in the same group, in current queue order.
      const groupResult = await client.query(
        `
          SELECT pv.id
          FROM patient_visits pv
          LEFT JOIN LATERAL (${LATEST_ASSESSMENT_SQL}) ta ON TRUE
          WHERE pv.status = 'waiting'
            AND pv.visit_type = $1
            AND pv.department IS NOT DISTINCT FROM $2
            AND ta.triage_priority IS NOT DISTINCT FROM $3
          ORDER BY
            pv.queue_position ASC NULLS LAST,
            pv.created_at ASC,
            pv.id ASC
          FOR UPDATE OF pv;
        `,
        [target.visit_type, target.department, target.triage_priority]
      );

      const ids = groupResult.rows.map((row) => row.id);
      const index = ids.indexOf(visitId);
      const neighborIndex = direction === 'up' ? index - 1 : index + 1;

      if (index === -1 || neighborIndex < 0 || neighborIndex >= ids.length) {
        throw new QueueRequestError(
          409,
          direction === 'up'
            ? 'This patient is already first in their priority group.'
            : 'This patient is already last in their priority group.'
        );
      }

      if (
        expectedNeighborVisitId !== undefined &&
        expectedNeighborVisitId !== null &&
        Number(expectedNeighborVisitId) !== ids[neighborIndex]
      ) {
        throw new QueueRequestError(
          409,
          'The queue was changed by someone else. It has been refreshed; please try again.'
        );
      }

      [ids[index], ids[neighborIndex]] = [ids[neighborIndex], ids[index]];

      // Renumber the whole group 1..n so positions stay contiguous.
      await client.query(
        `
          UPDATE patient_visits pv
          SET queue_position = ordered.position::INTEGER
          FROM UNNEST($1::INTEGER[]) WITH ORDINALITY AS ordered(id, position)
          WHERE pv.id = ordered.id;
        `,
        [ids]
      );

      return ids;
    });

    return res.json({
      message: 'Queue order updated.',
      order,
    });
  } catch (error) {
    if (error instanceof QueueRequestError) {
      return res.status(error.status).json({ message: error.message });
    }

    console.error('Could not reorder patient queue:', error.message);

    return res.status(500).json({
      message: 'Could not update the queue order.',
    });
  }
});

module.exports = router;