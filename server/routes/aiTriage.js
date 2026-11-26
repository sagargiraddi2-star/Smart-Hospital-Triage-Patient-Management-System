const express = require('express');
const aiTriage = require('../lib/aiTriage');

const router = express.Router();

// Check whether a staff member is logged in.
// Role-based restrictions are planned for Phase 7.
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({
      message: 'Please log in to use the simulated AI demonstration.',
    });
  }

  next();
}

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// GET /api/ai-triage/status
// Describes the (simulated) provider and the available demo scenarios.
router.get('/status', requireAuth, (req, res) => {
  res.json({
    provider: aiTriage.PROVIDER_NAME,
    simulated: true,
    disclaimer: aiTriage.DISCLAIMER,
    scenarios: aiTriage.listScenarios(),
  });
});

// POST /api/ai-triage/suggestions
// Body: { visitId, scenarioKey, blankFields: [field names] }
// Produces a simulated suggestion for the staff-selected scenario and
// saves the request and response immediately. It never creates an
// assessment and never changes a patient's priority.
router.post('/suggestions', requireAuth, async (req, res) => {
  const pool = req.app.locals.pool;
  const { visitId, scenarioKey, blankFields = [] } = req.body || {};
  const parsedVisitId = parseId(visitId);

  if (!parsedVisitId) {
    return res.status(400).json({ message: 'A valid visit ID is required.' });
  }

  if (!aiTriage.isKnownScenario(scenarioKey)) {
    return res.status(400).json({
      message: 'Please choose one of the demonstration scenarios.',
    });
  }

  if (
    !Array.isArray(blankFields) ||
    blankFields.length > 20 ||
    !blankFields.every(aiTriage.isKnownFormField)
  ) {
    return res.status(400).json({ message: 'Invalid list of blank fields.' });
  }

  try {
    const visitResult = await pool.query(
      'SELECT id FROM patient_visits WHERE id = $1',
      [parsedVisitId]
    );

    if (!visitResult.rows[0]) {
      return res.status(404).json({ message: 'Patient visit not found.' });
    }

    const suggestion = aiTriage.getSuggestion({
      scenarioKey,
      blankFields: [...new Set(blankFields)],
    });

    const result = await pool.query(
      `
        INSERT INTO ai_triage_suggestions (
          visit_id, requested_by, provider, is_simulated, scenario_key,
          can_suggest, suggested_priority, explanation,
          considered, missing_information, blank_fields
        )
        VALUES ($1, $2, $3, TRUE, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *;
      `,
      [
        parsedVisitId,
        req.session.userId,
        suggestion.provider,
        suggestion.scenarioKey,
        suggestion.canSuggest,
        suggestion.suggestedPriority,
        suggestion.explanation,
        JSON.stringify(suggestion.considered),
        JSON.stringify(suggestion.missingInformation),
        JSON.stringify(suggestion.blankFields),
      ]
    );

    return res.status(201).json({
      disclaimer: aiTriage.DISCLAIMER,
      suggestion: result.rows[0],
    });
  } catch (error) {
    console.error('Could not create simulated suggestion:', error.message);

    return res.status(500).json({
      message: 'Could not create the simulated suggestion.',
    });
  }
});

// POST /api/ai-triage/suggestions/:id/discard
// Records that staff discarded the suggestion. Allowed only once, and only
// while no decision has been recorded.
router.post('/suggestions/:id/discard', requireAuth, async (req, res) => {
  const pool = req.app.locals.pool;
  const id = parseId(req.params.id);

  if (!id) {
    return res.status(400).json({ message: 'Invalid suggestion ID.' });
  }

  try {
    const result = await pool.query(
      `
        UPDATE ai_triage_suggestions
        SET
          decision = 'discarded',
          decided_by = $2,
          decided_at = NOW()
        WHERE id = $1
          AND decision IS NULL
        RETURNING *;
      `,
      [id, req.session.userId]
    );

    if (!result.rows[0]) {
      const existing = await pool.query(
        'SELECT decision FROM ai_triage_suggestions WHERE id = $1',
        [id]
      );

      if (!existing.rows[0]) {
        return res.status(404).json({ message: 'Suggestion not found.' });
      }

      return res.status(409).json({
        message: `A decision (${existing.rows[0].decision}) has already been recorded for this suggestion.`,
        alreadyDecided: true,
        decision: existing.rows[0].decision,
      });
    }

    return res.json({
      message: 'Simulated suggestion discarded.',
      suggestion: result.rows[0],
    });
  } catch (error) {
    console.error('Could not discard simulated suggestion:', error.message);

    return res.status(500).json({
      message: 'Could not discard the simulated suggestion.',
    });
  }
});

// GET /api/ai-triage/visits/:visitId/suggestions
// All simulated suggestions for a visit, newest first, including
// discarded and unused ones.
router.get('/visits/:visitId/suggestions', requireAuth, async (req, res) => {
  const pool = req.app.locals.pool;
  const visitId = parseId(req.params.visitId);

  if (!visitId) {
    return res.status(400).json({ message: 'Invalid visit ID.' });
  }

  try {
    const result = await pool.query(
      `
        SELECT
          s.*,
          requester.full_name AS requested_by_name,
          decider.full_name AS decided_by_name
        FROM ai_triage_suggestions s
        LEFT JOIN users requester ON requester.id = s.requested_by
        LEFT JOIN users decider ON decider.id = s.decided_by
        WHERE s.visit_id = $1
        ORDER BY s.requested_at DESC, s.id DESC;
      `,
      [visitId]
    );

    return res.json({ suggestions: result.rows });
  } catch (error) {
    console.error('Could not load simulated suggestions:', error.message);

    return res.status(500).json({
      message: 'Could not load simulated suggestions.',
    });
  }
});

module.exports = router;
