
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

    // Optional (Phase 6): the staff decision about a simulated AI
    // suggestion, recorded together with this assessment.
    const aiDecision = parseAiDecision(req.body.aiSuggestion);

    if (aiDecision.error) {
      return res.status(400).json({ message: aiDecision.error });
    }

    const assessment = await withTransaction(pool, (client) =>
      saveAssessment(client, {
        visitId: Number(visitId),
        userId: req.session.userId,
        aiDecision,
        values: {
          chiefComplaint: chiefComplaint.trim(),
          symptoms,
          temperatureC,
          heartRateBpm,
          systolicBp,
          diastolicBp,
          respiratoryRate,
          oxygenSaturation,
          triagePriority,
          clinicalNotes,
        },
      })
    );

    return res.status(201).json({
      message: 'Triage assessment saved successfully.',
      assessment,
    });
  } catch (error) {
    if (error instanceof TriageRequestError) {
      return res.status(error.status).json({
        message: error.message,
        ...error.details,
      });
    }

    console.error('Error saving triage assessment:', error.message);

    return res.status(500).json({
      message: 'Could not save triage assessment.',
    });
  }
});

class TriageRequestError extends Error {
  constructor(status, message, details = {}) {
    super(message);
    this.status = status;
    this.details = details;
  }
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

// Validate the optional aiSuggestion field:
// { id, decision: 'accepted' | 'overridden', overrideReason? }
// Discarding is recorded separately and never goes through this route.
function parseAiDecision(value) {
  if (value === undefined || value === null) {
    return { none: true };
  }

  if (typeof value !== 'object') {
    return { error: 'Invalid simulated suggestion decision.' };
  }

  const id = Number(value.id);

  if (!Number.isInteger(id) || id <= 0) {
    return { error: 'Invalid simulated suggestion ID.' };
  }

  if (!['accepted', 'overridden'].includes(value.decision)) {
    return {
      error: 'The simulated suggestion must be accepted or overridden before saving.',
    };
  }

  let overrideReason = null;

  if (value.overrideReason !== undefined && value.overrideReason !== null) {
    if (typeof value.overrideReason !== 'string' || value.overrideReason.length > 500) {
      return { error: 'Override reason must be text of 500 characters or fewer.' };
    }

    overrideReason = value.overrideReason.trim() || null;
  }

  if (overrideReason && value.decision !== 'overridden') {
    return { error: 'A reason can only be given when overriding.' };
  }

  return { id, decision: value.decision, overrideReason };
}

// Save one assessment inside a transaction. When a simulated suggestion
// decision is supplied, it is checked and linked in the same transaction,
// so either both are saved or neither is.
async function saveAssessment(client, { visitId, userId, aiDecision, values }) {
  // Confirm that the visit exists and read its current priority.
  const visitResult = await client.query(
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
    [visitId]
  );

  if (visitResult.rows.length === 0) {
    throw new TriageRequestError(404, 'Patient visit not found.');
  }

  // Lock and check the simulated suggestion before saving anything.
  let suggestion = null;

  if (!aiDecision.none) {
    const suggestionResult = await client.query(
      'SELECT * FROM ai_triage_suggestions WHERE id = $1 FOR UPDATE',
      [aiDecision.id]
    );

    suggestion = suggestionResult.rows[0];

    if (!suggestion) {
      throw new TriageRequestError(404, 'Simulated suggestion not found.');
    }

    if (suggestion.visit_id !== visitId) {
      throw new TriageRequestError(
        400,
        'The simulated suggestion belongs to a different visit.'
      );
    }

    // Already decided: this protects against duplicate saves when a
    // previous save succeeded but its response was lost.
    if (suggestion.decision !== null) {
      throw new TriageRequestError(
        409,
        `A decision (${suggestion.decision}) has already been recorded for this simulated suggestion.`,
        {
          alreadyDecided: true,
          decision: suggestion.decision,
          assessmentId: suggestion.assessment_id,
        }
      );
    }

    if (!suggestion.can_suggest) {
      throw new TriageRequestError(
        400,
        'This simulated response has no suggested priority; it can only be discarded.'
      );
    }

    const matches = values.triagePriority === suggestion.suggested_priority;

    if (aiDecision.decision === 'accepted' && !matches) {
      throw new TriageRequestError(
        400,
        'An accepted suggestion must use the suggested priority. Choose "Override" to select a different priority.'
      );
    }

    if (aiDecision.decision === 'overridden' && matches) {
      throw new TriageRequestError(
        400,
        'The selected priority matches the suggestion. Choose "Accept" instead of "Override".'
      );
    }
  }

  // Save the assessment.
  const result = await client.query(
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
      visitId,
      userId,
      values.chiefComplaint,
      values.symptoms || null,
      values.temperatureC || null,
      values.heartRateBpm || null,
      values.systolicBp || null,
      values.diastolicBp || null,
      values.respiratoryRate || null,
      values.oxygenSaturation || null,
      values.triagePriority,
      values.clinicalNotes || null,
    ]
  );

  // A manual queue position belongs to the previous priority group.
  // If this assessment changed the priority, the patient joins the end
  // of the new group's manual order (same rule as queue priority edits).
  if (visitResult.rows[0].current_priority !== values.triagePriority) {
    await client.query(
      'UPDATE patient_visits SET queue_position = NULL WHERE id = $1',
      [visitId]
    );
  }

  // Record the staff decision and link it to the saved assessment.
  // The original simulated response columns are never modified.
  if (suggestion) {
    await client.query(
      `
        UPDATE ai_triage_suggestions
        SET
          decision = $2,
          final_priority = $3,
          override_reason = $4,
          decided_by = $5,
          decided_at = NOW(),
          assessment_id = $6
        WHERE id = $1
          AND decision IS NULL;
      `,
      [
        suggestion.id,
        aiDecision.decision,
        values.triagePriority,
        aiDecision.overrideReason,
        userId,
        result.rows[0].id,
      ]
    );
  }

  return result.rows[0];
}

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
          u.full_name AS assessed_by_name,
          -- 1 = initial assessment, 2+ = reassessments. Priority changes
          -- made from the queue are not full assessments and get no number.
          CASE
            WHEN ta.entry_type = 'assessment' THEN
              ROW_NUMBER() OVER (
                PARTITION BY ta.entry_type
                ORDER BY ta.created_at ASC, ta.id ASC
              )
          END AS assessment_number
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
