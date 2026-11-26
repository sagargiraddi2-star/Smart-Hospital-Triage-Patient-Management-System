const express = require('express');
const { requirePermission } = require('../lib/auth');
const { ROLES } = require('../lib/permissions');

const router = express.Router();

class UserRequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// pending: registered, never approved. disabled: approved before, now off.
const STATUS_SQL = `
  CASE
    WHEN u.is_active THEN 'active'
    WHEN u.approved_at IS NULL THEN 'pending'
    ELSE 'disabled'
  END AS status
`;

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
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

// GET /api/users — all staff accounts (never password hashes).
router.get('/', requirePermission('users.manage'), async (req, res) => {
  try {
    const result = await req.app.locals.pool.query(`
      SELECT
        u.id, u.full_name, u.email, u.role, u.is_active,
        u.approved_at, u.created_at, u.updated_at,
        ${STATUS_SQL}
      FROM users u
      ORDER BY
        CASE WHEN u.is_active THEN 1 WHEN u.approved_at IS NULL THEN 0 ELSE 2 END,
        LOWER(u.full_name);
    `);

    return res.json({ users: result.rows });
  } catch (error) {
    console.error('Could not list users:', error.message);
    return res.status(500).json({ message: 'Could not load user accounts.' });
  }
});

// GET /api/users/audit — the most recent account changes.
router.get('/audit', requirePermission('users.manage'), async (req, res) => {
  try {
    const result = await req.app.locals.pool.query(`
      SELECT
        c.*,
        target.full_name AS user_name,
        actor.full_name AS changed_by_name
      FROM user_account_changes c
      LEFT JOIN users target ON target.id = c.user_id
      LEFT JOIN users actor ON actor.id = c.changed_by
      ORDER BY c.created_at DESC, c.id DESC
      LIMIT 100;
    `);

    return res.json({ changes: result.rows });
  } catch (error) {
    console.error('Could not load account audit log:', error.message);
    return res.status(500).json({ message: 'Could not load the audit log.' });
  }
});

// PATCH /api/users/:id
// Body: { role?, isActive? } — approve (activate a pending account), change
// role, enable or disable. Every change is written to user_account_changes.
router.patch('/:id', requirePermission('users.manage'), async (req, res) => {
  const pool = req.app.locals.pool;
  const targetId = parseId(req.params.id);
  const body = req.body || {};

  try {
    if (!targetId) throw new UserRequestError(400, 'Invalid user ID.');

    const hasRole = body.role !== undefined;
    const hasActive = body.isActive !== undefined;

    if (!hasRole && !hasActive) {
      throw new UserRequestError(400, 'Provide a new role or account status.');
    }

    if (hasRole && !ROLES.includes(body.role)) {
      throw new UserRequestError(400, 'Please choose a valid role.');
    }

    if (hasActive && typeof body.isActive !== 'boolean') {
      throw new UserRequestError(400, 'isActive must be true or false.');
    }

    if (targetId === req.user.id) {
      throw new UserRequestError(
        400,
        'You cannot change your own role or account status. Ask another administrator.'
      );
    }

    const user = await withTransaction(pool, async (client) => {
      // Lock every active administrator first, then the target. Two admins
      // acting at the same time are serialised, so the last active
      // administrator can never be removed by concurrent requests.
      const admins = await client.query(
        "SELECT id FROM users WHERE role = 'admin' AND is_active FOR UPDATE"
      );

      const targetResult = await client.query(
        'SELECT * FROM users WHERE id = $1 FOR UPDATE',
        [targetId]
      );
      const target = targetResult.rows[0];

      if (!target) throw new UserRequestError(404, 'User not found.');

      const newRole = hasRole ? body.role : target.role;
      const newActive = hasActive ? body.isActive : target.is_active;

      if (newRole === target.role && newActive === target.is_active) {
        throw new UserRequestError(400, 'No changes to apply.');
      }

      const removesActiveAdmin =
        target.role === 'admin' && target.is_active &&
        (newRole !== 'admin' || !newActive);

      if (removesActiveAdmin && admins.rows.length <= 1) {
        throw new UserRequestError(
          409,
          'The last active administrator cannot be disabled or demoted.'
        );
      }

      const updated = await client.query(
        `
          UPDATE users
          SET
            role = $2,
            is_active = $3,
            approved_at = CASE
              WHEN $3 AND approved_at IS NULL THEN NOW()
              ELSE approved_at
            END,
            updated_at = NOW()
          WHERE id = $1
          RETURNING id, full_name, email, role, is_active,
                    approved_at, created_at, updated_at;
        `,
        [targetId, newRole, newActive]
      );

      const audit = (action, values = {}) =>
        client.query(
          `
            INSERT INTO user_account_changes
              (user_id, changed_by, action, old_role, new_role, old_active, new_active)
            VALUES ($1, $2, $3, $4, $5, $6, $7);
          `,
          [
            targetId,
            req.user.id,
            action,
            values.oldRole ?? null,
            values.newRole ?? null,
            values.oldActive ?? null,
            values.newActive ?? null,
          ]
        );

      if (newRole !== target.role) {
        await audit('role_changed', { oldRole: target.role, newRole });
      }

      if (newActive !== target.is_active) {
        const action = newActive
          ? target.approved_at ? 'enabled' : 'approved'
          : 'disabled';
        await audit(action, { oldActive: target.is_active, newActive });
      }

      return updated.rows[0];
    });

    return res.json({ message: 'User account updated.', user });
  } catch (error) {
    if (error instanceof UserRequestError) {
      return res.status(error.status).json({ message: error.message });
    }

    console.error('Could not update user:', error.message);
    return res.status(500).json({ message: 'Could not update the user account.' });
  }
});

module.exports = router;
