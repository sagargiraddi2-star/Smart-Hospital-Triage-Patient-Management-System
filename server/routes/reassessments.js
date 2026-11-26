const express = require('express');
const { requirePermission, restrictPriority } = require('../lib/auth');
const {
  isActiveAlert,
  loadReassessmentStatus,
  loadSettings,
  summarise,
} = require('../lib/reassessment');

const router = express.Router();

const PRIORITIES = ['critical', 'high', 'medium', 'low'];
const MAX_MINUTES = 7 * 24 * 60; // sanity limit only, not a clinical value
const MAX_REASON_LENGTH = 500;

class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function parseVisitId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// Optional whole number of minutes: null/'' means "not set".
function parseOptionalMinutes(value, label, min) {
  if (value === undefined || value === null || value === '') return null;

  const minutes = Number(value);

  if (!Number.isInteger(minutes) || minutes < min || minutes > MAX_MINUTES) {
    throw new RequestError(
      400,
      `${label} must be a whole number of minutes between ${min} and ${MAX_MINUTES}.`
    );
  }

  return minutes;
}

function parseReason(value) {
  if (value === undefined || value === null) return null;

  if (typeof value !== 'string') {
    throw new RequestError(400, 'Reason must be text.');
  }

  const reason = value.trim();

  if (reason.length > MAX_REASON_LENGTH) {
    throw new RequestError(
      400,
      `Reason must be ${MAX_REASON_LENGTH} characters or fewer.`
    );
  }

  return reason || null;
}

function sendError(res, error, logMessage) {
  if (error instanceof RequestError) {
    return res.status(error.status).json({ message: error.message });
  }

  console.error(logMessage, error.message);

  return res.status(500).json({ message: 'Could not complete the request.' });
}

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

// Lock the visit and return its current reassessment state, which must be
// an active alert (due soon, due or overdue) for a decision to be recorded.
async function lockActiveAlert(client, visitId) {
  const visitResult = await client.query(
    'SELECT id, status FROM patient_visits WHERE id = $1 FOR UPDATE',
    [visitId]
  );

  if (!visitResult.rows[0]) {
    throw new RequestError(404, 'Patient visit not found.');
  }

  if (visitResult.rows[0].status !== 'waiting') {
    throw new RequestError(
      409,
      'Reassessment decisions can only be recorded for waiting patients.'
    );
  }

  const [row] = await loadReassessmentStatus(client, visitId);

  if (!row || !isActiveAlert(row)) {
    throw new RequestError(
      409,
      'This patient does not currently have a reassessment alert.'
    );
  }

  return row;
}

// GET /api/reassessments?view=active|snoozed|all
// active:  due soon, due and overdue alerts that are not snoozed.
// snoozed: alerts hidden by "Remind later" until their reminder time.
// all:     every waiting patient with their reassessment status.
router.get('/', requirePermission('reassessments.view'), async (req, res) => {
  const pool = req.app.locals.pool;
  const view = req.query.view || 'active';

  if (!['active', 'snoozed', 'all'].includes(view)) {
    return res.status(400).json({
      message: 'view must be "active", "snoozed" or "all".',
    });
  }

  try {
    const [rows, settings] = await Promise.all([
      loadReassessmentStatus(pool),
      loadSettings(pool),
    ]);

    const patients = rows.filter((row) => {
      if (view === 'all') return true;
      if (view === 'snoozed') return isActiveAlert(row) && row.is_snoozed;
      return isActiveAlert(row) && !row.is_snoozed;
    });

    return res.json({
      configured: settings.some((setting) => setting.is_enabled),
      settings,
      counts: summarise(rows),
      patients: restrictPriority(req, patients, ['current_priority']),
    });
  } catch (error) {
    return sendError(res, error, 'Could not load reassessments:');
  }
});

// GET /api/reassessments/settings
router.get('/settings', requirePermission('reassessments.settings.view'), async (req, res) => {
  try {
    return res.json({ settings: await loadSettings(req.app.locals.pool) });
  } catch (error) {
    return sendError(res, error, 'Could not load reassessment settings:');
  }
});

// PUT /api/reassessments/settings/:priority
// Body: { intervalMinutes, dueSoonMinutes, graceMinutes, isEnabled, approvalNote }
// Enabling a priority requires an interval and an approval note recording
// the clinical approval. Every change is stored in reassessment_setting_changes.
router.put('/settings/:priority', requirePermission('reassessments.settings.edit'), async (req, res) => {
  const pool = req.app.locals.pool;
  const { priority } = req.params;
  const body = req.body || {};

  try {
    if (!PRIORITIES.includes(priority)) {
      throw new RequestError(400, 'Unknown priority.');
    }

    if (typeof body.isEnabled !== 'boolean') {
      throw new RequestError(400, 'isEnabled must be true or false.');
    }

    const intervalMinutes = parseOptionalMinutes(body.intervalMinutes, 'Interval', 1);
    const dueSoonMinutes = parseOptionalMinutes(body.dueSoonMinutes, 'Due-soon warning', 1);
    const graceMinutes = parseOptionalMinutes(body.graceMinutes, 'Grace period', 0);
    const approvalNote = parseReason(body.approvalNote);

    if (dueSoonMinutes !== null && intervalMinutes !== null && dueSoonMinutes >= intervalMinutes) {
      throw new RequestError(400, 'The due-soon warning must be shorter than the interval.');
    }

    if (body.isEnabled && intervalMinutes === null) {
      throw new RequestError(400, 'An interval is required before this priority can be enabled.');
    }

    if (body.isEnabled && (!approvalNote || approvalNote.length < 5)) {
      throw new RequestError(
        400,
        'An approval note (who approved these values and the reference) is required before enabling.'
      );
    }

    const setting = await withTransaction(pool, async (client) => {
      const result = await client.query(
        `
          UPDATE reassessment_settings
          SET
            interval_minutes = $2,
            due_soon_minutes = $3,
            grace_minutes = $4,
            is_enabled = $5,
            approval_note = $6,
            updated_by = $7,
            updated_at = NOW()
          WHERE priority = $1
          RETURNING *;
        `,
        [priority, intervalMinutes, dueSoonMinutes, graceMinutes, body.isEnabled, approvalNote, req.session.userId]
      );

      await client.query(
        `
          INSERT INTO reassessment_setting_changes (
            priority, interval_minutes, due_soon_minutes, grace_minutes,
            is_enabled, approval_note, changed_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7);
        `,
        [priority, intervalMinutes, dueSoonMinutes, graceMinutes, body.isEnabled, approvalNote, req.session.userId]
      );

      return result.rows[0];
    });

    return res.json({
      message: `Reassessment setting for ${priority} priority saved.`,
      setting,
    });
  } catch (error) {
    return sendError(res, error, 'Could not save reassessment setting:');
  }
});

// POST /api/reassessments/:visitId/not-required
// Body: { reason? }
// Records that staff reviewed the patient and decided reassessment is not
// currently needed. This restarts the reassessment clock from now.
router.post('/:visitId/not-required', requirePermission('reassessments.decide'), async (req, res) => {
  const pool = req.app.locals.pool;
  const visitId = parseVisitId(req.params.visitId);

  try {
    if (!visitId) throw new RequestError(400, 'Invalid visit ID.');

    const reason = parseReason(req.body?.reason);

    const decision = await withTransaction(pool, async (client) => {
      const alert = await lockActiveAlert(client, visitId);

      const result = await client.query(
        `
          INSERT INTO reassessment_decisions (
            visit_id, decision, reason, due_at, priority, decided_by
          )
          VALUES ($1, 'not_required', $2, $3, $4, $5)
          RETURNING *;
        `,
        [visitId, reason, alert.due_at, alert.current_priority, req.session.userId]
      );

      return result.rows[0];
    });

    return res.status(201).json({
      message: 'Recorded: reassessment not required. The reassessment clock has restarted.',
      decision,
    });
  } catch (error) {
    return sendError(res, error, 'Could not record not-required decision:');
  }
});

// POST /api/reassessments/:visitId/defer
// Body: { until: ISO timestamp, reason? }
// "Remind later": hides the alert until the chosen time. Allowed once per
// due cycle and for at most one configured interval from now.
router.post('/:visitId/defer', requirePermission('reassessments.decide'), async (req, res) => {
  const pool = req.app.locals.pool;
  const visitId = parseVisitId(req.params.visitId);

  try {
    if (!visitId) throw new RequestError(400, 'Invalid visit ID.');

    const until = new Date(req.body?.until);

    if (typeof req.body?.until !== 'string' || Number.isNaN(until.getTime())) {
      throw new RequestError(400, 'Please choose a valid reminder time.');
    }

    const reason = parseReason(req.body?.reason);

    const decision = await withTransaction(pool, async (client) => {
      const alert = await lockActiveAlert(client, visitId);

      if (alert.deferral_used) {
        throw new RequestError(
          409,
          'This alert has already been deferred once in the current reassessment cycle.'
        );
      }

      const windowResult = await client.query(
        `
          SELECT
            $1::TIMESTAMPTZ > NOW() AS is_future,
            $1::TIMESTAMPTZ <= NOW() + MAKE_INTERVAL(mins => $2) AS within_limit
        `,
        [until.toISOString(), alert.interval_minutes]
      );

      const { is_future: isFuture, within_limit: withinLimit } = windowResult.rows[0];

      if (!isFuture) {
        throw new RequestError(400, 'The reminder time must be in the future.');
      }

      if (!withinLimit) {
        throw new RequestError(
          400,
          `The reminder time cannot be more than ${alert.interval_minutes} minutes from now (one reassessment interval).`
        );
      }

      const result = await client.query(
        `
          INSERT INTO reassessment_decisions (
            visit_id, decision, reason, defer_until, due_at, priority, decided_by
          )
          VALUES ($1, 'deferred', $2, $3, $4, $5, $6)
          RETURNING *;
        `,
        [visitId, reason, until.toISOString(), alert.due_at, alert.current_priority, req.session.userId]
      );

      return result.rows[0];
    });

    return res.status(201).json({
      message: 'Reminder set. The alert will reappear at the chosen time.',
      decision,
    });
  } catch (error) {
    return sendError(res, error, 'Could not defer reassessment alert:');
  }
});

// GET /api/reassessments/:visitId/history
// Decisions recorded for a visit, newest first.
router.get('/:visitId/history', requirePermission('clinical.view'), async (req, res) => {
  const pool = req.app.locals.pool;
  const visitId = parseVisitId(req.params.visitId);

  if (!visitId) {
    return res.status(400).json({ message: 'Invalid visit ID.' });
  }

  try {
    const result = await pool.query(
      `
        SELECT rd.*, u.full_name AS decided_by_name
        FROM reassessment_decisions rd
        LEFT JOIN users u ON u.id = rd.decided_by
        WHERE rd.visit_id = $1
        ORDER BY rd.created_at DESC, rd.id DESC;
      `,
      [visitId]
    );

    return res.json({ decisions: result.rows });
  } catch (error) {
    return sendError(res, error, 'Could not load reassessment history:');
  }
});

module.exports = router;
