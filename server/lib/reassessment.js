// Reassessment status calculation, shared by the reassessment, dashboard
// and queue screens so they always agree.
//
// Rules (approved for Phase 5):
// - Only WAITING visits are considered.
// - The clock starts at the latest FULL assessment (entry_type 'assessment')
//   or the latest "Not required" decision, whichever is later. Priority
//   changes made from the queue do not restart the clock.
// - The interval comes from reassessment_settings for the patient's CURRENT
//   priority, and only if that setting is enabled. Otherwise the patient is
//   "not_configured" and is never labelled due or overdue.
// - due_soon: within the optional warning window before the due time.
//   due:      the due time has passed, within the optional grace period.
//   overdue:  past the grace period (immediately, if no grace is set).
// - One "Remind later" deferral is allowed per due cycle. A deferral only
//   hides the alert until its reminder time; it never changes the due time.

const ACTIVE_ALERT_STATES = ['due_soon', 'due', 'overdue'];

// $1: optional visit ID filter (NULL = every waiting visit).
const REASSESSMENT_STATUS_SQL = `
  WITH base AS (
    SELECT
      pv.id AS visit_id,
      pv.patient_id,
      p.patient_number,
      p.full_name,
      COALESCE(d.name, pv.department) AS department,
      pv.department_id,
      pv.visit_type,
      pv.created_at AS arrival_time,
      current_entry.triage_priority AS current_priority,
      full_assessments.first_at AS initial_assessment_at,
      full_assessments.last_at AS last_assessment_at,
      full_assessments.total AS full_assessment_count,
      not_required.last_at AS last_not_required_at
    FROM patient_visits pv
    INNER JOIN patients p
      ON p.id = pv.patient_id
    LEFT JOIN departments d
      ON d.id = pv.department_id
    LEFT JOIN LATERAL (
      SELECT triage_priority
      FROM triage_assessments
      WHERE visit_id = pv.id
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    ) current_entry ON TRUE
    LEFT JOIN LATERAL (
      SELECT
        MIN(created_at) AS first_at,
        MAX(created_at) AS last_at,
        COUNT(*)::INTEGER AS total
      FROM triage_assessments
      WHERE visit_id = pv.id
        AND entry_type = 'assessment'
    ) full_assessments ON TRUE
    LEFT JOIN LATERAL (
      SELECT MAX(created_at) AS last_at
      FROM reassessment_decisions
      WHERE visit_id = pv.id
        AND decision = 'not_required'
    ) not_required ON TRUE
    WHERE pv.status = 'waiting'
      AND ($1::INTEGER IS NULL OR pv.id = $1)
  ),
  timed AS (
    SELECT
      b.*,
      GREATEST(b.last_assessment_at, b.last_not_required_at) AS cycle_start_at,
      s.interval_minutes,
      s.due_soon_minutes,
      s.grace_minutes,
      COALESCE(s.is_enabled, FALSE) AS interval_enabled,
      CASE
        WHEN b.last_assessment_at IS NOT NULL
          AND s.is_enabled
          AND s.interval_minutes IS NOT NULL
        THEN GREATEST(b.last_assessment_at, b.last_not_required_at)
          + MAKE_INTERVAL(mins => s.interval_minutes)
      END AS due_at
    FROM base b
    LEFT JOIN reassessment_settings s
      ON s.priority = b.current_priority
  ),
  with_deferral AS (
    SELECT
      t.*,
      deferral.defer_until,
      deferral.created_at AS deferred_at,
      deferral.decided_by_name AS deferred_by_name
    FROM timed t
    LEFT JOIN LATERAL (
      SELECT rd.defer_until, rd.created_at, u.full_name AS decided_by_name
      FROM reassessment_decisions rd
      LEFT JOIN users u ON u.id = rd.decided_by
      WHERE rd.visit_id = t.visit_id
        AND rd.decision = 'deferred'
        -- Strictly after: a deferral needs an active alert, which only
        -- exists some time after the cycle started. A new cycle starting
        -- at the same instant as an old deferral must not inherit it.
        AND rd.created_at > t.cycle_start_at
      ORDER BY rd.created_at DESC, rd.id DESC
      LIMIT 1
    ) deferral ON TRUE
  )
  SELECT
    w.*,
    CASE
      WHEN w.last_assessment_at IS NULL THEN 'not_triaged'
      WHEN w.due_at IS NULL THEN 'not_configured'
      WHEN NOW() < w.due_at - MAKE_INTERVAL(mins => COALESCE(w.due_soon_minutes, 0))
        THEN 'not_due'
      WHEN NOW() < w.due_at THEN 'due_soon'
      WHEN NOW() < w.due_at + MAKE_INTERVAL(mins => COALESCE(w.grace_minutes, 0))
        THEN 'due'
      ELSE 'overdue'
    END AS alert_state,
    (w.defer_until IS NOT NULL) AS deferral_used,
    (w.defer_until IS NOT NULL AND w.defer_until > NOW()) AS is_snoozed
  FROM with_deferral w
`;

const STATE_ORDER = { overdue: 0, due: 1, due_soon: 2, not_due: 3, not_configured: 4, not_triaged: 5 };

// Sort most urgent first, then by due time, then arrival.
function sortByUrgency(rows) {
  return [...rows].sort((a, b) => {
    const state = STATE_ORDER[a.alert_state] - STATE_ORDER[b.alert_state];
    if (state !== 0) return state;

    const dueA = a.due_at ? new Date(a.due_at).getTime() : Infinity;
    const dueB = b.due_at ? new Date(b.due_at).getTime() : Infinity;
    if (dueA !== dueB) return dueA - dueB;

    return new Date(a.arrival_time) - new Date(b.arrival_time);
  });
}

function isActiveAlert(row) {
  return ACTIVE_ALERT_STATES.includes(row.alert_state);
}

// Count rows per state. Snoozed alerts are counted separately and are not
// included in the due_soon / due / overdue totals.
function summarise(rows) {
  const counts = {
    overdue: 0,
    due: 0,
    due_soon: 0,
    snoozed: 0,
    not_due: 0,
    not_configured: 0,
    not_triaged: 0,
  };

  for (const row of rows) {
    if (isActiveAlert(row) && row.is_snoozed) {
      counts.snoozed += 1;
    } else {
      counts[row.alert_state] += 1;
    }
  }

  return counts;
}

async function loadReassessmentStatus(db, visitId = null) {
  const result = await db.query(REASSESSMENT_STATUS_SQL, [visitId]);
  return sortByUrgency(result.rows);
}

async function loadSettings(db) {
  const result = await db.query(`
    SELECT
      s.priority,
      s.interval_minutes,
      s.due_soon_minutes,
      s.grace_minutes,
      s.is_enabled,
      s.approval_note,
      s.updated_at,
      u.full_name AS updated_by_name
    FROM reassessment_settings s
    LEFT JOIN users u ON u.id = s.updated_by
    ORDER BY CASE s.priority
      WHEN 'critical' THEN 1
      WHEN 'high' THEN 2
      WHEN 'medium' THEN 3
      ELSE 4
    END;
  `);

  return result.rows;
}

module.exports = {
  ACTIVE_ALERT_STATES,
  isActiveAlert,
  loadReassessmentStatus,
  loadSettings,
  summarise,
};
