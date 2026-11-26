// Shared authentication and authorization middleware (Phase 7).
//
// requireAuth reloads the user from the database on EVERY protected
// request, so a disabled account or a changed role takes effect
// immediately, even for sessions that are already logged in.

const { permissionsForRole, roleHasPermission, PERMISSIONS } = require('./permissions');

async function requireAuth(req, res, next) {
  const userId = req.session && req.session.userId;

  if (!userId) {
    return res.status(401).json({ message: 'Please log in to continue.' });
  }

  try {
    const result = await req.app.locals.pool.query(
      `
        SELECT id, full_name, email, role, is_active
        FROM users
        WHERE id = $1
      `,
      [userId]
    );

    const user = result.rows[0];

    if (!user || !user.is_active) {
      // End the session so the browser is sent back to the login page.
      if (req.session && typeof req.session.destroy === 'function') {
        req.session.destroy(() => {});
      }

      return res.status(401).json({
        message: user
          ? 'Your account is not active. Please contact an administrator.'
          : 'Your account could not be found.',
      });
    }

    req.user = user;
    req.permissions = permissionsForRole(user.role);
    return next();
  } catch (error) {
    return next(error);
  }
}

// Middleware list: authenticate, then require one permission.
function requirePermission(permission) {
  if (!PERMISSIONS[permission]) {
    // Fail at startup if a route names a permission that does not exist.
    throw new Error(`Unknown permission: ${permission}`);
  }

  return [
    requireAuth,
    (req, res, next) => {
      if (!roleHasPermission(req.user.role, permission)) {
        return res.status(403).json({
          message: 'You do not have permission to perform this action.',
        });
      }

      return next();
    },
  ];
}

// For responses that contain both registration and clinical fields.
function canViewClinical(req) {
  return Boolean(req.user) && roleHasPermission(req.user.role, 'clinical.view');
}

// Triage priority outside the operational queue views (queues and Visit
// History) is limited to roles with 'clinical.view'. For other roles the
// listed fields are cleared and the row is marked priority_restricted.
function restrictPriority(req, rows, fields) {
  if (canViewClinical(req)) {
    return rows;
  }

  return rows.map((row) => {
    const copy = { ...row, priority_restricted: true };

    for (const field of fields) {
      copy[field] = null;
    }

    return copy;
  });
}

module.exports = {
  canViewClinical,
  restrictPriority,
  requireAuth,
  requirePermission,
};
