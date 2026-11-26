const express = require('express');
const { requirePermission } = require('../lib/auth');

const router = express.Router();

// Per-department figures. Workload counts distinct patients with active
// visits; total_visits counts every visit ever recorded for the department.
const DEPARTMENT_WITH_WORKLOAD_SQL = `
  SELECT
    d.id,
    d.name,
    d.is_active,
    d.created_at,
    d.updated_at,
    COUNT(DISTINCT pv.patient_id)
      FILTER (WHERE pv.status = 'waiting')::INTEGER AS waiting,
    COUNT(DISTINCT pv.patient_id)
      FILTER (WHERE pv.status = 'in_progress')::INTEGER AS in_consultation,
    COUNT(DISTINCT pv.patient_id)
      FILTER (WHERE pv.status IN ('waiting', 'in_progress'))::INTEGER AS total_active,
    COUNT(pv.id)::INTEGER AS total_visits
  FROM departments d
  LEFT JOIN patient_visits pv
    ON pv.department_id = d.id
`;

function parseId(value) {
  const id = Number(value);

  return Number.isInteger(id) && id > 0 ? id : null;
}

// Trim, collapse inner whitespace and validate a department name.
// Returns { name } or { error }.
function normaliseName(value) {
  if (typeof value !== 'string') {
    return { error: 'Department name is required.' };
  }

  const name = value.trim().replace(/\s+/g, ' ');

  if (name.length < 2 || name.length > 100) {
    return { error: 'Department name must be between 2 and 100 characters.' };
  }

  if (!/^[A-Za-z0-9][A-Za-z0-9 &()/.,'-]*$/.test(name)) {
    return {
      error:
        'Department name may only contain letters, numbers, spaces and & ( ) / . , \' -',
    };
  }

  return { name };
}

function sendDuplicateNameError(res) {
  return res.status(409).json({
    message: 'A department with this name already exists.',
  });
}

// GET /api/departments?status=active|all
// List departments with their current workload. Inactive departments are
// included unless status=active (used by the registration form).
router.get('/', requirePermission('departments.view'), async (req, res) => {
  const pool = req.app.locals.pool;
  const status = req.query.status || 'all';

  if (!['active', 'all'].includes(status)) {
    return res.status(400).json({
      message: 'status must be "active" or "all".',
    });
  }

  try {
    const result = await pool.query(
      `
        ${DEPARTMENT_WITH_WORKLOAD_SQL}
        WHERE ($1::BOOLEAN IS FALSE OR d.is_active)
        GROUP BY d.id
        ORDER BY d.is_active DESC, LOWER(d.name) ASC;
      `,
      [status === 'active']
    );

    return res.json({ departments: result.rows });
  } catch (error) {
    console.error('Could not retrieve departments:', error.message);

    return res.status(500).json({
      message: 'Could not retrieve departments.',
    });
  }
});

// GET /api/departments/workload
// Current workload for every active department (including those with no
// patients) plus any inactive department that still has active patients.
router.get('/workload', requirePermission('departments.view'), async (req, res) => {
  const pool = req.app.locals.pool;

  try {
    const result = await pool.query(`
      ${DEPARTMENT_WITH_WORKLOAD_SQL}
      GROUP BY d.id
      HAVING d.is_active
        OR COUNT(pv.id) FILTER (WHERE pv.status IN ('waiting', 'in_progress')) > 0
      ORDER BY total_active DESC, LOWER(d.name) ASC;
    `);

    return res.json({ departments: result.rows });
  } catch (error) {
    console.error('Could not retrieve department workload:', error.message);

    return res.status(500).json({
      message: 'Could not retrieve department workload.',
    });
  }
});

// POST /api/departments
// Body: { name }
router.post('/', requirePermission('departments.manage'), async (req, res) => {
  const pool = req.app.locals.pool;
  const { name, error } = normaliseName(req.body?.name);

  if (error) {
    return res.status(400).json({ message: error });
  }

  try {
    const result = await pool.query(
      `
        INSERT INTO departments (name)
        VALUES ($1)
        RETURNING id, name, is_active, created_at, updated_at;
      `,
      [name]
    );

    return res.status(201).json({
      message: `Department "${name}" created.`,
      department: result.rows[0],
    });
  } catch (dbError) {
    if (dbError.code === '23505') {
      return sendDuplicateNameError(res);
    }

    console.error('Could not create department:', dbError.message);

    return res.status(500).json({
      message: 'Could not create the department.',
    });
  }
});

// PATCH /api/departments/:id
// Body: { name?, isActive? } — rename and/or activate/deactivate.
// Departments are never deleted, so historical visits stay linked.
router.patch('/:id', requirePermission('departments.manage'), async (req, res) => {
  const pool = req.app.locals.pool;
  const id = parseId(req.params.id);
  const body = req.body || {};

  if (!id) {
    return res.status(400).json({ message: 'Invalid department ID.' });
  }

  const hasName = body.name !== undefined;
  const hasActive = body.isActive !== undefined;

  if (!hasName && !hasActive) {
    return res.status(400).json({
      message: 'Provide a new name or an active status to update.',
    });
  }

  let name = null;

  if (hasName) {
    const normalised = normaliseName(body.name);

    if (normalised.error) {
      return res.status(400).json({ message: normalised.error });
    }

    name = normalised.name;
  }

  if (hasActive && typeof body.isActive !== 'boolean') {
    return res.status(400).json({
      message: 'isActive must be true or false.',
    });
  }

  try {
    const result = await pool.query(
      `
        UPDATE departments
        SET
          name = COALESCE($2, name),
          is_active = COALESCE($3, is_active),
          updated_at = NOW()
        WHERE id = $1
        RETURNING id, name, is_active, created_at, updated_at;
      `,
      [id, name, hasActive ? body.isActive : null]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Department not found.' });
    }

    const department = result.rows[0];

    return res.json({
      message: hasActive && !hasName
        ? `Department "${department.name}" ${department.is_active ? 'activated' : 'deactivated'}.`
        : `Department "${department.name}" updated.`,
      department,
    });
  } catch (dbError) {
    if (dbError.code === '23505') {
      return sendDuplicateNameError(res);
    }

    console.error('Could not update department:', dbError.message);

    return res.status(500).json({
      message: 'Could not update the department.',
    });
  }
});

module.exports = router;
