const express = require('express');

const router = express.Router();

// Check whether a staff member is logged in.
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({
      message: 'Please log in to access the dashboard.',
    });
  }

  next();
}

const RECENT_ACTIVITY_LIMIT = 6;

// "Today" depends on the hospital's local timezone. The browser sends its
// IANA timezone (e.g. Asia/Kolkata); anything invalid falls back to UTC.
function resolveTimezone(value) {
  if (
    typeof value !== 'string' ||
    !/^[A-Za-z0-9_+\-/]{1,64}$/.test(value)
  ) {
    return 'UTC';
  }

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return value;
  } catch {
    return 'UTC';
  }
}

// GET /api/dashboard/summary?timezone=Asia/Kolkata
// Real-time hospital overview built from patient_visits,
// patients and triage_assessments.
router.get('/summary', requireAuth, async (req, res) => {
  const pool = req.app.locals.pool;
  const timezone = resolveTimezone(req.query.timezone);

  try {
    const [statsResult, activityResult, workloadResult] = await Promise.all([
      // Counts use DISTINCT patient_id, so a patient with more than one
      // visit is only counted once. Visit counts are returned alongside.
      pool.query(
        `
          WITH today AS (
            SELECT
              (DATE_TRUNC('day', NOW() AT TIME ZONE $1) AT TIME ZONE $1)
                AS start_of_day
          ),
          active AS (
            SELECT
              pv.patient_id,
              pv.status,
              pv.visit_type,
              pv.department,
              EXISTS (
                SELECT 1
                FROM triage_assessments ta
                WHERE ta.visit_id = pv.id
              ) AS is_triaged
            FROM patient_visits pv
            WHERE pv.status IN ('waiting', 'in_progress')
          )
          SELECT
            (
              SELECT COUNT(DISTINCT patient_id)
              FROM patient_visits, today
              WHERE created_at >= today.start_of_day
            )::INTEGER AS patients_today,
            (
              SELECT COUNT(*)
              FROM patient_visits, today
              WHERE created_at >= today.start_of_day
            )::INTEGER AS visits_today,
            (
              SELECT COUNT(DISTINCT patient_id)
              FROM active
              WHERE status = 'waiting'
            )::INTEGER AS waiting_patients,
            (
              SELECT COUNT(DISTINCT patient_id)
              FROM active
              WHERE status = 'in_progress'
            )::INTEGER AS in_consultation_patients,
            (
              SELECT COUNT(DISTINCT patient_id)
              FROM active
              WHERE visit_type = 'emergency'
            )::INTEGER AS emergency_active,
            (
              SELECT COUNT(DISTINCT patient_id)
              FROM active
              WHERE visit_type = 'emergency' AND status = 'waiting'
            )::INTEGER AS emergency_waiting,
            (
              SELECT COUNT(DISTINCT COALESCE(NULLIF(TRIM(department), ''), 'Unassigned'))
              FROM active
            )::INTEGER AS active_departments,
            (
              SELECT COUNT(DISTINCT patient_id)
              FROM active
              WHERE NOT is_triaged
            )::INTEGER AS awaiting_triage;
        `,
        [timezone]
      ),

      // Most recent event per visit: completion, consultation start or
      // registration. Only staff-relevant fields are returned (no phone
      // number or date of birth).
      pool.query(
        `
          SELECT
            pv.id AS visit_id,
            pv.patient_id,
            p.patient_number,
            p.full_name,
            pv.department,
            pv.visit_type,
            pv.status,
            pv.created_at AS arrival_time,
            ta.triage_priority,
            CASE
              WHEN pv.completed_at IS NOT NULL THEN 'completed'
              WHEN pv.consultation_started_at IS NOT NULL THEN 'consultation_started'
              ELSE 'registered'
            END AS activity_type,
            COALESCE(
              pv.completed_at,
              pv.consultation_started_at,
              pv.created_at
            ) AS activity_at
          FROM patient_visits pv
          INNER JOIN patients p
            ON p.id = pv.patient_id
          LEFT JOIN LATERAL (
            SELECT triage_priority
            FROM triage_assessments
            WHERE visit_id = pv.id
            ORDER BY created_at DESC, id DESC
            LIMIT 1
          ) ta ON TRUE
          ORDER BY activity_at DESC, pv.id DESC
          LIMIT $1;
        `,
        [RECENT_ACTIVITY_LIMIT]
      ),

      // Current workload per department, from active visits only.
      // Departments come from patient_visits.department until Phase 4
      // introduces managed departments.
      pool.query(
        `
          SELECT
            COALESCE(NULLIF(TRIM(department), ''), 'Unassigned') AS department,
            COUNT(DISTINCT patient_id) FILTER (WHERE status = 'waiting')::INTEGER
              AS waiting,
            COUNT(DISTINCT patient_id) FILTER (WHERE status = 'in_progress')::INTEGER
              AS in_consultation,
            COUNT(DISTINCT patient_id)::INTEGER AS total
          FROM patient_visits
          WHERE status IN ('waiting', 'in_progress')
          GROUP BY 1
          ORDER BY total DESC, department ASC;
        `
      ),
    ]);

    const stats = statsResult.rows[0];

    return res.json({
      generatedAt: new Date().toISOString(),
      timezone,
      stats: {
        patientsToday: stats.patients_today,
        visitsToday: stats.visits_today,
        waitingPatients: stats.waiting_patients,
        inConsultationPatients: stats.in_consultation_patients,
        emergencyActive: stats.emergency_active,
        emergencyWaiting: stats.emergency_waiting,
        activeDepartments: stats.active_departments,
        awaitingTriage: stats.awaiting_triage,
      },
      recentActivity: activityResult.rows,
      departmentWorkload: workloadResult.rows,
    });
  } catch (error) {
    console.error('Could not load dashboard summary:', error.message);

    return res.status(500).json({
      message: 'Could not load dashboard information.',
    });
  }
});

module.exports = router;
